"use strict";

const api = window.scoreboardAPI;
const help = window.scoreboardHelp;
const {formatTime,slotBadge,combinedSaveState,scoringRuleChanged}=window.scoreboardPresentation;
let state;
let currentView = "dashboard";
let drawScope = "all";
let drawBusy = false;
let displayStatus;
let leaderboardScope = "all";
let selectedScientificSlot=1, rosterTeam="",rosterDiscipline="scientific";
let selectedRound=1, entryBusy=false;
let selectedTeam = "", selectedDiscipline = "scientific";
const activeResult=result=>state.disciplines.some(d=>d.id===result.disciplineId);
const titles = { reports:"گزارش‌گیری", dashboard: "تابلوی نتایج", entry: "ثبت نتیجه", approvals: "تأیید سرداور", teams: "تیم‌ها", settings: "تنظیمات و نمایشگر", draw: "قرعه‌کشی تیم‌ها", audit: "سوابق تغییرات", guide: "راهنمای نرم‌افزار" };

help.install({getContext:source=>({state,drawScope,drawBusy,teamId:selectedTeam || document.getElementById("team")?.value,disciplineId:selectedDiscipline,slot:state?.combinedTeams.find(t=>t.teamId===Number(document.getElementById("team")?.value))?.rounds[selectedRound-1],result:state?.results.find(r=>r.id===Number(source?.dataset.id))}),openGuide:()=>setView("guide")});
document.getElementById("view-help").onclick=()=>help.showTopic(currentView,document.getElementById("view-help"));
help.decorate(document.querySelector(".sidebar"));help.decorate(document.querySelector("header"));
document.querySelectorAll(".nav-item[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelector("#display-btn").addEventListener("click", () => openDisplay().catch(error => notify(`خطای نمایشگر: ${error.message}`, true)));
document.querySelector("#backup-btn").addEventListener("click", async () => {
  try{const result=await api.backup();if(!result.canceled)notify("نسخه پشتیبان ذخیره شد.");}
  catch(error){notify(`خطای ذخیره پشتیبان: ${error.message}`,true);}
});
document.getElementById("restore-backup").addEventListener("click",restoreBackup);
document.getElementById("reset-all").addEventListener("click",()=>deleteSafely("reset"));
function receive(next) {
  if (state && next.revision < state.revision) return;
  if(state && next.resetId!==state.resetId) {selectedTeam="";selectedDiscipline="scientific";selectedRound=1;selectedScientificSlot=1;rosterTeam="";drawScope="all";leaderboardScope="all";drawBusy=false;currentView="dashboard";updateNavigation();}
  const catalogChanged=state&&JSON.stringify(state.disciplineCatalog)!==JSON.stringify(next.disciplineCatalog);
  const previousResetId=state?.resetId;
  const keepBusyForm=currentView==="entry"&&entryBusy&&!catalogChanged&&next.resetId===previousResetId&&next.teams.some(t=>String(t.id)===document.getElementById("team")?.value);
  const draft=currentView==="entry" && !entryBusy ? Array.from(document.querySelectorAll("#content input:not([type=file]),#content select,#content textarea"),input=>[input.id,input.value]) : null;
  state=next;
  if(!state.disciplines.some(d=>d.id===selectedDiscipline))selectedDiscipline=state.disciplines[0].id;
  if(!state.disciplines.some(d=>d.id===rosterDiscipline))rosterDiscipline=state.disciplines[0].id;
  if(leaderboardScope!=="all" && !state.disciplines.some(d=>d.id===(leaderboardScope==="individual"?"combined":leaderboardScope)))leaderboardScope="all";
  if(drawScope!=="all"&&!state.disciplines.some(d=>d.id===drawScope))drawScope="all";
  if(keepBusyForm){renderBackupWarning();return;}
  render();
  if (draft && !catalogChanged && currentView==="entry" && next.resetId===previousResetId) { for (const [id,saved] of draft) { const input=document.getElementById(id);if(input) input.value=saved; } updatePreview(); }
}
api.onStateChange(receive);
api.getState().then(receive).catch(error => notify(error.message, true));
api.onDisplayChange(status => { displayStatus = status; const label=document.getElementById("display-status");if(label) label.textContent=status.error || (status.open ? "پنجره سالن باز است" : "پنجره سالن بسته است"); });
api.getDisplayStatus().then(status => { displayStatus = status; if (currentView === "settings") render(); }).catch(error => notify(error.message, true));

function updateNavigation(){
  for(const item of document.querySelectorAll(".nav-item[data-view]")){
    const active=item.dataset.view===currentView;
    item.classList.toggle("active",active);
    if(active)item.setAttribute("aria-current","page");else item.removeAttribute("aria-current");
  }
}

function setView(view) {
  currentView = view;
  updateNavigation();
  render();
  document.getElementById("view-title").focus({preventScroll:true});
}

function renderBackupWarning(){
  const backupWarning=document.getElementById("backup-warning");
  backupWarning.textContent=state.backupWarning||"";backupWarning.hidden=!state.backupWarning;
}
function render() {
  if (!state) return;
  window.scoreboardAppearance.apply(state.settings);
  renderBackupWarning();
  document.documentElement.style.setProperty("--entry-toolbar-top",`${document.querySelector("main>header").offsetHeight+8}px`);
  const secondary=document.getElementById("admin-secondary-logo");secondary.hidden=!state.settings.secondaryLogo;if(state.settings.secondaryLogo)secondary.src=state.settings.secondaryLogo;
  document.querySelector("#view-title").textContent = titles[currentView];
  document.querySelector("#venue").textContent = [state.settings.venue,state.settings.eventDate].filter(Boolean).join(" · ");
  document.querySelector(".admin-logo").src=state.settings.competitionLogo || "../assets/competition-logo.jpg";
  const drafts = state.results.filter((result) => result.status === "draft" && activeResult(result)).length;
  document.querySelector("#draft-badge").textContent = drafts || "";
  if(currentView==="guide" && document.getElementById("full-guide")) return;
  const views = { dashboard: dashboardView, entry: entryView, approvals: approvalsView, teams: teamsView, settings: settingsView, reports:reportsView, draw: drawView, audit: auditView, guide:()=>'<div id="full-guide"></div>' };
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
  const approved = state.results.filter((result) => result.status === "approved" && activeResult(result)).length;
  const drafts = state.results.filter((result) => result.status === "draft" && activeResult(result)).length;
  return `<div class="card hero"><h2>${escapeHtml(state.settings.competitionName)}</h2><p>ثبت و ویرایش بلافاصله در جدول زنده منتشر می‌شود؛ نتایج تأییدنشده موقت هستند. PDF رسمی فقط نتایج تأییدشده را دارد.</p></div>
  <div class="grid metrics"><div class="metric"><b>${state.teams.length}</b><span>تیم حاضر</span></div><div class="metric"><b>${approved}</b><span>نتیجه تأییدشده</span></div><div class="metric"><b>${drafts}</b><span>در انتظار تأیید</span></div><div class="metric"><b>${state.disciplines.length}</b><span>رشته مسابقه</span></div></div>
  <div class="card"><div class="section-actions"><h2>جدول امتیازات تیمی</h2><button id="export-standings" class="btn ghost">دریافت PDF نتایج</button></div>${standingsTable()}</div><div class="card"><h2>تابلو زندهٔ هر رشته</h2><div class="field"><label for="leaderboard-scope">صفحهٔ سالن</label><select id="leaderboard-scope"><option value="all">کل مسابقات</option>${state.disciplines.some(d=>d.id==="combined")?`<option value="individual" ${leaderboardScope === "individual" ? "selected" : ""}>عملیات ترکیبی — انفرادی ${state.individualLeaderboard.length.toLocaleString("fa-IR")} ورزشکار</option>`:""}${state.disciplines.map(item => `<option value="${item.id}" ${leaderboardScope === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div><button id="publish-leaderboard" class="btn primary">نمایش این صفحه در سالن</button>${leaderboardScope!=="all" ? `<button id="export-live-table" class="btn ghost">${leaderboardScope==="individual" ? "دریافت PDF انفرادی عملیات ترکیبی" : "دریافت PDF این رشته"}</button>` : ""}${itemTable()}</div>`;
}

function standingsTable() {
  if (!state.teams.length) return `<div class="empty">هنوز تیمی ثبت نشده است.</div>`;
  const heads = state.disciplines.map((item) => `<th class="center">${escapeHtml(item.name)}</th>`).join("");
  const rows = state.liveStandings.map((row) => `<tr><td><span class="rank ${row.officialRank === 1 ? "first" : ""}">${row.officialRank ?? "—"}</span></td><td><span class="turn">${row.drawOrder ?? "—"}</span></td><td><b>${escapeHtml(row.team.name)}</b><br><small>${escapeHtml(row.team.organization)}</small></td>${state.disciplines.map((item) => `<td class="center">${row.disciplineRanks[item.id] ?? "—"}</td>`).join("")}<td class="center"><b>${row.completed ? row.total : "—"}</b></td><td class="center"><span class="tag ${row.completed === state.disciplines.length ? "green" : ""}">${row.completed}/${state.disciplines.length}</span></td></tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr><th>رتبه زنده</th><th>نوبت عمومی</th><th>تیم</th>${heads}<th class="center">مجموع</th><th class="center">مراحل انجام‌شده</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function entryView() {
  if (!state.teams.length) return `<div class="card empty">ابتدا از بخش «تیم‌ها» حداقل یک تیم ثبت کنید.</div>`;
  return `<div class="entry-layout"><div class="card"><h2>فرم ثبت نتیجه داور</h2><div class="form-grid"><div class="field"><label>رشته مسابقه</label><select id="discipline">${state.disciplines.map((item) => `<option value="${item.id}" ${item.id === selectedDiscipline ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div><div class="field"><label>تیم</label><select id="team">${state.teams.map((item) => `<option value="${item.id}" ${String(item.id) === selectedTeam ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div></div><section id="entry-controls" class="entry-controls"><div class="field"><label for="judge">نام داور</label><input id="judge" placeholder="نام ثبت‌کننده نتیجه"></div><div class="actions"><button id="save-result" class="btn primary">ذخیره و ارسال برای تأیید</button></div><div class="result-preview"><span>نتیجه محاسبه‌شده</span><strong id="preview">—</strong></div></section><p id="entry-error" class="entry-error" role="alert" tabindex="-1" hidden></p><div id="result-fields"></div><div class="field"><label>شرح خطا یا توضیحات داور</label><textarea id="note" placeholder="علت جریمه، وضعیت خاص یا توضیح ضروری…"></textarea></div></div><aside class="card guide"><h3>کنترل قبل از ثبت</h3><ol><li>نام تیم و رشته را با برگه داوری تطبیق دهید.</li><li>دقیقه، ثانیه و صدم ثانیه را از فهرست‌های جداگانه انتخاب کنید.</li><li>علت هر جریمه را در توضیحات بنویسید.</li><li>نتیجه فوراً با برچسب موقت روی نمایشگر منتشر می‌شود؛ تأیید سرداور آن را رسمی و قفل می‌کند.</li></ol></aside></div>`;
}

function approvalsView() {
  const drafts = state.results.filter((result) => result.status === "draft" && activeResult(result));
  const approved = state.results.filter((result) => result.status === "approved" && activeResult(result)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `<div class="card"><h2>صف تأیید سرداور</h2>${resultsTable(drafts, "approve")}</div><div class="card"><h2>آخرین نتایج قفل‌شده</h2>${resultsTable(approved, "reopen")}</div>`;
}

function resultsTable(results, action) {
  if (!results.length) return `<div class="empty">موردی برای نمایش وجود ندارد.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>تیم</th><th>رشته</th><th class="center">نتیجه</th><th>داور</th><th></th></tr></thead><tbody>${results.map((result) => { const discipline = disciplineById(result.disciplineId); return `<tr><td>${escapeHtml(teamById(result.teamId)?.name)}</td><td>${escapeHtml(discipline?.name)}</td><td class="center">${resultText(result, discipline)}</td><td>${escapeHtml(result.judge || "—")}</td><td><button class="btn ${action === "approve" ? "success" : "ghost"}" data-action="${action}" data-id="${result.id}" ${action==="approve" && result.completionStatus==="Partial" ? "disabled" : ""}>${action === "approve" ? "تأیید و قفل" : "بازکردن برای اصلاح"}</button><button class="btn danger" data-delete-kind="result" data-delete-id="${result.id}">حذف نتیجه</button></td></tr>`; }).join("")}</tbody></table></div>`;
}

function teamsView() {
  return rosterView()+`<div class="card"><h2>افزودن تیم</h2><div class="form-grid"><div class="field"><label>نام تیم</label><input id="team-name" placeholder="مثلاً تیم مس سرچشمه"></div><div class="field"><label>شرکت یا مجموعه</label><input id="team-org" placeholder="نام سازمان"></div><div class="field"><label>نام ورزشکار دور اول عملیات ترکیبی</label><input id="team-athlete-1"></div><div class="field"><label>نام ورزشکار دور دوم عملیات ترکیبی</label><input id="team-athlete-2"></div></div><div class="actions" style="margin-top:16px"><button id="add-team" class="btn primary">ثبت تیم</button></div></div><div class="grid team-list">${state.teams.map((team) => `<div class="team"><b>${escapeHtml(team.name)}</b><small>${escapeHtml(team.organization || "بدون نام مجموعه")}</small><small>${escapeHtml(team.code)}</small>${state.athletes.filter(a=>a.teamId===team.id&&a.round<=disciplineById("combined").participantCount).map(a=>`<p>عملیات ترکیبی — دور ${a.round}: ${escapeHtml(a.name || "نام ثبت نشده")} <button class="btn danger" data-delete-kind="athlete" data-delete-id="${a.id}">پاک‌کردن ورزشکار</button></p>`).join("")}<button class="btn danger" data-delete-kind="team" data-delete-id="${team.id}">حذف تیم و نتایج</button></div>`).join("") || `<div class="card empty">هنوز تیمی ثبت نشده است.</div>`}</div>`;
}

const appearanceLabels={rowOddColor:"زمینه ردیف‌های فرد جدول",rowEvenColor:"زمینه ردیف‌های زوج جدول",textColor:"رنگ متن اصلی",mutedColor:"رنگ توضیحات و متن فرعی",accentColor:"رنگ عنوان‌های تأکیدی و نتیجه نهایی",surfaceColor:"زمینه کادرها و جدول‌ها",inputColor:"زمینه ورودی‌ها و برچسب‌ها",borderColor:"رنگ خط دور کادرها",buttonColor:"زمینه دکمه معمول / فعال",buttonTextColor:"رنگ نوشته دکمه‌ها",successColor:"زمینه دکمه تأیید",dangerColor:"زمینه دکمه حذف",neutralColor:"زمینه دکمه فرعی و راهنما"};
function appearanceFields(){
 const a=window.scoreboardAppearance.validate(state.settings);
 const colorFields=keys=>keys.map(key=>`<div class="field"><label for="appearance-${key}">${appearanceLabels[key]}</label><input type="color" id="appearance-${key}" data-appearance-key="${key}" value="${a[key]}"></div>`).join("");
 return `<section class="appearance-settings"><h3>ظاهر، فونت و رنگ‌ها</h3><div class="field"><label for="background-preset">تم آماده</label><select id="background-preset"><option value="custom">سفارشی</option><option value="cream">سفید و کرم — پیش‌فرض</option><option value="light">سفید و آبی روشن</option><option value="navy">تیره — سرمه‌ای</option><option value="forest">تیره — سبز جنگلی</option><option value="sunset">تیره — زرشکی</option></select></div><details open><summary>فونت و اندازه نوشته‌ها</summary><div class="form-grid"><div class="field"><label for="appearance-fontFamily">فونت نوشته‌ها</label><select id="appearance-fontFamily" data-appearance-key="fontFamily">${[["zar","B Zar — همراه برنامه"],["tahoma","Tahoma"],["arial","Arial"],["custom","فونت نصب‌شده دلخواه"]].map(([v,t])=>`<option value="${v}" ${a.fontFamily===v?"selected":""}>${t}</option>`).join("")}</select></div><div class="field"><label for="appearance-customFont">نام دقیق فونت نصب‌شده</label><input id="appearance-customFont" class="custom-font-name" data-appearance-key="customFont" maxlength="80" value="${escapeAttr(a.customFont)}" placeholder="مثلاً Vazirmatn"></div><div class="field"><label for="appearance-adminFontSize">اندازه نوشته‌های پنل (۱۶ تا ۲۴ پیکسل)</label><input type="number" min="16" max="24" step="1" id="appearance-adminFontSize" data-appearance-key="adminFontSize" value="${a.adminFontSize}"></div><div class="field"><label for="appearance-hallFontMax">حداکثر اندازه متن جدول سالن (۱۸ تا ۴۴ پیکسل)</label><input type="number" min="18" max="44" step="1" id="appearance-hallFontMax" data-appearance-key="hallFontMax" value="${a.hallFontMax}"></div><div class="field"><label for="appearance-fontWeight">ضخامت متن معمول</label><select id="appearance-fontWeight" data-appearance-key="fontWeight"><option value="400" ${a.fontWeight===400?"selected":""}>معمولی</option><option value="700" ${a.fontWeight===700?"selected":""}>پررنگ</option></select></div><div class="field"><label for="appearance-numberFont">فونت اعداد و زمان‌ها</label><select id="appearance-numberFont" data-appearance-key="numberFont"><option value="monospace" ${a.numberFont==="monospace"?"selected":""}>فونت با فاصله ثابت — پیشنهادی</option><option value="same" ${a.numberFont==="same"?"selected":""}>همان فونت نوشته‌ها</option></select></div><div class="field"><label for="display-text-size">اندازه نوشته‌های جدول سالن</label><select id="display-text-size"><option value="large" ${a.displayTextSize==="large"?"selected":""}>درشت — پیشنهادی</option><option value="standard" ${a.displayTextSize==="standard"?"selected":""}>معمولی — جدول فشرده</option></select></div></div><p>فونت دلخواه باید روی همین ویندوز نصب باشد؛ در صورت نبودن آن، B Zar جایگزین می‌شود. اندازه سالن برای حفظ تمام ردیف‌ها و ارقام با فضای موجود تطبیق می‌یابد.</p></details><details open><summary>رنگ نوشته‌ها، کادرها و ورودی‌ها</summary><div class="form-grid">${colorFields(["textColor","mutedColor","accentColor","surfaceColor","inputColor","borderColor","rowOddColor","rowEvenColor"])}</div></details><details><summary>زمینه اصلی صفحه — تک‌رنگ یا گرادینت</summary><div class="form-grid"><div class="field"><label for="background-mode">نوع پس‌زمینه</label><select id="background-mode"><option value="solid" ${a.backgroundMode==="solid"?"selected":""}>تک‌رنگ</option><option value="gradient" ${a.backgroundMode==="gradient"?"selected":""}>گرادینت دو رنگ</option></select></div><div class="field"><label for="background-start">رنگ اصلی / شروع</label><input type="color" id="background-start" value="${a.backgroundStart}"></div><div class="field"><label for="background-end">رنگ پایان گرادینت</label><input type="color" id="background-end" value="${a.backgroundEnd}"></div><div class="field"><label for="background-angle">جهت گرادینت (۰ تا ۳۶۰ درجه)</label><input type="range" id="background-angle" min="0" max="360" step="1" value="${a.backgroundAngle}"><output id="background-angle-value"></output></div></div></details><details><summary>رنگ و اندازه دکمه‌ها</summary><div class="form-grid">${colorFields(["buttonColor","buttonTextColor","successColor","dangerColor","neutralColor"])}<div class="field"><label for="appearance-buttonSize">اندازه دکمه‌ها</label><select id="appearance-buttonSize" data-appearance-key="buttonSize"><option value="compact" ${a.buttonSize==="compact"?"selected":""}>جمع‌وجور</option><option value="comfortable" ${a.buttonSize==="comfortable"?"selected":""}>بزرگ‌تر — مناسب لمس</option></select></div></div></details><div id="background-preview" class="background-preview" role="img" aria-label="پیش‌نمایش فونت و رنگ‌ها"><div class="preview-card"><strong>پیش‌نمایش ظاهر انتخابی</strong><p>نام ورزشکار، نتیجه مسابقه و نوشته‌های نمونه</p><table class="preview-table" aria-label="نمونه رنگ ردیف‌های جدول"><thead><tr><th>رتبه</th><th>تیم نمونه</th><th>نتیجه</th></tr></thead><tbody><tr><td>۱</td><td>تیم اول</td><td>01:04.50</td></tr><tr><td>۲</td><td>تیم دوم</td><td>01:08.25</td></tr><tr><td>۳</td><td>تیم سوم</td><td>01:12.70</td></tr></tbody></table><div class="preview-actions"><span class="preview-button">ثبت نتیجه</span><span class="preview-button preview-success">تأیید</span><span class="preview-button preview-danger">حذف</span><span class="preview-button preview-neutral">راهنما</span></div></div></div><p id="appearance-warning" class="appearance-note" role="status"></p><div class="actions"><button id="save-appearance" class="btn primary">ذخیره ظاهر</button><button id="appearance-reset" class="btn ghost">بازگشت به ظاهر سفید و کرم</button></div><p>پیش‌نمایش داده‌ای را تغییر نمی‌دهد. «ذخیره ظاهر» این تنظیمات را در پنل و سالن اعمال می‌کند. رنگ‌ها و فونت‌ها در پشتیبان حفظ می‌شوند؛ رنگ گزارش PDF مناسب چاپ باقی می‌ماند.</p></section>`;
}
function appearancePayload(){
 const a={backgroundMode:value("background-mode"),backgroundStart:value("background-start"),backgroundEnd:value("background-end"),backgroundAngle:Number(value("background-angle")),displayTextSize:value("display-text-size")};
 for(const input of document.querySelectorAll('[data-appearance-key]'))a[input.dataset.appearanceKey]=["adminFontSize","hallFontMax","fontWeight"].includes(input.dataset.appearanceKey)?Number(input.value):input.value;return a;
}
function bindAppearance(){
 const appearance=window.scoreboardAppearance;
 const preview=()=>{const chosen=value("appearance-fontFamily");document.getElementById("appearance-customFont").disabled=chosen!=="custom";try{const a=appearance.validate(appearancePayload());appearance.apply(a,document.getElementById("background-preview"));document.getElementById("background-end").disabled=a.backgroundMode==="solid";document.getElementById("background-angle").disabled=a.backgroundMode==="solid";document.getElementById("background-angle-value").textContent=`${a.backgroundAngle}°`;const low=appearance.warnings(a);document.getElementById("appearance-warning").textContent=low.length?`خوانایی کم: ${low.join("، ")}. رنگ متن یا زمینه را تغییر دهید؛ انتخاب شما قابل ذخیره است.`:"پیش‌نمایش آماده است؛ تغییرات پس از ذخیره در هر دو پنجره اعمال می‌شوند.";document.getElementById("save-appearance").disabled=false;}catch(error){document.getElementById("appearance-warning").textContent=error.message;document.getElementById("save-appearance").disabled=true;}};
 const fill=values=>{const ids={backgroundMode:"background-mode",backgroundStart:"background-start",backgroundEnd:"background-end",backgroundAngle:"background-angle",displayTextSize:"display-text-size"};for(const [key,val]of Object.entries(values)){const input=document.getElementById(ids[key]||`appearance-${key}`);if(input)input.value=val;}preview();};
 for(const input of document.querySelectorAll('[data-appearance-key],#background-mode,#background-start,#background-end,#background-angle,#display-text-size'))input.addEventListener("input",preview);
 document.getElementById("background-preset").addEventListener("change",()=>{const base=appearance.defaults;const dark={rowOddColor:"#102337",rowEvenColor:"#273d50",backgroundMode:"gradient",backgroundStart:"#07111f",backgroundEnd:"#18364b",surfaceColor:"#102337",inputColor:"#071827",textColor:"#ffffff",mutedColor:"#ffffff",accentColor:"#ffcf70",borderColor:"#5c748b",buttonColor:"#244961",buttonTextColor:"#ffffff",successColor:"#096b4e",dangerColor:"#9c2438",neutralColor:"#183447"};const presets={cream:base,light:{...base,backgroundEnd:"#bddcf4",surfaceColor:"#edf6ff",inputColor:"#ffffff",buttonColor:"#cde4f7"},navy:dark,forest:{...dark,backgroundStart:"#09251b",backgroundEnd:"#22644b"},sunset:{...dark,backgroundStart:"#421527",backgroundEnd:"#be5a25"}};const preset=presets[value("background-preset")];if(preset){const colors={backgroundMode:preset.backgroundMode,backgroundStart:preset.backgroundStart,backgroundEnd:preset.backgroundEnd,backgroundAngle:135};for(const key of appearance.colorKeys)colors[key]=preset[key];if(value("background-preset")==="light")colors.backgroundMode="gradient";fill(colors);}});
 document.getElementById("appearance-reset").addEventListener("click",()=>{document.getElementById("background-preset").value="cream";fill(appearance.defaults);});
 document.getElementById("save-appearance").addEventListener("click",async()=>{const button=document.getElementById("save-appearance");button.disabled=true;try{await api.updateSettings({...appearancePayload(),expectedRevision:state.revision});notify("ظاهر در پنل داوری و نمایشگر سالن ذخیره شد.");}catch(error){notify(error.message,true);button.disabled=false;}});preview();
}
function disciplineSettings(){
 const count=state.disciplines.length;
 return `<div class="card discipline-settings"><details id="discipline-details"><summary>مدیریت رشته‌های مسابقه — ${count.toLocaleString('fa-IR')} فعال از ۲۰ جایگاه</summary><h2>عنوان، تعداد نفرات و روش محاسبه</h2><p>۱۳ جایگاه سفارشی در کنار هفت رشته قبلی آماده تعریف است. برای رشته جدید عنوان، روش و تعداد نفرات را انتخاب و تیک فعال را روشن کنید. غیرفعال‌کردن و کاهش تعداد نفرات هیچ رکوردی را حذف نمی‌کند؛ نفرات خارج از تعداد جاری نگهداری می‌شوند و با افزایش تعداد بازمی‌گردند. تغییر قواعد محاسبه، نتایج همان رشته را برای بازبینی موقت می‌کند.</p>${state.disciplineCatalog.map(d=>{
 const hasData=state.results.some(r=>r.disciplineId===d.id)||state.participantProfiles.some(p=>p.disciplineId===d.id&&(p.name||p.photo));
 const modeLocked=d.position<=6||hasData,limit=d.id==='combined'?10:20;
 return `<details class="discipline-config-item" ${d.enabled?'open':''}><summary>${escapeHtml(d.name||`جایگاه سفارشی ${d.position-7}`)} — ${d.enabled?'فعال':'غیرفعال'}</summary><fieldset data-discipline-config="${d.id}"><legend>${escapeHtml(d.name||'رشته جدید')}</legend><div class="form-grid"><div class="field"><label for="discipline-name-${d.id}">عنوان رشته</label><input id="discipline-name-${d.id}" maxlength="100" value="${escapeAttr(d.name)}" data-help-topic="disciplineConfig"></div><div class="switch-row"><label for="discipline-enabled-${d.id}">فعال در مسابقه جاری</label><input id="discipline-enabled-${d.id}" type="checkbox" ${d.enabled?'checked':''} data-help-topic="disciplineConfig"></div><div class="field"><label for="discipline-mode-${d.id}">روش ثبت</label><select id="discipline-mode-${d.id}" ${modeLocked?'disabled':''} data-help-topic="disciplineConfig">${d.id==='combined'?'<option value="pair_time">زمان مستقل ورزشکاران و میانگین نفرات برتر</option>':`<option value="time" ${d.mode==='time'?'selected':''}>زمان مشترک تیم + جریمه؛ کمتر بهتر</option><option value="score" ${d.mode==='score'?'selected':''}>امتیاز مستقل نفرات؛ بیشتر بهتر</option>`}</select></div><div class="field"><label for="discipline-count-${d.id}">تعداد شرکت‌کننده هر تیم (۱ تا ${limit})</label><input id="discipline-count-${d.id}" type="number" min="1" max="${limit}" step="1" value="${d.participantCount}" data-help-topic="disciplineConfig"></div>${d.id==='combined'?`<div class="field"><label for="discipline-best-${d.id}">میانگین چند نفر برتر محاسبه شود؟</label><input id="discipline-best-${d.id}" type="number" min="1" max="${d.participantCount}" step="1" value="${d.bestCount}" data-help-topic="disciplineConfig"></div>`:`<div class="field" data-score-rule ${d.mode!=='score'?'hidden':''}><label for="discipline-max-${d.id}">سقف امتیاز هر نفر در روش امتیازی</label><input id="discipline-max-${d.id}" type="number" min="0.01" max="1000" step="0.01" value="${d.maxScore}" data-help-topic="disciplineConfig"></div><div class="field" data-score-rule ${d.mode!=='score'?'hidden':''}><label for="discipline-aggregation-${d.id}">نتیجه تیمی در روش امتیازی</label><select id="discipline-aggregation-${d.id}" data-help-topic="disciplineConfig"><option value="sum" ${d.aggregation==='sum'?'selected':''}>مجموع امتیازات</option><option value="average" ${d.aggregation==='average'?'selected':''}>میانگین امتیازات</option></select></div>`}<p>${d.id==='combined'?'مثال: ۳ ورزشکار و میانگین ۲ نفر برتر. زمان نهایی هر نفر شامل جریمه است. پس از ثبت همه نفرات، زمان‌های کمتر انتخاب می‌شوند. هر نفر در رده‌بندی انفرادی باقی می‌ماند.':hasData?'تعداد نفرات قابل ویرایش است. تغییر روش زمانی/امتیازی پس از ورود داده مجاز نیست؛ برای روش متفاوت، رشته سفارشی تعریف کنید.':'روش زمانی یک رکورد مشترک تیمی دارد؛ روش امتیازی ثبت مستقل هر نفر دارد.'}</p></div></fieldset></details>`;
 }).join('')}<div class="discipline-save"><button id="save-disciplines" class="btn primary" data-help-topic="disciplineConfig">ذخیره رشته‌ها و محاسبه مجدد جدول</button></div><p class="inline-status">تساوی مجموع رتبه همچنان با رتبه بهتر آبرسانی رفع می‌شود.</p></details></div>`;
}
function reviewDisciplineChange(affected,approved){
 const dialog=document.createElement("dialog");dialog.id="discipline-impact";dialog.className="delete-dialog";
 dialog.innerHTML='<h2>بازبینی اثر تغییر قواعد</h2><p></p><div class="actions"><button id="discipline-impact-cancel" class="btn ghost">انصراف</button><button id="discipline-impact-confirm" class="btn primary">اعمال تغییر و محاسبه مجدد</button></div>';
 dialog.querySelector("p").textContent=`${affected.toLocaleString("fa-IR")} نتیجه دوباره محاسبه می‌شود؛ ${approved.toLocaleString("fa-IR")} نتیجهٔ تأییدشده به حالت موقت برمی‌گردد. رکوردهای ثبت‌شده حذف نمی‌شوند.`;
 return new Promise(resolve=>{
  const finish=accepted=>{dialog.close();dialog.remove();resolve(accepted);};
  dialog.querySelector("#discipline-impact-cancel").onclick=()=>finish(false);
  dialog.querySelector("#discipline-impact-confirm").onclick=()=>finish(true);
  dialog.oncancel=event=>{event.preventDefault();finish(false);};
  openNamedDialog(dialog);dialog.querySelector("#discipline-impact-cancel").focus();
 });
}
async function saveDisciplines(){
 const button=document.getElementById("save-disciplines");button.disabled=true;
 const expectedRevision=state.revision;
 try{
  const disciplines=state.disciplineCatalog.map(d=>{
   const name=value(`discipline-name-${d.id}`),enabled=document.getElementById(`discipline-enabled-${d.id}`).checked;
   const mode=value(`discipline-mode-${d.id}`);
   return {...d,name,enabled,configured:d.position<=5||d.configured||Boolean(name.trim()),mode,participantCount:Number(value(`discipline-count-${d.id}`)),
    ...(mode==="pair_time"?{bestCount:Number(value(`discipline-best-${d.id}`))}:mode==="score"?{maxScore:Number(value(`discipline-max-${d.id}`)),aggregation:value(`discipline-aggregation-${d.id}`)}:{})};
  });
  const changed=new Set(disciplines.filter(d=>scoringRuleChanged(disciplineById(d.id),d)).map(d=>d.id));
  const affected=state.results.filter(result=>changed.has(result.disciplineId));
  if(affected.length&&!await reviewDisciplineChange(affected.length,affected.filter(r=>r.status==="approved").length))return;
  await api.updateDisciplines({disciplines,expectedRevision});
  notify("رشته‌ها ذخیره شدند؛ داده‌های ثبت‌شده حفظ شدند.");
 }catch(error){notify(error.message,true);}
 finally{button.disabled=false;if(currentView==="settings"){const trigger=document.getElementById("save-disciplines");if(trigger?.getClientRects().length)restoreFocus(trigger);else document.getElementById("discipline-details")?.querySelector("summary")?.focus();}}
}

function settingsView() {
  return `<div class="card appearance-card">${appearanceFields()}</div>${disciplineSettings()}<div class="grid settings-grid"><div class="card"><h2>مشخصات مسابقه</h2><div class="field"><label>عنوان مسابقه</label><input id="competition-name" value="${escapeAttr(state.settings.competitionName)}"></div><div class="field"><label>محل و سال برگزاری</label><input id="competition-venue" value="${escapeAttr(state.settings.venue)}"></div><div class="field"><label>تاریخ برگزاری (شمسی یا میلادی)</label><input id="event-date" value="${escapeAttr(state.settings.eventDate)}"></div><div class="field"><label>لوگوی سمت راست — مسابقه / میزبان — PNG / JPEG / WebP تا ۲ مگابایت</label><img class="logo-preview" src="${escapeAttr(state.settings.competitionLogo || "../assets/competition-logo.jpg")}" alt="لوگوی مسابقه"><input type="file" id="competition-logo-file" accept="image/png,image/jpeg,image/webp"><label><input type="checkbox" id="reset-competition-logo"> بازگشت به لوگوی پیش‌فرض</label></div><div class="field"><label for="secondary-logo-file">لوگوی سمت چپ — هلدینگ / میزبان</label>${state.settings.secondaryLogo?`<img class="logo-preview" src="${escapeAttr(state.settings.secondaryLogo)}" alt="لوگوی سمت چپ">`:""}<input type="file" id="secondary-logo-file" accept="image/png,image/jpeg,image/webp"><label><input type="checkbox" id="reset-secondary-logo"> پاک‌کردن لوگوی سمت چپ</label></div>${[0,1,2].map(i=>`<div class="field"><label>لوگوی حامی ${i+1}</label>${state.settings.sponsorLogos[i] ? `<img class="logo-preview" src="${escapeAttr(state.settings.sponsorLogos[i])}" alt="لوگوی حامی">` : ""}<input type="file" id="sponsor-${i}" accept="image/png,image/jpeg,image/webp"><label><input type="checkbox" id="reset-sponsor-${i}"> پاک‌کردن این لوگو</label></div>`).join("")}<div class="field"><label>پیام پایین نمایشگر</label><input id="display-message" value="${escapeAttr(state.settings.displayMessage)}"></div><div class="switch-row"><span>پخش صدای اعلان نتیجه</span><input id="audio-enabled" type="checkbox" ${state.settings.audioEnabled ? "checked" : ""}></div><div class="field"><label for="audio-volume">بلندی صدای اعلان (۰ تا ۱۰۰)</label><input id="audio-volume" type="range" min="0" max="100" value="${state.settings.audioVolume ?? 45}"><button id="test-sound" class="btn ghost">آزمایش صدا</button></div><div class="field"><label for="display-layout">چیدمان جدول نمایشگر سالن</label><select id="display-layout"><option value="paged" ${state.settings.displayLayout!=="all" ? "selected" : ""}>یک جدول — ۱۱ تیم یا ۲۲ ورزشکار در هر صفحه</option><option value="all" ${state.settings.displayLayout==="all" ? "selected" : ""}>دو جدول کنار هم — تا ۲۲ تیم یا ۴۴ ورزشکار در هر صفحه</option></select></div><div class="switch-row"><label for="auto-rotate">گردش خودکار صفحات نمایشگر</label><input id="auto-rotate" type="checkbox" ${state.settings.autoRotate !== false ? "checked" : ""}></div><div class="actions" style="margin-top:16px"><button id="save-settings" class="btn primary">ذخیره تنظیمات</button></div></div><div class="card"><h2>نمایشگر دوم</h2><p style="color:var(--muted);line-height:2">با انتخاب «بازکردن نمایشگر»، پنجره نتایج روی مانیتور دوم به‌صورت تمام‌صفحه باز می‌شود. اگر فقط یک نمایشگر متصل باشد، پنجره عادی باز می‌شود تا آن را جابه‌جا کنید.</p><p class="inline-status" id="display-status" role="status">${escapeHtml(displayStatus?.error || (displayStatus?.open ? "پنجره سالن باز است" : "پنجره سالن بسته است"))}</p><div class="field"><label for="window-mode">حالت خروجی پنجره</label><select id="window-mode"><option value="extend" ${displayStatus?.mode !== "mirror" ? "selected" : ""}>Extend — نمایشگر مستقل سالن</option><option value="mirror" ${displayStatus?.mode === "mirror" ? "selected" : ""}>Mirror — پیش‌نمایش همان تابلو روی اصلی</option></select></div><div class="field"><label for="target-display">نمایشگر مقصد</label><select id="target-display"><option value="">انتخاب خودکار</option>${(displayStatus?.displays ?? []).map(item => `<option value="${item.id}" ${displayStatus?.targetId === item.id ? "selected" : ""}>${escapeHtml(item.label)} ${item.primary ? "(اصلی)" : "(دوم)"}</option>`).join("")}</select></div><p>Mirror اینجا پیش‌نمایش پنجره است؛ حالت Duplicate/Extend ویندوز را با Win+P تنظیم کنید. برنامه تنظیمات سیستم‌عامل را تغییر نمی‌دهد.</p><div class="actions"><button id="open-display-alt" class="btn primary">بازکردن نمایشگر</button><button id="close-display" class="btn ghost">بستن نمایشگر</button><button id="backup-alt" class="btn ghost">ذخیره نسخه پشتیبان</button></div></div></div>`;
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
  if (currentView === "teams") {document.querySelector("#add-team")?.addEventListener("click", addTeam);bindRoster();}
  if(currentView==="reports")bindReports();
  if (currentView === "approvals") document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => mutateResult(button)));
  if (currentView === "settings") {
    bindAppearance();
    document.getElementById("save-disciplines").addEventListener("click",saveDisciplines);
    for(const fieldset of document.querySelectorAll("[data-discipline-config]")){
      const mode=fieldset.querySelector('[id^="discipline-mode-"]');
      mode.addEventListener("change",()=>{for(const field of fieldset.querySelectorAll("[data-score-rule]"))field.hidden=mode.value!=="score";});
      const count=fieldset.querySelector('[id^="discipline-count-"]'),best=fieldset.querySelector('[id^="discipline-best-"]');
      if(best)count.addEventListener("input",()=>best.max=count.value);
    }
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
  document.getElementById("content").addEventListener("input",clearEntryError,{once:true});
  renderResultFields();
}

function renderResultFields() {
  clearEntryError();
  document.getElementById("combined-save-status")?.remove();
  document.getElementById("judge").value="";
  const discipline = disciplineById(document.querySelector("#discipline").value);
  if (discipline.id === "combined") { renderCombinedFields();return; }
  if(discipline.mode==="score"){renderScientificFields();return;}
  const container = document.querySelector("#result-fields");
  document.getElementById("save-result").textContent="ذخیره و ارسال برای تأیید";
  if (discipline.mode === "score") {
    container.innerHTML = `<div class="form-grid" style="margin-top:17px"><div class="field"><label>امتیاز آزمون</label><input id="scientific-score" type="number" min="0" max="100" step="0.01"></div><div class="field"><label>زمان پاسخ‌گویی برای رفع تساوی</label>${timePicker("scientific")}</div></div>`;
  } else {
    container.innerHTML = `<div class="form-grid" style="margin-top:17px"><div class="field"><label>${discipline.mode === "pair_time" ? "نام ورزشکار اول" : "نام ورزشکار"}</label><input id="athlete-primary"></div><div class="field"><label>نام ورزشکار دوم (رکورد مشترک تیم)</label><input id="athlete-secondary" ${discipline.participantCount<2?"disabled":""}></div><div class="field"><label>زمان ${discipline.mode === "pair_time" ? "نفر اول" : "خام"}</label>${timePicker("primary")}</div>${discipline.mode === "pair_time" ? `<div class="field"><label>زمان نفر دوم</label>${timePicker("secondary")}</div>` : ""}<div class="field"><label>مجموع جریمه (ثانیه)</label><input id="penalty" type="number" min="0" max="3600" step="1" value="0"></div></div>`;
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
  const profile=participant(Number(value("team")),discipline.id,1);if(!existing && profile){document.getElementById("athlete-primary").value=profile.name;document.getElementById("athlete-secondary").value=participant(Number(value("team")),discipline.id,2)?.name||"";}
  appendEntryPhoto(discipline.id,1);appendEntryPhoto(discipline.id,2);
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
  if (discipline.mode === "score") { updateScientificPreview();return; }
  const penalty = (Number(value("penalty")) || 0) * 1000;
  const primary = readTime("primary");
  const secondary = discipline.mode === "pair_time" ? readTime("secondary") : null;
  if (primary === null || (discipline.mode === "pair_time" && secondary === null)) { target.textContent = "انتخاب کامل زمان"; return; }
  const total = discipline.mode === "pair_time" ? (primary + secondary) / 2 + penalty : primary + penalty;
  target.textContent = formatTime(total);
}

function clearEntryError(){
  const error=document.getElementById("entry-error");if(!error)return;
  if(error.dataset.field){
    const field=document.getElementById(error.dataset.field);
    field?.removeAttribute("aria-invalid");
    field?.removeAttribute("aria-describedby");
  }
  error.hidden=true;error.textContent="";delete error.dataset.field;
  document.getElementById("entry-controls")?.after(error);
}
function showEntryError(message){
  clearEntryError();
  const error=document.getElementById("entry-error");if(!error)return;
  const isScience=Boolean(document.getElementById("scientific-score"));
  const candidates=message.includes("تغییر کرده")?[]:
    message.includes("جریمه")?["penalty"]:
    message.includes("زمان")?[isScience?"scientific-s":"primary-s"]:
    message.includes("امتیاز")?["scientific-score"]:
    message.includes("نام")?[isScience?"scientific-name":"athlete-primary"]:[];
  const field=document.getElementById(candidates[0]);
  if(field){
    (field.closest(".time-picker,.field")||field).after(error);
    error.dataset.field=field.id;field.setAttribute("aria-invalid","true");field.setAttribute("aria-describedby",error.id);
  }else document.getElementById("entry-controls").after(error);
  error.textContent=message;error.hidden=false;(field||error).focus();
  document.getElementById("content").addEventListener("input",clearEntryError,{once:true});
}
async function submitEntry(request,success){
  if(entryBusy)return;
  clearEntryError();
  const save=document.getElementById("save-result");
  const controls=["team","discipline","combined-round","scientific-slot"].map(id=>document.getElementById(id)).filter(Boolean);
  const wasDisabled=controls.map(control=>control.disabled);
  entryBusy=true;save.disabled=true;controls.forEach(control=>control.disabled=true);
  let saved=false;
  try{const next=await request();saved=true;receive(next);success(next);}
  catch(error){if(currentView==="entry")showEntryError(error.message);else notify(error.message,true);}
  finally{
    entryBusy=false;
    if(saved){if(currentView==="entry"){render();document.getElementById("save-result")?.focus({preventScroll:true});}}
    else if(save.isConnected){
      controls.forEach((control,i)=>control.disabled=wasDisabled[i]);save.disabled=false;updatePreview();
    }
  }
}
async function saveResult() {
  if(entryBusy)return;
  const discipline = disciplineById(value("discipline"));
  if (discipline.id==="combined") return saveCombinedRound();
  if (discipline.mode==="score") return saveScientific();
  selectedTeam=value("team");selectedDiscipline=discipline.id;
  const payload={teamId:Number(selectedTeam),disciplineId:discipline.id,athletePrimary:value("athlete-primary"),
    athleteSecondary:value("athlete-secondary"),rawPrimaryMs:readTime("primary"),penaltyMs:Number(value("penalty"))*1000,
    note:value("note"),judge:value("judge")};
  return submitEntry(()=>api.saveResult(payload),()=>notify("نتیجه فوراً در جدول زنده منتشر و به صف تأیید سرداور ارسال شد."));
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
    const payload={...appearancePayload(),expectedRevision:state.revision,competitionName:value("competition-name"),venue:value("competition-venue"),eventDate:value("event-date"),displayMessage:value("display-message"),
      audioEnabled:document.querySelector("#audio-enabled").checked,audioVolume:Number(value("audio-volume")),displayLayout:value("display-layout"),autoRotate:document.querySelector("#auto-rotate").checked};
    const logoInput=document.querySelector("#competition-logo-file"),resetLogo=document.querySelector("#reset-competition-logo").checked;
    const sponsorInputs=[0,1,2].map(i=>({input:document.getElementById(`sponsor-${i}`),reset:document.getElementById(`reset-sponsor-${i}`).checked,old:state.settings.sponsorLogos[i] || ""}));
    payload.secondaryLogo=document.getElementById("reset-secondary-logo").checked ? "" : (await imageFile(document.getElementById("secondary-logo-file"))) ?? state.settings.secondaryLogo;
    payload.competitionLogo=resetLogo ? "" : (await imageFile(logoInput)) ?? state.settings.competitionLogo;
    payload.sponsorLogos=await Promise.all(sponsorInputs.map(async s=>s.reset ? "" : (await imageFile(s.input)) ?? s.old));
    await api.updateSettings(payload);notify("تنظیمات و لوگوها ذخیره و در سالن اعمال شدند.");
  } catch(error) {notify(error.message,true);} finally {button.disabled=false;}
}


function resultText(result, discipline) { return result.completionStatus==="Partial" ? (discipline.mode==="score" ? `${escapeHtml(discipline.name)} — ${result.scientificEntries.filter(e=>e.slot<=discipline.participantCount).length}/${discipline.participantCount} نفر ثبت شده` : "در حال تکمیل — ثبت همه ورزشکاران لازم است") : discipline.mode === "score" ? `${result.scientificScore ?? "—"} / ${formatTime(result.scientificDurationMs)}` : formatTime(metric(result, discipline)); }
function metric(result, discipline) { if (discipline.mode==="pair_time" && Object.hasOwn(result,"combinedAverageMs"))return result.combinedAverageMs; if (discipline.mode==="pair_time" && (result.rawPrimaryMs==null || result.rawSecondaryMs==null)) return null; if (discipline.mode === "score") return result.scientificScore; if (discipline.mode === "pair_time") return (result.rawPrimaryMs + result.rawSecondaryMs) / 2 + result.penaltyMs; return result.rawPrimaryMs + result.penaltyMs; }
function teamById(id) { return state.teams.find((item) => item.id === id); }
function disciplineById(id) { return (state.disciplineCatalog??state.disciplines).find((item) => item.id === id); }
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
  ${draws.length > 1 ? `<details class="card draw-history"><summary>سوابق قرعه‌کشی این بخش (${draws.length - 1})</summary><ol>${draws.slice(1).map(d => `<li>${new Date(d.createdAt).toLocaleString("fa-IR")}<button class="btn ghost" data-export-draw="${escapeAttr(d.id)}">دریافت PDF این نوبت</button><p>${d.entries.map((e,i) => `${(i+1).toLocaleString("fa-IR")}. ${escapeHtml(e.name)}`).join(" · ")}</p></li>`).join("")}</ol></details>` : ""}`;
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
async function writeReport(payload) {
  try { const result = await api.exportReport(payload); if (!result.canceled) notify(result.notice||"فایل PDF ذخیره شد."); }
  catch (error) { notify(error.message, true); }
}

function combinedTeam() { return state.combinedTeams.find(t=>t.teamId===Number(value("team"))); }
function renderCombinedFields() {
  clearEntryError();
  document.getElementById("combined-save-status")?.remove();
  const team=combinedTeam();if(selectedRound>team.rounds.length)selectedRound=1;const config=disciplineById("combined"),slot=team.rounds[selectedRound-1], result=state.results.find(r=>r.teamId===team.teamId && r.disciplineId==="combined");
  const status={Pending:"در انتظار",Partial:"در حال تکمیل",Completed:"کامل"}[team.status];
  document.getElementById("result-fields").innerHTML=`<div class="combined-status"><b>وضعیت تیم: ${status}</b><span>هر ورزشکار جدا ذخیره می‌شود؛ پس از ثبت ${config.participantCount} نفر، میانگین ${config.bestCount} زمان بهتر محاسبه می‌شود.</span></div>
    <div class="form-grid"><div class="field"><label for="combined-round">دور مسابقه</label><select id="combined-round" ${entryBusy ? "disabled" : ""}>${team.rounds.map(r=>`<option value="${r.round}" ${selectedRound===r.round?"selected":""}>دور ${r.round.toLocaleString("fa-IR")} — ورزشکار ${r.round.toLocaleString("fa-IR")}</option>`).join("")}</select></div>
    <div class="lane-card" id="lane-assignment"><div class="slot-badges">${slotBadge("number",slot.athleteNumber)}${slotBadge("round",selectedRound)}${slotBadge("heat",slot.heat)}${slotBadge("lane",slot.lane)}</div></div>
    <div class="field"><label for="athlete-primary">نام همین ورزشکار</label><input id="athlete-primary" value="${escapeAttr(slot.athlete.name)}"></div>
    <div class="field"><label>زمان همین ورزشکار</label>${timePicker("primary",true)}</div>
    <div class="field"><label for="penalty">جریمه همین ورزشکار (ثانیه)</label><input id="penalty" type="number" min="0" max="3600" step="0.01" value="${(slot.score?.penaltyMs ?? 0)/1000}"></div>
    </div>
    <div class="actions">${slot.score ? `<button class="btn danger" id="delete-round">حذف رکورد همین ورزشکار</button>` : ""}${slot.score?.penaltyMs>0 ? `<button class="btn danger" id="delete-round-penalty">پاک‌کردن جریمه همین ورزشکار</button>` : ""}${result?.legacyTeamPenaltyMs>0 ? `<button class="btn danger" id="delete-legacy-penalty">پاک‌کردن جریمه مشترک قبلی</button>` : ""}</div>
    <div class="round-summary">${team.rounds.map(r=>`<p>دور ${r.athlete.round}: ${escapeHtml(r.athlete.name || "بدون نام")} — لاین ${r.lane ?? "—"} — ${r.score ? formatTime(r.score.rawMs+r.score.penaltyMs) : "ثبت نشده"}${result?.combinedSelectedRounds?.includes(r.round)?" — منتخب میانگین":""}</p>`).join("")}${result?.legacyTeamPenaltyMs ? `<p>جریمه مشترک منتقل‌شده از نسخه قبل: ${result.legacyTeamPenaltyMs/1000} ثانیه؛ جدا از جریمه فردی</p>` : ""}</div>`;
  document.getElementById("note").value=slot.score?.note ?? "";document.getElementById("judge").value=slot.score?.judge??"";
  if (slot.score) for (const [part,number] of [["m",Math.floor(slot.score.rawMs/60000)],["s",Math.floor(slot.score.rawMs%60000/1000)],["h",Math.floor(slot.score.rawMs%1000/10)]]) document.getElementById(`primary-${part}`).value=String(number);
  document.getElementById("combined-round").addEventListener("change",e=>{selectedRound=Number(e.target.value);renderCombinedFields();});
  document.getElementById("delete-round-penalty")?.addEventListener("click",()=>deleteSafely("round_penalty",slot.score.id));
  document.getElementById("delete-legacy-penalty")?.addEventListener("click",()=>deleteSafely("result_penalty",result.id));
  document.getElementById("delete-round")?.addEventListener("click",()=>deleteSafely("round",slot.score.id));
  document.querySelectorAll("#result-fields input,#result-fields select").forEach(input=>{input.addEventListener("input",updateCombinedPreview);input.addEventListener("change",updateCombinedPreview);});
  document.querySelectorAll(".time-part").forEach(part=>part.querySelector("label").htmlFor=part.querySelector("select").id);
  const save=document.getElementById("save-result");save.textContent="ذخیره مستقل همین ورزشکار";
  const hint=document.createElement("p");hint.id="combined-save-status";hint.className="inline-status";hint.setAttribute("role","status");document.getElementById("entry-controls").append(hint);
  if(result?.status==="approved") {
    const reopen=document.createElement("button");reopen.id="reopen-combined";reopen.className="btn ghost";reopen.textContent="بازکردن نتیجه برای اصلاح";
    reopen.onclick=async()=>{try{await api.reopenResult({resultId:result.id});notify("نتیجه برای اصلاح باز شد؛ اکنون فقط دور انتخاب‌شده را ذخیره کنید.");}catch(error){notify(error.message,true);}};
    document.getElementById("result-fields").append(reopen);
  }
  if(slot.supplemental){const notice=document.createElement("p");notice.className="inline-status";notice.textContent="این تیم پس از شروع اضافه شده و نوبت تکمیلی مستقل دارد؛ شماره‌ها و لاین‌های قبلی تغییر نکرده‌اند.";document.getElementById("lane-assignment").append(notice);}
  document.getElementById("team").disabled=entryBusy; document.getElementById("discipline").disabled=entryBusy;
  appendEntryPhoto("combined",selectedRound);
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
  selectedTeam=String(teamId);selectedDiscipline="combined";
  return submitEntry(()=>api.saveRoundScore(payload),next=>{
    const individual=next.individualLeaderboard.find(r=>r.teamId===teamId&&r.round===round),teamRank=next.itemLeaderboards.combined.find(r=>r.team.id===teamId)?.rank;
    notify(`رکورد ورزشکار فوراً ذخیره شد؛ رتبه انفرادی: ${individual.rank}؛ ${teamRank?`رتبه تیمی: ${teamRank}`:"تیم در انتظار ثبت همه نفرات"}`);
  });
}
function individualTable() {
  return `<div class="table-wrap"><table><thead><tr><th>رتبه</th><th>ورزشکار</th><th>تیم</th><th>شماره ورزشکار</th><th>دور</th><th>گروه</th><th>لاین</th><th>زمان خام</th><th>جریمه</th><th>زمان نهایی</th></tr></thead><tbody>${state.individualLeaderboard.map(r=>`<tr><td>${r.rank ?? "—"}</td><td>${escapeHtml(r.athlete.name || `ورزشکار دور ${r.athlete.round}`)}</td><td>${escapeHtml(r.team.name)}</td><td>${slotBadge("number",r.athleteNumber)}</td><td>${slotBadge("round",r.athlete.round)}</td><td>${slotBadge("heat",r.heat)}</td><td>${slotBadge("lane",r.lane)}</td><td>${formatTime(r.result?.rawMs)}</td><td>${r.result ? r.result.penaltyMs/1000 : "—"}</td><td>${formatTime(r.finalValue)}</td></tr>`).join("")}</tbody></table></div>`;
}
function nameDialog(dialog){
  const heading=dialog.querySelector("h2");
  if(heading){heading.id=dialog.id+"-title";dialog.setAttribute("aria-labelledby",heading.id);}
}
function openNamedDialog(dialog){
  nameDialog(dialog);document.body.append(dialog);help.decorate(dialog);dialog.showModal();
}
function restoreFocus(opener){
  const target=opener?.isConnected?opener:opener?.id?document.getElementById(opener.id):null;
  (target&&!target.disabled?target:document.getElementById("view-title")).focus({preventScroll:true});
}
document.addEventListener("focusin",event=>{
  const target=event.target;
  if(!target.closest("#content")||target.closest("#entry-controls"))return;
  requestAnimationFrame(()=>{
    if(document.activeElement!==target)return;
    const header=document.querySelector("main>header");
    const toolbar=document.getElementById("entry-controls");
    const stickyBottom=[header,toolbar].filter(n=>n&&getComputedStyle(n).position==="sticky"&&n.getBoundingClientRect().top<=parseFloat(getComputedStyle(n).top)+1)
      .reduce((bottom,n)=>Math.max(bottom,n.getBoundingClientRect().bottom),0);
    if(target.getBoundingClientRect().top<stickyBottom+8)window.scrollBy(0,target.getBoundingClientRect().top-stickyBottom-8);
  });
});
async function deleteSafely(kind,id) {
  if (document.getElementById("delete-dialog")) return;
  const dialog=document.createElement("dialog");dialog.id="delete-dialog";dialog.className="delete-dialog";
  dialog.innerHTML='<h2>تأیید اول: آغاز حذف</h2><p>این عملیات داده‌های انتخاب‌شده را پاک می‌کند. در مرحله بعد، خلاصه دقیق را بررسی کنید.</p><div class="actions"><button id="delete-cancel" class="btn ghost">انصراف</button><button id="delete-next" class="btn danger">بررسی مرحله دوم</button></div>';
  if(kind==="reset") {dialog.querySelector("h2").textContent="تأیید اول: پاک‌کردن کل نرم‌افزار";dialog.querySelector("p").textContent="آیا می‌خواهید همه داده‌های مسابقه، تنظیمات سفارشی و پشتیبان‌های خودکار داخلی پاک شوند و برنامه مثل روز اول شود؟ این کار قابل برگشت نیست. در صورت نیاز، ابتدا از دکمه نسخه پشتیبان استفاده کنید.";}
  const focus=document.activeElement;
  openNamedDialog(dialog);
  let timer,committing=false;
  function close(){if(committing)return;clearTimeout(timer);dialog.close();dialog.remove();restoreFocus(focus);}
  dialog.addEventListener("cancel",e=>{e.preventDefault();close();});dialog.querySelector("#delete-cancel").onclick=close;
  dialog.querySelector("#delete-next").onclick=async()=>{
    dialog.querySelector("#delete-next").disabled=true;
    try {
      const review=await api.prepareDeletion({kind,id});
      if(!dialog.isConnected)return;
      dialog.innerHTML='<h2>تأیید دوم: حذف نهایی</h2><p id="delete-summary"></p><p>پس از دو ثانیه، کلمه «تایید» را وارد کنید.</p><label for="delete-confirmation">کلمه تأیید</label><input id="delete-confirmation" autocomplete="off"><p id="delete-error" role="status"></p><div class="actions"><button id="delete-cancel" class="btn ghost">انصراف</button><button id="delete-final" class="btn danger" disabled>حذف نهایی</button></div>';
      nameDialog(dialog);
      dialog.querySelector("#delete-summary").textContent=review.summary;
      help.decorate(dialog);
      const input=dialog.querySelector("#delete-confirmation"),button=dialog.querySelector("#delete-final");let ready=false;
      const enable=()=>button.disabled=committing || !ready || input.value!=="تایید";
      timer=setTimeout(()=>{ready=true;enable();},review.waitMs);input.oninput=enable;input.focus();dialog.querySelector("#delete-cancel").onclick=close;
      button.onclick=async()=>{
        if(committing)return;
        committing=true;button.disabled=true;
        try{
          const next=await api.confirmDeletion({token:review.token,confirmation:input.value});
          receive(next);committing=false;close();
          notify(kind==="reset" ? "همه داده‌ها پاک شدند؛ برنامه آماده شروع از صفر است." : "حذف ثبت شد؛ رتبه‌ها دوباره محاسبه شدند.");
        }catch(error){dialog.querySelector("#delete-error").textContent=error.message;}
        finally{committing=false;enable();}
      };
    } catch(error){notify(error.message,true);close();}
  };
}

function participant(teamId,disciplineId,slot){return state.participantProfiles.find(p=>p.teamId===teamId&&p.disciplineId===disciplineId&&p.slot===slot);}
function portrait(p){return `<img class="athlete-portrait" src="${escapeAttr(p?.photo||"../assets/athlete-placeholder.svg")}" alt="${escapeAttr(p?.name?`عکس ${p.name}`:"تصویر پیش‌فرض ورزشکار")}">`;}
function rosterView(){
 if(!state.teams.length)return "";
 const team=state.teams.find(t=>String(t.id)===rosterTeam)||state.teams[0];rosterTeam=String(team.id);
 return `<div class="card"><h2>مشخصات و عکس ورزشکاران</h2><p>تعداد نفرات هر رشته از تنظیمات رشته‌ها خوانده می‌شود. هر ورزشکار مستقل ثبت می‌شود؛ عکس اختیاری است.</p><div class="form-grid"><div class="field"><label for="roster-team">تیم</label><select id="roster-team">${state.teams.map(t=>`<option value="${t.id}" ${t.id===team.id?'selected':''}>${escapeHtml(t.name)}</option>`).join('')}</select></div><div class="field"><label for="roster-discipline">رشته</label><select id="roster-discipline">${state.disciplines.map(d=>`<option value="${d.id}" ${d.id===rosterDiscipline?'selected':''}>${escapeHtml(d.name)}</option>`).join('')}</select></div></div><div class="participant-grid">${state.participantProfiles.filter(p=>p.teamId===team.id&&p.disciplineId===rosterDiscipline&&p.slot<=disciplineById(rosterDiscipline).participantCount).map(p=>`<div class="participant-card">${portrait(p)}<div class="field"><label for="profile-name-${p.id}">${rosterDiscipline==='combined'?`نام ورزشکار دور ${p.slot}`:`نام شرکت‌کننده ${p.slot}`}</label><input id="profile-name-${p.id}" value="${escapeAttr(p.name)}"></div><div class="field"><label for="profile-photo-${p.id}">عکس ورزشکار — PNG / JPEG / WebP</label><input id="profile-photo-${p.id}" type="file" accept="image/png,image/jpeg,image/webp"></div><button class="btn primary" data-save-profile="${p.id}">ذخیره نام و عکس</button>${p.photo?`<button class="btn danger" data-delete-kind="participant_photo" data-delete-id="${p.id}">پاک‌کردن فقط عکس</button>`:''}<button class="btn danger" data-delete-kind="participant" data-delete-id="${p.id}">پاک‌کردن مشخصات و رکورد</button></div>`).join('')}</div></div>`;
}
function bindRoster(){
 document.getElementById('roster-team')?.addEventListener('change',e=>{rosterTeam=e.target.value;render();});
 document.getElementById('roster-discipline')?.addEventListener('change',e=>{rosterDiscipline=e.target.value;render();});
 document.querySelectorAll('[data-save-profile]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const id=Number(button.dataset.saveProfile),revision=state.revision,name=value(`profile-name-${id}`),photo=await athletePhoto(document.getElementById(`profile-photo-${id}`));await api.saveParticipant({id,name,photo,expectedRevision:revision});notify('مشخصات ورزشکار ذخیره شد.');}catch(error){notify(error.message,true);}finally{button.disabled=false;}});
}
async function athletePhoto(input){
 const file=input.files[0];if(!file)return undefined;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('عکس باید PNG، JPEG یا WebP و حداکثر ۱۰ مگابایت باشد.');
 const bitmap=await createImageBitmap(file);try{
  const scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const photo=canvas.toDataURL('image/jpeg',.8);if(photo.length>350000)throw Error('حجم عکس پس از فشرده‌سازی زیاد است؛ تصویر کوچک‌تری انتخاب کنید.');return photo;
 }finally{bitmap.close();}
}
function appendEntryPhoto(disciplineId,slot){
 const profile=participant(Number(value('team')),disciplineId,slot);if(!profile)return;
 const card=document.createElement('div');card.className='entry-portrait';const photoId=`entry-photo-${slot}`,saveId=`save-entry-photo-${slot}`;card.innerHTML=`${portrait(profile)}<div class="field"><label for="${photoId}">عکس ورزشکار ${slot} (اختیاری)</label><input id="${photoId}" type="file" accept="image/png,image/jpeg,image/webp"></div><button id="${saveId}" class="btn ghost">ذخیره عکس</button>${profile.photo?`<button class="btn danger" data-delete-kind="participant_photo" data-delete-id="${profile.id}">پاک‌کردن عکس</button>`:''}`;
 document.getElementById('result-fields').append(card);
 card.querySelector(`#${saveId}`).onclick=async e=>{const button=e.currentTarget;button.disabled=true;try{const revision=state.revision,photo=await athletePhoto(card.querySelector(`#${photoId}`));if(!photo)throw Error('ابتدا یک عکس انتخاب کنید.');await api.saveParticipant({id:profile.id,photo,expectedRevision:revision});notify('عکس ذخیره شد.');}catch(error){notify(error.message,true);}finally{button.disabled=false;}};
 card.querySelector('[data-delete-kind]')?.addEventListener('click',()=>deleteSafely('participant_photo',profile.id));help.decorate(card);
}
function renderScientificFields(){
 clearEntryError();
 const config=disciplineById(value('discipline')),disciplineId=config.id,count=config.participantCount,slots=Array.from({length:count},(_,i)=>i+1);if(selectedScientificSlot>count)selectedScientificSlot=1;
 const teamId=Number(value('team')),result=state.results.find(r=>r.teamId===teamId&&r.disciplineId===disciplineId),entry=result?.scientificEntries?.find(e=>e.slot===selectedScientificSlot),profile=participant(teamId,disciplineId,selectedScientificSlot);
 const fields=document.getElementById('result-fields');
 fields.innerHTML=`<div class="combined-status">${escapeHtml(config.name)} — ${result?.scientificEntries?.filter(e=>e.slot<=count).length||0}/${count.toLocaleString("fa-IR")} نفر ثبت شده؛ جمع جزئی: ${result?.scientificSubtotal??'—'}؛ ${config.aggregation==="average"?"میانگین":"مجموع"} نهایی: ${result?.scientificScore??'—'}</div>${result?.legacyScientific?`<p class="inline-status">امتیاز قدیمی ${result.scientificScore} بدون ریزنمرات حفظ شده است. با اولین ثبت جدید، این امتیاز با ریزنمرات پنج نفر جایگزین می‌شود؛ بین افراد تقسیم نمی‌شود.</p>`:''}<div class="form-grid"><div class="field"><label for="scientific-slot">شرکت‌کننده آزمون علمی</label><select id="scientific-slot">${slots.map(slot=>`<option value="${slot}" ${slot===selectedScientificSlot?'selected':''}>نفر ${slot} — ${escapeHtml(participant(teamId,disciplineId,slot)?.name||'نام ثبت نشده')}</option>`).join('')}</select></div><div class="field"><label for="scientific-name">نام همین شرکت‌کننده</label><input id="scientific-name" value="${escapeAttr(profile?.name||'')}"></div><div class="field"><label for="scientific-score">امتیاز همین نفر (۰ تا ${config.maxScore})</label><input id="scientific-score" type="number" min="0" max="${config.maxScore}" step="0.01" value="${entry?.score??''}"></div><div class="field"><label>زمان پاسخ‌گویی همین نفر — اختیاری، برای رفع تساوی مجموع</label>${timePicker('scientific')}</div></div><div class="round-summary">${slots.map(slot=>{const e=result?.scientificEntries?.find(e=>e.slot===slot);return `<p>نفر ${slot}: ${escapeHtml(participant(teamId,disciplineId,slot)?.name||'نام ثبت نشده')} — امتیاز: ${e?.score??'ثبت نشده'} — زمان: ${formatTime(e?.durationMs)}</p>`;}).join('')}</div>${result?.status==='approved'?`<button id="reopen-scientific" class="btn ghost">بازکردن نتیجه برای اصلاح</button>`:''}${entry?`<button id="clear-scientific-entry" class="btn danger">پاک‌کردن مشخصات و رکورد همین نفر با تأیید</button>`:''}`;
 if(entry?.durationMs!=null)for(const [part,n]of [['m',Math.floor(entry.durationMs/60000)],['s',Math.floor(entry.durationMs%60000/1000)],['h',Math.floor(entry.durationMs%1000/10)]])document.getElementById(`scientific-${part}`).value=String(n);
 document.getElementById('note').value=result?.note||'';document.getElementById('judge').value=result?.judge||'';
 document.getElementById('scientific-slot').onchange=e=>{selectedScientificSlot=Number(e.target.value);renderScientificFields();};
 fields.querySelectorAll('input,select').forEach(n=>n.addEventListener('input',updateScientificPreview));
 fields.querySelectorAll('.time-part').forEach(part=>part.querySelector('label').htmlFor=part.querySelector('select').id);
 fields.querySelector('#reopen-scientific')?.addEventListener('click',async()=>{try{entryBusy=true;await api.reopenResult({resultId:result.id});}catch(error){notify(error.message,true);}finally{entryBusy=false;render();}});
 fields.querySelector('#clear-scientific-entry')?.addEventListener('click',()=>deleteSafely('participant',profile.id));
 document.getElementById('save-result').textContent='ذخیره مستقل امتیاز همین نفر';appendEntryPhoto(disciplineId,selectedScientificSlot);updateScientificPreview();help.decorate(document.getElementById('content'));
}
function updateScientificPreview(){
 const config=disciplineById(value('discipline')),disciplineId=config.id,count=config.participantCount;
 const result=state.results.find(r=>r.teamId===Number(value('team'))&&r.disciplineId===disciplineId),score=value('scientific-score'),n=Number(score),button=document.getElementById('save-result');
 const timeParts=['m','s','h'].map(part=>value(`scientific-${part}`)),timeValid=timeParts.every(n=>n==='')||timeParts.every(n=>n!=='');
 const valid=timeValid&&score!==''&&Number.isFinite(n)&&n>=0&&n<=config.maxScore&&value('scientific-name').trim();
 button.disabled=entryBusy||result?.status==='approved'||!valid;
 const target=document.getElementById('preview');if(!valid){target.textContent=(timeValid?'نام و امتیاز همین نفر را وارد کنید':'زمان اختیاری را کامل انتخاب کنید یا همه بخش‌های آن را خالی بگذارید');return;}
 const others=result?.scientificEntries?.filter(e=>e.slot!==selectedScientificSlot&&e.slot<=count)||[],sum=Math.round((others.reduce((s,e)=>s+e.score,0)+n)*100)/100;
 const complete=others.length+1===count,final=config.aggregation==='average'?Math.round(sum/count*100)/100:sum;
 target.textContent=`${others.length+1}/${count.toLocaleString('fa-IR')} نفر — ${complete?(config.aggregation==='average'?'میانگین نهایی':'جمع نهایی'):'جمع جزئی'}: ${complete?final:sum}`;
}
async function saveScientific(){
  if(entryBusy)return;
  selectedTeam=value("team");
  const payload={teamId:Number(selectedTeam),disciplineId:value("discipline"),slot:selectedScientificSlot,name:value("scientific-name"),score:value("scientific-score"),durationMs:readTime("scientific"),note:value("note"),judge:value("judge"),expectedRevision:state.revision};
  return submitEntry(()=>api.saveScientificScore(payload),()=>notify("امتیاز همین نفر ذخیره شد؛ جمع و رتبه تیمی به‌روز شدند."));
}

function reportsView(){return `<div class="card"><h2>گزارش‌گیری مسابقات</h2><p>همه گزارش‌ها دارای چهار جایگاه امضا و امکان توضیحات هستند. گزارش زنده شامل نتایج موقت است؛ گزارش رسمی فقط نتایج تأییدشده را نشان می‌دهد.</p><div class="form-grid"><div class="field"><label for="report-type">نوع گزارش</label><select id="report-type"><option value="overall">کلی زنده — همه رشته‌ها</option><option value="standings">کلی رسمی — تأییدشده</option><option value="item">نتایج یک رشته</option><option value="individual" ${state.disciplines.some(d=>d.id==="combined")?"":"disabled"}>عملیات ترکیبی — انفرادی</option><option value="team">ریز نتایج یک تیم</option><option value="draw">قرعه‌کشی</option></select></div><div class="field"><label for="report-discipline">رشته</label><select id="report-discipline">${state.disciplines.map(d=>`<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('')}</select></div><div class="field"><label for="report-team">تیم</label><select id="report-team">${state.teams.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select></div><div class="field"><label for="report-draw">قرعه‌کشی</label><select id="report-draw">${state.draws.map(d=>`<option value="${escapeAttr(d.id)}">${escapeHtml(d.title)} — ${new Date(d.createdAt).toLocaleString('fa-IR')}</option>`).join('')}</select></div></div><button id="generate-report" class="btn primary">انتخاب صفحه‌بندی و تهیه PDF</button><p id="report-availability" class="inline-status"></p></div>`;}
function bindReports(){const type=document.getElementById('report-type'),button=document.getElementById('generate-report');function update(){for(const [id,show]of [['report-team',type.value==='team'],['report-discipline',type.value==='item'],['report-draw',type.value==='draw']])document.getElementById(id).closest('.field').hidden=!show;button.disabled=type.value==='team'&&!state.teams.length||type.value==='draw'&&!state.draws.length;document.getElementById('report-availability').textContent=button.disabled?'برای این گزارش ابتدا تیم یا قرعه ثبت کنید.':'';}type.onchange=update;button.onclick=()=>exportReport({type:type.value,teamId:Number(value('report-team')),disciplineId:value('report-discipline'),drawId:value('report-draw')});update();}
async function exportReport(payload){
 if(document.getElementById('report-options'))return;
 const dialog=document.createElement('dialog');dialog.id='report-options';dialog.className='report-dialog';dialog.innerHTML='<h2>تنظیمات گزارش PDF</h2><div class="field"><label for="report-layout">صفحه‌بندی</label><select id="report-layout"><option value="multi">چندصفحه‌ای — فونت و سطر بزرگ‌تر</option><option value="single">تک‌صفحه‌ای — همه سطرها در یک صفحه</option></select></div><div class="field"><label for="report-orientation">جهت صفحه</label><select id="report-orientation" data-help-topic="reports"><option value="portrait">عمودی — مناسب فهرست تیم‌ها</option><option value="landscape" selected>افقی — مناسب ستون‌های بیشتر</option></select></div><div class="field"><label for="report-density">اندازه خانه‌های عددی</label><select id="report-density" data-help-topic="reports"><option value="standard">معمولی — تنظیم اندازه همه متن‌ها در تک‌صفحه‌ای</option><option value="compact">فشرده — حفظ اندازه نام تیم‌ها</option></select></div><div class="field"><label for="report-number-size">اندازه اعداد و رتبه‌ها (۹ تا ۱۸)</label><input id="report-number-size" data-help-topic="reports" type="number" min="9" max="18" value="14"></div><div class="field"><label for="report-add-comments"><input id="report-add-comments" type="checkbox"> افزودن توضیحات به گزارش</label><textarea id="report-comments" maxlength="1500" disabled placeholder="توضیحات زیر جدول و پیش از محل امضا درج می‌شود"></textarea></div><p>در حالت معمولی تک‌صفحه‌ای، همه متن‌ها برای جاگیری کوچک می‌شوند. در حالت فشرده اندازه نام‌ها حفظ می‌شود؛ اگر جا کافی نباشد، همه ردیف‌ها در چند صفحه ذخیره می‌شوند. چهار محل امضا حفظ می‌شود.</p><div class="actions"><button id="report-cancel" class="btn ghost">انصراف</button><button id="report-create" class="btn primary">تهیه و ذخیره PDF</button></div>';
 const focus=document.activeElement;openNamedDialog(dialog);dialog.querySelector('#report-orientation').value=payload.type==='draw'?'portrait':'landscape';dialog.querySelector('#report-density').onchange=e=>dialog.querySelector('#report-number-size').value=e.target.value==='compact'?'10':'14';const close=()=>{dialog.close();dialog.remove();restoreFocus(focus);};dialog.querySelector('#report-cancel').onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};dialog.querySelector('#report-add-comments').onchange=e=>dialog.querySelector('#report-comments').disabled=!e.target.checked;
 dialog.querySelector('#report-create').onclick=async e=>{e.currentTarget.disabled=true;const options={...payload,layout:value('report-layout'),orientation:value('report-orientation'),density:value('report-density'),numberSize:Number(value('report-number-size')),comments:dialog.querySelector('#report-add-comments').checked?value('report-comments'):''};close();await writeReport(options);};
}
async function restoreBackup(){
 const focus=document.activeElement;
 if(document.getElementById('restore-dialog'))return;
 try{const review=await api.prepareRestore();if(review.canceled)return;
 const dialog=document.createElement('dialog');dialog.id='restore-dialog';dialog.className='delete-dialog';dialog.innerHTML='<h2>تأیید اول: بازیابی نسخه پشتیبان</h2><p id="restore-summary"></p><div class="actions"><button id="restore-cancel" class="btn ghost">انصراف</button><button id="restore-next" class="btn danger">بررسی جایگزینی اطلاعات</button></div>';dialog.querySelector('#restore-summary').textContent=review.summary;openNamedDialog(dialog);let timer,committing=false;const close=()=>{if(committing)return;clearTimeout(timer);dialog.close();dialog.remove();restoreFocus(focus);};dialog.oncancel=e=>{e.preventDefault();close();};dialog.querySelector('#restore-cancel').onclick=close;
 dialog.querySelector('#restore-next').onclick=()=>{dialog.innerHTML='<h2>تأیید دوم: جایگزینی اطلاعات فعلی</h2><p id="restore-summary"></p><label for="restore-confirmation">برای تأیید نهایی کلمه «تایید» را وارد کنید.</label><input id="restore-confirmation" autocomplete="off"><p id="restore-error" role="status"></p><div class="actions"><button id="restore-cancel" class="btn ghost">انصراف</button><button id="restore-final" class="btn danger" disabled>بازیابی نهایی</button></div>';nameDialog(dialog);dialog.querySelector('#restore-summary').textContent=review.summary;const input=dialog.querySelector('#restore-confirmation'),button=dialog.querySelector('#restore-final');let ready=false;const enable=()=>button.disabled=committing||!ready||input.value!=='تایید';timer=setTimeout(()=>{ready=true;enable();},review.waitMs);input.oninput=enable;dialog.querySelector('#restore-cancel').onclick=close;help.decorate(dialog);input.focus();button.onclick=async()=>{if(committing)return;committing=true;button.disabled=true;try{const next=await api.confirmRestore({token:review.token,confirmation:input.value});receive(next);committing=false;close();notify('تمام اطلاعات و تنظیمات نسخه پشتیبان بازیابی شدند.');}catch(error){dialog.querySelector('#restore-error').textContent=error.message;}finally{committing=false;enable();}};};
 }catch(error){notify(error.message,true);}
}
