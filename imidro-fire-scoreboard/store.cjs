"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildStandings } = require("./scoring.cjs");

const DEFAULT_DISCIPLINES = [
  { id: "scientific", name: "آزمون علمی", mode: "score", position: 1 },
  { id: "combined", name: "عملیات ترکیبی", mode: "pair_time", position: 2 },
  { id: "water", name: "آبرسانی", mode: "time", position: 3 },
  { id: "rescue_skill", name: "امدادی مهارت‌محور", mode: "time", position: 4 },
  { id: "height", name: "نجات از ارتفاع", mode: "time", position: 5 }
];

class CompetitionStore {
  constructor(userDataPath) {
    this.dataPath = path.join(userDataPath, "competition-data.json");
    this.backupPath = path.join(userDataPath, "backups");
    fs.mkdirSync(this.backupPath, { recursive: true });
    this.state = this.#read();
  }

  view() {
    return structuredClone({ ...this.state, standings: buildStandings(this.state) });
  }

  addTeam(payload) {
    const name = clean(payload.name, 100);
    const organization = clean(payload.organization, 150);
    if (!name) throw new Error("نام تیم الزامی است.");
    if (this.state.teams.some((team) => team.name === name)) throw new Error("این نام تیم قبلاً ثبت شده است.");
    const team = { id: this.state.nextTeamId++, code: `T${String(this.state.nextTeamId - 1).padStart(2, "0")}`, name, organization };
    this.state.teams.push(team);
    this.#audit("create_team", `تیم «${name}» افزوده شد.`);
    this.#persist();
    return this.view();
  }

  saveResult(payload) {
    const teamId = integer(payload.teamId);
    const discipline = this.state.disciplines.find((item) => item.id === payload.disciplineId);
    if (!this.state.teams.some((team) => team.id === teamId) || !discipline) throw new Error("تیم یا رشته معتبر نیست.");
    const rawPrimaryMs = optionalDuration(payload.rawPrimaryMs);
    const rawSecondaryMs = optionalDuration(payload.rawSecondaryMs);
    const scientificDurationMs = optionalDuration(payload.scientificDurationMs);
    const scientificScore = payload.scientificScore === null || payload.scientificScore === "" || payload.scientificScore === undefined ? null : boundedNumber(payload.scientificScore, 0, 100, "امتیاز علمی");
    if (discipline.mode !== "score" && rawPrimaryMs === null) throw new Error("زمان اصلی انتخاب نشده است.");
    if (discipline.mode !== "score" && rawPrimaryMs === 0) throw new Error("زمان اصلی نمی‌تواند صفر باشد.");
    if (discipline.mode === "pair_time" && rawSecondaryMs === null) throw new Error("زمان نفر دوم انتخاب نشده است.");
    if (discipline.mode === "pair_time" && rawSecondaryMs === 0) throw new Error("زمان نفر دوم نمی‌تواند صفر باشد.");
    if (discipline.mode === "score" && scientificDurationMs === 0) throw new Error("زمان پاسخ‌گویی نمی‌تواند صفر باشد.");
    if (discipline.mode === "score" && scientificScore === null) throw new Error("امتیاز علمی وارد نشده است.");
    const now = new Date().toISOString();
    const existing = this.state.results.find((result) => result.teamId === teamId && result.disciplineId === discipline.id);
    const record = {
      id: existing?.id ?? this.state.nextResultId++,
      teamId,
      disciplineId: discipline.id,
      athletePrimary: clean(payload.athletePrimary, 100),
      athleteSecondary: clean(payload.athleteSecondary, 100),
      rawPrimaryMs,
      rawSecondaryMs,
      penaltyMs: Math.round(boundedNumber(payload.penaltyMs ?? 0, 0, 3_600_000, "جریمه")),
      scientificScore,
      scientificDurationMs,
      note: clean(payload.note, 1000),
      status: "draft",
      judge: clean(payload.judge || "داور مسابقه", 100),
      approvedBy: "",
      approvedAt: null,
      updatedAt: now
    };
    if (existing) Object.assign(existing, record); else this.state.results.push(record);
    this.#audit("save_result", `نتیجه ${discipline.name} برای تیم ${this.#teamName(teamId)} ذخیره شد.`);
    this.#persist();
    return this.view();
  }

