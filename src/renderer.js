const $ = (sel) => document.querySelector(sel);
const modal = $('#modal');
const modalBody = $('#modal-body');

let accounts = [];
let globalIdentity = {};
let hasGh = true;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function call(name, ...args) {
  const r = await window.api.call(name, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), isError ? 6000 : 3000);
}

// Deshabilita el botón mientras corre la acción y muestra los errores en un aviso.
async function busy(btn, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Un momento…';
  try {
    return await fn();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

function labelFor(alias) {
  return accounts.find((a) => a.alias === alias)?.label;
}

/* ---------- Pestañas ---------- */

function showView(id) {
  document.querySelectorAll('.tab, .view').forEach((el) => el.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${id}"]`)?.classList.add('active');
  $('#' + id).classList.add('active');
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    showView(tab.dataset.tab);
    if (tab.dataset.tab === 'projects') loadProjects(false);
    if (tab.dataset.tab === 'accounts') loadPending();
  })
);

/* ---------- Cuentas ---------- */

async function loadAccounts() {
  const data = await call('listAccounts');
  accounts = data.accounts;
  globalIdentity = data.global;
  hasGh = data.hasGh;
  renderSetup(data.hasGit);
  renderAccounts();
}

// Aviso si falta Git: sin él no se puede descargar ni subir nada.
function renderSetup(hasGit) {
  $('#setup').innerHTML = hasGit
    ? ''
    : `<div class="pending setup">
        <div class="grow">
          <b>⚠️ Falta Git en este ordenador</b>
          <div class="muted">Sin Git la app no puede descargar ni subir proyectos. Se instala en un par de minutos; Windows te pedirá permiso.</div>
        </div>
        <button class="primary" id="install-git">Instalar Git</button>
      </div>`;
  $('#install-git')?.addEventListener('click', (e) =>
    busy(e.target, async () => {
      e.target.textContent = 'Instalando… (puede tardar)';
      await call('installGit');
      toast('Git instalado ✓');
      await loadAccounts();
    })
  );
}

// Rutas más cortas para leer: «C:\Users\X\Desktop\…» → «Escritorio\…».
function shortPath(p) {
  return String(p || '')
    .replace(/^[A-Z]:\\Users\\[^\\]+\\(Desktop|Escritorio)(?=\\|$)/i, 'Escritorio')
    .replace(/^[A-Z]:\\Users\\[^\\]+(?=\\|$)/i, 'Mi carpeta de usuario');
}

function avatar(a) {
  return a.githubUser
    ? `<img class="avatar" src="https://github.com/${esc(a.githubUser)}.png?size=96" alt="">`
    : `<div class="avatar">${esc(a.label.charAt(0).toUpperCase())}</div>`;
}

function renderAccounts() {
  const list = $('#account-list');
  if (!accounts.length) {
    list.innerHTML = `<div class="card"><h3>Aún no hay cuentas</h3><p class="muted">Pulsa «Añadir cuenta» y te guiamos paso a paso.</p></div>`;
    return;
  }
  list.innerHTML = accounts
    .map((a) => {
      const isDefault = a.email && a.email === globalIdentity.email;
      const status = a.githubUser
        ? `<span class="ok-text">✓ Conectada como @${esc(a.githubUser)}</span>`
        : checking && a.hasKey
          ? `<span class="muted">Comprobando conexión…</span>`
          : `<span class="warn-text">⚠️ ${a.hasKey ? 'No conecta con GitHub' : 'Falta la llave'}</span>`;
      const folder = a.folders.length
        ? a.folders.map((f) => `<div class="path" title="${esc(f)}">${esc(shortPath(f))}</div>`).join('')
        : `<div class="muted">Aún no hay ninguna. Te la pediremos la primera vez que descargues un proyecto.</div>`;
      const keyName = a.keyFile ? a.keyFile.split(/[\\/]/).pop() : null;
      const main = !a.githubUser
        ? checking && a.hasKey
          ? ''
          : `<button class="primary" data-act="finish">Terminar configuración</button>`
        : hasGh
          ? `<button class="primary" data-act="${a.apiAccess ? 'projects' : 'grant'}">📂 Ver mis proyectos</button>`
          : `<span class="muted">Instala GitHub CLI (cli.github.com) para ver y crear proyectos desde aquí.</span>`;
      return `
      <article class="card account" data-alias="${esc(a.alias)}">
        <div class="card-head">
          ${avatar(a)}
          <div class="grow">
            <h3>${esc(a.label)}
              <button class="icon" data-act="edit" title="Editar nombre y email" aria-label="Editar">✏️</button>
              ${isDefault ? '<span class="badge neutral" title="Se usa en los proyectos que no están en la carpeta de ninguna cuenta">Por defecto</span>' : ''}
            </h3>
            <div>${status}</div>
            <div class="muted">${esc(a.name || 'Sin nombre')} · ${esc(a.email || 'sin email')}</div>
          </div>
        </div>
        <div class="acc-row">
          <div class="grow">
            <div class="label">📁 Sus proyectos se guardan en</div>
            ${folder}
            ${a.folders.length ? '<div class="muted small">Todo lo que haya en esta carpeta usa esta cuenta automáticamente.</div>' : ''}
          </div>
          <button class="link" data-act="set-folder">${a.folders.length ? 'Cambiar' : 'Elegir'}</button>
        </div>
        <div class="acc-row">
          <div class="grow">
            <div class="label">🔑 Llave SSH</div>
            <div class="path">${keyName ? esc(keyName) : '—'}</div>
          </div>
          ${a.hasKey ? '<button class="link" data-act="copy-key">Copiar llave pública</button>' : ''}
        </div>
        <div class="acc-foot">
          ${main}
          <span class="grow"></span>
          ${isDefault ? '' : `<button class="link" data-act="default" title="Se usará en los proyectos que no estén en la carpeta de ninguna cuenta">Usar por defecto</button>`}
          ${a.managed ? `<button class="link danger" data-act="remove">Quitar</button>` : ''}
        </div>
      </article>`;
    })
    .join('');
}

// Comprueba en segundo plano que cada llave sigue funcionando (sin botón «Comprobar»).
let checking = false;
async function checkConnections() {
  checking = true;
  renderAccounts();
  await Promise.all(accounts.filter((a) => a.hasKey).map((a) => call('testAccount', a.alias).catch(() => null)));
  checking = false;
  await loadAccounts();
}

$('#account-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const alias = btn.closest('[data-alias]').dataset.alias;
  const acc = accounts.find((a) => a.alias === alias);
  switch (btn.dataset.act) {
    case 'finish':
      return wizard(acc, 2);
    case 'projects':
      return openAccountPage(acc);
    case 'grant':
      return grantAccess(acc);
    case 'edit':
      return editAccount(acc);
    case 'set-folder':
      if (
        acc.folders.length &&
        !confirm(
          'Elige la nueva carpeta para esta cuenta.\n\nNo se mueve ni se borra nada: los proyectos que ya estén en la carpeta antigua seguirán ahí, pero dejarán de usar esta cuenta automáticamente.'
        )
      )
        return;
      return busy(btn, async () => {
        if (await call('setFolder', alias)) {
          toast('Carpeta cambiada');
          await loadAccounts();
        }
      });
    case 'copy-key':
      return busy(btn, async () => {
        await call('copyPublicKey', alias);
        toast('Llave pública copiada');
      });
    case 'default':
      return busy(btn, async () => {
        await call('makeDefault', alias);
        toast(`«${acc.label}» es ahora la cuenta por defecto`);
        await loadAccounts();
      });
    case 'remove':
      if (!confirm(`¿Quitar la cuenta «${acc.label}»?\n\nLa llave se queda guardada en tu ordenador por si la necesitas.`)) return;
      return busy(btn, async () => {
        await call('removeAccount', alias);
        await loadAccounts();
      });
  }
});

