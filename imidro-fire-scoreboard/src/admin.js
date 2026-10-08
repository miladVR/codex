"use strict";

const api = window.scoreboardAPI;
const help = window.scoreboardHelp;
const {formatTime,slotBadge,combinedSaveState}=window.scoreboardPresentation;
let state;
let currentView = "dashboard";
let drawScope = "all";
let drawBusy = false;
let displayStatus;
let leaderboardScope = "all";
let selectedRound=1, entryBusy=false;
let selectedTeam = "", selectedDiscipline = "scientific";
const titles = { dashboard: "تابلوی نتایج", entry: "ثبت نتیجه", approvals: "تأیید سرداور", teams: "تیم‌ها", settings: "تنظیمات و نمایشگر", draw: "قرعه‌کشی تیم‌ها", audit: "سوابق تغییرات", guide: "راهنمای نرم‌افزار" };

help.install({getContext:source=>({state,drawScope,drawBusy,teamId:selectedTeam || document.getElementById("team")?.value,disciplineId:selectedDiscipline,slot:state?.combinedTeams.find(t=>t.teamId===Number(document.getElementById("team")?.value))?.rounds[selectedRound-1],result:state?.results.find(r=>r.id===Number(source?.dataset.id))}),openGuide:()=>setView("guide")});
document.getElementById("view-help").onclick=()=>help.showTopic(currentView,document.getElementById("view-help"));
help.decorate(document.querySelector(".sidebar"));help.decorate(document.querySelector("header"));
document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelector("#display-btn").addEventListener("click", () => openDisplay().catch(error => notify(`خطای نمایشگر: ${error.message}`, true)));
document.querySelector("#backup-btn").addEventListener("click", async () => { const result = await api.backup(); if (!result.canceled) notify("نسخه پشتیبان ذخیره شد."); });
document.getElementById("reset-all").addEventListener("click",()=>deleteSafely("reset"));
function receive(next) {
  if (state && next.revision < state.revision) return;
  if(state && next.resetId!==state.resetId) {selectedTeam="";selectedDiscipline="scientific";selectedRound=1;drawScope="all";leaderboardScope="all";drawBusy=false;currentView="dashboard";document.querySelectorAll(".nav-item").forEach(item=>item.classList.toggle("active",item.dataset.view==="dashboard"));}
  const draft=currentView==="entry" && !entryBusy ? Array.from(document.querySelectorAll("#content input,#content select,#content textarea"),input=>[input.id,input.value]) : null;
  state=next;render();
  if (draft) { for (const [id,saved] of draft) { const input=document.getElementById(id);if(input) input.value=saved; } updatePreview(); }
}
api.onStateChange(receive);
api.getState().then(receive).catch(error => notify(error.message, true));
api.onDisplayChange(status => { displayStatus = status; const label=document.getElementById("display-status");if(label) label.textContent=status.error || (status.open ? "پنجره سالن باز است" : "پنجره سالن بسته است"); });
api.getDisplayStatus().then(status => { displayStatus = status; if (currentView === "settings") render(); }).catch(error => notify(error.message, true));

function setView(view) {
  currentView = view;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  render();
}

function render() {
  if (!state) return;
  document.querySelector("#view-title").textContent = titles[currentView];
  document.querySelector("#venue").textContent = [state.settings.venue,state.settings.eventDate].filter(Boolean).join(" · ");
  document.querySelector(".admin-logo").src=state.settings.competitionLogo || "../assets/competition-logo.jpg";
  const drafts = state.results.filter((result) => result.status === "draft").length;
  document.querySelector("#draft-badge").textContent = drafts || "";
  if(currentView==="guide" && document.getElementById("full-guide")) return;
  const views = { dashboard: dashboardView, entry: entryView, approvals: approvalsView, teams: teamsView, settings: settingsView, draw: drawView, audit: auditView, guide:()=>'<div id="full-guide"></div>' };
  document.querySelector("#content").innerHTML = views[currentView]();
  document.querySelectorAll(".field").forEach(field => {
    const label = field.querySelector("label"); const input = field.querySelector("input,select,textarea");
    if (label && input?.id) label.htmlFor = input.id;
  });
  document.querySelectorAll(".time-part").forEach(part => part.querySelector("label").htmlFor = part.querySelector("select").id);
  bindCurrentView();
  help.decorate(document.getElementById("content"));
}

