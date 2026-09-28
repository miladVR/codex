"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { metric, buildStandings } = require("../scoring.cjs");

test("pair-time uses the average of both athletes plus penalty", () => {
  const result = { rawPrimaryMs: 60_000, rawSecondaryMs: 80_000, penaltyMs: 5_000 };
  assert.equal(metric(result, { mode: "pair_time" }), 75_000);
});

test("standings ignore drafts and rank completed teams by total rank", () => {
  const state = {
    disciplines: [{ id: "science", mode: "score" }, { id: "water", mode: "time" }],
    teams: [{ id: 1, name: "الف" }, { id: 2, name: "ب" }],
    results: [
      { teamId: 1, disciplineId: "science", status: "approved", scientificScore: 90, scientificDurationMs: 40_000 },
      { teamId: 2, disciplineId: "science", status: "approved", scientificScore: 80, scientificDurationMs: 30_000 },
      { teamId: 1, disciplineId: "water", status: "approved", rawPrimaryMs: 70_000, penaltyMs: 0 },
      { teamId: 2, disciplineId: "water", status: "draft", rawPrimaryMs: 60_000, penaltyMs: 0 }
    ]
  };
  const standings = buildStandings(state);
  assert.equal(standings[0].team.id, 1);
  assert.equal(standings[0].officialRank, 1);
  assert.equal(standings[1].officialRank, null);
});

test("equal metrics share a discipline rank", () => {
  const state = {
    disciplines: [{ id: "water", mode: "time" }],
    teams: [{ id: 1 }, { id: 2 }],
    results: [
      { teamId: 1, disciplineId: "water", status: "approved", rawPrimaryMs: 70_000, penaltyMs: 0 },
      { teamId: 2, disciplineId: "water", status: "approved", rawPrimaryMs: 68_000, penaltyMs: 2_000 }
    ]
  };
  const standings = buildStandings(state);
  assert.equal(standings[0].disciplineRanks.water, 1);
  assert.equal(standings[1].disciplineRanks.water, 1);
});
