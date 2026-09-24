"use strict";

const api = window.scoreboardAPI;
let state;
let currentView = "dashboard";
const titles = { dashboard: "تابلوی نتایج", entry: "ثبت نتیجه", approvals: "تأیید سرداور", teams: "تیم‌ها", settings: "تنظیمات و نمایشگر", audit: "سوابق تغییرات" };

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelector("#display-btn").addEventListener("click", () => api.openDisplay().then(() => notify("نمایشگر نتایج باز شد.")));
document.querySelector("#backup-btn").addEventListener("click", async () => { const result = await api.backup(); if (!result.canceled) notify("نسخه پشتیبان ذخیره شد."); });
api.onStateChange((next) => { state = next; render(); });
api.getState().then((initial) => { state = initial; render(); });

function setView(view) {
  currentView = view;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  render();
}

function render() {
  if (!state) return;
  document.querySelector("#view-title").textContent = titles[currentView];
  document.querySelector("#venue").textContent = state.settings.venue;
  const drafts = state.results.filter((result) => result.status === "draft").length;
  document.querySelector("#draft-badge").textContent = drafts || "";
  const views = { dashboard: dashboardView, entry: entryView, approvals: approvalsView, teams: teamsView, settings: settingsView, audit: auditView };
  document.querySelector("#content").innerHTML = views[currentView]();
  bindCurrentView();
}

function dashboardView() {
  const approved = state.results.filter((result) => result.status === "approved").length;
  const drafts = state.results.filter((result) => result.status === "draft").length;
  return `<div class="card hero"><h2>${escapeHtml(state.settings.competitionName)}</h2><p>جدول رسمی فقط از نتایج تأییدشده ساخته می‌شود؛ کمترین مجموع رتبه‌ها، جایگاه بهتر را تعیین می‌کند.</p></div>
  <div class="grid metrics"><div class="metric"><b>${state.teams.length}</b><span>تیم حاضر</span></div><div class="metric"><b>${approved}</b><span>نتیجه تأییدشده</span></div><div class="metric"><b>${drafts}</b><span>در انتظار تأیید</span></div><div class="metric"><b>${state.disciplines.length}</b><span>رشته مسابقه</span></div></div>
  <div class="card"><h2>جدول امتیازات تیمی</h2>${standingsTable()}</div>`;
}

