#!/usr/bin/env node
/**
 * shop.test.mjs — the business's own regression, in the same shape as
 * kernel.test.mjs.
 *
 *   node shop.test.mjs
 *
 * Exit 0 = every case passes, 1 = something disagrees.
 *
 * WHAT THIS IS FOR. `shop.mjs` decides what work a client offers, what they pay
 * for it, and how much they think of you afterwards. Every one of those is a
 * rule a player will form a belief about, and a belief formed from a rule that
 * silently changed is worse than no rule at all. So the ordering of the
 * penalties, the direction of the rate curve, and the fact that a burnt client
 * stops calling are asserted here rather than described in a comment.
 *
 *   ORD-*   the ORDER of the penalties — the central design claim
 *   RATE-*  trust is worth money, in the right direction, within bounds
 *   OFFER-* a client's bar, and a client who has gone quiet
 *   CLAIM-* what your own word is worth
 *   CASH-*  the day's overhead lands, and the books balance
 *   PURE-*  no hidden state: the same call twice gives the same answer
 */

import {
  newShop, recordDelivery, offersFor, rateMultiplier, moveStanding, claimStandingDelta,
  endOfDay, describeShop, averageClaimError_um, unreported, markReported, letterFor,
  STANDING_OPEN, STANDING_MAX, STANDING_OFFERS, STANDING_BETTER_WORK,
  STANDING_DELTA, OVERHEAD_PER_DAY,
} from './shop.mjs';
import { JOBS, jobById } from './game.mjs';

let pass = 0, fail = 0;
const rows = [];
const eq = (id, label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  rows.push({ id, label, actual, expected, ok });
  ok ? pass++ : fail++;
};
const ok = (id, label, cond) => eq(id, label, !!cond, true);

const shopWith = (...clients) => newShop({ clients, cash: 1000 });

/* ── ORD-*  THE ORDER OF THE PENALTIES ─────────────────────────────────────
   This is the file's central claim and the thing most likely to be "tidied"
   by somebody who thinks a wrong-size part is the worst thing that can happen.
   It is not. The worst thing is no part. Asserted as an ORDERING so that it
   survives any future re-scaling of the constants. */
ok('ORD-1', 'scrapping costs more than being late',
   STANDING_DELTA.scrapped < STANDING_DELTA.delivered_late);
ok('ORD-2', 'being late costs more than shipping undersize',
   STANDING_DELTA.delivered_late < STANDING_DELTA.delivered_undersize);
ok('ORD-3', 'shipping undersize still costs something',
   STANDING_DELTA.delivered_undersize < 0);
ok('ORD-4', 'delivering on time is the only gain',
   STANDING_DELTA.delivered_on_time > 0);

/* A scrapped part is never described as a delivery, and it never earns the
   trust term — you cannot be trusted about a part you did not make. */
{
  const s = shopWith('acme');
  const e = recordDelivery(s, { client: 'acme', job_id: 'X', nominal_mm: 40, band_um: 16,
    outcome: 'SCRAP', claimed_mm: 40.0005, true_mm: 40.0005 });
  eq('ORD-5', 'a scrap earns no trust credit', e.claim_delta, 0);
  eq('ORD-6', 'a scrap moves the standing by the scrap penalty',
     e.standing_after, moveStanding(STANDING_OPEN, STANDING_DELTA.scrapped));
  eq('ORD-7', 'a scrap is not counted as delivered', s.book.acme.delivered, 0);
  eq('ORD-8', 'a scrap IS counted as scrapped', s.book.acme.scrapped, 1);
}

/* ── RATE-*  TRUST IS WORTH MONEY, IN THE RIGHT DIRECTION ──────────────────
   The economy build spends reputation as an award score; the sign of that
   relationship is the one thing that must survive the port. A shop the client
   trusts gets offered the same work for MORE money, and the curve is bounded
   in both directions so nobody prices their way out of a reputation. */
ok('RATE-1', 'a trusted shop is paid more than an unknown one',
   rateMultiplier(900) > rateMultiplier(STANDING_OPEN));
ok('RATE-2', 'a distrusted shop is paid less than an unknown one',
   rateMultiplier(400) < rateMultiplier(STANDING_OPEN));
