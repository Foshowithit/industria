/* ══════════════════════════════════════════════════════════════════════════
   shop.mjs — the business the machine sits in.

   WHY THIS FILE EXISTS. The build had a machine with consequence and no
   economy: a part was worth £1,850 because a job spec said so, and the next
   job was on a board regardless of what happened to the last one. That is the
   failure the brief names in §108 as *"a machine-control emulator with no
   living world"*, and it is one of the two anti-goals this project is graded
   against.

   WHERE THE MODEL COMES FROM. A separate INDUSTRIA build — the Phase 0–1
   economy architecture at `~/industria`, `packages/sim-core/src/economy/` —
   already contains a tested model of a shop's standing with its customers:
   a reputation integer in [0, 1000] starting at 600, moved by
   `onTime ? +4 : -10` per delivered order (`production.ts`), and spent in
   `rfq.ts` as an award score `total * (1000 + (650 - rep)/2) / 1000` so that a
   client's trust is worth money. This file is that model, ported.

   WHAT WAS CHANGED IN THE PORT, and why — because a port that silently
   re-scales its constants is a port that lies:

     · UNIT OF ACCOUNTING. There, one order is one of many a shop runs in
       parallel across a five-year soak. Here, one job is a whole day of the
       only machine in the building. The deltas are multiplied by ~4.5 so that
       a career of six jobs moves the standing as far as a soak's thousand
       orders move it. The SHAPE is unchanged; only the tick size is.
     · CENTS BECOME POUNDS. The game's job specs price in pounds (`rate: 1850`)
       and its ledger already reads in pounds. Converting to integer cents in
       the page would put two units of account in one build.
     · NO OPEN BIDDING. There is no auction here — one machine, one operator,
       and the client either offers you the work or does not. So the award
       score is spent differently: standing sets the RATE and gates the OFFER,
       which is the same relationship the score encodes (trust is worth money)
       rendered for a market of one.

   AND ONE THING THAT IS NOT A PORT. `claimed_um` below. The original model
   knows whether an order was on time; it has no idea what the shop TOLD the
   customer it was making. This game does, because the whole build is about the
   difference between the number you read off a gauge and the number the part
   actually is. So the shop keeps the running error of its own claims, and a
   shop whose claims match what the customer measures is trusted with tighter
   work. That is the thesis of the game, priced.

   PURE. No DOM, no three.js, no GAME import, no wall clock. Same discipline as
   `kernel.mjs` and `world.mjs`: every function is a function of its arguments,
   so the whole business can be unit-tested headless and the page cannot grow a
   second copy of any of it.

   ADVISORY ONLY. machine_execution = false.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── THE SCALE ─────────────────────────────────────────────────────────────
   Ported from the economy build: reputation is an integer in [0, 1000] and a
   new shop opens at 600. 600 is not "average" and it is not a score out of
   anything — it is the standing a shop has with somebody who has not used it
   yet, and it is deliberately the same for every client so that what moves it
   is only ever what you did. */
export const STANDING_OPEN = 600;
export const STANDING_MAX = 1000;
export const STANDING_MIN = 0;

/* A client who has not been let down. Thresholds sit near the opening value on
 * purpose: the player should be able to lose a client inside one shift, and to
 * earn slightly better work inside one shift, because that is the whole
 * feedback loop and a loop you cannot feel inside a session is not a loop. */
export const STANDING_OFFERS = 520;   // below this, the client stops calling
export const STANDING_BETTER_WORK = 640; // above this, the good work is on offer

/* ── WHAT A DELIVERED PART IS WORTH TO YOUR STANDING ───────────────────────
   THE ORDER OF THESE PENALTIES IS THE DESIGN, so it is worth stating plainly:
   the thing that costs a shop the most is NOT shipping a part that is slightly
   the wrong size. It is not shipping one at all.

   A shop that delivers everything, late and off-size, keeps working. A shop
   whose customer's line goes down on Friday because no part arrived does not.
   That is true of the trade, and it is the opposite of what a player assumes
   when they are staring at a 16 µm band and treating scrap as the only failure
   mode. So scraping is priced worst, and an undersize part that the customer
   can still finish is priced better than a late one — because they got a part.

   These are the economy build's `+4 / -10` moved to this build's tick, as
   described in the header. */
export const STANDING_DELTA = {
  delivered_on_time: 20,      // in spec, on time, and your claim matched
  delivered_late: -35,        // in spec, but the window closed
  delivered_undersize: -18,   // they got a part; they had to finish it themselves
  scrapped: -45,              // they got nothing, and their line is down
};

