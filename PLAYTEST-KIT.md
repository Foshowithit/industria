# PLAYTEST KIT — how to run a human session

This is the Round 1 apparatus. Its only job is to get a real person in front of
the machine and catch what they actually do, without you teaching them anything.

**You do not need to understand the code to run this.** If you can open a
terminal and keep your mouth shut for ten minutes, you can run a session.

---

## 1. Why this exists

The last three rounds of work each found defects that reading the source could
not — and only playing the thing found. Nobody has played this yet. That is the
biggest gap in the build, and no amount of extra features closes it.

The question Round 1 answers is **not** "is it good?". It is:

> **Does confusion turn into curiosity, rather than friction?**

And the single sharpest test of the whole round:

> **Does someone say "give me another part" without being asked?**

Everything below is arranged to protect that observation.

---

## 2. Before they arrive (5 minutes)

You need one terminal and a browser. Nothing else.

```bash
cd /home/chow/industria
./playtest.sh run nov1          # nov1 = the label for this session
```

That is the whole setup. It starts the local build, opens your browser, and
waits. Substitute whatever label you want for `nov1` — use something that
identifies the person and the session, like `nov-claire` or `mac-dave`.

The runner prints a URL (`http://127.0.0.1:8799/index.html?rec=nov1`). The
`?rec=` is the **only** difference from the public build — it switches the
event log on. Everything else is identical.

**Set the screen up before they sit down:**

- Close your other tabs. Fullscreen it (`F11`). You want one window and nothing
  else competing for attention.
- **Turn the volume up.** One of the things we are testing is whether the audio
  sounds like a machine or like a synthesiser, and we cannot test that muted.
- If you are recording, start the recorder **now**, before they arrive, so you
  capture the first second of confusion rather than starting mid-way.

**Then, when the session ends:**

```bash
./playtest.sh analyse ~/industria-sessions/nov1.jsonl
```

That prints the timeline, where they hesitated, and a verdict on each of the
seven failure conditions. Run it *after* they leave, not while they play.

---

## 3. What to say — the exact opening script (novice)

**Read this verbatim. Do not paraphrase it, and do not add to it.** The words
are the protocol; a friendly improvised summary is a different experiment.

> "You're going to play this for about ten minutes. I didn't make this session,
> and I'm not testing you—I'm testing the game. You don't need to know anything
> about machining.
>
> Everything you need should either be in the game or something you can figure
> out. Please say out loud what you're thinking whenever you naturally can,
> especially when you're confused, surprised, or think you understand something.
>
> I'm mostly going to stay quiet. If you get stuck, you can ask me, but I may not
> answer because I need to see whether the game explains itself.
>
> Use whatever controls the game shows you on screen. Start whenever you're
> ready."

**Then stop talking. Start the stopwatch.**

### The shipped key legend is part of the artifact being tested

Do **not** explain WASD, E, Shift, the machine controls, Earl, parallels,
measurement, the objective, or where to walk. Let them read the legend on
screen. If they fail to notice it, **that is evidence** — not a reason to help.
Do not say "WASD moves you" merely because it is obvious to you.

This feels unkind the first time you do it. It is not: the question being asked
is whether the game explains itself, and every sentence you add converts a
finding into a favour.

### When they ask "what do I do?" — the graded escalation

**This is the most dangerous moment for the observer**, because the helpful
answer destroys the measurement. There are exactly three replies available, and
you may not improvise a fourth:

| ask | say exactly this |
|---|---|
| **1st** | "Tell me what you think you're supposed to do." |
| **2nd** (after they tried) | "What have you tried?" |
| **3rd** (genuinely blocked) | "Show me the thing that's confusing you." |

Nothing else. The first answer extracts their mental model **without giving
information**, which is why it does not end the clean run. *"I think Earl wants
me to clean something, but I don't know where"* is a **hypothesis, not a
deadlock** — say nothing and go silent again. You are determining whether this
is exploration failure, interaction failure, comprehension failure, or
impatience.

