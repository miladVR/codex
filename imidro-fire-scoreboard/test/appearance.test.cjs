"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CompetitionStore}=require('../store.cjs');const {validateSnapshot}=require('../snapshot.cjs');const appearance=require('../src/appearance.js');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'imidro-appearance-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,store:new CompetitionStore(dir)};}
test('appearance accepts only exact colors, supported modes and bounded integer angles without mutating data on invalid writes',t=>{
 const {store,dir}=fixture(t);const before=fs.readFileSync(store.dataPath,'utf8');
 for(const patch of [{backgroundStart:'red'},{backgroundEnd:'#fff'},{backgroundStart:'#ffffff;url(x)'},{backgroundMode:'radial'},{backgroundAngle:-1},{backgroundAngle:361},{backgroundAngle:2.5},{displayTextSize:'huge'}]){assert.throws(()=>store.updateSettings(patch));assert.equal(fs.readFileSync(store.dataPath,'utf8'),before);assert.deepEqual(new CompetitionStore(dir).view().settings,store.view().settings);}
});
test('solid and gradient persist and restore including hidden second color; legacy snapshots gain safe defaults',t=>{
 const {store,dir}=fixture(t);store.addTeam({name:'تیم'});const originalTeams=store.view().teams;
 store.updateSettings({backgroundMode:'solid',backgroundStart:'#ABCDEF',backgroundEnd:'#fedcba',backgroundAngle:360,displayTextSize:'standard'});
 const saved=new CompetitionStore(dir).view();assert.equal(appearance.background(saved.settings),'#abcdef');assert.equal(saved.settings.backgroundEnd,'#fedcba');assert.deepEqual(saved.teams,originalTeams);
 store.updateSettings({backgroundMode:'gradient'});assert.equal(appearance.background(store.view().settings),'linear-gradient(360deg, #abcdef, #fedcba)');
 assert.deepEqual(validateSnapshot(store.view()).settings,store.view().settings);
 const legacy=store.view();for(const key of Object.keys(appearance.defaults))delete legacy.settings[key];assert.deepEqual(appearance.validate(validateSnapshot(legacy).settings),appearance.defaults);
 const invalid=store.view();invalid.settings.backgroundEnd='url(https://example.com)';assert.throws(()=>validateSnapshot(invalid));
 const reset=store.prepareDeletion({kind:'reset'});store.deletionChallenges.get(reset.token).readyAt=0;store.confirmDeletion({token:reset.token,confirmation:'تایید'});assert.deepEqual(appearance.validate(store.view().settings),appearance.defaults);
});
test('full font and palette settings reject unsafe fonts, invalid enums and sizes atomically and survive restore',t=>{
 const {store,dir}=fixture(t);store.addTeam({name:'تیم حفظ‌شده'});const before=store.view();
 for(const patch of [{customFont:"X';url(x)",fontFamily:'custom'},{fontFamily:'custom',customFont:''},{fontFamily:'unknown'},{adminFontSize:15},{adminFontSize:25},{hallFontMax:45},{hallFontMax:20.5},{fontWeight:900},{numberFont:'unknown'},{buttonSize:'huge'},{surfaceColor:'#fff'},{successColor:'green'},{dangerColor:'url(x)'},{appearanceVersion:3}]){assert.throws(()=>store.updateSettings(patch));assert.deepEqual(store.view(),before);}
 store.updateSettings({fontFamily:'custom',customFont:'Tahoma',adminFontSize:24,hallFontMax:44,fontWeight:700,numberFont:'same',buttonSize:'comfortable',surfaceColor:'#fff7e6',textColor:'#123456',buttonTextColor:'#000000',successColor:'#ccf0cc',dangerColor:'#f0cccc'});
 const settings=store.view().settings;assert.deepEqual(new CompetitionStore(dir).view().settings,settings);assert.equal(appearance.font(settings),"'Tahoma', ScoreboardZar, Tahoma, sans-serif");assert.deepEqual(validateSnapshot(store.view()).settings,settings);
 const backup=path.join(dir,'backup.json');store.exportSnapshot(backup);store.updateSettings(appearance.defaults);const token=store.prepareRestore(backup);store.restoreChallenges.get(token.token).readyAt=0;store.confirmRestore({token:token.token,confirmation:'تایید'});assert.deepEqual(store.view().settings,settings);assert.deepEqual(store.view().teams,before.teams);
});
test('upgrade from v1.5.1 adopts white cream and black text while preserving all competition content',t=>{
 const {store,dir}=fixture(t);store.addTeam({name:'تیم'});store.saveRoundScore({teamId:1,round:1,rawMs:60000,name:'ورزشکار'});const old=store.view();for(const key of Object.keys(appearance.defaults))delete old.settings[key];Object.assign(old.settings,{backgroundMode:'gradient',backgroundStart:'#07111f',backgroundEnd:'#18364b',backgroundAngle:135,displayTextSize:'large'});fs.writeFileSync(store.dataPath,JSON.stringify(old));
 const upgraded=new CompetitionStore(dir).view();assert.deepEqual(appearance.validate(upgraded.settings),appearance.defaults);for(const key of ['teams','results','roundScores','athletes','participantProfiles','combinedSlots'])assert.deepEqual(upgraded[key],old[key]);assert.deepEqual(appearance.validate(validateSnapshot(old).settings),appearance.defaults);
});
test('readability preview detects low contrast without preventing custom palette save',t=>{
 const {store}=fixture(t);assert.deepEqual(appearance.warnings(appearance.defaults),[]);assert.ok(appearance.contrast('#000000','#fff7e6')>18);store.updateSettings({textColor:'#ffffff'});assert.ok(appearance.warnings(store.view().settings).includes('متن روی کادر'));assert.equal(store.view().settings.textColor,'#ffffff');
});
