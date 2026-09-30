"use strict";
// Native Electron integration check; uses isolated fixtures, never competition data.
const { app, BrowserWindow, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CompetitionStore } = require("../store.cjs");
const { registerReports } = require("../report.cjs");
const root = path.join(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "imidro-smoke-"));
const out = path.join(root, "release", "qa");
app.setPath("userData", temporary);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.whenReady().then(async () => {
  const windows = [];
  try {
    fs.mkdirSync(out, {recursive:true});
    const store = new CompetitionStore(temporary);
    for(let i=0;i<14;i++) store.addTeam({name:`تیم آزمایشی ${i+1}`,organization:"مجتمع مس سرچشمه رفسنجان"});
    const state = store.createDraw({});
    ipcMain.handle("state:get", () => store.view());
    const display = new BrowserWindow({show:false,width:1280,height:720,useContentSize:true,webPreferences:{preload:path.join(root,"preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    windows.push(display);
    const errors=[]; display.webContents.on("console-message",(_e,_level,message)=>{ if(/Uncaught|Refused to load/.test(message))errors.push(message); });
    await display.loadFile(path.join(root,"src/display.html"));
    await display.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
    await new Promise(resolve=>setTimeout(resolve,500));
    const bounds=await display.webContents.executeJavaScript(`({font:document.fonts.check('18px ScoreboardZar'),logo:document.querySelector('.competition-logo').naturalWidth,footer:document.querySelector('footer').getBoundingClientRect().bottom,height:innerHeight,rows:document.querySelectorAll('tbody tr').length})`);
    assert.equal(bounds.font,true);assert.ok(bounds.logo>0);assert.ok(bounds.footer<=bounds.height+2,JSON.stringify(bounds));assert.ok(bounds.rows>0);
    fs.writeFileSync(path.join(out,"display.png"),(await display.webContents.capturePage()).toPNG());
    store.setDisplay({mode:"draw",drawId:state.draws[0].id});
    display.webContents.send("state:changed",store.view());
    await new Promise(resolve=>setTimeout(resolve,300));
    assert.ok(await display.webContents.executeJavaScript("document.querySelectorAll('.draw-ticket').length > 0"));
    fs.writeFileSync(path.join(out,"draw.png"),(await display.webContents.capturePage()).toPNG());
    let exportHandler, outputPath;
    registerReports({ipcMain:{handle:(_channel,handler)=>exportHandler=handler},dialog:{showSaveDialog:async()=>({filePath:outputPath,canceled:false})},BrowserWindow,getStore:()=>store,getWindow:()=>display});
    for(const type of ["standings","draw"]){
      outputPath=path.join(out,`${type}.pdf`);
      await exportHandler({}, {type,drawId:state.draws[0].id});
      assert.equal(fs.readFileSync(outputPath).subarray(0,4).toString(),"%PDF");
    }
    assert.deepEqual(errors,[]);
    console.log("Native Electron smoke passed: fonts, logo, viewport, draw and both PDF exports.");
    fs.writeFileSync(path.join(out,"smoke-result.json"),JSON.stringify({passed:true,bounds},null,2));
    windows.forEach(w=>w.destroy());app.exit(0);
  } catch(error){console.error(error);windows.forEach(w=>w.destroy());app.exit(1);}
});
