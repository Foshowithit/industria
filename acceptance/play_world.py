#!/usr/bin/env python3
"""Play the world page the way a player would, and report only what is TRUE."""
import sys, time, json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8799/index.html"
errors, warns, raf_ok = [], [], False

with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path="/usr/bin/google-chrome", headless=False,
        args=["--use-gl=angle", "--use-angle=gl", "--enable-gpu",
              "--ignore-gpu-blocklist", "--window-size=1440,900"],
    )
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: (errors if m.type == "error" else warns).append(m.text[:400]))
    pg.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)[:400]))

    pg.goto(URL, wait_until="load", timeout=30000)
    pg.wait_for_timeout(2500)

    # ── Gate screen ────────────────────────────────────────────────────────
    print("GATE visible :", pg.is_visible("#gate"))
    print("GATE headline:", pg.inner_text("#gBig").replace("\n", " / ")[:120])
    print("GATE prompt  :", pg.inner_text("#gGo"))

    # ── Enter ──────────────────────────────────────────────────────────────
    pg.click("#gate")
    pg.wait_for_timeout(1500)
    print("GATE hidden  :", not pg.is_visible("#gate"))

    # canvas / webgl
    print("CANVAS       :", pg.evaluate(
        "() => { const c=document.querySelector('canvas'); "
        "return c ? {w:c.width,h:c.height,gl:!!(c.getContext('webgl2')||c.getContext('webgl'))} : null }"))

    # did the loop actually run?
    fps = pg.evaluate("() => window.INDUSTRIA?.fps ?? 0")
    print("FPS (500ms)  :", round(fps, 1))
    raf_ok = fps > 20

    # ── state after boot ───────────────────────────────────────────────────
    st = pg.evaluate("""() => { const I=window.INDUSTRIA; if(!I||!I.game) return null;
      const g=I.game; return {
        clock: g.clock_min, world: I.clocks.world_min, job: I.clocks.job_min,
        title: g.job.title, band: [g.job.band_low_mm, g.job.band_high_mm],
        deadline: g.job.deadline_min, nominal: g.job.nominal_mm,
        hold: g.part.holeDia_cold_mm, mat: g.mat.label, mach: g.mach.label,
        tool: g.tool ? g.tool.label : null, edgeR: g.machine.edgeR_cold_mm,
        money: g.money, cam: I.camp()
      }}""")
    print("STATE        :", json.dumps(st, indent=None)[:600] if st else "NULL — GAME NEVER STARTED")

    # ── HUD ────────────────────────────────────────────────────────────────
    print("HUD clock    :", pg.inner_text("#hClock"))
    print("HUD job      :", pg.inner_text("#hJob"))
    print("HUD hold     :", pg.inner_text("#hHold"))
    print("HUD log      :", " | ".join(pg.inner_text("#log").split("\n")[:3])[:220])
    pg.screenshot(path="/tmp/live/w_01_arrive.png")

    # ── WALK: does WASD move the body? ─────────────────────────────────────
    before = pg.evaluate("() => window.INDUSTRIA.camp()")
    pg.keyboard.down("w"); pg.wait_for_timeout(1400); pg.keyboard.up("w")
    after = pg.evaluate("() => ({cam: window.INDUSTRIA.camp(), clock: window.INDUSTRIA.game.clock_min})")
    d = ((after["cam"]["eye"]["x"]-before["eye"]["x"])**2 + (after["cam"]["eye"]["z"]-before["eye"]["z"])**2)**0.5
    print(f"WALK         : moved {d:.2f} m; clock {before['fps'] and ''}{after['clock']:.1f}")
    print("CAM          :", json.dumps(after["cam"]["eye"]))
    pg.screenshot(path="/tmp/live/w_02_walk.png")

    # ── did the §104 beats fire? ───────────────────────────────────────────
    print("TALK/BEATS   :", " | ".join(pg.inner_text("#talk").split("\n"))[:260] or "(silent)")
    print("TOASTS       :", " | ".join(pg.inner_text("#ev").split("\n"))[:200] or "(none)")

    # ── try the verbs through the debug handle, exactly as the page calls them
    ops = pg.evaluate("""() => { const I=window.INDUSTRIA, G=I.G, W=I.W, out=[];
      const g=I.game;
      // load a bar the way the tool board would
      const r1 = G.loadTool(g, 'bar20', 45);
      out.push(['loadTool bar20/45', JSON.stringify(r1).slice(0,150)]);
      g.machine.edgeR_cold_mm = g.part.holeDia_cold_mm/2;
      const c1 = G.cutOnce(g, {bite_mm:0.05, feed_mm_rev:0.12, vc:120, label:'bored'});
      out.push(['cut 50um', JSON.stringify({ok:c1.ok, why:c1.why,
        cmd:c1.rec&&c1.rec.bite_cmd_um, real:c1.rec&&c1.rec.bite_realised_um,
        n:c1.rec&&c1.rec.n, kW:c1.rec&&c1.rec.power_kW}).slice(0,200)]);
      out.push(['hold after', g.part.holeDia_cold_mm.toFixed(4)]);
      const m1 = G.measure(g, {samples:3, seed:7});
      out.push(['measure', m1.reading_mm.toFixed(5)+' mm, sigma '+m1.sigma_um.toFixed(2)]);
      out.push(['growth', G.partGrowth_um(g).toFixed(2)+' um at '+g.part.partC.toFixed(1)+'C']);
      out.push(['edgeOffset', G.edgeOffset_um(g).toFixed(1)+' um']);
      const bg = W.boreGeometry(g, G.partGrowth_um);
      out.push(['boreGeometry', JSON.stringify(bg).slice(0,220)]);
      const ca = W.cutAcoustics(g.history[g.history.length-1]||{}, {z:1, rubbing:false});
      out.push(['cutAcoustics', JSON.stringify(ca).slice(0,220)]);
      return out; }""")
    for k, v in ops:
        print(f"  OP {k:18s} -> {v}")

    # ── the acoustics of a rub must NOT contain an impulse train ───────────
    rub = pg.evaluate("""() => { const W=window.INDUSTRIA.W;
      const a=W.cutAcoustics({}, {rubbing:true}); const b=W.cutAcoustics({bite_cmd_um:50,bite_realised_um:55,power_kW:3,F_peak_N:200,k_peak:0.5,tooth_Hz:60,n_rpm:2000,cut_min:1},{z:1});
      return {rub_state:a.state, rub_gain:a.harmonic_gain, rub_noise:a.noise_gain,
              cut_state:b.state, cut_gain:b.harmonic_gain}; }""")
    print("ACOUSTICS    :", json.dumps(rub))

    # ── DAYLIGHT / lamps at the start of a 5:55 shift ──────────────────────
    dl = pg.evaluate("() => { const W=window.INDUSTRIA.W; return [355,420,720,1080,1380].map(m=>[m, W.daylight(m)]); }")
    print("DAYLIGHT     :", json.dumps(dl)[:400])

    # ── let it run to see Earl and the clock advance ───────────────────────
    pg.wait_for_timeout(6000)
    adv = pg.evaluate("""() => { const I=window.INDUSTRIA;
      return {clock:I.game.clock_min, world:I.clocks.world_min, job:I.clocks.job_min,
              talk:document.getElementById('talk').innerText.slice(0,200),
              log:document.getElementById('log').innerText.slice(0,300)} }""")
    print("AFTER 6 s    :", json.dumps(adv)[:700])
    pg.screenshot(path="/tmp/live/w_03_run.png")

    # ── stress: how does it hold up under load ────────────────────────────
    pg.keyboard.down("w"); pg.keyboard.down("Shift")
    pg.wait_for_timeout(2500)
    pg.keyboard.up("Shift"); pg.keyboard.up("w")
    print("FPS (loaded) :", round(pg.evaluate("() => window.INDUSTRIA.fps"), 1))
    pg.screenshot(path="/tmp/live/w_04_run2.png")

    print("\nCONSOLE ERRORS:", len(errors))
    for e in errors[:14]:
        print("   ERR:", e)
    print("CONSOLE WARNS:", len(warns))
    for w in warns[:8]:
        print("   warn:", w)
    b.close()

print("\nRESULT:", "loop running" if raf_ok else "LOOP DID NOT RUN")
print("VERDICT:", "FAIL" if errors else "no console errors")
