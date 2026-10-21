"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync("research-recover.html","utf8");
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.equal(script.length,1,"self-contained recovery tool");
const dom=new Map();
let sharedPayload=null;
class TestFile {
 constructor(parts,name,opts){this.body=parts.join("");this.name=name;this.type=opts.type;}
}
const getElementById=id=>{
 if(!dom.has(id))dom.set(id,{disabled:false,files:[],textContent:"",handlers:{},
  addEventListener(event,fn){this.handlers[event]=fn}});
 return dom.get(id);
};
const context=vm.createContext({document:{getElementById},fetch:async()=>{throw Error("network must not be called for import");},
 URL,Blob,File:TestFile,navigator:{canShare:()=>true,share:async p=>{sharedPayload=p;}},
 setTimeout,clearTimeout,console,Date,Promise,JSON,Object,Number});
new vm.Script(script[0],{filename:"research-recover.html#script"}).runInContext(context);
const exported={schema:1,mode:"online",matchType:"human-vs-human",extraIdentity:"NEVER_INCLUDE",
 actions:[{t:4,phase:"battle",team:1,card:"scout",x:450,y:250,energyBefore:8,
  ownHand:["scout","tank"],userEmail:"NEVER_INCLUDE"}],
 samples:[{t:4,energy:[8,7],castles:[3000,2800],forts:[[1,10],[0,10],[2,10]],
  units:[[1,"scout",450,250,150,"NEVER_INCLUDE"]],deviceId:"NEVER_INCLUDE"}],
 result:{winner:1,duration:35,castleHp:[3000,2800],fortOwners:[1,0,2],name:"NEVER_INCLUDE"},
 guestControlHistory:[{t:0,guest:"human"}],controlOverflow:false,overflow:false};
const rooms={"12345":{meta:{status:"finished",clientId:"NEVER_INCLUDE"},
 researchRounds:{"1":{schema:1,createdAt:100,match:exported},
  "2":{schema:1,createdAt:200,match:{...exported,actions:[]}}}},
 "66666":{researchRounds:{"1":{schema:1,createdAt:300,match:{...exported,result:{...exported.result,winner:2}}}}},
 "_bad":{researchRounds:{"1":{schema:1,match:exported}}},
 "44444":{researchRounds:{"1":{schema:0,match:exported}}}};
const getMatches=vm.runInContext("getMatches",context);
const a=getMatches({shokokuRooms1v1:rooms});
const b=getMatches(rooms);
assert.equal(a.length,3);
assert.equal(b.length,3);
assert.equal(a[0].actions.length,1);
assert.equal(a[1].actions.length,0);
assert.equal(a[2].result.winner,2);
assert.ok(!JSON.stringify(a).includes("NEVER_INCLUDE"));
for(const key of ["roomCode","clientId","deviceId","userEmail","extraIdentity"])
 assert.ok(!JSON.stringify(a).includes(key),"no personal/room data in batch "+key);
const loaded=vm.runInContext("loaded",context);
loaded({shokokuRooms1v1:rooms});
const batch=vm.runInContext("batch",context);
assert.equal(batch.format,"shokoku-anonymous-match-batch");
assert.equal(batch.matches.length,3);
assert.equal(getElementById("download").disabled,false);
assert.equal(getElementById("share").disabled,false);
loaded({shokokuRooms1v1:{"12345":{meta:{status:"playing"}}}});
assert.equal(getElementById("download").disabled,true);
assert.equal(getElementById("share").disabled,true);
assert.equal(getMatches({shokokuRooms1v1:{"12345":{researchRounds:{"1":{schema:1,match:{...exported,result:null}}}}}}).length,0);

const tainted={...exported,
 matchType:"contact@example.net",
 guestControlHistory:[{t:0,guest:"contact@example.net"}],
 actions:[{...exported.actions[0],card:"contact@example.net",ownHand:["contact@example.net"]}],
 samples:[{...exported.samples[0],units:[[1,"scout",450,250,150,"contact@example.net"]]}]};
const taintedBatch=getMatches({"12345":{researchRounds:{"1":{schema:1,match:tainted}}}});
assert.equal(taintedBatch.length,1,"valid frame is kept while bad metadata is scrubbed");
assert.equal(taintedBatch[0].matchType,"unknown");
assert.equal(taintedBatch[0].guestControlHistory.length,0);
assert.equal(taintedBatch[0].actions.length,0);
assert.ok(!JSON.stringify(taintedBatch).includes("contact@example.net"),
 "unexpected nested identifier must not leave the recovery page");
const invalidFrame={...exported,samples:[{...exported.samples[0],
 units:[[1,"scout",450,"contact@example.net",150]]}]};
assert.equal(getMatches({"12345":{researchRounds:{"1":{schema:1,match:invalidFrame}}}}).length,0,
 "a non-numeric coordinate invalidates the frame instead of exporting it");
const unknownCard={...exported,
 actions:[{...exported.actions[0],card:"fakePersonalNote",
  phase:"fakePersonalNote",ownHand:["scout","fakePersonalNote"]}]};
const strictBatch=getMatches({"12345":{researchRounds:{"1":{schema:1,match:unknownCard}}}});
assert.equal(strictBatch.length,1,"reject a bogus card without dropping the valid match");
assert.equal(strictBatch[0].actions.length,0,"unknown action card must be dropped");
assert.ok(!JSON.stringify(strictBatch).includes("fakePersonalNote"),"unknown text never exported");
const unknownUnit={...exported,samples:[{...exported.samples[0],
 units:[[1,"fakePersonalNote",450,250,150]]}]};
assert.equal(getMatches({"12345":{researchRounds:{"1":{schema:1,match:unknownUnit}}}}).length,0,
 "unknown unit key invalidates tampered match");
const allKnown={...exported,
 actions:["infantry","scout","engineer","archer","sentinel","suppress",
  "guardian","drone","tank","barrage","ward"].map((card,i)=>({
   ...exported.actions[0],t:i,card,phase:i%2?"battle":"prep"
  }))};
const completeBatch=getMatches({"12345":{researchRounds:{"1":{schema:1,match:allKnown}}}});
assert.equal(completeBatch[0].actions.length,11,"all valid card types remain supported");
assert.equal(completeBatch[0].actions[0].phase,"prep");

loaded({shokokuRooms1v1:rooms});
getElementById("share").handlers.click().then(()=>{
 assert.ok(sharedPayload?.files?.length===1,"iPhone share sheet receives one JSON file");
 assert.equal(sharedPayload.files[0].name,"shokoku-research-recovered.json");
 const shared=JSON.parse(sharedPayload.files[0].body);
 assert.equal(shared.matches.length,3,"all opted-in matches shared together");
 assert.ok(!JSON.stringify(shared).includes("NEVER_INCLUDE"));
 console.log("PASS: phone recovery sanitizes data and passes one anonymous JSON file to native share");
}).catch(err=>{console.error(err);process.exitCode=1;});
console.log("PASS: recovery page converts multiple room rounds into bot-analysis JSON without room IDs, device IDs or network calls");
