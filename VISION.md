# INDUSTRIA — THE VISION

Written 2026-09-17, after Adam said: *"incorporate shop os to the game so the game
is like your synthetic life as a person who starts as a shop but goes through all
levels of manufacturing… this is the future of manufacturing."*

This file is the answer to that, developed. It is deliberately separate from
`ROADMAP.md`: the roadmap says what to build next and in what order, this says
what the thing IS and why the ladder does not collapse under its own weight.

---

## 1. THE IDEA, AND THE VERSION OF IT THAT FAILS

**The idea.** One life, from the shop floor to the top of manufacturing. You
start as a helper who does not know what parallels are. You end up owning
capacity. Every rung of the trade is playable, down to the smallest part.

**The version that fails** is the obvious one: build a management sim and bolt a
machining minigame onto it. That is *"a spreadsheet game with 3D graphics"*,
which this project's brief names as its first absolute anti-goal (§108) — and it
is what you get if you read the idea as *a feature list of scales*. Scales do
not stack. Machining, running a shop, and running a company are three different
games with three different pleasures, and a game that does all three badly is
worse than a game that does one well.

**So: what can hold a ladder together?**

One question, asked at every rung, with the cause moving outward.

> **Why is the part wrong?**

At the machine it is the tool and the machine: deflection, thermal growth,
runout, a dial that lies by 2.1 %.

- At the **shop** it is the operator and the work: a man who measured a hot part,
  a machine nobody has serviced since March, a job sequenced behind a longer one.
- At the **process** it is the plan: the wrong order of operations, a datum
  chosen badly, a roughing cut that left stress the finishing pass released.
- At the **supplier** it is the stock: a heat of steel that machines differently,
  a casting that arrived small, a certificate that describes a different lot.
- At the **standard** it is the rule everyone follows: a tolerance band drawn
  from a table that does not account for the process, an inspection scheme that
  samples the wrong feature.

**The same question, a larger cause, every time.** That is the ladder, and it is
not a metaphor — it is what actually happens in a shop when a problem is chased
far enough. The interesting number is still *why the part is wrong*; it is just
no longer only the machine that is wrong.

---

## 2. THE SKILL THAT TRANSFERS — AND WHY THAT IS THE WHOLE GAME

At every rung, somebody hands you a number whose provenance you cannot see, and
your job is to find out whether it is true.

At the machine it is the dial. At the shop it is an operator saying "it's fine,
I checked". At the process level it is a route sheet. At the supplier level it
is a material certificate. At the top it is a standard, or a model.

The skill is the same at every rung and it is the only skill the player carries
up the ladder: **verify before you act, and know what you did not check.**

This is why the ladder works as a game rather than as a syllabus. The player is
not learning six trades. They are learning one discipline, six times, against
progressively more confident liars — and the last and most confident of those
liars is a model.

---

## 3. WHERE SHOP OS SITS

Shop OS is a manufacturing system that answers engineering questions: one
sentence in, parts out, with CAD, DFM, toolpaths and verification attached. In
this game it is **the claim-maker**. It occupies the seat that every authority
occupies at every rung: it tells you what it would do, it is usually right, and
it carries assumptions it cannot check — because they are about *your* machine,
*your* operator, *your* stock.

So it is not a menu and not a helper. It is a character, and the relationship is
the point:

- At the **machine** it recommends cutting data — which is the tooling book this
  build already has, and it already states the assumption it was written under.
- At the **shop** it quotes, sequences and schedules.
- At the **process** it plans routes and picks datums.
- At the **supplier** it sources and substitutes.
- And at every rung it is *usually right*, which is exactly what makes the times
  it is wrong expensive.

**THE PROGRESSION IS DELEGATION.** The player's career is measured by how much
of the decision they can hand over and still be right. Early on, trusting a
recommendation without checking loses the part. Later, refusing to trust one
means drowning in work you cannot get through. The ladder is not "unlock bigger
machines" — it is **how much of your judgement can you safely stop supplying
yourself**, which is the actual question the next twenty years of manufacturing
asks every engineer, and nobody has yet built a place to practise answering it.

This is the piece I would defend hardest: it is a mechanic, not a message. You
learn it because it costs you a casting.

**What the game must never do:** let Shop OS make the call *and* hold the
answer. The system states a claim; the part is the truth; the player is the one
who finds out. If the game ever knows the outcome and shows it to you, the
mechanic is dead.

---

## 4. WHY A PLAYER NEVER OUTGROWS THE MACHINE

The failure mode of a career game is that each rung deletes the one below it.
You become an owner and stop touching metal, and the game's own thesis becomes
decoration.

**The rule that prevents it: the machine stays reachable.** Every rung's
decisions eventually cash out at a machine, and you can always walk to one and
check. A schedule is a claim about what is possible; a quote is a claim about
what a cut costs; a certificate is a claim about what the metal is. All of them
can be settled by putting a part in a vise and measuring it, and the game lets
you do that at any point in the career — usually at the worst possible moment,
because that is when it matters.

That is also the honest structure of the industry. The people who are best at
running manufacturing are the ones who can still walk onto the floor and tell
whether the numbers are lying.

---

## 5. WHAT THIS COSTS, STATED HONESTLY

- **This is a long ladder and the build is on the bottom rung.** What exists
  today is the machine rung, a thin shop rung, and the first honest piece of the
  Shop OS seat. Everything above is designed and nothing above is built.
- **The brief's own warning stands:** *five machines done right beats fifty done
  shallowly* (§103). Each rung has to be good enough that a person who does that
  job for a living recognises it, or the ladder is scenery.
- **The risk is dilution, and it is the risk this project has already suffered
  once** — from the other direction. The failure before was 5,982 lines of game
  against 11,834 lines of apparatus; the failure this idea invites is six rungs
  of nothing in particular. The defence is the same in both directions: **ship
  one rung, look at it, and only then climb.**

## 6. ORDER, IF YOU CLIMB

1. **The machine rung, finished** — the physics is right and the surfaces are
   nearly there. Missing: the ladder down to the chip, and sound.
2. **The shop rung, made real** — the economy exists; what it lacks is a
   morning that arrives and a machine that wears. *(Machine wear landed with the
   Shop OS seat; see the commit for this file.)*
3. **The Shop OS seat, occupied honestly** — a system that forecasts, keeps its
   own record, and is visibly wrong in ways the player can catch. **This is
   where the game becomes about the future rather than about the trade.**
4. **The process rung** — routes, datums, first-article inspection, rework.
5. **The supplier and standard rungs** — stock that varies, certificates that
   are claims, a tolerance table somebody should have questioned.

Rungs 1–3 are one game. Rung 4 is a second game with the same machine at the
bottom of it. Rungs 5 upward are a third. **Do not start the second until the
first has been played by somebody who is not us.**
