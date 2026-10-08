"use strict";
const api = window.scoreboardAPI;
const help=window.scoreboardHelp;
const {formatTime,pagePlan,slotBadge}=window.scoreboardPresentation;
help.install({getContext:()=>({state,pageCount:state?pages():1,reducedMotion:reducedMotion.matches})});help.decorate(document.querySelector(".page-controls"));
help.attach(document.getElementById("table-title"),"dashboard","table-title");
let state, page = 0, paused = false, highlightUntil = 0;
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
function plan() { return pagePlan(isDraw()?currentDraw().entries.length:activeRows().length,isIndividual()?"individual":"team",state.settings.displayLayout); }
function activeRows(source = state) {
  if (source.settings.displayMode==="individual") return source.individualLeaderboard;
  return source.settings.displayMode === "item" ? source.itemLeaderboards[source.settings.displayItemId] ?? [] : source.liveStandings;
}
function receive(next) {
  document.querySelector("#connection-status").textContent = "ارتباط محلی برقرار";
  if (state && next.revision <= state.revision) return;
  if(state && next.resetId!==state.resetId) {page=0;paused=false;highlightUntil=0;updatedTeams.clear();resultKeys.clear();initialized=false;document.getElementById("announcement").textContent="";}
  const modeChanged = state && ["displayMode", "displayDrawId", "displayItemId", "displayLayout"].some(key => state.settings[key] !== next.settings[key]);
  const changes = [...next.results.filter(result => resultKeys.get(result.id) !== resultKey(result)),...(state?.results ?? []).filter(result=>!next.results.some(r=>r.id===result.id))];
  const oldRanks = new Map(state ? activeRows(state).map(row => [row.team.id, (isItem() || isIndividual()) ? row.rank : row.officialRank]) : []);
  state = next;
  resultKeys = new Map(next.results.map(result => [result.id, resultKey(result)]));
  if (modeChanged) page = 0;
  const relevant = isItem() ? changes.filter(result => result.disciplineId === currentItem().id) : changes;
  if (initialized && relevant.length) {
    updatedTeams = new Set(relevant.map(result => result.teamId));
    for (const row of activeRows()) if (oldRanks.has(row.team.id) && oldRanks.get(row.team.id) !== ((isItem() || isIndividual()) ? row.rank : row.officialRank)) updatedTeams.add(row.team.id);
    highlightUntil = Date.now() + 10000;
    if (!isDraw()) {
      const index = activeRows().findIndex(row => row.team.id === relevant.at(-1).teamId);
      page = Math.max(0, Math.floor(index / plan().capacity));
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
function pages() { return plan().pageCount; }
function render() {
  if (!state) return;
  page = Math.min(page, pages() - 1);
  if (Date.now() > highlightUntil) updatedTeams.clear();
  document.body.classList.toggle("draw-mode", isDraw());
  document.body.classList.toggle("item-mode", isItem() || isIndividual());
  document.body.classList.toggle("single-page",state.settings.displayLayout==="all");
  document.querySelector("#competition-name").textContent = state.settings.competitionName;
  document.querySelector("#competition-name").title=state.settings.competitionName;
  document.querySelector("#venue").textContent = [state.settings.venue,state.settings.eventDate].filter(Boolean).join(" · ");
  document.querySelector("#venue").title=document.querySelector("#venue").textContent;
  document.querySelector(".competition-logo").src=state.settings.competitionLogo || "../assets/competition-logo.jpg";
  const sponsors=document.querySelector("#sponsor-logos");sponsors.replaceChildren();
  for (const src of state.settings.sponsorLogos.filter(Boolean)) { const img=document.createElement("img");img.src=src;img.alt="حامی مسابقه";sponsors.append(img); }
  document.querySelector("#display-message").textContent = state.settings.displayMessage;
  document.querySelector("#mode-label").textContent = isDraw() ? "نوبت اجرای ثابت — نه رتبه" : "نتایج زندهٔ موقت و تأییدشده";
  document.querySelector("#progress").textContent = isDraw() ? `${number(currentDraw().entries.length)} تیم` : `${number(state.results.filter(result => result.status === "draft").length)} نتیجه موقت`;
  const total=isDraw()?currentDraw().entries.length:activeRows().length;
  document.querySelector("#page-info").textContent = `صفحه ${number(page + 1)} از ${number(pages())} · ${number(total)} ${isIndividual()?"ورزشکار":"تیم"}`;
  document.querySelector("#table-title").textContent = isDraw() ? currentDraw().title : isIndividual() ? "عملیات ترکیبی — رده‌بندی انفرادی" : isItem() ? currentItem().name : "رده‌بندی کل مسابقات — زنده";
  document.querySelector("#table-subtitle").textContent = isDraw() ? "شماره آبی = نوبت حضور؛ رتبه نیست" : "نوبت اجرا: آبی ثابت | رتبه امتیازی: طلایی متغیر";
  renderPodium();
  if (isDraw()) renderDraw(); else if (isIndividual()) renderIndividual(); else if (isItem()) renderItem(); else renderStandings();
  document.querySelector("#pause-pages").textContent = rotationEnabled() ? "توقف گردش" : "ادامه گردش";
  document.querySelector("#pause-pages").disabled = pages() === 1 || state.settings.autoRotate === false || reducedMotion.matches;
  document.querySelector("#previous-page").disabled = pages() === 1;
  document.querySelector("#next-page").disabled = pages() === 1;
  const titleHelp=document.querySelector('[data-help-for="table-title"]');
  titleHelp.onclick=()=>help.showTopic(isDraw()?"draw":isIndividual()?"combined":isItem()?(currentItem().mode==="score"?"scientific":"time"):"ranks",titleHelp);
  help.decorate(document.getElementById("standings"));
  requestAnimationFrame(fitPage);
}
function fitPage() {
  if (!state) return;
  const area = document.querySelector("#standings");
  if (isDraw()) {
    const columns=innerWidth<900?2:3;
    area.style.setProperty("--draw-columns",columns);
    area.style.setProperty("--draw-rows",Math.max(1,Math.ceil(Math.min(totalRows(),plan().capacity)/columns)));
  } else {
    const tables=Array.from(area.querySelectorAll("table"));if(!tables.length)return;
    const rows=Math.max(...tables.map(table=>table.tBodies[0].rows.length),1);
    const head=Math.max(...tables.map(table=>table.tHead.getBoundingClientRect().height));
    const rowHeight=Math.max(16,Math.floor((area.clientHeight-head-4)/rows));
    area.style.setProperty("--row-height",`${rowHeight}px`);
    area.style.setProperty("--table-font",`${Math.max(12,Math.min(26,Math.floor(rowHeight*.7)))}px`);
    area.style.setProperty("--badge-size",`${Math.max(14,Math.min(32,rowHeight-4))}px`);
  }
  fitNames();
}
function fullName(text){return `<span class="name-viewport"><span class="full-name">${escapeHtml(text)}</span></span>`;}
function fitNames(){
  for(const viewport of document.querySelectorAll(".name-viewport")){
    const text=viewport.querySelector(".full-name");
    viewport.classList.remove("name-scroll");text.style.removeProperty("font-size");
    const cell=viewport.closest("td"),row=cell?.closest("tr");
    const height=row?Math.max(13,parseFloat(getComputedStyle(document.getElementById("standings")).getPropertyValue("--row-height"))-4):Math.max(28,viewport.parentElement.clientHeight-6);
    const max=Math.max(12,Math.min(26,parseFloat(getComputedStyle(viewport.parentElement).fontSize)||20));
    text.style.whiteSpace="normal";text.style.width="auto";
    let size=max;
    for(;size>12;size-=.5){text.style.fontSize=`${size}px`;if(text.scrollHeight<=height&&text.scrollWidth<=viewport.clientWidth+1)break;}
    text.style.fontSize=`${Math.max(12,size)}px`;
    if(text.scrollHeight>height||text.scrollWidth>viewport.clientWidth+1){
      text.style.whiteSpace="nowrap";text.style.width="max-content";
      const overflow=Math.max(0,text.scrollWidth-viewport.clientWidth);
      viewport.classList.add("name-scroll");
      viewport.style.setProperty("--name-shift",`${overflow}px`);
      viewport.style.setProperty("--name-duration",`${Math.max(3,Math.min(8,2+overflow/45))}s`);
      viewport.style.setProperty("--name-scale",Math.min(1,viewport.clientWidth/Math.max(1,text.scrollWidth)));
    }
  }
}
function totalRows(){return isDraw()?currentDraw().entries.length:activeRows().length;}
function visibleRows(){const capacity=plan().capacity;return activeRows().slice(page*capacity,(page+1)*capacity);}
function renderTables(className,head,rows,rowHtml){
  const columns=plan().columns,split=Math.ceil(rows.length/columns),parts=[];
  for(let column=0;column<columns;column++){
    const slice=rows.slice(column*split,(column+1)*split);
    parts.push(`<table class="${className}"><thead><tr>${head}</tr></thead><tbody>${slice.map(rowHtml).join("")}</tbody></table>`);
  }
  document.querySelector("#standings").innerHTML=rows.length?`<div class="result-tables ${columns===2?"two-tables":""}">${parts.join("")}</div>`:'<div class="empty">هنوز شرکت‌کننده‌ای ثبت نشده است.</div>';
}
function renderPodium() {
  if (isItem() || isIndividual() || isDraw()) { document.querySelector("#podium").innerHTML=""; return; }
  const leaders = state.liveStandings.filter(row => row.officialRank !== null && row.officialRank <= 3).slice(0, 3);
  document.querySelector("#podium").innerHTML = leaders.length ? leaders.map(row => `<article class="podium-card ${row.officialRank === 1 ? "first" : ""}"><div class="medal">${number(row.officialRank)}</div><div><small>زنده — نیازمند تأیید نهایی</small><b>${fullName(row.team.name)}</b></div><div class="score"><small>مجموع رتبه</small><strong>${number(row.total)}</strong></div></article>`).join("") : "";
}
function rankBadge(rank) { return `<span class="rank ${rank === 1 ? "first" : ""}">${number(rank)}</span>`; }
function turnBadge(order) { return `<span class="turn" aria-label="نوبت اجرا ${number(order)}">${number(order)}</span>`; }
function renderStandings() {
  renderTables("overall-table",`<th>رتبه امتیازی</th><th>تیم</th><th>نوبت عمومی</th>${state.disciplines.map(item => `<th>${escapeHtml(item.name)}</th>`).join("")}<th>مجموع رتبه</th><th>تکمیل</th>`,visibleRows(),row=>`<tr data-team-id="${row.team.id}" class="${updatedTeams.has(row.team.id)?"updated":""}"><td>${rankBadge(row.officialRank)}</td><td class="team" title="${escapeHtml(row.team.name)}">${fullName(row.team.name)}</td><td>${turnBadge(row.drawOrder)}</td>${state.disciplines.map(item=>`<td>${number(row.disciplineRanks[item.id])}</td>`).join("")}<td class="total">${number(row.completed?row.total:null)}</td><td class="complete">${number(row.completed)}/${number(state.disciplines.length)}</td></tr>`);
}
function renderItem() {
  const item = currentItem();
  renderTables("item-table",`<th>رتبه امتیازی</th><th>تیم</th><th>نوبت اجرا</th><th>${item.mode === "score" ? "زمان پاسخ" : "رکورد خام"}</th><th>جریمه</th><th>${item.mode === "score" ? "نمره نهایی" : "زمان نهایی"}</th><th>وضعیت</th>`,visibleRows(),row=>{
    const result = row.result;
    const raw = !result ? "—" : item.mode === "score" ? formatTime(result.scientificDurationMs) : item.mode === "pair_time" ? `<span class="pair-record"><span>${formatTime(result.rawPrimaryMs)}</span><span>${formatTime(result.rawSecondaryMs)}</span></span>` : formatTime(result.rawPrimaryMs);
    return `<tr data-team-id="${row.team.id}" class="${updatedTeams.has(row.team.id) ? "updated" : ""}"><td>${rankBadge(row.rank)}</td><td class="team" title="${escapeHtml(row.team.name)}">${fullName(row.team.name)}</td><td>${turnBadge(row.drawOrder)}</td><td class="record">${raw}</td><td>${result && item.mode !== "score" ? number(result.penaltyMs / 1000) + " ثانیه" : "—"}</td><td class="total record">${item.mode === "score" ? number(row.finalValue) : formatTime(row.finalValue)}</td><td><span class="result-status ${result?.status === "approved" ? "approved" : "draft"}">${result?.completionStatus==="Partial" ? "در حال تکمیل" : !result ? "ثبت نشده" : result.status === "approved" ? "تأییدشده" : "موقت"}</span></td></tr>`;
  });
}
function renderIndividual() {
  renderTables("individual-table",'<th>رتبه</th><th>ورزشکار / تیم</th><th>شماره ورزشکار</th><th>دور</th><th>گروه</th><th>لاین</th><th>زمان خام</th><th>جریمه</th><th>زمان نهایی</th>',visibleRows(),row=>`<tr data-team-id="${row.team.id}" data-athlete-id="${row.athlete.id}" class="${updatedTeams.has(row.team.id)?"updated":""}"><td>${rankBadge(row.rank)}</td><td class="team" title="${escapeHtml(row.athlete.name||`ورزشکار دور ${row.athlete.round}`)} — ${escapeHtml(row.team.name)}">${fullName(`${row.athlete.name||`ورزشکار دور ${row.athlete.round}`} · ${row.team.name}`)}</td><td>${slotBadge("number",row.athleteNumber)}</td><td>${slotBadge("round",row.athlete.round)}</td><td>${slotBadge("heat",row.heat)}</td><td>${slotBadge("lane",row.lane)}</td><td class="record">${formatTime(row.result?.rawMs)}</td><td>${row.result?number(row.result.penaltyMs/1000):"—"}</td><td class="total record">${formatTime(row.finalValue)}</td></tr>`);
}
function renderDraw() {
  const capacity=plan().capacity;
  document.querySelector("#standings").innerHTML = `<div class="draw-grid">${currentDraw().entries.slice(page * capacity, (page + 1) * capacity).map(entry => `<article class="draw-ticket"><strong class="turn">${number(entry.drawOrder)}</strong><div><small>نوبت اجرا — نه رتبه</small><b>${fullName(entry.name)}</b><small>${escapeHtml(entry.organization || entry.code)}</small></div></article>`).join("")}</div>`;
}
function rotationEnabled() { return !document.getElementById("context-help-dialog") && !paused && state.settings.autoRotate !== false && !reducedMotion.matches; }
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

document.fonts.ready.then(()=>{if(state)render();});
