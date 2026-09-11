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
      python3 playtest_server.py --label __verify --port 8799 \
        --out "${TMPDIR:-/tmp}/industria-verify" --quiet &
      srv_pid=$!
      started_srv=1
      for _ in $(seq 40); do
        curl -sf -o /dev/null http://127.0.0.1:8799/index.html && break
        sleep 0.25
      done
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
      kill "$srv_pid" 2>/dev/null || true
    fi
    echo
    [ "$fail" -eq 0 ] && echo "VERIFY: PASS" || { echo "VERIFY: FAIL"; exit 1; }
    ;;

  *) usage ;;
esac
