const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const archive = require('./archive.cjs');
const { hash, extract, archiveInfo, unpackedHashes, verifyUnpacked, verifyArchive,
  verifyAsset, unpackOptions, assertDesktopClosed, replaceArchive, rendererEntry } = archive;
const { writeJsonAtomic, ensureBackup } = require('./storage.cjs');
const { injectHtml, patchRenderer, THEME_ID, THEME_NAME } = require('./theme.cjs');

const SUPPORTED_VERSIONS = ['2.0.32'];
const ROOT = __dirname;
const APP = path.join(process.env.LOCALAPPDATA || '', 'Programs', '@opencode-aidesktop');
function readManifest(file) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (m.format !== 2 || m.mode !== 'selectable' || m.themeID !== THEME_ID ||
      !SUPPORTED_VERSIONS.includes(m.version) || !path.isAbsolute(m.app) ||
      !path.isAbsolute(m.snapshot) || !path.isAbsolute(m.output) ||
      !/^[a-f0-9]{64}$/.test(m.originalHash) || !/^[a-f0-9]{64}$/.test(m.themedHash) ||
      !Array.isArray(m.acceptedThemedHashes) || m.acceptedThemedHashes.some((h) => !/^[a-f0-9]{64}$/.test(h))) {
    throw new Error('Unsupported theme manifest.');
  }
  return m;
}
function resolveExpectedCurrent(m, installed) {
  if (installed === m.originalHash || [m.themedHash, ...m.acceptedThemedHashes].includes(installed)) return installed;
  throw new Error('Application differs from recorded versions. Refusing overwrite or restore across updates.');
}
function loadManifest(operation, file, root = ROOT) {
  const m = readManifest(file);
  // Raw restoration remains independent of a missing/corrupt themed output.
  const candidates = [m.snapshot];
  const backups = path.join(root, 'backups');
  if (fs.existsSync(backups)) for (const name of fs.readdirSync(backups)) candidates.push(path.join(backups, name, 'app.asar'));
  const original = candidates.find((candidate) => {
    try { verifyArchive(candidate, m.originalHash, m.unpacked); return true; } catch { return false; }
  });
  if (!original) throw new Error('No verified original backup available. Keep backups/.');
  m.snapshot = original;
  if (operation === 'install') verifyArchive(m.output, m.themedHash, m.unpacked);
  return m;
}

async function build(snapshot, output, css, asset, unpacked) {
  const info = archiveInfo(snapshot);
  const html = extract(snapshot, 'out/renderer/index.html').toString('utf8');
  const entry = rendererEntry(html);
  const patchedHtml = injectHtml(html, css);
  const patchedEntry = patchRenderer(extract(snapshot, entry).toString('utf8'), css);
  const source = path.join(path.dirname(output), 'extracted');
  try {
    asar.extractAll(snapshot, source);
    fs.writeFileSync(path.join(source, 'out', 'renderer', 'index.html'), patchedHtml);
    fs.writeFileSync(path.join(source, ...entry.split('/')), patchedEntry);
    fs.copyFileSync(asset, path.join(source, 'out', 'renderer', 'assets', 'deepseek-bg.mp4'));
    await asar.createPackageWithOptions(source, output, unpackOptions(info.files.filter((f) => f.unpacked).map((f) => f.name)));
    verifyUnpacked(output, unpacked);
    const before = info.files.map((f) => f.name).sort();
    const after = archiveInfo(output).files.map((f) => f.name).filter((n) => n !== 'out/renderer/assets/deepseek-bg.mp4').sort();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Unexpected archive inventory change.');
    for (const file of info.files.filter((f) => !f.unpacked && !f.link)) {
      const expected = file.name === entry ? Buffer.from(patchedEntry)
        : file.name === 'out/renderer/index.html' ? Buffer.from(patchedHtml) : extract(snapshot, file.name);
      if (!expected.equals(extract(output, file.name))) throw new Error('Unexpected application-file change: ' + file.name);
    }
  } finally {
    if (fs.existsSync(source)) fs.rmSync(source, { recursive: true });
  }
}