/* ---------- Asistente para añadir cuenta ---------- */

$('#add-account').addEventListener('click', () => wizard(null, 1));

function steps(n) {
  return `<div class="steps">${[1, 2, 3].map((i) => `<span class="${i <= n ? 'done' : ''}"></span>`).join('')}</div>`;
}

function wizard(acc, step) {
  if (step === 1) {
    modalBody.innerHTML = `
      ${steps(1)}
      <h2>Nueva cuenta</h2>
      <form id="wiz-form">
        <label>¿Cómo quieres llamarla?
          <small>Solo para ti. Por ejemplo: Trabajo, Personal, Clientes…</small>
          <input name="label" required autofocus>
        </label>
        <label>Tu nombre
          <small>Aparecerá en los cambios que subas.</small>
          <input name="name" required>
        </label>
        <label>Email de esa cuenta de GitHub
          <input name="email" type="email" required>
        </label>
        <div class="modal-actions">
          <button type="button" data-close>Cancelar</button>
          <button class="primary" type="submit">Siguiente</button>
        </div>
      </form>`;
    $('#wiz-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      await busy(e.submitter, async () => {
        const created = await call('createAccount', data);
        await loadAccounts();
        wizard(created, 2);
      });
    });
  }

  if (step === 2) return hasGh ? connectWizard(acc) : wizard(acc, 'manual');

  if (step === 'done') {
    modalBody.innerHTML = `
      ${steps(3)}
      <h2>¡Listo!</h2>
      <div class="result ok">«${esc(acc.label)}» está conectada como @${esc(acc.githubUser)}. Ya puedes usarla.</div>
      <div class="modal-actions">
        <button data-close>Cerrar</button>
        <button class="primary" id="go-projects">📂 Ver mis proyectos</button>
      </div>`;
    $('#go-projects').addEventListener('click', () => {
      modal.close();
      const fresh = accounts.find((a) => a.alias === acc.alias);
      if (fresh) openAccountPage(fresh);
    });
  }

  if (step === 'manual') {
    modalBody.innerHTML = `
      ${steps(2)}
      <h2>Conecta «${esc(acc.label)}» con GitHub</h2>
      <p>Hemos creado una <b>llave</b> para esta cuenta. Ahora hay que dársela a GitHub:</p>
      <ol class="howto">
        <li>Abre tu navegador con la sesión de <b>esta</b> cuenta de GitHub iniciada (no la otra).</li>
        <li>Pulsa el botón azul: copiamos la llave y abrimos la página de GitHub.</li>
        <li>En «Title» pon lo que quieras (ej. «Mi PC»), pega la llave en «Key» con <b>Ctrl+V</b> y pulsa <b>Add SSH key</b>.</li>
      </ol>
      <p><button class="primary" id="copy-open">Copiar llave y abrir GitHub</button></p>
      <div class="modal-actions">
        <button type="button" data-close>Más tarde</button>
        <button class="primary" id="next">Ya lo he hecho →</button>
      </div>`;
    $('#copy-open').addEventListener('click', (e) =>
      busy(e.target, async () => {
        await call('copyKeyAndOpenGitHub', acc.alias);
        toast('Llave copiada. Pégala en GitHub con Ctrl+V');
      })
    );
    $('#next').addEventListener('click', () => wizard(acc, 'check'));
  }

  if (step === 'check') {
    modalBody.innerHTML = `
      ${steps(3)}
      <h2>Comprobando…</h2>
      <div id="check" class="result">Hablando con GitHub…</div>
      <div class="modal-actions" id="check-actions"></div>`;
    call('testAccount', acc.alias)
      .then(async (r) => {
        await loadAccounts();
        const box = $('#check');
        const actions = $('#check-actions');
        if (r.ok) {
          modalBody.querySelector('h2').textContent = '¡Listo!';
          box.className = 'result ok';
          box.textContent = `«${acc.label}» está conectada como @${r.user}. Ya puedes usarla.`;
          actions.innerHTML = `<button class="primary" data-close>Terminar</button>`;
        } else {
          modalBody.querySelector('h2').textContent = 'Todavía no funciona';
          box.className = 'result err';
          box.textContent = 'GitHub aún no reconoce la llave. ¿La pegaste en la cuenta correcta y pulsaste «Add SSH key»?';
          actions.innerHTML = `<button id="back">← Volver al paso anterior</button><button class="primary" id="retry">Reintentar</button>`;
          $('#back').addEventListener('click', () => wizard(acc, 'manual'));
          $('#retry').addEventListener('click', () => wizard(acc, 'check'));
        }
      })
      .catch((err) => toast(err.message, true));
  }

  if (!modal.open) modal.showModal();
}

