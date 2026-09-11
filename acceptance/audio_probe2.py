from playwright.sync_api import sync_playwright
import sys
URL = sys.argv[1]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",headless=False,
      args=["--use-gl=angle","--use-angle=gl","--enable-gpu","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={"width":1280,"height":800})
    pg.goto(URL, wait_until="load"); pg.wait_for_timeout(2200)
    print("before click:", pg.evaluate("()=>window.INDUSTRIA.audio()"))
    pg.click("#gate"); pg.wait_for_timeout(1500)
    print("after  click:", pg.evaluate("()=>window.INDUSTRIA.audio()"))
    b.close()
