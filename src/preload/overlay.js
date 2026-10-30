const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('overlay', { onEvent: callback => ipcRenderer.on('overlay', (_event, data) => callback(data)) });
