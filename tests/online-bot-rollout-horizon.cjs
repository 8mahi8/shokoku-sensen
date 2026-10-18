"use strict";
// Horizon sensitivity: do NOT fit score weights to known research scenes.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-rollout-horizon";
fs.mkdirSync(out,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 helper=fs.readFileSync(path.join(root,"tests/online-bot-rollout-response.inc.js"),"utf8");
const anchor=" window.__shokokuQa={\n";
assert.equal(game.split(anchor).length,2);
const patched=game.replace(anchor,"\n"+helper+"\n"+
 " window.__shokokuQa={\n searchHorizon:qaRolloutSearch,\n");
const srv=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(f===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(f).pipe(res);
});
const horizons=[8,20,32],seeds=[17,41,73],responses=["idle","counterpush"];
const scenes=[
 {name:"empty-opening",spec:{difficulty:"hard",elapsed:20,energy:4,enemyEnergy:4,
  hand:["scout","engineer","archer","drone"],fortOwners:[0,0,0],
  enemies:[],allies:[]}},
 {name:"raiders",spec:{difficulty:"hard",elapsed:80,energy:7,enemyEnergy:4,
  hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
  enemies:[{key:"scout",x:958,y:205},{key:"scout",x:968,y:213}],allies:[]}},
 {name:"screened",spec:{difficulty:"hard",elapsed:90,energy:4,enemyEnergy:4,
  hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
  enemies:[{key:"scout",x:940,y:205}],allies:[{key:"sentinel",x:880,y:205}]}}
];
(async()=>{
 let browser;
 try{
  await new Promise(ok=>srv.listen(8880,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8880/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const get=(spec,horizon)=>page.evaluate(p=>
   window.__shokokuQa.searchHorizon(p.spec,p.horizon,p.seeds,p.responses),
   {spec,horizon,seeds,responses});
  const result=[];
  for(const scene of scenes){
   const rows=[];
   for(const horizon of horizons){
    const start=Date.now(),evaluation=await get(scene.spec,horizon);
    assert.ok(evaluation?.best&&evaluation.options.length>1);
    assert.equal(evaluation.best.runs.length,seeds.length*responses.length);
    assert.ok(evaluation.best.runs.every(x=>x.elapsed<=horizon+.001));
    assert.ok(evaluation.options.some(x=>x.id==="wait"));
    assert.ok(evaluation.options.some(x=>x.id===evaluation.legacy.id&&
     x.x===evaluation.legacy.x&&x.y===evaluation.legacy.y));
    rows.push({horizon,wallMillis:Date.now()-start,
     chosen:{id:evaluation.best.id,x:evaluation.best.x,y:evaluation.best.y,
      mean:evaluation.best.meanScore,worst:evaluation.best.conservativeScore},
     legacy:evaluation.legacy,
     top:evaluation.options.slice(0,5).map(x=>({id:x.id,x:x.x,y:x.y,
      score:x.conservativeScore,responseMeans:x.responseMeans}))});
   }
   const unique=new Set(rows.map(r=>
    r.chosen.id+":"+r.chosen.x+":"+r.chosen.y));
   result.push({scene:scene.name,distinctHorizonChoices:unique.size,rows});
  }
  assert.deepEqual(errors,[]);
  const report={kind:"QA-only horizon-sensitivity diagnostic, not outcome optimization",
   seeds,responses,horizons,scenes:result,
   caution:["Utility scores accumulate over different lengths and cannot be compared directly across horizons.",
    "8/20/32s are research probes, not an excuse to choose the best-looking horizon on known seeds.",
    "Counterpush uses an explicit hypothetical legal enemy hand, never observed private cards.",
    "Each branch simulates one friendly purchase, not multi-turn planning.",
    "No production code, normal BOT or main branch changes."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("ROLLOUT HORIZON SUMMARY",JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(ok=>srv.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
