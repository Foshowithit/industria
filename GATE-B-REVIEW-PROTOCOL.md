# GATE-B REVIEW PROTOCOL — how the planning seat will judge the build

NOT an automated test suite. Gate B is a claim about a *human reaction*, and no assertion can
prove it. This protocol exists so the judgement is **structured, evidence-based, and falsifiable**
rather than a vibe — and so that "I couldn't see how to proceed" is a finding with a screenshot
attached, not an opinion.

Two gates rule everything (§107), and **both target reactions are quotes**:

> The best industrial professionals should play it and repeatedly say:
> **"Wow. They actually understood why we do that."**
> New players should repeatedly say:
> **"Holy shit, I understand this now."**
>
> Those two reactions are the target.

Plus §109's five questions, which apply to **every system**. If any answer is no, that system is
unfinished, no matter how well it is implemented:

1. Is it physically believable?
2. Is it professionally believable?
3. Does the player understand why it matters?
4. Is interacting with it satisfying?
5. **Does mastery unlock a larger level of responsibility?**

Question 5 is the one most easily lost in a first-hour build: the player must be able to *feel the
next rung*, or the world reads as a diorama.

---

## PART 1 — AMBIENT EVIDENCE (screenshot + video, cold cache, no player input)

Load the live URL in a fresh context. **Touch nothing.** Record what the world does anyway.

| check | pass condition | how |
|---|---|---|
| world is alive unobserved | spindles turn, coolant flows, something moves that the player did not cause | 3 screenshots ≥ 5 s apart, compared |
| already-running premise | at arrival, machines are cutting — the facility does not start when the player does | visual |
| something unattended | an alarm/beep/red lamp that nobody is fixing | visual or audio |
| inhabited, not showroom (§49) | worn paint, chips, stains, grease, cable runs, pallets, a rag, a coffee cup. **Clean-futuristic = FAIL** | visual |
| daylight/clock real | `lamp_K` shifts across the shift | sample `daylight()` at 06:00/12:00/18:00 |

## PART 2 — THE BLANK-SLATE RUN (this is the actual Gate B test)

**I am the beginner.** No docs, no README, no source reading, no prior knowledge of this build's
controls. Fresh page load. I attempt to play. I log, in order, every moment I do not know what to do.

- **HOOK** — how long until *something* interesting happens, in seconds, from load to first
  meaningful interaction. Target: under 60 s. A splash screen or menu that must be dismissed
  **counts against** this.
- **KNOWABILITY** — at each juncture: *could I have known what to do from the world alone?* Not
  from a text box. From a sign, a label, a person, a half-finished action, a sound.
- **THE FIRST WALL** — the first point where I am stuck. Record the screenshot **and** what the
  world had failed to tell me. This is the single most valuable measurement in the protocol.
- **TUTORIAL-CRUTCH COUNT** — count every piece of instructional text that tells the player what to
  do rather than the world showing them. §48 permits opt-in assistance. **Default-on instructions
  are the v0.2.0 failure returning in a new costume.**
- **§104 SEQUENCE** — does it actually happen? 5:55 arrival · safety glasses · *"clean that vise and
  bring me the parallels"* · genuine not-knowing what parallels are · finding them · *"measure
  this"* · using calipers wrong · Earl correcting them · the machine finishing · door opening · hot
  chips and coolant · inspecting your first part · it passes.
- **THE PUNCHLINE** — §104's target emotion: *"I just made something real."* Did it land? Answer
  honestly. "Nothing gigantic happened" is correct and expected; the feeling is not optional.
- **TEN MINUTES** — would I keep going? This is Gate B, the whole question, and I answer it first,
  before the mechanical checks, so the mechanical checks cannot bias it up.

## PART 3 — THE §109 FIVE QUESTIONS, answered per system

For each of: the floor · Earl · the calipers · the machine · the sound · the job board. Yes/no plus
the specific evidence. Any "no" is reported as unfinished, not softened.

## PART 4 — MECHANICAL, AND NOT SUBSTITUTES FOR ANYTHING ABOVE

* `node kernel.test.mjs` → PASS (was 48, now 52; any new kernel export must carry a new test).
* Playwright on the **live URL**, real keys and real clicks: WASD actually moves the player, the
  interactions actually fire.
* 0 console errors. 0 horizontal overflow at 360 / 768 / 1440.
* Measured fps, with the number and the method.
* Screenshots viewed. **A screenshot not looked at is not evidence** (D-001).

## PART 5 — HONESTY GATES (the ones that decide whether this round repeats v0.2.0)