ok('RATE-3', 'an unknown shop is paid the going rate',
   Math.abs(rateMultiplier(STANDING_OPEN) - 1) < 1e-9);
ok('RATE-4', 'the multiplier is bounded above', rateMultiplier(1000) <= 1.12);
ok('RATE-5', 'the multiplier is bounded below', rateMultiplier(0) >= 0.88);
ok('RATE-6', 'the rate curve is monotonic across the whole range',
   [0, 200, 400, 600, 800, 1000].every((v, i, a) =>
     i === 0 || rateMultiplier(v) >= rateMultiplier(a[i - 1])));

/* ── OFFER-*  THE BAR, AND THE CLIENT WHO STOPS CALLING ────────────────────*/
{
  const s = shopWith('halvorsen', 'pemberton');
  const jobs = [
    { id: 'A', client_id: 'halvorsen', client: 'Halvorsen', rate: 1000, min_standing: 0 },
    { id: 'B', client_id: 'halvorsen', client: 'Halvorsen', rate: 2000, min_standing: STANDING_BETTER_WORK },
    { id: 'C', client_id: 'pemberton', client: 'Pemberton', rate: 600, min_standing: 0 },
  ];
  let offers = offersFor(s, jobs);
  ok('OFFER-1', 'an unbared job is offered to a new shop', offers[0].offered);
  ok('OFFER-2', 'a bared job is NOT offered yet', !offers[1].offered);
  ok('OFFER-3', 'a refused offer says why', /640|standing/i.test(offers[1].reason));
  ok('OFFER-4', 'the always-available job is always available', offers[2].offered);
  ok('OFFER-5', 'a shop paying the going rate says so', /going rate/i.test(offers[0].reason));

  // earn the bar
  s.book.halvorsen.standing = STANDING_BETTER_WORK;
  offers = offersFor(s, jobs);
  ok('OFFER-6', 'the bared job opens once the bar is met', offers[1].offered);
  ok('OFFER-7', 'and it now pays over the odds', /over the odds/i.test(offers[1].reason));

  // burn them
  s.book.halvorsen.standing = STANDING_OFFERS - 1;
  offers = offersFor(s, jobs);
  ok('OFFER-8', 'a client below the floor offers nothing at all', !offers[0].offered);
  ok('OFFER-9', 'and the board says they have gone quiet', /gone quiet/i.test(offers[0].reason));
  ok('OFFER-10', 'the other client is unaffected', offers[2].offered);
}
/* A job naming a client who is not on the books is a wiring bug, and it must
   present as a refusal rather than as work you cannot be paid for. */
{
  const s = shopWith('halvorsen');
  const raw = offersFor(s, [{ id: 'Z', client_id: 'nobody', client: 'Nobody', rate: 100 }]);
  ok('OFFER-11', 'an unknown client refuses rather than offering', !raw[0].offered);
}

/* ── CLAIM-*  WHAT YOUR OWN WORD IS WORTH ─────────────────────────────────
   The term that is not a port: the shop keeps the error of its own claims, and
   a claim that matches what the customer measures is worth more than a claim
   that does not. The band width is the scale — a tenth of a millimetre is a
   good day on a clearance hole and a catastrophe on a bearing bore. */
/* IN MICROMETRES. These take µm and the first draft of this file passed
   millimetres, so CLAIM-1 "passed" comparing 0.0002 µm to a 3.2 µm threshold —
   a true statement about nothing. The units are in the argument names now and
   `assertMicrometres` throws on a millimetre-shaped value. */
ok('CLAIM-1', 'a claim inside a fifth of the band earns',
   claimStandingDelta(2.0, 2.5, 16).delta > 0);
ok('CLAIM-2', 'a claim past a whole band loses',
   claimStandingDelta(2.0, 25.0, 16).delta < 0);
ok('CLAIM-3', 'the same error is worse on a tighter band',
   claimStandingDelta(2.0, 5.0, 11).delta < claimStandingDelta(2.0, 5.0, 74).delta);
ok('CLAIM-4', 'never measuring is a penalty, not a zero',
   claimStandingDelta(null, 2.0, 16).delta < 0);
