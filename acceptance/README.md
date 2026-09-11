# The acceptance gates, as run

These are the scripts that produced `../GATE-B-RESULT.md`. They must be played against
the **published** URL, not a local copy, because the whole point is to test what the user
will actually open.

**Every script takes the target URL as its first argument.** With no argument it falls back
to `http://127.0.0.1:8799/index.html` for unattended local use.

    python3 acceptance/play_job.py      URL  # a whole job, through the page's own buttons
    python3 acceptance/r1_leakwatch.py  URL  # R1: truth must never reach the screen
    python3 acceptance/audio_probe2.py  URL  # the sound engine actually starts
    python3 acceptance/play_world.py    URL  # the world page, not just the job
    python3 acceptance/r1_gate.py       URL  # the R1 gate as a standalone check
    python3 acceptance/probe3d.py       URL  # scene/geometry probe
    python3 acceptance/shots.py         URL  # screenshots from four vantages
    python3 acceptance/export_session.py [URL] [--keep]
                                            # a playtester's session reaches us at all

For example, the run recorded in the 2026-09-11 addendum:

    python3 acceptance/play_job.py https://foshowithit.github.io/industria/index.html

**`export_session.py` is different from the rest and should be run as the shipped
playtester will meet it — against the PUBLIC url.** It exists because that is the only
transport a real playtester has: on the published build `POST /__rec` cannot succeed, so
the file a player saves out of their own browser carries the entire Round 1 measurement.
It therefore plays a job, presses **`S`** (the player's path, *not* the
`INDUSTRIA.recExport()` script API — the two diverged once already and the API was the
one that looked fine), and then reads the downloaded file back to check that it is
contiguous, free of duplicate rows, carries every `predict`/`prediction_result` pair, and
contains its own `export_session` record.

It **refuses to run** if the recorder endpoint answers a POST, because a live runner
makes the test prove nothing. Run with no argument it starts its own plain static server
(which refuses POSTs with 501 — the public-url condition) and tears it down afterwards.

**Do not assume a URL argument is being honoured — this README once claimed all of these
ran against the published URL while five of the six silently hardcoded localhost.** Passing
a URL to a script that ignores it and having a local server happen to be up produces a PASS
that proves nothing about the deployed build. That defect is fixed; the lesson is not.
Verify against the live deployment before trusting any result here.

`play_job.py` and `r1_leakwatch.py` drive `window.INDUSTRIA.act(name)`, which presses
the same `LOOK` handlers a player presses with `E` — so the test exercises the shipped
code path, not a copy of it.

Requirements: playwright (python), `/usr/bin/google-chrome`. The GPU flags matter:
`--use-gl=angle --use-angle=gl --enable-gpu --ignore-gpu-blocklist`.
