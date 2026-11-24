// Acceso a los proyectos (login de gh).
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
