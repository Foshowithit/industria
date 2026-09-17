# INDUSTRIA — ROADMAP

**Status: the plan of record for this repository.** Written 2026-09-17. If a
future session (or a different machine) is about to build something here, read
this first. Its main job is to stop work being done twice.

---

## 1. THE VISION, IN ONE PARAGRAPH

Most manufacturing games put a number on screen and let you trust it. **This one
refuses to.** You are a new hire on a shop floor at half past five in the
morning; the machine is already running and nobody is waiting for you. You are
given a drawing, a tolerance measured in micrometres, and a part that will be
loaded onto a van whether or not it is right. The machine tells you what it
thinks it did. The gauge tells you what it thinks it read. **The part is the
only thing that knows the truth, and it leaves with the van before you find
out.** Every system in this game exists to make that one sentence land: *the
interesting number is why the part is wrong.*

Everything below is downstream of that. If a proposed feature does not make the
player care more about why the part is wrong — or make the world around that
question more real — it is not in the plan.

---

## 2. FROZEN — DO NOT REDO

These are correct and were expensive to get right. Do not rewrite them, do not
"clean them up", do not port them to another framework. Extend them only with a
test.

| what | where | why it is frozen |
|---|---|---|
| **The causal kernel** | `kernel.mjs` | Cutting force, power, deflection, stability, and a signed µm error budget with per-term attribution. `kernel.test.mjs` is the spec. Never hard-code a plausible figure in the UI — if the world needs a number the kernel does not expose, extend the kernel and add a test. |
| **The prediction gate** | `index.html` `doCut()` | You cannot take a cut until you have stated what you expect it to remove. The single best design decision in the build. Refused, never defaulted. |
| **Truth ≠ observation** | `part.true_surface` vs `instrument.observe()` | The true bore and the gauge reading are different objects and must never collapse. The truth is shown ONCE, after the part has left your hands (the customer's CMM, in the toast). |
| **The one-directional band** | `game.mjs` `JOBS`, `classifyOffMachine()` | H6 runs up from nominal. Cutting only makes a bore larger, so undersize is recoverable and oversize is scrap. This is the game's core asymmetry; every error term pushes you the wrong way on purpose. |
| **Earl is a witness, not an oracle** | `people.mjs` | He is right that you should measure often and *wrong* that you should measure a hot part, so the kernel can contradict him and the player can catch him. No speeches. No line over two sentences. |
| **Determinism** | seeded RNG, fixed tick, sim isolated from the render loop | The kernel is pure: `(state, control, dt, seed) → (state', deltas, events)`. |
| **Zero-build, one page** | repo layout | Plain ES modules, no bundler, no runtime third-party fetch, three.js vendored and hashed. This is why the page can be pushed straight to Pages and why it opens off a plane. |
| **The single-file bundle** | `tools/build-single-file.mjs` | `INDUSTRIA-single-file.html` is the artefact you hand a human. When you add a module you MUST add it to `MODULES` **and** `APP_IMPORTS` in that script, or the bundle silently ships without it. |
| **The advisory flags** | `machine_execution`, `production_authorization` | A simulation that looks authoritative and is subtly wrong is worse than no simulation. These stay false and stay on screen. |

### The apparatus rule (added 2026-09-17)

This repository once reached **5,982 lines of game against ~11,834 lines of
apparatus** — a 1,015-line session analyser for a playtest that never happened,
464 lines of debrief forms, a 503-line facilitator manual, eight acceptance
probes. Its terminal commit was a field manual asking a human to playtest, and
its self-assessment stopped there.

**The apparatus must never again outgrow the game.** Concretely: no new
measurement, analyser, debrief form, or gate report until there is a new thing
to play. Measure what exists; do not build instruments for a session that has
not been run. And do not grade this repository against a checklist of features
it contains — grade it against what is on the screen, because a checklist passed
once while the build had zero textures in it.

---

## 3. THE LAYERS

Built in dependency order. A layer is not finished because its code exists; it
is finished when it has been *looked at*.

### L0 — THE RUNG (done, the reason this repo exists)
First-person shop you walk into, one machine, one job, Earl, the causal kernel,
the prediction gate, the part lifecycle (crate → table → rack or bin → van).
Walk → clean the vise → find the parallels → measure → dial → predict → cut →
discover the dial lies → inspect → ship or scrap.

### L1 — PRESENTATION (mostly done 2026-09-17)
The world has to look like a place before anything inside it can feel real.

- **Done 2026-09-17:** `materials.mjs` — every surface drawn in-page. Concrete
  with a forklift route, aisle paint worn to the slab, wall grime, lit roof
  deck, machine sheet metal with chip dings, coolant-stained enclosure
  interior, cast-iron T-slot table, scarred bench with the coffee ring §49
  names. Plus `shopEnvironment()` PMREM (metal with no environment reflects
  nothing — that was the real reason the old build looked like a greybox), fog,
  bench-height practicals, portal-frame steel.
- **Done 2026-09-17 (second pass):** the floor dressed and the machines given a
  machine-tool silhouette. A third running machine, the compressor, the radio,
  pallet racking, drums, a wall clock whose hands are meshes driven from
  `clocks.world_min` (the same minute the HUD reads — a printed clock face would
  be a second copy of the time), notices on the walls, a fire point, an exit
  sign. All four VMCs share `vmcDressing()`: feet, chip conveyor, control box,
  nameplate, warning sticker, belt line.
- **Remaining:** the sound pass (§13 — a spindle under load must not sound like
  a spindle idling; the compressor, the radio and the third machine now have
  objects but nobody has listened to them); more swarf and cable runs; the
  office window / any glazing.
- **Rule:** no fps/solver telemetry on the shop surfaces. The HUD is diegetic
  or it is not there.

### L2 — THE SHIFT (done 2026-09-17)
Right now the player learns exactly one thing and is then finished. `JOBS` in
`game.mjs` **already contains two fully-specified jobs** — J1 (Ø40 H6, nothing
the machine does is ever refused) and J2 (Ø80 IT7, a 4 mm roughing cut where
spindle power genuinely binds and the *feed* is the lever). J2 was written with
its physics measured in `tools/envelope-sweep.mjs`; it is not a placeholder.

**L2 is therefore an extension, not a build:**

1. Carry money and record across jobs (`newGame(job, thermal, money)` already
   takes the carried cash — the parameter exists and is unused).
2. A **job board** object in the world: two jobs pinned, read it to see what is
   on offer, take one. Diegetic, no menu.
3. `startJob(jobId)` — one reset path, generalising `GEAR()`.
4. A gate: you take the next job when the current one is settled, not before.
5. A shift ledger the player can read — the DAY's money, not a score.

**Done, verified end to end on the standalone bundle:** bore J1, settle it through
the real verb, walk to the board, read it, take J2, and the machine pushes back —
measured on J2: 4.00 mm at 0.30 mm/rev REFUSED for spindle power (1.08); 3.00 at
0.30 REFUSED for torque (1.01); 4.00 at 0.12 cuts at 0.68. Money crosses days
(ON THE DAY / BANKED), the log clears at the shift boundary, and `startShift()`
is the single door the gate, the board and the `job()` test hook all go through.

**Still open in L2, and it is a decision rather than more code:** one shift is one
job. `BLANK_STOCK` is 3 castings so a shift can produce up to three parts, but a
card shows only the rate, and nothing records a day once it is over.

### L3 — DIEGETIC CONTROLS (done 2026-09-17)
Built. Twelve keys on a printed membrane panel on the machine's own pendant
housing: DIAL −/+, PRED −/+, TOUCH OFF, WARM UP, FEED −/+, ROUGH, CUT, MEASURE,
UNLOAD. Aim at a key, the crosshair names it, press E. The key legend is gone
from the panel. The keyboard shortcuts remain for anyone who knows them.

**Why aiming rather than clicking, recorded once:** the page holds pointer lock,
and while it does a click is consumed by the lock and never reaches a DOM
overlay. An on-screen control surface cannot work here. This was measured, and
it is why the earlier attempt at one did not.

**Still open in L3:** the machine's HTML panel is still a HUD screen rather than
a screen modelled on the machine. That is the next honest step and it is not
urgent — the controls are diegetic now, which was the §48 debt.

### L4 — DEPTH (the ladder §73)
Walk up to a machine and its HMI is what you read; the part in your hand;
the feature, its tolerance and its history; the chip you just made and what it
says about the cut. Second machine. Inspection as its own act with its own
uncertainty.

### NOT IN SCOPE, and let us not pretend otherwise
Companies, RFQs, hiring, cash flow, the regional economy, the
Planet→Chip scale ladder. A full Phase 0–1 economy architecture for exactly
this exists at `~/industria` on the build machine — `packages/sim-core`,
`world-io`, `net-seam`, with soak tests — and it has **never been merged into
this repository**. That work is real and it is the missing half of the vision,
but merging it is a decision, not a task, and this file does not schedule it.

---

## 4. HOW TO WORK HERE

1. **Look at it before you judge it.** The one rule that would have prevented
   this repository's worst week. Run `./playtest.sh run`, or open the page, or
   take a screenshot — before writing a report about quality, look at the
   pixels.
2. **Extend, do not duplicate.** J1's `bore_depth_mm` is read correctly in
   `world.mjs` and was read as `job.depth_mm` in three places in `index.html`,
   so the Traveler told the player the bore was `undefined` deep. A second copy
   of one fact is this project's most reliable defect generator.
3. **A value that does not exist is silent.** `M.iron` was never defined, so
   the machine table fell back to three.js's default white unlit material and
   blew out. Nothing threw. When you add a lookup, assert it exists.
4. **Never write the conclusion down in the game's own copy.** The build once
   told players "the surplus is a constant"; measured, it is 2.1 % of the dial
   at every size. Show the arithmetic and say nothing.
5. **Ship what passes, and say what did not.** `kernel.test.mjs` must stay
   green. If a case is unreachable, report it as unreachable rather than faking
   it — the deliberately self-failing `SCRAP` assertion in
   `disposition.test.mjs` is the model.