ok('CLAIM-5', 'the trust term can never outweigh delivering the part',
   Math.abs(claimStandingDelta(0, 0, 16).delta) < Math.abs(STANDING_DELTA.scrapped));
/* And the guard itself, asserted in the shape it actually defends against:
   the ERROR given in millimetres, which is what anybody computing a difference
   in mm will produce. Asserted here so the guard's coverage is a test result
   rather than a claim in a comment. */
{
  let threw = false;
  try { claimStandingDelta(0.002, 0.0025, 16); } catch (e) { threw = /millimetres/.test(String(e.message)); }
  ok('CLAIM-8', 'an error given in millimetres throws', threw);
  let threw2 = false;
  try { claimStandingDelta(40.0020, 40.0022, 16); } catch (e) { threw2 = true; }
  ok('CLAIM-9', 'the ABSOLUTE size given in millimetres is NOT caught (documented limit)',
     threw2 === false);
}
{
  // a shop whose word is good should be describable as such, and one that has
  // never measured should not be describable at all
  const s = shopWith('acme');
  eq('CLAIM-6', 'a new shop has no measurable claim record', averageClaimError_um(s), null);
  recordDelivery(s, { client: 'acme', job_id: 'A', nominal_mm: 40, band_um: 16,
    outcome: 'ACCEPTED', claimed_mm: 40.0020, true_mm: 40.0025 });
  recordDelivery(s, { client: 'acme', job_id: 'B', nominal_mm: 40, band_um: 16,
    outcome: 'ACCEPTED', claimed_mm: 40.0030, true_mm: 40.0030 });
  ok('CLAIM-7', 'the running claim error is the mean of the two', averageClaimError_um(s) > 0.2 && averageClaimError_um(s) < 0.3);
}

/* ── CASH-*  THE DAY COSTS SOMETHING ──────────────────────────────────────*/
{
  const s = newShop({ clients: ['acme'], cash: 500 });
  const r = endOfDay(s, { day: 1 });
  eq('CASH-1', 'the overhead is charged', r.costs, OVERHEAD_PER_DAY);
  eq('CASH-2', 'and it lands on the balance', s.cash, 500 - OVERHEAD_PER_DAY);
  eq('CASH-3', 'the day advances', s.day, 2);
  ok('CASH-4', 'a shop that ships nothing goes backwards', s.cash < 500);
}

/* ── PURE-*  THE SAME CALL TWICE ──────────────────────────────────────────*/
{
  const a = shopWith('acme');
  const b = shopWith('acme');
  const args = { client: 'acme', job_id: 'A', nominal_mm: 40, band_um: 16,
    outcome: 'ACCEPTED', claimed_mm: 40.0020, true_mm: 40.0022, net: 1850 };
  const ea = recordDelivery(a, args), eb = recordDelivery(b, args);
  eq('PURE-1', 'two shops, same delivery, same standing', ea.standing_after, eb.standing_after);
  eq('PURE-2', 'and the same report', ea.report, eb.report);
  eq('PURE-3', 'and the same delta arithmetic', ea.delivery_delta + ea.claim_delta,
     eb.delivery_delta + eb.claim_delta);
}

/* ── WIRE-*  THE SHOP AND THE JOB SPECS AGREE ─────────────────────────────
   The board is built from `JOBS` by `offersFor`; if a job names a client the
   shop has never heard of, that job silently vanishes from the wall. This is
   the check that catches it, and it is the reason it is here rather than in a
   comment: it is exactly the "a value read from a field that does not exist is
   silent" failure this build keeps producing. */
{
  const ids = [...new Set(JOBS.map((j) => j.client_id).filter(Boolean))];
  /* `ids.length` counts DISTINCT clients — halvorsen has two jobs — so the
     first version of this compared 3 against 4 and reported a wiring fault
     that did not exist. The question is whether any JOB is missing a client. */
  ok('WIRE-1', 'every job names a client', JOBS.every((j) => !!j.client_id));
  const s = newShop({ clients: ids });
  const offers = offersFor(s, JOBS);
  ok('WIRE-2', 'every job on the wall resolves to a client', offers.every((o) => !/No such client/.test(o.reason || '')));
  ok('WIRE-3', 'nothing is offered at a client bar of zero that has no rate',
     offers.filter((o) => o.offered).every((o) => o.rate > 0));
  /* At least one job must be available to a shop with nothing. Called out as a
     test because it is a load-bearing property of the game rather than of the
     model: a board with nothing on it is a stopped game. */
  ok('WIRE-4', 'a brand-new shop always has work', offers.some((o) => o.offered));
  /* And the two gated/better jobs must actually be gated, or the standing is
     decoration. */
  const high = newShop({ clients: ids });
  for (const c of Object.values(high.book)) c.standing = STANDING_MAX;
  const offersHigh = offersFor(high, JOBS);
  ok('WIRE-5', 'a trusted shop is offered at least as much work',
     offersHigh.filter((o) => o.offered).length >= offers.filter((o) => o.offered).length);
  ok('WIRE-6', 'some job on the wall is gated, or standing means nothing',
     JOBS.some((j) => (j.min_standing || 0) > 0));
}

