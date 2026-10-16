// Public opponent-energy estimate verification + paired TRAIN-only tactic comparison.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),
 http=require("node:http"),path=require("node:path"),{chromium}=require("playwright");
const out="qa-bot-opponent-energy",root=process.cwd();fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const seeds=[17,41,73,101,131,163];
const policies=["opponentPunish","opponentGuard"],teams=[1,2],maps=[false,true],orders=[1,2];
const points=(g,t)=>g.winner===0?.5:g.winner===t?1:0;
const sum=(a,fn)=>a.reduce((v,x)=>v+fn(x),0);
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8797,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8797/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const caseSpec={difficulty:"hard",energy:5,elapsed:90,fortOwners:[0,0,2],
   hand:["scout","tank","engineer","archer"],enemies:[],
   allies:[{key:"scout",x:640,y:440},{key:"engineer",x:647,y:438},{key:"archer",x:705,y:444}]};
  const scenario=(spec)=>page.evaluate(s=>{
   const qa=window.__shokokuQa;
   if(!qa.setBotScenario(s))throw Error("scenario rejected");
   return qa.runBotOnce();
  },spec);
  const weak=await scenario({...caseSpec,variant:"opponentPunish",enemyEnergy:1});
  const rich=await scenario({...caseSpec,variant:"opponentPunish",enemyEnergy:10});
  const falseTruth=await scenario({...caseSpec,variant:"opponentPunish",
   enemyEnergy:1,enemyActualEnergy:10});
  assert.equal(weak.opponentEstimated,1);
  assert.equal(rich.opponentEstimated,10);
  assert.deepEqual(weak.action,falseTruth.action,
   "enemy true hidden energy does not influence tactical action");
  const run=(seed,mirror,first,team=0,variant="baseline")=>page.evaluate(x=>
   window.__shokokuQa.runDuel(x.seed,"self","hard",x.first,"standard",
    x.mirror,x.team,x.variant),{seed,mirror,first,team,variant});
  const records=[],baselines=[];
  for(const seed of seeds)for(const mirror of maps)for(const first of orders){
   const base=await run(seed,mirror,first);
   assert.ok(base?.finished,"baseline match finishes");
   assert.ok([1,2].every(t=>Math.abs(base.energyActual[t]-base.energyEstimated[t])<1e-6),
    "opponent energy reconstructed exactly from observable plays");
   baselines.push({seed,mirror,first,winner:base.winner});
   for(const variant of policies)for(const team of teams){
    const trial=await run(seed,mirror,first,team,variant);
    assert.ok(trial?.finished,"trial match finishes");
    assert.deepEqual(trial.initialHand,base.initialHand,"same starting deck");
    assert.deepEqual(trial.openingQueue,base.openingQueue,"same draw order");
    for(const side of teams){
     assert.ok(trial.actions[side]>0&&trial.spent[side]>0,"cards actually paid");
     assert.ok(trial.avgEnergy[side]>=0&&trial.avgEnergy[side]<=12,"energy legal");
     assert.ok(Math.abs(trial.energyActual[side]-trial.energyEstimated[side])<1e-6,
      "inferred and actual energy match");
    }
    records.push({seed,mirror,first,team,variant,baselineWinner:base.winner,
     winner:trial.winner,delta:points(trial,team)-points(base,team),
     events:trial.decisionEvents[team],baselineCards:base.cards[team],trialCards:trial.cards[team]});
   }
  }
  assert.equal(baselines.length,24);
  assert.equal(records.length,96);
  assert.deepEqual(errors,[],"browser page errors");
  const summary={kind:"TRAIN-only publicly inferred opponent energy experiment",version:1,
   seeds,baselineGames:baselines.length,comparisons:records.length,
   reconstructionVerified:true,privateEnergyIndependenceVerified:true,
   scenarioWeakAction:weak.action?.id??null,scenarioRichAction:rich.action?.id??null,
   variants:Object.fromEntries(policies.map(variant=>{
    const set=records.filter(x=>x.variant===variant);
    return [variant,{comparisons:set.length,delta:sum(set,r=>r.delta),
     improved:set.filter(x=>x.delta>0).length,worse:set.filter(x=>x.delta<0).length,
     unchanged:set.filter(x=>x.delta===0).length,
     lowObservations:sum(set,x=>x.events.opponentLow||0),
     highObservations:sum(set,x=>x.events.opponentHigh||0),
     byTeam:Object.fromEntries(teams.map(team=>{
      const a=set.filter(x=>x.team===team);
      return [team,{delta:sum(a,x=>x.delta),improved:a.filter(x=>x.delta>0).length,
       worse:a.filter(x=>x.delta<0).length}];
     }))}];
   })),
   limits:["Opponent hand unknown; cost/deployment records and public rate only.",
    "Shared sequential PRNG changes consumption with policy.",
    "All seeds are training examples; improvement requires new untouched holdout.",
    "No card strength or balance modifications."]};
  fs.writeFileSync(path.join(out,"records.json"),JSON.stringify(records,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("OPPONENT ENERGY SUMMARY",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
