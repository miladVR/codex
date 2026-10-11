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
