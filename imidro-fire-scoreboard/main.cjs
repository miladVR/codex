"use strict";

const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const { CompetitionStore } = require("./store.cjs");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let adminWindow;
let displayWindow;
let store;

function createAdminWindow() {
  adminWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#07111f",
    title: "سامانه امتیازدهی آتش‌نشانان ایمیدرو",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  adminWindow.loadFile(path.join(__dirname, "src", "index.html"));
  adminWindow.on("closed", () => { adminWindow = null; });
}

function openDisplay() {
  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.focus();
    return;
  }
  const primary = screen.getPrimaryDisplay();
  const target = screen.getAllDisplays().find((item) => item.id !== primary.id) ?? primary;
  displayWindow = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    fullscreen: target.id !== primary.id,
    frame: target.id === primary.id,
    autoHideMenuBar: true,
    backgroundColor: "#030915",
    title: "نمایش زنده نتایج",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  displayWindow.loadFile(path.join(__dirname, "src", "display.html"));
  displayWindow.on("closed", () => { displayWindow = null; });
}

function broadcast() {
  const state = store.view();
  for (const window of [adminWindow, displayWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send("state:changed", state);
  }
  return state;
}

function handleMutation(channel, operation) {
  ipcMain.handle(channel, (_event, payload = {}) => {
    const state = operation(payload);
    broadcast();
    return state;
  });
}

app.whenReady().then(() => {
  store = new CompetitionStore(app.getPath("userData"));
  ipcMain.handle("state:get", () => store.view());
  handleMutation("team:add", (payload) => store.addTeam(payload));
  handleMutation("result:save", (payload) => store.saveResult(payload));
  handleMutation("result:approve", (payload) => store.approveResult(payload));
  handleMutation("result:reopen", (payload) => store.reopenResult(payload));
  handleMutation("settings:update", (payload) => store.updateSettings(payload));
  ipcMain.handle("display:open", () => { openDisplay(); return { ok: true }; });
  ipcMain.handle("display:close", () => { if (displayWindow && !displayWindow.isDestroyed()) displayWindow.close(); return { ok: true }; });
  ipcMain.handle("data:backup", async () => {
    const result = await dialog.showSaveDialog(adminWindow, { title: "ذخیره نسخه پشتیبان", defaultPath: `imidro-fire-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    store.exportSnapshot(result.filePath);
    return { canceled: false, filePath: result.filePath };
  });
  createAdminWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createAdminWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