**After three interventions plus reasonable exploration, still blocked:** mark
**BLOCKED** on the sheet, then you may help so you can observe the rest — but
say this out loud first:

> "Okay. I'm going to help you past this point. From here on, we're no longer
> counting this as an unassisted run."

**Record the timestamp.** Give the smallest **factual** hint — not "go to the
vise, press E, clean it, then find the parallels", but "Earl asked you to clean
the vise", and if that fails, "try looking around the machine."

> Once you provide information the game was responsible for communicating, the
> clean novice gate has **ended**. Do not retroactively call it a pass because
> they subsequently finish. A completed run after help is **not** a pass.

Enter it in the recorder so the analysis tool knows — in the browser console
(<kbd>F12</kbd> → Console), on the session's own page:

```js
INDUSTRIA.obsHelp(1, { gaveInformation: true })   // 1st/2nd rung give nothing away
INDUSTRIA.obsHelp(3, { gaveInformation: true })   // 3rd rung onward: information given
```

### Silence — when to let it run

**Silence is not failure.** 20–30 s of looking around, rereading, inspecting,
experimenting, or visibly thinking = leave them completely alone. Even 45 s can
be productive if attention is active.

- **Thinking silence:** camera movement, checking Earl, rereading text, trying
  objects, revisiting something, testing a hypothesis → **leave them alone.**
- **Dead silence:** no meaningful input, aimless motion, sighing, looking away,
  looking at you for rescue, repeating the same failed action with no new
  hypothesis → **default threshold 45 s.**

At 45 s of genuine deadlock, do not give a hint. Ask: **"What are you thinking
right now?"** If they can articulate a hypothesis ("I know he wants parallels but
I have no idea what those are") — go silent again; that is productive confusion.
If they say "literally no idea, I don't know what the game wants" — that is a
likely **first wall**. Record it.

> **Never break silence just because you feel uncomfortable. Your discomfort is
> not player failure.**

Log the silence so it is distinguishable from inactivity:

```js
INDUSTRIA.obsSilence('dead', 47, { hypothesis: false })   // genuine deadlock
INDUSTRIA.obsSilence('thinking', 38, { hypothesis: true })
```

### What to do while they play

Sit slightly behind and to the side. Watch the screen, not them. Do not point,
do not gesture at the screen, do not lean in. Take notes on **times and verbatim
quotes**, not on your interpretation.

If they ask a question that is not "what do I do?", write it down and say:
*"Good question — hang onto it, I'll answer at the end."* Then answer it at the
end. Questions players ask are some of the most useful data we get.

---

## 4. What the observer writes — the one-page sheet

Do **not** take continuous notes; you will miss the important behaviour. Write
**timestamp + code + 3–8 words**.

| code | meaning |
|---|---|
| **C** | Confused |
| **H** | Forms a hypothesis |
| **A** | "Aha" / understanding changes |
| **F** | Frustration |
| **S** | Surprise |
| **R** | Retries voluntarily |
| **HELP** | Requests observer help |
| **WALL** | Cannot progress |
| **P** | Part shipped |
| **MORE** | Voluntarily wants another attempt/job |
| **REALISM** | *(machinist only)* professional objection |

Examples: `01:14 C — doesn't know parallels` · `01:51 A — "oh THESE are
parallels"` · `04:22 S — cut removed more than expected` · `04:31 H — decides to
measure again`.

A printable sheet with these codes and a quote block is in
[`debrief-novice.md`](debrief-novice.md) and
[`debrief-machinist.md`](debrief-machinist.md).

### Entering the codes (30 seconds, while they play)

The paper sheet is the source of truth. But the codes are more valuable in the
session file, **because that is where they can be lined up against the machine
log** — a `WALL` at 02:14 means something specific when the recorder shows no
measurement had ever been taken, and something quite different when the player
had just re-measured cleanly. Type each one into the console as it happens:

