#!/usr/bin/env node
/**
 * disposition.test.mjs — THE REACHABILITY PROOF FOR ROUND 10A.
 *
 *   node disposition.test.mjs
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT A UNIT TEST.
 *
 * Round 10 measured, on the shipped artifact, that `classifyOffMachine`'s
 * third branch — RECOVERABLE / REWORK — could never be reached by a player.
 * The `NO STOCK` guard in `cutOnce` clamps the HOT bore radius at
 * `band_high_mm / 2` exactly, while `inspect()` scores the COLD diameter, so
 * `over_um <= 0` always held and the branch was dead code.
 *
 * The design lead's instruction for the fix was explicit:
 *
 *   "add a reachability test exercising all three dispositions through the
 *    actual verbs rather than unit-testing `classifyOffMachine()` in isolation."
 *
 * So every case below drives the game layer the way the page drives it —
 * `newGame` -> `loadTool` -> `rough` -> `cut` -> `ship` -> `courierDepart` —
 * and asserts on the OBSERVABLE outcome (money, register, rack, courier),
 * never on a hand-built `{ under_um: 60 }` object handed to the classifier.
 *
 * A disguised unit test would be worse than a stated gap: it would report a
 * branch as "reachable" while proving only that the branch's own arithmetic
 * works when someone else supplies the impossible input. Case 3 below is the
 * honest gap, and it says so out loud in its own output.
 *
 * WHAT IS DELIBERATELY NOT TOUCHED: `kernel.test.mjs`. That file is the
 * kernel's regression and it must still print 54/54. This one drives game.mjs.
 *
 * Exit 0 = every reachable case passes. Exit 1 = something disagrees.
 */

import * as G from './game.mjs';
import { readFileSync } from 'node:fs';

/* The page source, read as TEXT. The courier narration lives in index.html,
   which is a page and cannot be imported as a module — but the branch that
   decides the narration is exactly the branch that shipped dead in the first
   draft of this round, so it has to be checked somewhere. Reading the source
   is the only way to assert it from a test that drives the game. */
let PAGE_SRC = null;
try {
  PAGE_SRC = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
} catch { PAGE_SRC = null; }

const RATE = 1850;                       // J1's rate, from JOBS[0] in game.mjs
const REWORK_FEE_EXPECTED = RATE * 0.35; // 647.5

/* The page's own roughing target, read from index.html:1454 rather than
   re-derived here:
     const roughTarget = g.job.band_high_mm - 2 * (FINISH_ALLOWANCE_UM / 1000);
   with FINISH_ALLOWANCE_UM = 40 (index.html:1039). This test must rough to the
   SAME place the player's ROUGH button does, or it is testing a different game. */
const FINISH_ALLOWANCE_UM = 40;
const roughTargetFor = (g) => g.job.band_high_mm - 2 * (FINISH_ALLOWANCE_UM / 1000);

/* The page's default roughing move (index.html:1042-1043). */
const ROUGH_BITE_MM = 0.3;
const ROUGH_FEED_MM_REV = 0.12;

let pass = 0, fail = 0;
const rows = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; rows.push([name, 'PASS', detail]); }
  else { fail++; rows.push([name, 'FAIL', detail]); }
};
const eq = (name, got, want, extra = '') =>
  ok(name, got === want, `${JSON.stringify(got)}${got === want ? '' : ' != ' + JSON.stringify(want)}${extra ? '  ' + extra : ''}`);
const near = (name, got, want, tol, extra = '') =>
  ok(name, Math.abs(got - want) <= tol,
     `${got.toFixed(4)} vs ${want} (±${tol})${extra ? '  ' + extra : ''}`);

/** A fresh J1 on the machine with the Ø12 bar loaded, exactly as the page does. */
function freshGame() {
  const g = G.newGame();
  const t = G.loadTool(g, 'bar12', 55);
  if (!t.ok) throw new Error('loadTool refused: ' + JSON.stringify(t));
  return g;
}

