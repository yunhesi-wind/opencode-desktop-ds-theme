const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { validFile, options } = require('../download-background.cjs');

test('download options require explicit license acknowledgement and reject invalid proxy schemes', () => {
  assert.equal(options([]).acknowledged, false);
  const opt = options(['--accept-upstream-license', '--system-proxy']);
  assert.equal(opt.acknowledged, true);
  assert.equal(opt.useSystemProxy, true);
  assert.equal(options(['--proxy', 'http://127.0.0.1:7897']).proxy, 'http://127.0.0.1:7897');
  assert.throws(() => options(['--proxy', 'file:///private']), /Unsupported/);
  assert.throws(() => options(['--proxy']), /incomplete/);
  assert.throws(() => options(['--unexpected']), /Unknown/);
});

test('cached media must match both size and SHA-256', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-download-test-'));
  try {
    const file = path.join(root, 'fixture.mp4');
    const expected = { size: 4, sha256: crypto.createHash('sha256').update('GOOD').digest('hex') };
    assert.equal(validFile(file, expected), false);
    fs.writeFileSync(file, 'BAD!');
    assert.equal(validFile(file, expected), false);
    fs.writeFileSync(file, 'GOOD');
    assert.equal(validFile(file, expected), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
