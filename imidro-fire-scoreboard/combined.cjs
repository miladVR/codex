"use strict";
const {participantCount,discipline}=require('./disciplines.cjs');
function rounds(state){return Array.from({length:participantCount(state,'combined')},(_,i)=>i+1);}
function startOrder(state) {
  if(state.combinedStartOrder?.length)return state.combinedStartOrder;
  const draw=state.draws.find(d=>d.disciplineId==='combined')??state.draws.find(d=>d.disciplineId==='all');
  const ordered=(draw?.entries??[]).filter(e=>state.teams.some(t=>t.id===e.teamId)).sort((a,b)=>a.drawOrder-b.drawOrder).map(e=>e.teamId);
  return [...ordered,...state.teams.filter(t=>!ordered.includes(t.id)).map(t=>t.id)];
}
function assignment(state,teamId,round){
  if(!Number.isInteger(round)||round<1||round>10)throw Error('دور مسابقه معتبر نیست.');
  const saved=state.combinedSlots?.find(s=>s.teamId===teamId&&s.round===round);if(saved)return {...saved};
  const order=startOrder(state),index=order.indexOf(teamId);
  if(index<0||round>participantCount(state,'combined'))throw Error('تیم در فهرست ثابت عملیات ترکیبی نیست یا دور معتبر نیست.');
  const firstLane=index%2+1;
  return {teamId,round,drawOrder:index+1,athleteNumber:index+1+(round-1)*order.length,heat:Math.floor(index/2)+1,lane:round%2?firstLane:3-firstLane};
}
// Existing slots never move. New rounds and late teams use unoccupied numbers.
function ensureSchedule(state){
  state.combinedSlots??=[];if(!state.combinedStartOrder?.length)return;
  const base=state.combinedStartOrder,used=new Set(state.combinedSlots.map(s=>s.athleteNumber));
  let number=state.combinedSlots.reduce((n,s)=>Math.max(n,s.athleteNumber),0);
  const add=slot=>{state.combinedSlots.push(slot);used.add(slot.athleteNumber);number=Math.max(number,slot.athleteNumber);};
  for(const round of rounds(state))for(const [index,teamId]of base.entries()){
    if(state.combinedSlots.some(s=>s.teamId===teamId&&s.round===round))continue;
    const proposed=index+1+(round-1)*base.length,firstLane=index%2+1;
    add({teamId,round,drawOrder:index+1,athleteNumber:used.has(proposed)?number+1:proposed,heat:Math.floor(index/2)+1,lane:round%2?firstLane:3-firstLane,supplemental:false});
  }
  for(const team of state.teams.filter(t=>!base.includes(t.id))){
    const old=state.combinedSlots.find(s=>s.teamId===team.id);
    const heat=old?.heat??state.combinedSlots.reduce((n,s)=>Math.max(n,s.heat),0)+1;
    const turn=old?.drawOrder??state.combinedSlots.reduce((n,s)=>Math.max(n,s.drawOrder),0)+1;
    const firstLane=old?.lane??1;
    for(const round of rounds(state))if(!state.combinedSlots.some(s=>s.teamId===team.id&&s.round===round))add({teamId:team.id,round,drawOrder:turn,athleteNumber:++number,heat,lane:round%2?firstLane:3-firstLane,supplemental:true});
  }
}
function freezeSchedule(state){if(!state.combinedStartOrder.length)state.combinedStartOrder=startOrder(state);ensureSchedule(state);}
function combinedSummary(state,teamId){
 const config=discipline(state,'combined'),count=config?.participantCount??2,bestCount=config?.bestCount??2;
 const scores=state.roundScores.filter(s=>s.teamId===teamId&&s.round<=count);
 const selected=[...scores].sort((a,b)=>(a.rawMs+a.penaltyMs)-(b.rawMs+b.penaltyMs)||a.round-b.round).slice(0,bestCount);
 const status=!scores.length?'Pending':scores.length===count?'Completed':'Partial';
 const adjustment=state.results.find(r=>r.teamId===teamId&&r.disciplineId==='combined')?.legacyTeamPenaltyMs??0;
 return {count,bestCount,status,completed:scores.length,selectedRounds:status==='Completed'?selected.map(s=>s.round):[],
  selectedRawMs:status==='Completed'?selected.reduce((n,s)=>n+s.rawMs,0)/bestCount:null,
  selectedPenaltyMs:selected.length===bestCount?selected.reduce((n,s)=>n+s.penaltyMs,0)/bestCount+adjustment:adjustment,
  averageMs:status==='Completed'?selected.reduce((n,s)=>n+s.rawMs+s.penaltyMs,0)/bestCount+adjustment:null};
}
function completion(state,teamId){return combinedSummary(state,teamId).status;}
function individualLeaderboard(state){
 const teams=new Map(state.teams.map(t=>[t.id,t])),scores=new Map(state.roundScores.map(s=>[s.athleteId,s]));
 const rows=state.athletes.filter(a=>teams.has(a.teamId)&&a.round<=participantCount(state,'combined')).map(athlete=>{
  let slot;try{slot=assignment(state,athlete.teamId,athlete.round);}catch{slot={lane:null,heat:null,athleteNumber:null};}
  const score=scores.get(athlete.id);return {...slot,athlete,team:teams.get(athlete.teamId),result:score??null,finalValue:score?score.rawMs+score.penaltyMs:null,rank:null};
 }).sort((a,b)=>(a.finalValue??Infinity)-(b.finalValue??Infinity)||(a.athleteNumber??Infinity)-(b.athleteNumber??Infinity));
 let previous=null,rank=0;rows.forEach((row,index)=>{if(row.finalValue!==null){if(row.finalValue!==previous){rank=index+1;previous=row.finalValue;}row.rank=rank;}});return rows;
}
function migrateCombined(state){
 state.athletes??=[];state.roundScores??=[];state.combinedStartOrder??=[];state.combinedSlots??=[];
 state.nextAthleteId??=state.athletes.reduce((n,a)=>Math.max(n,a.id),0)+1;state.nextRoundScoreId??=state.roundScores.reduce((n,s)=>Math.max(n,s.id),0)+1;
 const keys=new Set(state.athletes.map(a=>`${a.teamId}:${a.round}`));
 for(const team of state.teams)for(const round of rounds(state))if(!keys.has(`${team.id}:${round}`)){
  const old=state.results.find(r=>r.teamId===team.id&&r.disciplineId==='combined');
  state.athletes.push({id:state.nextAthleteId++,teamId:team.id,round,name:round<=2?old?.[round===1?'athletePrimary':'athleteSecondary']??'':''});keys.add(`${team.id}:${round}`);
 }
 const oldResults=state.results.filter(r=>r.disciplineId==='combined'&&!Object.hasOwn(r,'completionStatus'));
 if(oldResults.length&&!state.combinedStartOrder.length)state.combinedStartOrder=startOrder(state);ensureSchedule(state);
 for(const old of oldResults){for(const round of [1,2]){
  const rawMs=old[round===1?'rawPrimaryMs':'rawSecondaryMs'];if(rawMs==null)continue;
  const athlete=state.athletes.find(a=>a.teamId===old.teamId&&a.round===round);
  state.roundScores.push({id:state.nextRoundScoreId++,athleteId:athlete.id,teamId:old.teamId,round,rawMs,penaltyMs:0,...assignment(state,old.teamId,round),note:old.note??'',judge:old.judge??'',updatedAt:old.updatedAt});
 }old.legacyTeamPenaltyMs=old.penaltyMs??0;old.completionStatus=completion(state,old.teamId);}
}
module.exports={rounds,startOrder,assignment,completion,combinedSummary,individualLeaderboard,migrateCombined,ensureSchedule,freezeSchedule};
