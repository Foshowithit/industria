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
- ~~**F3 · HUD-OVER-3D LEGIBILITY COLLISIONS**~~ ✅ 2026-09-18 (`after-39`;
  `materials.mjs`, `INDUSTRIA-single-file.html`, `acceptance/review-set.py`).
  What was wrong before: one leg was a real page defect and two were capture
  framings. Shot 02's two view titles interleaved into "PSLEACNTION" — the old
  height-derived scale put a 355 px view in a 339 px column, so the title block's
  full-height reserve overlapped the views, hatch ran through the plan circles,
  and the notes ran past the frame. Shots 03 and 09 aimed the camera so the
  pendant's lit display sat behind fixed HUD chrome (the job header in 03, the
  gauge box in 09) — the reviewer named the covered sentence in 03 and read 09
  as a cropped header (FALSE as diagnosed: nothing clipped, two surfaces
  overlapped, but the frame unreadable either way). Built: the sheet rebuilt
  full-width with unequal columns and a width-derived scale (views 355→504
  units, +42%; CROSS_OUT 1.15 overhang, plan arm 1.08R, section cross
  tbTop-clamped, depth dimension at a fixed offset, notes raised); 03 and 09
  re-aimed in the apparatus only, no page change. Sighted reviewer (MODEL, full
  frames) PASSes all three legs on `after-39` (02: "VIEW A - PLAN" /
  "SECTION B - B" separated; 03: header legible, crate visible; 09: gauge box
  clear, EXPECT numbered) plus the five regression frames. Verdicts in
  `after-39/VERDICT-legs.md` and `VERDICT-regression.md`.
- ~~**F4 · SHOT 08 ADDS NOTHING TO SHOT 07**~~ ✅ 2026-09-18 (apparatus:
  `acceptance/review-set.py`). What was wrong before: the capture set spent a
  frame on no new fact — shot 08 carried the same clock, log lines, gauge state
  and talk line as 07 with zero change, the same rule the log lines are now held
  to. Built: shot 08 now states the prediction (`I.predict(200)` in its drive
  list), so its EXPECT row carries "200 µm" plus the "You expect the dial to
  remove 200 µm. Take the cut." banner where 07 reads "not stated". The sighted
  reviewer PASSes the differentiator on `after-39`. Verdict in
  `after-39/VERDICT-legs.md`.
- **F5 · "they trust it" AFTER A 1.1 µm MISS** (S, copy — DONE, shipped this
  wave in `shop.mjs` + bundle; `after-41`). What was wrong before: the shipped
  sentence was "Your reading was 1.1 µm out — they trust it", which a cold
  reader stops on (a miss beside trust). First fix ("well inside the band, so
  they trust it") closed the sentence F5 named, but the cold-viewer re-run this
  wave stopped on the NEW sentence itself: "'out' and 'well inside' cannot both
  be true in the same clause", and it graded a measurement error against the
  part band while a −£647.50 rework charge sat two lines below for that same
  reading. Shipped: "Your reading was 1.1 µm out — the figure you gave them
  held, so they trust it." The trusted thing is named (the number told to the
  customer); the band comparison is gone, so the measurement ruler and the part
  ruler can never meet. Deltas and ladder untouched; suites assert deltas, not
  strings. Sighted reviewer PASSes the log leg verbatim on `after-41/10`.
- **F7 · THE END-STATE SENTENCES DISAGREE WITH EACH OTHER** (S–M — DONE,
  shipped this wave in `game.mjs` + `shop.mjs` + `index.html` + bundle;
  `after-43`/`after-44`). What was wrong before: both cold viewers, unprompted,
  stopped on shot 10's co-occurrence: "UNDERSIZE — can still be cut" beside "The
  customer reworks it and charges you: −£647.50 off the day", and "they trust it"
  beside that same charge. The fiction underneath is coherent (an undersize bore
  still has metal to remove, but the recovery is a re-clamp and re-datum on the
  customer's floor, which is why the fee exists — see `game.mjs:1806-1807` and
  the `doFetchBlank` REWORK-vs-SCRAP asymmetry in `index.html`), but no surface
  said that, so "can still be cut" read as "cuttable here" and trust read as
  incompatible with a fine. Shipped, copy-first across six sites: the toast
  verdict names recoverability + band; toast and Earl name WHO cuts (the
  customer, at their end) and WHAT the charge is for (THEIR rework, priced work,
  −£647.50 off the day); the reveal line puts reading and truth on one
  µm-vs-nominal ruler with the gap as YOUR reading out, never gauge blame; the
  standing log labels money vs standing as two arithmetics; the claim note
  trusts the WORD, not the part; the pickup line names the Ø40 part with the
  failure as deviation. Cold B caught a grammar miss in the new pickup line
  ("bore come out") — fixed, rebuilt, re-suited, recaptured, re-seen
  (`after-44/10`). Sighted reviewer (MODEL, full frames) SHIP: all five legs
  PASS on `after-43`; the white mark on the reveal line is the capture pointer,
  not page content. Residual ruling in the run log: F7 closes at copy level per
  its brief — copy carried it, so nothing touches disposition or economy.
