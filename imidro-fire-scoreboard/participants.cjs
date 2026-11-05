"use strict";
const {participantCount,discipline}=require('./disciplines.cjs');
const {validateLogo}=require('./branding.cjs');
const counts={scientific:5,combined:2,water:2,rescue_skill:2,height:2};
function migrateParticipants(state){
 state.participantProfiles??=[];state.nextParticipantId??=state.participantProfiles.reduce((n,p)=>Math.max(n,p.id),0)+1;
 const keys=new Set(state.participantProfiles.map(p=>`${p.teamId}:${p.disciplineId}:${p.slot}`));
 const athletes=new Map(state.athletes.map(a=>[`${a.teamId}:${a.round}`,a]));
 const results=new Map(state.results.map(r=>[`${r.teamId}:${r.disciplineId}`,r]));
 const rosterDisciplines=state.disciplines.some(d=>d.id==='combined')?state.disciplines:[...state.disciplines,discipline(state,'combined')];
 for(const team of state.teams)for(const d of rosterDisciplines)for(let slot=1;slot<=participantCount(state,d.id);slot++){
  const disciplineId=d.id;
  const key=`${team.id}:${disciplineId}:${slot}`;if(keys.has(key))continue;
  const result=results.get(`${team.id}:${disciplineId}`);
  const name=disciplineId==='combined'?athletes.get(`${team.id}:${slot}`)?.name:d.mode==='score'||slot>2?'':result?.[slot===1?'athletePrimary':'athleteSecondary'];
  state.participantProfiles.push({id:state.nextParticipantId++,teamId:team.id,disciplineId,slot,name:name||'',photo:''});
  keys.add(key);
 }
 for(const a of state.athletes){const key=`${a.teamId}:combined:${a.round}`;if(!keys.has(key)){state.participantProfiles.push({id:state.nextParticipantId++,teamId:a.teamId,disciplineId:'combined',slot:a.round,name:a.name||'',photo:''});keys.add(key);}}
 for(const r of state.results.filter(r=>discipline(state,r.disciplineId)?.mode==='score'&&!Array.isArray(r.scientificEntries)))r.legacyScientific=true;
}
function validatePhoto(value){const photo=validateLogo(value);if(photo&&Buffer.from(photo.split(',')[1],'base64').length>256*1024)throw Error('عکس ورزشکار باید حداکثر ۲۵۶ کیلوبایت باشد.');return photo;}
function syncScientific(result,config={participantCount:5,aggregation:"sum"}){
 const count=config.participantCount;
 // Slots outside the current roster remain stored and can be reactivated.
 const entries=(result.scientificEntries||[]).filter(e=>e.slot<=count);
 result.scientificSubtotal=Math.round(entries.reduce((n,e)=>n+e.score,0)*100)/100;
 result.completionStatus=entries.length===count?'Completed':entries.length?'Partial':'Pending';
 result.scientificScore=entries.length===count?Math.round((config.aggregation==="average"?result.scientificSubtotal/count:result.scientificSubtotal)*100)/100:null;
 result.scientificDurationMs=entries.length===count&&entries.every(e=>e.durationMs!=null)?entries.reduce((n,e)=>n+e.durationMs,0):null;
 result.legacyScientific=false;
}
module.exports={counts,migrateParticipants,validatePhoto,syncScientific};
