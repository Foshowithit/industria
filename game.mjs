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
/* ONE LINE, deliberately. The single-file builder rewrites this specifier by
   exact string match and refuses when the needle is not sitting on an import
   line, so a wrapped import list puts it on a continuation line and the build
   dies with "is not on an import line". That is the builder working correctly,
   and worth not rediscovering — the comment above is worded to avoid naming
   the needle itself, because a mention of it here would make the count 2. */
import { CHARGES, COURIER, RACK_SLOTS, BLANK_STOCK, JOB_DEAD, AXIS_DIA_MM, arrivalMin, departsMin, mintBlank, hhmm as worldHHMM } from './world.mjs';

export const GAME_VERSION = '0.3.0';

/* Round 9 defaults, re-exported so nothing else in the build has to import
   world.mjs just to know how many castings are in the crate. */
export { RACK_SLOTS };
export const BLANK_STOCK_DEFAULT = BLANK_STOCK;

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

  /* ── J2 — THE STOCK-REMOVAL JOB ─────────────────────────────────────────
     WHY THIS EXISTS. J1 is a Ø40 bore with 2 mm of radius to come out, which
     a Ø20 bar clears in a handful of 0.3 mm repeats. Measured on J1
     (tools/envelope-sweep.mjs): the deepest dial the machine offers, 400 µm,
     draws 0.033 kW — 0.54 % of the 7.5 kW spindle — at 163 N, with a chatter
     load of 0.010 against a limit that is 44x away. Roughing J1 out takes 24
     passes and 12.7 minutes and NOTHING the player does is ever refused. The
     machine cannot push back on that part, because the part is too small for
     the machine to have an opinion about.

     J2 is the same machine given work that is actually at its size: a Ø80 bore
     in the same 4140, 55 mm deep, 4 mm of radius to come out. Now the walls are
     inside the job instead of far outside it. Measured on J2, in the game's own
     verbs (tools/envelope-sweep.mjs, section 7):

        bite 4.0 mm @ 0.12 mm/rev   -> ok, 3.25 kW =  43 % of spindle power
        bite 4.0 mm @ 0.30 mm/rev   -> REFUSED, SPINDLE POWER LIMIT (107 %)
        bite 4.0 mm @ 0.50 mm/rev   -> REFUSED, SPINDLE POWER LIMIT (157 %)
        bite 3.0 mm @ 0.30 mm/rev   -> REFUSED, TORQUE LIMIT
        bite 2.0 mm @ 0.50 mm/rev   -> ok, 4.75 kW =  63 %

     The lever is FEED, not depth — which is the true statement about this
     physics and the one the kernel already models: MRR = b * h * vc, and kc
     falls as h^-0.25, so leaning on the feed is how a machinist buys removal
     rate, and it is also what runs him out of spindle. A player who has only
     ever played J1 has never had a move refused for wanting too much power.

     THE CHATTER LIMIT IS DELIBERATELY NOT THE JOB. On the boring path
     `stability()` reports ap_crit_relevant = ap_crit_mm / h_mean, i.e. the
     limit is set by the FEED and the dial does not enter it at all. Measured:
     38.57 mm of radial bite at 0.12 mm/rev, 13.2 mm at 0.5, 4.68 mm at 2.0.
     Every one of those bites wants 524 % of spindle power. So on this machine
     power always binds before chatter can be reached, and a job that promised
     chatter would be a job that lies. J2 therefore promises power and torque,
     which the kernel genuinely reaches, and leaves chatter where it is. */
  {
    id: 'J2',
    client: 'Kestrel Marine',
    title: 'Stern tube liner — Ø80 IT7 bore',
    brief:
      'Their slipway window closes at 11:00 and the liner is the long pole. ' +
      'A rough casting, pre-cored at Ø72, so there is 4 mm of radius to take ' +
      'out of it — and the bar has to go 55 mm in to do it. Big bore, deep ' +
      'cut, and a 7.5 kW spindle that will tell you when you have asked for ' +
      'too much. Nobody is going to stop you leaning on the feed.',
    material: 'steel_4140',
    machine: 'vmc_40taper_7k5',
    nominal_mm: 80,
    grade: 'IT7',
    start_hole_dia_mm: 72,
    bore_depth_mm: 55,
    clock_start_min: 8 * 60,
    deadline_min: 11 * 60,
    /* IT7 on Ø80 is +0.000 / +0.030 mm. Wider than the H6 band on J1 in
       absolute terms, and still one-sided from nominal — a bigger part is not
       an easier part, it is the same problem with more metal in the way. */
    band_low_mm: 80.000,
    band_high_mm: 80.030,
    rate: 2400,
    late_credit: 0.7,
  },
];

