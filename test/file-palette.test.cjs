const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const { archiveInfo } = require('../deploy.cjs');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'theme-fixed.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const targets = [
  ':root[data-color-scheme="dark"] body [data-component="file"]',
  ':root[data-color-scheme="dark"] body [data-component="file"] diffs-container',
];

test('file palette only uses four scoped color hooks in native dark mode', () => {
  const matches = rules.filter((rule) => rule[2].includes('--opencode-diffs-bg:'));
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0][1].split(',').map((value) => value.trim()), targets);
  const declarations = Object.fromEntries(matches[0][2].split(';').filter((value) => value.trim())
    .map((value) => value.trim().split(/:\s*/)));
  assert.deepEqual(declarations, {
    '--opencode-diffs-bg': '#101e33', '--v2-text-text-faint': '#9aafc9',
    '--surface-warning-base': '#b9985b', '--surface-warning-strong': '#d2a35a',
  });
  for (const rule of rules.filter((rule) => /--surface-warning-(?:base|strong)\s*:/.test(rule[2]))) {
    assert.equal(rule[1], matches[0][1], 'Search colors must not recolor other warning UI');
  }
  assert.doesNotMatch(css, /--diffs-[\w-]+\s*:|\[data-(?:line|code|gutter|diff-span)\]|::(?:selection|highlight)\s*\(/);
});

function rgb(hex) {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
}
function luminance(color) {
  return color.map((value) => value / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('word emphasis stays readable on dark surfaces in both native scheme branches', () => {
  const matches = rules.filter((rule) => /--v2-(?:green|red)-1200\s*:/.test(rule[2]));
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0][1].split(',').map((value) => value.trim()), [
    ':root body [data-component="file"]', ':root body [data-component="file"] diffs-container',
  ]);
  const declarations = Object.fromEntries(matches[0][2].split(';').filter((value) => value.trim())
    .map((value) => value.trim().split(/:\s*/)));
  assert.deepEqual(declarations, { '--v2-green-1200': '#d9f7e4', '--v2-red-1200': '#ffe0da' });
  // Reference composites use the verified 2.0.32 red/green palette and native alphas,
  // including the underlying changed-row fill. This is not arbitrary syntax-token coverage.
  for (const backing of ['#101e33', '#18263e']) {
    for (const [line, lineAlpha, emphasis, emphasisAlpha, foreground] of [
      ['#49c970', 0.05, '#49c970', 0.2, '#d9f7e4'],
      ['#f1484f', 0.05, '#f1484f', 0.2, '#ffe0da'],
      ['#198b43', 0.1, '#49c970', 0.4, '#e8eef8'],
      ['#f1484f', 0.1, '#f1484f', 0.4, '#e8eef8'],
    ]) {
      const row = rgb(line).map((value, index) => value * lineAlpha + rgb(backing)[index] * (1 - lineAlpha));
      const fill = rgb(emphasis).map((value, index) => value * emphasisAlpha + row[index] * (1 - emphasisAlpha));
      assert.ok(contrast(rgb(foreground), fill) >= 4.5, 'Word emphasis contrast too low');
    }
  }
});

test('file backing, line numbers and ordinary text on search fills have readable reference contrast', () => {
  const backing = rgb('#101e33');
  assert.ok(contrast(rgb('#9aafc9'), backing) >= 4.5);
  for (const [color, alpha] of [['#b9985b', 0.35], ['#d2a35a', 0.55]]) {
    const fill = rgb(color).map((value, index) => value * alpha + backing[index] * (1 - alpha));
    assert.ok(contrast(rgb('#e8eef8'), fill) >= 4.5);
  }
  // This does not establish contrast for every native syntax token or combined diff highlight.
});

const manifestPath = path.join(root, 'prepared', 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : undefined;
const snapshot = manifest?.snapshot;
test('local native renderer supports the paint bridge while retaining selection and search rules',
  { skip: !snapshot || !fs.existsSync(snapshot) }, () => {
    const entries = archiveInfo(snapshot).files.filter((file) => /^out\/renderer\/assets\/file-.*\.js$/.test(file.name));
    const native = entries.map((file) => asar.extractFile(snapshot, file.name.split('/').join(path.sep)).toString('utf8'))
      .find((source) => source.includes('--opencode-diffs-bg'));
    assert.ok(native, 'Native file renderer background hook changed; re-audit before preparing');
    for (const hook of ['var(--opencode-diffs-bg, var(--color-background-stronger))',
      '--diffs-fg-number-override: var(--v2-text-text-faint)',
      '::highlight(opencode-find)', '::highlight(opencode-find-current)',
      'var(--surface-warning-base) r g b / 0.35', 'var(--surface-warning-strong) r g b / 0.55',
      '--diffs-selection-base: var(--v2-background-bg-accent)',
      '--diffs-bg-addition-emphasis-override', '--diffs-bg-deletion-emphasis-override',
      'color: light-dark(var(--v2-green-1200), var(--v2-text-text-base)) !important',
      'color: light-dark(var(--v2-red-1200), var(--v2-text-text-base)) !important']) {
      assert.ok(native.includes(hook), 'Native renderer contract changed: ' + hook);
    }
    const html = asar.extractFile(snapshot, path.join('out', 'renderer', 'index.html')).toString('utf8');
    const stylesheet = /href="\.\/([^" ]+\.css)"/.exec(html)?.[1];
    assert.ok(stylesheet);
    const palette = asar.extractFile(snapshot, path.join('out', 'renderer', ...stylesheet.split('/'))).toString('utf8');
    for (const color of ['--v2-green-600:#49c970', '--v2-red-600:#f1484f', '--v2-green-800:#198b43']) {
      assert.ok(palette.includes(color), 'Native emphasis reference palette changed: ' + color);
    }
  });
