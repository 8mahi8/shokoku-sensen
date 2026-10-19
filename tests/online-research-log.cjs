"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync("online-research.js","utf8");
const mem=new Map();
const localStorage={
 getItem:k=>mem.has(k)?mem.get(k):null,
 setItem:(k,v)=>{mem.set(k,v);},
 removeItem:k=>mem.delete(k)
};
const document={readyState:"loading",addEventListener(){},
 getElementById(){return null},querySelectorAll(){return []}};
const window={};
const context={document,window,localStorage,location:{hostname:"localhost"},
 console,Math,Number,JSON,Array,Date};
vm.runInNewContext(source,context,{filename:"online-research.js"});
const rec=window.ShokokuResearch,qa=window.__shokokuResearchQa;
assert.ok(rec&&qa,"browser logger API exists");
const world=(t=0)=>({elapsed:t,difficulty:"hard",
 energy:[0,7,6],capitals:[{hp:3000},{hp:2700}],
 forts:[{owner:1,hp:12},{owner:2,hp:9},{owner:0,hp:12}],
 units:[{team:1,key:"scout",x:510,y:200,hp:130},
  {team:2,key:"archer",x:710,y:210,hp:80}]});
rec.begin("solo",world());
assert.equal(rec.active,false,"OFF by default");
assert.equal(qa.get().matches.length,0,"no implicit recording");
qa.enableSolo();
rec.begin("solo",world());
assert.equal(rec.active,true,"opt-in solo recording starts");
rec.action({t:1,phase:"battle",team:1,card:"scout",x:300,y:205,
 energyBefore:8,ownHand:["scout","archer","tank","ward"]});
rec.action({t:2,phase:"battle",team:2,card:"archer",x:930,y:205,
 energyBefore:9,ownHand:["archer","barrage","scout","tank"]});
rec.sample(world(1));
rec.sample(world(9));
rec.finish(world(10));
const first=JSON.parse(mem.get("shokoku-research-batch-v1"));
assert.equal(first.length,1,"finished match saved for batch");
assert.equal(first[0].actions.length,2,"both team card actions captured");
assert.equal(first[0].actions[0].ownHand.length,4,"own hand, not enemy hand");
assert.equal(first[0].samples.length,3,"8-second periodic sampling with final sample");
assert.deepEqual(Array.from(first[0].result.castleHp),[3000,2700]);
const serialized=JSON.stringify(first);
for(const forbidden of ["clientId","roomCode","ipAddress","email","authToken","playerName","guestId"])
 assert.ok(!serialized.includes(forbidden),forbidden+" must not appear");
assert.equal(first[0].mode,"solo");
// Consent must be bilateral. A solo opt-in must never carry into online play.
rec.syncOnline({inRoom:true,ownConsent:true,bothConsent:false,playing:false});
rec.begin("online",world());
assert.equal(rec.active,false,"host-only consent does not record");
rec.syncOnline({inRoom:true,ownConsent:true,bothConsent:true,playing:true});
rec.begin("online",world());
assert.equal(rec.active,true,"both consent enables one authoritative recorder");
rec.action({t:3,phase:"battle",team:2,card:"infantry",x:900,y:200,energyBefore:4,ownHand:[]});
rec.syncOnline({inRoom:true,ownConsent:true,bothConsent:false,playing:true});
assert.equal(rec.active,false,"withdrawal immediately discards active game data");
assert.equal(qa.get().matches.length,1,"withdrawn game not archived");
rec.syncOnline({inRoom:true,ownConsent:true,bothConsent:true,playing:false});
rec.begin("online",world());
rec.finish(world(15));
assert.equal(qa.get().matches.length,2,"one opted-in online match archived");
assert.equal(qa.get().matches[1].mode,"online");
assert.equal(qa.get().matches[1].matchType,"unknown","legacy guest identity must not be inferred");
rec.syncOnline({inRoom:true,ownConsent:true,bothConsent:true,playing:true});
rec.begin("online",{...world(),guestControl:"human"});
rec.observeGuestControl("human",1);
rec.observeGuestControl("bot",3);
rec.finish(world(16));
assert.equal(qa.get().matches[2].matchType,"mixed","human-to-BOT transition must remain mixed");
assert.deepEqual(Array.from(qa.get().matches[2].guestControlHistory,x=>x.guest),["human","bot"]);
rec.begin("online",{...world(),guestControl:"human"});
rec.finish(world(17));
assert.equal(qa.get().matches[3].matchType,"human-vs-human");
rec.begin("online",{...world(),guestControl:"bot"});
rec.finish(world(18));
assert.equal(qa.get().matches[4].matchType,"human-vs-bot");

qa.clear();
assert.equal(qa.get().matches.length,0,"all batch data deleted");
assert.ok(!mem.has("shokoku-research-batch-v1"),"storage cleared");
// Cross-origin sandbox may refuse storage; the in-memory export must still work.
const denyStorage={getItem(){throw Error("blocked");},setItem(){throw Error("blocked");},removeItem(){throw Error("blocked");}};
const ctx={document,window:{},localStorage:denyStorage,location:{hostname:"localhost"},console,Math,Number,JSON,Array,Date};
vm.runInNewContext(source,ctx);
ctx.window.__shokokuResearchQa.enableSolo();
ctx.window.ShokokuResearch.begin("solo",world());
ctx.window.ShokokuResearch.finish(world(1));
assert.equal(ctx.window.__shokokuResearchQa.get().matches.length,1,"sandbox keeps downloadable in-memory result");
console.log("PASS: default OFF, bilateral consent, anonymized actions, bounded samples, storage failure, withdrawal, erase");
