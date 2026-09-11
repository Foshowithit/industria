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
    # The design claim is that the surplus (removed − dialled) is a roughly
    # CONSTANT offset. "Discovered" means: they cut, measured after the cut,
    # and then changed the dial in a way consistent with having noticed.
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

    # ── F6: another part? ─────────────────────────────────────────────────
    sp = next((r for r in rows if r.get("type") == "second_part"), None)
    f6 = ("PROMPTED-OR-NOT" if not ship else
          ("YES" if sp else "NO"))

    # ── F7: was the relationship ever looked for? ─────────────────────────
    f7 = ("NEVER-REACHED-A-CUT" if not cuts else
          ("LOOKED-FOR" if (remeasure_after_cut >= 1 and len(cuts) >= 2)
           else "NOT-LOOKED-FOR"))

    # ── VERDICT ───────────────────────────────────────────────────────────
    if not reached_loop:
        verdict = "DID-NOT-REACH-THE-LOOP"
    elif ship is None:
        verdict = "LOOP-ENTERED-NOT-CLOSED"
    else:
        verdict = "LOOP-CLOSED"

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
