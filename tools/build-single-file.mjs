#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   build-single-file.mjs — bake the whole game into one .html you can
   double-click.

   WHY THIS EXISTS
   ───────────────
   Measured 2026-09-11: opening index.html from disk in Chrome gives a
   *blank page*. `window.INDUSTRIA` never exists. The title line still
   renders, so it looks alive, but nothing else runs. The console says:

     Access to script at 'file:///…/vendor/three/three.module.min.js' from
     origin 'null' has been blocked by CORS policy

   ES modules are always fetched with CORS, and a file:// document has the
   opaque origin `null`, so every module import is refused. This is not a
   bug in the game and it cannot be fixed by changing the game: a game
   authored as ES modules simply cannot run from disk, and asking a
   playtester to start a web server is how you get zero playtesters.

   WHAT IT DOES
   ────────────
   The import graph is trivial — verified, one occurrence each:

     three.module.min.js   (self-contained, imports nothing)
     kernel.mjs            (self-contained)
     game.mjs              -> kernel.mjs
     world.mjs             (self-contained)
     people.mjs            (self-contained)
     audio.mjs             (self-contained)
     recorder.mjs          (self-contained)
     index.html            -> all seven

   So: embed each module as a string in the output, mint a blob: URL for
   each in dependency order, rewrite the import specifiers to those blob
   URLs, and load the result with dynamic import(). Blob URLs are
   same-origin with the document that created them, so the import is
   allowed where the file:// fetch was not.

   The rewrite is asserted, not assumed: if a specifier does not appear
   exactly once, or appears in a context that is not an import, this
   refuses to emit. A silent no-op substitution here would produce a
   bundle that loads and then fails somewhere unrelated, which is the
   failure mode this project has already paid for twice.

   Usage:  node tools/build-single-file.mjs [outfile]
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'INDUSTRIA-single-file.html');

const die = (msg) => { console.error(`REFUSING TO EMIT: ${msg}`); process.exit(1); };
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── the modules, in dependency order ─────────────────────────────────────
   `entry: true` means the module is imported by the page's own bootstrap
   rather than by another module. */
const MODULES = [
  { id: 'three',    file: 'vendor/three/three.module.min.js', deps: [] },
  { id: 'kernel',   file: 'kernel.mjs',   deps: [] },
  /* THE BUSINESS DEPENDS ON NOTHING AT ALL — not three.js, not the kernel. It
     is the one module in the build with no inputs but its arguments, which is
     what lets `shop.test.mjs` run it headless with no browser and no scene. */
  { id: 'shop',     file: 'shop.mjs',     deps: [] },
  { id: 'world',    file: 'world.mjs',    deps: [] },
  /* MATERIALS DEPENDS ON THREE AND NOTHING ELSE, and it is deliberately last
     in the physics chain: it draws surfaces and holds no constant. If this
     module ever needs to know what a bore is, the seam has been broken. */
  { id: 'materials', file: 'materials.mjs', deps: [['./vendor/three/three.module.min.js', 'three']] },
  /* WORLD IS A DEPENDENCY OF GAME, AND THAT IS THE POINT OF ROUND 9.
     The part lifecycle — the crate, the rack, the bin, the courier — has ONE
     definition and it lives in world.mjs. `game.mjs` reads the shop's
     constants and the job's own booked slot from there instead of keeping a
     second copy of 10:30. A second copy of one fact is the exact failure
     this project has already shipped once, in the two independent
     derivations of "which limit binds". */
  { id: 'game',     file: 'game.mjs',     deps: [['./kernel.mjs', 'kernel'],
                                                 ['./world.mjs', 'world']] },
  { id: 'people',   file: 'people.mjs',   deps: [] },
  { id: 'audio',    file: 'audio.mjs',    deps: [] },
  { id: 'recorder', file: 'recorder.mjs', deps: [] },
];

const blobs = {}; // id -> the identifier used inside the generated bootstrap