/* ══════════════════════════════════════════════════════════════════════════
   CASE 1 — ACCEPTED. The path that always worked, kept as the control.
   ══════════════════════════════════════════════════════════════════════════ */
function caseAccepted() {
  const g = freshGame();
  const rr = G.roughTo(g, { target_dia_mm: roughTargetFor(g),
    bite_mm: ROUGH_BITE_MM, feed_mm_rev: ROUGH_FEED_MM_REV, vc: 120 });
  ok('1 rough(g) returns ok', rr.ok === true, `ok=${rr.ok} passes=${rr.passes.length} ` +
     `dia=${g.part.holeDia_cold_mm.toFixed(6)}`);

  const vRough = G.inspect(g);
  ok('1 after roughing the bore is still UNDERSIZE',
     vRough.verdict === 'UNDERSIZE — can still be cut',
     `${vRough.verdict}, under_um=${vRough.under_um.toFixed(2)}`);

  /* A real player's finishing move: dial 10 µm and cut, repeatedly, until the
     gauge says in-spec. This is the move the UI offers — no auto-stepping. */
  let cuts = 0;
  for (; cuts < 200; cuts++) {
    if (G.inspect(g).inSpec) break;
    const r = G.cutOnce(g, { bite_mm: 0.010, feed_mm_rev: ROUGH_FEED_MM_REV, vc: 120, label: 'bored' });
    if (!r.ok) { ok('1 finish cut is never refused', false, `pass ${cuts}: ${r.why} — ${r.detail || ''}`); break; }
  }
  const v = G.inspect(g);
  eq('1 inspect() is ACCEPTED before ship', v.verdict, 'ACCEPTED',
     `dia=${v.dia.toFixed(6)} position_in_band_um=${v.position_in_band_um.toFixed(2)}`);

  const s = G.ship(g);
  eq('1 outcome', s.outcome, 'ACCEPTED');
  eq('1 disposition', s.disposition, 'SEND');
  eq('1 state', s.state, 'RACK');
  eq('1 fee', s.fee, 0);
  near('1 money is +1850', g.money, RATE, 1e-9, `(paid ${s.paid}, fee ${s.fee}, late ${s.late})`);
  ok('1 the part is on the rack', G.rackParts(g).length === 1 &&
     G.rackParts(g)[0].disposition === 'SEND',
     JSON.stringify(G.rackParts(g).map((p) => p.id + '/' + p.state + '/' + p.disposition)));
}

/* ══════════════════════════════════════════════════════════════════════════
   CASE 2 — REWORK. THE WHOLE POINT OF ROUND 10A.

   This is the branch that was dead code. The player roughs, decides the part
   is good enough, and takes it OFF THE MACHINE while it is still undersize.
   Before the flip this path was unreachable twice over: the classifier called
   it SCRAP, and the stock guard made the oversize input that it DID call
   RECOVERABLE impossible to produce.
   ══════════════════════════════════════════════════════════════════════════ */