// Paso 2 automático: un solo código en GitHub y la app sube la llave y da acceso a los proyectos.
async function connectWizard(acc) {
  const ok = await codeModal({
    header: steps(2),
    title: `Conecta «${acc.label}» con GitHub`,
    intro: 'La app subirá la llave a GitHub y te dará acceso a tus proyectos, todo de una vez.',
    user: null,
    closeOnSuccess: false,
    alt: { label: 'Prefiero pegar la llave a mano', onClick: () => wizard(acc, 'manual') },
    action: () => call('connectAccount', acc.alias),
  });
  if (!ok) return;
  await loadAccounts();
  wizard(accounts.find((a) => a.alias === acc.alias) || acc, 'done');
}

function editAccount(acc) {
  modalBody.innerHTML = `
    <h2>Editar «${esc(acc.label)}»</h2>
    <form id="edit-form">
      <label>Nombre de la cuenta <input name="label" value="${esc(acc.label)}" required></label>
      <label>Tu nombre <small>Aparecerá en los cambios que subas.</small><input name="name" value="${esc(acc.name)}" required></label>
      <label>Email <input name="email" type="email" value="${esc(acc.email)}" required></label>
      <div class="modal-actions">
        <button type="button" data-close>Cancelar</button>
        <button class="primary" type="submit">Guardar</button>
      </div>
    </form>`;
  $('#edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await busy(e.submitter, async () => {
      await call('updateAccount', acc.alias, Object.fromEntries(new FormData(e.target)));
      modal.close();
      await loadAccounts();
      toast('Guardado');
    });
  });
  modal.showModal();
}

