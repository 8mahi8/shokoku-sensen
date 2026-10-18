"use strict";
// ONLY injected by localhost QA into online-game.js. Neither production
// source nor online/Firebase behavior is changed by this helper.
let qaRealDuel=null;
function qaRealDuelStart(seed,checkpoint,liveSeconds,workMs=90,policy="conservativePreflight"){
 if(!NET.isSolo||!Number.isInteger(seed)||seed<1||seed>9999999||
  ![30,105,190].includes(checkpoint)||
  !Number.isFinite(liveSeconds)||liveSeconds<6||liveSeconds>30||
  ![40,120,250].includes(workMs)||
  !["conservativePreflight","conservative","off"].includes(policy)||
  qaRealDuel)return {ok:false,reason:"invalidOrRunning"};
 const oldRandom=Math.random;let state=seed>>>0;
 Math.random=()=>{
  state=(Math.imul(state,1664525)+1013904223)>>>0;
  return state/4294967296;
 };
 try{
  resetWorld();S.phase="battle";S.prep=0;S.speed=1;
  S.botThink=1e7;S.difficulty="hard";
  $("overlay").classList.add("hidden");
  $("prepBanner").classList.remove("visible");
  // Execute the SAME playCard, botExpertAction, unitStep, spellStep,
  // and tick(1/30) path to reconstruct the seed's realistic history.
  qaRealDuel={seed,checkpoint,liveSeconds,workMs,policy,oldRandom,
   finished:false,windowStarted:false,mode:"fastForward",
   think:[null,3.1,3.1],nextProbe:0,pending:false,
   tickCount:0,decisions:[0,0,0],probes:0,skipped:{},responses:[],
   selectedChecks:0,eligibleChecks:0,nonEligible:{},entry:null,
   preflights:0,runCalls:0,lastWorkerAt:-1e6,observeTicks:0};
  for(let i=0;i<checkpoint*30&&S.phase==="battle";i++){
   tick(1/30);
  }
  if(S.phase!=="battle"){
   const reason={ok:false,reason:"matchEndedBeforeCheckpoint",at:S.elapsed};
   qaRealDuel=null;Math.random=oldRandom;return reason;
  }
  qaRealDuel.mode="live";qaRealDuel.windowStarted=true;
  qaRealDuel.nextProbe=S.elapsed+.10;
  qaRealDuel.until=S.elapsed+liveSeconds;
  qaRealDuel.entry=qaRealDuelWorld();
  return {ok:true,seed,checkpoint,at:S.elapsed,
   stage:qaRealDuel.entry,policy};
 }catch(e){
  qaRealDuel=null;Math.random=oldRandom;throw e;
 }
}
function qaRealDuelWorld(){
 return {elapsed:+S.elapsed.toFixed(3),phase:S.phase,
  capitalHp:S.capitals.map(x=>+x.hp.toFixed(2)),
  forts:S.forts.map(f=>[f.owner,+f.hp.toFixed(2)]),
  energy:S.energy.slice().map(v=>+v.toFixed(3)),
  units:S.units.length,
  cards:S.hand.map(h=>h?.slice()),
  tickCount:S.tickCount};
}
function qaRealDuelTick(dt){
 const d=qaRealDuel;
 if(!d||d.finished||S.phase!=="battle")return;
 d.tickCount++;
 // Both sides use the same existing expert BOT and legal card economy.
 // Default solo team-2 think is disabled with S.botThink=1e7.
 for(const team of [1,2]){
  d.think[team]-=dt;
  if(d.think[team]<=0){
   d.decisions[team]++;
   botExpertAction(team);
   d.think[team]=rand(1.2,1.9);
  }
 }
 if(d.mode!=="live")return;
 d.observeTicks++;
 if(S.elapsed>=d.nextProbe){
  d.nextProbe+=.35;
  d.probes++;
  const gate=qaGateAssess(2);
  if(gate?.eligible){
   d.eligibleChecks++;
   if(d.pending){d.skipped.busy=(d.skipped.busy||0)+1;}
   else if(S.elapsed-d.lastWorkerAt<.75){
    d.skipped.cooldown=(d.skipped.cooldown||0)+1;
   }else if(d.policy==="off"){
    d.skipped.off=(d.skipped.off||0)+1;
   }else{
    d.lastWorkerAt=S.elapsed;d.runCalls++;d.pending=true;
    const index=d.runCalls,at=S.elapsed;
    // Worker returns only analysis; the BOT continues to choose
    // its ORIGINAL actions at the ORIGINAL scheduled decision times.
    qaWorkerSubmit(2,d.workMs,650,true,d.policy).then(result=>{
     const q=qaRealDuel;
     if(!q||q!==d)return;
     q.pending=false;
     const row={index,at:+at.toFixed(3),time:+S.elapsed.toFixed(3),
      status:result.status,reason:result.reason??null,
      workerMs:result.workerMs??null,roundTripMs:result.elapsed??null};
     q.responses.push(row);
     if(result.status==="preflightSkip")q.preflights++;
    });
   }
  }else{
   const reason=gate?.reason??"noGate";
   d.nonEligible[reason]=(d.nonEligible[reason]||0)+1;
  }
 }
 // Halt only AFTER the scripted match completes this last real tick.
 if(S.elapsed+dt>=d.until||S.phase!=="battle")d.finished=true;
}
function qaRealDuelStatus(){
 const d=qaRealDuel;
 if(!d)return null;
 return {seed:d.seed,policy:d.policy,checkpoint:d.checkpoint,
  until:d.until,at:S.elapsed,finished:d.finished||S.phase!=="battle",phase:S.phase,
  world:qaRealDuelWorld(),entry:d.entry,
  gameDecisions:d.decisions.slice(),probes:d.probes,
  eligibleChecks:d.eligibleChecks,runCalls:d.runCalls,
  nonEligible:{...d.nonEligible},skipped:{...d.skipped},
  responses:d.responses.slice(),pending:d.pending,
  observeTicks:d.observeTicks};
}
function qaRealDuelStop(){
 if(!qaRealDuel)return null;
 const s=qaRealDuelStatus();
 Math.random=qaRealDuel.oldRandom;
 qaRealDuel=null;
 // A late non-authoritative result is prevented from updating the next duel.
 qaWorkerStop();
 return s;
}