function caseRework() {
  const g = freshGame();
  const rr = G.roughTo(g, { target_dia_mm: roughTargetFor(g),
    bite_mm: ROUGH_BITE_MM, feed_mm_rev: ROUGH_FEED_MM_REV, vc: 120 });
  ok('2 rough(g) returns ok', rr.ok === true, `passes=${rr.passes.length}`);

  /* ── SHIP IMMEDIATELY, STILL UNDERSIZE, NO FINISH PASS ─────────────────── */
  const vBefore = G.inspect(g);
  ok('2 the bore is undersize at the moment of shipping',
     vBefore.under_um > 0 && !vBefore.inSpec,
     `under_um=${vBefore.under_um.toFixed(3)} verdict="${vBefore.verdict}"`);

  const s = G.ship(g);
  ok('2 ship() accepts a mounted, live part that is off-spec', s.ok !== false,
     `ok=${s.ok} outcome=${s.outcome}`);
  eq('2 outcome', s.outcome, 'RECOVERABLE');
  eq('2 disposition', s.disposition, 'REWORK');
  eq('2 state', s.state, 'RACK');
  near('2 fee = rate * 0.35 = 647.5', s.fee, REWORK_FEE_EXPECTED, 1e-9,
       `(rate ${RATE})`);
  ok('2 the why string states there is material left to remove',
     /still material to remove/.test(String(s.why || '')),
     JSON.stringify(s.why));
  ok('2 under_um > 0 on the shipped part', s.under_um > 0, `under_um=${s.under_um.toFixed(3)}`);

  const racked = G.rackParts(g);
  eq('2 the REWORK part is physically on the rack', racked.length, 1);
  eq('2 racked disposition', racked[0] ? racked[0].disposition : null, 'REWORK');

  /* ── THE RECOVERY. This is Round 9's system becoming real gameplay. ────── */
  const before = g.charges.length;
  const mb = G.mountBlank(g, { reason: 'REWORK' });
  ok('2 mountBlank({reason:"REWORK"}) is accepted', mb.ok === true,
     JSON.stringify(mb.ok === true ? { mins: mb.cost.minutes, cost: mb.cost.cost } : mb));
  const ch = g.charges[g.charges.length - 1];
  ok('2 chargeRecovery pushed a charge', g.charges.length === before + 1,
     `${before} -> ${g.charges.length}`);
  eq('2 charge kind', ch ? ch.kind : null, 'BLANK — RE-SETUP');
  near('2 the recovery costs £60', ch ? ch.fee : NaN, 60, 1e-9,
       '(blank_cost 42 + remount_cost 18, from world.mjs CHARGES)');
  near('2 the recovery costs 13.5 min', mb.ok ? mb.cost.minutes : NaN, 13.5, 1e-9,
       '(blank_min 1.5 + setup_min 12)');
  eq('2 mountBlank reports the re-setup kind', mb.ok ? mb.cost.kind : null, 'BLANK — RE-SETUP');

  const reworkEntries = g.part_register.filter((p) => p.disposition === 'REWORK');
  eq('2 part_register carries the REWORK entry', reworkEntries.length, 1,
     JSON.stringify(g.part_register.map((p) => p.id + '/' + p.state + '/' + p.disposition)));

  /* ── CASE 4 — the courier can actually COLLECT a REWORK part ───────────── */
  const r2 = freshGame();
  G.roughTo(r2, { target_dia_mm: roughTargetFor(r2), bite_mm: ROUGH_BITE_MM,
                  feed_mm_rev: ROUGH_FEED_MM_REV, vc: 120 });
  const s2 = G.ship(r2);
  eq('4 the part racked for collection is REWORK', s2.disposition, 'REWORK');
  ok('4 collectable() sees the REWORK part as collectable',
     G.collectableParts(r2).length === 1,
     JSON.stringify(G.collectableParts(r2).map((p) => p.id + '/' + p.disposition)));

  /* ── 4a. THE TWO QUESTIONS MUST HAVE TWO ANSWERS ─────────────────────────
     "Will the van take it?" and "does delivering it fulfil Halvorsen's
     requirement?" are different questions. Round 10A addendum 1 forbids one
     helper answering both. Asserted as a PROPERTY OF THE FUNCTIONS, not just
     of this one run: the REWORK part is collectable AND the delivery does not
     satisfy. */
  const rackedRework = G.collectableParts(r2)[0];
  ok('4a collectable(REWORK part) is TRUE', G.collectable(rackedRework) === true,
     JSON.stringify(rackedRework && rackedRework.disposition));
  ok('4a doesDeliverySatisfyDependency(REWORK part) is FALSE',
     G.doesDeliverySatisfyDependency(rackedRework) === false,
     'undersize by construction — it does not fit, so the pump line stays down');
  ok('4a the two helpers DISAGREE on the same part (they are different facts)',
     G.collectable(rackedRework) !== G.doesDeliverySatisfyDependency(rackedRework),
     'collectable=true, satisfies=false');
  ok('4a they are not the same function object',
     G.collectable !== G.doesDeliverySatisfyDependency, 'distinct exports, distinct bodies');

  /* Drive the clock to the van's departure with a legal verb, then let it go. */
  const toGo = G.departsMin(r2.job) - r2.clock_min;
  if (toGo > 0) G.warmUp(r2, toGo);
  const d = G.courierDepart(r2);
  ok('4 courierDepart() collects the REWORK part', d.ok === true && !!d.loaded,
     `ok=${d.ok} loaded=${d.loaded ? d.loaded.id + '/' + d.loaded.disposition : null}`);

  /* ── 4b. THE DEPENDENCY IS *NOT* SATISFIED. This line used to assert
     SATISFIED and was WRONG on the contract's own written terms. The contract
     ("a housing THAT FITS") is what decides this, not convenience. ────────── */
  eq('4b dependency is UNFULFILLED — an undersize housing does not fit',
     d.dependency, 'UNFULFILLED',
     'the van left with something, and the pump line is STILL down');
  ok('4b dependency is NOT satisfied', d.dependency !== 'SATISFIED',
     JSON.stringify(d.dependency));

  /* ── 4c. THE PRE-COLLECTION FACT SURVIVES THE MUTATION ───────────────────
     `loaded.disposition` is relabelled 'SHIPPED' before the return, so the
     page CANNOT recover which kind of part went out from `loaded`. This is
     why `collected_disposition` exists, and it is asserted here directly. */
  eq('4c loaded.disposition is relabelled SHIPPED (the trap)',
     d.loaded ? d.loaded.disposition : null, 'SHIPPED',
     'proof the object itself no longer carries the fact');
  eq('4c collected_disposition preserves the pre-collection fact',
     d.collected_disposition, 'REWORK',
     'read BEFORE the mutation; this is what the page must branch on');
  ok('4c the two disagree, so branching on loaded.disposition would be WRONG',
     d.collected_disposition !== d.loaded.disposition,
     `collected_disposition=${d.collected_disposition} vs loaded.disposition=${d.loaded.disposition}`);

  /* ── 4d. THE NARRATION TAKES THE REWORK PATH — asserted on the PRODUCED
     STRING, and specifically chosen so it FAILS on the shipped-before-fix
     code. There are TWO producers of rework narration and BOTH were checked
     against commit 0f05bf5 to make sure this test is not vacuous:

       (a) game.mjs's `d.line` — the log line. This one already branched on a
           pre-mutation read in 0f05bf5, so these two assertions alone would
           pass on the old code and are NOT sufficient evidence.
       (b) index.html's toast/say narration, which computed its own
           `const rework = d.loaded.disposition === 'REWORK'` — ALWAYS FALSE.
           That branch is genuinely dead in 0f05bf5 and is caught by 4e below,
           not by these.

     Asserting only (a) would have been the defect the addendum warned about:
     a test that passes while the branch it is meant to prove is dead. ────── */
  ok('4d the departure line does NOT claim the pump line can be built',
     !/pump line can be built/.test(String(d.line || '')),
     JSON.stringify(d.line));
  ok('4d the departure line says the customer finishes the bore themselves',
     /finishes the bore themselves/.test(String(d.line || '')),
     JSON.stringify(d.line));
  ok('4d the departure line says the pump line is STILL DOWN',
     /pump line is still down/.test(String(d.line || '')),
     JSON.stringify(d.line));

  /* ── 4e. THE PAGE BRANCH ITSELF — the one that shipped DEAD. The narration
     lives in index.html, which this file cannot import (it is a page, not a
     module). So the branch is asserted structurally against the page source:
     the dead predicate must be GONE and the live one must be PRESENT.

     NOTE the comment-stripping. The first version of this assertion matched
     the PROSE explaining the dead predicate rather than the predicate, and
     "failed" on correct code. A source-level assertion has to look at code. */
  if (PAGE_SRC !== null) {
    const PAGE_CODE = PAGE_SRC
      .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (keep `https://`)
    ok('4e index.html no longer tests the ALWAYS-FALSE predicate',
       !/d\.loaded\.disposition\s*===\s*'REWORK'/.test(PAGE_CODE),
       "d.loaded.disposition === 'REWORK' is dead: the object is relabelled SHIPPED");
    ok('4e index.html branches on collected_disposition',
       /d\.collected_disposition\s*===\s*'REWORK'/.test(PAGE_CODE),
       'the pre-collection fact the driver actually saw');
    /* Prove the dead predicate genuinely cannot hold, rather than asserting
       its absence on faith: reconstruct both sides of the comparison. */
    const deadPredicate = d.loaded ? d.loaded.disposition === 'REWORK' : false;
    ok('4e the dead predicate evaluates FALSE while the live one is TRUE',
       deadPredicate === false && d.collected_disposition === 'REWORK',
       `dead=${deadPredicate}, live=${d.collected_disposition === 'REWORK'}`);
  } else {
    ok('4e index.html source readable', false, 'index.html not found — narration branch UNVERIFIED');
  }

  eq('4 the collected part left the rack as SHIPPED',
     d.loaded ? d.loaded.disposition : null, 'SHIPPED');
  eq('4 nothing is left blocking a rack slot', G.rackParts(r2).length, 0,
     JSON.stringify(G.rackParts(r2).map((p) => p.id)));

  /* ── 4f. A CONFORMING PART IS THE CONTROL: same code path, opposite
     answers. Without this, 4b/4d could be satisfied by breaking SEND too. ── */
  const r3 = freshGame();
  G.roughTo(r3, { target_dia_mm: roughTargetFor(r3), bite_mm: ROUGH_BITE_MM,
                  feed_mm_rev: ROUGH_FEED_MM_REV, vc: 120 });
  for (let i = 0; i < 200; i++) {
    if (G.inspect(r3).inSpec) break;
    G.cutOnce(r3, { bite_mm: 0.010, feed_mm_rev: ROUGH_FEED_MM_REV, vc: 120, label: 'bored' });
  }
  const s3 = G.ship(r3);
  eq('4f control: the in-spec part is racked SEND', s3.disposition, 'SEND');
  /* Assert collectable on the part WHILE IT IS ON THE RACK — after collection
     it is relabelled SHIPPED and is no longer a collectable rack item at all,
     so asking afterwards tests nothing about the pre-collection fact. */
  ok('4f control: the in-spec racked part is collectable',
     G.collectableParts(r3).length === 1 &&
     G.collectable(G.collectableParts(r3)[0]) === true,
     JSON.stringify(G.collectableParts(r3).map((p) => p.disposition)));
  ok('4f control: an in-spec racked part ALREADY satisfies the dependency',
     G.doesDeliverySatisfyDependency(G.collectableParts(r3)[0]) === true,
     'a housing that fits — the delivery does fulfil the requirement');
  const toGo3 = G.departsMin(r3.job) - r3.clock_min;
  if (toGo3 > 0) G.warmUp(r3, toGo3);
  const d3 = G.courierDepart(r3);
  eq('4f control: collected_disposition is SEND', d3.collected_disposition, 'SEND');
  eq('4f control: dependency IS satisfied by a housing that fits',
     d3.dependency, 'SATISFIED');
  ok('4f control: the line says the pump line can be built',
     /pump line can be built/.test(String(d3.line || '')), JSON.stringify(d3.line));
  ok('4f control: the same two questions give the SEND part a YES on both',
     G.doesDeliverySatisfyDependency(d3.loaded) === true &&
     d3.dependency === 'SATISFIED',
     'collectable=true (on the rack) and satisfies=true — distinct facts that ' +
     'happen to agree here and DISAGREE on the rework part in 4a/4b');
}

