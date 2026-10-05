"use strict";
// Uses production IPC and renderers with isolated data, never a live competition.
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CompetitionStore } = require("../store.cjs");
const { registerReports } = require("../report.cjs");
const { DisplayController, registerStateIPC } = require("../display-controller.cjs");
const root = path.join(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "imidro-smoke-"));
const out = path.join(root, "release", "qa");
app.setPath("userData", path.join(temporary, "electron-profile"));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const watchdog = setTimeout(() => { console.error('Native smoke exceeded its 90s bound.'); app.exit(1); }, 90000);
async function waitFor(window, expression, timeout = 5000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return; }
    catch (error) { throw new Error(`Renderer probe failed: ${expression}: ${error?.message || JSON.stringify(error)}`); }
    await delay(50);
  }
  throw new Error(`Timed out waiting for renderer: ${expression}`);
}
app.whenReady().then(async () => {
  let admin, controller;
  const errors = [], checks = [], timings = [];
  const check = name => { checks.push(name); console.log(`PASS ${name}`); };
  function captureErrors(window) {
    window.webContents.on("console-message", event => { if (/Uncaught|Refused to load/.test(event.message)) errors.push(event.message); });
  }
  try {
    fs.mkdirSync(out, { recursive: true });
    const store = new CompetitionStore(path.join(temporary, "competition"));
    for (let i = 0; i < 14; i++) store.addTeam({ name: `تیم آزمایشی ${i + 1}`, organization: "مجتمع مس سرچشمه رفسنجان" });
    admin = new BrowserWindow({ show: false, width: 1480, height: 920, useContentSize: true,
      webPreferences: { preload: path.join(root, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    captureErrors(admin);
    controller = new DisplayController({ BrowserWindow, screen, getState: () => store.view(),
      onStatus: status => { if (!admin.isDestroyed()) admin.webContents.send("display:changed", status); } });
    registerStateIPC({ ipcMain, getStore: () => store, getAdmin: () => admin, display: controller });
    const ui = async expression => {
      try { await admin.webContents.executeJavaScript(`(async () => { ${expression} })()`); }
      catch (error) { throw new Error(`Admin action failed: ${expression}: ${error?.message || JSON.stringify(error)}`); }
    };
    await admin.loadFile(path.join(root, "src/index.html"));
    await waitFor(admin, "Boolean(document.querySelector('#leaderboard-scope'))");
    await ui("document.querySelector('[data-view=draw]').click()");
    await waitFor(admin, "Boolean(document.querySelector('#save-manual-draw'))");
    await ui("document.querySelectorAll('[data-order-team]').forEach(input => { input.value = 15 - Number(input.dataset.orderTeam); input.dispatchEvent(new Event('input',{bubbles:true})); }); document.querySelector('#save-manual-draw').click()");
    await waitFor(admin, "document.querySelectorAll('.draw-ticket').length === 14");
    assert.equal(store.view().draws[0].method, "manual");
    assert.equal(store.view().draws[0].entries[0].teamId, 14);
    assert.equal(new CompetitionStore(path.join(temporary, "competition")).view().draws[0].entries[0].drawOrder, 1);
    check("manual draw via admin inputs, distinct persisted turns, restart");

    console.log('Opening production display through admin IPC...');
    await ui("await window.scoreboardAPI.openDisplay({mode:'mirror'})");
    console.log('Display open IPC resolved.');
    let display = controller.window; captureErrors(display);
    console.log('Sizing display...');
    display.setSize(1280, 720); // content bounds are read below, not assumed.
    console.log('Waiting for live rows...');
    await waitFor(display, "document.querySelectorAll('tbody tr').length > 0");
    console.log('Waiting for display fonts...');
    await display.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
    console.log('Fonts ready.');
    await delay(400);
    const bounds = await display.webContents.executeJavaScript("({font:document.fonts.check('18px ScoreboardZar'),logo:document.querySelector('.competition-logo').naturalWidth,footer:document.querySelector('footer').getBoundingClientRect().bottom,height:innerHeight,rows:document.querySelectorAll('tbody tr').length})");
    assert.equal(bounds.font, true); assert.ok(bounds.logo > 0); assert.ok(bounds.footer <= bounds.height + 2, JSON.stringify(bounds)); assert.ok(bounds.rows > 0);
    fs.writeFileSync(path.join(out, "display.png"), (await display.webContents.capturePage()).toPNG());
    check("production open waits for loaded live table, local font/logo and viewport");

    await ui("document.querySelector('[data-view=dashboard]').click(); const select=document.querySelector('#leaderboard-scope');select.value='water';select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#publish-leaderboard').click()");
    await waitFor(display, "document.querySelector('#table-title').textContent === 'آبرسانی' && document.querySelector('th:nth-child(3)').textContent === 'نوبت اجرا'");

    async function enterWater(teamId, seconds) {
      await ui(`document.querySelector('[data-view=entry]').click(); const discipline=document.querySelector('#discipline'); discipline.value='water'; discipline.dispatchEvent(new Event('change',{bubbles:true})); const team=document.querySelector('#team'); team.value='${teamId}'; team.dispatchEvent(new Event('change',{bubbles:true})); for(const [id,value] of [['primary-m','0'],['primary-s','${seconds}'],['primary-h','0']]){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));} document.querySelector('#save-result').click()`);
      await waitFor(admin, `document.querySelector('#primary-s').value === '${seconds}' && document.querySelector('#toast').textContent.includes('فوراً')`);
    }
    await enterWater(1, 30);
    await waitFor(display, "document.querySelector('tbody tr').dataset.teamId === '1' && document.querySelector('tbody tr .draft').textContent === 'موقت'");
    await enterWater(2, 40);
    const start = Date.now();
    await enterWater(2, 20);
    await waitFor(display, "document.querySelector('tbody tr').dataset.teamId === '2' && document.querySelector('tbody tr .total').textContent === '00:20.000'");
    timings.push({ name: "water draft edit to rendered rank", ms: Date.now() - start, teams: 14 });
    const itemSnapshot = await display.webContents.executeJavaScript("({first:document.querySelector('tbody tr').dataset.teamId,turn:document.querySelector('tbody tr .turn').textContent,changed:document.querySelectorAll('tr.updated').length,notice:document.querySelector('#announcement').textContent})");
    assert.equal(itemSnapshot.first, "2"); assert.equal(itemSnapshot.turn, (13).toLocaleString("fa-IR")); assert.ok(itemSnapshot.changed >= 2);
    assert.equal(store.view().standings.find(row => row.team.id === 2).completed, 0);
    fs.writeFileSync(path.join(out, "water-live.png"), (await display.webContents.capturePage()).toPNG());
    check("draft save/edit immediately sorts item table and highlights displaced teams; turn stays fixed");

    console.log('Approving result through UI...');
    await ui("document.querySelector('[data-view=approvals]').click(); document.querySelector('[data-action=approve][data-id=\"2\"]').click()");
    await waitFor(display, "document.querySelector('tbody tr .approved')?.textContent === 'تأییدشده'");
    await waitFor(admin, "Boolean(document.querySelector('[data-action=reopen][data-id=\"2\"]'))");
    console.log('Reopening result through UI...');
    await ui("document.querySelector('[data-action=reopen][data-id=\"2\"]').click()");
    await waitFor(display, "document.querySelector('tbody tr .draft')?.textContent === 'موقت'");
    check("approval/reopen changes status while provisional rank remains available");
    const before = controller.window;
    await ui("await window.scoreboardAPI.openDisplay({mode:'mirror'})"); assert.equal(controller.window, before);
    await display.webContents.reload();
    await waitFor(display, "document.querySelector('tbody tr')?.dataset.teamId === '2'");
    await ui("await window.scoreboardAPI.closeDisplay()"); assert.equal(controller.window, null);
    await ui("await window.scoreboardAPI.openDisplay({mode:'mirror'})");
    display = controller.window; captureErrors(display); display.setSize(1280, 720);
    await waitFor(display, "document.querySelector('tbody tr')?.dataset.teamId === '2'");
    check("repeated open reuses window; reload and close/reopen recover latest item state");

    await ui("document.querySelector('[data-view=settings]').click(); document.querySelector('#auto-rotate').checked=false;document.querySelector('#save-settings').click()");
    await waitFor(display, "document.querySelector('#pause-pages').disabled === true");
    const pageBefore = await display.webContents.executeJavaScript("document.querySelector('#page-info').textContent");
    await display.webContents.executeJavaScript("document.querySelector('#next-page').click()");
    assert.notEqual(await display.webContents.executeJavaScript("document.querySelector('#page-info').textContent"), pageBefore);
    await ui("document.querySelector('#auto-rotate').checked=true;document.querySelector('#save-settings').click()");
    await waitFor(display, "document.querySelector('#pause-pages').disabled === false");
    await display.webContents.executeJavaScript("document.querySelector('#pause-pages').click()");
    assert.equal(await display.webContents.executeJavaScript("document.querySelector('#pause-pages').textContent"), "ادامه گردش");
    await display.webContents.executeJavaScript("document.querySelector('#pause-pages').click(); document.querySelector('#table-title').focus(); document.activeElement.blur()");
    const rotatingPage = await display.webContents.executeJavaScript("document.querySelector('#page-info').textContent");
    await waitFor(display, `document.querySelector('#page-info').textContent !== ${JSON.stringify(rotatingPage)}`, 22000);
    check("manual paging, remote auto-scroll toggle, local pause/resume and timed rotation");

    await ui(`await window.scoreboardAPI.setDisplay({mode:'draw',drawId:${JSON.stringify(store.view().draws[0].id)}})`);
    await waitFor(display, "document.querySelectorAll('.draw-ticket').length > 0");
    fs.writeFileSync(path.join(out, "draw.png"), (await display.webContents.capturePage()).toPNG());
    check("draw screen labels turn numbers rather than score ranks");
    for (const discipline of store.view().disciplines) {
      if (discipline.id !== "water") {
        for (const teamId of [1, 2]) await ui(`await window.scoreboardAPI.saveResult({teamId:${teamId},disciplineId:${JSON.stringify(discipline.id)},rawPrimaryMs:${teamId === 1 ? 50000 : 40000},rawSecondaryMs:60000,penaltyMs:1000,scientificScore:${teamId === 1 ? 80 : 95}})`);
      }
      await ui(`await window.scoreboardAPI.setDisplay({mode:'item',disciplineId:${JSON.stringify(discipline.id)}})`);
      await waitFor(display, `document.querySelector('#table-title').textContent === ${JSON.stringify(discipline.name)} && document.querySelector('tbody tr').dataset.teamId === '2'`);
      assert.equal(await display.webContents.executeJavaScript("document.querySelector('tbody tr .turn').textContent"), (13).toLocaleString("fa-IR"));
    }
    check("all five item pages sort by their own metric and retain manual turns");
    await ui("await window.scoreboardAPI.setDisplay({mode:'standings'})");
    await waitFor(display, "document.querySelector('tbody tr')?.dataset.teamId === '2' && document.querySelector('tbody tr .rank').textContent === '۱'");
    check("overall live ranks recompute after all five provisional items are entered");
    await assert.rejects(display.webContents.executeJavaScript("window.scoreboardAPI.saveResult({teamId:1,disciplineId:'water',rawPrimaryMs:1000})"), /مدیریت/);
    // The deliberate rejection is caught by the caller, not an uncaught renderer error.
    check("public display cannot mutate scores through IPC");
    let exportHandler, outputPath;
    registerReports({ ipcMain: { handle: (_channel, handler) => exportHandler = handler },
      dialog: { showSaveDialog: async () => ({ filePath: outputPath, canceled: false }) }, BrowserWindow, getStore: () => store, getWindow: () => admin });
    for (const type of ["standings", "draw"]) {
      outputPath = path.join(out, `${type}.pdf`);
      await exportHandler({}, { type, drawId: store.view().draws[0].id });
      assert.equal(fs.readFileSync(outputPath).subarray(0, 4).toString(), "%PDF");
    }
    check("official standings and manual draw export actual PDF files");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, "smoke-result.json"), JSON.stringify({ passed: true, bounds, checks, timings }, null, 2));
    fs.writeFileSync(path.join(out, "live-data-example.json"), JSON.stringify({ schema_version: 3, revision: store.view().revision, team_scores: store.view().team_scores }, null, 2));
    console.log("Native Electron smoke passed: production IPC, admin forms, manual turns, live sorting, lifecycle, paging and PDF exports.");
    clearTimeout(watchdog); controller.close(); admin.destroy(); fs.rmSync(path.join(temporary, "competition"), { recursive: true, force: true }); app.exit(0);
  } catch (error) {
    console.error(error); console.error('Error detail:', error?.stack || error?.message || String(error)); console.error('Renderer errors:', errors); controller?.close(); if (admin && !admin.isDestroyed()) admin.destroy();
    fs.rmSync(path.join(temporary, "competition"), { recursive: true, force: true }); app.exit(1);
  }
});
