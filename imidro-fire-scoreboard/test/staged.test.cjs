"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CompetitionStore}=require('../store.cjs');
const {assignment}=require('../combined.cjs');
const {reportHtml}=require('../report.cjs');
function fixture(t,n=22){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'imidro-staged-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new CompetitionStore(dir);for(let i=1;i<=n;i++)store.addTeam({name:`تیم ${i}`,athletePrimary:`الف ${i}`,athleteSecondary:`ب ${i}`});return {store,dir};}
const save=(store,teamId,round,rawMs,penaltyMs=0)=>store.saveRoundScore({teamId,round,rawMs,penaltyMs});
test('22 first athletes save independently, ranks sort immediately and teams stay partial after restart',t=>{
 const {store,dir}=fixture(t);
 for(let id=1;id<=22;id++) save(store,id,1,90000-id*1000);
 const view=store.view();assert.equal(view.roundScores.length,22);assert.equal(view.individualLeaderboard.length,44);
 assert.equal(view.individualLeaderboard[0].team.id,22);assert.equal(view.individualLeaderboard[0].rank,1);
 assert.ok(view.combinedTeams.every(team=>team.status==='Partial'));
 assert.ok(view.itemLeaderboards.combined.every(team=>team.rank===null && team.finalValue===null));
 assert.deepEqual(new CompetitionStore(dir).view(),view);
 assert.throws(()=>store.approveResult({resultId:view.results[0].id}),/هر دو/);
});
test('lane matrix swaps round 2, numbers 23..44 and no two athletes share a heat lane',t=>{
 const {store}=fixture(t);const state=store.view();
 for(const round of [1,2]){const occupied=new Set();for(let id=1;id<=22;id++){
  const a=assignment(state,id,round);assert.equal(a.athleteNumber,id+(round-1)*22);
  assert.equal(a.lane,round===1?(id%2?1:2):(id%2?2:1));const key=`${a.heat}:${a.lane}`;assert.ok(!occupied.has(key));occupied.add(key);
 }}
 const before=store.view();assert.throws(()=>store.saveRoundScore({teamId:1,round:2,rawMs:50000,lane:1}),/لاین/);assert.deepEqual(store.view(),before);
 save(store,1,1,60000);store.addTeam({name:'دیررس'});assert.equal(assignment(store.view(),1,2).athleteNumber,23);
 assert.throws(()=>save(store,23,1,60000),/فهرست ثابت/);
});
test('per-athlete penalties average once; second round produces and instantly reorders team rank',t=>{
 const {store}=fixture(t,2);save(store,1,1,60000,10000);save(store,2,1,50000);
 save(store,1,2,80000,0);let row=store.view().itemLeaderboards.combined.find(r=>r.team.id===1);
 assert.equal(row.finalValue,75000);assert.equal(row.rank,1);assert.equal(row.result.completionStatus,'Completed');
 save(store,2,2,70000,2000);assert.equal(store.view().itemLeaderboards.combined[0].team.id,2);
 save(store,1,2,40000);assert.equal(store.view().itemLeaderboards.combined[0].team.id,1);
 const view=store.view();store.approveResult({resultId:row.result.id});assert.equal(store.view().standings.find(r=>r.team.id===1).disciplineRanks.combined,1);
 assert.throws(()=>save(store,1,1,20000),/اصلاح/);
 store.reopenResult({resultId:row.result.id});save(store,1,1,20000,10000);assert.equal(store.view().itemLeaderboards.combined[0].finalValue,35000);
});
test('individual ties share rank and skip next place',t=>{const {store}=fixture(t,2);save(store,1,1,30000);save(store,2,1,30000);save(store,1,2,40000);assert.deepEqual(store.view().individualLeaderboard.slice(0,3).map(r=>r.rank),[1,1,3]);});
test('old combined scores retain exact average and common penalty after migration',t=>{
 const {store,dir}=fixture(t,2);store.saveCombinedPair({teamId:1,rawPrimaryMs:60000,rawSecondaryMs:80000,penaltyMs:5000});
 const legacy=JSON.parse(fs.readFileSync(store.dataPath));legacy.version=3;delete legacy.athletes;delete legacy.roundScores;delete legacy.combinedStartOrder;
 delete legacy.nextAthleteId;delete legacy.nextRoundScoreId;for(const r of legacy.results){delete r.completionStatus;delete r.legacyTeamPenaltyMs;delete r.roundPenalties;}
 fs.writeFileSync(store.dataPath,JSON.stringify(legacy));const restored=new CompetitionStore(dir);assert.equal(restored.view().version,4);assert.equal(restored.view().itemLeaderboards.combined[0].finalValue,75000);
 save(restored,1,1,40000);assert.equal(restored.view().itemLeaderboards.combined[0].finalValue,65000);
});
test('deletion rejects fast, unconfirmed, stale and replayed requests; removing one round restores partial and recalculates ranks',t=>{
 const {store}=fixture(t,2);save(store,1,1,30000);save(store,1,2,40000);save(store,2,1,60000);save(store,2,2,70000);
 const score=store.view().roundScores.find(s=>s.teamId===1 && s.round===2);const now=Date.now;let clock=now();Date.now=()=>clock;
 try{const q=store.prepareDeletion({kind:'round',id:score.id});assert.throws(()=>store.confirmDeletion({token:q.token,confirmation:'تایید'}),/دو ثانیه/);
 clock+=2100;assert.throws(()=>store.confirmDeletion({token:q.token,confirmation:'yes'}),/تایید/);
 store.confirmDeletion({token:q.token,confirmation:'تایید'});assert.equal(store.view().combinedTeams[0].status,'Partial');assert.equal(store.view().itemLeaderboards.combined[0].team.id,2);
 assert.throws(()=>store.confirmDeletion({token:q.token,confirmation:'تایید'}),/منقضی/);
 const stale=store.prepareDeletion({kind:'team',id:2});clock+=2100;store.updateSettings({eventDate:'۱۴۰۵/۰۷/۱۵'});assert.throws(()=>store.confirmDeletion({token:stale.token,confirmation:'تایید'}),/تغییر/);
 const expired=store.prepareDeletion({kind:'team',id:2});clock+=120001;assert.throws(()=>store.confirmDeletion({token:expired.token,confirmation:'تایید'}),/منقضی/);
 }finally{Date.now=now;}
});
test('athlete deletion clears name and score, team cascade leaves no orphan records and preserves start slots',t=>{
 const {store}=fixture(t,2);save(store,1,1,30000);save(store,1,2,40000);const now=Date.now;let clock=now();Date.now=()=>clock;
 try{const athlete=store.view().athletes[0];let q=store.prepareDeletion({kind:'athlete',id:athlete.id});clock+=2100;store.confirmDeletion({token:q.token,confirmation:'تایید'});
 assert.equal(store.view().athletes[0].name,'');assert.equal(store.view().combinedTeams[0].status,'Partial');
 q=store.prepareDeletion({kind:'team',id:1});clock+=2100;store.confirmDeletion({token:q.token,confirmation:'تایید'});
 assert.ok(store.view().athletes.every(a=>a.teamId!==1));assert.ok(store.view().roundScores.every(s=>s.teamId!==1));assert.ok(store.view().results.every(r=>r.teamId!==1));assert.equal(assignment(store.view(),2,2).athleteNumber,4);
 assert.throws(()=>store.createDraw({disciplineId:'combined'}),/حداقل|ثابت/);
 }finally{Date.now=now;}
});
test('unsafe logos and partial settings failures do not mutate state; branding enters PDF safely',t=>{
 const {store}=fixture(t,2),before=store.view();
 for(const logo of ['https://example.com/a.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,YWJj']){assert.throws(()=>store.updateSettings({competitionLogo:logo}));assert.deepEqual(store.view(),before);}
 const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ2kAAAAASUVORK5CYII=';
 store.updateSettings({competitionName:'رویداد <آزمایشی>',eventDate:'۱۴۰۵/۰۷/۱۵',competitionLogo:logo,sponsorLogos:[logo]});store.updateSettings({audioEnabled:false});
 assert.equal(store.view().settings.competitionLogo,logo);assert.equal(store.view().settings.eventDate,'۱۴۰۵/۰۷/۱۵');
 const html=reportHtml(store.view(),{type:'standings'});assert.ok(html.includes('data:image/png;base64'));assert.ok(html.includes('رویداد &lt;آزمایشی&gt;'));assert.ok(html.includes('۱۴۰۵/۰۷/۱۵'));
});
test('invalid staged input and stale revision leave both athletes and scores unchanged',t=>{
 const {store}=fixture(t,2),before=store.view();for(const rawMs of [null,0,-1,NaN]) {assert.throws(()=>store.saveRoundScore({teamId:1,round:1,rawMs,athleteName:'نام جدید'}));assert.deepEqual(store.view(),before);}
 assert.throws(()=>store.saveRoundScore({teamId:1,round:1,rawMs:30000,expectedRevision:0}),/تغییر/);
 assert.throws(()=>store.saveRoundScore({teamId:1,round:1,rawMs:30000,athleteName:''}),/دومرحله/);assert.deepEqual(store.view(),before);
});

test('clearing a penalty uses the same safety gate while preserving raw time and name',t=>{
 const {store}=fixture(t,2);save(store,1,1,60000,10000);save(store,1,2,80000);
 assert.throws(()=>save(store,1,1,60000,0),/دومرحله/);
 const score=store.view().roundScores[0],name=store.view().athletes[0].name,q=store.prepareDeletion({kind:'round_penalty',id:score.id});
 const now=Date.now;Date.now=()=>now()+2100;try{store.confirmDeletion({token:q.token,confirmation:'تایید'});}finally{Date.now=now;}
 const next=store.view();assert.equal(next.roundScores[0].rawMs,60000);assert.equal(next.roundScores[0].penaltyMs,0);assert.equal(next.athletes[0].name,name);assert.equal(next.itemLeaderboards.combined[0].finalValue,70000);
});
