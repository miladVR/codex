"use strict";

function metric(result, discipline) {
  if (!result || !discipline) return null;
  if (discipline.mode === "score") return finiteOrNull(result.scientificScore);
  const primary = finiteOrNull(result.rawPrimaryMs);
  if (primary === null) return null;
  const penalty = finiteOrNull(result.penaltyMs) ?? 0;
  if (discipline.mode === "pair_time") {
    const secondary = finiteOrNull(result.rawSecondaryMs);
    return secondary === null ? null : (primary + secondary) / 2 + penalty;
  }
  return primary + penalty;
}

// Explicit item draw wins; general order is a fallback, never a scoring input.
function drawOrder(state, teamId, disciplineId = "all") {
  const scopes = disciplineId === "all" ? ["all"] : [disciplineId, "all"];
  for (const scope of scopes) {
    const draw = (state.draws ?? []).find(item => item.disciplineId === scope);
    const index = draw?.entries.findIndex(entry => entry.teamId === teamId) ?? -1;
    if (index >= 0) return draw.entries[index].drawOrder ?? index + 1;
  }
  return null;
}

function buildItemLeaderboard(state, discipline, { includeDrafts = false } = {}) {
  const eligible = state.results.filter(result => result.disciplineId === discipline.id &&
    (result.status === "approved" || (includeDrafts && result.status === "draft")) && metric(result, discipline) !== null);
  eligible.sort((a, b) => compareResults(a, b, discipline) || a.teamId - b.teamId);
  const ranked = new Map();
  let previousKey = null;
  let previousRank = 0;
  eligible.forEach((result, index) => {
    const key = tieKey(result, discipline);
    if (key !== previousKey) { previousRank = index + 1; previousKey = key; }
    ranked.set(result.teamId, { rank: previousRank, result, finalValue: metric(result, discipline) });
  });
  return state.teams.map(team => ({
    team,
    drawOrder: drawOrder(state, team.id, discipline.id),
    rank: ranked.get(team.id)?.rank ?? null,
    result: ranked.get(team.id)?.result ?? null,
    finalValue: ranked.get(team.id)?.finalValue ?? null
  })).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
    (a.drawOrder ?? Infinity) - (b.drawOrder ?? Infinity) || a.team.id - b.team.id);
}

function buildStandings(state, options = {}) {
  const ranks = new Map(state.disciplines.map(discipline => [discipline.id,
    new Map(buildItemLeaderboard(state, discipline, options).map(row => [row.team.id, row.rank]))]));
  const rows = state.teams.map(team => {
    const disciplineRanks = Object.fromEntries(state.disciplines.map(discipline => [discipline.id, ranks.get(discipline.id)?.get(team.id) ?? null]));
    const completedRanks = Object.values(disciplineRanks).filter(Number.isFinite);
    return { team, drawOrder: drawOrder(state, team.id), disciplineRanks, completed: completedRanks.length,
      total: completedRanks.reduce((sum, rank) => sum + rank, 0), officialRank: null };
  }).sort((a, b) => b.completed - a.completed || a.total - b.total || a.team.id - b.team.id);
  let lastTotal = null;
  let lastRank = 0;
  rows.filter(row => row.completed === state.disciplines.length).forEach((row, index) => {
    if (row.total !== lastTotal) { lastRank = index + 1; lastTotal = row.total; }
    row.officialRank = lastRank;
  });
  return rows;
}

function compareResults(a, b, discipline) {
  const av = metric(a, discipline), bv = metric(b, discipline);
  if (discipline.mode === "score") return bv - av || (a.scientificDurationMs ?? Infinity) - (b.scientificDurationMs ?? Infinity);
  return av - bv;
}
function tieKey(result, discipline) {
  if (discipline.mode === "score") return `${metric(result, discipline)}:${result.scientificDurationMs ?? ""}`;
  return String(metric(result, discipline));
}
function finiteOrNull(value) { return Number.isFinite(value) ? Number(value) : null; }
module.exports = { metric, drawOrder, buildItemLeaderboard, buildStandings };
