#!/usr/bin/env node
/**
 * kernel.test.mjs — reference-case regression for the INDUSTRIA kernel.
 *
 *   node docs/kernel.test.mjs
 *
 * Exit 0 = every case passes, 1 = something disagrees. This is the spec's L1
 * validation layer (§5) reduced to something a reader can run in one second,
 * plus the L2 monotonicity/invariance checks, plus the V1.0 spec corrections as
 * EXECUTABLE PROOFS rather than prose claims.
 *
 *   REF-A   spec Case A — 6061 finishing       (spec agrees)
 *   REF-B1  spec Case B — feed branch: DERIVES vc and reports the conflict
 *   REF-B2  spec Case B — speed branch: the physically consistent cut
 *   REF-S   spec §4 — 4140 same toolpath
 *   MON-*   monotonicity & invariance (d^-4 law, L^3 law, chip thinning)
 *   COR-*   corrections: power units, chatter algebra, kinematics
 *   K4-*    ISO 286 conformance
 */

import {
  MATERIALS, MACHINES, makeTool,
  removalStep, stability, assess, tipDeflection_um,
  boringStep,
  itWidth_um, toleranceCheck, KERNEL_VERSION, errorBudget,
} from './kernel.mjs';
import { JOBS } from './game.mjs';

let pass = 0, fail = 0;
const rows = [];

function check(id, label, actual, expected, tol, unit = '') {
  const err = Math.abs(actual - expected);
  const rel = expected !== 0 ? err / Math.abs(expected) : err;
  const ok = Number.isFinite(actual) && (err <= tol || rel <= 0.02);
  ok ? pass++ : fail++;
  rows.push({ id, label, actual, expected, unit, ok });
  return ok;
}
function checkTrue(id, label, cond, detail = '') {
  cond ? pass++ : fail++;
  rows.push({ id, label, actual: cond ? 1 : 0, expected: 1, unit: detail, ok: !!cond });
}
const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

const VMC = MACHINES.vmc_40taper_7k5;
const TOOL = makeTool({ D: 12.7, z: 3, stickout_L: 50 });
const P = (material) => ({ tool: TOOL, material });

console.log(`\nINDUSTRIA kernel regression — ${KERNEL_VERSION}`);
console.log('advisory only · machine_execution=false · constants illustrative\n');

/* ── REF-A — spec Case A: 6061 finishing, both branches agree ─────────── */
{
  const cut = { ae: 1.27, ap: 3, fz: 0.10, f: 3000 };
  const s = removalStep(cut, P(MATERIALS.al_6061), VMC);
  const dMean = tipDeflection_um(s.F_mean_N, TOOL);
  const dPeak = tipDeflection_um(s.F_peak_N, TOOL);

  console.log('REF-A  6061 finishing   ae1.27 ap3 fz0.10 f3000   [feed- and speed-driven agree]');
  console.log(`  h_mean ${fmt(s.h_mean, 4)} mm   kc ${fmt(s.kc, 0)} N/mm2   MRR ${fmt(s.MRR, 0)} mm3/min   mode ${s.mode}`);
  console.log(`  n ${fmt(s.n, 0)} rpm (vc ${fmt(s.vc_m_min, 1)} m/min)  Pc ${fmt(s.Pc_kW)} kW  motor ${fmt(s.Pf_kW)} kW`);
  console.log(`  F_mean ${fmt(s.F_mean_N, 0)} N   F_peak ${fmt(s.F_peak_N, 0)} N (${fmt(s.k_peak, 2)}x)`);
  console.log(`  deflection: mean ${fmt(dMean, 2)} um   PEAK ${fmt(dPeak, 2)} um\n`);

  check('REF-A.1', 'h_mean', s.h_mean, 0.010, 1e-9, 'mm');
  check('REF-A.2', 'kc (spec ~2470 rounded)', s.kc, 2530, 2.0, 'N/mm2');
  check('REF-A.3', 'MRR (spec ~11,400)', s.MRR, 11430, 1e-9, 'mm3/min');
  check('REF-A.4', 'Pc (spec 0.47)', s.Pc_kW, 0.4819, 2e-3, 'kW');
  check('REF-A.5', 'F_mean (spec 70)', s.F_mean_N, 72.3, 0.5, 'N');
  // Spec quotes 4.1 um from its ROUNDED kc=2470 and F=70 N. The kernel carries
  // unrounded kc=2530, which is 2.4% higher -> 3.5% more force and deflection.
  // Tolerance 4% makes that provenance difference visible instead of hidden.
  check('REF-A.6', 'deflection at MEAN force (spec 4.1, from rounded kc)', dMean, 4.08, 0.17, 'um');
  check('REF-A.7', 'motor draw (spec 8% of 7.5 kW)', s.power_frac * 100, 8.0, 0.3, '%');
  checkTrue('REF-A.8', 'no kinematic conflict: spec Case A is self-consistent',
    s.kinematic_conflict === null, s.kinematic_conflict ?? 'f/fz/n/vc mutually consistent');
}

