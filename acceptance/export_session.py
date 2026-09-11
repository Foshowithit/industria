#!/usr/bin/env python3
"""THE OFFLINE SESSION EXPORT, end to end, on a dead transport.

WHY THIS EXISTS. A playtester is a person on the PUBLIC url with no local
server. There, `POST /__rec` can only ever fail, so the only transport that
reaches us is the file the player saves out of their own browser. That path
therefore carries the entire Round 1 measurement — and it had never been
tested as a path, only as an API call.

WHAT IT REFUSES TO TRUST.
  * `INDUSTRIA.recExport()` is the script API. The PLAYER presses S. Testing
    the API proves the wrong thing: the S handler and the API diverged once
    already, and the API is the one that looked fine.
  * A file that merely exists. It is opened and read back.
  * The row count the file reports about itself. It is checked against the
    rows actually present, because an export that under- or over-reports
    itself is the same class of lie as one that truncates.

THE SERVER IS DELIBERATELY A DEAD END. `python3 -m http.server` answers
POST /__rec with 501, which is exactly the public-url condition. If this tests
green against a runner that accepts POSTs, it has tested nothing.

USAGE
    python3 acceptance/export_session.py [URL] [--keep]

Exit code 0 = the export path is sound. Non-zero = it is not, and the reason
is printed. `--keep` leaves the downloaded file for inspection.
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

URL = "http://127.0.0.1:8799/index.html"
KEEP = "--keep" in sys.argv
for a in sys.argv[1:]:
    if not a.startswith("--"):
        URL = a

DL_DIR = tempfile.mkdtemp(prefix="industria-export-")
FAILURES = []
NOTES = []


def check(ok, label, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        FAILURES.append(label)
    return ok


def note(msg):
    NOTES.append(msg)
    print(f"  ..   {msg}")


def transport_is_dead(url):
    """Confirm POST /__rec fails. A live runner would make this test vacuous."""
    base = url.rsplit("/index.html", 1)[0]
    try:
        req = urllib.request.Request(base + "/__rec", data=b'{"probe":1}\n',
                                     headers={"Content-Type": "application/x-ndjson"},
                                     method="POST")
        with urllib.request.urlopen(req, timeout=5) as r:
            return False, f"POST /__rec answered {r.status} — this is a RUNNER, not a public url"
    except urllib.error.HTTPError as e:
        return True, f"POST /__rec -> HTTP {e.code} (dead transport, as on the public url)"
    except Exception as e:
        return True, f"POST /__rec unreachable ({type(e).__name__}) — acceptable"


def serve_repo(port=8799):
    """A plain static server: real HTTP, and POSTs refused."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    p = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
                         cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/index.html", timeout=1)
            return p
        except Exception:
            time.sleep(0.1)
    p.kill()
    raise RuntimeError("static server never came up")


