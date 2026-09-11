/**
 * people.mjs — who is on the floor, what they say, and what they will not say.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * §40, VERBATIM: "Avoid melodramatic NPC writing. A good line from a senior
 * machinist may teach more than a cutscene."
 * §55, VERBATIM: "A 30-year machinist may teach phenomenal practical knowledge
 * while disliking new CAM strategies."
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * So: Earl is a witness, not an oracle. The KERNEL is the authority. Everything
 * in `EARL_WRONG_ABOUT` below is something a real 30-year machinist genuinely
 * says, that the kernel genuinely disagrees with. That disagreement is not a
 * bug to be patched out of his dialogue — it is the teaching mechanism, and
 * §55 asks for it by name.
 *
 * The cleanest instance is the over-dial walk. Every machinist says some version
 * of "sneak up on it, take a light pass, the bar springs back". That is true and
 * it is also incomplete: the bar does not spring back to where you left it, it
 * springs back to where the DIAL is not — and below about 40 µm the pass removes
 * a roughly constant ~5 µm MORE than the dial claims, whatever the dial says.
 * Earl's advice sends you to a 1 µm bite, which is where the lie is worst (247%
 * of dial). He is not wrong that you should sneak up. He is wrong that the dial
 * tells you how far you moved. The player finds that out on the part.
 *
 * WRITING RULES THIS FILE OBEYS:
 *   · No speeches. No line longer than about two sentences.
 *   · Earl is tired. It is 05:55. He is not here to develop anybody.
 *   · Poor instructions are a DESIGNED FEATURE (§40) — "clean that vise and
 *     bring me the parallels" stays underspecified ON PURPOSE. The gap between
 *     what was said and what was meant is the mechanic.
 *   · But it must be RESOLVABLE: the parallels are findable, and Earl answers
 *     if you ask him properly. Unfair confusion is a bug.
 */

export const PEOPLE_VERSION = '0.1.0';

/* ══════════════════════════════════════════════════════════════════════════════
   §7 — THE FIRST CHOICE IS A JOB BOARD
   ══════════════════════════════════════════════════════════════════════════════
   Rates and requirements are the BRIEF'S OWN NUMBERS, used verbatim. Do not
   invent new ones; they are load-bearing because the first payslip and the
   later scrap charge are computed against them.

   `path` says where a role puts you on the floor. Several of these do not lead
   to a lathe at all, and the brief is explicit that there is no single correct
   career — so a route that has no machine work yet is honest about that rather
   than a dead button.
   ══════════════════════════════════════════════════════════════════════════════ */

export const JOB_BOARD = [
  {
    id: 'helper', title: 'Machine Shop Helper', rate: 20.00,
    requirement: 'no experience required',
    note: 'Days. Sweeping, deburring, chip bin. They will put you on a machine when somebody is off.',
    start: 1,             // first rung of the ladder you actually stand on
    path: 'floor',
  },
  {
    id: 'prod_tech', title: 'Production Technician', rate: 21.00,
    requirement: '—',
    note: 'Load and unload. Same three part numbers all shift. You will get very good at them.',
    path: 'floor',
  },
  {
    id: 'welder', title: 'Welder/Fabricator Trainee', rate: 22.00,
    requirement: '—',
    note: 'Fabrication bay, other end of the building. Hood time.',
    path: 'fab',
  },
  {
    id: 'cnc_op', title: 'CNC Operator I', rate: 23.50,
    requirement: '2nd shift, training available',
    note: 'Starts you at 14:30, not 06:00. You will meet nobody from days.',
    path: 'floor', shift: '2nd',
  },
  {
    id: 'quality', title: 'Quality Technician Trainee', rate: 24.00,
    requirement: 'blueprint experience preferred',
    note: 'CMM room. You will read drawings all day and touch a machine rarely.',
    path: 'quality',
  },
  {
    id: 'toolroom', title: 'Toolroom Apprentice', rate: 25.00,
    requirement: '—',
    note: 'Grinders, jig borer, the good lathe nobody is allowed on.',
    path: 'toolroom',
  },
  {
    id: 'maint', title: 'Maintenance Apprentice', rate: 26.00,
    requirement: 'mechanical aptitude required',
    note: 'You will be inside machines more than in front of them.',
    path: 'maint',
  },
  {
    id: 'automation', title: 'Automation Technician I', rate: 28.00,
    requirement: 'electrical experience preferred',
    note: 'Panels, servos, the ladder logic nobody understands. Highest rate on the board.',
    path: 'automation',
  },
];

