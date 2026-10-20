"use strict";
const DEFAULT_CATALOG=Object.freeze([
 {id:'scientific',name:'آزمون علمی',mode:'score',position:1,enabled:true,configured:true,participantCount:5,maxScore:100,aggregation:'sum'},
 {id:'combined',name:'عملیات ترکیبی',mode:'pair_time',position:2,enabled:true,configured:true,participantCount:2,maxScore:100,aggregation:'sum'},
 {id:'water',name:'آبرسانی',mode:'time',position:3,enabled:true,configured:true,participantCount:2,maxScore:100,aggregation:'sum'},
 {id:'rescue_skill',name:'امدادی مهارت‌محور',mode:'time',position:4,enabled:true,configured:true,participantCount:2,maxScore:100,aggregation:'sum'},
 {id:'height',name:'نجات از ارتفاع',mode:'time',position:5,enabled:true,configured:true,participantCount:2,maxScore:100,aggregation:'sum'},
 {id:'emergency_scientific',name:'علمی اورژانس',mode:'score',position:6,enabled:false,configured:false,participantCount:5,maxScore:100,aggregation:'sum'},
 {id:'emergency_operational',name:'عملیاتی اورژانس',mode:'time',position:7,enabled:false,configured:false,participantCount:2,maxScore:100,aggregation:'sum'}
]);
function catalog(state){return state.disciplineCatalog??state.disciplines;}
function discipline(state,id){return catalog(state).find(d=>d.id===id);}
function participantCount(state,id){return discipline(state,id)?.participantCount??(id==='scientific'?5:2);}
function validateCatalog(input){
 const fail=()=>{throw Error('تنظیمات رشته‌ها معتبر نیست؛ حداقل یک رشته فعال و نام هر رشته الزامی است.');};
 if(!Array.isArray(input)||input.length!==7||new Set(input.map(d=>d?.id)).size!==7)fail();
 const result=DEFAULT_CATALOG.map(base=>{
  const d=input.find(d=>d.id===base.id);if(!d||typeof d.name!=='string'||!d.name.trim()||d.name.length>100||typeof d.enabled!=='boolean'||typeof d.configured!=='boolean'||d.position!==base.position||!Number.isInteger(d.participantCount)||d.participantCount<1||d.participantCount>20||!Number.isFinite(d.maxScore)||d.maxScore<=0||d.maxScore>1000||!['sum','average'].includes(d.aggregation))fail();
  if(base.position<=5 && (d.mode!==base.mode||d.participantCount!==base.participantCount||d.maxScore!==100||d.aggregation!=='sum'||!d.configured))fail();
  if(base.position===6&&d.mode!=='score'||base.position===7&&!['time','score'].includes(d.mode)||d.enabled&&!d.configured)fail();
  return {...base,name:d.name.trim(),mode:d.mode,enabled:d.enabled,configured:d.configured,participantCount:d.participantCount,maxScore:d.maxScore,aggregation:d.aggregation};
 });
 if(!result.some(d=>d.enabled))fail();return result;
}
function migrateDisciplines(state){
 if(!state.disciplineCatalog){state.disciplineCatalog=DEFAULT_CATALOG.map(base=>({...base,...(state.disciplines?.find(d=>d.id===base.id)??{})}));}
 state.disciplineCatalog=validateCatalog(state.disciplineCatalog);
 state.disciplines=state.disciplineCatalog.filter(d=>d.enabled).map(d=>({...d}));
 if(state.settings&&(state.settings.displayMode==='item'&&!state.disciplines.some(d=>d.id===state.settings.displayItemId)||state.settings.displayMode==='individual'&&!state.disciplines.some(d=>d.id==='combined'))){state.settings.displayMode='standings';state.settings.displayItemId=null;}
}
module.exports={DEFAULT_CATALOG,catalog,discipline,participantCount,validateCatalog,migrateDisciplines};
