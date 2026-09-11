/* ══════════════════════════════════════════════════════════════════════════
   ENVELOPE SWEEP — what this machine will actually allow, measured
   ══════════════════════════════════════════════════════════════════════════
   Run:  node tools/envelope-sweep.mjs   [jobId]

   Round 2's claim is "the machine now pushes back". That is a claim about
   NUMBERS, and this file is how it is checked instead of asserted. It drives
   the real game verbs — newGame/loadTool/cutOnce/roughTo — so what it prints is
   what a player would get, not what a separate model of the machine says.

   It exists because the round-2 design started from a claim that turned out to
   be FALSE — that deepening the dial brings the chatter limit into reach — and
   the only reason that was caught is that section 4 of this file prints the
   chatter limit next to the power it would need. A sweep that only reported
   "power is now reachable" would have shipped the wrong job. Keep section 4.
   ══════════════════════════════════════════════════════════════════════════ */
import { newGame, cutOnce, loadTool, roughTo, JOBS, jobById, envelope,
         partGrowth_um } from '../game.mjs';
import { makeTool, assessBoring, MATERIALS, MACHINES, stability, boringStep }
  from '../kernel.mjs';

const JOB_ID = process.argv[2] || 'J2';
const job = jobById(JOB_ID);
const mach = MACHINES[job.machine], mat = MATERIALS[job.material];
const tool20 = makeTool({ D: 20, z: 1, stickout_L: 45 });
const pct = (x) => (x * 100).toFixed(1).padStart(6) + '%';

const banner = (s) => console.log('\n' + '─'.repeat(78) + '\n' + s + '\n' + '─'.repeat(78));

console.log(`ENVELOPE SWEEP — job ${job.id} "${job.title}"`);
console.log(`  ${job.client} · Ø${job.nominal_mm} ${job.grade} · as-found Ø${job.start_hole_dia_mm}` +
  ` · ${((job.band_high_mm - job.start_hole_dia_mm) / 2 * 1000).toFixed(0)} µm radius of stock` +
  ` · ${job.bore_depth_mm} mm deep`);
console.log(`  machine ${job.machine}: ${mach.power_max_kW} kW, ${mach.rated_torque_Nm} Nm, ${mach.n_max} rpm`);
console.log(`  tool bar Ø${tool20.D} mm @ 45 mm out`);

/* ── 1. THE ASSESSED ENVELOPE, BITE ONLY ─────────────────────────────────── */
banner('1. ASSESSED ENVELOPE — bite swept, feed 0.12, vc 120  (what the kernel refuses)');
console.log('   bite(mm)   Pc(kW)  power   torque   F(N)   sag(um)  chatter   verdict');
for (const b of [0.1, 0.2, 0.4, 0.8, 1, 2, 3, 4, 5, 6, 8, 10, 12]) {
  const a = assessBoring({ b, feed: 0.12, vc: 120 }, { tool: tool20, material: mat }, mach);
  console.log(`   ${String(b).padStart(7)}  ${a.step.Pc_kW.toFixed(3).padStart(7)}  ` +
    `${pct(a.step.power_frac)}  ${pct(a.step.torque_frac)}  ${a.step.F_mean_N.toFixed(0).padStart(5)}  ` +
    `${a.err.deflection_mean_um.toFixed(2).padStart(7)}  ${a.chatter_load.toFixed(3).padStart(7)}   ${a.verdict}`);
}

/* ── 2. THE GAME'S OWN VERBS ─────────────────────────────────────────────── */
banner('2. THE GAME\'S OWN VERBS — cutOnce on the as-found bore (what a player meets)');
console.log('   bite(mm)  feed   result');
for (const [b, f] of [[0.4, 0.12], [1, 0.12], [2, 0.12], [4, 0.12], [4, 0.2], [4, 0.3],
                      [4, 0.5], [3, 0.3], [2, 0.5], [6, 0.12], [8, 0.12]]) {
  const g = newGame(job); loadTool(g, 'bar20', 45); g.machine.spindle_on = true;
  const r = cutOnce(g, { bite_mm: b, feed_mm_rev: f, vc: 120, label: 'sweep' });
  const tag = r.ok
    ? `ok  ${r.rec.power_kW.toFixed(2)} kW (${((r.rec.power_kW / mach.power_max_kW) * 100).toFixed(0)}%)  ` +
      `F ${r.rec.force_N.toFixed(0)} N  ${r.rec.cut_min.toFixed(2)} min`
    : `REFUSED ${r.why}  :: ${String(r.detail || '').slice(0, 46)}`;
  console.log(`   ${String(b).padStart(7)}  ${String(f).padEnd(5)}  ${tag}`);
}