/** What the board says when it reads your name off the application. */
export function boardPitch() {
  return [
    'Halvorsen Pumps — 400 W Industrial Row.',
    'Application on file. Openings as of Monday:',
  ];
}

/* ══════════════════════════════════════════════════════════════════════════════
   EARL — 34 years, days, leads the small-parts cell
   ══════════════════════════════════════════════════════════════════════════════ */

export const EARL = {
  name: 'Earl',
  role: 'cell lead, small parts',
  /* His lines are short on purpose. A man at 05:55 with a shift starting does
     not explain things; he points. */
};

/**
 * A line in the world. `when` is a predicate over the world's own state, so
 * dialogue reacts to what actually happened rather than to a script position.
 */
export const EARL_LINES = {
  /* ── ARRIVAL (05:55) ─────────────────────────────────────────────────── */
  arrive: [
    "You're early. Nobody's early.",
    "Glasses. On. You're not going in there without them.",
  ],

  /* ── THE TASK. DELIBERATELY UNDERSPECIFIED (§40) ─────────────────────── */
  /* Do not add detail to this line. The confusion is the mechanic. */
  the_task: [
    "That vise is filthy. Clean it, and bring me the parallels.",
  ],

  /* ── IF YOU ASK, PROPERLY ────────────────────────────────────────────── */
  /* Resolvability: Earl answers. He answers badly at first, because that is
     what asking a busy man a vague question at 06:00 actually gets you — and
     then he answers, because he is good at his job. */
  ask_what_parallels: [
    "Parallels. In the toolroom, third drawer. The flat ones.",
  ],
  ask_what_parallels_again: [
    "Pair of flat bars. You put them in the vise so the part sits on them and not on the swarf.",
    "If you don't know what something is, look at the thing.",
  ],
  ask_where_toolroom: [
    "Through the doors, past the saw. Listen for the grinder.",
  ],
  ask_why_clean: [
    "Because chips under a part make it sit crooked, and then the hole's crooked.",
    "You'll see.",
  ],

  /* ── §55: HE IS ALSO WRONG ABOUT THINGS ──────────────────────────────── */
  /* Says the thing every machinist says. The kernel will disagree. */
  advise_sneak_up: [
    "Don't be a hero. Take a light pass and sneak up on it.",
    "Two thou, measure, two thou, measure. That's how it's done.",
  ],
  /* Shop lore, stated with total confidence, that is not physics. The player
     who trusts his own measurements over this line is the player who passes. */
  lore_dial_is_dimension: [
    "The dial doesn't lie to you. It's the machine that lies.",
  ],
  lore_cold_part: [
    "Measure it cold. Hot part, cold part, half a thou either way.",
  ],
  lore_sharp_insert: [
    "Fresh insert every setup. Dull insert, you fight it all day.",
  ],
  /* He is RIGHT about this one, and the kernel agrees, and it matters. */
  advise_measure_often: [
    "Measure after every pass. I don't care if you're sure.",
  ],

  /* ── WHEN THE PLAYER IS GETTING IT RIGHT ─────────────────────────────── */
  saw_you_measure: [
    "Mm.",
  ],
  saw_you_wrong_tool: [
    "Wrong bar. That one's too long to go in there. It'll sing.",
  ],
  saw_you_dialled_big: [
    "You'll regret that one.",
  ],

  /* ── IMPATIENCE §R2 ──────────────────────────────────────────────────── */
  /* Not a countdown, not a nag. He has his own job. He stops looking up. */
  impatient_1: [
    "You still here?",
  ],
  impatient_2: [
    "I'm not going to stand over you.",
  ],
  impatient_3: [
    "It's ten past. Job's due at half.",
  ],
  /* And if the player wanders off entirely, the WORLD keeps going (§1) — the
     machine finishes its cycle without them and the door opens on its own. */

  /* ── CONSEQUENCE: THE FIRST PART ─────────────────────────────────────── */
  reject_diameter_only: [
    "Diameter's fine. Hole's in the wrong place.",
    "You controlled the size. You didn't control where it went.",
  ],
  approve_first_part: [
    "That'll go.",
    "Put your initials on the traveler.",
  ],
  /* The most important line in the build. Short, and not a compliment. */
  after_first_ship: [
    "You made a part. There's four thousand on the order.",
  ],

  /* ── ROUND 9: THE RACK, AND WHAT HE SAYS ABOUT IT ─────────────────────
     He reacts to OBJECTS, not to a score. Every line below is selected by a
     predicate over what is physically standing in the shop, so the same
     sentence cannot be said in two different worlds. */
  /* The requested blank arrives — and it is the same casting he showed you. */
  second_blank: [
    "Crate's behind you. Same casting, same drawing, same everything.",
    "One thing's different: machine's warm now, and it moved on you once already.",
  ],
  /* Nothing on the rack and 10:30 already happened. He does not shout; the
     morning is simply over and he is the one who has to make the call. */
  courier_missed: [
    "Van's gone.",
    "I'm calling Halvorsen. There's nothing on that rack and their line is down all weekend.",
  ],
  /* A part in the scrap bin is a thing that happened, not a number. */
  scrap_in_bin: [
    "Bin. Don't leave it on the bench, somebody'll pick it up and measure it.",
  ],
  /* A part on the rack and the van not yet in: the good case, said flatly. */
  courier_satisfied: [
    "That's on the rack, so that's off my floor.",
    "Van takes it, we're square. Next one's the same casting.",
  ],
};

