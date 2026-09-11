# INDUSTRIA — live slice

A playable model of the physical economy. This repository is the **first live slice** of
INDUSTRIA: one self-contained page backed by a real causal kernel, with no build step.

**Open the page:** https://foshowithit.github.io/industria/

Nothing is fetched from a third party at runtime — the two three.js files the page needs are
vendored under `vendor/` and pinned by SHA-256. Open it on a plane.

## What is here

| File | What it is |
|---|---|
| `index.html` | The whole app — one page, no bundler, no framework. Reads `kernel.mjs` as an ES module. |
| `kernel.mjs` | The causal kernel: cutting force, power, deflection, stability, and a signed µm error budget. Pure functions. |
| `kernel.test.mjs` | 48 headless regression checks. `node kernel.test.mjs` → exit 0. |
| `models/` | Three real CNC meshes, measured in your browser. No CAD kernel involved. |
| `vendor/` | three.js + its STL loader, pinned by hash. See `vendor/README.md`. |

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
