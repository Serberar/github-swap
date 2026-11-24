// Proyectos en el ordenador.
let scanning = false;

window.api.onScanProgress((p) => {
  $('#scan-status').textContent =
    p.scanned == null
      ? `Encontrados ${p.found} proyectos. Revisando con qué cuenta va cada uno…`
      : `Buscando en tu ordenador… ${p.scanned} carpetas revisadas, ${p.found} proyectos encontrados`;
});

async function loadProjects(rescan) {
  if (scanning) return;
  try {
    let scan = rescan ? null : await call('localProjects');
    if (!scan) {
      scanning = true;
      $('#rescan').disabled = true;
      $('#scan-status').textContent = 'Buscando en tu ordenador…';
      scan = await call('scanComputer');
    }
    renderLocal(scan);
  } catch (err) {
    toast(err.message, true);
  } finally {
    scanning = false;
    $('#rescan').disabled = false;
  }
}

function renderLocal(scan) {
  const when = new Date(scan.at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  $('#scan-status').textContent = `${scan.repos.length} proyectos de GitHub · última búsqueda: ${when}`;
  const list = $('#project-list');
  if (!scan.repos.length) {
    list.innerHTML = '<p class="muted">No hay ningún proyecto de GitHub en tu ordenador todavía.</p>';
    return;
  }
  const groups = new Map();
  for (const r of scan.repos) {
    const key = accounts.some((a) => a.alias === r.alias) ? r.alias : r.alias === 'https' ? 'https' : 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const order = [...accounts.map((a) => a.alias), 'https', 'unknown'].filter((k) => groups.has(k));
  const options = accounts.map((a) => `<option value="${esc(a.alias)}">${esc(a.label)}</option>`).join('');
  list.innerHTML = order
    .map((key) => {
      const acc = accounts.find((a) => a.alias === key);
      const title = acc
        ? `${esc(acc.label)} ${acc.githubUser ? `<span class="muted">@${esc(acc.githubUser)}</span>` : ''}`
        : key === 'https'
          ? '⚠️ Sin cuenta asignada <span class="muted">elige una para que no te pida contraseñas</span>'
          : '⚠️ Cuenta desconocida';
      const rows = groups
        .get(key)
        .map(
          (r) => `
        <div class="row" data-path="${esc(r.path)}">
          <div class="info">
            <b>${esc(r.name)}</b> <span class="muted">${esc(r.fullName)}</span>
            <div class="muted">${esc(r.path)}${r.email ? ` · firma como ${esc(r.email)}` : ''}</div>
          </div>
          <div class="actions">
            <select aria-label="Cambiar cuenta"><option value="">${acc ? 'Cambiar a…' : 'Asignar cuenta…'}</option>${options}</select>
            <button data-open>Abrir carpeta</button>
          </div>
        </div>`
        )
        .join('');
      return `<div class="group"><h3>${title}</h3><div class="rows">${rows}</div></div>`;
    })
    .join('');
}

$('#rescan').addEventListener('click', () => loadProjects(true));

$('#project-list').addEventListener('change', async (e) => {
  const sel = e.target;
  if (sel.tagName !== 'SELECT' || !sel.value) return;
  const dir = sel.closest('[data-path]').dataset.path;
  sel.disabled = true;
  try {
    await call('assignProject', dir, sel.value);
    toast(`Ahora usa la cuenta «${labelFor(sel.value)}»`);
    renderLocal(await call('localProjects'));
  } catch (err) {
    toast(err.message, true);
    sel.disabled = false;
    sel.value = '';
  }
});

$('#project-list').addEventListener('click', (e) => {
  if (e.target.matches('[data-open]')) call('openFolder', e.target.closest('[data-path]').dataset.path);
});