/* ══════════════════════════════════════════════════════════════════════════════
   THE OTHER PEOPLE — §1: nobody is waiting for the protagonist
   ══════════════════════════════════════════════════════════════════════════════
   Each of these exists to make the building a building. They do not give tasks.
   They have jobs they are in the middle of.
   ══════════════════════════════════════════════════════════════════════════════ */

export const OTHERS = {
  denise: {
    name: 'Denise', role: 'quality, first shift',
    lines: [
      "Don't bring me anything you haven't measured yourself.",
      "Bring me a number I can write down.",
    ],
  },
  marcus: {
    name: 'Marcus', role: 'setup, nights, leaving',
    lines: [
      "Machine's warm. I ran it all night. It'll move on you for the first hour.",
      "Coolant's a bit low. Not my problem at six.",
    ],
  },
  prairie: {
    name: 'Prairie', role: 'materials handling',
    lines: [ "Forklift's got right of way. That's not a rule, that's just true." ],
  },
  ray: {
    name: 'Ray', role: 'maintenance',
    lines: [ "That beeping's been going since Tuesday. I'll get to it." ],
  },
  /* ── ROUND 9: THE TWO PEOPLE A DEAD PART BECOMES ABOUT ────────────────
     §108's second anti-goal is "a machine-control emulator with no living
     world". A bearing housing that measures small is not an accounting
     event: it is twenty minutes of somebody else's morning in the assembly
     bay, and then a man walking across the shop to tell you about it. This
     is the world's half of the consequence and it is deliberately NOT a
     system — it is two people with jobs. */
  achebe: {
    name: 'Mr. Achebe', role: 'assembly, bench 3',
    /* He says these AT HIS BENCH. The player finds him there, or does not,
       and the machine never reports them. */
    lines: [
      "Forty-millimetre axis. It should drop in.",
      "It is not dropping in.",
    ],
    /* And he comes over. The only person in this game who walks to you. */
    lines_after: [
      "That housing is small. I got the bearing halfway and it stopped.",
      "It's not scrap to me until it's scrap on paper, so tell me what you want to do.",
    ],
  },
  hallam: {
    name: 'Hallam driver', role: 'courier',
    /* He is a van and a timetable. He does not console anybody. */
    lines: [
      "One drop on this ticket. Where is it?",
      "Right. Nothing to load. I'll mark it one short and go.",
    ],
  },
};

