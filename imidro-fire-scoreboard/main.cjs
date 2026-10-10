"use strict";
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const { CompetitionStore } = require("./store.cjs");
const { DisplayController, registerStateIPC } = require("./display-controller.cjs");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
let adminWindow, display, store;
function createAdminWindow() {
  adminWindow = new BrowserWindow({ width: 1480, height: 920, minWidth: 1100, minHeight: 720,
    backgroundColor: "#07111f", title: "سامانه امتیازدهی آتش‌نشانان ایمیدرو",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  adminWindow.loadFile(path.join(__dirname, "src", "index.html")).catch(error => dialog.showErrorBox("خطای پنل مدیریت", error.message));
  adminWindow.on("closed", () => { display?.close(); adminWindow = null; });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (adminWindow) { if (adminWindow.isMinimized()) adminWindow.restore(); adminWindow.focus(); } });
  app.whenReady().then(() => {
    store = new CompetitionStore(app.getPath("userData"));
    display = new DisplayController({ BrowserWindow, screen, getState: () => store.view(), onStatus: status => {
      if (adminWindow && !adminWindow.isDestroyed()) adminWindow.webContents.send("display:changed", status);
    } });
    const { assertAdmin } = registerStateIPC({ ipcMain, getStore: () => store, getAdmin: () => adminWindow, display });
    require("./backup-controller.cjs").registerBackups({ipcMain,dialog,getStore:()=>store,getWindow:()=>adminWindow,assertAdmin});
    require("./report.cjs").registerReports({ ipcMain, dialog, BrowserWindow, getStore: () => store, getWindow: () => adminWindow, assertAdmin });
    createAdminWindow();
    app.on("activate", () => { if (!adminWindow) createAdminWindow(); });
  }).catch(error => { dialog.showErrorBox("خطای راه‌اندازی", error.message); app.quit(); });
}
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