/* ── POST-*  THE MORNING ─────────────────────────────────────────────────
   A delivery comes back as a letter, not as a number that appears the moment
   the part leaves. The letter is where the shop's own claim and the customer's
   measurement share a line, and it is the only place in this build where they
   do. These assertions hold the two properties that make it honest: nothing is
   reported before it is delivered, and reading it cannot change what it says. */
{
  const s = shopWith('acme');
  eq('POST-1', 'a new shop has no post', unreported(s).length, 0);

  recordDelivery(s, { client: 'acme', job_id: 'A1', nominal_mm: 40, band_um: 16,
    outcome: 'ACCEPTED', claimed_mm: 40.0020, true_mm: 40.0022, net: 1850 });
  const p1 = unreported(s);
  eq('POST-2', 'a delivery is waiting to be reported back', p1.length, 1);
  eq('POST-3', 'and it carries the part', p1[0].entries.length, 1);

  const L = letterFor(s, p1[0]);
  eq('POST-4', 'the letter names the job', L.lines[0].job, 'A1');
  ok('POST-5', 'and states what the customer measured', /\+2\.2/.test(L.lines[0].what));
  ok('POST-6', 'and what the shop told them', /you gave us \+2\.0/.test(L.lines[0].said));
  ok('POST-7', 'and whether the two agreed', L.lines[0].agreed === true);
  eq('POST-8', 'and what it was worth', L.lines[0].money, 1850);

  /* A part shipped with no reading says so, and it is not dressed up. */
  recordDelivery(s, { client: 'acme', job_id: 'A2', nominal_mm: 40, band_um: 16,
    outcome: 'ACCEPTED', claimed_mm: null, true_mm: 40.0100, net: 1850 });
  const p2 = unreported(s);
  const L2 = letterFor(s, p2[0]);
  ok('POST-9', 'a part with no reading says the shop gave no figure',
    /no figure/.test(L2.lines[1].said));
  eq('POST-10', 'and cannot agree with anything', L2.lines[1].agreed, false);

  /* READING IT. */
  const n = markReported(s, 'acme', 2);
  eq('POST-11', 'reading closes both', n, 2);
  eq('POST-12', 'and the post is empty afterwards', unreported(s).length, 0);
  /* The record is unchanged by having been read — a letter is not a ledger. */
  const L3 = letterFor(s, { client: 'acme', entries: s.shipper });
  eq('POST-13', 'reading does not alter what was reported', L3.lines.length, 2);
  /* A second delivery to a different client is its own letter. */
  const t = shopWith('acme', 'other');
  recordDelivery(t, { client: 'acme', job_id: 'B1', nominal_mm: 40, band_um: 16, outcome: 'ACCEPTED' });
  recordDelivery(t, { client: 'other', job_id: 'C1', nominal_mm: 52, band_um: 74, outcome: 'SCRAP' });
  eq('POST-14', 'two clients get two letters', unreported(t).length, 2);
  const sc = letterFor(t, unreported(t).find((p) => p.client === 'other'));
  ok('POST-15', 'a scrap says nothing arrived', /Nothing arrived/.test(sc.lines[0].verdict));
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
if (fail === 0) {
  console.log('the shop prices the same failures the machine produces, in the order the trade does');
  console.log(describeShop(shopWith('acme')));
}
process.exit(fail === 0 ? 0 : 1);

