# INDUSTRIA — ROUND 1 PLAYTEST (human session)

**Play this:** https://foshowithit.github.io/industria/INDUSTRIA-single-file.html

That is the whole thing. No install, no server, no login. Verified live right now:
`1,076,600 bytes`, sha256 `a1b0c975c7c5adf53940996e5309fb36c2cfa35e12b8902b98417ff6e61c7a51`
= commit `7d9e5d6`. Click the screen to walk in.

**Why this session matters more than anything I can build:** the design lead's rubric is
5.10/10 and **55% of the weight can only be scored by a human playing it.** No session has
ever been played. Every automated test I can write is now worth less than one honest
observation from you.

**Your job is not to be nice to it.** It is to be the first real player and to let me see
what actually happens. A bored 6/10 you report accurately is worth more than a 10/10 I
invent.

---

## 1. The one thing to watch (this is the actual experiment)

**Does the wish for a way to CHECK the bore arise on its own — and at which moment?**

A machinist told me I can *open* a bore but never *close* one, so being undersize is
recoverable and being oversize is scrap. That is now true in the build. The open question
is whether a player, unaided, starts wanting to *measure before cutting* — which would
mean the game's real loop is `predict → cut → measure → update → choose again`, not
`calculate → dial → cut`.

Record the moment. There are only five that count:

- **M1** — before your first finish cut, when you are deciding the number
- **M2** — after you notice the dial and the metal disagree
- **M3** — after a refusal tells you to stop
- **M4** — only after you have already ruined a part
- **M5** — never

**Do NOT prompt yourself or anyone with "would you like a measuring tool?"** The lead was
explicit: that destroys the evidence. If it does not occur to you, that is a real result
and I need it more than a polite yes. "Never" is a finding, not a failure.

---

## 2. Record it — one keystroke, no notes required

Press **`S`** at any point. It downloads a session file (`.jsonl`) of everything that
happened. Press it once at the end of your session, minimum. If something interesting
happens — a surprise, a confusion, a moment you wanted to quit, a moment you felt clever —
press **`S`** right then, while the thought is fresh.

That file is the transcript. You do **not** need to write prose, keep notes, or remember
details. Play normally and hit `S`. Hand me the file when you stop.

If anything is worth a sentence anyway, this is the format the analysis expects —
timestamp, a one-letter code, then 3–8 words:

| code | meaning | example |
|---|---|---|
| `C` | confused | `14:22 C no idea which way to turn dial` |
| `H` | hypothesis about the machine | `14:25 H maybe warm metal cuts deeper` |
| `A` | aha / model changed | `14:31 A it drifted! the dial lied` |
| `F` | frustration or wanted to quit | `14:40 F just scrapped my third part` |
| `S` | noticed something wrong | `14:44 S rake is floating above the floor` |
| `R` | realised something real | `14:50 R this is just like setting up the lathe` |
| `HELP` | stuck and would ask for help | `14:52 HELP how do I get the part off` |
| `WALL` | hit a wall — no idea what to do | `14:55 WALL nothing responds` |
| `P` | wanted a specific thing that isn't there | `14:58 P want to measure the bore` |
| `MORE` | wanted to keep playing | `15:10 MORE one more casting please` |
| `REALISM` | it rang true as real machining | `15:12 REALISM that's exactly how a bore bellmouths` |

Format is loose on purpose. If you only type `P want to measure`, that is enough.

---

## 3. What I need you to NOT do

- **Don't read the source or the docs first.** The whole question is what the game teaches
  a player who arrives cold. Reading the code answers a different question.
- **Don't look up what to do.** Being stuck is data.
- **Don't be tactful.** If it is boring, say boring. If it is insulting to your
  intelligence, say that. The lead scores honesty, not enthusiasm.

If you are a machinist reading this: point out the first thing that is **wrong** as
machining, and — the harder and more useful one — the first thing that is **right** that
you did not expect a game to get right. Unprompted recognition is worth 25% of the rubric.

---

## 4. Before you start — two minutes, so the session isn't wasted

Nothing here is a trick. It just stops us burning your one first playthrough on a broken
setup:

- **Use Chrome**, and give it about 5 seconds after opening before clicking. It is a 3D
  scene; the first paint is not instant.
- **Click once to enter, then the mouse is captured.** Move with `WASD`, look with the
  mouse, `E` to interact, `Shift` to run. `Esc` releases the mouse.
- **The audio has never been heard by a human.** I cannot hear it. If it is wrong,
  annoying, too loud, or absent when it should be there, that is a genuine finding and I
  have no other way to learn it.
- **Screen size is tested but not *seen*.** I checked 1366×768, 1024×640 and 1920×1080:
  no scrollbars appear and the HUD text is identical at all three. So it is not broken —
  but "no overflow" is not the same as "looks right", and nobody has ever *looked* at it on
  a screen that isn't mine. If anything is cramped or hard to read, `S` and tell me.

---

## 5. What "good" looks like — the standard the session is judged against

Not vibes. The lead committed to these numbers before seeing the result:

- **≥2 of 3 beginners** make progress **unassisted**, and at least one has a genuine
  *model-revision* moment (expected one thing, the metal did another, they changed their
  belief) — not just one who survived.
- **≥2 of 3** spontaneously want to keep going — *without being asked if they want to keep
  going.*
- **Zero credibility-destroying errors for a machinist.** One impossible cut, one nonsense
  tolerance, one physically wrong claim and this fails outright regardless of everything
  else.
- **≥1 machinist identifies something genuinely right, unprompted.**

And the lead's standing anti-goals, so you know what would be a fake win: a **spreadsheet
game with 3D graphics**, or a **machine-control emulator with no living world**. If it feels
like either, that is the single most valuable thing you can tell me.

---

## 6. When you're done

Hand me the `.jsonl` file(s). I run them through `analyse_session.py` and report what it
says — including when it says the session **did not leave the loop**, which is the usual
honest answer for a first attempt. A session that fails is still a measured session, and it
tells us where to build next.

Ask me anything before you start, but do not ask me what the game wants you to do. That is
the thing being tested.
