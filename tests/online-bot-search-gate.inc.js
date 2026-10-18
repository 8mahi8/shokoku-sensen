"use strict";
// QA only. Injected on localhost into online-game.js by gate-opportunities.cjs.
// Observation is read-only: same legal hand / visible units, no randomness,
// side effects, action scheduling, counterfactual future, or hidden opponent hand.
let qaGateAudit=null;
function qaGateAssess(team=2){
 if(![1,2].includes(team)||S.phase!=="battle")return null;
 const other=3-team,own=S.units.filter(u=>u.team===team&&u.hp>0),
  foes=S.units.filter(u=>u.team===other&&u.hp>0),
  ready=["infantry",...S.hand[team]].filter((id,i,arr)=>
   arr.indexOf(id)===i&&canPay(team,id));
 const ownEnergy=S.energy[team],exposed=foes.filter(u=>
  Math.abs(u.x-WALL_FACE[team])<185);
 const atRisk=S.forts.filter(f=>f.owner===team&&foes.some(u=>
  Math.abs(u.x-f.x)<230&&Math.abs(u.y-f.y)<150));
 const contested=S.forts.filter(f=>foes.some(u=>
  Math.abs(u.x-f.x)<190&&Math.abs(u.y-f.y)<165)&&own.some(u=>
  Math.abs(u.x-f.x)<190&&Math.abs(u.y-f.y)<165));
 const noOwned=S.forts.every(f=>f.owner!==team);
 const open=S.forts.some(f=>f.owner!==team);
 const playableCapture=ready.filter(id=>CLASSES[id]?.capture>0);
 const playableDefense=ready.filter(id=>["sentinel","guardian","archer",
   "suppress","infantry","ward","barrage"].includes(id));
 const playableSiege=ready.filter(id=>["tank","drone","engineer"].includes(id));
 const frontline=own.filter(u=>Math.abs(u.x-WALL_FACE[other])<440);
 const pressured=foes.some(u=>Math.abs(u.x-WALL_FACE[team])<390);
 const castleRace=capital(team).hp<START_HP*.80&&
  capital(other).hp<START_HP*.80&&frontline.length>0;
 const affordLarge=ready.some(id=>id==="tank"||id==="guardian");
 const tradeoff=affordLarge&&(playableCapture.length>0||
  playableDefense.length>0)&&ownEnergy>=7;
 const split=foes.some(u=>CLASSES[u.key].flying)&&
  foes.some(u=>!CLASSES[u.key].flying);
 const alternatives=ready.length;
 const reasons=[];
 if(contested.length)reasons.push("contestedFort");
 if(atRisk.length&&playableDefense.length&&playableCapture.length)
  reasons.push("holdOrTradeFort");
 if(castleRace&&playableDefense.length&&playableSiege.length)
  reasons.push("castleRace");
 if(tradeoff)reasons.push("largeVsTempo");
 if(split&&ready.some(id=>id==="archer")&&
  ready.some(id=>id==="sentinel"||id==="guardian"))
  reasons.push("mixedThreats");
 if(noOwned&&open&&pressured&&playableCapture.length&&playableDefense.length)
  reasons.push("recoverOrDefend");
 // Clearly urgent castle defense must remain on the old fast path,
 // rather than block the main thread with hundreds of milliseconds of search.
 let reason="noStrategicFork";
 if(ownEnergy<2)reason="insufficientEnergy";
 else if(alternatives<2)reason="noLegalAlternative";
 else if(exposed.length)reason="urgentCastleThreat";
 else if(!reasons.length)reason="noStrategicFork";
 else reason="candidate";
 return {team,reason,eligible:reason==="candidate",reasons,
  alternatives,energy:+ownEnergy.toFixed(2),castleThreats:exposed.length,
  threatenedForts:atRisk.length,contestedForts:contested.length,
  ownUnits:own.length,foes:foes.length,split,
  capture:playableCapture.length,defense:playableDefense.length,
  siege:playableSiege.length,affordLarge,castleRace,
  time:+S.elapsed.toFixed(2)};
}
function qaGateOnDecision(team){
 if(!qaGateAudit)return;
 const g=qaGateAssess(team);
 if(!g)return;
 const a=qaGateAudit,stat=a.tally[team];
 stat.decisions++;
 stat.reasons[g.reason]=(stat.reasons[g.reason]||0)+1;
 for(const r of g.reasons)stat.forks[r]=(stat.forks[r]||0)+1;
 if(g.eligible)stat.eligible++;
 const since=g.time-a.last[team];
 const selected=g.eligible&&since>=a.cooldown;
 if(selected){stat.selected++;a.last[team]=g.time;}
 else if(g.eligible)stat.cooldownSuppressed++;
 // Retain only a bounded stratified sample, not all mutable game objects.
 const sample={...g,selected};
 const key=g.reason;
 if(!stat.samples[key])stat.samples[key]=[];
 if(stat.samples[key].length<8)stat.samples[key].push(sample);
 if(selected&&stat.selectedSamples.length<64)stat.selectedSamples.push(sample);
}
// Stored only as a final local QA result; no global persistent state.
let qaGateLatest=null;
function qaGateLastCopy(){return qaGateLatest;}
function qaGateRunPaired(seed,style,team=2){
 const base=window.__shokokuQa.runDuel(seed,style,"hard",team,"standard",
  false,0,"baseline",false);
 qaGateAudit={cooldown:12,last:[-1e7,-1e7,-1e7],
  tally:[null,{decisions:0,eligible:0,selected:0,cooldownSuppressed:0,
   reasons:{},forks:{},samples:{},selectedSamples:[]},
   {decisions:0,eligible:0,selected:0,cooldownSuppressed:0,
   reasons:{},forks:{},samples:{},selectedSamples:[]}]};
 let shadow;
 try{shadow=window.__shokokuQa.runDuel(seed,style,"hard",team,
  "standard",false,0,"baseline",false);
  qaGateLatest=structuredClone(qaGateAudit.tally);}
 finally{qaGateAudit=null;}
 const summary=x=>({
  winner:x.winner,elapsed:x.elapsed,castleHp:x.castleHp,actions:x.actions,
  spent:x.spent,cards:x.cards,fortSeconds:x.fortSeconds,
  initialHand:x.initialHand,openingQueue:x.openingQueue,
  finished:x.finished});
 return {seed,style,team,baseline:summary(base),shadow:summary(shadow),
  gate:qaGateLatest};
}