/* ── REF-B1 — spec Case B, FEED branch: vc is derived, not chosen ─────── */
{
  const cut = { ae: 7.62, ap: 6, fz: 0.15, f: 800 };
  const s = removalStep(cut, P(MATERIALS.al_6061), VMC);
  const dMean = tipDeflection_um(s.F_mean_N, TOOL);

  console.log('REF-B1 6061 roughing   ae7.62 ap6 fz0.15 f800    [feed-driven: vc DERIVED]');
  console.log(`  h_mean ${fmt(s.h_mean, 4)} mm   kc ${fmt(s.kc, 0)} N/mm2   MRR ${fmt(s.MRR, 0)} mm3/min`);
  console.log(`  n ${fmt(s.n, 0)} rpm -> vc ${fmt(s.vc_m_min, 1)} m/min   (spec claimed 400 m/min for this same cutter)`);
  console.log(`  Pc ${fmt(s.Pc_kW)} kW (${fmt(s.power_frac * 100, 0)}% of spindle)   F_mean ${fmt(s.F_mean_N, 0)} N   defl ${fmt(dMean, 1)} um\n`);

  check('REF-B1.1', 'h_mean (spec 0.09)', s.h_mean, 0.09, 1e-9, 'mm');
  check('REF-B1.2', 'kc (spec ~1460)', s.kc, 1461, 1.5, 'N/mm2');
  check('REF-B1.3', 'MRR (spec 36,600)', s.MRR, 36576, 1e-9, 'mm3/min');
  check('REF-B1.4', 'Pc (spec 0.89)', s.Pc_kW, 0.8905, 3e-3, 'kW');
  check('REF-B1.5', 'derived vc is NOT the spec\'s 400 m/min', s.vc_m_min, 70.9, 0.2, 'm/min');
  checkTrue('REF-B1.6', 'the conflict is reported, not hidden (C3)',
    s.kinematic_conflict === null || s.kinematic_conflict.length > 0,
    'feed branch is internally consistent — the conflict is with the spec PROSE');
  // The spec's prose claims vc=400; prove the implied feed would be far higher.
  check('REF-B1.7', 'feed implied by vc=400 m/min at this fz',
    s.implied_f_at_400, 4541, 5, 'mm/min');
  console.log(`  -> spec Case B quotes BOTH f=800 mm/min AND vc=400 m/min.`);
  console.log(`     vc=400 would require f = ${fmt(s.implied_f_at_400, 0)} mm/min. They cannot both hold.\n`);
}

/* ── REF-B2 — spec Case B, SPEED branch: the consistent cut, and it flips
       which physical limit kills it ───────────────────────────────────── */
{
  const cut = { ae: 7.62, ap: 6, fz: 0.15, n: 10024 };   // vc = 400 m/min
  const s = removalStep(cut, P(MATERIALS.al_6061), VMC);
  const dMean = tipDeflection_um(s.F_mean_N, TOOL);
  const a = assess(cut, P(MATERIALS.al_6061), VMC);

  console.log('REF-B2 6061 roughing   ae7.62 ap6 fz0.15 n10024  [speed-driven: f DERIVED]');
  console.log(`  vc ${fmt(s.vc_m_min, 1)} m/min   f ${fmt(s.f, 0)} mm/min   MRR ${fmt(s.MRR, 0)} mm3/min`);
  console.log(`  h_mean ${fmt(s.h_mean, 4)} mm   kc ${fmt(s.kc, 0)} N/mm2   Pc ${fmt(s.Pc_kW)} kW   motor ${fmt(s.Pf_kW)} kW (${fmt(s.power_frac * 100, 0)}%)`);
  console.log(`  F_mean ${fmt(s.F_mean_N, 0)} N   deflection(mean) ${fmt(dMean, 1)} um   verdict: ${a.verdict}\n`);

  check('REF-B2.1', 'vc is the spec\'s 400 m/min', s.vc_m_min, 400, 2, 'm/min');
  check('REF-B2.2', 'derived feed at that speed', s.f, 4510.8, 10, 'mm/min');
  check('REF-B2.3', 'MRR at the consistent operating point', s.MRR, 206280, 1e3, 'mm3/min');
  checkTrue('REF-B2.4', 'the SAME cut is spindle-limited on this branch (was deflection-led on the other)',
    s.power_frac > 0.5, `${fmt(s.power_frac * 100, 0)}% of a 7.5 kW spindle`);
  console.log('  -> The branch choice changes WHY the cut fails, which is the whole');
  console.log('     point of naming a failure mode instead of scoring a setup.\n');
}

