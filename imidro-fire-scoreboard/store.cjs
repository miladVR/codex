"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomInt, randomUUID } = require("node:crypto");
const ORGANIZATION = "امور آموزش و توسعه شایستگی مجتمع مس سرچشمه رفسنجان";
const { startOrder, assignment, completion, individualLeaderboard, migrateCombined } = require("./combined.cjs");
const { validateLogo } = require("./branding.cjs");
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
    this.resetBackupPath = path.join(userDataPath, "reset-backups");
    // Finish removal after an interrupted reset; these backups must never resurface.
    fs.rmSync(this.resetBackupPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    fs.mkdirSync(this.backupPath, { recursive: true });
    this.deletionChallenges = new Map();
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
    const combinedTeams = this.state.teams.map(team => ({ teamId:team.id, status:completion(this.state,team.id),
      rounds:[1,2].map(round => { let slot; try { slot=assignment(this.state,team.id,round); } catch { slot=null; }
        return { ...slot, athlete:this.state.athletes.find(a=>a.teamId===team.id && a.round===round),
          score:this.state.roundScores.find(s=>s.teamId===team.id && s.round===round) ?? null }; }) }));
    return structuredClone({ ...this.state, eventConfig:this.state.settings, standings, liveStandings, itemLeaderboards, team_scores,
      combinedTeams, individualLeaderboard:individualLeaderboard(this.state) });
  }

  addTeam(payload) {
    const name = clean(payload.name, 100);
    const organization = clean(payload.organization, 150);
    if (!name) throw new Error("نام تیم الزامی است.");
    if (this.state.teams.some((team) => team.name === name)) throw new Error("این نام تیم قبلاً ثبت شده است.");
    const team = { id: this.state.nextTeamId++, code: `T${String(this.state.nextTeamId - 1).padStart(2, "0")}`, name, organization };
    this.state.teams.push(team);
    for (const round of [1,2]) this.state.athletes.push({id:this.state.nextAthleteId++,teamId:team.id,round,
      name:clean(payload[round===1?"athletePrimary":"athleteSecondary"],100)});
    this.#audit("create_team", `تیم «${name}» افزوده شد.`);
    this.#persist();
    return this.view();
  }

  saveResult(payload) {
    const teamId = integer(payload.teamId);
    const discipline = this.state.disciplines.find((item) => item.id === payload.disciplineId);
    if (!this.state.teams.some((team) => team.id === teamId) || !discipline) throw new Error("تیم یا رشته معتبر نیست.");
    if (discipline.mode === "pair_time") return this.saveCombinedPair(payload);
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
    for (const field of ["athletePrimary","athleteSecondary"]) if (existing?.[field] && payload[field] === "") throw new Error("پاک‌کردن نام ورزشکار باید با حذف دومرحله‌ای انجام شود.");
    if (existing?.penaltyMs>0 && Number(payload.penaltyMs ?? 0)===0) throw new Error("پاک‌کردن جریمه باید با حذف دومرحله‌ای انجام شود.");
    const record = {
      id: existing?.id ?? this.state.nextResultId++,
      teamId,
      disciplineId: discipline.id,
      athletePrimary: clean(payload.athletePrimary ?? existing?.athletePrimary, 100),
      athleteSecondary: clean(payload.athleteSecondary ?? existing?.athleteSecondary, 100),
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
    if (result.disciplineId === "combined" && result.completionStatus !== "Completed") throw new Error("تأیید تیمی فقط پس از ثبت هر دو ورزشکار مجاز است.");
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

  saveRoundScore(payload) {
    const teamId=integer(payload.teamId), round=integer(payload.round);
    if (!this.state.teams.some(t=>t.id===teamId) || ![1,2].includes(round)) throw new Error("تیم یا دور معتبر نیست.");
    const result=this.state.results.find(r=>r.teamId===teamId && r.disciplineId==="combined");
    if (result?.status==="approved") throw new Error("ابتدا نتیجه تأییدشده را برای اصلاح باز کنید.");
    if (payload.expectedRevision != null && payload.expectedRevision !== this.state.revision) throw new Error("داده تغییر کرده است؛ فرم را دوباره باز کنید.");
    const slot=assignment(this.state,teamId,round);
    if (payload.lane != null && integer(payload.lane)!==slot.lane) throw new Error("لاین با نوبت استاندارد مغایرت دارد؛ دور دوم باید لاین مخالف باشد.");
    const rawMs=optionalDuration(payload.rawMs);
    if (rawMs===null || rawMs===0) throw new Error("زمان همین ورزشکار باید کامل و بزرگ‌تر از صفر باشد.");
    const penaltyMs=Math.round(boundedNumber(payload.penaltyMs ?? 0,0,3600000,"جریمه ورزشکار"));
    const athlete=this.state.athletes.find(a=>a.teamId===teamId && a.round===round);
    const oldScore=this.state.roundScores.find(s=>s.athleteId===athlete.id);
    if (oldScore?.penaltyMs>0 && penaltyMs===0) throw new Error("پاک‌کردن جریمه باید با حذف دومرحله‌ای انجام شود.");
    const name=payload.athleteName===undefined ? athlete.name : clean(payload.athleteName,100);
    if (athlete.name && !name) throw new Error("پاک‌کردن نام ورزشکار باید از حذف دومرحله‌ای انجام شود.");
    if (!this.state.combinedStartOrder.length) this.state.combinedStartOrder=startOrder(this.state);
    athlete.name=name;
    this.#writeRound(teamId,round,rawMs,penaltyMs,payload);
    this.#syncCombined(teamId);
    this.#audit("save_round",`رکورد ورزشکار دور ${round} تیم ${this.#teamName(teamId)} در لاین ${slot.lane} ثبت شد.`);
    this.#persist(); return this.view();
  }

  // Compatibility for old complete-pair API clients. New UI only uses saveRoundScore.
  saveCombinedPair(payload) {
    const teamId=integer(payload.teamId);
    const existing=this.state.results.find(r=>r.teamId===teamId && r.disciplineId==="combined");
    if (existing?.status==="approved") throw new Error("ابتدا نتیجه تأییدشده را برای اصلاح باز کنید.");
    const first=optionalDuration(payload.rawPrimaryMs), second=optionalDuration(payload.rawSecondaryMs);
    if (!first || !second) throw new Error("برای ثبت مرحله‌ای از فرم مستقل هر ورزشکار استفاده کنید.");
    const legacyPenalty=Math.round(boundedNumber(payload.penaltyMs ?? 0,0,3600000,"جریمه مشترک"));
    if (this.state.roundScores.some(score=>score.teamId===teamId && score.penaltyMs>0) || (existing?.legacyTeamPenaltyMs>0 && legacyPenalty===0)) throw new Error("برای تغییر رکورد دارای جریمه از ثبت مستقل و برای حذف جریمه از تأیید دومرحله‌ای استفاده کنید.");
    assignment(this.state,teamId,1);
    if (!this.state.combinedStartOrder.length) this.state.combinedStartOrder=startOrder(this.state);
    for (const round of [1,2]) {
      const athlete=this.state.athletes.find(a=>a.teamId===teamId && a.round===round);
      const supplied=payload[round===1?"athletePrimary":"athleteSecondary"];
      if (supplied) athlete.name=clean(supplied,100);
      this.#writeRound(teamId,round,round===1?first:second,0,payload);
    }
    this.#syncCombined(teamId,legacyPenalty);
    this.#audit("save_result",`نتیجه کامل عملیات ترکیبی تیم ${this.#teamName(teamId)} ثبت شد.`);
    this.#persist(); return this.view();
  }

  #writeRound(teamId,round,rawMs,penaltyMs,payload) {
    const athlete=this.state.athletes.find(a=>a.teamId===teamId && a.round===round);
    const old=this.state.roundScores.find(s=>s.athleteId===athlete.id);
    const score={id:old?.id ?? this.state.nextRoundScoreId++,athleteId:athlete.id,...assignment(this.state,teamId,round),
      rawMs,penaltyMs,note:clean(payload.note,1000),judge:clean(payload.judge || "داور مسابقه",100),updatedAt:new Date().toISOString()};
    if (old) Object.assign(old,score); else this.state.roundScores.push(score);
  }

  #syncCombined(teamId,legacyPenalty) {
    const old=this.state.results.find(r=>r.teamId===teamId && r.disciplineId==="combined");
    const scores=[1,2].map(round=>this.state.roundScores.find(s=>s.teamId===teamId && s.round===round));
    if (!scores.some(Boolean)) { this.state.results=this.state.results.filter(r=>r!==old); return; }
    const adjustment=legacyPenalty ?? old?.legacyTeamPenaltyMs ?? 0;
    const record={id:old?.id ?? this.state.nextResultId++,teamId,disciplineId:"combined",
      athletePrimary:this.state.athletes.find(a=>a.teamId===teamId && a.round===1)?.name ?? "",
      athleteSecondary:this.state.athletes.find(a=>a.teamId===teamId && a.round===2)?.name ?? "",
      rawPrimaryMs:scores[0]?.rawMs ?? null,rawSecondaryMs:scores[1]?.rawMs ?? null,
      penaltyMs:(scores.reduce((sum,s)=>sum+(s?.penaltyMs ?? 0),0)/2)+adjustment,legacyTeamPenaltyMs:adjustment,
      roundPenalties:scores.map(s=>s?.penaltyMs ?? null),completionStatus:completion(this.state,teamId),
      scientificScore:null,scientificDurationMs:null,status:"draft",approvedBy:"",approvedAt:null,
      judge:scores.filter(Boolean).at(-1)?.judge ?? "",note:scores.map(s=>s?.note ?? "").filter(Boolean).join(" | "),updatedAt:new Date().toISOString()};
    if (old) Object.assign(old,record); else this.state.results.push(record);
  }

  prepareDeletion(payload) {
    const kind=payload.kind, id=kind==="reset" ? null : integer(payload.id); let summary;
    if (kind==="reset") {
      summary=`پاک‌سازی کامل و غیرقابل برگشت: ${this.state.teams.length} تیم، ${this.state.athletes.length} ورزشکار، ${this.state.results.length} نتیجه، ${this.state.roundScores.length} رکورد دور، ${this.state.draws.length} قرعه و ${this.state.audits.length} سابقه؛ همه زمان‌ها و جریمه‌ها، لوگوهای سفارشی و پشتیبان‌های خودکار داخلی پاک می‌شوند. عنوان، تاریخ، محل، پیام و صدا به تنظیمات اولیه برمی‌گردند. فایل‌های PDF و پشتیبان‌هایی که خودتان بیرون از برنامه ذخیره کرده‌اید پاک نمی‌شوند.`;
    } else if (kind==="team") {
      const team=this.state.teams.find(t=>t.id===id); if (!team) throw new Error("تیم پیدا نشد.");
      summary=`تیم ${team.name}؛ دو ورزشکار و ${this.state.results.filter(r=>r.teamId===id).length} نتیجه و تمام رکوردهای انفرادی آن حذف می‌شوند.`;
    } else if (kind==="result") {
      const result=this.#result(id);
      summary=`ورزشکاران ${result.athletePrimary || "—"} / ${result.athleteSecondary || "—"}؛ نتیجه ${this.state.disciplines.find(d=>d.id===result.disciplineId).name} تیم ${this.#teamName(result.teamId)}؛ زمان‌ها ${result.rawPrimaryMs ?? "—"} / ${result.rawSecondaryMs ?? "—"} میلی‌ثانیه؛ جریمه ${result.penaltyMs}؛ نمره ${result.scientificScore ?? "—"}`;
    } else if (kind==="round") {
      const score=this.state.roundScores.find(s=>s.id===id); if (!score) throw new Error("رکورد ورزشکار پیدا نشد.");
      summary=`رکورد ${this.state.athletes.find(a=>a.id===score.athleteId).name || "ورزشکار"} تیم ${this.#teamName(score.teamId)} دور ${score.round}؛ زمان ${score.rawMs} و جریمه ${score.penaltyMs} میلی‌ثانیه`;
    } else if (kind==="round_penalty" || kind==="result_penalty") {
      const score=kind==="round_penalty" ? this.state.roundScores.find(s=>s.id===id) : this.#result(id);
      if (!score) throw new Error("رکورد پیدا نشد.");
      const amount=kind==="result_penalty" && score.disciplineId==="combined" ? score.legacyTeamPenaltyMs : score.penaltyMs;
      if (!amount) throw new Error("جریمه‌ای برای حذف وجود ندارد.");
      summary=`فقط جریمه ${amount} میلی‌ثانیه تیم ${this.#teamName(score.teamId)}${score.round ? ` دور ${score.round}` : ""} پاک می‌شود؛ زمان و نام حفظ می‌شوند و نتیجه موقت خواهد شد.`;
    } else if (kind==="athlete") {
      const athlete=this.state.athletes.find(a=>a.id===id); if (!athlete) throw new Error("ورزشکار پیدا نشد.");
      const score=this.state.roundScores.find(s=>s.athleteId===id);
      summary=`نام ${athlete.name || "ورزشکار بدون نام"} تیم ${this.#teamName(athlete.teamId)} دور ${athlete.round} و رکورد ${score?.rawMs ?? "—"} و جریمه ${score?.penaltyMs ?? "—"} میلی‌ثانیه پاک می‌شود؛ جایگاه ورزشکار باقی می‌ماند.`;
    } else throw new Error("نوع حذف معتبر نیست.");
    this.deletionChallenges.clear(); // only one reviewed operation at a time
    const token=randomUUID(), now=Date.now();
    this.deletionChallenges.set(token,{kind,id,summary,revision:this.state.revision,readyAt:now+2000,expiresAt:now+120000});
    return {token,summary,waitMs:2000};
  }

  confirmDeletion(payload) {
    const challenge=this.deletionChallenges.get(payload.token);
    if (!challenge || Date.now()>challenge.expiresAt) throw new Error("تأیید حذف منقضی شده است؛ دوباره آغاز کنید.");
    if (Date.now()<challenge.readyAt || payload.confirmation!=="تایید") throw new Error("دو ثانیه صبر کنید و کلمه تایید را دقیق وارد کنید.");
    this.deletionChallenges.delete(payload.token);
    if (challenge.revision!==this.state.revision) throw new Error("داده از زمان بررسی تغییر کرده است؛ حذف را دوباره بررسی کنید.");
    const {kind,id}=challenge;
    if (kind==="reset") return this.#resetAll();
    if (kind==="team") {
      this.state.teams=this.state.teams.filter(t=>t.id!==id);
      this.state.athletes=this.state.athletes.filter(a=>a.teamId!==id);
      this.state.roundScores=this.state.roundScores.filter(s=>s.teamId!==id);
      this.state.results=this.state.results.filter(r=>r.teamId!==id);
      // Frozen start slots and historical draw snapshots deliberately stay for audit.
    } else if (kind==="result") {
      const result=this.#result(id);
      if (result.disciplineId==="combined") this.state.roundScores=this.state.roundScores.filter(s=>s.teamId!==result.teamId);
      this.state.results=this.state.results.filter(r=>r.id!==id);
    } else if (kind==="round_penalty") {
      const score=this.state.roundScores.find(s=>s.id===id);score.penaltyMs=0;score.updatedAt=new Date().toISOString();this.#syncCombined(score.teamId);
    } else if (kind==="result_penalty") {
      const result=this.#result(id);
      if (result.disciplineId==="combined") this.#syncCombined(result.teamId,0);
      else {result.penaltyMs=0;result.status="draft";result.approvedAt=null;result.approvedBy="";result.updatedAt=new Date().toISOString();}
    } else {
      const score=kind==="round" ? this.state.roundScores.find(s=>s.id===id) : null;
      const athlete=this.state.athletes.find(a=>a.id===(score?.athleteId ?? id));
      if (kind==="athlete") athlete.name="";
      this.state.roundScores=this.state.roundScores.filter(s=>s.athleteId!==athlete.id);
      this.#syncCombined(athlete.teamId);
    }
    this.#audit("delete_"+kind,challenge.summary);
    this.#persist(); return this.view();
  }

  #resetAll() {
    const previous=this.state;
    const fresh=this.#initialState();
    fresh.revision=previous.revision+1; // Keep IPC ordering monotonic across the reset.
    fresh.resetId=randomUUID();
    const tempPath=`${this.dataPath}.tmp`;
    // Move automatic backups out of service before committing the empty snapshot.
    fs.rmSync(this.resetBackupPath,{recursive:true,force:true,maxRetries:3,retryDelay:100});
    fs.renameSync(this.backupPath,this.resetBackupPath);
    try {
      fs.mkdirSync(this.backupPath);
      fs.writeFileSync(tempPath,JSON.stringify(fresh,null,2),"utf8");
      fs.renameSync(tempPath,this.dataPath);
    } catch(error) {
      fs.rmSync(tempPath,{force:true});
      fs.rmSync(this.backupPath,{recursive:true,force:true});
      fs.renameSync(this.resetBackupPath,this.backupPath);
      throw error;
    }
    this.state=fresh;
    this.deletionChallenges.clear();
    fs.rmSync(this.resetBackupPath,{recursive:true,force:true,maxRetries:3,retryDelay:100});
    return this.view();
  }

  createDraw(payload = {}) {
    const scope = payload.disciplineId || "all";
    if (scope !== "all" && !this.state.disciplines.some(d => d.id === scope)) throw new Error("رشته قرعه‌کشی معتبر نیست.");
    if (this.state.teams.length < 2) throw new Error("برای قرعه‌کشی حداقل دو تیم ثبت کنید.");
    if (((scope === "all" || scope === "combined") && this.state.combinedStartOrder.length) || this.state.results.some(result => scope === "all" || result.disciplineId === scope))
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
    if (!["standings", "draw", "item", "individual"].includes(payload.mode)) throw new Error("حالت نمایش معتبر نیست.");
    if (payload.mode === "draw" && !this.state.draws.some(d => d.id === payload.drawId)) throw new Error("قرعه‌کشی پیدا نشد.");
    if (payload.mode === "item" && !this.state.disciplines.some(item => item.id === payload.disciplineId)) throw new Error("رشته نمایش معتبر نیست.");
    this.state.settings.displayItemId = payload.mode === "item" ? payload.disciplineId : null;
    this.state.settings.displayMode = payload.mode;
    this.state.settings.displayDrawId = payload.mode === "draw" ? payload.drawId : null;
    this.#persist();
    return this.view();
  }

  updateSettings(payload) {
    if (payload.expectedRevision != null && payload.expectedRevision !== this.state.revision) throw new Error("داده تغییر کرده است؛ تنظیمات را دوباره بررسی کنید.");
    if(payload.displayLayout!==undefined && !["paged","all"].includes(payload.displayLayout)) throw new Error("چیدمان نمایشگر معتبر نیست.");
    const competitionLogo=payload.competitionLogo===undefined ? this.state.settings.competitionLogo : validateLogo(payload.competitionLogo);
    const sponsorLogos=payload.sponsorLogos===undefined ? this.state.settings.sponsorLogos : payload.sponsorLogos;
    if (!Array.isArray(sponsorLogos) || sponsorLogos.length>3) throw new Error("حداکثر سه لوگوی حامی مجاز است.");
    const sponsors=sponsorLogos.map(logo=>validateLogo(logo));
    this.state.settings = {
      ...this.state.settings, competitionLogo, sponsorLogos:sponsors,
      eventDate:payload.eventDate===undefined ? this.state.settings.eventDate : clean(payload.eventDate,80),
      competitionName: clean(payload.competitionName || this.state.settings.competitionName, 180),
      venue: payload.venue===undefined ? this.state.settings.venue : clean(payload.venue,180),
      audioEnabled: payload.audioEnabled === undefined ? this.state.settings.audioEnabled : Boolean(payload.audioEnabled),
      audioVolume: boundedNumber(payload.audioVolume ?? this.state.settings.audioVolume ?? 45, 0, 100, "بلندی صدا"),
      displayLayout: payload.displayLayout ?? this.state.settings.displayLayout,
      autoRotate: payload.autoRotate === undefined ? this.state.settings.autoRotate : Boolean(payload.autoRotate),
      displayMessage: payload.displayMessage===undefined ? this.state.settings.displayMessage : clean(payload.displayMessage,220)
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
      parsed.settings = { eventDate:"", competitionLogo:"", sponsorLogos:[], audioVolume: 45, autoRotate: true, displayLayout: "paged", displayMode: "standings", displayDrawId: null, displayItemId: null, ...parsed.settings };
      if (parsed.settings.displayMessage === "نتایج رسمی پس از تأیید سرداور نمایش داده می‌شوند.")
        parsed.settings.displayMessage = "نتایج زنده تا تأیید سرداور موقت هستند؛ نوبت اجرا با رتبه متفاوت است.";
      if(!["paged","all"].includes(parsed.settings.displayLayout)) parsed.settings.displayLayout="paged";
      migrateCombined(parsed);
      parsed.version = 4;
      parsed.organizationCredit = ORGANIZATION;
      return parsed;
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error("فایل داده خوانده نشد؛ برای حفظ اطلاعات از نسخه پشتیبان استفاده کنید.", { cause: error });
      const initial = this.#initialState();
      this.state = initial;
      this.#persist();
      return initial;
    }
  }

  #initialState() {
    return {
        version: 4,
        revision: 0,
        organizationCredit: ORGANIZATION,
        draws: [], athletes:[],roundScores:[],combinedStartOrder:[],nextAthleteId:1,nextRoundScoreId:1,
        settings: {
          eventDate:"",competitionLogo:"",sponsorLogos:[],
          competitionName: "سومین دوره مسابقات علمی و عملیاتی آتش‌نشانان ایمیدرو",
          venue: "مجتمع مس سرچشمه رفسنجان · ۱۴۰۵",
          audioEnabled: true,
          audioVolume: 45, autoRotate: true, displayLayout: "paged", displayMode: "standings", displayDrawId: null, displayItemId: null,
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
