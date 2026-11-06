"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {CompetitionStore}=require("../store.cjs");
const {validateSnapshot}=require("../snapshot.cjs");
const {registerStateIPC}=require("../display-controller.cjs");

function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"imidro-181-"));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=new CompetitionStore(dir);
  store.addTeam({name:"تیم نمونه"});
  return {dir,store};
}

test("a backup containing markup in the team code cannot be restored",t=>{
  const {store}=fixture(t);
  const state=store.view();
  assert.equal(validateSnapshot(state).teams[0].code,"T01");
  state.teams[0].code='"><img src=x onerror=alert(1)>';
  assert.throws(()=>validateSnapshot(state));
  assert.equal(store.view().teams[0].code,"T01");
});

test("a failed automatic backup preserves and broadcasts the committed score",t=>{
  const {dir,store}=fixture(t);
  const adminEvents=[],hallEvents=[],handlers=new Map();
  const webContents={isLoading:()=>false,send:(channel,state)=>adminEvents.push({channel,state})};
  registerStateIPC({ipcMain:{handle:(channel,handler)=>handlers.set(channel,handler)},getStore:()=>store,
    getAdmin:()=>({webContents,isDestroyed:()=>false}),display:{send:state=>hallEvents.push(state)}});
  const copy=fs.copyFileSync;
  let result;
  try{
    fs.copyFileSync=(source,dest)=>{if(source===store.dataPath&&dest.endsWith(".tmp")){
      fs.writeFileSync(dest,"partial copy");throw Object.assign(new Error("disk full"),{code:"ENOSPC"});
    }return copy(source,dest);};
    result=handlers.get("result:save")({sender:webContents},{teamId:1,disciplineId:"water",rawPrimaryMs:53000});
  }finally{fs.copyFileSync=copy;}
  assert.match(result.backupWarning,/پشتیبان/);
  assert.deepEqual(adminEvents,[{channel:"state:changed",state:result}]);
  assert.deepEqual(hallEvents,[result]);
  assert.equal(new CompetitionStore(dir).view().results[0].rawPrimaryMs,53000);
  assert.ok(!fs.readdirSync(store.backupPath).some(name=>name.endsWith(".tmp")));
  assert.equal(store.updateSettings({venue:"آزمایش"}).backupWarning,"");
});

test("metadata and unused scoring options do not reopen an approved timed score",t=>{
  const {store}=fixture(t);
  const saved=store.saveResult({teamId:1,disciplineId:"water",rawPrimaryMs:53000});
  const before=store.approveResult({resultId:saved.results[0].id});
  const next=store.updateDisciplines({expectedRevision:before.revision,disciplines:before.disciplineCatalog.map(d=>
    d.id==="water"?{...d,name:"آبرسانی آزمایشی",participantCount:3,maxScore:11,aggregation:"average"}:d)});
  assert.deepEqual(next.results[0],before.results[0]);
  assert.equal(next.results[0].status,"approved");
  assert.equal(next.itemLeaderboards.water[0].finalValue,before.itemLeaderboards.water[0].finalValue);
});
