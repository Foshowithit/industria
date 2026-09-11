# INDUSTRIA — live slice

A playable model of the physical economy. This repository is the **first live slice** of
INDUSTRIA: one self-contained page backed by a real causal kernel, with no build step.

**Open the page:** https://foshowithit.github.io/industria/

Nothing is fetched from a third party at runtime — the two three.js files the page needs are
vendored under `vendor/` and pinned by SHA-256. Open it on a plane.

## Hand it to a human

**One file, double-clicked, no server: `INDUSTRIA-single-file.html`.** Built by
`tools/build-single-file.mjs`. See `QUICKSTART.md` — it is written to be forwarded
verbatim to somebody who will never run a script.

This exists because opening `index.html` from disk gives a **blank page**:
`window.INDUSTRIA` never exists, since ES modules are fetched with CORS and a
`file://` document has the opaque origin `null`. A game authored as ES modules
cannot run from disk, and "just start a local web server" is how you get zero
playtesters. The bundle mints blob URLs, which are same-origin with the document
that created them, so the import `file://` refused is allowed.

It is a **build artifact, not a second source of truth**: edit `index.html` and the
modules, then rebuild. Editing the bundle directly means the next build silently
overwrites you.

## What is here

| File | What it is |
|---|---|
| `index.html` | The whole app — one page, no bundler, no framework. Reads `kernel.mjs` as an ES module. |
| `kernel.mjs` | The causal kernel: cutting force, power, deflection, stability, and a signed µm error budget. Pure functions. |
| `kernel.test.mjs` | 54 headless regression checks. `node kernel.test.mjs` → exit 0. |
| `models/` | Three real CNC meshes, measured in your browser. No CAD kernel involved. |
| `vendor/` | three.js + its STL loader, pinned by hash. See `vendor/README.md`. |
| `PLAYTEST-KIT.md` | **How to run a human session**, start to finish, for a facilitator who is not technical. |
| `QUICKSTART.md` | **The one-page "hand this to a person" sheet.** Forward it verbatim. |
| `INDUSTRIA-single-file.html` | The whole game as one double-clickable file. Generated — do not hand-edit. |
| `tools/build-single-file.mjs` | Bakes the seven modules into that one file. |
| `playtest.sh` | One command per job: `run` · `analyse` · `report` · `selftest` · `verify`. |
| `recorder.mjs` | The event log. Off unless the URL carries `?rec=…`, so the public build is unaffected. |
| `analyse_session.py` | Reads a session file and reports what the player actually understood. |
| `debrief-novice.md` / `debrief-machinist.md` | Post-session capture forms. |
| `tools/causal-kernel.html` | **Physics workbench, not a player surface.** Drives `kernel.mjs` directly and shows the arithmetic behind each cut — why a number moved, not just what it is. Not linked from the game. |

### Running a playtest

```bash
./playtest.sh run alice        # start a session, opens the browser
./playtest.sh analyse          # read the session that just happened
./playtest.sh verify           # kernel tests + both acceptance gates
```

Instrumentation is **off by default**, armed only by `?rec=1`. The page at the link
above is the same game with logging off and makes no network requests at all.

## The idea

Most manufacturing games put a number on screen and let you trust it. This one refuses to.

- **Four tabs.** *The Machinist Test* — pick a cut, predict how it dies, commit, then watch the
  arithmetic rule. *Reference Cases* — the kernel's own worked numbers. *The Part* — a real STL
  parsed and measured client-side. *What This Is* — scope and honesty.
- **Nothing is asserted that isn't computed.** The page performs no arithmetic of its own; every
  figure comes from `kernel.mjs`, and `window.__lastRun` exposes both the kernel values and the
  parsed DOM values so a test can assert they agree.
- **Honest shallow.** The kernel is deep where it is deep and says so where it is not: crude
  roughness estimate stays labelled crude, and a mesh with no circular saddle reports **no fit**
  rather than inventing one.
- **The interesting number is why the part is wrong.** The error budget is signed micrometres,
  attributed to tool deflection, tooth-peak swing, tool/holder thermal growth, workpiece thermal
  growth, ballscrew thermal drift and runout — against the 16 µm ISO 286 H6 band at Ø40.

Machine-side error terms read machine constants; workpiece terms read the workpiece's own
coefficient of expansion. A tool does not care what it is cutting, and the model is not allowed
to pretend otherwise.

## Run it locally

No install, no build:

```bash
python3 -m http.server 8799
# then open http://127.0.0.1:8799/
```

It must be served over HTTP (not `file://`) because the page loads `kernel.mjs` as a module.

## Status

Advisory only. **Not for machine execution. Not a production authorization.** The kernel carries
`machine_execution = false` and `production_authorization = false`, and the page shows those
badges, because a simulation that looks authoritative and is subtly wrong is worse than no
simulation at all.

Kernel version: `0.2.0-corrections-applied`.
