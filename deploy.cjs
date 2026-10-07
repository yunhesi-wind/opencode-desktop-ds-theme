const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const asar = require('@electron/asar');
const { writeJsonAtomic, ensureBackup } = require('./storage.cjs');

const ROOT = __dirname;
const APP = path.join(process.env.LOCALAPPDATA || '', 'Programs', '@opencode-aidesktop');
const PRESET = require('./background.cjs');
const MANIFEST = path.join(ROOT, 'prepared', 'manifest.json');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function archiveInfo(file) {
  asar.uncache(file);
  const { header } = asar.getRawHeader(file);
  const files = [];
  function walk(entry, parents = []) {
    for (const [name, item] of Object.entries(entry.files || {})) {
      const parts = [...parents, name];
      if (item.files) walk(item, parts);
      else files.push({ name: parts.join('/'), unpacked: !!item.unpacked, link: item.link });
    }
  }
  walk(header);
  const pkg = JSON.parse(asar.extractFile(file, 'package.json').toString('utf8'));
  return { version: pkg.version, files };
}

function unpackedHashes(archive, files) {
  const result = {};
  for (const item of files.filter((item) => item.unpacked)) {
    result[item.name] = hash(path.join(archive + '.unpacked', ...item.name.split('/')));
  }
  return result;
}

function assertSame(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
}

function assertDesktopClosed() {
  if (process.platform !== 'win32') throw new Error('This deployment is Windows-only.');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -ieq 'OpenCode.exe' }).Count"],
    { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0 || !/^\d+$/.test(result.stdout.trim())) {
    throw new Error('Cannot reliably check desktop processes. No changes made.');
  }
  if (Number(result.stdout.trim()) > 0) throw new Error('Save your work and fully exit OpenCode Desktop first.');
}

function verifyAsset(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size !== PRESET.size || hash(file) !== PRESET.sha256) {
    throw new Error('Maid Whale background missing or SHA-256 mismatch.');
  }
}

function verifyUnpacked(archive, expected) {
  const info = archiveInfo(archive);
  const actual = unpackedHashes(archive, info.files);
  assertSame(actual, expected, 'Native/unpacked files changed. Refusing deployment.');
}

function unpackOptions(names) {
  if (names.some((name) => /[{},*?\[\]!]/.test(name))) throw new Error('Unsupported native-file glob characters.');
  if (!names.length) return { dot: true };
  // ASAR matches absolute filenames. Verify the complete unpacked inventory after packing.
  const patterns = names.map((name) => '**/' + name);
  return { unpack: patterns.length === 1 ? patterns[0] : '{' + patterns.join(',') + '}', dot: true };
}

function fixCaptionColors(source) {
  // Native Windows caption buttons are Electron titleBarOverlay, not HTML buttons.
  const old = 'symbolColor:e===`dark`?`white`:`black`';
  if (source.split(old).length !== 2) throw new Error('Unsupported native caption color implementation.');
  return source.replace(old, 'symbolColor:`#d8e5f6`');
}

