"use strict";
// QA-only worker bridge injected into the same closure as the game.
// It NEVER changes card choices, player input, game tick, or network traffic.
let qaWorker=null,qaWorkerUrl=null,qaWorkerSeq=0,qaWorkerPending=new Map(),qaWorkerQaFrozen=false;
function qaWorkerStop(){
 if(qaWorker){qaWorker.terminate();qaWorker=null;}
 if(qaWorkerUrl){URL.revokeObjectURL(qaWorkerUrl);qaWorkerUrl=null;}
 for(const [,p] of qaWorkerPending){clearTimeout(p.timer);p.resolve({status:"closed"});}
 qaWorkerPending.clear();
}
function qaWorkerStart(source){
 qaWorkerStop();
 if(typeof Worker==="undefined")return {ok:false,reason:"unsupported"};
 if(typeof source!=="string"||source.length<50||source.length>25000)
  return {ok:false,reason:"invalidSource"};
 try{
  const url=URL.createObjectURL(new Blob([source],{type:"text/javascript"}));
  const worker=new Worker(url);
  qaWorker=worker;qaWorkerUrl=url;
  worker.onmessage=e=>{
   const msg=e.data||{},p=qaWorkerPending.get(msg.id);
   if(!p)return;
   qaWorkerPending.delete(msg.id);clearTimeout(p.timer);
   if(msg.type!=="result"||msg.version!==p.version){
    p.resolve({status:"invalidMessage"});return;
   }
   const elapsed=+(performance.now()-p.start).toFixed(2);
   // Browsers may throttle queued timeout callbacks. The result handler
   // must enforce the wall-clock deadline itself, never trust event order.
   if(elapsed>p.deadlineMs){
    p.resolve({status:"timeout",elapsed,reason:"lateWorkerResult"});return;
   }
   if(p.version!==qaWorkerSeq){p.resolve({status:"superseded",elapsed});return;}
   const chosen=msg.proposed?.winner;
   const exact=qaWorkerSignature(p.team)===p.signature;
   const freshness=exact?{valid:true,reason:"exactMatch"}:
    qaWorkerFreshness(p.capture,qaWorkerCapture(p.team),chosen,
     p.mode==="conservativePreflight"?"conservative":p.mode);
   if(!freshness.valid){
    p.resolve({status:"stale",reason:freshness.reason,elapsed,
     workerMs:msg.workerMs});return;
   }
   if(!chosen||!p.candidates.some(o=>o.id===chosen.id&&o.x===chosen.x&&o.y===chosen.y)||
    (chosen.id!=="wait"&&(!canPay(p.team,chosen.id)||
      !validTarget(p.team,chosen.id,chosen.x,chosen.y)))){
    p.resolve({status:"illegal",elapsed});return;
   }
   p.resolve({status:exact?"accepted":"acceptedRevalidated",
    freshness:freshness.reason,elapsed,workerMs:msg.workerMs,
    examined:msg.proposed.examined,chosen,
    ranking:msg.proposed.ranking,iterations:msg.iterations});
  };
  worker.onerror=e=>{
   for(const [,p] of qaWorkerPending){
    clearTimeout(p.timer);p.resolve({status:"workerError",message:e.message});
   }
   qaWorkerPending.clear();
  };
  return {ok:true,transport:"blob",note:"QA only; CSP may block blob workers in embeds"};
 }catch(e){
  qaWorkerStop();return {ok:false,reason:String(e)};
 }
}