- ~~**F8 · THE FEE LANDS WITH NO RATE ON SCREEN**~~ ✅ 2026-09-18 (`index.html`
  + bundle; `after-45`). F7's residual ruling named it: "£647.50 wants a rate
  card the game never prints." What was wrong before: the rework charge
  −£647.50 landed in a frame with nothing to derive it from — the rate appeared
  only in the board/take verbs, and the header's reason was words-only
  ("paying the going rate"). Shipped, copy-first, three edits: the fee toast
  prints its own parent — "(£1,850.00 job × 35%)" — `r.fee` printed with its
  root `GAME.job.rate`, one derivation never computed twice; the morning toast,
  the last money surface left over from before `money()` existed, dresses its
  rate through the helper like the rest of the shop; and `money()` renders
  en-GB — thousands comma, two pence, sign before symbol — so the shop cannot
  write money two ways. No suite pins any money string (grepped all four suites
  + the driver). Sighted reviewer (MODEL, full frames) SHIP on `after-45`:
  rate-card legible with the arithmetic holding on its face, one money dress
  across six frames, regression frames clean, no collateral vs `after-44/10`
  beyond the intended line; verdict in `after-45/VERDICT.md`.
- ~~**F9 · THE CENSUS SPOKE IN SHORTHAND, AND THE CRATE COUNTED TWO**~~ ✅
  2026-09-18 (`index.html` + bundle; `after-46` NO-SHIP → `after-47` SHIP).
  What was wrong before, two ways: the floor census printed bare values cold
  viewers read two ways each — `crate 3` was "count, or crate number three?",
  `table J1-01` was "the part, or the table's name?", `rack 0 of 4` was "slots
  used, or four still needed?", and bare `bin` was "which bin?"; and at the
  count stance the aim label — bolted to the screen just under the crosshair —
  sheared the third casting's bore, so a first read counted two castings under
  a say-line that said three. Shipped, copy + measured geometry: every census
  value wears its noun (`3 castings`, `holds J1-01`, `0 of 4 slots`,
  `scrap bin empty`) — the counts are the same derivations, only the words
  moved; and the crate row runs as a shallow diagonal down toward the open lip
  (z 0.16 at back-left to 0.28 at front-right), so all three bores sit below
  the label band at the standing stance. THE FIRST CUT FAILED REVIEW: a
  straight row at z 0.20 still let the far casting ride under the band —
  sighted reviewer (MODEL) counted two, verdict `after-46/VERDICT.md` LEG B/C
  FAIL; the diagonal is that verdict's own required shape. Second capture SHIP
  (`after-47/VERDICT.md`, legs A/D/E carried from the first round); cold viewer
  counts 3, agreeing with HUD and caption. F6's number stays GATED: this fix
  touches countability and copy, never "should be 2".
- **F10 · EVERY BORE NUMBER WEARS ITS AXIS** ✅ 2026-09-19 (`index.html`,
  `shop.mjs`, `INDUSTRIA-single-file.html`; `after-52` NO-SHIP → `after-53`
  NO-SHIP → `after-54` SHIP). What was wrong before: the head of the viewers'
  still-open list — dial, bite, stock, stock-to-band, EXPECT, gauge, sneak-up,
  and disposition surfaces mixed radius mm/µm and diameter Ø/mm/µm with nominal
  vs top-of-band references swapping mid-screen and no warning; two independent
  cold viewers stopped on it. Shipped copy-only, 52 lines out and 52 back, no
  derivation touched: every dial/bite/stock/EXPECT surface now names radius,
  every gauge/CMM/claim/disposition surface now names diameter, and the
  touch-off log states the bridge once ("The band is a diameter; the dial moves
  radius, half of it."). Axis mapping verified at the roots first (`world.mjs`
  stock_to_band_um radial by comment, `kernel.mjs` errorBudget radial,
  `game.mjs` h_cmd/h_act radial vs removed_um diametral, `shop.mjs`
  claimed/true diametral). After-52 FAILED on the frame-10 disposition trio
  left bare (own verdict required them labelled); after-53 FAILED on the vault
  ledger what/said lines left bare (plus an awkward doubling the verdict
  named); after-54 SHIP 10/10, tree build-sha `d34fd571…` identical to the
  manifest. Residual P2: "Band is 16 µm" (drawing note, tolerance width tied to
  the Ø40 H6 callout) could read "16 µm on the diameter" in a later pass.
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

