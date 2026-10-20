"use strict";
/*
 * Server-side only. The browser MUST NOT have write permission to:
 * /shokokuResearchV1 or /shokokuResearchRateV1.
 * Never deploy before validating the entire RTDB ancestor rules tree.
 * Deployment may require a paid Firebase/Google Cloud billing tier.
 */
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {initializeApp}=require("firebase-admin/app");
const {getDatabase}=require("firebase-admin/database");
const {validateAdmission,storageKey}=require("../../tools/research/collector-core.cjs");
const DB_URL="https://mygame-df915-default-rtdb.firebaseio.com";
initializeApp({databaseURL:DB_URL});
const db=getDatabase();
const PERIOD=14*86400000;
function reject(message){throw new HttpsError("failed-precondition",message)}
async function cap(ref,max){
 const r=await ref.transaction(v=>{
  const n=Number.isSafeInteger(v)&&v>=0?v:0;
  return n<max?n+1:undefined;
 },undefined,false);
 return r.committed;
}
exports.collectShokokuMatch=onCall({
 region:"asia-northeast1",enforceAppCheck:true,
 maxInstances:2,memory:"256MiB",timeoutSeconds:20,
},async request=>{
 // Not enough to merely set a frontend flag; Firebase Auth and App Check
 // must BOTH be verified by the Cloud Functions callable protocol.
 if(!request.auth?.uid||!request.app?.appId)
  throw new HttpsError("unauthenticated","App Check and Firebase Auth required");
 const now=Date.now(),input=request.data;
 if(!input||typeof input!=="object")
  throw new HttpsError("invalid-argument","Missing request");
 const {roomCode,round,match}=input;
 if(typeof roomCode!=="string"||!/^\d{5}$/.test(roomCode)||
  !Number.isSafeInteger(round)||round<1||round>500)
  throw new HttpsError("invalid-argument","Invalid room or round");
 const room=(await db.ref("shokokuRooms1v1/"+roomCode).get()).val();
 let cleaned;
 try{cleaned=validateAdmission({
  roomCode,round,uid:request.auth.uid,room,now,attested:true,match
 })}catch(_){reject("Consent, session or match validation failed")}
 const key=storageKey({roomCode,round,startedAt:room.meta.startedAt});
 const target=db.ref("shokokuResearchV1/"+key);
 if((await target.get()).exists())return {saved:true,duplicate:true};
 const day=new Date(now).toISOString().slice(0,10);
 // Caps are enforced on trusted server, not localStorage. Exact-once target
 // prevents duplicate records for the same round. Conservative quotas may
 // count a failed attempt; that is safer than permitting unlimited spam.
 const base=db.ref("shokokuResearchRateV1");
 if(!await cap(base.child("global/"+day),150))
  throw new HttpsError("resource-exhausted","Daily service cap reached");
 if(!await cap(base.child("users/"+request.auth.uid+"/"+day),12))
  throw new HttpsError("resource-exhausted","Daily upload cap reached");
 const t=await target.transaction(previous=>previous===null?{
  schema:1,createdAt:now,expiresAt:now+PERIOD,match:cleaned
 }:undefined,undefined,false);
 if(!t.committed)return {saved:true,duplicate:true};
 return {saved:true,duplicate:false};
});
