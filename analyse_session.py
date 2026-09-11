#!/usr/bin/env python3
"""
analyse_session.py — read a playtest JSONL and say what actually happened.

This tool answers questions, not opinions. Every line it prints is derived from
an event the build emitted; where the data cannot settle a question it says
`UNMEASURABLE`, which is a finding, not a gap to be filled with a guess.

The seven Round-1 failure conditions are each given a verdict with its evidence:

  F1  the player needed external explanation to progress
  F2  the player learned the SEQUENCE, not the RELATIONSHIP
  F3  dial → cut → measure felt like typing numbers into a simulator
  F4  the audio sounded synthetic / disconnected from machine state
  F5  (machinist only) a fundamental absurdity in the core work sequence
  F6  nobody wanted to try another part
  F7  the surplus relationship was never looked for

The distinction that matters most, and the reason `sample` events exist:

    DID-NOT-UNDERSTAND  — a prompt was on screen, the player was idle, then
                          they advanced. They were asked and did not know.
    WAS-NEVER-ASKED     — the player was idle with NO prompt on screen. The
                          build failed to ask. That is our defect, not theirs.
    SELF-DIRECTED       — the player was idle, then acted without any prompt.
                          They were thinking. This is the healthy one and it is
                          the one a keypress-only log would have scored as
                          "confused".

Stop-judgement lives in the debrief forms, not here. This file is the facts.
"""
import argparse
import json
import pathlib
import statistics
import sys
from collections import Counter, defaultdict

# ── The idle threshold. Below this, movement and looking around dominate and a
#    "hesitation" is just reading. Above this, something is being decided.
IDLE_S = 3.0
# Above this, the player has stopped. Long enough that no reasonable act of
# looking-at-things explains it.
STUCK_S = 12.0

BAND_LOW = 40.000
BAND_HIGH = 40.016

# ── The prediction-contradiction threshold.
#
# This is deliberately PROPORTIONAL, not a fixed number of µm, because the
# quantity being judged is proportional: the kernel removes ~2.1 % less than the
# dial says, so on a 10 µm dial the machine disagrees with "predicted == dial" by
# only 0.21 µm, while on a 400 µm dial it disagrees by ~8.5 µm. A fixed 0.5 µm
# rule therefore calls every small-dial pass "not contradicted" and reports zero
# contradictions on a real session whose every single pass was contradicted —
# which is the exact failure this section exists to prevent. Measured against a
# live session: dials 20/20/10 produced deficits of 0.43/0.34/0.13 µm, all under
# a 0.5 µm absolute rule.
#
# So the test is: the machine's surplus exceeds CONTRADICTION_PCT of the dial.
# 1.0 % sits under the kernel's true 2.1 % proportional shortfall, so honest
# small-dial passes register as contradictions, while float noise (~1e-9) does
# not. The absolute floor keeps a 0 µm dial from making the ratio meaningless.
CONTRADICTION_PCT = 1.0
CONTRADICTION_FLOOR_UM = 0.05


def load(path):
    rows, bad = [], 0
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for ln in fh:
            ln = ln.strip()
            if not ln:
                continue
            try:
                rows.append(json.loads(ln))
            except json.JSONDecodeError:
                bad += 1
    rows.sort(key=lambda r: r.get("seq", 0))
    return rows, bad


def hhmmss(ms):
    if ms is None:
        return "—"
    s = ms / 1000.0
    return f"{int(s // 60)}:{s % 60:04.1f}"


# ── The events that constitute the player DOING something ────────────────────
DOING = {"action", "measure", "cut", "cut_refused", "refusal", "ship",
         "choice", "second_part"}


def doing_events(rows):
    return [r for r in rows if r.get("type") in DOING]


def gaps(rows, wall_of):
    """Every hesitation: the wall-clock gap between two consecutive doings,
    with the state that obtained during it."""
    out = []
    ev = doing_events(rows)
    for a, b in zip(ev, ev[1:]):
        ta, tb = wall_of(a), wall_of(b)
        if ta is None or tb is None:
            continue
        dt = (tb - ta) / 1000.0
        if dt < IDLE_S:
            continue
        # what was on screen between these two moments?
        between = [r for r in rows
                   if r.get("type") == "sample" and ta <= r.get("wall_ms", -1) <= tb]
        # The crosshair prompt is the build actively telling the player what to
        # do. Speech/toast is a weaker signal — it lingers for seconds after the
        # words are read, so it cannot by itself prove the player was waiting on
        # an instruction. Kept separate so the classification is honest.
        n_prompt = sum(1 for r in between if r.get("prompt_visible"))
        n_say = sum(1 for r in between if r.get("say_visible"))
        moved = any(r.get("keys_held") for r in between)
        out.append({
            "seconds": round(dt, 1),
            "after": f"{a.get('type')}:{a.get('act') or a.get('verdict') or ''}".strip(":"),
            "before": f"{b.get('type')}:{b.get('act') or b.get('verdict') or ''}".strip(":"),
            "prompt_on_screen": n_prompt > 0,
            "prompt_frac": round(n_prompt / len(between), 2) if between else None,
            "say_frac": round(n_say / len(between), 2) if between else None,
            "moved": moved,
            "sampled": len(between),
        })
    return out


def classify_gap(g):
    """The distinction this whole tool exists to make.

    A gap is only evidence about the PLAYER if the build was asking them
    something. `prompt_visible` means the crosshair prompt ("E  use the
    calipers") was on screen — that is the build telling the player what to do
    next, and stalling in front of it is the build's failure to land.
    `say_visible` is weaker (a line of speech or a toast may still be fading),
    so it is reported but does not by itself make a gap "prompted".
    """
    if g["sampled"] == 0:
        return "UNSAMPLED"          # recorder was not sampling; cannot say
    if not g["prompt_on_screen"]:
        return "SELF_DIRECTED"      # nobody asked them anything; they thought
    if g["seconds"] >= STUCK_S:
        return "DID-NOT-UNDERSTAND"  # asked, and stalled in front of the ask
    return "THINKING"                # asked, paused briefly, then moved