- **2026-09-19** — RADIUS-vs-DIAMETER SHIPS: EVERY BORE NUMBER WEARS ITS AXIS
  (`after-54`; `index.html`, `shop.mjs`, `INDUSTRIA-single-file.html`, this
  file). What was wrong before: the dial, the bite, the stock, the EXPECT row,
  the gauge, and the disposition letter mixed radius mm/µm and diameter Ø/mm/µm
  with nominal and top-of-band references swapping mid-screen and no warning —
  two independent cold viewers stopped on it, the repeat signal that makes a
  wording complaint actionable. Shipped copy-only, 52 lines out and 52 back, no
  derivation touched: every dial/bite/stock/EXPECT surface now says radius, every
  gauge/CMM/claim/disposition surface now says diameter, and the touch-off log
  states the bridge once ("The band is a diameter; the dial moves radius, half
  of it."). Axis mapping verified at the roots first (`world.mjs`
  stock_to_band_um is radial by comment, `kernel.mjs` errorBudget radial,
  `game.mjs` h_cmd/h_act radial vs removed_um diametral, `shop.mjs` claimed/true
  diametral). Gates: 76 / 137 / 69 / 70+1 (the SCRAP failure is the model),
  bundle `186a6888b081` · 9 modules, tree build-sha `d34fd571…` identical to the
  `after-54` manifest. Sighted reviewer (MODEL, full frames) SHIP 10/10
  (`after-54/VERDICT.md`); all ten frames self-read this run. Residual P2: "Band
  is 16 µm" (drawing note, tolerance width tied to the Ø40 H6 callout) could read
  "16 µm on the diameter" in a later pass. Next: the still-open list minus its
  head (PRED/EXPECT/DIAL, due-vs-van, Earl never visible, calipers-vs-gauge,
  200 µm ladder). F6 stays GATED.

- **2026-09-18** — AS-CAST REF DROPS SHEET-FOREIGN PARENS (`after-50`;
  `game.mjs`, `INDUSTRIA-single-file.html`, this file). What was wrong before:
  D3 carried reference-dimension parentheses as sheet convention, but the
  printed sheet carries the as-cast size as a dashed circle and never prints
  the dim — the only place the text rendered was the drawing say-line, in
  prose, where a cold reader took "(Ø36)" for a stray paren. Now "Ø36 AS
  CAST", one data line plus the why-comment; no suite pins D3 text, no other
  change. Second candidate J1-01 RETIRED on pixel evidence: the part id
  renders crisp with a short hyphen in the frame-10 crop — a single misread,
  not the two-independent-repeat signal, so the `J1-01` format is untouched.
  Gates: 76 / 137 / 69 / 70+1 with the disposition exit-1 proven identical
  pre/post edit via stash (71 PASS both ways — the documented SCRAP honest
  gap), bundle `10ce99aa43d7` · 9 modules, after-50 recapture, self-read
  frame 02 full-frame plus a crop, sighted reviewer (MODEL, full frames +
  pixel diff vs after-49) VERDICT: SHIP — changed pixels confined to the
  say-line band, no new defects (`after-50/VERDICT.md`). Commit `6072353`;
  live `index.html` sha256 `5cad83af…` (unchanged by design), bundle
  `98bd6a98…`, both match. Remaining: the still-open list and remaining
  legibility candidates. F6 stays GATED.

