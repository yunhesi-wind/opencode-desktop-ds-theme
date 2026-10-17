const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const asar = require('@electron/asar');
const PRESET = require('./background.cjs');

const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const extract = (archive, name) => asar.extractFile(archive, name.split('/').join(path.sep));
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
  return { version: JSON.parse(extract(file, 'package.json')).version, files };
}
function unpackedHashes(archive, files) {
  return Object.fromEntries(files.filter((file) => file.unpacked)
    .map((file) => [file.name, hash(path.join(archive + '.unpacked', ...file.name.split('/')))]));
}
function verifyUnpacked(archive, expected) {
  const actual = unpackedHashes(archive, archiveInfo(archive).files);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Native/unpacked files changed.');
}
function verifyArchive(file, expected, unpacked) {
  if (hash(file) !== expected) throw new Error('Archive integrity mismatch: ' + file);
  verifyUnpacked(file, unpacked);
}
function verifyAsset(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size !== PRESET.size || hash(file) !== PRESET.sha256) {
    throw new Error('Background missing or SHA-256 mismatch.');
  }
}
function unpackOptions(names) {
  if (names.some((name) => /[{},*?\[\]!]/.test(name))) throw new Error('Unsupported native-file glob characters.');
  if (!names.length) return { dot: true };
  const patterns = names.map((name) => '**/' + name);
  return { unpack: patterns.length === 1 ? patterns[0] : '{' + patterns.join(',') + '}', dot: true };
}
function assertDesktopClosed() {
  if (process.platform !== 'win32') throw new Error('Deployment is Windows-only.');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -ieq 'OpenCode.exe' }).Count"],
  { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0 || !/^\d+$/.test(result.stdout.trim())) throw new Error('Cannot reliably check desktop processes.');
  if (Number(result.stdout.trim())) throw new Error('Save work and fully exit OpenCode Desktop first.');
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
    fs.renameSync(temporary, target);
    asar.uncache(target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function rendererEntry(html) {
  const entry = /<script[^>]+src="\.\/([^" ]+\.js)"/.exec(html)?.[1];
  if (!entry) throw new Error('Cannot locate native renderer entry.');
  return 'out/renderer/' + entry;
}

module.exports = { hash, extract, archiveInfo, unpackedHashes, verifyUnpacked, verifyArchive,
  verifyAsset, unpackOptions, assertDesktopClosed, replaceArchive, rendererEntry };
