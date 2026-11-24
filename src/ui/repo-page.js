// Página de un proyecto.
let repo = null;

const CHANGE_LABELS = { '?': 'Nuevo', A: 'Nuevo', M: 'Cambiado', D: 'Borrado', R: 'Renombrado' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// opts.path: la copia concreta del ordenador (si hay varias); opts.focus: ir directo a «En tu ordenador».
let repoOpts = {};

async function openRepoPage(fullName, opts = {}) {
  repoOpts = opts;
  repo = null;
  $('#repo-body').innerHTML = '<p class="muted">Cargando…</p>';
  showView('repo-page');
  await reloadRepoPage(fullName);
}

async function reloadRepoPage(fullName = repo.fullName) {
  try {
    repo = await call('repoDetails', pageAccount.alias, fullName, repoOpts.path || repo?.localPath || null);
    renderRepoPage();
    await loadLocal();
    if (repoOpts.focus) {
      repoOpts.focus = false;
      const card = $('#local-box')?.closest('.card');
      card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card?.classList.add('highlight');
      setTimeout(() => card?.classList.remove('highlight'), 2500);
    }
  } catch (err) {
    $('#repo-body').innerHTML = `<div class="result err">${esc(err.message)}</div>`;
  }
}

function personRow(p, extra, button) {
  const pic = p.avatar
    ? `<img class="avatar sm" src="${esc(p.avatar)}" alt="">`
    : `<div class="avatar sm">${esc(p.login.charAt(0).toUpperCase())}</div>`;
  return `<li>${pic}<span class="grow">@${esc(p.login)} ${extra}</span>${button}</li>`;
}

// Muestra los primeros `visible` elementos y deja el resto plegado.
function listWithMore(items, visible, moreLabel, cls = 'commits') {
  const head = `<ul class="${cls}">${items.slice(0, visible).join('')}</ul>`;
  if (items.length <= visible) return head;
  return `${head}<details class="more"><summary>${moreLabel(items.length - visible)}</summary>
    <ul class="${cls}">${items.slice(visible).join('')}</ul></details>`;
}

function renderRepoPage() {
  const r = repo;
  const people = [
    ...r.collaborators.map((c) =>
      personRow(c, '', `<button class="link danger" data-act="remove" data-login="${esc(c.login)}">Quitar</button>`)
    ),
    ...r.invitations.map((i) =>
      personRow(
        i,
        '<span class="badge warn">Invitación pendiente</span>',
        `<button class="link danger" data-act="cancel-invite" data-id="${i.id}" data-login="${esc(i.login)}">Cancelar</button>`
      )
    ),
  ];
  const access = r.admin
    ? `
      <div class="setting">
        <div>
          <b>${r.private ? '🔒 Privado' : '🌍 Público'}</b>
          <div class="muted">${r.private ? 'Solo tú y las personas invitadas pueden verlo.' : 'Cualquiera en internet puede verlo y descargarlo.'}</div>
        </div>
        <button data-act="visibility">${r.private ? 'Hacer público' : 'Hacer privado'}</button>
      </div>
      <h4>Personas con acceso</h4>
      <ul class="people">${people.join('') || '<li class="muted">Nadie más tiene acceso.</li>'}</ul>
      <form id="invite-form" class="inline-form">
        <input name="login" placeholder="Usuario de GitHub (ej. pepe123)" required aria-label="Usuario de GitHub">
        <button class="primary" type="submit">Invitar</button>
      </form>
      <p class="muted">Le llegará un email de GitHub. Cuando acepte, podrá ver y subir cambios.</p>`
    : `<p class="muted">Solo el dueño (@${esc(r.owner)}) puede cambiar quién tiene acceso.</p>`;
  const commits = r.commits.length
    ? listWithMore(
        r.commits.map(
          (c) => `<li><div class="grow"><div class="title">${esc(c.message)}</div><div class="muted">${esc(c.author)} · ${esc(ago(c.date))}</div></div>
            <button class="link" data-web="${esc(c.url)}">Ver</button></li>`
        ),
        3,
        (n) => `Ver ${plural(n, 'cambio anterior', 'cambios anteriores')}`
      )
    : '<p class="muted">Todavía no hay cambios.</p>';

  const tasks = !r.hasIssues
    ? `<p class="muted">Las tareas están desactivadas en este proyecto.</p>
       ${r.admin ? '<button data-act="enable-issues">Activar tareas</button>' : ''}`
    : `
      ${
        r.issues.length
          ? listWithMore(
              r.issues.map(
                (i) => `<li><div class="grow"><div class="title">${esc(i.title)}</div>
                  <div class="muted">#${i.number} · ${esc(i.author || '')} · ${esc(ago(i.date))}${i.comments ? ` · 💬 ${i.comments}` : ''}</div></div>
                  <button class="link" data-web="${esc(i.url)}">Ver</button>
                  ${r.archived ? '' : `<button data-act="close-issue" data-number="${i.number}" data-title="${esc(i.title)}">✓ Hecha</button>`}</li>`
              ),
              5,
              (n) => `Ver ${plural(n, 'tarea más', 'tareas más')}`
            )
          : '<p class="muted">No hay tareas pendientes. 🎉</p>'
      }
      ${
        r.archived
          ? ''
          : `<form id="issue-form" class="inline-form">
              <input name="title" placeholder="Nueva tarea (ej. arreglar el login)" required aria-label="Nueva tarea">
              <button class="primary" type="submit">Añadir</button>
            </form>`
      }`;

  const options = r.admin
    ? `
      <section class="card">
        <h3>Más opciones</h3>
        <div class="setting">
          <div><b>Cambiar nombre</b><div class="muted">También se cambia en tu ordenador.</div></div>
          <button data-act="rename">Cambiar nombre</button>
        </div>
        <div class="setting">
          <div><b>${r.archived ? 'Desarchivar' : 'Archivar'}</b>
          <div class="muted">${r.archived ? 'Vuelve a permitir cambios.' : 'Queda guardado como solo lectura. Se puede deshacer.'}</div></div>
          <button data-act="archive">${r.archived ? 'Desarchivar' : 'Archivar'}</button>
        </div>
      </section>`
    : '';

  $('#repo-body').innerHTML = `
    ${r.archived ? '<div class="result err">📦 Este proyecto está archivado: se puede ver y descargar, pero no se pueden subir cambios.</div>' : ''}
    <div class="repo-head card">
      <div class="grow">
        <h2>${esc(r.name)} <span class="badge neutral">${r.private ? '🔒 Privado' : '🌍 Público'}</span></h2>
        <div class="muted">${esc(r.fullName)}</div>
        <p class="desc">${r.description ? esc(r.description) : '<span class="muted">Sin descripción</span>'}
          ${r.admin ? '<button class="link" data-act="edit-desc">Editar</button>' : ''}</p>
      </div>
      <div class="actions">
        ${
          r.localPath
            ? `<button class="primary" data-act="open-code">Abrir en VS Code</button><button data-act="open-folder">Abrir carpeta</button>`
            : `<button class="primary" data-act="download">Descargar a mi ordenador</button>`
        }
        <button data-web="${esc(r.url)}">Ver en GitHub</button>
      </div>
    </div>
    <div class="repo-layout">
      <div class="col">
        ${
          r.localPath
            ? `<section class="card"><h3>En tu ordenador</h3><div class="muted path local-path" title="${esc(r.localPath)}">📁 ${esc(shortPath(r.localPath))}</div>
               <div id="local-box"><p class="muted">Comprobando…</p></div></section>`
            : ''
        }
        <section class="card"><h3>Tareas ${r.issues.length ? `<span class="badge neutral">${r.issues.length}</span>` : ''}</h3>${tasks}</section>
        <section class="card"><h3>Últimos cambios ${
          r.branch && r.branch !== r.defaultBranch ? `<span class="badge neutral" title="La rama en la que trabajas">rama ${esc(r.branch)}</span>` : ''
        }</h3>${commits}</section>
      </div>
      <div class="col">
        <section class="card"><h3>Quién tiene acceso</h3>${access}</section>
        ${options}
      </div>
    </div>`;
  $('#issue-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = new FormData(e.target).get('title');
    await busy(e.submitter, async () => {
      await call('createIssue', pageAccount.alias, repo.fullName, { title });
      toast('Tarea añadida');
      await reloadRepoPage();
    });
  });
  $('#invite-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const login = new FormData(e.target).get('login');
    await busy(e.submitter, async () => {
      await call('inviteCollaborator', pageAccount.alias, repo.fullName, login);
      toast(`Invitación enviada a @${String(login).replace(/^@/, '')}`);
      await reloadRepoPage();
    });
  });
}