for (const m of MODULES) {
  let src = read(m.file);

  for (const [spec, dep] of m.deps) {
    const needle = `from '${spec}'`;
    const hits = src.split(needle).length - 1;
    if (hits !== 1) die(`${m.file}: expected exactly 1 × \`${needle}\`, found ${hits}`);
    const line = src.split('\n').find((l) => l.includes(needle));
    // Only rewrite when the match sits on an import statement. The replacement
    // is built by CONCATENATION, never as a template literal in this file:
    // writing a money-brace inside a template here is how the first build
    // silently emitted the wrong thing.
    if (!/^\s*import\b/.test(line)) die(`${m.file}: \`${needle}\` is not on an import line: ${line}`);
    src = src.replace(needle, "from __URLS__." + dep);
  }

  // Any import left over is a specifier nobody declared — refuse rather than
  // ship a bundle that dies at an unrelated place.
  const leftover = [...src.matchAll(/^\s*import\b[^\n]*from\s+['"]([^'"]+)['"]/gm)].map((x) => x[1]);
  if (leftover.length) die(`${m.file}: undeclared import specifier(s): ${leftover.join(', ')}`);

  blobs[m.id] = src;
}

/* ── the page: everything from <script type="module"> onward is ours ──────
   index.html is one file whose module script holds the whole app. Take the
   document up to that script, then re-enter it with our bootstrap. */
const page = read('index.html');
const OPEN = '<script type="module">';
const at = page.indexOf(OPEN);
if (at < 0) die('index.html: no <script type="module"> found');
const head = page.slice(0, at);

const appBody = page.slice(at + OPEN.length);
const close = appBody.lastIndexOf('</script>');
if (close < 0) die('index.html: module script is never closed');
let app = appBody.slice(0, close);

/* Point the app's own imports at the blob registry.

   These MUST become DYNAMIC imports, and that is not a style choice.
   Static imports are hoisted: they are resolved and evaluated before a single
   statement of this bootstrap runs, so a static `from __URLS__.three` is read
   while `__URLS__` is still in its temporal dead zone. The first build did
   exactly that and died with "Unexpected identifier '$'" — the browser never
   got as far as the registry.

   Dynamic `await import(url)` is evaluated where it is written, i.e. after the
   blobs exist, and it takes a runtime expression rather than a literal. The
   URL is passed as a STRING. */
const APP_IMPORTS = [
  ["import * as THREE from './vendor/three/three.module.min.js';",
   "const THREE = await import(window.__URLS__.three);"],
  ["import * as G from './game.mjs';",
   "const G = await import(window.__URLS__.game);"],
  ["import * as W from './world.mjs';",
   "const W = await import(window.__URLS__.world);"],
  ["import * as K from './kernel.mjs';",
   "const K = await import(window.__URLS__.kernel);"],
  ["import * as P from './people.mjs';",
   "const P = await import(window.__URLS__.people);"],
  ["import { createAudio } from './audio.mjs';",
   "const { createAudio } = await import(window.__URLS__.audio);"],
  ["import { newShop, recordDelivery, offersFor, endOfDay, describeShop, averageClaimError_um, STANDING_OFFERS, unreported, markReported, letterFor, OVERHEAD_PER_DAY, adviseJob } from './shop.mjs';",
   "const { newShop, recordDelivery, offersFor, endOfDay, describeShop, averageClaimError_um, STANDING_OFFERS, unreported, markReported, letterFor } = await import(window.__URLS__.shop);"],
  ["import * as RECmod from './recorder.mjs';",
   "const RECmod = await import(window.__URLS__.recorder);"],
  ["import { shopMaterials, shopEnvironment, tint, keypadPanel, keyAtUV, keyRectUV, KEYPAD, noticePanel, clockFace, consoleScreen, drawingSheet } from './materials.mjs';",
   "const { shopMaterials, shopEnvironment, tint, keypadPanel, keyAtUV, keyRectUV, KEYPAD, noticePanel, clockFace } = await import(window.__URLS__.materials);"],
];
for (const [needle, repl] of APP_IMPORTS) {
  const hits = app.split(needle).length - 1;
  if (hits !== 1) die(`index.html app: expected exactly 1 × \`${needle}\`, found ${hits}`);
  app = app.replace(needle, repl);
}
const appLeftover = [...app.matchAll(/^\s*import\b[^\n]*from\s+['"]([^'"]+)['"]/gm)].map((x) => x[1]);
if (appLeftover.length) die(`index.html app: undeclared import specifier(s): ${appLeftover.join(', ')}`);

