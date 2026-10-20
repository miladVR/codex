"use strict";
const {participantCount,discipline}=require('./disciplines.cjs');
const {validateLogo}=require('./branding.cjs');
const counts={scientific:5,combined:2,water:2,rescue_skill:2,height:2};
function migrateParticipants(state){
 state.participantProfiles??=[];state.nextParticipantId??=Math.max(0,...state.participantProfiles.map(p=>p.id))+1;
 for(const team of state.teams)for(const d of state.disciplines)for(let slot=1;slot<=participantCount(state,d.id);slot++){
  const disciplineId=d.id;
  if(state.participantProfiles.some(p=>p.teamId===team.id&&p.disciplineId===disciplineId&&p.slot===slot))continue;
  const result=state.results.find(r=>r.teamId===team.id&&r.disciplineId===disciplineId);
  const name=disciplineId==='combined'?state.athletes.find(a=>a.teamId===team.id&&a.round===slot)?.name:d.mode==='score'?'':result?.[slot===1?'athletePrimary':'athleteSecondary'];
  state.participantProfiles.push({id:state.nextParticipantId++,teamId:team.id,disciplineId,slot,name:name||'',photo:''});
 }
 for(const r of state.results.filter(r=>discipline(state,r.disciplineId)?.mode==='score'&&!Array.isArray(r.scientificEntries)))r.legacyScientific=true;
}
function validatePhoto(value){const photo=validateLogo(value);if(photo&&Buffer.from(photo.split(',')[1],'base64').length>256*1024)throw Error('عکس ورزشکار باید حداکثر ۲۵۶ کیلوبایت باشد.');return photo;}
function syncScientific(result,config={participantCount:5,aggregation:"sum"}){
 const count=config.participantCount;
 const entries=result.scientificEntries||[];
 result.scientificSubtotal=Math.round(entries.reduce((n,e)=>n+e.score,0)*100)/100;
 result.completionStatus=entries.length===count?'Completed':entries.length?'Partial':'Pending';
 result.scientificScore=entries.length===count?Math.round((config.aggregation==="average"?result.scientificSubtotal/count:result.scientificSubtotal)*100)/100:null;
 result.scientificDurationMs=entries.length===count&&entries.every(e=>e.durationMs!=null)?entries.reduce((n,e)=>n+e.durationMs,0):null;
 result.legacyScientific=false;
}
module.exports={counts,migrateParticipants,validatePhoto,syncScientific};
