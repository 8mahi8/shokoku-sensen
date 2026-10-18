"use strict";
// Source-injected only on localhost QA pages by online-bot-rollout-search.cjs.
// Exact 30Hz physics, real legal card purchases; no speculative "AI" endpoint.
// v0 deliberately models current visible forces without future reinforcements.
function qaRolloutSearch(spec,horizon=20,seeds=[17,41,73]){
 if(!NET.isSolo||!spec||!Array.isArray(spec.hand)||!Array.isArray(spec.enemies)||
  !Number.isFinite(horizon)||horizon<4||horizon>35||
  !Array.isArray(seeds)||seeds.length<1||seeds.length>8||
  seeds.some(n=>!Number.isInteger(n)||n<1))return null;
 const ok=window.__shokokuQa.setBotScenario({...spec,variant:"baseline"});
 if(!ok)return null;
 const team=2,other=1,initial=structuredClone(S);
 const oldRandom=Math.random,oldDuel=duelStats,oldVariants=qaBotVariants,
  oldAction=botLastAction,oldPlans=[qaSiegePlans,qaWindowPlans,qaConcedePlans,
   qaRaceBudgetPlans,qaCastleHitEvents];
 const reset=()=>{
  Object.assign(S,structuredClone(initial));
  qaBotVariants=[null,"baseline","baseline"];
  qaSiegePlans=[null,null,null];qaWindowPlans=[null,null,null];
  qaConcedePlans=[null,null,null];qaRaceBudgetPlans=[null,null,null];
  qaCastleHitEvents=[];duelStats=null;botLastAction=null;
  S.botThink=1000000;
 };
 const seedRng=n=>{
  let state=(n>>>0)||1;
  Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;
   return state/4294967296;};
 };
 try{
  const edge=border(team),x=limit(edge+35,40,W-40);
  const target=S.forts.filter(f=>f.owner!==team)
   .sort((a,b)=>b.x-a.x)[0];
  const threat=S.units.filter(u=>u.team!==team&&u.hp>0)
   .sort((a,b)=>b.x-a.x)[0];
  const objectiveY=target?.y??330, threatY=threat?.y??objectiveY;
  const choices=[{id:"wait",x:null,y:null,cost:0}];
  const legalIds=["infantry",...S.hand[team]].filter(id=>CLASSES[id]&&canPay(team,id));
  for(const id of new Set(legalIds)){
   const points=[id==="scout"||id==="engineer"||id==="tank"?objectiveY:threatY];
   if(threat&&target&&Math.abs(threatY-objectiveY)>115)points.push(objectiveY);
   for(const y of points){
    if(!canPlace(team,x,y))continue;
    choices.push({id,x,y,cost:CLASSES[id].cost});
   }
  }
  // Reference only: what the existing BOT would actually do on this scene.
  reset();seedRng(seeds[0]);botExpertAction(team);
  const legacy=botLastAction?{id:botLastAction.id,x:botLastAction.x,
   y:botLastAction.y,cost:CATALOG[botLastAction.id].cost}:
   {id:"wait",x:null,y:null,cost:0};
  // Compare the reference action under the same fixed simulator. It may be
  // a spell, unlike the v0 candidate search (ground/air units only).
  if(legacy.id!=="wait"&&!choices.some(c=>c.id===legacy.id&&
   c.x===legacy.x&&c.y===legacy.y))choices.push({...legacy,legacyOnly:true});
  const results=[];
  for(const option of choices){
   const runs=[];
   for(const seed of seeds){
    reset();seedRng(seed);
    const startingOwn=capital(team).hp,startingEnemy=capital(other).hp,
     ownOldHP=new Map(S.units.filter(u=>u.team===team).map(u=>[u.uid,u.hp])),
     enemyOldHP=new Map(S.units.filter(u=>u.team===other).map(u=>[u.uid,u.hp]));
    const preEnergy=S.energy[team];
    let success=true;
    if(option.id!=="wait"){
     // Real validation, hand use, cost, card cycling and placement.
     success=botUse(team,option.id,option.x,option.y);
    }
    if(!success){runs.push({invalid:true});continue;}
    let ownFortSeconds=0,enemyFortSeconds=0,steps=0;
    const frames=Math.round(horizon*30);
    for(let i=0;i<frames&&S.phase==="battle";i++){
     tick(1/30);steps++;
     for(const f of S.forts){
      if(f.owner===team)ownFortSeconds+=1/30;
      else if(f.owner===other)enemyFortSeconds+=1/30;
     }
    }
    const ownDamage=Math.max(0,startingOwn-capital(team).hp),
     enemyCastleDamage=Math.max(0,startingEnemy-capital(other).hp);
    const enemyUnitDamage=[...enemyOldHP].reduce((v,[uid,hp])=>{
     const current=S.units.find(u=>u.uid===uid);
     return v+Math.max(0,hp-(current?.hp??0));
    },0);
    const ownInitialLoss=[...ownOldHP].reduce((v,[uid,hp])=>{
     const current=S.units.find(u=>u.uid===uid);
     return v+Math.max(0,hp-(current?.hp??0));
    },0);
    const newUnitSurvivor=S.units.filter(u=>u.team===team&&!ownOldHP.has(u.uid))
     .reduce((n,u)=>n+Math.max(0,u.hp),0);
    const owned=S.forts.filter(f=>f.owner===team).length,
     opposed=S.forts.filter(f=>f.owner===other).length;
    // Frozen v0 weights, NOT tuned to held-out wins; no look-ahead cheats.
    const score=1.4*(enemyCastleDamage-ownDamage)+
      .32*enemyUnitDamage-.30*ownInitialLoss+
      8*(ownFortSeconds-enemyFortSeconds)+
      22*(owned-opposed)+.03*newUnitSurvivor-
      12*(preEnergy-S.energy[team]<0?option.cost:option.cost);
    runs.push({seed,score:+score.toFixed(3),ownDamage:+ownDamage.toFixed(2),
     enemyCastleDamage:+enemyCastleDamage.toFixed(2),
     enemyUnitDamage:+enemyUnitDamage.toFixed(2),
     ownOldLoss:+ownInitialLoss.toFixed(2),newSurvivor:+newUnitSurvivor.toFixed(2),
     ownFortSeconds:+ownFortSeconds.toFixed(2),
     enemyFortSeconds:+enemyFortSeconds.toFixed(2),owned,opposed,
     spent:+(preEnergy-(preEnergy-(option.id==="wait"?0:option.cost))).toFixed(2),
     elapsed:+(steps/30).toFixed(2)});
   }
   const valid=runs.filter(r=>!r.invalid);
   if(!valid.length)continue;
   results.push({...option,runs,meanScore:+(
    valid.reduce((s,r)=>s+r.score,0)/valid.length).toFixed(3)});
  }
  results.sort((a,b)=>b.meanScore-a.meanScore||
   a.cost-b.cost||a.id.localeCompare(b.id)||a.y-b.y);
  const old=results.find(r=>r.id===legacy.id&&r.x===legacy.x&&r.y===legacy.y);
  return {horizon,seeds,legacy,best:results[0]||null,legacyScore:old?.meanScore??null,
   options:results,limits:[
    "Exact 30Hz current physics but no future opponent reinforcements.",
    "Frozen hand and starting state; same seeded random stream for each action.",
    "Unit choices + wait only, except reference BOT action for comparison.",
    "Heuristic score is NOT actual winning probability.",
    "Offline fixed-scene proof of concept; not deployed as regular BOT."]};
 }finally{
  Object.assign(S,initial);
  Math.random=oldRandom;duelStats=oldDuel;qaBotVariants=oldVariants;
  botLastAction=oldAction;
  [qaSiegePlans,qaWindowPlans,qaConcedePlans,qaRaceBudgetPlans,qaCastleHitEvents]=oldPlans;
 }
}
