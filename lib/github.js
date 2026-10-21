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
  const out = await runWithCode(
    // admin:public_key: para que la app suba ella misma la llave SSH de la cuenta
    ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'ssh', '--skip-ssh-key', '--web', '--scopes', 'repo,read:org,admin:public_key'],
    onCode
  );
  const user = out.match(/Logged in as (\S+)/i)?.[1] || (await activeUser());
  if (previous && previous !== user) await run('gh', ['auth', 'switch', '--hostname', 'github.com', '--user', previous]);
  return user;
}

function runWithCode(args, onCode) {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', args, { windowsHide: true });
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
      code === 0 ? resolve(buf) : reject(new Error(code === null ? 'Cancelado' : buf.trim() || 'GitHub no dio permiso'));
    });
  });
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

function repoPath(fullName) {
  return '/repos/' + fullName.split('/').map(encodeURIComponent).join('/');
}

// branch: la rama en la que se trabaja en el ordenador; si no existe en GitHub se usa la principal.
async function repoDetails(user, fullName, branch) {
  const p = repoPath(fullName);
  const repo = await api(user, 'GET', p);
  const admin = !!repo.permissions?.admin;
  const commitsOf = (b) => api(user, 'GET', `${p}/commits?per_page=20${b ? `&sha=${encodeURIComponent(b)}` : ''}`);
  let shownBranch = branch || repo.default_branch;
  const [commits, collaborators, invitations, issues] = await Promise.all([
    commitsOf(branch)
      .catch(() => {
        shownBranch = repo.default_branch;
        return commitsOf(null);
      })
      .catch(() => []), // un repo vacío responde 409
    admin ? api(user, 'GET', `${p}/collaborators?affiliation=direct&per_page=100`) : [],
    admin ? api(user, 'GET', `${p}/invitations?per_page=100`) : [],
    repo.has_issues ? api(user, 'GET', `${p}/issues?state=open&per_page=50`) : [],
  ]);
  return {
    fullName: repo.full_name,
    name: repo.name,
    owner: repo.owner.login,
    private: repo.private,
    description: repo.description,
    url: repo.html_url,
    admin,
    archived: repo.archived,
    hasIssues: repo.has_issues,
    branch: shownBranch,
    defaultBranch: repo.default_branch,
    issues: issues
      .filter((i) => !i.pull_request) // la API mezcla pull requests con las tareas
      .map((i) => ({
        number: i.number,
        title: i.title,
        author: i.user?.login,
        date: i.created_at,
        comments: i.comments,
        url: i.html_url,
      })),
    commits: commits.map((c) => ({
      message: c.commit.message.split('\n')[0],
      author: c.author?.login || c.commit.author.name,
      date: c.commit.author.date,
      url: c.html_url,
    })),
    collaborators: collaborators
      .filter((c) => c.login.toLowerCase() !== repo.owner.login.toLowerCase())
      .map((c) => ({ login: c.login, avatar: c.avatar_url })),
    invitations: invitations.map((i) => ({
      id: i.id,
      login: i.invitee?.login || i.invitee?.email || '?',
      avatar: i.invitee?.avatar_url || null,
    })),
  };
}

async function updateRepo(user, fullName, patch) {
  return api(user, 'PATCH', repoPath(fullName), patch);
}

async function inviteCollaborator(user, fullName, login) {
  try {
    await api(user, 'GET', `/users/${encodeURIComponent(login)}`);
  } catch {
    throw new Error(`No existe ningún usuario de GitHub llamado «${login}»`);
  }
  await api(user, 'PUT', `${repoPath(fullName)}/collaborators/${encodeURIComponent(login)}`, { permission: 'push' });
}

async function removeCollaborator(user, fullName, login) {
  await api(user, 'DELETE', `${repoPath(fullName)}/collaborators/${encodeURIComponent(login)}`);
}

async function cancelInvitation(user, fullName, id) {
  await api(user, 'DELETE', `${repoPath(fullName)}/invitations/${Number(id)}`);
}

// Da de alta la llave pública en la cuenta. Si ya estaba subida, no es un error.
async function uploadKey(user, title, key) {
  try {
    await api(user, 'POST', '/user/keys', { title, key });
  } catch (err) {
    if (!/already in use/i.test(err.message)) throw err;
  }
}

async function createIssue(user, fullName, { title, body }) {
  await api(user, 'POST', `${repoPath(fullName)}/issues`, { title, body: body || undefined });
}

async function closeIssue(user, fullName, number) {
  await api(user, 'PATCH', `${repoPath(fullName)}/issues/${Number(number)}`, { state: 'closed', state_reason: 'completed' });
}

module.exports = {
  hasGh,
  token,
  login,
  uploadKey,
  createIssue,
  closeIssue,
  cancelLogin,
  listRepos,
  createRepo,
  repoDetails,
  updateRepo,
  inviteCollaborator,
  removeCollaborator,
  cancelInvitation,
};