/** Move a standing by a delta, clamped. Exported because the page shows the
 *  arithmetic and the arithmetic has to be the same one the model used. */
export function moveStanding(standing, delta) {
  return Math.max(STANDING_MIN, Math.min(STANDING_MAX, standing + delta));
}

/* ── THE TRUST TERM ────────────────────────────────────────────────────────
   `claimed_um` is the number you read off the gauge, in micrometres from
   nominal. `true_um` is what the customer measures on their CMM. Their
   difference is not an error you made — it is how much your shop's word is
   worth, and it is the only number in this file that comes from the machine
   rather than from the office.

   A shop that says Ø40.0028 and ships Ø40.0028 is trusted. A shop that shrugs
   is not. The tolerance for that is generous at first and tightens as the work
   gets tighter, because that is how trust works: nobody minds a tenth on a
   bracket, and everybody minds one on a bearing bore. */
/* A GUARD, because the unit here is genuinely easy to get wrong and getting it
 * wrong is silent. This file works in micrometres from nominal; the page holds
 * millimetres. Measured: three assertions in shop.test.mjs were passing or
 * failing for the wrong reason before this existed.
 *
 * WHAT IT CATCHES, exactly, and it is worth being precise because a guard that
 * overstates itself is worse than none:
 *
 *   CAUGHT — the error given in millimetres. `claimStandingDelta(0.002, ...)`
 *   is the mistake anybody computing a difference in mm will make, and a real
 *   claim error in µm is never below a hundredth (that would be a
 *   sub-nanometre claim), so this throws.
 *
 *   NOT CAUGHT — the ABSOLUTE size given in millimetres, `(40.0020, 40.0022)`.
 *   There is no way to tell that from a legitimate 40 µm claim, because it is
 *   numerically identical to one. The defence against that shape is
 *   `recordDelivery`, which is the only caller that should ever be converting,
 *   and which takes mm explicitly in its argument names.
 *
 * The alternative considered and rejected: silently accepting both and
 * guessing. A guess here is a verdict about nothing. */
function assertMicrometres(v, what) {
  if (v === null || v === undefined) return;
  if (!Number.isFinite(v)) throw new Error(`shop: ${what} is not a number: ${v}`);
  if (v !== 0 && Math.abs(v) < 0.01) {
    throw new Error(`shop: ${what} = ${v} — that is millimetres, and ${what} is in micrometres`);
  }
}

export function claimError_um(claimed_um, true_um) {
  if (claimed_um === null || claimed_um === undefined) return null;   // never measured
  if (true_um === null || true_um === undefined) return null;
  return claimed_um - true_um;
}

/** What a claim costs or earns, given how tight the job was. Bounded so this
 *  can never outweigh actually delivering the part — a beautiful record of
 *  claims on a scrapped job is still a scrapped job. */
export function claimStandingDelta(claimed_um, true_um, bandWidth_um) {
  assertMicrometres(claimed_um, 'claimStandingDelta claimed_um');
  assertMicrometres(true_um, 'claimStandingDelta true_um');
  const e = claimError_um(claimed_um, true_um);
  if (e === null) return { delta: -6, note: 'You shipped it without ever measuring it.' };
  const ae = Math.abs(e);
  const band = Math.max(4, bandWidth_um || 16);
  /* One fifth of the band is "you told them the truth". Past a whole band you
     were not reading the instrument, you were guessing, and the client knows. */
  if (ae <= band * 0.2) return { delta: 8, note: `Your reading was ${ae.toFixed(1)} µm out — the figure you gave them held, so they trust it.` };
  if (ae <= band * 0.5) return { delta: 2, note: `Your reading was ${ae.toFixed(1)} µm out. Close enough to be believed.` };
  if (ae <= band) return { delta: -6, note: `Your reading was ${ae.toFixed(1)} µm out. They noticed.` };
  return { delta: -12, note: `Your reading was ${ae.toFixed(1)} µm out — you were not measuring, you were hoping.` };
}

/* ── THE RATE ──────────────────────────────────────────────────────────────
   Trust is worth money. Ported in spirit from the award score, rendered as a
   direct multiplier because there is no auction here to weight.

   The band is deliberately narrow — ±12 %. A shop cannot price its way out of
   a bad reputation and it cannot double its income by being admired; it can
   earn a bit more for the same work, which is what a good supplier actually
   gets. A player who wants more money has to take harder work, which is the
   decision the game wants them making. */
export function rateMultiplier(standing) {
  const t = (standing - STANDING_OPEN) / (STANDING_MAX - STANDING_OPEN);   // -inf..1
  return Math.max(0.88, Math.min(1.12, 1 + t * 0.12));
}

