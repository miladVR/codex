"use strict";
const MAX_DISCIPLINES=20;
const BASE_CATALOG=[
 {id:'scientific',name:'آزمون علمی',mode:'score',position:1,enabled:true,configured:true,participantCount:5,maxScore:100,aggregation:'sum'},
 {id:'combined',name:'عملیات ترکیبی',mode:'pair_time',position:2,enabled:true,configured:true,participantCount:2,bestCount:2,maxScore:100,aggregation:'sum'},
 {id:'water',name:'آبرسانی',mode:'time',position:3,enabled:true,configured:true,participantCount:2,maxScore:100,aggregation:'sum'},
 {id:'rescue_skill',name:'امدادی مهارت‌محور',mode:'time',position:4,enabled:true,configured:true,participantCount:2,maxScore:100,aggregation:'sum'},
 {id:'height',name:'نجات از ارتفاع',mode:'time',position:5,enabled:true,configured:true,participantCount:2,maxScore:100,aggregation:'sum'},
 {id:'emergency_scientific',name:'علمی اورژانس',mode:'score',position:6,enabled:false,configured:false,participantCount:5,maxScore:100,aggregation:'sum'},
 {id:'emergency_operational',name:'عملیاتی اورژانس',mode:'time',position:7,enabled:false,configured:false,participantCount:2,maxScore:100,aggregation:'sum'}
];
const DEFAULT_CATALOG=Object.freeze([...BASE_CATALOG,...Array.from({length:13},(_,i)=>({id:`custom_${String(i+1).padStart(2,'0')}`,name:'',mode:'time',position:i+8,enabled:false,configured:false,participantCount:2,maxScore:100,aggregation:'sum'}))]);
function catalog(state){return state.disciplineCatalog??state.disciplines;}
function discipline(state,id){return catalog(state).find(d=>d.id===id);}
function participantCount(state,id){return discipline(state,id)?.participantCount??(id==='scientific'?5:2);}
function validateCatalog(input){
 const fail=()=>{throw Error('تنظیمات رشته‌ها معتبر نیست؛ حداکثر ۲۰ رشته، حداقل یک رشته فعال و عنوان برای رشته فعال الزامی است.');};
 if(!Array.isArray(input)||input.length!==MAX_DISCIPLINES||new Set(input.map(d=>d?.id)).size!==MAX_DISCIPLINES)fail();
 const result=DEFAULT_CATALOG.map(base=>{
  const d=input.find(d=>d?.id===base.id);
  if(!d||typeof d.name!=='string'||d.name.length>100||(!d.name.trim()&&(base.position<=7||d.enabled||d.configured))||typeof d.enabled!=='boolean'||typeof d.configured!=='boolean'||d.position!==base.position||!Number.isInteger(d.participantCount)||d.participantCount<1||d.participantCount>(base.id==='combined'?10:20)||!Number.isFinite(d.maxScore)||d.maxScore<=0||d.maxScore>1000||!['sum','average'].includes(d.aggregation))fail();
  if(base.position<=6&&d.mode!==base.mode||base.position>6&&!['time','score'].includes(d.mode)||d.enabled&&!d.configured)fail();
  const bestCount=base.id==='combined'?(d.bestCount??2):undefined;
  if(base.id==='combined'&&(!Number.isInteger(bestCount)||bestCount<1||bestCount>d.participantCount))fail();
  return {...base,name:d.name.trim(),mode:d.mode,enabled:d.enabled,configured:d.configured,participantCount:d.participantCount,maxScore:d.maxScore,aggregation:d.aggregation,...(base.id==='combined'?{bestCount}:{})};
 });
 if(!result.some(d=>d.enabled))fail();return result;
}
function migrateDisciplines(state){
 if(!state.disciplineCatalog)state.disciplineCatalog=BASE_CATALOG.map(base=>({...base,...(state.disciplines?.find(d=>d.id===base.id)??{})}));
 if((state.version??1)<8)state.disciplineCatalog=DEFAULT_CATALOG.map(base=>({...base,...(state.disciplineCatalog.find(d=>d.id===base.id)??{})}));
 state.disciplineCatalog=validateCatalog(state.disciplineCatalog);
 state.disciplines=state.disciplineCatalog.filter(d=>d.enabled).map(d=>({...d}));
 if(state.settings&&(state.settings.displayMode==='item'&&!state.disciplines.some(d=>d.id===state.settings.displayItemId)||state.settings.displayMode==='individual'&&!state.disciplines.some(d=>d.id==='combined'))){state.settings.displayMode='standings';state.settings.displayItemId=null;}
}
module.exports={MAX_DISCIPLINES,DEFAULT_CATALOG,catalog,discipline,participantCount,validateCatalog,migrateDisciplines};
