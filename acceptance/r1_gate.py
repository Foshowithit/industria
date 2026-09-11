#!/usr/bin/env python3
"""R1 GATE — can the player ever see the truth?

The spine of this project: `part.true_surface/holeDia_cold` may never be the
same thing as `instrument.observe(part)`. This probes the live DOM for every
representation of the true bore, both with and without a measurement taken.
"""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv)>1 else "http://127.0.0.1:8799/index.html"
errors = []

PROBE = """() => {
  const g = window.INDUSTRIA.game;
  const t = g.part.holeDia_cold_mm;
  const reps = [t.toFixed(4), t.toFixed(3), t.toFixed(2), (+t).toPrecision(6),
                (t*1000).toFixed(2), (t*1000).toFixed(1), (t*1000).toFixed(0)];
  const txt = document.body.innerText;
  const leaked = reps.filter(r => r.length > 2 && txt.includes(r));
  return { truth: t.toFixed(4), leaked,
           gauge: document.getElementById('hGauge').innerText,
           sample: txt.split('\\n').filter(Boolean).slice(0,9).join(' | ') };
}"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=False,
        args=["--use-gl=angle", "--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
    pg.goto(URL, wait_until="load"); pg.wait_for_timeout(2500)
    pg.click("#gate"); pg.wait_for_timeout(800)

    print("── BEFORE any measurement ──")
    r = pg.evaluate(PROBE)
    print("  truth :", r["truth"], "| leaked:", r["leaked"] or "NONE")
    print("  gauge :", r["gauge"])
    print("  hud   :", r["sample"][:200])
    print("  gate  :", "VIOLATION" if r["leaked"] else "HOLDS")

    # load a bar, cut, measure — the full path a player takes
    pg.evaluate("() => window.INDUSTRIA.act('Boring bar')")
    pg.evaluate("() => window.INDUSTRIA.touch()")
    pg.evaluate("() => window.INDUSTRIA.setBite(50)")
    pg.evaluate("() => window.INDUSTRIA.cut()")
    pg.evaluate("() => window.INDUSTRIA.measure()")
    pg.wait_for_timeout(400)

    print("\n── AFTER a cut + a measurement ──")
    r2 = pg.evaluate(PROBE)
    print("  truth :", r2["truth"], "| leaked:", r2["leaked"] or "NONE")
    print("  gauge :", r2["gauge"])
    print("  hud   :", r2["sample"][:200])
    print("  gate  :", "VIOLATION" if r2["leaked"] else "HOLDS")

    # does the GAUGE differ from the truth? (it must be able to)
    d = pg.evaluate("""() => { const g=window.INDUSTRIA.game;
      const t=g.part.holeDia_cold_mm;
      const m=document.getElementById('hGauge').innerText;
      return { truth:t, gauge_text:m }; }""")
    print("\n  gauge vs truth text:", d["gauge_text"], "vs", round(d["truth"], 5))

    # and the same after roughing, which moves the truth a long way
    pg.evaluate("() => window.INDUSTRIA.rough()")
    pg.wait_for_timeout(300)
    print("\n── AFTER roughing (truth moved ~2 mm) ──")
    r3 = pg.evaluate(PROBE)
    print("  truth :", r3["truth"], "| leaked:", r3["leaked"] or "NONE")
    print("  gauge :", r3["gauge"], "  <- must still be the STALE pre-rough reading")
    print("  gate  :", "VIOLATION" if r3["leaked"] else "HOLDS")

    pg.screenshot(path="/tmp/live/r1_gate.png")
    print("\npageerrors:", errors or "none")
    b.close()
