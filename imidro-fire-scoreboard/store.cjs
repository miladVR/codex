"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomInt, randomUUID } = require("node:crypto");
const ORGANIZATION = "امور آموزش و توسعه شایستگی مجتمع مس سرچشمه رفسنجان";
const { buildStandings, buildItemLeaderboard } = require("./scoring.cjs");

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
    const standings = buildStandings(this.state);
    const liveStandings = buildStandings(this.state, { includeDrafts: true });
    const itemLeaderboards = Object.fromEntries(this.state.disciplines.map(item => [item.id, buildItemLeaderboard(this.state, item, { includeDrafts: true })]));
    const team_scores = liveStandings.map(row => ({ team_id: row.team.id, draw_order: row.drawOrder,
      total_rank: row.officialRank, official_total_rank: standings.find(official => official.team.id === row.team.id).officialRank,
      item_scores: Object.fromEntries(this.state.disciplines.map(item => {
        const entry = itemLeaderboards[item.id].find(itemRow => itemRow.team.id === row.team.id);
        return [item.id, { draw_order: entry.drawOrder, rank: entry.rank, final_value: entry.finalValue,
          raw_primary_ms: entry.result?.rawPrimaryMs ?? null, raw_secondary_ms: entry.result?.rawSecondaryMs ?? null,
          penalty_ms: entry.result?.penaltyMs ?? null, scientific_duration_ms: entry.result?.scientificDurationMs ?? null,
          status: entry.result?.status ?? "not_recorded", unit: item.mode === "score" ? "points" : "ms" }];
      })) }));
    return structuredClone({ ...this.state, standings, liveStandings, itemLeaderboards, team_scores });
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
    if (existing?.status === "approved") throw new Error("ابتدا نتیجه تأییدشده را برای اصلاح باز کنید.");
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
    if (result.status === "approved") return this.view();
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

  createDraw(payload = {}) {
    const scope = payload.disciplineId || "all";
    if (scope !== "all" && !this.state.disciplines.some(d => d.id === scope)) throw new Error("رشته قرعه‌کشی معتبر نیست.");
    if (this.state.teams.length < 2) throw new Error("برای قرعه‌کشی حداقل دو تیم ثبت کنید.");
    if (this.state.results.some(result => scope === "all" || result.disciplineId === scope))
      throw new Error("پس از شروع ثبت نتایج، نوبت اجرای این محدوده ثابت است و قابل تغییر نیست.");
    const previous = this.state.draws.find(d => d.disciplineId === scope);
    if (previous && payload.replaceDrawId !== previous.id) throw new Error("برای قرعه‌کشی مجدد، تأیید جایگزینی آخرین نوبت لازم است.");
    const method = payload.method ?? "auto";
    if (!["auto", "manual"].includes(method)) throw new Error("روش قرعه‌کشی معتبر نیست.");
    let entries = this.state.teams.map(team => ({ teamId: team.id, name: team.name, organization: team.organization, code: team.code }));
    if (method === "manual") {
      if (!Array.isArray(payload.entries) || payload.entries.length !== entries.length) throw new Error("نوبت همه تیم‌ها را وارد کنید.");
      const orders = new Map(); const used = new Set();
      for (const entry of payload.entries) {
        const teamId = integer(entry.teamId), order = integer(entry.drawOrder);
        if (!entries.some(team => team.teamId === teamId) || orders.has(teamId)) throw new Error("فهرست تیم‌های نوبت دستی معتبر نیست.");
        if (order < 1 || order > entries.length || used.has(order)) throw new Error("شماره نوبت باید یکتا و از ۱ تا تعداد تیم‌ها باشد.");
        orders.set(teamId, order); used.add(order);
      }
      entries = entries.map(entry => ({ ...entry, drawOrder: orders.get(entry.teamId) })).sort((a, b) => a.drawOrder - b.drawOrder);
    } else {
      for (let i = entries.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [entries[i], entries[j]] = [entries[j], entries[i]];
      }
      entries = entries.map((entry, index) => ({ ...entry, drawOrder: index + 1 }));
    }
    const draw = { id: randomUUID(), disciplineId: scope, method, createdAt: new Date().toISOString(), entries,
      title: scope === "all" ? "ترتیب عمومی تیم‌ها" : this.state.disciplines.find(d => d.id === scope).name };
    this.state.draws.unshift(draw);
    this.#audit("create_draw", `قرعه‌کشی «${draw.title}» برای ${entries.length} تیم ثبت شد.`);
    this.#persist();
    return this.view();
  }

  setDisplay(payload) {
    if (!["standings", "draw", "item"].includes(payload.mode)) throw new Error("حالت نمایش معتبر نیست.");
    if (payload.mode === "draw" && !this.state.draws.some(d => d.id === payload.drawId)) throw new Error("قرعه‌کشی پیدا نشد.");
    if (payload.mode === "item" && !this.state.disciplines.some(item => item.id === payload.disciplineId)) throw new Error("رشته نمایش معتبر نیست.");
    this.state.settings.displayItemId = payload.mode === "item" ? payload.disciplineId : null;
    this.state.settings.displayMode = payload.mode;
    this.state.settings.displayDrawId = payload.mode === "draw" ? payload.drawId : null;
    this.#persist();
    return this.view();
  }

  updateSettings(payload) {
    this.state.settings = {
      ...this.state.settings,
      competitionName: clean(payload.competitionName || this.state.settings.competitionName, 180),
      venue: clean(payload.venue || "", 180),
      audioEnabled: payload.audioEnabled === undefined ? this.state.settings.audioEnabled : Boolean(payload.audioEnabled),
      audioVolume: boundedNumber(payload.audioVolume ?? this.state.settings.audioVolume ?? 45, 0, 100, "بلندی صدا"),
      autoRotate: payload.autoRotate === undefined ? this.state.settings.autoRotate : Boolean(payload.autoRotate),
      displayMessage: clean(payload.displayMessage || "", 220)
    };
    this.#audit("settings", "تنظیمات نمایش مسابقه به‌روزرسانی شد.");
    this.#persist();
    return this.view();
  }

  exportSnapshot(targetPath) {
    fs.writeFileSync(targetPath, JSON.stringify({ ...this.state, organizationCredit: ORGANIZATION }, null, 2), "utf8");
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
      parsed.draws ??= [];
      parsed.draws = parsed.draws.map(draw => ({ ...draw, method: draw.method ?? "auto",
        entries: draw.entries.map((entry, index) => ({ ...entry, drawOrder: entry.drawOrder ?? index + 1 })) }));
      parsed.revision ??= 0;
      parsed.settings = { audioVolume: 45, autoRotate: true, displayMode: "standings", displayDrawId: null, displayItemId: null, ...parsed.settings };
      if (parsed.settings.displayMessage === "نتایج رسمی پس از تأیید سرداور نمایش داده می‌شوند.")
        parsed.settings.displayMessage = "نتایج زنده تا تأیید سرداور موقت هستند؛ نوبت اجرا با رتبه متفاوت است.";
      parsed.version = 3;
      parsed.organizationCredit = ORGANIZATION;
      return parsed;
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error("فایل داده خوانده نشد؛ برای حفظ اطلاعات از نسخه پشتیبان استفاده کنید.", { cause: error });
      const initial = {
        version: 3,
        revision: 0,
        organizationCredit: ORGANIZATION,
        draws: [],
        settings: {
          competitionName: "سومین دوره مسابقات علمی و عملیاتی آتش‌نشانان ایمیدرو",
          venue: "مجتمع مس سرچشمه رفسنجان · ۱۴۰۵",
          audioEnabled: true,
          audioVolume: 45, autoRotate: true, displayMode: "standings", displayDrawId: null, displayItemId: null,
          displayMessage: "نتایج زنده تا تأیید سرداور موقت هستند؛ نوبت اجرا با رتبه متفاوت است."
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
    this.state.revision += 1;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2), "utf8");
      fs.renameSync(tempPath, this.dataPath);
    } catch (error) {
      // Restore the last durable state: no phantom mutation can be broadcast later.
      if (fs.existsSync(this.dataPath)) this.state = this.#read();
      throw error;
    }
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

module.exports = { CompetitionStore, DEFAULT_DISCIPLINES, ORGANIZATION };
