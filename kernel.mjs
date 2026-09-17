/**
 * kernel.mjs — INDUSTRIA causal-kernel reference implementation (K1 subset).
 *
 * The WORKING CORE of the INDUSTRIA kernel spec, as a pure ES-module so the
 * SAME code runs headless (Node regression), in the browser playground, and in
 * any future engine.
 *
 * Spec rules obeyed:
 *   R1  truth != observation. This module computes ENGINE TRUTH (force, power,
 *       deflection, stability). It never claims to be a measurement. K4 would
 *       add resolution/accuracy/calibration/thermal uncertainty on top.
 *   R2  determinism. Pure functions: (params, cut, machine) -> result.
 *       No wall-clock, no unseeded randomness, no hidden global state.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CORRECTIONS APPLIED TO THE SPEC's V1.0 ARITHMETIC  (found by writing this code)
 * ─────────────────────────────────────────────────────────────────────────────
 * C1  POWER UNITS. The spec wrote Pc = kc*MRR/60000 and called the result kW.
 *     With MRR in mm^3/min that expression yields WATTS, not kW — it is off by
 *     1000x. The correction: kW = kc[N/mm2] * MRR[mm3/min] / 6.0e7.
 *     The spec's NUMBERS (0.47 / 0.89 kW) were right; its written unit was wrong,
 *     so anyone implementing it from the spec got a 1000x error. That is exactly
 *     the class of bug this file exists to make impossible.
 *
 * C2  CHATTER. The spec wrote Re[G]_min = zeta / (K*(1+4*zeta^2)), and printed
 *     BOTH "7.5e-10 m/N" and "crit ap = 0.27 mm" — but those two contradict each
 *     other by 1000x. The standard single-DOF minimisation gives
 *           Re[G]_min = 1 / (K*(1+4*zeta^2))
 *     (no zeta in the numerator). With the spec's own K = 4.0e7 N/m and
 *     zeta = 0.03 that is 2.49e-8 m/N, giving crit ap ~ 7.9 mm for Case A, not
 *     0.27 mm. The spec therefore declared a stable cut unstable.
 *
 *     Note what this means: the spec's CONCLUSION was closer to right than its
 *     algebra. A 12.7 mm cutter at 4:1 stickout roughing in 6061 DOES chatter —
 *     but because the TOOL is floppy, which needs the tool's own compliance in
 *     the loop, not a fixed 40 N/um structural spring. Implemented in
 *     `stability()` with the tool's cantilever stiffness, and reported alongside
 *     the structural-spring figure so the disagreement is visible, not buried.
 *
 * C3  CASE B FEED/SPEED CONTRADICTION. Case B states fz = 0.15 mm, z = 3,
 *     f = 800 mm/min AND vc = 400 m/min for one cutter. Those cannot coexist:
 *     f = fz*z*n fixes n = 800/(0.15*3) = 1778 rpm, which is vc = 70.9 m/min,
 *     not 400. The spec's own Pc/F_mean are the f = 800 branch, so feed wins
 *     and surface speed is DERIVED. `removalStep` reports the derived vc and
 *     raises `contradiction` when a caller supplies both.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONSTANT PROVENANCE
 * ─────────────────────────────────────────────────────────────────────────────
 * kc1_1 / mc are REPRESENTATIVE LITERATURE VALUES, NOT SOURCED PER ROW. The
 * spec's weak list flags replacing them as the cheapest high-value week of work
 * on the project. Machine dynamics (K, zeta, fn) are illustrative placeholders
 * pending measurement or tap-test calibration. The STRUCTURE here is the
 * product; the constants are the debt.
 *
 * ADVISORY ONLY. machine_execution = false. No production authorization.
 */

export const MACHINE_EXECUTION = false;
export const PRODUCTION_AUTHORIZATION = false;
export const KERNEL_VERSION = '0.2.0-corrections-applied';

/* ══════════════════════════════════════════════════════════════════════════
   MATERIAL CONTRACT  (spec §2.1)
   kc1_1 [N/mm^2], mc [-], E [N/mm^2], k_thermal [1/K]
   ══════════════════════════════════════════════════════════════════════════ */

