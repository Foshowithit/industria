# INDUSTRIA — LOOP STATE

**This is the brain of the autonomous loop.** A scheduled run starts by reading
this file and following it exactly. It is versioned, so a run can read it from a
fresh clone, and it is the only file that has to be believed about what is done.

Written 2026-09-17. Working copy: `~/.zcode/workspace/default/industria` (a clone
of `Foshowithit/industria`). Pushing to `main` DEPLOYS to
https://foshowithit.github.io/industria/ — that is intended and pre-authorized;
see the ship gate.

---

## 0. THE MISSION, ONE LINE

A game whose whole mechanic is *"an authority gave you a number; the part knows
the truth; go and measure"* — starting at one machine in one shop, ascending the
whole ladder of manufacturing, with a manufacturing system occupying the seat
that tells you what it would do.

Read `VISION.md` (what the thing IS and why the ladder does not collapse) and
`ROADMAP.md` (the plan of record, the frozen list, the defect classes) before
writing anything. Neither is optional; both are short.

---

## 1. HOW A RUN STARTS

```sh
cd ~/.zcode/workspace/default/industria
git pull --ff-only          # main is the source of truth
node kernel.test.mjs        # 68 expected
node system.test.mjs        # 67 expected
node shop.test.mjs          # 62 expected
```

If a suite is red at the START of a run, that is the run's work: fix it before
starting anything new, or if it cannot be fixed, leave the tree clean and say so.

---

## 2. THE PLAN

**ONE TURN IS NOT ONE ITEM.** Adam, twice: *"dont stop"*, and then *"plan way more
cus ur stopping too fast."* The lesson is about ambition per turn, not about the
loop: pick the next item, but keep going through the list while the work is still
verifiable, and only end the turn when something needs a decision or the run is
out of room. A run that ships three items and reports them honestly beats three
runs that each ship one.

**Sizes.** S = one sitting. M = a few hours. L = a session of its own. Anything
marked **GATED** needs a decision that is not the loop's to make.

---

### A. THE MACHINE RUNG, FINISHED

- ~~**A1 · SOUND**~~ ✅ 2026-09-17. Probe 13/13 at `tools/audio-probe.html`.
- **A2 · THE RADIO** (S). Deliberately still silent because it needs music and
  music is content. **THE HONEST WAY OUT, decided here so it is not re-litigated:
  the radio is TUNED BETWEEN STATIONS.** At half five in the morning a shop radio
  is hiss, a heterodyne whistle, slow fading and the occasional burst of something
  you cannot make out. That is a *texture*, it is fully synthesizable, it promises
  no content it does not have, and it is more honest than inventing music and
  calling it somebody's station. Band-limited noise + one drifting heterodyne +
  slow amplitude fade, from a fixed position, quiet.
