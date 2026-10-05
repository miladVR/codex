"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { DisplayController, registerStateIPC } = require("../display-controller.cjs");
function fixture() {
  const primary = { id: 1, bounds: { x: 0, y: 0, width: 1280, height: 720 } };
  const secondary = { id: 2, bounds: { x: 1280, y: 0, width: 1920, height: 1080 } };
  const screen = new EventEmitter(); screen.displays = [primary, secondary];
  screen.getPrimaryDisplay = () => primary; screen.getAllDisplays = () => screen.displays;
  const windows = [];
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.destroyed = false; this.sent = [];
      this.webContents = new EventEmitter(); this.webContents.isLoading = () => this.loading;
      this.webContents.send = (...args) => this.sent.push(args); windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    setBounds(bounds) { this.bounds = bounds; }
    setFullScreen(value) { this.fullscreen = value; }
    show() { this.shown = true; }
    focus() { this.focused = true; }
    close() { this.destroy(); }
    destroy() { this.destroyed = true; this.emit("closed"); }
    reload() { this.reloaded = true; }
    async loadFile() {
      this.loading = true; await new Promise(resolve => setImmediate(resolve));
      if (Window.fail) throw new Error("broken page");
      this.loading = false; this.webContents.emit("did-finish-load");
    }
  }
  const controller = new DisplayController({ BrowserWindow: Window, screen, getState: () => ({ revision: 7 }) });
  return { controller, screen, Window, windows };
}
test("open waits for readiness, pushes current state and reuses/repositions the window", async () => {
  const { controller, windows } = fixture();
  const opening = controller.open();
  assert.equal(windows[0].shown, undefined);
  await opening;
  assert.equal(controller.status().targetId, 2); assert.equal(windows[0].fullscreen, true);
  assert.equal(windows[0].options.webPreferences.backgroundThrottling, false);
  assert.ok(windows[0].sent.some(([channel, state]) => channel === "state:changed" && state.revision === 7));
  await controller.open({ mode: "mirror" });
  assert.equal(windows.length, 1); assert.equal(controller.status().targetId, 1); assert.equal(windows[0].fullscreen, false);
  await controller.open({ mode: "extend", displayId: 2 });
  assert.equal(windows.length, 1); assert.equal(windows[0].fullscreen, true);
  controller.close(); assert.equal(controller.status().open, false);
  await controller.open(); assert.equal(windows.length, 2);
});
test("load failure is rejected instead of falsely reporting success", async () => {
  const { controller, Window } = fixture(); Window.fail = true;
  await assert.rejects(controller.open(), /بارگذاری نشد/);
  assert.equal(controller.status().open, false); assert.match(controller.status().error, /broken page/);
  Window.fail = false; await controller.open(); assert.equal(controller.status().error, null);
});
test("single monitor fallback moves to an added secondary and survives unplugging", async () => {
  const { controller, screen } = fixture();
  const secondary = screen.displays.pop();
  await controller.open(); assert.equal(controller.status().targetId, 1);
  screen.displays.push(secondary); screen.emit("display-added"); assert.equal(controller.status().targetId, 2);
  screen.displays.pop(); screen.emit("display-removed"); assert.equal(controller.status().targetId, 1);
  await assert.rejects(controller.open({ displayId: 999 }), /متصل نیست/);
  controller.window.webContents.emit("render-process-gone", {}, { reason: "crashed" });
  assert.equal(controller.window.reloaded, true);
});
test("simultaneous open requests create only one window", async () => {
  const { controller, windows } = fixture();
  await Promise.all([controller.open(), controller.open()]); assert.equal(windows.length, 1);
});
test("only admin mutates state and every successful mutation broadcasts to both windows", async () => {
  const { controller } = fixture(); await controller.open();
  const handlers = new Map(), adminSent = [];
  const admin = { webContents: { isLoading: () => false, send: (...args) => adminSent.push(args) }, isDestroyed: () => false };
  let revision = 0;
  const store = { view: () => ({ revision }), saveResult: () => ({ revision: ++revision }) };
  registerStateIPC({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }, getStore: () => store, getAdmin: () => admin, display: controller });
  const state = handlers.get("result:save")({ sender: admin.webContents }, {});
  assert.equal(state.revision, 1); assert.equal(adminSent.at(-1)[1].revision, 1);
  assert.equal(controller.window.sent.at(-1)[1].revision, 1);
  assert.throws(() => handlers.get("result:save")({ sender: controller.window.webContents }, {}), /مدیریت/);
  assert.deepEqual(handlers.get("state:get")({ sender: controller.window.webContents }), { revision: 1 });
  assert.throws(() => handlers.get("state:get")({ sender: {} }), /نامعتبر/);
});