```js
INDUSTRIA.obs('C', "doesn't know parallels")
INDUSTRIA.obs('A', '"oh THESE are parallels"')
INDUSTRIA.obs('S', 'cut removed more than expected')
INDUSTRIA.obs('MORE', 'asks if there is another job')
INDUSTRIA.obs('REALISM', 'nobody deburrs before measuring', { machinist: true })
```

An unknown code is **refused** rather than silently dropped, because a dropped
code looks exactly like an observation that never happened. Codes are case
insensitive. Check `INDUSTRIA.obsCodes()` if you forget one.

### Three things deserve verbatim quotes — write them down immediately

- **Unexpected understanding** — "Oh, so measuring it changes what I know, not
  the part."
- **Unexpected misconception** — "I thought that number was the actual diameter."
- **Intrinsic desire** — "Can I try another one?"

Do not explain why they are right or wrong. Say: **"Keep going."**

```js
INDUSTRIA.obsQuote('understanding', 'measuring changes what I know, not the part')
INDUSTRIA.obsQuote('misconception', 'I thought that number was the actual diameter')
INDUSTRIA.obsQuote('desire', 'Can I try another one?')
```

### After they ship — say nothing for five seconds

Do not immediately announce "Great! That's the test!" Let the game breathe. Do
they look around? Touch something? Re-check the machine? Ask "is there another
job?" Try to improve the result? If they naturally attempt to continue, record
**MORE**.

**Voluntary continuation is the strongest single signal in the whole run**, and
it is detected **behaviourally, not by asking**. The recorder captures the first
8 seconds after the ship automatically — what they looked at, whether they
moved, whether they touched anything — so you do not have to log five seconds of
silence accurately. Just mark it if you see it:

```js
INDUSTRIA.obs('MORE', 'started looking for another job')
```

If they just sit there, after five seconds ask only: **"What would you do
now?"** Do **not** ask "would you play more?" — that is leading. A player can
politely say yes; their behaviour is stronger evidence.

---

## 5. The machinist session — a different opening

The machinist gets the same apparatus and a different script.

> "I want you to play this as if someone put you in front of it without
> explaining it. For the first ten minutes, please play rather than review it.
> You can say anything you notice out loud, including things that feel wrong,
> but don't stop to give me a full critique yet. Afterward I'm going to ask you
> specifically what was fake, what was credible, and what you would actually do
> differently."

Then the same protocol as above — same escalation, same silence rule, same
codes. Log objections as `REALISM — [short description]`.

**Do not debate them. Do not explain your model. Do not say "actually that's
intentional because…"** — that contaminates the reaction. Say "Got it. Keep
going."

**Afterwards, unlimited critique — these four questions, in this order:**

1. "What was the first thing that felt fake?"
2. "What was the first thing that made you think whoever built this actually
   understood machining?"
3. "What would you have done differently from what the game led you toward?"
4. "Was there any moment where you stopped evaluating the simulation and just
   tried to make the part?"

> Question 4 is where simulation starts becoming game.

---

## 6. Consent and recording

Ask before you start, in plain language:

> "I'd like to record the screen and the game audio so I can go back over it.
> I'm not recording your face or your voice unless you're happy with that. It
> stays on this machine, it's only used to fix the game, and you can say stop at
> any point and I'll delete it."

- Screen + game audio: **yes, always ask for this.** It is the most valuable
  record and the least intrusive.
- Their voice: optional. Very useful (their muttering is the best commentary
  there is), but only with explicit permission.
- Their face: not needed. Don't ask.
- If they decline recording entirely, **still run the session** and have the
  facilitator take written notes. A session with notes beats no session.
- Never record anyone without asking. Never share a recording outside the team.

---

## 7. After they stop

Two things, in order.

**1. The debrief — immediately, while it is fresh.** Open the right form:

