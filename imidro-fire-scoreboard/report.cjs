"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { logoSource } = require("./branding.cjs");
const { ORGANIZATION } = require("./store.cjs");
const { formatTime } = require("./src/presentation.js");
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
const number = value => value == null ? "—" : Number(value).toLocaleString("fa-IR");
const resultStatus = result => !result ? "ثبت نشده" : result.completionStatus === "Partial" ? "در حال تکمیل — موقت" : result.status === "approved" ? "تأییدشده" : "موقت";
// A read-only snapshot of the entire live table, independent of hall pagination.
function liveReportModel(state, payload) {
  const model={version:1,revision:state.revision,type:payload.type,disciplineId:"combined",title:"",columns:[],rows:[],
    notice:"این گزارش وضعیت زنده در زمان تهیه را نشان می‌دهد؛ رکوردهای موقت رسمی نیستند. خط تیره یعنی نام، رکورد یا رتبه هنوز ثبت نشده است."};
  const column=(key,label,width)=>({key,label,...(width ? {width} : {})});
  if (payload.type === "individual") {
    model.title="عملیات ترکیبی — فهرست و نتایج انفرادی";
    model.columns=[column("rank","رتبه"),column("athlete","ورزشکار / تیم",30),column("number","شماره"),column("round","دور"),column("heat","گروه"),column("lane","لاین"),column("raw","زمان خام"),column("penalty","جریمه"),column("final","زمان نهایی"),column("status","وضعیت")];
    model.rows=state.individualLeaderboard.map(row=>({id:row.athlete.id,status:row.result ? state.results.find(r=>r.teamId===row.team.id && r.disciplineId==="combined")?.status ?? "draft" : "not_recorded",
      cells:{rank:number(row.rank),athlete:`${row.athlete.name || "نام ثبت نشده"}\n${row.team.name}`,number:number(row.athleteNumber),round:number(row.round),heat:number(row.heat),lane:number(row.lane),raw:formatTime(row.result?.rawMs),penalty:formatTime(row.result?.penaltyMs),final:formatTime(row.finalValue),status:resultStatus(row.result ? state.results.find(r=>r.teamId===row.team.id && r.disciplineId==="combined") ?? {status:"draft"} : null)}}));
  } else if (payload.type === "item") {
    const discipline=state.disciplines.find(d=>d.id===payload.disciplineId);
    if (!discipline) throw new Error("رشته گزارش معتبر نیست.");
    model.disciplineId=discipline.id;model.title=`فهرست و نتایج زنده — ${discipline.name}`;
    model.columns=[column("rank","رتبه"),column("turn","نوبت اجرا"),column("team","تیم / مجموعه",23)];
    if (discipline.mode === "pair_time") model.columns.push(column("first","ورزشکار دور اول"),column("rawFirst","زمان دور اول"),column("second","ورزشکار دور دوم"),column("rawSecond","زمان دور دوم"),column("penalty","جریمه تیمی"),column("final","زمان نهایی"));
    else if (discipline.mode === "score") model.columns.push(column("final","نمره علمی"),column("duration","زمان پاسخ‌گویی"));
    else model.columns.push(column("athlete","ورزشکار"),column("rawFirst","زمان خام"),column("penalty","جریمه"),column("final","زمان نهایی"));
    model.columns.push(column("status","وضعیت"));
    model.rows=state.itemLeaderboards[discipline.id].map(row=>({id:row.team.id,status:row.result?.status ?? "not_recorded",cells:{rank:number(row.rank),turn:number(row.drawOrder),team:[row.team.name,row.team.organization].filter(Boolean).join("\n"),
      athlete:row.result?.athletePrimary || "—",first:state.athletes.find(a=>a.teamId===row.team.id && a.round===1)?.name || "نام ثبت نشده",second:state.athletes.find(a=>a.teamId===row.team.id && a.round===2)?.name || "نام ثبت نشده",
      rawFirst:formatTime(row.result?.rawPrimaryMs),rawSecond:formatTime(row.result?.rawSecondaryMs),penalty:formatTime(row.result?.penaltyMs),final:discipline.mode==="score" ? number(row.finalValue) : formatTime(row.finalValue),duration:formatTime(row.result?.scientificDurationMs),status:resultStatus(row.result)}}));
  } else throw new Error("نوع گزارش زنده معتبر نیست.");
  return model;
}
function reportHtml(state, payload) {
  let title, rows, head, notice="", live=false;
  if (payload.type === "draw") {
    const draw = state.draws.find(d => d.id === payload.drawId);
    if (!draw) throw new Error("قرعه‌کشی پیدا نشد.");
    title = `قرعه‌کشی ${draw.title} - ${new Date(draw.createdAt).toLocaleString("fa-IR")}`;
    head = "<th>نوبت حضور</th><th>تیم</th><th>مجموعه</th>";
    rows = draw.entries.map((e, i) => `<tr><td>${(e.drawOrder ?? i+1).toLocaleString("fa-IR")}</td><td>${escape(e.name)}</td><td>${escape(e.organization)}</td></tr>`).join("");
  } else if (payload.type === "standings") {
    title = "جدول نتایج تأییدشده";
    head = `<th>رتبه</th><th>تیم</th>${state.disciplines.map(d => `<th>${escape(d.name)}</th>`).join("")}<th>مجموع</th>`;
    const n = value => value == null ? "—" : Number(value).toLocaleString("fa-IR");
    rows = state.standings.map(r => `<tr><td>${n(r.officialRank)}</td><td>${escape(r.team.name)}</td>${state.disciplines.map(d => `<td>${n(r.disciplineRanks[d.id])}</td>`).join("")}<td>${n(r.officialRank === null ? null : r.total)}</td></tr>`).join("");
  } else if (["item","individual"].includes(payload.type)) {
    const model=liveReportModel(state,payload);live=true;title=model.title;
    head=model.columns.map(c=>`<th${c.width ? ` style="width:${c.width}%"` : ""}>${escape(c.label)}</th>`).join("");
    rows=model.rows.map(r=>`<tr data-report-row="${r.id}" data-status="${r.status}">${model.columns.map(c=>`<td class="${["raw","rawFirst","rawSecond","penalty","final","duration"].includes(c.key)?"numeric":"text"}">${escape(r.cells[c.key])}</td>`).join("")}</tr>`).join("");
    if (!rows) rows=`<tr><td colspan="${model.columns.length}">هنوز تیمی ثبت نشده است.</td></tr>`;
    notice=`<p class="report-notice">${escape(model.notice)}</p><p>تعداد ${payload.type==="individual" ? "ورزشکاران" : "تیم‌ها"}: ${number(model.rows.length)} · نسخه داده: ${number(model.revision)}</p>`;
  } else throw new Error("نوع گزارش معتبر نیست.");
  const asset = p => pathToFileURL(path.join(__dirname, p)).href;
  return `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src file: data:; font-src file:;"><style>@font-face{font-family:Zar;src:url('${asset("assets/fonts/BZar.woff")}')}@font-face{font-family:Zar;src:url('${asset("assets/fonts/BZar-Bold.woff")}');font-weight:bold}body{font:18px Zar;text-align:right;color:#142137}header{display:flex;align-items:center;gap:22px;border-bottom:3px solid #b9222b;padding-bottom:14px}img{width:100px}h1{font-size:27px}h2{font-size:23px}p{margin:6px 0}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:${live?14:17}px;table-layout:fixed}th{background:#17283e;color:white}td,th{padding:${live?'6px 4px':'10px 6px'};border:1px solid #ccd5df;text-align:center;overflow-wrap:anywhere;white-space:pre-line}td.numeric{font:11px Arial,sans-serif;direction:ltr;white-space:nowrap}tr{break-inside:avoid}thead{display:table-header-group}.credit{font-size:16px;color:#4a5b70}.report-notice{font-size:15px;color:#6a2630}footer{margin-top:20px;border-top:1px solid #b7c5d4;padding-top:12px;text-align:center;font-size:16px}</style><header><img src="${escape(logoSource(state.settings,asset("assets/competition-logo.jpg")))}" alt="لوگوی مسابقات"><div><h1>${escape(state.settings.competitionName)}</h1><p>${escape(state.settings.venue)} · ${escape(state.settings.eventDate)}</p><p class="credit">${ORGANIZATION}</p></div></header><h2>${escape(title)}</h2><p>زمان تهیه: ${new Date().toLocaleString("fa-IR")}</p>${notice}<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table><footer>${(state.settings.sponsorLogos ?? []).filter(Boolean).map(src=>`<img src="${escape(src)}" alt="حامی" style="width:50px;height:35px;object-fit:contain">`).join(" ")}<p>${ORGANIZATION}</p></footer></html>`;
}
function registerReports({ ipcMain, dialog, BrowserWindow, getStore, getWindow, assertAdmin = () => {} }) {
  let exporting = false;
  ipcMain.handle("report:export", async (_event, payload = {}) => {
    assertAdmin(_event);
    if (exporting) throw new Error("گزارش قبلی در حال آماده‌سازی است.");
    exporting = true; let report; let temporary;
    try {
      const html = reportHtml(getStore().view(), payload);
      const suffix=payload.type==="item" ? `item-${payload.disciplineId}` : payload.type;
      const choice = await dialog.showSaveDialog(getWindow(), { title:"ذخیره گزارش PDF", defaultPath:`IMIDRO-${suffix}-${new Date().toISOString().slice(0,10)}.pdf`, filters:[{name:"PDF",extensions:["pdf"]}] });
      if (choice.canceled || !choice.filePath) return { canceled:true };
      temporary = path.join(path.dirname(getStore().dataPath), `report-${Date.now()}.html`);
      fs.writeFileSync(temporary, html, "utf8");
      report = new BrowserWindow({ show:false, webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false} });
      await report.loadFile(temporary);
      await report.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
      const pdf = await report.webContents.printToPDF({ printBackground:true, pageSize:"A4", landscape:payload.type !== "draw", margins:{top:.5,bottom:.6,left:.45,right:.45}, displayHeaderFooter:true, headerTemplate:"<span></span>", footerTemplate:`<div style="font-family:Tahoma;font-size:8px;width:100%;text-align:center;direction:rtl">${ORGANIZATION} · صفحه <span class="pageNumber"></span> از <span class="totalPages"></span></div>` });
      fs.writeFileSync(choice.filePath, pdf);
      return { canceled:false, filePath:choice.filePath };
    } finally { report?.destroy(); if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary); exporting = false; }
  });
}
module.exports = { reportHtml, registerReports, liveReportModel };
