// Utilidades comunes: llamadas al proceso principal, avisos y estado compartido.
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
