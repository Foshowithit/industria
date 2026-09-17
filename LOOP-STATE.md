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
node kernel.test.mjs        # 76 expected
node system.test.mjs        # 125 expected
node shop.test.mjs          # 69 expected
node disposition.test.mjs   # 70 passed / 1 deliberate SCRAP failure
```

The counts only ever go UP; a suite that passes with FEWER than the number
written here is a suite that lost cases, and that is the regression to chase.

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
- ~~**A2 · THE RADIO**~~ ✅ 2026-09-17. **Tuned between stations** — hiss, a
  heterodyne whistle, a slow fade — which is a texture and not content. 2.0x the
  room at 7 m. The original note, kept because it is why this took two passes:
  Deliberately still silent because it needs music and
  music is content. **THE HONEST WAY OUT, decided here so it is not re-litigated:
  the radio is TUNED BETWEEN STATIONS.** At half five in the morning a shop radio
  is hiss, a heterodyne whistle, slow fading and the occasional burst of something
  you cannot make out. That is a *texture*, it is fully synthesizable, it promises
  no content it does not have, and it is more honest than inventing music and
  calling it somebody's station. Band-limited noise + one drifting heterodyne +
  slow amplitude fade, from a fixed position, quiet.
- ~~**A3 · THE DRAWING**~~ ✅ 2026-09-17. A real sheet: zone frame, plan view,
  hatched section, stacked tolerance, datum flag, title block, third-angle symbol.
  Data-first (`drawingFor(job)`) with 20 assertions that the sheet agrees with the
  job on every job. **Original note:** The
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
- ~~**A4 · THE PART IN YOUR HAND**~~ ✅ 2026-09-17. Off the rack, parented to the
  camera, turned with the mouse, the bore drawn at the diameter the customer will
  measure. Holding it costs you your hands, which is both the control scheme and
  the consequence. **Original note:** §73's `Part` rung: "the housing in your
  hand, rotatable, with the bore visible". Today the part exists only inside the
  machine. It needs to be liftable off the parallels and lookable — the bore at
  the size the kernel says, the surface the last pass left.
- ~~**A5 · THE TOOL RUNG**~~ ✅ folded into B2 — the bar now has an edge with a life
  and a wear fraction the kernel reads.
- ~~**A6 · DAYLIGHT AND LIFE IN THE BUILDING**~~ ✅ 2026-09-17. The three machines
  that are not yours turn at their own speeds; chips land on the MACHINE TABLE and
  pile where the cut is; the coolant puddle scales with the machine's own cutting
  minutes and survives the morning. **Original note:** `daylight()` drives the lamps
  and there is a wall clock, but nothing else in the shop moves on its own. The
  machines cycle (`machineMotion`), chips should accumulate, the coolant puddle
  should grow. Verify what already exists before adding anything: a model that is
  correct and never called is this build's most frequent defect (ROADMAP §3b).

### B. THE MACHINE AS A THING THAT WEARS

- ~~**B1 · CALIBRATION**~~ ✅ / ~~**B2 · TOOL LIFE**~~ ✅ / ~~**B3 · DOWNTIME**~~ ✅
  2026-09-17. All three built, and they forced an architectural correction: **THE
  MACHINE BELONGS TO THE SHOP, NOT TO THE JOB** — condition, scale and edge life
  now survive the morning instead of resetting to new at 05:55, which is what made
  maintenance mean anything across a career.

    · **B2, tool life:** inserts wear BY TAYLOR — 0.9 minutes of edge at 320 m/min
      against 30 at 120 — so speed is bought with tooling. A worn edge deflects
      more, so the bore comes out SMALL, which is the recoverable direction.
    · **B1, calibration:** the datum drifts, so the machine is repeatable and
      wrong. That is the one that produces parts which all measure the same and
      are all outside the band, and it is the only one of the three the system
      can model, because a scale error is a fact the machine can be told.
    · **B3, downtime:** a WEAR-OUT rather than a hazard — it stops after a number
      of cutting minutes set by its condition when last serviced, which is
      deterministic and predictable from the panel.

  **A NOTE ON THIS FILE ITSELF:** the three lines above used to end with their
  original "still to do" text still underneath the ✅, so B2 and B3 READ AS OPEN
  when they were built. That is the same defect as an unread field, one layer out
  — and in a file whose whole job is telling the next run what is done, it is the
  one that would have caused a rebuild. Compressed into the entry that covers them.

- ~~**B4 · THE DAY LEDGER**~~ ✅ 2026-09-17. Readable off the board, offered first.
  Deliberately not a scoreboard: no rate, no percentage, no trend line.
  **Original note:** The shop's own record, readable — what went out,
  what it was worth, what came back. `describeShop()` and `shop.shipper` exist and
  only the board shows them.

### C. THE SYSTEM'S SEAT, EXTENDED

- ~~**C1 · the seat**~~ ✅ forecast by running the machine's own physics, with the
  survey as its single assumption.
- ~~**C2 · visibly wrong**~~ ✅ settled in the open, 36% of the band at full wear.
- ~~**C3 · THE SYSTEM AT THE NEXT RUNG**~~ ✅ 2026-09-17. `adviseJob` picks the best
  rate on the board and prints the objective it used AND what it did not consider —
  the relationship. It is not wrong about the money and it is not a trap: taken one
  job at a time the advice always pays best today, and a player who follows it for
  a season runs out of clients. That is the failure mode of optimising a stated
  objective, which is what the project exists to teach people to notice.
- ~~**C4 · THE ADAPTER, WRITTEN DOWN**~~ ✅ 2026-09-17. `makeAdvisor()` enforces the
  three conditions rather than describing them, and declining is a legal answer.
  **Original note:** A documented seam at `forecastPass` so
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

### THE FIRST-IMPRESSION PASS, AND WHAT IT IS WORTH — 2026-09-17

The blocker is that no human has played this, and the closest honest substitute is a
COLD VIEWER: an agent given only the stills, in order, with no code and no docs,
asked the brief's beginner questions and told to be unkind. Two of them were run
independently. The set is at `industria-visual-pass/viewer-set/` and the prompt is in
the commit that produced the fixes.

**IT IS NOT A HUMAN AND MUST NEVER BE REPORTED AS ONE.** It cannot speak to sound,
feel, or whether anything moves. What it CAN say is whether the screen communicates,
which is exactly the thing code-reading cannot answer — and it said yes, unprompted,
in both cases: both viewers inferred the whole core loop from seven pictures, and
both named the prediction gate as the most interesting thing on screen.

**THE DEFECTS IT FOUND ARE THE ARGUMENT FOR RUNNING IT AGAIN.** It caught the
framerate counter in the HUD — my own rule, violated for days, invisible to me — and
the pendant's blank screen, which is the object the player is told to use most. Both
are fixed. **Run a cold viewer again after any wave that changes what is on screen**,
and re-capture the set first: a VIEWER SHOWN A MISLABELLED SET REPORTS THE LABEL, not
the product, which happened here when shot four was the wrong file.

**STILL OPEN FROM THAT PASS, recorded rather than lost:** no hand holds the part; no
axis readout on a machine called "3-AXIS"; no contact shadows under anything; the
machine reads as a pile of grey boxes when you stand at it; and *"one honest close-up
of the work itself — the game is about boring a hole and I never see a bored hole"*.

### ONE MORE RULE FOR THE SCREEN — 2026-09-17

**A MACHINE-MOUNTED READOUT MAY NOT RESOLVE FINER THAN THE MACHINE'S OWN SCALE.**
The position display added to the machine this run reads `X` off `edgeR_cold_mm`,
which after a pass is the position the edge ACTUALLY reached. At three decimals
that is a micrometre readout of the achieved bore radius — it would replace the
gauge, and it would beat it, because the gauge carries a calibration error of its
own. It shows two decimals. The finish sequence is played in 2–6 µm nudges and
this display cannot resolve one of them, which is exactly as much as a display
bolted to a machine is entitled to. **The achieved size is MEASURED in this shop.**
Corollary, and the reason this is written down rather than left in a comment:
**the R1 leakwatch watches DOM text, so a number drawn on a canvas is invisible to
it.** Anything the build draws into a texture is on its own honour.

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
- **The entry gate ignores synthetic clicks from the IAB** — both a `cua` click
  and a Playwright locator click time out or do nothing on `#gate`. Drive it
  with `document.getElementById('gate').click()` inside `evaluate`, then take a
  screenshot to force a paint; if the game getter is still null, the exposed
  `job()` hook runs the same `startShift` the click does. The `eye` hook is a
  plain `Vector3`, so `eye.set(x,y,z)` + `look(yaw,pitch)` teleports for close
  inspection — a verification privilege, not a player path.
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

