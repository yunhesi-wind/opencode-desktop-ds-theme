const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('repository exposes only the current selectable-theme implementation', () => {
  for (const name of ['theme.cjs', 'theme.css', 'archive.cjs', 'deploy.cjs', 'storage.cjs',
    'Install-Theme.cmd', 'Restore-Theme.cmd', 'vendor/LICENSE']) {
    assert.ok(fs.existsSync(path.join(root, name)), 'Missing current file: ' + name);
  }
  for (const name of ['selectable-experiment.cjs', 'selectable-theme.cjs', 'theme-fixed.css',
    'EXPERIMENT-SELECTABLE.md', 'Install-Selectable-Experiment.cmd', 'Rollback-Selectable-Experiment.cmd',
    'Upgrade-Theme.cmd', 'Update-Theme.cmd', 'preview-server.cjs', 'preview', 'prepared', 'experiments', 'vendor/upstream-engine.cjs']) {
    assert.equal(fs.existsSync(path.join(root, name)), false, 'Retired file reintroduced: ' + name);
  }
});

test('package version, commands and documentation describe the single current workflow', () => {
  const pkg = require('../package.json');
  const lock = require('../package-lock.json');
  assert.equal(pkg.version, '2.0.0');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(pkg.scripts['prepare-theme'], 'node deploy.cjs prepare');
  assert.equal(pkg.scripts['restore-theme'], 'node deploy.cjs restore');
  const installer = fs.readFileSync(path.join(root, 'Install-Theme.cmd'), 'utf8');
  assert.match(installer, /node deploy\.cjs prepare --upgrade/);
  assert.match(installer, /node deploy\.cjs install/);
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.ok(readme.includes('深海大肥鱼'));
  assert.ok(readme.includes('恢复**官方原版**'));
  assert.ok(readme.includes('runtime/manifest.json'));
  assert.doesNotMatch(readme, /EXPERIMENT-SELECTABLE\.md|selectable-experiment\.cjs|Rollback-Selectable/);
});
