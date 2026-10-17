// Extended replay of a pre-registered QA policy; ONLY previously consumed seeds.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-fort-trade-reclaim";fs.mkdirSync(out,{recursive:true});
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
  await new Promise(ok=>server.listen(8821,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8821/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(q,variant)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,x.cadence,x.mirror,
   x.variant==="baseline"?0:x.team,x.variant),{...q,variant});
  const scene=s=>page.evaluate(spec=>{
   if(!window.__shokokuQa.setBotScenario(spec))throw Error("invalid local scenario");
   return window.__shokokuQa.runBotOnce();
  },s);
  const spec={difficulty:"hard",elapsed:80,energy:2.5,enemyEnergy:1,
    fortOwners:[0,0,2],hand:["engineer","guardian","tank","ward"],
    enemies:[{key:"scout",x:866,y:205},{key:"scout",x:880,y:205}],allies:[]};
  const baseline=await scene({...spec,variant:"baseline"});
  const oldHold=await scene({...spec,variant:"concedeFort"});
  const nowHold=await scene({...spec,variant:"fortTradeReclaim"});
  assert.equal(baseline.action?.id,"infantry","baseline reflex defense spends infantry");
  assert.equal(oldHold.action?.id,"infantry","sentinel-only planner cannot reserve unavailable sentinel");
  assert.equal(nowHold.action,null,"engineer planner chooses to bank for a capturer");
  assert.equal(nowHold.spent,0,"no illegal resource use during retreat");
  const step=await page.evaluate(()=>window.__shokokuQa.progressBotScenario({
    elapsed:87,energy:4.25,fortOwners:[0,0,1]}));
  assert.equal(step,true);
  const recapture=await page.evaluate(()=>window.__shokokuQa.runBotOnce());
  assert.equal(recapture.action?.id,"engineer","same legal engineer is sent after true fort loss");
  assert.equal(recapture.spent,4);
  const safe=await scene({...spec,variant:"fortTradeReclaim",
   enemies:[{key:"scout",x:1030,y:205},{key:"scout",x:1050,y:205}]});
  assert.notEqual(safe.action,null,"castle approach cancels outpost surrender");
  const air=await scene({...spec,variant:"fortTradeReclaim",
   enemies:[{key:"drone",x:866,y:205},{key:"drone",x:880,y:205}]});
  assert.notEqual(air.action,null,"flying units cannot trigger a ground recapture trade");
  const pairs=[];
  for(const seed of seeds)for(const team of sides)for(const style of styles){
   const situations=style==="self"?
    [{mirror:false,cadence:"standard"},{mirror:true,cadence:"standard"}]:
    [{mirror:false,cadence:"standard"},{mirror:false,cadence:"fast"}];
   for(const situation of situations){
    const q={seed,team,style,...situation};
    const base=await run(q,"baseline"),legacy=await run(q,"concedeFort"),
     trial=await run(q,"fortTradeReclaim");
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
  assert.deepEqual(errors,[]);
  const report={kind:"Known-seed route-verified recapture vs both legacy-concession and default; NOT holdout",
   seeds,totalGames:240,comparisonPairs:120,
   overall:agg(pairs),
   byTeam:Object.fromEntries(sides.map(t=>[t,agg(pairs.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,agg(pairs.filter(r=>r.style===s))])),
   byCadence:Object.fromEntries(["standard","fast"].map(s=>[s,agg(pairs.filter(r=>r.cadence===s))])),
   bySeed:Object.fromEntries(seeds.map(s=>[s,agg(pairs.filter(r=>r.seed===s))])),
   caveats:[
    "Engineer recapture is counted as recovered only if the target fort later returns to our side.",
    "Recovered ownership with engineer near is observational, not a causal assertion.",
    "Seeds already used in previous research; selection bias possible.",
    "Score changes must be confirmed on NEW independent seeds before promotion.",
    "BOT baseline, online rules, movement and balance remain unchanged."]};
  fs.writeFileSync(path.join(out,"pairs.json"),JSON.stringify(pairs,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("FORT TRADE RECLAIM SUMMARY",JSON.stringify(report));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});