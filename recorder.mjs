/**
 * INDUSTRIA — the session recorder.
 *
 * ── WHAT THIS IS ──────────────────────────────────────────────────────────
 * A playtest is worthless if all it returns is "they seemed to like it".
 * This module turns one human session into a machine-readable event log so
 * that a later tool can answer *factual* questions about what happened:
 * when they acted, what they measured, what they ignored, whether they came
 * back for another part.
 *
 * ── HOW IT STAYS OUT OF THE WAY ───────────────────────────────────────────
 * It is OFF unless the URL asks for it (`?rec=1` or `?rec=<label>`). The
 * public game at https://foshowithit.github.io/industria/ has no query
 * string, so it loads this file, reads `isRecording()` → false, and then
 * does exactly nothing: no timers, no listeners, no output, no cost.
 *
 * It never touches the DOM, never writes to the console, never renders.
 * The player experience is byte-for-byte the same with the recorder armed;
 * the only difference is that events are appended to an in-memory array and
 * flushed to disk every few seconds.
 *
 * ── THE HONESTY RULE THIS MODULE OBEYS ────────────────────────────────────
 * `measure` events carry BOTH the gauge reading AND the true value. That is
 * deliberate and it is not a leak: the recorder writes to a file, not to the
 * screen. The reading is what the player saw; `true_mm` is what was actually
 * there. The gap between them is the game's whole lesson, and it is exactly
 * the thing a playtest must be able to quantify. `r1_leakwatch.py` still
 * guards the screen; this guards the evidence.
 */

export const RECORDER_VERSION = '1.0.0';

/* ── WHEN TO RECORD ──────────────────────────────────────────────────────── */
const QS = new URLSearchParams(globalThis.location ? globalThis.location.search : '');

/** The raw flag: `null` when absent, `''` when bare, or the label given. */
export const REC_LABEL = QS.has('rec') ? (QS.get('rec') || 'session') : null;

/** True only when the URL asked for a recording. Cheap — safe to call often. */
export const isRecording = () => REC_LABEL !== null;

/** Where the JSONL goes. Overridable so a runner can name the file. */
const REC_ENDPOINT = QS.get('rec_endpoint') || '/__rec';

/* ── THE FLUSH: this is the only place the network is touched ───────────── */
/* A `fetch` POST, not `sendBeacon`: sendBeacon cannot set a header, and the
   receiver keys the file off `X-Rec-Label`. The receiver is the local Python
   runner. If it is not there — the public game, a file:// open — every call
   fails into the `.catch` and is swallowed. Nothing is retried forever: a
   failed flush puts its lines back at the FRONT of the pending queue so the
   ordering survives, and gives up only after a fixed number of attempts. */
let pending = [];
let flushTimer = null;
let failedFlushes = 0;
const FLUSH_MS = 4000;
const MAX_FAILED_FLUSHES = 3;

function flush(force = false) {
  if (!pending.length) return;
  const body = pending.join('');
  /* Persist FIRST and unconditionally, then clear. Doing the append before the
     queue is emptied is what makes two separate failure modes impossible:
     a row that is only ever in `pending` (new events after the network gave
     up) still reaches the store, and a row that gets re-queued for a network
     retry cannot be appended twice. Order matters here; reversing these two
     loses rows on the public url, where the POST can never succeed. */
  lsAppend(body);
  pending = [];
  if (!force && failedFlushes >= MAX_FAILED_FLUSHES) return;
  try {
    fetch(REC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson', 'X-Rec-Label': REC_LABEL },
      body,
      keepalive: true,
    }).then((r) => {
      if (!r.ok) throw new Error('rec flush ' + r.status);
      failedFlushes = 0;
    }).catch(() => {
      failedFlushes += 1;
      /* Put the lines back ONLY while the network is still worth retrying.
         Past the limit the rows are already durable in localStorage, and
         re-queueing them means the next flush appends them to localStorage a
         SECOND time — the store would carry duplicates of every row and the
         file would look longer than the session was. */
      if (failedFlushes < MAX_FAILED_FLUSHES) {
        pending.unshift(body);
        if (pending.join('').length > 2_000_000) pending = pending.slice(-8);
      }
    });
  } catch (e) {
    failedFlushes += 1;
    if (failedFlushes < MAX_FAILED_FLUSHES) pending.unshift(body);
  }
}

