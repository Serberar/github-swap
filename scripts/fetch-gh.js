// Descarga GitHub CLI portable (licencia MIT) para meterlo en el instalador: vendor/gh/gh.exe.
// Comprueba la suma SHA-256 que publica GitHub antes de usarlo. Se ejecuta solo antes de `npm run dist`.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const GH_VERSION = '2.102.0';
const ZIP = `gh_${GH_VERSION}_windows_amd64.zip`;
const BASE = `https://github.com/cli/cli/releases/download/v${GH_VERSION}`;
const OUT = path.join(__dirname, '..', 'vendor', 'gh');
const STAMP = path.join(OUT, 'VERSION');

function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const found = findFile(p, name);
      if (found) return found;
    } else if (e.name.toLowerCase() === name.toLowerCase()) {
      return p;
    }
  }
  return null;
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

(async () => {
  if (fs.existsSync(STAMP) && fs.readFileSync(STAMP, 'utf8').trim() === GH_VERSION && fs.existsSync(path.join(OUT, 'gh.exe'))) {
    console.log(`gh ${GH_VERSION} ya está en vendor/gh`);
    return;
  }

  const sums = (await download(`${BASE}/gh_${GH_VERSION}_checksums.txt`)).toString();
  const expected = sums.split('\n').find((l) => l.trim().endsWith(ZIP))?.split(/\s+/)[0];
  if (!expected) throw new Error(`No encuentro la suma de ${ZIP}`);

  const zip = await download(`${BASE}/${ZIP}`);
  const actual = crypto.createHash('sha256').update(zip).digest('hex');
  if (actual !== expected) throw new Error(`La suma SHA-256 no coincide (esperada ${expected}, obtenida ${actual})`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
  try {
    const zipPath = path.join(tmp, ZIP);
    fs.writeFileSync(zipPath, zip);
    const extracted = path.join(tmp, 'x');
    fs.mkdirSync(extracted);
    // El tar de Windows 10+ abre .zip (ruta fija: desde Git Bash «tar» sería el de Linux, que no entiende C:\)
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    execFileSync(tar, ['-xf', zipPath, '-C', extracted]);
    const exe = findFile(extracted, 'gh.exe');
    if (!exe) throw new Error('El zip no trae gh.exe');
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    fs.copyFileSync(exe, path.join(OUT, 'gh.exe'));
    const license = findFile(extracted, 'LICENSE');
    if (license) fs.copyFileSync(license, path.join(OUT, 'LICENSE'));
    fs.writeFileSync(STAMP, GH_VERSION);
    console.log(`gh ${GH_VERSION} descargado y verificado en vendor/gh`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
