"use strict";
// Current-snapshot-only threat prediction for the NEXT 12 seconds of real
// engine unit targeting. Six explored seeds are rotated as research folds;
// do not claim truly unseen holdout generalization.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path");
const dir=process.argv[2]||"qa-bot-castle-forecast-audit";
const rows=JSON.parse(fs.readFileSync(path.join(dir,"windows.json"),"utf8"));
assert.equal(rows.length,120);
const seeds=[17,41,73,101,131,163];
const windows=rows.flatMap(r=>r.windows.filter(w=>w.completed&&w.predicted>.01)
 .map(w=>({...w,seed:r.seed,style:r.style,team:r.team})));
assert.ok(windows.length>=150);
assert.deepEqual([...new Set(windows.map(w=>w.seed))].sort((a,b)=>a-b),seeds);
const sum=(list,fn)=>list.reduce((n,x)=>n+fn(x),0),
 avg=(list,fn)=>list.length?sum(list,fn)/list.length:null;
for(const w of windows){
 assert.ok(w.preThreat&&typeof w.preThreat==="object");
 assert.ok(w.activity&&Number.isFinite(w.activity.enemyTarget));
 assert.ok(w.preThreat.contactWithin6>=w.preThreat.contactWithin3);
 assert.ok(w.preThreat.contactWithin3>=w.preThreat.inFriendlyVision);
}
const classify=w=>w.activity.enemyTarget>=.5?1:0;
const binary={
 wallDefender:w=>w.defenders>0,
 within170:w=>w.nearbyEnemy>0,
 currentVision:w=>w.preThreat.inFriendlyVision>0,
 contact3:w=>w.preThreat.contactWithin3>0,
 contact6:w=>w.preThreat.contactWithin6>0,
 enemyCanCounter3:w=>w.preThreat.vulnerableWithin3>0,
 wallOrContact3:w=>w.defenders>0||w.preThreat.contactWithin3>0
};
const performance=(xs,predicate)=>{
 const hit=sum(xs,w=>classify(w)&&predicate(w)?1:0);
 const fp=sum(xs,w=>!classify(w)&&predicate(w)?1:0);
 const fn=sum(xs,w=>classify(w)&&!predicate(w)?1:0);
 const tn=xs.length-hit-fp-fn;
 const ratio=(a,b)=>b?a/b:null;
 return {n:xs.length,positive:hit+fn,truePositive:hit,falsePositive:fp,
  falseNegative:fn,trueNegative:tn,precision:ratio(hit,hit+fp),
  recall:ratio(hit,hit+fn),specificity:ratio(tn,tn+fp),
  balancedAccuracy:((ratio(hit,hit+fn)??0)+(ratio(tn,tn+fp)??0))/2};
};
const performanceByRule=Object.fromEntries(Object.entries(binary)
 .map(([name,rule])=>[name,performance(windows,rule)]));
const rawRisk=w=>w.preThreat.minVisionEta===null?0:
 Math.exp(-w.preThreat.minVisionEta/3);
function auc(xs,score){
 const pos=xs.filter(w=>classify(w)),neg=xs.filter(w=>!classify(w));
 if(!pos.length||!neg.length)return null;
 let tally=0;
 for(const a of pos)for(const b of neg){
  const aa=score(a),bb=score(b);
  tally+=aa>bb?1:aa===bb?.5:0;
 }
 return tally/(pos.length*neg.length);
}
const label={
 constant:()=>"_",
 wall:w=>w.defenders>0?"present":"absent",
 nearby:w=>w.nearbyEnemy>0?"yes":"no",
 vision:w=>w.preThreat.inFriendlyVision>0?"inside":"outside",
 contact3:w=>w.preThreat.contactWithin3>0?"within3":"beyond3",
 visionETA:w=>{
  const eta=w.preThreat.minVisionEta;
  return eta===null?"noPair":eta===0?"inVision":
   eta<=3?"0to3":eta<=6?"3to6":"over6";
 },
 wallAndContact3:w=>String(w.defenders>0)+"_"+String(w.preThreat.contactWithin3>0),
 wallAndVisionETA:w=>String(w.defenders>0)+"_"+(
  w.preThreat.minVisionEta===null?"noPair":
  w.preThreat.minVisionEta===0?"inVision":
  w.preThreat.minVisionEta<=3?"0to3":
  w.preThreat.minVisionEta<=6?"3to6":"over6")
};
const modelNames=Object.keys(label);
// Predeclared shrinkage: empirical training-bin interception rate with
// 8 prior observations drawn from that fold's global prevalence.
const trainingFolds={};
for(const seed of seeds){
 const train=windows.filter(w=>w.seed!==seed),baseRate=sum(train,classify)/train.length;
 trainingFolds[seed]={baseRate,training:train.length,model:{}};
 for(const name of modelNames){
  const counts=new Map();
  for(const w of train){
   const bin=label[name](w);
   const tally=counts.get(bin)||{positive:0,total:0};
   tally.positive+=classify(w);tally.total++;
   counts.set(bin,tally);
  }
  const preds={};
  for(const [bin,c] of counts)preds[bin]=(c.positive+8*baseRate)/(c.total+8);
  trainingFolds[seed].model[name]={baseRate,preds};
 }
}
const clipProbability=p=>Math.min(1-1e-6,Math.max(1e-6,p));
const heldOut=windows.map(w=>{
 const preds={};
 for(const name of modelNames){
  const model=trainingFolds[w.seed].model[name];
  preds[name]=clipProbability(model.preds[label[name](w)]??model.baseRate);
 }
 return {...w,target:classify(w),preds};
});
const diagnostic=xs=>({
 n:xs.length,rate:avg(xs,w=>w.target),
 avgPredictedDamage:avg(xs,w=>w.predicted),
 avgRealCastleDamage:avg(xs,w=>w.actual),
 zeroCastleHit:sum(xs,w=>w.actual===0?1:0),
 avgEnemyTargetUnitSeconds:avg(xs,w=>w.activity.enemyTarget)
});
const scoreModel=(xs,name)=>{
 const brier=avg(xs,w=>(w.preds[name]-w.target)**2);
 const logloss=avg(xs,w=>-w.target*Math.log(w.preds[name])-
  (1-w.target)*Math.log(1-w.preds[name]));
 return {brier,logloss,meanProbability:avg(xs,w=>w.preds[name]),
  auc:auc(xs,w=>w.preds[name])};
};
const scores=Object.fromEntries(modelNames.map(name=>[name,scoreModel(heldOut,name)]));
const bySeed=Object.fromEntries(seeds.map(seed=>[seed,
 Object.fromEntries(modelNames.map(name=>
  [name,scoreModel(heldOut.filter(w=>w.seed===seed),name)]))]));
