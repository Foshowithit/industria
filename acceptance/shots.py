from playwright.sync_api import sync_playwright
import sys
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=False,
        args=["--use-gl=angle","--use-angle=gl","--enable-gpu","--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width":1440,"height":900})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)[:180]))
    pg.goto(sys.argv[1] if len(sys.argv)>1 else "http://127.0.0.1:8799/index.html", wait_until="load"); pg.wait_for_timeout(2200)
    pg.screenshot(path="/tmp/live/s0_gate.png")
    pg.click("#gate"); pg.wait_for_timeout(1200)
    pg.screenshot(path="/tmp/live/s1_arrive.png")
    # walk toward the machine
    pg.evaluate("() => { const I=window.INDUSTRIA; I.camp().eye.set(-1.2,1.68,-3.4); }")
    pg.wait_for_timeout(700); pg.screenshot(path="/tmp/live/s2_atmachine.png")
    # the bench with the vise
    pg.evaluate("() => { window.INDUSTRIA.camp().eye.set(-7.0,1.68,3.2); }")
    pg.wait_for_timeout(700); pg.screenshot(path="/tmp/live/s3_bench.png")
    # the toolroom with the parallels
    pg.evaluate("() => { window.INDUSTRIA.camp().eye.set(9.8,1.68,-7.0); }")
    pg.wait_for_timeout(700); pg.screenshot(path="/tmp/live/s4_toolroom.png")
    print("fps:", pg.evaluate("()=>window.INDUSTRIA.fps"), "errors:", errs or "none")
    b.close()
