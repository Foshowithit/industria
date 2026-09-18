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
node system.test.mjs        # 137 expected
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

### F. WHAT THE VIEWERS LEFT OPEN — 2026-09-17

Two cold viewers (the first-impression pass) and one sighted reviewer (ten stills
of one continuous session, `after-24`) agree on the same short list. None of it
is a wrong fact. All of it is a viewer's first sentence about the object the game
is about, which is why it is next. Taken in this order:

- ~~**F1 · THE PART IN HAND READS AS A FLAT WASHER**~~ ✅ 2026-09-17. The held
  part was rebuilt from the numbers the drawing already publishes — OD wall,
  bore, thickness, faces — so it is a housing and not a washer, and the glove
  with it: fingers as cylinders tangent to the OD (they cannot enter the metal
  at any pose), tips stopped at the top rim, a wrist inside the hand's own
  frame instead of floating beside it, glove albedo and held-lamp set by a
  measured five-variant sweep so no glove surface reads as a void. Sighted
  reviewer PASS on all ten stills of `after-26`; shot 10: *"reads as a thick
  metal casting … not a flat washer."* The original note, kept because it is
  why this took two passes: *"large silver disc with center hole, black
  rectangular finger blocks clipping through it"* — the payoff object of the
  session, and what §73's `Part` rung is about. The bore is drawn at the
  diameter the customer will measure, which is right; what was missing was the
  OD, the thickness and the datum face that make it a housing, and the finger
  blocks intersected the metal.
- **F2 · THE CALIPERS READ AS CRUDE BLOCKS** (S–M, DONE — shipped 09-17; the
  pose change is built, the scale and fork PASS, and the hand PASSES its review
  for the first time in four rounds, with one sub-question left unresolved).
  *"Oversized
  crude blocks with an unreadable scale, no jaws / thumbwheel / lock screw
  identifiable"* — the one tool the game tells you to go and get cannot be
  read as itself. Shipped 09-17: rebuilt at its named 150 mm, the bench under
  it, the engraved scale — all PASS review. The recorded next move (a POSE
  change, not more detail: bring the tool up to reading distance, the way a
  machinist actually reads one) is BUILT and sits ON DISK UNCOMMITTED:
  0.24 m from the eye, the face tipped 28° square-ish to it, the pose derived
  from that one position, the jaws rebuilt in the scale's own plane, a
  three-contrast ruling, the slider's zero edge and the 5 mm gap one fact,
  the tool lying flat on the bench. The sighted reviewer on `after-30/05` read
  the numerals back ("10 20 30 40 50") and saw the fork with its gap — the
  scale and silhouette legs of this item are CLOSED, and re-confirmed on
  `after-32/05`, where it read the beam's whole scale back and named the two
  jaws. The HAND fails a FIFTH round, and every round has failed the same
  way. On `after-32/05` the reviewer saw the three fingertip pads and called
  them *"three black round knobs on top edge"* — tool parts — and the forearm
  *"a big matte black cylinder [that] blocks part of the view"*: *"No
  fingers, no thumb, no palm, no arm … No skin shading, no lighting that
  suggests fingers wrapping a tool. They read as abstract geometry /
  placeholder capsules and a dark machine column, not flesh."* The geometry
  is right, and measured so on that frame — each pad straddles the beam's top
  edge line (L 1-2 against 79-111 above and 77-90 below), the thumb comes
  round the lower edge onto the wheel (L 4-51 against 78-90), the forearm
  runs down the frame from under the palm to the bottom edge with a Δ 65
  left silhouette against the lit bench — and the reviewer named every one
  of those shapes as a machine part. Skin is `0x242b33`, which renders L 1-7
  with no internal gradient at all (the pads measure a flat 1-2) — the same
  value as the tool's own dark parts. The hand is the same material as the
  thing it holds, so no amount of anatomy reads. Three builds died on this
  one axis: a lamp-lit grey mass, a white frustum with a black rim, a matte
  black cylinder. Round 5 tried exactly that axis and it was NOT enough: the
  glove's recipe transplanted whole (one SKIN/CUFF/handLamp now serves both
  hands, dropGlove guarded so it cannot dispose the shared materials) and the
  frame measures like the accepted glove — crowns L 58-59, descender bodies
  L 16-26, tip bite L 4 on the L 90 band, wrist rim L 47 over body L 5 — yet
  `after-33/05` still FAILed with the same read: *"short round black
  knobs/balls, not distinct elongated tubes"*, the wrist *"a floating black
  pipe"*, no thumb. The measured cause is SHAPE, not value: the visible
  descender is 45 px long × 46 px wide — aspect 1.0, which reads as a ball
  whatever its shading does; the glove's accepted fingers run aspect ≥ 3,
  and the steep arch that catches the above-plane lamp is what hides most of
  each tube behind the beam's silhouette. Stopped on the two-failures rule
  (two reviewer verdicts in a row, five builds deep). Next: the visible tube
  must run ≥ 2.5× its width — a shallower, more oblique arch with the crown
  further back in z so the tube runs diagonally across the frame, or thinner
  tubes (r ~0.006, crown y ~0.075, tips to mid-band just short of the
  numerals); the thumb needs ≥ 15 mm of visible tube, not a bare cap; the
  wrist needs an internal read — a rim alone reads as a pipe at 120 px wide.
  The round-5 build (arched fingers, ray-checked landmarks, shared materials)
  sits ON DISK UNCOMMITTED as the starting point; full verdict in
  `after-33/VERDICT.md`.
  **CLOSED 09-17 (`after-36`)**: the value axis was the last leg, and its cause
  was geometric rather than a knob to turn up — the eye sits at tool-local
  y −0.212, below the bar's plane, so the grip's old above-plane lamp lit the
  faces the camera never sees. With the lamp moved to the eye's side the tubes
  measure 38.5 → 73.4 mean and 5% → 84% of pixels inside the lit band (one
  identical geometry mask, old-lamp frame vs shipped frame) against the
  accepted glove's L 68, and the sighted reviewer PASSes: elongated tubes not
  knobs, tips biting the band, a forearm not a pipe, numerals legible, nothing
  floating, broken, or too dark to read. One sub-question is left UNRESOLVED
  rather than passed — the reviewer read the left end of the bar as empty where
  the prompt asked for a thumb reaching past the edge; the built thumb presses
  the band at the 30 mm mark and overlaps the scale instead of hanging below
  the silhouette. If a later round re-asks the thumb, that is the question.
  Full verdict in `after-36/VERDICT.md`.