/* ══════════════════════════════════════════════════════════════════════════
   CASE 3 — SCRAP. THE HONEST GAP.

   Oversize is now the DEAD state: a bore can only be made larger by cutting,
   so metal past the top of the band is metal nobody can put back. The
   classifier's oversize branch is correct and Round 10A proves it below —
   BUT IT IS STILL NOT REACHABLE BY A PLAYER, and this test does not pretend
   otherwise.

   The reason is unchanged by Round 10A, and Round 10A deliberately did not
   touch it: `cutOnce`'s `NO STOCK` guard refuses any bite that would carry
   the HOT radius past `band_high_mm / 2`, and `inspect()` scores the COLD
   diameter, so `over_um` can never exceed zero through the verbs. Removing
   that guard is Round 10B and was explicitly deferred by the design lead:

     "I would NOT remove the stock guard in that same commit...
      First correct truth. Then decide whether INDUSTRIA's machine is allowed
      to protect the player from destroying the part."

   So: the assertion below EXHAUSTS THE VERBS FIRST and reports what the guard
   actually does, and only then checks the classifier's arithmetic on an
   oversize verdict object — labelled as such, in the output, not smuggled in.
   ══════════════════════════════════════════════════════════════════════════ */
function caseScrap() {
  /* Try, through the verbs, to oversize the bore. Four dial settings — the
     player's own choice in the UI — at three machine thermal states, because
     the guard compares in the HOT frame and a hot machine is the one place a
     free micrometre could come from. If ANY of these carries the cold diameter
     past band_high_mm, the branch is reachable and this test says so. */
  const STRATEGIES = [
    ['10 µm (the finishing move)', 0.010],
    ['50 µm', 0.050],
    ['100 µm', 0.100],
    ['400 µm (the deepest dial)', 0.400],
  ];
  const results = [];
  let overshot = false, noStock = 0, otherWhy = null;

  for (const [label, bite_mm] of STRATEGIES) {
    for (const warm_min of [0, 60, 300]) {
      const g = freshGame();
      if (warm_min) G.warmUp(g, warm_min);          // a legal verb: run the spindle
      G.roughTo(g, { target_dia_mm: g.job.band_high_mm - 0.080,
                     bite_mm: ROUGH_BITE_MM, feed_mm_rev: ROUGH_FEED_MM_REV, vc: 120 });
      let refusal = null, over = false;
      for (let i = 0; i < 300; i++) {
        const v = G.inspect(g);
        if (v.over_um > 0) { over = true; break; }
        if (v.inSpec) break;
        const r = G.cutOnce(g, { bite_mm, feed_mm_rev: ROUGH_FEED_MM_REV, vc: 120, label: 'bored' });
        if (!r.ok) { refusal = r; break; }
      }
      const v = G.inspect(g);
      if (over) overshot = true;
      if (refusal && refusal.why === 'NO STOCK') noStock++;
      if (refusal && refusal.why !== 'NO STOCK') otherWhy = refusal.why;
      results.push(`${label} warm ${String(warm_min).padStart(3)} min -> ` +
        `dia ${v.dia.toFixed(6)} over_um ${v.over_um.toFixed(3)} ` +
        `${over ? 'OVERSIZE' : v.inSpec ? 'in spec' : 'refused: ' + (refusal ? refusal.why : '?')}`);
    }
  }

  /* THE MEASURED FACT, reported either way — no claim outruns its evidence. */
  const reachable = overshot;
  ok('3 oversize is reachable through the verbs',
     reachable,
     reachable
       ? 'REACHABLE — the guard let a cold diameter past band_high_mm.'
       : `NOT REACHABLE BY A PLAYER. 12 attempted strategies (4 dial settings x 3 ` +
         `thermal states), 0 produced over_um > 0; ${noStock} of them were stopped by ` +
         `the NO STOCK guard${otherWhy ? `, and one by ${otherWhy}` : ' and none by any other interlock'}. ` +
         `The guard is INTACT BY DESIGN — Round 10B decides whether it becomes a warning/override. ` +
         `Full evidence: ${results.join(' | ')}`);

  /* CASE 3 IS EXPECTED TO FAIL ITS OWN REACHABILITY ASSERTION while the guard
     stands. That is not a broken test and it must not be silently tolerated:
     the run stays non-zero so nobody mistakes "documented gap" for "pass".
     The line below is what a future round flips. */
  if (!reachable) {
    ok('3 the guard is still the thing blocking it (named, not assumed)',
       noStock > 0,
       `${noStock}/12 strategies refused by name; the refusal text itself is Round 10B's job ` +
       `("That is not a pass, that is scrap." must be deleted).`);
  }

  /* ── THE CLASSIFIER'S ARITHMETIC, on a verdict the GUARD prevents a player
     from producing. This is a unit assertion and it is labelled as one: it
     proves the oversize branch is correctly wired AFTER the flip, it does NOT
     prove a player can reach it. Case 3's first assertion above is the
     reachability claim, and it is the one that fails. ───────────────────── */
  const forced = G.classifyOffMachine({ inSpec: false, under_um: 0, over_um: 12.4,
                                        verdict: 'OVERSIZE — SCRAP' });
  eq('[unit, NOT a reachability claim] oversize classifies as SCRAP', forced.outcome, 'SCRAP');
  eq('[unit] the scrapped part goes to the BIN', forced.state, 'BIN');
  eq('[unit] with disposition SCRAP', forced.disposition, 'SCRAP');
  ok('[unit] and the why says the bore cannot be made SMALLER',
     /cannot be made smaller/.test(String(forced.why)), JSON.stringify(forced.why));
}