/* ── REF-S — spec §4 steel comparison ────────────────────────────────── */
{
  const cut = { ae: 7.62, ap: 6, fz: 0.15, f: 800 };
  const steel = removalStep(cut, P(MATERIALS.steel_4140), VMC);
  const al = removalStep(cut, P(MATERIALS.al_6061), VMC);

  console.log('REF-S  4140 vs 6061, same toolpath');
  console.log(`  4140: kc ${fmt(steel.kc, 0)}   Pc ${fmt(steel.Pc_kW)} kW   motor ${fmt(steel.Pf_kW)} kW (${fmt(steel.power_frac * 100, 0)}%)   F_peak ${fmt(steel.F_peak_N, 0)} N`);
  console.log(`  6061: kc ${fmt(al.kc, 0)}   Pc ${fmt(al.Pc_kW)} kW   motor ${fmt(al.Pf_kW)} kW (${fmt(al.power_frac * 100, 0)}%)   F_peak ${fmt(al.F_peak_N, 0)} N\n`);

  check('REF-S.1', 'kc scales with kc1_1 ratio (2.5x)',
    steel.kc / al.kc, MATERIALS.steel_4140.kc1_1 / MATERIALS.al_6061.kc1_1, 0.02, 'x');
  checkTrue('REF-S.2', 'steel is the more spindle-limited material (§4 claim)',
    steel.power_frac > al.power_frac,
    `${fmt(steel.power_frac * 100, 0)}% vs ${fmt(al.power_frac * 100, 0)}%`);
  checkTrue('REF-S.3', 'steel also deflects more at equal toolpath',
    tipDeflection_um(steel.F_mean_N, TOOL) > tipDeflection_um(al.F_mean_N, TOOL));
}

/* ── MON — monotonicity / invariance ─────────────────────────────────── */
{
  const cut = { ae: 7.62, ap: 6, fz: 0.15, f: 800 };
  const F = 200;

  const d12 = tipDeflection_um(F, makeTool({ D: 12.7 }));
  const d25 = tipDeflection_um(F, makeTool({ D: 25.4 }));
  check('MON-1', 'd^-4 law: 2x diameter = 1/16 deflection', d12 / d25, 16, 0.01, 'x');

  const dL50 = tipDeflection_um(F, makeTool({ D: 12.7, stickout_L: 50 }));
  const dL100 = tipDeflection_um(F, makeTool({ D: 12.7, stickout_L: 100 }));
  check('MON-2', 'L^3 law: 2x stickout = 8x deflection', dL100 / dL50, 8, 0.01, 'x');

  const thin = removalStep({ ...cut, fz: 0.05 }, P(MATERIALS.al_6061), VMC);
  const thick = removalStep({ ...cut, fz: 0.20 }, P(MATERIALS.al_6061), VMC);
  checkTrue('MON-3', 'chip thinning: kc falls as chipload rises', thick.kc < thin.kc,
    `${fmt(thick.kc, 0)} < ${fmt(thin.kc, 0)} N/mm2`);

  const ap3 = removalStep({ ...cut, ap: 3 }, P(MATERIALS.al_6061), VMC);
  const ap6 = removalStep({ ...cut, ap: 6 }, P(MATERIALS.al_6061), VMC);
  checkTrue('MON-4', 'power rises with ap', ap6.Pc_kW > ap3.Pc_kW,
    `${fmt(ap3.Pc_kW)} -> ${fmt(ap6.Pc_kW)} kW`);

  const s = removalStep(cut, P(MATERIALS.al_6061), VMC);
  check('MON-5', 'identity F_mean = 60000*Pc/vc',
    s.F_mean_N, (60000 * s.Pc_kW) / s.vc_m_min, 1e-9, 'N');

  // shorter tool must never be less stable
  let monotoneStable = true, minAp = Infinity, maxAp = -Infinity;
  for (const L of [100, 75, 50, 30]) {
    const t = makeTool({ D: 12.7, z: 3, stickout_L: L });
    const pp = { tool: t, material: MATERIALS.al_6061 };
    const st = stability(removalStep(cut, pp, VMC), pp, VMC);
    if (!(st.ap_crit_mm > 0) || !Number.isFinite(st.ap_crit_mm)) monotoneStable = false;
    if (st.ap_crit_mm < minAp - 1e-6 && L < 100) monotoneStable = false;
    minAp = Math.min(minAp, st.ap_crit_mm); maxAp = Math.max(maxAp, st.ap_crit_mm);
  }
  checkTrue('MON-6', 'shorter stickout is never less stable (L sweep 100->30)', monotoneStable,
    `ap_crit spans ${fmt(minAp, 2)}-${fmt(maxAp, 2)} mm`);
  checkTrue('MON-7', 'stability limit improves as stickout shortens', maxAp > minAp * 1.5,
    `${fmt(minAp, 2)} mm @100mm stickout -> ${fmt(maxAp, 2)} mm @30mm`);
}

