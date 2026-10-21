const fs = require('fs');
const path = require('path');
const { run } = require('./exec');

// Programas que necesita la app: Git (imprescindible) y GitHub CLI (viene dentro del instalador).

const GIT_DIRS = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]
  .filter(Boolean)
  .map((d) => path.join(d, 'Git'));

function addToPath(dir) {
  const parts = (process.env.PATH || '').split(path.delimiter);
  if (!parts.some((p) => p.toLowerCase() === dir.toLowerCase())) process.env.PATH = [...parts, dir].join(path.delimiter);
}

// Un Git recién instalado no está en el PATH de la app hasta reiniciarla: buscarlo en su sitio habitual.
function findGitInstall() {
  for (const dir of GIT_DIRS) {
    if (fs.existsSync(path.join(dir, 'cmd', 'git.exe'))) {
      addToPath(path.join(dir, 'cmd'));
      addToPath(path.join(dir, 'usr', 'bin')); // trae ssh por si Windows no lo tuviera
      return true;
    }
  }
  return false;
}

let ghPath = null;

// Usa el gh instalado en el sistema si lo hay; si no, el que va dentro de la app.
async function resolveGh() {
  if ((await run('gh', ['--version'])).ok) {
    ghPath = 'gh';
    return 'system';
  }
  const bundled = [
    process.resourcesPath && path.join(process.resourcesPath, 'gh', 'gh.exe'),
    path.join(__dirname, '..', 'vendor', 'gh', 'gh.exe'),
  ].find((p) => p && fs.existsSync(p));
  ghPath = bundled || null;
  return bundled ? 'bundled' : null;
}

function gh() {
  return ghPath || 'gh';
}

async function status() {
  let git = (await run('git', ['--version'])).ok;
  if (!git && findGitInstall()) git = (await run('git', ['--version'])).ok;
  const ghSource = await resolveGh();
  return { git, gh: !!ghSource, ghSource };
}

// Instala Git con winget (el instalador oficial de Windows). Windows pedirá permiso de administrador.
async function installGit() {
  if (!(await run('winget', ['--version'])).ok) {
    throw new Error('Este Windows no tiene winget. Descarga Git desde git-scm.com e instálalo.');
  }
  const r = await run(
    'winget',
    ['install', '--id', 'Git.Git', '-e', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements', '--silent'],
    { timeout: 15 * 60 * 1000 }
  );
  findGitInstall();
  if (!(await run('git', ['--version'])).ok) {
    const detail = (r.stdout + r.stderr).trim().split(/\r?\n/).slice(-3).join('\n');
    throw new Error(`No se pudo instalar Git.${detail ? `\n\n${detail}` : ''}`);
  }
}

module.exports = { status, gh, installGit };