- **2026-09-17** — THE WORKING END AND THE SCREEN THAT FIT (loop run). Three
  defects a cold viewer could see and no test could: **the machine panel grew
  upward off a bottom anchor until it printed through the status block** (now a
  two-panel column hung from the top-right free space, the error budget its own
  left-hand column under the job header, and below 680 px of window height the
  thermal context row drops ON PURPOSE instead of the total clipping silently);
  **the "tool" was a stack of cones hanging 580 mm above the part** — a
  lampshade, not a boring bar (now the real chain: quill, nose, 40-taper
  holder, boring head, radial slide, and a bar whose offset IS
  `edgeR_cold_mm`, so the cutting edge sits on the radius being cut and moves
  outward as you dial); and **the coolant nozzle was a brass rod attached to
  nothing** (now a traced line — riser, run, drop, elbow, nozzle — with the
  nozzle and the spray both placed from the same two points, so the spray
  cannot point where the pipe does not). The work and its fixture were also
  100 mm off the cut axis; both now sit under the tool. Verified by looking,
  this run: bar loads, the pass cuts (stock 18.00 → 19.97, dial at 19.957),
  the repeat-refusal charges its minute, measure refuses without the
  calipers — and a chip census off the live scene put **10/10 chips at exactly
  the tabletop plane**, none buried, none behind the part. Chips still read as
  dark specks at player distance, though — sizing/colour is the next visual
  debt. Suites green (76/125/69/70+1), bundle 9 modules. **Still open from
  before: a cold viewer on the `after-3` stills — still not done by anyone.**
