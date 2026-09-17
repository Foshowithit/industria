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
import { chipFromPass, CHIP_HEAT } from './world.mjs';

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

/* ── CHIP-*  WHAT A CHIP MAY CLAIM ───────────────────────────────────────
   The chip read quotes three numbers at a player and all three must be exact.
   The first version of `chipFromPass` got all three wrong: the mass came from a
   chip cross-section instead of the annulus that was actually removed (a
   thousand times too light), and the thickness was the radial BITE instead of
   the feed, so a 4 mm roughing cut produced a "4.2 mm thick chip". Both were
   player-visible and neither threw. */
{
  const mat = MATERIALS.steel_4140;
  const rec = { bite_realised_um: 400, bite_cmd_um: 400, feed_mm_rev: 0.12,
    power_kW: 0.33, cut_min: 0.531, feed_mm_min: 229, travel_mm: 30,
    prevCold: 36, coldDia: 36.8 };
  const c = chipFromPass(rec, mat);

  const annulus_mm3 = (Math.PI / 4) * (36.8 ** 2 - 36 ** 2) * 30;
  near('CHIP-1', 'the chip mass is the annulus that was removed',
    c.mass_g, annulus_mm3 * 7.85e-3, 0.01);
  ok('CHIP-2', 'and that is grams, not milligrams', c.mass_g > 5);
  near('CHIP-3', 'the thickness is the FEED times the thickening ratio',
    c.t2_um, 0.12 * c.r_chip * 1000, 1e-6);
  ok('CHIP-4', 'the thickness is not the bite', Math.abs(c.t2_um - 400) > 100);
  near('CHIP-5', 'the width is the bite the bar actually took', c.width_um, 400, 1e-6);
  near('CHIP-6', 'the surplus is measured on the width', c.surplus_um, 0, 1e-6);
  /* The read may not quote a temperature until the model can defend one. */
  ok('CHIP-7', 'this build does not treat the chip temperature as a diagnosis',
    CHIP_HEAT.temperature_is_diagnostic === false);
  /* And the energy must be the CUTTING time, not the pass time — a pass carries
     0.4 minutes of retract and reset that never touched the part. */
  const slow = chipFromPass({ ...rec, cut_min: 5.0 }, mat);
  near('CHIP-8', 'retract and reset time do not heat the chip', slow.temp_C, c.temp_C, 1e-9);
}

/* ── CLOCK-*  ONE CLOCK ──────────────────────────────────────────────────
   `isLate()` reads `g.clock_min`, so the money is measured against
   `clock_min` and nothing else. The header used to display `clocks.world_min`
   — which advances at AMBIENT_SCALE 6 against the job's JOB_SCALE 3, i.e. at
   TWICE the rate — next to a deadline set on the job's clock, so the LATE
   badge lit at roughly the halfway point of real time on every job. These
   assertions hold the two facts that close it. */
{
  const W = await import('./world.mjs');
  const { isLate } = await import('./game.mjs');
  eq('CLOCK-1', 'isLate measures clock_min', isLate({ clock_min: 631, deadline_min: 630 }), true);
  eq('CLOCK-2', 'and not before it', isLate({ clock_min: 630, deadline_min: 630 }), false);
  /* The world clock outruns the job clock by exactly the ratio of the scales. */
  const c = { world_min: 0, job_min: 0, job_taken: true };
  /* A 1.0 s delta is treated as a RESUME by the tab-switch guard (frames over
     MAX_FRAME_S = 0.25 s advance nothing), which is why this is 0.1 s. The
     guard is asserted separately below rather than worked around silently. */
  W.advanceClocks(c, 0.1);
  ok('CLOCK-3', 'the world clock runs faster than the job clock',
    c.world_min > c.job_min);
  near('CLOCK-4', 'by the ratio of the two scales',
    c.world_min / Math.max(c.job_min, 1e-9), W.AMBIENT_SCALE / W.JOB_SCALE, 0.01);
  /* And the reason `shiftClock_min` is NOT the header's source: it omits the
     operation-time offset, so it understates the shift. Asserted so nobody
     "simplifies" the page back onto it. */
  /* The guard itself, stated: a backgrounded tab does not fast-forward you. */
  {
    const g = { world_min: 500, job_min: 500, job_taken: true };
    W.advanceClocks(g, 4.0);
    eq('CLOCK-7', 'a frame longer than the resume threshold advances nothing', g.world_min, 500);
    eq('CLOCK-8', 'and flags itself as a resume', g.resumed, true);
  }
  eq('CLOCK-5', 'shiftClock_min returns the raw job clock',
    W.shiftClock_min({ job_taken: true, job_min: 100, world_min: 900 }), 100);
  ok('CLOCK-6', 'which is NOT the clock the deadline is measured against once work has been done',
    W.shiftClock_min({ job_taken: true, job_min: 100, world_min: 900 }) !== 100 + 25);
}