async function prepare(app = APP, root = ROOT) {
  const manifestPath = path.join(root, 'prepared', 'manifest.json');
  const installed = path.join(app, 'resources', 'app.asar');
  const installedHash = hash(installed);
  let original = installed;
  let acceptedThemedHashes = [];
  if (fs.existsSync(manifestPath)) {
    const previous = loadManifest('prepare', manifestPath, root);
    if (previous.app !== app) throw new Error('Existing manifest targets another installation.');
    acceptedThemedHashes = [...new Set([previous.themedHash, ...(previous.acceptedThemedHashes || [])])];
    if (installedHash !== previous.originalHash && !acceptedThemedHashes.includes(installedHash)) {
      throw new Error('Installed app differs from all recorded versions.');
    }
    original = previous.snapshot;
  }
  const info = archiveInfo(original);
  if (info.version !== '2.0.24') throw new Error('This prepared deployment is validated for Desktop 2.0.24 only.');
  const asset = path.join(root, 'assets', PRESET.filename);
  verifyAsset(asset);
  const originalHash = hash(original);
  const originals = unpackedHashes(original, info.files);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const stage = fs.mkdtempSync(path.join(root, 'prepared', info.version + '-build-'));
  let published = false;
  try {
    // Subsequent builds share the immutable original instead of copying it again.
    const snapshot = original === installed ? path.join(stage, 'original', 'app.asar') : original;
    if (snapshot !== original) {
      fs.mkdirSync(path.dirname(snapshot));
      fs.copyFileSync(original, snapshot);
      if (fs.existsSync(original + '.unpacked')) fs.cpSync(original + '.unpacked', snapshot + '.unpacked', { recursive: true });
      verifyUnpacked(snapshot, originals);
    }
    if (hash(installed) !== installedHash || hash(snapshot) !== originalHash) {
      throw new Error('Application updated during preparation. No installed files changed.');
    }
    const themeCss = fs.readFileSync(path.join(root, 'theme-fixed.css'), 'utf8');
    const output = await buildTheme(snapshot, stage, info, originals, asset, themeCss);
    if (hash(installed) !== installedHash || hash(original) !== originalHash) throw new Error('Installed app changed while preparing.');
    if (fs.existsSync(manifestPath)) fs.copyFileSync(manifestPath, path.join(stage, 'previous-manifest.json'));
    writeJsonAtomic(manifestPath, {
      format: 1, version: info.version, preset: PRESET.id, app,
      originalHash, themedHash: hash(output), snapshot, output, unpacked: originals,
      acceptedThemedHashes, revision: 'transparent-floating-and-code',
      created: new Date().toISOString(), upstreamCommit: 'b59ba94581ffb2d48b4e180194c119c9661cab99',
    });
    published = true;
    console.log('Prepared and verified. Installed OpenCode is unchanged.');
    console.log('Native/unpacked files preserved: ' + Object.keys(originals).length);
  } finally {
    if (!published) fs.rmSync(stage, { recursive: true, force: true });
  }
}

async function buildTheme(snapshot, stage, info, originals, asset, themeCss) {
  const extracted = path.join(stage, 'extracted');
  asar.extractAll(snapshot, extracted);
  const index = path.join(extracted, 'out', 'renderer', 'index.html');
  const originalHtml = fs.readFileSync(index, 'utf8');
  if ((originalHtml.match(/<\/head>/g) || []).length !== 1 ||
      (originalHtml.match(/<body\b[^>]*>/gi) || []).length !== 1 ||
      originalHtml.includes('opencode-bg-correct-override')) {
    throw new Error('Unsupported or already themed renderer layout.');
  }
  const videoDir = path.join(extracted, 'out', 'renderer', 'assets');
  fs.mkdirSync(videoDir, { recursive: true });
  fs.copyFileSync(asset, path.join(videoDir, 'deepseek-bg.mp4'));
  const video = '<video id="opencode-bg-video" autoplay loop muted playsinline src="./assets/deepseek-bg.mp4"></video>';
  const html = originalHtml.replace(/(<body\b[^>]*>)/i, '$1\n' + video)
    .replace('</head>', '<style id="opencode-bg-correct-override">' + themeCss + '</style>\n</head>');
  fs.writeFileSync(index, html, 'utf8');
  const mainPath = path.join(extracted, 'out', 'main', 'index.js');
  const patchedMain = fixCaptionColors(fs.readFileSync(mainPath, 'utf8'));
  fs.writeFileSync(mainPath, patchedMain, 'utf8');
  const output = path.join(stage, 'themed', 'app.asar');
  fs.mkdirSync(path.dirname(output));
  const nativeNames = info.files.filter((item) => item.unpacked).map((item) => item.name);
  const options = unpackOptions(nativeNames);
  await asar.createPackageWithOptions(extracted, output, options);
  verifyUnpacked(output, originals);
  const after = archiveInfo(output);
  const beforeNames = info.files.map((item) => item.name).sort();
  const afterNames = after.files.map((item) => item.name).filter((name) => name !== 'out/renderer/assets/deepseek-bg.mp4').sort();
  assertSame(afterNames, beforeNames, 'Archive file inventory changed unexpectedly.');
  for (const item of info.files.filter((item) => !item.unpacked && !item.link && item.name !== 'out/renderer/index.html')) {
    const nativePath = item.name.split('/').join(path.sep);
    const expected = item.name === 'out/main/index.js'
      ? Buffer.from(fixCaptionColors(asar.extractFile(snapshot, nativePath).toString('utf8')))
      : asar.extractFile(snapshot, nativePath);
    if (!expected.equals(asar.extractFile(output, nativePath))) {
      throw new Error('Unexpected application-file change: ' + item.name);
    }
  }
  // This directory was created by this invocation and is not a backup or output.
  fs.rmSync(extracted, { recursive: true, force: true });
  return output;
}

