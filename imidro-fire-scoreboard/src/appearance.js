"use strict";
(function(root){
  const defaults=Object.freeze({backgroundMode:"gradient",backgroundStart:"#07111f",backgroundEnd:"#18364b",backgroundAngle:135,displayTextSize:"large"});
  function validate(settings={}){
    const value={...defaults};
    for(const key of Object.keys(defaults))if(settings[key]!==undefined)value[key]=settings[key];
    if(!["solid","gradient"].includes(value.backgroundMode)||!["standard","large"].includes(value.displayTextSize)||!Number.isInteger(value.backgroundAngle)||value.backgroundAngle<0||value.backgroundAngle>360)throw new Error("تنظیمات ظاهر معتبر نیست.");
    for(const key of ["backgroundStart","backgroundEnd"]){if(typeof value[key]!=="string"||!/^#[0-9a-f]{6}$/i.test(value[key]))throw new Error("رنگ باید یک کد شش‌رقمی معتبر باشد.");value[key]=value[key].toLowerCase();}
    return value;
  }
  function background(settings){const v=validate(settings);return v.backgroundMode==="solid"?v.backgroundStart:`linear-gradient(${v.backgroundAngle}deg, ${v.backgroundStart}, ${v.backgroundEnd})`;}
  function apply(settings,element=root.document.body){element.style.background=background(settings);element.dataset.textSize=validate(settings).displayTextSize;}
  const api={defaults,validate,background,apply};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.scoreboardAppearance=api;
})(typeof window!=="undefined"?window:globalThis);