/* Browsers drop in-flight requests when the tab closes. A recorder whose last
   ten seconds are missing is a recorder that cannot see the ship/scrap event,
   which is the single most important line in the file. A one-shot synchronous
   beacon on `pagehide` is the only channel that survives that. */
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('pagehide', () => {
    if (!pending.length) return;
    /* Persist before the beacon. On the public url the beacon cannot succeed,
       and the rows in hand at pagehide are the LAST ones — the ship event,
       which is the most important line in the file. Losing those to a doomed
       sendBeacon would make the offline transport useless exactly when it
       matters most. */
    lsAppend(pending.join(''));
    try {
      const blob = new Blob([pending.join('')], { type: 'application/x-ndjson' });
      const sent = navigator.sendBeacon &&
        navigator.sendBeacon(REC_ENDPOINT, blob);
      if (sent) pending = [];
    } catch (e) { /* nothing better available; the periodic flush already ran */ }
    pending = [];
  });
}

/* ── OFFLINE CAPTURE (the public build's only transport) ─────────────────────
 * The POST above reaches a local Python runner. On the PUBLIC url there is no
 * such runner: `/__rec` is somebody else's 404 and every event dies in the
 * `.catch`. That made the field kit's one hard requirement "run a local server
 * and play localhost" — which is a real barrier between the project and the
 * only evidence class it cannot automate.
 *
 * So every row is ALSO appended to localStorage, and the player can export the
 * .jsonl when they are done. No server, no Python, no instructions to follow,
 * nothing to install: open the published URL with ?rec= and play.
 *
 * localStorage is the right home for this and not a hack: it is synchronous,
 * it survives a tab close, it is per-origin, and a session that never leaves
 * the machine records nothing about anyone else. A player who plays the public
 * build with no ?rec= still writes nothing at all — the guard is `isRecording`.
 *
 * Quota is the one real risk: a long session is a few hundred KB of JSONL and
 * localStorage is ~5 MB. So the store is capped and the DROP IS RECORDED rather
 * than silent — a truncated log that looks complete is exactly the failure this
 * project keeps re-committing. */
const LS_KEY = REC_LABEL === null ? null : 'industria.rec.' + REC_LABEL;
const LS_MAX_BYTES = 3_000_000;
let lsDropped = 0;
let lsFailing = false;
/* Idempotence, and it is not optional. A row can be handed to `lsAppend` more
   than once: the network re-queue puts a body back in `pending`, and the fetch
   failure that triggers it is ASYNCHRONOUS — so it lands after the synchronous
   append, which means the next flush appends the same rows a second time. The
   first version of this file produced a 46-row session that exported as 92
   rows, 44 of them duplicates: a log that over-reports itself, which is the
   same class of lie as one that truncates.
   Tracking which seqs are already durable makes the multiple submission paths
   harmless instead of trying to prove there is only one. */
const lsWritten = new Set();

function lsAppend(body) {
  if (LS_KEY === null || lsFailing) return;
  const lines = body.split('\n').filter(Boolean);
  const fresh = [];
  for (const line of lines) {
    let seq = null;
    try { seq = JSON.parse(line).seq; } catch (e) { seq = null; }
    /* A line with no parseable seq is kept — unparseable is not the same as
       already-written, and dropping it would hide a real row. */
    if (seq === null || !lsWritten.has(seq)) {
      fresh.push(line);
      if (seq !== null) lsWritten.add(seq);
    }
  }
  if (!fresh.length) return;
  const out = fresh.join('\n') + '\n';
  try {
    const store = globalThis.localStorage;
    if (!store) return;
    const cur = store.getItem(LS_KEY) || '';
    if (cur.length + out.length > LS_MAX_BYTES) {
      /* Count what we are losing so the export can say so out loud. */
      lsDropped += fresh.length;
      return;
    }
    store.setItem(LS_KEY, cur + out);
  } catch (e) {
    /* Private mode, disabled storage, quota — all of them just mean the
       network transport is the only one, which is where we started. */
    lsFailing = true;
  }
}

/** Force everything still buffered into localStorage, right now.
 *
 *  This exists because the heartbeat is 4 s and the thing that needs the data
 *  is not. A player who ships a part inside the first heartbeat has an empty
 *  store, so any caller that decides whether to offer them their session sees
 *  `rows: 0` and offers nothing — the exit disappears exactly for the fastest
 *  player. Measured: a full job played without waiting showed `rows: 0` until
 *  a 5 s wait; the offer was silently never made. */