- **2026-09-18** — GENERIC CHIP BINS GROUNDED (`after-49`; `index.html`,
  `INDUSTRIA-single-file.html`, this file). What was wrong before: the generic
  `bin()` placed its 0.62-tall body at y 0.5, but `box()` CENTRES geometry, so
  every bin except the scrap bin hung about 190 mm above the floor with its
  contact shadow detached on the concrete below it — COLD-B and COLD-C both
  named the green bin behind the casting crate on frame 03 of after-48, the
  two-independent-repeat signal. Fix is the SCRAPBIN grounding numbers
  verbatim (body centre y 0.34 on its 30 mm skirt, lid y 0.67) — no model,
  economy, or copy change. The same viewers' paper-hover claim was measured
  and CLEARED, not "fixed": the TRAVELER plane sits at 0.932 on a 0.930 bench
  top, a 2 mm seat — contrast artifact, no defect. Gates: 76 / 137 / 69 /
  70+1 (the SCRAP failure is the model), bundle 7bd4329fd659 · 9 modules,
  after-49 recapture (ten stills), self-read frame 03 full-frame plus a
  before/after crop and frame 01 crops (green bin and both rust bins on the
  floor, shadows attached), sighted reviewer (MODEL, full frames) VERDICT:
  SHIP, all ten frames, no new defects (`after-49/VERDICT.md`). Commit
  `cf287fd`; live `index.html` sha256 `5cad83af…`, bundle `fa393f62…`, both
  match. Remaining: the viewers' still-open list and the three legibility
  candidates. F6 stays GATED.

- **2026-09-18** — FEE LINE GOES COLD-LEGIBLE (`after-48`; `index.html`,
  `INDUSTRIA-single-file.html`, this file). What was wrong before: the frame-10
  fee toast buried both money figures mid-sentence in 13 px warning orange, and
  two independent cold viewers on different captures both read the parent
  £1,850.00 as £1,050.00 — pixels right both times, a legibility candidate, not
  a defect. Shipped, words/order/size/emphasis only, same derivations (`r.fee`,
  `GAME.job.rate`): the charge stands in ink-white bold on its own clause, the
  parent leads rate-first ("35% of a £1,850.00 job."), toasts 13→15 px. Gates:
  76 / 137 / 69 / 70+1 (the SCRAP failure is the model), bundle 7bd4329fd659 ·
  9 modules (index-only edits leave the module-blob hash unchanged by design).
  Sighted reviewer (MODEL, full frames) SHIP — charge pops, parent unambiguous
  at first look, no collision in any toast frame, F9 census intact, no other
  change (`after-48/VERDICT.md`); cold reader £1,850.00 exact, comma and pence
  resolved (`after-48/COLD.md`). Commit `c745fdb`; live `index.html` sha256
  `bba74504…` matches. PATH NOTE: `after-48` sits workspace-level
  (`industria-visual-pass/after-48/`), unlike repo-internal untracked
  `industria/industria-visual-pass/after-47/` — both untracked, never added.
  Remaining: the J1-01-as-range and "(Ø36) AS CAST" candidates, and the
  viewers' still-open list. F6 stays GATED.

- **2026-09-18** — F9 SHIPS: EVERY VALUE WEARS ITS NOUN, THE CRATE COUNTS AT A
  GLANCE (`after-46` NO-SHIP → `after-47`; `index.html`,
  `INDUSTRIA-single-file.html`, this file). What was wrong before: the floor
  census spoke in shorthand cold viewers misread two ways each (`crate 3` =
  count or crate №, `rack 0 of 4` = used or needed, bare `bin` = which bin),
  and at the count stance the screen-fixed aim label sheared the third
  casting's bore — two countable under a say-line that said three. Shipped:
  census values wear nouns (same derivations, only the words moved), and the
  crate row became a shallow diagonal toward the open lip so all three bores
  clear the label band at the standing stance. The first cut (straight row,
  z 0.20) FAILED review — the far casting still rode under the band
  (`after-46/VERDICT.md`); the diagonal is that verdict's required shape and
  the second capture SHIPs (`after-47/VERDICT.md`, legs A/D/E carried). Gates:
  76 / 137 / 69 / 70+1 (the SCRAP failure is the model), bundle 7bd4329fd659 ·
  9 modules; cold viewer counts 3/3, HUD and caption agree. Repeat signal:
  a SECOND independent cold reader misread frame 10's fee line £1,850.00 as
  £1,050.00 — pixels verified right both times, but two-for-two on the same
  13 px orange line is a legibility candidate (size / contrast / word order).
  Also new from this cold round: `J1-01` chip read as a range ("J1–J1"), and
  the drawing's "(Ø36) AS CAST" read as a stray paren — candidates, not
  defects. F6 stays GATED. Next: the viewers' still-open list
  (radius-vs-diameter, PRED/EXPECT/DIAL, due-vs-van, Earl never visible,
  calipers-vs-gauge, 200 µm ladder) or the three legibility candidates above.

