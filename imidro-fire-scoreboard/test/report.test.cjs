"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CompetitionStore}=require('../store.cjs');
const {liveReportModel,reportHtml,registerReports}=require('../report.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'imidro-report-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new CompetitionStore(dir);for(let i=1;i<=22;i++)store.addTeam({name:`منطقه ویژه صنایع فلزی و معدنی خلیج فارس ${i}`,athletePrimary:`ورزشکار اول ${i}`,athleteSecondary:`ورزشکار دوم ${i}`});return store;}
test('pre-contest individual PDF model includes all 44 named athletes, fixed rounds and opposite lanes without mutating state',t=>{
 const store=fixture(t),before=store.view(),model=liveReportModel(before,{type:'individual'});
 assert.equal(model.rows.length,44);assert.equal(new Set(model.rows.map(r=>r.id)).size,44);assert.equal(model.revision,before.revision);
 for(let i=0;i<22;i++){const first=model.rows[i],second=model.rows[i+22];assert.match(first.cells.athlete,new RegExp(`ورزشکار اول ${i+1}\\n`));assert.match(second.cells.athlete,new RegExp(`ورزشکار دوم ${i+1}\\n`));assert.equal(first.cells.round,'۱');assert.equal(second.cells.round,'۲');assert.notEqual(first.cells.lane,second.cells.lane);assert.equal(first.cells.rank,'—');assert.equal(first.status,'not_recorded');}
 assert.deepEqual(store.view(),before);assert.equal((reportHtml(before,{type:'individual'}).match(/data-report-row=/g)||[]).length,44);
});
test('individual report snapshots follow live ranks and distinguish provisional, approved and absent records',t=>{
 const store=fixture(t);store.saveRoundScore({teamId:1,round:1,rawMs:64500,penaltyMs:5050});store.saveRoundScore({teamId:2,round:1,rawMs:60000});
 let model=liveReportModel(store.view(),{type:'individual'});assert.equal(model.rows[0].id,3);assert.equal(model.rows[0].cells.rank,'۱');assert.equal(model.rows[1].cells.raw,'01:04.50');assert.equal(model.rows[1].cells.penalty,'00:05.05');assert.equal(model.rows[1].cells.final,'01:09.55');assert.equal(model.rows[1].status,'draft');
 store.saveRoundScore({teamId:1,round:2,rawMs:50000});store.approveResult({resultId:store.view().results.find(r=>r.teamId===1).id});
 model=liveReportModel(store.view(),{type:'individual'});assert.equal(model.rows.filter(r=>r.status==='approved').length,2);assert.equal(model.rows.filter(r=>r.status==='not_recorded').length,41);assert.match(model.notice,/موقت رسمی نیستند/);
});
test('every discipline report contains the complete roster and its own score, penalties, partial state and ordering',t=>{
 const store=fixture(t);store.saveRoundScore({teamId:1,round:1,rawMs:60000,penaltyMs:10000});store.saveResult({teamId:2,disciplineId:'water',rawPrimaryMs:64050,penaltyMs:5050,athletePrimary:'نام <آزمایشی>'});store.saveResult({teamId:3,disciplineId:'scientific',scientificScore:97.5,scientificDurationMs:64050});
 const state=store.view();for(const discipline of state.disciplines){const model=liveReportModel(state,{type:'item',disciplineId:discipline.id});assert.equal(model.rows.length,22);assert.deepEqual(model.rows.map(r=>r.id),state.itemLeaderboards[discipline.id].map(r=>r.team.id));assert.equal(model.disciplineId,discipline.id);assert.match(model.title,new RegExp(discipline.name));}
 const partial=liveReportModel(state,{type:'item',disciplineId:'combined'}).rows.find(r=>r.id===1);assert.equal(partial.cells.final,'—');assert.equal(partial.cells.first,'ورزشکار اول 1');assert.equal(partial.cells.second,'ورزشکار دوم 1');assert.match(partial.cells.status,/در حال تکمیل/);
 const water=liveReportModel(state,{type:'item',disciplineId:'water'}).rows[0];assert.equal(water.cells.final,'01:09.10');assert.ok(reportHtml(state,{type:'item',disciplineId:'water'}).includes('نام &lt;آزمایشی&gt;'));
 assert.throws(()=>liveReportModel(state,{type:'item',disciplineId:'bad'}),/رشته/);assert.throws(()=>reportHtml(state,{type:'unknown'}),/نوع/);
});
test('live PDF exports preserve the official report, honor cancellation and verify the admin sender',async t=>{
 const store=fixture(t);store.saveResult({teamId:1,disciplineId:'water',rawPrimaryMs:1000});assert.ok(!reportHtml(store.view(),{type:'standings'}).includes('00:01.00'));
 let handler,asserted=0,dialogs=0;
 registerReports({ipcMain:{handle:(_name,h)=>handler=h},dialog:{showSaveDialog:async()=>{dialogs++;return {canceled:true};}},BrowserWindow:class {constructor(){assert.fail('Canceled export opened a window');}},getStore:()=>store,getWindow:()=>null,assertAdmin:event=>{asserted++;if(event.sender!=='admin')throw Error('admin only');}});
 await assert.rejects(handler({sender:'hall'},{type:'individual'}),/admin only/);assert.equal(dialogs,0);
 assert.deepEqual(await handler({sender:'admin'},{type:'individual'}),{canceled:true});assert.equal(asserted,2);assert.equal(dialogs,1);
 assert.deepEqual(await handler({sender:'admin'},{type:'item',disciplineId:'water'}),{canceled:true});assert.equal(dialogs,2);
});
