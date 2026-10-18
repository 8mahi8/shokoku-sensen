"use strict";
// Actual Playwright proof-of-concept for local-only alternative-action rollouts.
// The online-game.js source is served with a *temporary* QA helper injected;
// it is never written back to the game and can never load on public origin.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-rollout-search";fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,"online-game.js"),"utf8");
const helper=fs.readFileSync(path.join(root,"tests/online-bot-rollout-search.inc.js"),"utf8");
const anchor=" window.__shokokuQa={\n";
assert.equal(source.split(anchor).length,2,"QA export anchor unexpectedly changed");
const patched=source.replace(anchor,"\n"+helper+"\n"+
  " window.__shokokuQa={\n searchActions:qaRolloutSearch,\n");
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(file===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(file).pipe(res);
});
const scenes=[
 {name:"uncontested-opening",spec:{difficulty:"hard",elapsed:20,energy:4,enemyEnergy:4,
  hand:["scout","engineer","archer","drone"],fortOwners:[0,0,0],
  enemies:[],allies:[]}},
 {name:"ground-raiders",spec:{difficulty:"hard",elapsed:80,energy:7,enemyEnergy:4,
  hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
  enemies:[{key:"scout",x:958,y:205},{key:"scout",x:968,y:213}],allies:[]}},
 {name:"air-threat",spec:{difficulty:"hard",elapsed:90,energy:4,enemyEnergy:4,
  hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
  enemies:[{key:"drone",x:980,y:205}],allies:[]}},
 {name:"existing-screen",spec:{difficulty:"hard",elapsed:90,energy:4,enemyEnergy:4,
  hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
  enemies:[{key:"scout",x:940,y:205}],allies:[{key:"sentinel",x:880,y:205}]}},
 {name:"armored-raider",spec:{difficulty:"hard",elapsed:110,energy:7,enemyEnergy:7,
  hand:["tank","guardian","archer","engineer"],fortOwners:[0,0,2],
  enemies:[{key:"tank",x:880,y:205}],allies:[]}}
];
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8878,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8878/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const search=(spec,horizon,seeds)=>page.evaluate(p=>
   window.__shokokuQa.searchActions(p.spec,p.horizon,p.seeds),
   {spec,horizon,seeds});
  const summary=[];
  for(const scene of scenes){
   const started=Date.now();
   const first=await search(scene.spec,20,[17,41,73]);
   assert.ok(first&&first.best&&first.options.length>=2,"must evaluate alternatives");
   assert.ok(Number.isFinite(first.best.meanScore),"score must be finite");
   assert.ok(first.best.meanScore>=first.legacyScore-1e-8,"score order");
   assert.ok(first.options.some(o=>o.id==="wait"),"waiting is an option");
   for(const opt of first.options){
    assert.ok(opt.id==="wait"||scene.spec.hand.includes(opt.id)||opt.id==="infantry"||
     opt.legacyOnly,"legal card only");
    assert.ok(opt.cost<=scene.spec.energy+1e-6,"same legal energy for all options");
    assert.equal(opt.runs.length,3,"same replicated seed count");
    assert.ok(opt.runs.every(r=>Number.isFinite(r.score)));
   }
   const again=await search(scene.spec,20,[17,41,73]);
   assert.deepEqual(first,again,"seeded fixed-scene search repeatable");
   const expected={"ground-raiders":"sentinel","air-threat":"archer",
    "armored-raider":"guardian"};
   if(expected[scene.name]){
    assert.equal(first.best.id,expected[scene.name],
     "simple concrete defensive scenarios must be correctly recognized");
    assert.ok(first.best.runs.every(x=>x.ownDamage===0),
     "the selected correct defense must protect the castle in the fixed scene");
   }
   const legacyResult=first.options.find(x=>x.id===first.legacy.id&&
    x.x===first.legacy.x&&x.y===first.legacy.y);
   const metrics=option=>({
    castleDamage:option.runs.reduce((sum,r)=>sum+r.ownDamage,0)/option.runs.length,
    enemyUnitDamage:option.runs.reduce((sum,r)=>sum+r.enemyUnitDamage,0)/option.runs.length,
    enemyCastleDamage:option.runs.reduce((sum,r)=>sum+r.enemyCastleDamage,0)/option.runs.length
   });
   summary.push({scene:scene.name,legacy:first.legacy,
    legacyScore:first.legacyScore,legacyMetrics:metrics(legacyResult),
    chosen:{id:first.best.id,x:first.best.x,y:first.best.y,
     score:first.best.meanScore,metrics:metrics(first.best)},
    evaluationMillis:Date.now()-started,
    comparisons:first.options.length,
    ranking:first.options.slice(0,5).map(x=>({id:x.id,y:x.y,
     meanScore:x.meanScore,averageOwnCastleDamage:
     x.runs.reduce((a,r)=>a+r.ownDamage,0)/x.runs.length,
     averageEnemyUnitDamage:
     x.runs.reduce((a,r)=>a+r.enemyUnitDamage,0)/x.runs.length})),
    choices:first.options.map(x=>({id:x.id,y:x.y,score:x.meanScore}))});
  }
  assert.deepEqual(errors,[],"no JS runtime errors");
  const report={kind:"QA-only exact 30Hz short-horizon action alternatives",
   timeHorizonSeconds:20,seeds:[17,41,73],scenes:summary,
   behaviorModel:"Exact existing movement/collision/fort/castle/energy; no future card reinforcements",
   weights:"Frozen heuristic score, not predicted win probability",
   checks:["Purchase legality via botUse and actual card/energy/hand limits",
    "Action+wait from same cloned initial state under same random seeds",
    "Deterministic replay, zero JavaScript errors",
    "No production game code or normal BOT touched"],
   caveats:["This is NOT proven to beat the current BOT.",
    "Opponent cannot deploy new reinforcements during the 20s candidate branch; long-term tactics may be misranked.",
    "Main actual BOT still uses legacy heuristic; not activated by player matches.",
    "No unseen-hand or enemy-energy speculation; initial visible state only."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("ROLLOUT SEARCH SUMMARY",JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
