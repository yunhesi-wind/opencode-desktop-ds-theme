const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const preset = require('./background.cjs');

function validFile(file, expected = preset) {
  if (!fs.existsSync(file) || fs.statSync(file).size !== expected.size) return false;
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === expected.sha256;
}

function systemProxy() {
  if (process.platform !== 'win32') throw new Error('--system-proxy currently supports Windows only.');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "$p=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -ErrorAction Stop; @{enabled=$p.ProxyEnable; server=$p.ProxyServer} | ConvertTo-Json -Compress"],
    { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Cannot read Windows system proxy. Use --proxy <URL>.');
  const proxy = JSON.parse(result.stdout);
  if (!proxy.enabled || !proxy.server) return undefined;
  const entries = proxy.server.split(';');
  const preferred = entries.find((entry) => entry.startsWith('https=')) || entries.find((entry) => entry.startsWith('http='));
  const server = preferred ? preferred.slice(preferred.indexOf('=') + 1) : entries[0];
  return server.includes('://') ? server : 'http://' + server;
}

function options(args) {
  const result = { acknowledged: false, useSystemProxy: false, proxy: undefined };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--accept-upstream-license') result.acknowledged = true;
    else if (args[i] === '--system-proxy') result.useSystemProxy = true;
    else if (args[i] === '--proxy' && args[i + 1]) {
      result.proxy = args[++i];
      if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(new URL(result.proxy).protocol)) throw new Error('Unsupported proxy URL.');
    } else throw new Error('Unknown or incomplete argument: ' + args[i]);
  }
  return result;
}

function download(args) {
  const config = options(args);
  if (!config.acknowledged) throw new Error('Read THIRD_PARTY_NOTICES.md first. Download requires --accept-upstream-license. This flag does not establish copyright permission.');
  const directory = path.join(__dirname, 'assets');
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, preset.filename);
  if (validFile(target)) { console.log('Background already present; size and SHA-256 verified.'); return; }
  // Invalid existing assets are not silently deleted or overwritten.
  if (fs.existsSync(target)) throw new Error('Existing background failed validation. Move it aside and retry.');
  const temporaryDir = fs.mkdtempSync(path.join(directory, '.download-'));
  const temporary = path.join(temporaryDir, preset.filename);
  try {
    const proxy = config.proxy || (config.useSystemProxy ? systemProxy() : undefined);
    const flags = ['--fail', '--location', '--proto', '=https', '--proto-redir', '=https',
      '--connect-timeout', '15', '--max-time', '180', '--max-filesize', String(preset.size),
      '--retry', '1', '--output', temporary, ...(proxy ? ['--proxy', proxy] : []), preset.url];
    const result = spawnSync(process.platform === 'win32' ? 'curl.exe' : 'curl', flags,
      { stdio: 'inherit', windowsHide: true, timeout: 400000 });
    if (result.error || result.status !== 0) throw new Error('Download failed; no background installed.');
    if (!validFile(temporary)) throw new Error('Downloaded background failed size or SHA-256 verification.');
    fs.copyFileSync(temporary, target, fs.constants.COPYFILE_EXCL);
    console.log('Background downloaded and verified.');
  } finally { fs.rmSync(temporaryDir, { recursive: true, force: true }); }
}

if (require.main === module) {
  try { download(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validFile, options };
