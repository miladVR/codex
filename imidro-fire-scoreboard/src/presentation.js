"use strict";
(function(root){
  // Display rounding never changes the stored milliseconds or ranking inputs.
  function formatTime(ms){
    if(!Number.isFinite(ms)||ms<0)return "—";
    const hundredths=Math.round(ms/10);
    return `${String(Math.floor(hundredths/6000)).padStart(2,"0")}:${String(Math.floor(hundredths%6000/100)).padStart(2,"0")}.${String(hundredths%100).padStart(2,"0")}`;
  }
  function pagePlan(total,kind,layout="paged"){
    const limit=kind==="individual"?22:11;
    const capacity=layout==="all"?Math.max(1,total):limit;
    const columns=layout==="all"&&total>limit?2:1;
    return {capacity,columns,pageCount:Math.max(1,Math.ceil(total/capacity)),rowsPerColumn:Math.max(1,Math.ceil(Math.min(total,capacity)/columns))};
  }
  const labels={number:"شماره",round:"دور",heat:"گروه",lane:"لاین"};
  function slotBadge(kind,value){
    if(!Object.hasOwn(labels,kind))throw new Error("Unknown assignment field");
    const number=Number.isInteger(value)&&value>0?value.toLocaleString("fa-IR"):"—";
    return `<span class="slot-badge slot-${kind}" data-slot="${kind}"><small>${labels[kind]}</small><b>${number}</b></span>`;
  }
  function combinedSaveState({busy=false,approved=false,lane,rawMs,penaltyMs=0}) {
    if(busy)return {enabled:false,reason:"در حال ذخیره رکورد؛ کمی صبر کنید."};
    if(approved)return {enabled:false,reason:"نتیجه تأیید و قفل شده است؛ برای ویرایش، آن را برای اصلاح باز کنید."};
    if(![1,2].includes(lane))return {enabled:false,reason:"لاین معتبر تخصیص نیافته است؛ فرم را دوباره باز کنید."};
    if(!Number.isFinite(rawMs)||rawMs<=0)return {enabled:false,reason:"زمان همین ورزشکار را انتخاب کنید؛ دقیقه و صدمِ صفر به‌صورت پیش‌فرض انتخاب شده‌اند."};
    if(!Number.isFinite(penaltyMs)||penaltyMs<0||penaltyMs>3600000)return {enabled:false,reason:"جریمه باید بین صفر و ۳۶۰۰ ثانیه باشد."};
    return {enabled:true,reason:"آماده ثبت مستقل همین ورزشکار؛ زمان ورزشکار دور دیگر لازم نیست."};
  }
  const api={formatTime,pagePlan,slotBadge,combinedSaveState};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.scoreboardPresentation=api;
})(typeof window!=="undefined"?window:globalThis);
