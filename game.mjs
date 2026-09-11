/**
 * INDUSTRIA — the game layer.
 *
 * kernel.mjs tells the truth about one cut. This file makes that truth into a
 * JOB: a clock you can run out of, a machine that is a different size at 09:20
 * than it was at 08:00, a part whose final size is decided by the thermal
 * condition of the machine at the instant of the last cut, and an inspector who
 * measures it cold and does not care what you intended.
 *
 * ── THE DESIGN CLAIM ──────────────────────────────────────────────────────
 *   Every error in this model is ONE-DIRECTIONAL. Tool sag, tool growth,
 *   screw growth and runout all push the bore the same way — smaller than the
 *   dial. Nothing here makes it bigger.
 *
 * That is not a tuning choice, it is the physics, and it is the whole game.
 * An H6 band is 16 µm wide and starts AT nominal, so the runway is one-sided
 * too. You cannot aim at the middle of the band, because you cannot see the
 * middle of the band: you can only see a gauge reading on a part that is
 * currently the wrong size. What you can do is leave an allowance and CREEP —
 * take bites small enough that the next one is a decision rather than a
 * coin-flip, and stop the moment the gauge says you are in.
 *
 * A machinist who understands this is unhurried and accurate. A machinist who
 * dials straight to the number is fast and scrap.
 */

import { MATERIALS, MACHINES, makeTool, assessBoring, itWidth_um } from './kernel.mjs';

export const GAME_VERSION = '0.2.0';

/* ══════════════════════════════════════════════════════════════════════════
   THE JOBS
   ══════════════════════════════════════════════════════════════════════════ */

