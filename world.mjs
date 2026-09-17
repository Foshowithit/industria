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
    /* No impulse train. Continuous friction excitation, narrowband, high.

       BUT THE SPINDLE DOES NOT STOP WHEN THE INSERT RUBS. This branch used to
       return `rpm: 0, spindle_Hz: 0`, which silenced the bearing whine and the
       1x/2x tones for the whole scene — and that contradicts this file's own
       stated principle one function down: "a spindle turning in air is never
       silent". A rubbing cut is a spindle at speed with the edge skidding, so
       the spindle is still there and only the impulse train is missing. The step
       is in the argument list; there was never any need to discard it. */
    const n = (step && Number.isFinite(step.n) && step.n > 0) ? step.n : 0;
    return {
      state: 'RUBBING', rpm: n, spindle_Hz: n / 60, tooth_Hz: 0,
      load: step ? clamp01(step.power_frac) : 0,
      bite_um: (step?.b_radial_mm ?? 0) * 1000,
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

/**
 * SOMEBODY'S RADIO, NOT ON A STATION. See the long note on `radioVoice` in
 * audio.mjs for why it is a texture rather than music: at half five in the
 * morning a shop radio is hiss, a heterodyne whistle, a slow fade and bursts of
 * something you cannot make out, and every one of those is synthesizable and
 * none of them is content.
 *
 * `level` is how loud across the shop; the two band centres and the whistle are
 * the receiver's own character and are not varied in play.
 */
export function radioAcoustics({ on = true, level = 0.5, band1_Hz = 760, band2_Hz = 1750,
                                 whistle_Hz = 2480 } = {}) {
  if (!on) return { state: 'OFF', level: 0, label: 'the radio is off' };
  return { state: 'RADIO', level, band1_Hz, band2_Hz, whistle_Hz,
    label: "somebody's radio, not quite on a station" };
}

/**
 * A RECIPROCATING COMPRESSOR — the one machine in the building that belongs to
 * nobody and never stops. The arrival text has promised it since it was
 * written ("three spindles already running, a compressor, and somebody's
 * radio") and until now it has been a silent object on the west wall.
 *
 * Its signature is two things at once and they are what make it recognisable:
 *
 *   · A BELT-DRIVEN PUMP, much slower than its motor. A 4-pole motor turns at
 *     about 1450 rpm, but the pump is geared down by the belts to a few hundred
 *     — and the CHUG you hear is the pump, not the motor, which is why a
 *     compressor thumps at single-digit hertz while its motor hums at 24.
 *   · CONSTANT SPEED. It is either on or it is not; nothing about it varies with
 *     what the shop is doing, which is exactly why it is a useful thing to hear:
 *     it is the floor of the shop's sound.
 */
export function compressorAcoustics({ running = true, motor_rpm = 1455, pump_rpm = 420, cylinders = 2 } = {}) {
  if (!running) {
    return { state: 'STOPPED', spindle_Hz: 0, chug_Hz: 0, chug_gain: 0,
             hum_gain: 0, air_gain: 0, label: 'compressor stopped' };
  }
  return {
    state: 'COMPRESSOR',
    motor_rpm, pump_rpm,
    /* `rpm` IS PART OF THE CONTRACT. Every acoustics object carries it because
       the voice reads it for the coolant pump, and omitting it here threw NaN
       into a WebAudio parameter and took the whole mix down — see the guard in
       `setMachine`. Spelled out because a contract nobody wrote down is a
       contract that gets broken by the next person. */
    rpm: motor_rpm,
    spindle_Hz: motor_rpm / 60,                        // 24.2 Hz — the motor
    chug_Hz: (pump_rpm / 60) * Math.max(1, cylinders), // 14 Hz — the pump
    chug_gain: 0.30, hum_gain: 0.26, air_gain: 0.16,
    label: 'the compressor, running',
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

  /* ── TWO DIMENSIONS, AND THE FIRST VERSION OF THIS FILE CONFUSED THEM ────
     A single-point chip has a WIDTH and a THICKNESS and they are different
     quantities from different settings:

       width      the radial depth of cut — the dial. It is what the surplus
                  shows up in, and it is what the "it took more than you asked
                  for" lesson is about.
       thickness  the feed per revolution, times the chip-thickening ratio.
                  This is the dimension that governs heat, breaking and the
                  chip-thinning the kernel's own `kc` law is written around.

     This file used the BITE for both, so a 0.12 mm/rev finishing feed produced
     a "420 µm thick" chip and a 4 mm roughing bite produced a 4.2 MILLIMETRE
     one — a chip 4 mm thick is not a chip, it is a bar. */
  const t2_mm = Math.max(feed, 0) * r_chip;
  const width_um = bite_um;

  /* ── THE MASS, WHICH WAS WRONG BY A FACTOR OF A THOUSAND ────────────────
     The old volume was `bite × feed × travel`, which is the chip's
     CROSS-SECTION times its length — but a boring pass does not remove one
     cross-section, it removes an ANNULUS: the tool goes round, and the material
     it takes off over one length of travel is the ring between the bore it
     started with and the bore it left. Measured on a J1 finishing pass:
     1.4 mm³ by the old formula against 1,372 mm³ in reality.

     It mattered because the temperature is energy over mass, so a chip a
     thousand times too light came out at 899,719 °C — and because ΔT is really
     just the specific cutting energy, which barely varies between cuts, EVERY
     CHIP IN THE GAME LANDED IN THE SAME COLOUR BAND. The colour carried no
     information at all, on every cut, which is the one thing a chip read is
     for. */
  const d1 = Math.min(rec.prevCold ?? 0, rec.coldDia ?? 0);
  const d2 = Math.max(rec.prevCold ?? 0, rec.coldDia ?? 0);
  const V_mm3 = Math.max(0, (Math.PI / 4) * (d2 * d2 - d1 * d1) * Math.max(rec.travel_mm ?? 0, 0));
  const m_kg = V_mm3 * ((material?.rho_kg_m3 ?? 7850) / 1e9);

  /* CUTTING TIME, NOT THE WHOLE PASSTIME. `cut_min` is the cut plus the retract,
     the reset and the approach — measured at 0.4 minutes of handling on top of
     a 0.13-minute finishing cut. Multiplying the CUTTING power by that total
     charged three quarters of a minute of cutting that never happened to the
     chip, and charged it unevenly: a short cut got a proportionally bigger
     phantom boost than a long one, which is how a 0.4 mm pass at 0.50 mm/rev
     came out hotter than a 4 mm pass at 0.12. The record carries the travel and
     the feed, so the cutting time is computed rather than inferred. */
  const cut_s = Math.max(0.001, (rec.travel_mm ?? 0) / Math.max(rec.feed_mm_min ?? 0, 0.001)) * 60;
  const cut_J = (rec.power_kW ?? 0) * 1000 * cut_s;
  const cp = material?.cp_J_per_kgK ?? 470;
  /* The speed the cut actually ran at, off the record. Defaulted rather than
     required so an old caller cannot silently get a zero share. */
  const frac = CHIP_HEAT.frac_at_vc(rec.vc_m_min ?? 120);
  const dT_adiabatic = m_kg > 0 ? (cut_J * frac) / (m_kg * cp) : 0;

  /* ── WHY A THICK CHIP READS HOTTER, WHICH IS THE ONLY REASON THE COLOUR
     CARRIES ANYTHING. ────────────────────────────────────────────────────
     Temperature rise on its own is specific cutting energy over heat capacity,
     and that is nearly the SAME for every cut in steel — so it cannot tell you
     which cut you just took. What differs is how long the chip stays hot: a
     0.5 mm chip holds its heat past the moment you look at it, and a 0.12 mm
     finishing chip gives it up to the air and the coolant almost immediately.
     That is why a heavy rough leaves blue chips and a light finish leaves
     silver ones at the same cutting speed, and it is what this term models. */
  const retention = t2_mm / (t2_mm + CHIP_HEAT.keep_hot_mm);
  const temp_C = CHIP_HEAT.ambient_C + dT_adiabatic * retention;
  const band = CHIP_COLOURS.find((c) => temp_C <= c.max_C);

  return {
    bite_realised_um: bite_um,
    bite_cmd_um: rec.bite_cmd_um ?? 0,
    /* THE LESSON, CARRIED BY THE CHIP ITSELF: it is WIDER than the dial said. */
    surplus_um: bite_um - (rec.bite_cmd_um ?? 0),
    width_um,
    r_chip, t2_mm, t2_um: t2_mm * 1000, mass_g: m_kg * 1000, volume_mm3: V_mm3,
    temp_C, colour_hex: band.hex, colour_name: band.name, colour_note: band.note,
    breaks: feed >= (material?.mc ?? 0.25) * 0.4,
    label: `${band.name} chip, ${(t2_mm * 1000).toFixed(0)} µm thick`,
  };
}

/* ══ THE CHIP'S COLOUR, AND AN HONEST ACCOUNT OF WHAT IT CANNOT DO ═════════
   The colour is real and worth drawing: a chip does come off silver or straw or
   blue, and the falling chips in this game are coloured from this number.

   WHAT THE MODEL CANNOT DO IS TELL YOU WHICH CUT YOU JUST TOOK, and that is
   written down here rather than discovered later by somebody who trusted it.

   The temperature rise is (heat into the chip) ÷ (its heat capacity), and with
   the energy measured correctly that is just the SPECIFIC CUTTING ENERGY over
   the material's specific heat — about 500 K at full conversion for 4140. Two
   things follow, and both were measured rather than reasoned:

     · at full conversion the rise is under 520 K at every feed this machine
       offers, which is not hot enough to reach the straw/blue bands;
     · the specific energy FALLS with feed (kc ∝ h^-0.25 — the kernel's own chip
       thinning) while a thicker chip RETAINS more of what it has, so the two
       effects very nearly cancel. Measured across this game's cuts at the four
       settings J1 and J2 actually use, the corrected model separates them by
       under 15 K.

   THE MISSING VARIABLE IS CUTTING SPEED, and it is missing because the game
   does not have it: `doCut` and `doRough` both pass a fixed `vc` of 120 m/min,
   and speed is the thing that changes a chip's colour in a real shop. So this
   file does not get to fake the one variable it lacks. The colour is drawn, the
   bands are real, and NOTHING player-facing states a temperature or claims a
   diagnosis from one.

   THE NEXT HONEST PIECE OF WORK, recorded here so it is not re-derived: give
   the player a spindle-speed override. Then vc varies, `removalStep` already
   takes it, the chip colour becomes a genuine readout of a decision, and
   `CHIP_HEAT` below can be calibrated against something real. */
export const CHIP_HEAT = {
  /* THE PARTITION IS SPEED-DEPENDENT, and that is the whole reason the colour
     can now say anything. At low cutting speed most of the cutting heat goes
     into the tool and the workpiece; as the edge moves faster the chip is past
     the rake face sooner and carries a larger share away with it. That is the
     standard account of why the same steel comes off silver at 60 m/min and
     straw at 300, and it is the term that makes the chip a readout of the
     speed the operator set rather than a constant.

     CALIBRATED, NOT DERIVED, like the retention below it: the slope is chosen so
     that the bands separate across the range of speeds this machine offers.
     What is physical, and what the tests assert, is the ORDER — faster runs
     hotter, thicker stays hot longer.

     THE RANGE IS 0.30 TO 0.80 AND IT IS CAPPED, which the first version of this
     line was not: it ran to 1.00, meaning every joule of cutting energy leaving
     on the chip. That is not a thing that happens — some always goes into the
     tool and the workpiece — and a cap that cannot be reached is a cap that is
     not doing its job. The published accounts of heat partitioning put the
     chip's share at roughly a third at low speed and three quarters or more at
     high speed, and the ends of this range are those two numbers.

     WHAT THE MODEL CAN AND CANNOT REACH, measured rather than asserted, because
     the previous version of this comment claimed blue was unreachable and that
     stopped being true the moment the partition became speed-dependent. Across
     the six speeds this machine offers, in 4140 on a Ø20 bar:

        60 m/min   straw   240 C        180 m/min  bronze  361 C
        90 m/min   straw   270 C        240 m/min  bronze  422 C
       120 m/min   bronze  301 C        320 m/min  blue    445 C

     AND IT MOVES ON SPEED, NOT ON DEPTH, which is the honest and useful
     property: measured across the same six speeds a 0.30 mm pass reads within
     ten degrees of a 1.00 mm one, because the specific cutting energy barely
     changes and the retention term is the same at the same feed. A chip reports
     the speed you set. That is exactly what a machinist reads it for.

     So silver, straw, bronze and blue are reachable, and GREY-BLACK IS NOT — it
     needs the temperature at the tool-chip interface rather than the chip's
     bulk average, and that is a thermal gradient this build does not model. One
     unreachable band, named, rather than four claimed and three delivered. */
  frac_at_vc: (vc) => Math.min(0.80, Math.max(0.30, 0.30 + 0.0019 * (vc ?? 120))),
  into_chip_frac: 0.65,   // retained for the old callers; frac_at_vc is the live one
  keep_hot_mm: 0.11,      // thickness at which half the temperature rise survives
  ambient_C: 20,
  /* Set to false when the spindle override lands and the bands start meaning
     something. Until then it is the flag that says "do not quote a temperature
     to a player". */
  temperature_is_diagnostic: false,
};

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

/* ══════════════════════════════════════════════════════════════════════════
   THE PART LIFECYCLE — where a part physically IS, and who takes it away
   ══════════════════════════════════════════════════════════════════════════
   ROUND 9. The shop floor used to be one machine and one casting: you bored
   it and money happened. `game.mjs` now models STOCK (blanks), a FINISHED
   rack, a SCRAP bin, and the COURIER whose departure at 10:30 is the first
   event in this game that nobody can talk back to. Everything here is the
   PURE half of that: what a shelf looks like, when the van comes, and what
   the shop does when a part turns out dead. No three.js, no DOM — so the
   same arithmetic can be unit-tested and, more importantly, so the page
   cannot grow its own second copy of it. Same discipline as the kernel.

   ADVISORY ONLY. machine_execution = false.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── THE COURIER ──────────────────────────────────────────────────────────
   J1's brief has said "before the courier at 10:30" since it was written and
   that courier has been fiction: `deadline_min` was enforced as money and
   nothing else. A van is a van. It arrives, it is loaded, and it leaves,
   and what is standing on the rack at the moment it leaves is what Halvorsen
   gets. Times are MINUTES OF DAY, the same units as `job.deadline_min`. */
export const COURIER = {
  courier: 'Hallam Couriers',
  /* How long the van actually stands on the apron. It books an hour, the
     driver knocks off at the booked time, and a van that leaves a third of
     an hour early is not a mechanic — it is what a booked slot means. */
  window_min: 20,
  /* After the deadline he is still in the yard, still working through the
     drop, and takes another hour to clear the round. His radio message to
     the dispatcher is "one short" and the booking PPI-PUMP-1 goes red. */
  booked_start_min: 10 * 60 + 30,
  booked_end_min:   11 * 60 + 30,
};

/* WHY ONE OF THESE IS NOT DERIVED AND THE OTHER IS.
   `arrives_min` is the booked slot: `job.deadline_min` is the booking, and a
   literal copy of it in this file would be a second source of truth for one
   fact — the exact failure this project has already shipped twice (the
   duplicated "which limit binds" derivation, the deleted rule statement).
   So it is a PARAMETER, and the one caller passes the job's own number.
   The window and the late departure are properties of THIS vehicle, not of
   any job, so they belong here and `game.mjs` reads them. */
export const arrivalMin = (job, courier = COURIER) => job.deadline_min;
export const departsMin = (job, courier = COURIER) =>
  arrivalMin(job, courier) + courier.window_min;

/* What his day looks like around the two hours that matter. Pure text — the
   shop says these things out loud and they are the only warning the player
   gets that a van exists at all. */
export function courierSchedule(job, courier = COURIER) {
  const at = arrivalMin(job, courier), gone = departsMin(job, courier);
  return [
    { at: at - 40, kind: 'eta',
      text: `Dispatch: ${courier.courier} booked window ${hhmm(at)} — ${hhmm(gone)}. They do not wait.` },
    { at: at - 2, kind: 'arriving',
      text: `A diesel on the apron. ${courier.courier} is backing up to the roll-up door.` },
    { at, kind: 'loading',
      text: `${courier.courier} loading. Finished rack, then he is gone at ` +
            `${hhmm(gone)}${job.client ? ' — ' + job.client + "'s round is the whole morning." : '.'}` },
    /* The last entry is a PLACEHOLDER: what he says at the booked time
       depends on what is standing on the rack, and the rack is not known
       until the moment arrives — see `depart()`. Leaving it out entirely
       would let the page invent its own line at the one beat of the round
       that must not be invented. */
    { at: gone, kind: 'departed', text: '', spoken_by: 'depart' },
  ];
}

/* ── THE SHOP'S STORES ────────────────────────────────────────────────────
   A casting is a real object with a weight and a price. These are ORDER-OF-
   MAGNITUDE numbers for a 30 mm-deep Ø40 housing in 4140, and they are
   labelled as such rather than dressed up as measured — the standing rule in
   this project is that a number nobody can defend is worse than no number. */
export const CHARGES = {
  blank_cost: 42,       /* stock per casting, £ */
  blank_min: 1.5,       /* walking to the crate and back, machine-idle minutes */
  setup_min: 12,        /* insert change, re-clamp, re-datum: the time a
                           second blank on the SAME setup does not cost */
  /* ON A FINISHED PART. This is the one place in this file where the world
     computes a CONSEQUENCE, and it is deliberately a CONSEQUENCE and not a
     punishment: a new blank cannot be re-datumed on the original face once a
     finish cut has skimmed it, so the second setup costs money as well as
     time. It is applied to the parts that HAVE had a finish cut and have left
     the jaws — an accepted part, and the undersize part the customer reworks —
     and never to a scrap part.

     WHICH PART IS WHICH, after Round 10A's direction correction: cutting a
     bore only ever makes it LARGER, so an OVERSIZE bore is the dead one (the
     material cannot be put back) and an UNDERSIZE bore is the recoverable one
     (there is metal still to come out). A scrap part therefore never left the
     cut that killed it — it is caught on its own setup, costs one blank and a
     walk, and needs no re-datum at all. Scrap parts are the CHEAP recovery,
     which is the opposite of what a punishment variable would do and is what
     the process actually does. */
  remount_cost: 18,
};

/* Castings on the floor at the start of the shift. Three is not a tuning
   knob: it is what fits in one crate, and the crate is a thing in the shop
   you can walk up to and count. */
export const BLANK_STOCK = 3;

/**
 * A fresh blank, as an OBJECT rather than a counter.
 *
 * The identity (`J1-02`) is handed out here so the crate, the rack, the bin
 * and the courier's manifest all key the same casting by the same name. A
 * bare integer would work; a name is what a human writes on a card, and it
 * is also what makes "which part is on the rack" a question with one answer.
 */
export function mintBlank(job, n = 0) {
  return {
    id: `${job.id}-${String(n + 1).padStart(2, '0')}`,
    job_id: job.id,
    material: job.material,
    start_hole_dia_mm: job.start_hole_dia_mm,
    minted_at: n,
  };
}

/** The crate you can see: how much stock is on the floor. */
export const crateCountFor = (load, stock = 3) =>
  Math.max(0, Math.min(stock, stock - load));

/**
 * The rack, as an observer sees it. `slots` is the physical capacity of the
 * rack next to the roll-up door — a real limit, so "the rack is full" can
 * stop a shipment on its own rather than being a message.
 */
export const RACK_SLOTS = 4;

export function rackView(finished = [], stock = RACK_SLOTS) {
  return {
    slots: stock,
    used: finished.length,
    free: Math.max(0, stock - finished.length),
    parts: finished.map((p) => ({ id: p.id, verdict: p.verdict, since_min: p.shipped_at })),
  };
}

/* ── WHAT THE SHOP DOES WHEN A PART TURNS OUT DEAD ────────────────────────
   §108's second anti-goal is "a machine-control emulator with no living
   world". The world's half of a part outcome is that OTHER PEOPLE have to
   deal with it, and the first thing that happens when a bearing housing
   measures 0.02 mm small is that somebody in the assembly bay tries to put a
   bearing in it. That is Mr. Achebe's job and he is at the bench, not at
   the machine, and his day is now different because of what you did.
   ──────────────────────────────────────────────────────────────────────── */
export const JOB_DEAD = {
  min: 20,       /* minutes on the bench before he gives up and walks over */
  by: 'Mr. Achebe',
  department: 'assembly',
};

/** The proof that the part is real: a bearing that will not go in. */
export const AXIS_DIA_MM = 40;

export function assemblyProof(axis_dia_mm = AXIS_DIA_MM) {
  return { axis_dia_mm, tried: 1, verdict: 'WILL NOT ENTER', at_bench: JOB_DEAD.by };
}

/**
 * The shop requests another blank out of stores.
 *
 * `recovery` is where the part failure LEAVES you, and this function is the
 * only place that decides it. Note the shape: it returns a CAUSE and the
 * blank it hands over, not a penalty. `why_blocked` can stop the whole thing
 * — a shop with no stock cannot recover from anything, and that is a fact
 * about the shop rather than a fine.
 */
export function requestBlank(load, opts = {}) {
  const {
    stock_on_hand = 3, walk_min = CHARGES.blank_min,
    reason = 'SCRAP', part_id = null, blocked = null,
  } = opts;
  if (blocked) return { ok: false, why: blocked, reason, part_id };
  if (stock_on_hand < 1) return { ok: false, why: 'NO_STOCK_IN_STORES', reason, part_id };
  return {
    ok: true, reason, part_id,
    walk_min, stock_after: load.stock - 1,
  };
}

/* ── WHAT THE COURIER EVENT LEAVES BEHIND ─────────────────────────────────
   `depart()` is the single point where 10:30 becomes a fact. It is written
   as a pure function of the rack so that the page cannot disagree with it:
   the page ANIMATES this decision, it does not make it. */
export function depart({ job, clock_min, finished = [], courier = COURIER, load = null }) {
  const at = arrivalMin(job, courier);
  const gone = departsMin(job, courier);
  if (clock_min < gone) return { ok: false, why: 'NOT_YET', at, gone };
  const accepted = finished.filter((p) => p && p.disposition === 'SEND');
  const sent = accepted.length ? accepted[0] : null;
  return {
    ok: true, at, gone,
    departed_with: sent ? { id: sent.id, verdict: sent.verdict } : null,
    left_behind: finished.filter((p) => !sent || p.id !== sent.id)
      .map((p) => ({ id: p.id, disposition: p.disposition, verdict: p.verdict })),
    /* THE DEPENDENCY. Halvorsen's pump line is down and it stays down until a
       housing THAT FITS goes out of that door. Nothing in this return value
       is a score: it is the state of somebody else's factory.

       ROUND 10A: this is a THREE-state fact, and the third state exists
       because "the van took something" is not the same as "Halvorsen can
       build". A REWORK part is undersize by construction — it does not fit —
       so a van leaving with one leaves the pump line down:

         OUTSTANDING   not collected yet
         SATISFIED     an in-spec housing went out; the line can be built
         UNFULFILLED   the van left empty, or carrying a housing that still
                       needs the customer's own finish pass

       NOTE: this function (`world.depart`) has NO CALLERS anywhere in the
       build — the live path is `game.mjs courierDepart()`. Its predicate keys
       on `disposition === 'SEND'`, which is only correct while it stays
       unreachable, because after collection the live path relabels the part
       `SHIPPED` and cannot use the disposition to tell the two cases apart.
       It is left syntactically intact rather than silently "fixed" against
       the flip; the live implementation is `doesDeliverySatisfyDependency()`
       in game.mjs. */
    dependency: sent ? 'SATISFIED' : 'UNFULFILLED',
    note: sent
      ? `${job.client} gets one housing — ${sent.id}. The pump line can be built on Monday.`
      : `${job.client} gets nothing. No housing, no pump, and the line stays down.`,
  };
}

/** 24-hour clock, minutes -> "10:30". Lives here so the world and the page
 *  cannot print the same minute two different ways. */
export function hhmm(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** A job's tolerance zone, in microns, whole. Lives here beside hhmm because
 *  the board card, the offer line and the traveler panel all print this width;
 *  three inline copies of the subtraction was three chances to print three
 *  different widths for one band. Rounded for the printed figure only —
 *  arithmetic that divides by the band (the claim error share, the shop
 *  record) keeps the raw difference, where a whole micron would matter. */
export const bandUm = (job) => Math.round((job.band_high_mm - job.band_low_mm) * 1000);
