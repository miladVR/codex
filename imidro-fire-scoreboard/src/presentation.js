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
  const api={formatTime,pagePlan,slotBadge};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.scoreboardPresentation=api;
})(typeof window!=="undefined"?window:globalThis);
