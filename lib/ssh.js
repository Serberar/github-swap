const fs = require('fs');
const path = require('path');
const os = require('os');
const { run } = require('./exec');

const SSH_DIR = path.join(os.homedir(), '.ssh');
const CONFIG = path.join(SSH_DIR, 'config');
const BEGIN = '# >>> github-swap >>>';
const END = '# <<< github-swap <<<';

function expandHome(p) {
  return p ? p.replace(/^~(?=$|[\\/])/, os.homedir()) : p;
}

function readConfig() {
  try {
    return fs.readFileSync(CONFIG, 'utf8');
  } catch {
    return '';
  }
}

// Devuelve los Host que apuntan a github.com. Los que están dentro del bloque
// github-swap se marcan como "managed"; el resto son del usuario y no se tocan.
function parseHosts(text = readConfig()) {
  const hosts = [];
  let managed = false;
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === BEGIN) { managed = true; cur = null; continue; }
    if (line === END) { managed = false; cur = null; continue; }
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(\S+?)\s*(?:=|\s)\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim().replace(/^"(.*)"$/, '$1');
    if (key === 'host') {
      cur = { alias: val, hostName: null, identityFile: null, managed };
      hosts.push(cur);
    } else if (key === 'match') {
      cur = null;
    } else if (cur) {
      if (key === 'hostname') cur.hostName = val;
      if (key === 'identityfile') cur.identityFile = val;
    }
  }
  return hosts.filter(
    (h) => (h.hostName || h.alias).toLowerCase() === 'github.com' && !/[*?\s!]/.test(h.alias)
  );
}

function renderBlock(hosts) {
  const body = hosts
    .map((h) =>
      [
        `Host ${h.alias}`,
        '    HostName github.com',
        '    User git',
        `    IdentityFile ${h.identityFile}`,
        '    IdentitiesOnly yes',
      ].join('\n')
    )
    .join('\n\n');
  return `${BEGIN}\n# Bloque gestionado por GitHub Swap. Lo de fuera no se modifica.\n${body}${body ? '\n' : ''}${END}`;
}

function writeManaged(hosts) {
  const text = readConfig();
  fs.mkdirSync(SSH_DIR, { recursive: true });
  if (text) fs.writeFileSync(CONFIG + '.github-swap.bak', text);
  const block = renderBlock(hosts);
  const re = new RegExp(`${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}`);
  const next = re.test(text) ? text.replace(re, block) : `${text.replace(/\s*$/, '')}${text ? '\n\n' : ''}${block}\n`;
  fs.writeFileSync(CONFIG, next);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keyPathFor(alias) {
  return path.join(SSH_DIR, `id_ed25519_${alias.replace(/[^\w.-]/g, '_')}`);
}

async function addAccountHost(alias, email) {
  if (!/^[\w.-]+$/.test(alias)) throw new Error('El alias solo puede tener letras, números, "-", "_" y "."');
  const all = parseHosts();
  if (all.some((h) => h.alias.toLowerCase() === alias.toLowerCase())) {
    throw new Error(`Ya existe un Host "${alias}" en ~/.ssh/config`);
  }
  const keyFile = keyPathFor(alias);
  if (!fs.existsSync(keyFile)) {
    fs.mkdirSync(SSH_DIR, { recursive: true });
    const r = await run('ssh-keygen', ['-t', 'ed25519', '-C', email || alias, '-f', keyFile, '-N', '']);
    if (!r.ok) throw new Error(`ssh-keygen falló: ${r.stderr || r.stdout}`);
  }
  const managed = all.filter((h) => h.managed);
  managed.push({ alias, identityFile: '~/.ssh/' + path.basename(keyFile) });
  writeManaged(managed);
  return keyFile;
}

function removeManagedHost(alias) {
  const managed = parseHosts().filter((h) => h.managed);
  if (!managed.some((h) => h.alias === alias)) throw new Error('Solo se pueden quitar cuentas creadas desde la app');
  writeManaged(managed.filter((h) => h.alias !== alias));
}

function readPublicKey(identityFile) {
  try {
    return fs.readFileSync(expandHome(identityFile) + '.pub', 'utf8').trim();
  } catch {
    return null;
  }
}

async function testConnection(alias) {
  const r = await run('ssh', [
    '-T',
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=8',
    `git@${alias}`,
  ]);
  const out = r.stdout + r.stderr;
  const m = out.match(/Hi ([^!]+)!/);
  return m ? { ok: true, user: m[1] } : { ok: false, message: out.trim() || 'Sin respuesta' };
}

module.exports = { parseHosts, addAccountHost, removeManagedHost, readPublicKey, testConnection, expandHome };