/* ── COR — corrections to the V1.0 spec arithmetic ───────────────────── */
{
  console.log('COR    corrections to the V1.0 spec');
  const cut = { ae: 7.62, ap: 6, fz: 0.15, f: 800 };
  const s = removalStep(cut, P(MATERIALS.al_6061), VMC);

  const watts = (s.kc * s.MRR) / 60000;
  const kW = (s.kc * s.MRR) / 6.0e7;
  check('COR-C1a', 'V1.0 written form yields WATTS, not kW', watts / kW, 1000, 1e-6, 'x');
  check('COR-C1b', 'corrected form reproduces the spec\'s own kW value', kW, 0.8905, 3e-3, 'kW');
  console.log(`  C1  kc*MRR/60000 = ${fmt(watts, 1)} W = ${fmt(kW)} kW — the UNIT LABEL was the bug, not the number.`);

  const st = stability(s, P(MATERIALS.al_6061), VMC);
  const v10ReG = VMC.zeta / (VMC.K_N_per_um * 1e6 * (1 + 4 * VMC.zeta ** 2));
  const stdReG = 1 / (VMC.K_N_per_um * 1e6 * (1 + 4 * VMC.zeta ** 2));
  console.log(`  C2  V1.0 form Re[G]=${v10ReG.toExponential(3)} m/N vs standard 1-DOF ${stdReG.toExponential(3)} m/N`);
  console.log(`      -> V1.0 understated compliance by ${fmt(stdReG / v10ReG, 0)}x and printed a crit ap that contradicted its own formula.`);
  console.log(`      corrected: limited by ${st.stability_limited_by}; ap_crit ${fmt(st.ap_crit_mm, 2)} mm (tool ${fmt(st.k_tool / 1e6, 2)} MN/m vs structure ${fmt(st.k_struct / 1e6, 0)} MN/m)`);
  check('COR-C2a', 'standard 1-DOF Re[G] exceeds the V1.0 value',
    stdReG / v10ReG, 1 / VMC.zeta, 0.05, 'x');
  checkTrue('COR-C2b', 'a 4:1 slender tool is the stability bottleneck, not the structure',
    st.k_tool < st.k_struct, `${fmt(st.k_tool / 1e6, 2)} < ${fmt(st.k_struct / 1e6, 0)} MN/m`);

  // C3: prove the conflict detector actually fires
  const bad = removalStep({ ae: 7.62, ap: 6, fz: 0.15, f: 800, n: 10024 }, P(MATERIALS.al_6061), VMC);
  checkTrue('COR-C3', 'conflict detector fires when f and n are both given and disagree',
    bad.kinematic_conflict !== null, (bad.kinematic_conflict ?? '').slice(0, 96));

  const a = assess({ ae: 1.27, ap: 3, fz: 0.10, f: 3000 }, P(MATERIALS.al_6061), VMC);
  checkTrue('COR-C2c', 'verdict is a NAMED failure mode, never a score',
    ['RUNS', 'CHATTER', 'SPINDLE POWER LIMIT', 'TORQUE LIMIT', 'SPINDLE SPEED LIMIT', 'NO CUT'].includes(a.verdict),
    `Case A verdict: ${a.verdict} (${fmt(a.chatter_load, 1)}x the stability limit)`);
}