modal.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) modal.close();
});

/* ---------- Acceso a los proyectos (login de gh) ---------- */

let grantPending = false;

modal.addEventListener('close', () => {
  if (grantPending) {
    grantPending = false;
    call('cancelAccess');
  }
});

window.api.onLoginCode((code) => {
  const box = $('#login-code');
  if (!box) return;
  box.textContent = code;
  $('#open-device').disabled = false;
});

// Diálogo con el código de un solo uso de GitHub. Resuelve true si GitHub dio el permiso.
// user: la cuenta con la que hay que entrar (null si es una cuenta nueva); alt: botón alternativo.
function codeModal({ title, intro, user, action, header = '', alt = null, closeOnSuccess = true }) {
  return new Promise((resolve) => {
    modalBody.innerHTML = `
      ${header}
      <h2>${esc(title)}</h2>
      <p>${esc(intro)}</p>
      <ol class="howto">
        <li>${
          user
            ? `Comprueba que en el navegador has entrado como <b>@${esc(user)}</b>.`
            : 'Abre el navegador con la sesión de <b>la cuenta de GitHub que quieres añadir</b> (no otra).'
        }</li>
        <li>Pulsa el botón, pega el código en GitHub y acepta.</li>
      </ol>
      <div class="code" id="login-code">· · · · – · · · ·</div>
      <p><button class="primary" id="open-device" disabled>Copiar código y abrir GitHub</button></p>
      <p class="muted" id="login-status">Esperando a que aceptes en GitHub…</p>
      <div class="modal-actions">
        ${alt ? `<button type="button" class="link" id="code-alt">${esc(alt.label)}</button><span class="grow"></span>` : ''}
        <button type="button" data-close>Cancelar</button>
      </div>`;
    $('#open-device').addEventListener('click', async () => {
      await navigator.clipboard.writeText($('#login-code').textContent).catch(() => {});
      call('openOnGitHub', 'https://github.com/login/device');
    });
    $('#code-alt')?.addEventListener('click', () => {
      if (grantPending) {
        grantPending = false;
        call('cancelAccess');
      }
      resolve(false);
      alt.onClick();
    });
    modal.showModal();
    document.activeElement?.blur(); // que el foco no resalte el enlace alternativo

    grantPending = true;
    action()
      .then(() => {
        if (!grantPending) return; // se eligió la alternativa
        grantPending = false;
        if (closeOnSuccess) modal.close();
        resolve(true);
      })
      .catch((err) => {
        if (grantPending) {
          grantPending = false;
          const status = $('#login-status');
          status.className = 'result err';
          status.textContent = err.message;
        }
        resolve(false);
      });
  });
}

async function grantAccess(acc) {
  const ok = await codeModal({
    title: `Ver los proyectos de «${acc.label}»`,
    intro: 'Solo hay que hacerlo una vez. GitHub te pedirá permiso para que esta app vea y cree tus proyectos.',
    user: acc.githubUser,
    action: () => call('grantAccess', acc.alias),
  });
  if (!ok) return;
  toast('¡Listo! Ya puedes ver tus proyectos');
  await loadAccounts();
  openAccountPage(accounts.find((a) => a.alias === acc.alias));
}