/* ── 3. THE FEASIBLE ENVELOPE AS A GRID ──────────────────────────────────── */
banner('3. THE FEASIBLE ENVELOPE — bite x feed, % of spindle power, REFUSED spelled out');
const feeds = [0.08, 0.12, 0.2, 0.3, 0.5];
console.log('   bite\\feed ' + feeds.map((f) => ('f' + f).padStart(15)).join(''));
for (const b of [0.3, 0.5, 1, 2, 3, 4]) {
  let line = `   ${String(b).padStart(4)} mm  `;
  for (const f of feeds) {
    const g = newGame(job); loadTool(g, 'bar20', 45); g.machine.spindle_on = true;
    const r = cutOnce(g, { bite_mm: b, feed_mm_rev: f, vc: 120, label: 'grid' });
    line += (r.ok
      ? `${((r.rec.power_kW / mach.power_max_kW) * 100).toFixed(0)}%`.padStart(15)
      : (r.why === 'TORQUE LIMIT' ? 'TORQUE LIMIT' : 'POWER LIMIT').padStart(15));
  }
  console.log(line);
}

/* ── 4. WHY CHATTER IS *NOT* THE JOB — the section that corrected the design ─
 * `stability()` on the boring path returns ap_crit_relevant = ap_crit_mm /
 * h_mean: the limit is divided by the FEED, and the radial bite never enters
 * it. So the chatter test compares a bite against a number only the feed can
 * move — and the bite needed to reach it always wants several times the
 * spindle's power. Printing the two side by side is the whole argument. */
banner('4. CHATTER vs POWER — why this job promises power and not chatter');
console.log('   feed(mm/rev)  ap_crit_mm  chatter limit(mm bite)  power at that bite   binding');
for (const f of [0.12, 0.3, 0.5, 1.0, 2.0]) {
  const st = boringStep({ b: 0.4, feed: f, vc: 120 }, { tool: tool20, material: mat }, mach);
  const sb = stability(st, { tool: tool20, material: mat }, mach);
  const lim = sb.ap_crit_mm / f;
  const at = assessBoring({ b: lim, feed: f, vc: 120 }, { tool: tool20, material: mat }, mach);
  console.log(`   ${f.toFixed(2).padStart(12)}  ${sb.ap_crit_mm.toFixed(3).padStart(10)}  ` +
    `${lim.toFixed(3).padStart(20)}  ${pct(at.step.power_frac).padStart(18)}   ${at.verdict}`);
}
console.log('\n   READ THIS ROW-BY-ROW: every chatter limit wants ≥500% of spindle power.');
console.log('   Power always binds first on the boring path. A job that promised chatter');
console.log('   would be a job that lies, so J2 promises power and torque instead.');

/* ── 5. WHAT THE JOB COSTS IN TIME ───────────────────────────────────────── */
banner('5. ROUGHING THE WHOLE JOB — passes and minutes, by bite (feed 0.12)');
console.log('   bite(mm)  passes  min   maxPc(kW)  maxF(N)  maxpower  result');
for (const b of [0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 1.6, 2.0, 3.0, 4.0]) {
  const g = newGame(job); loadTool(g, 'bar20', 45); g.machine.spindle_on = true;
  const r = roughTo(g, { target_dia_mm: job.band_high_mm - 0.1, bite_mm: b,
    feed_mm_rev: 0.12, vc: 120 });
  if (!r.ok) {
    console.log(`   ${String(b).padStart(7)}  ${String(r.passes.length).padStart(6)}  ` +
      `—      REFUSED ${r.why} :: ${String(r.detail || '').slice(0, 34)}`);
    continue;
  }
  const P = r.passes;
  console.log(`   ${String(b).padStart(7)}  ${String(P.length).padStart(6)}  ` +
    `${r.minutes.toFixed(1).padStart(4)}  ${Math.max(...P.map((p) => p.power_kW)).toFixed(3).padStart(9)}  ` +
    `${Math.max(...P.map((p) => p.force_N)).toFixed(0).padStart(7)}  ` +
    `${((Math.max(...P.map((p) => p.power_kW)) / mach.power_max_kW) * 100).toFixed(1).padStart(7)}%` +
    `${r.truncated ? '  TRUNCATED' : ''}`);
}

