const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('notch', {
  get: () => ipcRenderer.invoke('notch:get'),
  action: name => ipcRenderer.invoke('notch:action', name),
  expand: value => ipcRenderer.invoke('notch:expand', value),
  onEvent: callback => ipcRenderer.on('notch:event', (_event, data) => callback(data))
});