def analyse(path, verbose=True, name=None):
    rows, bad = load(path)
    name = name or pathlib.Path(path).name
    if not rows:
        return {"file": name, "ok": False, "why": "no rows"}

    kinds = Counter(r.get("type") for r in rows)
    start = next((r for r in rows if r.get("type") == "session_start"), None)
    end = next((r for r in reversed(rows) if r.get("type") == "session_end"), None)
    job = (start or {}).get("problem") or {}
    lo = job.get("band_low_mm", BAND_LOW)
    hi = job.get("band_high_mm", BAND_HIGH)

    ev = doing_events(rows)
    t_wall = lambda r: r.get("wall_ms")

    # ── the basic timeline ────────────────────────────────────────────────
    t0 = (start or {}).get("wall_ms", rows[0].get("wall_ms", 0))
    def rel(r):
        w = t_wall(r)
        return None if w is None else w - t0

    first_act = next((r for r in ev if r.get("type") in ("action", "refusal")), None)
    first_measure = next((r for r in ev if r.get("type") == "measure"), None)
    first_cut = next((r for r in ev if r.get("type") == "cut"), None)
    ship = next((r for r in rows if r.get("type") == "ship"), None)
    if ship is None:
        ship = next((r for r in reversed(rows)
                     if r.get("type") == "session_end" and r.get("finished")), None)

    # ── did they reach the loop at all? ───────────────────────────────────
    reached_loop = bool(first_measure and first_cut)

    # ── THE SURPLUS RELATIONSHIP ──────────────────────────────────────────
    # The design claim is that the surplus (removed − dialled) is PROPORTIONAL
    # to the dial — about −2.1 % of it — not a constant offset. An earlier build
    # told players it was constant, which is false: dial 400 misses by ~8.5 µm
    # while dial 10 misses by ~0.21 µm. Nothing below may assume a constant.
    # "Discovered" means: they cut, measured after the cut, and then changed the
    # dial in a way consistent with having noticed.
    cuts = [r for r in rows if r.get("type") == "cut"]
    cuts_refused = [r for r in rows if r.get("type") == "cut_refused"]
    measures = [r for r in rows if r.get("type") == "measure"]
    surplus_vals = [c["surplus_um"] for c in cuts if c.get("surplus_um") is not None]

    remeasure_after_cut = 0
    for i, r in enumerate(rows):
        if r.get("type") == "measure":
            if any(p.get("type") == "cut" for p in rows[:i]):
                remeasure_after_cut += 1

    # A correction: did they ever REDUCE the dial after a measurement that read
    # oversize? That is the observable signature of understanding "the dial
    # over-promises, so aim short".
    dial_after_measure_short = 0
    last_dial = None
    for r in rows:
        if r.get("type") == "action" and r.get("act") == "set_dial":
            last_dial = r.get("dial_um")
        elif r.get("type") == "measure" and last_dial is not None:
            stock = r.get("stock_to_band_top_um")   # µm of radius under band top
            # if there is less than one more dial-step of room and they dial
            # something smaller than what they just removed, they aimed short
            if stock is not None and stock >= 0:
                dial_after_measure_short += 1

    # The strongest available signal that the lesson landed: the player dialled
    # a value, the bar removed a DIFFERENT amount, and the player's next dial
    # choice compensates for that specific discrepancy instead of repeating the
    # mistake. This is direction-agnostic by construction — it compares the
    # player's new dial against the discrepancy they just observed, whichever
    # way it points, because asserting a sign here would be the tool inventing
    # physics the kernel already determines.
    surplus_landed = None
    for i, r in enumerate(rows):
        s = r.get("surplus_um")
        if r.get("type") != "cut" or s is None or abs(s) < 1.0:
            continue
        after = rows[i + 1:]
        nxt = next((x for x in after if x.get("type") == "action" and x.get("act") == "set_dial"), None)
        if nxt is None or nxt.get("dial_um") is None:
            continue
        # What would "compensating" mean? The player saw that a dial of D
        # removed (D + s). To remove `want`, they must dial `want - s`.
        # Evidence of understanding: their next dial is closer to (target - s)
        # than the naive `target` would have been.
        surplus_landed = {
            "at_wall_ms": rel(nxt),
            "surplus_seen_um": round(s, 1),
            "dial_before_um": r.get("dial_um"),
            "removed_um": round(r["removed_radius_um"], 1) if r.get("removed_radius_um") is not None else None,
            "dial_after_um": round(nxt["dial_um"], 1),
            "moved_toward_compensation": (
                None if r.get("dial_um") is None else
                abs((nxt["dial_um"] - r["dial_um"]) + s) < abs(nxt["dial_um"] - r["dial_um"])
            ),
        }
        break

    # ── hesitations, classified ───────────────────────────────────────────
    gs = gaps(rows, t_wall)
    classes = Counter(classify_gap(g) for g in gs)
    unsampled = classes.get("UNSAMPLED", 0)
    never_asked = classes.get("SELF_DIRECTED", 0)
    did_not_understand = classes.get("DID-NOT-UNDERSTAND", 0)

    # ── F1: external explanation needed? ──────────────────────────────────
    # The only in-session proxy: a long, prompt-bearing stall very early, before
    # any measurement happened. It cannot prove a human spoke. It CAN prove the
    # build left them with nothing to do, which is the thing we control.
    early_stalls = [g for g in gs if g["prompt_on_screen"] and g["seconds"] >= STUCK_S]
    f1 = "UNMEASURABLE-IN-SESSION" if reached_loop or not early_stalls else "LIKELY"
    f1_evidence = (f"/{len(early_stalls)} stalls ≥{STUCK_S:.0f}s with a prompt on screen"
                   if early_stalls else "no prompt-bearing stall ≥12s")

    # ── F2: sequence vs relationship ──────────────────────────────────────
    # Sequence-learning looks like: the verbs fire in the taught order, each
    # exactly once, with the dial unchanged between cuts. Relationship-learning
    # looks like: the dial is re-chosen AFTER a measurement, more than once.
    dial_changes = [r for r in rows if r.get("type") == "action" and r.get("act") == "set_dial"]
    dials_used = [d.get("dial_um") for d in dial_changes if d.get("dial_um")]
    # A player on the real keyboard emits `set_dial` when they press 1–6, but a
    # cut can also happen with the dial left exactly where it was — and a run
    # that never pressed a number key would then read as "0 distinct dials",
    # which is simply false. The cut rows are the authoritative record of what
    # was dialled. Union both sources.
    dials_from_cuts = [c.get("dial_um") for c in cuts if c.get("dial_um")]
    distinct_dials = len({round(d, 3) for d in (dials_used + dials_from_cuts)})
    dial_revised_after_measure = 0
    for i, r in enumerate(rows):
        if r.get("type") == "measure":
            after = [x for x in rows[i + 1:] if x.get("type") == "action"]
            nxt_cut = next((x for x in rows[i + 1:] if x.get("type") in ("cut", "cut_refused")), None)
            nxt_dial = next((x for x in after if x.get("act") == "set_dial"), None)
            if nxt_dial is not None and (nxt_cut is None or
                                         nxt_dial.get("seq", 0) < nxt_cut.get("seq", 0)):
                dial_revised_after_measure += 1
    f2 = "SEQUENCE-ONLY" if (distinct_dials <= 2 and dial_revised_after_measure == 0) \
        else ("RELATIONSHIP-EVIDENT" if dial_revised_after_measure >= 1 else "MIXED")

    # ── F3: simulator or work? ────────────────────────────────────────────
    # A simulator is driven by the numbers. Work is driven by the machine. The
    # measurable difference: does the player ever warm the spindle, look at the
    # part, or touch off — acts with no number attached — or do they only ever
    # set_dial/cut/measure?
    physical = [r for r in rows if r.get("type") == "action" and
                r.get("act") in ("warm_up", "touch_off", "rough", "rough_done", "load_tool")]
    pct_numeric = None
    if ev:
        numeric = [r for r in ev if r.get("type") in ("cut", "measure") or
                   (r.get("type") == "action" and r.get("act") == "set_dial")]
        pct_numeric = round(100.0 * len(numeric) / len(ev))

    # ── F4: audio ─────────────────────────────────────────────────────────
    # The build cannot know what the player heard. It CAN know whether the
    # machine ever made a sound at all, and whether that sound ever changed.
    audio_events = [r for r in rows if "audio" in json.dumps(r)[:200].lower()]
    f4 = "UNMEASURABLE-IN-SESSION"

    # ── F5: machinist absurdity ───────────────────────────────────────────
    f5 = "UNMEASURABLE-IN-SESSION"   # requires the machinist's words

    # ── F6: "MORE" — the strongest single signal in the whole run ──────────
    #
    # The field manual is emphatic that this is detected BEHAVIOURALLY, and
    # that asking "would you play more?" is worthless because a polite player
    # says yes. So this reads the post-ship window: what the player actually
    # did in the seconds after the part left their hands, before anyone spoke.
    #
    # The manual's own cue list is "do they look around? touch something?
    # re-check the machine?" — so an observer's MORE annotation and the
    # recorded behaviour are two views of one event, and disagreement between
    # them is itself interesting: the observer saw intent the machine could
    # not, or the machine saw engagement the observer missed.
    sp = next((r for r in rows if r.get("type") == "second_part"), None)
    psw = next((r for r in rows if r.get("type") == "post_ship"), None)
    obs_more = [r for r in rows if r.get("type") == "observer"
                and str(r.get("code", "")).upper() == "MORE"]

    if not ship:
        f6 = "NOT-REACHED"          # no ship, so "after shipping" is undefined
    elif sp or (psw and psw.get("started_second")):
        f6 = "YES-BEHAVIOURAL"      # started another part without being asked
    elif psw and (psw.get("interacted") or psw.get("moved")
                  or psw.get("looked_around")):
        # Stayed at the machine and kept engaging. Not a second part, but
        # unmistakably not "done" either — the manual's middle case.
        f6 = "ENGAGED-NOT-CONTINUED"
    elif psw:
        f6 = "NO-IDLE"              # nothing at all in the window
    else:
        # No window recorded. On a real session that means the run predates the
        # window or the page never fired it, which is NOT the same as "no".
        f6 = "NO-WINDOW-CAPTURED"

    second_part_s = sp.get("seconds_since_first_end") if sp else None

    # ── F7: was the relationship ever looked for? ─────────────────────────
    f7 = ("NEVER-REACHED-A-CUT" if not cuts else
          ("LOOKED-FOR" if (remeasure_after_cut >= 1 and len(cuts) >= 2)
           else "NOT-LOOKED-FOR"))

    # ── THE FIELD MANUAL'S OBSERVER EVIDENCE ──────────────────────────────
    #
    # The manual's sheet is paper, but its codes land in this same JSONL, which
    # is the entire point of the design: the observer writes six words and the
    # recorder holds the physics, and NEITHER ALONE ANSWERS THE QUESTION. A
    # `WALL` at 02:14 means something specific when the machine log shows no
    # measurement had ever been taken and a prompt was on screen — and
    # something quite different when the player had just re-measured cleanly.
    # So the codes are correlated against the machine state at that moment
    # rather than merely counted.
    obs = [r for r in rows if r.get("type") == "observer"]
    obs_counts = {}
    for r in obs:
        c = str(r.get("code", "")).upper()
        obs_counts[c] = obs_counts.get(c, 0) + 1

    # Each WALL is classified by what the machine can prove about that moment.
    walls = []
    for r in obs:
        if str(r.get("code", "")).upper() != "WALL":
            continue
        at = r.get("at_wall_ms")
        # Machine state as of the annotation, so the human word is grounded.
        before = [x for x in rows
                  if x.get("type") != "observer"
                  and (at is None or (x.get("wall_ms") or 0) <= at)]
        m_before = [x for x in before if x.get("type") == "measure"]
        c_before = [x for x in before if x.get("type") == "cut"]
        # Was a question on screen in the moments before? That separates
        # "the game never asked" from "the player could not act on the ask".
        recent = [x for x in before if x.get("type") == "sample"][-12:]
        prompted = any(x.get("prompt_visible") for x in recent)
        if not m_before:
            kind = "BEFORE-EVER-MEASURING"
        elif not c_before:
            kind = "BEFORE-EVER-CUTTING"
        elif not prompted:
            kind = "NO-QUESTION-ON-SCREEN"
        else:
            kind = "PROMPTED-BUT-BLOCKED"
        walls.append({
            "at_wall_ms": at, "words": r.get("words"), "kind": kind,
            "prompt_visible_before": prompted,
            "measures_before": len(m_before), "cuts_before": len(c_before),
        })

    # ── THE PASS STANDARD (field manual §7) ───────────────────────────────
    #
    # The manual is explicit that "the novices finished" is NOT the pass
    # standard, and that a completed run reached *after* the observer supplied
    # information the game owed the player must NOT be recorded as a pass. So
    # this refuses to treat completion as success and reports the two things
    # that actually matter separately: whether the loop closed, and whether it
    # closed UNASSISTED.
    gives = [r for r in rows if r.get("type") == "help"]
    gave_info = [r for r in gives if r.get("gave_information")]
    # TRUE only if the observer never handed over information the game owed the
    # player. Rung-1 and rung-2 replies ("tell me what you think you're
    # supposed to do") extract a mental model and give nothing away, so they
    # leave the run clean — which is precisely why the manual grades them.
    unassisted = not gave_info

    quotes = [r for r in rows if r.get("type") == "quote"]
    q_understand = [q for q in quotes if q.get("category") == "understanding"]
    q_misconception = [q for q in quotes if q.get("category") == "misconception"]
    q_desire = [q for q in quotes if q.get("category") == "desire"]
    # The manual's "genuine model-revision moment": the player said something
    # that shows the RELATIONSHIP landed, not the sequence.
    model_revision = bool(q_understand) or bool(q_misconception) or bool(obs_more)

    # ── THE PREDICTION ────────────────────────────────────────────────────
    #
    # The game refuses to cut until the player states what they expect the dial
    # to actually remove (Shift+1..6), then tells them what it really removed.
    # That "predict, then cut" gate is the central design mechanic, and until
    # now this tool reported NOTHING about it — the mechanic was unmeasurable
    # from a recorded session, which meant the one question Round 1 exists to
    # answer could not be answered at all.
    #
    # The verb lives in `act`, on rows whose `type` is "action". An earlier
    # inspection filtered on a field named `action` and therefore reported
    # "0 predictions" against a file that plainly contained three. The field
    # name is the whole reason this section did not exist.
    preds = [r for r in rows if r.get("type") == "action" and r.get("act") == "predict"]
    results = [r for r in rows if r.get("type") == "action" and r.get("act") == "prediction_result"]
    # An orphan outcome (a result with no predict) is the mirror of a lost
    # prediction and is reported rather than hidden.
    orphan_results = max(0, len(results) - len(preds))

    # ── Pairing. Do NOT match on pass_index: `predict` carries the number of
    #    passes completed BEFORE its cut (so the first predict is 0), while the
    #    answering `prediction_result` and `cut` carry the 1-based pass number
    #    produced by that same cut. Pairing on the index would drop the first
    #    prediction every single time. Row order is the reliable join.
    track = []
    for i, p in enumerate(preds):
        res = results[i] if i < len(results) else None
        dial = p.get("dial_um")
        prev = p.get("predicted_um")
        realised = res.get("realised_um") if res else None
        # The realised value is authoritative from whichever row carries it;
        # the `cut` row is the record of what the machine physically did.
        cut_row = next((c for c in cuts
                        if c.get("pass") == res.get("pass_index")), None) if res else None
        if realised is None and cut_row is not None:
            realised = cut_row.get("removed_radius_um")
        diff = (realised - prev) if (realised is not None and prev is not None) else None
        track.append({
            "n": i + 1,
            "dial_um": dial,
            "predicted_um": prev,
            # The dial recorded AT the prediction can differ from the dial the
            # cut actually ran, if the player re-dialled between the two. That
            # is worth surfacing, not smoothing over.
            "dial_at_cut_um": (cut_row or {}).get("dial_um", res.get("dial_um") if res else None),
            "realised_um": None if realised is None else round(realised, 4),
            "diff_um": None if diff is None else round(diff, 4),
            "diff_pct_of_dial": (None if (diff is None or not dial)
                                 else round(100.0 * diff / dial, 3)),
            "has_result": res is not None,
        })

    with_outcome = [t for t in track if t["has_result"]]
    predicted_vals = [t["predicted_um"] for t in track if t["predicted_um"] is not None]

    # ── THE NAIVE-MODEL CONTROL ───────────────────────────────────────────
    # A scripted bot believes the dial: it states predicted == dial every time.
    # Such a session looks perfectly self-consistent and proves NOTHING about a
    # human, so it must be impossible to skim as evidence of learning. The
    # discriminator is not "are they accurate" but "did the stated model ever
    # differ from the dial at all".
    same_as_dial = [t for t in track if t["predicted_um"] is not None
                    and t["dial_um"] is not None
                    and abs(t["predicted_um"] - t["dial_um"]) < 1e-9]
    naive = (len(track) >= 2 and len(same_as_dial) == len(track)
             and len(set(predicted_vals)) == 1)
    if naive:
        session_model = "SCRIPTED-OR-NAIVE-MODEL"
    elif len(track) < 2:
        session_model = "INSUFFICIENT-DATA"
    else:
        session_model = "HUMAN-OR-VARYING"

    # ── THE CENTRAL METRIC: did the prediction CHANGE after being contradicted?
    #
    # Definition, stated so it can be audited rather than skimmed:
    #   A pass "contradicts" the prediction when the machine's disagreement
    #   |predicted − realised| exceeds CONTRADICTION_PCT of the dial (with a
    #   small absolute floor). For each contradicting pass that has a LATER
    #   prediction, we ask whether that later prediction differs from the one
    #   that preceded it. The metric is the count of such revisions over the
    #   count of contradicting passes that had a later prediction to revise.
    #
    # The threshold is proportional because the phenomenon is proportional — see
    # the constants above for why a fixed µm threshold reports zero
    # contradictions on a session where every pass was contradicted. Only
    # 0/10/20/50/100/200/400 µm are offerable, so revisions are coarse.
    def contradicted(t):
        if t["diff_um"] is None:
            return False
        dial = t["dial_at_cut_um"] or t["dial_um"] or 0
        return (abs(t["diff_um"]) >= max(CONTRADICTION_FLOOR_UM,
                                          CONTRADICTION_PCT * abs(dial) / 100.0))

    contradicting = [t for t in with_outcome if contradicted(t)]
    revisable = [t for t in contradicting if t["n"] < len(track)]
    # `n` is 1-based and index-consecutive by construction above, so the next
    # prediction in the track is exactly t["n"] (0-based index == n of prev).
    revised = [t for t in revisable if track[t["n"]]["predicted_um"] != t["predicted_um"]]

    if len(track) < 2 or len(with_outcome) < 2:
        prediction_change = "INSUFFICIENT-DATA"
    elif not revisable:
        # Every contradiction came on the last prediction, so there was never a
        # chance to revise. That is not a NO.
        prediction_change = "INSUFFICIENT-DATA"
    else:
        prediction_change = "YES" if revised else "NO"

    if prediction_change == "YES":
        change_reading = "the prediction changed after a contradiction"
        # A change is NECESSARY for evidence of revision but not SUFFICIENT for it.
        # If the player stated predicted == dial every single time, the later
        # prediction differed only because the DIAL differed — one sentence, and
        # no data here separates "I revised my model" from "the track changed".
        # This exact session shape occurred: dials 20,20,10 with predictions
        # 20,20,10 reads as YES, and its predicted/realised gap moved only
        # 0.425 -> 0.237 µm, i.e. no revision is visible beyond the dial.
        if len(same_as_dial) == len(track) and len(track) > 0:
            change_reading += ("; CAUTION: every prediction equalled the dial, so "
                               "this change is equally consistent with following the "
                               "dial — a change is necessary for revision, not proof "
                               "of it")
        elif len(errs) < 4:
            change_reading += (f"; weak — only {len(errs)} scored pass(es), so a "
                               "change this early is the first datum, not a trend")
    elif prediction_change == "NO":
        # The design lead's failure reading, worded as the design lead worded it.
        change_reading = ("predictions did NOT move despite contradiction — "
                          "this is the teaching problem, not a player problem")
    else:
        change_reading = "cannot say — too few predictions, or no contradiction was ever followed by another prediction"

    # ── ACCURACY TRAJECTORY ───────────────────────────────────────────────
    # First half vs second half, by pass order, because a single mean over three
    # points hides the direction and a "trend" fitted to two points is a line
    # through a coin toss. Each half's n is reported so a 1-vs-1 split cannot be
    # read as a trend.
    errs = [abs(t["diff_um"]) for t in with_outcome if t["diff_um"] is not None]
    half = len(errs) // 2
    first_half, second_half = errs[:half], errs[half:]
    mae_first = round(statistics.mean(first_half), 3) if first_half else None
    mae_second = round(statistics.mean(second_half), 3) if second_half else None
    if len(errs) < 4:
        # Three points split 1/2 or 2/1 — reported, but not called a trend.
        accuracy_trend = "INSUFFICIENT-DATA"
    elif mae_second < mae_first:
        accuracy_trend = "IMPROVING"
    elif mae_second > mae_first:
        accuracy_trend = "WORSENING"
    else:
        accuracy_trend = "FLAT"

    # ── THE PHYSICS CONTRAST ──────────────────────────────────────────────
    # The kernel removes slightly LESS than the dial says, and by a PROPORTION
    # (−2.1 % of the dial), not a constant offset: dial 10 → 9.79, 400 → 391.5.
    # A previous build told players the surplus was constant, which was false.
    # Nothing here may encode a constant-surplus assumption, so this reports the
    # two candidate models against the recorded cuts and lets the numbers say
    # which one holds — and says so when the sample cannot separate them.
    cut_surplus = [c["surplus_um"] for c in cuts if c.get("surplus_um") is not None]
    cut_dials = [c.get("dial_um") for c in cuts if c.get("surplus_um") is not None]
    pct_model = None
    if len(cut_surplus) >= 2:
        pcts = [100.0 * s / d for s, d in zip(cut_surplus, cut_dials) if d]
        if len(pcts) >= 2:
            spread_um = max(cut_surplus) - min(cut_surplus)
            spread_pct = max(pcts) - min(pcts)
            pct_model = {
                "n": len(pcts),
                "mean_pct": round(statistics.mean(pcts), 3),
                "sd_pct": round(statistics.pstdev(pcts), 3) if len(pcts) > 1 else None,
                "spread_of_surplus_um": round(spread_um, 4),
                "spread_of_surplus_pct": round(spread_pct, 4),
                # Proportionality holds when the ABSOLUTE surplus varies with the
                # dial while the PERCENTAGE stays put. Both spreads are printed;
                # which one is "tight" is the reader's call, and no verdict is
                # asserted from a handful of passes.
                "reads_as": ("PROPORTIONAL (surplus varies in µm, % holds)"
                             if spread_pct < abs(statistics.mean(pcts)) and spread_um > spread_pct
                             else "cannot separate proportional from constant at this n"),
            }

    # ── VERDICT ───────────────────────────────────────────────────────────
    if not reached_loop:
        verdict = "DID-NOT-REACH-THE-LOOP"
    elif ship is None:
        verdict = "LOOP-ENTERED-NOT-CLOSED"
    else:
        verdict = "LOOP-CLOSED"

    # The verdict the FIELD MANUAL actually asks for. Deliberately a separate
    # field from `verdict` above, because they answer different questions and
    # conflating them is exactly the error the manual warns against.
    if not reached_loop:
        field_verdict = "FATAL-FIRST-WALL"
    elif not unassisted:
        field_verdict = "COMPLETED-AFTER-HELP — NOT A CLEAN RUN"
    elif f6 in ("YES-BEHAVIOURAL", "ENGAGED-NOT-CONTINUED") or model_revision:
        field_verdict = "STRONG"
    elif verdict == "LOOP-CLOSED":
        field_verdict = "LOOP-CLOSED-BUT-NO-OBSESSION-SIGNAL"
    else:
        field_verdict = "WEAK"

    result = {
        "file": name, "ok": True, "rows": len(rows), "bad_lines": bad,
        "session_label": (start or {}).get("label"),
        "job": job.get("title"),
        "duration_s": round(((end or {}).get("duration_ms")
                             or (rows[-1].get("wall_ms", 0))) / 1000.0, 1),
        "wall_span_s": round(((rows[-1].get("wall_ms", 0) - t0) / 1000.0), 1),
        "counts": dict(kinds),
        "verdict": verdict,
        "time_to_first_action_s": None if not first_act else round(rel(first_act) / 1000.0, 1),
        "time_to_first_measure_s": None if not first_measure else round(rel(first_measure) / 1000.0, 1),
        "time_to_first_cut_s": None if not first_cut else round(rel(first_cut) / 1000.0, 1),
        "cuts": len(cuts), "cuts_refused": len(cuts_refused), "measures": len(measures),
        "remeasure_after_cut": remeasure_after_cut,
        "distinct_dials": distinct_dials,
        "dial_revised_after_measure": dial_revised_after_measure,
        "physical_actions": len(physical),
        "pct_numeric_actions": pct_numeric,
        "surplus_landed": surplus_landed,
        "surplus_um": {
            "n": len(surplus_vals),
            "mean": round(statistics.mean(surplus_vals), 1) if surplus_vals else None,
            "stdev": round(statistics.pstdev(surplus_vals), 1) if len(surplus_vals) > 1 else None,
            "min": round(min(surplus_vals), 1) if surplus_vals else None,
            "max": round(max(surplus_vals), 1) if surplus_vals else None,
        },
        "gaps": {
            "n_idle": len(gs), "unsampled": unsampled,
            "never_asked": never_asked,
            "did_not_understand": did_not_understand,
            "self_directed": never_asked,
            "thinking": classes.get("THINKING", 0),
            "longest_s": max((g["seconds"] for g in gs), default=None),
            "mean_s": round(statistics.mean([g["seconds"] for g in gs]), 1) if gs else None,
            "detail": gs[:20],
        },
        "failure_conditions": {
            "F1_needs_external_explanation": f1, "F1_evidence": f1_evidence,
            "F2_sequence_not_relationship": f2,
            "F3_simulator_not_work": {"verdict": "WEAK-SIGNAL",
                                      "physical_actions": len(physical),
                                      "pct_numeric": pct_numeric},
            "F4_audio": f4,
            "F5_machinist_absurdity": f5,
            "F6_second_part": f6,
            "F7_relationship_looked_for": f7,
        },
        # ── THE FIELD MANUAL'S EVIDENCE (Round 1's authoritative protocol) ──
        "field_manual": {
            "field_verdict": field_verdict,
            "verdict_note": ("completion is not the pass standard; see §7 of the "
                             "field manual"),
            "unassisted": unassisted,
            "help_events": len(gives),
            "help_gave_information": len(gave_info),
            "help_rungs": [g.get("rung") for g in gives],
            "post_ship_window": None if not psw else {
                "seconds": psw.get("seconds_since_ship"),
                "last_kind": psw.get("last_kind"),
                "events": psw.get("events") or [],
                "looked_around": psw.get("looked_around"),
                "moved": psw.get("moved"),
                "interacted": psw.get("interacted"),
                "started_second": psw.get("started_second"),
            },
            "more_verdict": f6,
            "second_part_after_s": second_part_s,
            "model_revision_moment": model_revision,
            "observer_codes": obs_counts,
            "observer_rows": len(obs),
            "walls": walls,
            "quotes": {
                "understanding": [q.get("text") for q in q_understand],
                "misconception": [q.get("text") for q in q_misconception],
                "desire": [q.get("text") for q in q_desire],
            },
            "observer_more_annotations": len(obs_more),
            "observer_vs_machine_more": (
                "AGREE" if (bool(obs_more) and f6 == "YES-BEHAVIOURAL") else
                "MACHINE-ONLY" if (not obs_more and f6 == "YES-BEHAVIOURAL") else
                "OBSERVER-ONLY" if (obs_more and f6 != "YES-BEHAVIOURAL") else
                "NO-SIGNAL"
            ),
        },
        # ── THE PREDICTION (the central design mechanic) ───────────────────
        "prediction": {
            "n_predictions": len(preds),
            "n_with_outcome": len(with_outcome),
            "n_lacking_result": len(preds) - len(with_outcome),
            "n_orphan_results": orphan_results,
            "data_gap": (len(preds) - len(with_outcome)) > 0,
            "gap_note": (
                f"{len(preds) - len(with_outcome)} prediction(s) have NO outcome "
                "record — DATA LOSS, not a pass"
                if len(preds) > len(with_outcome) else None),
            "session_model": session_model,
            "n_predicted_equals_dial": len(same_as_dial),
            "predicted_values": predicted_vals,
            "track": track,
            "track_note": "paired by ROW ORDER, not by pass_index (predict carries "
                          "passes-before-cut, prediction_result carries 1-based pass)",
            "change": {
                "definition": ("after a pass where the machine disagreed with the "
                               f"stated model by ≥{CONTRADICTION_PCT}% of the dial, "
                               "did a LATER prediction differ from the one that "
                               "preceded it?"),
                "threshold_pct_of_dial": CONTRADICTION_PCT,
                "threshold_floor_um": CONTRADICTION_FLOOR_UM,
                "threshold_note": ("proportional, not a fixed µm, because the kernel's "
                                   "shortfall is proportional (~2.1% of dial); a fixed "
                                   "0.5 µm rule scores a real 10/20 µm pass as "
                                   "'not contradicted'"),
                "n_contradicting_passes": len(contradicting),
                "n_contradicting_with_later_prediction": len(revisable),
                "n_revised": len(revised),
                "verdict": prediction_change,
                "reading": change_reading,
            },
            "accuracy": {
                "n_scored": len(errs),
                "absolute_errors_um": [round(e, 3) for e in errs],
                "first_half_mae_um": mae_first, "first_half_n": len(first_half),
                "second_half_mae_um": mae_second, "second_half_n": len(second_half),
                "trend": accuracy_trend,
                "trend_note": ("needs ≥4 scored passes before a direction is claimed; "
                               "below that a 'trend' is two coin tosses"),
            },
            "surplus_model": pct_model,
        },
        "ship": ship,
    }
    return result


