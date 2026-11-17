const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('snowAPI', {
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  onCommand: (cb) => ipcRenderer.on('command', (_e, c) => cb(c)),
});
