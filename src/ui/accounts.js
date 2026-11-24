// Cuentas.
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

// Aviso si hay una versión nueva publicada en GitHub.
async function checkUpdate() {
  const version = await call('checkUpdate');
  if (!version) return null;
  $('#update').innerHTML = `<div class="pending setup">
      <div class="grow">
        <b>Hay una versión nueva de GitHub Swap (${esc(version)})</b>
        <div class="muted">Se descarga e instala sola; la app se cerrará y volverá a abrirse.</div>
      </div>
      <button class="primary" id="install-update">Actualizar</button>
    </div>`;
  $('#install-update').addEventListener('click', (e) =>
    busy(e.target, async () => {
      e.target.textContent = 'Descargando…';
      await call('installUpdate');
    })
  );
  return version;
}

call('appVersion').then((v) => ($('#version').textContent = `Versión ${v}`)).catch(() => {});

$('#check-update').addEventListener('click', (e) =>
  busy(e.target, async () => {
    if (await checkUpdate()) $('#update').scrollIntoView({ behavior: 'smooth' });
    else toast('Ya tienes la última versión');
  })
);

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
