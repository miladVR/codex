"use strict";
(function(root){
  const defaults=Object.freeze({appearanceVersion:2,backgroundMode:"solid",backgroundStart:"#ffffff",backgroundEnd:"#fff7e6",backgroundAngle:135,displayTextSize:"large",fontFamily:"zar",customFont:"",adminFontSize:18,hallFontMax:34,fontWeight:400,numberFont:"monospace",textColor:"#000000",mutedColor:"#000000",accentColor:"#000000",surfaceColor:"#fff7e6",inputColor:"#fffdf7",borderColor:"#d7cab4",buttonColor:"#f1dfbe",buttonTextColor:"#000000",successColor:"#d4edda",dangerColor:"#f8d7da",neutralColor:"#fffaf0",buttonSize:"compact"});
  const colorKeys=Object.keys(defaults).filter(key=>/Color$/.test(key)||["backgroundStart","backgroundEnd"].includes(key));
  const fonts={zar:"ScoreboardZar, 'B Zar', Tahoma, sans-serif",tahoma:"Tahoma, ScoreboardZar, sans-serif",arial:"Arial, ScoreboardZar, sans-serif"};
  function validate(settings={}){
    const value={...defaults};for(const key of Object.keys(defaults))if(settings[key]!==undefined)value[key]=settings[key];
    if(value.appearanceVersion!==2||!["solid","gradient"].includes(value.backgroundMode)||!["standard","large"].includes(value.displayTextSize)||!Number.isInteger(value.backgroundAngle)||value.backgroundAngle<0||value.backgroundAngle>360||!["zar","tahoma","arial","custom"].includes(value.fontFamily)||![400,700].includes(value.fontWeight)||!["monospace","same"].includes(value.numberFont)||!["compact","comfortable"].includes(value.buttonSize))throw new Error("تنظیمات ظاهر معتبر نیست.");
    for(const [key,min,max]of [["adminFontSize",16,24],["hallFontMax",18,44]])if(!Number.isInteger(value[key])||value[key]<min||value[key]>max)throw new Error("اندازه فونت خارج از محدوده مجاز است.");
    if(typeof value.customFont!=="string"||value.customFont.length>80||value.customFont&&!/^[\p{L}\p{N} _-]+$/u.test(value.customFont)||value.fontFamily==="custom"&&!value.customFont.trim())throw new Error("نام فونت نصب‌شده معتبر نیست.");
    value.customFont=value.customFont.trim();
    for(const key of colorKeys){if(typeof value[key]!=="string"||!/^#[0-9a-f]{6}$/i.test(value[key]))throw new Error("رنگ باید یک کد شش‌رقمی معتبر باشد.");value[key]=value[key].toLowerCase();}
    return value;
  }
  // Version 1.5.1 only styled the page background. Its first upgrade adopts
  // the requested white/cream palette without touching competition data.
  function migrate(settings){Object.assign(settings,settings.appearanceVersion===undefined?defaults:validate(settings));return settings;}
  function font(settings){const v=validate(settings);return fonts[v.fontFamily]||`'${v.customFont}', ScoreboardZar, Tahoma, sans-serif`;}
  function background(settings){const v=validate(settings);return v.backgroundMode==="solid"?v.backgroundStart:`linear-gradient(${v.backgroundAngle}deg, ${v.backgroundStart}, ${v.backgroundEnd})`;}
  function luminance(color){const c=color.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
  function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  function warnings(settings){const v=validate(settings);return [[v.textColor,v.surfaceColor,"متن روی کادر"],[v.textColor,v.inputColor,"متن ورودی"],[v.mutedColor,v.surfaceColor,"متن توضیحات"],[v.accentColor,v.surfaceColor,"متن تأکیدی"],...[[v.buttonColor,"دکمه معمول"],[v.successColor,"دکمه تأیید"],[v.dangerColor,"دکمه حذف"],[v.neutralColor,"دکمه فرعی"]].map(([color,name])=>[v.buttonTextColor,color,name])].filter(([a,b])=>contrast(a,b)<4.5).map(([, ,name])=>name);}
  function apply(settings,element=root.document.body){
    const v=validate(settings);element.style.background=background(v);element.dataset.textSize=v.displayTextSize;element.dataset.appearance="2";element.dataset.buttonSize=v.buttonSize;
    const vars={"--fa-font":font(v),"--number-font":v.numberFont==="same"?font(v):"Consolas, 'Courier New', monospace","--admin-font":`${v.adminFontSize}px`,"--hall-font-max":`${v.hallFontMax}px`,"--theme-weight":v.fontWeight,"--text":v.textColor,"--ink":v.textColor,"--muted":v.mutedColor,"--gold":v.accentColor,"--theme-accent":v.accentColor,"--theme-surface":v.surfaceColor,"--theme-input":v.inputColor,"--line":v.borderColor,"--theme-button":v.buttonColor,"--theme-button-text":v.buttonTextColor,"--theme-success":v.successColor,"--theme-danger":v.dangerColor,"--theme-neutral":v.neutralColor};
    for(const [key,value]of Object.entries(vars))element.style.setProperty(key,String(value));element.style.colorScheme=luminance(v.surfaceColor)>.3?"light":"dark";
  }
  const api={defaults,colorKeys,validate,migrate,font,background,contrast,warnings,apply};if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.scoreboardAppearance=api;
})(typeof window!=="undefined"?window:globalThis);
