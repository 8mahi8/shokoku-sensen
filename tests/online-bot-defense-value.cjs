// Extended replay of a pre-registered QA policy; ONLY previously consumed seeds.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-fort-defense-value";fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(p).pipe(res);
});
const seeds=[17,41,73,101,131,163],sides=[1,2],
 styles=["self","rush","balanced","fortress","banker"];
const point=(g,t)=>g.winner===0?.5:g.winner===t?1:0;
const sum=(a,fn)=>a.reduce((n,x)=>n+fn(x),0);
const avg=(a,fn)=>a.length?sum(a,fn)/a.length:0;
const agg=rows=>({
 pairs:rows.length,improved:rows.filter(x=>x.delta>0).length,
 worsened:rows.filter(x=>x.delta<0).length,
 unchanged:rows.filter(x=>x.delta===0).length,netScore:sum(rows,x=>x.delta),
 triggers:sum(rows,x=>x.plays),threatenedDecisions:sum(rows,x=>x.threats),
 engineerPlans:sum(rows,x=>x.engineerPlans),
 swiftOptions:sum(rows,x=>x.swiftOptions),
 sentinelPriorities:sum(rows,x=>x.sentinelPriorities),
 legacyEngineerDeploy:sum(rows,x=>x.legacyEngineerDeploy),
 legacyRecovered:sum(rows,x=>x.legacyRecovered),
 engineerDeploy:sum(rows,x=>x.engineerDeploy),
 fortRecovered:sum(rows,x=>x.fortRecovered),
 recoveredWithEngineerNear:sum(rows,x=>x.recoveredWithEngineerNear),
 routeInvalid:sum(rows,x=>x.routeInvalid),
 defenderDeploy:sum(rows,x=>x.defenderDeploy),
 legacyPlays:sum(rows,x=>x.legacyPlays),
 betterThanLegacy:rows.filter(x=>x.legacyDelta>0).length,
 worseThanLegacy:rows.filter(x=>x.legacyDelta<0).length,
 unchangedVsLegacy:rows.filter(x=>x.legacyDelta===0).length,
 scoreVsLegacy:sum(rows,x=>x.legacyDelta),
 ownHpVsLegacy:avg(rows,x=>x.ownHp-x.legacyOwnHp),
 damageVsLegacy:avg(rows,x=>x.enemyDamage-x.legacyDamage),
 fortTimeVsLegacy:avg(rows,x=>x.fortTime-x.legacyFortTime),
 checks:sum(rows,x=>x.checks),
 resolved:sum(rows,x=>x.resolved),resolvedAfterLoss:sum(rows,x=>x.resolvedAfterLoss),
 resolvedWithoutLoss:sum(rows,x=>x.resolvedWithoutLoss),
 waitWhileLost:sum(rows,x=>x.waitWhileLost),
 counterattacks:sum(rows,x=>x.counterattacks),
 meanResolutionSeconds:sum(rows,x=>x.resolved)?sum(rows,x=>x.resolutionSeconds)/sum(rows,x=>x.resolved):0,
 changedCardMix:rows.filter(x=>JSON.stringify(x.cards)!==JSON.stringify(x.baseCards)).length,
 meanOwnHpDelta:avg(rows,x=>x.ownHp-x.baseOwnHp),
 meanEnemyDamageDelta:avg(rows,x=>x.enemyDamage-x.baseEnemyDamage),
 meanFortSecondsDelta:avg(rows,x=>x.fortTime-x.baseFortTime),
 meanSpentDelta:avg(rows,x=>x.spent-x.baseSpent)
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8833,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8833/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(q,variant)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,x.cadence,x.mirror,
   x.variant==="baseline"?0:x.team,x.variant),{...q,variant});
  const scene=s=>page.evaluate(spec=>{
   if(!window.__shokokuQa.setBotScenario(spec))throw Error("invalid local scenario");
   return window.__shokokuQa.runBotOnce();
  },s);
  const baseSpec={difficulty:"hard",elapsed:80,energy:2.5,enemyEnergy:2.5,
    hand:["engineer","sentinel","guardian","ward"],allies:[],fortOwners:[0,2,2]};
  const fast={...baseSpec,enemies:[{key:"scout",x:610,y:444},{key:"scout",x:630,y:444}]};
  const slow={...baseSpec,enemies:[{key:"engineer",x:610,y:444},{key:"engineer",x:630,y:444}]};
  const baseline=await scene({...fast,variant:"baseline"});
  const trade=await scene({...fast,variant:"fortTradeReclaim"});
  const value=await scene({...fast,variant:"fortDefenseValue"});
  assert.equal(baseline.action?.id,"infantry","ordinary BOT uses immediate infantry");
  assert.equal(trade.action,null,"old trade waits for a legal 4-cost engineer");
  assert.equal(value.action,null,"value policy waits for a legal 4-cost sentinel");
  const step=await page.evaluate(()=>window.__shokokuQa.progressBotScenario({
    elapsed:87,energy:4.25,fortOwners:[0,1,2]}));
  assert.equal(step,true);
  const counter=await page.evaluate(()=>window.__shokokuQa.runBotOnce());
  assert.equal(counter.action?.id,"sentinel","fast scouts select defensive sentinel");
  assert.equal(counter.spent,4);
  await scene({...fast,variant:"fortTradeReclaim"});
  const stepOld=await page.evaluate(()=>window.__shokokuQa.progressBotScenario({
    elapsed:87,energy:4.25,fortOwners:[0,1,2]}));
  assert.equal(stepOld,true);
  const recapture=await page.evaluate(()=>window.__shokokuQa.runBotOnce());
  assert.equal(recapture.action?.id,"engineer","old policy instead sends a legal capturer");
  const slowValue=await scene({...slow,variant:"fortDefenseValue"});
  assert.equal(slowValue.action,null,"slow enemy still permits a deliberate reserve");
  await page.evaluate(()=>window.__shokokuQa.progressBotScenario({
    elapsed:87,energy:4.25,fortOwners:[0,1,2]}));
  const slowCounter=await page.evaluate(()=>window.__shokokuQa.runBotOnce());
  assert.equal(slowCounter.action?.id,"engineer","slow siege should preserve recapture plan");
  const safe=await scene({...fast,variant:"fortDefenseValue",
   enemies:[{key:"scout",x:1030,y:205},{key:"scout",x:1050,y:205}]});
  assert.notEqual(safe.action,null,"direct castle threat never waits");
  const air=await scene({...fast,variant:"fortDefenseValue",
   enemies:[{key:"drone",x:630,y:444},{key:"drone",x:650,y:444}]});
  assert.notEqual(air.action,null,"air defense remains first");
  const pairs=[];
  for(const seed of seeds)for(const team of sides)for(const style of styles){
   const situations=style==="self"?
    [{mirror:false,cadence:"standard"},{mirror:true,cadence:"standard"}]:
    [{mirror:false,cadence:"standard"},{mirror:false,cadence:"fast"}];
   for(const situation of situations){
    const q={seed,team,style,...situation};
    const base=await run(q,"baseline"),legacy=await run(q,"fortTradeReclaim"),
     trial=await run(q,"fortDefenseValue");
    assert.ok(base?.finished&&legacy?.finished&&trial?.finished);
    assert.deepEqual(base.initialHand,trial.initialHand);
    assert.deepEqual(base.openingQueue,trial.openingQueue);
    assert.deepEqual(base.initialHand,legacy.initialHand);
    assert.deepEqual(base.openingQueue,legacy.openingQueue);
    for(const side of sides){
     assert.ok(Math.abs(base.energyActual[side]-base.energyEstimated[side])<1e-6);
     assert.ok(Math.abs(trial.energyActual[side]-trial.energyEstimated[side])<1e-6);
    assert.ok(Math.abs(legacy.energyActual[side]-legacy.energyEstimated[side])<1e-6);
    }
    const ev=trial.decisionEvents[team];
    pairs.push({...q,controlWinner:base.winner,winner:trial.winner,
     delta:point(trial,team)-point(base,team),
     legacyDelta:point(trial,team)-point(legacy,team),
     legacyWinner:legacy.winner,
     plays:ev.concedeStarted||0,threats:ev.concedeThreatened||0,
     engineerPlans:ev.tradeEngineerPlans||0,
     swiftOptions:ev.valueFastScenarios||0,
     sentinelPriorities:ev.valueSentinelPriorities||0,
     legacyEngineerDeploy:legacy.decisionEvents[team].tradeReclaimDeployed||0,
     legacyRecovered:legacy.decisionEvents[team].tradeFortRecovered||0,
     engineerDeploy:ev.tradeReclaimDeployed||0,
     fortRecovered:ev.tradeFortRecovered||0,
     recoveredWithEngineerNear:ev.tradeRecoveredWithEngineerNear||0,
     routeInvalid:ev.tradeRouteOrCardInvalid||0,
     defenderDeploy:ev.tradeDefenderDeployed||0,
     legacyPlays:legacy.decisionEvents[team].concedeStarted||0,
     checks:ev.concedeConsidered||0,
     resolved:ev.concedeResolved||0,
     resolvedAfterLoss:ev.concedeResolvedLost||0,
     resolvedWithoutLoss:ev.concedeResolvedHeld||0,
     waitWhileLost:ev.concedeWaitingAfterLoss||0,
     resolutionSeconds:ev.concedeResolutionSeconds||0,
     counterattacks:ev.concedeCounterattack||0,
     cards:trial.cards[team],baseCards:base.cards[team],
     ownHp:trial.castleHp[team],baseOwnHp:base.castleHp[team],
     enemyDamage:trial.damage[3-team],baseEnemyDamage:base.damage[3-team],
     fortTime:trial.fortSeconds[team],baseFortTime:base.fortSeconds[team],
     spent:trial.spent[team],baseSpent:base.spent[team],
     legacyOwnHp:legacy.castleHp[team],
     legacyDamage:legacy.damage[3-team],
     legacyFortTime:legacy.fortSeconds[team]});
   }
  }
  assert.equal(pairs.length,120);
  // Short exact-engine counterfactuals for the difference between
  // early infantry, delayed engineer and a high-value guard.
  const caseTests=[
   {id:"forwardFast",fortOwners:[0,2,2],y:444,keys:["scout","scout"]},
   {id:"forwardSlow",fortOwners:[0,2,2],y:444,keys:["engineer","engineer"]},
   {id:"homeFast",fortOwners:[0,0,2],y:205,keys:["scout","scout"]},
   {id:"homeSlow",fortOwners:[0,0,2],y:205,keys:["engineer","engineer"]}
  ];
  const local=[];
  for(const c of caseTests)for(const seed of [17,41,73,101,131]){
   const pos=c.id.startsWith("home")?[825,845]:[610,630];
   const spec={difficulty:"hard",elapsed:80,energy:2.5,enemyEnergy:2.5,
    hand:["engineer","sentinel","guardian","ward"],fortOwners:c.fortOwners,
    allies:[],enemies:c.keys.map((key,i)=>({key,x:pos[i],y:c.y}))};
   const outcome={};
   for(const variant of ["baseline","fortTradeReclaim","fortDefenseValue"]){
    const v=await page.evaluate(x=>window.__shokokuQa.simulateFortDecision(
     x.seed,x.spec,x.variant,50),{seed,spec,variant});
    assert.ok(v?.seeded&&v.elapsed>49,"50 seconds in real engine");
    outcome[variant]={castleDamage:v.castleDamage,fortHeld:v.controlledSeconds,
     recaptured:v.recaptured,first:v.actions[0]||null};
   }
   local.push({id:c.id,seed,outcome});
  }
  assert.equal(local.length,20);
  assert.deepEqual(errors,[]);
  const report={kind:"Known-seed value-of-interception choice versus route-only trade; NOT holdout",
   seeds,totalGames:360,comparisonPairs:120,
   localCases:local.length,localTotalArms:local.length*3,
   localByCase:Object.fromEntries(caseTests.map(c=>{
    const arr=local.filter(r=>r.id===c.id);
    return [c.id,{sets:arr.length,
     avgDamage:Object.fromEntries(["baseline","fortTradeReclaim","fortDefenseValue"].map(v=>
      [v,avg(arr,r=>r.outcome[v].castleDamage)])),
     avgFortHeld:Object.fromEntries(["baseline","fortTradeReclaim","fortDefenseValue"].map(v=>
      [v,avg(arr,r=>r.outcome[v].fortHeld)]))}];
   })),
   overall:agg(pairs),
   byTeam:Object.fromEntries(sides.map(t=>[t,agg(pairs.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,agg(pairs.filter(r=>r.style===s))])),
   byCadence:Object.fromEntries(["standard","fast"].map(s=>[s,agg(pairs.filter(r=>r.cadence===s))])),
   bySeed:Object.fromEntries(seeds.map(s=>[s,agg(pairs.filter(r=>r.seed===s))])),
   caveats:[
    "Engineer recapture is counted as recovered only if the target fort later returns to our side.",
    "The reserved sentinel does not itself recapture outposts, even if it protects the castle.",
    "Fixed local cases cannot estimate online winner or human adaptation.",
    "Recovered ownership with engineer near is observational, not a causal assertion.",
    "Seeds already used in previous research; selection bias possible.",
    "Score changes must be confirmed on NEW independent seeds before promotion.",
    "BOT baseline, online rules, movement and balance remain unchanged."]};
  fs.writeFileSync(path.join(out,"pairs.json"),JSON.stringify(pairs,null,2));
  fs.writeFileSync(path.join(out,"local-counterfactuals.json"),JSON.stringify(local,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("FORT DEFENSE VALUE SUMMARY",JSON.stringify(report));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});