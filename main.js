const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const ssh = require('./lib/ssh');
const git = require('./lib/git');
const github = require('./lib/github');
const { Store } = require('./lib/store');

let win;
let store;

// Misma carpeta de datos con `npm start` y con la app instalada (que se llama "GitHub Swap").
app.setPath('userData', path.join(app.getPath('appData'), 'github-swap'));

function defaultLabel(alias) {
  if (alias === 'github.com') return 'Principal';
  const base = alias.replace(/^github[-_.]?/i, '') || alias;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function slug(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function findHost(alias) {
  const host = ssh.parseHosts().find((h) => h.alias === alias);
  if (!host) throw new Error('Esa cuenta ya no existe en la configuración');
  return host;
}

function accountView(host) {
  const meta = store.account(host.alias);
  return {
    alias: host.alias,
    label: meta.label || defaultLabel(host.alias),
    name: meta.name,
    email: meta.email,
    folders: meta.folders,
    githubUser: meta.githubUser || null,
    managed: host.managed,
    keyFile: host.identityFile ? ssh.expandHome(host.identityFile) : null,
    hasKey: !!(host.identityFile && ssh.readPublicKey(host.identityFile)),
  };
}

async function pickFolder(title, defaultPath) {
  const r = await dialog.showOpenDialog(win, { title, defaultPath, properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
}

function readyAccount(alias) {
  const meta = store.account(alias);
  if (!meta.name || !meta.email) throw new Error('Primero pon tu nombre y email en esta cuenta (Editar)');
  if (!meta.githubUser) throw new Error('Primero pulsa «Comprobar» en esta cuenta');
  return meta;
}

// Carpeta donde se descargan los proyectos de la cuenta. La primera vez se pide
// y queda asignada a la cuenta, así todo lo que haya dentro usa su llave y su email.
async function accountFolder(alias) {
  const meta = store.account(alias);
  if (meta.folders[0]) return meta.folders[0];
  const folder = await pickFolder(`¿Dónde guardamos los proyectos de «${meta.label || defaultLabel(alias)}»?`);
  if (!folder) return null;
  await git.mapFolder(folder, alias, meta);
  meta.folders.push(folder);
  store.save();
  return folder;
}

// Dónde está descargado un repo: primero en las carpetas de la cuenta,
// después en lo que encontró la última búsqueda en el ordenador.
function localCopy(meta, name, fullName) {
  for (const f of meta.folders) {
    const dir = path.join(f, name);
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
  }
  const found = store.data.localScan?.repos.find((r) => r.fullName?.toLowerCase() === fullName?.toLowerCase());
  return found && fs.existsSync(found.path) ? found.path : null;
}

const handlers = {
  async listAccounts() {
    const accounts = ssh.parseHosts().map(accountView);
    const gh = await github.hasGh();
    await Promise.all(
      accounts.map(async (a) => {
        a.apiAccess = gh && !!a.githubUser && !!(await github.token(a.githubUser));
      })
    );
    return { accounts, hasGh: gh, global: await git.getGlobalIdentity() };
  },

  async grantAccess(alias) {
    const meta = readyAccount(alias);
    const user = await github.login((code) => win.webContents.send('login-code', code));
    if (user && user.toLowerCase() !== meta.githubUser.toLowerCase()) {
      throw new Error(
        `Has entrado como @${user}, pero esta cuenta es @${meta.githubUser}. ` +
          `Cierra sesión en GitHub en el navegador, entra con @${meta.githubUser} y vuelve a intentarlo.`
      );
    }
    return user;
  },

  async cancelAccess() {
    github.cancelLogin();
  },

  async accountRepos(alias) {
    const meta = readyAccount(alias);
    const repos = await github.listRepos(meta.githubUser);
    return {
      folder: meta.folders[0] || null,
      repos: repos.map((r) => ({ ...r, localPath: localCopy(meta, r.name, r.fullName) })),
    };
  },

  // preferredPath: una copia concreta (p. ej. la del aviso), si sigue existiendo.
  async repoDetails(alias, fullName, preferredPath) {
    const meta = readyAccount(alias);
    const localPath =
      preferredPath && fs.existsSync(path.join(preferredPath, '.git'))
        ? preferredPath
        : localCopy(meta, fullName.split('/')[1], fullName);
    const branch = localPath ? await git.currentBranch(localPath) : null;
    return { ...(await github.repoDetails(meta.githubUser, fullName, branch)), localPath };
  },

  async setVisibility(alias, fullName, isPrivate) {
    await github.updateRepo(readyAccount(alias).githubUser, fullName, { private: !!isPrivate });
  },

  async setDescription(alias, fullName, description) {
    await github.updateRepo(readyAccount(alias).githubUser, fullName, { description: description || '' });
  },

  async inviteCollaborator(alias, fullName, login) {
    const clean = String(login || '').trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9-]+$/.test(clean)) throw new Error('Escribe el nombre de usuario de GitHub, sin espacios');
    await github.inviteCollaborator(readyAccount(alias).githubUser, fullName, clean);
  },

  async removeCollaborator(alias, fullName, login) {
    await github.removeCollaborator(readyAccount(alias).githubUser, fullName, login);
  },

  async cancelInvitation(alias, fullName, id) {
    await github.cancelInvitation(readyAccount(alias).githubUser, fullName, id);
  },

  async localStatus(dir) {
    return git.localStatus(dir);
  },

  async pullProject(dir) {
    await git.pullProject(dir);
    return git.localStatus(dir);
  },

  async pushProject(dir, message) {
    await git.pushProject(dir, String(message || '').trim());
    return git.localStatus(dir);
  },

  async openInEditor(dir) {
    await shell.openExternal('vscode://file/' + encodeURI(dir.replace(/\\/g, '/')));
  },

  async pendingWork() {
    const aliases = new Set(ssh.parseHosts().map((h) => h.alias));
    const dirs = new Map();
    for (const r of store.data.localScan?.repos || []) dirs.set(r.path.toLowerCase(), r.path);
    for (const meta of Object.values(store.data.accounts)) {
      for (const f of meta.folders) {
        try {
          for (const e of fs.readdirSync(f, { withFileTypes: true })) {
            const dir = path.join(f, e.name);
            if (e.isDirectory() && fs.existsSync(path.join(dir, '.git'))) dirs.set(dir.toLowerCase(), dir);
          }
        } catch {
          // carpeta borrada o sin permisos
        }
      }
    }
    return git.pendingWork([...dirs.values()], (alias) => aliases.has(alias));
  },

  async discardFile(dir, file) {
    await git.discardFile(dir, file);
    return git.localStatus(dir, { fetch: false });
  },

  async ignoreLocal(dir, files) {
    await git.ignoreLocal(dir, files);
    return git.localStatus(dir, { fetch: false });
  },

  async discardAll(dir) {
    await git.discardAll(dir);
    return git.localStatus(dir, { fetch: false });
  },

  async createIssue(alias, fullName, data) {
    if (!String(data?.title || '').trim()) throw new Error('Escribe la tarea');
    await github.createIssue(readyAccount(alias).githubUser, fullName, data);
  },

  async closeIssue(alias, fullName, number) {
    await github.closeIssue(readyAccount(alias).githubUser, fullName, number);
  },

  async enableIssues(alias, fullName) {
    await github.updateRepo(readyAccount(alias).githubUser, fullName, { has_issues: true });
  },

  async setArchived(alias, fullName, archived) {
    await github.updateRepo(readyAccount(alias).githubUser, fullName, { archived: !!archived });
  },

  async renameRepo(alias, fullName, newName) {
    const meta = readyAccount(alias);
    if (!/^[\w.-]+$/.test(newName || '')) throw new Error('El nombre solo puede tener letras, números, «-», «_» y «.» (sin espacios)');
    const r = await github.updateRepo(meta.githubUser, fullName, { name: newName });
    const oldName = fullName.split('/')[1];
    let localPath = localCopy(meta, oldName, fullName);
    let folderRenamed = false;
    if (localPath) {
      await git.setOrigin(localPath, `git@${alias}:${r.full_name}.git`);
      // La carpeta se renombra solo si se llamaba igual que el repo; si está abierta en otro programa, se deja.
      if (path.basename(localPath) === oldName) {
        const target = path.join(path.dirname(localPath), newName);
        try {
          if (!fs.existsSync(target)) {
            fs.renameSync(localPath, target);
            localPath = target;
            folderRenamed = true;
          }
        } catch {
          // en uso: se queda con el nombre antiguo
        }
      }
      const scan = store.data.localScan;
      if (scan) {
        const info = await git.repoInfo(localPath);
        scan.repos = scan.repos.filter((x) => x.fullName?.toLowerCase() !== fullName.toLowerCase()).concat(info);
        store.save();
      }
    }
    return { fullName: r.full_name, localPath, folderRenamed };
  },

  async needsDeleteScope(alias) {
    return !(await github.scopes(readyAccount(alias).githubUser)).includes('delete_repo');
  },

  async grantDeleteScope(alias) {
    const meta = readyAccount(alias);
    await github.addScope(meta.githubUser, 'delete_repo', (code) => win.webContents.send('login-code', code));
  },

  async deleteRepo(alias, fullName, trashLocal) {
    const meta = readyAccount(alias);
    const localPath = localCopy(meta, fullName.split('/')[1], fullName);
    await github.deleteRepo(meta.githubUser, fullName);
    let trashed = false;
    if (trashLocal && localPath) {
      await shell.trashItem(localPath); // a la papelera, no se borra del todo
      trashed = true;
    }
    if (store.data.localScan && (trashed || !localPath)) {
      store.data.localScan.repos = store.data.localScan.repos.filter((x) => x.fullName?.toLowerCase() !== fullName.toLowerCase());
      store.save();
    }
    return { trashed, localPath };
  },

  async downloadRepo(alias, fullName) {
    const meta = readyAccount(alias);
    const parent = await accountFolder(alias);
    if (!parent) return null;
    return git.cloneRepo(`https://github.com/${fullName}`, alias, parent, meta);
  },

  async createProject(alias, data) {
    const meta = readyAccount(alias);
    if (!/^[\w.-]+$/.test(data.name || '')) throw new Error('El nombre solo puede tener letras, números, «-», «_» y «.» (sin espacios)');
    const parent = await accountFolder(alias);
    if (!parent) return null;
    const repo = await github.createRepo(meta.githubUser, data);
    const dest = await git.cloneRepo(repo.url, alias, parent, meta);
    return { ...repo, localPath: dest };
  },

  async openOnGitHub(url) {
    if (/^https:\/\/github\.com\//.test(url)) await shell.openExternal(url);
  },

  async createAccount({ label, name, email }) {
    if (!label || !name || !email) throw new Error('Rellena los tres campos');
    const base = `github-${slug(label) || 'cuenta'}`;
    const taken = new Set(ssh.parseHosts().map((h) => h.alias.toLowerCase()));
    let alias = base;
    for (let i = 2; taken.has(alias); i++) alias = `${base}-${i}`;
    await ssh.addAccountHost(alias, email);
    Object.assign(store.account(alias), { label, name, email });
    store.save();
    return accountView(findHost(alias));
  },

  async updateAccount(alias, { label, name, email }) {
    const meta = store.account(alias);
    Object.assign(meta, { label, name, email });
    store.save();
    if (meta.folders.length) git.writeIdentity(alias, meta);
    return accountView(findHost(alias));
  },

  async removeAccount(alias) {
    const meta = store.account(alias);
    for (const f of meta.folders) await git.unmapFolder(f);
    ssh.removeManagedHost(alias);
    delete store.data.accounts[alias];
    store.save();
  },

  async copyKeyAndOpenGitHub(alias) {
    const key = ssh.readPublicKey(findHost(alias).identityFile);
    if (!key) throw new Error('No encuentro la llave de esta cuenta');
    clipboard.writeText(key);
    await shell.openExternal('https://github.com/settings/ssh/new');
  },

  async testAccount(alias) {
    const r = await ssh.testConnection(alias);
    const meta = store.account(alias);
    meta.githubUser = r.ok ? r.user : null;
    store.save();
    return r;
  },

  async makeDefault(alias) {
    const meta = store.account(alias);
    if (!meta.name || !meta.email) throw new Error('Primero pon tu nombre y email en esta cuenta (Editar)');
    await git.setGlobalIdentity(meta);
  },

  async addFolder(alias) {
    const meta = store.account(alias);
    if (!meta.name || !meta.email) throw new Error('Primero pon tu nombre y email en esta cuenta (Editar)');
    const folder = await pickFolder(`Carpeta para la cuenta "${meta.label || defaultLabel(alias)}"`);
    if (!folder) return null;
    for (const [other, m] of Object.entries(store.data.accounts)) {
      if (other !== alias && m.folders.includes(folder)) throw new Error('Esa carpeta ya es de otra cuenta');
    }
    await git.mapFolder(folder, alias, meta);
    if (!meta.folders.includes(folder)) meta.folders.push(folder);
    store.save();
    return folder;
  },

  async removeFolder(alias, folder) {
    await git.unmapFolder(folder);
    const meta = store.account(alias);
    meta.folders = meta.folders.filter((f) => f !== folder);
    store.save();
  },

  async localProjects() {
    return store.data.localScan || null;
  },

  async scanComputer() {
    const aliases = new Set(ssh.parseHosts().map((h) => h.alias));
    const repos = await git.scanComputer(
      (alias) => aliases.has(alias),
      (p) => win.webContents.send('scan-progress', p)
    );
    store.data.localScan = { at: new Date().toISOString(), repos };
    store.save();
    return store.data.localScan;
  },

  async assignProject(dir, alias) {
    const meta = store.account(alias);
    if (!meta.name || !meta.email) throw new Error('Primero pon tu nombre y email en esa cuenta (Editar)');
    const info = await git.assignRepo(dir, alias, meta);
    const scan = store.data.localScan;
    if (scan) {
      scan.repos = scan.repos.map((r) => (r.path === dir ? info : r));
      store.save();
    }
    return info;
  },

  async cloneProject(url, alias) {
    const meta = store.account(alias);
    if (!meta.name || !meta.email) throw new Error('Primero pon tu nombre y email en esa cuenta (Editar)');
    const parent = await accountFolder(alias);
    if (!parent) return null;
    return git.cloneRepo(url, alias, parent, meta);
  },

  async openFolder(dir) {
    await shell.openPath(dir);
  },
};

ipcMain.handle('call', async (_e, name, ...args) => {
  const fn = handlers[name];
  if (!fn) return { ok: false, error: `Acción desconocida: ${name}` };
  try {
    return { ok: true, data: await fn(...args) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 420,
    minHeight: 500,
    title: 'GitHub Swap',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
});

app.on('window-all-closed', () => app.quit());
