"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {convert}=require("../tools/research/import-firebase-export.cjs");
const {readBatch,analyze}=require("../tools/research/analyze-match-batches.cjs");
const now=1750000000000,key="abcdefghijklmnopqrstuvwx23456789";
const m={schema:1,mode:"online",matchType:"human-vs-human",
 guestControlHistory:[{t:0,guest:"human"}],controlOverflow:false,overflow:false,
 actions:[{t:2,phase:"battle",team:1,card:"scout",x:300,y:250,
  energyBefore:7,ownHand:["scout","tank"],roomCode:"DO_NOT_COPY"}],
 samples:[{t:2,energy:[7,6],castles:[3000,2800],
  forts:[[1,12],[0,15],[2,14]],
  units:[[1,"scout",400,250,130,"SECRET_NESTED_ID"]],
  clientId:"DO_NOT_COPY"}],
 result:{winner:1,duration:25,castleHp:[3000,2800],fortOwners:[1,0,2]},
 clientId:"SECRET_CLIENT",roomCode:"SECRET_ROOM"};
const root={shokokuResearchV1:{
 [key]:{schema:1,createdAt:now-1000,expiresAt:now+100000,match:m},
 [key+"-expired"]:{schema:1,createdAt:now-100000,expiresAt:now-1,match:m},
 invalid_key:{schema:1,expiresAt:now+100000,match:m},
 [key+"-bad"]:{schema:1,expiresAt:now+100000,
  match:{...m,actions:[{...m.actions[0],card:"user@example.com"}]}}
}};
const r=convert(root,now);
assert.equal(r.summary.accepted,1);
assert.equal(r.summary.expired,1);
assert.equal(r.summary.invalid,2);
assert.equal(r.batch.matches.length,1);
const json=JSON.stringify(r.batch);
for(const secret of ["SECRET_CLIENT","SECRET_ROOM","DO_NOT_COPY",
 "SECRET_NESTED_ID","clientId","roomCode","createdAt","expiresAt"])
 assert.ok(!json.includes(secret),"secret must not reach analysis "+secret);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"shokoku-cloud-export-"));
try{
 const file=path.join(temp,"batch.json");
 fs.writeFileSync(file,json);
 assert.equal(readBatch(file).length,1);
 assert.equal(analyze([file]).modeBreakdown["human-vs-human"].matches,1);
}finally{fs.rmSync(temp,{recursive:true,force:true})}
console.log("PASS: admin Firebase export converts to anonymous research batches; stale/invalid entries and embedded identifiers dropped");
