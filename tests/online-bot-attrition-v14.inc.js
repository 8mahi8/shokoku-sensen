"use strict";
// Research-only, added within existing game closure ONLY by localhost QA.
// A cheap public-state attrition proxy, NOT a faithful rollout or combat bot.
function qaAttritionPredictionSnapshot(team,fortIndex=2){
 const fort=S.forts[fortIndex];
 if(!fort||fort.owner!==team)return null;
 const units=S.units.filter(u=>u.hp>0&&
  Math.abs(u.x-fort.x)<=300&&Math.abs(u.y-fort.y)<=215)
  .map(u=>({uid:u.uid,team:u.team,key:u.key,x:u.x,y:u.y,hp:u.hp}));
 return {team,fort:{x:fort.x,y:fort.y,owner:fort.owner,hp:fort.hp},units};
}
function qaAttritionForecast(snapshot,horizon=18){
 if(!snapshot||!Number.isFinite(horizon)||horizon<=0||horizon>30)return null;
 const {team,units}=snapshot,own=units.filter(u=>u.team===team),
  foes=units.filter(u=>u.team!==team),fort=snapshot.fort;
 const hp=army=>army.reduce((n,u)=>n+u.hp,0);
 const ownHp=hp(own),enemyHp=hp(foes);
 const directRaw={1:0,2:0},effective={1:0,2:0},engagements={1:0,2:0};
 const work=unit=>{
  const d=CLASSES[unit.key];
  if(!d)return;
  const targets=units.filter(v=>v.team!==unit.team&&v.hp>0&&
    (!CLASSES[v.key].flying||d.hitAir));
  const dps=d.damage/d.cool;
  directRaw[unit.team]+=dps;
  if(!targets.length)return;
  const dir=unit.team===1?1:-1;
  let best={eta:Infinity,weight:0};
  for(const target of targets){
   const other=CLASSES[target.key];
   const dx=dir*(target.x-unit.x);
   const r=Math.hypot(target.x-unit.x,target.y-unit.y);
   // Actual marching troops cannot reverse after a passing raider.
   if(d.behavior!=="guard"&&dx<-(d.range+other.r+5))continue;
   // Defensive guards cannot pursue beyond their original anchor.
   if(d.behavior==="guard"&&r>Math.max(180,d.vision))continue;
   const distance=Math.max(0,r-d.range-other.r);
   const closeSpeed=d.speed+(other.behavior==="guard"?0:other.speed*.55);
   const eta=distance/Math.max(8,closeSpeed);
   const visible=r<=d.vision?1:.78;
   // Capture-role cards target the fort until enemies get into immediate
   // striking distance; do not rate them as unconstrained DPS turrets.
   const capturing=d.behavior==="capture"?
    (r<50?1:.23):1;
   const weight=visible*capturing*(d.behavior==="guard"?.9:1);
   if(eta<best.eta)best={eta,weight};
  }
  if(!Number.isFinite(best.eta)||best.eta>=horizon)return;
  const uptime=Math.max(0,(horizon-best.eta)/horizon);
  const freshness=Math.min(1,unit.hp/Math.max(1,d.hp));
  const splash=typeof d.splash==="number"?1.08:1;
  effective[unit.team]+=dps*uptime*best.weight*
   Math.sqrt(freshness)*splash;
  engagements[unit.team]++;
 };
 units.forEach(work);
 // Deliberately minimal, no calibration on any test labels. Approximate
 // normalized survival of existing forces for the next horizon seconds.
 const attackOwn=effective[team],attackEnemy=effective[3-team];
 const predictedOwnRemaining=ownHp>0?
  Math.max(0,1-attackEnemy*horizon/ownHp):0;
 const predictedEnemyRemaining=enemyHp>0?
  Math.max(0,1-attackOwn*horizon/enemyHp):0;
 const margin=predictedOwnRemaining-predictedEnemyRemaining;
 // Transparent HP-only comparator; cannot account for air immunity.
 const hpMargin=ownHp+enemyHp>0?(ownHp-enemyHp)/(ownHp+enemyHp):0;
 const ownCapturer=own.filter(u=>CLASSES[u.key].capture).length,
  enemyCapturer=foes.filter(u=>CLASSES[u.key].capture).length;
 const nearestEnemyEta=foes.filter(u=>CLASSES[u.key].capture).reduce((m,u)=>{
  const d=CLASSES[u.key];
  return Math.min(m,Math.max(0,Math.hypot(u.x-fort.x,u.y-fort.y)-
   d.range-26)/Math.max(1,d.speed));
 },Infinity);
 return {margin:+margin.toFixed(6),hpMargin:+hpMargin.toFixed(6),
  predictedOwnRemaining:+predictedOwnRemaining.toFixed(6),
  predictedEnemyRemaining:+predictedEnemyRemaining.toFixed(6),
  ownHp,enemyHp,attackOwn:+attackOwn.toFixed(3),
  attackEnemy:+attackEnemy.toFixed(3),
  engagements,ownCapturer,enemyCapturer,
  enemyArrivalFloor:Number.isFinite(nearestEnemyEta)?
   +nearestEnemyEta.toFixed(3):null};
}
function qaAttritionTrial(seed,spec,horizon=18){
 if(!NET.isSolo||!Number.isInteger(seed)||seed<1||seed>2147483647||
  !spec||!Array.isArray(spec.enemies)||!Array.isArray(spec.allies)||
  spec.enemies.length>8||spec.allies.length>8||
  ![12,18,24].includes(horizon))return null;
 const originalRandom=Math.random,originalDuel=duelStats,
  originalVariants=qaBotVariants;
 let state=seed>>>0;
 Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 try{
  duelStats=null;
  const jitter=(i,isOwn)=>(seed*7+i*23+(isOwn?11:0))%19-9;
  const enemies=spec.enemies.map((u,i)=>({...u,x:u.x+jitter(i,false)*.65,
   y:u.y+jitter(i+19,false)*.65}));
  const allies=spec.allies.map((u,i)=>({...u,x:u.x+jitter(i,true)*.65,
   y:u.y+jitter(i+19,true)*.65}));
  if(!window.__shokokuQa.setBotScenario({
    difficulty:"hard",elapsed:spec.elapsed??100,energy:spec.energy??6,
    enemyEnergy:spec.enemyEnergy??6,hand:["scout","engineer","sentinel","archer"],
    fortOwners:spec.fortOwners??[0,0,2],enemies,allies
  }))return null;
  S.botThink=999999;S.seconds=MATCH-S.elapsed;
  for(const u of S.units){
   const isOwn=u.team===2;
   const scale=isOwn?(spec.ownHealth??1):(spec.enemyHealth??1);
   u.hp=u.max*scale;
  }
  const startFort=S.forts[2],ownersBefore=S.forts.map(f=>f.owner),
   tracked=S.units.map(u=>({ref:u,team:u.team,startHp:u.hp,key:u.key}));
  const own=tracked.filter(u=>u.team===2),enemy=tracked.filter(u=>u.team===1);
  const firstHp=team=>tracked.filter(u=>u.team===team)
   .reduce((n,u)=>n+u.startHp,0);
  const original={2:firstHp(2),1:firstHp(1)};
  const snapshot=qaAttritionPredictionSnapshot(2,2);
  const started=performance.now();
  const predicted=qaAttritionForecast(snapshot,horizon);
  const predictMs=performance.now()-started;
  let controlled=0,contestSeconds=0;
  const actualStart=S.elapsed,dt=1/30;
  for(let step=0;step<horizon*30&&S.phase==="battle";step++){
   tick(dt);
   if(S.forts[2].owner===2)controlled+=dt;
   if(S.units.some(u=>u.team===1&&u.hp>0&&
    Math.hypot(u.x-startFort.x,u.y-startFort.y)<120)&&
    S.units.some(u=>u.team===2&&u.hp>0&&
    Math.hypot(u.x-startFort.x,u.y-startFort.y)<120))contestSeconds+=dt;
  }
  const alive=team=>tracked.filter(u=>u.team===team)
   .reduce((n,u)=>n+Math.max(0,u.ref.hp),0);
  const endOwn=alive(2),endEnemy=alive(1);
  const ownFrac=original[2]>0?endOwn/original[2]:0,
   enemyFrac=original[1]>0?endEnemy/original[1]:0;
  const actualMargin=ownFrac-enemyFrac;
  return {seed,horizon,case:spec.name??"unspecified",
   starting:{ownHp:original[2],enemyHp:original[1],
    ownUnits:own.length,enemyUnits:enemy.length,
    ownersBefore,snapshotSize:snapshot?.units?.length,
    ownHealth:spec.ownHealth??1,enemyHealth:spec.enemyHealth??1},
   prediction:predicted,
   actual:{ownRemaining:+ownFrac.toFixed(6),
    enemyRemaining:+enemyFrac.toFixed(6),
    margin:+actualMargin.toFixed(6),
    fortHeld:S.forts[2].owner===2,
    fortHp:S.forts[2].hp,
    controlledSeconds:+controlled.toFixed(4),
    contestedSeconds:+contestSeconds.toFixed(4),
    ownAlive:own.filter(u=>u.ref.hp>0).length,
    enemyAlive:enemy.filter(u=>u.ref.hp>0).length,
    elapsed:+(S.elapsed-actualStart).toFixed(4)},
   predictionMs:+predictMs.toFixed(4)};
 }finally{
  duelStats=originalDuel;qaBotVariants=originalVariants;
  Math.random=originalRandom;
 }
}
