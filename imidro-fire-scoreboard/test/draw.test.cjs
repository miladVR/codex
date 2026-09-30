"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CompetitionStore, ORGANIZATION } = require("../store.cjs");
const { reportHtml } = require("../report.cjs");
function fixture(t, count = 8) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "imidro-v11-"));
  t.after(() => fs.rmSync(directory, { recursive:true, force:true }));
  const store = new CompetitionStore(directory);
  for(let i=0;i<count;i++) store.addTeam({name:`تیم ${i+1}`,organization:"مس سرچشمه"});
  return {store,directory};
}
test("draw is a complete permutation, survives restart, and redraw preserves history", t => {
  const {store,directory} = fixture(t);
  const first = store.createDraw({disciplineId:"water"}).draws[0];
  assert.deepEqual(first.entries.map(e=>e.teamId).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
  assert.throws(()=>store.createDraw({disciplineId:"water"}),/تأیید/);
  const second = store.createDraw({disciplineId:"water",replaceDrawId:first.id}).draws[0];
  assert.notEqual(first.id,second.id);
  assert.throws(()=>store.createDraw({disciplineId:"water",replaceDrawId:first.id}),/تأیید/);
  const restored = new CompetitionStore(directory).view();
  assert.deepEqual(restored.draws[1],first);
  assert.deepEqual(restored.draws[0],second);
  assert.equal(restored.results.length,0);
});
test("draw validates teams and scope and keeps an immutable participant snapshot", t => {
  const {store} = fixture(t,1);
  assert.throws(()=>store.createDraw({}),/دو تیم/);
  store.addTeam({name:"تیم دوم"});
  assert.throws(()=>store.createDraw({disciplineId:"invalid"}),/معتبر/);
  const first = store.createDraw({}).draws[0];
  store.addTeam({name:"تیم سوم"});
  assert.equal(store.view().draws[0].entries.length,2);
  assert.equal(store.createDraw({disciplineId:"height"}).draws.length,2);
  store.setDisplay({mode:"draw",drawId:first.id});
  assert.equal(store.view().settings.displayDrawId,first.id);
  assert.throws(()=>store.setDisplay({mode:"draw",drawId:"missing"}),/پیدا/);
});
test("version 1 data migrates without losing results and backups have credit", t => {
  const {store,directory} = fixture(t,2);
  store.saveResult({teamId:1,disciplineId:"water",rawPrimaryMs:72000});
  const legacy=JSON.parse(fs.readFileSync(store.dataPath));
  legacy.version=1; delete legacy.draws; delete legacy.settings.audioVolume;
  fs.writeFileSync(store.dataPath,JSON.stringify(legacy));
  const upgraded=new CompetitionStore(directory);
  assert.equal(upgraded.view().results[0].rawPrimaryMs,72000);
  assert.deepEqual(upgraded.view().draws,[]);
  assert.equal(upgraded.view().settings.audioVolume,45);
  const backup=path.join(directory,"export.json"); upgraded.exportSnapshot(backup);
  assert.equal(JSON.parse(fs.readFileSync(backup)).organizationCredit,ORGANIZATION);
  fs.writeFileSync(store.dataPath,"broken");
  assert.throws(()=>new CompetitionStore(directory),/فایل داده/);
  assert.equal(fs.readFileSync(store.dataPath,"utf8"),"broken");
});
test("approved results cannot be overwritten before reopening", t => {
  const {store}=fixture(t,2);
  store.saveResult({teamId:1,disciplineId:"water",rawPrimaryMs:70000});
  store.approveResult({resultId:1});
  assert.throws(()=>store.saveResult({teamId:1,disciplineId:"water",rawPrimaryMs:60000}),/باز کنید/);
  store.reopenResult({resultId:1});
  assert.equal(store.saveResult({teamId:1,disciplineId:"water",rawPrimaryMs:60000}).results[0].status,"draft");
});
test("PDF reports escape team input and include credit and all entries", t => {
  const {store}=fixture(t,20);
  store.addTeam({name:'<img src=x onerror="alert(1)">'});
  const state=store.createDraw({});
  const html=reportHtml(state,{type:"draw",drawId:state.draws[0].id});
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes(ORGANIZATION));
  assert.equal((html.match(/<tr>/g)||[]).length,22);
  assert.throws(()=>reportHtml(state,{type:"draw",drawId:"missing"}),/پیدا/);
  assert.ok(reportHtml(state,{type:"standings"}).includes(ORGANIZATION));
});
