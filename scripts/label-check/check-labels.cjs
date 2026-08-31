/*
 * Virtual print check for the 38 x 25 mm thermal barcode labels.
 *
 * Bundles the app's REAL label-sheet builder (src/lib/labels/label-sheet.ts),
 * renders it in headless Chrome, prints to PDF, then asserts on the PDF itself:
 *   - every page is exactly 38 x 25 mm  (catches a wrong @page size)
 *   - page count === label count        (catches blank pages between stickers)
 *   - each page contains vector bars    (catches "barcode printed as text only")
 *
 *   npm run check:labels          # assert
 *   npm run check:labels -- 10    # 10 copies of the first product
 *   npm run check:labels:proof    # magnified PNG of the stickers to eyeball
 *
 * This validates the HTML/geometry the browser sends. It cannot validate the
 * Windows driver stock size or the printer's own gap calibration - only a real
 * sheet of stickers can do that.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const HERE = __dirname;
const PROJECT = path.resolve(HERE, '../..');
const OUT = path.join(HERE, '.out');
const MM_PER_PT = 25.4 / 72;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  // Windows (the shop PC)
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  // macOS / Linux (dev machines)
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const CHROME = CHROME_CANDIDATES.find(p => p && fs.existsSync(p));
if (!CHROME) {
  console.error('Could not find Chrome or Edge. Looked in:\n  ' + CHROME_CANDIDATES.join('\n  '));
  process.exit(2);
}

const proofMode = process.argv.includes('--proof');
const qty = parseInt(process.argv.slice(2).find(a => /^\d+$/.test(a)) || '3', 10);
// The harness adds 2 extra distinct products, plus 3 per-phone-model stickers
// for one multi-fit display (same barcode, different printed model name).
const expectedLabels = qty + 2 + 3;

fs.mkdirSync(OUT, { recursive: true });

// ---- 1. bundle the real module -------------------------------------------------
const bundle = path.join(OUT, 'harness.js');
execFileSync(process.execPath, [
  path.join(PROJECT, 'node_modules/esbuild/bin/esbuild'),
  path.join(HERE, 'harness-entry.ts'),
  '--bundle', '--format=iife', '--platform=browser',
  `--alias:@=${path.join(PROJECT, 'src')}`,
  `--outfile=${bundle}`,
], { cwd: HERE, stdio: 'pipe' });

const page = path.join(OUT, 'harness.html');
fs.writeFileSync(page, `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>` +
  `<script src="harness.js"></script></body></html>`);
const pageUrl = `file:///${page.replace(/\\/g, '/')}`;

// ---- 2a. proof mode: magnified screenshot for a human ---------------------------
if (proofMode) {
  const png = path.join(OUT, 'proof.png');
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--screenshot=${png}`, '--window-size=1000,1400',
    `${pageUrl}?qty=1&view=proof`,
  ], { stdio: 'pipe', timeout: 60000 });
  console.log('\n  Magnified sticker proof written to:\n  ' + png +
    '\n  Red outline = physical 38x25mm sticker edge, blue dashes = safe area.\n');
  process.exit(0);
}

// ---- 2b. render + print to PDF in real Chrome -----------------------------------
const pdf = path.join(OUT, 'labels.pdf');
if (fs.existsSync(pdf)) fs.unlinkSync(pdf);
execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox',
  '--no-pdf-header-footer',
  `--print-to-pdf=${pdf}`,
  `${pageUrl}?qty=${qty}&mode=thermal`,
], { stdio: 'pipe', timeout: 60000 });

const raw = fs.readFileSync(pdf).toString('latin1');

// ---- 3. assert on the produced PDF ---------------------------------------------
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass, detail });

const boxes = [...raw.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)]
  .map(m => ({ w: (+m[3] - +m[1]) * MM_PER_PT, h: (+m[4] - +m[2]) * MM_PER_PT }));
const pageCount = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;

ok('page count === label count', pageCount === expectedLabels,
  `${pageCount} pages for ${expectedLabels} labels`);

ok('every page is 38 x 25 mm',
  boxes.length > 0 && boxes.every(b => Math.abs(b.w - 38) < 0.6 && Math.abs(b.h - 25) < 0.6),
  boxes.length ? boxes.map(b => `${b.w.toFixed(1)}x${b.h.toFixed(1)}`).join(', ') : 'no MediaBox found');

let vectorOps = 0, textShows = 0;
for (const m of raw.matchAll(/stream\r?\n/g)) {
  const start = m.index + m[0].length;
  const end = raw.indexOf('endstream', start);
  if (end < 0) continue;
  let content;
  try { content = zlib.inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1'); }
  catch { continue; }
  vectorOps += (content.match(/\bre\b[\s\S]{0,12}?\bf\b/g) || []).length;
  textShows += (content.match(/\bT[jJ]\b/g) || []).length;
}
ok('bars are drawn as vector rectangles', vectorOps >= expectedLabels * 20,
  `${vectorOps} filled rects (need >= ${expectedLabels * 20})`);
ok('text is present too (shop name / code / price)', textShows > 0,
  `${textShows} text-show ops`);

// ---- 4. report ------------------------------------------------------------------
console.log(`\n  Virtual print check - ${expectedLabels} labels, thermal mode`);
console.log(`  PDF: ${pdf}\n`);
for (const r of results) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`);
}
const failed = results.filter(r => !r.pass).length;
console.log(`\n  ${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'}\n`);
process.exit(failed === 0 ? 0 : 1);