function dashboardView() {
  const approved = state.results.filter((result) => result.status === "approved").length;
  const drafts = state.results.filter((result) => result.status === "draft").length;
  return `<div class="card hero"><h2>${escapeHtml(state.settings.competitionName)}</h2><p>ثبت و ویرایش بلافاصله در جدول زنده منتشر می‌شود؛ نتایج تأییدنشده موقت هستند. PDF رسمی فقط نتایج تأییدشده را دارد.</p></div>
  <div class="grid metrics"><div class="metric"><b>${state.teams.length}</b><span>تیم حاضر</span></div><div class="metric"><b>${approved}</b><span>نتیجه تأییدشده</span></div><div class="metric"><b>${drafts}</b><span>در انتظار تأیید</span></div><div class="metric"><b>${state.disciplines.length}</b><span>رشته مسابقه</span></div></div>
  <div class="card"><div class="section-actions"><h2>جدول امتیازات تیمی</h2><button id="export-standings" class="btn ghost">دریافت PDF نتایج</button></div>${standingsTable()}</div><div class="card"><h2>تابلو زندهٔ هر رشته</h2><div class="field"><label for="leaderboard-scope">صفحهٔ سالن</label><select id="leaderboard-scope"><option value="all">کل مسابقات</option><option value="individual" ${leaderboardScope === "individual" ? "selected" : ""}>عملیات ترکیبی — انفرادی ۴۴ ورزشکار</option>${state.disciplines.map(item => `<option value="${item.id}" ${leaderboardScope === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div><button id="publish-leaderboard" class="btn primary">نمایش این صفحه در سالن</button>${leaderboardScope!=="all" ? `<button id="export-live-table" class="btn ghost">${leaderboardScope==="individual" ? "دریافت PDF انفرادی عملیات ترکیبی" : "دریافت PDF این رشته"}</button>` : ""}${itemTable()}</div>`;
}

function standingsTable() {
  if (!state.teams.length) return `<div class="empty">هنوز تیمی ثبت نشده است.</div>`;
  const heads = state.disciplines.map((item) => `<th class="center">${escapeHtml(item.name)}</th>`).join("");
  const rows = state.liveStandings.map((row) => `<tr><td><span class="rank ${row.officialRank === 1 ? "first" : ""}">${row.officialRank ?? "—"}</span></td><td><span class="turn">${row.drawOrder ?? "—"}</span></td><td><b>${escapeHtml(row.team.name)}</b><br><small>${escapeHtml(row.team.organization)}</small></td>${state.disciplines.map((item) => `<td class="center">${row.disciplineRanks[item.id] ?? "—"}</td>`).join("")}<td class="center"><b>${row.completed ? row.total : "—"}</b></td><td class="center"><span class="tag ${row.completed === state.disciplines.length ? "green" : ""}">${row.completed}/${state.disciplines.length}</span></td></tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr><th>رتبه زنده</th><th>نوبت عمومی</th><th>تیم</th>${heads}<th class="center">مجموع</th><th class="center">تکمیل</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function entryView() {
  if (!state.teams.length) return `<div class="card empty">ابتدا از بخش «تیم‌ها» حداقل یک تیم ثبت کنید.</div>`;
  return `<div class="entry-layout"><div class="card"><h2>فرم ثبت نتیجه داور</h2><div class="form-grid"><div class="field"><label>رشته مسابقه</label><select id="discipline">${state.disciplines.map((item) => `<option value="${item.id}" ${item.id === selectedDiscipline ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div><div class="field"><label>تیم</label><select id="team">${state.teams.map((item) => `<option value="${item.id}" ${String(item.id) === selectedTeam ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div></div><div id="result-fields"></div><div class="field"><label>شرح خطا یا توضیحات داور</label><textarea id="note" placeholder="علت جریمه، وضعیت خاص یا توضیح ضروری…"></textarea></div><div class="result-preview"><span>نتیجه محاسبه‌شده</span><strong id="preview">—</strong></div><div class="actions" style="margin-top:16px"><button id="save-result" class="btn primary">ذخیره و ارسال برای تأیید</button></div></div><aside class="card guide"><h3>کنترل قبل از ثبت</h3><ol><li>نام تیم و رشته را با برگه داوری تطبیق دهید.</li><li>دقیقه، ثانیه و صدم ثانیه را از فهرست‌های جداگانه انتخاب کنید.</li><li>علت هر جریمه را در توضیحات بنویسید.</li><li>نتیجه فوراً با برچسب موقت روی نمایشگر منتشر می‌شود؛ تأیید سرداور آن را رسمی و قفل می‌کند.</li></ol></aside></div>`;
}

function approvalsView() {
  const drafts = state.results.filter((result) => result.status === "draft");
  const approved = state.results.filter((result) => result.status === "approved").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `<div class="card"><h2>صف تأیید سرداور</h2>${resultsTable(drafts, "approve")}</div><div class="card"><h2>آخرین نتایج قفل‌شده</h2>${resultsTable(approved, "reopen")}</div>`;
}

function resultsTable(results, action) {
  if (!results.length) return `<div class="empty">موردی برای نمایش وجود ندارد.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>تیم</th><th>رشته</th><th class="center">نتیجه</th><th>داور</th><th></th></tr></thead><tbody>${results.map((result) => { const discipline = disciplineById(result.disciplineId); return `<tr><td>${escapeHtml(teamById(result.teamId)?.name)}</td><td>${escapeHtml(discipline?.name)}</td><td class="center">${resultText(result, discipline)}</td><td>${escapeHtml(result.judge || "—")}</td><td><button class="btn ${action === "approve" ? "success" : "ghost"}" data-action="${action}" data-id="${result.id}" ${action==="approve" && result.completionStatus==="Partial" ? "disabled" : ""}>${action === "approve" ? "تأیید و قفل" : "بازکردن برای اصلاح"}</button><button class="btn danger" data-delete-kind="result" data-delete-id="${result.id}">حذف نتیجه</button></td></tr>`; }).join("")}</tbody></table></div>`;
}

function teamsView() {
  return `<div class="card"><h2>افزودن تیم</h2><div class="form-grid"><div class="field"><label>نام تیم</label><input id="team-name" placeholder="مثلاً تیم مس سرچشمه"></div><div class="field"><label>شرکت یا مجموعه</label><input id="team-org" placeholder="نام سازمان"></div><div class="field"><label>نام ورزشکار دور اول عملیات ترکیبی</label><input id="team-athlete-1"></div><div class="field"><label>نام ورزشکار دور دوم عملیات ترکیبی</label><input id="team-athlete-2"></div></div><div class="actions" style="margin-top:16px"><button id="add-team" class="btn primary">ثبت تیم</button></div></div><div class="grid team-list">${state.teams.map((team) => `<div class="team"><b>${escapeHtml(team.name)}</b><small>${escapeHtml(team.organization || "بدون نام مجموعه")}</small><small>${team.code}</small>${state.athletes.filter(a=>a.teamId===team.id).map(a=>`<p>عملیات ترکیبی — دور ${a.round}: ${escapeHtml(a.name || "نام ثبت نشده")} <button class="btn danger" data-delete-kind="athlete" data-delete-id="${a.id}">پاک‌کردن ورزشکار</button></p>`).join("")}<button class="btn danger" data-delete-kind="team" data-delete-id="${team.id}">حذف تیم و نتایج</button></div>`).join("") || `<div class="card empty">هنوز تیمی ثبت نشده است.</div>`}</div>`;
}

function settingsView() {
  return `<div class="grid settings-grid"><div class="card"><h2>مشخصات مسابقه</h2><div class="field"><label>عنوان مسابقه</label><input id="competition-name" value="${escapeAttr(state.settings.competitionName)}"></div><div class="field"><label>محل و سال برگزاری</label><input id="competition-venue" value="${escapeAttr(state.settings.venue)}"></div><div class="field"><label>تاریخ برگزاری (شمسی یا میلادی)</label><input id="event-date" value="${escapeAttr(state.settings.eventDate)}"></div><div class="field"><label>لوگوی مسابقه — PNG / JPEG / WebP تا ۲ مگابایت</label><img class="logo-preview" src="${escapeAttr(state.settings.competitionLogo || "../assets/competition-logo.jpg")}" alt="لوگوی مسابقه"><input type="file" id="competition-logo-file" accept="image/png,image/jpeg,image/webp"><label><input type="checkbox" id="reset-competition-logo"> بازگشت به لوگوی پیش‌فرض</label></div>${[0,1,2].map(i=>`<div class="field"><label>لوگوی حامی ${i+1}</label>${state.settings.sponsorLogos[i] ? `<img class="logo-preview" src="${escapeAttr(state.settings.sponsorLogos[i])}" alt="لوگوی حامی">` : ""}<input type="file" id="sponsor-${i}" accept="image/png,image/jpeg,image/webp"><label><input type="checkbox" id="reset-sponsor-${i}"> پاک‌کردن این لوگو</label></div>`).join("")}<div class="field"><label>پیام پایین نمایشگر</label><input id="display-message" value="${escapeAttr(state.settings.displayMessage)}"></div><div class="switch-row"><span>پخش صدای اعلان نتیجه</span><input id="audio-enabled" type="checkbox" ${state.settings.audioEnabled ? "checked" : ""}></div><div class="field"><label for="audio-volume">بلندی صدای اعلان (۰ تا ۱۰۰)</label><input id="audio-volume" type="range" min="0" max="100" value="${state.settings.audioVolume ?? 45}"><button id="test-sound" class="btn ghost">آزمایش صدا</button></div><div class="field"><label for="display-layout">چیدمان جدول نمایشگر سالن</label><select id="display-layout"><option value="paged" ${state.settings.displayLayout!=="all" ? "selected" : ""}>حداکثر دو صفحه — ۱۱ تیم یا ۲۲ ورزشکار در هر صفحه</option><option value="all" ${state.settings.displayLayout==="all" ? "selected" : ""}>همه در یک صفحه — دو جدول کنار هم</option></select></div><div class="switch-row"><label for="auto-rotate">گردش خودکار صفحات نمایشگر</label><input id="auto-rotate" type="checkbox" ${state.settings.autoRotate !== false ? "checked" : ""}></div><div class="actions" style="margin-top:16px"><button id="save-settings" class="btn primary">ذخیره تنظیمات</button></div></div><div class="card"><h2>نمایشگر دوم</h2><p style="color:var(--muted);line-height:2">با انتخاب «بازکردن نمایشگر»، پنجره نتایج روی مانیتور دوم به‌صورت تمام‌صفحه باز می‌شود. اگر فقط یک نمایشگر متصل باشد، پنجره عادی باز می‌شود تا آن را جابه‌جا کنید.</p><p class="inline-status" id="display-status" role="status">${escapeHtml(displayStatus?.error || (displayStatus?.open ? "پنجره سالن باز است" : "پنجره سالن بسته است"))}</p><div class="field"><label for="window-mode">حالت خروجی پنجره</label><select id="window-mode"><option value="extend" ${displayStatus?.mode !== "mirror" ? "selected" : ""}>Extend — نمایشگر مستقل سالن</option><option value="mirror" ${displayStatus?.mode === "mirror" ? "selected" : ""}>Mirror — پیش‌نمایش همان تابلو روی اصلی</option></select></div><div class="field"><label for="target-display">نمایشگر مقصد</label><select id="target-display"><option value="">انتخاب خودکار</option>${(displayStatus?.displays ?? []).map(item => `<option value="${item.id}" ${displayStatus?.targetId === item.id ? "selected" : ""}>${escapeHtml(item.label)} ${item.primary ? "(اصلی)" : "(دوم)"}</option>`).join("")}</select></div><p>Mirror اینجا پیش‌نمایش پنجره است؛ حالت Duplicate/Extend ویندوز را با Win+P تنظیم کنید. برنامه تنظیمات سیستم‌عامل را تغییر نمی‌دهد.</p><div class="actions"><button id="open-display-alt" class="btn primary">بازکردن نمایشگر</button><button id="close-display" class="btn ghost">بستن نمایشگر</button><button id="backup-alt" class="btn ghost">ذخیره نسخه پشتیبان</button></div></div></div>`;
}

function auditView() {
  return `<div class="card"><h2>دفتر ثبت تغییرات</h2>${state.audits.length ? state.audits.map((item) => `<div class="audit-item"><time>${new Date(item.createdAt).toLocaleString("fa-IR")}</time><span>${escapeHtml(item.summary)}</span><span class="tag">${escapeHtml(item.action)}</span></div>`).join("") : `<div class="empty">هنوز تغییری ثبت نشده است.</div>`}</div>`;
}

function bindCurrentView() {
  if(currentView==="guide")window.scoreboardManual.render(document.getElementById("full-guide"));
  document.querySelectorAll("[data-delete-kind]").forEach(button=>button.addEventListener("click",()=>deleteSafely(button.dataset.deleteKind,Number(button.dataset.deleteId))));
  if (currentView === "dashboard") {
    document.querySelector("#export-standings").addEventListener("click", () => exportReport({ type: "standings" }));
    document.querySelector("#export-live-table")?.addEventListener("click", () => exportReport(leaderboardScope==="individual" ? {type:"individual"} : {type:"item",disciplineId:leaderboardScope}));
    document.querySelector("#leaderboard-scope").addEventListener("change", event => { leaderboardScope = event.target.value; render(); });
    document.querySelector("#publish-leaderboard").addEventListener("click", async () => {
      try { await api.setDisplay(leaderboardScope === "all" ? { mode: "standings" } : leaderboardScope==="individual" ? {mode:"individual"} : { mode: "item", disciplineId: leaderboardScope }); await openDisplay(); }
      catch (error) { notify(error.message, true); }
    });
  }
  if (currentView === "draw") bindDraw();
  if (currentView === "entry") bindEntry();
  if (currentView === "teams") document.querySelector("#add-team")?.addEventListener("click", addTeam);
  if (currentView === "approvals") document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => mutateResult(button)));
  if (currentView === "settings") {
    document.querySelector("#test-sound").addEventListener("click", () => window.scoreboardSound(Number(value("audio-volume"))));
    document.querySelector("#save-settings").addEventListener("click", saveSettings);
    document.querySelector("#open-display-alt").addEventListener("click", () => openDisplay({ mode: value("window-mode"), displayId: value("target-display") || undefined }).catch(error => notify(`خطای نمایشگر: ${error.message}`, true)));
    document.querySelector("#close-display").addEventListener("click", async () => { try { displayStatus = await api.closeDisplay(); render(); } catch (error) { notify(error.message, true); } });
    document.querySelector("#backup-alt").addEventListener("click", () => api.backup());
  }
}

function bindEntry() {
  const discipline = document.querySelector("#discipline");
  discipline.addEventListener("change", () => { selectedDiscipline = discipline.value; renderResultFields(); });
  document.querySelector("#team").addEventListener("change", event => { selectedTeam = event.target.value; renderResultFields(); });
  document.querySelector("#save-result").addEventListener("click", saveResult);
  renderResultFields();
}

function renderResultFields() {
  const discipline = disciplineById(document.querySelector("#discipline").value);
  if (discipline.id === "combined") { renderCombinedFields(); return; }
  const container = document.querySelector("#result-fields");
  document.getElementById("save-result").textContent="ذخیره و ارسال برای تأیید";
  if (discipline.mode === "score") {
    container.innerHTML = `<div class="form-grid" style="margin-top:17px"><div class="field"><label>امتیاز آزمون</label><input id="scientific-score" type="number" min="0" max="100" step="0.01"></div><div class="field"><label>زمان پاسخ‌گویی برای رفع تساوی</label>${timePicker("scientific")}</div></div>`;
  } else {
    container.innerHTML = `<div class="form-grid" style="margin-top:17px"><div class="field"><label>${discipline.mode === "pair_time" ? "نام ورزشکار اول" : "نام ورزشکار"}</label><input id="athlete-primary"></div>${discipline.mode === "pair_time" ? `<div class="field"><label>نام ورزشکار دوم</label><input id="athlete-secondary"></div>` : ""}<div class="field"><label>زمان ${discipline.mode === "pair_time" ? "نفر اول" : "خام"}</label>${timePicker("primary")}</div>${discipline.mode === "pair_time" ? `<div class="field"><label>زمان نفر دوم</label>${timePicker("secondary")}</div>` : ""}<div class="field"><label>مجموع جریمه (ثانیه)</label><input id="penalty" type="number" min="0" max="3600" step="1" value="0"></div><div class="field"><label>نام داور</label><input id="judge" placeholder="نام ثبت‌کننده نتیجه"></div></div>`;
  }
  const existing = state.results.find(result => result.teamId === Number(value("team")) && result.disciplineId === discipline.id);
  if (existing) {
    const values = { "scientific-score": existing.scientificScore, "athlete-primary": existing.athletePrimary, "athlete-secondary": existing.athleteSecondary, penalty: existing.penaltyMs / 1000, judge: existing.judge, note: existing.note };
    for (const [id, saved] of Object.entries(values)) { const input = document.getElementById(id); if (input) input.value = saved ?? ""; }
    for (const [prefix, ms] of [["primary", existing.rawPrimaryMs], ["secondary", existing.rawSecondaryMs], ["scientific", existing.scientificDurationMs]]) {
      if (ms == null) continue;
      for (const [part, saved] of [["m", Math.floor(ms / 60000)], ["s", Math.floor(ms % 60000 / 1000)], ["h", Math.floor(ms % 1000 / 10)]]) {
        const input = document.getElementById(`${prefix}-${part}`); if (input) input.value = String(saved);
      }
    }
  } else document.querySelector("#note").value = "";
  if (existing?.penaltyMs>0) {
    const action=document.createElement("button");action.className="btn danger";action.id="clear-result-penalty";action.textContent="پاک‌کردن جریمه با تأیید";
    action.onclick=()=>deleteSafely("result_penalty",existing.id);container.append(action);
  }
  document.querySelector("#save-result").disabled = existing?.status === "approved";
  container.querySelectorAll(".time-part").forEach(part => part.querySelector("label").htmlFor = part.querySelector("select").id);
  container.querySelectorAll("select,input").forEach((field) => field.addEventListener("input", updatePreview));
  updatePreview();
  help.decorate(document.getElementById("content"));
}

function timePicker(prefix, zeroDefaults=false) {
  const options = (count) => Array.from({ length: count }, (_, index) => `<option value="${index}">${String(index).padStart(2, "0")}</option>`).join("");
  const placeholder = `<option value="" selected disabled>ــ</option>`;
  return `<div class="time-picker"><div class="time-part"><label>دقیقه</label><select id="${prefix}-m">${zeroDefaults?'':placeholder}${options(100)}</select></div><span class="time-separator">:</span><div class="time-part"><label>ثانیه</label><select id="${prefix}-s">${placeholder}${options(60)}</select></div><span class="time-separator">.</span><div class="time-part"><label>صدم</label><select id="${prefix}-h">${zeroDefaults?'':placeholder}${options(100)}</select></div></div>`;
}

function readTime(prefix) {
  const parts = [value(`${prefix}-m`), value(`${prefix}-s`), value(`${prefix}-h`)];
  if (parts.some((part) => part === "")) return null;
  return (Number(parts[0]) * 60_000) + (Number(parts[1]) * 1_000) + (Number(parts[2]) * 10);
}
function updatePreview() {
  const discipline = disciplineById(value("discipline"));
  if (discipline.id==="combined") { updateCombinedPreview(); return; }
  const target = document.querySelector("#preview");
  if (!target) return;
  if (discipline.mode === "score") { target.textContent = value("scientific-score") || "—"; return; }
  const penalty = (Number(value("penalty")) || 0) * 1000;
  const primary = readTime("primary");
  const secondary = discipline.mode === "pair_time" ? readTime("secondary") : null;
  if (primary === null || (discipline.mode === "pair_time" && secondary === null)) { target.textContent = "انتخاب کامل زمان"; return; }
  const total = discipline.mode === "pair_time" ? (primary + secondary) / 2 + penalty : primary + penalty;
  target.textContent = formatTime(total);
}

async function saveResult() {
  const discipline = disciplineById(value("discipline"));
  if (discipline.id==="combined") { await saveCombinedRound(); return; }
  try {
    selectedTeam = value("team"); selectedDiscipline = discipline.id; entryBusy=true;
    await api.saveResult({ teamId: Number(value("team")), disciplineId: discipline.id, athletePrimary: value("athlete-primary"), athleteSecondary: value("athlete-secondary"), rawPrimaryMs: discipline.mode === "score" ? null : readTime("primary"), rawSecondaryMs: discipline.mode === "pair_time" ? readTime("secondary") : null, penaltyMs: (Number(value("penalty")) || 0) * 1000, scientificScore: discipline.mode === "score" ? value("scientific-score") : null, scientificDurationMs: discipline.mode === "score" ? readTime("scientific") : null, note: value("note"), judge: value("judge") });
    notify("نتیجه فوراً در جدول زنده منتشر و به صف تأیید سرداور ارسال شد.");
  } catch (error) { notify(error.message, true); } finally {entryBusy=false;render();}
}

async function addTeam() { try { await api.addTeam({ name: value("team-name"), organization: value("team-org"), athletePrimary:value("team-athlete-1"),athleteSecondary:value("team-athlete-2") }); notify("تیم جدید ثبت شد."); } catch (error) { notify(error.message, true); } }
async function mutateResult(button) { try { if (button.dataset.action === "approve") await api.approveResult({ resultId: Number(button.dataset.id), approvedBy: "سرداور" }); else await api.reopenResult({ resultId: Number(button.dataset.id) }); notify(button.dataset.action === "approve" ? "نتیجه تأیید و روی نمایشگر منتشر شد." : "نتیجه برای اصلاح باز شد."); } catch (error) { notify(error.message, true); } }
async function imageFile(input) {
  const file=input.files[0]; if (!file) return undefined;
  if (!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size>2*1024*1024) throw new Error("تصویر PNG، JPEG یا WebP تا ۲ مگابایت انتخاب کنید.");
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("خواندن تصویر ناموفق بود."));reader.readAsDataURL(file);});
  await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve();image.onerror=()=>reject(new Error("فایل تصویر قابل نمایش نیست."));image.src=data;});
  return data;
}
async function saveSettings() {
  const button=document.querySelector("#save-settings");button.disabled=true;
  try {
    const payload={expectedRevision:state.revision,competitionName:value("competition-name"),venue:value("competition-venue"),eventDate:value("event-date"),displayMessage:value("display-message"),
      audioEnabled:document.querySelector("#audio-enabled").checked,audioVolume:Number(value("audio-volume")),displayLayout:value("display-layout"),autoRotate:document.querySelector("#auto-rotate").checked};
    const logoInput=document.querySelector("#competition-logo-file"),resetLogo=document.querySelector("#reset-competition-logo").checked;
    const sponsorInputs=[0,1,2].map(i=>({input:document.getElementById(`sponsor-${i}`),reset:document.getElementById(`reset-sponsor-${i}`).checked,old:state.settings.sponsorLogos[i] || ""}));
    payload.competitionLogo=resetLogo ? "" : (await imageFile(logoInput)) ?? state.settings.competitionLogo;
    payload.sponsorLogos=await Promise.all(sponsorInputs.map(async s=>s.reset ? "" : (await imageFile(s.input)) ?? s.old));
    await api.updateSettings(payload);notify("تنظیمات و لوگوها ذخیره و در سالن اعمال شدند.");
  } catch(error) {notify(error.message,true);} finally {button.disabled=false;}
}


