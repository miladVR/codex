"use strict";
const api = window.scoreboardAPI;
let state, initialized = false, approvedKeys = new Set(), updatedTeams = new Set();
let page = 0, paused = false, highlightUntil = 0;
let capacity = 5;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const number = value => Number(value).toLocaleString("fa-IR");
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);
const approvalKey = item => `${item.id}:${item.approvedAt}`;
function receive(next) {
  const changes = next.results.filter(r => r.status === "approved" && !approvedKeys.has(approvalKey(r)));
  const modeChanged = state && (state.settings.displayMode !== next.settings.displayMode || state.settings.displayDrawId !== next.settings.displayDrawId);
  state = next;
  approvedKeys = new Set(next.results.filter(r => r.status === "approved").map(approvalKey));
  if (modeChanged) page = 0;
  if (initialized && changes.length) {
    updatedTeams = new Set(changes.map(r => r.teamId)); highlightUntil = Date.now() + 10000;
    if (state.settings.displayMode !== "draw") {
      const index = state.standings.findIndex(row => row.team.id === changes.at(-1).teamId);
      page = Math.max(0, Math.floor(index / pageSize()));
    }
    const result = changes.at(-1);
    const team = state.teams.find(t => t.id === result.teamId);
    const discipline = state.disciplines.find(d => d.id === result.disciplineId);
    document.querySelector("#announcement").textContent = `نتیجه تازه · ${discipline?.name ?? ""} · ${team?.name ?? ""}${changes.length > 1 ? ` و ${number(changes.length - 1)} نتیجه دیگر` : ""} تأیید شد`;
    if (state.settings.audioEnabled) window.scoreboardSound(state.settings.audioVolume);
  }
  render(); initialized = true;
}
api.onStateChange(receive);
api.getState().then(initial => { if (!initialized) receive(initial); });
function currentDraw() { return state.draws?.find(d => d.id === state.settings.displayDrawId); }
function isDraw() { return state.settings.displayMode === "draw" && Boolean(currentDraw()); }
function pageSize() { return capacity; }
function rowsCount() { return isDraw() ? currentDraw().entries.length : state.standings.length; }
function pages() { return Math.max(1, Math.ceil(rowsCount() / pageSize())); }
function render() {
  if (!state) return;
  page = Math.min(page, pages() - 1);
  if (Date.now() > highlightUntil) updatedTeams.clear();
  const drawMode = isDraw(); document.body.classList.toggle("draw-mode", drawMode);
  document.querySelector("#competition-name").textContent = state.settings.competitionName;
  document.querySelector("#venue").textContent = state.settings.venue;
  document.querySelector("#display-message").textContent = state.settings.displayMessage;
  document.querySelector("#mode-label").textContent = drawMode ? "قرعه‌کشی رسمی تیم‌ها" : "نتایج رسمی زنده";
  document.querySelector("#progress").textContent = drawMode ? `${number(currentDraw().entries.length)} تیم` : `${number(state.results.filter(r => r.status === "approved").length)} نتیجه تأییدشده`;
  document.querySelector("#page-info").textContent = `صفحه ${number(page + 1)} از ${number(pages())}`;
  document.querySelector("#table-title").textContent = drawMode ? currentDraw().title : "جدول رده‌بندی تیمی";
  document.querySelector("#table-subtitle").textContent = drawMode ? "شماره‌ها ترتیب حضور هستند، نه رتبه مسابقه" : "کمترین مجموع رتبه‌ها، جایگاه بهتر";
  renderPodium();
  if (drawMode) renderDraw(); else renderStandings();
  document.querySelector("#pause-pages").textContent = rotationEnabled() ? "توقف گردش" : "ادامه گردش";
  document.querySelector("#pause-pages").disabled = pages() === 1 || state.settings.autoRotate === false || reducedMotion.matches;
  document.querySelector("#previous-page").disabled = pages() === 1;
  document.querySelector("#next-page").disabled = pages() === 1;
  requestAnimationFrame(fitPage);
}
function fitPage() {
  const area = document.querySelector("#standings");
  let count;
  if (isDraw()) {
    const ticket = area.querySelector(".draw-ticket");
    if (!ticket) return;
    const columns = innerWidth < 520 ? 1 : innerWidth < 900 ? 2 : 3;
    count = columns * Math.max(1, Math.floor((area.clientHeight + 14) / (ticket.getBoundingClientRect().height + 14)));
  } else {
    const row = area.querySelector("tbody tr");
    if (!row) return;
    const head = area.querySelector("thead").getBoundingClientRect().height;
    count = Math.max(1, Math.floor((area.clientHeight - head - 3) / row.getBoundingClientRect().height));
  }
  count = Math.min(12, count);
  if (count !== capacity) { capacity = count; page = Math.min(page, pages()-1); render(); }
}
function renderPodium() {
  const leaders = state.standings.filter(r => r.officialRank !== null && r.officialRank <= 3).slice(0, 3);
  document.querySelector("#podium").innerHTML = leaders.length ? leaders.map(row => `<article class="podium-card ${row.officialRank === 1 ? "first" : ""}"><div class="medal">${number(row.officialRank)}</div><div><small>${escapeHtml(row.team.organization || "تیم شرکت‌کننده")}</small><b>${escapeHtml(row.team.name)}</b></div><div class="score"><small>مجموع رتبه</small><strong>${number(row.total)}</strong></div></article>`).join("") : `<article class="podium-card first"><div class="medal">—</div><div><small>مسیر قهرمانی</small><b>در انتظار تکمیل پنج رشته</b></div></article>`;
}
function renderStandings() {
  const target = document.querySelector("#standings");
  if (!state.teams.length) { target.innerHTML = '<div class="empty">تیم‌های شرکت‌کننده به‌زودی روی این صفحه قرار می‌گیرند.</div>'; return; }
  const rows = state.standings.slice(page * pageSize(), (page + 1) * pageSize());
  target.innerHTML = `<table><thead><tr><th>رتبه</th><th>تیم</th>${state.disciplines.map(d => `<th>${escapeHtml(d.name)}</th>`).join("")}<th>مجموع</th><th>تکمیل</th></tr></thead><tbody>${rows.map(row => `<tr class="${updatedTeams.has(row.team.id) ? "updated" : ""}"><td><span class="rank ${row.officialRank === 1 ? "first" : ""}">${row.officialRank === null ? "—" : number(row.officialRank)}</span></td><td class="team">${escapeHtml(row.team.name)}</td>${state.disciplines.map(d => `<td>${row.disciplineRanks[d.id] === null ? "—" : number(row.disciplineRanks[d.id])}</td>`).join("")}<td class="total">${row.officialRank === null ? "—" : number(row.total)}</td><td class="complete">${number(row.completed)}/${number(state.disciplines.length)}</td></tr>`).join("")}</tbody></table>`;
}
function renderDraw() {
  document.querySelector("#standings").innerHTML = `<div class="draw-grid">${currentDraw().entries.slice(page * pageSize(), (page + 1) * pageSize()).map((e,i) => `<article class="draw-ticket"><strong>${number(page * pageSize() + i + 1)}</strong><div><b>${escapeHtml(e.name)}</b><small>${escapeHtml(e.organization || e.code)}</small></div></article>`).join("")}</div>`;
}
function rotationEnabled() { return !paused && state.settings.autoRotate !== false && !reducedMotion.matches; }
document.querySelector("#next-page").addEventListener("click", () => { page = (page + 1) % pages(); render(); });
document.querySelector("#previous-page").addEventListener("click", () => { page = (page - 1 + pages()) % pages(); render(); });
document.querySelector("#pause-pages").addEventListener("click", () => { paused = !paused; render(); });
setInterval(() => { if (state && rotationEnabled() && Date.now() > highlightUntil && !document.querySelector(".page-controls").contains(document.activeElement)) { page = (page + 1) % pages(); render(); } }, 10000);
window.addEventListener("resize", render);
function tick() { const now = new Date(); document.querySelector("#clock").textContent = now.toLocaleTimeString("fa-IR", { hour:"2-digit", minute:"2-digit" }); document.querySelector("#date").textContent = now.toLocaleDateString("fa-IR", { weekday:"long", day:"numeric", month:"long" }); }
tick(); setInterval(tick, 1000);
