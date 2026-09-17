# INDUSTRIA — BUILD INTENT (for the workflow-manager seat)

**Status: this supersedes the "Shop Floor" v0.2.0 deliverable as a statement of the product.**
v0.2.0 is a correct *component*, wrongly shipped as the whole thing.

Source of truth for the vision: the user's original 111-section brief, recovered from the session
archive to `/tmp/BRIEF.md` (47,354 chars, 3,048 lines). **Read §1, §2, §5, §48–53, §73, §104–108
before writing code.** Do not re-derive the vision from this file alone.

---

## 1. What went wrong (so it is not repeated)

Shipped: a page of readouts — bore gauge, dial position, thermal bars, a shift log. The physics were
right to the microprecision and the thing was unplayable as a *game*.

The brief names this failure mode explicitly. **§108 ABSOLUTE ANTI-GOALS** lists:

> * a spreadsheet game with 3D graphics
> * a machine-control emulator with no living world

Both were true. The user's words: *"wtf thats not a game tho"* and then *"u didnt follow the original
prompt of making a full game what tf is this garbage."* Both correct.

**Root cause:** §104 was read as flavour text. It is the specification for the opening.

```
Player applies for job. Interview. Arrives at 5:55 AM. Walks through factory.
Machines roar. Supervisor gives safety glasses. Veteran operator introduces himself.
First task: "Clean that vise and bring me the parallels."
Player doesn't know what parallels are. They find them.
Later: "Measure this." They use calipers incorrectly. Mentor corrects them.
Machine finishes. Door opens. Hot chips and coolant.
Player removes their first finished part. They inspect it. It passes.
Nothing gigantic happened. But the player feels: I just made something real.
```

None of that exists. There is no floor, no body, no people, no verbs, no time of day.

## 2. The correction that makes the existing work pay off

**Do not throw the kernel away, and do not throw the Shop Floor UI away.** §73 is the answer:

```
Planet → Country → Region → Industrial park → Factory → Production line
      → Cell → Machine → Fixture → Part → Feature → Tool → Chip
```

> "This is the visual and conceptual signature of the entire platform."

The existing page is the **`Machine` and `Feature` rungs** — the control panel you read when your
nose is 400 mm from the bore. It should survive *as that*, and become something you **walk up to**
rather than the first thing you see.

So the build is: **add the world above it, then make the ladder traversable.**

## 3. What to build, in order

### R1 — THE SHOP FLOOR (the rung that does not exist)

An explorable facility. Non-negotiable properties, all from the brief:

* **Top-down / semi-isometric 3D**, three.js (already vendored at `vendor/three/`; `STLLoader` and
  `three.module.min.js` are present and the module already loads a base plate, cap and housing STL).
* **You are a body on a floor.** WASD movement, mouse look or click-to-move, a walk speed that makes
  40 m feel like 40 m. §50: *"Objects should have convincing weight."*
* **It is already running when you arrive.** §1/§5: *"Nobody is waiting for the protagonist. The
  factory exists without them."* Machines cutting, a spindle turning, coolant flowing, chips on the
  floor, **something beeping that nobody is fixing**, a forklift route. An ambience layer that does
  not depend on the player.
* **Diegetic interaction, not menus.** §48: work orders, travelers, machine controls, labels, a
  whiteboard, a clipboard, a phone that rings. Walk to a thing and look at it to read it. **No
  glowing quest arrows, no objective banner by default.**
* **Time of day and a clock, and the shift goes on whether you act or not.**
* **Inhabited, not showroom.** §49: worn paint, coolant residue, floor stains, chips in the sump,
  grease, a dented panel, cable runs, pallets, bins, a rag on the bench, a coffee cup. Deliberately
  *not* the clean-futuristic-factory look.
* **Sound as a system, not a bed.** §13: the first rung of this is honest — a spindle under load
  sounds different from a spindle idling, a cut sounds different from a rub, and the player can hear
  a cut they cannot see. Procedural via WebAudio is acceptable; generic metallic grinding is not.

### R2 — PEOPLE AND THE FIRST HOUR (§104, §2)

* **Earl**, a veteran operator, who gives you the first task. Characters do not wait for you; they
  have their own lines and they get impatient if you wander off.
* **The opening sequence, verbatim in spirit:** apply → arrive 5:55 → safety glasses → *"clean that
  vise and bring me the parallels"* → **you do not know what parallels are** → you find them by
  looking and asking → *"measure this"* → **you use the calipers wrong and Earl corrects you** →
  the machine finishes → **the door opens and hot chips and coolant come out** → you inspect your
  first part → it passes → *"I just made something real."*
* **§2 is the law of every teaching beat.** Never a tutorial modal. Teach only by consequence:
  a part is rejected, someone says *"you controlled the diameter, but not where the hole actually
  is"*, and *then* the drawing opens and true position means something. The loop is
  **Problem → Confusion → Investigation → Understanding → Application → Consequence → Intuition.**

### R3 — THE LADDER (§73)

Make zoom real, at least from `Factory` down to `Chip`. Walking up to a machine and reading its
panel is the first rung and is already built. Add at minimum:

* `Factory` — the top-down floor with the whole layout visible.
* `Machine` — walk to it; the existing Shop Floor page becomes *its* HMI.
* `Part` — the housing in your hand, rotatable, with the bore visible.
* `Feature` — the bore, its tolerance, its GD&T callout, its history.
* `Chip` — the chip you just made, and what it tells you about the cut.