const crossSections={
 noPreEligiblePair:heldOut.filter(w=>w.preThreat.eligiblePairs===0),
 friendlyAlreadySeesEnemy:heldOut.filter(w=>w.preThreat.inFriendlyVision>0),
 contactWithin3:heldOut.filter(w=>w.preThreat.contactWithin3>0),
 enemyOutside3:heldOut.filter(w=>w.preThreat.contactWithin3===0),
 enemyWallDefenders:heldOut.filter(w=>w.defenders>0),
 wallUndefended:heldOut.filter(w=>w.defenders===0),
 futureTargetWithoutPrePair:heldOut.filter(w=>w.target&&w.preThreat.eligiblePairs===0),
 futureTargetWithContact3:heldOut.filter(w=>w.target&&w.preThreat.contactWithin3>0)
};
const segments=Object.fromEntries(Object.entries(crossSections)
 .map(([n,v])=>[n,diagnostic(v)]));
const byStyle=Object.fromEntries([...new Set(heldOut.map(w=>w.style))].map(style=>
 [style,{n:heldOut.filter(w=>w.style===style).length,
  wall:scoreModel(heldOut.filter(w=>w.style===style),"wall"),
  contact3:scoreModel(heldOut.filter(w=>w.style===style),"contact3"),
  wallAndVisionETA:scoreModel(heldOut.filter(w=>w.style===style),"wallAndVisionETA")}]));
const report={
 title:"Pre-contact interception research using only snapshot geometry",
 outcome:"0.5+ aggregate original-unit seconds actually targeting enemies in the next 12s",
 exploredSeeds:seeds,matchedConditions:rows.length,fullGames:rows.length*2,
 windows:heldOut.length,
 futureInterceptionCount:sum(heldOut,w=>w.target),
 positiveRate:avg(heldOut,w=>w.target),
 uncalibratedRules:performanceByRule,
 uncalibratedGeometryAUC:auc(windows,rawRisk),
 leaveOneExploredSeedOut:{
  trainingDescription:"For each explored seed, fit only on other five explored seeds; fixed categories and +8 prevalence shrinkage.",
  scores,bySeed,byStyle},
 segments,
 limitations:[
  "The physical ETA is an optimistic closing-speed estimate; enemy/friendly movement, forts and targeting can change.",
  "Flying enemy target compatibility and friendly forward restriction follow known current class targeting rules; unseen future spawns are not included.",
  "Actual enemy targeting after forecast is an evaluation LABEL and is never read by snapshot features.",
  "Model feature definitions were inspired by V4/V5 observed behavior; these are explored folds, not independent untouched holdout data.",
  "Observations are correlated within matches, and success in 12-second target prediction is not proof of a win-rate improvement.",
  "Model calibration is a post-hoc QA analysis; BOT actions and game code use no fitted parameters."
 ]};
fs.writeFileSync(path.join(dir,"precontact.json"),JSON.stringify(report,null,2));
console.log("CASTLE PRECONTACT SUMMARY",JSON.stringify({
 windows:report.windows,targetRate:report.positiveRate,
 rawAUC:report.uncalibratedGeometryAUC,
 rules:report.uncalibratedRules,
 scoreSummary:report.leaveOneExploredSeedOut.scores,
 bySeed:Object.fromEntries(seeds.map(seed=>[seed,{
  baseline:bySeed[seed].constant.brier,wall:bySeed[seed].wall.brier,
  currentVision:bySeed[seed].vision.brier,
  contact3:bySeed[seed].contact3.brier,
  eta:bySeed[seed].visionETA.brier,
  wallAndETA:bySeed[seed].wallAndVisionETA.brier}])),
 segments:report.segments
}));
