const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  isElectron: true,
  readClipboard: () => ipcRenderer.invoke('desktop:clipboard-read'),
  writeClipboard: (text) => ipcRenderer.invoke('desktop:clipboard-write', text),
});
