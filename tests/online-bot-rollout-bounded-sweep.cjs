"use strict";
// Broad-but-reproducible deterministic scenario sweep, not a win-rate study.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-rollout-bounded-sweep";fs.mkdirSync(out,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 helper=fs.readFileSync(path.join(root,"tests/online-bot-rollout-bounded.inc.js"),"utf8");
const anchor=" window.__shokokuQa={\n";
assert.equal(game.split(anchor).length,2);
const injected=game.replace(anchor,"\n"+helper+"\n"+
 " window.__shokokuQa={\n searchBounded:qaRolloutTwoStepBounded,\n");
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p===path.join(root,"online-game.js")){res.end(injected);return;}
 fs.createReadStream(p).pipe(res);
});
const patterns=[
 [],[{key:"scout",x:960,y:205}],
 [{key:"scout",x:940,y:205},{key:"scout",x:975,y:211}],
 [{key:"drone",x:1010,y:205}],
 [{key:"tank",x:915,y:205}],
 [{key:"scout",x:1040,y:444}],
 [{key:"drone",x:905,y:444},{key:"scout",x:960,y:444}],
 [{key:"scout",x:980,y:205},{key:"drone",x:930,y:444}]
];
const hands=[
 ["scout","engineer","archer","sentinel"],
 ["tank","guardian","archer","engineer"],
 ["drone","scout","suppress","ward"],
 ["sentinel","archer","scout","barrage"],
 ["suppress","engineer","tank","archer"]
];
const cases=[];
for(let i=0;i<24;i++){
 const p=patterns[i%patterns.length];
 const energy=[2.6,3.4,4.3,7.2,9.1][Math.floor(i/2)%5];
 const hand=hands[(i*3+Math.floor(i/8))%hands.length];
 const lane= i%4===0?444:205;
 const enemies=p.map((e,j)=>({...e,y:lane===444?e.y===205?444:e.y:e.y}));
 const ownDef= i%5===0?[{key:"sentinel",x:850,y:lane}]:[];
 cases.push({name:"case-"+String(i).padStart(2,"0"),spec:{
  difficulty:"hard",elapsed:20+(i*17)%170,energy,enemyEnergy:3+(i%3)*2,
  hand,fortOwners:i%3===0?[0,0,0]:i%3===1?[0,0,2]:[0,2,2],
  enemies,allies:ownDef
 }});
}
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8884,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8884/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(spec,mode)=>page.evaluate(p=>{
   const start=performance.now();
   const x=window.__shokokuQa.searchBounded(p.spec,20,[17,41],
    ["idle","counterpush"],p.mode);
   return {ms:performance.now()-start,data:x};
  },{spec,mode});
  let preserved=0,diverged=0,evaluatedFull=0,evaluatedBound=0,
    runtimeFull=0,runtimeBound=0;
  const rows=[];
  for(const s of cases){
   const ref=await run(s.spec,"two"),trial=await run(s.spec,"bounded");
   const a=ref.data,b=trial.data;
   assert.ok(a?.best&&b?.best,"must evaluate each stress scene");
   const keys=r=>r.options.map(o=>[o.id,o.x,o.y].join(":")).sort();
   assert.deepEqual(keys(a),keys(b),"beam cannot remove first-step candidate");
   const key=o=>o.id+":"+o.x+":"+o.y;
   const same=key(a.best)===key(b.best);
   preserved+=+same;diverged+=+!same;
   const c=results=>results.options.flatMap(o=>o.runs).reduce((v,r)=>{
    assert.ok(r.secondOptions<=r.secondGenerated);
    assert.ok(r.secondAction&&r.secondAction.cost>=0);
    return v+r.secondOptions;
   },0);
   const full=c(a),bounded=c(b);
   assert.ok(bounded<=full);
   assert.ok(b.options.every(x=>x.runs.every(y=>y.secondOptions<=5)));
   evaluatedFull+=full;evaluatedBound+=bounded;
   runtimeFull+=ref.ms;runtimeBound+=trial.ms;
   const refChoiceUnderBounded=b.options.find(o=>key(o)===key(a.best));
   rows.push({name:s.name,energy:s.spec.energy,hand:s.spec.hand,
    enemies:s.spec.enemies.map(x=>x.key),fortOwners:s.spec.fortOwners,
    fullMs:+ref.ms.toFixed(1),boundedMs:+trial.ms.toFixed(1),
    fullEvaluations:full,boundedEvaluations:bounded,agreed:same,
    fullChoice:{id:a.best.id,x:a.best.x,y:a.best.y,worst:a.best.conservativeScore},
    boundedChoice:{id:b.best.id,x:b.best.x,y:b.best.y,worst:b.best.conservativeScore},
    fullChoiceUnderBounded:refChoiceUnderBounded?.conservativeScore??null,
    scoreRegretUnderBounded:refChoiceUnderBounded?
     +(b.best.conservativeScore-refChoiceUnderBounded.conservativeScore).toFixed(3):null});
  }
  assert.deepEqual(errors,[]);
  const report={kind:"Deterministic 24 diverse fixed scenarios, full/bounded planner",
   cases:cases.length,preserved,diverged,
   secondEvalFull:evaluatedFull,secondEvalBounded:evaluatedBound,
   reductionPct:+((1-evaluatedBound/evaluatedFull)*100).toFixed(1),
   fullMs:+runtimeFull.toFixed(1),boundedMs:+runtimeBound.toFixed(1),
   runtimeReductionPct:+((1-runtimeBound/runtimeFull)*100).toFixed(1),
   mismatches:rows.filter(x=>!x.agreed),rows,
   limitations:["These 24 generated QA situations are not real matches or an independent win-rate holdout.",
    "A choice difference does not establish better/worse true winning probability.",
    "Runs on CI Chromium only; not Safari or online latency.",
    "Cannot promote search to normal BOT from this sweep."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("BOUNDED SWEEP SUMMARY",JSON.stringify({...report,rows:undefined}));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
