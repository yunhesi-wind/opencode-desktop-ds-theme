const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const asar = require('@electron/asar');
const { patchRenderer, scopeCss, injectHtml, videoController, rootColors, splitSelectors, THEME_ID } = require('../theme.cjs');
const css = fs.readFileSync(path.join(__dirname, '..', 'theme.css'), 'utf8');
const fixture = 'function Do(){return wo||(wo=Object.assign({"./themes/amoled.json":()=>Promise.resolve({default:{id:"amoled"}})}))}' +
  'var Ao={"oc-2":`OpenCode`,};' +
  'var l=(t,n,r,i)=>{zo(t,n,r),e.onThemeApplied?.(t,r,i)};' +
  'var context={mode:()=>a.mode,ids:u,};';

test('theme registration enters the native map before ID normalization and never mutates original data', async () => {
  const patched = patchRenderer(fixture, css);
  const sandbox = { structuredClone, wo: undefined, jo: { id: 'oc-2', name: 'OpenCode',
    dark: { palette: { neutral: '#1f1f1f' }, overrides: {} }, light: { palette: { neutral: '#fafafa' } } },
    a: { themeId: THEME_ID, previewThemeId: null, mode: 'light' }, u() {}, e: {}, zo() {} };
  vm.createContext(sandbox);
  vm.runInContext(patched, sandbox);
  const loader = sandbox.Do()['./themes/' + THEME_ID + '.json'];
  assert.equal(typeof loader, 'function');
  const registered = (await loader()).default;
  assert.equal(registered.id, THEME_ID);
  assert.equal(registered.name, '深海大肥鱼');
  assert.equal(registered.dark.overrides['v2-text-text-base'], '#e8eef8');
  assert.equal(sandbox.jo.dark.overrides['v2-text-text-base'], undefined);
  assert.equal(sandbox.jo.light.palette.neutral, '#fafafa');
  assert.equal(sandbox.context.mode(), 'dark');
  sandbox.a.previewThemeId = 'amoled';
  assert.equal(sandbox.context.mode(), 'light');
  sandbox.a.previewThemeId = null;
  sandbox.a.themeId = 'oc-2';
  assert.equal(sandbox.context.mode(), 'light');
  assert.equal(sandbox.a.mode, 'light', 'User preference was changed');
  let applied;
  sandbox.zo = (...args) => { applied = args; };
  sandbox.l(registered, THEME_ID, 'light', 'system');
  assert.equal(applied[2], 'dark');
  sandbox.l(sandbox.jo, 'oc-2', 'light', 'system');
  assert.equal(applied[2], 'light');
});

test('renderer patch rejects changed, duplicate or already patched hooks', () => {
  assert.throws(() => patchRenderer('unknown native renderer', css), /Unsupported/);
  assert.throws(() => patchRenderer(fixture + fixture, css), /Unsupported/);
  assert.throws(() => patchRenderer(patchRenderer(fixture, css), css), /already contains/);
});

test('every stable selector is gated including root/body decoration and functional selector lists', () => {
  const gated = scopeCss(css);
  const gate = '[data-theme="' + THEME_ID + '"]';
  for (const rule of gated.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of splitSelectors(rule[1])) assert.ok(selector.startsWith(':root' + gate) || selector.startsWith('html' + gate));
  }
  assert.ok(gated.includes(':root' + gate + ' body::before'));
  assert.ok(gated.includes(':root' + gate + '[data-color-scheme="dark"] body [data-component="file"]'));
  assert.deepEqual(splitSelectors(':root, :is([a], [b]) > button:not([x], [y]), [v="a,b"]'),
    [':root', ':is([a], [b]) > button:not([x], [y])', '[v="a,b"]']);
  assert.throws(() => scopeCss(css + '\n@import "other.css";'), /Unsupported/);
  assert.throws(() => scopeCss(css + '</style>'), /Unsupported/);
  assert.equal(rootColors(css.replace(/\r?\n/g, '\r\n'))['v2-text-text-base'], '#e8eef8');
});

