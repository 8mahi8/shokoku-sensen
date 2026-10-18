"use strict";
// Predefined development and genuinely distinct held-out scene layouts.
// QA-only game-physics labels. Model coefficients are frozen in V14 inc
// before either sample's actual results are observed.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-attrition-v14";
fs.mkdirSync(out,{recursive:true});
const original=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 helper=fs.readFileSync(path.join(root,"tests/online-bot-attrition-v14.inc.js"),"utf8"),
 anchor=" window.__shokokuQa={\n";
assert.equal(original.split(anchor).length,2);
const patched=original.replace(anchor,
 "\n"+helper+"\n window.__shokokuQa={\n attritionTrial:qaAttritionTrial,\n");
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(p).pipe(res);
});
const u=(key,x,y)=>({key,x,y});
const dev=[
 ["archer-versus-infantry",[u("archer",928,205)],[u("infantry",810,205)]],
 ["guard-versus-engineer",[u("sentinel",920,205)],[u("engineer",817,205)]],
 ["infantry-defends",[u("infantry",909,215)],[u("scout",802,205)]],
 ["sentinel-cannot-hit-drone",[u("sentinel",894,205)],[u("drone",831,205)]],
 ["archer-can-hit-drone",[u("archer",901,205)],[u("drone",832,205)]],
 ["suppress-versus-scouts",[u("suppress",917,205)],[u("scout",834,200),u("scout",818,220)]],
 ["guardian-versus-tank",[u("guardian",916,205)],[u("tank",829,205)]],
 ["tank-versus-scout",[u("tank",908,205)],[u("scout",798,205)]],
 ["archer-and-guard",[u("archer",927,200),u("sentinel",897,214)],[u("engineer",814,205)]],
 ["guard-versus-two-infantry",[u("sentinel",906,205)],[u("infantry",833,197),u("infantry",820,224)]],
 ["two-archers-vs-rider",[u("archer",937,196),u("archer",923,221)],[u("scout",815,205)]],
 ["drone-and-scout-push",[u("archer",933,199),u("sentinel",916,228)],[u("drone",826,200),u("scout",818,223)]],
 ["infantry-screen-engineer",[u("infantry",912,205),u("archer",960,215)],[u("engineer",822,205)]],
 ["shieldwall-heavy",[u("guardian",939,205),u("archer",945,235)],[u("tank",810,205),u("scout",824,234)]],
 ["capturer-defense",[u("scout",915,205)],[u("engineer",845,205)]],
 ["long-range-approach",[u("sentinel",995,205),u("archer",1040,225)],[u("scout",758,205)]],
 ["airborne-pressure",[u("guardian",929,205),u("archer",939,230)],[u("drone",818,205),u("scout",804,230)]],
 ["close-fort-siege",[u("tank",909,205),u("archer",953,210)],[u("suppress",835,205),u("engineer",815,215)]]
].map(([name,allies,enemies])=>({name,allies,enemies}));
const heldout=[
 ["archer-air-infantry-mix",[u("archer",944,198),u("infantry",926,230)],[u("drone",853,198),u("engineer",819,235)]],
 ["twin-rider-break",[u("sentinel",917,216),u("scout",939,191)],[u("scout",805,197),u("scout",827,226)]],
 ["anti-air-absent-heavy",[u("guardian",916,213),u("sentinel",940,193)],[u("drone",840,209),u("drone",821,239)]],
 ["dual-suppress-splash",[u("suppress",935,196),u("archer",944,240)],[u("infantry",831,203),u("infantry",850,224),u("engineer",800,189)]],
 ["weak-guard-versus-tank",[u("sentinel",878,205),u("archer",954,203)],[u("tank",824,205),u("drone",809,237)]],
 ["close-guardian-archer",[u("guardian",892,199),u("archer",949,218)],[u("archer",822,202),u("engineer",834,225)]],
 ["riders-versus-tank",[u("scout",918,202),u("scout",950,224)],[u("tank",822,202)]],
 ["slow-engineer-convoy",[u("engineer",922,207),u("archer",978,221)],[u("scout",839,197),u("sentinel",852,233)]],
 ["ranged-defense-distant",[u("suppress",1004,198),u("sentinel",1009,241)],[u("archer",761,201),u("scout",767,231)]],
 ["double-air-counter",[u("archer",952,201),u("archer",980,229)],[u("drone",835,215),u("drone",797,192)]],
 ["single-infantry-air",[u("infantry",901,205)],[u("drone",829,205)]],
 ["sentinel-versus-suppress",[u("sentinel",883,205),u("infantry",957,231)],[u("suppress",827,210)]],
 ["capture-flanked",[u("archer",962,197),u("scout",919,217)],[u("engineer",816,208),u("drone",825,230)]],
 ["high-hp-guardian-v-scout-pair",[u("guardian",931,212)],[u("scout",830,196),u("scout",839,228)]]
].map(([name,allies,enemies])=>({name,allies,enemies}));
const seedsDev=[113,509,991,1613],seedsHoldout=[2207,3001,3997,4801];
const healthVariants=[
 {name:"undamaged",ownHealth:1,enemyHealth:1},
 {name:"damaged-defender",ownHealth:.55,enemyHealth:.88},
 {name:"damaged-attackers",ownHealth:.90,enemyHealth:.55}
];
const rowScore=(p,a)=>Math.abs(p-a);
function metrics(xs){
 const mae=(name)=>xs.reduce((t,x)=>t+rowScore(x.prediction[name],x.actual.margin),0)/xs.length;
 const classified=(name)=>{
  const state=v=>v>.15?1:v<-.15?-1:0;
  const total=xs.filter(x=>state(x.actual.margin)!==0);
  const correct=total.filter(x=>state(x.prediction[name])===state(x.actual.margin));
  return {nonDraw:total.length,correct:correct.length,
   exactFraction:total.length?+(100*correct.length/total.length).toFixed(1):null};
 };
 const byScenario=xs.reduce((acc,x)=>{
  (acc[x.case]??=[]).push(x);return acc;
 },{});
 const withDamage=xs.filter(x=>x.actual.ownRemaining<.95||
  x.actual.enemyRemaining<.95);
 return {n:xs.length,
  hpOnlyMae:+mae("hpMargin").toFixed(4),
  effectiveCombatMae:+mae("margin").toFixed(4),
  percentMaeChange:+(100*(mae("margin")/Math.max(.00001,mae("hpMargin"))-1)).toFixed(2),
  actualCombatCases:withDamage.length,
  hpOnlyClassification:classified("hpMargin"),
  effectiveClassification:classified("margin"),
  actualFortLost:xs.filter(x=>!x.actual.fortHeld).length,
  elapsedAvg:+(xs.reduce((t,x)=>t+x.actual.elapsed,0)/xs.length).toFixed(3),
  predictionMsMean:+(xs.reduce((t,x)=>t+x.predictionMs,0)/xs.length).toFixed(4),
  predictionMsMax:+Math.max(...xs.map(x=>x.predictionMs)).toFixed(4),
  perScenario:Object.entries(byScenario).map(([name,arr])=>({
   name,count:arr.length,
   attritionMae:+(arr.reduce((t,x)=>t+rowScore(x.prediction.margin,x.actual.margin),0)/arr.length).toFixed(3),
   hpMae:+(arr.reduce((t,x)=>t+rowScore(x.prediction.hpMargin,x.actual.margin),0)/arr.length).toFixed(3),
   fortLost:arr.filter(x=>!x.actual.fortHeld).length
  }))};
}
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8914,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8914/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const output={dev:[],heldout:[]};
  for(const [cohort,scenes,seeds] of [
   ["dev",dev,seedsDev],["heldout",heldout,seedsHoldout]
  ]){
   for(const spec of scenes)for(const seed of seeds)for(const health of healthVariants){
    const row=await page.evaluate(x=>window.__shokokuQa.attritionTrial(
     x.seed,{...x.spec,...x.health,name:x.spec.name+"/"+x.health.name},18),
     {spec,seed,health});
    assert.ok(row?.prediction&&row?.actual);
    assert.equal(row.actual.elapsed,18);
    assert.ok(row.actual.ownRemaining>=0&&row.actual.ownRemaining<=1.00001);
    assert.ok(row.actual.enemyRemaining>=0&&row.actual.enemyRemaining<=1.00001);
    assert.ok(Number.isFinite(row.prediction.margin));
    assert.ok(Number.isFinite(row.prediction.hpMargin));
    output[cohort].push(row);
   }
  }
  // All runs must restore their own initial state and seeded PRNG.
  const first=output.dev[0];
  const spec={...dev[0],...healthVariants[0]};
  const repeated=await page.evaluate(x=>window.__shokokuQa.attritionTrial(
   113,{...x,name:"archer-versus-infantry/undamaged"},18),spec);
  const withoutTiming=({predictionMs,...rest})=>rest;
  assert.deepEqual(withoutTiming(repeated),withoutTiming(first),
   "identical initial conditions must be deterministic apart from CPU measurement");
  assert.deepEqual(errors,[]);
  const devMetrics=metrics(output.dev),holdoutMetrics=metrics(output.heldout);
  const prereg={primaryMetric:"MAE of normalized own-vs-enemy remaining army HP-fraction difference at 18 simulated seconds",
   comparator:"Starting army HP difference / total HP",
   minAbsoluteHoldoutMaeImprovement:.015,
   minHoldoutImprovedScenarioFraction:.5,
   noSystematicAntiAirError:true,
   note:"Record the result, whether the model passes or fails. Holdout must not be retuned."};
  const improvedScenarios=holdoutMetrics.perScenario.filter(x=>
   x.attritionMae<x.hpMae).length;
  const result={kind:"V14 lightweight local-attrition model vs naïve HP-only control",
   devCases:output.dev.length,holdoutCases:output.heldout.length,
   development:devMetrics,holdout:holdoutMetrics,improvedHoldoutScenarios:improvedScenarios,
   prereg,promoteToGameplay:false,
   researchCriteriaMet:holdoutMetrics.hpOnlyMae-holdoutMetrics.effectiveCombatMae>=
    prereg.minAbsoluteHoldoutMaeImprovement&&
    improvedScenarios>=heldout.length*prereg.minHoldoutImprovedScenarioFraction,
   limits:["The model is lightweight analytical scoring, not a 30Hz simulation or a bot control policy.",
    "The exact 30Hz game engine determines 18-second realized unit damage, HP remaining, and fort control.",
    "No new unit deploys or spells during the measurement window. This is NOT a win-rate or castle-damage race test.",
    "Co-located observations from one fixed scenario and health setting are correlated; the set is not random human online play.",
    "The prediction only covers units inside a 300x215 fort-local rectangular neighborhood.",
    "A unit can chase a castle or a fort instead of attacking other units, so damage-based forecasts may fail.",
    "The user's normal BOT, PvP source, main branch and iPad Safari runtime are unchanged."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(result,null,2));
  fs.writeFileSync(path.join(out,"cases.json"),JSON.stringify(output,null,2));
  console.log("BOT ATTRITION V14 SUMMARY",JSON.stringify({
   ...result,development:{...devMetrics,perScenario:undefined},
   holdout:{...holdoutMetrics,perScenario:undefined},
   worstHoldout:holdoutMetrics.perScenario.filter(x=>x.attritionMae>x.hpMae).slice(0,10)
  }));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
