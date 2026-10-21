const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Actualizaciones: la última versión publicada en GitHub Releases (el repo es público, no hace falta llave).
const LATEST = 'https://api.github.com/repos/Serberar/github-swap/releases/latest';

// ¿La versión a es más nueva que la b? («0.10.0» > «0.9.1»)
function newer(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
  return false;
}

// Devuelve { version, url } si hay una versión nueva con instalador, o null.
async function check(current) {
  const res = await fetch(LATEST, { headers: { 'User-Agent': 'github-swap' } });
  if (!res.ok) return null;
  const rel = await res.json();
  const version = String(rel.tag_name || '').replace(/^v/, '');
  const asset = (rel.assets || []).find((a) => a.name.toLowerCase().endsWith('.exe'));
  return asset && newer(version, current) ? { version, url: asset.browser_download_url } : null;
}

// Descarga el instalador y lo lanza en silencio; vuelve a abrir la app al terminar.
async function install(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo descargar la actualización. Prueba otra vez más tarde.');
  const file = path.join(os.tmpdir(), 'GitHubSwapSetup.exe');
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  spawn(file, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
}

module.exports = { check, install, newer };
