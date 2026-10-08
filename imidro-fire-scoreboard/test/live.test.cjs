"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CompetitionStore } = require("../store.cjs");
function fixture(t, count = 3) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "imidro-live-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new CompetitionStore(directory);
  for (let i = 1; i <= count; i++) store.addTeam({ name: `تیم ${i}` });
  return { store, directory };
}
const manual = [{ teamId: 1, drawOrder: 3 }, { teamId: 2, drawOrder: 1 }, { teamId: 3, drawOrder: 2 }];
test("manual order is persisted and independent of live score order", t => {
  const { store, directory } = fixture(t);
  const draw = store.createDraw({ method: "manual", entries: manual }).draws[0];
  assert.equal(draw.method, "manual");
  assert.deepEqual(draw.entries.map(e => [e.teamId, e.drawOrder]), [[2, 1], [3, 2], [1, 3]]);
  store.saveResult({ teamId: 1, disciplineId: "water", rawPrimaryMs: 60000 });
  store.saveResult({ teamId: 2, disciplineId: "water", rawPrimaryMs: 70000 });
  let rows = store.view().itemLeaderboards.water;
  assert.deepEqual(rows.map(r => [r.team.id, r.rank, r.drawOrder]), [[1, 1, 3], [2, 2, 1], [3, null, 2]]);
  store.saveResult({ teamId: 2, disciplineId: "water", rawPrimaryMs: 50000 });
  rows = store.view().itemLeaderboards.water;
  assert.deepEqual(rows.map(r => [r.team.id, r.rank, r.drawOrder]), [[2, 1, 1], [1, 2, 3], [3, null, 2]]);
  assert.deepEqual(new CompetitionStore(directory).view(), store.view());
  assert.throws(() => store.createDraw({ replaceDrawId: draw.id }), /ثابت/);
  assert.throws(() => store.createDraw({ method: "manual", replaceDrawId: draw.id, entries: manual }), /ثابت/);
});
test("manual validation rejects duplicates, omissions, unknown teams and invalid orders atomically", t => {
  const { store } = fixture(t);
  const before = store.view();
  const invalid = [manual.slice(1), [...manual.slice(0, 2), { teamId: 3, drawOrder: 1 }],
    [...manual.slice(0, 2), { teamId: 3, drawOrder: 0 }], [...manual.slice(0, 2), { teamId: 3, drawOrder: 4 }],
    [...manual.slice(0, 2), { teamId: 3, drawOrder: 1.5 }], [...manual.slice(0, 2), { teamId: 999, drawOrder: 2 }],
    [...manual.slice(0, 2), { teamId: 1, drawOrder: 2 }]];
  for (const entries of invalid) {
    assert.throws(() => store.createDraw({ method: "manual", entries }));
    assert.deepEqual(store.view(), before);
  }
});
test("item-specific order overrides general and locks only its started scope", t => {
  const { store } = fixture(t);
  store.createDraw({ method: "manual", entries: manual });
  store.createDraw({ disciplineId: "water", method: "manual", entries: manual.map(e => ({ ...e, drawOrder: 4 - e.drawOrder })) });
  store.saveResult({ teamId: 1, disciplineId: "water", rawPrimaryMs: 70000 });
  assert.equal(store.view().itemLeaderboards.water.find(r => r.team.id === 1).drawOrder, 1);
  assert.equal(store.view().itemLeaderboards.height.find(r => r.team.id === 1).drawOrder, 3);
  assert.throws(() => store.createDraw({ disciplineId: "water" }), /ثابت/);
  assert.equal(store.createDraw({ disciplineId: "height" }).draws[0].disciplineId, "height");
});
test("drafts rank immediately while official ranks still require approval", t => {
  const { store } = fixture(t);
  store.saveResult({ teamId: 1, disciplineId: "scientific", scientificScore: 80 });
  store.saveResult({ teamId: 2, disciplineId: "scientific", scientificScore: 90, scientificDurationMs: 50000 });
  store.saveResult({ teamId: 3, disciplineId: "scientific", scientificScore: 90, scientificDurationMs: 40000 });
  assert.deepEqual(store.view().itemLeaderboards.scientific.map(r => [r.team.id, r.rank]), [[3, 1], [2, 2], [1, 3]]);
  assert.equal(store.view().standings[0].completed, 0);
  store.saveResult({ teamId: 1, disciplineId: "scientific", scientificScore: 95 });
  assert.equal(store.view().itemLeaderboards.scientific[0].team.id, 1);
  store.approveResult({ resultId: 1 });
  assert.equal(store.view().standings.find(r => r.team.id === 1).disciplineRanks.scientific, 1);
  store.reopenResult({ resultId: 1 });
  assert.equal(store.view().standings.find(r => r.team.id === 1).completed, 0);
  assert.equal(store.view().itemLeaderboards.scientific[0].team.id, 1);
});
test("paired average plus penalty, ties and total schema are recomputed on every save", t => {
  const { store } = fixture(t);
  store.createDraw({ method: "manual", entries: manual });
  for (let teamId = 1; teamId <= 3; teamId++) {
    for (const discipline of store.view().disciplines)
      store.saveResult({ teamId, disciplineId: discipline.id, scientificScore: teamId === 3 ? 80 : 90,
        rawPrimaryMs: teamId === 3 ? 80000 : 60000, rawSecondaryMs: 80000, penaltyMs: 5000 });
  }
  assert.deepEqual(store.view().liveStandings.map(r => r.officialRank), [1, 1, 3]);
  assert.deepEqual(store.view().standings.map(r => r.officialRank), [null, null, null]);
  const row = store.view().team_scores.find(r => r.team_id === 1);
  assert.equal(row.draw_order, 3); assert.equal(row.total_rank, 1); assert.equal(row.official_total_rank, null);
  assert.equal(row.item_scores.combined.final_value, 75000);
  assert.equal(row.item_scores.combined.status, "draft");
  assert.equal(row.item_scores.scientific.unit, "points");
  assert.throws(() => store.setDisplay({ mode: "item", disciplineId: "bad" }));
  store.setDisplay({ mode: "item", disciplineId: "combined" });
  assert.equal(store.view().settings.displayItemId, "combined");
});
test("v2 draw positions migrate without losing active display selection", t => {
  const { store, directory } = fixture(t);
  const view = store.createDraw({});
  store.setDisplay({ mode: "draw", drawId: view.draws[0].id });
  const legacy = JSON.parse(fs.readFileSync(store.dataPath));
  legacy.version = 2; delete legacy.revision;
  legacy.draws.forEach(draw => { delete draw.method; draw.entries.forEach(e => delete e.drawOrder); });
  fs.writeFileSync(store.dataPath, JSON.stringify(legacy));
  const restored = new CompetitionStore(directory).view();
  assert.equal(restored.version, 5);
  assert.deepEqual(restored.draws[0].entries.map(e => e.drawOrder), [1, 2, 3]);
  assert.equal(restored.settings.displayDrawId, view.draws[0].id);
});
test("failed durable write restores revision, orders and scores to committed state", t => {
  const { store, directory } = fixture(t);
  const before = store.view();
  const original = fs.renameSync;
  try {
    fs.renameSync = () => { throw new Error("isolated disk failure"); };
    assert.throws(() => store.createDraw({ method: "manual", entries: manual }), /disk failure/);
  } finally { fs.renameSync = original; }
  assert.deepEqual(store.view(), before);
  assert.deepEqual(new CompetitionStore(directory).view(), before);
});