function readManifest(file) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (m.format !== 1 || m.version !== '2.0.24') throw new Error('Unsupported manifest.');
  return m;
}

function verifyArchive(file, expectedHash, unpacked) {
  if (hash(file) !== expectedHash) throw new Error('Archive integrity mismatch.');
  verifyUnpacked(file, unpacked);
}

function findOriginal(m, root, explicitBackup) {
  const directories = path.join(root, 'backups');
  const candidates = explicitBackup ? [path.join(explicitBackup, 'app.asar')] : [m.snapshot];
  if (!explicitBackup && fs.existsSync(directories)) {
    for (const name of fs.readdirSync(directories)) candidates.push(path.join(directories, name, 'app.asar'));
  }
  for (const candidate of candidates) {
    try {
      verifyArchive(candidate, m.originalHash, m.unpacked);
      return candidate;
    } catch { /* Try the next version-bound original; never accept unverified bytes. */ }
  }
  throw new Error('No verified original archive available. Keep prepared/ and backups/.');
}

function loadManifest(operation, file = MANIFEST, root = ROOT, explicitBackup) {
  const m = readManifest(file);
  m.snapshot = findOriginal(m, root, explicitBackup);
  if (operation === 'install') verifyArchive(m.output, m.themedHash, m.unpacked);
  return m;
}

function replaceArchive(source, target, expectedCurrent, expectedNew, checkClosed = assertDesktopClosed) {
  const temporary = target + '.theme-stage-' + process.pid;
  if (fs.existsSync(temporary)) throw new Error('Replacement staging file already exists.');
  try {
    if (hash(target) !== expectedCurrent) throw new Error('Installed application changed; replacement refused.');
    fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
    if (hash(temporary) !== expectedNew) throw new Error('Staged replacement integrity mismatch.');
    checkClosed();
    if (hash(target) !== expectedCurrent) throw new Error('Installed application changed during replacement.');
    // Same-directory rename replaces only the ASAR; existing native files remain untouched.
    fs.renameSync(temporary, target);
    asar.uncache(target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function apply(restore = false, explicitBackup) {
  assertDesktopClosed();
  if (explicitBackup && !restore) throw new Error('--backup is only valid for restore.');
  const m = loadManifest(restore ? 'restore' : 'install',
    explicitBackup ? path.join(explicitBackup, 'manifest.json') : MANIFEST, ROOT, explicitBackup);
  const target = path.join(m.app, 'resources', 'app.asar');
  const installedHash = hash(target);
  const desired = restore ? m.originalHash : m.themedHash;
  if (installedHash === desired) {
    console.log(restore ? 'Already restored.' : 'Theme already installed.');
    return;
  }
  const expected = resolveExpectedCurrent(m, installedHash, restore);
  verifyUnpacked(target, m.unpacked);
  if (!restore) {
    const backup = path.join(ROOT, 'backups', m.version + '-' + m.originalHash.slice(0, 12));
    const saved = ensureBackup(backup, m.snapshot, m,
      (file) => verifyArchive(file, m.originalHash, m.unpacked));
    console.log('Verified original backup: ' + saved);
  }
  replaceArchive(restore ? m.snapshot : m.output, target, expected, desired);
  console.log(restore ? 'Original application restored. You may reopen OpenCode.' : 'Maid Whale theme installed. You may reopen OpenCode.');
}

function resolveExpectedCurrent(manifest, installedHash, restore) {
  const knownThemes = [manifest.themedHash, ...(manifest.acceptedThemedHashes || [])];
  if (knownThemes.includes(installedHash) || (!restore && installedHash === manifest.originalHash)) return installedHash;
  throw new Error('Application differs from recorded versions. Do not restore across updates.');
}

if (require.main === module) {
  const command = process.argv[2];
  Promise.resolve().then(() => {
    if (command === 'prepare') return prepare();
    if (command === 'install') return apply();
    if (command === 'restore') {
      if (process.argv[3] && (process.argv[3] !== '--backup' || !process.argv[4] || process.argv.length !== 5)) {
        throw new Error('Usage: node deploy.cjs restore [--backup <directory>]');
      }
      return apply(true, process.argv[4] ? path.resolve(process.argv[4]) : undefined);
    }
    throw new Error('Usage: node deploy.cjs prepare|install|restore [--backup <directory>]');
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { archiveInfo, unpackedHashes, verifyAsset, replaceArchive, assertDesktopClosed, unpackOptions, resolveExpectedCurrent, fixCaptionColors, loadManifest, prepare };