/** The job the machine is currently set up for. J1 stays the default: it is the
 *  one that teaches the one-directional error first, and a player who has never
 *  held a tolerance has no business being handed a 4 mm roughing cut. */
export const DEFAULT_JOB_ID = 'J1';
export const jobById = (id) => JOBS.find((j) => j.id === id) || JOBS[0];

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

    /* ══════════════════════════════════════════════════════════════════
       ROUND 9 — WHERE THE PART IS, AND WHAT THE SHOP HAS LEFT
       ══════════════════════════════════════════════════════════════════
       Everything below is a PHYSICAL fact about the floor: what is on the
       table, what is in the crate, what is on the rack, what is in the bin,
       which casting is currently on the machine, and whether the van has
       been and gone. Nothing here is a score. `charges` and `money` are
       still here and still move — but they are downstream of these objects,
       not a substitute for them. */
    stock_on_hand: BLANK_STOCK,     // castings left in the crate
    /* The furthest minute any STATE CHANGE has pushed the clock to (recovery,
       inspection). The page adopts it into its own clock so a cost paid in
       the game layer cannot be silently given back by the frame loop. */
    state_clock_floor: job.clock_start_min,
    blanks_used: 0,
    /* THE REGISTER. One entry per casting that has touched this machine, live
       or dead, in the state it actually ended up in. This is the object the
       rack and the bin are rendered from, so a part cannot be in two places. */
    part_register: [],
    /* Active part spec: a re-cut casting starts at Ø36 and its hole was NOT
       touched by you; it is a different casting with the same part number. */
    stock_reset_dia_mm: job.start_hole_dia_mm,
    rack_slots: RACK_SLOTS,
    /* The pad the casting and the vise sit on. A number the SCENE reads, so a
       fixture change does not have to be re-derived in two places. */
    fixture: { parallels_in: false },
    courier: {
      arrived: false, left: false, departed_at: null,
      loaded: 0, dependency: 'OUTSTANDING',   // OUTSTANDING | SATISFIED | UNFULFILLED
      events: [],                              // { at, kind, text } once each
    },
    /* Mr. Achebe's bench. A dead part becomes his morning, 20 minutes in. */
    proof: { shown: false, at_min: null },
    /* The drive's feedback log. See REFUSAL_WHY in people.mjs: this is the
       record of questions the machine was asked and could not answer. */
    drive: { refusals: 0, trouble_min: 0, penalised: 0 },
    inspection: null,               // the last first-off inspection, as measured
  };

  if (g.part_register.length === 0) {
    g.part_register.push({
      id: `${job.id}-01`, job_id: job.id, minted_at: 0,
      state: 'MOUNTED', disposition: null, verdict: null,
      position_in_band_um: null, shipped_at: null, born: 'original',
    });
  }
  g.current_part_id = g.part_register[0].id;

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

/**
 * OBSERVE THE FLOOR WITH THE MACHINE HIDDEN.
 *
 * This is the round-deciding test as a function. Everything the design lead
 * asked for — "observable without reading a ledger" — has to be answerable
 * from objects, counts and clocks, and nothing here touches `charges` or
 * `money`. If two histories produce the same object here, they are the same
 * world no matter what their receipts say.
 */
