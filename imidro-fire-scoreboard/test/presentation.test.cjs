"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {formatTime,pagePlan,slotBadge}=require("../src/presentation.js");
const {CompetitionStore}=require("../store.cjs");
test("hundredths have exactly two digits, including 05/50 and carry into minutes",()=>{
  for(const [ms,text] of [[64050,"01:04.05"],[64500,"01:04.50"],[60000,"01:00.00"],[59995,"01:00.00"],[30005,"00:30.01"],[0,"00:00.00"],[null,"—"],[NaN,"—"]])assert.equal(formatTime(ms),text);
});
test("22 teams and 44 athletes take two pages or one page with two complete tables",()=>{
  assert.deepEqual(pagePlan(22,"team"),{capacity:11,columns:1,pageCount:2,rowsPerColumn:11});
  assert.deepEqual(pagePlan(44,"individual"),{capacity:22,columns:1,pageCount:2,rowsPerColumn:22});
  for(const [total,kind] of [[22,"team"],[44,"individual"]]){
    const p=pagePlan(total,kind,"all");assert.equal(p.pageCount,1);assert.equal(p.columns,2);assert.equal(p.rowsPerColumn,total/2);
  }
  assert.equal(pagePlan(10,"team").pageCount,1);assert.equal(pagePlan(20,"individual").pageCount,1);
  assert.equal(pagePlan(0,"individual").pageCount,1);
});
test("assignment badges identify each number using both text and distinct style",()=>{
  for(const [kind,label] of [["number","شماره"],["round","دور"],["heat","گروه"],["lane","لاین"]]){
    const html=slotBadge(kind,2);assert.ok(html.includes(`slot-${kind}`));assert.ok(html.includes(label));assert.ok(html.includes("۲"));
  }
  assert.ok(slotBadge("lane",'<script>').includes("—"));assert.throws(()=>slotBadge("bad",1));
});
test("layout setting survives migration, reload and reset; display rounding leaves exact averages and ranks intact",t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"imidro-layout-"));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new CompetitionStore(dir);
  for(const name of ["اول","دوم"])store.addTeam({name});
  store.saveRoundScore({teamId:1,round:1,rawMs:30000});store.saveRoundScore({teamId:1,round:2,rawMs:30010});
  store.saveRoundScore({teamId:2,round:1,rawMs:30010});store.saveRoundScore({teamId:2,round:2,rawMs:30010});
  const before=store.view();assert.equal(before.itemLeaderboards.combined[0].finalValue,30005);assert.equal(formatTime(30005),formatTime(30010));
  assert.deepEqual(before.itemLeaderboards.combined.map(r=>r.rank),[1,2]);
  assert.throws(()=>store.updateSettings({displayLayout:"bad",competitionName:"changed"}),/چیدمان/);assert.deepEqual(store.view(),before);
  store.updateSettings({displayLayout:"all"});const reload=new CompetitionStore(dir).view();assert.equal(reload.settings.displayLayout,"all");assert.deepEqual(reload.roundScores,before.roundScores);
  const legacy=JSON.parse(fs.readFileSync(store.dataPath));delete legacy.settings.displayLayout;fs.writeFileSync(store.dataPath,JSON.stringify(legacy));
  const migrated=new CompetitionStore(dir);assert.equal(migrated.view().settings.displayLayout,"paged");assert.deepEqual(migrated.view().roundScores,before.roundScores);
  migrated.updateSettings({displayLayout:"all"});const q=migrated.prepareDeletion({kind:"reset"});migrated.deletionChallenges.get(q.token).readyAt=0;migrated.confirmDeletion({token:q.token,confirmation:"تایید"});assert.equal(migrated.view().settings.displayLayout,"paged");
});

test('combined save readiness depends only on the selected athlete and gives actionable lock reasons',()=>{
 const {combinedSaveState}=require('../src/presentation.js');
 assert.equal(combinedSaveState({lane:1,rawMs:30000}).enabled,true);
 assert.equal(combinedSaveState({lane:2,rawMs:30000,penaltyMs:1000}).enabled,true);
 for(const input of [{lane:1,rawMs:null},{lane:1,rawMs:0},{lane:null,rawMs:30000},{lane:1,rawMs:30000,penaltyMs:-1},{lane:1,rawMs:30000,busy:true},{lane:1,rawMs:30000,approved:true}]){const s=combinedSaveState(input);assert.equal(s.enabled,false);assert.ok(s.reason.length>10);}
});
