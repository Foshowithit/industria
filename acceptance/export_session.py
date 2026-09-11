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
import re
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


def free_port(port=8799):
    """Take :8799 back if something is holding it, and say what it was.

    A stray playtest_server.py answers `POST /__rec` with 204, which silently
    turns this test's central precondition (a DEAD transport) into a live one.
    Refusing to run is the right call — but leaving the port occupied means the
    next person hits the same wall, so clear it and report it.
    """
    holder = ""
    try:
        out = subprocess.run(["ss", "-ltnp"], capture_output=True, text=True, timeout=5).stdout
        for line in out.splitlines():
            if f":{port}" in line:
                holder = line.strip()
    except Exception:
        pass
    if not holder:
        return None
    pids = re.findall(r"pid=(\d+)", holder)
    note(f":{port} was occupied — {' '.join(pids) or 'unknown pid'} :: {holder[-90:]}")
    for pid in pids:
        for sig in ("-TERM", "-KILL"):
            try:
                subprocess.run(["kill", sig, pid], timeout=5)
            except Exception:
                pass
            time.sleep(0.3)
    time.sleep(0.5)
    still = subprocess.run(["ss", "-ltn"], capture_output=True, text=True).stdout
    if f":{port}" in still:
        return f":{port} is STILL occupied after cleanup — I will not test against a stranger"
    return None


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


def contaminated_store_heals(browser, url):
    """Plant a session that already contains duplicate rows, then open the game.

    Stores written before `lsWritten` existed are still sitting in real
    browsers, and those players must not have to clear their storage by hand to
    get a trustworthy file. The game should heal such a session on open and say
    in the file that it did so.
    """
    key = "industria.rec.contam"
    rows = []
    for i in range(6):
        rows.append({"seq": i, "wall_ms": i * 10, "t_iso": "2026-01-01T00:00:00.000Z",
                     "type": "sample", "clock_min": 0, "phase": "CUTTING"})
    text = "".join(json.dumps(r) + "\n" for r in rows)
    doubled = text + text  # every row twice, exactly the old defect

    ctx = browser.new_context(viewport={"width": 1200, "height": 800}, accept_downloads=True)
    try:
        pg = ctx.new_page()
        # Write the damaged store, then reload so the recorder bootstraps over it.
        pg.goto(url + "?rec=contam", wait_until="load")
        pg.evaluate("(t) => localStorage.setItem('industria.rec.contam', t)", doubled)
        pg.reload(wait_until="load")
        pg.wait_for_timeout(2200)
        st = pg.evaluate("() => window.INDUSTRIA.recLocal()")
        hdr_txt = pg.evaluate("() => window.INDUSTRIA.recDump()")
        hdr = json.loads(hdr_txt.split("\n")[0])
        rows_now = [json.loads(l) for l in hdr_txt.split("\n")[1:] if l.strip()]
        seqs = [r["seq"] for r in rows_now if isinstance(r.get("seq"), int)]
        print(f"       planted {len(rows) * 2} rows holding {len(rows)} distinct seqs; "
              f"store now reports {st['rows']} rows / {len(seqs)} with seq; "
              f"header discarded={hdr.get('duplicate_rows_discarded_on_open')}")
        return (len(seqs) == len(set(seqs)) and len(seqs) == 6
                and hdr.get("duplicate_rows_discarded_on_open") == 6)
    finally:
        ctx.close()


