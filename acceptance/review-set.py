#!/usr/bin/env python3
"""THE REVIEW SET — one driver, three jobs, so a review still can be traced.

Two first-impression viewers and one cold viewer were shown screenshots and asked
what they could not read. The stills themselves were the weak link: each set was
captured by a different ad-hoc script, at a different size, and each shot was a
labelled STATE (this is the panel, this is the readout) with no moment attached.
A viewer then read two shots as contradicting each other — 19.97 stock against
20.00 stock, 38% edge life against 13% — because nothing on the frame said which
came first. The frames were honest; the SET was not, and no viewer can be asked
to know that.

So this file is kept in the repo and does three things:

  probe     measures the fixed layout on the real build, in the page, at the
            reviewer's size and at ours. A value read from a field that does not
            exist, a correct model never called, two derivations of one fact —
            none of those were ever caught by a suite. These three checks are
            the drawn consequence of the three things a cold viewer reported and
            the pixels confirmed: a torn top log line, label/value collisions in
            the three number boxes, and a panel background the shop's own
            signage showed through.
  logtest   presses the same look twice and counts the log's children. The rack
            look prints two lines; a second press printed them again and a viewer
            read the repeat as the game saying one thing twice. Also asserts the
            SESSION RECORD still took both looks — the column is a display, the
            record is the evidence, and they must not be the same list.
  capture   writes the ten stills in declared chronological order, each with the
            shop clock on it and in the manifest. The order is the claim: these
            are ten moments of one shift, not ten states of one moment.

Frames are the pacing. `wait_frames` chains real requestAnimationFrame callbacks
and fails loudly if none arrive: THE BROWSER IS OFTEN OCCLUDED AND rAF STOPS, and
a screenshot taken off a stopped renderer is a still of the last frame, which
looks exactly like a working build. Anything frame-dependent goes through it.
"""
import argparse, hashlib, json, math, os, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PORT = 8799
BASE = "http://127.0.0.1:%d" % PORT
CHROME_CANDIDATES = [
    # Every other driver in this folder hardcodes the Linux path, so none of
    # them run on the Mac cell at all. This one looks.
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/opt/google/chrome/chrome",
    str(Path.home() / ".cache/ms-playwright/chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium"),
]


def resolve_chrome():
    """Chrome if it is here, otherwise playwright's own build, otherwise loud."""
    import glob
    for pat in CHROME_CANDIDATES:
        for p in sorted(glob.glob(pat)) or ([pat] if os.path.exists(pat) else []):
            if os.path.exists(p) and os.access(p, os.X_OK):
                return p
    return None

LAUNCH_ARGS = [
    # The cards were captured with --use-gl=angle --use-angle=gl, which is right
    # on the Dell and wrong here: on this Mac it silently resolves to ANGLE's
    # SwiftShader fallback, measured at 6 fps against the page's own readout of
    # 2. Unforced, the same page on the same machine measures 120 fps through
    # ANGLE Metal on the M4 Pro, and the renderer string names the chip rather
    # than a software device. So the forcing flags are deliberately not passed;
    # wait_frames is the receipt that frames are actually flowing.
    "--enable-gpu", "--ignore-gpu-blocklist",
    # A window that is behind another window stops painting. These are the
    # flags that stop that.
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
]
SIZES = [(1440, 900), (1280, 720)]


# ── serving ──────────────────────────────────────────────────────────────────
def _sha_local():
    return hashlib.sha256((REPO / "index.html").read_bytes()).hexdigest()


def _served_sha(base):
    """The sha of what a port is actually serving, or None if nothing is there.

    A port that ANSWERS is not a port that answers with this build. A stale
    `http.server` from another job was listening on 8799 while this file was
    written, serving a different directory entirely, and a readiness check that
    only asked `is something there?` would have photographed the wrong site and
    reported it as this one. The bytes are the check."""
    try:
        blob = urllib.request.urlopen(base + "/index.html", timeout=1.5).read()
        return hashlib.sha256(blob).hexdigest()
    except Exception:
        return None


