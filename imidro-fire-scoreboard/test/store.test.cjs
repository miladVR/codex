"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CompetitionStore } = require("../store.cjs");

test("store saves a draft, requires complete times, and publishes after approval", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "imidro-scoreboard-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new CompetitionStore(directory);
  store.addTeam({ name: "تیم آزمون", organization: "مجموعه آزمون" });

  assert.throws(() => store.saveResult({ teamId: 1, disciplineId: "water", rawPrimaryMs: null }), /زمان اصلی/);
  assert.throws(() => store.saveResult({ teamId: 1, disciplineId: "water", rawPrimaryMs: 0 }), /صفر/);
  let view = store.saveResult({ teamId: 1, disciplineId: "water", rawPrimaryMs: 72_340, penaltyMs: 5_000, judge: "داور یک" });
  assert.equal(view.results[0].status, "draft");
  assert.equal(view.standings[0].completed, 0);

  view = store.approveResult({ resultId: 1, approvedBy: "سرداور" });
  assert.equal(view.results[0].status, "approved");
  assert.equal(view.standings[0].disciplineRanks.water, 1);
  assert.ok(fs.existsSync(path.join(directory, "competition-data.json")));
  assert.ok(fs.readdirSync(path.join(directory, "backups")).length >= 1);
});
