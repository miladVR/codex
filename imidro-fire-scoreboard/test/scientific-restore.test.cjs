"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CompetitionStore}=require('../store.cjs');const {validateSnapshot}=require('../snapshot.cjs');const {registerBackups}=require('../backup-controller.cjs');const {reportHtml,reportOptions}=require('../report.cjs');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAACAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ2kAAAAASUVORK5CYII=';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'imidro-v150-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new CompetitionStore(dir);store.addTeam({name:'تیم نخست',athletePrimary:'ورزشکار اول',athleteSecondary:'ورزشکار دوم'});store.addTeam({name:'تیم دوم'});return {store,dir};}
function science(store,teamId,slot,score=90,durationMs=null){return store.saveScientificScore({teamId,slot,score,name:`شرکت‌کننده ${slot}`,durationMs});}
function confirmed(store,kind,id){const review=store.prepareDeletion({kind,id});store.deletionChallenges.get(review.token).readyAt=0;return store.confirmDeletion({token:review.token,confirmation:'تایید'});}
test('five scientific scores save independently across restarts, rank only when complete and use the sum, including zero',t=>{
 const {store,dir}=fixture(t);let current=store;
 for(let slot=1;slot<=5;slot++){science(current,1,slot,slot===1?0:90);current=new CompetitionStore(dir);const s=current.view(),r=s.results[0];assert.equal(r.scientificEntries.length,slot);assert.equal(r.scientificSubtotal,(slot-1)*90);assert.equal(s.itemLeaderboards.scientific.find(r=>r.team.id===1).rank,slot===5?1:null);if(slot<5)assert.throws(()=>current.approveResult({resultId:r.id}),/پنج/);}
 const result=current.view().results[0];assert.equal(result.scientificScore,360);assert.equal(result.scientificDurationMs,null);current.approveResult({resultId:result.id});assert.throws(()=>science(current,1,1),/اصلاح/);
 for(let slot=1;slot<=5;slot++)science(current,2,slot,95);assert.equal(current.view().itemLeaderboards.scientific[0].team.id,2);assert.equal(current.view().itemLeaderboards.scientific[0].finalValue,475);
});
test('scientific ties use all five response times, and partial totals never enter overall completion',t=>{
 const {store}=fixture(t);for(let slot=1;slot<=5;slot++){science(store,1,slot,80,10000);science(store,2,slot,80,9000);}
 assert.equal(store.view().itemLeaderboards.scientific[0].team.id,2);assert.equal(store.view().results[0].scientificDurationMs,50000);
 const p=store.view().participantProfiles.find(p=>p.teamId===1&&p.disciplineId==='scientific'&&p.slot===5);confirmed(store,'participant',p.id);
 const state=store.view();assert.equal(state.results[0].scientificScore,null);assert.equal(state.liveStandings.find(r=>r.team.id===1).completed,0);assert.equal(state.results[0].completionStatus,'Partial');assert.equal(state.participantProfiles.find(x=>x.id===p.id).name,'');
});
test('scientific invalid input and stale edits leave durable data unchanged, legacy scores are retained without invented detail',t=>{
 const {store}=fixture(t);store.saveResult({teamId:1,disciplineId:'scientific',scientificScore:88});const before=store.view();assert.equal(before.results[0].legacyScientific,true);assert.equal(before.results[0].scientificEntries,undefined);
 for(const payload of [{slot:6,score:80,name:'نام'},{slot:1,score:101,name:'نام'},{slot:1,score:'',name:'نام'},{slot:1,score:80,name:''},{slot:1,score:80,name:'نام',expectedRevision:0}])assert.throws(()=>store.saveScientificScore({teamId:1,...payload}));assert.deepEqual(store.view(),before);
 science(store,1,1,80);assert.equal(store.view().results[0].scientificScore,null);assert.equal(store.view().results[0].scientificEntries.length,1);assert.throws(()=>store.saveResult({teamId:1,disciplineId:'scientific',scientificScore:88}),/پنج‌نفره/);
});
test('independent names and raster portraits survive restart and gated photo deletion preserves other participant data',t=>{
 const {store,dir}=fixture(t);const p=store.view().participantProfiles.find(p=>p.teamId===1&&p.disciplineId==='scientific'&&p.slot===3);
 store.saveParticipant({id:p.id,name:'علی <آزمون>',photo:png});assert.equal(new CompetitionStore(dir).view().participantProfiles.find(x=>x.id===p.id).photo,png);
 assert.throws(()=>store.saveParticipant({id:p.id,name:'',photo:''}),/دومرحله‌ای/);assert.throws(()=>store.saveParticipant({id:p.id,photo:'data:image/svg+xml;base64,abcd'}));
 confirmed(store,'participant_photo',p.id);const after=store.view().participantProfiles.find(x=>x.id===p.id);assert.equal(after.photo,'');assert.equal(after.name,'علی <آزمون>');
});
test('complete JSON backup restores scores, photos, settings, frozen lanes, draws and names after full reset',t=>{
 const {store,dir}=fixture(t);store.createDraw({method:'manual',entries:[{teamId:1,drawOrder:2},{teamId:2,drawOrder:1}]});store.saveRoundScore({teamId:1,round:1,rawMs:64500,penaltyMs:5000});for(let i=1;i<=5;i++)science(store,1,i,90,10000);const result=store.view().results.find(r=>r.disciplineId==='scientific');store.approveResult({resultId:result.id});
 const p=store.view().participantProfiles.find(p=>p.disciplineId==='scientific');store.saveParticipant({id:store.view().participantProfiles.find(p=>p.teamId===2&&p.disciplineId==='scientific').id,photo:png});store.updateSettings({competitionName:'رویداد بازیابی',venue:'کرمان',competitionLogo:png});
 const file=path.join(dir,'manual.json');store.exportSnapshot(file);const before=store.view();confirmed(store,'reset');assert.equal(store.view().teams.length,0);
 const review=store.prepareRestore(file);assert.throws(()=>store.confirmRestore({token:review.token,confirmation:'تایید'}),/دو ثانیه/);store.restoreChallenges.get(review.token).readyAt=0;store.confirmRestore({token:review.token,confirmation:'تایید'});
 const after=new CompetitionStore(dir).view();for(const key of ['teams','athletes','roundScores','results','draws','settings','combinedStartOrder','combinedSlots','participantProfiles'])assert.deepEqual(after[key],before[key],key);assert.ok(after.revision>before.revision);assert.notEqual(after.resetId,before.resetId);assert.ok(fs.readdirSync(store.backupPath).some(n=>n.startsWith('before-restore-')));assert.throws(()=>store.confirmRestore({token:review.token,confirmation:'تایید'}),/منقضی/);
});
test('corrupt, foreign, incompatible or inconsistent backups and stale confirmations cannot replace current data',t=>{
 const {store,dir}=fixture(t);science(store,1,1);const before=store.view(),base=JSON.parse(fs.readFileSync(store.dataPath));
 for(const mutate of [x=>x.version=99,x=>x.teams[0].id=x.teams[1].id,x=>x.results[0].teamId=999,x=>x.results[0].scientificEntries[0].score=-1,x=>x.participantProfiles[0].photo='javascript:alert(1)',x=>x.results[0].status='approved',x=>x.disciplines[0].mode='time']){const s=structuredClone(base);mutate(s);assert.throws(()=>validateSnapshot(s));}
 const file=path.join(dir,'bad.json');fs.writeFileSync(file,'{');assert.throws(()=>store.prepareRestore(file),/معتبر/);assert.deepEqual(store.view(),before);
 store.exportSnapshot(file);const review=store.prepareRestore(file);store.restoreChallenges.get(review.token).readyAt=0;store.updateSettings({venue:'تغییر پس از بررسی'});assert.throws(()=>store.confirmRestore({token:review.token,confirmation:'تایید'}),/تغییر/);assert.equal(store.view().settings.venue,'تغییر پس از بررسی');
});
test('v1-v5 backups migrate while preserving original scientific aggregates and combined mean',t=>{
 const {store}=fixture(t);store.saveResult({teamId:1,disciplineId:'scientific',scientificScore:88});store.saveResult({teamId:1,disciplineId:'combined',rawPrimaryMs:60000,rawSecondaryMs:80000,penaltyMs:5000});
 for(const version of [1,2,3,4,5]){const s=JSON.parse(fs.readFileSync(store.dataPath));s.version=version;delete s.participantProfiles;delete s.nextParticipantId;const restored=validateSnapshot(s);assert.equal(restored.version,6);assert.equal(restored.results.find(r=>r.disciplineId==='scientific').scientificScore,88);assert.equal(restored.participantProfiles.length,26);assert.equal(restored.results.find(r=>r.disciplineId==='combined').penaltyMs,5000);}
});
test('backup and restore file selection require admin, honor cancel and never mutate on preview',async t=>{
 const {store,dir}=fixture(t);const file=path.join(dir,'backup.json');store.exportSnapshot(file);const handlers={};let cancel=true;registerBackups({ipcMain:{handle:(key,f)=>handlers[key]=f},dialog:{showOpenDialog:async()=>({canceled:cancel,filePaths:[file]}),showSaveDialog:async()=>({canceled:true})},getStore:()=>store,getWindow:()=>null,assertAdmin:e=>{if(e.sender!=='admin')throw Error('admin only');}});
 await assert.rejects(handlers['data:restore-prepare']({sender:'hall'}),/admin/);assert.deepEqual(await handlers['data:restore-prepare']({sender:'admin'}),{canceled:true});cancel=false;const before=store.view(),review=await handlers['data:restore-prepare']({sender:'admin'});assert.ok(review.token);assert.deepEqual(store.view(),before);
});
test('every PDF has four signature positions, escaped optional comments and complete thirteen-participant team details',t=>{
 const {store}=fixture(t);store.createDraw();for(let i=1;i<=5;i++)science(store,1,i,90);const state=store.view();
 for(const payload of [{type:'overall'},{type:'standings'},{type:'team',teamId:1},{type:'item',disciplineId:'scientific'},{type:'individual'},{type:'draw',drawId:state.draws[0].id}]){const html=reportHtml(state,{...payload,layout:'single',comments:'<script> توضیح آزمایشی'});assert.equal((html.match(/class="signature"/g)||[]).length,4);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));}
 const html=reportHtml(state,{type:'team',teamId:1});assert.equal((html.match(/data-team-detail=/g)||[]).length,13);assert.ok(html.includes('شرکت‌کننده 5'));assert.ok(html.includes('۴۵۰'));assert.throws(()=>reportOptions({layout:'unknown'}));assert.throws(()=>reportOptions({comments:'x'.repeat(1501)}));assert.throws(()=>reportHtml(state,{type:'team',teamId:999}));
});

test('failed restore rename or backup creation leaves both live and durable competition data intact',t=>{
 const {store,dir}=fixture(t);const file=path.join(dir,'restore.json');store.exportSnapshot(file);store.addTeam({name:'اطلاعات فعلی باید حفظ شود'});const before=store.view();
 for(const method of ['renameSync','copyFileSync']){
  const review=store.prepareRestore(file);store.restoreChallenges.get(review.token).readyAt=0;
  const original=fs[method];fs[method]=()=>{throw Error('disk blocked');};try{assert.throws(()=>store.confirmRestore({token:review.token,confirmation:'تایید'}),/disk blocked/);}finally{fs[method]=original;}
  assert.deepEqual(store.view(),before);assert.deepEqual(new CompetitionStore(dir).view(),before);
 }
});
