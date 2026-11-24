const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseHosts } = require('../lib/ssh');
const { aliasFromUrl } = require('../lib/git');
const { newer, parseDigest, matches } = require('../lib/updater');
const { Store } = require('../lib/store');

test('newer compara versiones por números, no por texto', () => {
  assert.equal(newer('0.10.0', '0.9.1'), true);
  assert.equal(newer('0.9.1', '0.10.0'), false);
  assert.equal(newer('1.0.0', '1.0.0'), false);
});

test('una actualización sin huella o con otra huella se rechaza', () => {
  const file = Buffer.from('instalador');
  const sha256 = crypto.createHash('sha256').update(file).digest('hex');
  assert.equal(parseDigest(`sha256:${sha256}`), sha256);
  assert.equal(parseDigest('md5:abc'), null);
  assert.equal(parseDigest(undefined), null);
  assert.equal(matches(file, sha256), true);
  assert.equal(matches(Buffer.from('otro'), sha256), false);
  assert.equal(matches(file, null), false);
});

test('aliasFromUrl reconoce SSH, alias y HTTPS', () => {
  assert.equal(aliasFromUrl('git@github.com:ana/repo.git'), 'github.com');
  assert.equal(aliasFromUrl('git@github-trabajo:ana/repo.git'), 'github-trabajo');
  assert.equal(aliasFromUrl('ssh://git@github-trabajo/ana/repo.git'), 'github-trabajo');
  assert.equal(aliasFromUrl('https://github.com/ana/repo.git'), 'https');
  assert.equal(aliasFromUrl('https://gitlab.com/ana/repo.git'), null);
  assert.equal(aliasFromUrl(''), null);
});

test('parseHosts distingue los Host propios de los del usuario e ignora el resto', () => {
  const hosts = parseHosts([
    'Host github.com', '  IdentityFile ~/.ssh/personal',
    'Host servidor', '  HostName 10.0.0.1',
    'Host *', '  HostName github.com',
    '# >>> github-swap >>>',
    'Host github-trabajo', '  HostName github.com', '  IdentityFile "~/.ssh/trabajo"',
    '# <<< github-swap <<<',
  ].join('\n'));
  assert.deepEqual(hosts.map(({ alias, managed, identityFile }) => ({ alias, managed, identityFile })), [
    { alias: 'github.com', managed: false, identityFile: '~/.ssh/personal' },
    { alias: 'github-trabajo', managed: true, identityFile: '~/.ssh/trabajo' },
  ]);
});

test('Store conserva los datos y tolera un archivo dañado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gswap-'));
  const store = new Store(dir);
  store.account('trabajo').name = 'Ana';
  store.save();
  assert.equal(new Store(dir).account('trabajo').name, 'Ana');
  fs.writeFileSync(path.join(dir, 'github-swap.json'), '{mal');
  assert.deepEqual(new Store(dir).data, { accounts: {} });
  fs.rmSync(dir, { recursive: true });
});
