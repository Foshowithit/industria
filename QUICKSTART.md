# INDUSTRIA — hand this to a person

**You need one file and about ten minutes.** No server, no install, no account.

---

## For whoever plays it

1. **Save the file** `INDUSTRIA-single-file.html` somewhere — Desktop is fine.
2. **Double-click it.** It opens in Chrome. The title screen should read
   *"Half past five in the morning. The lights are already on."*

   If you get a **blank black page and nothing else**, stop and tell me — that is a
   real bug, not you doing it wrong.

3. **Click once** to walk in. `W A S D` to move, mouse to look, `Shift` to run.
   `Esc` lets go of the mouse.
4. **Play the shift.** Clock on, find the machine, load the part, cut it. The game
   will explain what it wants as you go. Nobody is timing you.
5. **When you're done — or the moment you'd quit — press `S`.**
   A file downloads, named something like `player-<time>.jsonl`.
   **Send that file back.** It is the whole point of the exercise; without it I
   only know someone said they played.

If you get stuck and give up, **that is useful too** — press `S` and send it, and
say where you stopped. A session that ends in frustration is data, and it is
better data than a polite session that lies.

---

## For me, when it comes back

```bash
python3 analyse_session.py <the-file>.jsonl
```

The analyser reads the session and reports what the player actually understood —
whether they formed a model, whether they changed it when the machine disagreed,
where they hesitated and whether that hesitation was thinking or confusion.

What I am looking for is **not** a good score. It is:

- Did they **predict before cutting** rather than dialling straight to the number?
- After the machine disagreed with them, did a **later** prediction differ?
- Did they ever say they'd play again **without being asked**?

---

## For a facilitator running a proper documented session

That is still the full kit in `PLAYTEST-KIT.md` — the graded escalation ladder, the
45-second deadlock rule, the observer codes, the debrief forms. It uses a local
server (`./playtest.sh run <name>`) because it needs to drive the browser and
capture the log itself.

**The single file is for everyone else** — the person you send it to by chat
message who will never run a script. Same game, same recorder, one double-click.

---

## Why the single file exists at all

Measured 2026-09-11 in Chrome: opening `index.html` from disk gives a **blank
page**. `window.INDUSTRIA` never exists. The title still renders, so it looks
alive, and the only clue is a console line:

```
Access to script at 'file:///…/vendor/three/three.module.min.js' from
origin 'null' has been blocked by CORS policy
```

ES modules are always fetched with CORS, and a `file://` document has the opaque
origin `null`, so **every** module import is refused. This is not fixable in the
game: a game authored as ES modules cannot run from disk, and *"just start a
local web server"* is how you get zero playtesters.

`tools/build-single-file.mjs` bakes the seven modules into one file using blob
URLs, which are same-origin with the document that minted them — so the import
`file://` refused is allowed. Rebuild after any module change:

```bash
node tools/build-single-file.mjs
```

**This is a build artifact, not a second source of truth.** Edit `index.html` and
the modules, then rebuild. If you edit the bundle directly the next build
overwrites you and the two will disagree.
