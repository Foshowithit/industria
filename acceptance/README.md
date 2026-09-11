# The acceptance gates, as run

These are the scripts that produced `../GATE-B-RESULT.md`. They were played against
the **published** URL, not a local copy, because the whole point is to test what the
user will actually open.

    python3 acceptance/play_job.py          # a whole job, through the page's own buttons
    python3 acceptance/r1_leakwatch.py URL  # R1: truth must never reach the screen
    python3 acceptance/audio_probe2.py URL  # the sound engine actually starts
    python3 acceptance/shots.py             # screenshots from four vantages

`play_job.py` and `r1_leakwatch.py` drive `window.INDUSTRIA.act(name)`, which presses
the same `LOOK` handlers a player presses with `E` — so the test exercises the shipped
code path, not a copy of it.

Requirements: playwright (python), `/usr/bin/google-chrome`. The GPU flags matter:
`--use-gl=angle --use-angle=gl --enable-gpu --ignore-gpu-blocklist`.