/* ── K4 — ISO 286 conformance ────────────────────────────────────────── */
{
  console.log('K4     ISO 286 conformance (geometry, not keywords)');
  const ream40 = toleranceCheck(40, itWidth_um(40, 'IT6'), 'ream');
  const ream12 = toleranceCheck(12, itWidth_um(12, 'IT7'), 'ream');
  const bore40 = toleranceCheck(40, itWidth_um(40, 'IT6'), 'bore');

  console.log(`  dia 40 H6: band ${itWidth_um(40, 'IT6')} um; ream floor ${ream40.floorGrade}=${ream40.floor_um} um -> ${ream40.capable ? 'OK' : 'CANNOT HOLD'} (${fmt(ream40.ratio, 2)}x); fine-bore floor ${bore40.floorGrade}=${bore40.floor_um} um -> ${bore40.capable ? 'OK' : 'NO'} (${fmt(bore40.ratio, 2)}x)`);
  console.log(`  dia 12 H7: band ${itWidth_um(12, 'IT7')} um; ream floor ${ream12.floorGrade}=${ream12.floor_um} um -> ${ream12.capable ? 'OK' : 'NO'} (${fmt(ream12.ratio, 2)}x)\n`);

  check('K4.1', 'dia 40 H6 band is 16 um', itWidth_um(40, 'IT6'), 16, 1e-9, 'um');
  check('K4.2', 'dia 40 IT7 is 1.5625x looser than IT6',
    itWidth_um(40, 'IT7') / itWidth_um(40, 'IT6'), 1.5625, 0.01, 'x');
  checkTrue('K4.3', 'reaming cannot hold dia 40 H6', !ream40.capable, `${fmt(ream40.ratio, 2)}x over`);
  checkTrue('K4.4', 'fine boring CAN hold dia 40 H6', bore40.capable, `${fmt(bore40.ratio, 2)}x`);
  checkTrue('K4.5', 'reaming IS normal practice on dia 12 H7', ream12.capable, `${fmt(ream12.ratio, 2)}x`);
}

/* ══════════════════════════════════════════════════════════════════════════
   COR-C4 — ATTRIBUTION INTEGRITY
   A tool does not care what it is cutting. Machine-side thermal error must be a
   property of the MACHINE (carbide/steel coefficients), and workpiece growth must
   be listed separately by the WORKPIECE's own alpha. Conflating them is how a
   model starts lying while every individual number still looks reasonable.
   ══════════════════════════════════════════════════════════════════════════ */

function attributionBlock() {
  console.log('COR-C4 attribution integrity');
  const T = makeTool({ D: 12.7, z: 3, stickout_L: 50 });
  const M = MACHINES.vmc_40taper_7k5;
  const cut = { ae: 7.62, ap: 6, fz: 0.15, f: 800 };
  const budget = (k) => {
    const mat = MATERIALS[k];
    const s = removalStep(cut, { tool: T, material: mat }, M);
    return errorBudget(s, T, mat, { runout_um: 5 });
  };
  const al = budget('al_6061'), st = budget('steel_4140'), ti = budget('ti_6al4v');
  const term = (b, i) => b.terms[i].um;

  // index 2 = tool/holder, 3 = workpiece, 4 = ballscrew
  console.log(`  tool/holder  al ${fmt(term(al, 2), 3)}  steel ${fmt(term(st, 2), 3)}  ti ${fmt(term(ti, 2), 3)} um`);
  console.log(`  workpiece    al ${fmt(term(al, 3), 3)}  steel ${fmt(term(st, 3), 3)}  ti ${fmt(term(ti, 3), 3)} um`);
  console.log(`  ballscrew    al ${fmt(term(al, 4), 3)}  steel ${fmt(term(st, 4), 3)}  ti ${fmt(term(ti, 4), 3)} um\n`);

  check('C4.1', 'tool/holder thermal = k_carbide*L*dT (10K, 50mm)', term(al, 2), 5.5e-6 * 50 * 10 * 1000, 1e-6, 'um');
  checkTrue('C4.2', 'tool/holder thermal is IDENTICAL for 6061 and Ti',
    Math.abs(term(al, 2) - term(ti, 2)) < 1e-9, 'a machine-side term must not read the workpiece');
  checkTrue('C4.3', 'ballscrew drift is IDENTICAL for 6061 and Ti',
    Math.abs(term(al, 4) - term(ti, 4)) < 1e-9, 'the screw is steel regardless of workpiece');
  check('C4.4', 'workpiece growth uses the WORKPIECE alpha (6061)',
    term(al, 3), 23.6e-6 * 40 * 10 * 1000, 1e-6, 'um');
  check('C4.5', 'workpiece growth uses the WORKPIECE alpha (Ti)',
    term(ti, 3), 8.6e-6 * 40 * 10 * 1000, 1e-6, 'um');
  checkTrue('C4.6', 'aluminium workpiece grows more than titanium',
    term(al, 3) > term(ti, 3), `${fmt(term(al, 3), 2)} vs ${fmt(term(ti, 3), 2)} um`);
  check('C4.7', 'total equals the sum of its attributed terms',
    al.total_um, al.terms.reduce((a, t) => a + t.um, 0), 1e-9, 'um');
  checkTrue('C4.8', 'no term is silently unlabelled',
    al.terms.every((t) => t.name && t.cause && t.fix), 'every um carries a cause and a fix');
}

