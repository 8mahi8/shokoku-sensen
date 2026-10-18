"use strict";
// Localhost QA-only: passive measurements during real legal BOT duels.
// Snapshot contains only currently visible units and class definitions.
// Future HP is used only as a label, never as an input or actual action.
let qaAttritionNatural=null;
function qaAttritionNaturalStart(team=2,horizon=18){
 if(!NET.isSolo||qaAttritionNatural||
  ![1,2].includes(team)||horizon!==18)return false;
 qaAttritionNatural={team,horizon,
  moments:[32,52,72,92,112,132,152,172,192],
  nextMoment:0,pending:[],results:[],started:0,censored:0,
  noDefender:0,noEnemy:0};
 return true;
}
function qaAttritionNaturalTick(){
 const a=qaAttritionNatural;
 if(!a||S.elapsed<1)return;
 if(a.pending.length){
  const pending=[];
  for(const sample of a.pending){
   if(S.elapsed+1e-5<sample.at+a.horizon){
    pending.push(sample);continue;
   }
   const remain=t=>sample.tracked.filter(x=>x.team===t)
    .reduce((n,x)=>n+Math.max(0,x.ref.hp),0);
   const own=remain(a.team)/sample.startOwn,
    enemy=remain(3-a.team)/sample.startEnemy;
   const actual=own-enemy;
   const futurePlays=(duelStats?.actionLedger||[]).slice(sample.ledgerAt)
    .filter(x=>x.at>sample.at+1e-5&&x.at<=sample.at+a.horizon+1e-5);
   const enemyPlays=futurePlays.filter(x=>x.team!==a.team),
    ownPlays=futurePlays.filter(x=>x.team===a.team);
   const newUnitsNearFort=S.units.filter(u=>u.hp>0&&
    !sample.tracked.some(x=>x.ref.uid===u.uid)&&
    Math.abs(u.x-S.forts[sample.fortIndex].x)<=300&&
    Math.abs(u.y-S.forts[sample.fortIndex].y)<=215).length;
   a.results.push({
    at:+sample.at.toFixed(3),fortIndex:sample.fortIndex,
    pre:sample.prediction,
    outcome:{own:+own.toFixed(5),enemy:+enemy.toFixed(5),
     margin:+actual.toFixed(5),
     held:S.forts[sample.fortIndex].owner===a.team,
     hp:S.forts[sample.fortIndex].hp},
    contextual:{initialOwnUnits:sample.tracked.filter(x=>x.team===a.team).length,
     initialEnemyUnits:sample.tracked.filter(x=>x.team!==a.team).length,
     unitsAlive:S.units.length,newUnitsNearFort,
     enemyCardsPlayed:enemyPlays.length,ownCardsPlayed:ownPlays.length,
     enemySpellsPlayed:enemyPlays.filter(x=>isSpell(x.id)).length,
     ownSpellsPlayed:ownPlays.filter(x=>isSpell(x.id)).length}
   });
  }
  a.pending=pending;
 }
 if(a.nextMoment>=a.moments.length||
  S.elapsed+1e-5<a.moments[a.nextMoment])return;
 a.nextMoment++;
 for(let fortIndex=0;fortIndex<3;fortIndex++){
  if(S.forts[fortIndex].owner!==a.team)continue;
  const snapshot=qaAttritionPredictionSnapshot(a.team,fortIndex),
    own=snapshot?.units.filter(u=>u.team===a.team)||[],
    foes=snapshot?.units.filter(u=>u.team!==a.team)||[];
  if(!own.length){a.noDefender++;continue;}
  if(!foes.length){a.noEnemy++;continue;}
  const knownIds=new Set(snapshot.units.map(u=>u.uid));
  const tracked=S.units.filter(u=>knownIds.has(u.uid)).map(u=>({
   ref:u,team:u.team,startHp:u.hp
  }));
  const start=t=>tracked.filter(u=>u.team===t)
   .reduce((n,u)=>n+u.startHp,0);
  const startOwn=start(a.team),startEnemy=start(3-a.team);
  if(startOwn<=0||startEnemy<=0)continue;
  const prediction=qaAttritionForecast(snapshot,a.horizon);
  a.started++;
  a.pending.push({at:S.elapsed,fortIndex,tracked,
   ledgerAt:duelStats?.actionLedger?.length??0,
   startOwn,startEnemy,prediction});
 }
}
function qaAttritionNaturalFinish(){
 const a=qaAttritionNatural;
 if(!a)return null;
 const result={started:a.started,
  completed:a.results.length,censored:a.pending.length,
  skippedNoDefender:a.noDefender,skippedNoEnemy:a.noEnemy,
  results:a.results.slice()};
 qaAttritionNatural=null;
 return result;
}
