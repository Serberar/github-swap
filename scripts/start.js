// Lanza Electron sin ELECTRON_RUN_AS_NODE (VS Code la exporta en su terminal
// y hace que Electron arranque como Node puro, sin ventana).
const { spawn } = require('child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.'], { stdio: 'inherit', env, windowsHide: false });
child.on('exit', (code) => process.exit(code ?? 0));
