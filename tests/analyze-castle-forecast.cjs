"use strict";
// Leave-one-explored-seed-out calibration. No gameplay/BOT modifications.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const dir=process.argv[2]||"qa-bot-castle-forecast-audit";
const data=JSON.parse(fs.readFileSync(path.join(dir,"windows.json"),"utf8"));
const seeds=[17,41,73,101,131,163];
const positives=data.flatMap(r=>r.windows.filter(w=>w.completed&&w.predicted>.01)
 .map(w=>({...w,seed:r.seed,team:r.team,style:r.style})));
assert.equal(data.length,120);
assert.ok(positives.length>150,"need a meaningful set of attack forecasts");
assert.deepEqual([...new Set(positives.map(w=>w.seed))].sort((a,b)=>a-b),seeds);
const sum=(a,f)=>a.reduce((total,w)=>total+f(w),0);
const clamp=x=>Math.max(0,Math.min(1.25,x));
const fit=ws=>ws.length?clamp(sum(ws,w=>w.actual)/Math.max(1e-9,sum(ws,w=>w.predicted))):1;
const types=["original","singleFactor","castleDefense","nearbyEnemy","twoSignals"];
const foldDetails={};
const estimates=positives.map(w=>{
 const train=positives.filter(x=>x.seed!==w.seed);
 const wall=train.filter(x=>(x.defenders>0)===(w.defenders>0));
 const near=train.filter(x=>(x.nearbyEnemy>0)===(w.nearbyEnemy>0));
 const both=train.filter(x=>(x.defenders>0)===(w.defenders>0)&&
  (x.nearbyEnemy>0)===(w.nearbyEnemy>0));
 const factors={
  original:1,
  singleFactor:fit(train),
  castleDefense:fit(wall),
  nearbyEnemy:fit(near),
  twoSignals:fit(both.length>=12?both:wall)
 };
 const forecasts=Object.fromEntries(types.map(type=>[type,w.predicted*factors[type]]));
 return {...w,forecasts,factors};
});
const evaluate=(list,type)=>({
 n:list.length,
 mae:list.length?sum(list,w=>Math.abs(w.forecasts[type]-w.actual))/list.length:null,
 rmse:list.length?Math.sqrt(sum(list,w=>(w.forecasts[type]-w.actual)**2)/list.length):null,
 signedError:list.length?sum(list,w=>w.forecasts[type]-w.actual)/list.length:null,
 totalForecast:sum(list,w=>w.forecasts[type]),
 totalActual:sum(list,w=>w.actual)
});
const assessments=Object.fromEntries(types.map(type=>[type,evaluate(estimates,type)]));
const bySeed=Object.fromEntries(seeds.map(seed=>{
 const subset=estimates.filter(w=>w.seed===seed);
 return [seed,{n:subset.length,original:evaluate(subset,"original"),
  castleDefense:evaluate(subset,"castleDefense")}];
}));
const byContext={
 wallDefended:estimates.filter(w=>w.defenders>0),
 wallUndefended:estimates.filter(w=>w.defenders===0),
 enemyNearWave:estimates.filter(w=>w.nearbyEnemy>0),
 noEnemyNearWave:estimates.filter(w=>w.nearbyEnemy===0)
};
const context=Object.fromEntries(Object.entries(byContext).map(([key,list])=>
 [key,{n:list.length,actualToRawRatio:sum(list,w=>w.actual)/
   Math.max(1e-9,sum(list,w=>w.predicted)),
  original:evaluate(list,"original"),castleDefense:evaluate(list,"castleDefense")}]));
const baseline=assessments.original.mae;
const result={
 title:"12-second castle siege forecast: leave-one-known-seed-out calibration",
 seedFolds:seeds,scope:"positive predicted damage; 12 seconds completed",
 training:"five known seeds per fold; test on the sixth known seed",
 capOnFactor:[0,1.25],
 samples:estimates.length,
 comparison:assessments,
 castleDefenseMaeReductionFraction:
  1-assessments.castleDefense.mae/baseline,
 castleDefenseRmseReductionFraction:
  1-assessments.castleDefense.rmse/assessments.original.rmse,
 bySeed,context,
 cautions:[
  "The six seeds and defensive presence feature were explored during research; this is not an independent external holdout.",
  "Overlapping windows in the same match and two teams' paired games are correlated; n is not independent trials.",
  "The defended/undefended factor is descriptive and learned from held-in seeds only for each fold.",
  "This analysis does not establish changes to real BOT win rates or causal effects.",
  "A defended flag represents enemies near the target castle at prediction time, not guaranteed attack engagement.",
  "Only the original snapshot units' later damage is credited; post-snapshot spawns are excluded.",
  "A 12-second window cut short by match end is excluded from calibration."]
};
fs.writeFileSync(path.join(dir,"calibration.json"),JSON.stringify(result,null,2));
console.log("CASTLE FORECAST CALIBRATION SUMMARY",JSON.stringify({
 samples:result.samples,maeByModel:Object.fromEntries(types.map(k=>[k,{
 mae:assessments[k].mae,rmse:assessments[k].rmse,signed:assessments[k].signedError}])),
 improvementFraction:result.castleDefenseMaeReductionFraction,
 bySeed:Object.fromEntries(seeds.map(k=>[k,{
 original:bySeed[k].original.mae,wall:bySeed[k].castleDefense.mae,n:bySeed[k].n}])),
 contextRatios:Object.fromEntries(Object.entries(context).map(([k,v])=>[k,{n:v.n,ratio:v.actualToRawRatio}]))
}));
