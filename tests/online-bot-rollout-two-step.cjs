"use strict";
// Deterministic 30Hz two-step planner: same original scene, legal follow-up
// purchase at +6s, and enemy counterplay at +3/+9s. Research only.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-rollout-two-step";
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 helper=fs.readFileSync(path.join(root,"tests/online-bot-rollout-two-step.inc.js"),"utf8");
const anchor=" window.__shokokuQa={\n";
assert.equal(source.split(anchor).length,2);
const patched=source.replace(anchor,"\n"+helper+"\n"+
 " window.__shokokuQa={\n searchTwoStep:qaRolloutTwoStep,\n");
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(f===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(f).pipe(res);
});
const seeds=[17,41],responses=["idle","counterpush","latePush"],horizon=20;
const cases=[
 {name:"capture-opening",spec:{difficulty:"hard",elapsed:20,energy:4,enemyEnergy:4,
  hand:["scout","engineer","archer","drone"],fortOwners:[0,0,0],
  enemies:[],allies:[]}},
 {name:"castle-raiders",spec:{difficulty:"hard",elapsed:80,energy:7,enemyEnergy:4,
  hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
  enemies:[{key:"scout",x:958,y:205},{key:"scout",x:968,y:213}],allies:[]}},
 {name:"existing-screen",spec:{difficulty:"hard",elapsed:90,energy:4,enemyEnergy:4,
  hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
  enemies:[{key:"scout",x:940,y:205}],allies:[{key:"sentinel",x:880,y:205}]}}
];
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8882,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8882/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const search=(spec,mode)=>page.evaluate(p=>
   window.__shokokuQa.searchTwoStep(p.spec,p.horizon,p.seeds,p.responses,p.mode),
   {spec,horizon,seeds,responses,mode});
  const rows=[],summarize=o=>({id:o.id,x:o.x,y:o.y,
   mean:o.meanScore,worst:o.conservativeScore,cost:o.cost});
  for(const scene of cases){
   const t0=Date.now();
   const one=await search(scene.spec,"one"),two=await search(scene.spec,"two");
   assert.ok(one?.best&&two?.best,"both planners produce legal choice");
   assert.equal(one.mode,"one");assert.equal(two.mode,"two");
   assert.equal(two.followUpAt,6);
   const keys=r=>r.options.map(x=>JSON.stringify([x.id,x.x,x.y])).sort();
   assert.deepEqual(keys(one),keys(two),
    "all first choices are same regardless of ranking");
   assert.equal(one.best.runs.length,seeds.length*responses.length);
   assert.equal(two.best.runs.length,seeds.length*responses.length);
   assert.ok(two.options.every(x=>x.runs.every(r=>r.secondAction&&
    r.secondOptions>=1&&Math.abs(r.secondAction.at-(scene.spec.elapsed+6))<.002)),
    "two-step plans re-evaluate own legal second decision exactly at 6s");
   assert.ok(one.options.every(x=>x.runs.every(r=>r.secondAction===null)),
    "one-step control never uses follow-up action");
   // Crucial leakage check: idle and latePush diverge ONLY after t+9,
   // while our follow-up is decided at t+6. Both futures must cause the
   // exact same choice at t+6 for the same first action and random seed.
   for(const opt of two.options)for(const seed of seeds){
    const idle=opt.runs.find(r=>r.seed===seed&&r.response==="idle");
    const late=opt.runs.find(r=>r.seed===seed&&r.response==="latePush");
    assert.deepEqual(idle.secondAction,late.secondAction,
     "a t+6 planner may not know or react to unobserved t+9 opponent cards");
   }
   assert.ok(two.options.every(x=>x.runs.every(r=>r.secondAction.id==="wait"||
    r.secondAction.charged===r.secondAction.cost)),
    "real purchase deducted exact cost at second step");
   assert.ok(two.options.every(x=>x.runs.every(r=>r.secondAction.id==="wait"||
    r.secondAction.charged>=2)),"must not fake free reinforcements");
   assert.ok(two.options.some(opt=>opt.runs.some(r=>
    r.response==="latePush"&&r.responsePlays>0)),
    "the t+9 delayed enemy response must actually fire in tested matches");
   const again=await search(scene.spec,"two");
   assert.deepEqual(two,again,"deterministic two-step game clones");
   assert.ok(two.options.every(x=>x.runs.every(r=>Number.isFinite(r.score))));
   const oneLegacy=one.options.find(x=>x.id===one.legacy.id&&
    x.x===one.legacy.x&&x.y===one.legacy.y);
   const twoLegacy=two.options.find(x=>x.id===two.legacy.id&&
    x.x===two.legacy.x&&x.y===two.legacy.y);
   const spentActions=two.options.flatMap(x=>x.runs.filter(r=>
    r.secondAction.id!=="wait"));
   rows.push({scene:scene.name,wallMillis:Date.now()-t0,
    choices:two.options.length,
    firstOnly:{best:summarize(one.best),legacy:summarize(oneLegacy)},
    twoSteps:{best:summarize(two.best),legacy:summarize(twoLegacy)},
    availableSecondActions:spentActions.length,
    secondChoices:two.best.runs.map(r=>({seed:r.seed,response:r.response,
     second:r.secondAction,optionCount:r.secondOptions,
     score:r.score,ownDamage:r.ownDamage,enemyDamage:r.enemyCastleDamage})),
    enemyResponsePurchases:two.best.runs.filter(r=>r.response==="counterpush")
     .reduce((s,r)=>s+r.responsePlays,0),
    allChoices:two.options.map(x=>({first:summarize(x),
     seconds:x.runs.map(r=>({seed:r.seed,response:r.response,
      id:r.secondAction.id,cost:r.secondAction.cost}))}))});
  }
  assert.deepEqual(errors,[]);
  assert.ok(rows.some(r=>r.availableSecondActions>0),
   "two-step branch must include at least one real legal second card");
  assert.ok(rows.some(r=>r.enemyResponsePurchases>0),
   "enemy scripted counterpush really used cards");
  const report={kind:"Receding-horizon QA with exact-engine second friendly card at t+6",
   horizon,seeds,responses,scenes:rows,
   guarantees:["Second step uses only its currently visible local state and its own hand/energy.",
    "At +6s, follow-up candidate uses the remaining 14s lookahead without knowing the scripted +9s opponent branch.",
    "Every first action and opponent response gets an actual legal second purchase attempt.",
    "Clones of game state and random generator preserve reproducibility.",
    "Two-step search is evaluated, NOT used in production or connected online games."],
   caveats:["Score is a frozen hand-authored proxy, not wins.",
    "Enemy hand is a single explicit hypothetical roster, not real private hand.",
    "Second lookahead assumes no future reinforcements, but outer branch runs counterpush at t+9.",
    "Fixed scenarios and researched seeds are not independent match evidence.",
    "No 30Hz browser UI/iPad latency or full-game paired win-rate measurement yet."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("TWO STEP SEARCH SUMMARY",JSON.stringify({
   ...report,scenes:rows.map(({allChoices,...r})=>r)}));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
