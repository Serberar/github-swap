const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  call: (name, ...args) => ipcRenderer.invoke('call', name, ...args),
  onLoginCode: (cb) => ipcRenderer.on('login-code', (_e, code) => cb(code)),
  onScanProgress: (cb) => ipcRenderer.on('scan-progress', (_e, p) => cb(p)),
});
