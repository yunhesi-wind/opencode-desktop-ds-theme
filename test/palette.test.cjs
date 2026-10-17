const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'theme.css'), 'utf8')
  .replace(/\r\n?/g, '\n') // Windows Git checkouts may use CRLF; compare CSS, not line endings.
  .replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector) {
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .find((match) => match[1].trim() === selector);
  assert.ok(rule, 'Missing rule: ' + selector);
  return rule[2];
}

const root = block(':root[data-theme][data-color-scheme],\n:root[data-color-scheme],\n:root');
function token(name, source = root) {
  const value = new RegExp(name + ':\\s*([^;]+);').exec(source)?.[1];
  assert.ok(value, 'Missing color: ' + name);
  return value;
}
function rgb(hex) {
  assert.match(hex, /^#[a-f\d]{6}$/i);
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}
function luminance(color) {
  const linear = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('selected questions use a local dark color token without replacing native state rules', () => {
  const selected = token('--v2-question-answer-bg-selected',
    block(':root body [data-component="dock-prompt"][data-kind="question"]'));
  assert.ok(contrast(rgb(selected), rgb(token('--v2-text-text-base'))) >= 4.5);
  assert.doesNotMatch(css, /\[data-slot="question-option"\]|\[data-picked/);
  assert.doesNotMatch(css, /color-scheme\s*:/);
});

test('scrollbar colors preserve native state selectors and shadow-tree auto-hide hooks', () => {
  const thumb = block(':root body .scroll-view__thumb');
  assert.match(thumb, /--border-weak-base:\s*#627b9e/);
  assert.match(thumb, /--border-strong-base:\s*#a5bfe2/);
  assert.ok(luminance(rgb(token('--border-strong-base', thumb))) >
    luminance(rgb(token('--border-weak-base', thumb))));
  assert.match(block(':root body file-tree-container'), /--trees-scrollbar-thumb-override:\s*#627b9e/);
  assert.doesNotMatch(css, /--trees-scrollbar-thumb-current|::-webkit-scrollbar|scrollbar-width\s*:/);
  assert.doesNotMatch(css, /\.scroll-view__thumb[^{}]*(?::hover|data-dragging|data-visible)/);
  assert.doesNotMatch(css, /ghostty|xterm|--diffs-/);
});

test('legacy surfaces, real icon names and hover-pressed pairs have coordinated colors', () => {
  for (const name of ['--surface-base', '--surface-base-hover', '--surface-base-active',
    '--surface-raised-base', '--surface-raised-base-hover', '--surface-raised-base-active',
    '--surface-float-base', '--input-active', '--input-selected', '--input-disabled',
    '--icon-weak-base', '--icon-strong-base', '--border-focus', '--v2-border-border-focus',
    '--v2-text-text-accent-hover', '--v2-text-text-code-path', '--syntax-property', '--syntax-constant']) {
    token(name);
  }
  assert.notEqual(token('--v2-overlay-simple-overlay-hover'), token('--v2-overlay-simple-overlay-pressed'));
  assert.notEqual(token('--icon-strong-base'), token('--icon-strong-disabled'));
});

test('verified native overflow containers get scrollbar paint without global or hidden-scrollbar overrides', () => {
  const expected = [
    '[data-component="menu-v2-content"][data-slot="select-v2-content"] [data-slot="select-v2-listbox"]',
    '.session-service-menu', '.directory-picker-browser', '.ssh-prompt', '.settings-nav-groups',
    '.settings-mobile-menu[data-component="menu-v2-content"]', '.settings-provider-account-list',
    '.settings-wsl-distro-list', '.settings-wsl-catalog-list',
    '[data-component="line-comment-v2"][data-variant="editor"] [data-slot="line-comment-v2-mention-list"]',
    '[data-component="line-comment"] [data-slot="line-comment-mention-list"]',
    '[data-slot="message-nav-hovercard-content"]', '[data-component="session-turn"] .error-card',
    '[data-component="card"][data-kind="tool-error-card"] [data-slot="tool-error-card-subtitle"]',
    '.project-settings-extension-tabs [data-slot="tabs-v2-content"]',
    '[data-component="tabs-v2"][data-variant="settings"][data-orientation="vertical"] > [data-slot="tabs-v2-list"]',
    '[data-component="image-preview"] [data-slot="image-preview-container"] [data-slot="image-preview-content"] [data-slot="image-preview-body"]',
    '[data-component="markdown"] table', '[data-component="markdown"] [data-component="markdown-mermaid"]',
  ].map((selector) => ':root body ' + selector);
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => /(?:^|;)\s*scrollbar-color\s*:/.test(match[2]));
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0][1].split(',').map((selector) => selector.trim()).sort(), expected.sort());
  assert.equal(rules[0][2].trim(), 'scrollbar-color: #627b9e transparent;');
  assert.doesNotMatch(css, /scrollbar-(?:width|gutter)\s*:|::-webkit-scrollbar/);
  for (const selector of expected) {
    assert.doesNotMatch(selector, /\.scroll-view|\.settings-panel$|\[data-slot="list-scroll"\]|\[data-slot="tabs-list"\]|\[data-slot="tabs-content"\]|\bpre$/);
  }
});

test('sent message mentions remain readable at dark and bright backing extremes', () => {
  const bubble = block(':root body [data-component="user-message"]:not([data-pending]) [data-slot="user-message-text"]');
  const background = /background:\s*rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(bubble);
  assert.ok(background);
  const alpha = Number(background[4]);
  for (const backing of [0, 255]) {
    const composite = background.slice(1, 4).map((value) => Number(value) * alpha + backing * (1 - alpha));
    for (const foreground of ['#182334', token('--user-message-mention-prefix-color', bubble)]) {
      assert.ok(contrast(rgb(foreground), composite) >= 4.5, 'Low contrast for ' + foreground);
    }
  }
});

test('semantic colors and native inverse button pairs are not globally flattened', () => {
  assert.doesNotMatch(root, /--(?:v2-state-|surface-(?:success|warning|critical)|surface-diff-|syntax-diff-)[\w-]*\s*:/);
  assert.doesNotMatch(css, /--(?:v2-state-|surface-(?:success|critical)|surface-diff-|syntax-diff-)[\w-]*\s*:/);
  assert.doesNotMatch(css, /--v2-(?:background-bg-(?:inverse|contrast|accent|icon-button-contrast)|text-text-(?:inverse|contrast))\s*:/);
  assert.doesNotMatch(css, /\[data-component="(?:icon-button-v2|button-v2|menu-v2-item)"\]/);
});