async function loadLocal() {
  if (!repo.localPath) return;
  try {
    renderLocalBox(await call('localStatus', repo.localPath));
  } catch (err) {
    const box = $('#local-box');
    if (box) box.innerHTML = `<div class="result err">${esc(err.message)}</div>`;
  }
}

function renderLocalBox(st) {
  const box = $('#local-box');
  if (!box) return;
  const parts = [];
  if (st.behind) {
    parts.push(`
      <div class="setting">
        <div><b>Hay ${plural(st.behind, 'cambio nuevo', 'cambios nuevos')} en GitHub</b>
        <div class="muted">Tráelos antes de ponerte a trabajar.</div></div>
        <button class="primary" data-act="pull">Traer cambios</button>
      </div>`);
  }
  const modified = st.changes.filter((c) => c.code !== '??');
  const untracked = st.changes.filter((c) => c.code === '??');
  const more = (n) => `Ver ${plural(n, 'archivo más', 'archivos más')}`;
  if (modified.length) {
    const files = modified.map(
      (c) => `<li><span class="grow"><span class="badge neutral">${CHANGE_LABELS[c.code.charAt(0)] || 'Cambiado'}</span> ${esc(c.file)}</span>
        <button class="link" data-act="discard" data-file="${esc(c.file)}" title="Volver a como estaba">Deshacer</button></li>`
    );
    parts.push(`
      <div class="local-group">
        <div class="group-head"><b>Has cambiado ${plural(modified.length, 'archivo', 'archivos')}</b>
          <button class="link danger" data-act="discard-all">Deshacer todo</button></div>
        ${listWithMore(files, 5, more, 'files')}
      </div>`);
  }
  if (untracked.length) {
    const files = untracked.map(
      (c) => `<li><span class="grow">${esc(c.file)}</span>
        <button class="link" data-act="ignore" data-file="${esc(c.file)}" title="No subirlo nunca: se queda solo en tu ordenador">Ignorar</button></li>`
    );
    parts.push(`
      <div class="local-group">
        <div class="group-head"><b>${plural(untracked.length, 'archivo nuevo que nunca se ha subido', 'archivos nuevos que nunca se han subido')}</b>
          <button class="link" data-act="ignore-all" title="No subir ninguno: se quedan solo en tu ordenador">Ignorar todos</button></div>
        <div class="muted">Si alguno es solo tuyo (pruebas, notas…) y no debe ir a GitHub, pulsa «Ignorar»: se queda en tu ordenador y la app deja de avisarte. No se borra nada.</div>
        ${listWithMore(files, 5, more, 'files')}
      </div>`);
  }
  const pushForm = `
    <form id="push-form" class="inline-form">
      <input name="message" placeholder="¿Qué has cambiado? (ej. arreglo el menú)" required aria-label="Qué has cambiado">
      <button class="primary" type="submit">Guardar y subir</button>
    </form>
    ${untracked.length ? '<p class="muted">Al guardar y subir, también se suben los archivos nuevos que no hayas marcado.</p>' : ''}`;
  if (modified.length) {
    parts.push(pushForm);
  } else if (untracked.length) {
    // Solo archivos nuevos: no ofrecer «subir» a la primera, para no subir documentos por accidente.
    parts.push(`<div id="push-slot"><button data-act="show-push">Quiero subir estos archivos a GitHub…</button></div>`);
  } else if (st.ahead) {
    parts.push(`
      <div class="setting">
        <div><b>Tienes ${plural(st.ahead, 'cambio guardado', 'cambios guardados')} sin subir</b></div>
        <button class="primary" data-act="push">Subir</button>
      </div>`);
  }
  box.innerHTML = parts.join('') || '<p><span class="badge ok">✓ Todo al día</span> <span class="muted">Tu ordenador y GitHub tienen lo mismo.</span></p>';
  const bindPush = () =>
    $('#push-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      pushChanges(e.submitter, new FormData(e.target).get('message'));
    });
  bindPush();
  box.querySelector('[data-act="show-push"]')?.addEventListener('click', () => {
    $('#push-slot').innerHTML = pushForm;
    bindPush();
    $('#push-form input').focus();
  });
}