  approveResult(payload) {
    const result = this.#result(payload.resultId);
    result.status = "approved";
    result.approvedBy = clean(payload.approvedBy || "سرداور", 100);
    result.approvedAt = new Date().toISOString();
    result.updatedAt = result.approvedAt;
    this.#audit("approve_result", `نتیجه شماره ${result.id} تأیید و قفل شد.`);
    this.#persist();
    return this.view();
  }

  reopenResult(payload) {
    const result = this.#result(payload.resultId);
    result.status = "draft";
    result.approvedBy = "";
    result.approvedAt = null;
    result.updatedAt = new Date().toISOString();
    this.#audit("reopen_result", `نتیجه شماره ${result.id} برای اصلاح باز شد.`);
    this.#persist();
    return this.view();
  }

  updateSettings(payload) {
    this.state.settings = {
      ...this.state.settings,
      competitionName: clean(payload.competitionName || this.state.settings.competitionName, 180),
      venue: clean(payload.venue || "", 180),
      audioEnabled: Boolean(payload.audioEnabled),
      displayMessage: clean(payload.displayMessage || "", 220)
    };
    this.#audit("settings", "تنظیمات نمایش مسابقه به‌روزرسانی شد.");
    this.#persist();
    return this.view();
  }

  exportSnapshot(targetPath) {
    fs.copyFileSync(this.dataPath, targetPath);
  }

  #result(id) {
    const result = this.state.results.find((item) => item.id === integer(id));
    if (!result) throw new Error("نتیجه پیدا نشد.");
    return result;
  }

  #teamName(id) {
    return this.state.teams.find((team) => team.id === id)?.name ?? `#${id}`;
  }

  #audit(action, summary) {
    this.state.audits.unshift({ id: this.state.nextAuditId++, action, summary, createdAt: new Date().toISOString() });
    this.state.audits = this.state.audits.slice(0, 300);
  }

  #read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.dataPath, "utf8"));
      if (!Array.isArray(parsed.teams) || !Array.isArray(parsed.results)) throw new Error("invalid data");
      return parsed;
    } catch {
      const initial = {
        version: 1,
        settings: {
          competitionName: "سومین دوره مسابقات علمی و عملیاتی آتش‌نشانان ایمیدرو",
          venue: "مجتمع مس سرچشمه رفسنجان · ۱۴۰۵",
          audioEnabled: true,
          displayMessage: "نتایج رسمی پس از تأیید سرداور نمایش داده می‌شوند."
        },
        disciplines: DEFAULT_DISCIPLINES,
        teams: [],
        results: [],
        audits: [],
        nextTeamId: 1,
        nextResultId: 1,
        nextAuditId: 1
      };
      this.state = initial;
      this.#persist();
      return initial;
    }
  }

  #persist() {
    const tempPath = `${this.dataPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2), "utf8");
    fs.renameSync(tempPath, this.dataPath);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(this.dataPath, path.join(this.backupPath, `backup-${stamp}.json`));
    const backups = fs.readdirSync(this.backupPath).filter((name) => name.endsWith(".json")).sort().reverse();
    backups.slice(25).forEach((name) => fs.unlinkSync(path.join(this.backupPath, name)));
  }
}

function clean(value, maxLength) { return String(value ?? "").trim().slice(0, maxLength); }
function integer(value) { const number = Number(value); if (!Number.isInteger(number)) throw new Error("شناسه نامعتبر است."); return number; }
function optionalDuration(value) { if (value === null || value === "" || value === undefined) return null; return Math.round(boundedNumber(value, 0, 5_999_990, "زمان")); }
function boundedNumber(value, min, max, label) { const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} نامعتبر است.`); return number; }

module.exports = { CompetitionStore, DEFAULT_DISCIPLINES };
