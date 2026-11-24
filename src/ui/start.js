// Arranque: se carga el último, con todas las secciones ya definidas.
loadAccounts()
  .then(() => Promise.all([checkConnections(), loadPending()]))
  .catch((err) => toast(err.message, true));