/* ── ADV-*  WHAT THIS MODEL IS NOT ───────────────────────────────────────
   The README has claimed since it was written that the page shows these. It
   did not. A disclosure asserted in a document and absent from the artefact is
   the same failure the flags exist to prevent. */
{
  const K = await import('./kernel.mjs');
  eq('ADV-1', 'the kernel refuses machine execution', K.MACHINE_EXECUTION, false);
  eq('ADV-2', 'the kernel refuses production authorization', K.PRODUCTION_AUTHORIZATION, false);
  ok('ADV-3', 'and both are exported so a page cannot invent them',
    typeof K.MACHINE_EXECUTION === 'boolean' && typeof K.PRODUCTION_AUTHORIZATION === 'boolean');
}

/* ── SPD-*  THE SPINDLE SPEED, AND WHAT IT DOES AND DOES NOT BUY ─────────
   The last fixed constant in the cut path. `doCut` and `doRough` both passed a
   literal `vc: 120` and nothing could change it, which took a real decision
   away from the player AND left the chip colour with nothing to report. */
{
  const { SPEEDS } = await import('./game.mjs');
  const K = await import('./kernel.mjs');

  eq('SPD-1', 'a machine opens at the default speed', newGame().machine.vc_m_min, SPEEDS.default);
  ok('SPD-2', 'the steps are ordered slow to fast',
    SPEEDS.steps.every((v, i, a) => i === 0 || v > a[i - 1]));
  ok('SPD-3', 'the default is one of the steps', SPEEDS.steps.includes(SPEEDS.default));

  /* POWER RISES WITH SPEED at a fixed chip area — P is proportional to vc. */
  const env = async (vc) => {
    const G = await import('./game.mjs');
    const g = newGame();
    g.tool = 'bar20'; g.stickout_L = 45;
    g.toolSpec = G.TOOLING.find((t) => t.id === 'bar20');
    g.machine.vc_m_min = vc;
    return G.envelope(g, { bite_mm: 0.4, feed_mm_rev: 0.12, vc });
  };
  const slow = await env(60), fast = await env(320);
  ok('SPD-4', 'power rises with cutting speed at a fixed chip area', fast.pkW > slow.pkW * 3);
  /* TORQUE DOES NOT, and this is the physical fact worth learning: torque is
     Pc·9550/n and both scale with vc, so it is set by the CHIP AREA and the
     bore and by nothing else. On a torque-limited job, going faster buys you
     nothing — you have to take a smaller chip. */
  near('SPD-5', 'but torque does not move with speed at all',
    fast.torque_frac, slow.torque_frac, 1e-9);

  /* AND THE CHIP COLOUR MOVES WITH IT, which is the reason the setting exists. */
  const { chipFromPass } = await import('./world.mjs');
  const chipAt = async (vc) => {
    const tool = K.makeTool({ D: 20, z: 1, stickout_L: 45 });
    const as = K.assessBoring({ b: 1.0, feed: 0.12, vc, bore_D_mm: 40 },
      { tool, material: K.MATERIALS.steel_4140 }, K.MACHINES.vmc_40taper_7k5, { runout_um: 5 });
    return chipFromPass({ bite_realised_um: 1000, bite_cmd_um: 1000, feed_mm_rev: 0.12,
      vc_m_min: vc, power_kW: as.step.Pc_kW, cut_min: 30 / as.step.f + 0.4,
      feed_mm_min: as.step.f, travel_mm: 30, prevCold: 36, coldDia: 38 },
      K.MATERIALS.steel_4140);
  };
  const c60 = await chipAt(60), c320 = await chipAt(320);
  ok('SPD-6', 'a slow cut leaves a cooler chip than a fast one', c320.temp_C > c60.temp_C + 100);
  ok('SPD-7', 'and the colour actually changes across the range',
    c60.colour_name !== c320.colour_name);
  /* The partition is capped at a defensible share rather than running to 100 %:
     some of the cutting heat always goes into the tool and the workpiece. */
  const { CHIP_HEAT } = await import('./world.mjs');
  ok('SPD-8', 'the chip never carries all of the cutting heat',
    CHIP_HEAT.frac_at_vc(9999) <= 0.80 && CHIP_HEAT.frac_at_vc(-99) >= 0.30);
}

