"use strict";
// Do current-state interception risk bins help predict realized castle damage?
// Leave-one-EXPLORED-seed-out; no BOT policy change, untouched holdouts remain.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path");
const dir=process.argv[2]||"qa-bot-castle-forecast-audit";
const rows=JSON.parse(fs.readFileSync(path.join(dir,"windows.json"),"utf8"));
const seeds=[17,41,73,101,131,163],clip=x=>Math.max(0,Math.min(1.25,x));
const windows=rows.flatMap(r=>r.windows.filter(w=>w.completed&&w.predicted>.01)
 .map(w=>({...w,seed:r.seed,team:r.team,style:r.style})));
assert.equal(rows.length,120);assert.ok(windows.length>=150);
const sum=(l,fn)=>l.reduce((v,x)=>v+fn(x),0);
const labels={
 unchanged:()=>"_",
 wall:w=>w.defenders>0?"1":"0",
 nearby:w=>w.nearbyEnemy>0?"1":"0",
 currentVision:w=>w.preThreat.inFriendlyVision>0?"1":"0",
 contact3:w=>w.preThreat.contactWithin3>0?"1":"0",
 contact6:w=>w.preThreat.contactWithin6>0?"1":"0",
 visionETA:w=>{
  const x=w.preThreat.minVisionEta;
  return x===null?"missing":x===0?"inVision":x<=3?"0to3":x<=6?"3to6":"beyond6";
 },
 wallAndContact3:w=>String(w.defenders>0)+"_"+String(w.preThreat.contactWithin3>0)
};
const types=Object.keys(labels);
const records=windows.map(w=>{
 const train=windows.filter(x=>x.seed!==w.seed);
 const result={...w,adjusted:{}};
 for(const type of types){
  const eligible=train.filter(x=>labels[type](x)===labels[type](w));
  // Subgroups with fewer than 12 TRAINING windows fallback to wall group
  // if different from wall, then to global, to avoid degenerate factors.
  const wallTrain=train.filter(x=>(x.defenders>0)===(w.defenders>0));
  const sample=type==="unchanged"?[]:
   eligible.length>=12?eligible:
   (wallTrain.length>=12?wallTrain:train);
  const fitted=type==="unchanged"?1:
   clip(sum(sample,x=>x.actual)/Math.max(1e-9,sum(sample,x=>x.predicted)));
  result.adjusted[type]=w.predicted*fitted;
 }
 return result;
});
const score=(xs,type)=>({
 n:xs.length,
 mae:xs.length?sum(xs,x=>Math.abs(x.adjusted[type]-x.actual))/xs.length:null,
 rmse:xs.length?Math.sqrt(sum(xs,x=>(x.adjusted[type]-x.actual)**2)/xs.length):null,
 meanSignedError:xs.length?sum(xs,x=>x.adjusted[type]-x.actual)/xs.length:null,
 forecast:sum(xs,x=>x.adjusted[type]),actual:sum(xs,x=>x.actual)
});
const scores=Object.fromEntries(types.map(t=>[t,score(records,t)]));
const bySeed=Object.fromEntries(seeds.map(seed=>{
 const a=records.filter(r=>r.seed===seed);
 return [seed,Object.fromEntries(types.map(t=>[t,score(a,t)]))];
}));
const byContact={
 contact3:records.filter(r=>r.preThreat.contactWithin3>0),
 noContact3:records.filter(r=>r.preThreat.contactWithin3===0),
 preVision:records.filter(r=>r.preThreat.inFriendlyVision>0),
 noPreVision:records.filter(r=>r.preThreat.inFriendlyVision===0),
 defended:records.filter(r=>r.defenders>0),
 undefended:records.filter(r=>r.defenders===0)
};
const byGroup=Object.fromEntries(Object.entries(byContact).map(([k,v])=>
 [k,{n:v.length,ratio:sum(v,x=>x.actual)/Math.max(1e-9,sum(v,x=>x.predicted)),
  raw:score(v,"unchanged"),wall:score(v,"wall"),geometry:score(v,"contact3"),
  eta:score(v,"visionETA")}]));
const report={
 title:"Does pre-contact threat risk calibrate actual castle damage?",
 comparison:"Leave-one-explored-seed-out predictions of damage by original tracked UIDs.",
 samples:records.length,seeds,score:scores,bySeed,byContact:byGroup,
 notes:[
  "This is an observational forecast benchmark, NOT a change to BOT behavior or game balance.",
  "All features are from timestamped forecast snapshot. Later unit target choices and damage are used ONLY for label evaluation.",
  "Explored seeds motivated these bins. Research-fold results do not establish validity on untouched holdouts.",
  "A pair ETA is optimistic closing-speed time, not deterministic interception or probability.",
  "If fewer than 12 training examples in a bin, fallback to own-wall-defense bin, then global.",
  "Positive-forecast completed windows only. Windows within each full game are correlated.",
  "MAE is about castle damage, not win-rate or strategic decision quality."
 ]};
fs.writeFileSync(path.join(dir,"precontact-damage.json"),JSON.stringify(report,null,2));
console.log("CASTLE PRECONTACT DAMAGE SUMMARY",JSON.stringify({
 samples:report.samples,scores:report.score,
 bySeed:Object.fromEntries(seeds.map(seed=>[seed,{
  unchanged:bySeed[seed].unchanged.mae,wall:bySeed[seed].wall.mae,
  nearby:bySeed[seed].nearby.mae,contact3:bySeed[seed].contact3.mae,
  eta:bySeed[seed].visionETA.mae}])),
 byContact:Object.fromEntries(Object.entries(byGroup).map(([k,v])=>
  [k,{n:v.n,ratio:v.ratio,rawMae:v.raw.mae,wallMae:v.wall.mae,contact3Mae:v.geometry.mae}]))
}));
