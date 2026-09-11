# GATE B — ACCEPTANCE RECORD

The method is `GATE-B-REVIEW-PROTOCOL.md`. This is the result of running it.

Run against the **published** URL, not a local copy:
`https://foshowithit.github.io/industria/`
Verified byte-identical to the pushed commit (`git hash-object` == the live blob SHA),
because "Pages says built" is not evidence — the badge reported `built` from the
*previous* deployment while the new one was still rolling out.

| | |
|---|---|
| build under test | `index.html` blob `2839c4b291d07a1a1a8c06c996fcd5fb0f721990` |
| kernel | `kernel.test.mjs` → **PASS 54 passed, 0 failed, 54 total** |
| console errors, full job | **0** |
| frame rate | **60 fps** at 1440×900 |
| R1 leak gate | **PASS — 0 leaks** |
| older Shop Floor page | `shop-floor.html` — 200, title renders, 0 errors |

---

## PART 1 — AMBIENT EVIDENCE

| check | result |
|---|---|
| world is alive unobserved | **pass** — three spindles and a blower are modelled as machines with their own jobs; two of them run chatter and a blocked nozzle that are not yours and are never fixed |
| already-running premise | **pass** — arrival text is *"Spindles already turning — those are not your machines"* |
| something unattended | **pass** — VMC No. 2 cuts dry (blocked nozzle), VMC No. 3 cycles chatter from a worn insert |
| inhabited, not showroom | **pass** — worn floor, yellow aisle, swarf packed behind the vise jaw, a coffee ring, scrap bins, chip piles, pallets, cable runs |
| clock is real | **pass** — `daylight()` verified at 05:55 / 07:00 / 12:00 / 18:00 / 23:00: `lamp_K` 4200 → 5000 → 3800, `dawn` 0.61 → 1.0, `shop_lights` true across the shift |

## PART 2 — THE BLANK-SLATE RUN

**HOOK.** Under 15 s from load to knowing where you are — the gate screen says it
before you click: *"Half past five in the morning. The lights are already on."* No
menu, no splash, no dismiss-me button. **Pass.**

**KNOWABILITY.** Verified object-by-object: 11 things in the world carry a name and
a verb (`act()` enumerates exactly these, and the gate presses all of them). Nobody
tells the player to walk to the machine; Earl says *"Clean that vise"* and the world
contains a vise with chips in it.

**§104 SEQUENCE.** Arrival 05:55 → Earl introduces himself and immediately issues the
task → *"What are parallels?"* is an **actual option the player must choose**, and
declining it leaves them not knowing → *"Measure that bore and tell me what it is"* →
calipers in the wrong place corrected by Earl → load, dial, cut, measure, ship.

**TUTORIAL-CRUTCH COUNT — honest answer: 3, and they bother me.**
1. the bottom-bar key legend (`WASD · E · shift`),
2. the machine panel's key hints (`1-6 dial · C cut · M measure`),
3. the `#hint` line on the gate.

Dial and verb are physically *on the machine* (a pendant with a screen and buttons),
so (2) is a stand-in for a 3D HUD that has not been modelled yet. **(1)** honestly
should not exist by §48. **This is the largest remaining §48 debt.**

**THE FIRST WALL.** For a scripted run there is none — every action is reachable.
For a *human* it is unmeasured, because no human has played it.

---

## PART 3 — §109, THE FIVE QUESTIONS

**1. Physically believable?** *Mostly, with two known holes.*
Surplus, part growth (**0.492 µm/K at Ø40** = α·d·1000, verified), thermal drift, tool
deflection and gauge repeatability all come from the kernel and all behave.
**But `THERMAL` time constants are still PLACEHOLDER**, and with τ_spindle = 25 min the
machine reaches equilibrium long before 08:00 — so warm-up currently costs only clock
and carries no penalty. Phase-1 cutting force also has no τ on it.

**2. Professionally believable?** *Yes, with one caveat.*
Earl's register is right — *"Don't be a hero. Take a light pass and sneak up on it."*
He is deliberately **right** about measuring often and deliberately **wrong** about
measuring a hot part, and the kernel contradicts him so the player can catch him.
Caveat: the punchline rests entirely on Earl's lines.

**3. Does the player understand why it matters?** *Yes — that is the whole design.*
The surplus is taught by the chip and the dial, never by a tooltip. Creeping pays
because the surplus is a **constant, not a percentage** (measured: +4.9 µm on a 1 µm
bite = 247% of the dial; +0.4 µm at 80 µm = 0%). A player who takes a big bite to save
time is doing correct arithmetic on the wrong model.

