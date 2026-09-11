/**
 * world.mjs — the SHOP FLOOR world model. Pure logic, no three.js, no DOM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * Requirement R4: "Every number the world shows must come from the kernel ...
 * never hard-code a plausible figure in the UI."
 *
 * The 3D scene needs three families of number the kernel *models* but does not
 * currently *report* in a form a scene can use: what a machine sounds like,
 * what a chip looks like, and where the machine physically is. All three are
 * DERIVED from kernel/game output. Nothing here invents a size.
 *
 * This module is deliberately free of three.js and of the DOM so it can be
 * unit-tested in Node the same way the kernel is, and so the scene file can be
 * about the scene. That is the same discipline the existing build already
 * observes between kernel.mjs -> game.mjs -> index.html.
 *
 * ADVISORY ONLY. machine_execution = false.
 */

/* ══════════════════════════════════════════════════════════════════════════
   CUTTING SOUND — §13 "SOUND IS A CORE GAMEPLAY SYSTEM"
   ══════════════════════════════════════════════════════════════════════════
   The brief is explicit that the first rung is honest differentiation:

     a spindle under load   ≠  a spindle idling
     a cut                  ≠  a rub
     a cut you cannot see is still audible

   Every one of those is a number the kernel already computes. `power_frac` is
   the fraction of nameplate the motor is pulling, `n` is the commanded speed,
   `F_peak_N` is the impulse the tooth actually delivers.

   THE RUB IS THE INTERESTING ONE. `cutOnce` refuses a pass whose effective
   engagement is <= 0 and calls it RUBBING. That refusal is physics: the edge
   sits in fresh air, the flank drags on the wall, and it sounds like a bearing
   going out — thin and high with no impulse train behind it. It is the most
   recognisable bad sound in a machine shop and the kernel ALREADY KNOWS when
   it is happening. So the world can play it.
   ------------------------------------------------------------------------ */

const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * The audible state of a cut, derived from a kernel `step`.
 *
 * @param {object} step    kernel step (removalStep / boringStep output)
 * @param {object} [opts]  { z, verdict, rubbing, compliance }
 */
export function cutAcoustics(step, opts = {}) {
  const { z = 1, verdict = 'CUTS CLEAN', rubbing = false } = opts;

  if (rubbing) {
    /* No impulse train. Continuous friction excitation, narrowband, high. */
    return {
      state: 'RUBBING', rpm: 0, spindle_Hz: 0, tooth_Hz: 0, load: 0, bite_um: 0,
      squeal_Hz: 1900, harmonic_gain: 0.0, noise_gain: 0.7,
      label: 'the insert is rubbing, not cutting',
    };
  }
  if (!step || !Number.isFinite(step.n) || step.n <= 0) {
    return { state: 'IDLE', rpm: 0, spindle_Hz: 0, tooth_Hz: 0, load: 0, bite_um: 0,
             harmonic_gain: 0, noise_gain: 0, label: 'spindle stopped' };
  }

  const rpm = step.n;
  const spindle_Hz = rpm / 60;
  const tooth_Hz = spindle_Hz * Math.max(1, z);   // the dominant line in the
                                                  // spectrum of any milling cut
  const load = clamp01(step.power_frac);
  const bite_um = (step.b_radial_mm ?? 0) * 1000;

  /* What you actually hear is the IMPULSE, not the motor fraction: a heavy bite
     on a big machine can draw many kW and still be quiet, while a light cut on
     a floppy bar rings. Bounded so a stability-limit case screams and a 20 µm
     finish pass whispers. */
  const force = step.F_peak_N ?? step.F_mean_N ?? 0;
  const impulse = clamp01(force / (opts.force_full_scale_N ?? 400));

  let state = 'CUTTING';
  if (/CHATTER/i.test(verdict)) state = 'CHATTER';
  else if (/POWER|TORQUE|RPM|LIMIT/i.test(verdict)) state = 'OVERLOADED';
  else if (load < 0.06 && bite_um < 25) state = 'FINISHING';
  else if (bite_um >= 150) state = 'ROUGHING';

  return {
    state, rpm, spindle_Hz, tooth_Hz, load, bite_um, force_N: force,
    /* The impulse train — why a 1-tooth bar thumps and a 3-flute cutter warbles. */
    harmonic_gain: 0.25 + 0.75 * impulse,
    noise_gain: 0.35 + 0.65 * (1 - impulse),
    label: {
      CUTTING: 'a cut under load', FINISHING: 'a light finishing cut',
      ROUGHING: 'a heavy roughing cut', CHATTER: 'the bar is ringing',
      OVERLOADED: 'the spindle is loaded up', IDLE: 'spindle stopped',
      RUBBING: 'the insert is rubbing, not cutting',
    }[state] ?? state,
  };
}