async function pushChanges(btn, message) {
  await busy(btn, async () => {
    renderLocalBox(await call('pushProject', repo.localPath, message));
    toast('Cambios subidos a GitHub ✓');
    loadPending();
    await reloadRepoPage();
  });
}

$('#repo-back').addEventListener('click', () => {
  showView('account-page');
  reloadRepos();
});

$('#repo-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.web) return call('openOnGitHub', btn.dataset.web);
  const r = repo;
  switch (btn.dataset.act) {
    case 'open-code':
      return call('openInEditor', r.localPath);
    case 'open-folder':
      return call('openFolder', r.localPath);
    case 'download':
      return busy(btn, async () => {
        if (await call('downloadRepo', pageAccount.alias, r.fullName)) {
          toast('Descargado ✓');
          await reloadRepoPage();
        }
      });
    case 'pull':
      return busy(btn, async () => {
        renderLocalBox(await call('pullProject', r.localPath));
        toast('Cambios traídos ✓');
        loadPending();
      });
    case 'push':
      return pushChanges(btn, '');
    case 'visibility': {
      const msg = r.private
        ? `¿Hacer público «${r.name}»?\n\nCualquier persona en internet podrá ver y descargar todo el código. Revisa que no haya contraseñas ni datos privados.`
        : `¿Hacer privado «${r.name}»?\n\nSolo tú y las personas invitadas podrán verlo.`;
      if (!confirm(msg)) return;
      return busy(btn, async () => {
        await call('setVisibility', pageAccount.alias, r.fullName, !r.private);
        toast(r.private ? 'Ahora es público' : 'Ahora es privado');
        await reloadRepoPage();
      });
    }
    case 'remove':
      if (!confirm(`¿Quitar a @${btn.dataset.login} de «${r.name}»?\n\nDejará de poder verlo y subir cambios.`)) return;
      return busy(btn, async () => {
        await call('removeCollaborator', pageAccount.alias, r.fullName, btn.dataset.login);
        toast(`@${btn.dataset.login} ya no tiene acceso`);
        await reloadRepoPage();
      });
    case 'cancel-invite':
      return busy(btn, async () => {
        await call('cancelInvitation', pageAccount.alias, r.fullName, btn.dataset.id);
        toast(`Invitación a @${btn.dataset.login} cancelada`);
        await reloadRepoPage();
      });
    case 'edit-desc':
      return editDescription();
    case 'discard':
      if (!confirm(`¿Deshacer los cambios de «${btn.dataset.file}»?\n\nVolverá a como estaba en el último guardado. Si es un archivo nuevo, se borrará.`)) return;
      return busy(btn, async () => {
        renderLocalBox(await call('discardFile', r.localPath, btn.dataset.file));
        toast('Cambios deshechos');
        loadPending();
      });
    case 'ignore':
      return busy(btn, async () => {
        renderLocalBox(await call('ignoreLocal', r.localPath, [btn.dataset.file]));
        toast('No se subirá nunca (solo en este ordenador)');
        loadPending();
      });
    case 'ignore-all': {
      const files = [...$('#local-box').querySelectorAll('[data-act="ignore"]')].map((b) => b.dataset.file);
      if (!confirm(`¿Ignorar estos ${files.length} archivos nuevos?\n\nSe quedan en tu ordenador y la app dejará de avisarte de ellos. No se borra nada.`)) return;
      return busy(btn, async () => {
        renderLocalBox(await call('ignoreLocal', r.localPath, files));
        toast('Listo: esos archivos no se subirán');
        loadPending();
      });
    }
    case 'discard-all':
      if (!confirm('¿Deshacer TODOS tus cambios sin subir?\n\nTodos los archivos volverán a como estaban en el último guardado y los archivos nuevos se borrarán. No se puede recuperar.')) return;
      return busy(btn, async () => {
        renderLocalBox(await call('discardAll', r.localPath));
        toast('Todos los cambios deshechos');
        loadPending();
      });
    case 'close-issue':
      return busy(btn, async () => {
        await call('closeIssue', pageAccount.alias, r.fullName, btn.dataset.number);
        toast(`«${btn.dataset.title}» marcada como hecha ✓`);
        await reloadRepoPage();
      });
    case 'enable-issues':
      return busy(btn, async () => {
        await call('enableIssues', pageAccount.alias, r.fullName);
        await reloadRepoPage();
      });
    case 'archive': {
      const msg = r.archived
        ? `¿Desarchivar «${r.name}»? Se podrán volver a subir cambios.`
        : `¿Archivar «${r.name}»?\n\nQuedará como solo lectura: nadie podrá subir cambios ni añadir tareas. Puedes desarchivarlo cuando quieras.`;
      if (!confirm(msg)) return;
      return busy(btn, async () => {
        await call('setArchived', pageAccount.alias, r.fullName, !r.archived);
        toast(r.archived ? 'Desarchivado' : 'Archivado 📦');
        await reloadRepoPage();
      });
    }
    case 'rename':
      return renameRepo();
  }
});

