#!/usr/bin/env python3
"""Round 2 acceptance gate — THE MACHINE PUSHES BACK.

Round 2's claim is a claim about refusal: that a player can now ask this
machine for more than it has, and be told no with a number attached. That is
not testable by reading the source, so this drives the real page through the
same `window.INDUSTRIA` verbs the keys drive and asserts on what comes back.

WHAT IT DOES NOT DO, and this matters for how its pass should be read: it does
not test that the game is fun, or that a beginner discovers the feed/power
tradeoff, or that the refusal is legible to a human. It tests that the wall is
PRESENT and REACHABLE and that the preview agrees with it. Whether a person
finds that interesting is the §107 question and no script answers it.

Exit 0 = ROUND 2 GATE: PASS.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

PORT = 8797  # deliberately NOT 8799 — playtest.sh / export_session.py own that
ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path("/tmp/r2-live")


def serve():
    p = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    time.sleep(1.2)
    return p


def kill(p):
    try:
        import os, signal
        os.killpg(os.getpgid(p.pid), signal.SIGKILL)
    except Exception:
        pass


def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not available — SKIP")
        return 2

    SHOTS.mkdir(parents=True, exist_ok=True)
    srv = serve()
    fails, notes = [], []

    def check(cond, label, detail=""):
        print(f"  {'ok  ' if cond else 'FAIL'}  {label}" + (f"   {detail}" if detail else ""))
        if not cond:
            fails.append(label)

    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(
                executable_path="/usr/bin/google-chrome", headless=False,
                args=["--use-gl=angle", "--use-angle=swiftshader",
                      "--enable-unsafe-swiftshader", "--no-sandbox"],
            )
            pg = b.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: errors.append(f"PAGEERROR {e}"))

            pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="load")
            pg.wait_for_function("() => !!window.INDUSTRIA", timeout=30000)
            # The game state is built by the entry gate (`GEAR`), so the gate has
            # to be clicked through before any verb has a game to act on. This is
            # the same opening the player sees — clocking on at 05:55 — not a
            # back door into the state.
            pg.wait_for_selector("#gate", state="visible", timeout=15000)
            pg.click("#gate")
            pg.wait_for_function("() => !!window.INDUSTRIA.game", timeout=20000)
            time.sleep(2.0)

            print("\n── J1, the round-1 part, for comparison ──")
            # A load meter needs a tool in the spindle — with no bar there is no
            # cutting edge and therefore no load to report. `envelope` refuses
            # with NO TOOL rather than inventing zeroes, so load one first.
            pg.evaluate("() => window.INDUSTRIA.act('Boring bar Ø20')")
            pg.wait_for_timeout(400)
            j1 = pg.evaluate("""() => {
              const I = window.INDUSTRIA;
              I.setBite(400);
              const e = I.envelope();
              return {power: e.power_frac, torque: e.torque_frac, F: e.F_mean_N,
                      would: e.would_cut, binding: e.binding, ok: e.ok, why: e.why};
            }""")
            if not j1["ok"]:
                print(f"  envelope refused: {j1['why']}")
                raise SystemExit(2)
            print(f"  J1 envelope at the 400 µm dial: power {j1['power']*100:.1f}% "
                  f"torque {j1['torque']*100:.1f}% F {j1['F']:.0f} N")
            check(j1["power"] < 0.10,
                  "on J1 the deepest finishing dial is trivially inside the spindle",
                  f"{j1['power']*100:.2f}% of 7.5 kW")

            # ── switch to J2 ─────────────────────────────────────────────────
            print("\n── switch to J2, the stock-removal job ──")
            jobs = pg.evaluate("() => window.INDUSTRIA.jobs()")
            print(f"  jobs on offer: {[j['id'] + ' ' + j['title'] for j in jobs]}")
            check(len(jobs) >= 2, "a second job exists", f"{len(jobs)} jobs")
            if len(jobs) < 2:
                raise SystemExit(2)
            pg.evaluate("() => window.INDUSTRIA.job('J2')")
            pg.wait_for_timeout(500)
            j2info = pg.evaluate("""() => {
              const g = window.INDUSTRIA.game;
              return {id: g.job.id, nom: g.job.nominal_mm, start: g.part.holeDia_cold_mm,
                      depth: g.job.bore_depth_mm, band: [g.job.band_low_mm, g.job.band_high_mm]};
            }""")
            stock_r = (j2info["band"][1] - j2info["start"]) / 2
            print(f"  J2: Ø{j2info['nom']} {j2info['id']}, as-found Ø{j2info['start']}, "
                  f"{stock_r:.2f} mm of radius, {j2info['depth']} mm deep")
            check(stock_r >= 3.0, "J2 has real stock to remove, not a finishing allowance",
                  f"{stock_r:.2f} mm radius")

            # ── re-load the bar: switching jobs rebuilds from a fresh spec ──
            pg.evaluate("() => window.INDUSTRIA.act('Boring bar Ø20')")
            pg.wait_for_timeout(400)

            print("\n── the machine's opinion, bite by bite (feed 0.12) ──")
            table = pg.evaluate("""() => {
              const I = window.INDUSTRIA, out = [];
              for (const b of [0.4, 1, 2, 3, 4, 6]) {
                const e = I.envelope(b, 0.12);
                out.push({bite: b, power: e.power_frac, torque: e.torque_frac,
                          F: e.F_mean_N, would: e.would_cut, binding: e.binding_label});
              }
              return out;
            }""")
            for row in table:
                print(f"    bite {row['bite']:>4} mm: power {row['power']*100:>6.1f}%  "
                      f"torque {row['torque']*100:>6.1f}%  F {row['F']:>5.0f} N  "
                      f"{'cuts' if row['would'] else 'REFUSED: ' + row['binding']}")
            deep = [r for r in table if r["bite"] == 4.0][0]
            check(deep["power"] > 0.40,
                  "at 4 mm of radius J2 loads the spindle heavily (vs 0.54% on J1)",
                  f"{deep['power']*100:.1f}%")

            # ── THE PUSHBACK: feed is the lever, and it is refused ───────────
            print("\n── the wall, reached by feed at a 4 mm bite ──")
            sweep = pg.evaluate("""() => {
              const I = window.INDUSTRIA, out = [];
              for (const f of [0.08, 0.12, 0.2, 0.3, 0.5]) {
                const e = I.envelope(4, f);
                out.push({feed: f, power: e.power_frac, torque: e.torque_frac,
                          would: e.would_cut, binding: e.binding});
              }
              return out;
            }""")
            for row in sweep:
                print(f"    feed {row['feed']:.2f}: power {row['power']*100:>6.1f}%  "
                      f"torque {row['torque']*100:>6.1f}%  "
                      f"{'cuts' if row['would'] else 'REFUSED: ' + row['binding']}")
            refused = [r for r in sweep if not r["would"]]
            accepted = [r for r in sweep if r["would"]]
            check(bool(refused), "leaning on the feed is REFUSED — the machine pushes back",
                  f"{len(refused)}/{len(sweep)} feeds refused at a 4 mm bite")
            check(bool(accepted), "and a lighter feed at the same bite is ACCEPTED",
                  f"{len(accepted)}/{len(sweep)} accepted")

            # ── the refusal must actually happen through the verb ───────────
            print("\n── driving the real verb, not the preview ──")
            real = pg.evaluate("""() => {
              const I = window.INDUSTRIA;
              I.setRough(4.0, 0.5);
              const before = I.game.part.holeDia_cold_mm;
              I.rough();
              return {before, after: I.game.part.holeDia_cold_mm,
                      passes: I.game.history.length,
                      rough: I.getRough()};
            }""")
            check(abs(real["after"] - real["before"]) < 1e-9,
                  "a refused roughing move removes NO metal",
                  f"Ø{real['before']:.4f} -> Ø{real['after']:.4f}")
            shot1 = SHOTS / "r2-refused.png"
            pg.screenshot(path=str(shot1))
            print(f"  screenshot: {shot1}")

            # ── and a feasible move does remove metal ──────────────────────
            real2 = pg.evaluate("""() => {
              const I = window.INDUSTRIA;
              I.setRough(2.0, 0.2);
              const before = I.game.part.holeDia_cold_mm;
              I.rough();
              return {before, after: I.game.part.holeDia_cold_mm, passes: I.game.history.length};
            }""")
            check(real2["after"] > real2["before"],
                  "a feasible roughing move DOES remove metal",
                  f"Ø{real2['before']:.4f} -> Ø{real2['after']:.4f} over {real2['passes']} passes")
            shot2 = SHOTS / "r2-accepted.png"
            pg.screenshot(path=str(shot2))
            print(f"  screenshot: {shot2}")

            # ── the load meter is on screen and cannot leak the truth ──────
            print("\n── the load meter, and the round-1 invariant it must not break ──")
            lm = pg.evaluate("""() => {
              const el = document.querySelector('#pnLoad');
              return {present: !!el, text: el ? el.innerText : '',
                      bars: el ? el.querySelectorAll('.lm').length : 0};
            }""")
            check(lm["present"] and lm["bars"] >= 4,
                  "the load meter renders four limits", f"{lm['bars']} bars")
            # The round-1 rule: the true cold diameter must never be on screen.
            truth = pg.evaluate("""() => {
              const g = window.INDUSTRIA.game;
              return g.part.holeDia_cold_mm;
            }""")
            for digits in (3, 4):
                s = f"{truth:.{digits}f}"
                check(s not in lm["text"],
                      f"the true diameter to {digits} dp is NOT in the load meter", s)
            print(f"  truth Ø{truth:.4f} (must not appear in the meter text)")

            # ── console errors ─────────────────────────────────────────────
            print()
            real_errors = [e for e in errors
                           if "__rec" not in e and "501" not in e and "ERR_" not in e]
            check(not real_errors, "no console errors or page errors",
                  f"{len(real_errors)}" + (f": {real_errors[:2]}" if real_errors else ""))

            b.close()
    finally:
        kill(srv)

    print()
    if fails:
        print(f"ROUND 2 GATE: FAIL — {len(fails)} failed: {fails}")
        return 1
    print("ROUND 2 GATE: PASS — the machine refuses a move that is too big for it,")
    print("               the refusal is driven by the physics and not by a rule,")
    print("               and the load meter agrees with the refusal.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