def main():
    from playwright.sync_api import sync_playwright

    started_server = None
    url = URL
    if "8799" in URL:
        clash = free_port()
        if clash:
            print("=== PORT ===")
            check(False, "the test port is usable", clash)
            print("\n" + "=" * 62)
            print("EXPORT PATH: CANNOT RUN — a stranger holds the port this test needs")
            return 2
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

            print("\n=== THE CHIPS GO WHERE THE CUT IS ===")
            # A regression gate, not a screenshot. The emitter once added every
            # chip to `scene` at hand-picked WORLD coordinates while the machine
            # lives in a cell at z=-7, so 10 chips per pass sprayed onto the floor
            # ~7 units outside the enclosure. Then the floor clamp compared a
            # SPINDLE-LOCAL y (-0.67, the tool nose) against a CELL-LOCAL floor
            # (1.06), which is true, so every chip was slammed onto the floor on
            # the very frame it spawned -- right position, zero visible flight.
            # Both defects were invisible to every automated check that existed.
            # This one reads the meshes themselves.
            CHIPS = """() => {
              const I = window.INDUSTRIA, T = I.THREE;
              const w = new T.Vector3();
              const found = [];
              I.scene.updateMatrixWorld(true);
              I.scene.traverse(o => {
                if (!o.isMesh || !o.geometry || o.geometry.type !== 'TetrahedronGeometry') return;
                let p = o.parent, inSpindle = false;
                while (p) { if (p === I.cell) break; if (p.position.y === 2.52) inSpindle = true; p = p.parent; }
                if (!inSpindle) return;            // the 90 decorative floor chips
                o.getWorldPosition(w);
                found.push({ x:+w.x.toFixed(3), y:+w.y.toFixed(3), z:+w.z.toFixed(3) });
              });
              return found;
            }"""
            pg.wait_for_timeout(1400)              # let the last pass settle to the floor
            chips = pg.evaluate(CHIPS)
            check(len(chips) >= 10, "the pass emitted chips at all", f"{len(chips)} meshes")
            if chips:
                # The bore is world (-0.1, ~1.30, -6.65); the cell sits at z -7 and
                # the enclosure floor is cell-local y 1.06. A chip belongs near the
                # machine in x/z, and its y sits between the floor and the nose.
                near = [c for c in chips
                        if abs(c["x"] + 0.1) < 1.2 and abs(c["z"] + 7) < 1.2]
                check(len(near) == len(chips),
                      "every chip is inside the machine, not sprayed across the shop",
                      f"{len(near)}/{len(chips)} within 1.2 units of the bore; "
                      f"z {min(c['z'] for c in chips)}..{max(c['z'] for c in chips)} (cell at z -7)")
                on_floor = [c for c in chips if abs(c["y"] - 1.06) < 0.02]
                check(bool(on_floor),
                      "chips come to rest on the enclosure floor (cell-local y 1.06)",
                      f"{len(on_floor)}/{len(chips)} at y=1.06; "
                      f"y {min(c['y'] for c in chips)}..{max(c['y'] for c in chips)}")
                check(all(c["y"] > 0.5 for c in chips),
                      "no chip is below the floor (the clamp is not inverted)",
                      f"lowest world y {min(c['y'] for c in chips)}")

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

            # ── THE RELOAD ───────────────────────────────────────────────────
            # A playtester reloads to retry a part. If the session does not
            # survive that, the file we get back is missing the attempt we most
            # wanted, and nothing in it says so.
            print("\n=== A PLAYTESTER RELOADS (retrying a part) ===")
            before_rows = len(rows)
            before_preds = n_pred
            before_max = max(seqs) if seqs else 0
            pg.reload(wait_until="load")
            pg.wait_for_timeout(2200)
            pg.click("#gate")
            pg.wait_for_timeout(700)
            pg.evaluate("() => window.INDUSTRIA.act('bar')")
            pg.evaluate("() => window.INDUSTRIA.touch()")
            pg.wait_for_timeout(250)
            pg.evaluate("() => window.INDUSTRIA.measure()")
            pg.evaluate("() => window.INDUSTRIA.setBite(50)")
            pg.evaluate("() => window.INDUSTRIA.predict(50)")
            pg.evaluate("() => window.INDUSTRIA.cut()")
            pg.wait_for_timeout(400)
            pg.evaluate("() => window.INDUSTRIA.measure()")
            pg.wait_for_timeout(150)
            pg.evaluate("() => window.INDUSTRIA.inspect()")
            pg.wait_for_timeout(1000)
            with pg.expect_download(timeout=20000) as dl2:
                pg.keyboard.press("s")
            p2 = os.path.join(DL_DIR, dl2.value.suggested_filename)
            dl2.value.save_as(p2)
            rows2 = [json.loads(l) for l in open(p2, encoding="utf-8") if l.strip()]
            seqs2 = [r["seq"] for r in rows2 if isinstance(r.get("seq"), int)]
            dups2 = len(seqs2) - len(set(seqs2))
            acts2 = [r for r in rows2 if r.get("type") == "action"]

            check(len(rows2) > before_rows,
                  "the session grew across the reload rather than restarting",
                  f"{before_rows} -> {len(rows2)} rows")
            check(max(seqs2) > before_max,
                  "numbering continued past the pre-reload rows",
                  f"max seq {before_max} -> {max(seqs2)}")
            check(dups2 == 0, "no duplicated rows after the reload",
                  f"{dups2} duplicates" if dups2 else "0 duplicates")
            old_dials = {r.get("dial_um") for r in rows if r.get("dial_um")}
            new_dials = {r.get("dial_um") for r in rows2 if r.get("dial_um")}
            check(old_dials <= new_dials,
                  "the pre-reload work is still in the file",
                  f"pre-reload dials {sorted(old_dials)} present afterwards {sorted(old_dials & new_dials)}")
            n_pred2 = sum(1 for r in acts2 if r.get("act") == "predict")
            check(n_pred2 > before_preds,
                  "the new sitting's predictions were added",
                  f"{before_preds} -> {n_pred2} predictions")
            hdr = next((r for r in rows2 if r.get("type") == "export_note"), {})
            check(hdr.get("resumed_from_a_previous_page_load") is True,
                  "the file says outright that it is a resumed session, not one sitting",
                  f"resumed={hdr.get('resumed_from_a_previous_page_load')}")
            # One file, one session id. A reload mints a new one by default, which
            # puts two ids in a single export -- undetectable by a reader, and it
            # silently splits the per-session accounting in the analysis.
            ids = {r.get("session_id") for r in rows2 if r.get("session_id")}
            check(len(ids) == 1,
                  "the whole file carries ONE session id across both page loads",
                  f"{len(ids)} ids: {sorted(ids)}")
            check(hdr.get("session_id_adopted_from_the_earlier_load") is True,
                  "the file says the earlier session id was adopted",
                  f"adopted={hdr.get('session_id_adopted_from_the_earlier_load')}")
            # The transport failing is the CONDITION UNDER TEST, not a defect: this
            # suite deliberately serves from a static server that answers POST
            # /__rec with 501 (see the header). A browser told to POST anyway will
            # log that refusal, and the game is REQUIRED to survive it -- that
            # tolerated failure is the entire point of the dead-transport design.
            # Counting it as a defect made this check report the intended state as
            # a break. Allowlist that one artifact; any page error, and any other
            # console error, still fails.
            EXPECTED = re.compile(r"POST[^\n]*__rec[^\n]*501|501[^\n]*Unsupported method", re.I)
            real = [e for e in errs if not EXPECTED.search(e)]
            expected_noise = len(errs) - len(real)
            check(not real, "no page or console errors",
                  "; ".join(real[:3]) if real
                  else f"none ({expected_noise} expected 501 from the dead recorder transport)")


            # ── A STORE LEFT DAMAGED BY AN OLDER BUILD ───────────────────────
            print("\n=== A STORE WITH DUPLICATE ROWS ALREADY IN IT ===")
            check(contaminated_store_heals(b, url), "an already-contaminated session heals on open")
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
