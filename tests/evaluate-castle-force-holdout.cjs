"use strict";
// Model and holdout seeds were fixed in docs before inspecting holdout.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const trainPath="qa-bot-castle-forecast-audit/windows.json",
 testDir="qa-bot-castle-force-holdout";
const trainingRows=JSON.parse(fs.readFileSync(trainPath,"utf8"));
const testRows=JSON.parse(fs.readFileSync(path.join(testDir,"windows.json"),"utf8"));
const known=[17,41,73,101,131,163],held=[20261021,20261031,20261117,20261201,20270107,20270219];
const seq=x=>[...new Set(x)].sort((a,b)=>a-b);
assert.equal(trainingRows.length,120);assert.equal(testRows.length,120);
assert.deepEqual(seq(trainingRows.map(x=>x.seed)),known);
assert.deepEqual(seq(testRows.map(x=>x.seed)),held);
assert.ok(!known.some(s=>held.includes(s)));
const toWindows=rows=>rows.flatMap(r=>r.windows.filter(w=>w.completed&&w.predicted>.01)
 .map(w=>({...w,seed:r.seed,team:r.team,style:r.style})));
const train=toWindows(trainingRows),test=toWindows(testRows);
assert.ok(train.length>150&&test.length>150);
const sum=(l,f)=>l.reduce((s,x)=>s+f(x),0);
const cap=x=>Math.max(0,Math.min(1.25,x));
const wall=w=>w.defenders>0?"defended":"clear";
const bucket=w=>{
 const x=w.prePower.activeThreatHp/w.prePower.waveHp;
 return x===0?"none":x<.5?"light":x<1?"medium":"heavy";
};
const aggregateFactor=xs=>cap(sum(xs,x=>x.actual)/Math.max(1e-9,sum(xs,x=>x.predicted)));
const overall=aggregateFactor(train),averagePred=sum(train,x=>x.predicted)/train.length;
const factors={};
for(const wallLabel of ["defended","clear"]){
 const region=train.filter(x=>wall(x)===wallLabel);
 const baseline=region.length?aggregateFactor(region):overall;
 factors[wallLabel]={wall:baseline,count:region.length,buckets:{}};
 for(const key of ["none","light","medium","heavy"]){
  const segment=region.filter(x=>bucket(x)===key);
  const factor=segment.length>=12?cap(
   (sum(segment,x=>x.actual)+8*averagePred*baseline)/
   (sum(segment,x=>x.predicted)+8*averagePred)):baseline;
  factors[wallLabel].buckets[key]={n:segment.length,factor,backoff:segment.length<12};
 }
}
const records=test.map(w=>{
 const f=factors[wall(w)];
 return {...w,baselinePrediction:w.predicted*f.wall,
  newPrediction:w.predicted*f.buckets[bucket(w)].factor};
});
const score=(ws,key)=>({
 n:ws.length,
 mae:ws.length?sum(ws,w=>Math.abs(w[key]-w.actual))/ws.length:null,
 rmse:ws.length?Math.sqrt(sum(ws,w=>(w[key]-w.actual)**2)/ws.length):null,
 bias:ws.length?sum(ws,w=>w[key]-w.actual)/ws.length:null
});
const total={raw:score(records,"predicted"),wall:score(records,"baselinePrediction"),
 force:score(records,"newPrediction")};
const bySeed=Object.fromEntries(held.map(seed=>{
 const data=records.filter(r=>r.seed===seed);
 return [seed,{...Object.fromEntries(["raw","wall","force"].map((name,i)=>
  [name,score(data,["predicted","baselinePrediction","newPrediction"][i])])),
  better:score(data,"newPrediction").mae<score(data,"baselinePrediction").mae}];
}));
const betterSeeds=held.filter(x=>bySeed[x].better).length;
const improvement=1-total.force.mae/total.wall.mae;
const pass=improvement>=.05&&betterSeeds>=4;
const byStyle=Object.fromEntries(["self","rush","balanced","fortress","banker"].map(style=>{
 const s=records.filter(x=>x.style===style);
 return [style,{wall:score(s,"baselinePrediction"),force:score(s,"newPrediction")}];
}));
const result={
 preregistration:"docs/BOT_CASTLE_FORCE_HOLDOUT_PREREG_V7_20261018.md",
 trainingSeeds:known,evaluationSeeds:held,
 trainedOnlyOnKnownSeeds:true,
 evaluatedOutcomesDoNotUpdateParameters:true,
 trainingWindows:train.length,testGames:testRows.length,
 completePositiveTestWindows:test.length,
 model:"Wall defender flag plus enemy active threat HP / friendly snapshot wave HP categories",
 categories:["none","(0,0.5)","[0.5,1)","[1,infinity)"],
 factorCap:[0,1.25],minimumBinTrainExamples:12,
 pseudoCountWeight:8,learnedParameters:factors,
 scores:total,bySeed,byStyle,betterSeeds,maeImprovementOverWall:improvement,
 preregisteredPassRule:"MAE improvement >=5% and >=4/6 seed improvements",
 passedPrespecifiedResearchCriterion:pass,
 limitations:[
  "This is first evaluation of these particular seeds in this V7 experiment, not proof of all-possible-match generalization.",
  "Model hypotheses were inspired by the previously explored six seeds; the new seeds do not enter training.",
  "Windows within games and mirrored matches are correlated. A seed is a more appropriate unit than a window.",
  "No BOT strategy or game balance was changed, so the result cannot demonstrate stronger BOT win rates.",
  "The evaluation seeds are now used; do not re-use them as untouched holdout in later experiments."]
};
fs.writeFileSync(path.join(testDir,"report.json"),JSON.stringify(result,null,2));
console.log("CASTLE FORCE HOLDOUT SUMMARY",JSON.stringify({
 testGames:result.testGames,trainWindows:result.trainingWindows,
 testWindows:result.completePositiveTestWindows,
 wall:result.scores.wall,force:result.scores.force,
 improvement:result.maeImprovementOverWall,
 betterSeeds:result.betterSeeds,
 passed:result.passedPrespecifiedResearchCriterion,
 bySeed:Object.fromEntries(held.map(seed=>[seed,{
  n:bySeed[seed].force.n,
  wall:bySeed[seed].wall.mae,force:bySeed[seed].force.mae,
  better:bySeed[seed].better}]))
}));