/* ══════════════════════════════════════════════════════════════════════════════
   §56 — DOCUMENTATION AS WORLD OBJECTS, AND REVISION CONTROL AS A TRAP
   ══════════════════════════════════════════════════════════════════════════════
   §56: "Good documentation improves organizations. Bad documentation produces
   mistakes."

   THE DRAWING ON THE FLOOR IS THE WRONG REVISION. The traveler taped to the
   machine is current. A part made to the old drawing is scrap, and nobody tells
   you — you find out when quality measures it. This is a real shop failure and
   it teaches revision control by consequence (§2), not by a lesson.
   ══════════════════════════════════════════════════════════════════════════════ */

export const DOCUMENTS = {
  drawing_on_bench: {
    id: 'DWG-4417-C',
    title: 'BEARING HOUSING — HALVORSEN P/N 4417',
    rev: 'C',
    /* Rev C: the OLD revision. Band position differs from the traveler. */
    stale: true,
    nom_mm: 40.000,
    band: 'H7',
    note: 'REV C — superseded. Band shown at H7; rev D closed it to H6.',
    superseded_by: 'DWG-4417-D',
  },
  drawing_correct: {
    id: 'DWG-4417-D',
    title: 'BEARING HOUSING — HALVORSEN P/N 4417',
    rev: 'D',
    stale: false,
    nom_mm: 40.000,
    band: 'H6',
    note: 'CURRENT.',
  },
  traveler: {
    id: 'TRV-88213',
    op: 'OP 40 — BORE Ø40',
    machine: 'VMC-03',
    /* The traveler is CURRENT and it is taped to the machine. §56 in one object:
       the authoritative document is the one attached to the work, and the
       drawing on the bench is a copy that has been out of date since March. */
    rev_required: 'D',
    note: 'USE REV D. Rev C drawings are being pulled — do not use.',
  },
  calibration_sticker: {
    id: 'CAL-2291',
    on: 'Mitutoyo 2-point bore gauge, 25-50 mm',
    calibrated: '2026-04-14',
    due: '2027-04-14',
    note: 'Calibration valid.',
  },
  sop_binder: {
    id: 'SOP-07',
    title: 'Fine boring — setup and first-off',
    last_opened: '2019-08-22',
    note: 'A thin film of dust. Somebody has written "TIGHTEN THE LOCK" in pen on the cover.',
  },
  maintenance_log: {
    id: 'ML-03',
    machine: 'VMC-03',
    entries: [
      { date: '2026-09-02', note: 'Spindle temp alarm at 14:20. Reset, ran fine.' },
      { date: '2026-09-05', note: 'Way lube low. Topped.' },
      { date: '2026-09-08', note: 'Ballscrew comp checked. Within 4 µm over 300 mm.' },
      /* The beep nobody is fixing, with a paper trail that says why. */
      { date: '2026-09-09', note: 'Coolant level sensor intermittent. Part on order.' },
    ],
  },
};

/* ══════════════════════════════════════════════════════════════════════════════
   CONVERSATION — a tiny state machine, not a dialogue tree
   ══════════════════════════════════════════════════════════════════════════════
   §40's anti-goal is a cutscene. So there is no cutscene: speaking to Earl is
   a list of things you can ASK, and most of them get short answers. The
   question the player most needs to ask — "what are parallels" — is available
   from the start, but only if they think to ask it.
   ══════════════════════════════════════════════════════════════════════════════ */