/* ---------- Proyectos de una cuenta ---------- */

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

/* ---------- Proyectos en el ordenador ---------- */

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

/* ---------- Página de un proyecto ---------- */

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
        <button class="link" data-act="ignore" data-file="${esc(c.file)}">No subir nunca</button></li>`
    );
    parts.push(`
      <div class="local-group">
        <div class="group-head"><b>${plural(untracked.length, 'archivo nuevo que nunca se ha subido', 'archivos nuevos que nunca se han subido')}</b>
          <button class="link" data-act="ignore-all">No subir ninguno</button></div>
        <div class="muted">Si son solo tuyos (documentos, pruebas…) y no deben ir a GitHub, márcalos como «No subir nunca».</div>
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
      if (!confirm(`¿No subir nunca estos ${files.length} archivos nuevos?\n\nSe quedan en tu ordenador y la app dejará de avisarte de ellos. No se borra nada.`)) return;
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

/* ---------- Descargar con un enlace ---------- */

$('#link-repo').addEventListener('click', () => {
  modalBody.innerHTML = `
    <h2>Descargar con un enlace</h2>
    <form id="link-form">
      <label>Enlace del proyecto
        <small>El que te han pasado, o el que ves en la barra del navegador.</small>
        <input name="url" placeholder="https://github.com/usuario/proyecto" required autofocus>
      </label>
      <p class="muted">Se descargará con la cuenta «${esc(pageAccount.label)}».</p>
      <div id="link-result"></div>
      <div class="modal-actions">
        <button type="button" data-close>Cancelar</button>
        <button class="primary" type="submit">Descargar</button>
      </div>
    </form>`;
  $('#link-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = $('#link-result');
    out.innerHTML = '';
    const btn = e.submitter;
    btn.disabled = true;
    btn.textContent = 'Descargando…';
    try {
      const dest = await call('cloneProject', new FormData(e.target).get('url'), pageAccount.alias);
      if (dest) {
        modal.close();
        toast('Descargado ✓');
        call('openFolder', dest);
        await loadAccounts();
        await reloadRepos();
      }
    } catch (err) {
      out.innerHTML = `<div class="result err">${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Descargar';
    }
  });
  modal.showModal();
});

/* ---------- Avisos de trabajo pendiente ---------- */

async function loadPending() {
  const box = $('#pending');
  try {
    const items = await call('pendingWork');
    box.innerHTML = items.length
      ? `<div class="pending"><b>⚠️ Tienes trabajo pendiente</b><ul class="people">${items
          .map((p) => {
            const what = [
              p.modified && plural(p.modified, 'archivo cambiado sin subir', 'archivos cambiados sin subir'),
              p.untracked && plural(p.untracked, 'archivo nuevo nunca subido', 'archivos nuevos nunca subidos'),
              p.ahead && plural(p.ahead, 'cambio guardado sin subir', 'cambios guardados sin subir'),
              p.behind && plural(p.behind, 'cambio nuevo en GitHub', 'cambios nuevos en GitHub'),
            ]
              .filter(Boolean)
              .join(' · ');
            return `<li><span class="grow"><b>${esc(p.name)}</b> <span class="muted">${esc(labelFor(p.alias) || '')}</span>
              <div class="muted">${what}</div><div class="muted path" title="${esc(p.path)}">📁 ${esc(shortPath(p.path))}</div></span>
              <button data-alias="${esc(p.alias)}" data-repo="${esc(p.fullName)}" data-path="${esc(p.path)}">Ver</button></li>`;
          })
          .join('')}</ul></div>`
      : '';
  } catch {
    box.innerHTML = '';
  }
}

$('#pending').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-repo]');
  if (!btn) return;
  const acc = accounts.find((a) => a.alias === btn.dataset.alias);
  if (!acc?.apiAccess) return toast('Primero pulsa «Ver mis proyectos» en esa cuenta para darle acceso', true);
  openAccountPage(acc);
  openRepoPage(btn.dataset.repo, { path: btn.dataset.path, focus: true });
});

loadAccounts()
  .then(() => Promise.all([checkConnections(), loadPending()]))
  .catch((err) => toast(err.message, true));