- **F3 · HUD-OVER-3D LEGIBILITY COLLISIONS** (S). Shot 03: the pendant's lit
  display sits behind the job header, and the reviewer named the covered sentence
  rather than the panel covering it. Shot 09: the same display behind the gauge
  box, read as a cropped header — FALSE as diagnosed, nothing is clipped, two
  surfaces overlap, but the frame is unreadable either way. Shot 02: the
  drawing's small labels alias into "PSLEACNTION" — the source text is correct
  (`materials.mjs:1273`, `1314`), so this is texture resolution, not a wrong
  fact.
- **F4 · SHOT 08 ADDS NOTHING TO SHOT 07** (S). *"Effectively a duplicate … the
  same fact printed twice across two frames with zero change."* An apparatus
  problem in the capture set rather than a page defect: a set must not spend a
  frame on no new fact, which is the same rule the log lines are now held to.
- **F5 · "they trust it" AFTER A 1.1 µm MISS** (S, copy). Read in place it means
  the customer trusted a reading that was 1.1 µm out — the sting, not a
  contradiction — but a cold reader stops on it. Copy, so it waits for a wave
  that is not structural (COPY-STRUCTURE SEPARATION).
- **F6 · THE CRATE ECONOMY — *GATED*** (decision). `BLANK_STOCK` is 3 and the
  crate draws `cl(stock_on_hand, 0, 3)` castings, and ROADMAP:122 says a shift
  can produce up to three parts. But the first casting is mounted at shift start
  (`game.mjs:1096`) and mounting that one never decremented stock, so a shift
  that ships it and then fetches three more has produced **four** parts from a
  crate of three. Both readings are defensible — the crate holds three and the
  part in the machine is a fourth the shop owned, or the mounted part is the
  first of the three and the crate should show 2 at 05:55 — and they differ in
  money, in the day ledger, and in what Earl means when he says *"there are three
  in there. Do the arithmetic."* Product decision, not the loop's: recorded, not
  touched.

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

