const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const asar = require('@electron/asar');
const { writeJsonAtomic, ensureBackup } = require('../storage.cjs');
const { loadManifest, replaceArchive, prepare } = require('../deploy.cjs');

const temp = process.env.OPENCODE_TEST_TEMP || path.join(os.tmpdir(), 'opencode-theme-tests');
fs.mkdirSync(temp, { recursive: true });
const assetAvailable = fs.existsSync(path.join(__dirname, '..', 'assets', 'zipzip-1080p.mp4'));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

async function fixture(run) {
  const root = fs.mkdtempSync(path.join(temp, 'theme-lifecycle-test-'));
  try {
    const source = path.join(root, 'source');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'package.json'), '{"version":"2.0.24"}');
    const original = path.join(root, 'original.asar');
    await asar.createPackage(source, original);
    const themed = path.join(root, 'theme.asar');
    fs.writeFileSync(path.join(source, 'theme.txt'), 'fixture');
    await asar.createPackage(source, themed);
    const manifest = {
      format: 1, version: '2.0.24', app: path.join(root, 'app'),
      originalHash: hash(original), themedHash: hash(themed),
      snapshot: original, output: themed, unpacked: {}, acceptedThemedHashes: [],
    };
    const file = path.join(root, 'manifest.json');
    writeJsonAtomic(file, manifest);
    await run({ root, original, themed, manifest, file });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('restore and prepare do not depend on a missing or corrupt theme package', () => fixture(({ root, themed, file }) => {
  fs.writeFileSync(themed, 'corrupt');
  assert.doesNotThrow(() => loadManifest('restore', file, root));
  assert.throws(() => loadManifest('install', file, root), /integrity/);
  fs.unlinkSync(themed);
  assert.doesNotThrow(() => loadManifest('restore', file, root));
  assert.doesNotThrow(() => loadManifest('prepare', file, root));
}));

test('restore finds a verified backup when the original snapshot is gone', () => fixture(({ root, original, manifest, file }) => {
  const backup = path.join(root, 'backups', 'fixture');
  ensureBackup(backup, original, manifest, (p) => assert.equal(hash(p), manifest.originalHash));
  fs.unlinkSync(original);
  assert.equal(loadManifest('restore', file, root).snapshot, path.join(backup, 'app.asar'));
  fs.writeFileSync(file, 'broken manifest');
  assert.equal(loadManifest('restore', path.join(backup, 'manifest.json'), root, backup).snapshot, path.join(backup, 'app.asar'));
}));

test('metadata publication failure preserves previous manifest and clears temporary files', () => fixture(({ root, file }) => {
  const before = fs.readFileSync(file);
  const io = { ...fs, renameSync() { throw new Error('SIMULATED_PUBLISH_FAILURE'); } };
  assert.throws(() => writeJsonAtomic(file, { replacement: true }, io), /PUBLISH_FAILURE/);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(fs.readdirSync(root).some((p) => p.startsWith('.metadata-')), false);
}));

test('backup copy failure leaves no published partial backup and retries successfully', () => fixture(({ root, original, manifest }) => {
  const backup = path.join(root, 'backups', 'fixture');
  const verify = (p) => assert.equal(hash(p), manifest.originalHash);
  const io = { ...fs, copyFileSync(a, b) { fs.writeFileSync(b, 'partial'); throw new Error('SIMULATED_COPY_FAILURE'); } };
  assert.throws(() => ensureBackup(backup, original, manifest, verify, io), /COPY_FAILURE/);
  assert.equal(fs.existsSync(backup), false);
  assert.deepEqual(fs.readdirSync(path.dirname(backup)), []);
  assert.equal(ensureBackup(backup, original, manifest, verify), backup);
}));

