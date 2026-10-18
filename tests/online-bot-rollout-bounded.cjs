"use strict";
// Controlled full vs bounded branching budget experiment; QA only.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-rollout-bounded";
fs.mkdirSync(out,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 helper=fs.readFileSync(path.join(root,"tests/online-bot-rollout-bounded.inc.js"),"utf8");
const anchor=" window.__shokokuQa={\n";
assert.equal(game.split(anchor).length,2,"QA export anchor changed");
const patched=game.replace(anchor,"\n"+helper+"\n"+
 " window.__shokokuQa={\n searchBounded:qaRolloutTwoStepBounded,\n");
const srv=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(f===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(f).pipe(res);
});
const scenes=[
 {name:"capture-opening",spec:{difficulty:"hard",elapsed:20,energy:4,enemyEnergy:4,
  hand:["scout","engineer","archer","drone"],fortOwners:[0,0,0],enemies:[],allies:[]}},
 {name:"ground-raiders",spec:{difficulty:"hard",elapsed:80,energy:7,enemyEnergy:4,
  hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
  enemies:[{key:"scout",x:958,y:205},{key:"scout",x:968,y:213}],allies:[]}},
 {name:"existing-screen",spec:{difficulty:"hard",elapsed:90,energy:4,enemyEnergy:4,
  hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
  enemies:[{key:"scout",x:940,y:205}],allies:[{key:"sentinel",x:880,y:205}]}},
 {name:"air-threat",spec:{difficulty:"hard",elapsed:90,energy:4,enemyEnergy:4,
  hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
  enemies:[{key:"drone",x:980,y:205}],allies:[]}},
 {name:"large-threat",spec:{difficulty:"hard",elapsed:110,energy:7,enemyEnergy:7,
  hand:["tank","guardian","archer","engineer"],fortOwners:[0,0,2],
  enemies:[{key:"tank",x:880,y:205}],allies:[]}}
];
const seeds=[17,41],responses=["idle","counterpush","latePush"];
(async()=>{
 let browser;
 try{
  await new Promise(ok=>srv.listen(8883,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8883/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const evaluate=(spec,mode)=>page.evaluate(arg=>{
   const start=performance.now();
   const result=window.__shokokuQa.searchBounded(arg.spec,20,arg.seeds,arg.responses,arg.mode);
   return {result,millis:performance.now()-start};
  },{spec,seeds,responses,mode});
  const summaries=[];
  for(const scene of scenes){
   const control=await evaluate(scene.spec,"two");
   const budget=await evaluate(scene.spec,"bounded");
   const again=await evaluate(scene.spec,"bounded");
   assert.deepEqual(budget.result,again.result,"deterministic bounded replay");
   const full=control.result,short=budget.result;
   assert.ok(full?.best&&short?.best,"both variants return a legal choice");
   const identity=rs=>rs.options.map(o=>[o.id,o.x,o.y].join(":")).sort();
   assert.deepEqual(identity(full),identity(short),
    "search first action candidates preserved");
   assert.equal(full.best.runs.length,seeds.length*responses.length);
   assert.equal(short.best.runs.length,seeds.length*responses.length);
   assert.ok(short.options.every(o=>o.runs.every(r=>
    r.secondOptions<=5&&r.secondOptions<=r.secondGenerated)),
    "bounded second search has <=4 purchased options plus wait");
   assert.ok(short.options.every(o=>o.runs.every(r=>
    r.secondAction&&Number.isFinite(r.score))),
    "each branch executes legal second-step assessment");
   for(const option of short.options)for(const seed of seeds){
    const early=option.runs.find(r=>r.seed===seed&&r.response==="idle");
    const later=option.runs.find(r=>r.seed===seed&&r.response==="latePush");
    assert.deepEqual(early.secondAction,later.secondAction,
     "must not read unseen +9s enemy future at +6s");
   }
   const counts=rs=>rs.options.flatMap(o=>o.runs).reduce((a,r)=>{
    a.evaluated+=r.secondOptions;
    a.generated+=r.secondGenerated;
    a.additionalCards+=+(r.secondAction.id!=="wait");
    return a;
   },{evaluated:0,generated:0,additionalCards:0});
   const c=counts(full),b=counts(short);
   assert.ok(b.evaluated<=c.evaluated);
   const summarize=x=>({id:x.id,x:x.x,y:x.y,worst:x.conservativeScore,
    mean:x.meanScore,cost:x.cost});
   summaries.push({
    scene:scene.name,fullMillis:+control.millis.toFixed(1),
    boundedMillis:+budget.millis.toFixed(1),
    replayMillis:+again.millis.toFixed(1),
    options:full.options.length,fullSecond:c,boundedSecond:b,
    fullChoice:summarize(full.best),boundedChoice:summarize(short.best),
    agreement:[full.best.id,full.best.x,full.best.y].join(":")===
      [short.best.id,short.best.x,short.best.y].join(":"),
    selectedFollowUps:short.best.runs.map(r=>({
      response:r.response,seed:r.seed,action:r.secondAction.id,
      candidateCount:r.secondOptions,generated:r.secondGenerated,
      cost:r.secondAction.cost,score:r.score})),
    worstDeltaBoundedMinusFull:+(short.best.conservativeScore-
     full.best.conservativeScore).toFixed(3)
   });
  }
  assert.deepEqual(errors,[]);
  assert.ok(summaries.some(x=>x.boundedSecond.evaluated<x.fullSecond.evaluated),
   "beam must materially reduce costly inner game evaluations");
  const totals=xs=>xs.reduce((a,x)=>a+x,0);
  const fullFrames=totals(summaries.map(r=>r.fullSecond.evaluated))*420;
  const boundedFrames=totals(summaries.map(r=>r.boundedSecond.evaluated))*420;
  const report={kind:"Bounded +6s receding-horizon action search, exact 30Hz simulator",
   seeds,responses,horizon:20,secondBudget:5,
   totalFramesFull:fullFrames,totalFramesBounded:boundedFrames,
   simulatorFrameReductionPercent:+((1-boundedFrames/fullFrames)*100).toFixed(1),
   fullEvalMs:totals(summaries.map(r=>r.fullMillis)),
   boundedEvalMs:totals(summaries.map(r=>r.boundedMillis)),
   scenarios:summaries,
   limits:["Do not equate score conservation with higher win rate.",
    "Benchmarks are CI Chromium in a headless Linux runner, not iPad Safari.",
    "Only second decision is bounded; initial action list and response branch counts are unchanged.",
    "Beam is a visible-state deterministic rank, never enemy hidden hand/future.",
    "Every branch still simulates full 20s exact physics and legal card purchases.",
    "No change to normal BOT, public main or multiplayer network."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("BOUNDED ROLLOUT SUMMARY",JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(ok=>srv.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
