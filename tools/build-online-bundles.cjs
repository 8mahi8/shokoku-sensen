#!/usr/bin/env node
"use strict";
/**
 * Keep Google Sites standalone builds in lock-step with modular online sources.
 *
 * Usage:
 *    node tools/build-online-bundles.cjs          # update both iPad bundles
 *    node tools/build-online-bundles.cjs --check  # fail if generated output stale
 *
 * IMPORTANT: this is a developer-side generator, never execute in Safari.
 * It regenerates the school top-of-file HP/damage editor to the CURRENT
 * canonical defaults: users' customized published Google Sites code is not
 * changed unless someone explicitly republishes a generated HTML.
 */
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const sources={
 "online-deck.js":read("online-deck.js").trim(),
 "online-net.js":read("online-net.js").trim(),
 "v3-art.js":read("v3-art.js").trim(),
 "online-game.js":read("online-game.js").trim()
};
const signature={
 "online-deck.js":"/* 小国戦線III: player deck draft",
 "online-net.js":"/* 小国戦線 III 1vs1 — Firebase RTDB transport",
 "v3-art.js":"/* 小国戦線 III — キャラクターアート v1",
 "online-game.js":'"use strict";\n/* 小国戦線 III — one-screen fortress card battler'
};
const rows=[...sources["online-game.js"].matchAll(/^\s+([a-z_]+):\{name:"([^"]+)"[^\n]*?hp:(\d+),damage:(\d+),/gm)]
 .filter(m=>!sources["online-game.js"].slice(m.index,sources["online-game.js"].indexOf("\n",m.index)).includes("internalOnly:true"))
 .map(m=>({id:m[1],name:m[2],hp:Number(m[3]),damage:Number(m[4])}));
if(rows.length<9||new Set(rows.map(r=>r.id)).size!==rows.length)
 throw Error("Cannot build school stats: missing or duplicate class declarations.");
const stats="window.SHOKOKU_UNIT_STATS = {\n"+
 rows.map(r=>"  "+r.id.padEnd(16)+": { hp: "+String(r.hp).padStart(4)+
  ", damage: "+String(r.damage).padStart(3)+" }, // "+r.name).join("\n")+"\n};";
function generate(input,name){
 let matched=new Set(),text=input.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g,(all,attrs,body)=>{
  const tagged=attrs.match(/data-shokoku-inline="([^"]+)"/);
  const id=tagged?tagged[1]:Object.keys(signature).find(key=>body.trim().startsWith(signature[key]));
  if(!id)return all;
  if(!Object.prototype.hasOwnProperty.call(sources,id)||matched.has(id))
   throw Error(name+": unknown or repeated inline module "+id);
  matched.add(id);
  return '<script data-shokoku-inline="'+id+'">\n'+sources[id]+'\n</script>';
 });
 for(const id of Object.keys(sources))if(!matched.has(id))throw Error(name+": missing inline "+id);
 const pattern=/window\.SHOKOKU_UNIT_STATS = \{[\s\S]*?\n\};/g;
 if((text.match(pattern)||[]).length!==1)throw Error(name+": expected one school stats editor");
 return text.replace(pattern,stats);
}
const check=process.argv.includes("--check");
let changes=0;
for(const name of ["online-ipad.html","online-embed.html"]){
 const old=read(name),fresh=generate(old,name);
 if(fresh!==old){
  changes++;
  if(!check)fs.writeFileSync(path.join(root,name),fresh);
 }
 console.log(name+(fresh===old?" consistent":check?" STALE":" rebuilt")+
  " / "+rows.length+" units / "+Object.keys(sources).length+" synchronized modules");
}
if(check&&changes)process.exitCode=1;
