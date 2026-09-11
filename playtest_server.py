#!/usr/bin/env python3
"""
playtest_server.py — the smallest thing that can host a playtest session.

It does three jobs and nothing else:

  1. Serves the repo directory over http://127.0.0.1:<port>/ so the page can be
     opened with `?rec=<label>` and ES modules load normally.
  2. Receives the recorder's JSONL POSTs at /__rec and appends them, verbatim,
     to ~/industria-sessions/<label>.jsonl.
  3. Closes the session cleanly: on `--duration` expiry (or Ctrl-C) it asks the
     browser to flush, writes a `session_end` row if the page never did, and
     prints a one-line summary.

Run it via ./playtest.sh, not by hand.
"""
import argparse
import http.server
import json
import os
import pathlib
import re
import socketserver
import sys
import threading
import time
from datetime import datetime, timezone

REPO = pathlib.Path(__file__).resolve().parent
SAFE_LABEL = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


class Handler(http.server.SimpleHTTPRequestHandler):
    sessions_dir = None
    counters = {}
    lock = threading.Lock()
    quiet = False

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(REPO), **kw)

    def log_message(self, fmt, *args):
        if not self.quiet:
            sys.stderr.write("  [http] " + (fmt % args) + "\n")

    def do_POST(self):
        if self.path.rstrip("/") not in ("/__rec", "/__rec/"):
            self.send_error(404)
            return
        label = self.headers.get("X-Rec-Label") or "unlabelled"
        if not SAFE_LABEL.match(label):
            self.send_error(400, "bad label")
            return
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            n = 0
        body = self.rfile.read(n) if n else b""
        if body:
            out = self.sessions_dir / (label + ".jsonl")
            with self.lock:
                first = not out.exists()
                with open(out, "ab") as fh:
                    fh.write(body)
                self.counters[label] = self.counters.get(label, 0) + body.count(b"\n")
            if first:
                sys.stderr.write(f"\n  ▸ session file opened: {out}\n\n")
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        # A tiny status endpoint so the runner (and a human) can see progress
        # without opening the file.
        if self.path.rstrip("/") == "/__rec/status":
            payload = json.dumps({
                "sessions": Handler.counters,
                "dir": str(Handler.sessions_dir),
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def summarise(path):
    """Read back a session file and report what is actually in it."""
    rows, kinds = [], {}
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for ln in fh:
            ln = ln.strip()
            if not ln:
                continue
            try:
                r = json.loads(ln)
            except json.JSONDecodeError:
                continue
            rows.append(r)
            kinds[r.get("type")] = kinds.get(r.get("type"), 0) + 1
    print(f"\n  session file : {path}")
    print(f"  rows         : {len(rows)}")
    if kinds:
        print("  by type      : " + " · ".join(f"{k}={v}" for k, v in sorted(kinds.items())))
    acts = [r for r in rows if r.get("type") in ("action", "measure", "cut", "ship", "refusal", "cut_refused")]
    if acts:
        print(f"  first action : {acts[0].get('wall_ms')} ms into the session "
              f"({acts[0].get('type')})")
    if kinds.get("ship"):
        print("  ← the part was a ship/scrap event: the core loop was reached")
    else:
        print("  ← NO ship event: the session ended before the part was inspected")
    return len(rows)


def main():
    ap = argparse.ArgumentParser(description="Host one instrumented playtest session.")
    ap.add_argument("--label", required=True, help="session label; becomes <label>.jsonl")
    ap.add_argument("--port", type=int, default=8799)
    ap.add_argument("--duration", type=int, default=0,
                    help="seconds; 0 = run until Ctrl-C")
    ap.add_argument("--out", default=os.path.expanduser("~/industria-sessions"))
    ap.add_argument("--open", dest="do_open", action="store_true",
                    help="open the browser at the instrumented URL")
    ap.add_argument("--page", default="index.html")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    if not SAFE_LABEL.match(args.label):
        sys.exit("label must be [A-Za-z0-9._-]{1,64}")

    outdir = pathlib.Path(args.out).expanduser()
    outdir.mkdir(parents=True, exist_ok=True)
    Handler.sessions_dir = outdir
    Handler.quiet = args.quiet

    url = f"http://127.0.0.1:{args.port}/{args.page}?rec={args.label}"
    httpd = Server(("127.0.0.1", args.port), Handler)

    print(f"\n  INDUSTRIA playtest session — label {args.label!r}")
    print(f"  serving      : {REPO}")
    print(f"  open this    : {url}")
    print(f"  JSONL lands  : {outdir / (args.label + '.jsonl')}")
    if args.duration:
        print(f"  auto-close   : {args.duration}s from now")
    else:
        print("  auto-close   : off — Ctrl-C when the player is done")
    print("  ── do not explain the controls; the build explains itself ──\n")

    if args.do_open:
        for opener in ("xdg-open", "google-chrome", "chromium", "firefox"):
            if os.system(f"command -v {opener} >/dev/null 2>&1") == 0:
                os.spawnlp(os.P_NOWAIT, opener, opener, url)
                break

    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()

    started = time.time()
    try:
        while True:
            time.sleep(0.5)
            if args.duration and time.time() - started >= args.duration:
                print("\n  duration reached.")
                break
    except KeyboardInterrupt:
        print("\n  Ctrl-C — closing the session.")
    finally:
        httpd.shutdown()

    path = outdir / (args.label + ".jsonl")
    # The browser may still be mid-flight. Give its next flush a moment.
    time.sleep(1.5)
    if not path.exists():
        print(f"\n  NO DATA — {path} was never written.")
        print("  The page either never loaded, or the recorder was not armed.")
        print("  Check that the URL you opened ends in ?rec=" + args.label)
        sys.exit(2)

    n = summarise(path)
    if n == 0:
        sys.exit(2)
    print(f"\n  now run:  ./playtest.sh analyse {path}\n")


if __name__ == "__main__":
    main()
