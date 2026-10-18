"use strict";
// QA-only pre-siege budget trial. 30Hz engine, fair hand/cost and legal spawns.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-castle-race-force";fs.mkdirSync(out,{recursive:true});
const srv=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(file).pipe(res);
});
const seeds=[17,41,73,101,131,163],teams=[1,2],
 styles=["self","rush","balanced","fortress","banker"];
const score=(g,t)=>g.winner===0?.5:g.winner===t?1:0,
 sum=(xs,f)=>xs.reduce((a,x)=>a+f(x),0),
 avg=(xs,f)=>xs.length?sum(xs,f)/xs.length:null;
(async()=>{
 let browser;
 try{
  await new Promise(ok=>srv.listen(8863,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8863/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const fixture={difficulty:"hard",elapsed:120,energy:2.5,enemyEnergy:5,
   hand:["drone","archer","sentinel","tank"],fortOwners:[0,2,2],
   allies:[{key:"tank",x:350,y:316},{key:"archer",x:365,y:326}],
   enemies:[]};
  const setup=(variant,mod={})=>page.evaluate(({variant,spec})=>{
   if(!window.__shokokuQa.setBotScenario({...spec,variant}))
    throw Error("fixed QA scene rejected");
   return window.__shokokuQa.runBotOnce();
  },{variant,spec:{...fixture,...mod}});
  const baseline=await setup("castleRaceArrival");
  const start=await setup("castleRaceForce");
  // The previous force-blind reserve waits for a drone against defenders
  // with substantially more HP than the entire attacking wave.
  const heavyEnemies=[{key:"guardian",x:150,y:310},{key:"engineer",x:153,y:328}];
  const oldHeavy=await setup("castleRaceValue",{enemies:heavyEnemies});
  const forceHeavy=await setup("castleRaceForce",{enemies:heavyEnemies});
  assert.equal(oldHeavy.action,null,"old trial waits despite substantial defenders");
  assert.equal(forceHeavy.action?.id,"archer",
   "new policy must spend normally rather than reserve drone");
  const establishedWin=await setup("castleRaceForce",{castleHp:[null,150,3000]});
  const lateDrone=await setup("castleRaceForce",{fortOwners:[0,0,2]});
  assert.equal(establishedWin.action?.id,"archer",
   "if current healthy wave already has optimistic lethal damage, do not reserve");
  assert.equal(lateDrone.action?.id,"archer",
   "if fresh drone arrives after the existing wave, do not reserve");
  const farFixture={allies:[{key:"infantry",x:609,y:316},
   {key:"archer",x:628,y:326}]};
  const oldFar=await setup("castleRaceBudget",farFixture);
  const guardedFar=await setup("castleRaceForce",farFixture);
  assert.equal(oldFar.action,null,"ungated QA version holds despite distant wave");
  assert.equal(guardedFar.action?.id,"archer",
   "guarded version spends normally when wave cannot approach soon");
  // Restore guarded active plan before checking the resource-recovery stage.
  const reentry=await setup("castleRaceForce");
  assert.equal(reentry.action,null);
  assert.equal(start.acted,true,"reservation is an active strategic choice");
  assert.equal(start.action,null,"not spending cheap units while reservation active");
  const release=await page.evaluate(()=>{
   if(!window.__shokokuQa.progressBotScenario({
    elapsed:126,energy:4,fortOwners:[0,2,2]}))throw Error("progress failed");
   return window.__shokokuQa.runBotOnce();
  });
  assert.equal(release.action?.id,"drone","saved energy must purchase real forward drone");
  assert.equal(release.spent,4,"legal drone energy cost");
  const emergency=await setup("castleRaceForce",{energy:4,
   enemies:[{key:"scout",x:1105,y:320},{key:"scout",x:1123,y:323}]});
  assert.equal(emergency.action?.id,"sentinel","capital emergency beats offensive budget");
  const interrupted=await setup("castleRaceForce");
  const lossOfFort=await page.evaluate(()=>{
   if(!window.__shokokuQa.progressBotScenario({
    elapsed:124,energy:3,fortOwners:[0,0,0]}))throw Error("progress failed");
   return window.__shokokuQa.runBotOnce();
  });
  assert.notEqual(lossOfFort.action?.id,"drone","lost staging fort cancels plan");
  assert.deepEqual(errors,[]);
  const run=(q,variant)=>page.evaluate(x=>window.__shokokuQa.runDuel(x.seed,
   x.style,"hard",x.team,x.cadence,x.mirror,x.variant==="baseline"?0:x.team,
   x.variant),{...q,variant});
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles){
   const cases=style==="self"?[{mirror:false,cadence:"standard"},
    {mirror:true,cadence:"standard"}]:[{mirror:false,cadence:"standard"},
    {mirror:false,cadence:"fast"}];
   for(const settings of cases){
    const q={seed,team,style,...settings};
    const guard=await run(q,"fortDefenseValue"),
     arrival=await run(q,"castleRaceValue"),
     budget=await run(q,"castleRaceForce");
    for(const game of [guard,arrival,budget]){
     assert.ok(game?.finished&&game.elapsed>0,"each complete game must finish");
     assert.ok(Math.abs(game.energyActual[team]-game.energyEstimated[team])<1e-6);
    }
    assert.deepEqual(guard.initialHand,budget.initialHand);
    assert.deepEqual(guard.openingQueue,budget.openingQueue);
    assert.deepEqual(arrival.initialHand,budget.initialHand);
    const ev=budget.decisionEvents[team];
    assert.ok((ev.raceBudgetChecks||0)>0);
    assert.ok((ev.raceBudgetStarted||0)>=(ev.raceBudgetDeployed||0));
    assert.ok((ev.raceBudgetEligible||0)>=(ev.raceBudgetStarted||0));
    assert.ok((ev.forceChecks||0)>0);
    assert.ok((ev.forceVetoOutmatched||0)>=(ev.forceSafeVeto||0));
    const compressed=g=>({winner:g.winner,castleHp:g.castleHp,
     damage:g.damage,fortSeconds:g.fortSeconds,spent:g.spent});
    rows.push({...q,guard:compressed(guard),arrival:compressed(arrival),
     budget:compressed(budget),
     events:{checks:ev.raceBudgetChecks||0,eligible:ev.raceBudgetEligible||0,
      started:ev.raceBudgetStarted||0,wait:ev.raceBudgetWait||0,
      deployed:ev.raceBudgetDeployed||0,aborted:ev.raceBudgetAborted||0,
      abortedReasons:ev.raceBudgetAbortReasons||{},examples:ev.raceBudgetSamples||[],
      raceQualified:ev.raceQualified||0,
      raceArrivalDeployed:ev.raceArrivalDeployed||0,
      tooFar:ev.raceBudgetTooFar||0,
      valueChecks:ev.raceValueChecks||0,
      rejected:ev.raceValueRejected||0,
      enough:ev.raceValueEnough||0,
      fragile:ev.raceValueFragile||0,
      droneLate:ev.raceValueLate||0,
      valueSamples:ev.raceValueSamples||[],
      forceChecks:ev.forceChecks||0,forceVeto:ev.forceVetoOutmatched||0,
      forceSafeVeto:ev.forceSafeVeto||0,forceSafeOpen:ev.forceSafeOpen||0,
      forceSamples:ev.forceSamples||[]}});
   }
  }
  assert.deepEqual(errors,[]);assert.equal(rows.length,120);
  const aggregate=xs=>({
   conditions:xs.length,
   improvesVsDefense:xs.filter(r=>score(r.budget,r.team)>score(r.guard,r.team)).length,
   worsensVsDefense:xs.filter(r=>score(r.budget,r.team)<score(r.guard,r.team)).length,
   improvesVsArrival:xs.filter(r=>score(r.budget,r.team)>score(r.arrival,r.team)).length,
   worsensVsArrival:xs.filter(r=>score(r.budget,r.team)<score(r.arrival,r.team)).length,
   scoreDeltaVsDefense:sum(xs,r=>score(r.budget,r.team)-score(r.guard,r.team)),
   scoreDeltaVsArrival:sum(xs,r=>score(r.budget,r.team)-score(r.arrival,r.team)),
   meanOwnCastleHpVsDefense:avg(xs,r=>r.budget.castleHp[r.team]-r.guard.castleHp[r.team]),
   meanEnemyCastleDamageVsDefense:avg(xs,r=>r.budget.damage[3-r.team]-r.guard.damage[3-r.team]),
   meanFortSecondsVsDefense:avg(xs,r=>r.budget.fortSeconds[r.team]-r.guard.fortSeconds[r.team]),
   meanEnergySpentVsDefense:avg(xs,r=>r.budget.spent[r.team]-r.guard.spent[r.team]),
   eligibleThoughts:sum(xs,r=>r.events.eligible),
   startedPlans:sum(xs,r=>r.events.started),
   heldThoughts:sum(xs,r=>r.events.wait),
   deployedDrones:sum(xs,r=>r.events.deployed),
   abortedPlans:sum(xs,r=>r.events.aborted),
   abortedByReason:Object.fromEntries(["defense","expired","lostWindow","valueLost"].map(k=>
    [k,sum(xs,r=>r.events.abortedReasons[k]||0)])),
   matchesWithPlan:xs.filter(r=>r.events.started>0).length,
   matchesWithDrone:xs.filter(r=>r.events.deployed>0).length,
   vetoThoughtsTooFar:sum(xs,r=>r.events.tooFar),
   valueChecks:sum(xs,r=>r.events.valueChecks),
   valueRejected:sum(xs,r=>r.events.rejected),
   forceChecked:sum(xs,r=>r.events.forceChecks),
   forceOutmatchedVeto:sum(xs,r=>r.events.forceVeto),
   forceEligibleBeforeVeto:sum(xs,r=>r.events.forceSafeVeto),
   forceEligibleOpen:sum(xs,r=>r.events.forceSafeOpen),
   alreadyEnough:sum(xs,r=>r.events.enough),
   fragileLead:sum(xs,r=>r.events.fragile),
   droneLate:sum(xs,r=>r.events.droneLate)
  });
  const report={kind:"Fixed V7 force factor QA-offense vs V3 value and ordinary defense",
   fixedScenes:{baseline:baseline.action?.id||null,
    budgetWait:start.action?.id||null,budgetDeploy:release.action?.id||null,
    oldHeavy:oldHeavy.action?.id||null,forceHeavy:forceHeavy.action?.id||null,
    alreadyEnough:establishedWin.action?.id||null,droneTooLate:lateDrone.action?.id||null,
    oldFar:oldFar.action?.id||null,guardedFar:guardedFar.action?.id||null,
    emergency:emergency.action?.id||null,interrupted:interrupted.action?.id||null,
    lostStaging:lossOfFort.action?.id||null},seeds,
   matchedConditions:120,fullGames:360,
   comparison:["fortDefenseValue","castleRaceValue","castleRaceForce"],
   overall:aggregate(rows),
   byTeam:Object.fromEntries(teams.map(t=>[t,aggregate(rows.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,aggregate(rows.filter(r=>r.style===s))])),
   limitations:["Research seeds already explored; untouched holdouts reserved.",
    "Hand, queue, energy and placement rules unchanged; speculative savings can lose fights.",
    "The pre-siege trigger uses only current public units, forts and castle HP.",
    "Regular BOT and main branch unchanged."]};
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("CASTLE RACE VALUE SUMMARY",JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(ok=>srv.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});