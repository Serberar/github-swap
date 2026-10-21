const fs = require('fs');
const path = require('path');
const os = require('os');
const { run } = require('./exec');

const REPO_PATH_RE =
  /(?:^git@[^:]+:|^ssh:\/\/git@[^/]+\/|^https?:\/\/(?:[^@/]+@)?github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/;

function toSlash(p) {
  return p.replace(/\\/g, '/');
}

function identityFilePath(alias) {
  return path.join(os.homedir(), `.gitconfig-gswap-${alias.replace(/[^\w.-]/g, '_')}`);
}

// Fichero incluido por carpeta: identidad + reescritura de URLs para que
// cualquier repo dentro de la carpeta use la clave de esta cuenta.
function writeIdentity(alias, { name, email }) {
  const lines = ['# Generado por GitHub Swap', '[user]', `\tname = ${name || ''}`, `\temail = ${email || ''}`];
  if (alias !== 'github.com') {
    lines.push(`[url "git@${alias}:"]`, '\tinsteadOf = git@github.com:', '\tinsteadOf = https://github.com/');
  }
  fs.writeFileSync(identityFilePath(alias), lines.join('\n') + '\n');
}

function folderKey(folder) {
  const f = toSlash(path.resolve(folder)).replace(/\/?$/, '/');
  return `includeIf.gitdir/i:${f}.path`;
}

async function mapFolder(folder, alias, account) {
  writeIdentity(alias, account);
  const r = await run('git', ['config', '--global', folderKey(folder), toSlash(identityFilePath(alias))]);
  if (!r.ok) throw new Error(r.stderr);
}

async function unmapFolder(folder) {
  await run('git', ['config', '--global', '--unset-all', folderKey(folder)]);
}

async function setGlobalIdentity({ name, email }) {
  await run('git', ['config', '--global', 'user.name', name]);
  await run('git', ['config', '--global', 'user.email', email]);
}

async function getGlobalIdentity() {
  const [n, e] = await Promise.all([
    run('git', ['config', '--global', 'user.name']),
    run('git', ['config', '--global', 'user.email']),
  ]);
  return { name: n.stdout.trim(), email: e.stdout.trim() };
}

function aliasFromUrl(url) {
  if (!url) return null;
  let m = url.match(/^git@([^:]+):/) || url.match(/^ssh:\/\/git@([^/:]+)/);
  if (m) return m[1];
  if (/^https?:\/\/(?:[^@/]+@)?github\.com\//.test(url)) return 'https';
  return null;
}

// Carpetas que nunca contienen proyectos del usuario y harían la búsqueda eterna.
const SKIP = new Set(
  [
    'node_modules', 'appdata', '$recycle.bin', 'system volume information', 'windows', 'program files',
    'program files (x86)', 'programdata', 'recovery', 'perflogs', 'msocache', 'vendor', 'venv',
    '__pycache__', 'site-packages', 'bower_components', 'dist', 'build', 'target', 'obj', 'bin',
  ].map((s) => s.toLowerCase())
);

function driveRoots() {
  if (process.platform !== 'win32') return [os.homedir()];
  const roots = [];
  for (let c = 67; c <= 90; c++) {
    const root = String.fromCharCode(c) + ':\\';
    if (fs.existsSync(root)) roots.push(root);
  }
  return roots;
}

// Recorre los discos buscando carpetas con .git, con varias lecturas en paralelo.
async function findReposDeep(roots, onProgress, maxDepth = 9) {
  const found = [];
  const queue = roots.map((dir) => ({ dir, depth: 0 }));
  let scanned = 0;
  let lastReport = 0;

  async function visit({ dir, depth }) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    scanned++;
    if (entries.some((e) => e.name === '.git')) {
      found.push(dir);
      return;
    }
    if (depth >= maxDepth) return;
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name.toLowerCase())) {
        queue.push({ dir: path.join(dir, e.name), depth: depth + 1 });
      }
    }
    if (onProgress && Date.now() - lastReport > 250) {
      lastReport = Date.now();
      onProgress({ scanned, found: found.length, current: dir });
    }
  }

  let active = 0;
  await new Promise((resolve) => {
    const pump = () => {
      while (active < 24 && queue.length) {
        active++;
        visit(queue.shift()).finally(() => {
          active--;
          pump();
        });
      }
      if (!active && !queue.length) resolve();
    };
    pump();
  });
  return found;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const n = i++;
        out[n] = await fn(items[n]);
      }
    })
  );
  return out;
}