/* ── 6. THE PREVIEW AGREES WITH THE REFUSAL ──────────────────────────────── */
banner('6. THE PREVIEW MUST AGREE WITH THE REFUSAL (a preview that lied would be worse than none)');
let mismatches = 0;
for (const b of [0.3, 1, 2, 3, 4]) {
  for (const f of [0.12, 0.3, 0.5]) {
    const g = newGame(job); loadTool(g, 'bar20', 45); g.machine.spindle_on = true;
    const env = envelope(g, { bite_mm: b, feed_mm_rev: f, vc: 120 });
    const r = cutOnce(g, { bite_mm: b, feed_mm_rev: f, vc: 120, label: 'x' });
    const agreed = env.would_cut === r.ok;
    if (!agreed) mismatches++;
    if (!agreed) console.log(`   MISMATCH b=${b} f=${f}: preview says ` +
      `would_cut=${env.would_cut} (binding ${env.binding} ${(env.binding_frac * 100).toFixed(0)}%), ` +
      `cut said ${r.ok ? 'ok' : r.why}`);
  }
}
console.log(`   ${mismatches === 0
  ? 'AGREE on all 15 combinations — the load meter cannot promise a cut the machine refuses.'
  : `${mismatches} MISMATCHES — the preview and the refusal disagree. Fix before shipping.`}`);

/* ── 7. THE ROUND-2 MEASUREMENT, STATED AS NUMBERS ──────────────────────────
 * The honest shape of the comparison, and it is NOT "the same bite loads the
 * machine harder on J2" — it does not. Load is a function of material, machine
 * and (bite x feed), and both jobs share the first two, so at 0.4 mm the two
 * parts draw the identical 5.4%. Anyone claiming J2 changed the physics has
 * misread the round.
 *
 * What changes is WHICH BITES ARE IN PLAY. On J1 the part is fully cut with
 * 2 mm of radius, so no reachable bite is heavy: even the maximum allowable
 * move is far inside every wall. On J2 there is 4 mm of radius in the part and
 * the finish pass is not the interesting number — the ROUGHING bites are, and
 * they reach and cross the wall. So the measurement that matters is not "load
 * at 0.4 mm" at all; it is the load at the bite the JOB requires.
 *
 * Also recorded honestly: the chatter margin printed here is 96.4x, not the
 * 44x that was carried into this round's brief. The 44x figure does not
 * reproduce against the boring bar (see section 4 — the limit is set by the
 * feed and the tool geometry, and a Ø20 bar at 45 mm out yields 38.57 mm of
 * chatter-free bite at 0.12 mm/rev, against the 0.4 mm dial = 96.4x). The 44x
 * is superseded by measurement, and the round-2 write-up must say so rather
 * than repeat it. */
banner('7. THE ROUND-2 MEASUREMENT — the load at the bite each JOB actually requires');
const j1 = jobById('J1');
console.log('   job          stock(mm r)  bite needed  power   torque   F(N)    chatter margin  result');
for (const spec of [j1, job]) {
  const stock_r = (spec.band_high_mm - spec.start_hole_dia_mm) / 2;
  /* "the bite the job requires": the heavy roughing move a player would reach
     for to clear that stock in a couple of passes, not a cautious 0.4 mm. */
  const bite = Math.min(4, Math.max(0.4, stock_r));
  const g = newGame(spec); loadTool(g, 'bar20', 45); g.machine.spindle_on = true;
  const e = envelope(g, { bite_mm: bite, feed_mm_rev: 0.12, vc: 120 });
  const st = boringStep({ b: bite, feed: 0.12, vc: 120 }, { tool: tool20, material: mat }, mach);
  const sb = stability(st, { tool: tool20, material: mat }, mach);
  const margin = (sb.ap_crit_mm / 0.12) / bite;
  console.log(`   ${spec.id.padEnd(12)} ${stock_r.toFixed(2).padStart(10)}  ` +
    `${bite.toFixed(2).padStart(11)}  ${pct(e.power_frac)}  ${pct(e.torque_frac)}  ` +
    `${e.F_mean_N.toFixed(0).padStart(5)}   ${margin.toFixed(1).padStart(13)}x  ` +
    `${e.would_cut ? 'cuts' : 'REFUSED: ' + e.binding}`);
}
console.log('\n   AND THE WALL, REACHED BY FEED AT THE SAME BITE (J2, bite 4 mm):');
for (const f of [0.08, 0.12, 0.2, 0.3, 0.5]) {
  const g = newGame(job); loadTool(g, 'bar20', 45); g.machine.spindle_on = true;
  const e = envelope(g, { bite_mm: 4, feed_mm_rev: f, vc: 120 });
  console.log(`     feed ${f.toFixed(2)}: power ${pct(e.power_frac)}  torque ${pct(e.torque_frac)}  ` +
    `${e.would_cut ? 'cuts' : 'REFUSED — ' + e.binding}`);
}
console.log('\n   The lever is feed, not depth: MRR = b·h·vc, and leaning on h is how a');
console.log('   machinist buys removal rate and how he runs out of spindle. On J1 there');
console.log('   is not enough metal in the part for that equation to have a bad answer.');
