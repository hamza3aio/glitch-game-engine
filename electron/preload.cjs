const { contextBridge, ipcRenderer } = require("electron");

// Renderer-side API for launcher + editor. Absent in plain browsers
// (regular web builds fall back to localStorage / file download).
contextBridge.exposeInMainWorld("glitch", {
  version: () => ipcRenderer.invoke("glitch:version"),
  recents: () => ipcRenderer.invoke("glitch:recents"),
  newProject: (name) => ipcRenderer.invoke("glitch:new-project", { name }),
  openSample: () => ipcRenderer.invoke("glitch:open-sample"),
  openProject: (path) => ipcRenderer.invoke("glitch:open-project", { path }),
  pickFolder: () => ipcRenderer.invoke("glitch:pick-folder"),
  showInFolder: (path) => ipcRenderer.invoke("glitch:show-in-folder", { path }),
  readScene: (path) => ipcRenderer.invoke("glitch:read-scene", { path }),
  writeScene: (path, scene) => ipcRenderer.invoke("glitch:write-scene", { path, scene }),
  onOpenProject: (fn) => ipcRenderer.on("open-project", (_e, q) => fn(q)),
});