def serve_up(proc_box):
    """The repo over HTTP. file: is refused by the in-app browser, and a page
    loaded from disk takes a different path through the module graph than the
    one the player loads, which is a difference worth not having."""
    global BASE, PORT
    want = _sha_local()
    for port in [PORT] + [p for p in range(8801, 8812)]:
        BASE = "http://127.0.0.1:%d" % port
        have = _served_sha(BASE)
        if have == want:
            PORT = port
            return
        if have is not None:
            print("port %d is serving something else (sha %s) — leaving it alone" % (port, have[:12]))
            continue
        log = open("/tmp/review-set-server.log", "ab")
        proc_box.append(subprocess.Popen(
            [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
            cwd=str(REPO), stdout=log, stderr=log))
        for _ in range(40):
            time.sleep(0.25)
            if _served_sha(BASE) == want:
                PORT = port
                return
        raise SystemExit("started a server on %d and it is not serving this build"
                         " — see /tmp/review-set-server.log" % port)
    raise SystemExit("no free port in 8799, 8801-8811 that serves this build")


def build_sha():
    return _sha_local()


# ── the page ─────────────────────────────────────────────────────────────────
WAIT_FRAMES = """(n) => new Promise((res, rej) => {
  let i = 0;
  const t0 = performance.now();
  const t = setTimeout(() => rej(new Error('no frame for ' +
      ((performance.now() - t0) / 1000).toFixed(1) + 's, at ' + i + '/' + n)),
      GUARD_MS);
  const step = () => { i++; if (i >= n) { clearTimeout(t); res(i); } else requestAnimationFrame(step); };
  requestAnimationFrame(step);
})"""

# The guard inside the page and the timeout in Playwright both watch the same
# thing, and the first version of this file had the guard firing at 4 s while
# the page was running at 2 fps: two frames of a slow build, read as a stopped
# renderer, and the capture died with a diagnosis that was wrong. The guard is
# now long enough that only a genuine stall reaches it, and it reports how long
# it waited rather than a frame count that reads like a budget.
GUARD_MS = 20000


def wait_frames(pg, n=3, why=""):
    """Real frames, or loudly not.

    The first version of this timed out at the gate and the diagnosis took a
    separate script: `#gate` is visible in the HTML, so waiting for it can
    return while the page's own module is still building the scene, and the
    main thread being busy means no rAF callback runs at all. The wait was
    correct about frames and wrong about being ready. So the wait is generous
    and the error names which of the two it was."""
    try:
        pg.wait_for_function(WAIT_FRAMES.replace("GUARD_MS", str(GUARD_MS)), arg=n, timeout=30000)
    except Exception as e:
        fps = None
        try:
            fps = pg.evaluate("() => window.INDUSTRIA ? +window.INDUSTRIA.fps.toFixed(1) : null")
        except Exception:
            pass
        raise SystemExit("no frames %s (page fps %s, %s): %s" % (why, fps, n, e))


def enter(pg, rec=False):
    """Into the shift exactly as a player goes in: a real click on the gate.

    Readiness is the game's own signal, not the gate's visibility: `#gGo` is
    filled with `Click to walk in.` at the end of the module, when the scene is
    built and the first frame is ready to be drawn."""
    pg.goto(BASE + "/index.html" + ("?rec=1" if rec else ""))
    pg.wait_for_function("() => document.getElementById('gGo')"
                         "  && document.getElementById('gGo').textContent.trim().length > 0",
                         timeout=60000)
    wait_frames(pg, 4, why="at the gate")
    pg.click("#gate")
    wait_frames(pg, 6, why="just after the gate")
    st = pg.evaluate("() => ({ gate: getComputedStyle(document.getElementById('gate')).display,"
                     " game: !!window.INDUSTRIA.game,"
                     " fps: window.INDUSTRIA ? +window.INDUSTRIA.fps.toFixed(1) : null })")
    if st["gate"] != "none" or not st["game"]:
        raise SystemExit("gate did not open the shift: %r" % st)
    print("in the shift at %s fps" % st["fps"])
    pg.bring_to_front()


def drive(pg, *calls):
    """Run surface verbs, each one between real frames, and report refusals.

    The verbs are the player's own — `act` is the button the E key presses,
    `rough` is what R runs — so a refusal here is a refusal the player would get,
    and it must not pass silently into a still that then means nothing."""
    out = []
    for c in calls:
        r = pg.evaluate("() => { const I = window.INDUSTRIA; return (%s); }" % c)
        wait_frames(pg, 3, why="after " + c)
        out.append({"call": c, "result": r})
    return out


def aim(pg, eye, target):
    """Point the camera from a place at a place, in the game's own convention:
    `camera.rotation.set(pitch, yaw, 0, 'YXZ')`, forward = (-sin yaw, 0, -cos yaw)."""
    dx, dy, dz = (target[i] - eye[i] for i in range(3))
    yaw = math.atan2(-dx, -dz)
    pitch = math.atan2(dy, math.hypot(dx, dz))
    pg.evaluate("([e, y, p]) => { const I = window.INDUSTRIA;"
                " I.camp().eye.set(e[0], e[1], e[2]); I.look(y, p); }", [list(eye), yaw, pitch])
    wait_frames(pg, 4, why="after aiming")


def readout(pg, log_lines=4):
    """What the frame says, as text. The manifest carries it so a viewer can be
    told which moment a still is without trusting the filename."""
    return pg.evaluate("""(n) => {
      const t = (id) => { const e = document.getElementById(id); return e ? e.innerText.trim() : null; };
      const L = document.getElementById('log');
      const kids = L ? [...L.children] : [];
      return {
        clock: t('hClock'), gauge: t('hGauge'), floor: t('hFloor'), job: t('hJob'),
        fps: window.INDUSTRIA ? +window.INDUSTRIA.fps.toFixed(1) : null,
        log_n: kids.length,
        log_last: kids.slice(0, n).map((k) => k.innerText.trim()).reverse(),
        talk: (document.getElementById('talk') || {}).innerText || '',
        /* THE LIVE MESSAGES, recorded with every still. They are the one part of
           the frame that is a function of real time rather than of the state, so
           a still that carries more than the moment's own message is a still of a
           moment nobody stood in — and that is now visible in the manifest
           instead of only in a viewer's complaint. */
        ev: [...document.getElementById('ev').children].map((d) => d.innerText.trim())
      };
    }""", log_lines)


# ── probe ────────────────────────────────────────────────────────────────────
# How to ask whether something is on screen. `offsetParent` is the reflex and it
# is WRONG for this page: the .hud boxes are position:fixed, and a fixed element
# reports offsetParent === null however plainly it is drawn, so the first
# version of this probe read the error-budget box as hidden while it was on
# screen with 850 characters in it. Computed style plus a non-empty box is the
# fact; it is written once and used in both places that need it.
VIS = """(e) => {
  if (!e) return false;
  const s = getComputedStyle(e);
  if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}"""

PROBE_JS = """() => {
  const vis = __VIS__;
  const box = (e) => { const r = e.getBoundingClientRect();
                       return { x: r.x, y: r.y, w: r.width, h: r.height, t: r.top, b: r.bottom }; };
  const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
                         Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

  /* 1. THE TOP OF THE LOG. The column is newest-at-the-bottom, so the OLDEST
     line is pushed off the TOP, and that is where a cold viewer read a half row
     of type three times as "cut off at the top". Two things are measured, and
     the first attempt got the second one wrong: it measured the last DOM child,
     which is usually off the box entirely and therefore invisible. What matters
     is the row a viewer can actually SEE being cut, so the rows are walked from
     the bottom up and the topmost one with any visible pixels is the suspect.
     The fade depth is read out of the mask itself — the stylesheet is the fact,
     and a probe that hard-codes 24 is a probe with two derivations of one
     number in it. */
  const L = document.getElementById('log');
  const kids = [...L.children];
  const lr = L.getBoundingClientRect();
  const maskCss = getComputedStyle(L).maskImage || getComputedStyle(L).webkitMaskImage;
  const pxs = (maskCss.match(/([0-9.]+)px/g) || []).map(parseFloat);
  const fade = pxs.length ? Math.max.apply(null, pxs) : 0;
  let top_cut = null, top_row = null, hidden = 0;
  for (let i = kids.length - 1; i >= 0; i--) {
    const r = kids[i].getBoundingClientRect();
    const bot_rel = r.bottom - lr.top;
    if (bot_rel <= 0.5) { hidden++; continue; }   // pushed clear out of the box
    const cut = Math.max(0, lr.top - r.top);
    top_cut = cut;
    top_row = { i, cut: +cut.toFixed(1), visible_h: +(Math.min(r.bottom, lr.bottom)
                - Math.max(r.top, lr.top)).toFixed(1), h: +r.height.toFixed(1),
                txt: kids[i].innerText.replace(/\\s+/g, ' ').trim().slice(0, 60) };
    break;
  }
  const log = {
    n: kids.length, h: lr.height, cap: parseFloat(getComputedStyle(L).maxHeight),
    mask: maskCss, fade: fade, hidden: hidden,
    top_cut: top_cut === null ? 0 : top_cut, top_row,
    oldest_txt: kids.length ? kids[kids.length - 1].innerText.trim().slice(0, 60) : null,
  };

  /* 2. THE NUMBER BOXES. Every row is label left, value right, and the two must
     not share a pixel: a collision is how `you expect` and its value were once
     read back as the single word `expector`. `.wide` rows stack on purpose. */
  const rows = [];
  for (const id of ['panel', 'cutpanel', 'budget']) {
    const root = document.getElementById(id);
    if (!vis(root)) continue;
    for (const r of root.querySelectorAll('.row')) {
      const wide = r.classList.contains('wide');
      const kids2 = [...r.children];
      let worst = 0, who = null;
      for (let i = 0; i < kids2.length; i++) for (let j = i + 1; j < kids2.length; j++) {
        const a = inter(box(kids2[i]), box(kids2[j]));
        if (a > worst) { worst = a; who = kids2[i].innerText.trim() + ' | ' + kids2[j].innerText.trim(); }
      }
      /* Does the value run out of its row? Measured rect-against-content-box and
         NOT `scrollWidth - clientWidth`, which was the first attempt and was
         quietly wrong twice: a flex item reports a real clientWidth, but
         `.row.wide` is `display:block`, so its span goes back to being inline —
         and an inline element reports clientWidth 0, which made the span's own
         width (266 px) read as overflow. The rect is the laid-out truth for both
         and it is the same measurement in both cases. */
      const span = r.querySelector('span');
      const rr = r.getBoundingClientRect(), rs = getComputedStyle(r);
      const inner = { left: rr.left + (parseFloat(rs.borderLeftWidth) || 0) + (parseFloat(rs.paddingLeft) || 0),
                      right: rr.right - (parseFloat(rs.borderRightWidth) || 0) - (parseFloat(rs.paddingRight) || 0) };
      const sr = span ? span.getBoundingClientRect() : null;
      /* THE TWO CHECKS THAT CAN SEE AN ELLIPSIS. `overflow:hidden` with
         `text-overflow:ellipsis` does not overflow — it hides, and reports a
         scrollWidth equal to its clientWidth — so eleven labels ending in `…`
         mid-word (`Tool deflecti…`, `speed …`) passed every assertion above
         while a viewer read the boxes and said "clipped". `scrollWidth -
         clientWidth` on the LABEL measures the hidden part; the ROW's own
         scrollWidth catches content that walks out of the box, inline span
         included, which the `.wide` rows did by 266 px with nothing flagged. */
      const lab = r.querySelector(':scope > i');
      const row_over = +Math.max(0, r.scrollWidth - r.clientWidth).toFixed(1);
      rows.push({
        box: id, wide, txt: r.innerText.replace(/\\s+/g, ' ').trim().slice(0, 70),
        overlap_px2: +worst.toFixed(1), overlap_who: who,
        span_overflow_px: sr ? +Math.max(0, sr.right - inner.right, inner.left - sr.left).toFixed(1) : 0,
        lab_clip_px: lab ? +Math.max(0, lab.scrollWidth - lab.clientWidth).toFixed(1) : 0,
        lab_ellipsis: lab ? getComputedStyle(lab).textOverflow : 'n/a',
        lab_txt: lab ? lab.innerText.replace(/\\s+/g, ' ').trim().slice(0, 44) : '',
        row_over_px: row_over,
        font: getComputedStyle(r).fontSize,
      });
    }
  }
  /* 2b. A BOX THAT HIDES ITS OWN BOTTOM EDGE. `#budget` is `overflow:hidden`
     between the job header and the log, and its own stylesheet comment says the
     column has less height than its content wants — at which point the last rows
     are simply not there. A clipped row inside a hidden-overflow box is
     invisible and silent, which is the shape of defect this file exists to
     catch, so it is measured rather than assumed. */
  const boxes = {};
  for (const id of ['panel', 'cutpanel', 'budget']) {
    const root = document.getElementById(id);
    if (!vis(root)) continue;
    boxes[id] = { clip_px: +Math.max(0, root.scrollHeight - root.clientHeight).toFixed(1),
                  h: root.clientHeight, scroll_h: root.scrollHeight };
  }

  /* 3. THE PANEL BACKDROP. At .82 the shop's own DIAL/SPINDLE signage read
     through the machine panel, which is what `ghosted` in two viewer reports
     turned out to be. Measured as the computed alpha, because the value is the
     claim — a hand-set alpha in a stylesheet is one edit away from coming back. */
  const p = document.getElementById('panel');
  const bg = getComputedStyle(p).backgroundColor;
  const m = bg.match(/rgba?\\(([^)]+)\\)/);
  const parts = m ? m[1].split(',').map(Number) : [];
  const panel = { bg, alpha: parts.length === 4 ? parts[3] : 1, on: vis(p) };

  const hint = document.getElementById('hint');
  const hs = hint ? getComputedStyle(hint) : null;
  return {
    viewport: [innerWidth, innerHeight], log, rows, boxes, panel,
    hint: hs ? { color: hs.color, shadow: hs.textShadow, font: hs.fontSize,
                 txt: hint.innerText.trim().slice(0, 60) } : null,
  };
}"""


def probe(pg):
    """Drive the widest panel state, then measure. The state is widest for a
    reason: rows only collide when a value is long, and the not-yet-stated
    prediction is the longest value the machine panel ever holds.

    The first version of this measured whatever happened to be on screen after
    entering the shift, which is nothing: `#panel`, `#cutpanel` and `#budget`
    all hang off `machinePanel()`, and that shows them only when the player is
    standing at the machine. The row results came back empty and the run said
    PASS. An empty list passing every loop over it is the exact shape of check
    this repo has been burned by, so this now walks to the machine, mounts a
    bar, and asserts the three boxes were on before it believes any row."""
    drive(pg,
          "I.tool('bar20')", "I.fetchBlank()", "I.act('Holding fixture')",
          "I.rough()",
          "I.act('Finished-part rack')", "I.act('Hallam Couriers')", "I.act('Chip tray')",
          "I.act('Scrap bin')", "I.act('Casting crate')", "I.act('Drawing')")
    aim(pg, (1.05, 1.62, -4.9), (0.0, 1.30, -6.65))  # at the machine, panels up
    shown = pg.evaluate("(ids) => { const vis = " + VIS + ";"
                        " return ids.map((id) => [id, vis(document.getElementById(id))]); }",
                        ["panel", "cutpanel", "budget"])
    off = [i for i, on in shown if not on]
    if off:
        raise SystemExit("probe is standing in the wrong place: %s not on screen (%s)"
                         % (", ".join(off), shown))

    results = {}
    for (w, h) in SIZES:
        pg.set_viewport_size({"width": w, "height": h})
        wait_frames(pg, 4, why="after resize")
        results["%dx%d" % (w, h)] = pg.evaluate(PROBE_JS.replace("__VIS__", VIS))

    fails = []
    for size, r in results.items():
        L = r["log"]
        if not (L["mask"] and "gradient" in L["mask"]):
            fails.append("%s log has no fade mask (%r)" % (size, L["mask"]))
        if L["fade"] < 8:
            fails.append("%s the log's fade band is %.0fpx — too shallow to hide a sliced"
                         " row (%s)" % (size, L["fade"], L["mask"]))
        if L["top_cut"] and L["top_cut"] > L["fade"]:
            fails.append("%s the topmost visible log line is cut %.0fpx, deeper than the %.0fpx"
                         " fade, so glyph tops are missing at full opacity: %r"
                         % (size, L["top_cut"], L["fade"], L["top_row"]))
        if L["n"] < 7:
            fails.append("%s log only has %d lines — the cap was never reached, so the tear"
                         " was not on trial" % (size, L["n"]))
        for row in r["rows"]:
            if row["overlap_px2"] > 1 and not row["wide"]:
                fails.append("%s %s row overlaps by %.1f px²: %s"
                             % (size, row["box"], row["overlap_px2"], row["overlap_who"] or row["txt"]))
            if row["span_overflow_px"] > 2:
                fails.append("%s %s value runs %.0fpx out of its box: %s"
                             % (size, row["box"], row["span_overflow_px"], row["txt"]))
            if row["lab_clip_px"] > 1:
                fails.append("%s %s label is cut %.0fpx (text-overflow: %s%s): %r"
                             % (size, row["box"], row["lab_clip_px"], row["lab_ellipsis"],
                                " — an ellipsis hides it instead of overflowing it"
                                if row["lab_ellipsis"] == "ellipsis" else "",
                                row["lab_txt"]))
            if row["row_over_px"] > 2:
                fails.append("%s %s row overflows by %.0fpx: %s"
                             % (size, row["box"], row["row_over_px"], row["txt"]))
            if float(row["font"].replace("px", "")) < 11:
                fails.append("%s %s row is %s" % (size, row["box"], row["font"]))
        for bid, bx in r["boxes"].items():
            if bx["clip_px"] > 2:
                fails.append("%s #%s hides %.0fpx of its own content (client %d, scroll %d)"
                             % (size, bid, bx["clip_px"], bx["h"], bx["scroll_h"]))
        per_box = {}
        for row in r["rows"]:
            per_box[row["box"]] = per_box.get(row["box"], 0) + 1
        for box in ("panel", "cutpanel", "budget"):
            if not per_box.get(box):
                fails.append("%s no rows were measured in #%s — the box was empty, so its"
                             " rows were never on trial" % (size, box))
        if len(r["rows"]) < 8:
            fails.append("%s only %d rows measured in total (%s) — the widest state was"
                         " not reached" % (size, len(r["rows"]), per_box))
        if r["panel"]["alpha"] < 0.9:
            fails.append("%s machine panel backdrop is %s" % (size, r["panel"]["bg"]))
        if r["hint"] and (not r["hint"]["shadow"] or r["hint"]["shadow"] == "none"):
            fails.append("%s #hint has no shadow — it sits on the 3D view, not in .hud" % size)
    return results, fails


# ── logtest ──────────────────────────────────────────────────────────────────
def logtest(pg):
    """One look, one line: press the widest look twice and count."""
    drive(pg, "I.act('Chip tray')")  # a warm-up look, so the rack's two lines are not the first
    before = pg.evaluate("() => ({ kids: document.getElementById('log').children.length,"
                         " seq: window.INDUSTRIA.recStats() ? window.INDUSTRIA.recStats().seq : null })")
    drive(pg, "I.act('Finished-part rack')")
    first = pg.evaluate("() => ({ kids: document.getElementById('log').children.length,"
                        " seq: window.INDUSTRIA.recStats() ? window.INDUSTRIA.recStats().seq : null })")
    drive(pg, "I.act('Finished-part rack')")
    second = pg.evaluate("() => ({ kids: document.getElementById('log').children.length,"
                         " seq: window.INDUSTRIA.recStats() ? window.INDUSTRIA.recStats().seq : null })")
    got = drives = None
    got = pg.evaluate("() => [...document.getElementById('log').children].map((k) => k.innerText.trim())")
    out = {"n0": before["kids"], "n1": first["kids"], "n2": second["kids"],
           "seq0": before["seq"], "seq1": first["seq"], "seq2": second["seq"],
           "added_first": first["kids"] - before["kids"],
           "added_second": second["kids"] - first["kids"],
           "lines": got}
    fails = []
    if out["added_first"] < 1:
        fails.append("the rack look printed nothing (%d -> %d)" % (before["kids"], first["kids"]))
    if out["added_second"] != 0:
        fails.append("a second identical look added %d lines — the column is repeating itself"
                     % out["added_second"])
    if out["seq0"] is not None and out["seq2"] <= out["seq1"]:
        fails.append("the SESSION RECORD did not take the second look (%s -> %s): the column is"
                     " allowed to drop a line, the record is not" % (out["seq1"], out["seq2"]))
    return out, fails


# ── capture ──────────────────────────────────────────────────────────────────
# Ten moments of ONE shift, in the order a machinist lives them. Every still names
# the ground it stands on and the thing it looks at; nothing here is a state
# portrait, which is what the last set was and why its numbers looked to disagree.
SHOTS = [
    dict(n="01", title="the shop from the door", drive=[],
         eye=(4.5, 1.68, -16.0), target=(0.0, 1.60, -7.0),
         note="the room as you walk in: the machine under its light, the bench, the rack"),
    dict(n="02", title="the drawing on the wall", drive=["I.act('Drawing')"],
         eye=(0.6, 1.62, -15.86), target=(0.6, 1.62, -16.58),
         note="the job as the customer draws it, before anything has been cut —"
              " read the way a machinist reads one: standing at it. From 2 m the"
              " 0.9 m sheet is a thumbnail in a black door and its own dimensions"
              " are 4 px of type, which is what two cold-viewer rounds reported"),
    dict(n="03", title="the casting crate", drive=["I.act('Casting crate')"],
         eye=(3.4, 1.60, -3.4), target=(3.4, 0.90, -5.3),
         note="the stock on the floor, at the count the HUD is reporting"),
    dict(n="04", title="the bar in the machine, nothing decided", drive=[
            "I.tool('bar20')", "I.fetchBlank()", "I.act('Holding fixture')"],
         eye=(1.05, 1.62, -4.9), target=(0.0, 1.30, -6.65),
         note="the part on the parallels, panels up — the prediction is NOT stated,"
              " so the instruction row is the one on screen"),
    dict(n="05", title="the calipers in your hand", drive=["I.act('Vernier calipers')"],
         eye=(2.75, 1.60, -4.35), target=(2.15, 0.95, -5.95),
         note="held at READING DISTANCE, ~0.24 m from the eye, a little right and"
              " below centre, the scale face tipped 28° square-ish to the eye —"
              " the way a machinist actually reads one, not at arm's length (the"
              " 0.51 m pose failed the read twice: seven-pixel numerals, striped"
              " ruling). Four fingers cross the bar as arched tubes — crown above"
              " and in front of it, tip below — each tube running diagonally across"
              " the bright scale so its length reads and not just its tip; the thumb"
              " crosses the same way, its lit tip on the thumbwheel under the lower"
              " edge; the heel of the hand sits behind the bar and the forearm"
              " leaves the frame by the bottom edge, the sleeve opening at the"
              " wrist. The hand carries its own lamp (the glove's own, one recipe"
              " for both), set below the fingers — at this pose the eye looks at"
              " the undersides of the tubes, which a lamp above them never lights."
              " The fork hangs down at"
              " the left end of the beam, in the scale's own plane, gapped 5 mm —"
              " the same 5 the slider's zero edge rides at. Behind them the"
              " machine's own bench with the traveler still on it and the machine at"
              " its shoulder — the bench the words always promised. Generations of"
              " this shot framed a bare spot a metre above open concrete where the"
              " tools floated on pendant-cell numbers, which is what a cold viewer"
              " read as the shop lying"),
    dict(n="06", title="the pendant", drive=[], eye=(1.75, 1.62, -3.4), target=(1.75, 1.58, -5.50),
         note="the controls and the machine state in one frame, which is where the"
              " last set's text was reported cut off and interleaved"),
    dict(n="07", title="the roughing pass", drive=["I.rough()"],
         eye=(1.2, 1.62, -3.6), target=(0.0, 1.45, -6.9),
         note="after the pass: the log's own line for it, and the machine still running"),
    dict(n="08", title="the readout after the pass", drive=["I.act('Machine control — pendant')"],
         eye=(-1.6, 1.62, -4.4), target=(0.2, 1.35, -6.6),
         note="from the other side, so the error budget is the near column"),
    dict(n="09", title="the gauge", drive=["I.measure()"],
         eye=(1.4, 1.62, -4.6), target=(0.1, 1.32, -6.6),
         note="the reading, with the clock that says when it was taken"),
    dict(n="10", title="the part in hand", drive=[
            "I.ship()", "I.act('Finished-part rack')", "__CLICK_PICKUP__"],
         eye=(2.6, 1.62, -1.0), target=(0.4, 1.35, -6.9),
         note="the bore the customer will measure, in the glove, panels off"),
]


# A STILL IS A MOMENT A PLAYER COULD STAND IN. The messages along the top are
# toasts with lives of 3800, 4200 and 5200 ms, and this driver fires a shot's
# whole action list back-to-back and photographs the frame 0.1 s later — so three
# of them sat in one still at once, and a cold viewer read the set as the game
# contradicting itself: "You have not measured it yet" beside GAUGE 039.9414, and
# the set's own text "covered by tooltips". The measurement was real and so was
# the message; the timeline was not. Timed on the page: the bar-in message is
# 3800 ms old, the measurement lands at 300 ms, the last toast is gone at 6.0 s
# and the gauge still reads what it read. So the driver stands still for longer
# than the longest message lives before each shot, and the still then carries at
# most the one message that moment itself produced — which is what a player
# standing there sees.
SETTLE_MS = 6000


def capture(pg, out):
    out.mkdir(parents=True, exist_ok=True)
    pg.set_viewport_size({"width": SIZES[0][0], "height": SIZES[0][1]})
    wait_frames(pg, 3, why="before the set")
    manifest = {"build_sha256": build_sha(), "viewport": list(SIZES[0]),
                "url": BASE + "/index.html", "shots": []}
    for s in SHOTS:
        # stand still first, then do the shot's own thing (see SETTLE_MS)
        pg.wait_for_timeout(SETTLE_MS)
        wait_frames(pg, 3, why="after the settle before shot " + s["n"])
        for c in s["drive"]:
            if c == "__CLICK_PICKUP__":
                n0 = pg.evaluate("() => window.INDUSTRIA.camera.children.length")
                pg.click("#talk .opt:has-text('Pick up')")
                wait_frames(pg, 4, why="after the pickup")
                n1 = pg.evaluate("() => window.INDUSTRIA.camera.children.length")
                if n1 <= n0:
                    raise SystemExit("shot %s: the pickup button did not put anything in hand"
                                     " (camera children %d -> %d)" % (s["n"], n0, n1))
                continue
            r = drive(pg, c)[0]
            if c in ("I.rough()", "I.ship()", "I.measure()"):
                print("   %s -> %r" % (c, r["result"]))
        aim(pg, s["eye"], s["target"])
        wait_frames(pg, 4, why="before shot " + s["n"])
        path = out / ("%s-%s.png" % (s["n"], s["title"].replace(" ", "-")))
        pg.screenshot(path=str(path))
        wait_frames(pg, 1, why="after shot " + s["n"])
        row = readout(pg)
        row.update({"n": s["n"], "file": path.name, "title": s["title"], "note": s["note"],
                    "eye": list(s["eye"]), "target": list(s["target"])})
        manifest["shots"].append(row)
        print("   %s %-34s %s  %s  msgs=%d" % (s["n"], s["title"], row.get("clock"),
                                               row.get("gauge"), len(row.get("ev") or [])))
    (out / "review-set.json").write_text(json.dumps(manifest, indent=1))
    return manifest


# ── main ─────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["probe", "logtest", "capture"])
    ap.add_argument("--out", default=str(REPO.parent / "industria-visual-pass" / "after-5"))
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright
    box = []
    serve_up(box)
    print("build %s · %s" % (build_sha()[:12], BASE))
    errors = []
    try:
        with sync_playwright() as pw:
            exe = resolve_chrome()
            if exe:
                print("chrome %s" % exe)
                br = pw.chromium.launch(executable_path=exe, headless=False, args=LAUNCH_ARGS)
            else:
                print("no system Chrome — falling back to playwright's chromium")
                br = pw.chromium.launch(headless=False, args=LAUNCH_ARGS)
            pg = br.new_page(viewport={"width": SIZES[0][0], "height": SIZES[0][1]},
                             device_scale_factor=1)
            # One error is expected and is not the page's fault: pointer lock
            # needs a real user gesture, and a click driven over CDP is not one,
            # so the browser refuses it and says so. The shift opens anyway
            # (enter() asserts that it did), so this specific message is set
            # aside and every other page error still fails the run.
            IGNORE = "not valid for pointer lock"
            pg.on("pageerror", lambda e: errors.append(str(e)) if IGNORE not in str(e) else None)
            enter(pg, rec=(a.what == "logtest"))
            if a.what == "probe":
                res, fails = probe(pg)
                for size, r in res.items():
                    L = r["log"]
                    print("\n%s  panel %s" % (size, r["panel"]["bg"]))
                    tr = L["top_row"]
                    print("  log: %d lines, cap %.0fpx, drawn %.0fpx, %d rows pushed clear,"
                          " fade %.0fpx" % (L["n"], L["cap"], L["h"], L["hidden"], L["fade"]))
                    print("       topmost visible row cut %.1fpx of %.1fpx tall, %.1fpx showing: %r"
                          % (tr["cut"], tr["h"], tr["visible_h"], tr["txt"]) if tr else
                          "       nothing visible in the log")
                    print("  hint: %s / shadow %s" % (r["hint"]["color"], r["hint"]["shadow"][:40]))
                    boxes = {}
                    for row in r["rows"]:
                        boxes[row["box"]] = boxes.get(row["box"], 0) + 1
                    print("  %d rows measured (%s)" % (len(r["rows"]),
                          ", ".join("%s %d" % kv for kv in sorted(boxes.items()))))
                    worst_lab = max((x["lab_clip_px"] for x in r["rows"]), default=0)
                    print("  worst label cut %.1fpx · worst row overflow %.1fpx · box clip %s"
                          % (worst_lab, max((x["row_over_px"] for x in r["rows"]), default=0),
                             ", ".join("%s %.1fpx" % (k, v["clip_px"])
                                       for k, v in sorted(r["boxes"].items()))))
                    for row in r["rows"]:
                        print("  %-9s %-5s ov %4.1f  val-out %3.0f  lab-cut %4.1f  row-over %4.1f  %s"
                              % (row["box"], "wide" if row["wide"] else "", row["overlap_px2"],
                                 row["span_overflow_px"], row["lab_clip_px"],
                                 row["row_over_px"], row["txt"]))
                print("\nPROBE %s" % ("PASS" if not fails else "FAIL"))
                for f in fails:
                    print("  ! " + f)
                code = 1 if fails else 0
            elif a.what == "logtest":
                out, fails = logtest(pg)
                print(json.dumps(out, indent=1))
                print("\nLOGTEST %s" % ("PASS" if not fails else "FAIL"))
                for f in fails:
                    print("  ! " + f)
                code = 1 if fails else 0
            else:
                m = capture(pg, Path(a.out))
                print("\n%d stills + review-set.json in %s" % (len(m["shots"]), a.out))
                code = 0
            if errors:
                print("\nPAGE ERRORS (%d):" % len(errors))
                for e in errors[:10]:
                    print("  ! " + e)
                code = code or 1
            br.close()
    finally:
        for p in box:
            p.terminate()
    sys.exit(code)


if __name__ == "__main__":
    main()