- **2026-09-18** — F8 SHIPS: THE FEE WEARS ITS PARENT (`after-45`;
  `index.html`, `INDUSTRIA-single-file.html`, this file). What was wrong
  before: the rework charge −£647.50 landed in a frame with no rate anywhere on
  it to derive it from, and the one money surface older than `money()` still
  wrote £1850.00 — the shop writing money two ways on its own morning screen.
  Shipped, copy-only, three edits: the fee toast prints its parent
  "(£1,850.00 job × 35%)" from the same roots the model reads (`r.fee` beside
  `GAME.job.rate`, one derivation, never computed twice); the morning toast
  dresses its rate through `money()`; and `money()` renders en-GB — thousands
  comma, two pence, sign before symbol — so no surface can write money a second
  way. No suite pins money strings (grepped all four suites + the driver).
  Gates: 76 / 137 / 69 / 70+1 (the one SCRAP failure is the model), bundle
  7bd4329fd659 · 9 modules (index-only edits leave the module-blob hash
  unchanged by design). Sighted reviewer (MODEL, full frames) SHIP — rate-card,
  one-money-dress, regression, and no-collateral legs all PASS
  (`after-45/VERDICT.md`). Cold re-run: FINDINGS on frames 8 + 10, but the
  frame-10 stop — "£1,050.00 job × 35% is broken arithmetic" — MISREADS the
  still at pixel zoom: it prints £1,850.00, and "UNDERIZE" is likewise intact;
  the white capture pointer sits beside the rate-card line and likely drew the
  8→0 (another cold round whose loudest shot-10 stop dissolves under
  measurement). Frame 8's banner-vs-readout note is the 200 µm prediction
  ladder already on the open list. F7's residual list loses its first item;
  crate/rack/bin logging-vs-header and jobs-vs-castings (F6's sibling) remain.
  Next: those two, or the viewers' still-open list (radius-vs-diameter,
  PRED/EXPECT/DIAL, due-vs-van, Earl never visible, calipers-vs-gauge, 200 µm
  ladder); F6 stays GATED.

- **2026-09-18** — F7 SHIPS (`after-43`/`after-44`; `game.mjs`, `shop.mjs`,
  `index.html`, `INDUSTRIA-single-file.html`, this file). What was wrong before:
  the end-state sentences disagreed with each other — "UNDERSIZE — can still be
  cut" beside a −£647.50 customer-rework charge, "they trust it" beside the same
  charge, the reveal line in absolute mm blaming the gauge, the pickup line
  naming the part by its failed size. Shipped copy-first at six sites: toast
  verdict names recoverability + band, toast + Earl name THEIR rework at THEIR
  end, the reveal line unites reading and truth in µm-vs-nominal with the gap
  as YOUR reading out, the log labels money vs standing as two arithmetics, the
  claim note trusts the WORD not the part, the pickup names the Ø40 housing
  with the miss as deviation. Gates: 76 / 137 / 69 / 70+1 (the one SCRAP
  failure is the model), bundle 7bd4329fd659 · 9 modules, `after-43` + `after-44`
  both on disk (Cold B caught "bore come out" → fixed → after-44 re-seen by my
  own eye). The sighted reviewer (MODEL, full frames) SHIP on after-43: five
  legs PASS — verdict recoverability, agent + charge naming, one ruler, two
  arithmetics, Ø40 naming; the white mark on the reveal line is the capture
  pointer, not page content. Cold A + B (after-43, stills-only, on disk) still
  stop on shot 10, but the complaint moved up a level: the arithmetic now
  agrees (B checks 59.7−58.6=1.1, units match) and the residual stops are
  MEANING, not self-contradiction — salvage-tone vs terminal-money, the
  unexplained −£647.50 rate card, ±0.46 vs 1.1, 22.8 °C vs 20 °C, crate/rack/bin
  counts, 4-jobs-vs-3-castings. RESIDUAL RULING: F7 closes at copy level per
  its brief ("copy first, and only if copy cannot carry it does this touch
  disposition or economy") — copy DID carry it, so nothing touches disposition
  or economy. The remaining stops are separate items each: £647.50 wants a rate
  card the game never prints (suitably a new S-item, sizes S–M), crate/rack/bin
  counts are the logging-vs-header discipline already owed from the earlier
  cold round, and jobs-vs-castings is F6's gated sibling. Recorded here so the
  next wave takes them as named follow-ups, not as F7 reopened. Next: mine the
  cold viewers' still-open pre-existing lists (radius-vs-diameter wording,
  PRED/EXPECT/DIAL, due-vs-van, Earl never visible, calipers-vs-gauge, 200 µm
  prediction ladder) or the next F-item; F6 stays GATED.

