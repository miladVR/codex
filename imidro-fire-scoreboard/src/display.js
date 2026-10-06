"use strict";
const api = window.scoreboardAPI;
let state, page = 0, capacity = 5, paused = false, highlightUntil = 0;
let updatedTeams = new Set(), resultKeys = new Map(), initialized = false;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const number = value => value == null ? "—" : Number(value).toLocaleString("fa-IR");
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[c]);
const resultKey = result => JSON.stringify(result);
function currentDraw() { return state.draws.find(draw => draw.id === state.settings.displayDrawId); }
function currentItem() { return state.disciplines.find(item => item.id === state.settings.displayItemId); }
function isDraw() { return state.settings.displayMode === "draw" && Boolean(currentDraw()); }
function isItem() { return state.settings.displayMode === "item" && Boolean(currentItem()); }
function isIndividual() { return state.settings.displayMode==="individual"; }
function activeRows(source = state) {
  if (source.settings.displayMode==="individual") return source.individualLeaderboard;
  return source.settings.displayMode === "item" ? source.itemLeaderboards[source.settings.displayItemId] ?? [] : source.liveStandings;
}
function receive(next) {
  document.querySelector("#connection-status").textContent = "ارتباط محلی برقرار";
  if (state && next.revision <= state.revision) return;
  if(state && next.resetId!==state.resetId) {page=0;capacity=5;paused=false;highlightUntil=0;updatedTeams.clear();resultKeys.clear();initialized=false;document.getElementById("announcement").textContent="";}
  const modeChanged = state && ["displayMode", "displayDrawId", "displayItemId"].some(key => state.settings[key] !== next.settings[key]);
  const changes = [...next.results.filter(result => resultKeys.get(result.id) !== resultKey(result)),...(state?.results ?? []).filter(result=>!next.results.some(r=>r.id===result.id))];
  const oldRanks = new Map(state ? activeRows(state).map(row => [row.team.id, (isItem() || isIndividual()) ? row.rank : row.officialRank]) : []);
  state = next;
  resultKeys = new Map(next.results.map(result => [result.id, resultKey(result)]));
  if (modeChanged) { page = 0; capacity = 5; }
  const relevant = isItem() ? changes.filter(result => result.disciplineId === currentItem().id) : changes;
  if (initialized && relevant.length) {
    updatedTeams = new Set(relevant.map(result => result.teamId));
    for (const row of activeRows()) if (oldRanks.has(row.team.id) && oldRanks.get(row.team.id) !== ((isItem() || isIndividual()) ? row.rank : row.officialRank)) updatedTeams.add(row.team.id);
    highlightUntil = Date.now() + 10000;
    if (!isDraw()) {
      const index = activeRows().findIndex(row => row.team.id === relevant.at(-1).teamId);
      page = Math.max(0, Math.floor(index / capacity));
    }
    const result = relevant.at(-1), team = state.teams.find(item => item.id === result.teamId);
    document.querySelector("#announcement").textContent = `به‌روزرسانی زنده · ${team?.name ?? ""} · ${result.status === "approved" ? "تأییدشده" : "موقت — در انتظار تأیید"}`;
    if (state.settings.audioEnabled) window.scoreboardSound(state.settings.audioVolume);
  }
  initialized = true; render();
}
async function synchronize() {
  try { receive(await api.getState()); }
  catch (error) { document.querySelector("#connection-status").textContent = `خطای ارتباط: ${error.message}`; }
}
api.onStateChange(receive);
synchronize();
// Recover a missed event after reload, sleep or temporary renderer interruption.
setInterval(synchronize, 5000);
function pages() { return Math.max(1, Math.ceil((isDraw() ? currentDraw().entries.length : activeRows().length) / capacity)); }
function render() {
  if (!state) return;
  page = Math.min(page, pages() - 1);
  if (Date.now() > highlightUntil) updatedTeams.clear();
  document.body.classList.toggle("draw-mode", isDraw());
  document.body.classList.toggle("item-mode", isItem() || isIndividual());
  document.querySelector("#competition-name").textContent = state.settings.competitionName;
  document.querySelector("#venue").textContent = [state.settings.venue,state.settings.eventDate].filter(Boolean).join(" · ");
  document.querySelector(".competition-logo").src=state.settings.competitionLogo || "../assets/competition-logo.jpg";
  const sponsors=document.querySelector("#sponsor-logos");sponsors.replaceChildren();
  for (const src of state.settings.sponsorLogos.filter(Boolean)) { const img=document.createElement("img");img.src=src;img.alt="حامی مسابقه";sponsors.append(img); }
  document.querySelector("#display-message").textContent = state.settings.displayMessage;
  document.querySelector("#mode-label").textContent = isDraw() ? "نوبت اجرای ثابت — نه رتبه" : "نتایج زندهٔ موقت و تأییدشده";
  document.querySelector("#progress").textContent = isDraw() ? `${number(currentDraw().entries.length)} تیم` : `${number(state.results.filter(result => result.status === "draft").length)} نتیجه موقت`;
  document.querySelector("#page-info").textContent = `صفحه ${number(page + 1)} از ${number(pages())}`;
  document.querySelector("#table-title").textContent = isDraw() ? currentDraw().title : isIndividual() ? "عملیات ترکیبی — رده‌بندی انفرادی" : isItem() ? currentItem().name : "رده‌بندی کل مسابقات — زنده";
  document.querySelector("#table-subtitle").textContent = isDraw() ? "شماره آبی = نوبت حضور؛ رتبه نیست" : "نوبت اجرا: آبی ثابت | رتبه امتیازی: طلایی متغیر";
  renderPodium();
  if (isDraw()) renderDraw(); else if (isIndividual()) renderIndividual(); else if (isItem()) renderItem(); else renderStandings();
  document.querySelector("#pause-pages").textContent = rotationEnabled() ? "توقف گردش" : "ادامه گردش";
  document.querySelector("#pause-pages").disabled = pages() === 1 || state.settings.autoRotate === false || reducedMotion.matches;
  document.querySelector("#previous-page").disabled = pages() === 1;
  document.querySelector("#next-page").disabled = pages() === 1;
  requestAnimationFrame(fitPage);
}
function fitPage() {
  if (!state) return;
  const area = document.querySelector("#standings"); let count;
  if (isDraw()) {
    const ticket = area.querySelector(".draw-ticket"); if (!ticket) return;
    const columns = innerWidth < 520 ? 1 : innerWidth < 900 ? 2 : 3;
    count = columns * Math.max(1, Math.floor((area.clientHeight + 14) / (ticket.getBoundingClientRect().height + 14)));
  } else {
    const row = area.querySelector("tbody tr"); if (!row) return;
    const head = area.querySelector("thead").getBoundingClientRect().height;
    count = Math.max(1, Math.floor((area.clientHeight - head - 3) / row.getBoundingClientRect().height));
  }
  count = Math.min(12, count);
  if (count !== capacity) { capacity = count; page = Math.min(page, pages() - 1); render(); }
}
function renderPodium() {
  if (isItem() || isIndividual() || isDraw()) { document.querySelector("#podium").innerHTML=""; return; }
  const leaders = state.liveStandings.filter(row => row.officialRank !== null && row.officialRank <= 3).slice(0, 3);
  document.querySelector("#podium").innerHTML = leaders.length ? leaders.map(row => `<article class="podium-card ${row.officialRank === 1 ? "first" : ""}"><div class="medal">${number(row.officialRank)}</div><div><small>زنده — نیازمند تأیید نهایی</small><b>${escapeHtml(row.team.name)}</b></div><div class="score"><small>مجموع رتبه</small><strong>${number(row.total)}</strong></div></article>`).join("") : '<article class="podium-card first"><div class="medal">—</div><div><b>در انتظار تکمیل پنج رشته</b></div></article>';
}
function rankBadge(rank) { return `<span class="rank ${rank === 1 ? "first" : ""}">${number(rank)}</span>`; }
function turnBadge(order) { return `<span class="turn" aria-label="نوبت اجرا ${number(order)}">${number(order)}</span>`; }
function renderStandings() {
  const rows = activeRows().slice(page * capacity, (page + 1) * capacity);
  document.querySelector("#standings").innerHTML = `<table class="overall-table"><thead><tr><th>رتبه امتیازی</th><th>تیم</th><th>نوبت عمومی</th>${state.disciplines.map(item => `<th>${escapeHtml(item.name)}</th>`).join("")}<th>مجموع رتبه</th><th>تکمیل</th></tr></thead><tbody>${rows.map(row => `<tr data-team-id="${row.team.id}" class="${updatedTeams.has(row.team.id) ? "updated" : ""}"><td>${rankBadge(row.officialRank)}</td><td class="team">${escapeHtml(row.team.name)}</td><td>${turnBadge(row.drawOrder)}</td>${state.disciplines.map(item => `<td>${number(row.disciplineRanks[item.id])}</td>`).join("")}<td class="total">${number(row.completed ? row.total : null)}</td><td class="complete">${number(row.completed)}/${number(state.disciplines.length)}</td></tr>`).join("")}</tbody></table>${rows.length ? "" : '<div class="empty">هنوز تیمی ثبت نشده است.</div>'}`;
}
function formatTime(ms) {
  if (!Number.isFinite(ms)) return "—";
  // Three decimals expose half-hundredths from the paired average; no hidden tie difference.
  const value = Math.round(ms);
  return `${String(Math.floor(value / 60000)).padStart(2, "0")}:${String(Math.floor(value % 60000 / 1000)).padStart(2, "0")}.${String(value % 1000).padStart(3, "0")}`;
}
function renderItem() {
  const item = currentItem(), rows = activeRows().slice(page * capacity, (page + 1) * capacity);
  document.querySelector("#standings").innerHTML = `<table class="item-table"><thead><tr><th>رتبه امتیازی</th><th>تیم</th><th>نوبت اجرا</th><th>${item.mode === "score" ? "زمان پاسخ" : "رکورد خام"}</th><th>جریمه</th><th>${item.mode === "score" ? "نمره نهایی" : "زمان نهایی"}</th><th>وضعیت</th></tr></thead><tbody>${rows.map(row => {
    const result = row.result;
    const raw = !result ? "—" : item.mode === "score" ? formatTime(result.scientificDurationMs) : item.mode === "pair_time" ? `${formatTime(result.rawPrimaryMs)} / ${formatTime(result.rawSecondaryMs)}` : formatTime(result.rawPrimaryMs);
    return `<tr data-team-id="${row.team.id}" class="${updatedTeams.has(row.team.id) ? "updated" : ""}"><td>${rankBadge(row.rank)}</td><td class="team">${escapeHtml(row.team.name)}</td><td>${turnBadge(row.drawOrder)}</td><td class="record">${raw}</td><td>${result && item.mode !== "score" ? number(result.penaltyMs / 1000) + " ثانیه" : "—"}</td><td class="total record">${item.mode === "score" ? number(row.finalValue) : formatTime(row.finalValue)}</td><td><span class="result-status ${result?.status === "approved" ? "approved" : "draft"}">${result?.completionStatus==="Partial" ? "در حال تکمیل" : !result ? "ثبت نشده" : result.status === "approved" ? "تأییدشده" : "موقت"}</span></td></tr>`;
  }).join("")}</tbody></table>${rows.length ? "" : '<div class="empty">هنوز تیمی ثبت نشده است.</div>'}`;
}
function renderIndividual() {
  const rows=activeRows().slice(page*capacity,(page+1)*capacity);
  document.querySelector("#standings").innerHTML=`<table class="item-table"><thead><tr><th>رتبه</th><th>ورزشکار / تیم</th><th>شماره</th><th>دور / گروه / لاین</th><th>زمان خام</th><th>جریمه</th><th>زمان نهایی</th></tr></thead><tbody>${rows.map(row=>`<tr data-team-id="${row.team.id}" data-athlete-id="${row.athlete.id}" class="${updatedTeams.has(row.team.id) ? "updated" : ""}"><td>${rankBadge(row.rank)}</td><td class="team">${escapeHtml(row.athlete.name || `ورزشکار دور ${row.athlete.round}`)}<small>${escapeHtml(row.team.name)}</small></td><td>${turnBadge(row.athleteNumber)}</td><td>${number(row.athlete.round)} / ${number(row.heat)} / ${number(row.lane)}</td><td class="record">${formatTime(row.result?.rawMs)}</td><td>${row.result ? number(row.result.penaltyMs/1000) : "—"}</td><td class="total record">${formatTime(row.finalValue)}</td></tr>`).join("")}</tbody></table>`;
}
function renderDraw() {
  document.querySelector("#standings").innerHTML = `<div class="draw-grid">${currentDraw().entries.slice(page * capacity, (page + 1) * capacity).map(entry => `<article class="draw-ticket"><strong class="turn">${number(entry.drawOrder)}</strong><div><small>نوبت اجرا — نه رتبه</small><b>${escapeHtml(entry.name)}</b><small>${escapeHtml(entry.organization || entry.code)}</small></div></article>`).join("")}</div>`;
}
function rotationEnabled() { return !paused && state.settings.autoRotate !== false && !reducedMotion.matches; }
document.querySelector("#next-page").addEventListener("click", () => { if (state) { page = (page + 1) % pages(); render(); } });
document.querySelector("#previous-page").addEventListener("click", () => { if (state) { page = (page - 1 + pages()) % pages(); render(); } });
document.querySelector("#pause-pages").addEventListener("click", () => { paused = !paused; render(); });
setInterval(() => { if (state && rotationEnabled() && Date.now() > highlightUntil && !document.querySelector(".page-controls").contains(document.activeElement)) { page = (page + 1) % pages(); render(); } }, 10000);
window.addEventListener("resize", render);
reducedMotion.addEventListener("change", render);
function tick() {
  const now = new Date(); document.querySelector("#clock").textContent = now.toLocaleTimeString("fa-IR", { hour:"2-digit", minute:"2-digit" });
  document.querySelector("#date").textContent = now.toLocaleDateString("fa-IR", { weekday:"long", day:"numeric", month:"long" });
  if (state && updatedTeams.size && Date.now() > highlightUntil) render();
}
tick(); setInterval(tick, 1000);