function createDeployment({ root = ROOT, app = APP, checkClosed = assertDesktopClosed } = {}) {
  const manifestFile = path.join(root, 'runtime', 'manifest.json');
  const target = path.join(app, 'resources', 'app.asar');
  async function prepare({ upgrade = false } = {}) {
    const installedHash = hash(target);
    const info = archiveInfo(target);
    if (!SUPPORTED_VERSIONS.includes(info.version)) throw new Error('Unsupported Desktop version: ' + info.version);
    let snapshot = target, accepted = [];
    if (fs.existsSync(manifestFile)) {
      const previous = readManifest(manifestFile);
      if (previous.app !== app) throw new Error('Manifest targets another installation.');
      if (previous.version === info.version) {
        resolveExpectedCurrent(previous, installedHash);
        snapshot = loadManifest('restore', manifestFile, root).snapshot;
        accepted = [...new Set([previous.themedHash, ...previous.acceptedThemedHashes])];
      } else {
        if (!upgrade) throw new Error('Desktop updated. Use prepare --upgrade.');
        if (SUPPORTED_VERSIONS.indexOf(info.version) <= SUPPORTED_VERSIONS.indexOf(previous.version)) throw new Error('Upgrade requires a newer supported version.');
      }
    }
    const css = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
    const originalHtml = extract(snapshot, 'out/renderer/index.html').toString('utf8');
    injectHtml(originalHtml, css);
    patchRenderer(extract(snapshot, rendererEntry(originalHtml)).toString('utf8'), css);
    const asset = path.join(root, 'assets', require('./background.cjs').filename);
    verifyAsset(asset);
    const originalHash = hash(snapshot);
    const unpacked = unpackedHashes(snapshot, archiveInfo(snapshot).files);
    verifyUnpacked(target, unpacked);
    const builds = path.join(root, 'runtime', 'builds');
    fs.mkdirSync(builds, { recursive: true });
    const stage = fs.mkdtempSync(path.join(builds, info.version + '-'));
    let published = false;
    try {
      const output = path.join(stage, 'app.asar');
      await build(snapshot, output, css, asset, unpacked);
      if (hash(target) !== installedHash || hash(snapshot) !== originalHash) throw new Error('Application changed during preparation.');
      const backupDir = path.join(root, 'backups', info.version + '-selectable-' + originalHash.slice(0, 12));
      const m = { format: 2, mode: 'selectable', version: info.version, themeID: THEME_ID, name: THEME_NAME,
        app, originalHash, themedHash: hash(output), snapshot: path.join(backupDir, 'app.asar'), output,
        unpacked, acceptedThemedHashes: accepted, created: new Date().toISOString() };
      const saved = ensureBackup(backupDir, snapshot, m, (f) => verifyArchive(f, originalHash, unpacked));
      m.snapshot = path.join(saved, 'app.asar');
      verifyArchive(m.snapshot, originalHash, unpacked);
      if (hash(target) !== installedHash) throw new Error('Application changed before publication.');
      writeJsonAtomic(manifestFile, m);
      published = true;
      console.log('Prepared and verified. Installed OpenCode is unchanged.');
      return m;
    } finally {
      if (!published) fs.rmSync(stage, { recursive: true, force: true });
    }
  }
  function apply(restore = false, backup) {
    checkClosed();
    const m = loadManifest(restore ? 'restore' : 'install', backup ? path.join(backup, 'manifest.json') : manifestFile, root);
    if (m.app !== app) throw new Error('Manifest targets another installation.');
    const current = hash(target);
    const desired = restore ? m.originalHash : m.themedHash;
    resolveExpectedCurrent(m, current);
    verifyUnpacked(target, m.unpacked);
    if (current !== desired) replaceArchive(restore ? m.snapshot : m.output, target, current, desired, checkClosed);
    console.log(restore ? 'Official original restored. Theme preferences were not overwritten.'
      : 'Installed. Choose ' + THEME_NAME + ' in Appearance > Theme.');
  }
  function status() {
    const m = loadManifest('restore', manifestFile, root);
    const current = hash(target);
    verifyUnpacked(target, m.unpacked);
    return { version: m.version, name: m.name, installed: current === m.themedHash ? 'current-theme'
      : current === m.originalHash ? 'official-original'
        : m.acceptedThemedHashes.includes(current) ? 'previous-theme' : 'unknown', manifest: manifestFile };
  }
  return { prepare, install: () => apply(), restore: (backup) => apply(true, backup), status };
}

if (require.main === module) Promise.resolve().then(() => {
  const deployment = createDeployment();
  const [command, flag, value, ...extra] = process.argv.slice(2);
  if (command === 'prepare' && !value && !extra.length && (!flag || flag === '--upgrade')) return deployment.prepare({ upgrade: flag === '--upgrade' });
  if (command === 'install' && !flag && !value && !extra.length) return deployment.install();
  if (command === 'restore' && !extra.length && ((!flag && !value) || (flag === '--backup' && value))) return deployment.restore(value ? path.resolve(value) : undefined);
  if (command === 'status' && !flag && !value && !extra.length) return console.log(JSON.stringify(deployment.status(), null, 2));
  throw new Error('Usage: node deploy.cjs prepare [--upgrade] | install | restore [--backup <directory>] | status');
}).catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { ...archive, SUPPORTED_VERSIONS, readManifest, loadManifest, resolveExpectedCurrent, build, createDeployment };
