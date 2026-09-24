"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scoreboardAPI", {
  getState: () => ipcRenderer.invoke("state:get"),
  addTeam: (payload) => ipcRenderer.invoke("team:add", payload),
  saveResult: (payload) => ipcRenderer.invoke("result:save", payload),
  approveResult: (payload) => ipcRenderer.invoke("result:approve", payload),
  reopenResult: (payload) => ipcRenderer.invoke("result:reopen", payload),
  updateSettings: (payload) => ipcRenderer.invoke("settings:update", payload),
  openDisplay: () => ipcRenderer.invoke("display:open"),
  closeDisplay: () => ipcRenderer.invoke("display:close"),
  backup: () => ipcRenderer.invoke("data:backup"),
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  }
});
