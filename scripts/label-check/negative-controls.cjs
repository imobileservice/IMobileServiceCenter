/*
 * Proves the virtual check can actually FAIL.
 *
 * Each control temporarily reintroduces one real bug, runs check-labels, and expects
 * a failure. A control that still "passes" means the check is blind to that bug, and
 * a green check-labels run would be meaningless. Restores the source either way.
 *
 *   npm run check:labels:controls
 *
 * Recorded result: controls A and B are caught. Control C is NOT - which is the point:
 * it disproved the theory that a page-sized label block emits blank pages. Blank
 * stickers on the roll come from the printer driver, not from this HTML.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src/lib/labels/label-sheet.ts');
const original = fs.readFileSync(SRC, 'utf8');

const controls = [
  {
    name: 'BUG A: page size back to 50x25mm (the original wrong size)',
    patch: s => s.replace('export const LABEL_W_MM = 38', 'export const LABEL_W_MM = 50'),
    expectFailContains: '38 x 25',
  },
  {
    name: 'BUG B: barcode rendered as text only (no bars) - the original defect',
    patch: s => s.replace(/<div class="bars">\$\{svgCache\[prod\.barcode \|\| ''\] \|\| ''\}<\/div>/,
                          '<div class="bars"></div>'),
    expectFailContains: 'vector rectangles',
  },
  {
    name: 'BUG C: label box exactly page-sized (theory: causes blank stickers)',
    patch: s => s.replace('export const LABEL_SAFE_H_MM = 24.4', 'export const LABEL_SAFE_H_MM = 25')
                 .replace('export const LABEL_SAFE_W_MM = 37.4', 'export const LABEL_SAFE_W_MM = 38'),
    expectFailContains: 'page count',
    knownNotCaught: 'Expected: this control does NOT fail. It disproves the theory - '
      + 'Chrome does not emit blank pages for a page-sized block.',
  },
];

let blind = 0;
for (const c of controls) {
  fs.writeFileSync(SRC, c.patch(original));
  let out = '', failed = false;
  try {
    out = execFileSync(process.execPath, [__dirname + '/check-labels.cjs', '3'],
      { cwd: __dirname, encoding: 'utf8' });
  } catch (e) {
    failed = true;
    out = (e.stdout || '') + (e.stderr || '');
  }
  const caught = failed && out.includes(c.expectFailContains) &&
                 out.split('\n').some(l => l.includes('FAIL') && l.includes(c.expectFailContains));
  console.log(`\n${'='.repeat(70)}\n${c.name}`);
  console.log(out.split('\n').filter(l => /PASS|FAIL|CHECK/.test(l)).join('\n'));
  if (c.knownNotCaught) {
    console.log(caught
      ? '  => UNEXPECTED: this now fails; the recorded finding needs revisiting.'
      : '  => AS RECORDED: ' + c.knownNotCaught);
  } else {
    console.log(caught ? '  => GOOD: the check caught this bug.'
                       : '  => BLIND SPOT: the check did NOT catch this bug!');
    if (!caught) blind++;
  }
}

fs.writeFileSync(SRC, original);
console.log(`\n${'='.repeat(70)}`);
console.log(blind === 0
  ? 'Every bug the check claims to cover is genuinely caught. Source restored.'
  : `${blind} bug(s) slip past the check. Source restored.`);