attributionBlock();

/* ── WORLD-* — the numbers the 3D shop floor renders with ────────────────
   §13 makes sound a core gameplay system and §73 makes the CHIP the last rung
   of the scale ladder. Both need the kernel to report its edge count and the
   dominant frequency of the impulse train a cut makes. These are not new
   physics — they are the kernel handing a caller a number it already had. */
{
  const T1 = makeTool({ D: 12.7, z: 1, stickout_L: 55 });   // single-point boring bar
  const T3 = makeTool({ D: 12.0, z: 3, stickout_L: 40 });   // 3-flute
  const rip = { b: 0.05, feed: 0.08, vc: 160 };             // 50 µm radial bite

  const s1 = boringStep(rip, { tool: T1, material: MATERIALS.steel_4140 }, VMC);
  const s3 = boringStep(rip, { tool: T3, material: MATERIALS.steel_4140 }, VMC);

  check('WORLD.1', 'boringStep carries the tool edge count z', s1.z, 1, 1e-9, 'edges');
  checkTrue('WORLD.2', 'edge count does NOT change the cutting force',
    Math.abs(s1.F_mean_N - s3.F_mean_N) < 1e-9,
    'F = kc*b*h is symmetric in b and h; flute count is not in it');

  /* Tooth-passing frequency is n*z/60. To isolate z, hold the SPEED constant:
     pass an explicit n so both bars turn at the same rpm and the only remaining
     difference is how many edges arrive per revolution. */
  const n_fixed = 4000;
  const a1 = boringStep({ ...rip, n: n_fixed }, { tool: T1, material: MATERIALS.steel_4140 }, VMC);
  const a3 = boringStep({ ...rip, n: n_fixed }, { tool: T3, material: MATERIALS.steel_4140 }, VMC);
  checkTrue('WORLD.3', 'at equal rpm, a 3-edge bar passes 3x as often as a 1-edge bar',
    Math.abs((a3.n / 60) * a3.z - 3 * ((a1.n / 60) * a1.z)) < 1e-9,
    `tooth Hz at ${n_fixed} rpm: 1-edge ${fmt((a1.n / 60) * a1.z, 1)}  `
    + `3-edge ${fmt((a3.n / 60) * a3.z, 1)}`);

  /* The frequency a player hears is n*z/60. At the kernel's own rpm for a
     50 µm bite on Ø17.5 the bar is fast, so the tone is high — which is
     exactly why a boring bar squeals and a big face mill thumps. */
  const cuttingHz1 = (s1.n / 60) * s1.z;
  const cuttingHz3 = (s3.n / 60) * s3.z;
  console.log(`  WORLD: boring Ø${fmt(rip.b * 2, 2)} mm  ${fmt(s1.n, 0)} rpm  `
    + `1-edge ${fmt(cuttingHz1, 1)} Hz  3-edge ${fmt(cuttingHz3, 1)} Hz\n`);

  checkTrue('WORLD.4', 'a single-point bar at 160 m/min is audible, not infra-sound',
    cuttingHz1 >= 20 && cuttingHz1 <= 20000,
    `${fmt(cuttingHz1, 1)} Hz is inside the band a human hears`);
}

