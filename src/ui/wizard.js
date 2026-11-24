// Asistente para añadir cuenta.
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
