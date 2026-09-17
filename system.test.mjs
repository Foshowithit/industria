#!/usr/bin/env node
/**
 * system.test.mjs — the advisory system's seat, and the machine's wear.
 *
 *   node system.test.mjs
 *
 * Exit 0 = every case passes, 1 = something disagrees.
 *
 * WHAT THIS IS FOR. The system makes claims about parts that have not been cut
 * yet. That is the most dangerous kind of number in this build and the whole
 * point of it, so the properties that make it SAFE TO CONSULT are asserted
 * here rather than described:
 *
 *   FX-*    the forecast is the machine's own physics, not a second model
 *   DRIFT-* its error comes from wear and from nothing else
 *   CLAIM-* a claim is settled by metal, cannot be double-counted, and cannot
 *           be improved by asking twice
 *   WEAR-*  the machine ages, and maintenance is the only thing that reverses it
 *   BOOK-*  the catalogue recommends a cut that runs on the machine it
 *           assumes, and states that assumption
 */

import {
  newGame, cutOnce, TOOLING, forecastPass, claimPass, systemRecord, SYSTEM,
  WEAR, runout_um_for, maintain, bookCut,
} from './game.mjs';
import { MACHINES, MATERIALS, assessBoring } from './kernel.mjs';

let pass = 0, fail = 0;
const rows = [];
const eq = (id, label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  rows.push({ id, label, actual, expected, ok }); ok ? pass++ : fail++;
};
const ok = (id, label, cond) => eq(id, label, !!cond, true);
const near = (id, label, actual, expected, tol) =>
  ok(id, label, Math.abs(actual - expected) <= tol);

/** A game set up to cut, with a bar in the spindle and a datum on the wall. */
function rigged({ condition = WEAR.condition_open } = {}) {
  const g = newGame();
  g.tool = 'bar20';
  g.stickout_L = 45;
  g.toolSpec = TOOLING.find((t) => t.id === 'bar20');
  g.machine.condition = condition;
  g.part.holeDia_cold_mm = 39.0;
  g.machine.edgeR_cold_mm = 19.5;
  SYSTEM.survey(g);
  return g;
}

/* ── FX-*  THE FORECAST IS THE MACHINE'S PHYSICS ─────────────────────────
   If this ever stops being exact on a surveyed machine, the system has become
   a model of the kernel instead of the kernel, and every claim it makes is
   uncheckable by construction. This is the single most important assertion in
   the file. */
{
  const g = rigged();
  const f = forecastPass(g, { bite_mm: 0.30, feed_mm_rev: 0.12 });
  const before = g.part.holeDia_cold_mm;
  claimPass(g, f.coldDia_mm, { dial_um: 300 });
  cutOnce(g, { bite_mm: 0.30, feed_mm_rev: 0.12, vc: 120, label: 'real' });
  near('FX-1', 'on a surveyed machine the forecast is exact to a nanometre',
    g.system.claims[0].error_um, 0, 1e-6);
  ok('FX-2', 'and the part really did move', g.part.holeDia_cold_mm > before);

  /* READ-ONLY. A forecast that touched the game would be a cut. */
  const h = rigged();
  const dia0 = h.part.holeDia_cold_mm, passes0 = h.passes, clock0 = h.clock_min;
  forecastPass(h, { bite_mm: 0.30, feed_mm_rev: 0.12 });
  eq('FX-3', 'forecasting changes no bore', h.part.holeDia_cold_mm, dia0);
  eq('FX-4', 'forecasting cuts no metal', h.passes, passes0);
  eq('FX-5', 'forecasting costs no clock', h.clock_min, clock0);

  /* And it refuses rather than guessing. */
  const k = rigged();
  const bad = forecastPass(k, { bite_mm: 40, feed_mm_rev: 2.0 });
  ok('FX-6', 'a cut the machine would refuse is reported as refused, not forecast',
    bad && bad.refused === true);
  eq('FX-7', 'and no claim is filed for it', k.system.claims.length, 0);
  eq('FX-8', 'no bar, no forecast', forecastPass(newGame(), { bite_mm: 0.3 }), null);
}

/* ── DRIFT-*  ITS ERROR IS WEAR AND NOTHING ELSE ─────────────────────────
   The system cannot know wear it has not looked at, and that is the mechanism
   it exists to demonstrate. The drift must be MONOTONIC in wear and it must be
   OPTIMISTIC — a worn machine cuts a bigger bore, so a survey taken when it was
   tighter predicts a bore that is smaller than the one that comes out. */
{
  const errs = [800, 700, 600, 450, 300].map((cond) => {
    const g = rigged({ condition: 800 });
    g.machine.condition = cond;
    const f = forecastPass(g, { bite_mm: 0.30, feed_mm_rev: 0.12 });
    claimPass(g, f.coldDia_mm, { dial_um: 300 });
    cutOnce(g, { bite_mm: 0.30, feed_mm_rev: 0.12, vc: 120, label: 'real' });
    return g.system.claims[0].error_um;
  });
  ok('DRIFT-1', 'a machine matching its survey: no error', Math.abs(errs[0]) < 1e-6);
  ok('DRIFT-2', 'error grows as the machine wears away from the survey',
    Math.abs(errs[4]) > Math.abs(errs[1]));
  ok('DRIFT-3', 'a worn machine makes the system OPTIMISTIC (it predicts smaller than reality)',
    errs.every((e) => e <= 1e-9));
  ok('DRIFT-4', 'the drift is large enough to matter on a tight band at full wear',
    Math.abs(errs[4]) > 4);
  /* A fresh survey erases it — which is the one lever the player has. */
  {
    const g = rigged({ condition: 800 });
    g.machine.condition = 300;
    SYSTEM.survey(g);
    const f = forecastPass(g, { bite_mm: 0.30, feed_mm_rev: 0.12 });
    claimPass(g, f.coldDia_mm, { dial_um: 300 });
    cutOnce(g, { bite_mm: 0.30, feed_mm_rev: 0.12, vc: 120, label: 'real' });
    near('DRIFT-5', 're-surveying a worn machine brings the system back to exact',
      g.system.claims[0].error_um, 0, 1e-6);
  }
}