function standingsTable() {
  if (!state.teams.length) return `<div class="empty">هنوز تیمی ثبت نشده است.</div>`;
  const heads = state.disciplines.map((item) => `<th class="center">${escapeHtml(item.name)}</th>`).join("");
  const rows = state.standings.map((row) => `<tr><td><span class="rank ${row.officialRank === 1 ? "first" : ""}">${row.officialRank ?? "—"}</span></td><td><b>${escapeHtml(row.team.name)}</b><br><small>${escapeHtml(row.team.organization)}</small></td>${state.disciplines.map((item) => `<td class="center">${row.disciplineRanks[item.id] ?? "—"}</td>`).join("")}<td class="center"><b>${row.completed ? row.total : "—"}</b></td><td class="center"><span class="tag ${row.completed === state.disciplines.length ? "green" : ""}">${row.completed}/${state.disciplines.length}</span></td></tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr><th>رتبه</th><th>تیم</th>${heads}<th class="center">مجموع</th><th class="center">تکمیل</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function entryView() {
  if (!state.teams.length) return `<div class="card empty">ابتدا از بخش «تیم‌ها» حداقل یک تیم ثبت کنید.</div>`;
  return `<div class="entry-layout"><div class="card"><h2>فرم ثبت نتیجه داور</h2><div class="form-grid"><div class="field"><label>رشته مسابقه</label><select id="discipline">${state.disciplines.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}</select></div><div class="field"><label>تیم</label><select id="team">${state.teams.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}</select></div></div><div id="result-fields"></div><div class="field"><label>شرح خطا یا توضیحات داور</label><textarea id="note" placeholder="علت جریمه، وضعیت خاص یا توضیح ضروری…"></textarea></div><div class="result-preview"><span>نتیجه محاسبه‌شده</span><strong id="preview">—</strong></div><div class="actions" style="margin-top:16px"><button id="save-result" class="btn primary">ذخیره و ارسال برای تأیید</button></div></div><aside class="card guide"><h3>کنترل قبل از ثبت</h3><ol><li>نام تیم و رشته را با برگه داوری تطبیق دهید.</li><li>دقیقه، ثانیه و صدم ثانیه را از فهرست‌های جداگانه انتخاب کنید.</li><li>علت هر جریمه را در توضیحات بنویسید.</li><li>نتیجه پس از تأیید سرداور روی نمایشگر عمومی دیده می‌شود.</li></ol></aside></div>`;
}

function approvalsView() {
  const drafts = state.results.filter((result) => result.status === "draft");
  const approved = state.results.filter((result) => result.status === "approved").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12);
  return `<div class="card"><h2>صف تأیید سرداور</h2>${resultsTable(drafts, "approve")}</div><div class="card"><h2>آخرین نتایج قفل‌شده</h2>${resultsTable(approved, "reopen")}</div>`;
}

function resultsTable(results, action) {
  if (!results.length) return `<div class="empty">موردی برای نمایش وجود ندارد.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>تیم</th><th>رشته</th><th class="center">نتیجه</th><th>داور</th><th></th></tr></thead><tbody>${results.map((result) => { const discipline = disciplineById(result.disciplineId); return `<tr><td>${escapeHtml(teamById(result.teamId)?.name)}</td><td>${escapeHtml(discipline?.name)}</td><td class="center">${resultText(result, discipline)}</td><td>${escapeHtml(result.judge || "—")}</td><td><button class="btn ${action === "approve" ? "success" : "ghost"}" data-action="${action}" data-id="${result.id}">${action === "approve" ? "تأیید و قفل" : "بازکردن برای اصلاح"}</button></td></tr>`; }).join("")}</tbody></table></div>`;
}

function teamsView() {
  return `<div class="card"><h2>افزودن تیم</h2><div class="form-grid"><div class="field"><label>نام تیم</label><input id="team-name" placeholder="مثلاً تیم مس سرچشمه"></div><div class="field"><label>شرکت یا مجموعه</label><input id="team-org" placeholder="نام سازمان"></div></div><div class="actions" style="margin-top:16px"><button id="add-team" class="btn primary">ثبت تیم</button></div></div><div class="grid team-list">${state.teams.map((team) => `<div class="team"><b>${escapeHtml(team.name)}</b><small>${escapeHtml(team.organization || "بدون نام مجموعه")}</small><small>${team.code}</small></div>`).join("") || `<div class="card empty">هنوز تیمی ثبت نشده است.</div>`}</div>`;
}

function settingsView() {
  return `<div class="grid settings-grid"><div class="card"><h2>مشخصات مسابقه</h2><div class="field"><label>عنوان مسابقه</label><input id="competition-name" value="${escapeAttr(state.settings.competitionName)}"></div><div class="field"><label>محل و سال برگزاری</label><input id="competition-venue" value="${escapeAttr(state.settings.venue)}"></div><div class="field"><label>پیام پایین نمایشگر</label><input id="display-message" value="${escapeAttr(state.settings.displayMessage)}"></div><div class="switch-row"><span>پخش صدای اعلان نتیجه</span><input id="audio-enabled" type="checkbox" ${state.settings.audioEnabled ? "checked" : ""}></div><div class="actions" style="margin-top:16px"><button id="save-settings" class="btn primary">ذخیره تنظیمات</button></div></div><div class="card"><h2>نمایشگر دوم</h2><p style="color:var(--muted);line-height:2">با انتخاب «بازکردن نمایشگر»، پنجره نتایج روی مانیتور دوم به‌صورت تمام‌صفحه باز می‌شود. اگر فقط یک نمایشگر متصل باشد، پنجره عادی باز می‌شود تا آن را جابه‌جا کنید.</p><div class="actions"><button id="open-display-alt" class="btn primary">بازکردن نمایشگر</button><button id="close-display" class="btn ghost">بستن نمایشگر</button><button id="backup-alt" class="btn ghost">ذخیره نسخه پشتیبان</button></div></div></div>`;
}

function auditView() {
  return `<div class="card"><h2>دفتر ثبت تغییرات</h2>${state.audits.length ? state.audits.map((item) => `<div class="audit-item"><time>${new Date(item.createdAt).toLocaleString("fa-IR")}</time><span>${escapeHtml(item.summary)}</span><span class="tag">${escapeHtml(item.action)}</span></div>`).join("") : `<div class="empty">هنوز تغییری ثبت نشده است.</div>`}</div>`;
}

function bindCurrentView() {
  if (currentView === "entry") bindEntry();
  if (currentView === "teams") document.querySelector("#add-team")?.addEventListener("click", addTeam);
  if (currentView === "approvals") document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => mutateResult(button)));
  if (currentView === "settings") {
    document.querySelector("#save-settings").addEventListener("click", saveSettings);
    document.querySelector("#open-display-alt").addEventListener("click", () => api.openDisplay());
    document.querySelector("#close-display").addEventListener("click", () => api.closeDisplay());
    document.querySelector("#backup-alt").addEventListener("click", () => api.backup());
  }
}

function bindEntry() {
  const discipline = document.querySelector("#discipline");
  discipline.addEventListener("change", renderResultFields);
  document.querySelector("#save-result").addEventListener("click", saveResult);
  renderResultFields();
}

function renderResultFields() {
  const discipline = disciplineById(document.querySelector("#discipline").value);
  const container = document.querySelector("#result-fields");
  if (discipline.mode === "score") {
    container.innerHTML = `<div class="form-grid" style="margin-top:17px"><div class="field"><label>امتیاز آزمون</label><input id="scientific-score" type="number" min="0" max="100" step="0.01"></div><div class="field"><label>زمان پاسخ‌گویی برای رفع تساوی</label>${timePicker("scientific")}</div></div>`;
  } else {
    container.innerHTML = `<div class="form-grid" style="margin-top:17px"><div class="field"><label>${discipline.mode === "pair_time" ? "نام ورزشکار اول" : "نام ورزشکار"}</label><input id="athlete-primary"></div>${discipline.mode === "pair_time" ? `<div class="field"><label>نام ورزشکار دوم</label><input id="athlete-secondary"></div>` : ""}<div class="field"><label>زمان ${discipline.mode === "pair_time" ? "نفر اول" : "خام"}</label>${timePicker("primary")}</div>${discipline.mode === "pair_time" ? `<div class="field"><label>زمان نفر دوم</label>${timePicker("secondary")}</div>` : ""}<div class="field"><label>مجموع جریمه (ثانیه)</label><input id="penalty" type="number" min="0" max="3600" step="1" value="0"></div><div class="field"><label>نام داور</label><input id="judge" placeholder="نام ثبت‌کننده نتیجه"></div></div>`;
  }
  container.querySelectorAll("select,input").forEach((field) => field.addEventListener("input", updatePreview));
  updatePreview();
}

function timePicker(prefix) {
  const options = (count) => Array.from({ length: count }, (_, index) => `<option value="${index}">${String(index).padStart(2, "0")}</option>`).join("");
  const placeholder = `<option value="" selected disabled>ــ</option>`;
  return `<div class="time-picker"><div class="time-part"><label>دقیقه</label><select id="${prefix}-m">${placeholder}${options(100)}</select></div><span class="time-separator">:</span><div class="time-part"><label>ثانیه</label><select id="${prefix}-s">${placeholder}${options(60)}</select></div><span class="time-separator">.</span><div class="time-part"><label>صدم</label><select id="${prefix}-h">${placeholder}${options(100)}</select></div></div>`;
}

function readTime(prefix) {
  const parts = [value(`${prefix}-m`), value(`${prefix}-s`), value(`${prefix}-h`)];
  if (parts.some((part) => part === "")) return null;
  return (Number(parts[0]) * 60_000) + (Number(parts[1]) * 1_000) + (Number(parts[2]) * 10);
}
function updatePreview() {
  const discipline = disciplineById(value("discipline"));
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
  try {
    await api.saveResult({ teamId: Number(value("team")), disciplineId: discipline.id, athletePrimary: value("athlete-primary"), athleteSecondary: value("athlete-secondary"), rawPrimaryMs: discipline.mode === "score" ? null : readTime("primary"), rawSecondaryMs: discipline.mode === "pair_time" ? readTime("secondary") : null, penaltyMs: (Number(value("penalty")) || 0) * 1000, scientificScore: discipline.mode === "score" ? value("scientific-score") : null, scientificDurationMs: discipline.mode === "score" ? readTime("scientific") : null, note: value("note"), judge: value("judge") });
    notify("نتیجه به صف تأیید سرداور ارسال شد.");
  } catch (error) { notify(error.message, true); }
}

async function addTeam() { try { await api.addTeam({ name: value("team-name"), organization: value("team-org") }); notify("تیم جدید ثبت شد."); } catch (error) { notify(error.message, true); } }
async function mutateResult(button) { try { if (button.dataset.action === "approve") await api.approveResult({ resultId: Number(button.dataset.id), approvedBy: "سرداور" }); else await api.reopenResult({ resultId: Number(button.dataset.id) }); notify(button.dataset.action === "approve" ? "نتیجه تأیید و روی نمایشگر منتشر شد." : "نتیجه برای اصلاح باز شد."); } catch (error) { notify(error.message, true); } }
async function saveSettings() { await api.updateSettings({ competitionName: value("competition-name"), venue: value("competition-venue"), displayMessage: value("display-message"), audioEnabled: document.querySelector("#audio-enabled").checked }); notify("تنظیمات ذخیره شد."); }

function resultText(result, discipline) { return discipline.mode === "score" ? `${result.scientificScore ?? "—"} / ${formatTime(result.scientificDurationMs)}` : formatTime(metric(result, discipline)); }
function metric(result, discipline) { if (discipline.mode === "score") return result.scientificScore; if (discipline.mode === "pair_time") return (result.rawPrimaryMs + result.rawSecondaryMs) / 2 + result.penaltyMs; return result.rawPrimaryMs + result.penaltyMs; }
function formatTime(ms) { if (!Number.isFinite(ms)) return "—"; const total = Math.round(ms / 10); return `${String(Math.floor(total / 6000)).padStart(2, "0")}:${String(Math.floor((total % 6000) / 100)).padStart(2, "0")}.${String(total % 100).padStart(2, "0")}`; }
function teamById(id) { return state.teams.find((item) => item.id === id); }
function disciplineById(id) { return state.disciplines.find((item) => item.id === id); }
function value(id) { return document.getElementById(id)?.value ?? ""; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function escapeAttr(value) { return escapeHtml(value); }
function notify(message, error = false) { const toast = document.querySelector("#toast"); toast.textContent = message; toast.className = `show${error ? " error" : ""}`; clearTimeout(notify.timer); notify.timer = setTimeout(() => { toast.className = ""; }, 3200); }