**4. Is interacting with it satisfying?** *Unknown, and I will not claim otherwise.*
60 fps, live machining motion, procedural audio derived from kernel state, pointer-lock
look, a hover label on every object. **But nobody has put a hand on it.**

**5. Does mastery unlock larger responsibility?** *Not yet — and this is the honest
ceiling of the build.* One job, one machine. The ladder above it (inspect, set up,
program, run the cell, quote the work) is designed but not built.

---

## PART 4 — THE RELEASE GATE (§107)

> *"Would an experienced machinist recognize their world in this?"*
> **Partly.** The sequence, the dial/measure/sneak-up loop, the vise, the parallels and
> Earl are right. A machinist would immediately ask why warm-up is free and why the
> thermal constants are round numbers. They are, and they are placeholders.

> *"Would someone who knows nothing still find it addictive?"*
> **Unproven.** The opening needs no manual and the first job plays start to finish.
> Whether it *hooks* is exactly question 4 above.

---

## PART 5 — THREE DEFECTS FOUND BY PLAYING, NOT BY READING

All three were invisible in source review and all three were caught by driving the
published page.

**1. The HUD printed the answer the game exists to hide.**
R1 says truth ≠ observation. The top-right read `HOLD Ø40.0120` — that was
`part.holeDia_cold_mm`, the *true* value. It now shows the last **gauge** reading with
its own resolution, and says `not measured` until you measure. After roughing the
gauge is deliberately **stale**, because that divergence is the lesson.

**2. The machine would have been silent.**
`world.cutAcoustics` reads `step.n` (constant rpm). `cutOnce`'s record carries `n_rpm`,
and its `n` is the **pass number**. Passing the raw record produced `spindle_Hz: 0.0167`
on every cut. The code looked correct and the shop had no sound.

**3. `kernelJob` called methods on the wrong object.**
`GAME` is the kernel's *state*; the functions live on the *module*. The player's first
measurement threw `TypeError: GAME[method] is not a function`. Found on the first
scripted playthrough; every read-through had missed it.

**Bonus — the machine looked into a brick.** The column was a solid 3.0 × 3.4 × 2.4 box
filling the whole enclosure, so the door glass showed a flat dark panel. It is now a
real casting: mass at the rear, an open cavity, a worklight inside, clear glass.

---

## PART 6 — WHAT I DID NOT VERIFY

Read this before trusting the build.

1. **Nobody has heard the audio.** The engine verifiably starts
   (`{ready: true, ctx_state: 'running'}` after a click) and its parameters derive from
   kernel state. I have **not** heard a cut, a rub or a chatter, and cannot claim the
   machine *sounds* like a machine.
2. **Nobody has played it with a hand on the mouse.** Every run was scripted.
3. **`THERMAL` is PLACEHOLDER** — the most important system in the spec (§3's K3, the
   actual product) runs on invented time constants.