/* ── CLAIM-*  A CLAIM IS SETTLED BY METAL ────────────────────────────────*/
{
  const g = rigged();
  claimPass(g, 39.30, { dial_um: 300 });
  eq('CLAIM-1', 'a claim is open until metal comes off', g.system.claims[0].error_um, null);
  claimPass(g, 39.31, { dial_um: 320 });
  eq('CLAIM-2', 'asking twice replaces the open claim, it does not add one',
    g.system.claims.length, 1);
  eq('CLAIM-3', 'and the last word is the one kept', g.system.claims[0].predicted_mm, 39.31);
  cutOnce(g, { bite_mm: 0.30, feed_mm_rev: 0.12, vc: 120, label: 'real' });
  ok('CLAIM-4', 'the cut settles it', g.system.claims[0].error_um !== null);
  claimPass(g, 39.90, { dial_um: 500 });
  eq('CLAIM-5', 'a claim made after a cut is a new claim', g.system.claims.length, 2);
  /* The record is the SHOP's, and it counts only settled calls. */
  const rec = systemRecord(g);
  eq('CLAIM-6', 'the record counts only settled calls', rec.n, 1);
  eq('CLAIM-7', 'an empty record reports null rather than zero', systemRecord(rigged()).mean_abs_um, null);
  ok('CLAIM-8', 'the record is bounded', g.system.claims.length <= SYSTEM.claims_kept);
}

/* ── WEAR-*  THE MACHINE AGES ────────────────────────────────────────────*/
{
  const g = rigged();
  const before = g.machine.condition;
  cutOnce(g, { bite_mm: 0.30, feed_mm_rev: 0.12, vc: 120, label: 'real' });
  ok('WEAR-1', 'cutting wears the machine', g.machine.condition < before);
  ok('WEAR-2', 'and the wear is recorded in machine-minutes', g.machine.cut_min_total > 0);
  near('WEAR-3', 'the kernel default is preserved at the opening condition',
    runout_um_for(WEAR.condition_open), 5, 1e-9);
  ok('WEAR-4', 'a newer machine has less runout', runout_um_for(1000) < runout_um_for(800));
  ok('WEAR-5', 'a worn machine has more', runout_um_for(300) > runout_um_for(800));
  ok('WEAR-6', 'runout is bounded at both ends',
    runout_um_for(-9999) >= WEAR.tir_floor_um && runout_um_for(9999) <= WEAR.tir_ceiling_um);

  /* Maintenance is the only thing that puts condition back, and it is refused
     while the spindle turns — you do not put a man on a machine that is cutting. */
  const running = rigged();
  running.machine.spindle_on = true;
  eq('WEAR-7', 'no maintenance with the spindle turning', maintain(running).ok, false);
  const idle = rigged({ condition: 500 });
  const r = maintain(idle, { cost: 100, minutes: 10 });
  ok('WEAR-8', 'maintenance restores condition', idle.machine.condition > 500);
  ok('WEAR-9', 'it costs money', idle.money < 0);
  ok('WEAR-10', 'it costs clock', r.minutes === 10);
  ok('WEAR-11', 'and it cannot exceed the ceiling', idle.machine.condition <= WEAR.condition_ceiling);
}

/* ── BOOK-*  THE CATALOGUE RECOMMENDS WHAT RUNS ──────────────────────────
   A catalogue that recommended a refused cut is a catalogue nobody uses twice,
   and the recommendation must be computed rather than tabulated or it will
   drift out of agreement with the machine. */
{
  const mach = MACHINES.vmc_40taper_7k5;
  const mat = MATERIALS.steel_4140;
  for (const bar of TOOLING) {
    const b = bookCut(bar.id, 'steel_4140');
    ok(`BOOK-${bar.id}`, `the book recommends something for ${bar.id}`, !!b);
    if (!b) continue;
    const tool = { D: bar.D, z: bar.z, stickout_L: bar.D * 2.5 };
    /* The recommendation must run on the machine the book assumes. It is
       checked against the FIRST candidate too, so a recommendation that only
       survives by stepping down is reported rather than hidden. */
    const as = assessBoring(
      { b: b.bite_mm, feed: b.feed_mm_rev, vc: 120 }, { tool, material: mat }, mach,
      { runout_um: runout_um_for(b.assumes.machineCondition), tool_len_mm: bar.D * 2.5 });
    ok(`BOOK-${bar.id}-runs`, `...and it runs on the machine it assumes`, as.verdict === 'CUTS CLEAN');
  }
  ok('BOOK-ASSUMES', 'the book states the condition it was written for',
    bookCut('bar20', 'steel_4140').assumes.machineCondition === 1000);
  ok('BOOK-UNKNOWN', 'an unknown bar gets no recommendation', bookCut('bar99', 'steel_4140') === null);
}

/* ── report ───────────────────────────────────────────────────────────── */
const failed = rows.filter((r) => !r.ok);
if (failed.length) {
  console.log('FAILURES');
  for (const f of failed) {
    console.log(`  ${f.id}  ${f.label}\n      actual   ${JSON.stringify(f.actual)}\n      expected ${JSON.stringify(f.expected)}`);
  }
}
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed, ${rows.length} total`);
if (fail === 0) console.log('the system forecasts the machine it surveyed, and is wrong exactly when that is not the machine');
process.exit(fail === 0 ? 0 : 1);
