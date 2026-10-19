#!/usr/bin/env node
"use strict";
/**
 * Local-only, dependency-free analysis of consented Shokoku match JSON exports.
 * Usage: node tools/research/analyze-match-batches.cjs [--out report.json] batch1.json batch2.json ...
 * Never uploads, retrains or assigns skill ratings to individual people.
 */
const fs=require("node:fs"),crypto=require("node:crypto"),path=require("node:path");
const FORMAT="shokoku-anonymous-match-batch",MAX_INPUT_BYTES=5*1024*1024;
const TYPES=["human-vs-human","human-vs-bot","mixed","unknown"];
const avg=(s,n)=>n?Math.round(s/n*100)/100:null;
function finite(v){return typeof v==="number"&&Number.isFinite(v)}
function knownType(m){
 if(m.mode==="solo")return "human-vs-bot";
 // Old schema-1 matches have no control history; never infer "human".
 const h=Array.isArray(m.guestControlHistory)?m.guestControlHistory:null;
 if(!h||!h.length||m.controlOverflow)return "unknown";
 if(h.some(v=>!v||!["human","bot"].includes(v.guest)))return "unknown";
 const states=new Set(h.map(v=>v.guest));
 return states.size>1?"mixed":states.has("bot")?"human-vs-bot":"human-vs-human";
}
function validate(match){
 if(!match||typeof match!=="object"||match.schema!==1||
  !["solo","online"].includes(match.mode)||
  !Array.isArray(match.actions)||!Array.isArray(match.samples)||
  !match.result||!finite(match.result.duration)||
  ![0,1,2].includes(match.result.winner)||
  !Array.isArray(match.result.castleHp)||match.result.castleHp.length!==2||
  !match.result.castleHp.every(finite)||
  match.actions.length>500||match.samples.length>80)throw Error("invalid match schema");
 for(const a of match.actions)if(!a||![1,2].includes(a.team)||typeof a.card!=="string"||
  a.card.length>40||!finite(a.t)||!finite(a.x)||!finite(a.y)||!finite(a.energyBefore))throw Error("invalid action");
 for(const s of match.samples)if(!s||!finite(s.t)||!Array.isArray(s.castles)||
  s.castles.length!==2||!s.castles.every(finite)||
  !Array.isArray(s.units)||s.units.length>180)throw Error("invalid snapshot");
 return match;
}
function readBatch(file){
 const stat=fs.statSync(file);
 if(!stat.isFile()||stat.size>MAX_INPUT_BYTES)throw Error("file too large or not a file: "+file);
 const batch=JSON.parse(fs.readFileSync(file,"utf8"));
 if(!batch||batch.schema!==1||batch.format!==FORMAT||!Array.isArray(batch.matches)||
  batch.matches.length>80)throw Error("invalid batch format: "+file);
 return batch.matches.map(validate);
}
function analyze(paths){
 const seen=new Set(),byType=Object.fromEntries(TYPES.map(type=>[type,{
  matches:0,blueWins:0,redWins:0,draws:0,seconds:0,actions:0,complete:0
 }])),cards={},sides={blue:{actions:0,cost:0},red:{actions:0,cost:0}};
 let duplicateMatches=0,unknownLegacy=0,partialMatches=0;
 for(const file of paths){
  for(const match of readBatch(file)){
   // Deduplicate byte-identical exported matches from repeated cumulative batch
   // files. Avoid using personal or room identities to correlate opponents.
   const fp=crypto.createHash("sha256").update(JSON.stringify(match)).digest("hex");
   if(seen.has(fp)){duplicateMatches++;continue;}
   seen.add(fp);
   const type=knownType(match),row=byType[type];
   row.matches++;row.seconds+=match.result.duration;
   row.blueWins+=+(match.result.winner===1);
   row.redWins+=+(match.result.winner===2);
   row.draws+=+(match.result.winner===0);
   if(match.overflow||match.controlOverflow)partialMatches++;else row.complete++;
   if(type==="unknown")unknownLegacy++;
   for(const action of match.actions){
    row.actions++;
    const key=action.card,entry=cards[key]||(cards[key]={uses:0,energyBefore:0,blue:0,red:0});
    entry.uses++;entry.energyBefore+=action.energyBefore;
    entry[action.team===1?"blue":"red"]++;
    const side=sides[action.team===1?"blue":"red"];
    side.actions++;
    // Energy "spent" cannot be inferred reliably from energyBefore alone.
   }
  }
 }
 const distinct=seen.size;
 return {schema:1,kind:"aggregated-research-not-bot-strength-proof",
  files:paths.length,matches:distinct,duplicateExportsSkipped:duplicateMatches,
  incompleteOrTruncated:partialMatches,
  modeBreakdown:Object.fromEntries(TYPES.map(type=>{
   const v=byType[type];return[type,{matches:v.matches,blueWins:v.blueWins,
    redWins:v.redWins,draws:v.draws,avgDurationSeconds:avg(v.seconds,v.matches),
    recordedActions:v.actions,complete:v.complete}];
  })),
  recordedCardUse:Object.fromEntries(Object.entries(cards).sort((a,b)=>b[1].uses-a[1].uses).map(([key,v])=>
   [key,{uses:v.uses,blue:v.blue,red:v.red,avgEnergyBefore:avg(v.energyBefore,v.uses)}])),
  actionCountBySide:{blue:sides.blue.actions,red:sides.red.actions},
  limitations:["This is observational data, not a causal evaluation of BOT skill.",
   "No player identities or opponent skill information; do not rank people.",
   "Older online logs without an explicit guest control timeline are UNKNOWN.",
   "Incomplete or truncated matches are flagged and need manual review.",
   "Research JSON may contain game strategies; share only with participant consent."]
 };
}
function main(argv){
 const paths=[],outIndex=argv.indexOf("--out");
 let output=null;
 if(outIndex>=0){
  if(!argv[outIndex+1])throw Error("--out requires file path");
  output=argv[outIndex+1];
 }
 for(let i=0;i<argv.length;i++){
  if(i===outIndex||i===outIndex+1)continue;
  if(argv[i].startsWith("-"))throw Error("unrecognized option "+argv[i]);
  paths.push(path.resolve(argv[i]));
 }
 if(!paths.length)throw Error("usage: node tools/research/analyze-match-batches.cjs [--out report.json] batch1.json ...");
 const result=analyze(paths),json=JSON.stringify(result,null,2);
 if(output)fs.writeFileSync(path.resolve(output),json+"\n");
 process.stdout.write(json+"\n");
}
if(require.main===module){
 try{main(process.argv.slice(2))}catch(error){process.stderr.write("Analysis error: "+error.message+"\n");process.exitCode=1;}
}
module.exports={analyze,knownType,validate,readBatch};
