// Candidate frozen BEFORE untouched seed evaluation. No tuning of holdout outcomes.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),
 http=require("node:http"),path=require("node:path"),{chromium}=require("playwright");
const output="qa-bot-holdout",root=process.cwd();
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
// Fresh, preregistered holdout: disjoint from train and prior published self-play.
const seeds=[3001,3037,3083,3119,3181,3203];
const candidate="reserveEarly",teams=[1,2],maps=[false,true],orders=[1,2];
const points=(game,team)=>game.winner===0?.5:game.winner===team?1:0;
const score=rows=>({
  wins:rows.filter(r=>r.delta>0).length,
  losses:rows.filter(r=>r.delta<0).length,
  ties:rows.filter(r=>r.delta===0).length,
  delta:rows.reduce((sum,r)=>sum+r.delta,0),
  candidateLargeCards:rows.reduce((sum,r)=>sum+(r.candidateCards?.tank||0)+(r.candidateCards?.guardian||0),0),
  baselineLargeCards:rows.reduce((sum,r)=>sum+(r.baselineCards?.tank||0)+(r.baselineCards?.guardian||0),0)
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8795,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8795/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(seed,mirror,first,team=0,policy="baseline")=>page.evaluate(
   ({seed,mirror,first,team,policy})=>
    window.__shokokuQa.runDuel(seed,"self","hard",first,"standard",mirror,team,policy),
   {seed,mirror,first,team,policy});
  const rows=[],baselineMatches=[];
  for(const seed of seeds)for(const mirror of maps)for(const first of orders){
   const baseline=await run(seed,mirror,first);
   assert.ok(baseline?.finished&&baseline.variant==="baseline","reference match finishes");
   baselineMatches.push({seed,mirror,first,winner:baseline.winner});
   for(const team of teams){
    const experiment=await run(seed,mirror,first,team,candidate);
    assert.ok(experiment?.finished&&experiment.variant===candidate,"candidate match finishes");
    assert.deepEqual(experiment.initialHand,baseline.initialHand,"same initial cards");
    assert.deepEqual(experiment.openingQueue,baseline.openingQueue,"same queue");
    for(const side of teams){
     assert.ok(experiment.actions[side]>0&&experiment.spent[side]>0,"both use paid actions");
     assert.ok(experiment.maxUnits[side]<=65,"unit count");
     assert.ok(experiment.avgEnergy[side]>=0&&experiment.avgEnergy[side]<=12,"energy cap");
    }
    rows.push({seed,mirror,first,team,baseWinner:baseline.winner,
     candidateWinner:experiment.winner,
     delta:points(experiment,team)-points(baseline,team),
     candidateCards:experiment.cards[team],baselineCards:baseline.cards[team],
     candidateEvents:experiment.decisionEvents[team],baselineEvents:baseline.decisionEvents[team]});
   }
   console.log("BLIND HOLDOUT",seed,mirror?"mirror":"normal","first",first,
    "baseline",baseline.winner);
  }
  assert.equal(baselineMatches.length,24);
  assert.equal(rows.length,48);
  assert.deepEqual(errors,[],"no runtime errors");
  const total=score(rows),byTeam=Object.fromEntries(teams.map(team=>[team,score(rows.filter(r=>r.team===team))]));
  const bySeed=Object.fromEntries(seeds.map(seed=>[seed,score(rows.filter(r=>r.seed===seed))]));
  const improvedSeeds=seeds.filter(seed=>bySeed[seed].wins>0).length;
  // Precommitted promotion gate; a NO does not imply candidate is harmful.
  const eligible=total.delta>=3&&total.losses<=1&&byTeam[1].delta>=0&&byTeam[2].delta>=0&&improvedSeeds>=2;
  const summary={
   kind:"UNSEEN holdout, preregistered reserveEarly",version:1,seedSet:seeds,
   candidate,referenceGames:baselineMatches.length,candidateGames:rows.length,
   total,byTeam,bySeed,improvedSeeds,precommittedGate:{
    netDeltaAtLeast:3,maxWorsenedMatches:1,eachTeamNonnegative:true,improvedDistinctSeedsAtLeast:2
   },
   eligibleForManualPromotionReview:eligible,
   notes:["Candidate frozen before evaluating these 6 previously unused seeds.",
    "No card stats or combat mechanics are modified.",
    "Sequential shared PRNG permits action-dependent RNG effects.",
    "Passing the gate is not proof of human-play strength; promotion requires regression tests."]
  };
  fs.writeFileSync(path.join(output,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(output,"baseline.json"),JSON.stringify(baselineMatches,null,2));
  fs.writeFileSync(path.join(output,"summary.json"),JSON.stringify(summary,null,2));
  console.log("HOLDOUT SUMMARY",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
