"use strict";
const fs=require("node:fs"),path=require("node:path");
function parseGuide(markdown) {
  const lines=markdown.split(/\r?\n/),sections=[];let section,paragraph=[];
  const flush=()=>{if(paragraph.length&&section){section.blocks.push({type:"paragraph",text:paragraph.join(" ")});}paragraph=[];};
  for(let i=0;i<lines.length;i++) {
    const line=lines[i].trim();
    if(/^## /.test(line)){flush();section={id:`guide-section-${sections.length+1}`,title:line.slice(3),blocks:[]};sections.push(section);}
    else if(!section)continue;
    else if(/^### /.test(line)){flush();section.blocks.push({type:"heading",text:line.slice(4)});}
    else if(line.startsWith("```")){flush();const text=[];while(++i<lines.length&&!lines[i].startsWith("```"))text.push(lines[i]);section.blocks.push({type:"code",text:text.join("\n")});}
    else if(line.startsWith("|")){flush();const rows=[];do{const cells=lines[i].trim().replace(/^\||\|$/g,"").split("|").map(s=>s.trim());if(!cells.every(cell=>/^[:\- ]+$/.test(cell)))rows.push(cells);i++;}while(i<lines.length&&lines[i].trim().startsWith("|"));i--;section.blocks.push({type:"table",rows});}
    else if(!line||line==="---"){flush();}
    else if(/^[-•] |^[۰-۹0-9]+[.،)]/.test(line)){flush();section.blocks.push({type:"item",text:line.replace(/^[-•] /,"• ")});}
    else paragraph.push(line);
  }
  flush();return sections;
}
if(require.main===module){const root=path.join(__dirname,"..");const version=JSON.parse(fs.readFileSync(path.join(root,"package.json"))).version;const guide={version,sections:parseGuide(fs.readFileSync(path.join(root,"docs/USER_GUIDE_FA.md"),"utf8"))};fs.writeFileSync(path.join(root,"src/guide-content.js"),`"use strict";\nwindow.scoreboardGuide = ${JSON.stringify(guide,null,2)};\n`);console.log(`Built offline guide: ${guide.sections.length} sections for ${version}`);}
module.exports={parseGuide};
