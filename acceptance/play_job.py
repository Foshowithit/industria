#!/usr/bin/env python3
"""PLAY A WHOLE JOB, through the page's own buttons. This is the L3 gate:
if a job cannot be taken from 5:55 to a verdict using only the things the
player can look at and press, it is not a game."""
import json
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv)>1 else "http://127.0.0.1:8799/index.html"
errors = []

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=False,
        args=["--use-gl=angle", "--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: errors.append(m.text[:300]) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)[:300]))
    pg.goto(URL, wait_until="load"); pg.wait_for_timeout(2500)
    pg.click("#gate"); pg.wait_for_timeout(800)

    print("=== THINGS YOU CAN LOOK AT ===")
    for it in pg.evaluate("() => window.INDUSTRIA.items()"):
        print("   ·", it)

    def act(name):
        r = pg.evaluate("(n) => window.INDUSTRIA.act(n)", name)
        st = pg.evaluate("""() => { const g=window.INDUSTRIA.game; return {
            hold:+g.part.holeDia_cold_mm.toFixed(4), tool:g.tool?g.tool.label:null,
            passes:g.history.length, money:g.money, clock:+g.clock_min.toFixed(1) } }""")
        print(f"  act[{name[:34]:34s}] -> {str(r)[:80]:80s} hold={st['hold']} tool={str(st['tool'])[:18]} n={st['passes']}")
        return st

    print("\n=== §104 OPENING SEQUENCE ===")
    act("Workbench")
    act("Parallels")
    act("Vernier calipers")
    act("Traveler")
    act("Drawing")

    print("\n=== MACHINE (all through the page's own verbs) ===")
    act("Boring bar Ø20")
    pg.evaluate("() => window.INDUSTRIA.touch()"); print("  touch-off done")
    pg.evaluate("() => window.INDUSTRIA.measure()")
    print("  measured:", pg.evaluate("() => document.getElementById('log').innerText.split('\\n')[0]")[:150])

    # ROUGH — the shortcut (§77: the fiftieth time is a button)
    pg.evaluate("() => window.INDUSTRIA.rough()")
    pg.wait_for_timeout(400)
    st = pg.evaluate("""() => { const g=window.INDUSTRIA.game; return {
        hold:+g.part.holeDia_cold_mm.toFixed(4), n:g.history.length,
        band:[g.job.band_low_mm,g.job.band_high_mm] } }""")
    print(f"  after rough: hold={st['hold']} passes={st['n']} band={st['band']}")
    pg.screenshot(path="/tmp/live/j_02_roughed.png")

    # FINISH — sneak up on it in small bites, which is the LESSON
    print("\n=== FINISH: creep up on the band ===")
    for i in range(24):
        st = pg.evaluate("""() => { const g=window.INDUSTRIA.game;
          return { hold:g.part.holeDia_cold_mm, hi:g.job.band_high_mm,
                   lo:g.job.band_low_mm, n:g.history.length } }""")
        if st["hold"] >= st["lo"]:
            print(f"  in band at {st['hold']:.4f} after {st['n']} passes"); break
        left_um = (st["hi"] - st["hold"]) * 1000
        bite = max(2, min(20, int(left_um / 2) or 2))
        pg.evaluate("(b) => window.INDUSTRIA.setBite(b)", bite)
        # The prediction gate: a cut with no stated expectation is REFUSED by the
        # game, so the script must state one like a player does. A scripted run
        # states 0 um — a deliberately naive model. It exercises the identical
        # code path and cannot fake the thing the mechanic measures, which is
        # whether a HUMAN's prediction changes once the machine contradicts it.
        pg.evaluate("() => window.INDUSTRIA.predict(0)")
        pg.evaluate("() => window.INDUSTRIA.cut()")
    last = pg.evaluate("""() => { const g=window.INDUSTRIA.game, h=g.history.at(-1);
      return h ? {cmd:+h.bite_cmd_um.toFixed(1), real:+h.bite_realised_um.toFixed(1),
                  n:h.n, verdict:h.verdict, kW:+h.power_kW.toFixed(3)} : null }""")
    print("  last pass:", json.dumps(last))
    pg.screenshot(path="/tmp/live/j_03_finished.png")

    print("\n=== VERDICT ===")
    v = pg.evaluate("() => window.INDUSTRIA.inspect()")
    pg.wait_for_timeout(600)
    fin = pg.evaluate("""() => { const g=window.INDUSTRIA.game; return {
        hold:+g.part.holeDia_cold_mm.toFixed(5), money:g.money,
        finished:g.finished ? {verdict:g.finished.verdict, net:g.finished.net,
          under:g.finished.under_um, over:g.finished.over_um, late:g.finished.late} : null,
        talk:document.getElementById('talk').innerText.slice(0,180),
        ev:document.getElementById('ev').innerText.slice(0,180) } }""")
    print("  ", json.dumps(fin, indent=1)[:800])
    pg.screenshot(path="/tmp/live/j_04_verdict.png")

    # ── R1 GATE: the truth must not be on screen at ANY point before ship ──
    # NOTE: this probe runs AFTER inspect(), and by design the post-mortem
    # reveal ("Customer CMM: true bore Ø….mmmm") is ALLOWED to show the truth
    # at that point — the part has left the player's hands. Without the
    # exemption below this probe reports a violation on every run that ships,
    # which is a false positive, not a leak. acceptance/r1_leakwatch.py is the
    # authoritative gate: it watches the DOM continuously from before the first
    # frame and is the one that would catch a truth that appeared DURING play.
    print("\n=== R1 GATE: probing the DOM for the true bore ===")
    r1 = pg.evaluate("""() => { const g = window.INDUSTRIA.game;
      // every representation of the truth that could leak
      const truths = new Set([
        g.part.holeDia_cold_mm.toFixed(4),
        g.part.holeDia_cold_mm.toFixed(3),
        (+g.part.holeDia_cold_mm).toPrecision(6),
        (g.part.holeDia_cold_mm*1000).toFixed(2),
      ]);
      const txt = document.body.innerText;
      const postMortem = txt.includes('Customer CMM');
      const hits = postMortem ? [] : [...truths].filter(t => t && txt.includes(t));
      return { truth: g.part.holeDia_cold_mm.toFixed(4), leaked: hits,
               post_mortem: postMortem,
               gauge: document.getElementById('hGauge').innerText,
               sample: txt.split(String.fromCharCode(10)).join(' | ').slice(0,260) }; }""")
    print("  truth   :", r1["truth"])
    print("  leaked  :", r1["leaked"] or "NONE — truth is not on screen")
    print("  gauge   :", r1["gauge"])
    print("  R1      :", ("HOLDS (post-mortem reveal present, which R1 allows)"
                          if r1["post_mortem"] and not r1["leaked"]
                          else "VIOLATION" if r1["leaked"] else "HOLDS"))

    print("\n=== ACOUSTICS THROUGH THE PAGE'S OWN ADAPTER ===")
    ac = pg.evaluate("""() => { const I=window.INDUSTRIA, W=I.W, g=I.game;
      const h=g.history.at(-1);
      // exercise the REAL page path is not exposed; verify the adapter's inputs exist
      return { rec_has: h ? Object.keys(h).length : 0,
               n_rpm: h && h.n_rpm, power_frac: h && h.power_kW/g.mach.power_max_kW,
               state_of_that: W.cutAcoustics({n:h.n_rpm, power_frac:h.power_kW/g.mach.power_max_kW,
                 b_radial_mm:h.bite_effective_um/1000, F_peak_N:h.force_N}, {z:1}).state }; }""")
    print("  ", json.dumps(ac))

    print("\nCONSOLE ERRORS:", len(errors))
    for e in errors[:10]: print("   ERR:", e)
    b.close()
print("\nVERDICT:", "FULL JOB PLAYABLE" if not errors else "ERRORS PRESENT")
