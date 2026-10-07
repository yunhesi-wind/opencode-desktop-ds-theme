const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const asar = require('@electron/asar');
const { archiveInfo, unpackedHashes, verifyAsset, replaceArchive, unpackOptions } = require('../deploy.cjs');

test('fixed CSS does not rewrite native button borders, icon sizes or descendant backgrounds', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'theme-fixed.css'), 'utf8');
  assert.doesNotMatch(css, /button\s*(?::hover)?\s*\{/);
  assert.doesNotMatch(css, /#root\s*>\s*div\s*\*/);
  assert.doesNotMatch(css, /\b(?:padding|margin|border-radius)\s*:/);
  assert.match(css, /--v2-text-text-base:\s*#e8eef8/);
});

test('menus and sticky session toolbar have an opaque-enough glass backdrop', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'theme-fixed.css'), 'utf8');
  assert.match(css, /\[data-component="menu-v2-content"\]/);
  assert.match(css, /\[data-session-title\]\s*>\s*\.pointer-events-auto/);
  assert.match(css, /backdrop-filter:\s*blur\(28px\)/);
  assert.match(css, /\[data-slot="titlebar-v2"\]\s*\{\s*background: transparent !important/);
  assert.match(css, /background: rgba\(7, 16, 31, 0\.58\) !important/);
  assert.match(css, /:not\(\[data-titlebar-tab\] \*\)/);
});

test('question, permission and dialog surfaces cover legacy white surface tokens without rewriting layout', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'theme-fixed.css'), 'utf8');
  assert.match(css, /--surface-raised-stronger-non-alpha: var\(--theme-glass-floating\)/);
  for (const selector of ['[data-dock-surface="shell"]', '[data-dock-surface="tray"]',
    '[data-component="dialog-v2"] [data-slot="dialog-container"]', '[data-component="select-v2-content"]',
    '[data-component="popover-content"]', '[data-component="hover-card-content"]']) {
    assert.ok(css.includes(selector), 'Missing floating surface: ' + selector);
  }
  assert.match(css, /\[data-slot="question-option"\]\[data-picked="true"\]/);
  assert.doesNotMatch(css, /\[data-component="dialog-v2"\]\s*\{/);
});

test('floating and code surfaces use stronger transparency without clearing diff-row highlights', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'theme-fixed.css'), 'utf8');
  assert.match(css, /--theme-glass-floating: rgba\(12, 23, 42, 0\.48\)/);
  assert.match(css, /--theme-glass-code: rgba\(10, 20, 36, 0\.32\)/);
  assert.match(css, /\[data-component="markdown"\] pre/);
  assert.doesNotMatch(css, /\[data-component="diff"\].*\{/);
  assert.doesNotMatch(css, /pre\s+\*\s*\{/);
});

test('summary and desktop nested menus share a readable dark-glass surface while docks stay transparent', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'theme-fixed.css'), 'utf8');
  assert.match(css, /--theme-glass-menu: rgba\(12, 23, 42, 0\.60\)/);
  for (const selector of ['menu-v2-content', 'context-menu-sub-content', 'dropdown-menu-sub-content', 'select-v2-content']) {
    assert.ok(css.includes(':root body [data-component="' + selector + '"]'));
  }
  assert.match(css, /\[role="listbox"\]/);
  assert.match(css, /:root body \.session-summary-popover,/);
  assert.match(css, /:has\(\[data-component="timeline-detail-control"\]\)/);
  assert.match(css, /background: var\(--theme-glass-menu\) !important/);
  assert.match(css, /--theme-glass-floating: rgba\(12, 23, 42, 0\.48\)/);
});

test('native caption patch only changes symbol colors and rejects unknown layouts', () => {
  const { fixCaptionColors } = require('../deploy.cjs');
  const code = 'function A9(e,t){return{color:`#00000000`,symbolColor:e===`dark`?`white`:`black`,height:44}}';
  assert.equal(fixCaptionColors(code), code.replace('symbolColor:e===`dark`?`white`:`black`', 'symbolColor:`#d8e5f6`'));
  assert.throws(() => fixCaptionColors('unknown version'), /Unsupported/);
});