/* ── DWG-*  THE DRAWING AND THE JOB MUST AGREE ────────────────────────────
   The worst defect this build could ship is a drawing whose tolerance text does
   not match the band the part is judged against — a player reading one number and
   being graded on another, with nothing on screen to say so. These assertions
   run over EVERY job rather than the default one, because a drawing that is
   right for J1 and wrong for J3 is exactly the failure being guarded against. */
{
  const { drawingFor, JOBS } = await import('./game.mjs');
  const { bandUm } = await import('./world.mjs');
  /* The widths the four jobs declare, written out rather than derived — this is
     the independent copy by design. Every other copy in the build reads the
     helper; if the helper and this disagree, one of them is wrong and the suite
     says so instead of the page printing a third number. */
  const DECLARED_BAND_UM = { J1: 16, J2: 30, J3: 11, J4: 74 };
  const plus3 = (job) => '+' + (job.band_high_mm - job.nominal_mm).toFixed(3);
  const minus3 = (job) => ((job.band_low_mm - job.nominal_mm) >= 0 ? '+' : '') +
    (job.band_low_mm - job.nominal_mm).toFixed(3);
  for (const job of JOBS) {
    const d = drawingFor(job);
    const g = d.geometry;
    eq(`DWG-${job.id}-nominal`, `${job.id}: the drawing bores to the job's nominal`,
      g.bore_dia_mm, job.nominal_mm);
    eq(`DWG-${job.id}-depth`, `${job.id}: and to its depth`,
      g.bore_depth_mm, job.bore_depth_mm);
    eq(`DWG-${job.id}-cast`, `${job.id}: and the as-cast bore is the job's`,
      g.as_cast_dia_mm, job.start_hole_dia_mm);

    const d1 = d.dims.find((x) => x.id === 'D1');
    near(`DWG-${job.id}-plus`, `${job.id}: the upper tolerance IS the job's band top`,
      d1.plus_mm, job.band_high_mm - job.nominal_mm, 1e-12);
    near(`DWG-${job.id}-minus`, `${job.id}: and the lower IS its band bottom`,
      d1.minus_mm, job.band_low_mm - job.nominal_mm, 1e-12);
    eq(`DWG-${job.id}-band`, `${job.id}: the band width on the sheet is the job's band`,
      d1.band_um, Math.round((job.band_high_mm - job.band_low_mm) * 1000));
    /* H6, NOT IT6 — see the note in `drawingFor`. A hole on a drawing is called
       out by its fit designation; the grade is the width behind it. */
    eq(`DWG-${job.id}-grade`, `${job.id}: the sheet calls the bore by its FIT, not its grade`,
      d1.text, `Ø${job.nominal_mm} H${String(job.grade).replace(/^IT/i, '')}`);
    /* The tolerance text must carry the band to three places, because that is
       the resolution the band is defined at and a rounded callout is a lie. */
    /* ASSERTED ON THE FIGURES, NOT ON THE LAYOUT. The first version of this
       compared the whole string and failed on the SPACES around the slash — an
       over-specified test is a test that will break on a formatting change and
       teach nobody anything. It checks that the callout carries both limits to
       three places, which is the property that matters. */
    ok(`DWG-${job.id}-text`, `${job.id}: the callout carries both limits to three places`,
      d1.tol_text.includes(plus3(job)) && d1.tol_text.includes(minus3(job)));
    /* THE PRINTED WIDTH IS THE SHEET'S WIDTH. The board card, the offer line and
       the traveler panel print a band in whole microns; the sheet prints one
       too. The page used to carry three inline copies of the subtraction, which
       is three chances to print three widths for one band. `bandUm` is the one
       derivation they read now, asserted here against the sheet's independent
       arithmetic and against the width the job declares — so a band that moved
       is caught rather than quietly reprinted. */
    eq(`DWG-${job.id}-width`, `${job.id}: the printed band width is whole microns`,
      bandUm(job), Math.round((job.band_high_mm - job.band_low_mm) * 1000));
    eq(`DWG-${job.id}-declared`, `${job.id}: and it is the width the job declares`,
      bandUm(job), DECLARED_BAND_UM[job.id]);
    eq(`DWG-${job.id}-sheet`, `${job.id}: and the sheet agrees with the page`,
      d1.band_um, bandUm(job));
  }
  /* And the sheet is a sheet: a drawing with no title block or no datum is a
     sketch, and the brief's Gate A asks whether the drawing READS right. */
  const d = drawingFor(JOBS[0]);
  ok('DWG-title', 'the sheet carries a title block', !!(d.number && d.rev && d.scale && d.drawn_by));
  ok('DWG-datum', 'and a datum', d.datums.length > 0 && d.datums[0].letter === 'A');
  ok('DWG-notes', 'and the material note', d.notes.some((n) => /MATERIAL/.test(n)));
}

