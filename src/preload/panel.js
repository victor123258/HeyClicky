const { contextBridge, ipcRenderer } = require('electron');
const channels = ['get-settings', 'save-settings', 'test-key', 'voices', 'ask', 'listen', 'dictate', 'stop', 'hide', 'clear', 'approval', 'delete-data', 'open-link'];
contextBridge.exposeInMainWorld('clicky', {
  call: (channel, ...args) => { if (!channels.includes(channel)) return Promise.reject(Error('Unknown action.')); return ipcRenderer.invoke(channel, ...args); },
  onEvent: callback => { const handler = (_event, data) => callback(data); ipcRenderer.on('event', handler); return () => ipcRenderer.removeListener('event', handler); }
});
