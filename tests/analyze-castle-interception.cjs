"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const dir=process.argv[2]||"qa-bot-castle-forecast-audit";
const rows=JSON.parse(fs.readFileSync(path.join(dir,"windows.json"),"utf8"));
assert.equal(rows.length,120);
const all=rows.flatMap(r=>r.windows.map(w=>({...w,seed:r.seed,style:r.style,team:r.team})));
const complete=all.filter(w=>w.completed&&w.predicted>.01);
assert.ok(complete.length>=150);
const sum=(a,f)=>a.reduce((n,x)=>n+f(x),0);
const avg=(a,f)=>a.length?sum(a,f)/a.length:null;
const ratio=(a,b)=>b?a/b:null;
function measure(a){
 const keys=["enemyTarget","fortTarget","castleTarget","approach"];
 const secs=Object.fromEntries(keys.map(k=>[k,sum(a,w=>w.activity[k])]));
 const living=sum(a,w=>w.activity.alive);
 return {windows:a.length,
  averageForecast:avg(a,w=>w.predicted),
  averageRealDamage:avg(a,w=>w.actual),
  averageError:avg(a,w=>w.error),
  averageAbsoluteError:avg(a,w=>Math.abs(w.error)),
  zeroDamage:a.filter(w=>w.actual===0).length,
  zeroDamageFraction:ratio(a.filter(w=>w.actual===0).length,a.length),
  totalAliveUnitSeconds:living,
  targetUnitSeconds:secs,
  timeShare:Object.fromEntries(keys.map(k=>[k,ratio(secs[k],living)])),
  timeCloseToEnemies:sum(a,w=>w.activity.enemyNearby),
  unitSecondsAfterDeath:sum(a,w=>w.deadOrGone),
  totalCastleRangeSeconds:sum(a,w=>w.activity.inCastleRange),
  firstEnemyTargetBeforeCastleHit:a.filter(w=>w.firstEnemyTargetAt!==null&&
   (w.firstCastleHitAt===null||w.firstEnemyTargetAt<w.firstCastleHitAt)).length};
}
const filters={
 all:complete,
 targetedEnemy:complete.filter(w=>w.activity.enemyTarget>=.5),
 notTargetedEnemy:complete.filter(w=>w.activity.enemyTarget<.5),
 fortDetour:complete.filter(w=>w.activity.fortTarget>=.5),
 noFortDetour:complete.filter(w=>w.activity.fortTarget<.5),
 castleTarget:complete.filter(w=>w.activity.castleTarget>=.5),
 noCastleTarget:complete.filter(w=>w.activity.castleTarget<.5),
 enemyInitiallyDefending:complete.filter(w=>w.defenders>0),
 initiallyUndefended:complete.filter(w=>w.defenders===0),
 initiallyUndefendedReinforced:complete.filter(w=>w.defenders===0&&w.defenderObservedSeconds>=.5),
 initiallyUndefendedStayedClear:complete.filter(w=>w.defenders===0&&w.defenderObservedSeconds<.5),
 enemyCardsPlayed:complete.filter(w=>w.enemyPlays>0),
 noEnemyCardsPlayed:complete.filter(w=>w.enemyPlays===0),
 substantialDeathExposure:complete.filter(w=>w.deadOrGone>=w.trackedCount*3),
 lowDeathExposure:complete.filter(w=>w.deadOrGone<w.trackedCount*3)
};
const summaries=Object.fromEntries(Object.entries(filters).map(([k,v])=>[k,measure(v)]));
const misses=complete.slice().sort((a,b)=>b.error-a.error).slice(0,12).map(w=>({
 seed:w.seed,team:w.team,style:w.style,at:w.at,
 predicted:w.predicted,actual:w.actual,error:w.error,
 classes:w.classes,initialDefenders:w.defenders,
 enemyPlays:w.enemyPlays,newFriendlyPlays:w.newFriendlyPlays,
 firstEnemyTargetAt:w.firstEnemyTargetAt,
 firstCastleHitAt:w.firstCastleHitAt,
 firstFortTargetAt:w.firstFortTargetAt,
 targetUnitSeconds:w.activity,
 deadOrGoneUnitSeconds:w.deadOrGone,
 defenderObservedSeconds:w.defenderObservedSeconds
}));
const report={status:"observational post-forecast target and interruption analysis",
 pairedGames:rows.length*2,pairedConditions:rows.length,
 samples:all.length,completePositiveWindows:complete.length,
 groups:summaries,largestOverpredictions:misses,
 limits:[
 "Targeting an enemy measures actual unit decisions, not the causal damage that would have occurred without that enemy.",
 "Unit seconds add across original units, so totals can exceed 12 seconds per battle window.",
 "Enemy cards and target choices after snapshot are hindsight diagnostics and cannot be used in a contemporaneous prediction.",
 "These windows are correlated within games and share six previously explored seeds; do not interpret as independent holdout evidence.",
 "The original units are tracked by UID; later reinforcements never receive their damage credit."
 ]};
fs.writeFileSync(path.join(dir,"interception.json"),JSON.stringify(report,null,2));
console.log("CASTLE INTERCEPTION AUDIT SUMMARY",JSON.stringify({
 windows:report.completePositiveWindows,
 overall:summaries.all,
 targetedEnemy:summaries.targetedEnemy,
 notTargetedEnemy:summaries.notTargetedEnemy,
 fortDetour:summaries.fortDetour,
 initiallyUndefendedReinforced:summaries.initiallyUndefendedReinforced,
 initiallyUndefendedStayedClear:summaries.initiallyUndefendedStayedClear
}));
