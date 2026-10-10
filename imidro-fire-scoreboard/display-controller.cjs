"use strict";
const path = require("node:path");

class DisplayController {
  constructor({ BrowserWindow, screen, getState, onStatus = () => {} }) {
    this.BrowserWindow = BrowserWindow; this.screen = screen;
    this.getState = getState; this.onStatus = onStatus;
    this.window = null; this.mode = "extend"; this.targetId = null; this.preferredId = null; this.error = null;
    this.pending = null; this.recovered = false;
    for (const event of ["display-added", "display-removed", "display-metrics-changed"])
      screen.on(event, () => { if (this.window) this.place(); this.onStatus(this.status()); });
  }
  status() {
    const primary = this.screen.getPrimaryDisplay();
    return { open: Boolean(this.window && !this.window.isDestroyed()), mode: this.mode, targetId: this.targetId, error: this.error,
      displays: this.screen.getAllDisplays().map(display => ({ id: display.id, primary: display.id === primary.id,
        label: display.label || `نمایشگر ${display.id}`, bounds: display.bounds })) };
  }
  target() {
    const primary = this.screen.getPrimaryDisplay();
    const displays = this.screen.getAllDisplays();
    return displays.find(display => display.id === this.preferredId) ??
      (this.mode === "extend" ? displays.find(display => display.id !== primary.id) : primary) ?? primary;
  }
  place() {
    if (!this.window || this.window.isDestroyed()) return;
    const target = this.target(), primary = this.screen.getPrimaryDisplay();
    this.targetId = target.id;
    this.window.setFullScreen(false);
    this.window.setBounds(target.bounds);
    this.window.setFullScreen(this.mode === "extend" && target.id !== primary.id);
  }
  send(state) {
    if (this.window && !this.window.isDestroyed() && !this.window.webContents.isLoading())
      this.window.webContents.send("state:changed", state);
  }
  async open(payload = {}) {
    const mode = payload.mode ?? this.mode;
    if (!["extend", "mirror"].includes(mode)) throw new Error("حالت پنجره معتبر نیست.");
    if (payload.displayId != null && !this.screen.getAllDisplays().some(display => display.id === Number(payload.displayId)))
      throw new Error("نمایشگر انتخاب‌شده متصل نیست.");
    const modeChanged = mode !== this.mode;
    this.mode = mode;
    if (payload.displayId != null) this.preferredId = Number(payload.displayId);
    else if (modeChanged || Object.hasOwn(payload, "displayId")) this.preferredId = null;
    if (this.pending) { await this.pending; this.place(); return this.status(); }
    if (this.window && !this.window.isDestroyed()) {
      this.place(); this.window.show(); this.window.focus(); this.send(this.getState());
      this.onStatus(this.status()); return this.status();
    }
    this.error = null; this.recovered = false;
    const window = new this.BrowserWindow({ show: false, width: 1280, height: 720, frame: true,
      autoHideMenuBar: true, backgroundColor: "#030915", title: "نمایش زنده نتایج",
      webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true,
        nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    this.window = window;
    window.on("closed", () => { if (this.window === window) this.window = null; this.onStatus(this.status()); });
    window.webContents.on("did-finish-load", () => { this.error = null; this.send(this.getState()); this.onStatus(this.status()); });
    window.webContents.on("render-process-gone", (_event, details) => {
      this.error = `نمایشگر متوقف شد: ${details.reason}`; this.onStatus(this.status());
      if (!this.recovered && !window.isDestroyed()) { this.recovered = true; window.reload(); }
    });
    this.place();
    this.pending = window.loadFile(path.join(__dirname, "src", "display.html"));
    try {
      await this.pending;
      if (window.isDestroyed()) throw new Error("پنجره پیش از آماده‌شدن بسته شد.");
      this.error = null; this.send(this.getState()); window.show();
      this.onStatus(this.status()); return this.status();
    } catch (error) {
      this.error = `صفحه سالن بارگذاری نشد: ${error.message}`;
      if (!window.isDestroyed()) window.destroy();
      this.onStatus(this.status()); throw new Error(this.error, { cause: error });
    } finally { this.pending = null; }
  }
  close() { if (this.window && !this.window.isDestroyed()) this.window.close(); return this.status(); }
}

function registerStateIPC({ ipcMain, getStore, getAdmin, display }) {
  const assertAdmin = event => {
    if (!getAdmin() || event.sender !== getAdmin().webContents) throw new Error("این عملیات فقط از پنل مدیریت مجاز است.");
  };
  const broadcast = state => {
    const admin = getAdmin();
    if (admin && !admin.isDestroyed() && !admin.webContents.isLoading()) admin.webContents.send("state:changed", state);
    display.send(state);
  };
  ipcMain.handle("state:get", event => {
    if (event.sender !== getAdmin()?.webContents && event.sender !== display.window?.webContents) throw new Error("پنجره نامعتبر است.");
    return getStore().view();
  });
  for (const [channel, method] of Object.entries({ "draw:create": "createDraw", "display:set": "setDisplay", "team:add": "addTeam",
    "result:save": "saveResult", "result:approve": "approveResult", "result:reopen": "reopenResult", "settings:update": "updateSettings", "round:save":"saveRoundScore", "scientific:save":"saveScientificScore", "participant:save":"saveParticipant", "data:restore-confirm":"confirmRestore", "delete:confirm":"confirmDeletion" })) {
    ipcMain.handle(channel, (event, payload = {}) => { assertAdmin(event); const state = getStore()[method](payload); broadcast(state); return state; });
  }
  ipcMain.handle("delete:prepare", (event,payload) => { assertAdmin(event); return getStore().prepareDeletion(payload); });
  ipcMain.handle("display:open", (event, payload) => { assertAdmin(event); return display.open(payload); });
  ipcMain.handle("display:close", event => { assertAdmin(event); return display.close(); });
  ipcMain.handle("display:status", event => { assertAdmin(event); return display.status(); });
  return { broadcast, assertAdmin };
}
module.exports = { DisplayController, registerStateIPC };