export function floorObservables(g) {
  return {
    clock_min: +g.clock_min.toFixed(2),
    deadline_min: g.deadline_min,
    /* the machine */
    machine_occupied: !!g.part.mounted,
    on_table: g.part.mounted ? g.current_part_id : null,
    /* the crate, the rack, the bin */
    crate_castings: g.stock_on_hand,
    rack: rackParts(g).map((p) => ({ id: p.id, d: p.disposition })),
    bin: binParts(g).map((p) => p.id),
    gone: goneParts(g).map((p) => p.id),
    /* the floor, as a walk round it */
    die_open: !g.part.mounted,
    parts_total: g.part_register.length,
    /* other people */
    achebe_at_bench: g.proof.at_min !== null && g.clock_min >= g.proof.at_min,
    /* the van */
    courier_arrived: g.courier.arrived,
    courier_left: g.courier.left,
    dependency: g.courier.dependency,
    /* work still possible */
    could_mount_another: !g.part.mounted && g.stock_on_hand > 0,
  };
}

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
  if (dia < lo - 1e-9) verdict = 'UNDERSIZE — can still be cut';
  else if (dia > hi + 1e-9) verdict = 'OVERSIZE — SCRAP';
  else verdict = 'ACCEPTED';
  return {
    dia, lo, hi, band_um, position_in_band_um: (dia - lo) * 1000,
    over_um: Math.max((dia - hi) * 1000, 0),
    under_um: Math.max((lo - dia) * 1000, 0),
    inSpec: verdict === 'ACCEPTED',
    verdict,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 9 — THE PART LIFECYCLE
   ══════════════════════════════════════════════════════════════════════════
   A verdict used to be a string that produced a number. It is now a MOVE: the
   casting leaves the machine and goes somewhere, and where it goes is the
   first thing in this game that the player cannot undo.

   WHY `ship()` IS THE ONLY DOOR. Two measured defects live here.

   1. `part.mounted` stayed `true` after shipping, in every history. The part
      was simultaneously on the table and invoiced. A part is a physical
      object and it is in exactly one place; `dispositionOf` is now that one
      place, and `mount()`/`unmount()` are the only writers.

   2. `ship()` could be called repeatedly on the same part: money went
      1850 -> 3700 -> 5550 at an identical clock (484.6328) with three
      identical ACCEPTED charges. That is not a balance bug, it is the same
      missing object seen from the other side — there was no rack to put the
      part on and no reason for it not to be shipped again. The blank ledge
      below is the fix, and it is a guard on PHYSICAL state (nothing is on
      the table to send) rather than on a call counter.
   ──────────────────────────────────────────────────────────────────────── */

/** Where the casting currently on the machine sits in the register. */
export function currentPart(g) {
  return g.part_register.find((p) => p.id === g.current_part_id) || null;
}

/** Everything physically on the finished rack, oldest first. */
export const rackParts = (g) =>
  g.part_register.filter((p) => p.state === 'RACK');

/** Everything physically in the scrap bin. */
export const binParts = (g) =>
  g.part_register.filter((p) => p.state === 'BIN');

/**
 * IS THIS PART ONE THE VAN WILL TAKE?
 *
 * This is the ONE definition of "the courier can collect it". Round 10A turned
 * `REWORK` from dead code into a real destination: an undersize housing with a
 * bore the customer finishes themselves is not a dead part, it is a job going
 * out incomplete, and leaving it on the rack helps nobody — it also blocks one
 * of four slots forever.
 *
 * Note carefully what this is NOT. "The van will take it" and "delivering it
 * fulfils Halvorsen's requirement" are two different questions, and Round 10A
 * addendum 1 explicitly forbids one helper answering both. See
 * `doesDeliverySatisfyDependency()` directly below.
 *
 * It lives HERE, next to the states it names, rather than as a
 * `disposition === 'SEND' || disposition === 'REWORK'` test repeated in the
 * courier and at three page gates. Four copies of one fact is how this project
 * has already shipped a disagreement with itself twice.
 */
export const collectable = (p) =>
  !!p && (p.disposition === 'SEND' || p.disposition === 'REWORK');

/** Everything physically on the finished rack that the van can take. */
export const collectableParts = (g) => rackParts(g).filter(collectable);

/**
 * DOES DELIVERING THIS PART FULFIL HALVORSEN'S REQUIREMENT?
 *
 * THIS IS A DIFFERENT QUESTION FROM `collectable()` ABOVE, and it must never
 * share an implementation with it. Logistics completion is not production
 * acceptance; conflating them is the exact masquerade this project keeps
 * having to undo.
 *
 * The answer comes from the world's own written contract, not from a decision
 * made here. `world.mjs` `depart()` and this file's courier header both define
 * the state as it stands: *"Halvorsen's pump line is down and it stays down
 * until a HOUSING THAT FITS goes out of that door."* A `REWORK` part is
 * undersize by construction — that is precisely why it is recoverable — so it
 * does not fit, and it cannot satisfy the dependency. The customer receives a
 * nonconforming-but-recoverable housing and still has to cut it.
 *
 * The test is deliberately on the VERDICT and not on the disposition, because
 * `courierDepart` relabels the part `SHIPPED` on its way out and the
 * disposition therefore cannot distinguish the two cases after collection.
 */
export function doesDeliverySatisfyDependency(part) {
  if (!part) return false;
  /* A part that is still on the rack has not been delivered yet. */
  const delivered = part.disposition === 'SHIPPED' || part.disposition === 'SEND';
  return delivered && part.verdict === 'ACCEPTED';
}

/** A part that is neither on the machine, on the rack, nor in the bin. */
export const goneParts = (g) =>
  g.part_register.filter((p) => p.state === 'GONE');

/**
 * TAKE THE PART OFF THE TABLE.
 *
 * This is the function that did not exist. It mutates the two facts that
 * must never disagree again — the register entry and `part.mounted` — in one
 * place, so "is there a part on the machine" has exactly one answer.
 *
 * `state` is one of:
 *   RACK  — inspected and going to the customer
 *   BIN   — dead. Scrap, and the material is gone with it
 *   GONE  — collected by the courier. The part exists, elsewhere, off this
 *           floor, which is the whole point of the rack
 */
export function unmount(g, state, patch = {}) {
  const p = currentPart(g);
  if (!p) return null;
  p.state = state;
  p.left_machine_at = g.clock_min;
  Object.assign(p, patch);
  g.part.mounted = false;
  return p;
}

/* ── THE THREE OUTCOMES, AS PHYSICAL FUTURES ─────────────────────────────
   The design lead's minimum, verbatim: accepted means the part leaves and
   the dependency is satisfied; scrap means it also leaves, to scrap, the
   material is gone, and getting back to an acceptable part takes another
   piece of material and more shop time. Both are implemented as OBJECTS.

   THE SYSTEM'S CUTTING INSERT IS NOT RENEWED ON A SCRAP PART. It is a
   physical fact about this machine: two of the three finish cuts that land
   on scrap here leave the edge with a groove worn in it, so the third
   casting meets a different tool. The insert is a real insert, its condition
   is read from the damage model the kernel ALREADY has (`tool.wear_um`,
   `insert_state()`), and its consequence is the one this game is named for —
   a part that is 2 µm light with a fresh edge and 2 µm lighter than that
   with a used one. It is a consequence, not a pun: scrap out of the wrong
   band costs the shop stock, time AND edge life.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * CLASSIFY WHAT JUST CAME OFF THE TABLE.
 *
 * Deliberately small, and deliberately NOT three separate recovery paths:
 * the design lead's instruction is "only distinguish them further if the
 * actual process supports different recovery". This process has exactly two
 * recoveries, so there are exactly two outcomes here.
 */
export function classifyOffMachine(v) {
  if (v.inSpec) return { outcome: 'ACCEPTED', state: 'RACK', disposition: 'SEND' };
  if (v.under_um > 0) {
    return { outcome: 'RECOVERABLE', state: 'RACK', disposition: 'REWORK',
             why: `${v.under_um.toFixed(1)} µm under the low limit — there is still material to remove` };
  }
  return { outcome: 'SCRAP', state: 'BIN', disposition: 'SCRAP',
           why: `${v.over_um.toFixed(1)} µm over the high limit — the bore cannot be made smaller` };
}

/**
 * THE CUSTOMER TAKES THE PART — or refuses it. Money changes hands once, and
 * the part physically moves, and the moving is the part that mattered.
 */
export function ship(g, { silent = false } = {}) {
  const p = currentPart(g);
  /* HARD LEDGE #1: there is nothing on the table. This is not a rate limit,
     it is the state of the vise. The second and third calls in the measured
     triple-ship trace land here. */
  if (!p || !g.part.mounted || p.state !== 'MOUNTED') {
    return { ok: false, why: 'NO_PART_ON_THE_TABLE',
             detail: p ? `part ${p.id} is ${p.state}` : 'no part in the register',
             clock_min: g.clock_min, money: g.money };
  }

  const v = inspect(g);
  const late = isLate(g);
  const cls = classifyOffMachine(v);

  let paid = 0, fee = 0, note;
  if (cls.outcome === 'ACCEPTED') {
    paid = g.job.rate * (late ? g.job.late_credit : 1);
    note = late
      ? `Accepted at ${hhmm(g.clock_min)} — past the courier's booked slot. Paid at ` +
        `${(g.job.late_credit * 100).toFixed(0)}%.`
      : 'Accepted, in spec, on time. Invoice goes out.';
  } else if (cls.outcome === 'RECOVERABLE') {
    /* THE UNDERSIZE CASE, and it is the recoverable one. The bore is still
       small, so there is metal left to take out — off the machine, by the
       customer, on their own setup, which is what the fee is. */
    fee = g.job.rate * 0.35;
    note = `Shipped ${v.under_um.toFixed(1)} µm under. The customer reworks it and ` +
           `charges you for the privilege.`;
  } else {
    /* THE OVERSIZE CASE, and it is the dead one. Cutting only makes a bore
       larger, so metal this far out is metal nobody can put back. */
    fee = g.job.rate * 1.15;
    note = `Scrapped — ${v.over_um.toFixed(1)} µm over. The bore cannot be made ` +
           `smaller. You are out the casting and the morning.`;
  }

  /* ── THE PART MOVES. This is the mutation the round is about. ─────────── */
  const moved = unmount(g, cls.state, {
    disposition: cls.disposition, verdict: v.verdict,
    position_in_band_um: v.position_in_band_um,
    under_um: v.under_um, over_um: v.over_um,
    shipped_at: g.clock_min,
  });
  g.money += paid - fee;
  g.charges.push({ t: g.clock_min, kind: v.verdict, paid, fee, note });
  g.inspection = v;
  g.finished = { ...v, paid, fee, late, net: paid - fee, outcome: cls.outcome,
                 clock_min: g.clock_min, passes: g.passes, shots: g.shots,
                 part_id: moved.id };
  if (!silent) log(g, 'ship', note);

  /* ── A DEAD PART BECOMES SOMEBODY ELSE'S MORNING ────────────────────────
     Twenty minutes later, a man in the assembly bay picks a bearing up and
     tries to put it in a housing that measured small. He does not tell the
     machine. He is at a bench, and whether the player ever learns why the
     material went hard is a fact about whether they went and looked. */
  if (cls.outcome === 'SCRAP' && g.proof.at_min === null) {
    g.proof.at_min = g.clock_min + JOB_DEAD.min;
    if (!silent) log(g, 'world',
      `${JOB_DEAD.by} has an assembly on bench 3 in ${JOB_DEAD.min} min — ` +
      `he is fitting a Ø${AXIS_DIA_MM} axis to the housing you just scrapped. ` +
      `Nobody has told him.`);
  }
  return { ...v, ...cls, paid, fee, late, net: paid - fee, clock_min: g.clock_min,
           elapsed_min: elapsed(g), passes: g.passes, shots: g.shots, note,
           part_id: moved.id, mounted: g.part.mounted };
}

/**
 * THE SHOP PUTS ANOTHER CASTING ON THE MACHINE.
 *
 * The blank comes out of the crate, the part that failed goes where it
 * belongs, and the hole starts again at Ø36 because it is a DIFFERENT
 * casting — so there is no dial offset to inherit and no thermal history of
 * this part to keep. What does carry over is the MACHINE: it is warm, its
 * screw has grown, and the edge condition is the one the last part left.
 *
 * WHAT THIS DOES NOT DO: reset the clock. The time a recovery costs is the
 * time the recovery costs, and it is charged against the courier like every
 * other minute on this floor.
 */
export function mountBlank(g, { reason = 'RECOVERY', silent = false } = {}) {
  if (g.part.mounted) {
    return { ok: false, why: 'MACHINE_OCCUPIED', detail: `part ${g.current_part_id} is still on the table` };
  }
  if (g.stock_on_hand < 1) {
    return { ok: false, why: 'NO_STOCK_IN_STORES',
             detail: 'the crate is empty — this job cannot be recovered' };
  }
  const n = g.part_register.length;
  const blank = mintBlank(g.job, n);
  const part = {
    id: blank.id, job_id: g.job.id, minted_at: n,
    state: 'MOUNTED', disposition: null, verdict: null,
    position_in_band_um: null, shipped_at: null,
    born: reason, previous: g.current_part_id,
  };
  g.part_register.push(part);
  g.current_part_id = part.id;
  g.stock_on_hand -= 1;
  g.blanks_used += 1;

  /* A re-cut casting is new metal: it is Ø36 as found, and it is COLD. The
     machine is not. Those two sentences are the entire cost of a recovery. */
  g.part.holeDia_cold_mm = g.job.start_hole_dia_mm;
  g.part.partC = g.thermal.ambient_C;
  g.part.mounted = true;
  g.part.cutting = false;
  g.machine.edgeR_cold_mm = null;      // you re-touch off on new metal
  g.machine.refSpindleC = g.machine.spindleC;
  g.machine.refScrewC = g.machine.screwC;
  g.guessed = false;                   // a new part, a new first cut

  const ch = chargeRecovery(g, reason);
  if (!silent) log(g, 'recovery',
    `Fetched ${blank.id} out of the crate — ${ch.blank_cost ? '£' + ch.blank_cost + ', ' : ''}` +
    `${ch.minutes.toFixed(1)} min. ${g.stock_on_hand} casting${g.stock_on_hand === 1 ? '' : 's'} left.`);
  return { ok: true, part, blank, cost: ch, stock_on_hand: g.stock_on_hand,
           clock_min: g.clock_min };
}

/**
 * WHAT A RECOVERY COSTS, and why the two reasons cost different things.
 *
 *   SCRAP      a casting and a walk. The re-cut casting goes back on the SAME
 *              setup — insert, jaws, datum, all of it — because a scrap part
 *              is an OVERSIZE part: cutting only makes a bore larger, so a
 *              bore past the top of the band was caught with the bar still in
 *              the cut, on the setup that made it. It is the CHEAP recovery.
 *              £42 / 1.5 min.
 *   REWORK     an UNDERSIZE part, taken off the machine with metal still to
 *              come out. The customer finishes the bore on their own setup —
 *              and getting back to a shippable part here means a fresh
 *              casting clamped on new parallels and touched off again, which
 *              is twelve minutes of setup plus eighteen pounds on top of the
 *              blank. It is the EXPENSIVE recovery. £60 / 13.5 min.
 *
 * That ordering is the opposite of what a punishment variable would produce
 * (the worse verdict costing less), and it is what the process does. And after
 * Round 10A the two directions agree instead of contradicting each other: the
 * recoverable mistake is being UNDER, and the expensive recovery belongs to
 * the recoverable one. Stopping too early costs you £60 and a re-setup;
 * cutting past the top of the band costs you the casting.
 */
export function chargeRecovery(g, reason) {
  const scrap = reason !== 'REWORK';
  const minutes = CHARGES.blank_min + (scrap ? 0 : CHARGES.setup_min);
  const cost = CHARGES.blank_cost + (scrap ? 0 : CHARGES.remount_cost);
  g.clock_min += minutes;
  if (g.clock_min > g.state_clock_floor) g.state_clock_floor = g.clock_min;
  g.money -= cost;
  g.charges.push({
    t: g.clock_min, kind: scrap ? 'BLANK — SCRAP' : 'BLANK — RE-SETUP',
    paid: 0, fee: cost,
    note: `${scrap ? 'Scrap' : 'Finished'} part replaced: one casting (${minutes.toFixed(1)} min)` +
          (cost ? ` and a re-setup (£${cost}).` : '.'),
  });
  return { minutes, cost, scrap, kind: scrap ? 'BLANK — SCRAP' : 'BLANK — RE-SETUP' };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE COURIER, AT 10:30
   ══════════════════════════════════════════════════════════════════════════
   This is the sentence the job brief has carried since it was written —
   "before the courier at 10:30" — finally made true. Nothing here awards or
   removes money. It ATTEMPTS A SHIPMENT, and the shipment either happens or
   it does not, and the state of Halvorsen's pump line afterwards is a fact
   about Halvorsen rather than a fact about the player's total.
   ──────────────────────────────────────────────────────────────────────── */

/** The one place 10:30 becomes irreversible. Idempotent: the van leaves once. */
export function courierDepart(g) {
  if (g.courier.left) return { ok: false, why: 'ALREADY_GONE', ...g.courier };
  if (g.clock_min < departsMin(g.job)) {
    return { ok: false, why: 'NOT_YET', at: departsMin(g.job), clock_min: g.clock_min };
  }
  const rack = rackParts(g);
  /* ROUND 10A (i): the load rule was `disposition === 'SEND'`. After the
     direction flip an undersize part is racked `REWORK` — customer-finishes —
     and a `SEND`-only rule would leave it uncollected AND blocking a slot.
     `collectable()` is the single definition; see it above. */
  const load = rack.find((p) => p.disposition === 'SEND')
            || rack.find(collectable)
            || null;

  /* ── WHAT THE DRIVER SEES, READ BEFORE ANYTHING MOVES ─────────────────────
     `load.disposition` is overwritten with 'SHIPPED' a few lines below, and
     that write DESTROYS the distinction between "a conforming housing went
     out" and "a housing went out that the customer still has to finish".
     Every fact below that depends on the difference must be captured here,
     before the mutation — including `collected_disposition` on the return
     value, which is what the page's narration reads. Reconstructing this from
     `d.loaded` afterwards is impossible, and doing it anyway is how Round 10A
     added a dead branch (`d.loaded.disposition === 'REWORK'`, never true)
     while deleting another. */
  const collectedDisposition = load ? load.disposition : null;
  const collectedRework = collectedDisposition === 'REWORK';

  if (load) {
    load.state = 'GONE';
    load.disposition = 'SHIPPED';
    load.collected_at = g.clock_min;
    g.courier.loaded += 1;
    /* ── THE DEPENDENCY IS THREE-STATE, AND THIS IS THE WHOLE POINT ─────────
       "Did the van take something?" and "can Halvorsen build?" are different
       questions and they get different answers. A REWORK part is undersize by
       construction: it does not fit, the customer still has to cut it, and
       the pump line is still down. Marking that SATISFIED would be logistics
       completion masquerading as production acceptance.

         OUTSTANDING   not collected yet
         SATISFIED     an in-spec housing went out; the line can be built
         UNFULFILLED   the van left empty, or carrying a housing that still
                       needs the customer's own finish pass                     */
    g.courier.dependency =
      doesDeliverySatisfyDependency(load) ? 'SATISFIED' : 'UNFULFILLED';
  } else {
    g.courier.dependency = 'UNFULFILLED';
  }
  g.courier.left = true;
  g.courier.departed_at = g.clock_min;

  /* The departure line has to read truthfully for BOTH kinds of collectable
     part. A `SEND` part is a finished housing; a `REWORK` part is a housing
     Halvorsen still has to finish the bore on. Round 10A (i) made the second
     one collectable, so the sentence can no longer assume the first. Note the
     dependency wording is now conditional too: a rework delivery does NOT
     restore the pump line, so the old line would have been a second lie. */
  const line = load
    ? `Collected ${load.id} — ${load.verdict} at Ø${load.position_in_band_um === null ? '?' :
        (g.job.band_low_mm + load.position_in_band_um / 1000).toFixed(4)} mm. ` +
      (collectedRework
        ? `${g.job.client} takes it and finishes the bore themselves — ` +
          `they have the housing, not a finished one, so the pump line is still down.`
        : `${g.job.client}'s pump line can be built.`)
    : `Left with nothing. ${g.job.client} gets no housing and the pump line stays down.`;
  log(g, 'courier', line);
  return { ok: true, left: true, at: g.courier.departed_at, loaded: load,
           /* THE PRE-COLLECTION DISPOSITION. `loaded.disposition` is `SHIPPED`
              by the time anyone can read it, so the page cannot recover which
              kind of part went out from `loaded`. This field is the fact the
              driver actually saw, and it is what the narration must branch on. */
           collected_disposition: collectedDisposition,
           dependency: g.courier.dependency,
           still_on_rack: rack.filter((p) => p.state === 'RACK').map((p) => p.id),
           line };
}

/** Minutes until the van goes. Negative once it has. */
export const untilCourier_min = (g) => departsMin(g.job) - g.clock_min;
export const courierArrived = (g) => g.courier.arrived;
export const courierLeft = (g) => g.courier.left;
export { arrivalMin, departsMin };

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
  /* The pass cap is a guard against an unbounded loop, not a work limit. It was
     40, which is fine for J1's 2 mm of radius and silently SHORT for a real
     roughing allowance: a Ø80 bore with 4 mm to come out at a cautious 0.1 mm
     bite needs 40 passes exactly, and one more would have been truncated with
     no refusal, no error and no metal missing — a roughing run that stops early
     and reports ok is the same class of lie as an export that under-reports
     itself. Raised, and now if it IS reached the caller is told. */
  const MAX_PASSES = 400;
  let truncated = false;
  for (let i = 0; i < MAX_PASSES; i++) {
    /* Drive on the COLD diameter, because that is the only number the player can
       hold in their head. `cutOnce` works out what that means for the dial once
       the machine's thermal offset is in it — which is the correct division of
       labour and also why roughing is forgiving and finishing is not. */
    const want_r = (target_dia_mm - g.part.holeDia_cold_mm) / 2;
    if (want_r <= 1e-5) break;
    const bite = Math.min(bite_mm, want_r);
    const r = cutOnce(g, { bite_mm: bite, feed_mm_rev, vc, label: 'Rough' });
    if (!r.ok) return { ok: false, why: r.why, detail: r.detail, passes,
                        /* Carry the LAST PASS through on a refusal. Without it
                           the caller cannot say how much metal came off before
                           the machine stopped objecting, which is exactly the
                           number the player needs in order to back off. */
                        last: passes.length ? passes[passes.length - 1] : null,
                        dia: g.part.holeDia_cold_mm };
    passes.push(r.rec);
    if (i === MAX_PASSES - 1) truncated = true;
  }
  return { ok: true, passes, dia: g.part.holeDia_cold_mm, truncated,
           minutes: passes.reduce((a, p) => a + p.cut_min, 0) };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE ENVELOPE — what this machine, this tool and this material will allow
   ══════════════════════════════════════════════════════════════════════════
   Round 2 is about making the machine push back, and a refusal the player
   cannot predict is not pushback, it is a slot machine. So the machine has to
   be able to say where its own wall is BEFORE the cut — the same way a real
   operator reads a load meter and knows 80 % is fine and 110 % is not.

   This is a MARGIN, not a verdict: it reports the fraction of each limit that
   a given command would use, using `assessBoring` — the same function the cut
   itself is refused by. It does not say "you may cut"; the cut still gets to
   refuse. That separation matters, because a preview that disagreed with the
   refusal would be a lie told in the opposite direction.

   Deliberately NOT a suggestion engine: it never proposes a bite. It answers
   "what would this do", which is the question a machinist asks a load meter. */
export function envelope(g, { bite_mm, feed_mm_rev = 0.12, vc = 120 }) {
  /* Guarded because this is reachable from the UI before a game exists — the
     panel asks for a load reading on its first frame, and a throw there would
     take the whole page down for a number nobody has asked for yet. A missing
     precondition is a REFUSAL here, same as everywhere else. */
  if (!g) return { ok: false, why: 'NO GAME' };
  if (!g.tool) return { ok: false, why: 'NO TOOL' };
  const spec = g.toolSpec;
  const tool = makeTool({ D: spec.D, z: spec.z, stickout_L: g.stickout_L });
  const as = assessBoring({ b: bite_mm, feed: feed_mm_rev, vc },
    { tool, material: g.mat }, g.mach);
  const f = (x) => (isFinite(x) ? x : 99);
  const power_frac = f(as.step.power_frac);
  const torque_frac = f(as.step.torque_frac);
  const rpm_frac = f(as.step.rpm_frac);
  const chatter_frac = f(as.chatter_load);
  /* The worst of the four IS the verdict, and naming which one is worst is the
     whole value: "you are at 107 % of spindle power" is actionable, "refused"
     is not. Same order as the kernel's own assessBoring, so this can never
     disagree with the refusal it is previewing. */
  const limits = [
    { key: 'CHATTER', label: 'chatter', frac: chatter_frac },
    { key: 'TORQUE LIMIT', label: 'spindle torque', frac: torque_frac },
    { key: 'SPINDLE POWER LIMIT', label: 'spindle power', frac: power_frac },
    { key: 'SPINDLE SPEED LIMIT', label: 'spindle speed', frac: rpm_frac },
  ];
  const worst = limits.reduce((a, b) => (b.frac > a.frac ? b : a));
  return {
    ok: true, power_frac, torque_frac, rpm_frac, chatter_frac,
    pkW: as.step.Pc_kW, F_mean_N: as.step.F_mean_N,
    sag_um: as.err.deflection_mean_um,
    mrr_mm3_min: as.step.MRR,
    cut_min: g.job.bore_depth_mm / Math.max(as.step.f, 0.001) + 0.4,
    binding: worst.key, binding_label: worst.label, binding_frac: worst.frac,
    would_cut: worst.frac <= 1,
    /* Per-pass time is what makes feed a real decision rather than a free win:
       leaning on the feed buys removal rate and costs the spindle, and the two
       are the same equation. Reporting minutes here is what lets the player
       see the trade instead of being told about it. */
    minutes: (g.job.bore_depth_mm / Math.max(as.step.f, 0.001) + 0.4),
  };
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
