# Debrief — NOVICE

Fill this in **immediately after the session**, while it is fresh. Write their
words, not your interpretation. If they say something you don't expect, write it
down verbatim before you think about what it means.

    Session label:  ____________________   Date: ____________
    Facilitator:    ____________________   Minutes played: ______

---

## Before you write anything: was this an UNASSISTED run?

The pass standard counts **unassisted** progression. If you gave the player
information the game was responsible for communicating, the clean novice gate
**ended** at that moment — and a completed run after help is **not** a pass,
however well it finished.

    Information given?                          YES  /  NO
    If YES, timestamp of the BLOCKED call:      ________
    Hint given (smallest factual one only):     __________________________

    Escalation used (tick all that happened):
      1st  "Tell me what you think you're supposed to do."   ☐
      2nd  "What have you tried?"                            ☐
      3rd  "Show me the thing that's confusing you."         ☐
      BLOCKED, then help given                               ☐

From the report — `field_manual.field_verdict`:

> ______________________________________________________________________

**Completion is not the pass standard.** What matters is whether their internal
model of the machine **changed because reality contradicted their prediction**.
Record that moment if it happened:

> "What I expected: ______________________  What actually happened: ____________
>  What I did differently after that: _______________________________________"

---

## Ask in this order

### 1. "Tell me what happened."

Open-ended. Let them talk. Do not correct the sequence. Write it as they said it.

> ______________________________________________________________________
>
> ______________________________________________________________________
>
> ______________________________________________________________________

**→ F3 (did the work feel real?)** Listen for whether they describe *doing work*
("I had to keep checking it") or *entering numbers* ("I put 12 in and it said
wrong"). Quote the sentence that decides it.

> Quote: ____________________________________________________________

---

### 2. "What were you trying to do?"

This reveals their model of the task. The right answer is about **size** —
getting the hole to the right diameter. A wrong answer is about **procedure** —
"follow the steps" / "do what it told me".

> ______________________________________________________________________

**→ F2 (relationship vs sequence)** If they describe the *relationship* — that
the dial and the result disagree, that they had to leave room and creep up —
score F2 as understood, regardless of whether they got the part in spec.

> ______________________________________________________________________

---

### 3. "Was there a moment you didn't know what to do next?"

Let them name it. Then: **"What did you do about it?"**

> ______________________________________________________________________

**→ F1 (external explanation needed)** If they name a moment AND the answer to
"what did you do" is "guessed" or "waited", look at the analysis tool's
classification of that gap. Note whether they cite the on-screen hint line.

Did they mention reading the bottom-bar hint line?  yes / no / n/a
Did they mention the machine panel key hints?         yes / no / n/a

---

### 4. "What did the numbers on the dial mean to you?"

The critical question. We are looking for whether they understood the dial as an
**instruction to the machine** — which the machine does not obey exactly.

> ______________________________________________________________________

**→ F2 / F7** Did they ever notice that what they dialled was not what came off?

  - Understood it clearly:   ☐
  - Half-noticed, unclear:   ☐
  - Never noticed:           ☐    (this is a finding, not their failure)

---

### 5. "What did the machine's voice (the guy talking) do for you?"

**→ F1** Did the instruction line help, or did it become noise they tuned out?
Was there a point where they stopped reading it?

> ______________________________________________________________________

---

### 6. "How did it sound?"

Do not prompt with words like "realistic" or "fake" — that biases the answer.
Just ask, and let them reach for their own adjective.

Adjective(s) they chose: ______________________________________________

**→ F4 (audio)** Did the sound connect to what the machine was doing, or was it
decorative background? The failure is *obviously synthetic, generic, or
disconnected from machine state* — not "sounded simple".

  - Clearly connected to machine state:  ☐
  - Some connection:                     ☐
  - Generic / decorative / ignored:      ☐

Did they ever mute or wish they could?  ______________________________

---

### 7. "What would you do now?"

**→ F6 / MORE — the strongest single signal in the whole run.** Read this
carefully, because the obvious question is the wrong one.

**Do NOT ask "would you play again?" or "do you want another part?".** That is
leading, and a player can politely say yes. The evidence that counts is
**behavioural**: what they did in the seconds after shipping, before anyone
spoke — recorded automatically in the **post-ship window**. Fill this in from
what actually happened, not from what they now say:

  - Started another part / another job, unprompted:   ☐  ← the result round wants
  - Stayed at the machine, kept poking at things:     ☐  (`ENGAGED-NOT-CONTINUED`)
  - Sat still, did nothing at all:                    ☐  (`NO-IDLE`)
  - Waited for me to say something:                   ☐

What the recorder caught in the 8 s after the ship (from the report):

> ______________________________________________________________________

If they *did* volunteer something before you asked, quote it exactly — a
spontaneous "can I try another one?" outranks every checkbox above:

> Quote: ______________________________________________________________

---

### 8. Intrinsic desire — the third quote category

The manual asks for **verbatim quotes** in three categories. Two of them usually
turn up earlier in the session (log them the moment you hear them — see §4 of
`PLAYTEST-KIT.md`). This one often arrives now:

- **Intrinsic desire** — "Can I try another one?"

> ______________________________________________________________________

Do not explain why they are right or wrong. Say: **"Keep going."**

---

### 9. Finally: "What should I fix first?"

Let them pick. Their priority order is more informative than your own.

> ______________________________________________________________________

---

## Facilitator observations — fill in from memory, not from the player

**Did they ever look at the on-screen hint line?**
  - Never noticed it:            ☐
  - Read it once at the start:   ☐
  - Used it repeatedly:          ☐
  - Used it, then tuned it out:  ☐

**Where did they hesitate longest?** (cross-check against the tool)

> ______________________________________________________________________

**Did they move the mouse like a person doing a job, or like a person operating
a menu?** (Smooth, purposeful movement vs hunting for buttons.)

> ______________________________________________________________________

**What did they do that surprised you?**

> ______________________________________________________________________

---

## The three quote categories that matter most

Copy out, verbatim, the most useful things they said under each heading. These
go in the round summary. Do not paraphrase them, and do not tidy up their
grammar — the exact wording is the finding.

**1. Unexpected understanding** — they articulate the causal relationship.
   e.g. *"Oh, so measuring it changes what I know, not the part."*
   Also *"Why did it take THAT much?"* followed by changed behaviour.

> ______________________________________________________________________

**2. Unexpected misconception** — they state a wrong model confidently. These are
   the most actionable sentences of the whole session.
   e.g. *"I thought that number was the actual diameter."*

> ______________________________________________________________________

**3. Intrinsic desire** — unprompted wanting.
   e.g. *"Can I try another one?"*

> ______________________________________________________________________

Enter each one so it correlates with the machine log:

```js
INDUSTRIA.obsQuote('understanding', '…')
INDUSTRIA.obsQuote('misconception', '…')
INDUSTRIA.obsQuote('desire', '…')
```
