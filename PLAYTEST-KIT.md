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

## 3. What to say — the whole script

Say this, roughly in these words:

> "This is a machining game. It's early. I'm not going to explain it — I want to
> see what it teaches you on its own. Play for about ten minutes. Talk out loud
> if you want. **I won't answer questions about how it works — that's the thing
> being tested, not you.** When you're done, tell me."

Then say nothing else.

### What you must NOT say

| Do not say | Why |
|---|---|
| "Press E to pick up the calipers" | The build teaches this. If it doesn't, that is a finding. |
| "You need to measure it first" | That is the entire lesson. Handing it over ends the test. |
| "The dial adds a surplus, so sneak up on it" | This is *the* relationship. If we say it, we can never learn whether they found it. |
| "It's like a lathe but..." | No analogies. Let them build their own model. |
| "That's a bug" / "it's not finished there" | Unless they are genuinely stuck and frustrated, in which case *end the session* rather than rescue it. |
| Anything at all, while they are thinking | Silence is data. Your reassurance contaminates it. |

### The one exception

If they are **stuck and unhappy** — not puzzled, *unhappy* — stop the session
and note the time. A stuck-and-miserable player is the strongest possible result
we can get: it means we found a wall. Write down what they said and what was on
screen. Do not help them past it.

### What to do while they play

Sit slightly behind and to the side. Watch the screen, not them. Do not point,
do not gesture at the screen, do not lean in. Take notes on **times and
verbatim quotes**, not on your interpretation.

If they ask a question, write it down and say: *"Good question — hang onto it,
I'll answer at the end."* Then answer it at the end. Questions players ask are
some of the most useful data we get.

---

## 4. Consent and recording

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

## 5. After they stop

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

## 6. Reading the result

The analysis tool prints a verdict on each of the seven failure conditions. It
deliberately refuses to answer some of them:

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

The overall verdict is one of:

| Verdict | Meaning |
|---|---|
| `DID-NOT-REACH-THE-LOOP` | Never got as far as cut → measure → adjust. The build did not teach the entry. |
| `LOOP-ENTERED-NOT-CLOSED` | Made cuts and measurements, but never adjusted *because of* what they measured. |
| `LOOP-CLOSED` | They measured, changed something, measured again, and learned from the difference. **This is the one that matters.** |

`LOOP-CLOSED` in the log plus "give me another part" out loud is the round
passing. Either one alone is not enough.

---

## 7. If something breaks

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

## 8. The public URL vs the local build

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
