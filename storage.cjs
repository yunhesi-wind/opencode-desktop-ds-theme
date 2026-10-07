const fs = require('node:fs');
const path = require('node:path');

// Publish metadata only after a complete, parseable temporary file is on disk.
function writeJsonAtomic(file, value, io = fs) {
  const temporary = path.join(io.mkdtempSync(path.join(path.dirname(file), '.metadata-')), 'manifest.json');
  let published = false;
  try {
    const fd = io.openSync(temporary, 'wx');
    try {
      io.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
      io.fsyncSync(fd);
    } finally {
      io.closeSync(fd);
    }
    JSON.parse(io.readFileSync(temporary, 'utf8'));
    io.renameSync(temporary, file);
    published = true;
  } finally {
    try { io.rmSync(path.dirname(temporary), { recursive: true, force: true }); }
    catch (error) {
      // Once metadata is published, reporting failure would cause the caller to discard its referenced build.
      if (!published) throw error;
      console.warn('Metadata published; temporary-directory cleanup failed: ' + error.message);
    }
  }
}

// Never overwrite a suspect existing backup. Publish another verified copy instead.
function ensureBackup(directory, snapshot, manifest, verify, io = fs) {
  if (io.existsSync(directory)) {
    let saved;
    try {
      verify(path.join(directory, 'app.asar'));
      saved = JSON.parse(io.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
      if (saved.originalHash !== manifest.originalHash || saved.app !== manifest.app) throw new Error('Backup identity mismatch');
    } catch {
      directory += '-recovered-' + Date.now();
      saved = undefined;
    }
    if (saved) {
      writeJsonAtomic(path.join(directory, 'manifest.json'), {
        ...manifest, backupArchive: 'app.asar',
        acceptedThemedHashes: [...new Set([saved.themedHash, ...(saved.acceptedThemedHashes || []), ...(manifest.acceptedThemedHashes || [])])],
      }, io);
      return directory;
    }
  }
  io.mkdirSync(path.dirname(directory), { recursive: true });
  const temporary = io.mkdtempSync(path.join(path.dirname(directory), '.backup-'));
  try {
    const archive = path.join(temporary, 'app.asar');
    io.copyFileSync(snapshot, archive);
    if (io.existsSync(snapshot + '.unpacked')) io.cpSync(snapshot + '.unpacked', archive + '.unpacked', { recursive: true });
    verify(archive);
    writeJsonAtomic(path.join(temporary, 'manifest.json'), { ...manifest, backupArchive: 'app.asar' }, io);
    io.renameSync(temporary, directory);
    return directory;
  } finally {
    io.rmSync(temporary, { recursive: true, force: true });
  }
}

module.exports = { writeJsonAtomic, ensureBackup };
