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

function buildStandings(state) {
  const ranks = new Map();
  for (const discipline of state.disciplines) {
    const rows = state.results
      .filter((result) => result.disciplineId === discipline.id && result.status === "approved" && metric(result, discipline) !== null)
      .sort((a, b) => compareResults(a, b, discipline));
    const disciplineRanks = new Map();
    let previousKey = null;
    let previousRank = 0;
    rows.forEach((result, index) => {
      const key = tieKey(result, discipline);
      if (key !== previousKey) {
        previousRank = index + 1;
        previousKey = key;
      }
      disciplineRanks.set(result.teamId, previousRank);
    });
    ranks.set(discipline.id, disciplineRanks);
  }

  const rows = state.teams.map((team) => {
    const disciplineRanks = Object.fromEntries(state.disciplines.map((discipline) => [discipline.id, ranks.get(discipline.id)?.get(team.id) ?? null]));
    const completedRanks = Object.values(disciplineRanks).filter(Number.isFinite);
    return {
      team,
      disciplineRanks,
      completed: completedRanks.length,
      total: completedRanks.reduce((sum, rank) => sum + rank, 0),
      officialRank: null
    };
  }).sort((a, b) => b.completed - a.completed || a.total - b.total || a.team.id - b.team.id);

  const completed = rows.filter((row) => row.completed === state.disciplines.length);
  let lastTotal = null;
  let lastRank = 0;
  completed.forEach((row, index) => {
    if (row.total !== lastTotal) {
      lastRank = index + 1;
      lastTotal = row.total;
    }
    row.officialRank = lastRank;
  });
  return rows;
}

function compareResults(a, b, discipline) {
  const av = metric(a, discipline);
  const bv = metric(b, discipline);
  if (discipline.mode === "score") {
    return bv - av || (a.scientificDurationMs ?? Infinity) - (b.scientificDurationMs ?? Infinity);
  }
  return av - bv;
}

function tieKey(result, discipline) {
  if (discipline.mode === "score") return `${metric(result, discipline)}:${result.scientificDurationMs ?? ""}`;
  return String(metric(result, discipline));
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

module.exports = { metric, buildStandings };
