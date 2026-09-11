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
  if (!force && failedFlushes >= MAX_FAILED_FLUSHES) return;
  const body = pending.join('');
  pending = [];
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
      /* put the lines back, in order, without unbounded growth */
      pending.unshift(body);
      if (pending.join('').length > 2_000_000) pending = pending.slice(-8);
    });
  } catch (e) {
    failedFlushes += 1;
    pending.unshift(body);
  }
}

/* Browsers drop in-flight requests when the tab closes. A recorder whose last
   ten seconds are missing is a recorder that cannot see the ship/scrap event,
   which is the single most important line in the file. A one-shot synchronous
   beacon on `pagehide` is the only channel that survives that. */
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('pagehide', () => {
    if (!pending.length) return;
    try {
      const blob = new Blob([pending.join('')], { type: 'application/x-ndjson' });
      const sent = navigator.sendBeacon &&
        navigator.sendBeacon(REC_ENDPOINT, blob);
      if (sent) pending = [];
    } catch (e) { /* nothing better available; the periodic flush already ran */ }
  });
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

/** Free-form, used by the runner for forced close-out and by the page for
 *  anything that does not deserve its own type. */
export const note = (message, extra = {}) => emit('note', { message, ...extra });

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
  sample, secondPart, note, sessionEnd, flushNow, stats,
};