- **A3 · THE DRAWING** (L). **The single biggest credibility gap left.** The
  brief's §101 makes the drawing the centre of the trade and §17 makes it a
  teaching law ("a part is rejected, someone says you controlled the diameter but
  not where the hole is, and *then* the drawing opens"). Today `DRAWING` is a
  `say()` with one line of text. It has to become a real sheet: a view of the
  housing, the bore, dimensions with real tolerances off the job spec, a datum
  flag, and a title block with part number, material, rev, scale and client.
  **ARCHITECTURE, so it is testable: `drawingFor(job)` in `game.mjs` returns the
  drawing AS DATA** (views, dimensions, tolerances, title block) and
  `materials.mjs` renders that data to a canvas. The data is what a test asserts
  against the job spec — a drawing whose tolerance text disagrees with the band
  the part is judged against is the worst possible defect in this build.
- **A4 · THE PART IN YOUR HAND** (M). §73's `Part` rung: "the housing in your
  hand, rotatable, with the bore visible". Today the part exists only inside the
  machine. It needs to be liftable off the parallels and lookable — the bore at
  the size the kernel says, the surface the last pass left.
- **A5 · THE TOOL RUNG** (S). §73's `Tool`. The bar is loadable and readable; what
  is missing is that a bar is an object with a life — see B3.
- **A6 · DAYLIGHT AND LIFE IN THE BUILDING** (S). `daylight()` drives the lamps
  and there is a wall clock, but nothing else in the shop moves on its own. The
  machines cycle (`machineMotion`), chips should accumulate, the coolant puddle
  should grow. Verify what already exists before adding anything: a model that is
  correct and never called is this build's most frequent defect (ROADMAP §3b).

### B. THE MACHINE AS A THING THAT WEARS

- **B1 · CALIBRATION** (M). Wear is in (B1 landed: condition → TIR). Calibration
  is a *different* failure: the datum itself drifts, so the machine is
  repeatable and wrong. That is the one that produces parts that all measure the
  same and are all outside the band.
- **B2 · TOOL LIFE** (M). An insert that wears mid-job, so the same dial stops
  taking the same cut. This is the honest way for a long run to go wrong without
  the machine being at fault, and it is what makes A5's tool rung matter.
- **B3 · DOWNTIME** (S). A machine that stops and eats the deadline. Ported
  hazard shape from the second build's `machines.ts`: failures per 100k hours
  rising as condition falls.
- **B4 · THE DAY LEDGER** (S). The shop's own record, readable — what went out,
  what it was worth, what came back. `describeShop()` and `shop.shipper` exist and
  only the board shows them.

### C. THE SYSTEM'S SEAT, EXTENDED

- ~~**C1 · the seat**~~ ✅ forecast by running the machine's own physics, with the
  survey as its single assumption.
- ~~**C2 · visibly wrong**~~ ✅ settled in the open, 36% of the band at full wear.
- **C3 · THE SYSTEM AT THE NEXT RUNG** (M). VISION §3: the system advises at
  every rung. At the shop rung that means it should have an opinion about *which
  job to take* and *what to quote* — and it should be wrong in a way that is
  checkable, the same way. It must never hold the answer.
- **C4 · THE ADAPTER, WRITTEN DOWN** (S). A documented seam at `forecastPass` so
  a real model can be wired in: returns a number AND its assumptions, is never
  told the outcome, the shop keeps the record. The three conditions are already in
  the code comment; they need to be an interface rather than a paragraph.

### D. THE PROCESS RUNG (`L4`) — **GATED**

Routes, datums, first-article inspection, rework. **Do not start.** ROADMAP §5:
rungs 1–3 are one game, rung 4 is a second game with the same machine at the
bottom, and it should not begin until somebody who is not us has played the
first. Plan it, do not build it.

### E. THE LADDER ABOVE (supplier, standard, the wider economy) — **GATED**

Designed in `VISION.md` §1. Not from this loop.

---

### WHAT A TURN SHOULD LOOK LIKE

1. `git pull --ff-only`; run the suites.
2. Take the first unfinished item above. Then take the NEXT one if the first is
   verified and there is room. **Do not stop at one.**
3. Verify by looking at anything visible; measure anything audible; assert
   anything numeric.
4. Ship gate. Then update §2 and the §7 log.
5. Report everything in the run together, plainly.

## 3. THE RULES — NON-NEGOTIABLE

**THE FROZEN LIST.** ROADMAP §2. The kernel, the prediction gate,
truth≠observation, the one-directional band, Earl as a witness, the zero-build
one-page constraint, the single-file bundle's `MODULES` + `APP_IMPORTS`, and the
advisory flags. Extend these; never rewrite them. A kernel change is allowed ONLY
with a test that asserts the new behaviour and a note saying what moved.

**VERIFY BY LOOKING.** No test suite in this repository has ever found a bug in
any of the three defect classes (ROADMAP §3b). Every one was found by looking at
a screenshot, a chip, a clock, or an audit of names. **A run that changes what is
on screen must take screenshots and read them before it ships.** A run that
changes only the model must say so and lean on the suites.

**THE SUITES MUST BE GREEN TO SHIP.** `kernel.test.mjs`, `system.test.mjs`,
`shop.test.mjs`, `disposition.test.mjs` (70 passed / 1 deliberate failure — the
self-failing SCRAP assertion is the model, leave it). A new module's semantics
get a test in the file that owns them.

**NO NUMBER ON SCREEN THAT CANNOT BE DEFENDED.** The chip's temperature was
removed for exactly this reason and must not come back until the model can
support it. If you cannot state the physics or name it as calibrated with its
orderings tested, do not print it.

**ONE DERIVATION PER FACT.** If a second is genuinely needed, assert the two
agree. Two independent derivations of "am I late" shipped once and the badge
disagreed with the money on every job.

**THE APPARATUS RULE.** This repo once reached 5,982 lines of game against
~11,834 of apparatus. Do not add a measurement, analyser, debrief form or gate
report unless there is a new thing to play. Measure what exists.

**PLAIN WORDS IN THE REPORT.** No arrow chains, no invented labels, no jargon
the reader has to decode. Lead with what changed and why it is better.

---

## 4. THE SHIP GATE

Push to `main` only when ALL of these hold:

1. Every suite above is green, with the counts in the commit message.
2. `node tools/build-single-file.mjs` exits 0 and reports 9 modules — it refuses
   to emit if an import is missing from `MODULES` or `APP_IMPORTS`, so a
   non-zero exit means a module was added and not declared.
3. Anything visible has been SEEN: screenshots taken and read this run.
4. The commit message says what was wrong before, in the same register as the
   existing history — the repo's commits are its engineering log and they are
   the reason a future run can trust it.
5. After pushing, wait ~40 s and verify the LIVE bytes match the repo:
   `curl -s https://foshowithit.github.io/industria/<file> | shasum -a 256`
   against the local file. "Pages says built" is not evidence.

Then bring the tab up with `agent.browsers` and `markDeliverable`, and report.

---

## 5. HARD-WON TRAPS

- **The browser is occluded and `requestAnimationFrame` stops.** Reads of the
  DOM go stale and a pressed key appears to do nothing. **Take a screenshot
  before and after anything that depends on a frame** — a screenshot forces a
  paint and the loop catches up. This has wasted more time in this project than
  any bug.
- **The game holds pointer lock, so a DOM overlay can never receive a click.**
  Diegetic interaction must be aim-and-press-E. Measured, not assumed.
- **`M.iron`, `job.depth_mm`, `itWidth_um(…,'IT9')`** — three separate bugs, one
  species: a value read from a field that does not exist, which three.js or the
  stringifier silently substitutes. When you add a lookup, assert it exists.
- **The floor level is `y = 0` and the room is 42 × 34 m.** Things placed inside
  `cell` are in cell space; `cell` sits at z = -7. Chips sprayed "at the cut" in
  world coordinates once landed nine metres outside the enclosure.
- **`INDUSTRIA-single-file.html` is generated.** Edit `index.html`, then rebuild.
- **The IAB `goto()` refuses `file:` URLs** — serve the repo over HTTP
  (`python3 -m http.server`) to look at it, the single-file bundle included.
- **The repo has a `vendor/` copy of three.js pinned by SHA-256.** Do not
  upgrade it casually.

---

## 6. STOP CONDITIONS

Stop the run and write the diagnosis into this file rather than shipping:

- A visible change fails visual verification **twice in a row on the same
  problem.**
- A suite is red and the fix is not obvious.
- The next item on the list requires a decision only Adam can make (a product
  direction, a paid lane, anything outward-facing beyond the Pages deploy).
- The work would need one of the frozen items rewritten.

A run that stops and says why is worth more than one that ships a guess.

---

## 7. RUN LOG

Newest first. One or two lines: what was built, what was found, what is next.

- **2026-09-17** — Loop armed, then item 1 and item 2 the same day. Plan expanded
  from four items to a sized, ordered list after Adam asked for more planning and
  bigger turns. **Next: A3 the drawing** (the biggest credibility gap left), then
  A2 the radio, then A4 the part in your hand.
- **2026-09-17** — (earlier) Loop armed. **Item 1 SHIPPED the same day**: the system's
  claim is on the machine panel and settled in the log, measured at 36% of the
  band on a worn machine, and visible on one screen with the worn machine and
  the runout term that explains it. One bug of my own found by running the page
  (`claimBefore` pasted into `doRough` by a positional replace on a non-unique
  anchor). Suites 68 / 67 / 62 / 70+1, bundle 9 modules, live bytes verified.
  **Item 2 (sound) FINISHED the same day.** Every machine voice had been wired
  to a gain of zero since it was written — no machine in this build had ever
  made a sound — and after that: the compressor voiced, the third machine
  un-silenced, and a missing acoustics field that had been taking the whole mix
  down made survivable and COUNTED (`bad_params`, asserted zero by A13). Probe
  **13/13**. THREE of my own bugs, two of them in the verification rather than
  the build: a duplicate `const fail` that made the probe a module-level
  SyntaxError because its syntax was checked once and then edited repeatedly, and
  a check comparing two different frequencies through two different filters.
  **The radio is deliberately still silent: it needs music, which is content.**
  **Next: item 3 — the process rung.** Read ROADMAP §5 before starting it: rungs
  1–3 are one game, rung 4 is a second game with the same machine at the bottom,
  and the roadmap says not to start it until the first has been played by
  somebody who is not us.
