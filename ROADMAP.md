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

### THE ECONOMY — merged from the second build (2026-09-17)

`shop.mjs`. The business the machine sits in: cash, a standing with each client,
a day book, and a board that is DERIVED from them rather than a fixed list of
work. Ported from `~/industria` `packages/sim-core/src/economy/` — see that
file's header for exactly what came across, what was re-scaled and why.

- **The board is a consequence.** A job is on the wall because a client put it
  there. J3 is gated at 640 standing; a client burned past 520 stops calling and
  the board says so; J4 is always offered to anybody, because a board with
  nothing on it is a stopped game rather than a hard one.
- **The order of the penalties is the design:** scrap costs more than late,
  which costs more than undersize, which costs more than nothing. The worst
  thing a shop can do is not ship a slightly wrong part; it is not ship one.
  `shop.test.mjs` asserts this as an ORDERING so it survives re-scaling.
- **The claim term is not a port.** The shop keeps the running error of its own
  claims, and a claim that matches what the customer measures is worth standing.
  This is the build's thesis — the gap between the gauge and the part — priced.
- **J3 is the thermal job.** Ø40 IT5, eleven micrometres, gated at 640. The part
  grows 0.492 µm/K, so a ten-degree part eats half the band. The gate report said
  warm-up "carries no penalty"; that was true, and this is the job that stops it
  being true.

### THE SYSTEM — the seat a manufacturing model sits in (2026-09-17)

`forecastPass`, `claimPass`, `systemRecord`, `SYSTEM.survey` in `game.mjs`, and a
terminal in the world to ask. **Read `VISION.md` §3 first** — this is the mechanic
that makes the game about supervising a model rather than about the trade.

- **It forecasts by running the machine's own physics.** The state is cloned and
  `cutOnce` is called on the clone. Exact to 0.0000 µm on a machine matching its
  survey. Not a model of the kernel — a model would be uncheckable.
- **Its error has one cause and both numbers are on screen.** The clone gets the
  SURVEYED condition. Measured drift with the survey at 800: 0.0 µm at 800,
  −2.0 at 600, −5.0 at 300 — always optimistic, because a worn machine cuts
  bigger. On J3's 11 µm band that is half the tolerance at full wear.
- **It never holds the answer.** `settleClaims` runs from `cutOnce` only. A claim
  is closed by metal or not at all. One open claim at a time, so asking twice
  changes its mind instead of filing two claims.
- **The record is the shop's**, written as facts about the calls (mean, worst,
  signed) and never as a rating.
- **The machine wears.** `errorBudget()`'s `runout_um` had a default of 5 µm and
  nothing ever passed it; condition opens at 800 (ported from the second build's
  `machines.ts`), falls with machine-minutes, and drives TIR. Maintenance is the
  only thing that reverses it — £340, 45 minutes, refused with the spindle up.
- **The BOOK** is the same idea at the cutting-data end: the recommendation is
  searched for from the kernel, printed with its assumption, and checkable
  against the load meter before the cut.

**Where a real model goes.** Everything above is the seam. To wire in Shop OS or
anything else, three conditions must hold and they are the same three this
implementation follows: it returns a NUMBER AND THE ASSUMPTIONS it was computed
under; it is never told the outcome; and the shop keeps its record, not the
system. Anything that satisfies those can take the seat.

### THE LADDER DOWN TO THE CHIP — done 2026-09-17

The brief calls Planet → … → Part → Feature → Tool → **Chip** "the visual and
conceptual signature of the entire platform". Everything above the chip was
walkable; the chip was ten tetrahedra under the tool and specks on a nine-metre
floor. Now:

- **A chip tray** on the floor at the front of the cell. Looking into it reads
  the last pass. A physical object, for the same reason everything else here is.
- **The Feature rung, which was written and never called.** `describeBore` and
  `perceptionOf` had been in `world.mjs` since they were written and neither was
  referenced — the whole §53 layer ("a hole in a block" → 4140 → an H6 bore with
  so many µm of radius left → a band, lobing and feed-mark pitch) was modelled
  and invisible. It is on the fixture now.