/**
 * An IDLING spindle — §13's first discrimination, and the one that lets a
 * player tell from across the shop that a cycle has finished.
 *
 * Bearing whine tracks SPEED, not load: a spindle turning in air is never
 * silent and never changes pitch when the cut starts. Only the impulse train
 * appears. Players learn this within one shift and then cannot unhear it.
 */
export function idleAcoustics(machine, { rpmFrac = 0, spindle_on = false } = {}) {
  if (!spindle_on) return { state: 'STOPPED', rpm: 0, spindle_Hz: 0,
                            whine_gain: 0, hum_gain: 0, label: 'machine stopped' };
  const n = (machine?.n_max ?? 10000) * clamp01(rpmFrac);
  return {
    state: 'IDLING', rpm: n, spindle_Hz: n / 60,
    whine_gain: 0.10 + 0.30 * clamp01(rpmFrac),   // bearing noise, quiet, high
    hum_gain: 0.20 + 0.35 * clamp01(rpmFrac),     // motor hum, felt through the floor
    label: 'spindle turning, not cutting',
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE CHIP — §73's last rung, and the only evidence you can hold
   ══════════════════════════════════════════════════════════════════════════
   A chip is a recording of the cut that made it. Its colour is the temperature
   it left at, its form is the material's ductility against the feed, and its
   thickness is the bite that was ACTUALLY taken — not the one dialled. That
   last one is the whole lesson of this build, and it is legible on a chip.

   IMPORTANT AND HONEST: the colour mapping below is a shopbench convention
   (machinists read chip colour the way a cook reads a steak), and it is a
   PRESENTATION mapping, not a measurement. The temperature feeding it is
   computed from the kernel's own power, cut time and the chip's own heat
   capacity — not looked up.
   ------------------------------------------------------------------------ */

export const CHIP_COLOURS = [
  { max_C: 180, hex: 0xc3c8cc, name: 'bright silver', note: 'cold — the heat went into the part' },
  { max_C: 300, hex: 0xc9b384, name: 'straw',         note: 'normal for steel' },
  { max_C: 430, hex: 0xa07a3c, name: 'bronze',        note: 'working hard, but fine' },
  { max_C: 560, hex: 0x5f7fb0, name: 'blue',          note: 'running hot — insert life is going' },
  { max_C: Infinity, hex: 0x4d4d55, name: 'grey-black', note: 'too hot; the coating is gone' },
];

/**
 * The chip a pass produced. Inputs: a `cutOnce` record and a kernel MATERIAL.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS USES `mc`, AND WHAT IT HONESTLY DELIVERS
 * ─────────────────────────────────────────────────────────────────────────
 * `mc` is the Kienzle chip-thinning exponent. It is the right SHAPE of quantity
 * for this — it is the kernel's own statement about how a material's chip
 * thickens under shear, so reusing it beats inventing a second number — but it
 * must be read for what it actually separates. Probed from MATERIALS:
 *
 *     al_6061    mc 0.25    steel_4140  mc 0.25
 *     ti_6al4v   mc 0.23    ss_304      mc 0.21
 *
 * So the real behaviour is TWO groups, not four:
 *
 *     ALUMINIUM and 4140 are INDISTINGUISHABLE here — same mc, so same r_chip,
 *     same colour, same break threshold. A player who bores 6061 and 4140 back
 *     to back gets a bit-for-bit identical chip. That is a genuine hole in the
 *     model, not a subtlety, and it is not hidden below.
 *
 *     STAINLESS and TITANIUM sit apart and below, i.e. LESS thickening and a
 *     lower break threshold — the right direction, since both are the stringy
 *     ones that birds-nest if you baby them.
 *
 * The `r_chip` spread across all four is only 1.026–1.050. That is a 2% range
 * and no player will perceive it as different chips.
 *
 * WHY IT IS NOT "FIXED" BY WIDENING mc: `mc` feeds `kc` through
 * meanChipThickness, and `kc` is what kernel.test.mjs validates against the
 * spec's reference cases REF-A/REF-B/REF-S. Retuning it to make four pretty
 * chip colours would move the validated cutting-force arithmetic to serve a
 * presentation layer. That is backwards. The presentation layer is what gets
 * corrected, and the limitation is stated here instead of dressed up.
 *
 * WHAT IS SOLID, and what the player actually sees:
 *   · thickness  — comes from `bite_realised_um`, a real measurement of what
 *                  the bar took. THIS is the load-bearing one, and it is the
 *                  whole lesson: the chip is thicker than the dial claimed.
 *   · temperature — real cut energy / (real chip mass x real cp), no lookup.
 *   · colour     — a shopbench convention (a machinist reads chip colour the
 *                  way a cook reads a steak). PRESENTATION, labelled as such.
 * -------------------------------------------------------------------------
 */
export function chipFromPass(rec, material) {
  const bite_um = rec.bite_realised_um ?? 0;
  const feed = rec.feed_mm_rev ?? 0.1;
  const r_chip = Math.min(1.35, Math.max(0.9, 0.9 + 0.6 * (material?.mc ?? 0.25)));
  const t2_mm = (bite_um / 1000) * r_chip;

  const cut_J = (rec.power_kW ?? 0) * 1000 * (rec.cut_min ?? 0) * 60;
  /* Kernel convention: 8% of cutting energy enters the workpiece, flood coolant
     takes half of the remainder, and the rest rides out on the chip. */
  const to_chip_J = cut_J * (1 - 0.08) * 0.5;
  const V_mm3 = Math.max(bite_um / 1000, 0) * Math.max(feed, 0) * Math.max(rec.travel_mm ?? 0, 0);
  const m_kg = V_mm3 * ((material?.rho_kg_m3 ?? 7850) / 1e9);
  const dT = m_kg > 0 ? to_chip_J / (m_kg * (material?.cp_J_per_kgK ?? 470)) : 0;
  const temp_C = 20 + dT;
  const band = CHIP_COLOURS.find((c) => temp_C <= c.max_C);

  return {
    bite_realised_um: bite_um,
    bite_cmd_um: rec.bite_cmd_um ?? 0,
    /* THE LESSON, CARRIED BY THE CHIP ITSELF: it is thicker than the dial said. */
    surplus_um: bite_um - (rec.bite_cmd_um ?? 0),
    r_chip, t2_mm, mass_g: m_kg * 1000,
    temp_C, colour_hex: band.hex, colour_name: band.name, colour_note: band.note,
    breaks: feed >= (material?.mc ?? 0.25) * 0.4,
    label: `${band.name} chip, ${(t2_mm * 1000).toFixed(0)} µm thick`,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PART — §73's Part / Feature rungs
   ══════════════════════════════════════════════════════════════════════════
   The world has to draw the bore at the size the kernel says it is, or the 3D
   scene and the arithmetic tell two different stories and the player is right
   to trust neither. The STL is decoration on the outside; the bore is
   arithmetic, and it goes in the geometry as a number.
   ------------------------------------------------------------------------ */

/**
 * @param {object} g         the live game state
 * @param {function} partGrowth_um  game.partGrowth_um — passed in, not imported,
 *        so this module never has an opinion about the growth law.
 */
export function boreGeometry(g, partGrowth_um) {
  const dia_cold = g.part.holeDia_cold_mm;
  const growth_um = partGrowth_um(g);
  const last = g.history[g.history.length - 1];
  return {
    dia_cold_mm: dia_cold,                                  // THE master state
    dia_hot_mm: dia_cold + growth_um / 1000,                // what it measures on the machine
    radius_cold_mm: dia_cold / 2,
    depth_mm: g.job.bore_depth_mm,
    growth_um,
    /* The wall is not a cylinder: the bar's runout leaves a lobe, and a lobe is
       invisible to a two-point gauge. Reported so the Feature rung can show it. */
    lobing_um: (last ? last.runout_um : 0) * 2,
    /* Metal left anywhere under the top of the band — a RADIUS quantity,
       because that is what the dial moves. */
    stock_to_band_um: ((g.job.band_high_mm - dia_cold) / 2) * 1000,
    passes: g.history.length,
    stack: g.history.map((h) => ({
      pass: h.n, t: h.t, dia: h.coldDia, label: h.label,
      bite_cmd_um: h.bite_cmd_um, bite_realised_um: h.bite_realised_um,
      removed_um: h.removed_um, sag_um: h.sag_um, grow_um: h.grow_um,
      power_kW: h.power_kW, rpm: h.n_rpm, feed_mm_min: h.feed_mm_min,
      ra_est_um: h.ra_est_um ?? null,
    })),
  };
}

/**
 * TOOL-MARK PITCH — the physical fingerprint of a bored bore.
 * A bar advances f per revolution, so the wall carries a helix of pitch f.
 * Derived, and it is why the kernel's Ra estimate is a prediction rather than
 * a number somebody liked.
 */
export function toolMarkPitch_um(g) {
  const last = g.history[g.history.length - 1];
  return last ? last.feed_mm_rev * 1000 : 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   MACHINE MOTION — so the 3D head and the arithmetic cannot disagree
   ══════════════════════════════════════════════════════════════════════════
   The spindle's rotational POSITION is cosmetic. The table is not: the table is
   where the part is, and if the scene puts the part somewhere the kernel's
   numbers do not describe then the renderer is lying to the player.

   So the spindle angle integrates at the kernel's commanded rpm and nothing is
   animated on a timer that disagrees with the job clock.
   ------------------------------------------------------------------------ */

export function machineMotion(g) {
  const last = g.history[g.history.length - 1];
  const n_rpm = last ? last.n_rpm : 0;
  return {
    spindleRev: g.machine.spindle_on_min * (n_rpm / 60),
    spindle_Hz: n_rpm / 60, rpm: n_rpm,
    feed_mm_min: last ? last.feed_mm_min : 0,
    travel_mm: last ? last.travel_mm : 0,
    cutting: !!(g.part.cutting && g.machine.spindle_on),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   §53 INFORMATION LAYERS — "industrial perception"
   ══════════════════════════════════════════════════════════════════════════
   The brief is specific that this reflects LEARNED knowledge, not magical
   character statistics (§54: no knowledge teleportation). So the layer is
   keyed to things the player has actually done in this save: picked the part
   up, measured it, read the traveler, been corrected.

   That is why this function takes a `perception` record rather than a level.
   ------------------------------------------------------------------------ */

export function perceptionOf(thing, seen = {}) {
  const t = thing;
  if (!seen.any) return { layer: 0, text: t.crude };
  if (!seen.measured) return { layer: 1, text: t.material };
  if (!seen.corrected) return { layer: 2, text: t.process };
  return { layer: 3, text: t.engineer };
}

export function describeBore(g, seen = {}) {
  const b = boreGeometry(g, (x) => 0);
  return {
    crude: 'a hole in a block',
    material: `${g.mat.label}, a ${b.dia_cold_mm.toFixed(1)} mm hole`,
    process: `Ø${g.job.nominal_mm} ${g.job.grade} bore, ${(b.stock_to_band_um).toFixed(0)} µm of radius left`,
    engineer:
      `Ø${g.job.nominal_mm} ${g.job.grade} (${(g.job.band_high_mm - g.job.band_low_mm) * 1000} µm band, `
      + `one-sided from nominal) · ${b.passes} passes · ${b.lobing_um.toFixed(1)} µm lobing · `
      + `feed marks ${toolMarkPitch_um(g).toFixed(0)} µm pitch`,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE CLOCK — §5 the shift advances whether the player acts or not
   ══════════════════════════════════════════════════════════════════════════
   ─────────────────────────────────────────────────────────────────────────
   RESOLVED DESIGN TENSION — READ THIS BEFORE CHANGING THE CONSTANTS
   ─────────────────────────────────────────────────────────────────────────
   §1/§5 want the world ALIVE without the player: nobody is waiting for the
   protagonist, the shift goes on, the machine finishes its cycle whether you
   are standing there or not. §79 forbids artificial difficulty, and §2 makes
   the first hour a teaching loop.

   Those two pull in opposite directions, and a naive 12x compression loses.
   A beginner is SLOW. They get lost, they re-read the traveler, they walk the
   wrong way down the aisle. At 12x, ten real minutes of being lost is two
   simulated hours, the job goes late, and the player is punished for the exact
   ignorance the first hour exists to repair. That is Gate B failing by clock.

   THE RESOLUTION, and it is a separation rather than a tuning:

     · THE WORLD'S CLOCK runs always, at AMBIENT_SCALE. Machines cycle, the
       forklift runs, the beeping thing keeps beeping, the light changes. The
       building is alive with or without you. This is §1 and §5 satisfied.

     · THE JOB'S CLOCK runs at JOB_SCALE, and only accrues while the player has
       actually taken the work. Before you have accepted the job you are not
       late for it, because you do not yet have it.

     · NEITHER clock punishes COMPREHENSION. Understanding is never charged
       for. Time spent looking at a thing, reading a drawing, or asking Earl a
       question advances the world and can advance the job — but the FIRST
       task's deadline is set generously enough that a first-time player doing
       it honestly cannot miss it. You can lose the job by making a bad
       decision (cutting when you should have measured, ignoring the wrong-rev
       drawing). You cannot lose it by taking a long time to understand
       something. §2's whole learning loop depends on the second kind of
       failure being free.

   THE INVARIANT, stated so a future edit cannot quietly break it:
       the player must never lose the job for taking a long time to UNDERSTAND
       something. They may lose it for a DECISION. Those are different.
   ─────────────────────────────────────────────────────────────────────────
   ------------------------------------------------------------------------ */

/* The world's own pace. Fast enough that a shift is visible in the light and
   the machines run several cycles while you work; slow enough that walking
   from the door to the machine does not cost you the morning. */
export const AMBIENT_SCALE = 6;

/* The job's pace. Applied ONLY once the player has taken the work. Half the
   ambient rate, because the job clock is what the deadline is measured in and
   that is the number that can hurt you. 8 h shift ≈ 80 real minutes of job. */
export const JOB_SCALE = 3;

/** @deprecated Kept only so the old page does not break; use the two above.
 *  The single-scale idea was wrong: it conflated "the world is alive" with
 *  "the clock is punishing you", which are separable and must stay separated. */
export const SIM_MINUTES_PER_REAL_MINUTE = JOB_SCALE;

export const simMinutesFor = (realSeconds, scale = AMBIENT_SCALE) =>
  (realSeconds / 60) * scale;

/**
 * Advance both clocks by a wall-clock delta.
 *
 * @param {object} clocks  { world_min, job_min, job_taken }
 * @param {number} dt_real_s
 * @returns {object} the same clocks, advanced
 */
export function advanceClocks(clocks, dt_real_s) {
  /* TAB-SWITCH GUARD. A backgrounded tab must not fast-forward the job: you
     cannot lose a deadline because you went to make coffee. rAF stops firing
     when the tab is hidden, so the first frame back carries a huge dt. Frames
     above MAX_FRAME_S are treated as a RESUME, not as elapsed shift time. */
  const MAX_FRAME_S = 0.25;
  const d = Math.max(0, dt_real_s);
  const counted = d > MAX_FRAME_S ? 0 : d;
  clocks.world_min += simMinutesFor(counted, AMBIENT_SCALE);
  if (clocks.job_taken) clocks.job_min += simMinutesFor(counted, JOB_SCALE);
  clocks.resumed = d > MAX_FRAME_S;
  return clocks;
}

/**
 * The clock the header shows. Before you take the work it is the world's;
 * after, the job's — and the job's is what the deadline was set against.
 */
export const shiftClock_min = (clocks) =>
  clocks.job_taken ? clocks.job_min : clocks.world_min;

/** 05:55 counts as early morning; the shop is a different colour at 06:00, 12:00
 *  and 18:00, and the brief asks for that to be visible (§5, §49). */
export function daylight(clock_min) {
  const h = ((clock_min / 60) % 24 + 24) % 24;
  /* Two-shift shop: lights are on from 05:30. Before that the yard is dark. */
  const toSun = Math.min(1, Math.max(0, (h - 5.0) / 1.5));       // 05:00 -> 06:30 dawn
  const toNight = Math.min(1, Math.max(0, (h - 19.5) / 2.0));    // 19:30 -> 21:30 dusk
  return {
    h, dawn: toSun, dusk: toNight,
    /* Shop lights are on for the whole working shift regardless of the sun. */
    shop_lights: h >= 5.0 && h <= 23.0,
    /* Cool white fluorescents through the day, warmer at the ends of the shift. */
    lamp_K: h < 7 ? 4200 : h < 17 ? 5000 : 3800,
  };
}