export const JOBS = [
  {
    id: 'J1',
    client: 'Halvorsen Pumps',
    title: 'Bearing housing — Ø40 H6 bore',
    brief:
      'Their pump line is down. One housing, bored to H6, before the courier ' +
      'at 10:30. The casting came pre-drilled at Ø36, so there is 2 mm of radius ' +
      'to come out — and the drawing calls up from nominal, not both ways.',
    material: 'steel_4140',
    machine: 'vmc_40taper_7k5',
    nominal_mm: 40,
    grade: 'IT6',
    start_hole_dia_mm: 36,
    bore_depth_mm: 30,
    clock_start_min: 8 * 60,
    deadline_min: 10 * 60 + 30,
    /* H6 is a hole-basis tolerance and it runs UPWARD from nominal:
       Ø40 H6 = +0.000 / +0.016 mm. One-sided. You cannot be "slightly under
       nominal" and still be in spec — which is exactly the direction every
       error term in this model pushes you. */
    band_low_mm: 40.000,
    band_high_mm: 40.016,
    rate: 1850,
    late_credit: 0.7,
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   THERMAL CONSTANTS — EXPOSED AND PLACEHOLDER
   ══════════════════════════════════════════════════════════════════════════
   These are the right order of magnitude for a 40-taper machining centre, and
   every one of them changes how the game plays, so they are named here rather
   than buried. They have NOT been measured against a real machine. The spec's
   honest-weak-list says so and this is where that promise is kept.
   ------------------------------------------------------------------------ */
export const THERMAL = {
  ambient_C: 20,

  /* Time constants for a first-order lumped model, in minutes.
     The SCREW is deliberately slower than the spindle: the screw sits behind
     the bearings and the housing, so it is still climbing while the spindle
     has already settled. That lag is where the last 5 µm of a job hides. */
  spindle_tau_min: 25,
  screw_tau_min: 40,
  part_tau_min: 7,

  /* Thermal mass the spindle bearings and the screw are bolted to.
     90 kJ/K is roughly 60 kg of cast iron — a benchtop-class machine. */
  frame_heat_capacity_J_per_K: 90000,

  /* Where a cut's mechanical power goes. Most of it leaves in the chip. */
  part_heat_fraction: 0.08,     // into the workpiece
  heat_to_machine: 0.05,        // into the structure via the tool and the work
  coolant_fraction: 0.5,        // flood coolant takes half of the part's share

  /* A spindle that is turning warms the part even when it is not cutting,
     because the part is bolted to something warm. */
  part_coupling: 0.30,
  on_machine_extra_K: 1.2,      // a stopped machine still sits above ambient
};

/* ══════════════════════════════════════════════════════════════════════════
   TOOLING
   ══════════════════════════════════════════════════════════════════════════
   Stickout is the whole game with a boring bar: tip deflection goes as L³, so
   the same bar hung out 65 mm instead of 50 mm flexes 2.2x as much. The bar
   also has to clear the bore, so there is a floor on overhang — the player
   cannot cheat it to zero, only refuse to make it worse.
   ------------------------------------------------------------------------ */
export const TOOLING = [
  { id: 'bar12', label: 'Ø12 carbide boring bar', D: 12, z: 1, max_stickout_mm: 55,
    note: 'For small bores only. It flexes more than it cuts.' },
  { id: 'bar16', label: 'Ø16 carbide boring bar', D: 16, z: 1, max_stickout_mm: 70,
    note: 'The usual workhorse for a bore this size.' },
  { id: 'bar20', label: 'Ø20 carbide boring bar, tuned', D: 20, z: 1, max_stickout_mm: 85,
    note: 'Stiff. Rough with this and deflection stops being the story.' },
];

/* ══════════════════════════════════════════════════════════════════════════
   FRAME DISCIPLINE
   ══════════════════════════════════════════════════════════════════════════
   There is exactly ONE authoritative size, and it is the COLD bore diameter:
   the number the inspector gets with the part on a granite plate at 20 °C.

   Everything else is DERIVED:
     hot radius   = cold radius + thermal expansion right now
     bar position = wherever the last cut left the edge, as a radius

   Getting this wrong is not a rounding error. An earlier version of this file
   stored the bar position in the hot frame and then compared it against a cold
   band, which silently handed the operator free micrometres on every pass and
   is also how a Ø36 bore jumped a whole millimetre in testing.
   ------------------------------------------------------------------------ */

/**
 * How far the CUTTING EDGE has been displaced by the machine's thermal state,
 * in µm of RADIUS. Positive = the bar is cutting a bigger hole than cold.
 *
 * Two mechanisms, both one-directional:
 *   the shank's RADIUS grows        — the bar gets thicker, the edge moves out
 *   the ballscrew grows in X        — the axis thinks it is somewhere else
 *
 * The bar also grows LONGER, and that is deliberately NOT counted here: a longer
 * bar reaches deeper into the bore, it does not cut a wider one. Counting axial
 * growth as radial error is a classic way to make a simulation lie.
 */
export function edgeOffset_um(g) {
  if (!g.toolSpec) return 0;
  const dtTool = g.machine.spindleC - g.machine.refSpindleC;
  const dtScrew = g.machine.screwC - g.machine.refScrewC;
  return mmGrowth_perK(K_CARBIDE, g.toolSpec.D / 2, dtTool) * MM_TO_UM
       + mmGrowth_perK(K_SCREW, SCREW_LOOP_MM, dtScrew) * MM_TO_UM;
}

/** Thermal expansion of the bore right now, µm of DIAMETER. */
export function partGrowth_um(g) {
  return g.mat.k_thermal * g.job.nominal_mm * (g.part.partC - g.thermal.ambient_C) * 1000;
}

/** The bore as it physically exists at this instant, mm. */
export function hotBoreDia(g) {
  return g.part.holeDia_cold_mm + partGrowth_um(g) / 1000;
}

/** The part's thermal capacity, J/K — a solid of its own geometry, not a fudge.
    A housing with a Ø40 x 30 bore is not a thin ring: there is a wall of iron
    around it and a flange around that. Modelling the wall honestly is the
    difference between the workpiece heating 3 K over a roughing sequence and
    heating 30 K, which would make the thermal story about the PART instead of
    about the MACHINE — and the machine is where the micrometres actually are. */
export function partThermalCap_J_per_K(g) {
  const r_m = g.job.nominal_mm / 2000;
  const L_m = g.job.bore_depth_mm / 1000;
  const OD_m = (g.job.nominal_mm + 60) / 1000;      // ~30 mm wall each side
  const V = Math.PI * (OD_m * OD_m / 4 - r_m * r_m) * L_m;
  return g.mat.rho_kg_m3 * V * (g.mat.cp_J_per_kgK || 470);
}

/* ══════════════════════════════════════════════════════════════════════════
   THERMAL PHYSICS — ONE LAW, USED EVERYWHERE
   ══════════════════════════════════════════════════════════════════════════
   A body at 20 °C that gains heat P and loses `u·(T - 20)` settles at 20 + P/u.
   The loss coefficient is not a separate fudge factor: it is what makes the
   machine's own time constant mean something, because `tau = C/u`.

   Using the same law for warm-up, cutting and dwell means the machine cannot
   warm up by one rule and cool down by another — which is how you accidentally
   build a perpetual motion machine out of a machine shop.
   ------------------------------------------------------------------------ */
const lossCoeff_W_per_K = (t) => t.frame_heat_capacity_J_per_K / (t.spindle_tau_min * 60);

/* Thermal expansion coefficients, per K. Both provisional — see the spec's
   honest-weak-list. Sources to attach: bar supplier catalogue for the carbide
   figure, screw supplier chart for the steel figure. */
export const K_CARBIDE = 5.5e-6;
export const K_SCREW = 12.0e-6;
/** Millimetres of X ballscrew unwinding between the machine datum and the bore. */
export const SCREW_LOOP_MM = 120;

/* Millimetres of growth per Kelvin per millimetre of material.
   A 120 mm screw at +1 K is 0.00144 mm = 1.44 µm longer. Writing this as a
   named constant rather than an inline power of ten is deliberate: an inline
   `* 1e6` in place of `* 1e3` made every thermal offset in this file 1000x too
   large, which is 4.6 MILLIMETRES of spindle-thermal error after a warm-up and
   would have shipped as a game where the bore was three sizes out and nobody
   could say why. */
const mmGrowth_perK = (k_perK, mm, dK) => k_perK * mm * dK;
const MM_TO_UM = 1000;

/** One first-order thermal step toward (ambient + P/u). */
function relax(g, { spindle_W = 0, screw_W = 0 }, min) {
  const t = g.thermal;
  const u = lossCoeff_W_per_K(t);
  const amb = t.ambient_C;
  const k = (tau) => 1 - Math.exp(-Math.max(min, 0) / Math.max(tau, 0.001));
  g.machine.spindleC += (amb + spindle_W / u - g.machine.spindleC) * k(t.spindle_tau_min);
  g.machine.screwC += (amb + screw_W / u - g.machine.screwC) * k(t.screw_tau_min);
}

/* ══════════════════════════════════════════════════════════════════════════
   GAME STATE
   ══════════════════════════════════════════════════════════════════════════ */

export function newGame(job = JOBS[0], thermal = THERMAL, money = 0) {
  const mat = MATERIALS[job.material];
  const mach = MACHINES[job.machine];
  const band = itWidth_um(job.nominal_mm, job.grade);

  const g = {
    job, thermal, materialKey: job.material, machineKey: job.machine, mat, mach, band,
    clock_min: job.clock_start_min,
    deadline_min: job.deadline_min,

    machine: {
      spindleC: thermal.ambient_C,
      screwC: thermal.ambient_C,
      /* The machine is CALIBRATED COLD, when the job starts. Every thermal term
         is therefore growth SINCE THEN — this is not a trap the game sets, it
         is the default state of the world in every shop on earth. */
      refSpindleC: thermal.ambient_C,
      refScrewC: thermal.ambient_C,
      /* THE DATUM. The bar's cutting edge, as an absolute radius from the spindle
         axis in the COLD frame. It is set once, at touch-off, and after that the
         dial only ever increments it — the operator does not re-derive where the
         tool is from a wall that has moved since the last pass.

         This is the correction that made the whole finish sequence work. An
         earlier version re-referenced the dial to the (thermally moved) wall on
         every pass, so each cut both removed metal AND inherited the machine's
         drift as free stock; the dial-to-result mapping drifted by ~14 µm per
         pass and the job was unwinnable no matter how carefully it was played. */
      edgeR_cold_mm: null,
      spindle_on: false,
      spindle_on_min: 0,
      warmup_log: [],
    },

    tool: null, stickout_L: null, toolSpec: null,

    part: {
      holeDia_cold_mm: job.start_hole_dia_mm,   // THE master state
      partC: thermal.ambient_C,
      mounted: true,                            // it is on the table from the start
      cutting: false,                           // has any metal come off yet
    },

    money: money, charges: [], strikes: 0,
    log: [], history: [], passes: 0, shots: 0,
    finished: null,
  };

  log(g, 'clock', `Shift starts ${hhmm(g.clock_min)}. ${job.client} on the bench.`);
  log(g, 'note',
    `Bore is Ø${job.nominal_mm} ${job.grade} — a ${band.toFixed(0)} µm band, ` +
    `${job.band_low_mm.toFixed(3)} to ${job.band_high_mm.toFixed(3)} mm. ` +
    `${job.start_hole_dia_mm} mm as found.`);
  log(g, 'note', 'Machine was calibrated cold when the job started. It is not cold now.');
  return g;
}

function log(g, kind, text) {
  g.log.push({ t: g.clock_min, kind, text });
  if (g.log.length > 400) g.log.shift();
}

export const hhmm = (m) => {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
export const elapsed = (g) => g.clock_min - g.job.clock_start_min;
export const remaining = (g) => g.deadline_min - g.clock_min;
export const isLate = (g) => g.clock_min > g.deadline_min;

/* ══════════════════════════════════════════════════════════════════════════
   MACHINE OPERATIONS
   ══════════════════════════════════════════════════════════════════════════ */

export function loadTool(g, toolId, stickout_L) {
  const spec = TOOLING.find((x) => x.id === toolId);
  if (!spec) return { ok: false, why: 'no such tool' };
  if (stickout_L < g.job.bore_depth_mm * 0.8) {
    return { ok: false, why: 'TOO SHORT',
      detail: `The bar has to reach ${g.job.bore_depth_mm} mm of bore. ` +
              `${stickout_L} mm will not clear it. You cannot bore what you cannot reach.` };
  }
  if (stickout_L > spec.max_stickout_mm) {
    return { ok: false, why: 'OVERHUNG',
      detail: `A ${spec.D} mm bar hung out ${stickout_L} mm is past its ` +
              `${spec.max_stickout_mm} mm working limit. It will sing.` };
  }
  const changed = g.tool !== toolId || g.stickout_L !== stickout_L;
  g.tool = toolId; g.stickout_L = stickout_L; g.toolSpec = spec;
  if (changed) {
    // Changing the bar re-zeroes the dial: the operator touches off again.
    g.machine.edgeR_cold_mm = null;
    log(g, 'tool', `Loaded ${spec.label} at ${stickout_L} mm stickout. Dial re-zeroed.`);
  }
  return { ok: true, spec };
}

/**
 * Run the spindle empty so the machine reaches thermal equilibrium.
 *
 * Takes no skill at all to do. It takes discipline to do it BEFORE you measure
 * anything, which is the entire lesson: a machine that has been turning for
 * forty minutes is a different size from one that has been turning for two, and
 * the difference on this bore is a third of an IT6 band.
 */
export function warmUp(g, min) {
  if (!(min > 0)) return { ok: false, why: 'nothing to do' };
  const t = g.thermal;
  const before = { s: g.machine.spindleC, k: g.machine.screwC, p: g.part.partC };
  g.machine.spindle_on = true;
  const idle = g.mach.idle_spindle_kW || 0.5;
  relax(g, { spindle_W: idle * 1000, screw_W: idle * 500 }, min);
  if (g.part.mounted) {
    const tgt = t.ambient_C + t.part_coupling * (g.machine.spindleC - t.ambient_C);
    g.part.partC += (tgt - g.part.partC) * (1 - Math.exp(-min / t.part_tau_min));
  }
  g.clock_min += min;
  g.machine.spindle_on_min += min;
  g.machine.warmup_log.push({ t: g.clock_min, min });
  const dS = g.machine.spindleC - before.s, dK = g.machine.screwC - before.k;
  log(g, 'warm', `Spindle warm-up, ${min} min at speed. Spindle +${dS.toFixed(1)} K, ` +
                 `ballscrew +${dK.toFixed(1)} K.`);
  return { ok: true, machine_dK: dS, screw_dK: dK, part_dK: g.part.partC - before.p };
}

/**
 * What a warm-up of `min` would do — without doing it.
 *
 * Not a cheat: a machine's thermal time constants are in its manual, and any
 * operator who has run the same lathe for a year can tell you where it settles.
 * What the manual will NOT tell you is which size your part needs to be measured
 * against, which is the decision this preview exists to leave in the player's lap.
 */
export function warmUpPreview(g, min) {
  const t = g.thermal;
  const u = t.frame_heat_capacity_J_per_K / (t.spindle_tau_min * 60);   // W/K, as relax()
  const idle = g.mach.idle_spindle_kW || 0.5;
  const settle = (W) => t.ambient_C + W / u;
  const kS = 1 - Math.exp(-Math.max(min, 0) / Math.max(t.spindle_tau_min, 0.001));
  const kK = 1 - Math.exp(-Math.max(min, 0) / Math.max(t.screw_tau_min, 0.001));
  const spindleC = g.machine.spindleC + (settle(idle * 1000) - g.machine.spindleC) * kS;
  const screwC = g.machine.screwC + (settle(idle * 500) - g.machine.screwC) * kK;
  const tgt = t.ambient_C + t.part_coupling * (spindleC - t.ambient_C);
  const partC = g.part.partC + (tgt - g.part.partC) * (1 - Math.exp(-min / t.part_tau_min));
  return { clock_min: g.clock_min + min, spindleC, screwC, partC,
           spindle_dK: spindleC - g.machine.spindleC, screw_dK: screwC - g.machine.screwC };
}

/** Stop. The part cools quickly; the machine very slowly, and never back to zero. */
export function dwell(g, min) {
  if (!(min > 0)) return { ok: false, why: 'nothing to do' };
  const t = g.thermal;
  const p0 = g.part.partC, s0 = g.machine.spindleC, k0 = g.machine.screwC;
  g.machine.spindle_on = false;
  const soak = t.on_machine_extra_K * t.frame_heat_capacity_J_per_K / (t.spindle_tau_min * 60);
  relax(g, { spindle_W: soak, screw_W: 0 }, min);
  g.part.partC += (t.ambient_C - g.part.partC) *
                  (1 - Math.exp(-min / Math.max(t.part_tau_min / 2, 0.001)));
  g.clock_min += min;
  log(g, 'dwell', `${min} min standing. Part cooled ${(p0 - g.part.partC).toFixed(1)} K, ` +
                  `spindle ${(s0 - g.machine.spindleC).toFixed(1)} K, ` +
                  `screw ${(k0 - g.machine.screwC).toFixed(1)} K.`);
  return { ok: true, part_dK: -(p0 - g.part.partC), machine_dK: -(s0 - g.machine.spindleC) };
}

/* ══════════════════════════════════════════════════════════════════════════
   ONE CUT
   ══════════════════════════════════════════════════════════════════════════
   The only place metal is removed. It exists as its own primitive because
   roughing — "take it down to X" — cannot express the last thirty micrometres
   of a job, where every pass is a separate decision and the bar's fixed runout
   is larger than the bite you are taking.

   `bite_mm` is the radial advance of the dial: not a diameter, not a depth. On
   a boring bar the dial moves the edge sideways into the wall, so the bite IS
   the chip thickness the bar is asked to take — one pass, one advance.
   ------------------------------------------------------------------------ */
export function cutOnce(g, { bite_mm, feed_mm_rev, vc, label }) {
  if (!g.tool) return { ok: false, why: 'NO TOOL', detail: 'Load a boring bar first.' };
  if (!(bite_mm > 0)) return { ok: false, why: 'NO BITE', detail: 'The dial has to move.' };

  const spec = g.toolSpec;
  const feed = feed_mm_rev != null ? feed_mm_rev : 0.15;
  const hotR = hotBoreDia(g) / 2;

  // ── touch off, once ─────────────────────────────────────────────────────
  // After a tool change the operator cranks the bar out until it kisses the
  // wall and calls that zero. The bar's position is then a COLD-frame quantity
  // and the dial increments it forever after.
  if (g.machine.edgeR_cold_mm == null) {
    g.machine.edgeR_cold_mm = hotR - edgeOffset_um(g) / MM_TO_UM;
    log(g, 'tool', `Touched off — dial zeroed on the wall at Ø${hotBoreDia(g).toFixed(3)} mm ` +
                   `(part at ${g.part.partC.toFixed(1)} °C).`);
  }

  // Where the edge is RIGHT NOW, in the hot frame the metal actually lives in.
  // The dial command is an increment on the cold datum; the thermal offset is
  // added because it is physically there, whether or not the operator admits it.
  const edge_coldR = g.machine.edgeR_cold_mm;
  const ofs_um = edgeOffset_um(g);
  const edge_hotR = edge_coldR + ofs_um / MM_TO_UM;
  const dialRead_mm = edge_coldR + bite_mm;

  // ── what the command actually asks the bar to shear ─────────────────────
  // The bite is measured from where the METAL is, not from where the dial says
  // the tool is. The difference between those two is the whole job.
  const bite_effective_mm = edge_hotR + bite_mm - hotR;

  if (bite_effective_mm <= 0) {
    return { ok: false, why: 'RUBBING', ofs_um, hotR_mm: hotR, edge_hotR_mm: edge_hotR,
      detail: `The dial is ${(bite_mm * 1000).toFixed(1)} µm out but the machine has ` +
              `already pushed the edge ${ofs_um.toFixed(1)} µm past that, so the bar would ` +
              `sit in fresh air. Dial at least ${(ofs_um - (edge_hotR - hotR) * MM_TO_UM + 0.5).toFixed(1)} µm ` +
              `just to touch the wall.` };
  }

  // ── stock check, in the HOT frame ───────────────────────────────────────
  // A hot wall is still a wall: the metal the bar can reach is measured at the
  // temperature it is currently at. Comparing a hot wall against a cold band
  // silently hands the operator free micrometres — the same mistake the whole
  // job is about, made by the referee.
  const stock_r = g.job.band_high_mm / 2 + partGrowth_um(g) / 2000 - hotR;
  if (bite_effective_mm > stock_r + 1e-6) {
    return { ok: false, why: 'NO STOCK', hotR_mm: hotR, stock_r_um: stock_r * 1000,
      detail: `The bar would take ${(bite_effective_mm * 1000).toFixed(1)} µm of radius ` +
              `but only ${(stock_r * 1000).toFixed(1)} µm is left below the top of the band. ` +
              `That is not a pass, that is scrap.` };
  }

  // ── the bar does not reach where the dial says ──────────────────────────
  // Force needs depth and depth is reduced by force, so it is a self-consistent
  // problem. Relax it. The result is h_act, the REALISED bite, with the sag
  // already inside it. Subtracting the sag a second time afterwards — which an
  // earlier version did — makes the bar cut BEHIND where it physically sits,
  // removing metal at a radius smaller than the tool occupies. Not a thing that
  // can happen, and it wrecked the dial-to-result mapping.
  const tool = makeTool({ D: spec.D, z: spec.z, stickout_L: g.stickout_L });
  const thermalArgs = {
    dt_tool_K: g.machine.spindleC - g.machine.refSpindleC,
    dt_screw_K: g.machine.screwC - g.machine.refScrewC,
    dt_part_K: g.part.partC - g.thermal.ambient_C,
    part_len_mm: g.job.nominal_mm,
  };
  const h_cmd = bite_effective_mm;
  let h_act = h_cmd, as = null;
  for (let i = 0; i < 40; i++) {
    as = assessBoring({ b: h_act, feed, vc }, { tool, material: g.mat }, g.mach, thermalArgs);
    if (!isFinite(as.step.F_mean_N)) break;
    const next = Math.min(Math.max(h_cmd - as.err.deflection_mean_um / 1000, 1e-6), h_cmd);
    if (Math.abs(next - h_act) < 1e-9) { h_act = next; break; }
    h_act = next;
  }
  if (!as) return { ok: false, why: 'CUT DID NOT RESOLVE' };

  if (as.verdict === 'CHATTER' || String(as.verdict).endsWith('LIMIT')) {
    return { ok: false, why: as.verdict, assess: as, spec,
      detail: as.chatter
        ? 'The bar rings at this depth. Take less, or hang it out less.'
        : `That wants ${(as.step.power_frac * 100).toFixed(0)}% of spindle power.` };
  }

  const sag_um = (h_cmd - h_act) * 1000;
  const runout_um = (as.err.terms.find((x) => x.name && /runout/i.test(x.name)) || { um: 0 }).um;
  const b_hot_um = h_act * 1000;

  // ── where the new wall is ───────────────────────────────────────────────
  // The edge is displaced by its thermal offset (it cuts where it physically
  // is) and by its fixed runout (it cuts the high side of its own circle). Both
  // move the whole edge OUTWARD. The sag is already inside h_act and must not be
  // applied again.
  const cut_hotR = hotR + (b_hot_um + runout_um) / 1000;
  const new_edge_coldR = cut_hotR - edgeOffset_um(g) / MM_TO_UM;

  // ── time ────────────────────────────────────────────────────────────────
  const travel_mm = g.job.bore_depth_mm;
  const feed_mm_min = as.step.f;
  const cut_min = travel_mm / Math.max(feed_mm_min, 0.001) + 0.4;   // + retract and reset

  // ── heat ────────────────────────────────────────────────────────────────
  // TWO sources, and over a job the idle one dominates:
  //   the cut      ~0.4 kW, with nearly all of it leaving on the chip
  //   the spindle  ~0.55 kW just turning, with nowhere to go but the bearings
  // You do not warm a machine up to heat the CUTTING. You warm it up because the
  // spindle is a heater that happens to also hold a tool.
  const t = g.thermal;
  const cutting_J = as.step.Pc_kW * cut_min * 60 * 1000;
  const idle_kW = g.mach.idle_spindle_kW || 0.5;
  g.part.partC += (cutting_J * t.part_heat_fraction * (1 - t.coolant_fraction)) /
                  partThermalCap_J_per_K(g);
  relax(g, { spindle_W: idle_kW * 1000, screw_W: idle_kW * 500 }, cut_min);
  g.machine.spindleC += (cutting_J * t.heat_to_machine) / t.frame_heat_capacity_J_per_K;
  g.machine.screwC += (cutting_J * t.heat_to_machine * 0.5) / t.frame_heat_capacity_J_per_K;
  g.machine.spindle_on = true;
  g.machine.spindle_on_min += cut_min;
  // NOTE: the frame->part coupling is deliberately NOT applied here. A
  // half-minute cut is far shorter than any meaningful frame-to-part time
  // constant, so applying it per cut made the part jump Kelvin per pass on a
  // coupling that simply has not got that much power behind it. The part picks
  // up the machine's temperature the way it really does — by SITTING on it,
  // which only happens in warmUp() and dwell().

  // ── commit ──────────────────────────────────────────────────────────────
  // The part was EXPANDED while it was cut, so the metal that was removed is
  // measured hot. The cold size is what survives to the inspection bench.
  const partExp_um = partGrowth_um(g);
  const hotDia = cut_hotR * 2;
  const coldDia = hotDia - partExp_um / 1000;
  const prevCold = g.part.holeDia_cold_mm;
  const removed_um = (coldDia - prevCold) * 1000;

  g.part.holeDia_cold_mm = coldDia;
  g.machine.edgeR_cold_mm = new_edge_coldR;
  g.clock_min += cut_min;
  g.passes += 1;
  g.part.cutting = true;

  const rec = {
    n: g.passes, t: g.clock_min, label: label || 'Pass',
    bite_cmd_um: bite_mm * 1000,
    bite_effective_um: h_cmd * 1000,
    bite_realised_um: h_act * 1000,
    sag_um, edge_offset_um: ofs_um,
    feed_mm_rev: feed, vc_m_min: as.step.vc_m_min, kc: as.step.kc,
    n_rpm: as.step.n, power_kW: as.step.Pc_kW, force_N: as.step.F_mean_N,
    cut_min, travel_mm, feed_mm_min,
    toolGrowth_um: mmGrowth_perK(K_CARBIDE, spec.D / 2,
                     g.machine.spindleC - g.machine.refSpindleC) * MM_TO_UM,
    screwGrowth_um: mmGrowth_perK(K_SCREW, SCREW_LOOP_MM,
                     g.machine.screwC - g.machine.refScrewC) * MM_TO_UM,
    runout_um, grow_um: ofs_um,
    partExp_um, prevCold, coldDia, hotDia, removed_um,
    /* The kernel's own surface-finish prediction for THIS pass, carried onto the
       record so the part's wall can be drawn and described from it rather than
       from a remembered number. Zero extra arithmetic — `as` already has it. */
    ra_est_um: as.ra_est_um,
    verdict: as.verdict,
    chatter_load: as.chatter_load,
    spindleC: g.machine.spindleC, screwC: g.machine.screwC, partC: g.part.partC,
    dialRead_mm, edge_coldR_mm: edge_coldR, edge_hotR_mm: edge_hotR,
    cut_hotR_mm: cut_hotR, hotR_mm: hotR,
  };
  g.history.push(rec);

  log(g, 'cut',
    `${rec.label} ${g.passes}: dialled ${(bite_mm * 1000).toFixed(1)} µm, bar took ` +
    `${(h_act * 1000).toFixed(1)} µm. Bore Ø${coldDia.toFixed(4)} mm cold. ` +
    `${cut_min.toFixed(1)} min, ${as.step.Pc_kW.toFixed(2)} kW.`);

  return { ok: true, rec, assess: as, coldDia, hotDia, cut_min,
           hotR_mm: hotR, cut_hotR_mm: cut_hotR, edge_offset_um: ofs_um,
           bite_effective_um: h_cmd * 1000 };
}

/* ══════════════════════════════════════════════════════════════════════════
   MEASUREMENT — the part you cannot see
   ══════════════════════════════════════════════════════════════════════════
   A bore gauge reports the size of the hole it is inside, at the temperature
   the hole currently is. It is a good instrument and it is not lying to you.

   What it cannot do is tell you the size the part will be in an hour. That is
   not a gap in the simulation, it is the difficulty of the trade: you get a
   number, you get a temperature, and the arithmetic that turns one into the
   other is yours to do.
   ------------------------------------------------------------------------ */
export const GAUGE_SIGMA_UM = 0.8;

export function measure(g, { samples = 3, seed = 1 } = {}) {
  const hotDia = hotBoreDia(g);
  // A real gauge has resolution and repeatability. Both are honest; neither is
  // big enough to rescue a decision that was already wrong.
  let rnd = (seed * 9301 + 49297) % 233280;
  const nextR = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280 - 0.5; };
  const readings = [];
  for (let i = 0; i < samples; i++) readings.push(hotDia + nextR() * 2 * (GAUGE_SIGMA_UM / 1000));
  const reading = readings.reduce((a, b) => a + b, 0) / samples;
  g.shots += 1;
  g.clock_min += 0.5;
  const out = {
    reading_mm: reading,
    hotDia_mm: hotDia,
    coldDia_mm: g.part.holeDia_cold_mm,          // for tests, NOT for the player
    partC: g.part.partC,
    expansion_um: partGrowth_um(g),
    sigma_um: samples > 1 ? GAUGE_SIGMA_UM / Math.sqrt(samples) : GAUGE_SIGMA_UM,
    samples,
  };
  log(g, 'gauge', `Bore ${reading.toFixed(4)} mm on the gauge, part at ` +
                  `${g.part.partC.toFixed(1)} °C.`);
  return out;
}

/** What the inspector will say. This is the only verdict that exists. */
export function inspect(g) {
  const dia = g.part.holeDia_cold_mm;
  const lo = g.job.band_low_mm, hi = g.job.band_high_mm;
  const band_um = (hi - lo) * 1000;
  let verdict;
  if (dia < lo - 1e-9) verdict = 'UNDERSIZE — SCRAP';
  else if (dia > hi + 1e-9) verdict = 'OVERSIZE — can still be cut';
  else verdict = 'ACCEPTED';
  return {
    dia, lo, hi, band_um, position_in_band_um: (dia - lo) * 1000,
    over_um: Math.max((dia - hi) * 1000, 0),
    under_um: Math.max((lo - dia) * 1000, 0),
    inSpec: verdict === 'ACCEPTED',
    verdict,
  };
}

/**
 * The customer takes the part. Money changes hands once, here.
 *
 * Undersize is fatal and costs more than the job pays, because a bore that is
 * too small cannot be made bigger without welding it up — you lose the part AND
 * the morning you spent on it. Oversize is survivable and charged as rework.
 * That asymmetry is real, and it is the reason a machinist would rather be
 * 4 µm over than 4 µm under.
 */
export function ship(g) {
  const v = inspect(g);
  const late = isLate(g);
  let paid = 0, fee = 0, note;
  if (v.verdict === 'ACCEPTED') {
    paid = g.job.rate * (late ? g.job.late_credit : 1);
    note = late
      ? `Accepted at ${hhmm(g.clock_min)} — past the courier. Paid at ` +
        `${(g.job.late_credit * 100).toFixed(0)}%.`
      : 'Accepted, in spec, on time. Invoice goes out.';
  } else if (v.verdict === 'UNDERSIZE — SCRAP') {
    fee = g.job.rate * 1.15;
    note = `Scrapped — ${v.under_um.toFixed(1)} µm under. The bore cannot be made ` +
           `larger. You are out the part and the morning.`;
  } else {
    fee = g.job.rate * 0.35;
    note = `Shipped ${v.over_um.toFixed(1)} µm oversize. The customer reworks it and ` +
           `charges you for the privilege.`;
  }
  g.money += paid - fee;
  g.charges.push({ t: g.clock_min, kind: v.verdict, paid, fee, note });
  g.finished = { ...v, paid, fee, late, net: paid - fee,
                 clock_min: g.clock_min, passes: g.passes, shots: g.shots };
  log(g, 'ship', note);
  return { ...v, paid, fee, late, net: paid - fee, clock_min: g.clock_min,
           elapsed_min: elapsed(g), passes: g.passes, shots: g.shots, note };
}

/* ══════════════════════════════════════════════════════════════════════════
   CONVENIENCE: rough down to a target diameter
   ══════════════════════════════════════════════════════════════════════════
   Roughing is not a series of decisions, it is a series of repeats. This runs
   the repeats and stops when the next pass would go past the target, so the
   player's real roughing choice is the ALLOWANCE they leave, not eleven
   individual bites.
   ------------------------------------------------------------------------ */
export function roughTo(g, { target_dia_mm, bite_mm = 0.3, feed_mm_rev = 0.15, vc = 120 } = {}) {
  const passes = [];
  for (let i = 0; i < 40; i++) {
    /* Drive on the COLD diameter, because that is the only number the player can
       hold in their head. `cutOnce` works out what that means for the dial once
       the machine's thermal offset is in it — which is the correct division of
       labour and also why roughing is forgiving and finishing is not. */
    const want_r = (target_dia_mm - g.part.holeDia_cold_mm) / 2;
    if (want_r <= 1e-5) break;
    const bite = Math.min(bite_mm, want_r);
    const r = cutOnce(g, { bite_mm: bite, feed_mm_rev, vc, label: 'Rough' });
    if (!r.ok) return { ok: false, why: r.why, detail: r.detail, passes };
    passes.push(r.rec);
  }
  return { ok: true, passes, dia: g.part.holeDia_cold_mm,
           minutes: passes.reduce((a, p) => a + p.cut_min, 0) };
}

/* ---------------------------------------------------------------------------
   Back-compat shim for the older probes. Kept so nothing that already ran
   silently changes meaning; it delegates to cutOnce.
   ------------------------------------------------------------------------- */
export function boreOp(g, { toolId, stickout_L, bite_mm, feed_mm_rev, vc }) {
  if (toolId && (g.tool !== toolId || g.stickout_L !== stickout_L)) {
    const l = loadTool(g, toolId, stickout_L);
    if (!l.ok) return l;
  }
  const r = cutOnce(g, { bite_mm, feed_mm_rev, vc, label: 'Pass' });
  if (!r.ok) return r;
  return {
    ok: true, ...r.rec, coldDia: r.coldDia, hotDia: r.hotDia,
    cut_hot_r_mm: r.cut_hot_r_mm, drop_um: r.rec.sag_um,
    bite_cmd_mm: r.rec.bite_cmd_um / 1000, bite_realised_mm: r.rec.bite_realised_um / 1000,
    step_mm: r.rec.bite_mm, travel_mm: r.rec.travel_mm, cut_min: r.rec.cut_min,
    power_kW: r.rec.power_kW, feed_mm_min: r.rec.feed_mm_min, n: r.rec.n_rpm,
  };
}

/** Single-step relaxation of the engagement integral. Not the integral itself. */
export const realisedDepth = (commanded_mm, deflection_um) =>
  Math.max(commanded_mm - deflection_um / 1000, 0);
