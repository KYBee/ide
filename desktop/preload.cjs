const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sessionControl", {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  selectDirectory: (currentPath) => ipcRenderer.invoke("session-control:select-directory", currentPath)
});
