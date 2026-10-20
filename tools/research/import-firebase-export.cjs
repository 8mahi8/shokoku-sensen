#!/usr/bin/env node
"use strict";
/**
 * Offline-only importer for a Firebase Console ADMIN export. It writes the
 * existing anonymous batch format so analyze-match-batches.cjs can be reused.
 * NEVER commit the source export, raw match logs or generated batch to public
 * GitHub. Cloud access is private and deliberately not provided to browsers.
 *
 * Usage: node tools/research/import-firebase-export.cjs admin.json batch.json
 */
const fs=require("node:fs"),path=require("node:path");
const {validate}=require("./analyze-match-batches.cjs");
const MAX_FILE_BYTES=30*1024*1024,MAX_MATCHES=1000;
function sanitize(m){
 if(!m||m.mode!=="online")throw Error("not an online match");
 const out={schema:1,mode:"online",
  matchType:typeof m.matchType==="string"?m.matchType:"unknown",
  guestControlHistory:Array.isArray(m.guestControlHistory)?m.guestControlHistory.slice(0,32).map(e=>({
   t:Number(e.t),guest:String(e.guest)})):[],
  controlOverflow:m.controlOverflow===true,overflow:m.overflow===true,
  actions:Array.isArray(m.actions)?m.actions.slice(0,500).map(a=>({
   t:a.t,phase:a.phase,team:a.team,card:a.card,x:a.x,y:a.y,
   energyBefore:a.energyBefore,ownHand:Array.isArray(a.ownHand)?a.ownHand.slice(0,4):[]})):[],
  samples:Array.isArray(m.samples)?m.samples.slice(0,80).map(s=>({
   t:s.t,energy:s.energy,castles:s.castles,forts:s.forts,units:s.units})):[],
  result:m.result&&{winner:m.result.winner,duration:m.result.duration,
   castleHp:m.result.castleHp,fortOwners:m.result.fortOwners}};
 return validate(out);
}
function convert(raw,now=Date.now()){
 const root=raw?.shokokuResearchV1||raw;
 if(!root||Array.isArray(root)||typeof root!=="object")throw Error("Firebase research root missing");
 const rows=Object.entries(root);
 if(rows.length>MAX_MATCHES)throw Error("too many Firebase records, export smaller batches");
 const matches=[],summary={accepted:0,expired:0,invalid:0};
 for(const [id,item] of rows){
  // Firebase Console may contain arbitrary nodes. Never trust keys or data.
  if(!/^[a-zA-Z0-9-]{20,80}$/.test(id)||item?.schema!==1||
     !Number.isFinite(item.expiresAt)||!item.match){
   summary.invalid++;continue;
  }
  if(item.expiresAt<=now){summary.expired++;continue;}
  try{matches.push(sanitize(item.match));summary.accepted++;}
  catch(_){summary.invalid++;}
 }
 return {batch:{schema:1,format:"shokoku-anonymous-match-batch",matches},summary};
}
function main(argv){
 const [from,to]=argv;
 if(!from||!to||argv.length!==2)throw Error("usage: import-firebase-export.cjs admin.json batch.json");
 const source=path.resolve(from),output=path.resolve(to);
 if(source===output)throw Error("source and destination must differ");
 const stat=fs.statSync(source);
 if(!stat.isFile()||stat.size>MAX_FILE_BYTES)throw Error("source file is too large");
 const raw=JSON.parse(fs.readFileSync(source,"utf8")),r=convert(raw);
 fs.writeFileSync(output,JSON.stringify(r.batch)+"\n",{flag:"wx",mode:0o600});
 process.stdout.write(JSON.stringify({output,counts:r.summary})+"\n");
}
if(require.main===module)try{main(process.argv.slice(2))}
catch(e){console.error("Import failed:",e.message);process.exitCode=1;}
module.exports={convert,sanitize};