/* ── INS-* / CAL-* / FAIL-*  THE THREE WAYS IT GOES WRONG THAT ARE NOT STRUCTURE
   An insert spends its life by Taylor, a scale drifts off the truth, and a
   machine eventually stops. Each moves the CAUSE of a bad part one step further
   from the cut, and each is asserted here because each is a claim about the
   ORDER of things rather than about a number. */
{
  const G = await import('./game.mjs');
  const rig = () => {
    const g = newGame();
    g.tool = 'bar20'; g.stickout_L = 45;
    g.toolSpec = G.TOOLING.find((t) => t.id === 'bar20');
    g.part.holeDia_cold_mm = 39.0;
    g.machine.edgeR_cold_mm = 19.5;
    return g;
  };

  /* ── the edge ─────────────────────────────────────────────────────────── */
  ok('INS-1', "Taylor's law: faster is a different ORDER of tool life, not a bit less",
    G.insertLifeMin(320) < G.insertLifeMin(120) / 10);
  ok('INS-2', 'and the reference speed gives the reference life',
    Math.abs(G.insertLifeMin(120) - 30) < 1e-9);
  ok('INS-3', 'slower is longer, monotonically',
    [60, 90, 120, 180, 240, 320].every((v, i, a) =>
      i === 0 || G.insertLifeMin(v) < G.insertLifeMin(a[i - 1])));

  ok('INS-4', 'a cut spends the edge', (() => {
    const g = rig();
    cutOnce(g, { bite_mm: 0.4, feed_mm_rev: 0.12, vc: 120, label: 't' });
    return (g.machine.insert_wear ?? 0) > 0;
  })());
  ok('INS-5', 'faster spends it faster', (() => {
    const a = rig(), b = rig();
    cutOnce(a, { bite_mm: 0.4, feed_mm_rev: 0.12, vc: 120, label: 't' });
    cutOnce(b, { bite_mm: 0.4, feed_mm_rev: 0.12, vc: 320, label: 't' });
    return b.machine.insert_wear > a.machine.insert_wear * 3;
  })());
  /* AND A WORN EDGE PUSHES THE PART THE RECOVERABLE WAY — it deflects more, so it
     takes LESS off, so the bore comes out SMALL. Calibration, below, pushes the
     other way. The two failures are opposite and that is worth asserting. */
  ok('INS-6', 'a worn edge leaves the bore SMALLER — it deflects, so it cuts less', (() => {
    const a = rig(), b = rig();
    b.machine.insert_wear = 1;
    cutOnce(a, { bite_mm: 0.4, feed_mm_rev: 0.12, vc: 120, label: 't' });
    cutOnce(b, { bite_mm: 0.4, feed_mm_rev: 0.12, vc: 120, label: 't' });
    return b.part.holeDia_cold_mm < a.part.holeDia_cold_mm;
  })());
  ok('INS-7', 'and it cannot be changed with the spindle turning',
    G.changeInsert(Object.assign(rig(), { machine: { spindle_on: true } })).ok === false);
  ok('INS-8', 'changing it costs money and clock and leaves a fresh edge', (() => {
    const g = rig();
    g.machine.insert_wear = 0.9;
    const r = G.changeInsert(g, { cost: 42, minutes: 3 });
    return r.ok && g.machine.insert_wear === 0 && g.money === -42 && r.before === 0.9;
  })());

  /* ── the scale ────────────────────────────────────────────────────────── */
  ok('CAL-1', 'the scale drifts with cutting', (() => {
    const g = rig();
    cutOnce(g, { bite_mm: 0.4, feed_mm_rev: 0.12, vc: 120, label: 't' });
    return (g.machine.calib_um ?? 0) > 0;
  })());
  /* THE SIGNATURE OF A CALIBRATION ERROR: the same way wrong, every time. */
  ok('CAL-2', 'and it puts the bore BIGGER, every time, by the same amount', (() => {
    const out = [0, 1, 2].map(() => {
      const g = rig();
      g.part.holeDia_cold_mm = 39.0;
      g.machine.edgeR_cold_mm = 19.5;
      g.machine.calib_um = 5;
      cutOnce(g, { bite_mm: 0.4, feed_mm_rev: 0.12, vc: 120, label: 't' });
      return g.part.holeDia_cold_mm;
    });
    const clean = (() => {
      const g = rig();
      cutOnce(g, { bite_mm: 0.4, feed_mm_rev: 0.12, vc: 120, label: 't' });
      return g.part.holeDia_cold_mm;
    })();
    return out[0] > clean && Math.abs(out[0] - out[1]) < 1e-9 && Math.abs(out[1] - out[2]) < 1e-9;
  })());
  ok('CAL-3', 'calibration puts it back on the money', (() => {
    const g = rig();
    g.machine.calib_um = 12;
    const r = G.calibrateMachine(g, { cost: 260, minutes: 25 });
    return r.ok && g.machine.calib_um === 0 && r.before === 12;
  })());
  ok('CAL-4', 'and cannot be done with the spindle turning',
    G.calibrateMachine({ machine: { spindle_on: true } }).ok === false);

  /* ── and the day it stops ─────────────────────────────────────────────── */
  ok('FAIL-1', 'a worse machine has a shorter mean time between failures',
    G.FAILURE.mtbf_min_at_condition(300) < G.FAILURE.mtbf_min_at_condition(900));
  ok('FAIL-2', 'it stops when it has run as long as it was going to', (() => {
    const g = rig();
    /* AT OR BELOW the total, not above it — `checkFailure` fires when the total
       has REACHED the threshold, and the first version of this test set the
       threshold just past it and asserted a failure that correctly did not
       happen. */
    g.machine.fail_at_cut_min = g.machine.cut_min_total;
    const broke = G.checkFailure(g);
    return broke.failed && g.machine.down_until !== null;
  })());
  ok('FAIL-3', 'and a stopped machine cuts nothing', (() => {
    const g = rig();
    g.machine.down_until = 100;
    const r = cutOnce(g, { bite_mm: 0.4, feed_mm_rev: 0.12, vc: 120, label: 't' });
    return r.ok === false && r.why === 'MACHINE_DOWN';
  })());
  ok('FAIL-4', 'a repair puts it back and resets the clock on the next failure', (() => {
    const g = rig();
    g.machine.fail_at_cut_min = 0; g.machine.cut_min_total = 1;
    G.checkFailure(g);
    const r = G.repairMachine(g);
    return r.ok && g.machine.down_until === null && g.machine.fail_at_cut_min > 0 &&
      g.machine.condition > r.before;
  })());
}