- **2026-09-17** — THE PRESENTATION WAVE (loop run). Every item the cold viewers
  named, closed, and two defects found by looking that no test could see:
  **the casting was buried inside a vise body** (a Ø124 part at the same place as
  a 0.70 × 0.26 × 0.46 box — the bore the game exists to produce had never been
  drawn), and **`PART.mesh.visible` was set by nothing**, so the part stayed on
  the machine table after it had been racked and while it was in your hand.
  Also: contact shadows across the machine cell and the shop floor; the cavity
  repainted to a light machine-white over a black chip pan with black way covers;
  the T-slot table built as four lands with three real grooves (the lands stood
  55 mm proud of the top face and read as a stepped cake); a brass X ballscrew
  and servo where the vise's lead screw used to be; an e-stop; a position display
  on the wall reading X, Z and the spindle's state; and a dark work glove under
  the part in the held view. Suites green (76/125/69/70+1), bundle 9 modules.
  Still open: **run a cold viewer again on the new stills** — they are in
  `industria-visual-pass/after-3/` and have not been seen by anyone but me.
- **2026-09-17** — A6 finished, then a FIRST-IMPRESSION PASS (loop run). Two cold
  viewers, given only the stills: both inferred the core loop unprompted, both named
  the prediction gate, one verified the H6 band. Both named the same two defects —
  **the framerate counter in the HUD** and **the pendant's blank screen** — and both
  are fixed (the second fix was wrong first: a flat emissive renders white). A
  mislabelled shot in my own viewer set was reported as the product, which is the
  same defect as a check that cannot fail. **Next: the five things that pass listed
  as still-open, starting with the hand and the axis readout.**
- **2026-09-17** — (earlier) A6 finished (loop run). The chips were ALREADY falling, landing and
  piling up **inside the table** — a fixed landing height 15 cm below the surface the
  cut happens above, so 176 chips were in the scene and none were visible. Landings
  now depend on where the chip is, and the puddle records the machine's cutting
  minutes instead of being a boolean. Found by LOOKING first, as the plan required.
  **The plan now has no ungated items left.**
- **2026-09-17** — (earlier) B1/B2/B3 (the wear package, and the machine became the shop's),
  A4 (the part in your hand), B4 (the day book), C4 (the advisor seam) and A6 partly,
  all in one turn. Three defects found by looking, including a game with NO error
  surface — a thrown handler was completely silent. **Next: C3, the system at the
  shop rung** — and then the only items left are the gated ones.
- **2026-09-17** — (earlier) A3 (the drawing) and A2 (the radio) shipped in one turn after
  Adam asked for bigger turns, and the plan was expanded to eleven sized items.
  The audio probe was found to have a tally that under-reported its own failures —
  it printed "11 passed, 0 failed, 17 total — ALL PASS" — now counted adjacent to
  the report and asserted self-consistent. **Next: A4, the part in your hand.**
- **2026-09-17** — (earlier) Loop armed, then item 1 and item 2 the same day. Plan expanded
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