test('sent message glass bubble is scoped and uses contrasting dark text', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'theme-fixed.css'), 'utf8');
  assert.match(css, /\[data-component="user-message"\]:not\(\[data-pending\]\) \[data-slot="user-message-text"\]/);
  assert.match(css, /background: rgba\(229, 233, 239, 0\.62\) !important/);
  assert.match(css, /color: #182334 !important/);
});

test('revision upgrades accept only known themes and never accept an unknown application version', () => {
  const { resolveExpectedCurrent } = require('../deploy.cjs');
  const m = { originalHash: 'clean', themedHash: 'new-theme', acceptedThemedHashes: ['old-theme'] };
  assert.equal(resolveExpectedCurrent(m, 'clean', false), 'clean');
  assert.equal(resolveExpectedCurrent(m, 'old-theme', false), 'old-theme');
  assert.equal(resolveExpectedCurrent(m, 'old-theme', true), 'old-theme');
  assert.throws(() => resolveExpectedCurrent(m, 'unknown-update', false), /differs/);
  assert.throws(() => resolveExpectedCurrent(m, 'unknown-update', true), /differs/);
});

const temp = process.env.OPENCODE_TEST_TEMP || path.join(os.tmpdir(), 'opencode-theme-tests');
fs.mkdirSync(temp, { recursive: true });
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

test('preset video passes size and SHA-256 validation', { skip: !fs.existsSync(path.join(__dirname, '..', 'assets', 'zipzip-1080p.mp4')) }, () => {
  verifyAsset(path.join(__dirname, '..', 'assets', 'zipzip-1080p.mp4'));
});

test('missing and corrupt assets are rejected', () => {
  const root = fs.mkdtempSync(path.join(temp, 'safe-theme-test-'));
  try {
    assert.throws(() => verifyAsset(path.join(root, 'missing.mp4')), /missing|mismatch/);
    const bad = path.join(root, 'bad.mp4');
    fs.writeFileSync(bad, Buffer.alloc(11418597));
    assert.throws(() => verifyAsset(bad), /mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unpack patterns handle zero, one and multiple native files', () => {
  assert.deepEqual(unpackOptions([]), { dot: true });
  assert.equal(unpackOptions(['fake.node']).unpack, '**/fake.node');
  assert.equal(unpackOptions(['a.node', 'b.dll']).unpack, '{**/a.node,**/b.dll}');
  assert.throws(() => unpackOptions(['bad*.node']), /Unsupported/);
});

test('repacking preserves both native and auxiliary unpacked files byte-for-byte', async () => {
  const root = fs.mkdtempSync(path.join(temp, 'safe-native-test-'));
  try {
    const src = path.join(root, 'source');
    fs.mkdirSync(path.join(src, 'native'), { recursive: true });
    fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ version: '2.0.24' }));
    fs.writeFileSync(path.join(src, 'native', 'fake.node'), 'not executable; test data');
    fs.writeFileSync(path.join(src, 'native', 'helper.js'), 'fixture helper data');
    fs.writeFileSync(path.join(src, 'packed.js'), 'packed fixture data');
    const names = ['native/fake.node', 'native/helper.js'];
    const original = path.join(root, 'original.asar');
    const patched = path.join(root, 'patched.asar');
    await asar.createPackageWithOptions(src, original, unpackOptions(names));
    const info = archiveInfo(original);
    assert.deepEqual(info.files.filter((f) => f.unpacked).map((f) => f.name), names);
    const extracted = path.join(root, 'extracted');
    asar.extractAll(original, extracted);
    await asar.createPackageWithOptions(extracted, patched, unpackOptions(names));
    assert.deepEqual(unpackedHashes(patched, archiveInfo(patched).files), unpackedHashes(original, info.files));
    assert.deepEqual(asar.extractFile(original, 'packed.js'), asar.extractFile(patched, 'packed.js'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a changed target is rejected without writing or leaving a staging file', () => {
  const root = fs.mkdtempSync(path.join(temp, 'safe-replace-test-'));
  try {
    const target = path.join(root, 'app.asar');
    const source = path.join(root, 'replacement.asar');
    fs.writeFileSync(target, 'newer application version');
    fs.writeFileSync(source, 'theme prepared for older version');
    const before = hash(target);
    assert.throws(() => replaceArchive(source, target, 'outdated hash', hash(source)), /changed/);
    assert.equal(hash(target), before);
    assert.deepEqual(fs.readdirSync(root).sort(), ['app.asar', 'replacement.asar']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