def main():
    from playwright.sync_api import sync_playwright

    started_server = None
    url = URL
    if "8799" in URL:
        started_server = serve_repo()

    try:
        dead, why = transport_is_dead(url)
        print("=== TRANSPORT ===")
        check(dead, "the recorder endpoint is dead (public-url condition)", why)
        if not dead:
            print("\nREFUSING TO RUN: a live runner makes this test prove nothing.")
            return 2

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=False,
                                  args=["--use-gl=angle", "--use-angle=gl", "--enable-gpu",
                                        "--ignore-gpu-blocklist"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
            pg.on("console", lambda m: errs.append("CONSOLE: " + m.text[:200])
                  if m.type == "error" else None)

            print("\n=== PLAY A JOB, THE WAY A PLAYER DOES ===")
            pg.goto(url + "?rec=acceptance", wait_until="load")
            pg.wait_for_timeout(2200)
            pg.click("#gate")
            pg.wait_for_timeout(700)
            pg.evaluate("() => window.INDUSTRIA.act('bar')")
            pg.evaluate("() => window.INDUSTRIA.touch()")
            pg.wait_for_timeout(250)
            pg.evaluate("() => window.INDUSTRIA.measure()")

            for dial, pred in [(20, 20), (20, 20), (10, 10)]:
                pg.evaluate("(x) => window.INDUSTRIA.setBite(x)", dial)
                pg.evaluate("(x) => window.INDUSTRIA.predict(x)", pred)
                pg.evaluate("() => window.INDUSTRIA.cut()")
                pg.wait_for_timeout(260)

            pg.evaluate("() => window.INDUSTRIA.measure()")
            pg.wait_for_timeout(150)
            pg.evaluate("() => window.INDUSTRIA.inspect()")
            pg.wait_for_timeout(1000)

            print("\n=== THE AFFORDANCE ===")
            check(pg.evaluate("() => !!document.querySelector('.getrec')"),
                  "the export offer appeared after the part left the player's hands")
            check(pg.evaluate("() => document.querySelector('.getrec').innerText.length > 20"),
                  "the offer says something a person can act on",
                  repr(pg.evaluate("() => document.querySelector('.getrec').innerText")[:70]))
            lock = pg.evaluate("() => document.pointerLockElement ? document.pointerLockElement.tagName : null")
            note(f"pointerLockElement = {lock} (while locked the browser eats clicks, so S is the only way out)")

            print("\n=== PRESS S — the player's path, not the script API ===")
            try:
                with pg.expect_download(timeout=20000) as dl:
                    pg.keyboard.press("s")
                d = dl.value
            except Exception as e:
                check(False, "pressing S produced a download", str(e)[:120])
                b.close()
                return 1
            path = os.path.join(DL_DIR, d.suggested_filename)
            d.save_as(path)
            check(True, "pressing S produced a download", d.suggested_filename)

            rows = []
            bad = 0
            for line in open(path, encoding="utf-8"):
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except Exception:
                    bad += 1
            print("\n=== THE FILE THAT CAME OUT ===")
            check(len(rows) > 20, "the file has a session in it", f"{len(rows)} rows, {bad} unparseable")
            check(bad == 0, "every line parses as JSON")

            seqs = [r["seq"] for r in rows if isinstance(r.get("seq"), int)]
            dups = len(seqs) - len(set(seqs))
            check(dups == 0, "no duplicated rows",
                  f"{dups} duplicates" if dups else "0 duplicates")
            if seqs:
                contiguous = len(set(seqs)) == max(seqs) - min(seqs) + 1
                check(contiguous, "the session is contiguous, no gap",
                      f"seq {min(seqs)}..{max(seqs)}")

            acts = [r for r in rows if r.get("type") == "action"]
            n_pred = sum(1 for r in acts if r.get("act") == "predict")
            n_res = sum(1 for r in acts if r.get("act") == "prediction_result")
            print("\n=== WHAT THE ROUND ACTUALLY MEASURES ===")
            check(n_pred > 0, "predictions were recorded", f"{n_pred}")
            check(n_res == n_pred, "every prediction has its outcome",
                  f"{n_res} outcomes for {n_pred} predictions")
            for r in acts:
                if r.get("act") == "prediction_result":
                    print(f"       dial {r.get('dial_um'):>4}  removed {r['realised_um']:>7.2f} µm"
                          f"  diff {r['realised_um'] - r['dial_um']:+.2f}")
            check(any(r.get("type") == "ship" for r in rows),
                  "the ship record survived the dead transport",
                  next((str(r.get("verdict")) for r in rows if r.get("type") == "ship"), "none"))

            es = [r for r in acts if r.get("act") == "export_session"]
            check(len(es) == 1, "the export recorded itself", f"{len(es)} records, via={es[0].get('via') if es else '-'}")
            if es:
                check(es[0].get("rows") is None or abs(es[0]["rows"] - len(rows)) <= 2,
                      "the row count it reports matches the file",
                      f"claims {es[0].get('rows')}, file has {len(rows)}")

            check(not errs, "no page or console errors", "; ".join(errs[:3]) if errs else "none")
            b.close()
    finally:
        if started_server:
            started_server.terminate()
            try:
                started_server.wait(timeout=5)
            except Exception:
                started_server.kill()

    if not KEEP:
        import shutil
        shutil.rmtree(DL_DIR, ignore_errors=True)
    else:
        print(f"\nkept: {DL_DIR}")

    print("\n" + "=" * 62)
    if FAILURES:
        print(f"EXPORT PATH: BROKEN — {len(FAILURES)} check(s) failed")
        for f in FAILURES:
            print("   ·", f)
        return 1
    print("EXPORT PATH: SOUND — a playtester on the public url can hand us a session")
    return 0


if __name__ == "__main__":
    sys.exit(main())
