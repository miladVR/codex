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
const watchdog = setTimeout(() => { console.error('Native smoke exceeded its 180s bound.'); app.exit(1); }, 180000);
async function waitFor(window, expression, timeout = 5000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return; }
    catch (error) { throw new Error(`Renderer probe failed: ${expression}: ${error?.message || JSON.stringify(error)}`); }
    await delay(50);
  }
  throw new Error(`Timed out waiting for renderer: ${expression}`);
}
async function forceAnimationsEnabled(window) {
  // CI runners report prefers-reduced-motion: reduce; the public display honors
  // it by design, so rotation checks emulate "no preference" to test the real path.
  const dbg = window.webContents.debugger;
  if (!dbg.isAttached()) await dbg.attach();
  await dbg.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
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
    const beforeHelp=store.view();
    for(const view of ["dashboard","teams","draw","entry","approvals","settings","audit","guide"]){
      await ui(`document.querySelector('[data-view=${view}]').click()`);
      const uncovered=await admin.webContents.executeJavaScript("Array.from(document.querySelectorAll('#content button:not(.help-icon),#content input,#content select,#content textarea')).filter(n=>!n.dataset.helpAttached).map(n=>n.id||n.dataset.action||n.dataset.deleteKind)");
      assert.deepEqual(uncovered,[],`Missing contextual help in ${view}`);
      await ui("document.getElementById('view-help').click()");
      await waitFor(admin,"Boolean(document.getElementById('context-help-dialog')?.open)");
      await ui("document.getElementById('context-help-close').click()");
    }
    await ui("document.querySelector('[data-view=entry]').click()");
    for(const discipline of beforeHelp.disciplines){
      await ui(`const d=document.getElementById('discipline');d.value=${JSON.stringify(discipline.id)};d.dispatchEvent(new Event('change',{bubbles:true}))`);
      const uncovered=await admin.webContents.executeJavaScript("Array.from(document.querySelectorAll('#content input,#content select,#content textarea,#content button:not(.help-icon)')).filter(n=>!n.dataset.helpAttached).map(n=>n.id)");
      assert.deepEqual(uncovered,[],`Missing help in ${discipline.id} entry`);
    }
    await ui("const d=document.getElementById('discipline');d.value='water';d.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('primary-s').value='12';document.querySelector('[data-help-for=penalty]').click()");
    assert.equal(await admin.webContents.executeJavaScript("document.getElementById('primary-s').value"),'12');
    assert.ok((await admin.webContents.executeJavaScript("document.getElementById('context-help-dialog').textContent")).includes('ثانیه'));
    await ui("document.getElementById('context-help-close').click()");
    assert.equal(await admin.webContents.executeJavaScript("document.activeElement.dataset.helpFor"),'penalty');
    assert.deepEqual(store.view(),beforeHelp);
    check("contextual help covers all eight admin views and five discipline forms, preserves draft fields and never changes stored data");
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
    await forceAnimationsEnabled(display);
    assert.equal(await display.webContents.executeJavaScript("window.matchMedia('(prefers-reduced-motion: reduce)').matches"), false);
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
    await waitFor(display, "document.querySelector('#table-title').textContent === 'آبرسانی' && document.querySelector('th:nth-child(3) .help-column-label')?.textContent === 'نوبت اجرا' && Boolean(document.querySelector('th:nth-child(3) .help-icon'))");

    async function enterWater(teamId, seconds, hundredths=0) {
      await ui(`document.querySelector('[data-view=entry]').click(); const discipline=document.querySelector('#discipline'); discipline.value='water'; discipline.dispatchEvent(new Event('change',{bubbles:true})); const team=document.querySelector('#team'); team.value='${teamId}'; team.dispatchEvent(new Event('change',{bubbles:true})); for(const [id,value] of [['primary-m','${Math.floor(seconds/60)}'],['primary-s','${seconds%60}'],['primary-h','${hundredths}']]){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));} document.querySelector('#save-result').click()`);
      await waitFor(admin, `document.querySelector('#primary-s').value === '${seconds%60}' && document.querySelector('#toast').textContent.includes('فوراً')`);
    }
    await enterWater(1,64,50);
    await waitFor(display,"document.querySelector('tbody tr .total').textContent === '01:04.50'");
    assert.equal(await admin.webContents.executeJavaScript("document.getElementById('preview').textContent"),"01:04.50");
    check("real time input of 1 minute, 4 seconds and 50 hundredths displays 01:04.50 in both admin and hall");
    await enterWater(1,30);
    await waitFor(display, "document.querySelector('tbody tr').dataset.teamId === '1' && document.querySelector('tbody tr .draft').textContent === 'موقت'");
    await enterWater(2, 40);
    const start = Date.now();
    await enterWater(2, 20);
    await waitFor(display, "document.querySelector('tbody tr').dataset.teamId === '2' && document.querySelector('tbody tr .total').textContent === '00:20.00'");
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
    await forceAnimationsEnabled(display);
    await waitFor(display, "document.querySelector('tbody tr')?.dataset.teamId === '2'");
    await ui("await window.scoreboardAPI.closeDisplay()"); assert.equal(controller.window, null);
    await ui("await window.scoreboardAPI.openDisplay({mode:'mirror'})");
    display = controller.window; captureErrors(display); display.setSize(1280, 720);
    await forceAnimationsEnabled(display);
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
    async function assertTableFit(expectedRows,expectedTables,expectedPages){
      await waitFor(display,`document.querySelectorAll('tbody tr').length===${expectedRows} && document.querySelectorAll('#standings table').length===${expectedTables}`);
      await display.webContents.executeJavaScript("document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))).then(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))))");
      const fit=await display.webContents.executeJavaScript(`(()=>{const area=document.getElementById('standings').getBoundingClientRect();const rows=Array.from(document.querySelectorAll('tbody tr'));return {pages:document.getElementById('page-info').textContent,bottom:Math.max(...rows.map(r=>r.getBoundingClientRect().bottom)),areaBottom:area.bottom,footer:document.querySelector('footer').getBoundingClientRect().bottom,height:innerHeight,width:document.documentElement.scrollWidth,viewport:innerWidth,ids:rows.map(r=>r.dataset.athleteId||r.dataset.teamId),badges:Array.from(document.querySelectorAll('tbody .slot-badge')).every(b=>b.getBoundingClientRect().width<=b.closest('td').getBoundingClientRect().width+1)}})()`);
      assert.ok(fit.pages.includes(`از ${expectedPages.toLocaleString('fa-IR')}`),JSON.stringify(fit));
      assert.ok(fit.bottom<=fit.areaBottom+2,JSON.stringify(fit));assert.ok(fit.footer<=fit.height+2,JSON.stringify(fit));assert.ok(fit.width<=fit.viewport+2,JSON.stringify(fit));assert.ok(fit.badges,JSON.stringify(fit));assert.equal(new Set(fit.ids).size,expectedRows);
      return fit;
    }
    // Regression for the reported ten-team case: all ten fit on a single page.
    const smallStore=new CompetitionStore(path.join(temporary,'ten-team-layout'));
    for(let id=1;id<=10;id++)smallStore.addTeam({name:`تیم نمایشی ${id}`});
    await display.webContents.executeJavaScript(`receive(${JSON.stringify({...smallStore.view(),revision:store.view().revision+10000})})`);
    await assertTableFit(10,1,1);
    // Restore real state; the following reload also checks persisted layout.
    display.reload();await waitFor(display,"document.querySelectorAll('.draw-ticket').length>0");
    check('ten-team leaderboard shows all ten on one page with no clipped rows');
    // Full two-round operational acceptance: 22 teams, 44 athlete slots.
    for (let i=15;i<=22;i++) await ui(`await window.scoreboardAPI.addTeam({name:'تیم آزمایشی ${i}',athletePrimary:'ورزشکار اول ${i}',athleteSecondary:'ورزشکار دوم ${i}'})`);
    await ui("await window.scoreboardAPI.updateSettings({autoRotate:false});await window.scoreboardAPI.setDisplay({mode:'item',disciplineId:'water'})");
    for(const [width,height] of [[1280,720],[1920,1080]]){
      display.setSize(width,height);await delay(100);
      await assertTableFit(11,1,2);
      const first=await display.webContents.executeJavaScript("Array.from(document.querySelectorAll('tbody tr'),r=>r.dataset.teamId)");
      await display.webContents.executeJavaScript("document.getElementById('next-page').click()");
      const second=await assertTableFit(11,1,2);assert.equal(new Set([...first,...second.ids]).size,22);
      await display.webContents.executeJavaScript("document.getElementById('previous-page').click()");
      fs.writeFileSync(path.join(out,`teams-22-paged-${width}.png`),(await display.webContents.capturePage()).toPNG());
      await ui("await window.scoreboardAPI.setDisplay({mode:'individual'})");
      await assertTableFit(22,1,2);
      const athleteFirst=await display.webContents.executeJavaScript("Array.from(document.querySelectorAll('tbody tr'),r=>r.dataset.athleteId)");
      await display.webContents.executeJavaScript("document.getElementById('next-page').click()");
      const athleteSecond=await assertTableFit(22,1,2);assert.equal(new Set([...athleteFirst,...athleteSecond.ids]).size,44);
      await display.webContents.executeJavaScript("document.getElementById('previous-page').click()");
      assert.equal(await display.webContents.executeJavaScript("document.querySelector('tbody tr').querySelectorAll('[data-slot]').length"),4);
      fs.writeFileSync(path.join(out,`athletes-44-paged-${width}.png`),(await display.webContents.capturePage()).toPNG());
      await ui("document.querySelector('[data-view=settings]').click();document.getElementById('display-layout').value='all';document.getElementById('save-settings').click()");
      await waitFor(display,"document.body.classList.contains('single-page')");await assertTableFit(44,2,1);
      assert.equal(new CompetitionStore(path.join(temporary,'competition')).view().settings.displayLayout,'all');
      fs.writeFileSync(path.join(out,`athletes-44-one-page-${width}.png`),(await display.webContents.capturePage()).toPNG());
      await ui("await window.scoreboardAPI.setDisplay({mode:'item',disciplineId:'combined'})");await assertTableFit(22,2,1);
      await ui("await window.scoreboardAPI.setDisplay({mode:'standings'})");await assertTableFit(22,2,1);
      await ui("await window.scoreboardAPI.updateSettings({displayLayout:'paged'});await window.scoreboardAPI.setDisplay({mode:'item',disciplineId:'water'})");
    }
    check('22 teams and 44 athletes fit exactly two pages at 720p and 1080p; all 44 fit one page without missing or duplicate athletes; colored assignments are distinct');
    const fullStore=new CompetitionStore(path.join(temporary,'populated-layout'));
    for(let id=1;id<=22;id++){
      fullStore.addTeam({name:`تیم شرکت‌کننده کامل ${id}`,athletePrimary:`ورزشکار اول آزمایشی ${id}`,athleteSecondary:`ورزشکار دوم آزمایشی ${id}`});
      fullStore.saveRoundScore({teamId:id,round:1,rawMs:64050+id*10,penaltyMs:5050});fullStore.saveRoundScore({teamId:id,round:2,rawMs:64500+id*10,penaltyMs:2050});
      for(const d of fullStore.view().disciplines.filter(d=>d.id!=='combined'))fullStore.saveResult({teamId:id,disciplineId:d.id,rawPrimaryMs:64500+id*10,scientificScore:100-id/10,scientificDurationMs:64500,penaltyMs:5050});
    }
    let fullRevision=store.view().revision+20000;
    for(const [width,height] of [[1280,720],[1920,1080]]){
      display.setSize(width,height);await delay(100);
      for(const [mode,layout] of [['individual','paged'],['individual','all'],['item','all'],['standings','all']]){
        const fixture={...fullStore.view(),revision:++fullRevision};fixture.settings={...fixture.settings,displayMode:mode,displayItemId:mode==='item'?'combined':null,displayLayout:layout,autoRotate:false};
        await display.webContents.executeJavaScript(`receive(${JSON.stringify(fixture)})`);
        await assertTableFit(mode==='individual'?(layout==='all'?44:22):22,layout==='all'?2:1,layout==='all'?1:2);
        const clippedTimes=await display.webContents.executeJavaScript("Array.from(document.querySelectorAll('td.record')).filter(c=>c.scrollWidth>c.clientWidth+2).length");assert.equal(clippedTimes,0,'Full time digits must be visible');
        fs.writeFileSync(path.join(out,`populated-${mode}-${layout}-${width}.png`),(await display.webContents.capturePage()).toPNG());
      }
    }
    display.reload();await waitFor(display,"document.querySelector('#table-title').textContent==='آبرسانی'");
    check('fully populated 22-team/44-athlete displays fit at 720p/1080p including paired times, penalties, long names and podium; time digits stay visible');
    display.setSize(1280,720);
    await ui("await window.scoreboardAPI.setDisplay({mode:'individual'});document.querySelector('[data-view=entry]').click();const d=document.getElementById('discipline');d.value='combined';d.dispatchEvent(new Event('change',{bubbles:true}));const t=document.getElementById('team');t.value='1';t.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('athlete-primary').value='ورزشکار اول ۱';for(const [id,v] of [['primary-m','0'],['primary-s','30'],['primary-h','0']])document.getElementById(id).value=v;document.getElementById('save-result').click()");
    await waitFor(admin,"document.querySelector('#toast').textContent.includes('رتبه انفرادی')");
    assert.equal(store.view().combinedTeams.find(t=>t.teamId===1).status,'Partial');
    assert.equal(store.view().results.find(r=>r.teamId===1 && r.disciplineId==='combined').rawSecondaryMs,null);
    await waitFor(display,"document.querySelector('#table-title').textContent.includes('انفرادی') && document.querySelector('tbody tr').dataset.teamId==='1'");
    await waitFor(admin,"document.querySelector('#save-result').disabled===false");
    admin.show(); await delay(250);
    fs.writeFileSync(path.join(out,'staged-round-1.png'),(await admin.webContents.capturePage()).toPNG());
    for(let id=2;id<=22;id++) await ui(`await window.scoreboardAPI.saveRoundScore({teamId:${id},round:1,rawMs:${70000-id*1000},penaltyMs:0})`);
    assert.equal(store.view().roundScores.length,22);
    assert.ok(store.view().itemLeaderboards.combined.every(row=>row.rank===null));
    check('22 first-round scores save independently, 44 individual slots, no premature team ranks');
    await ui("const t=document.getElementById('team');t.value='1';t.dispatchEvent(new Event('change',{bubbles:true}));const r=document.getElementById('combined-round');r.value='2';r.dispatchEvent(new Event('change',{bubbles:true}));");
    const slot=store.view().combinedTeams.find(t=>t.teamId===1).rounds[1];
    assert.equal(slot.athleteNumber,36);assert.equal(slot.lane,1); // reverse manual order puts team 1 at slot 14.
    assert.equal(await admin.webContents.executeJavaScript("document.querySelector('#lane-assignment [data-slot=lane] b').textContent"),"۱");
    assert.equal(await admin.webContents.executeJavaScript("document.querySelectorAll('#lane-assignment [data-slot]').length"),4);
    await ui("for(const [id,v] of [['primary-m','0'],['primary-s','50'],['primary-h','0']])document.getElementById(id).value=v;document.getElementById('penalty').value='10';document.getElementById('save-result').click()");
    await waitFor(admin,"document.querySelector('#toast').textContent.includes('رتبه تیمی: 1')");
    assert.equal(store.view().itemLeaderboards.combined.find(r=>r.team.id===1).finalValue,45000);
    await ui("await window.scoreboardAPI.setDisplay({mode:'item',disciplineId:'combined'});await window.scoreboardAPI.saveRoundScore({teamId:2,round:2,rawMs:10000})");
    await waitFor(display,"document.querySelector('tbody tr').dataset.teamId==='2' && document.querySelector('tbody tr.updated')");
    check('round 2 auto-swaps lane, uses athlete number after 22 and immediately reorders team average');
    fs.writeFileSync(path.join(out,'combined-team-live.png'),(await display.webContents.capturePage()).toPNG());
    await ui("const t=document.getElementById('team');t.value='2';t.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('delete-round').click();document.getElementById('delete-next').click()");
    await waitFor(admin,"Boolean(document.getElementById('delete-confirmation'))");
    assert.equal(await admin.webContents.executeJavaScript("document.getElementById('delete-final').disabled"),true);
    await ui("document.querySelector('[data-help-for=delete-final]').click()");
    assert.equal(await admin.webContents.executeJavaScript("Boolean(document.getElementById('context-help-full'))"),false);
    await ui("document.getElementById('context-help-close').click()");
    await ui("document.getElementById('delete-confirmation').value='تایید';document.getElementById('delete-confirmation').dispatchEvent(new Event('input',{bubbles:true}))");
    await waitFor(admin,"document.getElementById('delete-final').disabled===false",4000);
    fs.writeFileSync(path.join(out,'delete-confirmation.png'),(await admin.webContents.capturePage()).toPNG());
    await ui("document.getElementById('delete-final').click()");
    await waitFor(admin,"!document.getElementById('delete-dialog')");
    assert.equal(store.view().combinedTeams.find(t=>t.teamId===2).status,'Partial');
    check('two real modal steps enforce typed confirmation and delay; deleting a round restores partial state');
    const testLogo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ2kAAAAASUVORK5CYII=';
    await ui(`document.querySelector('[data-view=settings]').click();document.getElementById('event-date').value='۱۴۰۵/۰۷/۱۵';const bytes=Uint8Array.from(atob(${JSON.stringify(testLogo.split(',')[1])}),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'logo.png',{type:'image/png'}));document.getElementById('competition-logo-file').files=dt.files;document.getElementById('sponsor-0').files=dt.files;document.getElementById('save-settings').click()`);
    await waitFor(admin,"document.getElementById('toast').textContent.includes('لوگوها ذخیره')");
    assert.equal(store.view().settings.competitionLogo,testLogo);
    await waitFor(display,"document.querySelector('.competition-logo').src.startsWith('data:image/png') && document.querySelector('#sponsor-logos img')?.naturalWidth===1");
    assert.ok((await display.webContents.executeJavaScript("document.getElementById('venue').textContent")).includes('۱۴۰۵/۰۷/۱۵'));
    check('actual raster upload saves event date and updates event/sponsor logos on public display');
    await ui("await window.scoreboardAPI.updateSettings({competitionLogo:'',sponsorLogos:[]})");
    for (const discipline of store.view().disciplines) {
      if (discipline.id !== "water") {
        for (const teamId of [1, 2]) {
          if (discipline.id==='combined') {
            await ui(`await window.scoreboardAPI.saveRoundScore({teamId:${teamId},round:1,rawMs:${teamId===1?50000:40000},penaltyMs:0});await window.scoreboardAPI.saveRoundScore({teamId:${teamId},round:2,rawMs:60000,penaltyMs:${teamId===1?10000:0}})`);
          } else await ui(`await window.scoreboardAPI.saveResult({teamId:${teamId},disciplineId:${JSON.stringify(discipline.id)},rawPrimaryMs:${teamId === 1 ? 50000 : 40000},rawSecondaryMs:60000,penaltyMs:1000,scientificScore:${teamId === 1 ? 80 : 95}})`);
        }
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
    await ui("document.querySelector('[data-view=draw]').click()");
    assert.equal(await admin.webContents.executeJavaScript("document.getElementById('run-draw').disabled"),true);
    const beforeLockedHelp=store.view();
    await ui("document.querySelector('[data-help-for=run-draw]').click()");
    assert.ok((await admin.webContents.executeJavaScript("document.getElementById('context-help-dialog').textContent")).includes('قفل'));
    admin.show();admin.focus();await delay(200);
    fs.writeFileSync(path.join(out,"contextual-disabled-draw-help.png"),(await admin.webContents.capturePage()).toPNG());
    admin.webContents.sendInputEvent({type:"keyDown",keyCode:"Escape"});
    admin.webContents.sendInputEvent({type:"keyUp",keyCode:"Escape"});
    await waitFor(admin,"!document.getElementById('context-help-dialog')");
    assert.deepEqual(store.view(),beforeLockedHelp);
    check("question icon remains clickable beside a disabled lottery button, explains its lock and closes with Escape");
    await ui("document.querySelector('[data-view=guide]').click()");
    assert.equal(await admin.webContents.executeJavaScript("document.querySelectorAll('.manual-section').length"),15);
    await ui("const q=document.getElementById('guide-search');q.value='لاین';q.dispatchEvent(new Event('input',{bubbles:true}));q.focus();window.guideSearchBefore=q");
    assert.ok(await admin.webContents.executeJavaScript("document.querySelectorAll('.manual-section').length>0 && document.querySelectorAll('.manual-section').length<15"));
    await ui("await window.scoreboardAPI.updateSettings({displayMessage:'پیام بررسی حفظ راهنما'})");
    await waitFor(admin,"document.getElementById('guide-search')===window.guideSearchBefore && document.getElementById('guide-search').value==='لاین'");
    assert.equal(await admin.webContents.executeJavaScript("document.activeElement.id"),'guide-search');
    await ui("document.querySelector('.manual-toc a').click()");
    assert.ok(await admin.webContents.executeJavaScript("document.activeElement.classList.contains('manual-section')"));
    admin.show();admin.focus();await delay(200);
    fs.writeFileSync(path.join(out,"offline-full-guide.png"),(await admin.webContents.capturePage()).toPNG());
    await ui("const q=document.getElementById('guide-search');q.value='عبارتناموجودآزمون';q.dispatchEvent(new Event('input',{bubbles:true}))");
    assert.equal(await admin.webContents.executeJavaScript("document.querySelectorAll('.manual-section').length"),0);
    await ui("document.getElementById('guide-clear').click()");
    assert.equal(await admin.webContents.executeJavaScript("document.querySelectorAll('.manual-section').length"),15);
    check("bundled full Persian guide supports text search, no-results, clear, section navigation and preserves reading during live state updates");
    const beforePublicHelp=store.view();
    await display.webContents.executeJavaScript("document.querySelector('[data-help-for=next-page]').click()");
    await waitFor(display,"document.getElementById('context-help-dialog')?.open");
    await display.webContents.executeJavaScript("document.getElementById('context-help-close').click()");
    assert.deepEqual(store.view(),beforePublicHelp);
    check("public display paging help opens and closes without changing competition data");
    admin.setContentSize(1100,720);
    await waitFor(admin,"innerHeight===720");
    const resetBounds=await admin.webContents.executeJavaScript("(()=>{const b=document.getElementById('reset-all').getBoundingClientRect();return {right:b.right,bottom:b.bottom,top:b.top,width:innerWidth,height:innerHeight};})()");
    assert.ok(resetBounds.right>resetBounds.width-280 && resetBounds.bottom<=resetBounds.height && resetBounds.top>resetBounds.height/2);
    admin.setContentSize(1480,920);
    await waitFor(admin,"innerHeight===920");
    await assert.rejects(display.webContents.executeJavaScript("window.scoreboardAPI.prepareDeletion({kind:'reset'})"),/مدیریت/);
    const beforeReset=store.view();
    await ui("document.getElementById('reset-all').click();document.getElementById('delete-cancel').click()");
    assert.deepEqual(store.view(),beforeReset);
    await ui("document.getElementById('reset-all').click();document.getElementById('delete-next').click()");
    await waitFor(admin,"Boolean(document.getElementById('delete-confirmation'))");
    await ui("document.getElementById('delete-cancel').click()");
    assert.deepEqual(store.view(),beforeReset);
    check("full reset cancellation at either confirmation keeps all data; public display cannot initiate reset");
    await ui("document.getElementById('reset-all').click();document.getElementById('delete-next').click()");
    await waitFor(admin,"Boolean(document.getElementById('delete-confirmation'))");
    assert.equal(await admin.webContents.executeJavaScript("document.getElementById('delete-final').disabled"),true);
    await ui("document.querySelector('[data-help-for=delete-final]').click()");
    assert.equal(await admin.webContents.executeJavaScript("Boolean(document.getElementById('context-help-full'))"),false);
    await ui("document.getElementById('context-help-close').click()");
    await ui("document.getElementById('delete-confirmation').value='تایید';document.getElementById('delete-confirmation').dispatchEvent(new Event('input',{bubbles:true}))");
    await waitFor(admin,"document.getElementById('delete-final').disabled===false",4000);
    fs.writeFileSync(path.join(out,"reset-confirmation.png"),(await admin.webContents.capturePage()).toPNG());
    await ui("document.getElementById('delete-final').click()");
    await waitFor(admin,"!document.getElementById('delete-dialog') && document.getElementById('toast').textContent.includes('شروع از صفر')");
    await waitFor(display,"document.querySelectorAll('tr[data-team-id]').length===0 && document.getElementById('announcement').textContent===''");
    const empty=store.view();
    for(const key of ["teams","athletes","roundScores","results","draws","audits","combinedStartOrder"])assert.deepEqual(empty[key],[]);
    assert.equal(empty.settings.competitionLogo,"");assert.deepEqual(empty.settings.sponsorLogos,[]);assert.equal(empty.settings.eventDate,"");
    assert.deepEqual(fs.readdirSync(store.backupPath),[]);
    assert.deepEqual(new CompetitionStore(path.join(temporary,"competition")).view(),empty);
    admin.reload();
    await waitFor(admin,"document.querySelector('.metric b')?.textContent==='0'");
    admin.show();admin.focus();await delay(250);
    await admin.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    fs.writeFileSync(path.join(out,"reset-empty-dashboard.png"),(await admin.webContents.capturePage()).toPNG());
    await ui("await window.scoreboardAPI.addTeam({name:'تیم واقعی تازه'})");
    await waitFor(display,"document.querySelector('tr[data-team-id]')?.dataset.teamId==='1'");
    assert.equal(store.view().teams[0].code,"T01");
    check("full reset clears scores/draws/settings/audit/backups live; reopening stays empty and new team numbering starts at T01");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, "smoke-result.json"), JSON.stringify({ passed: true, bounds, checks, timings }, null, 2));
    fs.writeFileSync(path.join(out, "live-data-example.json"), JSON.stringify({ schema_version: 4, revision: store.view().revision, team_scores: store.view().team_scores }, null, 2));
    console.log("Native Electron smoke passed: production IPC, admin forms, manual turns, live sorting, lifecycle, paging and PDF exports.");
    clearTimeout(watchdog); controller.close(); admin.destroy(); fs.rmSync(path.join(temporary, "competition"), { recursive: true, force: true }); app.exit(0);
  } catch (error) {
    console.error(error); console.error('Error detail:', error?.stack || error?.message || String(error)); console.error('Renderer errors:', errors); controller?.close(); if (admin && !admin.isDestroyed()) admin.destroy();
    fs.rmSync(path.join(temporary, "competition"), { recursive: true, force: true }); app.exit(1);
  }
});
