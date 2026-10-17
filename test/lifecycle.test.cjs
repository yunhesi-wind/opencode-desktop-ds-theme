const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const asar = require('@electron/asar');
const { createDeployment, hash, unpackOptions, unpackedHashes, archiveInfo, loadManifest } = require('../deploy.cjs');
const { writeJsonAtomic, ensureBackup } = require('../storage.cjs');
const { THEME_ID } = require('../theme.cjs');

const temp = process.env.OPENCODE_TEST_TEMP || path.join(os.tmpdir(), 'opencode-theme-tests');
fs.mkdirSync(temp, { recursive: true });
const video = path.join(__dirname, '..', 'assets', 'zipzip-1080p.mp4');
const assetAvailable = fs.existsSync(video);

async function fixture(run) {
  const root = fs.mkdtempSync(path.join(temp, 'selectable-lifecycle-'));
  try {
    const source = path.join(root, 'source');
    const app = path.join(root, 'app');
    fs.mkdirSync(path.join(source, 'out', 'renderer', 'assets'), { recursive: true });
    fs.mkdirSync(path.join(source, 'out', 'main'), { recursive: true });
    fs.mkdirSync(path.join(source, 'native'), { recursive: true });
    fs.writeFileSync(path.join(source, 'package.json'), '{"version":"2.0.32"}');
    fs.writeFileSync(path.join(source, 'out', 'main', 'index.js'), 'const originalCaption = true;');
    fs.writeFileSync(path.join(source, 'native', 'fixture.node'), 'non-executable test fixture');
    fs.writeFileSync(path.join(source, 'out', 'renderer', 'index.html'),
      '<html><head><script type="module" src="./assets/main.js"></script></head><body><div id="root"></div></body></html>');
    fs.writeFileSync(path.join(source, 'out', 'renderer', 'assets', 'main.js'),
      'function Do(){return wo||(wo=Object.assign({"./themes/amoled.json":()=>Promise.resolve({})}))}' +
      'var Ao={"oc-2":`OpenCode`,};var l=(t,n,r,i)=>{zo(t,n,r),e.onThemeApplied?.(t,r,i)};' +
      'var context={mode:()=>a.mode,ids:u,};');
    const original = path.join(root, 'original.asar');
    await asar.createPackageWithOptions(source, original, unpackOptions(['native/fixture.node']));
    fs.mkdirSync(path.join(app, 'resources'), { recursive: true });
    const installed = path.join(app, 'resources', 'app.asar');
    fs.copyFileSync(original, installed);
    fs.cpSync(original + '.unpacked', installed + '.unpacked', { recursive: true });
    const themed = path.join(root, 'theme.asar');
    fs.writeFileSync(path.join(source, 'theme.txt'), 'known selectable fixture');
    await asar.createPackageWithOptions(source, themed, unpackOptions(['native/fixture.node']));
    const m = { format: 2, mode: 'selectable', themeID: THEME_ID, version: '2.0.32', app,
      originalHash: hash(original), themedHash: hash(themed), snapshot: original, output: themed,
      unpacked: unpackedHashes(original, archiveInfo(original).files), acceptedThemedHashes: [] };
    fs.mkdirSync(path.join(root, 'runtime'));
    const file = path.join(root, 'runtime', 'manifest.json');
    writeJsonAtomic(file, m);
    fs.copyFileSync(path.join(__dirname, '..', 'theme.css'), path.join(root, 'theme.css'));
    if (assetAvailable) {
      fs.mkdirSync(path.join(root, 'assets'));
      fs.copyFileSync(video, path.join(root, 'assets', 'zipzip-1080p.mp4'));
    }
    const deployment = createDeployment({ root, app, checkClosed() {} });
    await run({ root, source, app, original, themed, installed, m, file, deployment });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('restore is independent of a corrupt or missing theme output', () => fixture(({ root, themed, file, deployment }) => {
  fs.writeFileSync(themed, 'corrupt');
  assert.doesNotThrow(() => loadManifest('restore', file, root));
  assert.throws(() => loadManifest('install', file, root), /integrity/);
  fs.unlinkSync(themed);
  assert.doesNotThrow(() => deployment.restore());
}));

test('verified backup survives loss of the original manifest snapshot', () => fixture(({ root, original, m, file }) => {
  const backup = path.join(root, 'backups', 'verified');
  ensureBackup(backup, original, m, (f) => assert.equal(hash(f), m.originalHash));
  fs.unlinkSync(original);
  assert.equal(loadManifest('restore', file, root).snapshot, path.join(backup, 'app.asar'));
  fs.writeFileSync(file, 'broken');
  assert.equal(loadManifest('restore', path.join(backup, 'manifest.json'), root).originalHash, m.originalHash);
}));

test('atomic metadata failure preserves the existing record', () => fixture(({ root, file }) => {
  const before = fs.readFileSync(file);
  const io = { ...fs, renameSync() { throw new Error('SIMULATED_PUBLISH_FAILURE'); } };
  assert.throws(() => writeJsonAtomic(file, { replacement: true }, io), /PUBLISH_FAILURE/);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(fs.readdirSync(path.dirname(file)).some((name) => name.startsWith('.metadata-')), false);
}));

test('backup failures are retryable and partial backups are never overwritten', () => fixture(({ root, original, m }) => {
  const backup = path.join(root, 'backups', 'verified');
  const verify = (f) => assert.equal(hash(f), m.originalHash);
  const io = { ...fs, copyFileSync(a, b) { fs.writeFileSync(b, 'partial'); throw new Error('SIMULATED_COPY_FAILURE'); } };
  assert.throws(() => ensureBackup(backup, original, m, verify, io), /COPY_FAILURE/);
  assert.equal(fs.existsSync(backup), false);
  fs.mkdirSync(backup);
  fs.writeFileSync(path.join(backup, 'app.asar'), 'partial user bytes');
  const recovered = ensureBackup(backup, original, m, verify);
  assert.notEqual(recovered, backup);
  assert.equal(fs.readFileSync(path.join(backup, 'app.asar'), 'utf8'), 'partial user bytes');
  assert.equal(hash(path.join(recovered, 'app.asar')), m.originalHash);
}));

test('install and raw restore preserve native files and reject unknown modifications', () => fixture(({ deployment, installed, m }) => {
  deployment.install();
  assert.equal(hash(installed), m.themedHash);
  deployment.install();
  deployment.restore();
  assert.equal(hash(installed), m.originalHash);
  fs.appendFileSync(installed, 'unknown modification');
  const before = hash(installed);
  assert.throws(() => deployment.install(), /differs/);
  assert.throws(() => deployment.restore(), /differs/);
  assert.equal(hash(installed), before);
}));

test('native changes and running application checks block deployment', () => fixture(({ root, app, installed, deployment }) => {
  fs.writeFileSync(path.join(installed + '.unpacked', 'native', 'fixture.node'), 'modified native bytes');
  const before = hash(installed);
  assert.throws(() => deployment.install(), /Native/);
  const closed = createDeployment({ root, app, checkClosed() { throw new Error('RUNNING_DESKTOP'); } });
  assert.throws(() => closed.install(), /RUNNING_DESKTOP/);
  assert.equal(hash(installed), before);
}));

test('prepare rejects unknown versions even with the upgrade flag', () => fixture(async ({ source, installed, deployment, file }) => {
  fs.writeFileSync(path.join(source, 'package.json'), '{"version":"2.0.33"}');
  await asar.createPackageWithOptions(source, installed, unpackOptions(['native/fixture.node']));
  const before = fs.readFileSync(file);
  await assert.rejects(deployment.prepare({ upgrade: true }), /Unsupported Desktop version/);
  assert.deepEqual(fs.readFileSync(file), before);
}));

test('prepare supports first install and installed-theme revisions without rollback', { skip: !assetAvailable }, () => fixture(async ({ root, installed, original, file, deployment }) => {
  fs.unlinkSync(file); // Fresh checkout and official original.
  const before = hash(installed);
  const first = await deployment.prepare();
  assert.equal(hash(installed), before);
  assert.equal(first.format, 2);
  assert.equal(first.mode, 'selectable');
  assert.equal(hash(first.snapshot), before);
  assert.ok(first.snapshot.startsWith(path.join(root, 'backups')));
  assert.deepEqual(asar.extractFile(original, path.join('out', 'main', 'index.js')),
    asar.extractFile(first.output, path.join('out', 'main', 'index.js')));
  deployment.install();
  fs.appendFileSync(path.join(root, 'theme.css'), '\n:root { --revision-test-color: #abcdef; }\n');
  const second = await deployment.prepare();
  assert.equal(hash(installed), first.themedHash, 'Prepare changed installed application');
  assert.ok(second.acceptedThemedHashes.includes(first.themedHash));
  assert.notEqual(second.themedHash, first.themedHash);
  deployment.install();
  assert.equal(hash(installed), second.themedHash);
  fs.unlinkSync(second.output);
  deployment.restore();
  assert.equal(hash(installed), before);
  assert.equal(deployment.status().installed, 'official-original');
  for (const name of fs.readdirSync(path.join(root, 'runtime', 'builds'))) {
    assert.equal(fs.existsSync(path.join(root, 'runtime', 'builds', name, 'extracted')), false);
  }
}));