async function repoInfo(dir) {
  const [raw, eff, email] = await Promise.all([
    run('git', ['-C', dir, 'config', '--get', 'remote.origin.url']),
    run('git', ['-C', dir, 'ls-remote', '--get-url', 'origin']),
    run('git', ['-C', dir, 'config', 'user.email']),
  ]);
  const url = raw.stdout.trim();
  const effectiveUrl = url ? eff.stdout.trim() : '';
  return {
    path: dir,
    name: path.basename(dir),
    url,
    fullName: url.match(REPO_PATH_RE)?.[1] || null,
    effectiveUrl,
    alias: aliasFromUrl(effectiveUrl),
    email: email.stdout.trim(),
  };
}

// Busca en todos los discos y se queda solo con los proyectos que vienen de GitHub.
async function scanComputer(isGitHubAlias, onProgress) {
  const dirs = await findReposDeep(driveRoots(), onProgress);
  onProgress?.({ scanned: null, found: dirs.length, current: 'Revisando proyectos encontrados…' });
  const infos = await mapLimit(dirs, 8, repoInfo);
  return infos
    .filter((r) => r.fullName && (r.alias === 'https' || isGitHubAlias(r.alias)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function assignRepo(dir, alias, account) {
  const { url } = await repoInfo(dir);
  const m = url.match(REPO_PATH_RE);
  if (!m) throw new Error(`No reconozco el remoto "${url}" como repo de GitHub`);
  const steps = [
    ['remote', 'set-url', 'origin', `git@${alias}:${m[1]}.git`],
    ['config', 'user.name', account.name],
    ['config', 'user.email', account.email],
  ];
  for (const args of steps) {
    const r = await run('git', ['-C', dir, ...args]);
    if (!r.ok) throw new Error(r.stderr);
  }
  return repoInfo(dir);
}

async function cloneRepo(url, alias, parent, account) {
  const m = url.trim().match(REPO_PATH_RE);
  if (!m) throw new Error('URL no válida. Usa algo como https://github.com/usuario/repo');
  const dest = path.join(parent, m[1].split('/')[1]);
  if (fs.existsSync(dest)) throw new Error(`Ya existe ${dest}`);
  const r = await run(
    'git',
    ['-c', 'core.sshCommand=ssh -o StrictHostKeyChecking=accept-new', 'clone', `git@${alias}:${m[1]}.git`, dest],
    { timeout: 10 * 60 * 1000 }
  );
  if (!r.ok) throw new Error(r.stderr || 'git clone falló');
  await run('git', ['-C', dest, 'config', 'user.name', account.name]);
  await run('git', ['-C', dest, 'config', 'user.email', account.email]);
  return dest;
}

async function gitIn(dir, args, timeout = 60000) {
  const r = await run('git', ['-C', dir, ...args], { timeout });
  if (!r.ok) throw new Error((r.stderr || r.stdout).trim());
  return r.stdout;
}

// Estado frente a GitHub: archivos cambiados y commits por subir/traer.
async function localStatus(dir, { fetch = true } = {}) {
  if (fetch) await run('git', ['-C', dir, 'fetch', '--quiet', 'origin'], { timeout: 30000 }); // sin red: lo último conocido
  const out = await gitIn(dir, ['status', '--porcelain=v1', '-b', '-z', '--untracked-files=all']);
  const parts = out.split('\0');
  const head = parts.shift() || '';
  const changes = [];
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    const code = parts[i].slice(0, 2);
    const change = { code: code.trim(), file: parts[i].slice(3), from: null };
    if (code[0] === 'R' || code[0] === 'C') change.from = parts[++i]; // con -z el nombre anterior va a continuación
    changes.push(change);
  }
  return {
    ahead: Number(head.match(/ahead (\d+)/)?.[1] || 0),
    behind: Number(head.match(/behind (\d+)/)?.[1] || 0),
    changes,
  };
}

// Devuelve un archivo a como estaba en el último commit (o lo borra si es nuevo).
async function discardFile(dir, file) {
  const { changes } = await localStatus(dir, { fetch: false });
  const c = changes.find((x) => x.file === file);
  if (!c) return;
  const removeNew = () => fs.promises.rm(path.join(dir, file), { force: true });
  if (c.code === '??') {
    await gitIn(dir, ['clean', '-f', '--', file]);
  } else if (c.code.startsWith('A')) {
    await gitIn(dir, ['rm', '-f', '--cached', '--', file]);
    await removeNew();
  } else if (c.code.startsWith('R')) {
    await gitIn(dir, ['rm', '-f', '--cached', '--', file]);
    await gitIn(dir, ['restore', '--source=HEAD', '--staged', '--worktree', '--', c.from]);
    await removeNew();
  } else {
    await gitIn(dir, ['restore', '--source=HEAD', '--staged', '--worktree', '--', file]);
  }
}

async function discardAll(dir) {
  await gitIn(dir, ['reset', '--hard', 'HEAD']);
  await gitIn(dir, ['clean', '-fd']);
}

async function setOrigin(dir, url) {
  await gitIn(dir, ['remote', 'set-url', 'origin', url]);
}

// Proyectos con trabajo pendiente (cambios sin subir o novedades en GitHub).
async function pendingWork(dirs, isKnownAlias) {
  const results = await mapLimit(dirs, 4, async (dir) => {
    if (!fs.existsSync(path.join(dir, '.git'))) return null;
    const info = await repoInfo(dir);
    if (!info.fullName || !isKnownAlias(info.alias)) return null;
    const st = await localStatus(dir).catch(() => null);
    if (!st || (!st.changes.length && !st.ahead && !st.behind)) return null;
    return { ...info, changes: st.changes.length, ahead: st.ahead, behind: st.behind };
  });
  return results.filter(Boolean);
}

async function pullProject(dir) {
  const r = await run('git', ['-C', dir, 'pull', '--rebase', '--autostash'], { timeout: 120000 });
  if (!r.ok) {
    await run('git', ['-C', dir, 'rebase', '--abort']);
    throw new Error(
      'Tus cambios y los de GitHub tocan las mismas líneas y no se pueden juntar solos. Ábrelo en VS Code para resolverlo.'
    );
  }
}

async function pushProject(dir, message) {
  const { changes } = await localStatus(dir);
  if (changes.length) {
    if (!message) throw new Error('Escribe qué has cambiado');
    await gitIn(dir, ['add', '-A']);
    await gitIn(dir, ['commit', '-m', message]);
  }
  const push = () => run('git', ['-C', dir, 'push', '-u', 'origin', 'HEAD'], { timeout: 120000 });
  let r = await push();
  if (!r.ok && /rejected|fetch first|non-fast-forward/i.test(r.stderr)) {
    // Alguien subió antes: traer sus cambios y volver a intentar
    await pullProject(dir);
    r = await push();
  }
  if (!r.ok) throw new Error(r.stderr.trim());
}

module.exports = {
  localStatus,
  discardFile,
  discardAll,
  setOrigin,
  pendingWork,
  repoInfo,
  pullProject,
  pushProject,
  mapFolder,
  unmapFolder,
  writeIdentity,
  setGlobalIdentity,
  getGlobalIdentity,
  scanComputer,
  assignRepo,
  cloneRepo,
};