// Conservative freshness contract (research-only). The worker never sees
// the true mutable S. Only the authoritative game validates its proposal.
// Do not relax thresholds based on tests after seeing the held-out outcomes.
function qaWorkerCapture(team){
 return {
  team,phase:S.phase,elapsed:S.elapsed,energy:S.energy[team],
  hand:S.hand[team].slice(),queue:S.queue[team].slice(),
  left:{...S.left[team]},
  forts:S.forts.map(f=>({owner:f.owner,hp:f.hp})),
  capitals:S.capitals.map(c=>c.hp),
  spells:JSON.stringify(S.spells),
  units:S.units.filter(u=>u.hp>0).map(u=>({
   uid:u.uid,team:u.team,key:u.key,x:u.x,y:u.y,hp:u.hp
  })),
  gate:qaGateAssess(team)?.eligible===true
 };
}
function qaWorkerFreshness(before,now,chosen,mode="strict"){
 if(!before||!now||!chosen)return {valid:false,reason:"missingSnapshot"};
 if(mode==="strict"){
  return {valid:false,reason:"strictSignatureChanged"};
 }
 if(mode!=="conservative")return {valid:false,reason:"unknownPolicy"};
 if(now.phase!=="battle"||before.phase!=="battle"||before.team!==now.team)
  return {valid:false,reason:"phaseOrTeam"};
 const elapsed=now.elapsed-before.elapsed;
 // No time travel. 0.30 GAME seconds ~9 physics ticks, not 300ms wall time.
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>.30)
  return {valid:false,reason:"age"};
 if(!now.gate||!before.gate)return {valid:false,reason:"gateChanged"};
 if(JSON.stringify(before.hand)!==JSON.stringify(now.hand)||
  JSON.stringify(before.queue)!==JSON.stringify(now.queue)||
  JSON.stringify(before.left)!==JSON.stringify(now.left))
  return {valid:false,reason:"cardsChanged"};
 if(JSON.stringify(before.forts)!==JSON.stringify(now.forts))
  return {valid:false,reason:"fortChanged"};
 if(JSON.stringify(before.capitals)!==JSON.stringify(now.capitals))
  return {valid:false,reason:"castleChanged"};
 if(before.spells!==now.spells)return {valid:false,reason:"spellChanged"};
 if(before.units.length!==now.units.length)
  return {valid:false,reason:"unitCountChanged"};
 const oldUnits=new Map(before.units.map(u=>[u.uid,u]));
 for(const u of now.units){
  const old=oldUnits.get(u.uid);
  if(!old||old.team!==u.team||old.key!==u.key)
   return {valid:false,reason:"unitRosterChanged"};
  // A new hit, heal or unit death changes tactical values sharply.
  if(Math.abs(old.hp-u.hp)>1e-6)
   return {valid:false,reason:"unitHpChanged"};
  if(Math.hypot(old.x-u.x,old.y-u.y)>12)
   return {valid:false,reason:"unitMovement"};
  if(u.team!==now.team){
   const face=WALL_FACE[now.team];
   if(Math.abs(old.x-face)>185&&Math.abs(u.x-face)<=185)
    return {valid:false,reason:"castleThreatBecameUrgent"};
  }
 }
 // Only natural regen may change owned energy. Spending is a major
 // game event even if no card remains available.
 const gain=now.energy-before.energy;
 if(gain<-.0001||gain>Math.max(.02,rate()*elapsed+.02))
  return {valid:false,reason:"unexpectedEnergy"};
 // Gate change + move/roster/spend guards above are not enough without
 // validating the exact proposed action in authoritative current rules.
 if(chosen.id!=="wait"&&(!canPay(now.team,chosen.id)||
  !validTarget(now.team,chosen.id,chosen.x,chosen.y)))
  return {valid:false,reason:"actionIllegalNow"};
 // Pre-hit danger: units may engage before the next damage tick. No HP
 // change yet does NOT mean the next ~0.3 s are tactically harmless.
 if(qaWorkerInContact(before.units,now.team)||
  qaWorkerInContact(now.units,now.team))
  return {valid:false,reason:"combatContact"};
 return {valid:true,reason:"benignMovementAndRegen",age:+elapsed.toFixed(3)};
}
function qaWorkerInContact(units,team){
 const friends=units.filter(u=>u.team===team),
  enemies=units.filter(u=>u.team!==team);
 return friends.some(a=>enemies.some(b=>{
  const da=CLASSES[a.key],db=CLASSES[b.key];
  if(!da||!db)return true; // Unknown classes fail closed.
  if((db.flying&&!da.hitAir)&&(da.flying&&!db.hitAir))return false;
  const contact=Math.max(110,da.range+25,db.range+25);
  return Math.hypot(a.x-b.x,a.y-b.y)<=contact;
 }));
}
// If a proposal must be vetoed for ongoing combat anyway, skip spawning
// the expensive Worker job in the first place. QA opt-in only: normal
// V8 strict and V9 conservative callers retain exactly their behavior.
function qaWorkerPreflight(team,capture){
 if(qaWorkerInContact(capture.units,team))
  return {skip:true,reason:"combatContact"};
 return {skip:false};
}
function qaWorkerSignature(team){
 // Authority stays with the host. Exact scene digest intentionally rejects
 // any move, hand rotation, enemy change, fort change or energy regen.
 return JSON.stringify([S.phase,+(S.elapsed).toFixed(3),
  +(S.energy[team]).toFixed(3),S.hand[team],S.queue[team],S.left[team],
  S.forts.map(f=>[f.owner,f.hp]),JSON.stringify(S.spells),
  S.units.filter(u=>u.hp>0).map(u=>[u.uid,u.team,u.key,
   +u.x.toFixed(2),+u.y.toFixed(2),+u.hp.toFixed(2)]),
  S.capitals.map(c=>+c.hp.toFixed(2))]);
}
function qaWorkerScene(team){
 if(S.phase!=="battle"||!NET.isSolo||![1,2].includes(team))return null;
 const foes=S.units.filter(u=>u.team!==team&&u.hp>0);
 const objective=S.forts.filter(f=>f.owner!==team).sort((a,b)=>
  team===2?b.x-a.x:a.x-b.x)[0];
 const threat=foes.slice().sort((a,b)=>team===2?b.x-a.x:a.x-b.x)[0];
 const edge=border(team),x=limit(edge+(team===2?35:-35),40,W-40);
 const actions=[{id:"wait",x:null,y:null,cost:0}],ids=new Set(["infantry",...S.hand[team]]);
 for(const id of ids){
  if(!CLASSES[id]||!canPay(team,id))continue;
  const y=limit((["scout","engineer","tank"].includes(id)?
   objective?.y:threat?.y)??objective?.y??330,70,H-70);
  if(validTarget(team,id,x,y))actions.push({id,x,y,cost:CLASSES[id].cost});
  if(threat&&["archer","sentinel","guardian","infantry","suppress"].includes(id)){
   const ix=limit(threat.x+(team===2?75:-75),40,W-40);
   if(validTarget(team,id,ix,threat.y)&&
     !actions.some(o=>o.id===id&&o.x===ix&&o.y===threat.y))
    actions.push({id,x:ix,y:threat.y,cost:CLASSES[id].cost});
  }
 }
 const classes=Object.fromEntries(Object.entries(CLASSES).map(([id,c])=>[id,
  {cost:c.cost,capture:c.capture||0,hitAir:!!c.hitAir,
   flying:!!c.flying,size:c.size,siege:c.siege||0}]));
 return {team,wallX:WALL_FACE[team],own:S.units.filter(u=>u.team===team&&u.hp>0)
  .map(u=>({key:u.key,x:u.x,y:u.y,hp:u.hp})),
  foes:foes.map(u=>({key:u.key,x:u.x,y:u.y,hp:u.hp})),
  forts:S.forts.map(f=>({x:f.x,y:f.y,owner:f.owner})),
  classes,actions:actions.slice(0,24)};
}
function qaWorkerFreeze(){
 if(!NET.isSolo)return false;
 S.speed=0;S.botThink=1e6;qaWorkerQaFrozen=true;return true;
}
function qaWorkerUnfreeze(){
 if(!NET.isSolo)return false;
 qaWorkerQaFrozen=false;S.speed=1;S.botThink=1e6;return true;
}
// QA-only staging of bounded natural changes. Never exported in game files.
// These perturbations test the authority-side policy, not rollout strength.
function qaWorkerPerturb(mode="benign",team=2){
 if(!NET.isSolo||S.phase!=="battle")return false;
 const foe=S.units.find(u=>u.team!==team&&u.hp>0);
 if(mode==="benign"){
  S.elapsed+=.15;S.energy[team]=Math.min(ENERGY_CAP,
   S.energy[team]+rate()*.15);
  if(foe){foe.x-=5;foe.y+=2;}
 }else if(mode==="hp"){
  if(!foe)return false;foe.hp=Math.max(1,foe.hp-10);
 }else if(mode==="fort")S.forts[2].owner=1;
 else if(mode==="castle")capital(team).hp-=1;
 else if(mode==="energy")S.energy[team]=Math.max(0,S.energy[team]-2);
 else if(mode==="card"){S.hand[team].reverse();}
 else if(mode==="spawn"){
  // New visible enemy acts as a decisive tactical change.
  const u=foe;
  if(!u)return false;
  S.units.push({...u,uid:++S.uid,x:u.x-50});
 }else if(mode==="largeMove"){
  if(!foe)return false;foe.x-=40;
 }else if(mode==="age")S.elapsed+=.40;
 else return false;
 return true;
}
function qaWorkerSubmit(team=2,spinMs=0,deadlineMs=1100,requireGate=true,mode="strict"){
 if(!qaWorker)return Promise.resolve({status:"unavailable"});
 if(!["strict","conservative","conservativePreflight"].includes(mode))
  return Promise.resolve({status:"invalidPolicy"});
 if(!Number.isFinite(spinMs)||spinMs<0||spinMs>800||
  !Number.isFinite(deadlineMs)||deadlineMs<1||deadlineMs>3000)
  return Promise.resolve({status:"invalidArguments"});
 const gate=requireGate?qaGateAssess(team):null;
 if(gate&&!gate.eligible)return Promise.resolve({status:"gateSkip",reason:gate.reason});
 const scene=qaWorkerScene(team);
 if(!scene)return Promise.resolve({status:"notSoloBattle"});
 const capture=qaWorkerCapture(team);
 if(mode==="conservativePreflight"){
  const preflight=qaWorkerPreflight(team,capture);
  if(preflight.skip)return Promise.resolve({status:"preflightSkip",
   reason:preflight.reason});
 }
 const signature=qaWorkerSignature(team),id=++qaWorkerSeq,version=id;
 return new Promise(resolve=>{
  const start=performance.now();
  const timer=setTimeout(()=>{
   if(!qaWorkerPending.has(id))return;
   qaWorkerPending.delete(id);
   resolve({status:"timeout",elapsed:+(performance.now()-start).toFixed(2)});
   // A dead or extremely busy worker must never block the next decision.
   // A future production design can recreate it after a timeout.
  },deadlineMs);
  qaWorkerPending.set(id,{timer,start,resolve,team,signature,capture,mode,
   version,deadlineMs,candidates:scene.actions});
  try{qaWorker.postMessage({type:"evaluate",id,version,scene,spinMs});}
  catch(e){clearTimeout(timer);qaWorkerPending.delete(id);
   resolve({status:"postFailed",message:String(e)});}
 });
}