/* ── serialise EVERY source as a string literal, the app body included ────
   JSON.stringify gives a correctly escaped double-quoted JS string for any
   input. That matters twice over:

     - three.module.min.js contains backticks and money-braces, so it cannot be
       pasted into a template literal at all;
     - the app body likewise contains template literals with money-braces in its
       own log and message strings.

   An earlier build interpolated the app body straight into this bootstrap's
   template literal. The app's own money-braces were then read as ITS
   interpolations, the generated script stopped parsing, and the page died with
   a bare "Unexpected identifier". Every source now goes in as an escaped
   string, and the app is executed with `new Function` on that string — which
   is a non-module function scope, so its own top-level consts cannot collide
   with this bootstrap's, and its `window.X = ...` assignments still land on
   window exactly as before. */
const registry = Object.entries(blobs)
  .map(([id, src]) => `  ${id}: ${JSON.stringify(src)}`)
  .join(',\n');
const appJson = JSON.stringify(app);

const VERSION = createHash('sha256').update(Object.values(blobs).join('\n')).digest('hex').slice(0, 12);

const boot = `<script type="module">
/* ──────────────────────────────────────────────────────────────────────────
   INDUSTRIA, single-file build — bundle ${VERSION}
   Generated by tools/build-single-file.mjs. Do not edit this file; edit the
   modules and rebuild. Source of truth: index.html + the .mjs modules.
   ────────────────────────────────────────────────────────────────────────── */
const SRC = {
${registry}
};
window.__URLS__ = {};
const __URLS__ = window.__URLS__;
const ORDER = ${JSON.stringify(MODULES.map((m) => m.id))};
const depMap = ${JSON.stringify(Object.fromEntries(MODULES.map((m) => [m.id, m.deps.map(([, d]) => d)])))};

/* Mint in dependency order: every module's deps already have a URL before it
   is turned into a blob, so each "from __URLS__.x" resolves to a real blob URL
   by the time that module is imported. */
for (const id of ORDER) {
  const resolved = SRC[id].replace(/from __URLS__\.([a-z]+)/g, (_, d) => {
    if (!__URLS__[d]) throw new Error('bundle order error: ' + id + ' needs ' + d);
    return 'from "' + __URLS__[d] + '"';
  });
  __URLS__[id] = URL.createObjectURL(new Blob([resolved], { type: 'text/javascript' }));
}

/* Run the app body on its escaped source.

   It used to be inlined raw here, and its own money-braces were read as this
   bootstrap's interpolations. A new Function body cannot contain top-level
   await, and the body starts with dynamic await import, so it is wrapped in an
   async IIFE and that promise is returned. Function scope (not module scope)
   means its top-level consts cannot collide with this bootstrap's, and its
   window.X assignments still land on window exactly as before. */
window.__INDUSTRIA_BUNDLE__ = '${VERSION}';
new Function('return (async () => {\\n' + ${appJson} + '\\n})();')();
</script>`;

/* Stamp the bundle line into the head so the file is self-identifying even
   before the module runs. */
const stamped = head.replace(
  '</head>',
  `<!-- INDUSTRIA single-file bundle ${VERSION} — built from ${MODULES.length} modules -->\n</head>`
);
if (stamped === head) die('index.html: no </head> to stamp');

writeFileSync(OUT, stamped + boot);

/* ── SYNTAX-CHECK BEFORE EMITTING ─────────────────────────────────────────
   The two build failures above (a hoisted static import reading a TDZ const,
   and the app's money-braces being interpolated into this bootstrap) both
   produced a file that looked fine and died in the browser with a one-line
   message and no line number. Emitting a bundle that cannot parse is not a
   thing this script is allowed to do: check it here, where the error has a
   line number and a stack, and delete the bad artifact rather than leave it
   on disk looking shippable. */
try {
  new Function(boot.replace(/^<script type="module">/, '').replace(/<\/script>$/, ''));
} catch (err) {
  rmSync(OUT, { force: true });
  die(`generated bootstrap does not parse — ${err.message}\n  (no bundle written; fix and rebuild)`);
}

const bytes = statSync(OUT).size;
console.log(`wrote ${OUT}`);
console.log(`  bundle ${VERSION}   ${(bytes / 1024).toFixed(0)} KB   ${MODULES.length} modules inlined`);
for (const m of MODULES) console.log(`    ${m.id.padEnd(9)} ${(blobs[m.id].length / 1024).toFixed(0).padStart(5)} KB  ${m.file}`);
