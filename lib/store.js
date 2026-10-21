const fs = require('fs');
const path = require('path');

// Metadatos de la app (nombre/email por cuenta, carpetas asignadas, última carpeta escaneada).
// La fuente de verdad de las cuentas sigue siendo ~/.ssh/config.
class Store {
  constructor(dir) {
    this.file = path.join(dir, 'github-swap.json');
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.data = {};
    }
    this.data.accounts ??= {};
  }

  account(alias) {
    return (this.data.accounts[alias] ??= { label: '', name: '', email: '', folders: [] });
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}

module.exports = { Store };
