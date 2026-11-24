// Pestañas.
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