/* ══════════════════════════════════════════════════════════════════════════
   CASE 5 — the direction is not stated backwards anywhere the player reads it.
   Cheap, and it is the exact defect Round 10A exists to remove.
   ══════════════════════════════════════════════════════════════════════════ */
function caseDirection() {
  const g = freshGame();
  const v = G.inspect(g);   // Ø36 as-found: far under the Ø40 low limit
  eq('5 an undersize bore reads "can still be cut"', v.verdict, 'UNDERSIZE — can still be cut');
  eq('5 an undersize part is NOT called scrap', /SCRAP/.test(v.verdict), false, v.verdict);

  const cls = G.classifyOffMachine(v);
  eq('5 undersize classifies as RECOVERABLE', cls.outcome, 'RECOVERABLE');
  eq('5 undersize is racked for REWORK', cls.disposition, 'REWORK');
  ok('5 undersize is never said to be unrepairable by cutting',
     !/cannot be made larger/.test(String(cls.why)), JSON.stringify(cls.why));
}

/* ══════════════════════════════════════════════════════════════════════════
   RUN
   ══════════════════════════════════════════════════════════════════════════ */
const CASES = [
  ['1  ACCEPTED', caseAccepted],
  ['2  REWORK  (the branch that was dead code)', caseRework],
  ['3  SCRAP   (expected to be guard-blocked — see the note)', caseScrap],
  ['5  direction is not stated backwards', caseDirection],
];

for (const [name, fn] of CASES) {
  try { fn(); }
  catch (err) { fail++; rows.push([name + ' — threw', 'FAIL', String(err && err.stack || err)]); }
}

const w = Math.max(...rows.map((r) => r[0].length));
for (const [name, status, detail] of rows) {
  console.log(`${status.padEnd(4)}  ${name.padEnd(w)}  ${detail}`);
}
console.log('');
console.log(`PASS  ${pass} passed, ${fail} failed, ${pass + fail} total`);
console.log('reachability is asserted through the shipped verbs; the SCRAP case states its own gap.');
process.exit(fail ? 1 : 0);
