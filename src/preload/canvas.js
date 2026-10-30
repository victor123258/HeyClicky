const { contextBridge, ipcRenderer } = require("electron");
const actions = new Set([
  "interact",
  "passthrough",
  "dismiss",
  "reset",
  "step",
  "narrate",
  "tour",
  "stop-audio",
  "animate",
]);
contextBridge.exposeInMainWorld("desktopCanvas", {
  get: () => ipcRenderer.invoke("canvas:get"),
  command: (action, value) => {
    if (!actions.has(action))
      return Promise.reject(Error("Unknown canvas action."));
    return ipcRenderer.invoke("canvas:command", action, value);
  },
  reportError: (message) =>
    ipcRenderer.send("canvas:error", String(message).slice(0, 240)),
  onState: (callback) =>
    ipcRenderer.on("canvas:state", (_event, state) => callback(state)),
});