/* ── THE CLIENTS ───────────────────────────────────────────────────────────
   One entry per client on the books, keyed by the id a job spec names. The
   numbers a client keeps are: how they think of you (`standing`), what they
   have had off you (`delivered`, `scrapped`), and the arithmetic of your own
   claims on their work (`claim_n`, `claim_abs_um` — a running mean, so one bad
   morning on one part does not define a supplier and a habit does). */
export function newShop({ cash = 0, clients = [] } = {}) {
  const book = {};
  for (const id of clients) {
    book[id] = {
      id, standing: STANDING_OPEN,
      delivered: 0, late: 0, scrapped: 0, undersize: 0,
      claim_n: 0, claim_abs_um: 0,
      last_report: null,     // { day, text } — the morning's letter, read once
    };
  }
  return {
    cash,
    day: 1,
    book,
    /* Every part this shop has ever let out of the door, in the order it left.
       This is the shop's own record and it is NOT a score — it is the list the
       report is written from and the ledger is totalled from, and if it and
       the rack ever disagreed the rack would be right. */
    shipper: [],
  };
}

/** Fold one settled job into the shop. Returns the deltas so the page can show
 *  the player the arithmetic rather than a verdict. */
export function recordDelivery(shop, {
  client, job_id, nominal_mm, band_um,
  outcome,             // 'ACCEPTED' | 'RECOVERABLE' | 'SCRAP'
  late = false,
  claimed_mm = null,   // the last gauge reading YOU took
  true_mm = null,      // what the customer measures
  net = 0,
  day = null,
} = {}) {
  const c = shop.book[client];
  if (!c) throw new Error(`shop: no client on the books called ${client}`);

  const claimed_um = claimed_mm === null ? null : (claimed_mm - nominal_mm) * 1000;
  const true_um = true_mm === null ? null : (true_mm - nominal_mm) * 1000;

  /* (1) THE DELIVERY ITSELF. The order of these tests is the design — see the
     note on STANDING_DELTA. A scrap outranks everything: the customer's line
     is down and no amount of accurate measuring puts a part in their hands. */
  let kind, delta;
  if (outcome === 'SCRAP') { kind = 'scrapped'; delta = STANDING_DELTA.scrapped; c.scrapped++; }
  else if (outcome === 'RECOVERABLE') { kind = 'undersize'; delta = STANDING_DELTA.delivered_undersize; c.undersize++; }
  else if (late) { kind = 'late'; delta = STANDING_DELTA.delivered_late; c.late++; }
  else { kind = 'on_time'; delta = STANDING_DELTA.delivered_on_time; }
  const delivery_delta = delta;

  /* (2) THE TRUST TERM — only on work that was actually delivered. A shop that
     scrapped the part has nothing to be trusted about, and stacking an honesty
     penalty onto a scrap would be punishing the same mistake twice. */
  let claim = { delta: 0, note: null };
  if (kind !== 'scrapped') {
    claim = claimStandingDelta(claimed_um, true_um, band_um);
    if (claimed_um !== null && true_um !== null) {
      c.claim_n += 1;
      /* A RUNNING MEAN, and the first version of this line was not one: it
         added a fresh average onto the stored average, so two identical 0.5 µm
         errors reported 0.75 instead of 0.5 and the error grew every time a
         piece of work was done well. Caught by CLAIM-7, which is why that test
         asserts a RANGE rather than a sign. */
      c.claim_abs_um += (Math.abs(claimError_um(claimed_um, true_um)) - c.claim_abs_um) / c.claim_n;
    }
  }

  const before = c.standing;
  c.standing = moveStanding(c.standing, delivery_delta + claim.delta);
  if (kind !== 'scrapped') c.delivered++;

  const entry = {
    day: day === null ? shop.day : day,
    client, job_id, outcome, late,
    claimed_um, true_um,
    claim_error_um: claimError_um(claimed_um, true_um),
    kind, net,
    standing_before: before, standing_after: c.standing,
    delivery_delta, claim_delta: claim.delta,
    /* NOT YET REPORTED. The part left on the van this afternoon; what the
       customer measures and what they think of you is a letter that arrives
       with the next morning, not a number that appears the moment the door
       shuts. See `unreported` below. */
    reported: false,
  };
  shop.shipper.push(entry);

  /* (3) WHAT THE CLIENT WRITES BACK. Not a score and not a verdict — the
     numbers, in their voice, so the player can see what the office saw. */
  const width = band_um || 16;
  const measured = true_um === null ? 'no measurement came back'
    : `${true_um >= 0 ? '+' : ''}${true_um.toFixed(1)} µm on a ${width.toFixed(0)} µm band`;
  const said = claimed_um === null ? 'you did not say what you thought it was'
    : `you told them ${claimed_um >= 0 ? '+' : ''}${claimed_um.toFixed(1)} µm`;
  c.last_report = entry;
  entry.report = `${true_um === null ? 'Measured' : 'Their gauge read ' + measured}, and ${said}.` +
    (claim.note ? ' ' + claim.note : '');

  return entry;
}