- **2026-09-17** — THE HAND PASSES AND THE LAMP FIX SHIPS (`after-36`;
  `index.html`, `INDUSTRIA-single-file.html`, `acceptance/review-set.py`, this
  file). What was wrong before: round 5 fixed the SHAPE axis and the frame
  still came back dark — the visible tubes averaged L 39.7 with 5% of their
  pixels in the lit 50-90 band, against the accepted glove's L 68. The cause
  was geometric, not a knob to turn up: the eye sits at tool-local y −0.212,
  BELOW the bar's plane, so it looks at the undersides of the tubes, and the
  grip's lamp sat ABOVE that plane at (0, 0.10, 0.40) — it lit the faces the
  camera never sees. The lamp now sits on the eye's side at (0, −0.15, 0.30)
  × 0.60 (position first, intensity second), found by a runtime sweep through
  `window.INDUSTRIA` with the mask taken from the fingers' own projection.
  Measured on artifacts with ONE identical geometry-derived mask (11081 px
  fingers+thumb, 9266 px fingers only), old-lamp frame → this build: mean
  38.5 → 73.4, pixels inside the lit band 6.9% → 83.7% (fingers only 39.7 →
  74.7, 5.3% → 84.2%), median 41 → 75; nothing blown (4.3% above 110). The
  sighted reviewer (MODEL, muse-spark-1.3-contributor-free, full frame)
  PASSes this hand for the first time in four rounds: fingers read as distinct
  elongated tubes rather than knobs, tips bite the band, the mass below reads
  as a forearm rather than a pipe, numerals 10-140 legible, nothing floating
  or broken, nothing too dark to read its form. One item is recorded
  UNRESOLVED rather than passed: item 4 asked for a thumb reaching past the
  bar edge and the reviewer read the left end of the bar as empty — the built
  thumb presses the band at the 30 mm mark, its tip in front of the bar's near
  face, so it overlaps the scale instead of hanging below the silhouette. My
  own read at 1:1 and 4x is a digit at the left of the row; the disagreement
  is over what the digit must do. Full verdict in `after-36/VERDICT.md`.

- **2026-09-17** — THE HAND FAILS A FIFTH ROUND; STOPPED ON THE TWO-FAILURES
  RULE (`after-32` → `after-33`; nothing pushed but this file). What changed
  from round 4: the value axis WORKED — one SKIN/CUFF/handLamp now serves
  both hands (the class-3 fold-in; dropGlove guarded so a rebuilt glove can't
  dispose the shared materials), and the frame measures like the accepted
  glove: crowns L 58-59, descender bodies L 16-26, tip bite L 4 on the L 90
  band, wrist rim L 47 over body L 5, wheel sliver L 29. The geometry was
  ray-checked before any render: tips bite ~10 px into the bright band
  without covering the numerals, pinky bottom clears the HUD at 1150.8,
  the thumb leaves a 13 px steel sliver on the wheel, the wrist runs
  near-vertical through the lit floor, the palm wholly hidden. The reviewer
  still FAILed in round 4's language: *"short round black knobs/balls, not
  distinct elongated tubes"*, the wrist *"a floating black pipe"*, the thumb
  invisible. Measured cause: the visible descender is 45 px long × 46 px
  wide — aspect 1.0 reads as a ball whatever its shading does (the glove's
  accepted fingers run aspect ≥ 3); the steep arch that catches the
  above-plane lamp hides most of each tube behind the beam's silhouette.
  Next: shape, not value — the visible tube needs ≥ 2.5× its width (a
  shallower, more oblique arch with the crown further back in z, or thinner
  tubes r ~0.006 with crown y ~0.075 and tips to mid-band short of the
  numerals); ≥ 15 mm of visible thumb tube; a wrist with an internal read —
  a rim alone reads as a pipe at 120 px wide. The round-5 build sits ON DISK
  UNCOMMITTED as the starting point; full verdict in `after-33/VERDICT.md`.

