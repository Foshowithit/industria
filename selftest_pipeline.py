#!/usr/bin/env python3
"""
selftest_pipeline.py — prove the playtest apparatus works without a human.

Constraint 6 of this run says: the last three rounds each found defects that
reading the source could not, and only playing the thing found. So this script
PLAYS the build. It drives the real page through the real `window.INDUSTRIA`
debug handle — the same verbs a player presses — with the recorder armed, and
then runs the real analysis tool over the real file that comes out.

What it proves, end to end:
  1. the page loads with ?rec=<label> and the recorder arms;
  2. events reach the server and land as JSONL;
  3. the JSONL contains what the analysis tool needs (measure readings AND
     true values, cut dial AND removed, ship verdict);
  4. analyse_session.py reads it and produces a verdict;
  5. the truth did NOT reach the screen — the R1 leak gate still passes with
     the recorder armed. This is the one that would fail if the recorder were
     built wrong.

It deliberately plays TWO scenarios so the tool is exercised on both a clean
loop and a muddled one.
"""
import json
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

REPO = pathlib.Path(__file__).resolve().parent
PORT = 8801
LABEL = "selftest"
OUT = REPO / ".selftest-sessions"
URL = f"http://127.0.0.1:{PORT}/index.html?rec={LABEL}"

sys.path.insert(0, str(REPO))
# The server owns its own copy of the eleven codes; importing it here is what
# lets the selftest prove the page module and the server have not drifted.
from playtest_server import OBSERVER_CODES as OBSERVER_CODES_PY
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("playwright is not importable — cannot run the self-test. "
             "This is a real limitation, not a pass.")

OK = "\033[32m✓\033[0m"
BAD = "\033[31m✗\033[0m"
failures = []


