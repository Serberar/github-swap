const { execFile } = require('child_process');

// Ejecuta un programa sin shell y nunca rechaza: devuelve { ok, code, stdout, stderr }.
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 20000, ...opts }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || (err && !stdout ? err.message : '')),
      });
    });
  });
}

module.exports = { run };
