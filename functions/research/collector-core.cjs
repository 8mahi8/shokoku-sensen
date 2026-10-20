"use strict";
/* Pure server-side input verification. No Firebase SDK dependencies.
 * For callable Cloud Functions: never trust the browser's match payload or
 * client-side quota, consent, status, identity, room membership or timestamps.
 */
const crypto=require("node:crypto");
const CARDS=new Set(["infantry","scout","engineer","archer","sentinel","suppress","guardian","drone","tank","barrage","ward"]);
const UNITS=new Set([...CARDS].filter(x=>x!=="barrage"&&x!=="ward"));
const MAX_BYTES=65000;
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const finite=(x,min,max)=>typeof x==="number"&&Number.isFinite(x)&&x>=min&&x<=max;
const isPlain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(x,keys)=>isPlain(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
function sanitizedMatch(m){
 if(!isPlain(m)||m.schema!==1||m.mode!=="online"||
  !["human-vs-human","human-vs-bot","mixed","unknown"].includes(m.matchType)||
  !Array.isArray(m.actions)||m.actions.length>500||
  !Array.isArray(m.samples)||m.samples.length<1||m.samples.length>80||
  !Array.isArray(m.guestControlHistory)||m.guestControlHistory.length>32||
  !isPlain(m.result)||!integer(m.result.winner,0,2)||
  !finite(m.result.duration,0,315)||
  !Array.isArray(m.result.castleHp)||m.result.castleHp.length!==2||
  !m.result.castleHp.every(h=>finite(h,0,1e6)))throw Error("invalid-match");
 const history=m.guestControlHistory.map(h=>{
  if(!exact(h,["t","guest"])||!finite(h.t,0,315)||!["human","bot","unknown"].includes(h.guest))
   throw Error("invalid-control");
  return {t:h.t,guest:h.guest};
 });
 const actions=m.actions.map(a=>{
  if(!exact(a,["t","phase","team","card","x","y","energyBefore","ownHand"])||
    !finite(a.t,0,315)||!["battle","prep"].includes(a.phase)||!integer(a.team,1,2)||
    !CARDS.has(a.card)||!finite(a.x,0,1600)||!finite(a.y,0,900)||
    !finite(a.energyBefore,0,12.05)||!Array.isArray(a.ownHand)||a.ownHand.length>4||
    !a.ownHand.every(k=>CARDS.has(k)))throw Error("invalid-action");
  return {t:a.t,phase:a.phase,team:a.team,card:a.card,x:a.x,y:a.y,
   energyBefore:a.energyBefore,ownHand:[...a.ownHand]};
 });
 const samples=m.samples.map(s=>{
  if(!exact(s,["t","energy","castles","forts","units"])||
    !finite(s.t,0,315)||!Array.isArray(s.energy)||s.energy.length!==2||
    !s.energy.every(e=>finite(e,0,12.05))||
    !Array.isArray(s.castles)||s.castles.length!==2||
    !s.castles.every(h=>finite(h,0,1e6))||
    !Array.isArray(s.forts)||s.forts.length!==3||
    !s.forts.every(f=>Array.isArray(f)&&f.length===2&&integer(f[0],0,2)&&finite(f[1],0,1e6))||
    !Array.isArray(s.units)||s.units.length>180||
    !s.units.every(u=>Array.isArray(u)&&u.length===5&&integer(u[0],1,2)&&UNITS.has(u[1])&&
      finite(u[2],0,1600)&&finite(u[3],0,900)&&finite(u[4],0,1e6)))
    throw Error("invalid-sample");
  return {t:s.t,energy:[...s.energy],castles:[...s.castles],
   forts:s.forts.map(f=>[...f]),units:s.units.map(u=>[...u])};
 });
 if(!Array.isArray(m.result.fortOwners)||m.result.fortOwners.length!==3||
  !m.result.fortOwners.every(o=>integer(o,0,2))||
  typeof m.controlOverflow!=="boolean"||typeof m.overflow!=="boolean")
   throw Error("invalid-result");
 const cleaned={schema:1,mode:"online",matchType:m.matchType,
  guestControlHistory:history,controlOverflow:m.controlOverflow,overflow:m.overflow,
  actions,samples,result:{winner:m.result.winner,duration:m.result.duration,
   castleHp:[...m.result.castleHp],fortOwners:[...m.result.fortOwners]}};
 if(Buffer.byteLength(JSON.stringify(cleaned),"utf8")>MAX_BYTES)throw Error("too-large");
 return cleaned;
}
function validateAdmission({roomCode,round,uid,room,now,attested,match}){
 if(!attested||typeof uid!=="string"||uid.length<10||!/^\d{5}$/.test(roomCode)||
   !integer(round,1,500)||!isPlain(room)||!integer(now,0,Number.MAX_SAFE_INTEGER))
  throw Error("unauthorized");
 const meta=room.meta||{},h=room.players?.host||{},g=room.players?.guest||{};
 if(meta.status!=="finished"||meta.round!==round||meta.version!==2||
   !finite(meta.startedAt,now-8*60*1000,now)||
   h.cloudUid!==uid||h.cloudConsent!==true||g.cloudConsent!==true||
   h.researchConsent!==true||g.researchConsent!==true||
   typeof g.cloudUid!=="string"||g.cloudUid.length<10||g.cloudUid===uid)
  throw Error("not-eligible");
 return sanitizedMatch(match);
}
function storageKey({roomCode,round,startedAt}){
 // Hash only on server. Stored record must never contain room codes/user IDs.
 return crypto.createHash("sha256").update(String(roomCode)+"|"+String(round)+"|"+String(startedAt)).digest("hex");
}
module.exports={sanitizedMatch,validateAdmission,storageKey,MAX_BYTES};
