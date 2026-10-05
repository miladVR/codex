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
    ipcMain.handle("data:backup", async event => {
      assertAdmin(event);
      const result = await dialog.showSaveDialog(adminWindow, { title: "ذخیره نسخه پشتیبان",
        defaultPath: `imidro-fire-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (result.canceled || !result.filePath) return { canceled: true };
      store.exportSnapshot(result.filePath); return { canceled: false, filePath: result.filePath };
    });
    require("./report.cjs").registerReports({ ipcMain, dialog, BrowserWindow, getStore: () => store, getWindow: () => adminWindow, assertAdmin });
    createAdminWindow();
    app.on("activate", () => { if (!adminWindow) createAdminWindow(); });
  }).catch(error => { dialog.showErrorBox("خطای راه‌اندازی", error.message); app.quit(); });
}
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