export const EARL_TOPICS = [
  { id: 'parallels', label: '"What are parallels?"', lines: 'ask_what_parallels',
    repeat: 'ask_what_parallels_again' },
  { id: 'where', label: '"Where\'s the toolroom?"', lines: 'ask_where_toolroom' },
  { id: 'why', label: '"Why does it matter if it\'s clean?"', lines: 'ask_why_clean' },
  { id: 'how', label: '"How do I cut it?"', lines: 'advise_sneak_up' },
  { id: 'done', label: '"I think it\'s good."', lines: 'approve_first_part' },
];

/** Pick the right line for a topic, given how many times it has been asked. */
export function earlReply(topic, times_asked = 0) {
  if (topic.id === 'parallels' && times_asked > 0) {
    return [...(EARL_LINES[topic.repeat] ?? EARL_LINES[topic.lines])];
  }
  if (topic.id === 'done') return [...(EARL_LINES[topic.lines] ?? [])];
  return [...(EARL_LINES[topic.lines] ?? [])];
}

/* ══════════════════════════════════════════════════════════════════════════
   ROUND 9 — THE ONE SENTENCE THIS ROUND IS ALLOWED TO PUT IN HIS MOUTH
   ══════════════════════════════════════════════════════════════════════════
   There is exactly one line here and it is deliberately the weakest possible
   form of help, because the alternative was measured and rejected.

   THE PROBLEM IT FIXES, and it is the round's second named defect: a refused
   command used to leave the game state byte-identical to never having tried
   it. That is correct — the interlock rejects an impossible move before any
   metal moves, so zero metal and zero machine consequence is the physics.
   The design lead's ruling is explicit that the fix is NOT a penalty (an
   invented machine-damage cost is exactly the unsupported mechanic this
   project has been policing), and that what must be solved is the FREE
   ORACLE: the player could ask the machine any question at all, as many
   times as they liked, and get a perfectly accurate answer — a load-meter
   number for a move they had not made and were not going to make.

   The real interlock is a HARDWARE limit. An axis drive does not answer an
   interrogative, it feeds back and it faults. So the feedback is now shut
   behind a decision the player has already made: the machine will tell you
   what a move cost, and it will not tell you what a move WOULD cost. The
   second and later attempts at the same refused move each cost the drive
   another minute of trouble-shooting — and the FIRST one is free, because a
   machinist who trips an interlock once has learned something real and
   should not be charged for it.

   The evidence gate that used to guard this number has been retired WITH the
   exploit it guarded: there is no percentage to leak, because the meter no
   longer reports a hypothetical. See the note beside it in index.html. */

/** A refused move, as a drive sees it. `n` counts how many times this exact
 *  move has already been asked for in this session. */
export const REFUSAL_MIN = 1;

export function refusalMinutes(n) {
  return n <= 0 ? 0 : REFUSAL_MIN * n;
}

/** Where the number came from, in plain words, put on the screen once — at
 *  the moment the player first asks a question the machine cannot answer. */
export const REFUSAL_WHY =
  "A load meter reads a CUT. Servos feed back, they do not answer questions — " +
  "there is nothing to read until the command is out. Asking for a move the " +
  "machine will refuse costs the drive a minute of trouble-shooting, each time.";

/** Impatience, keyed to MINUTES LATE rather than to a nag timer. A man does not
 *  get impatient on a schedule; he gets impatient when the job is late. */
export function earlImpatience(minutes_idle, minutes_to_deadline) {
  if (minutes_idle > 14 || minutes_to_deadline < 20) return EARL_LINES.impatient_3;
  if (minutes_idle > 7) return EARL_LINES.impatient_2;
  if (minutes_idle > 3) return EARL_LINES.impatient_1;
  return null;
}