- **2026-09-17** — THE HAND FAILS A FOURTH ROUND; STOPPED, NOT SHIPPED
  (`after-31` → `after-32`, loop run; nothing pushed but this file). F2's
  third leg, the in-hand presentation. What was wrong before: the held grip's
  forearm ran mostly sideways (screen-right 0.83, down 0.50, away 0.26), so it
  foreshortened to nothing — its near end a 75 px dark blob above the beam's
  left-centre, its far end behind the lower-right HUD panel, both dark-on-dark.
  Built: the arm's axis re-derived from the reading pose's own screen basis
  (right 0.24, down 0.95, away 0.20 — never toward the eye), slim at the eye's
  end (r 0.030) and thickening toward the elbow (r 0.042), started under the
  palm at tool-local (0.045, 0.045, −0.030), 0.36 m long, so it crosses the lit
  bench and leaves by the frame's bottom edge at x≈1112, left of the HUD
  panel; the function's comment rewritten to match it, and the apparatus note
  for shot 05 corrected — it still claimed a lamp travelled with the grip,
  which has not been true since the lamp came out. Verified by looking at
  `after-32/05` at native 1:1: the three pads straddle the beam's top edge
  (L 1-2 against 79-111 above and 77-90 below), the thumb is on the wheel
  (L 4-51 against 78-90), and the arm reads as a column with a Δ 65 left
  silhouette against the bench. The sighted muse reviewer on the full frame
  read the whole scale back off the beam and named the two jaws — the scale
  and fork legs re-confirmed — and killed the hand: *"No fingers, no thumb,
  no palm, no arm"*, the pads *"three black round knobs on top edge"*, the
  forearm *"a big matte black cylinder [that] blocks part of the view"*,
  *"no skin shading … they read as abstract geometry / placeholder capsules
  and a dark machine column, not flesh"*. Diagnosis: four builds have failed
  on one axis — the material and the light. The skin is `0x242b33`, renders
  L 1-7 flat (the pads measure a uniform 1-2, no gradient), and is the same
  value as the tool's own dark parts, so every correct shape gets read as
  tool. Deviations, recorded: the arm's axis and the pads' and thumb's axes
  are hand-authored constants in tool-local space — they rotate with the tool
  and so stay consistent with it, but they were chosen against the current
  reading pose and do not re-derive if the pose moves. Gates: 76 / 137 / 69 /
  70+1 (the one SCRAP failure is the model), bundle fb2070df2633 · 9 modules,
  1394 KB. Capture clean: 10 stills + review-set.json, build ec345a82f5b4,
  clocks 05:55→06:02, gauge Ø39.9414 ±0.46 µm. The failed build does NOT ride
  to `main`: live still carries the round-3 grip, which the reviewer also
  killed — stopping does not make the site worse, it leaves it as it was.
  Next: the value axis — a mid warm albedo under the shop's own lights, no
  private lamp — and the pass condition is the reviewer reading fingers where
  it now reads knobs.
