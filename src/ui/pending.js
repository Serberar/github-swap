// Avisos de trabajo pendiente.
async function loadPending() {
  const box = $('#pending');
  try {
    const items = await call('pendingWork');
    const up = items.filter((p) => p.modified || p.untracked || p.ahead);
    const down = items.filter((p) => p.behind);
    const refresh = '<button class="refresh" data-refresh>↻ Actualizar</button>';
    const row = (p, what) => `<li><span class="grow"><b>${esc(p.name)}</b> <span class="muted">${esc(labelFor(p.alias) || '')}</span>
        <div class="muted">${what}</div></span>
        <button data-alias="${esc(p.alias)}" data-repo="${esc(p.fullName)}" data-path="${esc(p.path)}">Ver</button></li>`;
    // Títulos de commits: los 3 primeros y «y N más».
    const commits = (list) =>
      list.length
        ? list.slice(0, 3).map((m) => `«${esc(m)}»`).join(', ') + (list.length > 3 ? ` y ${list.length - 3} más` : '')
        : '';
    const toUpload = up.map((p) =>
      row(p, [
        p.modified && plural(p.modified, 'archivo cambiado sin commit', 'archivos cambiados sin commit'),
        p.untracked && plural(p.untracked, 'archivo nuevo', 'archivos nuevos'),
        p.ahead && `${plural(p.ahead, 'commit sin subir', 'commits sin subir')}: ${commits(p.outgoingCommits)}`,
      ].filter(Boolean).join(' · '))
    );
    const toDownload = down.map((p) =>
      row(p, [
        plural(p.behind, 'commit', 'commits'),
        p.incomingFiles && plural(p.incomingFiles, 'archivo', 'archivos'),
        commits(p.incomingCommits),
      ].filter(Boolean).join(' · '))
    );
    box.innerHTML = items.length
      ? `<details class="pending"${localStorage.getItem('pendingOpen') === '1' ? ' open' : ''}>
          <summary><span class="grow"><b>⚠️ Trabajo pendiente</b> <span class="muted">en ${plural(items.length, 'proyecto', 'proyectos')}</span></span>${refresh}</summary>
          ${up.length ? `<h4>⬆️ Pendiente de subir</h4><ul class="people">${toUpload.join('')}</ul>` : ''}
          ${down.length ? `<h4>⬇️ Pendiente de descargar</h4><ul class="people">${toDownload.join('')}</ul>` : ''}
        </details>`
      : `<div class="pending ok"><span class="grow">✓ Todos tus proyectos están al día</span>${refresh}</div>`;
  } catch {
    box.innerHTML = '';
  }
}

// 'toggle' no burbujea: se escucha en captura para recordar si el aviso queda abierto.
$('#pending').addEventListener('toggle', (e) => localStorage.setItem('pendingOpen', e.target.open ? '1' : '0'), true);

$('#pending').addEventListener('click', (e) => {
  const again = e.target.closest('button[data-refresh]');
  if (again) {
    e.preventDefault(); // está dentro del <summary>: que no pliegue/despliegue el aviso
    again.disabled = true;
    again.textContent = 'Comprobando…';
    return loadPending();
  }
  const btn = e.target.closest('button[data-repo]');
  if (!btn) return;
  const acc = accounts.find((a) => a.alias === btn.dataset.alias);
  if (!acc?.apiAccess) return toast('Primero pulsa «Ver mis proyectos» en esa cuenta para darle acceso', true);
  openAccountPage(acc);
  openRepoPage(btn.dataset.repo, { path: btn.dataset.path, focus: true });
});

checkUpdate().catch(() => {});
