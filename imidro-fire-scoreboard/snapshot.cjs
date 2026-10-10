"use strict";
const {migrateCombined,assignment}=require('./combined.cjs');
const {counts,migrateParticipants,validatePhoto,syncScientific}=require('./participants.cjs');
const {validateLogo}=require('./branding.cjs');
function validateSnapshot(input){
 const fail=()=>{throw Error('ساختار، شناسه‌ها یا مقادیر فایل پشتیبان با داده مسابقه سازگار نیست.');};
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v),int=v=>Number.isSafeInteger(v)&&v>0;
 const text=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||required&&!v.trim())fail();};
 const numeric=(v,min,max,nullable=false)=>{if(nullable&&v==null)return;if(!Number.isFinite(v)||v<min||v>max)fail();};
 if(!object(input)||!Number.isInteger(input.version)||input.version<1||input.version>6)fail();
 if(input.version===6&&!Array.isArray(input.participantProfiles))fail();
 const state=structuredClone(input);
 for(const key of ['teams','results','disciplines'])if(!Array.isArray(state[key]))fail();
 if(state.teams.length>500||state.results.length>2500||state.disciplines.length!==5)fail();
 const modes={scientific:'score',combined:'pair_time',water:'time',rescue_skill:'time',height:'time'};
 if(new Set(state.disciplines.map(d=>d.id)).size!==5)fail();
 for(const d of state.disciplines){if(!object(d)||modes[d.id]!==d.mode)fail();text(d.name,100,true);}
 const unique=(rows,key='id')=>{if(!Array.isArray(rows)||rows.some(r=>!object(r))||new Set(rows.map(r=>r[key])).size!==rows.length)fail();};
 unique(state.teams);const teams=new Set();
 for(const t of state.teams){if(!int(t.id))fail();teams.add(t.id);text(t.name,100,true);text(t.organization??'',150);text(t.code,40);}
 unique(state.results);const resultKeys=new Set();
 for(const r of state.results){
  const key=`${r.teamId}:${r.disciplineId}`;if(!int(r.id)||!teams.has(r.teamId)||!Object.hasOwn(modes,r.disciplineId)||!['approved','draft'].includes(r.status)||resultKeys.has(key))fail();resultKeys.add(key);
  numeric(r.penaltyMs??0,0,r.disciplineId==="combined"?7200000:3600000);for(const field of ['rawPrimaryMs','rawSecondaryMs','scientificDurationMs'])numeric(r[field],1,29999950,true);
  numeric(r.scientificScore,0,r.scientificEntries?500:100,true);
  for(const field of ['athletePrimary','athleteSecondary','judge','approvedBy'])text(r[field]??'',100);
  text(r.note??'',1000);
  if(r.disciplineId==='scientific'&&r.scientificEntries!==undefined){
   if(!Array.isArray(r.scientificEntries)||r.scientificEntries.length>5)fail();unique(r.scientificEntries,'slot');
   for(const e of r.scientificEntries){if(!int(e.slot)||e.slot>5)fail();numeric(e.score,0,100);numeric(e.durationMs,1,5999990,true);}
   syncScientific(r);if(r.status==='approved'&&r.completionStatus!=='Completed')fail();
  }else if(r.disciplineId==='scientific'&&r.scientificScore==null)fail();
  else if(r.disciplineId!=='combined'&&r.disciplineId!=='scientific'&&r.rawPrimaryMs==null)fail();
 }
 for(const key of ['athletes','roundScores','combinedStartOrder','combinedSlots','draws','audits','participantProfiles']){state[key]??=[];if(!Array.isArray(state[key]))fail();}
 for(const [key,max] of [['athletes',1000],['roundScores',1000],['combinedSlots',10000],['draws',10000],['audits',300],['participantProfiles',5000]])if(state[key].length>max)fail();
 unique(state.athletes);const athletes=new Map(),athleteKeys=new Set();
 for(const a of state.athletes){const key=`${a.teamId}:${a.round}`;if(!int(a.id)||!teams.has(a.teamId)||![1,2].includes(a.round)||athleteKeys.has(key))fail();athleteKeys.add(key);athletes.set(a.id,a);text(a.name??'',100);}
 unique(state.roundScores);const scored=new Set();
 for(const r of state.roundScores){const a=athletes.get(r.athleteId);if(!int(r.id)||!a||a.teamId!==r.teamId||a.round!==r.round||scored.has(r.athleteId))fail();scored.add(r.athleteId);numeric(r.rawMs,1,5999990);numeric(r.penaltyMs,0,3600000);text(r.note??'',1000);text(r.judge??'',100);}
 if(state.combinedStartOrder.some(id=>!int(id))||new Set(state.combinedStartOrder).size!==state.combinedStartOrder.length)fail();
 const slotKeys=new Set(),numbers=new Set(),lanes=new Set();
 for(const s of state.combinedSlots){
  const key=`${s.teamId}:${s.round}`,laneKey=`${s.round}:${s.heat}:${s.lane}`;
  if(!int(s.teamId)||![1,2].includes(s.round)||![1,2].includes(s.lane)||![s.drawOrder,s.heat,s.athleteNumber].every(int)||slotKeys.has(key)||numbers.has(s.athleteNumber)||lanes.has(laneKey))fail();slotKeys.add(key);numbers.add(s.athleteNumber);lanes.add(laneKey);
 }
 unique(state.draws);
 for(const d of state.draws){text(d.id,100,true);if(!['all',...Object.keys(modes)].includes(d.disciplineId)||!Array.isArray(d.entries)||d.entries.length>500)fail();unique(d.entries,'teamId');const orders=new Set();for(const [i,e]of d.entries.entries()){if(!int(e.teamId))fail();text(e.name,100,true);text(e.organization??'',150);e.drawOrder??=i+1;if(!int(e.drawOrder)||e.drawOrder>d.entries.length||orders.has(e.drawOrder))fail();orders.add(e.drawOrder);}d.method??='auto';}
 if(!object(state.settings))fail();
 for(const [key,max]of [['competitionName',180],['venue',180],['eventDate',80],['displayMessage',220]])text(state.settings[key]??'',max,key==='competitionName');
 state.settings.competitionLogo=validateLogo(state.settings.competitionLogo||'');state.settings.sponsorLogos??=[];
 if(!Array.isArray(state.settings.sponsorLogos)||state.settings.sponsorLogos.length>3)fail();state.settings.sponsorLogos=state.settings.sponsorLogos.map(validateLogo);
 state.settings.audioVolume??=45;numeric(state.settings.audioVolume,0,100);
 state.settings.displayLayout??='paged';if(!['paged','all'].includes(state.settings.displayLayout))fail();
 state.settings.displayMode??='standings';if(!['standings','draw','item','individual'].includes(state.settings.displayMode))fail();
 if(state.settings.displayMode==='draw'&&!state.draws.some(d=>d.id===state.settings.displayDrawId)||state.settings.displayMode==='item'&&!Object.hasOwn(modes,state.settings.displayItemId))fail();
 unique(state.audits);for(const a of state.audits){if(!int(a.id))fail();text(a.action,100,true);text(a.summary,2500);text(a.createdAt,100,true);}
 unique(state.participantProfiles);const profileKeys=new Set();
 for(const p of state.participantProfiles){const key=`${p.teamId}:${p.disciplineId}:${p.slot}`;if(!int(p.id)||!teams.has(p.teamId)||!int(p.slot)||p.slot>(counts[p.disciplineId]||0)||profileKeys.has(key))fail();profileKeys.add(key);text(p.name,100);p.photo=validatePhoto(p.photo||'');}
 // Always derive counters from actual identities; untrusted counters never choose future IDs.
 for(const [key,rows]of Object.entries({nextTeamId:'teams',nextResultId:'results',nextAthleteId:'athletes',nextRoundScoreId:'roundScores',nextParticipantId:'participantProfiles',nextAuditId:'audits'}))state[key]=Math.max(0,...state[rows].map(r=>Number(r.id)||0))+1;
 migrateCombined(state);migrateParticipants(state);
 for(const team of state.teams){const first=assignment(state,team.id,1),second=assignment(state,team.id,2);if(first.lane===second.lane)fail();}
 for(const r of state.roundScores){const slot=assignment(state,r.teamId,r.round);for(const key of ['lane','heat','athleteNumber'])if(r[key]!==slot[key])fail();}
 for(const a of state.athletes){const p=state.participantProfiles.find(p=>p.teamId===a.teamId&&p.disciplineId==='combined'&&p.slot===a.round);if(p.name!==a.name)fail();}
 for(const r of state.results.filter(r=>r.disciplineId==='combined')){
  const rounds=[1,2].map(round=>state.roundScores.find(s=>s.teamId===r.teamId&&s.round===round));
  if(!rounds.some(Boolean))fail();r.rawPrimaryMs=rounds[0]?.rawMs??null;r.rawSecondaryMs=rounds[1]?.rawMs??null;
  numeric(r.legacyTeamPenaltyMs??0,0,3600000);r.penaltyMs=rounds.reduce((n,s)=>n+(s?.penaltyMs??0),0)/2+(r.legacyTeamPenaltyMs??0);
  r.completionStatus=rounds.every(Boolean)?'Completed':'Partial';if(r.status==='approved'&&r.completionStatus!=='Completed')fail();
 }
 state.version=6;state.revision=Number.isSafeInteger(state.revision)&&state.revision>=0?state.revision:0;
 return state;
}
module.exports={validateSnapshot};