def print_report(r):
    if not r.get("ok"):
        print(f"{r['file']}: NOT READABLE ({r.get('why')})")
        return
    W = 66
    print("=" * W)
    print(f"  {r['file']}     label={r.get('session_label')}")
    print("=" * W)
    print(f"  job            {r.get('job')}")
    print(f"  wall span      {hhmmss(r['wall_span_s'] * 1000)}  ({r['rows']} rows)")
    if r["bad_lines"]:
        print(f"  !! {r['bad_lines']} unparseable lines (partial flush — expected at the tail)")
    print()
    print(f"  VERDICT        {r['verdict']}")
    print()
    print("  ── the timeline ──────────────────────────────────────────────")
    print(f"  first action   {hhmmss((r['time_to_first_action_s'] or 0) * 1000)}")
    print(f"  first measure  {hhmmss((r['time_to_first_measure_s'] or 0) * 1000)}")
    print(f"  first cut      {hhmmss((r['time_to_first_cut_s'] or 0) * 1000)}")
    print(f"  cuts           {r['cuts']}  (refused: {r['cuts_refused']})")
    print(f"  measurements   {r['measures']}  ({r['remeasure_after_cut']} of them AFTER a cut)")
    print(f"  dial values    {r['distinct_dials']} distinct · revised after a measurement "
          f"{r['dial_revised_after_measure']}×")
    print(f"  physical acts  {r['physical_actions']} (warm / touch-off / rough / load)")
    print()

    # ── the prediction: the central mechanic, finally measured ────────────
    p = r.get("prediction") or {}
    if p:
        print("  ── the prediction (predict, then cut) ────────────────────────")
        print(f"  predictions    {p['n_predictions']}  ·  with an outcome "
              f"{p['n_with_outcome']}  ·  lacking one {p['n_lacking_result']}")
        if p["data_gap"]:
            # Loud, because a prediction with no outcome is lost evidence.
            print(f"  !! DATA LOSS   {p['gap_note']}")
        if p["n_orphan_results"]:
            print(f"  !! {p['n_orphan_results']} outcome(s) with no matching prediction")
        if p["session_model"] == "SCRIPTED-OR-NAIVE-MODEL":
            print()
            print("  ** SCRIPTED-OR-NAIVE-MODEL **")
            print(f"     predicted == dial on all {p['n_predicted_equals_dial']} predictions, "
                  "with no variation.")
            print("     A bot that believes the dial looks perfectly consistent. This")
            print("     session is NOT evidence of human learning. Re-run with a human.")
            print()
        elif p["session_model"] == "INSUFFICIENT-DATA":
            print("  session model  INSUFFICIENT-DATA (fewer than 2 predictions)")
        else:
            print(f"  session model  {p['session_model']} "
                  f"({p['n_predicted_equals_dial']}/{p['n_predictions']} predicted == dial)")

        if p["track"]:
            print()
            print("  the track      (dial → stated model → machine, per pass)")
            for t in p["track"]:
                real = "—" if t["realised_um"] is None else f"{t['realised_um']:>7.2f}"
                diff = "—" if t["diff_um"] is None else f"{t['diff_um']:>+7.2f}"
                pct = "" if t["diff_pct_of_dial"] is None else f"  {t['diff_pct_of_dial']:+.2f}%"
                flag = "" if t["has_result"] else "   ← NO OUTCOME RECORDED"
                print(f"    pass {t['n']}  dial {str(t['dial_um']):>4}  "
                      f"said {str(t['predicted_um']):>4}  removed {real}  "
                      f"diff {diff}{pct}{flag}")

        c = p["change"]
        print()
        if c["verdict"] == "INSUFFICIENT-DATA":
            print(f"  DID THE PREDICTION CHANGE?   {c['verdict']}")
        else:
            print(f"  DID THE PREDICTION CHANGE?   {c['verdict']}"
                  + ("   ← the prediction changed" if c["verdict"] == "YES" else ""))
        print(f"    definition  {c['definition']}")
        print(f"    threshold   {c['threshold_pct_of_dial']}% of the dial "
              f"(floor {c['threshold_floor_um']} µm) — {c['threshold_note']}")
        print(f"    evidence    {c['n_contradicting_passes']} contradicting pass(es); "
              f"{c['n_contradicting_with_later_prediction']} had a later prediction; "
              f"{c['n_revised']} of those revised it")
        print(f"    reading     {c['reading']}")

        a = p["accuracy"]
        print()
        print("  accuracy trajectory  (|predicted − realised|)")
        if a["first_half_mae_um"] is None:
            print("    no scored passes — nothing to trend")
        else:
            print(f"    first half   MAE {a['first_half_mae_um']} µm  (n={a['first_half_n']})")
            print(f"    second half  MAE {a['second_half_mae_um']} µm  (n={a['second_half_n']})")
            print(f"    trend        {a['trend']}")
            if a["trend"] == "INSUFFICIENT-DATA":
                print(f"    note         {a['trend_note']}")

        sm = p.get("surplus_model")
        if sm:
            print()
            print("  surplus model  (is the machine's shortfall proportional?)")
            print(f"    from {sm['n']} recorded cuts: mean {sm['mean_pct']}% of dial "
                  f"(sd {sm['sd_pct']})")
            print(f"    surplus spread {sm['spread_of_surplus_um']} µm across dials, "
                  f"but only {sm['spread_of_surplus_pct']}% — {sm['reads_as']}")
    print()

    s = r["surplus_um"]
    print("  ── the surplus (removed − dialled), per pass ─────────────────")
    if s["n"]:
        print(f"  n={s['n']}  mean {s['mean']} µm  sd {s['stdev']}  range {s['min']}…{s['max']}")
    else:
        print("  no passes recorded")
    if r["surplus_landed"]:
        v = r["surplus_landed"]
        print(f"  first correction at {hhmmss(v['at_wall_ms'])}: "
              f"surplus {v['surplus_seen_um']} µm → dial {v['dial_after_um']} µm")
    print()
    g = r["gaps"]
    print("  ── hesitation, classified ────────────────────────────────────")
    print(f"  {g['n_idle']} gaps ≥{IDLE_S:.0f}s · longest {g['longest_s']}s · mean {g['mean_s']}s")
    if g["unsampled"]:
        print(f"    {g['unsampled']} unsampled — the recorder was not running; cannot classify")
    print(f"    SELF-DIRECTED      {g['self_directed']}   ← idle with NO prompt: they were thinking")
    print(f"    DID-NOT-UNDERSTAND {g['did_not_understand']}   ← idle WITH a prompt ≥{STUCK_S:.0f}s: we asked, they stalled")
    print(f"    THINKING           {g['thinking']}   ← prompted, brief pause, then moved")
    for d in g["detail"][:6]:
        if d["seconds"] >= STUCK_S:
            print(f"      {d['seconds']:5.1f}s  p={d['prompt_frac']}  {d['after']} → {d['before']}")
    print()
    print("  ── the seven failure conditions ──────────────────────────────")
    f = r["failure_conditions"]
    print(f"  F1 external explanation needed       {f['F1_needs_external_explanation']}")
    print(f"       {f['F1_evidence']}")
    print(f"  F2 sequence not relationship         {f['F2_sequence_not_relationship']}")
    f3 = f["F3_simulator_not_work"]
    print(f"  F3 simulator not work                {f3['verdict']} "
          f"({f3['physical_actions']} physical acts, {f3['pct_numeric']}% numeric)")
    print(f"  F4 audio sounded synthetic           {f['F4_audio']}   ← the debrief form decides")
    print(f"  F5 machinist absurdity               {f['F5_machinist_absurdity']}   ← the machinist decides")
    print(f"  F6 wanted another part               {f['F6_second_part']}")
    print(f"  F7 relationship looked for           {f['F7_relationship_looked_for']}")

    # ── the field manual's own verdict ────────────────────────────────────
    fm = r.get("field_manual") or {}
    if fm:
        print()
        print("── FIELD MANUAL (Round 1 pass standard, §7) ───────────────────")
        print(f"  field verdict                        {fm.get('field_verdict')}")
        print(f"  unassisted run                       "
              f"{'YES' if fm.get('unassisted') else 'NO — observer supplied information'}")
        if fm.get("help_events"):
            print(f"  help asked                           {fm['help_events']}× "
                  f"rungs {fm.get('help_rungs')}"
                  + (f", {fm['help_gave_information']} gave information away"
                     if fm.get("help_gave_information") else
                     " (all extraction-only — run stays clean)"))
        pw = fm.get("post_ship_window")
        if pw:
            print(f"  after shipping                       {pw['seconds']}s window: "
                  f"{pw.get('events') or 'nothing at all'}")
            print(f"    looked around / moved / touched    "
                  f"{pw['looked_around']} / {pw['moved']} / {pw['interacted']}")
        print(f"  MORE (behavioural)                   {fm.get('more_verdict')}"
              + (f" — second part after {fm['second_part_after_s']}s"
                 if fm.get("second_part_after_s") is not None else ""))
        print(f"  observer codes seen                  "
              + (", ".join(f"{k}×{v}" for k, v in sorted(fm["observer_codes"].items()))
                 or "none — no sheet annotations were entered"))
        if fm.get("observer_rows"):
            print(f"  observer vs machine on MORE          "
                  f"{fm.get('observer_vs_machine_more')}")
        for w in fm.get("walls") or []:
            print(f"  WALL  \"{w['words']}\"  →  {w['kind']} "
                  f"(prompt on screen: {w['prompt_visible_before']}, "
                  f"{w['measures_before']} measurements, {w['cuts_before']} cuts before)")
        q = fm.get("quotes") or {}
        for cat in ("understanding", "misconception", "desire"):
            for line in q.get(cat) or []:
                print(f"  quote[{cat}]  “{line}”")
    if r.get("ship"):
        sh = r["ship"]
        v = sh.get("verdict") or (sh.get("finished") or {}).get("verdict")
        print()
        print(f"  ── the outcome ───────────────────────────────────────────────")
        print(f"  {v}   true {sh.get('true_cold_mm')} mm  "
              f"err {sh.get('err_um') and round(sh['err_um'], 1)} µm  "
              f"gauge was off by {sh.get('gauge_err_um') and round(sh['gauge_err_um'], 1)} µm")
    print()


