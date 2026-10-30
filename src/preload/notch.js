const { contextBridge, ipcRenderer } = require("electron");
const allowed = [
  "get-settings",
  "save-settings",
  "test-key",
  "voices",
  "speech-diagnostics",
  "edge-status",
  "edge-background",
  "edge-setup",
  "edge-close",
  "voice-test",
  "windows-audio-settings",
  "ask",
  "listen",
  "dictate",
  "hold-start",
  "hold-end",
  "stop",
  "clear",
  "approval",
  "delete-data",
  "open-link",
  "tasks",
  "cancel-task",
];
contextBridge.exposeInMainWorld("notch", {
  get: () => ipcRenderer.invoke("notch:get"),
  call: (name, ...args) => {
    if (!allowed.includes(name))
      return Promise.reject(Error("Unknown notch action."));
    return ipcRenderer.invoke(name, ...args);
  },
  action: (name) => ipcRenderer.invoke("notch:action", name),
  open: (route) => ipcRenderer.invoke("notch:open", route),
  peek: () => ipcRenderer.invoke("notch:peek"),
  expand: (value) => ipcRenderer.invoke("notch:expand", value),
  onEvent: (callback) =>
    ipcRenderer.on("notch:event", (_event, data) => callback(data)),
  onAppEvent: (callback) =>
    ipcRenderer.on("event", (_event, data) => callback(data)),
});
