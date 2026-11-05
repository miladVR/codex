'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CompetitionStore}=require('../store.cjs'),{validateSnapshot}=require('../snapshot.cjs');
const {reportHtml,reportOptions,pageGeometry,liveReportModel,registerReports}=require('../report.cjs');
const {pagePlan}=require('../src/presentation.js');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'imidro-180-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,store:new CompetitionStore(dir)};}
function configure(store,patch){return store.updateDisciplines({disciplines:store.view().disciplineCatalog.map(d=>({...d,...patch[d.id]})),expectedRevision:store.view().revision});}
test('20 discipline slots accept custom timed/scored entries; disabled data, restart and v8 restore preserve identities',t=>{
 const {store,dir}=fixture(t);store.addTeam({name:'تیم'});assert.equal(store.view().disciplineCatalog.length,20);
 const patch=Object.fromEntries(store.view().disciplineCatalog.filter(d=>d.position>5).map(d=>[d.id,{name:d.name||`رشته ${d.position}`,enabled:true,configured:true,participantCount:1}]));patch.custom_13.mode='score';configure(store,patch);assert.equal(store.view().disciplines.length,20);
 store.saveResult({teamId:1,disciplineId:'custom_01',rawPrimaryMs:42000});store.saveScientificScore({teamId:1,disciplineId:'custom_13',slot:1,name:'ورزشکار',score:81});const before=store.view();
 configure(store,{custom_01:{enabled:false},custom_13:{enabled:false}});assert.deepEqual(store.view().results,before.results);assert.deepEqual(store.view().participantProfiles,before.participantProfiles);assert.equal(store.view().disciplines.length,18);
 configure(store,{custom_01:{enabled:true},custom_13:{enabled:true}});const restored=validateSnapshot(new CompetitionStore(dir).view());assert.deepEqual(restored.results,before.results);assert.equal(store.view().itemLeaderboards.custom_01[0].finalValue,42000);assert.equal(store.view().itemLeaderboards.custom_13[0].finalValue,81);
 const invalid=store.view().disciplineCatalog;invalid.push({...invalid[19],id:'custom_14',position:21});assert.throws(()=>store.updateDisciplines({disciplines:invalid}));
});
test('scientific roster reduces from five to two without dummy zeroes, deletion or loss, then restores every extra entry',t=>{
 const {store,dir}=fixture(t);store.addTeam({name:'اورژانس'});configure(store,{emergency_scientific:{enabled:true,configured:true,participantCount:5}});
 for(let slot=1;slot<=5;slot++)store.saveScientificScore({teamId:1,disciplineId:'emergency_scientific',slot,name:`نفر ${slot}`,score:slot<=2?slot*10:0});let before=store.view();store.approveResult({resultId:before.results[0].id});before=store.view();
 let state=configure(store,{emergency_scientific:{participantCount:2,aggregation:'average'}});assert.equal(state.results[0].scientificScore,15);assert.equal(state.results[0].status,'draft');assert.deepEqual(state.results[0].scientificEntries,before.results[0].scientificEntries);assert.deepEqual(state.participantProfiles,before.participantProfiles);assert.throws(()=>store.saveScientificScore({teamId:1,disciplineId:'emergency_scientific',slot:3,name:'نفر سوم',score:70}));
 state=configure(store,{emergency_scientific:{participantCount:5,aggregation:'sum'}});assert.equal(state.results[0].scientificScore,30);assert.equal(state.results[0].completionStatus,'Completed');assert.deepEqual(validateSnapshot(new CompetitionStore(dir).view()).results,state.results);
 configure(store,{scientific:{participantCount:2}});store.saveScientificScore({teamId:1,slot:1,name:'علمی اول',score:90});store.saveScientificScore({teamId:1,slot:2,name:'علمی دوم',score:80});assert.equal(store.view().itemLeaderboards.scientific[0].finalValue,170);
});
test('three combined athletes save independently and best two final times include penalties; individual retains all three',t=>{
 const {store}=fixture(t);store.addTeam({name:'تیم'});configure(store,{combined:{participantCount:3,bestCount:2}});
 store.saveRoundScore({teamId:1,round:1,rawMs:60000,penaltyMs:10000});store.saveRoundScore({teamId:1,round:2,rawMs:65000});assert.equal(store.view().itemLeaderboards.combined[0].rank,null);assert.throws(()=>store.approveResult({resultId:store.view().results[0].id}));
 store.saveRoundScore({teamId:1,round:3,rawMs:66000});let state=store.view();assert.equal(state.itemLeaderboards.combined[0].finalValue,65500);assert.deepEqual(state.results[0].combinedSelectedRounds,[2,3]);assert.equal(state.individualLeaderboard.length,3);assert.deepEqual(state.individualLeaderboard.map(r=>r.round),[2,3,1]);assert.deepEqual(validateSnapshot(state).results,state.results);
 const model=liveReportModel(state,{type:'item',disciplineId:'combined'});assert.ok(model.columns.some(c=>c.key==='selected'));assert.match(model.rows[0].cells.selected,/منتخب/);assert.match(reportHtml(state,{type:'team',teamId:1}),/میانگین ۲ زمان بهتر از ۳ نفر/);
 store.approveResult({resultId:state.results[0].id});const allScores=store.view().roundScores;configure(store,{combined:{participantCount:2,bestCount:2}});state=store.view();assert.equal(state.itemLeaderboards.combined[0].finalValue,67500);assert.deepEqual(state.roundScores,allScores);assert.equal(state.individualLeaderboard.length,2);assert.equal(state.results[0].status,'draft');
 configure(store,{combined:{participantCount:3,bestCount:2}});assert.equal(store.view().itemLeaderboards.combined[0].finalValue,65500);assert.deepEqual(store.view().roundScores,allScores);
});
test('five athletes best three and ten-athlete bounds; expanding frozen rounds and late teams never moves earlier slots',t=>{
 const {store,dir}=fixture(t);for(let i=1;i<=3;i++)store.addTeam({name:`تیم ${i}`});store.saveRoundScore({teamId:1,round:1,rawMs:90000});const original=store.view().combinedSlots;
 store.addTeam({name:'تیم دیررس'});configure(store,{combined:{participantCount:5,bestCount:3}});for(const old of original)assert.deepEqual(store.view().combinedSlots.find(s=>s.teamId===old.teamId&&s.round===old.round),old);
 for(const [round,rawMs]of [[2,50000],[3,70000],[4,60000],[5,80000]])store.saveRoundScore({teamId:1,round,rawMs});assert.equal(store.view().itemLeaderboards.combined[0].finalValue,60000);assert.deepEqual(store.view().results[0].combinedSelectedRounds,[2,4,3]);
 configure(store,{combined:{participantCount:10,bestCount:3}});const state=store.view();assert.equal(state.individualLeaderboard.length,40);assert.equal(new Set(state.combinedSlots.map(s=>s.athleteNumber)).size,state.combinedSlots.length);assert.equal(new Set(state.combinedSlots.map(s=>`${s.round}:${s.heat}:${s.lane}`)).size,state.combinedSlots.length);
 for(const team of state.combinedTeams)for(let i=1;i<team.rounds.length;i++)assert.notEqual(team.rounds[i-1].lane,team.rounds[i].lane);
 assert.deepEqual(validateSnapshot(new CompetitionStore(dir).view()).roundScores,state.roundScores);
 for(const patch of [{participantCount:11},{participantCount:2,bestCount:3},{bestCount:0}]){const before=store.view();assert.throws(()=>configure(store,{combined:patch}));assert.deepEqual(store.view(),before);}
});
test('v7 backups expand to 20 inactive-compatible slots without changing scores, identities, photos or frozen lanes',t=>{
 const {store}=fixture(t);store.addTeam({name:'تیم'});store.saveRoundScore({teamId:1,round:1,rawMs:60000});store.saveRoundScore({teamId:1,round:2,rawMs:50000});store.approveResult({resultId:store.view().results[0].id});const old=store.view();old.version=7;old.disciplineCatalog=old.disciplineCatalog.slice(0,7);delete old.disciplineCatalog[1].bestCount;const saved=structuredClone(old);
 const migrated=validateSnapshot(old);assert.equal(migrated.version,8);assert.equal(migrated.disciplineCatalog.length,20);assert.equal(migrated.disciplines.length,5);for(const key of ['results','roundScores','combinedSlots','participantProfiles'])assert.deepEqual(migrated[key],saved[key]);assert.deepEqual(old,saved);
});
test('PDF orientation and compact numeric controls validate independently and retain team type size',t=>{
 const {store}=fixture(t);store.addTeam({name:'نام تیم با اندازه ثابت'});for(const orientation of ['portrait','landscape']){const options=reportOptions({type:'standings',layout:'single',orientation,density:'compact',numberSize:10});assert.equal(pageGeometry(options).width,orientation==='portrait'?700:1020);const html=reportHtml(store.view(),{type:'standings',...options});assert.match(html,new RegExp(`size:A4 ${orientation}`));assert.match(html,/\.team-name\{font-size:14px\}/);assert.match(html,/td.score-cell,td.numeric\{font-size:10px\}/);assert.match(html,/نام تیم با اندازه ثابت/);}
 for(const p of [{orientation:'diagonal'},{density:'bad'},{numberSize:8},{numberSize:19},{numberSize:'10'}])assert.throws(()=>reportOptions(p));
});
test('large rosters retain readable bounded pages rather than overflowing the two-column hall layout',()=>{
 assert.deepEqual(pagePlan(220,'individual','all'),{capacity:44,columns:2,pageCount:5,rowsPerColumn:22});assert.equal(pagePlan(30,'team','all').pageCount,2);
});