export function flushLocal() {
  if (!pending.length) return localStats();
  lsAppend(pending.join(''));
  /* Only the local copy is forced. The network queue is left alone so a real
     runner still receives the rows in its own order and its own time. */
  return localStats();
}

/** How much of this session is sitting in the browser, and what was dropped. */
export function localStats() {
  if (LS_KEY === null) return null;
  let bytes = 0, rows = 0;
  try {
    const s = globalThis.localStorage ? (globalThis.localStorage.getItem(LS_KEY) || '') : '';
    bytes = s.length;
    rows = s ? s.split('\n').filter(Boolean).length : 0;
  } catch (e) { /* reported as zero */ }
  return { key: LS_KEY, bytes, rows, dropped: lsDropped, failing: lsFailing };
}

/** The whole session as text, with an honest header about anything lost. */
export function localDump() {
  if (LS_KEY === null) return null;
  let body = '';
  try { body = globalThis.localStorage ? (globalThis.localStorage.getItem(LS_KEY) || '') : ''; }
  catch (e) { return null; }
  const st = localStats();
  return JSON.stringify({
    type: 'export_note', exported_iso: new Date().toISOString(),
    rows: st.rows, bytes: st.bytes, dropped_rows: lsDropped,
    note: lsDropped > 0
      ? 'INCOMPLETE: storage quota was hit and ' + lsDropped + ' rows were not kept. Do not read this as a whole session.'
      : 'Complete as far as the browser knows.',
  }) + '\n' + body;
}