function renameRepo() {
  modalBody.innerHTML = `
    <h2>Cambiar nombre de «${esc(repo.name)}»</h2>
    <form id="rename-form">
      <label>Nombre nuevo
        <small>Sin espacios. Los enlaces antiguos seguirán funcionando.</small>
        <input name="name" value="${esc(repo.name)}" required pattern="[A-Za-z0-9._-]+" autofocus>
      </label>
      ${repo.localPath ? '<p class="muted">También se cambiará en tu ordenador (si la carpeta está abierta en otro programa, se queda con el nombre antiguo).</p>' : ''}
      <div class="modal-actions">
        <button type="button" data-close>Cancelar</button>
        <button class="primary" type="submit">Cambiar nombre</button>
      </div>
    </form>`;
  $('#rename-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name');
    if (name === repo.name) return modal.close();
    await busy(e.submitter, async () => {
      const res = await call('renameRepo', pageAccount.alias, repo.fullName, name);
      modal.close();
      toast(
        repo.localPath && !res.folderRenamed
          ? `Ahora se llama «${name}». La carpeta de tu ordenador estaba en uso y conserva el nombre antiguo.`
          : `Ahora se llama «${name}»`
      );
      await reloadRepoPage(res.fullName);
    });
  });
  modal.showModal();
}


function editDescription() {
  modalBody.innerHTML = `
    <h2>Descripción de «${esc(repo.name)}»</h2>
    <form id="desc-form">
      <label>Una frase que explique de qué va el proyecto
        <input name="description" value="${esc(repo.description || '')}" autofocus>
      </label>
      <div class="modal-actions">
        <button type="button" data-close>Cancelar</button>
        <button class="primary" type="submit">Guardar</button>
      </div>
    </form>`;
  $('#desc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await busy(e.submitter, async () => {
      await call('setDescription', pageAccount.alias, repo.fullName, new FormData(e.target).get('description'));
      modal.close();
      toast('Descripción guardada');
      await reloadRepoPage();
    });
  });
  modal.showModal();
}