- A **novice** (no machining background) → `debrief-novice.md`
- A **machinist or experienced operator** → `debrief-machinist.md`

Ask the questions in order. Write down their words, not your summary. Do not
defend the build when they criticise it — "that's helpful, say more" is the
correct response to almost everything.

**2. Destroy the build.** This one is unusual and it matters.

A machinist will have spent the session holding back. They know a real Ø40 H6
bore is not something you learn on in ten minutes, and part of their attention
was on *not wrecking someone's setup*. So ask them to finish the job properly:

> "Now wreck it. I want you to deliberately cut it undersize. Show me what
> happens when it goes wrong."

Watching an expert **deliberately** destroy the part tells us two things we
cannot get any other way: whether the failure is physically honest (does going
undersize feel like going undersize?) and whether the consequences land with the
weight they should. If a machinist destroys the part and shrugs, the stakes are
not real yet.

### Then run the analysis

```bash
./playtest.sh analyse ~/industria-sessions/<label>.jsonl
```

Keep the JSONL file. It is the primary record; the notes are the commentary.

---

## 8. Reading the result

### Completion is not the pass standard

This is the single most important thing to understand before you read a report.
A **bad-but-completed** run looks like this:

> Earl tells player X → player does X → UI tells player Y → player does Y →
> number changes → player follows next instruction → part passes → "Okay, I'm
> done."

That proves the sequence is navigable and nothing more. A **genuinely good**
session contains a **model-revision cycle**:

> "What the hell are parallels?" → searches → finds them → "Oh." → "Okay, I'll
> take another tiny cut." → result isn't what they expected → "What? Why did it
> take THAT much?" → measures again → looks at the dial → thinks → changes
> strategy → new result → **"Ohhhh."**

> **The important object isn't completion. It's model revision.** The player's
> internal understanding of the machine changes because reality contradicted
> their prediction.

An excellent Round 1 recording contains at least three things:

1. **Confusion that becomes understanding without observer instruction.**
2. **A prediction that reality contradicts, followed by changed player behaviour.**
3. **Voluntary continuation** — the strongest game signal.

### The Round 1 pass standard

It does **not** require all three novices to finish.

> "Counterintuitively, a player who struggles, independently figures out the core
> causal lesson, and wants another attempt may be stronger evidence than someone
> who cruises through and finishes."

- **2/3 novices:** unassisted core progression, at least one genuine
  model-revision moment, no fatal first wall.
- **At least 2/3:** behavioural or spontaneous verbal evidence of wanting to
  continue.
- **Machinists:** no core sequence error severe enough to destroy professional
  credibility.
- **At least one machinist:** identifies something that feels genuinely right,
  unprompted.
- **Separately: audio cannot actively damage credibility.** If the cut sounds
  ridiculous, Round 1 finds a real problem even if everything else works.

The tool encodes this as `field_manual.field_verdict` — deliberately a
**separate** field from the older `verdict`, because they answer different
questions and conflating them is exactly the error to avoid:

| `field_verdict` | Meaning |
|---|---|
| `FATAL-FIRST-WALL` | Never reached the loop, or was blocked in it. A first wall. |
| `COMPLETED-AFTER-HELP — NOT A CLEAN RUN` | The observer supplied information the game owed the player. **Not a pass**, however well it finished. |
| `STRONG` | Loop closed *and* a behavioural or verbal obsession signal. |
| `LOOP-CLOSED-BUT-NO-OBSESSION-SIGNAL` | They did the work; nothing suggests they wanted to. |
| `WEAK` | Partial progression only. |

### The seven failure conditions

The analysis tool prints a verdict on each. It deliberately refuses to answer
some of them:

- **F4 (audio sounded synthetic)** and **F5 (a machinist found something
  absurd)** are marked `UNMEASURABLE-IN-SESSION`. No event log can answer those.
  The debrief forms answer them. Do not let the tool's silence read as a pass.
