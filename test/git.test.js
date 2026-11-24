// Git de verdad sobre repositorios temporales, con configuración global propia.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'gswap-git-')));
process.env.USERPROFILE = process.env.HOME = root;
process.env.GIT_CONFIG_GLOBAL = path.join(root, 'gitconfig');
process.env.GIT_CONFIG_NOSYSTEM = '1';
fs.writeFileSync(process.env.GIT_CONFIG_GLOBAL, '[user]\n\tname = Prueba\n\temail = prueba@example.com\n[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n');

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const git = require('../lib/git');

const run = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (dir, file, text) => fs.writeFileSync(path.join(dir, file), text);
const text = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
let n = 0, remote, work, other;

beforeEach(() => {
  const base = path.join(root, 'caso' + n++);
  remote = path.join(base, 'remoto.git');
  work = path.join(base, 'trabajo');
  other = path.join(base, 'otro');
  fs.mkdirSync(base);
  execFileSync('git', ['init', '-q', '--bare', remote]);
  execFileSync('git', ['clone', '-q', remote, work], { stdio: 'ignore' });
  write(work, 'a.txt', 'uno\n');
  run(work, 'add', '-A');
  run(work, 'commit', '-qm', 'inicio');
  run(work, 'push', '-q', '-u', 'origin', 'HEAD');
  execFileSync('git', ['clone', '-q', remote, other], { stdio: 'ignore' });
});
after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 }));

test('estado: cambios, nuevos, renombrados y nombres con espacios', async () => {
  write(work, 'a.txt', 'dos\n');
  write(work, 'con espacio.txt', 'x');
  let st = await git.localStatus(work);
  assert.deepEqual(st.changes.map((c) => [c.code, c.file]).sort(), [['??', 'con espacio.txt'], ['M', 'a.txt']]);
  run(work, 'checkout', '-q', '--', 'a.txt');
  run(work, 'mv', 'a.txt', 'b.txt');
  st = await git.localStatus(work);
  assert.deepEqual(st.changes.find((c) => c.code === 'R'), { code: 'R', file: 'b.txt', from: 'a.txt' });
});

test('subir guarda los cambios y los envía', async () => {
  write(work, 'nuevo.txt', 'hola\n');
  await assert.rejects(git.pushProject(work, ''), /qué has cambiado/);
  await git.pushProject(work, 'añade nuevo');
  assert.equal(run(remote, 'log', '-1', '--format=%s'), 'añade nuevo');
  assert.deepEqual(await git.localStatus(work), { ahead: 0, behind: 0, changes: [] });
});

test('subir cuando alguien subió antes junta las dos cosas', async () => {
  write(other, 'otro.txt', 'suyo\n');
  await git.pushProject(other, 'del otro');
  write(work, 'mio.txt', 'mío\n');
  await git.pushProject(work, 'mío');
  assert.deepEqual(run(remote, 'log', '--format=%s').split('\n'), ['mío', 'del otro', 'inicio']);
  assert.ok(fs.existsSync(path.join(work, 'otro.txt')));
});

test('un conflicto al traer no deja el proyecto a medias ni pierde lo tuyo', async () => {
  write(other, 'a.txt', 'versión del otro\n');
  await git.pushProject(other, 'cambia a');
  write(work, 'a.txt', 'versión mía\n');
  run(work, 'commit', '-qam', 'cambio a yo también');
  await assert.rejects(git.pullProject(work), /mismas líneas/);
  assert.equal(text(work, 'a.txt'), 'versión mía\n');
  assert.equal(fs.existsSync(path.join(work, '.git', 'rebase-merge')), false);
});

test('traer conserva los cambios sin guardar', async () => {
  write(other, 'b.txt', 'nuevo\n');
  await git.pushProject(other, 'b');
  write(work, 'a.txt', 'a medias\n');
  await git.pullProject(work);
  assert.equal(text(work, 'a.txt'), 'a medias\n');
  assert.ok(fs.existsSync(path.join(work, 'b.txt')));
});

test('descartar un archivo deja los demás como estaban', async () => {
  write(work, 'a.txt', 'cambiado\n');
  write(work, 'nuevo.txt', 'n');
  write(work, 'otro.txt', 'o');
  run(work, 'add', 'otro.txt');
  await git.discardFile(work, 'a.txt');
  assert.equal(text(work, 'a.txt'), 'uno\n');
  assert.ok(fs.existsSync(path.join(work, 'nuevo.txt')));
  await git.discardFile(work, 'nuevo.txt');
  await git.discardFile(work, 'otro.txt');
  assert.deepEqual((await git.localStatus(work, { fetch: false })).changes, []);
});

test('descartar un renombrado recupera el nombre anterior', async () => {
  run(work, 'mv', 'a.txt', 'b.txt');
  await git.discardFile(work, 'b.txt');
  assert.deepEqual([fs.existsSync(path.join(work, 'a.txt')), fs.existsSync(path.join(work, 'b.txt'))], [true, false]);
});

test('ignorar en este ordenador no cambia el repositorio', async () => {
  write(work, 'clave [1].txt', 'secreto');
  await git.ignoreLocal(work, ['clave [1].txt']);
  assert.deepEqual((await git.localStatus(work, { fetch: false })).changes, []);
  assert.equal(run(work, 'status', '--porcelain'), '');
});

test('asignar un proyecto cambia remoto e identidad solo en él', async () => {
  run(work, 'remote', 'set-url', 'origin', 'https://github.com/ana/proyecto.git');
  const info = await git.assignRepo(work, 'github-trabajo', { name: 'Ana', email: 'ana@example.com' });
  assert.deepEqual([info.url, info.alias, info.email, info.fullName], ['git@github-trabajo:ana/proyecto.git', 'github-trabajo', 'ana@example.com', 'ana/proyecto']);
  assert.equal((await git.getGlobalIdentity()).email, 'prueba@example.com');
  run(work, 'remote', 'set-url', 'origin', 'https://gitlab.com/ana/x.git');
  await assert.rejects(git.assignRepo(work, 'github-trabajo', { name: 'A', email: 'a@b.c' }), /No reconozco/);
});

test('una carpeta asignada usa la llave y el email de su cuenta', async () => {
  const folder = path.dirname(work);
  await git.mapFolder(folder, 'github-trabajo', { name: 'Ana', email: 'ana@trabajo.example' });
  run(work, 'remote', 'set-url', 'origin', 'https://github.com/ana/proyecto.git');
  const info = await git.repoInfo(work);
  assert.equal(info.effectiveUrl, 'git@github-trabajo:ana/proyecto.git');
  assert.equal(info.email, 'ana@trabajo.example');
  await git.unmapFolder(folder);
  assert.equal((await git.repoInfo(work)).alias, 'https');
});

test('trabajo pendiente: solo proyectos con algo que hacer', async () => {
  const point = (d) => run(d, 'remote', 'set-url', '--push', 'origin', remote);
  run(work, 'config', `url.${remote.replace(/\\/g, '/')}.insteadOf`, 'git@github-x:ana/p.git');
  point(work);
  const list = await git.pendingWork([work, path.join(root, 'no-existe')], () => true);
  assert.deepEqual(list, []); // el remoto no es de GitHub
});

test('clonar una dirección que no es de GitHub se rechaza', async () => {
  for (const bad of ['', 'hola', 'https://example.com/a/b', '--upload-pack=calc']) await assert.rejects(git.cloneRepo(bad, 'github.com', root, {}), /URL no válida/);
});
