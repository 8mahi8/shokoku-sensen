"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const path=require("node:path");
const {storageKey}=require("../functions/research/collector-core.cjs");
const source=fs.readFileSync("functions/research/index.js","utf8");
const now=Date.now(),uid="host-uid-authenticated-12345",guestUid="guest-uid-authenticated-67890";
const root={meta:{version:2,status:"finished",round:1,startedAt:now-220000},
 players:{host:{cloudConsent:true,researchConsent:true,cloudUid:uid},
  guest:{cloudConsent:true,researchConsent:true,cloudUid:guestUid}}};
const match={schema:1,mode:"online",matchType:"human-vs-human",
 guestControlHistory:[{t:0,guest:"human"}],controlOverflow:false,overflow:false,
 actions:[{t:4,phase:"battle",team:1,card:"scout",x:380,y:200,
  energyBefore:8,ownHand:["scout"]}],
 samples:[{t:0,energy:[9,8],castles:[3000,2700],
  forts:[[1,10],[0,20],[2,10]],units:[[1,"scout",380,200,190]]}],
 result:{winner:1,duration:210,castleHp:[3000,2700],fortOwners:[1,0,2]}};
const store=new Map([["shokokuRooms1v1/12345",root]]);
const ref=p=>({
 get:async()=>({val:()=>store.get(p)||null,exists:()=>store.has(p)}),
 child:s=>ref(p+"/"+s),
 transaction:async fn=>{
  const current=store.has(p)?store.get(p):null,updated=fn(current);
  if(updated===undefined)return {committed:false};
  store.set(p,updated);return {committed:true};
 }
});
class HttpsError extends Error{constructor(code,message){super(message);this.code=code}}
let handler,options;
const requireMock=name=>{
 if(name==="firebase-functions/v2/https")return {HttpsError,onCall:(o,h)=>{options=o;handler=h;return h}};
 if(name==="firebase-admin/app")return {initializeApp:()=>{}};
 if(name==="firebase-admin/database")return {getDatabase:()=>({ref})};
 if(name==="./collector-core.cjs")return require("../functions/research/collector-core.cjs");
 throw Error("unexpected import "+name);
};
const context={require:requireMock,exports:{},Date,Number,Math,String,Boolean,Array,Object,Error,JSON,console};
vm.runInNewContext(source,context,{filename:"functions/research/index.js"});
assert.equal(typeof handler,"function");
assert.equal(options.enforceAppCheck,true);
assert.equal(options.maxInstances,2);
const input={roomCode:"12345",round:1,match},caller={
 auth:{uid},app:{appId:"registered-app-check-id"},data:input};
async function denied(req,code){
 await assert.rejects(()=>handler(req),err=>err.code===code,
  "expected "+code+" for invalid request");
}
(async()=>{
 await denied({...caller,app:null},"unauthenticated");
 await denied({...caller,auth:null},"unauthenticated");
 await denied({...caller,auth:{uid:guestUid}},"failed-precondition");
 await denied({...caller,data:{...input,match:{...match,actions:[{...match.actions[0],card:"unknown"}]}}},"failed-precondition");
 root.players.guest.cloudConsent=false;
 await denied(caller,"failed-precondition");root.players.guest.cloudConsent=true;
 root.meta.status="playing";
 await denied(caller,"failed-precondition");root.meta.status="finished";
 assert.equal((await handler(caller)).saved,true);
 const key=storageKey({roomCode:"12345",round:1,startedAt:root.meta.startedAt});
 const saved=store.get("shokokuResearchV1/"+key);
 assert.equal(saved.match.result.winner,1);
 const json=JSON.stringify(saved);
 for(const secret of [uid,guestUid,"roomCode","12345"]){
  assert.ok(!json.includes(secret),"no player UID or room ID in stored payload");
 }
 assert.equal((await handler(caller)).duplicate,true,"repeat request must not duplicate");
 assert.equal(store.get("shokokuResearchRateV1/"+new Date().toISOString().slice(0,10)+"/users/"+uid),1,
  "duplicate does not consume more quota");
 root.meta.round=2;root.meta.startedAt=now-180000;
 store.set("shokokuResearchRateV1/"+new Date().toISOString().slice(0,10)+"/users/"+uid,12);
 await denied({...caller,data:{...input,round:2}},"resource-exhausted");
 assert.equal(store.size>0,true);
 console.log("PASS: callable requires App Check+Auth, rejects forged consent/state, stores anonymously, idempotency, rate limiting");
})().catch(err=>{console.error(err);process.exitCode=1});
