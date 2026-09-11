#!/usr/bin/env bash
# playtest.sh — one command per job. This is the whole interface.
#
#   ./playtest.sh run alice          host a session and open the browser
#   ./playtest.sh run alice --duration 1800
#   ./playtest.sh analyse            newest session, full report
#   ./playtest.sh analyse <file>     one session, full report
#   ./playtest.sh report             every session, side by side
#   ./playtest.sh selftest           prove the pipeline works, no human needed
#   ./playtest.sh verify             kernel tests + R1 leak gate + job gate
#
# Start with README/PLAYTEST-KIT.md if you are the person running sessions —
# it explains what to say (almost nothing) and what NOT to say.
#
# NEVER run `verify` while a session is in progress: it restarts the server.
#
set -euo pipefail
cd "$(dirname "$0")"
SESS="${HOME}/industria-sessions"

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
[ $# -ge 1 ] || usage

case "$1" in

  run)
    shift
    [ $# -ge 1 ] || { echo "need a label, e.g. ./playtest.sh run alice"; exit 1; }
    label="$1"; shift
    # Pre-flight: refuse to start on a port something else already holds.
    # A stray static server there still serves the game and still plays fine,
    # so a session would look healthy while every event went nowhere. Losing a
    # real human's session that way is unacceptable, so check before we open
    # anything. (This actually happened during development.)
    port=8799
    prev=""
    for a in "$@"; do
      if [ "$prev" = "--port" ]; then port="$a"; fi
      prev="$a"
    done
    if curl -sf -o /dev/null "http://127.0.0.1:${port}/__rec/status"; then
      echo "  NOTE: a playtest server is already up on :${port} — reusing it."
    elif ss -ltn 2>/dev/null | grep -q ":${port} "; then
      echo "  CANNOT START: port ${port} is held by something that is NOT a playtest server." >&2
      echo "  It may still serve the game, but /__rec would 404 and the session would be" >&2
      echo "  recorded as nothing. Stop it, or pick another port:" >&2
      echo "      ./playtest.sh run ${label} --port 8801" >&2
      exit 1
    fi
    exec python3 playtest_server.py --label "$label" --open "$@"
    ;;

  analyse)
    shift
    target="${1:-}"
    if [ -z "$target" ]; then
      target=$(ls -t "$SESS"/*.jsonl 2>/dev/null | head -1) || true
      [ -n "$target" ] || { echo "no sessions in $SESS yet"; exit 1; }
      echo "(newest session: $target)"
    fi
    [ -f "$target" ] || { echo "no such file: $target"; exit 1; }
    exec python3 analyse_session.py "$target"
    ;;

  report)
    shift
    exec python3 analyse_session.py --all "$SESS" "$@"
    ;;

  selftest)
    exec python3 selftest_pipeline.py
    ;;

  verify)
    shift
    fail=0
    echo "── kernel tests ───────────────────────────────────────────"
    node kernel.test.mjs || fail=1
    echo
    echo "── acceptance gates ───────────────────────────────────────"
    # The gates drive http://127.0.0.1:8799, so make sure something is
    # serving there. If a session is already running on that port we use it;
    # otherwise start a throwaway server for the duration of the checks and
    # shut it down again. Without this, `verify` fails with a confusing
    # connection error whenever no playtest happens to be in flight.
    started_srv=0
    if ! curl -sf -o /dev/null http://127.0.0.1:8799/index.html; then
      echo "  (starting a temporary server on :8799 for the gates)"
      # Detach it properly, or `verify` destroys itself:
      #  * stdout/stderr go to a FILE. If the server inherits our stdout it holds
      #    the pipe open, so the calling shell never sees EOF, appears to hang,
      #    and gets reaped mid-check — which truncated this whole script into a
      #    false "VERIFY: FAIL" with a truncation-only traceback.
      #  * setsid puts it in its own process group so $! is the python process
      #    itself. Backgrounding without it made $! the subshell, so the cleanup
      #    kill below missed and every run leaked a server on :8799.
      srv_log="${TMPDIR:-/tmp}/industria-verify-server.log"
      setsid python3 playtest_server.py --label __verify --port 8799 \
        --out "${TMPDIR:-/tmp}/industria-verify" --quiet \
        >"$srv_log" 2>&1 &
      srv_pid=$!
      started_srv=1
      for _ in $(seq 40); do
        curl -sf -o /dev/null http://127.0.0.1:8799/index.html && break
        sleep 0.25
      done
      if ! curl -sf -o /dev/null http://127.0.0.1:8799/index.html; then
        echo "  WARNING: temporary server did not come up; see $srv_log" >&2
      fi
    fi
    if [ -f acceptance/play_job.py ]; then
      python3 acceptance/play_job.py || fail=1
    else
      echo "  (acceptance/play_job.py absent — skipping)"
    fi
    if [ -f acceptance/r1_leakwatch.py ]; then
      python3 acceptance/r1_leakwatch.py || fail=1
    else
      echo "  (acceptance/r1_leakwatch.py absent — skipping)"
    fi
    if [ "$started_srv" -eq 1 ]; then
      # Kill the process GROUP, not just the pid. `setsid` deliberately puts the
      # server in its own group, so a plain `kill "$srv_pid"` can leave a child
      # behind holding :8799 — and a stray server is not cosmetic here: it
      # accepts POST /__rec, which makes every dead-transport test pass for the
      # wrong reason. Measured twice in one session: a playtest_server.py from
      # 16:36 was still listening at 20:35 with systemd as its parent, because
      # whatever spawned it died and it was reparented instead of reaped.
      kill "$srv_pid" 2>/dev/null || true
      sleep 0.4
      if kill -0 "$srv_pid" 2>/dev/null; then
        kill -TERM -- "-$srv_pid" 2>/dev/null || true
        sleep 0.4
      fi
      if kill -0 "$srv_pid" 2>/dev/null; then
        kill -KILL -- "-$srv_pid" 2>/dev/null || true
        sleep 0.3
      fi
      # Say so out loud rather than leaving the next run to trust a stranger.
      if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8799/index.html; then
        echo "  WARNING: :8799 still answers after cleanup — the next run may be" >&2
        echo "           testing against a server this script did not start." >&2
      fi
    fi
    echo
    [ "$fail" -eq 0 ] && echo "VERIFY: PASS" || { echo "VERIFY: FAIL"; exit 1; }
    ;;

  *) usage ;;
esac