- **What the chip read quotes is exact:** width (the bite, where the surplus
  lives), thickness (feed × thickening ratio), mass (the annulus removed), and
  whether it broke or strung.

#### Three bugs the chip had, and what read it

All player-visible, none of which threw, found by looking at a chip:

1. **Mass 1000× too light** — the volume was a chip *cross-section* × length;
   a boring pass removes an *annulus*. 1.4 mm³ by the old formula against
   1,372 mm³ measured.
2. **Thickness was the bite, not the feed** — so a 4 mm roughing bite produced a
   "4.2 millimetre thick chip". A chip has a width (the dial) and a thickness
   (the feed) and they are different quantities.
3. **The energy charged the retract** — `cut_min` includes 0.4 min of approach
   and reset, so the cutting power was multiplied by time that never touched the
   part, unevenly.

Together these put the chip at 899,719 °C and — because a 1000× light chip
collapses the temperature to the specific cutting energy, which barely varies —
**made every chip in the game land in the same colour band.** The colour, built
as "the lesson carried by the chip itself", carried nothing.

#### AND THE HONEST LIMIT — DO NOT RE-DERIVE THIS

With the bugs fixed the rise is still under 520 K at every feed this machine
offers, and the two effects that should separate cuts (specific energy falling
with feed; a thicker chip retaining more) very nearly cancel — under 15 K apart
across this game's cuts. **The missing variable is cutting speed**, and the game
does not have it: `doCut` and `doRough` both pass a fixed `vc` of 120 m/min.

So the build does not fake it. `CHIP_HEAT.temperature_is_diagnostic` is `false`,
a test asserts it, and nothing player-facing quotes a temperature.