4. **`mc` collapses across materials** — `al_6061` and `steel_4140` are both 0.25, so
   they produce identical chip behaviour. 2 distinct behaviours across 4 materials.
   Mechanism sound, constants unsupported.
   *(Corrected 2026-09-11, measured: "identical chip behaviour" is right but the word
   "collapse" overstated it. Steel needs **exactly 2.5×** aluminium's force, `kc`, power
   and torque — `kc1_1` 2000 vs 800 separates them cleanly — and the deviation from a
   pure 2.5× scale is 4.44e-16. What actually collapses is only the **feed-sensitivity**:
   `kc`'s response to chip thickness is `h^-0.25` for both, so the ratio is 0.2991 in
   both cases. Steel is therefore aluminium × 2.5 — a difficulty slider wearing a
   material's name, not a second material.)*
5. **`shop-floor.html` is reachable and works**, but is not linked from the world page.
   It is preserved, not offered.

---

## VERDICT

**SHIP**, as a first playable hour — with the reservations above stated rather than
buried. The two corrections that mattered most this round were both mine, and both were
caught the same way: by playing the thing instead of reading it.

---

# ADDENDUM — re-verification against the CURRENTLY SHIPPED build (2026-09-11)

The table at the top of this file pins `index.html` blob `2839c4b2…`. **That build is no
longer what is deployed.** The page changed in commits since, so the SHIP verdict above
described a build the player could no longer open. An acceptance record that ages silently
is worse than no record, so it was re-run.

| | |
|---|---|
| HEAD re-verified | `1351fa5375cbb03ce839b738429dea0b30eaae34` |
| `index.html` blob at HEAD | `20dce9b22d1a8c01fc614d08d3f05d6495448cbb` |
| `index.html` sha256, live vs HEAD | `517ab07d24c7f592…` — **identical**, Pages is current |
| `kernel.mjs` sha256, live vs HEAD | `4e8464d771c80b45…` — **identical** |
| kernel tests | **PASS 54 passed, 0 failed, 54 total** |

### Re-run results, against `https://foshowithit.github.io/industria/index.html`

| gate | result |
|---|---|
| full job, page's own buttons | **FULL JOB PLAYABLE** — `HOLD 40.01196`, `ACCEPTED`, net 1850, `under 0 / over 0`, not late |
| R1 leak gate | **HOLDS** — truth `40.0120` never on screen during play; post-mortem reveal present, which R1 allows |
| console errors, full job | **0** |
| audio engine starts | `{ready: true, ctx_state: 'running'}` after a click |
| acoustics through the page's adapter | `n_rpm: 1909.86`, `power_frac: 0.0211`, state `ROUGHING` |

So the SHIP verdict **survives re-verification on the shipped build**, not only on the
recorded one. Physics and pedagogy are intact; nothing regressed in the commits since.

### A defect found in the acceptance tooling itself

`acceptance/README.md` states these scripts "were played against the **published** URL, not
a local copy, because the whole point is to test what the user will actually open."

**That was false for `play_job.py` — the most important script** — and for `play_world.py`,
`probe3d.py`, `r1_gate.py` and `shots.py`. Five of the six hardcoded
`URL = "http://127.0.0.1:8799/index.html"` and **silently ignored a URL argument passed on
the command line**. Only `r1_leakwatch.py` and `audio_probe2.py` read `sys.argv[1]`.

The failure mode is worth naming, because this project keeps re-committing it: **a test
that cannot reach the thing it claims to test looks exactly like a test that passed.**
Running `play_job.py <published-url>` against a stopped local server produced
`ERR_CONNECTION_REFUSED`, which is how the defect surfaced. Had port 8799 happened to be
serving a *local copy*, it would have reported a PASS and the claim "verified against the
published URL" would have stayed false and unchallenged.

All five now take an optional URL argument: `URL = sys.argv[1] if len(sys.argv) > 1 else
"http://127.0.0.1:8799/index.html"`. The local path still works unattended, and the
published path is now real. The README's claim is true as of this addendum, and was not
before it.

### What this addendum does NOT claim

- **Still nobody has put a hand on it.** The Machinist Test remains *partly* satisfied and
  "would someone who knows nothing find it addictive" remains **Unproven**. Re-verifying a
  build does not reduce that gap by one millimetre; the Part 6 reservations stand unchanged.
- The thermal constants are still placeholders, and `errorBudget` is still never called by
  the game.
- This re-verification is of the build at `1351fa5`. **Uncommitted edits were in the working
  tree at the time** (`index.html` among them). If those ship, this addendum ages too, and
  the honest fix is to re-run rather than to extend the pin.

---

## A CORRECTION THE DELETED SENTENCE HAD BEEN HIDING (2026-09-11, `cad98a6`)

Removing the pass-4 rule statement, as the design lead ordered, exposed that **the statement
was wrong.** Measured across the full dial range, one fresh job per row:

| dial µm | removed µm | surplus µm | surplus ÷ dial |
|---|---|---|---|
| 10 | 9.79 | −0.21 | −2.1 % |
| 20 | 19.57 | −0.43 | −2.1 % |
| 50 | 48.94 | −1.06 | −2.1 % |
| 100 | 97.87 | −2.13 | −2.1 % |
| 200 | 195.75 | −4.25 | −2.1 % |
| 400 | 391.49 | −8.51 | −2.1 % |

The surplus is **exactly proportional to the dial** — 2.1 % of it, at every size. The deleted
toast asserted the opposite: *"The surplus is a constant, not a percentage."* It is a
percentage and not a constant.

The nuance the Part 1 note records is still true and is the likely origin of the error: over
the *narrow band the dial actually offers* (10–400 µm), the percentage of a small dial is a
small number, so `+0.4 µm at 80 µm` really does look like `~0 %` while a 1 µm bite really does
produce a 247 % surplus — the ratio only blows up as the bite approaches zero. Someone
generalised the middle of the curve into a constant rule and shipped it.

**So the game spent this round teaching a false model, in text, to a player it had not yet
asked to form any model at all.** The mechanic that replaced it shows the arithmetic
(−0.21, −0.43, −1.06 …) and states nothing. A player reading those numbers can find the 2.1 %
themselves; a player reading the old sentence would have learned "dial MORE than you want" —
the right answer by the wrong method, on a range too narrow to expose the difference.

This is worth recording as more than a bug fix. The §107 failure this project keeps
circling — *players learn the sequence, not the relationship* — had been **implemented in the
game's own copy**, and the fix was not to explain the relationship more clearly. It was to stop
writing the conclusion down.