test('cleanup failure after metadata publication does not report a failed publication', () => fixture(({ file }) => {
  const warnings = [];
  const warn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const io = { ...fs, rmSync() { throw new Error('SIMULATED_CLEANUP_FAILURE'); } };
    assert.doesNotThrow(() => writeJsonAtomic(file, { complete: true }, io));
    assert.equal(JSON.parse(fs.readFileSync(file)).complete, true);
    assert.equal(warnings.length, 1);
  } finally { console.warn = warn; }
}));

test('existing partial backup is preserved and a fresh verified backup is published', () => fixture(({ root, original, manifest }) => {
  const backup = path.join(root, 'backups', 'fixture');
  fs.mkdirSync(backup, { recursive: true });
  fs.writeFileSync(path.join(backup, 'app.asar'), 'partial');
  const recovered = ensureBackup(backup, original, manifest, (p) => assert.equal(hash(p), manifest.originalHash));
  assert.notEqual(recovered, backup);
  assert.equal(fs.readFileSync(path.join(backup, 'app.asar'), 'utf8'), 'partial');
  assert.equal(hash(path.join(recovered, 'app.asar')), manifest.originalHash);
}));

test('existing backup recovery metadata is updated for later theme revisions', () => fixture(({ root, original, manifest }) => {
  const backup = path.join(root, 'backups', 'fixture');
  const verify = (p) => assert.equal(hash(p), manifest.originalHash);
  ensureBackup(backup, original, manifest, verify);
  ensureBackup(backup, original, { ...manifest, themedHash: 'revision-2' }, verify);
  const saved = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json')));
  assert.equal(saved.themedHash, 'revision-2');
  assert.ok(saved.acceptedThemedHashes.includes(manifest.themedHash));
}));

test('replacement refusal after staging keeps target intact and cleans the staging file', () => fixture(({ root, original, themed, manifest }) => {
  const before = fs.readFileSync(original);
  assert.throws(() => replaceArchive(themed, original, manifest.originalHash, manifest.themedHash,
    () => { throw new Error('SIMULATED_RUNNING_DESKTOP'); }), /RUNNING_DESKTOP/);
  assert.deepEqual(fs.readFileSync(original), before);
  assert.equal(fs.readdirSync(root).some((p) => p.includes('.theme-stage-')), false);
}));

test('failed prepare cleans only its new build and keeps installed archive unchanged', { skip: !assetAvailable }, () => fixture(async ({ root, original, manifest }) => {
  const app = path.join(root, 'app');
  fs.mkdirSync(path.join(app, 'resources'), { recursive: true });
  fs.copyFileSync(original, path.join(app, 'resources', 'app.asar'));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.copyFileSync(path.join(__dirname, '..', 'assets', 'zipzip-1080p.mp4'), path.join(root, 'assets', 'zipzip-1080p.mp4'));
  fs.copyFileSync(path.join(__dirname, '..', 'theme-fixed.css'), path.join(root, 'theme-fixed.css'));
  // Fixture intentionally has no renderer HTML: preflight must not publish any build.
  await assert.rejects(prepare(app, root), /ENOENT|not found/);
  assert.equal(hash(path.join(app, 'resources', 'app.asar')), manifest.originalHash);
  assert.equal(fs.existsSync(path.join(root, 'prepared')), false);
}));

