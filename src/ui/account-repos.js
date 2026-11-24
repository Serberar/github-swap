// Proyectos de una cuenta.
let pageAccount = null;
let pageRepos = [];

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function ago(iso) {
  const sec = (new Date(iso) - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, s] of units) if (Math.abs(sec) >= s) return rtf.format(Math.round(sec / s), unit);
  return 'ahora mismo';
}

async function openAccountPage(acc) {
  pageAccount = acc;
  pageRepos = [];
  $('#repo-search').value = '';
  $('#page-head').innerHTML = `
    ${avatar(acc)}
    <div>
      <h2>Proyectos de «${esc(acc.label)}»</h2>
      <div class="muted" id="page-folder">@${esc(acc.githubUser)}</div>
    </div>`;
  $('#repo-list').innerHTML = '<p class="muted">Cargando proyectos…</p>';
  showView('account-page');
  await reloadRepos();
}

async function reloadRepos() {
  try {
    const res = await call('accountRepos', pageAccount.alias);
    pageRepos = res.repos;
    $('#page-folder').textContent =
      `@${pageAccount.githubUser} · ` +
      (res.folder ? `se guardan en ${res.folder}` : 'la primera vez que descargues te preguntaremos dónde guardarlos');
    renderRepos();
  } catch (err) {
    $('#repo-list').innerHTML = `<div class="result err">${esc(err.message)}</div>`;
  }
}

function renderRepos() {
  const q = $('#repo-search').value.trim().toLowerCase();
  const list = pageRepos.filter((r) => !q || r.fullName.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
  if (!list.length) {
    $('#repo-list').innerHTML = `<p class="muted">${pageRepos.length ? 'Ningún proyecto coincide.' : 'Esta cuenta aún no tiene proyectos. ¡Crea el primero!'}</p>`;
    return;
  }
  $('#repo-list').innerHTML = list
    .map((r) => {
      const mine = r.owner.toLowerCase() === pageAccount.githubUser.toLowerCase();
      return `
      <div class="row" data-repo="${esc(r.fullName)}">
        <div class="info">
          <b>${mine ? '' : esc(r.owner) + ' / '}${esc(r.name)}</b>
          <span class="badge neutral">${r.private ? '🔒 Privado' : 'Público'}</span>
          ${r.localPath ? '<span class="badge ok">✓ En tu ordenador</span>' : ''}
          ${r.description ? `<div class="desc">${esc(r.description)}</div>` : ''}
          <div class="muted">Último cambio ${esc(ago(r.updatedAt))}</div>
        </div>
        <div class="actions">
          ${r.localPath ? '' : `<button data-download>Descargar</button>`}
          <button class="primary" data-manage>Gestionar →</button>
        </div>
      </div>`;
    })
    .join('');
}

$('#repo-search').addEventListener('input', renderRepos);
$('#back').addEventListener('click', () => showView('accounts'));

$('#repo-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.hasAttribute('data-manage')) return openRepoPage(btn.closest('[data-repo]').dataset.repo);
  if (btn.hasAttribute('data-download')) {
    const fullName = btn.closest('[data-repo]').dataset.repo;
    await busy(btn, async () => {
      const dest = await call('downloadRepo', pageAccount.alias, fullName);
      if (dest) {
        toast('Descargado ✓');
        await loadAccounts();
        await reloadRepos();
      }
    });
  }
});

$('#new-repo').addEventListener('click', () => {
  modalBody.innerHTML = `
    <h2>Nuevo proyecto en «${esc(pageAccount.label)}»</h2>
    <form id="new-form">
      <label>Nombre
        <small>Sin espacios. Ejemplo: mi-web</small>
        <input name="name" required pattern="[A-Za-z0-9._-]+" autofocus>
      </label>
      <label>Descripción <small>Opcional</small><input name="description"></label>
      <label>¿Quién puede verlo?</label>
      <label class="choice"><input type="radio" name="visibility" value="private" checked> Solo yo y quien yo invite (privado)</label>
      <label class="choice"><input type="radio" name="visibility" value="public"> Cualquiera (público)</label>
      <p class="muted">Lo creamos en GitHub y lo descargamos en tu ordenador, listo para trabajar.</p>
      <div class="modal-actions">
        <button type="button" data-close>Cancelar</button>
        <button class="primary" type="submit">Crear proyecto</button>
      </div>
    </form>`;
  $('#new-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await busy(e.submitter, async () => {
      const repo = await call('createProject', pageAccount.alias, {
        name: f.name,
        description: f.description,
        private: f.visibility === 'private',
      });
      if (!repo) return;
      modal.close();
      toast(`«${repo.name}» creado y descargado ✓`);
      await loadAccounts();
      await reloadRepos();
    });
  });
  modal.showModal();
});
