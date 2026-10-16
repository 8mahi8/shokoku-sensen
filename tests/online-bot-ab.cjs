// Paired QA-only policy experiment. Training seeds only; NO holdout tuning.
"use strict";
const {chromium}=require("playwright");
const http=require("node:http"),fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=process.cwd(),out="qa-bot-ab";fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const seeds=[17,41,73,101,131,163]; // TRAIN. None of the reserved holdout seeds.
const policies=["siegeWindow","captureCoverage","reserveEarly"],maps=[false,true],orders=[1,2],teams=[1,2];
const points=(g,team)=>g.winner===0?.5:g.winner===team?1:0;
function mean(nums){return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0;}
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8794,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8794/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(seed,mirror,first,team=0,variant="baseline")=>page.evaluate(
   ({seed,mirror,first,team,variant})=>
    window.__shokokuQa.runDuel(seed,"self","hard",first,"standard",mirror,team,variant),
   {seed,mirror,first,team,variant});
  const rows=[],reference=[];
  for(const seed of seeds)for(const mirror of maps)for(const first of orders){
   const baseline=await run(seed,mirror,first);
   assert.ok(baseline?.finished,"baseline finishes");
   assert.equal(baseline.variant,"baseline");
   reference.push({seed,mirror,first,baseline});
   for(const variant of policies)for(const team of teams){
    const trial=await run(seed,mirror,first,team,variant);
    assert.ok(trial?.finished,variant+" finishes");
    assert.deepEqual(baseline.initialHand,trial.initialHand,"identical starting hand");
    assert.deepEqual(baseline.openingQueue,trial.openingQueue,"identical deck");
    for(const side of teams){
     assert.ok(trial.actions[side]>0&&trial.spent[side]>0,"both bots play");
     assert.ok(trial.avgEnergy[side]>=0&&trial.avgEnergy[side]<=12,"resource rules");
     assert.ok(trial.maxUnits[side]<=65,"unit cap");
    }
    rows.push({seed,mirror,first,team,variant,baselineWinner:baseline.winner,
     trialWinner:trial.winner,delta:points(trial,team)-points(baseline,team),
     baselineCards:baseline.cards[team],trialCards:trial.cards[team],
     baselineMetrics:baseline.decisionEvents[team],trialMetrics:trial.decisionEvents[team],
     baselineCastleHp:baseline.castleHp[team],trialCastleHp:trial.castleHp[team]});
   }
  }
  assert.equal(reference.length,24);
  assert.equal(rows.length,144);
  const replay=await run(seeds[0],false,1,1,"captureCoverage");
  const repeated=await run(seeds[0],false,1,1,"captureCoverage");
  assert.deepEqual(replay,repeated,"candidate replay determinism");
  // Verify that QA overrides restore default state between matches.
  assert.deepEqual(await run(seeds[0],false,1),reference[0].baseline,"policy isolation");
  assert.deepEqual(errors,[],"no page errors");
  const summary={kind:"TRAIN-ONLY controlled paired policy experiment",version:1,
   trainSeeds:seeds,holdoutTouched:false,conditions:reference.length,experiments:rows.length,
   baselineOutcomes:{blue:reference.filter(x=>x.baseline.winner===1).length,
    red:reference.filter(x=>x.baseline.winner===2).length},
   results:Object.fromEntries(policies.map(variant=>{
    const set=rows.filter(x=>x.variant===variant);
    const deltas=set.map(x=>x.delta);
    return [variant,{
     comparisons:set.length,deltaTotal:mean(deltas)*set.length,deltaMean:mean(deltas),
     improved:set.filter(x=>x.delta>0).length,worse:set.filter(x=>x.delta<0).length,
     unchanged:set.filter(x=>x.delta===0).length,
     bySide:Object.fromEntries(teams.map(team=>{
      const s=set.filter(x=>x.team===team);
      return [team,{comparisons:s.length,deltaTotal:s.reduce((acc,x)=>acc+x.delta,0)}];
     })),
     baselineLargeCards:set.reduce((n,x)=>n+(x.baselineCards?.guardian||0)+(x.baselineCards?.tank||0),0),
     variantLargeCards:set.reduce((n,x)=>n+(x.trialCards?.guardian||0)+(x.trialCards?.tank||0),0),
     baselineMeanNeedFort:mean(set.map(x=>x.baselineMetrics.needFort)),
     variantMeanNeedFort:mean(set.map(x=>x.trialMetrics.needFort)),
     baselineMeanGiantHand:mean(set.map(x=>x.baselineMetrics.giantInHand)),
     variantMeanGiantHand:mean(set.map(x=>x.trialMetrics.giantInHand)),
     baselineMeanEnergy7:mean(set.map(x=>x.baselineMetrics.energy7)),
     variantMeanEnergy7:mean(set.map(x=>x.trialMetrics.energy7)),
     baselineMeanReserveReady:mean(set.map(x=>x.baselineMetrics.reserveReady||0)),
     variantMeanReserveReady:mean(set.map(x=>x.trialMetrics.reserveReady||0))
    }];
   })),
   cautions:["Uses shared sequential PRNG; a different action changes subsequent RNG draws.",
    "These are training scenarios; no holdout evaluation has been run.",
    "Card usage increases alone are not evidence of improved strength.",
    "Baseline self-vs-self side advantage is controlled by matched scenarios."]};
  fs.writeFileSync(path.join(out,"training-results.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"training-summary.json"),JSON.stringify(summary,null,2));
  console.log("BOT AB SUMMARY",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
