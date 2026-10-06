"use strict";
const MAX_BYTES=2*1024*1024;
function validateLogo(value) {
  if (value === "" || value === null) return "";
  if (typeof value !== "string" || value.length > MAX_BYTES*1.38) throw new Error("لوگو باید تصویر PNG، JPEG یا WebP حداکثر ۲ مگابایت باشد.");
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error("فرمت لوگو مجاز نیست؛ SVG و لینک اینترنتی پذیرفته نمی‌شوند.");
  const bytes=Buffer.from(match[2],"base64");
  const valid=match[1]==="png" ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
    match[1]==="jpeg" ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255 :
    bytes.subarray(0,4).toString()==="RIFF" && bytes.subarray(8,12).toString()==="WEBP";
  if (!valid || bytes.length>MAX_BYTES || bytes.toString("base64")!==match[2]) throw new Error("محتوای فایل تصویر معتبر نیست.");
  return value;
}
function logoSource(settings, fallback) { return settings.competitionLogo || fallback; }
module.exports={validateLogo,logoSource,MAX_BYTES};