* Is anything on screen **asserted rather than derived** from the kernel? Any fabricated number in
  an input-less frontend is a doctrine failure.
* Are PLACEHOLDER constants still labelled PLACEHOLDER, or did confidence get quietly upgraded?
* Does the build claim Gate B in its own report **without** evidence a human played it?
* Did any working thing get broken and hidden? (Rollback baseline: the previous live page is
  captured in this session's notes; the Shop Floor page must remain reachable if it was moved.)

---

## WHERE I EXPECT THIS TO FAIL (recorded in advance, so I cannot rationalise afterwards)

Written before seeing the build, deliberately, so that agreement cannot be confabulated afterwards:

1. **The first wall will be movement or camera**, not manufacturing — the player will be stuck
   orienting a 3D view before they are ever asked to do anything about a part.
2. **How to interact will be unstated** — walk up to a thing and what happens? No affordance.
3. **12× time compression will read as time pressure**, and a beginner under time pressure stops
   exploring, which kills the "world is alive" reading and Gate B together.
4. **Earl will be a quest dispenser** rather than a person with his own work, despite the §40 rule.
5. **Sound will be present but generic** — the §13 failure mode.
6. **The §104 punchline will not land**, because making the first part will be too easy to feel like
   an accomplishment — "nothing gigantic happened" must be *satisfying*, not *empty*.

---

## STANDING RISK REGISTER — carried into the review, each one checked rather than assumed

**1. The "three-hour wall" is gone, and I verified why.** A prior note in this session claimed the
first wall would be camera/movement. That is now unlikely: `advanceClocks()` splits the world clock
from the job clock, and the job clock only accrues once `clocks.job_taken` is true. The invariant is
written into the source (`world.mjs` lines ~325–328) and reads: *the player must never lose the job
for taking a long time to UNDERSTAND something; they may lose it for a DECISION.* Combined with
`MAX_FRAME_S = 0.25` (frames above it count as a resume, not as elapsed shift time), the job cannot
be lost to a tab switch or to a beginner being slow. **What this does NOT solve:** reaching and
operating the machine at all. The control scheme itself is still unverified and remains the most
likely first wall.

**2. PLACEHOLDER constants still carry the same ship risk they did before.** `THERMAL`'s time
constants, the provisional machining coefficients, and the `mc` collapse (below) are all still
unverified against real data. Do not let a good-looking floor upgrade confidence in numbers nobody
has cited.

**3. `mc` still collapses four materials into two behaviours.** The builder was told; confirm the
fix actually landed rather than assuming it did. Check: `al_6061` vs `steel_4140` must no longer
produce an identical chip. If they still do, Gate A takes a hit — a machinist will notice that
aluminium and 4140 throw the same chip.

**4. The §104 punchline rests on three lines of text that read as shop-worn rather than written.**
`people.mjs` currently gets this right — *"Don't be a hero. Take a light pass and sneak up on it."* ·
*"Two thou, measure, two thou, measure. That's how it's done."* · *"Mm."* — and `impatient_3`,
*"It's ten past. Job's due at half."* The risk is that the visual layer's tone does not match this
register, or that Earl's lines get bent into tutorial narration at integration time. Re-check the
**delivered** lines, not the authored ones.

**5. Earl's shop lore is deliberately falsifiable, and the falsification must be reachable.**
Verified as built: `lore_dial_is_dimension` (*"the dial doesn't lie to you, it's the machine that
lies"*), `lore_cold_part` (*"measure it cold"*), `lore_sharp_insert` (*"fresh insert every setup"*) are
each contradicted by the kernel, while `advise_measure_often` is *correct* — which is what keeps him
a witness rather than a fool. Independently confirmed the cold-measure case is real physics, not a
scripted "gotcha": part growth measures **0.492 µm/K at Ø40 alloy steel**, exactly `α·d·1000` for
α = 12.3e-6. **So the risk is not that the lore is wrong — it is that the player has no way to
*discover* it is wrong.** If the world never lets them cut, measure hot, and measure again cold, the
whole §55 design is invisible and Earl reads as simply buggy. Instrument that.

**6. Provisional note on API shape, for whoever integrates.** `loadTool(g, tool)` takes the **tool
object**, not an id string (`loadTool(g, 'bar20')` returns `{ok:false, why:'no such tool'}`), and it
returns `{ok:true, spec}` while keeping the loaded tool on internal state rather than at `g.tool`.
That is fine — it is only recorded here so an integration bug is not misdiagnosed as a kernel fault.