- **2026-09-18** — F5 SHIPS, AND THE COLD-VIEWER RE-RUN NAMES F7 (`after-41`;
  `shop.mjs`, `INDUSTRIA-single-file.html`, this file). What was wrong before:
  the trust sentence read "they trust it" beside a 1.1 µm miss, and the first
  fix ("well inside the band") graded a measurement error against the part band
  while a −£647.50 rework charge sat two lines below for that same reading —
  both cold viewers stopped on it. The sentence now names the trusted thing
  ("the figure you gave them held, so they trust it"); deltas and ladder
  untouched. Gates: 76 / 137 / 69 / 70+1 (the one SCRAP failure is the model),
  bundle `275f98f0…` · 9 modules, `after-41` manifest differs from `after-40` on
  shot 10 only (fps noise aside). The sighted reviewer (MODEL, full frame)
  PASSes the new log sentence verbatim plus banner and no-regression legs; its
  one FAIL was a wrong-frame expectation (LEG3's gauge strings live on shot 09,
  seen legible there by my own eye). Both cold viewers' still-open lists stand,
  extended by new item F7: the end-state sentences disagree with each other
  ("can still be cut" beside customer-rework charge, trust beside fine) — copy
  first, model/economy only if copy cannot carry it. Next: F7, or the next
  viewers'-list item with room; F6 stays GATED.

- **2026-09-18** — F3 + F4 SHIP (`after-39`; `materials.mjs`,
  `INDUSTRIA-single-file.html`, `acceptance/review-set.py`, this file). What was
  wrong before: the wall drawing squeezed a 355 px sheet into a 339 px column so
  its two view titles interleaved into "PSLEACNTION", two capture cameras aimed
  the pendant's lit display behind fixed HUD chrome (job header in 03, gauge box
  in 09), and the readout shot carried no fact the roughing shot lacked. The
  sheet is rebuilt full-width at a width-derived scale (+42% view area), the two
  cameras re-aimed in the apparatus, and shot 08 now states the prediction
  ("200 µm"). Gates: 76 / 137 / 69 / 70+1 (the one SCRAP failure is the model),
  bundle ca9d04877238 · 9 modules. The sighted reviewer (MODEL, full frames)
  PASSes all four legs plus the five regression frames; verdicts in
  `after-39/VERDICT-legs.md` and `VERDICT-regression.md`. Note for next time:
  all five direct sighted gateway lanes were down at once (cc/cc2 403, merge and
  orca out of credits, openrouter guardrail-blocked, opencode balance
  insufficient) — the in-app vision-eyes lane carried the gate. Next: F5 is
  copy, F6 is GATED, so the next wave needs the cold-viewer pass re-run
  (LOOP-STATE asks for one after any wave that changes what is on screen) or a
  fresh item from the viewers' still-open list.

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
  SHIPPED AND LIVE-VERIFIED: `main` at 77d897c, and
  `curl -s https://foshowithit.github.io/industria/ | shasum -a 256` returns
  `f13336ab…` — byte-identical to the reviewed build, cache-busted and plain
  (323481 bytes both sides). One thing to know for next time: the deploy
  reported success at 05:11:49Z, but the CDN served GitHub Pages' 9115-byte
  "Site not found" page for the WHOLE ACCOUNT — this site, the sibling
  hog-crankers, and the account root — and it cleared at DIFFERENT TIMES by
  route: a foreground fetch read 200 from ~05:19Z while a background poll on
  another path still read 404 until ~05:23Z, so treat the window as up to
  about twelve minutes. That was a Pages
  propagation window and not a defect in this push: the Pages build's commit
  was exactly 77d897c, raw.githubusercontent.com held the shipped bytes
  throughout, a control account's github.io project page answered 200 while
  ours 404'd, and Pages status said built with the deployment success. Both
  sites returned 200 afterwards — foreground and background, with the full
  323481 bytes. Do not mutate repo settings for this; poll and compare bytes.

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
