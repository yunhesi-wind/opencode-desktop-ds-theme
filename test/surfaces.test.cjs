const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const { archiveInfo } = require('../deploy.cjs');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'theme-fixed.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];

test('opaque reading token is separate from translucent menu and question surfaces', () => {
  const base = rules.find((rule) => rule[1].trim().endsWith(':root'))[2];
  assert.match(base, /--theme-reading-sticky:\s*#101e33;/);
  assert.match(base, /--surface-raised-stronger-non-alpha:\s*var\(--theme-reading-sticky\);/);
  assert.match(base, /--theme-glass-floating:\s*rgba\(12, 23, 42, 0\.48\);/);
  assert.match(base, /--theme-glass-menu:\s*rgba\(12, 23, 42, 0\.60\);/);
  assert.match(base, /--v2-background-bg-base:\s*transparent;/);
});

test('sticky surfaces only override their native background color token', () => {
  const sticky = rules.filter((rule) => rule[1].includes('[data-component="collapsed-tool-group"]'));
  assert.equal(sticky.length, 1);
  assert.equal(sticky[0][2].trim(), '--v2-background-bg-base: var(--theme-reading-sticky);');
  assert.equal(sticky[0][1].trim(), [
    ':root body [data-component="collapsed-tool-group"] > [data-component="collapsible"].tool-collapsible > [data-slot="collapsible-trigger"][aria-expanded="true"]',
    ':root body :is([data-component="edit-tool"], [data-component="write-tool"], [data-component="apply-patch-tool"]) > [data-component="collapsible"] > [data-slot="collapsible-trigger"]:is([aria-expanded="true"], [data-locked])',
    ':root body [data-component="session-review"] [data-slot="session-review-change-summary"]',
    ':root body [data-component="session-turn"] [data-slot="session-turn-diffs-header"]',
  ].join(',\n'));
  assert.doesNotMatch(css, /\.home-session-group-header/);
});

test('selection menus paint outer surfaces rather than nested semantic listboxes', () => {
  assert.doesNotMatch(css, /\[role=["']?(?:menu|listbox)/);
  const menu = rules.filter((rule) => rule[2].includes('background: var(--theme-glass-menu)'));
  assert.equal(menu.length, 1);
  assert.match(menu[0][1], /\[data-slot="select-v2-content"\]/);
  assert.match(menu[0][1], /\.session-service-menu,/);
  const listbox = rules.filter((rule) => rule[1].includes('[data-slot="select-v2-listbox"]'));
  assert.equal(listbox.length, 1);
  assert.equal(listbox[0][2].trim(), 'scrollbar-color: #627b9e transparent;');
});

const manifestFile = path.join(root, 'prepared', 'manifest.json');
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : undefined;
test('local original confirms native sticky tokens and separate select surface/listbox nodes',
  { skip: !manifest?.snapshot || !fs.existsSync(manifest.snapshot) }, () => {
    const read = (name) => asar.extractFile(manifest.snapshot, name.split('/').join(path.sep)).toString('utf8');
    const files = archiveInfo(manifest.snapshot).files;
    const html = read('out/renderer/index.html');
    const cssFile = /href="\.\/([^" ]+\.css)"/.exec(html)?.[1];
    assert.ok(cssFile);
    const native = read('out/renderer/' + cssFile);
    for (const selector of ['.home-session-group-header:before', '.home-session-group-header:after',
      '[data-slot=list-header]', '[data-slot=session-review-change-summary]', '[data-slot=session-turn-diffs-header]']) {
      const rule = [...native.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((entry) =>
        entry[1].includes(selector) && /background[^;]*(?:--v2-background-bg-base|--surface-raised-stronger-non-alpha)/.test(entry[2]));
      assert.ok(rule, 'Native sticky surface color contract changed: ' + selector);
    }
    const select = files.filter((file) => /^out\/renderer\/assets\/select-.*\.js$/.test(file.name))
      .map((file) => read(file.name)).find((source) => source.includes('`select-v2-listbox`'));
    assert.ok(select);
    assert.ok(select.includes('"data-component":`menu-v2-content`,"data-slot":`select-v2-content`'));
    assert.ok(select.includes('role:`listbox`'));
  });