/* ══ THE SYSTEM AT THE NEXT RUNG ══════════════════════════════════════════
   VISION.md §3: the system advises at EVERY rung, and the seat at the machine is
   only the first. This is the shop rung — which job to take — and it is the same
   kind of object: a claim, its assumptions, and a record the shop keeps.

   AND IT IS WRONG IN A SPECIFIC, TEACHABLE WAY. It maximises what is on the card.
   That is the stated objective and it is not the real one: a shop lives on what
   its clients think of it, and the client who is squeezed on the last job is the
   client who does not call on the next one. So the advice is not a lie — taken
   one job at a time it always pays best TODAY — and a player who follows it for a
   season runs out of clients.

   THAT IS THE FAILURE MODE OF OPTIMISING A STATED OBJECTIVE, which is the thing
   this whole project exists to teach people to notice about models. It is not a
   trap and it is not random: the assumption is printed with the numbers, so a
   player who reads two lines down can see that the recommendation knows nothing
   about what it costs the relationship. */
export function adviseJob(shop, offers) {
  const open = offers.filter((o) => o.offered);
  if (!open.length) return null;
  /* The stated objective, honestly computed: the rate, and nothing else. */
  const pick = open.reduce((a, b) => (b.rate > a.rate ? b : a));
  const c = shop.book[pick.job.client_id];
  return {
    job_id: pick.job.id,
    rate: pick.rate,
    client: pick.job.client,
    /* THE ASSUMPTION, PRINTED. Both of these are true and one of them is the
       whole story: it is the best rate on the board, and what it does to the
       client's opinion of you is not in the model. */
    assumptions: {
      objective: `the best rate on the board — ${pick.rate} today`,
      not_considered: 'what taking it does to the relationship, this week or next',
      standing_now: c ? c.standing : null,
    },
    why: `£${pick.rate} is the most money on the wall today` +
      (c ? `, and ${pick.job.client} is at standing ${c.standing}` : ''),
  };
}

/* ── THE MORNING ───────────────────────────────────────────────────────────
   A shop does not learn what its customer thought of a part when the part
   leaves. It learns the next morning, in writing, from somebody who has had
   the part on a granite plate and a bearing in their hand. Until then the shop
   has a DISPOSITION — its own outgoing inspection, which is an opinion — and
   that is what a verdict actually is from the inside.

   So every delivery comes back. `unreported()` is what is waiting for you when
   you clock on, and it is deliberately computed from the record rather than
   pushed into a queue: a shop cannot lose a letter it has not read, because
   whether it has been read is a property of the entry, not of the post.

   AND THE LETTER IS WHERE YOUR CLAIM AND THEIR MEASUREMENT SHARE A LINE. Nowhere
   else in this build do the number you read off a gauge and the number the
   customer's CMM produced sit next to each other, and that pair is the whole
   subject of the game. It arriving a day late is not a delay mechanic — it is
   what the pair is FOR. You find out whether your word held. */

/** Everything the shop has sent out that nobody has written back about yet,
 *  grouped by client, oldest first. */
export function unreported(shop) {
  const by = new Map();
  for (const e of shop.shipper) {
    if (e.reported) continue;
    if (!by.has(e.client)) by.set(e.client, []);
    by.get(e.client).push(e);
  }
  return [...by.entries()].map(([client, entries]) => ({ client, entries }));
}

/** Mark a client's mail as read. Returns how many were closed. */
export function markReported(shop, client, day = null) {
  let n = 0;
  for (const e of shop.shipper) {
    if (e.client === client && !e.reported) { e.reported = true; n++; }
  }
  const c = shop.book[client];
  if (c) c.last_report_day = day === null ? shop.day : day;
  return n;
}

/** The customer's letter, in their voice, from the record. Numbers first: a
 *  supplier does not need adjectives, they need the measurement and the terms. */
