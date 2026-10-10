"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scoreboardAPI", {
  saveScientificScore:payload=>ipcRenderer.invoke("scientific:save",payload),
  saveParticipant:payload=>ipcRenderer.invoke("participant:save",payload),
  prepareRestore:()=>ipcRenderer.invoke("data:restore-prepare"),
  confirmRestore:payload=>ipcRenderer.invoke("data:restore-confirm",payload),
  saveRoundScore:payload => ipcRenderer.invoke("round:save",payload),
  prepareDeletion:payload => ipcRenderer.invoke("delete:prepare",payload),
  confirmDeletion:payload => ipcRenderer.invoke("delete:confirm",payload),
  getState: () => ipcRenderer.invoke("state:get"),
  createDraw: (payload) => ipcRenderer.invoke("draw:create", payload),
  setDisplay: (payload) => ipcRenderer.invoke("display:set", payload),
  exportReport: (payload) => ipcRenderer.invoke("report:export", payload),
  addTeam: (payload) => ipcRenderer.invoke("team:add", payload),
  saveResult: (payload) => ipcRenderer.invoke("result:save", payload),
  approveResult: (payload) => ipcRenderer.invoke("result:approve", payload),
  reopenResult: (payload) => ipcRenderer.invoke("result:reopen", payload),
  updateSettings: (payload) => ipcRenderer.invoke("settings:update", payload),
  openDisplay: (payload) => ipcRenderer.invoke("display:open", payload),
  getDisplayStatus: () => ipcRenderer.invoke("display:status"),
  onDisplayChange: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("display:changed", listener);
    return () => ipcRenderer.removeListener("display:changed", listener);
  },
  closeDisplay: () => ipcRenderer.invoke("display:close"),
  backup: () => ipcRenderer.invoke("data:backup"),
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  }
});
