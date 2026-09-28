"use strict";

const api = window.scoreboardAPI;
let state;
let approvedKeys = new Set();
let initialized = false;

api.getState().then((initial) => { state = initial; captureApproved(); initialized = true; render(); });
api.onStateChange((next) => {
  const newApprovals = next.results.filter((item) => item.status === "approved" && !approvedKeys.has(approvalKey(item)));
  state = next;
  captureApproved();
  render();
  if (initialized && newApprovals.length) announce(newApprovals.at(-1));
});

function render() {
  document.querySelector("#competition-name").textContent = state.settings.competitionName;
  document.querySelector("#venue").textContent = state.settings.venue;
  document.querySelector("#display-message").textContent = state.settings.displayMessage;
  const approved = state.results.filter((item) => item.status === "approved").length;
  document.querySelector("#progress").textContent = `${approved} نتیجه تأییدشده`;
  renderPodium();
  renderStandings();
}

function renderPodium() {
  const leaders = state.standings.filter((row) => row.officialRank !== null).slice(0, 3);
  const target = document.querySelector("#podium");
  if (!leaders.length) {
    target.innerHTML = `<div class="podium-card first"><div class="medal">—</div><div><small>در انتظار تکمیل نتایج</small><b>رتبه‌های نهایی پس از تأیید همه رشته‌ها</b></div></div>`;
    return;
  }
  const classes = ["first", "second", "third"];
  target.innerHTML = leaders.map((row, index) => `<article class="podium-card ${classes[index]}"><div class="medal">${row.officialRank}</div><div><small>${escapeHtml(row.team.organization || "تیم شرکت‌کننده")}</small><b>${escapeHtml(row.team.name)}</b></div><div class="score"><small>مجموع رتبه</small><strong>${row.total}</strong></div></article>`).join("");
}

function renderStandings() {
  const target = document.querySelector("#standings");
  if (!state.teams.length) { target.innerHTML = `<div class="empty">هنوز تیمی ثبت نشده است.<br>اطلاعات از پنل مدیریت وارد می‌شود.</div>`; return; }
  const disciplines = state.disciplines;
  const heads = disciplines.map((item) => `<th>${escapeHtml(item.name)}</th>`).join("");
  const rows = state.standings.slice(0, 12).map((row) => `<tr><td><span class="rank ${row.officialRank === 1 ? "first" : row.officialRank === null ? "pending" : ""}">${row.officialRank ?? "—"}</span></td><td class="team">${escapeHtml(row.team.name)}</td>${disciplines.map((item) => `<td>${row.disciplineRanks[item.id] ?? "—"}</td>`).join("")}<td class="total">${row.completed === disciplines.length ? row.total : "—"}</td><td><span class="complete">${row.completed}/${disciplines.length}</span></td></tr>`).join("");
  target.innerHTML = `<table><thead><tr><th>رتبه</th><th>تیم</th>${heads}<th>مجموع</th><th>تکمیل</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function announce(result) {
  const team = state.teams.find((item) => item.id === result.teamId);
  const discipline = state.disciplines.find((item) => item.id === result.disciplineId);
  const flash = document.querySelector("#flash");
  flash.textContent = `نتیجه ${discipline?.name ?? ""} تیم ${team?.name ?? ""} تأیید شد`;
  flash.classList.add("show");
  setTimeout(() => flash.classList.remove("show"), 3800);
  if (state.settings.audioEnabled) playChime();
}

function playChime() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const now = context.currentTime;
  [[523.25, 0], [659.25, .12], [783.99, .24]].forEach(([frequency, delay]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(.18, now + delay + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, now + delay + .32);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + .34);
  });
  setTimeout(() => context.close(), 900);
}

function captureApproved() { approvedKeys = new Set(state.results.filter((item) => item.status === "approved").map(approvalKey)); }
function approvalKey(item) { return `${item.id}:${item.approvedAt}`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function tick() { const now = new Date(); document.querySelector("#clock").textContent = now.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }); document.querySelector("#date").textContent = now.toLocaleDateString("fa-IR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
tick(); setInterval(tick, 1000);
