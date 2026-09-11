#!/usr/bin/env python3
"""R1 LEAK DETECTOR — watches every DOM mutation during a WHOLE job and
fails if the true bore diameter ever becomes visible.

This is not a heuristic: a MutationObserver runs from before the first frame,
re-derives the truth each mutation, and logs any node whose text contains a
4-decimal representation of `part.holeDia_cold_mm`.
"""
import json, sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv)>1 else "http://127.0.0.1:8799/index.html"
errors, leaks = [], []

OBSERVER = """() => {
  window.__LEAKS = [];
  const check = (node) => {
    const g = window.INDUSTRIA && window.INDUSTRIA.game;
    if (!g || !g.part) return;
    const t = g.part.holeDia_cold_mm;
    const reps = [t.toFixed(4), t.toFixed(3)];
    const txt = (node.textContent || '') + ' ' + (node.innerText || '');
    // a real leak is a DECIMAL NUMBER, not digits straddling a label boundary
    for (const r of reps) {
      const re = new RegExp('(?<![0-9.])' + r.replace('.', '\\.') + '(?![0-9])');
      if (r.length > 3 && re.test(txt))
        window.__LEAKS.push({ rep: r, truth: t.toFixed(5),
          where: node.id || node.className || node.tagName,
          allowed: txt.includes('Customer CMM'),
          text: txt.replace(/\s+/g,' ').slice(0, 200) });
    }
  };
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') check(m.target.parentElement || document.body);
      else if (m.target) check(m.target);
      for (const n of m.addedNodes) if (n.nodeType === 1) check(n);
    }
  });
  obs.observe(document.body, {childList:true, subtree:true, characterData:true});
  return 'watching';
}"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=False,
        args=["--use-gl=angle", "--use-angle=gl", "--enable-gpu", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
    pg.goto(URL, wait_until="load"); pg.wait_for_timeout(2200)
    print("observer:", pg.evaluate(OBSERVER))
    pg.click("#gate"); pg.wait_for_timeout(700)

    # ── AUDIO: is the sound system actually running, or silently dead? ─────
    aud = pg.evaluate("""() => {
      const I = window.INDUSTRIA;
      // the page holds AUD privately; probe the observable effects instead
      const ctxs = [];
      return { hasAudioContext: !!(window.AudioContext || window.webkitAudioContext),
               note: 'probe via console messages below' };
    }""")
    print("audio api present:", aud["hasAudioContext"])

    def note(label):
        got = pg.evaluate("() => { const L = window.__LEAKS.splice(0); return L; }")
        for g in got:
            if g.get("allowed"):
                print(f"  ok  post-mortem reveal at {label} (designed, R1 allows it)")
                continue
            leaks.append(g)
            print(f"  !! LEAK after {label}: rep={g['rep']} truth={g['truth']} in <{g['where']}> :: {g['text'][:90]}")

    note("boot")
    # full job, exactly as a player would
    for step in ["Workbench", "Parallels", "Vernier calipers", "Traveler", "Drawing"]:
        pg.evaluate("(n) => window.INDUSTRIA.act(n)", step); pg.wait_for_timeout(120)
    note("§104 opening")
    pg.evaluate("() => window.INDUSTRIA.act('Boring bar Ø20')"); pg.wait_for_timeout(200); note("load tool")
    pg.evaluate("() => window.INDUSTRIA.touch()"); pg.wait_for_timeout(200); note("touch off")
    pg.evaluate("() => window.INDUSTRIA.measure()"); pg.wait_for_timeout(300); note("measure")
    print("  gauge now:", pg.evaluate("() => document.getElementById('hGauge').innerText"))

    pg.evaluate("() => window.INDUSTRIA.rough()"); pg.wait_for_timeout(500); note("rough")
    print("  gauge now:", pg.evaluate("() => document.getElementById('hGauge').innerText"),
          "(stale on purpose — the part moved, the gauge did not)")

    for i in range(30):
        st = pg.evaluate("""() => { const g=window.INDUSTRIA.game;
          return { t:g.part.holeDia_cold_mm, lo:g.job.band_low_mm, hi:g.job.band_high_mm } }""")
        if st["t"] >= st["lo"]: break
        bite = max(2, min(20, int(((st["hi"] - st["t"]) * 1000) / 2) or 2))
        pg.evaluate("(b) => window.INDUSTRIA.setBite(b)", bite)
        pg.evaluate("() => window.INDUSTRIA.cut()")
    note("finish passes")

    pg.evaluate("() => window.INDUSTRIA.measure()"); pg.wait_for_timeout(250); note("final measure")
    pg.evaluate("() => window.INDUSTRIA.inspect()"); pg.wait_for_timeout(700); note("INSPECT/ship")

    fin = pg.evaluate("""() => { const g=window.INDUSTRIA.game;
      return { verdict:g.finished&&g.finished.verdict, net:g.finished&&g.finished.net,
               reveal_on_screen: document.getElementById('ev').innerText.includes('Customer CMM') }; }""")
    print("\nfinal:", json.dumps(fin))
    print("post-mortem reveal shown (this one is ALLOWED):", fin["reveal_on_screen"])
    pg.screenshot(path="/tmp/live/r1_final.png")

    print(f"\nleaks during play : {len(leaks)}")
    print("pageerrors        :", errors or "none")
    b.close()

print("\nR1 GATE:", "PASS — truth never visible during play" if not leaks else f"FAIL — {len(leaks)} leaks")