### R4 — CARRY THE KERNEL THROUGH, DO NOT DUPLICATE IT

`kernel.mjs` and `game.mjs` are the physics authority and are **not to be rewritten**. Every number
the world shows must come from them. If the world needs a value the kernel does not expose, extend
the kernel and add a test to `kernel.test.mjs` — never hard-code a plausible figure in the UI.

**Preserve exactly:**
* R1 truth≠observation: `part.true_surface.deviation` and `instrument.observe(part).reading` are
  different objects and must never collapse into one.
* R2 determinism: `(state, control, dt, seed) → (state', deltas, events)`, pure.
* C4 attribution integrity: a tool does not care what it is cutting.
* The `edgeR_cold_mm` cold-frame datum and the one-law thermal model.

## 4. Measured facts to build on (do not re-derive)

* **The over-dial walk, measured** (`node /tmp/walk.mjs`):

  | dial | surplus over 2×dial | % of dial |
  |---|---|---|
  | 1 µm | +4.9 µm | 247% |
  | 5 µm | +4.7 µm | 47% |
  | 20 µm | +3.9 µm | 10% |
  | 80 µm | +0.4 µm | 0% |
  | 150 µm | −3.6 µm | −1% |

  Roughly **constant ~5 µm for small bites, falling above ~40 µm**. A dial is not a dimension.
  This is the single best teaching object in the build: it is counter-intuitive, it is measurable,
  and it punishes exactly the intuition a beginner has.
* **H6 Ø40 is a 16 µm band starting at nominal** — three passes wide. There is nothing underneath it.

## 5. Verification — the two gates from §107, both mandatory

Neither is optional and neither is satisfied by the other.

**GATE A — THE MACHINIST TEST (§83, §107).** Would an experienced machinist, manufacturing engineer,
controls engineer, quality engineer, plant manager, or toolmaker recognise their world in this?
Concretely, for this build: does the machine sound right, does the part behave right, does the
drawing read right, would Earl say that line, is the floor laid out the way a real shop is,
does the coolant tank look like a coolant tank.

**GATE B — THE BEGINNER TEST.** Would someone who knows *absolutely nothing* still find it
addictive? Concretely: **a person who cannot define "bore" must be unable to stop playing within ten
minutes**, without reading a single tutorial box, because the world told them what to do.

**Both must pass. A build that passes A and fails B is the v0.2.0 failure repeating.**

Plus mechanical gates:
* `node kernel.test.mjs` → PASS, and any new kernel exposure carries a new test.
* Playwright, real clicks and real keys on the real DOM, against **the live GitHub Pages URL** —
  not just localhost. 0 console errors. 0 horizontal overflow at 360 / 768 / 1440.
* Frame budget: the floor must hold 60 fps. Measure it, report the number.
  **CORRECTED — this box does NOT have an integrated GPU.** PROBED-NOW: WebGL 2.0 reports
  `ANGLE (NVIDIA Corporation, NVIDIA RTX A3000 Laptop GPU/PCIe/SSE2, OpenGL 4.5.0)`. A prior note in
  this file said otherwise and a message to the builder repeated it; both are wrong. A three.js
  benchmark of 1,200 instanced boxes (14,400 tris, 1 draw call) at 1440×900 measured **57.9 fps,
  worst frame 26.8 ms** — i.e. rAF-locked, capped frames only, so the real headroom is *above* 60.
  Target 60 fps at 1440p as the floor, not the ceiling, and spend the headroom on lighting and
  material quality (§49: worn paint, coolant residue, greasy floors) rather than on polycount.

## 6. Constraints

* **`shop-os-pillow-block-proof` is OFF LIMITS.** Do not commit, push, enable Pages on, or alter it.
  Verified previously at HEAD `f65ce43cf11e0a6efd143053d6153cedabd87095`, clean tree. **Re-verify
  this is still true at the end of the run and report it.**
* **Deliverable shape: one URL.** https://foshowithit.github.io/industria/ — open it and play.
  No clone, no install, no build step. Repo `Foshowithit/industria`, branch `main`, Pages enabled.
* **Zero-build architecture.** Plain ES modules, no bundler, no npm deps at runtime. Vendor anything
  needed into `vendor/`. This is why the current page can be pushed straight to Pages.
* Physics constants marked PLACEHOLDER stay marked until cited. **`THERMAL` time constants are
  invented**; the honest consequence (warm-up currently costs machine time but not correctness) is
  documented and must not be papered over with a fake thermal trap.

## 7. Where the existing pieces are

| path | what it is | disposition |
|---|---|---|
| `kernel.mjs` | physics authority — `boringStep`, `assessBoring`, `MACHINES`, `MATERIALS` | **keep, extend only with tests** |
| `game.mjs` | job/thermal/measure/ship state machine | **keep, it becomes the Machine rung** |
| `index.html` | the Shop Floor readout page | **becomes the machine's HMI, not the front page** |
| `models/*.stl` | base_plate, cap, housing | **reuse for the Part rung** |
| `vendor/three/` | three.js + STLLoader, vendored | **reuse for the world** |
| `kernel.test.mjs` | 48 assertions, all passing | **keep green** |
| `/tmp/BRIEF.md` | the user's full 111-section brief | **the vision source of truth** |
| `/tmp/walk.mjs` | the over-dial walk measurement | keep, cite in-game |
| upstream kernel spec (fleet task record) | kernel spec, §3 still carries uncorrected C1/C2/C3 | amend, and add C5 |