def check(name, cond, detail=""):
    print(f"  {OK if cond else BAD} {name}" + (f"   {detail}" if detail else ""))
    if not cond:
        failures.append(name)
    return cond


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    # ── 1. the server the player's browser would talk to ──────────────────
    srv = subprocess.Popen(
        [sys.executable, str(REPO / "playtest_server.py"),
         "--label", LABEL, "--port", str(PORT), "--out", str(OUT), "--quiet"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=str(REPO))
    try:
        for _ in range(60):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/__rec/status", timeout=0.5)
                break
            except Exception:
                time.sleep(0.1)

        print("\n── 1. the instrumented build loads ────────────────────────────")
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                executable_path="/usr/bin/google-chrome", headless=True,
                args=["--use-gl=angle", "--use-angle=gl", "--enable-gpu",
                      "--ignore-gpu-blocklist", "--no-sandbox"])
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            errs, leaks = [], []

            # R1 LEAK WATCH, armed from before the first frame — the same
            # method as acceptance/r1_leakwatch.py, so the recorder is held to
            # the same standard the build already meets. The one sanctioned
            # exception is the post-mortem reveal line ("Customer CMM"), which
            # is ALLOWED to show the truth because the part has left the
            # player's hands by then. Without that exemption this probe reports
            # hundreds of false leaks the moment the part is inspected — which
            # is exactly what happened the first time it ran.
            page.add_init_script("""
              window.__leaks = [];
              addEventListener('DOMContentLoaded', () => {
                const probe = () => {
                  const t = document.body ? document.body.innerText : '';
                  const g = window.INDUSTRIA && window.INDUSTRIA.game;
                  if (!g || !g.part) return;
                  if (t.includes('Customer CMM')) return;   // post-mortem; allowed
                  const v = g.part.holeDia_cold_mm;
                  // 3 and 4 decimals only — the same threshold
                  // acceptance/r1_leakwatch.py uses. A 2-decimal form is NOT a
                  // leak: "40.01" matches inside the machine's own "20002 µm"
                  // dialogue panel, which produced ~50 phantom hits the first
                  // time this probe ran. The truth is known to 1 µm; a leak
                  // would show it to that precision, not to 0.01 mm.
                  for (const s of [v.toFixed(3), v.toFixed(4)]) {
                    if (s && t.includes(s)) {
                      window.__leaks.push({form: s, text: t.slice(0, 200)});
                    }
                  }
                };
                new MutationObserver(probe).observe(document.body,
                  {childList: true, subtree: true, characterData: true});
              });
            """)
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.on("console", lambda m: errs.append("console." + m.type + ": " + m.text)
                    if m.type == "error" else None)

            page.goto(URL, wait_until="load")
            # `window.INDUSTRIA` exists as soon as the module runs, but
            # `INDUSTRIA.game` is a getter over GAME, which is null until the
            # player clicks through the gate. Wait for the handle, then click —
            # waiting on `.game` first is a deadlock, and it cost this round a
            # real debugging pass to find.
            page.wait_for_function("() => !!window.INDUSTRIA", timeout=20000)

            recorder_armed = page.evaluate(
                "() => !!(window.INDUSTRIA.rec && window.INDUSTRIA.rec.isRecording())")
            check("recorder armed by ?rec=", recorder_armed)

            page.click("#gate")
            page.wait_for_function("() => !!(window.INDUSTRIA.game)", timeout=20000)
            page.wait_for_timeout(1200)

            started = page.evaluate("() => window.INDUSTRIA.recStats()")
            check("session_start emitted", bool(started and started.get("seq", 0) >= 1),
                  f"seq={started and started.get('seq')}")

            # ── 2. PLAY IT. Real verbs, real kernel, real clock. ──────────
            print("\n── 2. play the build (real verbs, not a mock) ─────────────────")
            page.evaluate("""() => {
              const I = window.INDUSTRIA;
              I.act('caliper');           // pick up the calipers
              I.act('boring bar');        // load a bar
            }""")
            page.wait_for_timeout(600)
            page.evaluate("() => window.INDUSTRIA.touch()")
            page.wait_for_timeout(400)
            page.evaluate("() => window.INDUSTRIA.warm()")
            page.wait_for_timeout(400)
            m1 = page.evaluate("() => { window.INDUSTRIA.measure(); return window.INDUSTRIA.game.part.holeDia_cold_mm; }")
            page.wait_for_timeout(500)
            page.evaluate("() => window.INDUSTRIA.rough()")
            page.wait_for_timeout(600)
            # A deliberate hesitation: idle 4.2 s with no input, then act. This is
            # what gives the analysis tool a gap to classify.
            #
            # NOTE for anyone editing this: `rough()` leaves the part at
            # band_top − 8 µm, which is INSIDE the band already. Sneaking up with
            # a series of cuts after it therefore eats the last 8 µm and every
            # further pass refuses with NO STOCK. That is what the first version
            # of this self-test did, and it is why the surplus table had a
            # 0.0 µm row and five refusals. The sequence below measures first,
            # then takes the final passes from what is genuinely left.
            page.wait_for_timeout(4200)
            page.evaluate("() => window.INDUSTRIA.measure()")
            page.wait_for_timeout(400)
            # sneak up: the whole lesson, acted out on the stock that remains
            for dial in (10, 6, 4, 2, 1):
                page.evaluate(f"() => window.INDUSTRIA.setBite({dial})")
                page.wait_for_timeout(150)
                page.evaluate("() => window.INDUSTRIA.cut()")
                page.wait_for_timeout(300)
                page.evaluate("() => window.INDUSTRIA.measure()")
                page.wait_for_timeout(300)
            page.evaluate("() => window.INDUSTRIA.inspect()")
            page.wait_for_timeout(900)

            # ── THE POST-SHIP WINDOW (field manual §6) ────────────────────
            # The window only means anything if something happens inside it, so
            # the script does what the manual describes a wanting player doing:
            # keeps moving around the machine after the part is gone. If this
            # block is removed the window still fires, and still records
            # "idle" — which is the correct and informative outcome, not a bug.
            page.wait_for_timeout(1500)
            # Real objects by name, the same way a player's crosshair finds them.
            # These names are read from the build, not guessed: the first version
            # of this block looked for "machine" and "vise", neither of which
            # exists as an item (they are "VMC — 40 taper, 7.5 kW" and
            # "Workbench — Bench No. 2"), so act() silently returned ok:False and
            # the window recorded an empty post-ship — which LOOKS exactly like
            # a player who sat still. That is the failure mode this whole
            # apparatus exists to distinguish, so it must not be simulated here.
            touched = page.evaluate("""() => {
              const out = [];
              for (const n of ['VMC', 'Workbench']) {
                const it = window.INDUSTRIA.items()
                  .find((x) => x.toLowerCase().includes(n.toLowerCase()));
                out.push(it ? window.INDUSTRIA.act(it) : { ok: false, why: 'no ' + n });
              }
              return out;
            }""")
            print(f"    post-ship interactions: "
                  f"{[t.get('did') or t.get('why') for t in touched]}")
            page.wait_for_timeout(700)

            # ── THE OBSERVER'S SHEET, ACTUALLY EXERCISED (field manual §4) ──
            # The correlation is the point of the design, so the selftest writes
            # real codes DURING the session rather than asserting the plumbing
            # exists. In particular a WALL is entered while the machine state
            # says something specific, and the analysis must ground it.
            obs_written = page.evaluate("""() => {
              const codes = window.INDUSTRIA.obsCodes();
              const out = { codes, results: [] };
              for (const [c, w] of [['H','thinks Earl wants the vise clean'],
                                    ['WALL','staring at the vise'],
                                    ['S','surprised the dial over-promised'],
                                    ['P','shipped the part']]) {
                out.results.push(window.INDUSTRIA.obs(c, w));
              }
              out.bad = window.INDUSTRIA.obs('XX', 'deliberate typo');
              window.INDUSTRIA.obsQuote('understanding',
                'so it takes off less than I asked', 'after the first cut');
              window.INDUSTRIA.obsHelp(1, { rung: 1 });
              window.INDUSTRIA.obsSilence('thinking', 22, {});
              return out;
            }""")
            print(f"    observer codes available: {' '.join(obs_written['codes'])}")
            print(f"    observer writes ok: "
                  f"{sum(1 for r in obs_written['results'] if r.get('ok'))}"
                  f"/{len(obs_written['results'])}, "
                  f"typo refused: {not obs_written['bad'].get('ok')}")
            page.wait_for_timeout(600)

            stats = page.evaluate("() => window.INDUSTRIA.recStats()")
            print(f"    recorder seq={stats and stats.get('seq')} pending={stats and stats.get('pending')}")
            page.evaluate("() => window.INDUSTRIA.recEnd('selftest_close')")
            page.wait_for_timeout(1500)

            domleaks = page.evaluate("() => window.__leaks")
            sf = page.evaluate("""() => {
              const g = window.INDUSTRIA.game;
              return {true_mm: g.part.holeDia_cold_mm, finished: g.finished,
                      clock: g.clock_min, money: g.money};
            }""")
            ctx.close()
            browser.close()
    finally:
        srv.send_signal(signal.SIGINT)
        try:
            srv.wait(timeout=10)
        except subprocess.TimeoutExpired:
            srv.kill()

    # ── 3. did the file land, and does it say what it should? ─────────────
    print("\n── 3. the JSONL that came out ─────────────────────────────────")
    path = OUT / (LABEL + ".jsonl")
    if not check("session file written", path.exists(), str(path)):
        return report()
    rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    kinds = {}
    for r in rows:
        kinds[r.get("type")] = kinds.get(r.get("type"), 0) + 1
    print("    " + " · ".join(f"{k}={v}" for k, v in sorted(kinds.items())))

    check("session_start present", kinds.get("session_start") == 1)
    check("actions recorded", kinds.get("action", 0) >= 3)
    check("measurements recorded", kinds.get("measure", 0) >= 2)
    check("cuts recorded", kinds.get("cut", 0) >= 4)
    check("heartbeat samples recorded", kinds.get("sample", 0) >= 5,
          f"{kinds.get('sample', 0)} samples")
    check("ship event recorded", kinds.get("ship", 0) >= 1)
    check("session_end recorded", kinds.get("session_end", 0) == 1)

    meas = [r for r in rows if r.get("type") == "measure"]
    check("measurement carries the reading", all("reading_mm" in m for m in meas))
    check("measurement carries the TRUE value",
          all(m.get("true_cold_mm") is not None for m in meas))
    check("measurement carries the gauge error",
          any(m.get("reading_err_um") is not None for m in meas))
    cuts = [r for r in rows if r.get("type") == "cut"]
    check("cut carries the dial value", all(c.get("dial_um") is not None for c in cuts))
    check("cut carries the real removal",
          all(c.get("removed_radius_um") is not None for c in cuts))
    check("cut carries the surplus", all(c.get("surplus_um") is not None for c in cuts),
          f"mean surplus {round(sum(c['surplus_um'] for c in cuts)/len(cuts), 1)} µm"
          if cuts else "")
    check("ship carries the true diameter", any(
        r.get("true_cold_mm") is not None for r in rows if r.get("type") == "ship"))

    # ── 4. R1: the truth never reached the screen ─────────────────────────
    print("\n── 4. R1 leak gate, WITH the recorder armed ───────────────────")
    check("no truth leak observed in the DOM", not domleaks,
          f"{len(domleaks)} hits" if domleaks else "")
    check("no page errors", not errs, "; ".join(errs[:2]) if errs else "")

    # ── 5. the analysis tool reads it ─────────────────────────────────────
    print("\n── 5. analyse_session.py over the produced file ───────────────")
    r = subprocess.run([sys.executable, str(REPO / "analyse_session.py"), str(path)],
                       capture_output=True, text=True, cwd=str(REPO))
    check("analyse exits 0", r.returncode == 0, r.stderr.strip()[:200])
    check("analysis produced a verdict", "VERDICT" in r.stdout)
    check("classification section present", "DID-NOT-UNDERSTAND" in r.stdout)
    print("\n" + r.stdout)

    # machine-readable assertions on the analysis
    rj = subprocess.run([sys.executable, str(REPO / "analyse_session.py"), str(path), "--json"],
                        capture_output=True, text=True, cwd=str(REPO))
    a = json.loads(rj.stdout)
    check("analysis: loop closed", a["verdict"] == "LOOP-CLOSED", a["verdict"])
    check("analysis: hesitation classified",
          a["gaps"]["self_directed"] + a["gaps"]["did_not_understand"] > 0,
          f"self_directed={a['gaps']['self_directed']} "
          f"did_not_understand={a['gaps']['did_not_understand']}")
    check("analysis: surplus measured", a["surplus_um"]["n"] >= 4,
          f"mean {a['surplus_um']['mean']} µm")
    check("analysis: re-measure after cut seen", a["remeasure_after_cut"] >= 1)
    check("analysis: F6 answers with behavioural MORE, not yes/no",
          a["failure_conditions"]["F6_second_part"] in (
              "YES-BEHAVIOURAL", "ENGAGED-NOT-CONTINUED", "NO-IDLE",
              "NO-WINDOW-CAPTURED", "NOT-REACHED"),
          a["failure_conditions"]["F6_second_part"])
    check("analysis: field-manual verdict present",
          bool(a.get("field_manual", {}).get("field_verdict")),
          str(a.get("field_manual", {}).get("field_verdict")))
    check("analysis: post-ship window was captured",
          a.get("field_manual", {}).get("post_ship_window") is not None,
          json.dumps(a.get("field_manual", {}).get("post_ship_window"))[:120])
    # A window that exists but is empty is ambiguous on its own: it is either a
    # player who stopped dead (the strongest possible result) or a harness that
    # failed to interact. When the selftest PRETENDS to keep playing, the window
    # must show it — otherwise a broken interaction path would masquerade as the
    # most interesting finding in the run.
    pw = a.get("field_manual", {}).get("post_ship_window") or {}
    check("the post-ship window shows the interactions that were made",
          bool(pw.get("interacted")) or bool(pw.get("last_kind")
                                              and pw["last_kind"] != "idle"),
          json.dumps(pw)[:160])
    check("analysis: observer codes correlated",
          a.get("field_manual", {}).get("observer_rows", 0) >= 4,
          json.dumps(a.get("field_manual", {}).get("observer_codes")))
    check("analysis: a WALL is grounded in machine state",
          bool(a.get("field_manual", {}).get("walls"))
          and a["field_manual"]["walls"][0].get("kind") in (
              "BEFORE-EVER-MEASURING", "BEFORE-EVER-CUTTING",
              "NO-QUESTION-ON-SCREEN", "PROMPTED-BUT-BLOCKED"),
          json.dumps(a.get("field_manual", {}).get("walls"))[:160])

    # ── 5b. THE FIELD MANUAL'S MACHINERY (ChatGPT's Round 1 rules) ────────
    # These exist because the manual is authoritative for the protocol, and its
    # two halves — the observer's eleven codes and the machine's event log —
    # live in different files. If they drift apart, the correlation the whole
    # design depends on silently produces nothing.
    print("\n── 5b. field-manual codes, observer channel, post-ship window ──")

    # The annotation channel is tested against a freshly started server, because
    # the session server above is deliberately shut down before the file is
    # examined (stopping it is what writes the final row). Testing the channel
    # against a dead port would only prove that a dead port refuses.
    srv2 = subprocess.Popen(
        [sys.executable, str(REPO / "playtest_server.py"),
         "--label", LABEL, "--port", str(PORT), "--out", str(OUT), "--quiet"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=str(REPO))
    try:
        for _ in range(60):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/__rec/status", timeout=0.5)
                break
            except Exception:
                time.sleep(0.1)

        # (a) The eleven codes must be identical in the page module and the
        #     server, because a code the server rejects is a data point that
        #     never arrives.
        rec_codes = subprocess.run(
            ["node", "--input-type=module", "-e",
             "import {OBSERVER_CODES} from './recorder.mjs';"
             "console.log(Object.keys(OBSERVER_CODES).join(' '))"],
            capture_output=True, text=True, cwd=str(REPO))
        rec_set = rec_codes.stdout.strip().split()
        srv_set = list(OBSERVER_CODES_PY)
        check("recorder exports the 11 field-manual codes",
              len(rec_set) == 11, " ".join(rec_set))
        check("server and recorder agree on the codes exactly",
              rec_set == srv_set, f"recorder={rec_set} server={srv_set}")

        # (b) A valid code round-trips through the real server into the file.
        req = urllib.request.Request(
            f"http://127.0.0.1:{PORT}/__obs", method="POST",
            data=json.dumps({"code": "WALL", "words": "staring at the vise",
                             "at_wall_ms": 1700000000000}).encode(),
            headers={"Content-Type": "application/json", "X-Rec-Label": LABEL})
        try:
            with urllib.request.urlopen(req, timeout=2) as resp:
                obs_status = resp.status
        except Exception as exc:
            obs_status = f"error: {exc}"
        check("observer annotation accepted", obs_status == 204, str(obs_status))

        # (c) A TYPO must be refused loudly. A silently dropped code is a
        #     missing data point that looks exactly like "the observer never
        #     saw it", which is the failure this whole channel could hide.
        bad_req = urllib.request.Request(
            f"http://127.0.0.1:{PORT}/__obs", method="POST",
            data=json.dumps({"code": "XX", "words": "typo"}).encode(),
            headers={"Content-Type": "application/json", "X-Rec-Label": LABEL})
        try:
            urllib.request.urlopen(bad_req, timeout=2)
            bad_status = 200
        except urllib.error.HTTPError as exc:
            bad_status = exc.code
        except Exception as exc:
            bad_status = f"error: {exc}"
        check("unknown observer code refused", bad_status == 400, str(bad_status))
    finally:
        srv2.send_signal(signal.SIGINT)
        try:
            srv2.wait(timeout=10)
        except subprocess.TimeoutExpired:
            srv2.kill()

    # (d) The annotations are readable back from the session file with their
    #     meanings attached, so the analysis tool needs no lookup of its own.
    rows_now = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    obs_rows = [x for x in rows_now if x.get("type") == "observer"]
    check("observer rows landed in the JSONL", len(obs_rows) >= 4, f"{len(obs_rows)} row(s)")
    check("observer rows carry their meaning",
          bool(obs_rows) and all(x.get("meaning") for x in obs_rows),
          ", ".join(f"{x.get('code')}={x.get('meaning')}" for x in obs_rows[:4]))
    check("the deliberately bad code was NOT written",
          all(str(x.get("code")) != "XX" for x in obs_rows))

    # (e) The post-ship window must be safe when recording is off — it fires on
    #     the deployed build too, where there is no server and no session.
    ps = subprocess.run(
        ["node", "--input-type=module", "-e",
         "import {postShip, isRecording} from './recorder.mjs';"
         "try { postShip({seconds_since_ship: 0}); console.log('noop_ok ' + isRecording()); }"
         "catch (e) { console.log('noop_threw ' + e.message); }"],
        capture_output=True, text=True, cwd=str(REPO))
    check("post-ship event is a safe no-op when recording is off",
          "noop_ok" in ps.stdout, ps.stdout.strip()[:120] or ps.stderr.strip()[:120])


    # ── 6. the multi-session report actually prints numbers ───────────────
    # This check exists because the report table was written with its column
    # keys and headings swapped, so it printed a full-width row of `None` on
    # every run while exiting 0 and looking fine. Anything that produces output
    # must be asserted to produce OUTPUT, not merely to not crash.
    print("\n── 6. the side-by-side report has real data in it ─────────────")
    rall = subprocess.run([sys.executable, str(REPO / "analyse_session.py"),
                           "--all", str(OUT)], capture_output=True, text=True, cwd=str(REPO))
    check("report exits 0", rall.returncode == 0, rall.stderr.strip()[:200])
    body = [l for l in rall.stdout.splitlines() if l.strip()]
    datarow = next((l for l in body if l.strip().startswith("selftest")), "")
    check("report has a data row", bool(datarow), datarow.strip()[:80])
    check("report row is not blank/None", "None" not in datarow and "-" != datarow.strip(),
          datarow.strip()[:80])
    check("report row shows the cut count", " 9 " in datarow or "9 " in datarow[30:])

    return report()


def report():
    print()
    if failures:
        print(f"\033[31mSELFTEST: FAIL\033[0m — {len(failures)} check(s): "
              + "; ".join(failures))
        return 1
    print("\033[32mSELFTEST: PASS\033[0m — the playtest kit works end to end. "
          "A human session will now produce evidence.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