**THE SPINDLE-SPEED OVERRIDE LANDED 2026-09-17, and the colour is live.** The
player sets surface speed (60-320 m/min on the pendant's SPD keys), the machine
works out the rpm for the bore, and the partition of cutting heat that leaves on
the chip is now speed-dependent — so the colour is a readout of a decision the
operator made. Measured in 4140 on a Ø20 bar: 60 and 90 m/min read **straw**,
120 through 240 read **bronze**, 320 reads **blue**. It moves on speed and not on
depth (a 0.30 mm pass reads within ten degrees of a 1.00 mm one), which is
exactly what a machinist reads a chip for.

Still true and still worth knowing: **grey-black is unreachable** — it needs the
temperature at the tool-chip interface rather than the chip's bulk average, and
that is a thermal gradient this build does not model. One unreachable band,
named.

And still true: **insert life is not modelled.** Nothing punishes running at 320
except the power and torque limits the kernel already enforces. Stated in the
README rather than hidden.

### THE KERNEL CORRECTION THAT MADE THE OVERRIDE HONEST — 2026-09-17

An override that sets a speed is worthless if the speed is computed on the wrong
circle, and it was: `boringStep` took the cutting speed from the **bar's**
diameter instead of the **bore's**. On a machining centre the bar is held and the
edge orbits the bore, so `vc = pi·D_bore·n/1000`. Measured on this build's own
numbers — Ø80 bore, Ø20 bar — the kernel saw 80 m/min where the edge travelled
320. Four times, in the direction that makes the machine look more capable than
it is.

What it moved: **rpm** (a Ø80 bore "at 120 m/min" ran at 1910 rpm, honestly 477)
and **torque**, which is `Pc·9550/n` and was therefore reported at a quarter of
its real value on J2. What it did **not** move: the cutting force, because
`F = 60000·Pc/vc` and `Pc` is proportional to `vc`, so the speed cancels
identically — the deflection and error budgets were always right.

`bore_D_mm` defaults to the bar, so every pre-existing caller and every kernel
reference case keeps the behaviour it had; BORE-1 and BORE-8 pin that default.
**And it made a measured claim in the code false:** J2's design comment asserted
"4.0 mm at 0.12 mm/rev cuts at 43 % of spindle power". That table is re-measured
and the old numbers are gone.

**THE LESSON ON J2 CHANGED WITH THE TRUTH.** It used to be "the lever is FEED",
read off a table where power bound first. The wall is TORQUE, and torque at a
fixed cutting speed is proportional to the chip AREA times the bore — so on a big
bore the machine caps the PRODUCT, not either lever, and the answer is more
passes. Four 1.00 mm passes clear J2. Verified across the board: J1 and J3 cut at
every setting, J4 runs to 2.00 mm, J2 caps at 1.00 mm.

### L4 — DEPTH (the ladder §73)
Walk up to a machine and its HMI is what you read; the part in your hand;
the feature, its tolerance and its history; the chip you just made and what it
says about the cut. Second machine. Inspection as its own act with its own
uncertainty.

### NOT IN SCOPE, and let us not pretend otherwise
Companies hiring and firing, the labour market, machine fleet aging, supply and
logistics, the regional economy, the Planet→Chip scale ladder, multiplayer,
verified competency. The Phase 0–1 architecture that models all of this is at
`~/industria` — `packages/sim-core`, `world-io`, `net-seam`, with soak tests —
and what was needed here has been **ported from it, not merged with it**: the
toolchain is deliberately not in this repository, because one page with no
bundler is what makes this build shippable.

The distinction matters for anyone tempted to do the literal merge: the second
build's VALUE is its model and its tests, and both survive the port intact. Its
Vite + TypeScript + npm workspace is the part that cannot cross, and losing it
costs nothing here.

---

## 3b. THE THREE DEFECT CLASSES THIS BUILD ACTUALLY PRODUCES

Every bug found in this repository so far belongs to one of three families. They
are worth naming because all three are invisible to the test suites by
construction, and the only thing that has ever caught one is LOOKING.

**CLASS 1 — A VALUE READ FROM A FIELD THAT DOES NOT EXIST.**
Nothing throws. `job.depth_mm` (the field is `bore_depth_mm`) made the Traveler
say the bore was "undefined" deep and handed `NaN` to a geometry. `M.iron` was
never defined, so the machine table and way covers silently fell back to
three.js's default WHITE UNLIT material. `itWidth_um` could not compute IT9, so
J4's grade came back `undefined` and `newGame` threw three frames later inside a
template literal. Fix: when you add a lookup, assert it exists.

**CLASS 2 — A MODEL THAT IS CORRECT AND NEVER CALLED.**
`describeBore` and `perceptionOf` had been in `world.mjs` since they were
written and NEITHER WAS REFERENCED — the entire §53 layered perception model was
implemented, tested by construction, and invisible. `shiftClock_min` likewise.
The chip's colour was computed from a temperature that put every chip in the
same band, so it carried no information on any cut. Fix: **audit exports against
the page.** The sweep that found these compares every `export` in the build
against its use in `index.html`; it is crude and it has a false-positive mode
(cross-file only — `attenuation` looked dead and is used inside `audio.mjs`),
but it is the only thing that finds this class at all.

**CLASS 3 — TWO DERIVATIONS OF ONE FACT.**
The lateness badge read `clocks.world_min` while the money read `isLate()` on
`clock_min`, and the world clock runs at twice the job clock's rate, so the badge
said LATE at roughly the halfway point of every job. `envelope()` picked the
largest limit fraction while the kernel refuses on fixed precedence, so the
acceptance probe named a wall the machine does not refuse on. The chip read the
bite where it meant the feed. Fix: **one derivation, and if a second is needed,
assert they agree** — `WIRE-*` in shop.test.mjs and the forecast tests in
system.test.mjs are both that shape.

### What this means for how to work here

**No test suite in this repository has ever found a bug in any of these three
classes.** They were all found by looking at the thing — a screenshot, a chip, a
clock, an audit of names. The suites are good at physics and at invariants and
they should stay that way; the answer to this class is not more tests, it is
running the game and reading what it says.

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