- **2026-09-17** — THE POSE CHANGE BUILT; THE SCALE AND FORK PASS; THE HAND
  FAILS A THIRD ROUND (`after-29` → `after-30`, loop run; NOT SHIPPED —
  stopped on the two-failures rule, nothing pushed but this file). F2's
  second half, the in-hand presentation. What was wrong before: the held pose
  sat 0.51 m out where the engraved scale stripes into ~1.3 px/mm mush, the
  beam pointed its 4 mm fork leg straight at the camera so the lower jaw
  vanished, one grip pad carried the whole fiction of a hand, and the slider
  sat at scale-mm 45 while the jaws gapped 23 — one fact derived twice,
  disagreeing (class 3). What is on disk now, UNCOMMITTED on purpose (a
  failed visual must not ride to `main`): the held pose moved to ~0.24 m
  reading distance with the scale face tipped 28° toward the eye, the whole
  orientation derived at runtime from that one position (one derivation per
  fact); the jaws rebuilt to run in the scale's own plane off the beam's
  width, ground tips forward, so both legs read in silhouette; the engraved
  scale redrawn with a three-contrast ruling (10 mm heavy, 5 mm mid, 1 mm
  hair) at 48 px numerals; slider zero edge, moving-prong face and the 5 mm
  gap made one fact; the tool laid FLAT on the bench at its plate-bottom
  height instead of floating; the lock screw moved to the visible face; grip
  edits (thumbwheel cap out where a thumb sits, pad slimmed). Verified by the
  sighted muse reviewer on `after-30/05`: it READ the numerals back — "10 20
  30 40 50" — and saw "two small rectangular jaws … with a clear gap".
  Those two legs of F2 are CLOSED. The third leg fails again: "a huge
  flat-shaded white frustum/cone with a black rim … no wrist, palm, fingers
  or thumb, no grip contact … It occludes the tool instead of holding it";
  the subtitle's thumbwheel and lock screw are not visible in the held view.
  Diagnosis for the next run: the forearm cylinder's near end is ~0.13 m
  from the eye, so at reading distance it subtends half the frame as a
  featureless cone, and every part that would read as a hand curls over the
  edges from BEHIND the plate, which the plate and the 28° tilt hide. Next:
  make the HAND read — fingertips visibly over the beam's top edge in the
  reader's view, thumb visibly on the wheel below the lower edge, forearm
  pulled back and slimmer toward the eye. Deviations, recorded: lock screw
  z 0.018 not the planned 0.013 (clears the scale strip); bench lie at
  y 0.9045 with a flat quaternion (plate bottom 0.0255 rests on bench top
  0.93); thumb at (−0.031, 0.040, −0.022) not (−0.031, 0.038, −0.018), which
  had bitten 6.5 mm into the plate corner — now a ~2 mm graze. Gates: 76 /
  137 / 69 / 70+1 (the one SCRAP failure is the model), bundle
  fb2070df2633 · 9 modules. Capture flake, honest: three attempts, 9/10
  stills, no review-set.json — opencode at 99.2% CPU and ZCode at 73.3%
  during capture, disk fine at 50 Gi; shot 10 and the manifest are missing,
  the 9 stills including shot 05 are good.
- **2026-09-17** — THE CALIPERS, AT THEIR NAMED SIZE, ON A BENCH THAT EXISTS
  (`after-28` → `after-29`, loop run; ALSO this run: repo hygiene — machine
  paths out of the docs, README hero banner, live-verified by sha256). F2, two
  of its three failures fixed and one stopped on the two-failures rule. What
  was wrong before: the label said 150 mm and the beam was drawn 300 — one
  fact derived twice, disagreeing; the calipers and the traveler stood a metre
  over open concrete on pendant-cell numbers pasted into scene space, the
  bench the words always promised never built; and the held shot floated a
  grey mass in air, forty tick boxes reading as a striped blur with no
  numerals, the wheel and screw dark-on-dark. Shipped: CALIPER_MM is now the
  only place the size exists (beam is it in metres, label prints it); the
  bench is a cell child, the tools are bench children, nothing hangs below;
  the scale is ENGRAVED on a canvas the way the DRO and the drawing already
  are — hairlines, heavier at 5, numerals every 10 mm all off CALIPER_MM, the
  strip full-length because a 150 mm scale needs 150 mm of beam; the
  thumbwheel light on the dark slider, the lock screw ground; and a grip built
  in the calipers' own frame at pickup — knuckles below the beam, fingertips
  curled over the far edge tangent to it, thumb on the wheel, wrist out of
  frame, a lamp travelling with it. Bench, grounding and pendant PASS the
  sighted reviewer (`after-29` 01/04/06). STILL FAILING, twice in a row, the
  held tool as itself: at 0.51 m and ~47° oblique the numerals are ~7 px and
  the ruling stripes out, and the dark glove merges with the dark beam —
  "still a blocky grey mass with striped-blur scale". Stopped per contract
  rather than guess a third time. Next: a POSE change — the tool brought up to
  reading distance, scale face square to the camera — which is how a
  machinist reads one anyway.

