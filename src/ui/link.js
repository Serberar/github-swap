// Descargar con un enlace.
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
