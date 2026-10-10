"use strict";
const {validateLogo}=require('./branding.cjs');
const counts={scientific:5,combined:2,water:2,rescue_skill:2,height:2};
function migrateParticipants(state){
 state.participantProfiles??=[];state.nextParticipantId??=Math.max(0,...state.participantProfiles.map(p=>p.id))+1;
 for(const team of state.teams)for(const [disciplineId,count]of Object.entries(counts))for(let slot=1;slot<=count;slot++){
  if(state.participantProfiles.some(p=>p.teamId===team.id&&p.disciplineId===disciplineId&&p.slot===slot))continue;
  const result=state.results.find(r=>r.teamId===team.id&&r.disciplineId===disciplineId);
  const name=disciplineId==='combined'?state.athletes.find(a=>a.teamId===team.id&&a.round===slot)?.name:disciplineId==='scientific'?'':result?.[slot===1?'athletePrimary':'athleteSecondary'];
  state.participantProfiles.push({id:state.nextParticipantId++,teamId:team.id,disciplineId,slot,name:name||'',photo:''});
 }
 for(const r of state.results.filter(r=>r.disciplineId==='scientific'&&!Array.isArray(r.scientificEntries)))r.legacyScientific=true;
}
function validatePhoto(value){const photo=validateLogo(value);if(photo&&Buffer.from(photo.split(',')[1],'base64').length>256*1024)throw Error('عکس ورزشکار باید حداکثر ۲۵۶ کیلوبایت باشد.');return photo;}
function syncScientific(result){
 const entries=result.scientificEntries||[];
 result.scientificSubtotal=Math.round(entries.reduce((n,e)=>n+e.score,0)*100)/100;
 result.completionStatus=entries.length===5?'Completed':entries.length?'Partial':'Pending';
 result.scientificScore=entries.length===5?result.scientificSubtotal:null;
 result.scientificDurationMs=entries.length===5&&entries.every(e=>e.durationMs!=null)?entries.reduce((n,e)=>n+e.durationMs,0):null;
 result.legacyScientific=false;
}
module.exports={counts,migrateParticipants,validatePhoto,syncScientific};
