const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openUserData: () => ipcRenderer.invoke('open-user-data'),
  exportBackup: () => ipcRenderer.invoke('export-backup')
});
