// Claves y ~/.ssh/config, en una carpeta de usuario temporal: nunca se toca la del equipo.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gswap-home-'));
process.env.USERPROFILE = process.env.HOME = home;

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const ssh = require('../lib/ssh');

const dir = path.join(home, '.ssh');
const config = path.join(dir, 'config');
const read = () => fs.readFileSync(config, 'utf8');

beforeEach(() => fs.rmSync(dir, { recursive: true, force: true }));
after(() => fs.rmSync(home, { recursive: true, force: true }));

test('crear una cuenta genera la llave y su Host', async () => {
  const key = await ssh.addAccountHost('github-trabajo', 'ana@example.com');
  assert.ok(fs.existsSync(key) && fs.existsSync(key + '.pub'));
  assert.match(ssh.readPublicKey(key), /^ssh-ed25519 \S+ ana@example\.com$/);
  const [host] = ssh.parseHosts();
  assert.deepEqual({ alias: host.alias, hostName: host.hostName, managed: host.managed }, { alias: 'github-trabajo', hostName: 'github.com', managed: true });
  assert.match(read(), /IdentitiesOnly yes/);
});

test('lo que el usuario tenía en el archivo no cambia, y queda copia', async () => {
  fs.mkdirSync(dir);
  const mine = '# mis equipos\nHost servidor\n    HostName 10.0.0.1\n    User root\n';
  fs.writeFileSync(config, mine);
  await ssh.addAccountHost('github-uno', 'a@example.com');
  assert.ok(read().startsWith(mine.trimEnd()));
  assert.equal(fs.readFileSync(config + '.github-swap.bak', 'utf8'), mine);
});

test('añadir y quitar varias cuentas deja un solo bloque', async () => {
  await ssh.addAccountHost('github-uno', 'a@example.com');
  await ssh.addAccountHost('github-dos', 'b@example.com');
  assert.equal(read().split('>>> github-swap >>>').length, 2);
  ssh.removeManagedHost('github-uno');
  assert.deepEqual(ssh.parseHosts().map((h) => h.alias), ['github-dos']);
});

test('quitar una cuenta no borra su llave', async () => {
  const key = await ssh.addAccountHost('github-uno', 'a@example.com');
  ssh.removeManagedHost('github-uno');
  assert.ok(fs.existsSync(key));
});

test('una llave que ya existe no se sobrescribe', async () => {
  const key = await ssh.addAccountHost('github-uno', 'a@example.com');
  const before = fs.readFileSync(key, 'utf8');
  ssh.removeManagedHost('github-uno');
  await ssh.addAccountHost('github-uno', 'otra@example.com');
  assert.equal(fs.readFileSync(key, 'utf8'), before);
});

test('no se puede quitar un Host del usuario', () => {
  fs.mkdirSync(dir);
  fs.writeFileSync(config, 'Host github.com\n    IdentityFile ~/.ssh/personal\n');
  assert.throws(() => ssh.removeManagedHost('github.com'), /creadas desde la app/);
  assert.match(read(), /personal/);
});

test('alias repetidos o con caracteres raros se rechazan', async () => {
  await ssh.addAccountHost('github-uno', 'a@example.com');
  await assert.rejects(ssh.addAccountHost('GitHub-UNO', 'a@example.com'), /Ya existe/);
  for (const bad of ['con espacio', 'a;b', 'a\nHost evil', '../x', '']) await assert.rejects(ssh.addAccountHost(bad, 'a@example.com'), /alias/);
});

test('sin archivo o sin llave no falla', () => {
  assert.deepEqual(ssh.parseHosts(), []);
  assert.equal(ssh.readPublicKey('~/.ssh/no-existe'), null);
  assert.equal(ssh.expandHome('~/x'), home + '/x');
  assert.equal(ssh.expandHome(null), null);
});
