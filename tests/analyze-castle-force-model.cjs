"use strict";
/* V7 QA: Does current relative force improve a 12-second castle damage
   forecast? All quantities are from the timestamped snapshot only.
   Explored-seed folds ≠ independent untouched holdout. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const dir=process.argv[2]||"qa-bot-castle-forecast-audit";
const rows=JSON.parse(fs.readFileSync(path.join(dir,"windows.json"),"utf8"));
const seeds=[17,41,73,101,131,163],sum=(l,f)=>l.reduce((a,x)=>a+f(x),0);
const windows=rows.flatMap(r=>r.windows.filter(w=>w.completed&&w.predicted>.01)
 .map(w=>({...w,seed:r.seed,team:r.team,style:r.style})));
assert.equal(rows.length,120);
assert.ok(windows.length>=150);
assert.deepEqual([...new Set(windows.map(w=>w.seed))].sort((a,b)=>a-b),seeds);
for(const w of windows){
 assert.ok(w.prePower&&Number.isFinite(w.prePower.waveHp));
 assert.equal(w.prePower.waveUnits,w.trackedCount);
 assert.ok(w.prePower.waveHp>0&&w.prePower.alliedDps>0);
 assert.ok(w.prePower.defenderDps>=0&&w.prePower.activeThreatDps>=0);
}
const ratioBucket=x=>x===0?"none":x<.5?"light":x<1?"medium":"heavy";
const countBucket=x=>x===0?"none":x===1?"one":"many";
const wall=w=>w.defenders>0?"defended":"clear";
const models={
 original:()=>"_",
 wall,
 wallByDefenseDps:w=>wall(w)+"_"+ratioBucket(w.prePower.defensePerWaveHp),
 wallByThreatDps:w=>wall(w)+"_"+ratioBucket(w.prePower.pressurePerWaveHp),
 wallByWallHp:w=>wall(w)+"_"+ratioBucket(w.prePower.defenderHp/w.prePower.waveHp),
 wallByThreatHp:w=>wall(w)+"_"+ratioBucket(w.prePower.activeThreatHp/w.prePower.waveHp),
 wallByDefenderCount:w=>wall(w)+"_"+countBucket(w.prePower.defenderUnits),
 wallByThreatCount:w=>wall(w)+"_"+countBucket(w.prePower.activeThreatUnits),
 wallByContactAndForce:w=>wall(w)+"_"+String(w.preThreat.contactWithin3>0)+
  "_"+ratioBucket(w.prePower.pressurePerWaveHp)
};
const clamp=x=>Math.max(0,Math.min(1.25,x));
const predictions=[];
for(const seed of seeds){
 const training=windows.filter(w=>w.seed!==seed),test=windows.filter(w=>w.seed===seed);
 const totalP=sum(training,w=>w.predicted),globalFactor=clamp(sum(training,w=>w.actual)/totalP);
 const meanP=totalP/training.length;
 const wallStats=new Map();
 for(const bin of ["defended","clear"]){
  const subset=training.filter(w=>wall(w)===bin);
  wallStats.set(bin,{
   n:subset.length,
   factor:subset.length?
    clamp(sum(subset,w=>w.actual)/sum(subset,w=>w.predicted)):globalFactor
  });
 }
 for(const w of test){
  const modeled={original:w.predicted};
  const prior=wallStats.get(wall(w));
  modeled.wall=w.predicted*prior.factor;
  for(const [name,fn] of Object.entries(models)){
   if(name==="original"||name==="wall")continue;
   const key=fn(w);
   const local=training.filter(x=>fn(x)===key);
   // There must be at least 12 distinct observed windows in a TRAIN fold.
   // Shrink the bin by 8 times a typical window toward wall-only estimate.
   const factor=local.length>=12?clamp(
    (sum(local,x=>x.actual)+8*meanP*prior.factor)/
    (sum(local,x=>x.predicted)+8*meanP)):prior.factor;
   modeled[name]=w.predicted*factor;
  }
  predictions.push({...w,modeled});
 }
}
const metrics=(xs,name)=>({
 n:xs.length,
 mae:xs.length?sum(xs,w=>Math.abs(w.modeled[name]-w.actual))/xs.length:null,
 rmse:xs.length?Math.sqrt(sum(xs,w=>(w.modeled[name]-w.actual)**2)/xs.length):null,
 bias:xs.length?sum(xs,w=>w.modeled[name]-w.actual)/xs.length:null
});
const scores=Object.fromEntries(Object.keys(models).map(k=>[k,metrics(predictions,k)]));
const bySeed=Object.fromEntries(seeds.map(s=>[s,Object.fromEntries(Object.keys(models)
 .map(k=>[k,metrics(predictions.filter(w=>w.seed===s),k)]))]));
const groupDefs={
 defended:predictions.filter(w=>w.defenders>0),
 undefended:predictions.filter(w=>w.defenders===0),
 highPressureDps:predictions.filter(w=>w.prePower.pressurePerWaveHp>=1),
 lowPressureDps:predictions.filter(w=>w.prePower.pressurePerWaveHp<1),
 highDefenseDps:predictions.filter(w=>w.prePower.defensePerWaveHp>=1),
 lowDefenseDps:predictions.filter(w=>w.prePower.defensePerWaveHp<1),
 highThreatHp:predictions.filter(w=>w.prePower.activeThreatHp>=w.prePower.waveHp),
 lowThreatHp:predictions.filter(w=>w.prePower.activeThreatHp<w.prePower.waveHp)
};
const groups=Object.fromEntries(Object.entries(groupDefs).map(([name,v])=>
 [name,{n:v.length,observedToForecast:sum(v,w=>w.actual)/Math.max(1e-9,sum(v,w=>w.predicted)),
  original:metrics(v,"original"),wall:metrics(v,"wall"),
  pressure:metrics(v,"wallByThreatDps")}]));
const better=Object.keys(models).filter(k=>k!=="wall"&&k!=="original"&&scores[k].mae<scores.wall.mae);
const report={
 subject:"V7 forecast losses: known defensive HP/DPS and approaching force strength",
 samples:predictions.length,folds:seeds,fullGames:rows.length*2,
 method:"six explored seeds, leave one seed out; fixed physical 0.5/1.0 risk bins, minimum 12 training examples, shrinkage equivalent to eight average windows toward wall factor",
 scores,bySeed,groups,
 betterThanWallOnKnownFolds:better,
 caveats:[
  "All features are derived before the 12-second follow-up; future cards or unit-target outcomes never enter predictors.",
  "Unit HP/DPS assumes attack could occur, does not model whether a defender actually engages, prioritizes a different unit, or path choice.",
  "Wall and threat factors are fitted only on the five other explored seeds per fold; prior model hypotheses were motivated by these six seeds.",
  "The original snapshot windows are correlated by game. 403 windows are not 403 independent trials.",
  "No new combat strategy has been shipped and no untouched holdout seeds are consumed.",
  "MAE of attack damage does not imply improved win rates."]
};
fs.writeFileSync(path.join(dir,"force-model.json"),JSON.stringify(report,null,2));
console.log("CASTLE FORCE MODEL SUMMARY",JSON.stringify({
 samples:report.samples,scores:report.scores,
 bySeed:Object.fromEntries(seeds.map(s=>[s,{
  original:bySeed[s].original.mae,wall:bySeed[s].wall.mae,
  defenderDps:bySeed[s].wallByDefenseDps.mae,
  threatDps:bySeed[s].wallByThreatDps.mae,
  defenderHp:bySeed[s].wallByWallHp.mae,
  threatHp:bySeed[s].wallByThreatHp.mae}])),
 groups:Object.fromEntries(Object.entries(groups).map(([k,g])=>
  [k,{n:g.n,ratio:g.observedToForecast,wall:g.wall.mae,pressure:g.pressure.mae}])),
 betterThanWall:better
}));