/** Hand the session back to the player as a file. Returns what it did. */
export function downloadLocal() {
  const text = localDump();
  if (text === null) return { ok: false, why: 'not recording' };
  try {
    const blob = new Blob([text], { type: 'application/x-ndjson' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (sessionId || 'industria') + '.jsonl';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    const st = localStats();
    return { ok: true, filename: a.download, rows: st.rows, dropped: lsDropped };
  } catch (e) {
    return { ok: false, why: String(e && e.message || e) };
  }
}

/* ── THE CLOCK ───────────────────────────────────────────────────────────── */
const T0 = (globalThis.performance && performance.now)
  ? performance.now() : Date.now();

/** Real milliseconds since the recorder was constructed. Monotonic. */
export const wallMs = () =>
  (globalThis.performance && performance.now ? performance.now() : Date.now()) - T0;

/* ── THE LOG ─────────────────────────────────────────────────────────────── */
let seq = 0;
const sessionId = REC_LABEL === null ? null :
  REC_LABEL + '-' + new Date().toISOString().replace(/[:.]/g, '-');

function emit(type, data = {}) {
  if (!isRecording()) return;
  const row = { seq: seq++, wall_ms: Math.round(wallMs()), t_iso: new Date().toISOString(), type, ...data };
  try { pending.push(JSON.stringify(row) + '\n'); } catch (e) { return; }
  if (!flushTimer) {
    /* First event of the session starts the heartbeat. `setInterval` on a
       recorder that never records would be a permanent cost on the public
       build, which is why this is inside the guard. */
    flushTimer = setInterval(() => flush(false), FLUSH_MS);
  }
}

/** Header line. Written once, when the world is ready, never before. */
export function sessionStart({ game, clocks, url, ua, viewport, fps }) {
  emit('session_start', {
    recorder_version: RECORDER_VERSION,
    session_id: sessionId,
    label: REC_LABEL,
    url: url ?? (globalThis.location ? location.href : null),
    ua: ua ?? (globalThis.navigator ? navigator.userAgent : null),
    viewport: viewport ?? { w: globalThis.innerWidth, h: globalThis.innerHeight },
    device_pixel_ratio: globalThis.devicePixelRatio ?? null,
    /* The fixed problem, so the analysis never has to guess what they solved. */
    problem: game ? {
      job_id: game.job.id, title: game.job.title, client: game.job.client,
      material: game.job.material, machine: game.job.machine,
      nominal_mm: game.job.nominal_mm, grade: game.job.grade,
      start_hole_dia_mm: game.job.start_hole_dia_mm,
      band_low_mm: game.job.band_low_mm, band_high_mm: game.job.band_high_mm,
      band_width_um: (game.job.band_high_mm - game.job.band_low_mm) * 1000,
      deadline_min: game.job.deadline_min,
    } : null,
    thermal_constants: game ? { ...game.thermal } : null,
    /* Stated plainly so a reader of the JSONL knows what these numbers are. */
    note: 'wall_ms is monotonic from recorder construction; clock_min is the ' +
          'kernel game clock; truth_* fields are the kernel state the player ' +
          'could NOT see. This file is evidence, not a screen.',
  });
}

/** One player action. `act` is the verb; extras are whatever is true of it. */
export const action = (act, extra = {}) =>
  emit('action', { act, ...extra });

/** An action that could not happen, and why — a wrong turn, factually. */
export const refusal = (act, why, extra = {}) =>
  emit('refusal', { act, why, ...extra });

/* ── MEASUREMENT: reading AND truth, side by side ────────────────────────── */
export function measurement({ reading_mm, sigma_um, hotDia_mm, coldDia_mm, partC, tool, job, seq_index, clock_min }) {
  emit('measure', {
    reading_mm,                       // what the player saw
    sigma_um,
    true_cold_mm: coldDia_mm,         // what was actually there
    true_hot_mm: hotDia_mm,           // what the gauge was actually touching
    reading_err_um: reading_mm != null && coldDia_mm != null
      ? (reading_mm - coldDia_mm) * 1000 : null,
    partC,
    part_growth_um: coldDia_mm != null && hotDia_mm != null
      ? (hotDia_mm - coldDia_mm) * 1000 : null,
    offset_from_nominal_um: reading_mm != null && job
      ? (reading_mm - job.nominal_mm) * 1000 : null,
    stock_to_band_top_um: reading_mm != null && job
      ? (job.band_high_mm - reading_mm) * 1000 : null,
    clock_min,
    measure_index: seq_index,
    tool,
  });
}

/* ── A CUT: dial in, metal out, and the surplus between them ─────────────── */
export function cut({ rec, coldDia_before_mm, coldDia_after_mm, clock_min, pass_index }) {
  const removed_dia_um = coldDia_before_mm != null && coldDia_after_mm != null
    ? (coldDia_after_mm - coldDia_before_mm) * 1000 : null;
  /* THE SURPLUS. `bite_cmd_um` is what the DIAL promised on the radius;
     `bite_realised_um` is what the bar actually removed. In this build the
     realised value is SMALLER than the command — the edge is pushed back by
     tool sag and thermal growth, so every number the player dials delivers
     slightly less metal than it says. The gap is therefore NEGATIVE and
     roughly CONSTANT (measured at −6.3 µm over eight passes in the self-test,
     sd 0.06). Nothing here asserts that direction: both operands are logged
     raw, so a later reader can see the sign for themselves and test the
     constancy claim on real player data rather than take it on trust. */
  const surplus_um = rec && rec.bite_realised_um != null && rec.bite_cmd_um != null
    ? rec.bite_realised_um - rec.bite_cmd_um : null;
  emit('cut', {
    pass: pass_index,
    dial_um: rec ? rec.bite_cmd_um : null,
    removed_radius_um: rec ? rec.bite_realised_um : null,
    removed_dia_um,
    surplus_um,
    surplus_pct_of_dial: rec && rec.bite_cmd_um ? (surplus_um / rec.bite_cmd_um) * 100 : null,
    coldDia_before_mm, coldDia_after_mm,
    cut_min: rec ? rec.cut_min : null,
    power_kW: rec ? rec.power_kW : null,
    n_rpm: rec ? rec.n_rpm : null,
    force_N: rec ? rec.force_N : null,
    sag_um: rec ? rec.sag_um : null,
    verdict: rec ? rec.verdict : null,
    clock_min,
  });
}

/** A cut that the kernel refused. Rubbing, no stock, no tool — all real. */
export const cutRefused = (why, { dial_um, clock_min, detail } = {}) =>
  emit('cut_refused', { why, dial_um, clock_min, detail });

/* ── THE SHIP / SCRAP EVENT ──────────────────────────────────────────────── */
export function shipEvent({ verdict, true_cold_mm, last_reading_mm, job, net, late, passes, shots, clock_min }) {
  emit('ship', {
    verdict,
    true_cold_mm,
    err_um: true_cold_mm != null && job ? (true_cold_mm - job.nominal_mm) * 1000 : null,
    last_reading_mm,
    gauge_err_um: last_reading_mm != null && true_cold_mm != null
      ? (last_reading_mm - true_cold_mm) * 1000 : null,
    net, late, passes, shots, clock_min,
  });
}

/* ── HINTS AND SPEECH: what the player was shown, and what they answered ─── */
/** A line the game put in front of the player. `kind` names the channel. */
export function hint({ kind, who, text, is_question, options }) {
  emit('hint_shown', {
    kind, who,
    /* Whitespace-collapsed, truncated: enough to identify the line in a
       transcript, not enough to become a second copy of the script. */
    text: typeof text === 'string' ? text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) : null,
    is_question: !!is_question,
    options: options ? options.map((o) => String(o).slice(0, 80)) : null,
  });
}

/** The player answered a question the game asked — a real decision point. */
export const choice = (label, context = {}) =>
  emit('choice', { label: String(label).slice(0, 120), ...context });

/** The player used the on-screen hint line (bottom bar / key legend). This is
 *  the ONLY honest way to know a hint was consulted rather than ignored. */
export const hintUsed = (which, extra = {}) =>
  emit('hint_used', { which, ...extra });

/* ── HEARTBEAT: the denominator for hesitation ───────────────────────────── */
/** Sampled on a slow timer. Lets the analysis distinguish "did not understand"
 *  from "was never asked": an idle run during which no question was on screen
 *  is a different failure from an idle run during which one was. */
export function sample({ clock_min, phase, looking_at, prompt_visible, prompt_text, say_visible, keys_held, money, history_len, measurements, tool }) {
  emit('sample', {
    clock_min, phase, looking_at,
    prompt_visible, say_visible,
    prompt_text: prompt_text ? String(prompt_text).replace(/\s+/g, ' ').trim().slice(0, 120) : null,
    keys_held: keys_held ? keys_held.slice(0, 6) : [],
    money, history_len, measurements, tool,
  });
}

/* ── SECOND PART: the existential question ───────────────────────────────── */
export function secondPart({ started, seconds_since_first_end, verbatim }) {
  emit('second_part', { started, seconds_since_first_end, verbatim: verbatim ?? null });
}

/* ── THE POST-SHIP WINDOW — the strongest single signal in the round ────────
 *
 * The field manual is explicit: after the part ships the observer says NOTHING
 * for five seconds and watches what the player does. "MORE" is voluntary
 * continuation, detected BEHAVIOURALLY. Asking "would you play more?" is
 * leading and a polite player will say yes, so the behaviour is the evidence.
 *
 * The observer cannot log this: they are watching a face, not a keyboard, and
 * five seconds is too short to write in. So the recorder holds it. Whatever
 * the player actually does in that window is recorded verbatim, with timing,
 * and the analyser decides — it never has to trust a human's memory of a
 * five-second silence.
 *
 * `kind` is one of:
 *   'idle'        nothing at all — no input, no look change
 *   'look'        moved the crosshair onto something (looking around)
 *   'interact'    pressed E / acted on a thing
 *   'move'        walked somewhere
 *   'second_part' loaded another bar or started another job (the real MORE)
 *   'end'         window closed by the timer or by the player leaving
 */
export function postShip({ seconds_since_ship, last_kind, events, looked_around, moved, interacted, started_second, verbatim }) {
  emit('post_ship', {
    seconds_since_ship, last_kind,
    /* Compact, ordered list of what happened in the window: enough to replay
       the five seconds, not enough to become a second event stream. */
    events: Array.isArray(events) ? events.slice(0, 40) : [],
    looked_around: !!looked_around,
    moved: !!moved,
    interacted: !!interacted,
    started_second: !!started_second,
    /* Spontaneous speech in the window, if the player said anything aloud.
       The observer transcribes it; this field is the place it lands. */
    verbatim: verbatim ?? null,
  });
}

/** Free-form, used by the runner for forced close-out and by the page for
 *  anything that does not deserve its own type. */
export const note = (message, extra = {}) => emit('note', { message, ...extra });

/* ── THE OBSERVER'S EVENT CODES (field manual §4) ────────────────────────────
 *
 * The manual's sheet is "timestamp + code + 3-8 words", one page, eleven codes:
 *   C H A F S R HELP WALL P MORE REALISM
 *
 * This channel carries the OBSERVER's annotations into the same JSONL as the
 * machine's own events, which is the whole point of the design: the observer
 * writes six words, the recorder holds the physics, and the analysis tool
 * CORRELATES them. An `WALL` at 02:14 means something specific when the
 * machine log shows no measurement had ever been taken and a prompt was on
 * screen — and something quite different when the player had just re-measured
 * successfully. Neither record answers that alone.
 *
 * The classes are validated here rather than trusted, because a typo in a
 * paper sheet silently becomes a missing data point in the verdict.
 */
export const OBSERVER_CODES = Object.freeze({
  C: 'confused', H: 'hypothesis', A: 'understanding-changed', F: 'frustration',
  S: 'surprise', R: 'retries-voluntarily', HELP: 'requested-help',
  WALL: 'cannot-progress', P: 'part-shipped', MORE: 'wants-another',
  REALISM: 'professional-objection',
});

/** One observer annotation: `code` plus 3-8 words of what was seen.
 *  `at_wall_ms` is optional — if the observer wrote a stopwatch time, pass it;
 *  the analyser matches it to the nearest machine event to build the pairing. */
export function observerEvent(code, words, { at_wall_ms, at_clock_min, machinist } = {}) {
  const key = String(code || '').trim().toUpperCase();
  if (!OBSERVER_CODES[key]) {
    /* Loud, because a silently dropped code is a silently lost data point. */
    throw new Error('unknown observer code "' + code + '"; expected one of ' + Object.keys(OBSERVER_CODES).join(' '));
  }
  emit('observer', {
    code: key, meaning: OBSERVER_CODES[key],
    words: words ? String(words).replace(/\s+/g, ' ').trim().slice(0, 120) : null,
    at_wall_ms: at_wall_ms ?? Math.round(wallMs()),
    at_clock_min: at_clock_min ?? null,
    machinist: !!machinist,
  });
}

/** A verbatim quote the observer wrote down immediately (field manual §4).
 *  Three categories, and the category matters to the verdict:
 *    'understanding' — unexpected understanding
 *    'misconception' — unexpected misconception (often the most valuable line)
 *    'desire'        — intrinsic desire, e.g. "Can I try another one?"
 *  `when` is free text: "after first cut", "at once-ship", etc. */
export function quote(category, text, when) {
  emit('quote', {
    category: String(category || 'unknown').slice(0, 40),
    text: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    when: when ? String(when).slice(0, 80) : null,
  });
}

/** The graded help ladder (field manual §2). `rung` is 1, 2 or 3.
 *  Once the observer reaches rung 3 and then supplies information the game was
 *  responsible for communicating, the run is no longer unassisted — this row is
 *  the machine's record of that moment, and the analyser refuses to report such
 *  a run as a clean pass. */
export function helpAsked(rung, { gaveInformation, words, clock_min } = {}) {
  emit('help', {
    rung: Number(rung),
    gave_information: !!gaveInformation,
    /* True once the run has stopped being a clean test of the game. */
    run_no_longer_unassisted: !!gaveInformation,
    words: words ? String(words).replace(/\s+/g, ' ').trim().slice(0, 160) : null,
    clock_min: clock_min ?? null,
  });
}

/** A deadlock judgement (field manual §3): 45 s of genuine deadlock by default.
 *  `kind` distinguishes the two silences the manual insists on separating —
 *  productive ("thinking", a hypothesis was articulate) from unproductive
 *  ("dead", no new hypothesis, looking at the observer for rescue). */
export function silence({ kind, seconds, hypothesis, clock_min } = {}) {
  emit('silence', {
    kind: String(kind || 'unknown').slice(0, 20),
    seconds: seconds == null ? null : Number(seconds),
    hypothesis: hypothesis ? String(hypothesis).replace(/\s+/g, ' ').trim().slice(0, 300) : null,
    clock_min: clock_min ?? null,
  });
}

/** Final row before the tab closes. */
export function sessionEnd({ reason, clock_min, money, history_len, measurements, finished }) {
  emit('session_end', {
    reason, clock_min, money, history_len, measurements,
    finished: finished ? {
      verdict: finished.verdict, net: finished.net, late: finished.late,
      clock_min: finished.clock_min, passes: finished.passes,
    } : null,
    duration_ms: Math.round(wallMs()),
  });
  flush(true);
}

/** Force a synchronous flush. Called by the runner at the end of a session. */
export const flushNow = () => flush(true);

export const stats = () => ({ seq, pending: pending.length, failedFlushes, recording: isRecording(), label: REC_LABEL, session_id: sessionId });

export default {
  isRecording, REC_LABEL, wallMs, sessionStart, action, refusal,
  measurement, cut, cutRefused, shipEvent, hint, choice, hintUsed,
  sample, secondPart, postShip, note, sessionEnd, flushNow, stats,
  OBSERVER_CODES, observerEvent, quote, helpAsked, silence,
};