test('HTML injection starts video hidden without loading media or writing user preferences', () => {
  const html = injectHtml('<html><head></head><body><div id="root"></div></body></html>', css);
  assert.match(html, /aria-hidden="true" hidden loop muted playsinline/);
  assert.doesNotMatch(html, /<video[^>]+(?:src=|autoplay)/);
  assert.match(html, /attributeFilter: \['data-theme'\]/);
  assert.doesNotMatch(html, /localStorage\.setItem|setInterval|setTimeout/);
  assert.throws(() => injectHtml(html, css), /already themed/);
});

test('theme switch, preview and cancel start/stop video and release its source', () => {
  let callback;
  const calls = [];
  const video = { hidden: true, muted: true, src: '',
    play() { calls.push('play'); return Promise.resolve(); }, pause() { calls.push('pause'); },
    load() { calls.push('load'); }, removeAttribute(name) { calls.push('remove:' + name); this.src = ''; } };
  const document = { documentElement: { dataset: { theme: 'oc-2' } }, getElementById: () => video };
  const sandbox = { document, MutationObserver: class { constructor(sync) { callback = sync; } observe() {} } };
  vm.runInNewContext('(' + videoController.toString() + ')(' + JSON.stringify(THEME_ID) + ',"./assets/deepseek-bg.mp4")', sandbox);
  assert.deepEqual(calls, []);
  document.documentElement.dataset.theme = THEME_ID;
  callback();
  assert.equal(video.hidden, false);
  assert.equal(video.src, './assets/deepseek-bg.mp4');
  callback(); // Unrelated repeated sync must not reload the video.
  assert.deepEqual(calls, ['play']);
  document.documentElement.dataset.theme = 'catppuccin';
  callback();
  assert.equal(video.hidden, true);
  assert.equal(video.src, '');
  assert.deepEqual(calls, ['play', 'pause', 'remove:src', 'load']);
  document.documentElement.dataset.theme = THEME_ID;
  callback();
  assert.equal(video.hidden, false);
  assert.equal(calls.at(-1), 'play');
});

const manifestFile = path.join(__dirname, '..', 'runtime', 'manifest.json');
const m = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : undefined;
test('audited local 2.0.32 renderer accepts exact native registration hooks',
  { skip: !m?.snapshot || !fs.existsSync(m.snapshot) }, () => {
    const html = asar.extractFile(m.snapshot, path.join('out', 'renderer', 'index.html')).toString('utf8');
    const entry = /<script[^>]+src="\.\/([^" ]+\.js)"/.exec(html)?.[1];
    assert.ok(entry);
    const native = asar.extractFile(m.snapshot, path.join('out', 'renderer', ...entry.split('/'))).toString('utf8');
    const patched = patchRenderer(native, css);
    assert.ok(patched.includes('"./themes/' + THEME_ID + '.json"'));
    assert.ok(native.includes('function Mo(e,t){return e===`oc-2`||e&&(ko().has(e)||t?.[e])?e:`oc-2`}'));
    assert.ok(native.includes('function Oo(){return To||(To=Object.keys(Do())'));
    // Execute the real native registry/ID-validation functions, not only a synthetic fixture.
    const begin = patched.indexOf('function Do(){');
    const end = patched.indexOf('var{use:Vo,provider:Ho}', begin);
    assert.ok(begin >= 0 && end > begin);
    const sandbox = { structuredClone, Ea: { id: 'oc-2', light: {}, dark: { overrides: {} } } };
    vm.createContext(sandbox);
    // vm.Script is not an ES module; native module URLs are irrelevant to these
    // registry checks (no built-in dynamic loader is invoked).
    vm.runInContext('var wo,To,Eo;\n' + patched.slice(begin, end).replaceAll('import.meta.url', '"file:///native-renderer.js"'), sandbox);
    assert.equal(sandbox.Mo(THEME_ID), THEME_ID, 'Saved DS ID must survive startup normalization');
    assert.equal(sandbox.Mo('unknown-theme'), 'oc-2');
    assert.ok(sandbox.Oo().includes(THEME_ID));
    assert.equal(sandbox.Ao[THEME_ID], '深海大肥鱼');
  });
