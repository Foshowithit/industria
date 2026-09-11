# Debrief — MACHINIST

An experienced machinist is a different instrument from a novice and needs a
different debrief. They will not get confused by the interface; they will get
**offended by the physics**. That is what we are here to collect.

Ask almost nothing until afterwards. Then ask these. Write their words, not your
summary — a machinist's phrasing carries the precision we need.

    Session label:  ____________________   Date: ____________
    Facilitator:    ____________________   Minutes played: ______
    Background: ____ years, what machines: __________________________

---

## Was this an UNASSISTED run?

Same rule as the novice: if you supplied information the game owed them, the
clean gate **ended** there. Record it honestly — the machinist's verdict on the
physics is still valuable either way, but it is not a clean run.

    Information given?                      YES  /  NO
    Escalation rungs used: 1st ☐  2nd ☐  3rd ☐  BLOCKED-then-helped ☐

---

## The four questions — this order, no substitutions

The opening script for a machinist is **not** the novice script. Before the run:

> "I want you to play this as if someone put you in front of it without
> explaining it. For the first ten minutes, please play rather than review it.
> You can say anything you notice out loud, including things that feel wrong,
> but don't stop to give me a full critique yet. Afterward I'm going to ask you
> specifically what was fake, what was credible, and what you would actually do
> differently."

**Mid-run, do not debate them. Do not explain your model. Do not say "actually
that's intentional because…"** — that contaminates the reaction. Say "Got it.
Keep going." Log each objection as `REALISM — [short description]`.

Then, afterwards, unlimited critique. **Ask these four in this order** — order
matters because question 1 biases question 2, and question 4 only works once
they have finished evaluating.

### 1. "What was the first thing that felt fake?"

Ask it flat, like that. Do not soften it to "was there anything that felt a bit
off?" — that lets them be polite. You want the list.

Get specifics: **what** was fake, **where** in the job, and **what it should
have been**.

| What was fake | Where | What it should have been |
|---|---|---|
| | | |
| | | |
| | | |
| | | |

**→ F5 (fundamental absurdity)** This is the condition the whole machinist
session exists to detect. The bar is **fundamental absurdity in the core work
sequence** — not "the graphics are simple", not "you can't do X here". It means
the *order of operations* or the *physics* is wrong in a way no real shop would
ever do it. Examples of the kind of thing that counts: measuring with a tool that
can't reach the feature; a boring sequence that would scrap every part; a
tolerance that cannot be held by the method shown.

Did they identify a fundamental absurdity?  yes / no

If yes, quote it exactly — this single sentence can redirect a whole round:

> ______________________________________________________________________

---

### 2. "What was the first thing that made you think whoever built this actually understood machining?"

This is the more subtle and more valuable question. It finds the parts that are
**right**, and those are the parts we must not break while fixing everything
else. The pass standard needs **at least one machinist to name something
genuinely right, unprompted** — this question is where that is captured, so do
not skip it even if question 1 produced a long list of complaints.

> ______________________________________________________________________
>
> ______________________________________________________________________

### 3. "What would you have done differently from what the game led you toward?"

This catches process errors the game *teaches* rather than merely contains. If
they would never have taken the sequence the game steered them into, that is a
finding about the lesson, not just the physics.

> ______________________________________________________________________

### 4. "Was there any moment where you stopped evaluating the simulation and just tried to make the part?"

The question that measures immersion. A machinist who never stopped thinking
about the software stayed outside it the whole time.

> Question 4 is where simulation starts becoming game.

  - Never stopped (stayed outside):     ☐
  - Briefly lost track:                 ☐
  - Got absorbed for a stretch:         ☐

What were they doing at the moment they named?

> ______________________________________________________________________

**→ Also record whether they objected to the audio.** The pass standard says
audio cannot *actively damage* credibility, so a `REALISM` note about the cut
sound is a Round 1 finding even if everything else works.

  - Audio damaged credibility:   ☐   what they said: ____________________
  - Audio neutral / unnoticed:   ☐
  - Audio read as right:         ☐

---

## Physics and process — go through these directly

A machinist will have opinions here whether or not you ask. Ask anyway, so the
answers are in a fixed order.

### The cut

- Does the material remove the way 4140 pre-hard should?   yes / no / partly
- Realistic depth of cut for the operation shown?          yes / no / partly
- Speeds and feeds — plausible?                            yes / no / partly
- Would this setup actually hold the part?                 yes / no / partly

Notes: ________________________________________________________________

### The measurement

- Is the measuring method one a real shop would use here?  yes / no / partly
- Does the gauge behaviour make sense (repeatability, drift, temperature)? 
  yes / no / partly
- **The core question:** if you dialled a cut and the result was not what you
  dialled, would that read as honest machine behaviour?  yes / no / partly
- Would a real machinist *notice and use* the discrepancy, or just trust the DRO?

  > __________________________________________________________________

### Thermal and time

- Does the machine warming up behave the way a machine actually does?
- Is the drift magnitude plausible for a Ø40 H6 bore?  yes / no / partly
- Timescale — warm-up minutes, job clock — plausible?  yes / no / partly

Notes: ________________________________________________________________

---

## The destruction test — run this, then ask

Ask them to **deliberately** wreck the part:

> "Now take it undersize. On purpose. Show me what happens when it goes wrong."

Then ask:

- **Did going undersize feel like going undersize?**  yes / no / partly
- Did the consequence land with the right weight?      yes / no / partly
- Is the failure mode honest — would that part really be scrap?

**→ the stakes question.** If a machinist deliberately scraps it and shrugs, the
consequences are not real yet and that is a finding about the *design*, not
about them.

> ______________________________________________________________________

---

## The one question that decides the round

Do not lead this. Do not offer to set one up. Just ask:

> **"Would you run another one?"**

  - Yes, immediately, and asked for it themselves:  ☐  ← what the round wants
  - Yes if offered:                                ☐
  - No:                                            ☐

Quote: ______________________________________________________________

---

## The quotes that matter most

Verbatim. These go in the round summary unedited. The three categories are the
manual's, not ours — and for a machinist, **misconception** is usually replaced
by **objection**, so that row carries the `REALISM` lines instead.

**1. Something genuinely right, unprompted** — the pass standard needs at least
   one machinist to produce this, and it is easy to lose it in a long complaint
   list:

> ______________________________________________________________________

**2. Professional objection** — the sharpest `REALISM` line of the session,
   word for word:

> ______________________________________________________________________

**3. Immersion / intrinsic desire** — did they ever stop evaluating, or ask for
   another part?

> ______________________________________________________________________

Enter the objection and any desire so they correlate with the machine log:

```js
INDUSTRIA.obs('REALISM', 'nobody deburrs before measuring', { machinist: true })
INDUSTRIA.obsQuote('desire', 'set me up another one')
```

---

## Facilitator note

If the machinist gave you a long list of things that were fake but *kept
playing anyway*, write that down. That is the single most useful combination
there is: it means the core loop is strong enough to survive detailed criticism
of the surface. Fix the list — but do not touch the loop.