- **F1** distinguishes two things that look identical in a log: *they did not
  understand* (the build asked them something and they stalled in front of it)
  versus *they were never asked* (they were idle, but nothing was prompting
  them, so they were thinking). This distinction is the reason the tool exists.
  If it reports a long stall **with a prompt on screen**, that is the build
  failing to communicate — a real defect. A long stall with **no prompt** is
  someone working it out. Those are opposite findings.
- **F6** is the MORE signal, and it answers **behaviourally**:
  `YES-BEHAVIOURAL`, `ENGAGED-NOT-CONTINUED`, `NO-IDLE`, or
  `NO-WINDOW-CAPTURED`. `ENGAGED-NOT-CONTINUED` is a real result, not a
  near-miss — it means they stayed at the machine without starting a new part.

The older overall verdict is still printed and still useful:

| Verdict | Meaning |
|---|---|
| `DID-NOT-REACH-THE-LOOP` | Never got as far as cut → measure → adjust. The build did not teach the entry. |
| `LOOP-ENTERED-NOT-CLOSED` | Made cuts and measurements, but never adjusted *because of* what they measured. |
| `LOOP-CLOSED` | They measured, changed something, measured again, and learned from the difference. |

`LOOP-CLOSED` in the log plus a behavioural MORE signal is the round passing.
Either one alone is not enough — and a `LOOP-CLOSED` reached after help is not a
pass at all.

### Where the observer's codes meet the machine log

The report prints an **observer section**: the codes seen, whether the observer
and the machine agree on MORE, and — for every `WALL` — the machine state at that
instant. That last one is the payoff of writing codes into the console instead
of only on paper:

```
WALL  "staring at the vise"  →  NO-QUESTION-ON-SCREEN
      (prompt on screen: False, 7 measurements, 9 cuts before)
```

Read that as: the player was not stuck because they had failed to understand a
question — **there was no question on screen at the time.** That is a different
defect from `PROMPTED-BUT-BLOCKED`, and it is only visible because the human's
six words were correlated against the physics.

Also check the **post-ship window** (8 s, opened automatically at the ship
event) and any quotes the observer captured under the three categories. The
window is the evidence for the strongest signal in the run; the quotes are the
only place a model-revision moment is ever recorded in the player's own words.

---

## 9. If something breaks

| Symptom | Fix |
|---|---|
| Browser doesn't open | Go to the URL the runner printed, by hand. |
| **"CANNOT START: port 8799 is held by something that is NOT a playtest server"** | Exactly what it says. Some other server is on that port. It might still serve the game — but it does not accept the event log, so the session would be **recorded as nothing**. Stop it, or run with `--port 8801`. Never play a session against a port you did not start. |
| "Nothing to measure with" | Genuine — they need to pick up the calipers. Do **not** tell them. Note it. |
| No session file written | Check the label matched: `ls ~/industria-sessions/`. The runner prints the row count when it exits. |
| Analysis says `UNSAMPLED` gaps | The heartbeat did not record during a gap. Rare; the timeline is still valid. |
| Page won't load at all | Re-run `./playtest.sh verify` to check the build is healthy. |

**If the build is broken, fix it before running humans.** Do not run a session
on a broken build — you will burn a real person's goodwill and learn nothing.
`./playtest.sh verify` is the check.

---

## 10. The public URL vs the local build

The public build at `https://foshowithit.github.io/industria/` has the recorder
**off**. It is byte-for-byte the same game, with no logging and no network calls
of any kind — the `?rec=` switch is what turns logging on, and the public URL
does not carry it.

So: **run sessions on the local build** (`./playtest.sh run <label>`), because
that is the one that produces the session file. Use the public URL only for
sending someone a link to look at on their own time, which tells you nothing
about what they did.

If you ever need to check the public build still works:

```bash
curl -sI https://foshowithit.github.io/industria/ | head -1
```
