"use strict";
// Canonical athlete/round records; aggregate results are a compatibility projection.
function startOrder(state) {
  if (state.combinedStartOrder?.length) return state.combinedStartOrder;
  const draw = state.draws.find(d => d.disciplineId === "combined") ?? state.draws.find(d => d.disciplineId === "all");
  const ordered = (draw?.entries ?? []).filter(e => state.teams.some(t => t.id === e.teamId)).sort((a,b) => a.drawOrder-b.drawOrder).map(e => e.teamId);
  return [...ordered, ...state.teams.filter(t => !ordered.includes(t.id)).map(t => t.id)];
}
function assignment(state, teamId, round) {
  if (![1,2].includes(round)) throw new Error("دور مسابقه معتبر نیست.");
  const saved=state.combinedSlots?.find(slot=>slot.teamId===teamId && slot.round===round);
  if (saved) return {...saved};
  const order = startOrder(state), index = order.indexOf(teamId);
  if (index < 0 || ![1,2].includes(round)) throw new Error("تیم در فهرست ثابت عملیات ترکیبی نیست یا دور معتبر نیست.");
  const firstLane = index % 2 + 1;
  return { teamId, round, drawOrder: index + 1, athleteNumber: index + 1 + (round-1)*order.length,
    heat: Math.floor(index/2)+1, lane: round === 1 ? firstLane : 3-firstLane };
}
// Keep the original two-round numbers immutable, even when teams arrive late.
// Supplemental teams receive new, reserved groups and numbers after the base roster.
function ensureSchedule(state) {
  state.combinedSlots ??= [];
  if (!state.combinedStartOrder?.length) return;
  const base=state.combinedStartOrder;
  for (const [index,teamId] of base.entries()) for (const round of [1,2]) {
    if (!state.combinedSlots.some(s=>s.teamId===teamId && s.round===round)) {
      const firstLane=index%2+1;
      state.combinedSlots.push({teamId,round,drawOrder:index+1,athleteNumber:index+1+(round-1)*base.length,
        heat:Math.floor(index/2)+1,lane:round===1?firstLane:3-firstLane,supplemental:false});
    }
  }
  for (const team of state.teams) {
    if (state.combinedSlots.some(s=>s.teamId===team.id)) continue;
    const number=Math.max(0,...state.combinedSlots.map(s=>s.athleteNumber));
    const heat=Math.max(0,...state.combinedSlots.map(s=>s.heat))+1;
    const turn=Math.max(0,...state.combinedSlots.map(s=>s.drawOrder))+1;
    for (const round of [1,2]) state.combinedSlots.push({teamId:team.id,round,drawOrder:turn,
      athleteNumber:number+round,heat,lane:round,supplemental:true});
  }
}
function freezeSchedule(state) {
  if (!state.combinedStartOrder.length) state.combinedStartOrder=startOrder(state);
  ensureSchedule(state);
}
function completion(state, teamId) {
  const count = state.roundScores.filter(s => s.teamId === teamId).length;
  return count === 0 ? "Pending" : count === 2 ? "Completed" : "Partial";
}
function individualLeaderboard(state) {
  const rows = state.athletes.filter(a => state.teams.some(t => t.id === a.teamId)).map(athlete => {
    let slot; try { slot = assignment(state, athlete.teamId, athlete.round); } catch { slot = { lane:null, heat:null, athleteNumber:null }; }
    const score = state.roundScores.find(s => s.athleteId === athlete.id);
    return { ...slot, athlete, team:state.teams.find(t => t.id === athlete.teamId), result:score ?? null,
      finalValue:score ? score.rawMs+score.penaltyMs : null, rank:null };
  }).sort((a,b) => (a.finalValue ?? Infinity)-(b.finalValue ?? Infinity) || (a.athleteNumber ?? Infinity)-(b.athleteNumber ?? Infinity));
  let previous = null, rank = 0;
  rows.forEach((row,index) => { if (row.finalValue !== null) { if (row.finalValue !== previous) { rank=index+1; previous=row.finalValue; } row.rank=rank; } });
  return rows;
}
function migrateCombined(state) {
  state.athletes ??= []; state.roundScores ??= []; state.combinedStartOrder ??= []; state.combinedSlots ??= [];
  state.nextAthleteId ??= Math.max(0,...state.athletes.map(a=>a.id))+1;
  state.nextRoundScoreId ??= Math.max(0,...state.roundScores.map(s=>s.id))+1;
  for (const team of state.teams) for (const round of [1,2]) if (!state.athletes.some(a=>a.teamId===team.id && a.round===round)) {
    const old = state.results.find(r=>r.teamId===team.id && r.disciplineId==="combined");
    state.athletes.push({id:state.nextAthleteId++,teamId:team.id,round,name:old?.[round===1?"athletePrimary":"athleteSecondary"] ?? ""});
  }
  const oldResults=state.results.filter(r=>r.disciplineId==="combined" && !Object.hasOwn(r,"completionStatus"));
  if (oldResults.length && !state.combinedStartOrder.length) state.combinedStartOrder=startOrder(state);
  ensureSchedule(state);
  for (const old of oldResults) {
    for (const round of [1,2]) {
      const rawMs=old[round===1?"rawPrimaryMs":"rawSecondaryMs"];
      if (rawMs == null) continue;
      const athlete=state.athletes.find(a=>a.teamId===old.teamId && a.round===round);
      state.roundScores.push({id:state.nextRoundScoreId++,athleteId:athlete.id,teamId:old.teamId,round,rawMs,penaltyMs:0,
        ...assignment(state,old.teamId,round),note:old.note ?? "",judge:old.judge ?? "",updatedAt:old.updatedAt});
    }
    old.legacyTeamPenaltyMs=old.penaltyMs ?? 0;
    old.completionStatus=completion(state,old.teamId);
  }
}
module.exports={startOrder,assignment,completion,individualLeaderboard,migrateCombined,ensureSchedule,freezeSchedule};
