"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {analyze,knownType,validate,readBatch}=require("../tools/research/analyze-match-batches.cjs");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"shokoku-batch-"));
const match=(mode,history,side=1)=>({
 schema:1,mode,teams:[1,2],guestControlHistory:history,
 actions:[{t:5,phase:"battle",team:side,card:"archer",x:300,y:220,energyBefore:5,ownHand:["archer"]}],
 samples:[{t:0,castles:[3000,3000],energy:[8,8],units:[],forts:[]},
  {t:10,castles:[2900,2700],energy:[3,2],units:[],forts:[]}],
 result:{winner:side,duration:10,castleHp:[2900,2700],fortOwners:[1,2,0]}}
);
const human=match("online",[{t:0,guest:"human"}]);
const bot=match("online",[{t:0,guest:"bot"}],2);
const mixed=match("online",[{t:0,guest:"human"},{t:3,guest:"bot"}]);
const unknown=match("online",[{t:0,guest:"unknown"},{t:5,guest:"human"}]);
const legacy=match("online",undefined);
const solo=match("solo",[],2);
assert.equal(knownType(human),"human-vs-human");
assert.equal(knownType(bot),"human-vs-bot");
assert.equal(knownType(mixed),"mixed");
assert.equal(knownType(unknown),"unknown");
assert.equal(knownType(legacy),"unknown");
assert.equal(knownType(solo),"human-vs-bot");
assert.equal(knownType({...human,controlOverflow:true}),"unknown");
try{
 const mk=(file,matches)=>{const filename=path.join(tmp,file);
  fs.writeFileSync(filename,JSON.stringify({schema:1,format:"shokoku-anonymous-match-batch",matches}));return filename};
 const a=mk("a.json",[human,bot,mixed,unknown,legacy,solo]);
 const b=mk("b.json",[human,bot]); // cumulative export overlap
 const summary=analyze([a,b]);
 assert.equal(summary.files,2);
 assert.equal(summary.matches,6);
 assert.equal(summary.duplicateExportsSkipped,2);
 assert.equal(summary.modeBreakdown["human-vs-human"].matches,1);
 assert.equal(summary.modeBreakdown["human-vs-bot"].matches,2);
 assert.equal(summary.modeBreakdown.mixed.matches,1);
 assert.equal(summary.modeBreakdown.unknown.matches,2);
 assert.equal(summary.recordedCardUse.archer.uses,6);
 assert.equal(summary.modeBreakdown["human-vs-human"].blueWins,1);
 assert.equal(readBatch(a).length,6);
 assert.throws(()=>validate({...human,schema:99}),/invalid/);
 const bad=mk("bad.json",[{...human,actions:[{team:3,card:"archer",t:0,x:1,y:1,energyBefore:4}]}]);
 assert.throws(()=>analyze([bad]),/invalid action/);
 const proto=mk("no-ids.json",[human]);
 const r=JSON.stringify(analyze([proto]));
 for(const field of ["playerName","roomCode","clientId","guestId","ipAddress"])
  assert.ok(!r.includes(field),field+" must not be returned");
 console.log("PASS: dedupe batch exports, distinguish human/BOT/mixed/unknown, validate schema and summarize safely");
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
