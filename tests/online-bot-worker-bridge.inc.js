"use strict";
// QA-only worker bridge injected into the same closure as the game.
// It NEVER changes card choices, player input, game tick, or network traffic.
let qaWorker=null,qaWorkerUrl=null,qaWorkerSeq=0,qaWorkerPending=new Map();
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
   if(p.version!==qaWorkerSeq){p.resolve({status:"superseded",elapsed});return;}
   if(qaWorkerSignature(p.team)!==p.signature){
    p.resolve({status:"stale",elapsed,workerMs:msg.workerMs});return;
   }
   const chosen=msg.proposed?.winner;
   if(!chosen||!p.candidates.some(o=>o.id===chosen.id&&o.x===chosen.x&&o.y===chosen.y)||
    (chosen.id!=="wait"&&(!canPay(p.team,chosen.id)||
      !validTarget(p.team,chosen.id,chosen.x,chosen.y)))){
    p.resolve({status:"illegal",elapsed});return;
   }
   p.resolve({status:"accepted",elapsed,workerMs:msg.workerMs,
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
function qaWorkerSignature(team){
 // Authority stays with the host. Exact scene digest intentionally rejects
 // any move, hand rotation, enemy change, fort change or energy regen.
 return JSON.stringify([S.phase,+(S.elapsed).toFixed(3),
  +(S.energy[team]).toFixed(3),S.hand[team],S.queue[team],S.left[team],
  S.forts.map(f=>[f.owner,f.hp]),
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
 S.speed=0;S.botThink=1e6;return true;
}
function qaWorkerSubmit(team=2,spinMs=0,deadlineMs=1100,requireGate=true){
 if(!qaWorker)return Promise.resolve({status:"unavailable"});
 if(!Number.isFinite(spinMs)||spinMs<0||spinMs>800||
  !Number.isFinite(deadlineMs)||deadlineMs<1||deadlineMs>3000)
  return Promise.resolve({status:"invalidArguments"});
 const gate=requireGate?qaGateAssess(team):null;
 if(gate&&!gate.eligible)return Promise.resolve({status:"gateSkip",reason:gate.reason});
 const scene=qaWorkerScene(team);
 if(!scene)return Promise.resolve({status:"notSoloBattle"});
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
  qaWorkerPending.set(id,{timer,start,resolve,team,signature,version,
   candidates:scene.actions});
  try{qaWorker.postMessage({type:"evaluate",id,version,scene,spinMs});}
  catch(e){clearTimeout(timer);qaWorkerPending.delete(id);
   resolve({status:"postFailed",message:String(e)});}
 });
}