export function letterFor(shop, { client, entries }) {
  const c = shop.book[client];
  const lines = [];
  for (const e of entries) {
    const band = e.band_um || 16;
    const measured = e.true_um === null ? null : e.true_um;
    const claimed = e.claimed_um;
    let verdict;
    if (e.kind === 'scrapped') {
      verdict = `Nothing arrived. Line stopped for ${e.job_id}.`;
    } else if (e.kind === 'undersize') {
      verdict = `Under, and finishable. We reworked it in our own time at cost to you.`;
    } else if (e.kind === 'late') {
      verdict = `In tolerance, past the window we asked for.`;
    } else {
      verdict = `In tolerance, on the day.`;
    }
    lines.push({
      job: e.job_id,
      what: measured === null ? 'not measured by us'
        : `we made ${measured >= 0 ? '+' : ''}${measured.toFixed(1)} µm of a ${band.toFixed(0)} µm band`,
      said: claimed === null ? 'you gave us no figure'
        : `you gave us ${claimed >= 0 ? '+' : ''}${claimed.toFixed(1)} µm`,
      verdict,
      money: e.net,
      agreed: e.claim_error_um !== null && Math.abs(e.claim_error_um) <= band * 0.2,
      out_by: e.claim_error_um,
    });
  }
  return {
    client, entries, lines,
    standing: c ? c.standing : null,
    /* Whether this customer's measurements have ever disagreed with the shop's
       own claims, across everything they have had off it. */
    worth: c && c.claim_n > 0 ? c.claim_abs_um : null,
  };
}

/* ── THE BOARD ─────────────────────────────────────────────────────────────
   What a client is offering, and why — or why not. This REPLACES the idea that
   the board is a list of work that exists independently of the shop: a job is
   on the wall because a client put it there, and a client puts work on your
   wall because of what you did with the last lot.

   `min_standing` on a job spec is the client's bar. A job with no bar is work
   anybody gets offered, and there should always be at least one of those,
   because a shop with no work at all is not a hard game, it is a stopped one. */
export function offersFor(shop, jobs) {
  return jobs.map((job) => {
    const c = shop.book[job.client_id];
    if (!c) return { job, offered: false, reason: 'No such client on the books.', rate: null };
    const mult = rateMultiplier(c.standing);
    const rate = Math.round(job.rate * mult);
    if (c.standing < STANDING_OFFERS) {
      return { job, offered: false, rate: null, standing: c.standing,
        reason: `${job.client} has gone quiet. They have not called since the last one.` };
    }
    const bar = job.min_standing || 0;
    if (c.standing < bar) {
      return { job, offered: false, rate: null, standing: c.standing,
        reason: `${job.client} wants ${bar} standing for this. You are at ${c.standing}.` };
    }
    return { job, offered: true, rate, standing: c.standing, mult,
      reason: mult > 1.005 ? `${job.client} is paying you over the odds.`
        : mult < 0.995 ? `${job.client} is squeezing you.`
        : `${job.client} is paying the going rate.` };
  });
}

/** The shop's own cash position, with the number the player actually needs:
 *  whether the week is going to hurt. Thresholds are the shop's own costs, not
 *  a score — the rent is in `OVERHEAD_PER_DAY` and it does not care how you
 *  did. */
export const OVERHEAD_PER_DAY = 260;

export function endOfDay(shop, { day } = {}) {
  const d = day === null || day === undefined ? shop.day : day;
  const costs = OVERHEAD_PER_DAY;
  shop.cash -= costs;
  shop.day = d + 1;
  return { costs, cash: shop.cash, day: shop.day };
}

/* ── THE ONE-LINE HISTORY ─────────────────────────────────────────────────
   For the board's header and for the ledger screen: what this shop is, in a
   sentence, computed from the record rather than asserted. A shop that has
   shipped nothing is not "reliable" and must not be described as one. */
export function describeShop(shop) {
  const shipped = shop.shipper.filter((e) => e.kind !== 'scrapped').length;
  const n = shop.shipper.length;
  if (n === 0) return 'Nothing has left this shop yet.';
  const clients = Object.values(shop.book).filter((c) => c.delivered + c.scrapped > 0);
  const worst = clients.length ? clients.reduce((a, b) => (b.standing < a.standing ? b : a)) : null;
  const parts = [`${shipped} of ${n} parts delivered`];
  if (worst) parts.push(`worst standing ${worst.id} at ${worst.standing}`);
  const claim = averageClaimError_um(shop);
  if (claim !== null) parts.push(`your word is good to ${claim.toFixed(1)} µm`);
  return parts.join(' · ') + '.';
}

/** How well this shop's claims have held up, across every client, in µm. */
export function averageClaimError_um(shop) {
  let n = 0, sum = 0;
  for (const c of Object.values(shop.book)) {
    if (c.claim_n > 0) { n += c.claim_n; sum += c.claim_abs_um * c.claim_n; }
  }
  return n === 0 ? null : sum / n;
}