function resultText(result, discipline) { return result.completionStatus==="Partial" ? "در حال تکمیل — یک ورزشکار ثبت شده" : discipline.mode === "score" ? `${result.scientificScore ?? "—"} / ${formatTime(result.scientificDurationMs)}` : formatTime(metric(result, discipline)); }
function metric(result, discipline) { if (discipline.mode==="pair_time" && (result.rawPrimaryMs==null || result.rawSecondaryMs==null)) return null; if (discipline.mode === "score") return result.scientificScore; if (discipline.mode === "pair_time") return (result.rawPrimaryMs + result.rawSecondaryMs) / 2 + result.penaltyMs; return result.rawPrimaryMs + result.penaltyMs; }
function teamById(id) { return state.teams.find((item) => item.id === id); }
function disciplineById(id) { return state.disciplines.find((item) => item.id === id); }
function value(id) { return document.getElementById(id)?.value ?? ""; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function escapeAttr(value) { return escapeHtml(value); }
function notify(message, error = false) { const toast = document.querySelector("#toast"); toast.textContent = message; toast.className = `show${error ? " error" : ""}`; clearTimeout(notify.timer); notify.timer = setTimeout(() => { toast.className = ""; }, 3200); }


async function openDisplay(payload) {
  displayStatus = await api.openDisplay(payload);
  notify(displayStatus.displays.length < 2 ? "تابلو باز شد؛ برای خروجی مستقل، نمایشگر دوم و Win+P → Extend لازم است." : "تابلو سالن آماده است.");
}
function itemTable() {
  if (leaderboardScope === "all") return "";
  if (leaderboardScope === "individual") return individualTable();
  const discipline = disciplineById(leaderboardScope);
  return `<div class="table-wrap"><table><thead><tr><th>رتبه امتیازی</th><th>نوبت اجرا</th><th>تیم</th><th>رکورد نهایی / نمره</th><th>وضعیت</th></tr></thead><tbody>${state.itemLeaderboards[leaderboardScope].map(row => `<tr><td>${row.rank ?? "—"}</td><td><span class="turn">${row.drawOrder ?? "—"}</span></td><td>${escapeHtml(row.team.name)}</td><td>${discipline.mode === "score" ? row.finalValue ?? "—" : formatTime(row.finalValue)}</td><td>${row.result?.completionStatus==="Partial" ? "در حال تکمیل" : !row.result ? "ثبت نشده" : row.result.status === "approved" ? "تأییدشده" : "موقت"}</td></tr>`).join("")}</tbody></table></div>`;
}
function drawView() {
  const availability=help.drawAvailability(state,drawScope,drawBusy);
  const draws = state.draws.filter(d => d.disciplineId === drawScope);
  const latest = draws[0];
  const missing = latest ? state.teams.filter(t => !latest.entries.some(e => e.teamId === t.id)).length : 0;
  return `<div class="card hero"><h2>قرعه‌کشی ترتیب حضور تیم‌ها</h2><p>هر تیم دقیقاً یک نوبت می‌گیرد. نتیجه ذخیره می‌شود و روی امتیاز مسابقه اثری ندارد.</p></div>
  <div class="card"><div class="form-grid"><div class="field"><label for="draw-scope">محدوده قرعه‌کشی</label><select id="draw-scope"><option value="all">ترتیب عمومی تیم‌ها</option>${state.disciplines.map(d => `<option value="${d.id}" ${drawScope === d.id ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}</select></div><div class="draw-info">${state.teams.length.toLocaleString("fa-IR")} تیم حاضر<br>پیش از قرعه‌کشی، فهرست تیم‌ها را کامل کنید. پس از ثبت اولین نتیجهٔ این محدوده، نوبت‌ها ثابت و غیرقابل‌تغییر هستند.</div></div>
  ${latest ? `<label class="draw-confirm"><input type="checkbox" id="confirm-redraw"> قرعه‌کشی مجدد این رشته را تأیید می‌کنم؛ نوبت قبلی در سوابق باقی بماند.</label>` : ""}
  <div class="manual-orders"><h3>ورود دستی نوبت قرعه‌کشی فیزیکی</h3>${state.teams.map(team => `<div class="field"><label for="order-${team.id}">${escapeHtml(team.name)}</label><input id="order-${team.id}" data-order-team="${team.id}" type="number" min="1" max="${state.teams.length}" step="1" value="${latest?.entries.find(entry => entry.teamId === team.id)?.drawOrder ?? ""}"></div>`).join("")}</div><button class="btn success" id="save-manual-draw" ${!availability.allowed ? "disabled" : ""}>ثبت نوبت‌های دستی</button>
  <button class="btn primary" id="run-draw" ${!availability.allowed ? "disabled" : ""}>${drawBusy ? "در حال ثبت قرعه‌کشی…" : latest ? "اجرای قرعه‌کشی مجدد" : "شروع قرعه‌کشی"}</button><p class="inline-status" id="draw-status" role="status">${!availability.allowed ? escapeHtml(availability.reason) : missing ? `${missing.toLocaleString("fa-IR")} تیم پس از آخرین قرعه‌کشی اضافه شده است؛ برای حضور آن‌ها قرعه‌کشی مجدد لازم است.` : ""}</p></div>
  ${latest ? `<section class="card"><div class="section-actions"><div><h2>${escapeHtml(latest.title)}</h2><p class="draw-info">ثبت در ${new Date(latest.createdAt).toLocaleString("fa-IR")}</p></div><div class="actions"><button class="btn success" id="show-draw">نمایش قرعه‌کشی در سالن</button><button class="btn ghost" id="show-standings">بازگشت سالن به نتایج</button><button class="btn ghost" id="export-draw">دریافت PDF قرعه‌کشی</button></div></div>${drawTickets(latest)}</section>` : ""}
  ${draws.length > 1 ? `<details class="card draw-history"><summary>سوابق قرعه‌کشی این بخش (${draws.length - 1})</summary><ol>${draws.slice(1).map(d => `<li>${new Date(d.createdAt).toLocaleString("fa-IR")}<button class="btn ghost" data-export-draw="${d.id}">دریافت PDF این نوبت</button><p>${d.entries.map((e,i) => `${(i+1).toLocaleString("fa-IR")}. ${escapeHtml(e.name)}`).join(" · ")}</p></li>`).join("")}</ol></details>` : ""}`;
}
function drawTickets(draw) {
  return `<div class="draw-grid">${draw.entries.map((team, index) => `<article class="draw-ticket"><strong>${team.drawOrder.toLocaleString("fa-IR")}</strong><div><b>${escapeHtml(team.name)}</b><small>${escapeHtml(team.organization || team.code)}</small></div></article>`).join("")}</div>`;
}
function bindDraw() {
  document.querySelector("#draw-scope").addEventListener("change", event => { drawScope = event.target.value; render(); });
  document.querySelector("#run-draw").addEventListener("click", async () => {
    const previous = state.draws.find(d => d.disciplineId === drawScope);
    if (drawBusy) return;
    if (previous && !document.querySelector("#confirm-redraw")?.checked) {
      document.querySelector("#draw-status").textContent = "برای اجرای دوباره، گزینه تأیید قرعه‌کشی مجدد را انتخاب کنید.";
      document.querySelector("#confirm-redraw").focus(); return;
    }
    drawBusy = true; render();
    try { state = await api.createDraw({ disciplineId: drawScope, replaceDrawId: previous?.id }); notify("قرعه‌کشی ثبت و ذخیره شد."); }
    catch (error) { notify(error.message, true); }
    finally { drawBusy = false; render(); }
  });
  document.querySelector("#save-manual-draw").addEventListener("click", async () => {
    const previous = state.draws.find(draw => draw.disciplineId === drawScope);
    if (drawBusy) return;
    if (previous && !document.querySelector("#confirm-redraw")?.checked) { notify("ابتدا جایگزینی نوبت قبلی را تأیید کنید.", true); return; }
    const entries = Array.from(document.querySelectorAll("[data-order-team]"), input => ({ teamId: Number(input.dataset.orderTeam), drawOrder: input.value }));
    drawBusy = true;
    try { state = await api.createDraw({ disciplineId: drawScope, method: "manual", entries, replaceDrawId: previous?.id }); notify("نوبت‌های دستی ذخیره شدند."); }
    catch (error) { notify(error.message, true); }
    finally { drawBusy = false; render(); }
  });
  const latest = state.draws.find(d => d.disciplineId === drawScope);
  document.querySelector("#show-draw")?.addEventListener("click", async () => {
    try { await api.setDisplay({ mode: "draw", drawId: latest.id }); await openDisplay(); notify("قرعه‌کشی روی نمایشگر سالن قرار گرفت."); } catch (error) { notify(error.message, true); }
  });
  document.querySelector("#show-standings")?.addEventListener("click", () => api.setDisplay({ mode: "standings" }).catch(error => notify(error.message, true)));
  document.querySelector("#export-draw")?.addEventListener("click", () => exportReport({ type: "draw", drawId: latest.id }));
  document.querySelectorAll("[data-export-draw]").forEach(b => b.addEventListener("click", () => exportReport({ type: "draw", drawId: b.dataset.exportDraw })));
}
async function exportReport(payload) {
  try { const result = await api.exportReport(payload); if (!result.canceled) notify("فایل PDF ذخیره شد."); }
  catch (error) { notify(error.message, true); }
}

function combinedTeam() { return state.combinedTeams.find(t=>t.teamId===Number(value("team"))); }
function renderCombinedFields() {
  document.getElementById("combined-save-status")?.remove();
  const team=combinedTeam(), slot=team.rounds[selectedRound-1], result=state.results.find(r=>r.teamId===team.teamId && r.disciplineId==="combined");
  const status={Pending:"در انتظار",Partial:"در حال تکمیل",Completed:"کامل"}[team.status];
  document.getElementById("result-fields").innerHTML=`<div class="combined-status"><b>وضعیت تیم: ${status}</b><span>هر ورزشکار جدا ذخیره می‌شود؛ میانگین تیم پس از ثبت هر دو نفر محاسبه می‌شود.</span></div>
    <div class="form-grid"><div class="field"><label for="combined-round">دور مسابقه</label><select id="combined-round" ${entryBusy ? "disabled" : ""}><option value="1" ${selectedRound===1 ? "selected" : ""}>دور ۱ — ورزشکار اول</option><option value="2" ${selectedRound===2 ? "selected" : ""}>دور ۲ — ورزشکار دوم</option></select></div>
    <div class="lane-card" id="lane-assignment"><div class="slot-badges">${slotBadge("number",slot.athleteNumber)}${slotBadge("round",selectedRound)}${slotBadge("heat",slot.heat)}${slotBadge("lane",slot.lane)}</div></div>
    <div class="field"><label for="athlete-primary">نام همین ورزشکار</label><input id="athlete-primary" value="${escapeAttr(slot.athlete.name)}"></div>
    <div class="field"><label>زمان همین ورزشکار</label>${timePicker("primary",true)}</div>
    <div class="field"><label for="penalty">جریمه همین ورزشکار (ثانیه)</label><input id="penalty" type="number" min="0" max="3600" step="0.01" value="${(slot.score?.penaltyMs ?? 0)/1000}"></div>
    <div class="field"><label for="judge">نام داور</label><input id="judge" value="${escapeAttr(slot.score?.judge ?? "")}"></div></div>
    <div class="actions">${slot.score ? `<button class="btn danger" id="delete-round">حذف رکورد همین ورزشکار</button>` : ""}${slot.score?.penaltyMs>0 ? `<button class="btn danger" id="delete-round-penalty">پاک‌کردن جریمه همین ورزشکار</button>` : ""}${result?.legacyTeamPenaltyMs>0 ? `<button class="btn danger" id="delete-legacy-penalty">پاک‌کردن جریمه مشترک قبلی</button>` : ""}</div>
    <div class="round-summary">${team.rounds.map(r=>`<p>دور ${r.athlete.round}: ${escapeHtml(r.athlete.name || "بدون نام")} — لاین ${r.lane ?? "—"} — ${r.score ? formatTime(r.score.rawMs+r.score.penaltyMs) : "ثبت نشده"}</p>`).join("")}${result?.legacyTeamPenaltyMs ? `<p>جریمه مشترک منتقل‌شده از نسخه قبل: ${result.legacyTeamPenaltyMs/1000} ثانیه؛ جدا از جریمه فردی</p>` : ""}</div>`;
  document.getElementById("note").value=slot.score?.note ?? "";
  if (slot.score) for (const [part,number] of [["m",Math.floor(slot.score.rawMs/60000)],["s",Math.floor(slot.score.rawMs%60000/1000)],["h",Math.floor(slot.score.rawMs%1000/10)]]) document.getElementById(`primary-${part}`).value=String(number);
  document.getElementById("combined-round").addEventListener("change",e=>{selectedRound=Number(e.target.value);renderCombinedFields();});
  document.getElementById("delete-round-penalty")?.addEventListener("click",()=>deleteSafely("round_penalty",slot.score.id));
  document.getElementById("delete-legacy-penalty")?.addEventListener("click",()=>deleteSafely("result_penalty",result.id));
  document.getElementById("delete-round")?.addEventListener("click",()=>deleteSafely("round",slot.score.id));
  document.querySelectorAll("#result-fields input,#result-fields select").forEach(input=>{input.addEventListener("input",updateCombinedPreview);input.addEventListener("change",updateCombinedPreview);});
  document.querySelectorAll(".time-part").forEach(part=>part.querySelector("label").htmlFor=part.querySelector("select").id);
  const save=document.getElementById("save-result");save.textContent="ذخیره مستقل همین ورزشکار";
  const hint=document.createElement("p");hint.id="combined-save-status";hint.className="inline-status";hint.setAttribute("role","status");save.closest(".actions").before(hint);
  if(result?.status==="approved") {
    const reopen=document.createElement("button");reopen.id="reopen-combined";reopen.className="btn ghost";reopen.textContent="بازکردن نتیجه برای اصلاح";
    reopen.onclick=async()=>{try{await api.reopenResult({resultId:result.id});notify("نتیجه برای اصلاح باز شد؛ اکنون فقط دور انتخاب‌شده را ذخیره کنید.");}catch(error){notify(error.message,true);}};
    document.getElementById("result-fields").append(reopen);
  }
  if(slot.supplemental){const notice=document.createElement("p");notice.className="inline-status";notice.textContent="این تیم پس از شروع اضافه شده و نوبت تکمیلی مستقل دارد؛ شماره‌ها و لاین‌های قبلی تغییر نکرده‌اند.";document.getElementById("lane-assignment").append(notice);}
  document.getElementById("team").disabled=entryBusy; document.getElementById("discipline").disabled=entryBusy;
  updateCombinedPreview();
  help.decorate(document.getElementById("content"));
  help.attach(document.getElementById("lane-assignment"),"lane","lane-assignment");
}
function updateCombinedPreview() {
  const raw=readTime("primary"), penalty=Number(value("penalty"))*1000;
  document.getElementById("preview").textContent=raw>0 && Number.isFinite(penalty) ? formatTime(raw+penalty) : "زمان همین ورزشکار را کامل کنید";
  const team=combinedTeam(),slot=team?.rounds[selectedRound-1],result=state.results.find(r=>r.teamId===team?.teamId&&r.disciplineId==="combined");
  const gate=combinedSaveState({busy:entryBusy,approved:result?.status==="approved",lane:slot?.lane,rawMs:raw,penaltyMs:penalty});
  document.getElementById("save-result").disabled=!gate.enabled;
  const hint=document.getElementById("combined-save-status");if(hint)hint.textContent=gate.reason;
}
async function saveCombinedRound() {
  if (entryBusy) return;
  const team=combinedTeam(), round=selectedRound, teamId=team.teamId;
  const payload={teamId,round,lane:team.rounds[round-1].lane,athleteName:value("athlete-primary"),rawMs:readTime("primary"),
    penaltyMs:Number(value("penalty"))*1000,note:value("note"),judge:value("judge"),expectedRevision:state.revision};
  selectedTeam=String(teamId);selectedDiscipline="combined";entryBusy=true;document.getElementById("save-result").disabled=true;
  try {
    const next=await api.saveRoundScore(payload);
    const individual=next.individualLeaderboard.find(r=>r.teamId===teamId && r.round===round),teamRank=next.itemLeaderboards.combined.find(r=>r.team.id===teamId)?.rank;
    notify(`رکورد ورزشکار فوراً ذخیره شد؛ رتبه انفرادی: ${individual.rank}؛ ${teamRank ? `رتبه تیمی: ${teamRank}` : "تیم در انتظار نفر دیگر"}`);
  } catch(error) {notify(error.message,true);} finally {entryBusy=false;render();}
}
function individualTable() {
  return `<div class="table-wrap"><table><thead><tr><th>رتبه</th><th>ورزشکار</th><th>تیم</th><th>شماره ورزشکار</th><th>دور</th><th>گروه</th><th>لاین</th><th>زمان خام</th><th>جریمه</th><th>زمان نهایی</th></tr></thead><tbody>${state.individualLeaderboard.map(r=>`<tr><td>${r.rank ?? "—"}</td><td>${escapeHtml(r.athlete.name || `ورزشکار دور ${r.athlete.round}`)}</td><td>${escapeHtml(r.team.name)}</td><td>${slotBadge("number",r.athleteNumber)}</td><td>${slotBadge("round",r.athlete.round)}</td><td>${slotBadge("heat",r.heat)}</td><td>${slotBadge("lane",r.lane)}</td><td>${formatTime(r.result?.rawMs)}</td><td>${r.result ? r.result.penaltyMs/1000 : "—"}</td><td>${formatTime(r.finalValue)}</td></tr>`).join("")}</tbody></table></div>`;
}
async function deleteSafely(kind,id) {
  if (document.getElementById("delete-dialog")) return;
  const dialog=document.createElement("dialog");dialog.id="delete-dialog";dialog.className="delete-dialog";
  dialog.innerHTML='<h2>تأیید اول: آغاز حذف</h2><p>این عملیات داده‌های انتخاب‌شده را پاک می‌کند. در مرحله بعد، خلاصه دقیق را بررسی کنید.</p><div class="actions"><button id="delete-cancel" class="btn ghost">انصراف</button><button id="delete-next" class="btn danger">بررسی مرحله دوم</button></div>';
  if(kind==="reset") {dialog.querySelector("h2").textContent="تأیید اول: پاک‌کردن کل نرم‌افزار";dialog.querySelector("p").textContent="آیا می‌خواهید همه داده‌های مسابقه، تنظیمات سفارشی و پشتیبان‌های خودکار داخلی پاک شوند و برنامه مثل روز اول شود؟ این کار قابل برگشت نیست. در صورت نیاز، ابتدا از دکمه نسخه پشتیبان استفاده کنید.";}
  const focus=document.activeElement;
  document.body.append(dialog);help.decorate(dialog);dialog.showModal();
  let timer;
  function close(){clearTimeout(timer);dialog.close();dialog.remove();focus?.focus();}
  dialog.addEventListener("cancel",e=>{e.preventDefault();close();});dialog.querySelector("#delete-cancel").onclick=close;
  dialog.querySelector("#delete-next").onclick=async()=>{
    dialog.querySelector("#delete-next").disabled=true;
    try {
      const review=await api.prepareDeletion({kind,id});
      dialog.innerHTML='<h2>تأیید دوم: حذف نهایی</h2><p id="delete-summary"></p><p>پس از دو ثانیه، کلمه «تایید» را وارد کنید.</p><label for="delete-confirmation">کلمه تأیید</label><input id="delete-confirmation" autocomplete="off"><p id="delete-error" role="status"></p><div class="actions"><button id="delete-cancel" class="btn ghost">انصراف</button><button id="delete-final" class="btn danger" disabled>حذف نهایی</button></div>';
      dialog.querySelector("#delete-summary").textContent=review.summary;
      help.decorate(dialog);
      const input=dialog.querySelector("#delete-confirmation"),button=dialog.querySelector("#delete-final");let ready=false;
      const enable=()=>button.disabled=!ready || input.value!=="تایید";
      timer=setTimeout(()=>{ready=true;enable();},review.waitMs);input.oninput=enable;input.focus();dialog.querySelector("#delete-cancel").onclick=close;
      button.onclick=async()=>{button.disabled=true;entryBusy=true;try{await api.confirmDeletion({token:review.token,confirmation:input.value});close();notify(kind==="reset" ? "همه داده‌ها پاک شدند؛ برنامه آماده شروع از صفر است." : "حذف ثبت شد؛ رتبه‌ها دوباره محاسبه شدند.");}catch(error){dialog.querySelector("#delete-error").textContent=error.message;}finally{entryBusy=false;render();}};
    } catch(error){notify(error.message,true);close();}
  };
}