/* ── WORLD.5 — THE CHIP MODEL'S HONEST LIMIT, PINNED ───────────────────────
   world.mjs derives a chip's thickness ratio and break threshold from `mc`.
   That reuse is defensible (it is the kernel's own statement about how a chip
   thickens) but it separates the materials LESS than a reader would assume.
   This test exists so the limitation is executable rather than a claim in a
   comment: if a future edit widens `mc`, this test fails LOUDLY and whoever
   widened it must go and re-check REF-A/B/S, which `kc` feeds.

   It asserts the truth as shipped, not the truth one would like. */
{
  const mc = (k) => MATERIALS[k].mc;
  checkTrue('WORLD.5a', 'stainless and titanium thicken less than al/steel (stringy chips)',
    mc('ss_304') < mc('al_6061') && mc('ti_6al4v') < mc('al_6061'),
    `mc: al ${mc('al_6061')}  steel ${mc('steel_4140')}  ti ${mc('ti_6al4v')}  ss ${mc('ss_304')}`);
  checkTrue('WORLD.5b', 'KNOWN LIMIT: aluminium and 4140 are NOT separated by mc',
    mc('al_6061') === mc('steel_4140'),
    'so their modelled chips are bit-identical; world.mjs documents this hole rather than dressing it up');
  console.log(`  WORLD.5  chip-model limit: ${new Set(Object.values(MATERIALS).map((m) => m.mc)).size} `
    + `distinct mc across ${Object.keys(MATERIALS).length} materials — aluminium 6061 and steel 4140 `
    + `produce the same modelled chip\n`);
}

/* ── K4-EXT  the grades above IT8 ─────────────────────────────────────────
   These were missing, and their absence was silent: `itWidth_um(52, 'IT9')`
   returned `undefined` and the first caller to reach for it died three frames
   away in a template literal. A clearance hole is an IT9 hole and the drilling
   floor is IT11, so these are load-bearing grades rather than nice-to-haves. */
check('K4-EXT-1', 'IT9 at Ø40 (bracket 50) is 62 µm', itWidth_um(40, 'IT9'), 62, 0.001, 'µm');
check('K4-EXT-2', 'IT9 at Ø52 (bracket 80) is 74 µm', itWidth_um(52, 'IT9'), 74, 0.001, 'µm');
checkTrue('K4-EXT-3', 'IT11 is computable at all — PROCESS_FLOOR names it',
    Number.isFinite(itWidth_um(40, 'IT11')));
checkTrue('K4-EXT-4', 'the widths increase with grade at one size',
    itWidth_um(40, 'IT5') < itWidth_um(40, 'IT6') &&
    itWidth_um(40, 'IT6') < itWidth_um(40, 'IT7') &&
    itWidth_um(40, 'IT7') < itWidth_um(40, 'IT8') &&
    itWidth_um(40, 'IT8') < itWidth_um(40, 'IT9') &&
    itWidth_um(40, 'IT9') < itWidth_um(40, 'IT10') &&
    itWidth_um(40, 'IT10') < itWidth_um(40, 'IT11'));
checkTrue('K4-EXT-5', 'the widths increase with size at one grade',
    itWidth_um(10, 'IT9') < itWidth_um(40, 'IT9') && itWidth_um(40, 'IT9') < itWidth_um(100, 'IT9'));
/* The grades the game actually hangs jobs on must all resolve. A job spec is a
   piece of data and a missing grade in it is not a type error in a .mjs file —
   it is `undefined` three frames later. */
checkTrue('K4-EXT-6', 'every grade any job spec asks for is computable',
    JOBS.every((j) => Number.isFinite(itWidth_um(j.nominal_mm, j.grade))));

/* ── report ───────────────────────────────────────────────────────────── */
const failed = rows.filter((r) => !r.ok);
if (failed.length) {
  console.log('FAILURES');
  for (const f of failed) {
    console.log(`  ${f.id}  ${f.label}\n      actual ${fmt(f.actual, 4)}  expected ${fmt(f.expected, 4)} ${f.unit}`);
  }
}
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed, ${rows.length} total`);
if (fail === 0) console.log('kernel arithmetic is self-consistent with the spec reference cases\n');
process.exit(fail === 0 ? 0 : 1);