/* ── ADAPT-*  THE SEAM A REAL MODEL GOES INTO ────────────────────────────
   VISION.md §3 says a manufacturing model sits in this seat. The seat's three
   conditions were a comment; they are an interface now, and these assert that
   each violation it exists to prevent is actually rejected. */
{
  const G = await import('./game.mjs');
  ok('ADAPT-1', 'an advisor must provide forecast()',
    (() => { try { G.makeAdvisor({}); return false; } catch (e) { return true; } })());
  ok('ADAPT-2', 'and a NUMBER WITHOUT ITS ASSUMPTIONS is refused',
    (() => { try { G.makeAdvisor({ forecast: () => ({ value: 40.001 }) }).forecast({}); return false; }
      catch (e) { return /instruction, not advice/.test(String(e.message)); } })());
  ok('ADAPT-3', 'and a non-finite value is refused',
    (() => { try { G.makeAdvisor({ forecast: () => ({ value: NaN, assumptions: {} }) }).forecast({}); return false; }
      catch (e) { return true; } })());
  ok('ADAPT-4', 'a conforming advisor passes through untouched',
    (() => { const a = G.makeAdvisor({ forecast: () => ({ value: 40.001, assumptions: { x: 1 } }) });
      return a.forecast({}).value === 40.001; })());
  /* The built-in system goes through the same door as anything else would, which
   * is what makes the seam real rather than decorative. */
  ok('ADAPT-5', 'the built-in system conforms to the contract it publishes',
    (() => { const a = G.builtInAdvisor(() => 800);
      const st = newGame(); st.tool = 'bar20'; st.stickout_L = 45;
      st.toolSpec = G.TOOLING.find((t) => t.id === 'bar20');
      const r = a.forecast(Object.assign(st, { bite_um: 300 }));
      return r.refused === true ||
        (Number.isFinite(r.value) && r.assumptions && 'surveyed_condition' in r.assumptions); })());
  ok('ADAPT-7', 'and declining is legal while a bare NaN is not',
    (() => { const a = G.makeAdvisor({ forecast: () => ({ refused: true, why: 'MACHINE_DOWN' }) });
      return a.forecast({}).refused === true; })());
  ok('ADAPT-6', 'and it states the assumption it was computed under',
    G.ADVISOR_CONTRACT.length === 3 && /assumptions/.test(G.ADVISOR_CONTRACT[0]));
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






