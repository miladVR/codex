"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { ORGANIZATION } = require("./store.cjs");
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
function reportHtml(state, payload) {
  let title, rows, head;
  if (payload.type === "draw") {
    const draw = state.draws.find(d => d.id === payload.drawId);
    if (!draw) throw new Error("قرعه‌کشی پیدا نشد.");
    title = `قرعه‌کشی ${draw.title} - ${new Date(draw.createdAt).toLocaleString("fa-IR")}`;
    head = "<th>نوبت حضور</th><th>تیم</th><th>مجموعه</th>";
    rows = draw.entries.map((e, i) => `<tr><td>${(i+1).toLocaleString("fa-IR")}</td><td>${escape(e.name)}</td><td>${escape(e.organization)}</td></tr>`).join("");
  } else if (payload.type === "standings") {
    title = "جدول نتایج تأییدشده";
    head = `<th>رتبه</th><th>تیم</th>${state.disciplines.map(d => `<th>${escape(d.name)}</th>`).join("")}<th>مجموع</th>`;
    const n = value => value == null ? "—" : Number(value).toLocaleString("fa-IR");
    rows = state.standings.map(r => `<tr><td>${n(r.officialRank)}</td><td>${escape(r.team.name)}</td>${state.disciplines.map(d => `<td>${n(r.disciplineRanks[d.id])}</td>`).join("")}<td>${n(r.officialRank === null ? null : r.total)}</td></tr>`).join("");
  } else throw new Error("نوع گزارش معتبر نیست.");
  const asset = p => pathToFileURL(path.join(__dirname, p)).href;
  return `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src file:; font-src file:;"><style>@font-face{font-family:Zar;src:url('${asset("assets/fonts/BZar.woff")}')}@font-face{font-family:Zar;src:url('${asset("assets/fonts/BZar-Bold.woff")}');font-weight:bold}body{font:18px Zar;text-align:right;color:#142137}header{display:flex;align-items:center;gap:22px;border-bottom:3px solid #b9222b;padding-bottom:14px}img{width:100px}h1{font-size:27px}h2{font-size:23px}p{margin:6px 0}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:17px}th{background:#17283e;color:white}td,th{padding:10px 6px;border:1px solid #ccd5df;text-align:center}tr{break-inside:avoid}thead{display:table-header-group}.credit{font-size:16px;color:#4a5b70}footer{margin-top:20px;border-top:1px solid #b7c5d4;padding-top:12px;text-align:center;font-size:16px}</style><header><img src="${asset("assets/competition-logo.jpg")}" alt="لوگوی مسابقات"><div><h1>${escape(state.settings.competitionName)}</h1><p>${escape(state.settings.venue)}</p><p class="credit">${ORGANIZATION}</p></div></header><h2>${escape(title)}</h2><p>زمان تهیه: ${new Date().toLocaleString("fa-IR")}</p><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table><footer>${ORGANIZATION}</footer></html>`;
}
function registerReports({ ipcMain, dialog, BrowserWindow, getStore, getWindow }) {
  let exporting = false;
  ipcMain.handle("report:export", async (_event, payload = {}) => {
    if (exporting) throw new Error("گزارش قبلی در حال آماده‌سازی است.");
    exporting = true; let report; let temporary;
    try {
      const html = reportHtml(getStore().view(), payload);
      const choice = await dialog.showSaveDialog(getWindow(), { title:"ذخیره گزارش PDF", defaultPath:`IMIDRO-${payload.type}-${new Date().toISOString().slice(0,10)}.pdf`, filters:[{name:"PDF",extensions:["pdf"]}] });
      if (choice.canceled || !choice.filePath) return { canceled:true };
      temporary = path.join(path.dirname(getStore().dataPath), `report-${Date.now()}.html`);
      fs.writeFileSync(temporary, html, "utf8");
      report = new BrowserWindow({ show:false, webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false} });
      await report.loadFile(temporary);
      await report.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
      const pdf = await report.webContents.printToPDF({ printBackground:true, pageSize:"A4", landscape:payload.type === "standings", margins:{top:.5,bottom:.6,left:.45,right:.45}, displayHeaderFooter:true, headerTemplate:"<span></span>", footerTemplate:`<div style="font-family:Tahoma;font-size:8px;width:100%;text-align:center;direction:rtl">${ORGANIZATION} · <span class="pageNumber"></span> / <span class="totalPages"></span></div>` });
      fs.writeFileSync(choice.filePath, pdf);
      return { canceled:false, filePath:choice.filePath };
    } finally { report?.destroy(); if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary); exporting = false; }
  });
}
module.exports = { reportHtml, registerReports };