def summary_rows(results):
    # (key into the result dict, column heading, width). The previous version
    # had the header and key swapped in the unpacking below, so every column
    # looked itself up by its *heading* ("t_act", "seldir", …) and printed
    # None — the table was silently empty of data on every run. Caught by
    # actually running `./playtest.sh report` rather than reading the code.
    cols = [
        ("file", "file", 26),
        ("verdict", "verdict", 24),
        ("time_to_first_action_s", "t_act", 7),
        ("time_to_first_measure_s", "t_meas", 7),
        ("cuts", "cuts", 5),
        ("remeasure_after_cut", "remeas", 7),
        ("distinct_dials", "dials", 7),
        ("gaps.self_directed", "seldir", 7),
        ("gaps.did_not_understand", "dnidnt", 8),
        ("failure_conditions.F2_sequence_not_relationship", "F2", 19),
        ("failure_conditions.F6_second_part", "F6", 6),
        # The central mechanic, side by side across sessions — so a scripted run
        # cannot hide among human ones simply by looking tidy.
        ("prediction.n_predictions", "preds", 6),
        ("prediction.change.verdict", "changed?", 17),
        ("prediction.session_model", "model", 25),
    ]
    print("  " + "".join(h.ljust(w) for _, h, w in cols))
    print("  " + "-" * sum(w for _, _, w in cols))
    for r in results:
        line = ""
        for key, _, w in cols:
            v = r
            for part in key.split("."):
                v = v.get(part) if isinstance(v, dict) else None
            line += str(v if v is not None else "-")[:w - 1].ljust(w)
        print("  " + line)


def main():
    ap = argparse.ArgumentParser(description="Analyse one or many playtest sessions.")
    ap.add_argument("session", nargs="?", help="path to a .jsonl session file")
    ap.add_argument("--all", metavar="DIR", help="analyse every session in DIR, side by side")
    ap.add_argument("--json", action="store_true", help="emit the raw result dict(s) as JSON")
    args = ap.parse_args()

    if args.all:
        files = sorted(pathlib.Path(args.all).glob("*.jsonl"))
        if not files:
            sys.exit(f"no *.jsonl under {args.all}")
        results = [analyse(str(p)) for p in files]
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            print(f"\n  {len(results)} session(s) in {args.all}\n")
            summary_rows([r for r in results if r.get("ok")])
            print()
        return

    if not args.session:
        sys.exit("give a session file, or --all <dir>")
    r = analyse(args.session)
    if args.json:
        print(json.dumps(r, indent=2))
    else:
        print_report(r)


if __name__ == "__main__":
    main()
