"use strict";
const assert=require("node:assert/strict");
const {sanitizedMatch,validateAdmission,storageKey}=require("../functions/research/collector-core.cjs");
const now=Date.now(),uid="some-very-long-anonymous-user-id";
const match={schema:1,mode:"online",matchType:"human-vs-human",
 guestControlHistory:[{t:0,guest:"human"}],controlOverflow:false,overflow:false,
 actions:[{t:3,phase:"battle",team:1,card:"infantry",x:300,y:230,
  energyBefore:8,ownHand:["scout","tank"]}],
 samples:[{t:3,energy:[10,8],castles:[3000,2700],
  forts:[[1,12],[0,15],[2,10]],units:[[1,"infantry",300,230,105]]}],
 result:{winner:1,duration:270,castleHp:[3000,2700],fortOwners:[1,0,2]},
 clientId:"IGNORED-CLIENT-ID",roomCode:"IGNORED-ROOM",privateInfo:"DO NOT STORE"};
const room={meta:{status:"finished",round:2,version:2,startedAt:now-6*60000},
 players:{host:{cloudConsent:true,researchConsent:true,cloudUid:uid},
 guest:{cloudConsent:true,researchConsent:true,cloudUid:"different-anonymous-uid"}}};
const args={roomCode:"12345",round:2,uid,room,now,attested:true,match};
const r=validateAdmission(args);
assert.equal(r.matchType,"human-vs-human");
assert.equal(r.actions.length,1);
const j=JSON.stringify(r);
for(const s of ["IGNORED-CLIENT-ID","IGNORED-ROOM","DO NOT STORE","clientId","roomCode"])
 assert.ok(!j.includes(s),"omit arbitrary browser fields: "+s);
const fail=(patch)=>assert.throws(()=>validateAdmission({...args,...patch}),/unauthorized|not-eligible|invalid/);
fail({uid:"different-user-id-xxxx"});
fail({attested:false});
fail({room:{...room,meta:{...room.meta,status:"playing"}}});
fail({room:{...room,meta:{...room.meta,round:3}}});
fail({room:{...room,meta:{...room.meta,startedAt:now-9*60000}}});
fail({room:{...room,players:{...room.players,guest:{...room.players.guest,cloudConsent:false}}}});
fail({room:{...room,players:{...room.players,host:{...room.players.host,researchConsent:false}}}});
fail({room:{...room,players:{...room.players,guest:{...room.players.guest,cloudUid:uid}}}});
fail({roomCode:"invalid-123"});
fail({match:{...match,actions:[{...match.actions[0],card:"fake"}]}});
fail({match:{...match,samples:[{...match.samples[0],units:[[1,"badunit",1,2,3]]}]}});
fail({match:{...match,result:{...match.result,castleHp:[9999,"x"]}}});
fail({match:{...match,samples:[{...match.samples[0],roomCode:"LEAK"}]}});
fail({match:{...match,actions:[{...match.actions[0],ownHand:["card-does-not-exist"]}]}});
fail({match:{...match,actions:Array(501).fill(match.actions[0])}});
const key=storageKey({roomCode:"12345",round:2,startedAt:room.meta.startedAt});
assert.match(key,/^[a-f0-9]{64}$/);
assert.equal(key,storageKey({roomCode:"12345",round:2,startedAt:room.meta.startedAt}),
 "same match has same backend idempotency key");
assert.notEqual(key,storageKey({roomCode:"12345",round:3,startedAt:room.meta.startedAt}));
assert.equal(sanitizedMatch(match).actions[0].card,"infantry");
console.log("PASS: server-side Firebase identity, bilateral consent, finished-round admission, strict schema, no ID leakage, stable idempotency");