- **2026-09-17** — THE PART IN HAND (`after-24` → `after-26`, loop run). F1, the
  reviewers' worst item, said twice by two kinds of viewer: the payoff object
  read as a flat washer held by black rectangular blocks that clipped through
  it. Three fixes in the held-part scene, plus one derivation moved home, and
  none of it a new printed fact. The mesh: the housing is built from the
  numbers the drawing already publishes — OD from the new `HOUSING_OD_MM`
  export in `game.mjs`, bore and thickness per job — so it has a wall you can
  see the far side of, and the same constant replaced four typed copies of the
  OD (two `0.062` literals in the page, the held mesh's `62`, and
  `drawingFor`'s default parameter): one derivation per fact, numerically
  exact. The hand: fingers are cylinders TANGENT to the OD — axis one finger
  radius out, so contact is a line and no pose can put a finger inside the
  metal — running up the visible wall with rounded tips stopping at the rim,
  staggered (9/3/0/5 mm, pinky to index) so four tips at one height cannot read
  as a railing; the wrist and cuff moved into the hand's own frame so they turn
  with the part (the old wrist hung off the glove root and stayed behind: a
  grey pipe floating beside the casting). The light: glove albedo and held-lamp
  intensity chosen by a measured five-variant sweep (0x242b33 / 0.30) — lit
  finger flanks land near 68, under the casting's 101–164, over the floor's 20
  — so no glove surface reads as a hole. Suites 76/137/69/70+1 deliberate;
  single-file build 9 modules; sighted reviewer PASS on all ten stills of
  `after-26`, shot 10 named: *"reads as a thick metal casting … not a flat
  washer."* Next: F2, the calipers.

- **2026-09-17** — THE FRAME'S PRINTED FACTS (`after-12` → `after-24`, loop run).
  The class: **a fact printed on a surface that persists after the thing it
  describes has moved on.** The header is re-derived every frame; the log is
  not. A line stays exactly as written while the shop keeps working, so a count
  in a line is true once and a claim afterwards. A cold viewer read the frame's
  `rack 0 of 4`, a look-line's `Rack: 1 of 4 slots used` from four acts back and
  a pickup line's `The rack is empty` as three versions of one number — two
  stale, none wrong — and reported a shop that cannot count its own parts.
  **The test that settled every site, recorded because it generalises: does the
  line carry a fact that is in the log nowhere else?** The header owns the
  counts. What is on the rack is in the log as EVENTS — every part that reached
  it was put there by a settlement line that names it and says where it went —
  so the rack look-line's count and names were a second derivation printed as a
  state, and the line is gone (the panel still names every part with its
  disposition, which is current at the moment it is read). The crate look prints
  the material and the as-cast bore and nothing numeric; the bin look prints the
  parts' names, and prints nothing at all when the bin is empty, because an
  empty bin is the header's fact and a zero on a persisting surface is a
  non-final zero. Two more in the same pass: the traveler line was typed once
  for J1 (`Ø40 H6, 30 deep`, `Band is 16 µm`) and printed Ø40 beside the say
  line's Ø80 on a Kestrel shift (now `GAME.job` and `W.bandUm`), and the pass
  line printed the dial to 0 µm while the pendant dials in 2–6 µm nudges (now
  1 µm on the dial, and the achieved radius in mm to 2 dp, per the
  machine-mounted-readout rule above).
  **The three settlement lines are records now, not statuses** — the hour of the
  event plus a consequence clause that cannot be read as a claim about the shop
  now. One shape for a bare-word verdict (`ACCEPTED at 05:58.`), one for a
  phrase verdict, which takes a **dateline**: `05:59. UNDERSIZE — can still be
  cut — …`. The evidence is a misread of my own first version, found by
  reading the rendered log rather than the diff: `UNDERSIZE — can still be cut
  at 05:59` reads as a deadline for the cutting — an hour that exists on no
  other surface, in a shop whose one deadline is the van at 10:50 — so the hour
  goes first, the way the log's own clock-on line carries it (`05:55. On the
  floor.`). ACCEPTED keeps `at HH:MM` because a bare word cannot take a deadline
  and its late-note already prints the hour once; prefixing it would print one
  fact twice on one line.
  **Two defects were found by the work rather than by a test.** (a) A capture
  run died with no page and no error: a dropped `)` left the app body
  unparseable. `tools/build-single-file.mjs` now runs the REWRITTEN app body
  through `new Function` and refuses to emit — `REFUSING TO EMIT: index.html
  app body does not parse` — proved to fire by breaking the construct itself
  (removing a trailing `;` does NOT fire it; ASI absorbs it, so that first test
  was invalid and was redone). The raw body is the wrong input for that guard
  (`Cannot use import statement outside a module`); for the raw body the check
  is `node --check <file>.mjs`. (b) A reviewer's WORST-2 from `after-22` — "the
  crate says 3 and the table says J1-01, so the count is stale" — was FALSE, and
  the code says why: the first part is mounted at shift start (`game.mjs:1096`
  `mounted: true`) and `mountBlank` is the only decrementer (`game.mjs:1865`),
  so in a capture session nothing decrements and `crate 3` is live-derived in
  every frame. Re-confirmed against this wave's drive before shipping.
  **The sighted reviewer passed the wave's target on `after-24`** (ten stills of
  one session, build `be59b2f71b64`, the bytes on disk): *"crate stays 3, rack
  stays 0 of 4, bin stays empty across all ten, so stock itself does not
  contradict"*, and its BIGGEST STRENGTH is what the wave was for — *"Numerical
  self-consistency across frames … every repeated equals computes: band 16 µm,
  error sum 5.4 µm, 2008 µm / 38 µm stock-to-band, 0.4 µm
  dial-vs-realised, 58.6 µm gauge-vs-nominal, 1.1 µm gauge-vs-CMM."* Its WORST
  items are all pre-existing and carried into §2 as section F. Suites green
  (76/137/69/70+1), bundle `b4bf73d77712`, 9 modules.

- **2026-09-17** — THE REVIEW ROUNDS (`after-4` → `after-11`, loop runs). Eight
  capture-and-look rounds — the checked-in driver is `acceptance/review-set.py`,
  which serves the working tree over HTTP, refuses if the served bytes are not
  the local bytes, drives the real verbs, and writes the manifest beside the
  stills — fixing only what a viewer could see. The classes that recurred:
  **type that could not be read against what was behind it** (the talk panel's
  backdrop was `.82`, and a viewer read the shop through the printing; the HUD
  and the one line of type that is not in a box had a 3 px drop shadow and were
  re-given an 11 px halo for the pendant's lit screen — note one reviewer's
  "clipped off the screen edge" was FALSE: nothing was clipped, the chip was
  crossed by the screen behind it); **rows that were never laid out as rows**
  (`#thermal .row` was an id against a class, so computed display was `flex`
  while the label's two words ran straight into the value — the label is now a
  wrapper with a gutter, the value takes the remainder right-aligned);
  **a label that was cut, not wrapped** (`max-width:46%` + `nowrap` + ellipsis
  measured as eleven rows sliced mid-word; the fix that stopped the cut then
  overflowed 1280×720, so the width is now a measured type-size decision, and
  11 px and 10 px were measured and rejected for a wall that is read standing
  up); **the oldest log line sliced mid-sentence** (the window is four lines and
  the oldest fades); **numbers that disagreed with each other** — the rack read
  `1/4` four lines above the pickup line's `0 left` (now `N of 4 slots used`),
  the error-budget total was summed from the unfiltered terms while every row
  above it was filtered and rounded for print (the rows are now built once, as
  the exact strings printed, and the total is their sum), and the job-board card
  printed `Ø40` beside `36 mm` for the other diameter of the same part (every
  diameter now wears Ø, every length its unit); **chips that were real and
  still invisible** — a census had already proved 10/10 on the tabletop plane,
  which is why the proof was numeric and the problem survived: at 8–18 mm they
  were the smallest chips in the building and all sixteen sat inside the part's
  own shadow (now 12–24 mm, thrown across ~20 cm); and **two objects that were
  J1's on every shift** — the traveler and the casting crate were typed once as
  constants, so on a Kestrel shift the panel named the same bore Ø80 and Ø40 in
  two consecutive lines (both now read `GAME.job`, and `lookName` resolves an
  entry's name whether it is a string or a function of live state, so the aim
  prompt, the panel and the debug verb cannot resolve one entry to three names).
  Also: `W.bandUm` now owns the printed band width in microns (four inline
  copies of the subtraction were four chances to print four widths), with the
  two arithmetic sites — the claim-error share and the shop record — left
  deliberately unrounded, because a whole micron would change what the machine
  does. Suites green (76/137/69/70+1), bundle `b4bf73d77712`, 9 modules.

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
