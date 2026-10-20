'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CompetitionStore}=require('../store.cjs'),{validateSnapshot}=require('../snapshot.cjs'),{buildStandings}=require('../scoring.cjs'),{reportHtml}=require('../report.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'imidro-event-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,store:new CompetitionStore(dir)};}
function configure(store,patch){const disciplines=store.view().disciplineCatalog.map(d=>({...d,...(patch[d.id]??{})}));return store.updateDisciplines({disciplines,expectedRevision:store.view().revision});}
test('overall tied totals use water rank for official and provisional standings; equal water or no water preserve shared ranks',()=>{
 const state={disciplines:[{id:'scientific',mode:'score'},{id:'water',mode:'time'}],teams:[{id:1},{id:2},{id:3}],results:[]};
 for(const [id,score,time]of [[1,90,60000],[2,80,50000],[3,70,70000]]){state.results.push({teamId:id,disciplineId:'scientific',scientificScore:score,status:'approved'},{teamId:id,disciplineId:'water',rawPrimaryMs:time,penaltyMs:0,status:'approved'});}
 let rows=buildStandings(state);assert.deepEqual(rows.map(r=>[r.team.id,r.total,r.officialRank]),[[2,3,1],[1,3,2],[3,6,3]]);
 state.results.forEach(r=>r.status='draft');rows=buildStandings(state,{includeDrafts:true});assert.deepEqual(rows.map(r=>r.team.id),[2,1,3]);assert.ok(buildStandings(state).every(r=>r.officialRank===null));
 state.results.forEach(r=>{r.status='approved';if(r.disciplineId==='water')r.rawPrimaryMs=60000;else r.scientificScore=90;});assert.deepEqual(buildStandings(state).map(r=>r.officialRank),[1,1,1]);state.disciplines=state.disciplines.filter(d=>d.id!=='water');assert.deepEqual(buildStandings(state).map(r=>r.officialRank),[1,1,1]);
});
test('activation, renaming and deactivation recompute only active items without losing scores, profiles or frozen lanes',t=>{
 const {store,dir}=fixture(t);store.addTeam({name:'تیم'});store.saveRoundScore({teamId:1,round:1,rawMs:60000,name:'ورزشکار'});store.saveResult({teamId:1,disciplineId:'water',rawPrimaryMs:20000});const before=store.view();
 const off=configure(store,{water:{enabled:false,name:'آبرسانی سفارشی'},combined:{enabled:false}});assert.equal(off.disciplines.length,3);assert.equal(off.liveStandings[0].completed,0);assert.deepEqual(off.results,before.results);assert.deepEqual(off.roundScores,before.roundScores);assert.deepEqual(off.combinedSlots,before.combinedSlots);assert.deepEqual(off.participantProfiles,before.participantProfiles);
 assert.throws(()=>store.saveResult({teamId:1,disciplineId:'water',rawPrimaryMs:1000}));assert.throws(()=>store.saveRoundScore({teamId:1,round:2,rawMs:1000}));assert.throws(()=>store.setDisplay({mode:'individual'}));
 let on=configure(store,{water:{enabled:true},combined:{enabled:true}});assert.equal(on.itemLeaderboards.water[0].finalValue,20000);assert.equal(on.disciplines.find(d=>d.id==='water').name,'آبرسانی سفارشی');assert.deepEqual(new CompetitionStore(dir).view().disciplineCatalog,on.disciplineCatalog);assert.deepEqual(validateSnapshot(on).disciplineCatalog,on.disciplineCatalog);
 const historical=reportHtml(off,{type:'standings'});assert.ok(!historical.includes('<th>آبرسانی سفارشی</th>'));assert.match(reportHtml(on,{type:'standings'}),/آبرسانی سفارشی/);
});
test('catalog validates atomically, requires one active item, rejects stale edits and protects scoring rules after data entry',t=>{
 const {store}=fixture(t);store.addTeam({name:'تیم'});const before=store.view(),base=before.disciplineCatalog;
 for(const mutate of [ds=>ds[0].name='',ds=>ds.forEach(d=>d.enabled=false),ds=>ds[0].mode='time',ds=>ds[5].enabled=true,ds=>ds[6].participantCount=21,ds=>ds[6].aggregation='unknown',ds=>ds[6].maxScore=0,ds=>ds[6].id='other']){const ds=structuredClone(base);mutate(ds);assert.throws(()=>store.updateDisciplines({disciplines:ds}));assert.deepEqual(store.view(),before);}
 assert.throws(()=>store.updateDisciplines({disciplines:base,expectedRevision:-1}),/تغییر/);
 configure(store,{emergency_scientific:{enabled:true,configured:true,participantCount:2,maxScore:20,aggregation:'average'}});store.saveScientificScore({teamId:1,disciplineId:'emergency_scientific',slot:1,score:10,name:'نفر اول'});const saved=store.view();assert.throws(()=>configure(store,{emergency_scientific:{participantCount:1}}),/دارای داده/);assert.deepEqual(store.view(),saved);
});
test('emergency science saves each participant independently, computes configured average, survives deletion and restore',t=>{
 const {store,dir}=fixture(t);store.addTeam({name:'اورژانس'});configure(store,{emergency_scientific:{enabled:true,configured:true,participantCount:2,maxScore:20,aggregation:'average'}});
 store.saveScientificScore({teamId:1,disciplineId:'emergency_scientific',slot:1,score:10,name:'اول',durationMs:5000});let state=store.view(),result=state.results[0];assert.equal(result.completionStatus,'Partial');assert.equal(state.itemLeaderboards.emergency_scientific[0].rank,null);assert.throws(()=>store.approveResult({resultId:result.id}));
 store.saveScientificScore({teamId:1,disciplineId:'emergency_scientific',slot:2,score:20,name:'دوم',durationMs:7000});state=store.view();result=state.results[0];assert.equal(result.scientificScore,15);assert.equal(result.scientificSubtotal,30);assert.equal(result.scientificDurationMs,12000);store.approveResult({resultId:result.id});assert.deepEqual(validateSnapshot(store.view()).results,store.view().results);assert.equal(new CompetitionStore(dir).view().itemLeaderboards.emergency_scientific[0].finalValue,15);
 const profile=state.participantProfiles.find(p=>p.disciplineId==='emergency_scientific'&&p.slot===2);const challenge=store.prepareDeletion({kind:'participant',id:profile.id});store.deletionChallenges.get(challenge.token).readyAt=0;store.confirmDeletion({token:challenge.token,confirmation:'تایید'});assert.equal(store.view().results[0].scientificScore,null);assert.equal(store.view().results[0].status,'draft');assert.equal(store.view().itemLeaderboards.emergency_scientific[0].rank,null);
});
test('emergency operational supports a common timed team result or configured participant points and seven active items',t=>{
 const {store}=fixture(t);store.addTeam({name:'تیم'});configure(store,{emergency_scientific:{enabled:true,configured:true,participantCount:1},emergency_operational:{enabled:true,configured:true,participantCount:1}});assert.equal(store.view().disciplines.length,7);
 store.saveResult({teamId:1,disciplineId:'emergency_operational',rawPrimaryMs:50000,penaltyMs:1500,athletePrimary:'ورزشکار'});assert.equal(store.view().itemLeaderboards.emergency_operational[0].finalValue,51500);assert.deepEqual(validateSnapshot(store.view()).results,store.view().results);
 const html=reportHtml(store.view(),{type:'team',teamId:1});assert.match(html,/عملیاتی اورژانس/);assert.match(html,/علمی اورژانس/);assert.equal((html.match(/data-team-detail=/g)||[]).length,15);
});
test('secondary logo persists independently, rejects executable inputs atomically and restores with configuration',t=>{
 const {store,dir}=fixture(t);const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 store.updateSettings({secondaryLogo:png});assert.equal(new CompetitionStore(dir).view().settings.secondaryLogo,png);assert.equal(validateSnapshot(store.view()).settings.secondaryLogo,png);assert.match(reportHtml(store.view(),{type:'standings'}),/class="secondary-logo"/);const before=store.view();assert.throws(()=>store.updateSettings({secondaryLogo:'javascript:alert(1)'}));assert.deepEqual(store.view(),before);
});
