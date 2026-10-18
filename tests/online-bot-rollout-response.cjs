"use strict";
// QA-only adversarial response branches. No original game source written.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-rollout-response";
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,"online-game.js"),"utf8");
const helper=fs.readFileSync(path.join(root,"tests/online-bot-rollout-response.inc.js"),"utf8");
const anchor=" window.__shokokuQa={\n";
assert.equal(source.split(anchor).length,2,"localhost QA injection anchor changed");
const patched=source.replace(anchor,"\n"+helper+"\n"+
 " window.__shokokuQa={\n searchResponseActions:qaRolloutSearch,\n");
const srv=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(file===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(file).pipe(res);
});
const responses=["idle","fortify","counterpush"],seeds=[17,41,73];
const scenes=[
 {name:"ground-raiders",spec:{difficulty:"hard",elapsed:80,energy:7,enemyEnergy:4,
  hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
  enemies:[{key:"scout",x:958,y:205},{key:"scout",x:968,y:213}],allies:[]}},
 {name:"air-threat",spec:{difficulty:"hard",elapsed:90,energy:4,enemyEnergy:4,
  hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
  enemies:[{key:"drone",x:980,y:205}],allies:[]}},
 {name:"opening-capture",spec:{difficulty:"hard",elapsed:20,energy:4,enemyEnergy:4,
  hand:["scout","engineer","archer","drone"],fortOwners:[0,0,0],
  enemies:[],allies:[]}},
 {name:"existing-screen",spec:{difficulty:"hard",elapsed:90,energy:4,enemyEnergy:4,
  hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
  enemies:[{key:"scout",x:940,y:205}],allies:[{key:"sentinel",x:880,y:205}]}}
];
(async()=>{
 let browser;
 try{
  await new Promise(ok=>srv.listen(8879,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",err=>errors.push(err.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8879/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(spec,plans)=>page.evaluate(arg=>
   window.__shokokuQa.searchResponseActions(arg.spec,20,arg.seeds,arg.plans),
   {spec,seeds,plans});
  const results=[];
  for(const scene of scenes){
   const started=Date.now(),single=await run(scene.spec,["idle"]),
    robust=await run(scene.spec,responses);
   assert.ok(single?.best&&robust?.best,"all scenarios evaluated");
   const again=await run(scene.spec,responses);
   assert.deepEqual(robust,again,"branching rollout must replay identically");
   const legacy=robust.options.find(x=>x.id===robust.legacy.id&&
    x.x===robust.legacy.x&&x.y===robust.legacy.y);
   assert.ok(legacy,"legacy decision also compared in hypothetical branches");
   assert.deepEqual(robust.responses,responses);
   assert.ok(robust.best.conservativeScore>=legacy.conservativeScore,
    "robust search must score at least legacy in its own conservative metric");
   assert.ok(robust.best.runs.length===responses.length*seeds.length);
   assert.equal(robust.options.find(x=>x.id===single.best.id&&
    x.x===single.best.x&&x.y===single.best.y)?.responseMeans.idle,
    single.best.meanScore,"idle response must exactly reproduce prior single-future ranking");
   for(const opt of robust.options){
    assert.ok(opt.id==="wait"||scene.spec.hand.includes(opt.id)||
     opt.id==="infantry"||opt.legacyOnly,"only legal own card choices");
    assert.ok(opt.cost<=scene.spec.energy,"never spend unavailable own energy");
    assert.equal(opt.runs.length,responses.length*seeds.length);
    assert.ok(opt.runs.every(x=>Number.isFinite(x.score)));
    assert.ok(opt.runs.filter(r=>r.response==="idle").every(r=>r.responsePlays===0),
     "idle opponent must not buy cards");
    assert.ok(Object.values(opt.responseMeans).every(Number.isFinite));
   }
   const plays=Object.fromEntries(responses.map(p=>[p,
    robust.best.runs.filter(r=>r.response===p).reduce((n,r)=>n+r.responsePlays,0)]));
   assert.ok(plays.fortify>0&&plays.counterpush>0,
    "both hypothetical response policies must successfully buy legal cards");
   results.push({scene:scene.name,elapsedMillis:Date.now()-started,
    alternatives:robust.options.length,
    naive:{id:single.best.id,x:single.best.x,y:single.best.y,
     score:single.best.meanScore},
    robust:{id:robust.best.id,x:robust.best.x,y:robust.best.y,
     mean:robust.best.meanScore,worst:robust.best.conservativeScore,
     byResponse:robust.best.responseMeans},
    legacy:{id:robust.legacy.id,x:robust.legacy.x,y:robust.legacy.y,
     worst:legacy.conservativeScore,byResponse:legacy.responseMeans},
    modeledEnemyPurchases:plays,
    bestDetail:robust.best.runs,
    top:robust.options.slice(0,5).map(r=>({
     id:r.id,x:r.x,y:r.y,cost:r.cost,worst:r.conservativeScore,
     byResponse:r.responseMeans}))});
  }
  assert.deepEqual(errors,[]);
  const report={kind:"QA-only legal response branches, exact 30Hz action search",
   seeds,responses,horizonSeconds:20,scenes:results,
   acceptance:["Every candidate compared under identical fixed enemy-response branches",
    "Response cards use actual energy, public catalog and legal deploy rules",
    "No access to actual opponent secret hand; fixed plausible hypothetical hand only",
    "Legacy decision explicitly included, repeat search deterministic"],
   limitations:["Opponent policies are scenarios, not predictions of their secret cards.",
    "Own side makes one decision, not a multi-step replanning agent.",
    "Robust scores are hand-picked utility weights, NOT win-rate evidence.",
    "Only small fixed scenes, no bot-vs-bot win-rate comparison or iPad runtime benchmark.",
    "The normal BOT and published main are unchanged."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("ROLLOUT RESPONSE SUMMARY",JSON.stringify({
   ...report,scenes:report.scenes.map(({bestDetail,...x})=>x)}));
 }finally{if(browser)await browser.close();await new Promise(ok=>srv.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