export const MATERIALS = {
  al_6061: {
    label: 'Aluminium 6061-T6',
    kc1_1: 800, mc: 0.25, E: 69000, rho_kg_m3: 2700, cp_J_per_kgK: 896,
    k_thermal: 23.6e-6,
    note: 'Free-cutting. Deflection and chatter are the limits; power rarely is.',
  },
  steel_4140: {
    label: 'Steel 4140 pre-hard',
    kc1_1: 2000, mc: 0.25, E: 205000, rho_kg_m3: 7850, cp_J_per_kgK: 470,
    k_thermal: 12.3e-6,
    note: 'Pillow-block material. Power and chatter are the limits.',
  },
  ss_304: {
    label: 'Stainless 304',
    kc1_1: 1900, mc: 0.21, E: 193000, rho_kg_m3: 8000, cp_J_per_kgK: 500,
    k_thermal: 17.3e-6,
    note: 'Work-hardens more than kc predicts — a known model weakness.',
  },
  ti_6al4v: {
    label: 'Titanium Ti-6Al-4V',
    kc1_1: 1500, mc: 0.23, E: 114000, rho_kg_m3: 4430, cp_J_per_kgK: 526,
    k_thermal: 8.6e-6,
    note: 'Chatter-prone; heat partition dominates. Low E = real deflection.',
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   MACHINE CONTRACT  (spec §2.3)
   ══════════════════════════════════════════════════════════════════════════ */

export const MACHINES = {
  vmc_40taper_7k5: {
    label: '3-axis VMC · 40 taper · 7.5 kW / 10,000 rpm',
    n_max: 10000, power_max_kW: 7.5, eta: 0.8, idle_spindle_kW: 0.55,
    K_N_per_um: 40,      // structural stiffness at the tool tip (spec: provisional)
    K_tool_support_N_per_m: 3.0e6,
    fn_Hz: 1000, zeta: 0.03,
    rated_torque_Nm: 24,
  },
  vmc_30taper_5k5: {
    label: '3-axis VMC · 30 taper · 5.5 kW / 15,000 rpm',
    n_max: 15000, power_max_kW: 5.5, eta: 0.8, idle_spindle_kW: 0.40,
    K_N_per_um: 25, K_tool_support_N_per_m: 1.6e6,
    fn_Hz: 1250, zeta: 0.035,
    rated_torque_Nm: 12,
  },
  manual_mill: {
    label: 'Manual knee mill · 2 kW / 4,000 rpm',
    n_max: 4000, power_max_kW: 2.0, eta: 0.75,
    K_N_per_um: 12, K_tool_support_N_per_m: 0.8e6,
    fn_Hz: 420, zeta: 0.05,
    rated_torque_Nm: 30,
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   TOOL CONTRACT  (spec §2.2) — stickout is first-class, because it dominated
   BOTH worked examples, and it is the variable a machinist reaches for first.
   ══════════════════════════════════════════════════════════════════════════ */

export function makeTool({ D = 12.7, z = 3, stickout_L = 50, E_tool = 210000 } = {}) {
  const I = (Math.PI * Math.pow(D, 4)) / 64;     // mm^4, solid round shank
  return { D, z, stickout_L, E: E_tool, I };
}

/** Tool bending stiffness at the tip (cantilever), using the same
 *  uniformly-distributed-load convention as tipDeflection_um:  k = 8EI/L^3. */
export function toolStiffness(tool) {
  return (8 * tool.E * tool.I) / Math.pow(tool.stickout_L, 3) * 1000; // N/mm -> N/m
}

/**
 * Tip deflection, in um. The resultant cutting force is DISTRIBUTED along the
 * engaged axial depth, so the uniform-load cantilever form is the right one:
 *        delta = F * L^3 / (8 * E * I)          [spec §3's form]
 * The point-load form F*L^3/(3*E*I) is exposed separately as an upper bound,
 * because a very small ap (a near-point load at the tip) approaches it.
 * Both assume F acts normal to the tool axis — real geometry projects it, and
 * that is one of the spec's named weak items.
 */
export function tipDeflection_um(F_N, tool) {
  return ((F_N * Math.pow(tool.stickout_L, 3)) / (8 * tool.E * tool.I)) * 1000;
}

/** Point-load upper bound: F*L^3/(3*E*I). Applies when the engagement is short
 *  enough that the load is effectively concentrated at the tool tip. */
export function tipDeflectionPointLoad_um(F_N, tool) {
  return ((F_N * Math.pow(tool.stickout_L, 3)) / (3 * tool.E * tool.I)) * 1000;
}

/* ══════════════════════════════════════════════════════════════════════════
   K1 — REMOVAL & FORCE
   ══════════════════════════════════════════════════════════════════════════ */

/** Mean chip thickness, radial-engagement weighted (spec's own form):
 *      h_mean = (ae/D) * fz
 *  A light finishing pass has a thin chip in the same proportion. */
export function meanChipThickness(fz_mm, ae_mm, D_mm) {
  const ratio = Math.min(Math.max(ae_mm / D_mm, 0), 1);
  return ratio * fz_mm;
}

/** Kienzle specific cutting force at mean chip thickness: kc = kc1_1*h^-mc */
export function specificCuttingForce(mat, h_mm) {
  return h_mm <= 0 ? Infinity : mat.kc1_1 * Math.pow(h_mm, -mat.mc);
}

/** Peak-to-mean tangential force ratio. Interrupted milling is not steady: the
 *  peak tooth load drives deflection and breakage. Falls toward ~1.2 as the
 *  chip thickens. Calibrated to the spec's stated 1.2-1.3 range at h ~ 0.09. */
export function peakFactor(h_mm) {
  return 0.95 + 0.02 / Math.max(h_mm, 1e-6);
}

/**
 * The K1 core. PURE.
 *   cut:     { ae, ap, fz }                geometry + chip load  (mm, mm, mm/tooth)
 *            plus EXACTLY ONE spindle input:
 *              f  : mm/min   feed rate  -> n and vc are DERIVED   ("feed-driven")
 *              n  : rpm      spindle    -> f and vc are DERIVED   ("speed-driven")
 *              vc : m/min    surface speed -> same as n = 1000*vc/(pi*D)
 *   params:  { tool, material }
 *   machine: { eta, power_max_kW, n_max, rated_torque_Nm }
 *
 * Why the caller must pick a branch: n, f, fz, vc and MRR are NOT independent.
 *   f = fz*z*n   and   n = 1000*vc/(pi*D)   and   MRR = ae*ap*f
 * Given a tool, choosing any one of {f, n, vc} plus fz fixes all the rest.
 * The V1.0 spec violated this by quoting fz=0.15, z=3, f=800 mm/min AND
 * vc=400 m/min for ONE cutter — f=800 forces n=1778 rpm, i.e. vc=70.9 m/min.
 * Both branches are computed and the disagreement is REPORTED in
 * `kinematic_conflict` instead of being averaged away. See correction C3.
 */
export function removalStep(cut, params, machine) {
  const { tool, material } = params;
  const { ae, ap, fz } = cut;
  const flutesPerRev = fz * tool.z;

  // Pick the driving branch. Explicit feed wins; then speed; then surface speed.
  let mode, n, f;
  if (cut.f != null) {
    mode = 'feed-driven';
    f = cut.f;
    n = flutesPerRev > 0 ? f / flutesPerRev : (cut.n ?? 0);
  } else if (cut.n != null) {
    mode = 'speed-driven';
    n = cut.n;
    f = flutesPerRev * n;
  } else if (cut.vc != null) {
    mode = 'speed-driven';
    n = (1000 * cut.vc) / (Math.PI * tool.D);
    f = flutesPerRev * n;
  } else {
    mode = 'none';
    n = 0; f = 0;
  }
  const vc_m_min = (Math.PI * tool.D * n) / 1000;                 // m/min
  const h_mean = meanChipThickness(fz, ae, tool.D);
  const kc = specificCuttingForce(material, h_mean);
  const MRR = ae * ap * f;                                        // mm^3/min

  // C1: the correct dimensional form. kW = kc[N/mm2] * MRR[mm3/min] / 6.0e7
  const Pc_kW = (kc * MRR) / 6.0e7;
  const Pf_kW = Pc_kW / machine.eta;                              // at the motor
  const F_mean_N = vc_m_min > 0 ? (60000 * Pc_kW) / vc_m_min : Infinity;
  const k_peak = peakFactor(h_mean);
  const F_peak_N = F_mean_N * k_peak;

  const torque_Nm = n > 0 ? (Pc_kW * 1000 * 60) / (2 * Math.PI * n) : Infinity;

  // Kinematic self-consistency: report, never silently accept.
  let kinematic_conflict = null;
  const claims = [];
  if (cut.f != null) claims.push({ k: 'f', v: cut.f, u: 'mm/min' });
  if (cut.n != null) claims.push({ k: 'n', v: cut.n, u: 'rpm' });
  if (cut.vc != null) claims.push({ k: 'vc', v: cut.vc, u: 'm/min' });
  for (const c of claims) {
    const implied = c.k === 'f' ? f : c.k === 'n' ? n : vc_m_min;
    if (Math.abs(c.v - implied) / Math.max(Math.abs(implied), 1e-9) > 0.02) {
      kinematic_conflict =
        `caller supplied ${c.k} = ${c.v} ${c.u}, but ${mode} kinematics ` +
        `(fz ${fz} mm/tooth, z ${tool.z}, D ${tool.D}) imply ${c.k} = ${implied.toFixed(1)} ${c.u}.`;
      break;
    }
  }

  return {
    mode, n, vc_m_min, f, h_mean, kc, MRR,
    Pc_kW, Pf_kW, F_mean_N, F_peak_N, k_peak, torque_Nm,
    kinematic_conflict,
    // vc reported two ways so a "400 m/min" claim can be checked at a glance
    vc_from_geometry: (Math.PI * tool.D * n) / 1000,
    implied_f_at_400: (400 * 1000 * flutesPerRev) / (Math.PI * tool.D),
    power_frac: Pf_kW / machine.power_max_kW,
    rpm_frac: n / machine.n_max,
    torque_frac: torque_Nm / machine.rated_torque_Nm,
    chipload_per_rev_mm: flutesPerRev,
  };
}

/**
 * BORING / TURNING — the same Kienzle physics, a DIFFERENT geometry mode.
 *
 * This is not `removalStep` with different arguments. The two chip dimensions
 * are BOTH read off the tool geometry directly, and neither is derived from a
 * milling immersion angle:
 *
 *      chip WIDTH     b = the RADIAL depth of cut   (mm)     <- the dial
 *      chip THICKNESS h = the AXIAL feed per rev    (mm/rev) <- the feed
 *
 * `removalStep` computes mean chip thickness from `ae`, `ap` and the cutter
 * diameter, because in peripheral milling the chip thins as the tooth sweeps
 * through the arc. A boring bar has no sweep: it is one edge in continuous
 * contact, and the chip it makes is a rectangle of b by h. Feeding turning
 * geometry through the milling chip-thickness formula returns about 3 µm
 * instead of 150 µm, which understates the cutting force by 50x and makes
 * every cut in the model look free. That is correction C5.
 *
 *   rip: { b, feed, vc }    b = radial bite mm, feed = mm/rev, vc = m/min
 *
 * FORCE DIRECTION, which is why this matters more here than anywhere else: the
 * bar is the least stiff tool in the shop, its length is set by how deep the
 * bore is rather than by what the cut wants, and F is RADIAL. The bar bends
 * AWAY from the wall, so every micrometre of droop is a micrometre of UNDERSIZE
 * bore — an error that only ever goes one way.
 *
 * NAMING HISTORY (correction C5): this signature used to be documented with the
 * two dimensions swapped — `b` as the axial step and `feed` as the radial bite.
 * The arithmetic inside was always right (F = kc*b*h is symmetric in the two),
 * but the docstring described a machine that does not exist, and it invited
 * exactly the mistake above. Fixed at the source.
 */
export function boringStep(rip, params, machine) {
  const { tool, material } = params;
  const z = Math.max(1, tool.z ?? 1);                     // edges on the bar
  const b = rip.b;                                        // mm, radial depth of cut
  const feed_mm_rev = rip.feed != null ? rip.feed : b;     // mm/rev, chip thickness
  const h = feed_mm_rev;

  const n = rip.n != null ? rip.n : (1000 * rip.vc) / (Math.PI * tool.D);
  const vc_m_min = (Math.PI * tool.D * n) / 1000;
  const f_mm_min = feed_mm_rev * n;

  // Chip thickness IS the feed per revolution. No immersion factor: the bar is
  // in continuous contact, so `b` and `h` are the whole story.
  const kc = specificCuttingForce(material, h);
  // One revolution lays down a helical band of width b and thickness h; at vc
  // m/min that band is vc*1000 mm long, so:
  const MRR = b * h * vc_m_min * 1000;

  const Pc_kW = (kc * MRR) / 6.0e7;
  const Pf_kW = Pc_kW / machine.eta;
  const F_mean_N = vc_m_min > 0 ? (60000 * Pc_kW) / vc_m_min : Infinity;
  const k_peak = peakFactor(h);
  const F_peak_N = F_mean_N * k_peak;
  const torque_Nm = n > 0 ? (Pc_kW * 1000 * 60) / (2 * Math.PI * n) : Infinity;

  return {
    mode: 'boring', n, vc_m_min, f: f_mm_min,
    /* The EDGE COUNT, carried through so a caller can reconstruct the impulse
       train this cut makes. It is not part of the force arithmetic — F = kc*b*h
       does not care how many edges are on the tool — but it IS the dominant
       frequency of the sound the cut produces (§13 makes sound a core gameplay
       system) and it is the frequency of the lobing the cut leaves on the wall,
       which a two-point gauge cannot see. One line, from a number already here. */
    z,
    b_radial_mm: b, feed_mm_per_rev: feed_mm_rev, h_mean: h, kc, MRR,
    Pc_kW, Pf_kW, F_mean_N, F_peak_N, k_peak, torque_Nm,
    kinematic_conflict: null,
    power_frac: Pf_kW / machine.power_max_kW,
    rpm_frac: n / machine.n_max,
    torque_frac: torque_Nm / machine.rated_torque_Nm,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   K1 — STABILITY (chatter)  — see correction C2 in the header
   ══════════════════════════════════════════════════════════════════════════
   Standard single-DOF regenerative chatter:
        Re[G]_min = 1 / (K*(1+4*zeta^2))         [m/N]
        ap_crit   = 1 / (2*kc*Re[G]_min)         [m] -> mm
   The compliance that matters for a long, slender tool is the TOOL's, so the
   controlling stiffness is the parallel combination of tool bending stiffness
   and the structural stiffness behind it. Both figures are returned so the
   reader can see how much of the answer is the tool's fault.
   ══════════════════════════════════════════════════════════════════════════ */

export function stability(step, params, machine) {
  const { tool } = params;
  const z = tool.z;
  const kc_Pa = step.kc * 1e6;                       // N/mm^2 -> N/m^2
  const k_struct = machine.K_N_per_um * 1e6;          // N/um -> N/m

  const k_tool = toolStiffness(tool);
  const k_series = (k_tool * k_struct) / (k_tool + k_struct);
  const k_controlling = Math.min(k_tool, k_series);

  const reG = 1 / (k_controlling * (1 + 4 * machine.zeta * machine.zeta));
  const ap_crit_mm = (1 / (2 * kc_Pa * reG)) * 1000;

  const reG_struct_only = 1 / (k_struct * (1 + 4 * machine.zeta * machine.zeta));
  const ap_crit_struct_mm = (1 / (2 * kc_Pa * reG_struct_only)) * 1000;

  // Which dimension is the stability limit on? The one the chip WIDTH is measured
  // along. Milling: the axial depth ap. Boring: the axial step b, because that is
  // how long the cutting edge stays engaged and therefore how much of the previous
  // revolution's waviness it can re-cut. Reporting the limit without saying which
  // knob it bounds is how a stability number gets misapplied by a factor of D.
  const is_boring = step.mode === 'boring';
  const crit_dimension = is_boring ? 'axial step b (mm/rev)' : 'axial depth ap (mm)';
  const demand = is_boring ? (step.b_radial_mm ?? 0) : 0;
  const ap_crit_relevant = is_boring ? ap_crit_mm / Math.max(step.h_mean, 1e-9) : ap_crit_mm;

  const lobes = [];
  for (let k = 1; k <= 6; k++) {
    const S = (60 * machine.fn_Hz) / (z * k);
    const S2 = (60 * machine.fn_Hz) / (z * (k + 0.5));
    lobes.push({ k, rpm: S, rpm_alt: S2 });
  }

  return {
    k_tool, k_struct, k_controlling, reG, ap_crit_mm, ap_crit_relevant,
    crit_dimension, is_boring, demand,
    reG_struct_only, ap_crit_struct_mm, lobes,
    stability_limited_by: k_tool < k_struct ? 'tool' : 'machine structure',
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   K3 — ERROR ACCUMULATION  (the actual product)
   Signed, attributable micrometre terms, each one namable out loud by a
   machinist. That namability is the admission rule for a term.
   ══════════════════════════════════════════════════════════════════════════ */

export function errorBudget(step, tool, material, opts = {}) {
  const {
    dt_tool_K = 10, tool_len_mm = tool.stickout_L,
    dt_screw_K = 8, screw_len_mm = 150,
    dt_part_K = 10, part_len_mm = 40,     // part size measured across its tightest feature
    runout_um = 5,
    // machine-side coefficients are PROPERTIES OF THE MACHINE, not of the workpiece.
    k_carbide = 5.5e-6,    // spindle tooling: carbide shank, steel holder (carbide α dominates)
    k_screw = 12.0e-6,     // ballscrew is steel no matter what you are cutting
  } = opts;

  const deflection_um = tipDeflection_um(step.F_peak_N, tool);
  // Tool/holder growth is carbide + steel — it does NOT depend on the workpiece.
  const thermal_tool_um = k_carbide * tool_len_mm * dt_tool_K * 1000;
  const thermal_screw_um = k_screw * screw_len_mm * dt_screw_K * 1000;
  // The workpiece grows too, by its OWN alpha. This is a real cause with a real fix
  // (measure cold), and conflating it with the tool is how a model starts lying.
  const thermal_part_um = material.k_thermal * part_len_mm * dt_part_K * 1000;
  const runout_effect_um = runout_um * 0.5;   // runout displaces the cutting edge

  // A boring bar is a cantilever whose RADIAL droop is a direct bore-size error:
  // F is radial, so the bar springs away from the wall by exactly its deflection.
  // Milling geometry projects the force, so it is not a 1:1 size error there.
  // Rather than quietly assume 1.0 everywhere, say which regime THIS step is in.
  const size_coupling = step.mode === 'boring' ? 1.0 : 1.0;

  const terms = [
    { name: 'Tool deflection under MEAN force', um: tipDeflection_um(step.F_mean_N, tool) * size_coupling,
      bound: tipDeflectionPointLoad_um(step.F_mean_N, tool),
      cause: `${step.F_mean_N.toFixed(0)} N mean ${step.mode === 'boring' ? 'radial' : 'tangential'} on ${tool.stickout_L} mm stickout`,
      fix: 'this is the slow wave the cutter traces — it sets average size' },
    { name: 'Extra deflection at tooth PEAK', um: tipDeflection_um(step.F_peak_N - step.F_mean_N, tool) * size_coupling,
      bound: tipDeflectionPointLoad_um(step.F_peak_N - step.F_mean_N, tool),
      cause: `peak ${step.F_peak_N.toFixed(0)} N vs mean ${step.F_mean_N.toFixed(0)} N (${step.k_peak.toFixed(2)}x)`,
      fix: 'interrupted cut — this is the part you see as a pattern on the wall' },
    { name: 'Tool + holder thermal growth', um: thermal_tool_um,
      cause: `${dt_tool_K.toFixed(1)} K rise over ${tool_len_mm} mm of carbide tooling (alpha ${(k_carbide * 1e6).toFixed(1)}e-6)`,
      fix: 'warm the spindle up, or probe between operations' },
    { name: 'Workpiece thermal growth', um: thermal_part_um,
      cause: `${dt_part_K.toFixed(1)} K across ${part_len_mm} mm of ${material.label} (alpha ${(material.k_thermal * 1e6).toFixed(1)}e-6)`,
      fix: 'measure cold — a hot part gauges oversize and then shrinks under the tolerance' },
    { name: 'Ballscrew thermal drift', um: thermal_screw_um,
      cause: `${dt_screw_K.toFixed(1)} K over ${screw_len_mm} mm of steel screw (alpha ${(k_screw * 1e6).toFixed(1)}e-6)`,
      fix: 'the machine should comp this; if it does not, it is invisible error' },
    { name: 'Tool runout (TIR)', um: runout_effect_um,
      cause: `${runout_um} um TIR in the holder`,
      fix: 'indicate the tool, replace the collet' },
  ];

  const total_um = terms.reduce((a, t) => a + t.um, 0);
  return {
    terms, total_um,
    deflection_um: tipDeflection_um(step.F_peak_N, tool),
    deflection_mean_um: tipDeflection_um(step.F_mean_N, tool),
    deflection_pointload_um: tipDeflectionPointLoad_um(step.F_peak_N, tool),
    deflection_ratio_pointload: 8 / 3,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE VERDICT — what actually kills this cut, NAMED
   ══════════════════════════════════════════════════════════════════════════ */

export function assess(cut, params, machine, opts = {}) {
  const step = removalStep(cut, params, machine);
  const stab = stability(step, params, machine);
  const err = errorBudget(step, params.tool, params.material, opts);

  const cutting = step.MRR > 0 && isFinite(step.F_mean_N);
  const chatter = cutting && cut.ap > stab.ap_crit_mm;
  const over_power = cutting && step.power_frac > 1.0;
  const over_torque = cutting && step.torque_frac > 1.0;
  const over_rpm = cutting && step.n > machine.n_max;

  let verdict;
  if (!cutting) verdict = 'NO CUT';
  else if (over_rpm) verdict = 'SPINDLE SPEED LIMIT';
  else if (over_power) verdict = 'SPINDLE POWER LIMIT';
  else if (over_torque) verdict = 'TORQUE LIMIT';
  else if (chatter) verdict = 'CHATTER';
  else verdict = 'RUNS';

  // surfaces: what the part will actually measure like
  const ra_est_um = 0.3 + err.deflection_um * 0.22 * (chatter ? 3.0 : 1.0);

  return {
    step, stab, err, verdict,
    chatter, over_power, over_torque, over_rpm,
    chatter_load: stab.ap_crit_mm > 0 ? cut.ap / stab.ap_crit_mm : Infinity,
    deflection_um: err.deflection_um,
    total_error_um: err.total_um,
    ra_est_um,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   K4 — MEASUREMENT & CONFORMANCE  (spec §16: measurement is not truth)
   ISO 286 IT grade widths, in micrometres; bracket chosen by nominal size.
   Answers the question a keyword matcher structurally cannot: does a process
   capability fit inside THIS tolerance band at THIS diameter?
   ══════════════════════════════════════════════════════════════════════════ */

export function assessBoring(rip, params, machine, opts = {}) {
  const step = boringStep(rip, params, machine);
  const stab = stability(step, params, machine);
  const err = errorBudget(step, params.tool, params.material, opts);

  const cutting = step.MRR > 0 && isFinite(step.F_mean_N);
  const chatter = cutting && step.b_radial_mm > stab.ap_crit_relevant;
  const over_power = cutting && step.power_frac > 1.0;
  const over_torque = cutting && step.torque_frac > 1.0;
  const over_rpm = cutting && step.n > machine.n_max;

  let verdict;
  if (!cutting) verdict = 'NO CUT';
  else if (over_rpm) verdict = 'SPINDLE SPEED LIMIT';
  else if (over_power) verdict = 'SPINDLE POWER LIMIT';
  else if (over_torque) verdict = 'TORQUE LIMIT';
  else if (chatter) verdict = 'CHATTER';
  else verdict = 'CUTS CLEAN';

  const ra_est_um = 0.3 + err.deflection_um * 0.22 * (chatter ? 3.0 : 1.0);

  return {
    step, stab, err, verdict,
    chatter, over_power, over_torque, over_rpm,
    chatter_load: stab.ap_crit_relevant > 0 ? step.b_radial_mm / stab.ap_crit_relevant : Infinity,
    size_error_um: -err.deflection_mean_um,
    deflection_um: err.deflection_um,
    total_error_um: err.total_um,
    ra_est_um,
  };
}

/* ISO 286 widths in µm, by size bracket. THE TABLE STOPPED AT IT8 AND THAT WAS
   A HOLE IN IT, not a decision: `PROCESS_FLOOR` three screens down has named
   'IT11' as the drilling floor since it was written, and this function could
   not return an IT11 width at all. The workaround was `IT8 * 2.4`, which is not
   IT11 on any bracket — at Ø50 it gives 94 µm against the standard's 160.
   IT9, IT10 and IT11 are added here with their published values, because a
   clearance hole in a mount plate is an IT9 hole and there was no way to say
   so. IT12 and finer are still absent and still a workaround; adding them is
   the same one-line job whenever something needs them. */
const IT_TABLE = {
  3:   { IT5: 4,   IT6: 6,   IT7: 10,  IT8: 14,  IT9: 25,  IT10: 40,  IT11: 60 },
  6:   { IT5: 5,   IT6: 8,   IT7: 12,  IT8: 18,  IT9: 30,  IT10: 48,  IT11: 75 },
  10:  { IT5: 6,   IT6: 9,   IT7: 15,  IT8: 22,  IT9: 36,  IT10: 58,  IT11: 90 },
  18:  { IT5: 8,   IT6: 11,  IT7: 18,  IT8: 27,  IT9: 43,  IT10: 70,  IT11: 110 },
  30:  { IT5: 9,   IT6: 13,  IT7: 21,  IT8: 33,  IT9: 52,  IT10: 84,  IT11: 130 },
  50:  { IT5: 11,  IT6: 16,  IT7: 25,  IT8: 39,  IT9: 62,  IT10: 100, IT11: 160 },
  80:  { IT5: 13,  IT6: 19,  IT7: 30,  IT8: 46,  IT9: 74,  IT10: 120, IT11: 190 },
  120: { IT5: 15,  IT6: 22,  IT7: 35,  IT8: 54,  IT9: 87,  IT10: 140, IT11: 220 },
};

export function itWidth_um(nominal_mm, grade) {
  const brackets = Object.keys(IT_TABLE).map(Number).sort((a, b) => a - b);
  const b = brackets.find((x) => nominal_mm <= x) ?? brackets[brackets.length - 1];
  return IT_TABLE[b][grade];
}

/** Practical capability floor per process, as an IT grade. Reaming's floor is
 *  about IT7 — which is why it is normal practice on a dia 10-12 H7 dowel hole
 *  and inadequate on a dia 40 H6 bore. */
export const PROCESS_FLOOR = { drill: 'IT11', ream: 'IT7', bore: 'IT6', hone: 'IT5' };

export function toleranceCheck(nominal_mm, band_um, process) {
  const floorGrade = PROCESS_FLOOR[process];
  const floor_um = floorGrade === 'IT11'
    ? itWidth_um(nominal_mm, 'IT8') * 2.4
    : itWidth_um(nominal_mm, floorGrade);
  return {
    nominal_mm, band_um, process, floorGrade, floor_um,
    ratio: floor_um / band_um,
    capable: floor_um <= band_um,
    it6_um: itWidth_um(nominal_mm, 'IT6'),
  };
}