test('repeated successful prepare reuses the original and removes new extraction directories', { skip: !assetAvailable }, () => fixture(async ({ root }) => {
  const app = path.join(root, 'app');
  const source = path.join(root, 'clean-source');
  fs.mkdirSync(path.join(source, 'out', 'renderer'), { recursive: true });
  fs.mkdirSync(path.join(source, 'out', 'main'), { recursive: true });
  fs.writeFileSync(path.join(source, 'package.json'), '{"version":"2.0.24"}');
  fs.writeFileSync(path.join(source, 'out', 'renderer', 'index.html'), '<html><head></head><body><div id="root"></div></body></html>');
  fs.writeFileSync(path.join(source, 'out', 'main', 'index.js'), 'const caption={symbolColor:e===`dark`?`white`:`black`};');
  fs.mkdirSync(path.join(app, 'resources'), { recursive: true });
  const installed = path.join(app, 'resources', 'app.asar');
  await asar.createPackage(source, installed);
  const before = hash(installed);
  fs.mkdirSync(path.join(root, 'assets'));
  fs.copyFileSync(path.join(__dirname, '..', 'assets', 'zipzip-1080p.mp4'), path.join(root, 'assets', 'zipzip-1080p.mp4'));
  fs.copyFileSync(path.join(__dirname, '..', 'theme-fixed.css'), path.join(root, 'theme-fixed.css'));
  await prepare(app, root);
  const first = loadManifest('install', path.join(root, 'prepared', 'manifest.json'), root);
  await prepare(app, root);
  const second = loadManifest('install', path.join(root, 'prepared', 'manifest.json'), root);
  assert.equal(first.snapshot, second.snapshot);
  assert.notEqual(first.output, second.output);
  assert.equal(hash(installed), before);
  for (const entry of fs.readdirSync(path.join(root, 'prepared'), { withFileTypes: true }).filter((e) => e.isDirectory())) {
    assert.equal(fs.existsSync(path.join(root, 'prepared', entry.name, 'extracted')), false);
  }
  assert.equal(fs.existsSync(path.join(path.dirname(path.dirname(second.output)), 'original')), false);

  // A supported desktop update must start a separate lineage, never reuse 2.0.24 bytes.
  fs.writeFileSync(path.join(source, 'package.json'), '{"version":"2.0.25"}');
  await asar.createPackage(source, installed);
  const updatedHash = hash(installed);
  const metadata = fs.readFileSync(path.join(root, 'prepared', 'manifest.json'));
  await assert.rejects(prepare(app, root), /--upgrade/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'prepared', 'manifest.json')), metadata);
  await prepare(app, root, { upgrade: true });
  const upgraded = loadManifest('install', path.join(root, 'prepared', 'manifest.json'), root);
  assert.equal(upgraded.version, '2.0.25');
  assert.equal(upgraded.originalHash, updatedHash);
  assert.notEqual(upgraded.snapshot, second.snapshot);
  assert.deepEqual(upgraded.acceptedThemedHashes, []);
  assert.equal(hash(installed), updatedHash);
  assert.equal(hash(second.snapshot), before);
  assert.deepEqual(fs.readFileSync(path.join(path.dirname(path.dirname(upgraded.output)), 'previous-manifest.json')), metadata);
  const { resolveExpectedCurrent } = require('../deploy.cjs');
  assert.throws(() => resolveExpectedCurrent(second, updatedHash, true), /differs/);
  assert.throws(() => resolveExpectedCurrent(upgraded, second.themedHash, false), /differs/);

  // --upgrade is not a bypass for arbitrary versions or same-version modifications.
  fs.writeFileSync(path.join(source, 'extra.txt'), 'unknown same-version change');
  await asar.createPackage(source, installed);
  await assert.rejects(prepare(app, root, { upgrade: true }), /differs/);
  fs.writeFileSync(path.join(source, 'package.json'), '{"version":"2.0.26"}');
  await asar.createPackage(source, installed);
  await assert.rejects(prepare(app, root, { upgrade: true }), /Unsupported Desktop version/);
  fs.writeFileSync(path.join(source, 'package.json'), '{"version":"2.0.24"}');
  await asar.createPackage(source, installed);
  await assert.rejects(prepare(app, root, { upgrade: true }), /newer/);
  fs.writeFileSync(path.join(source, 'package.json'), '{"version":"2.0.25"}');
  fs.writeFileSync(path.join(source, 'out', 'renderer', 'index.html'), '<head></head><body><style id="opencode-bg-correct-override"></style></body>');
  await asar.createPackage(source, installed);
  // Even without old metadata, a themed archive cannot become a clean original.
  const isolated = path.join(root, 'isolated');
  await assert.rejects(prepare(app, isolated, { upgrade: true }), /already themed/);
}));
