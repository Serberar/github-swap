const { spawn } = require('child_process');
const { run } = require('./exec');

// El acceso a la API (listar y crear repos) se apoya en la sesión de `gh`,
// que admite varias cuentas a la vez y guarda los tokens en el llavero de Windows.

async function hasGh() {
  return (await run('gh', ['--version'])).ok;
}

async function token(user) {
  const r = await run('gh', ['auth', 'token', '--hostname', 'github.com', '--user', user]);
  return r.ok ? r.stdout.trim() : null;
}

async function activeUser() {
  const r = await run('gh', ['auth', 'status', '--active', '--hostname', 'github.com']);
  return (r.stdout + r.stderr).match(/account (\S+)/)?.[1] || null;
}

let loginChild = null;

// Lanza el login web de gh. onCode recibe el código de un solo uso para mostrarlo.
// Al terminar deja activa la cuenta que estaba antes, para no cambiarle `gh` al usuario.
async function login(onCode) {
  const previous = await activeUser();
  const out = await new Promise((resolve, reject) => {
    const child = spawn(
      'gh',
      ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'ssh', '--skip-ssh-key', '--web', '--scopes', 'repo,read:org'],
      { windowsHide: true }
    );
    loginChild = child;
    let buf = '';
    let sent = false;
    const onData = (d) => {
      buf += d;
      const m = buf.match(/code[^A-Z0-9]*([A-Z0-9]{4}-[A-Z0-9]{4})/i);
      if (m && !sent) {
        sent = true;
        onCode(m[1]);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('close', (code) => {
      loginChild = null;
      code === 0 ? resolve(buf) : reject(new Error(code === null ? 'Cancelado' : buf.trim() || 'No se pudo iniciar sesión'));
    });
  });
  const user = out.match(/Logged in as (\S+)/i)?.[1] || (await activeUser());
  if (previous && previous !== user) await run('gh', ['auth', 'switch', '--hostname', 'github.com', '--user', previous]);
  return user;
}

function cancelLogin() {
  loginChild?.kill();
}

async function api(user, method, path, body) {
  const t = await token(user);
  if (!t) throw new Error('Esta cuenta aún no tiene acceso a sus proyectos');
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${t}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.errors?.map((e) => e.message).filter(Boolean).join('. ');
    throw new Error(detail || data.message || `GitHub respondió ${res.status}`);
  }
  return data;
}

async function listRepos(user) {
  const repos = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await api(
      user,
      'GET',
      `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`
    );
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.map((r) => ({
    fullName: r.full_name,
    name: r.name,
    owner: r.owner.login,
    description: r.description,
    private: r.private,
    updatedAt: r.pushed_at || r.updated_at,
    url: r.html_url,
  }));
}

async function createRepo(user, { name, description, private: isPrivate }) {
  const r = await api(user, 'POST', '/user/repos', {
    name,
    description: description || undefined,
    private: !!isPrivate,
    auto_init: true,
  });
  return { fullName: r.full_name, name: r.name, url: r.html_url };
}

module.exports = { hasGh, token, login, cancelLogin, listRepos, createRepo };
