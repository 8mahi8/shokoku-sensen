// Forward-looking opponent energy research, TRAIN seeds only. No promotion.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),
 http=require("node:http"),path=require("node:path"),{chromium}=require("playwright");
const out="qa-bot-tempo",root=process.cwd();fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const seeds=[17,41,73],styles=["rush","balanced","fortress","banker"],
 cadences=["standard","fast"],policies=["tempoSiege","tempoScreen"],teams=[1,2];
const points=(g,team)=>g.winner===0?.5:g.winner===team?1:0;
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
const sum=(rows,fn)=>rows.reduce((n,v)=>n+fn(v),0);
const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-6,
 label+": "+actual+" != "+expected);
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8799,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",err=>errors.push(err.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8799/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const forecast=(energy,elapsed)=>page.evaluate(v=>
   window.__shokokuQa.resourceForecast(v.energy,v.elapsed),{energy,elapsed});
  // Thresholds and every regeneration-rate boundary are exact piecewise integrals.
  let f=await forecast(0,90);
  close(f.eta2,8,"early 2");
  close(f.eta4,10+1.5/.36,"cross 100sec boundary at cost 4");
  close(f.eta7,10+4.5/.36,"cross 100sec boundary at cost 7");
  f=await forecast(0,205);
  close(f.eta4,5+2.2/.53,"cross 210sec boundary");
  f=await forecast(1,270);
  close(f.eta4,3/.7,"late high-rate economy");
  f=await forecast(8,15);close(f.eta7,0,"already affordable");
  f=await forecast(0,260);close(f.eta7,10+(7-5.3)/.7,"cross 270sec boundary");
  // Counterfactual scenarios guarantee that policy changes a *real* card.
  const scenario=spec=>page.evaluate(s=>{
   const qa=window.__shokokuQa;
   if(!qa.setBotScenario(s))throw Error("scenario init");
   return qa.runBotOnce();
  },spec);
  const siegeSpec={difficulty:"hard",elapsed:80,energy:5,enemyEnergy:.2,
   fortOwners:[0,0,2],hand:["drone","scout","archer","tank"],enemies:[],
   allies:[{key:"scout",x:700,y:444},{key:"engineer",x:692,y:444}]};
  const siegeBase=await scenario({...siegeSpec,variant:"baseline"});
  const siegeVariant=await scenario({...siegeSpec,variant:"tempoSiege"});
  assert.equal(siegeVariant.action?.id,"drone","flanking when enemy is resource-starved");
  assert.notEqual(siegeBase.action?.id,"drone","baseline must not do the same");
  assert.equal(siegeVariant.spent,4,"actual drone cost");
  const guardSpec={difficulty:"hard",elapsed:80,energy:6,enemyEnergy:5,
   fortOwners:[0,0,0],hand:["sentinel","scout","archer","tank"],
   allies:[{key:"scout",x:850,y:205},{key:"engineer",x:855,y:205}],
   enemies:[{key:"scout",x:650,y:205}]};
  const guardBase=await scenario({...guardSpec,variant:"baseline"});
  const guardVariant=await scenario({...guardSpec,variant:"tempoScreen"});
  assert.equal(guardVariant.action?.id,"sentinel","early guard against actual oncoming force");
  assert.notEqual(guardBase.action?.id,"sentinel","guard must differ from baseline");
  assert.equal(guardVariant.spent,4,"actual sentinel cost");
  // No privileged hidden enemy resources enter the forecast.
  const run=({seed,style,cadence,team,variant="baseline"})=>page.evaluate(x=>
   window.__shokokuQa.runDuel(x.seed,x.style,"hard",x.team,
    x.cadence,false,x.variant==="baseline"?0:x.team,x.variant),
   {seed,style,cadence,team,variant});
  const baseRows=[],rows=[];
  for(const style of styles)for(const cadence of cadences)for(const seed of seeds)
   for(const team of teams){
    const args={style,cadence,seed,team};
    const base=await run(args);
    assert.ok(base?.finished,"reference duel finishes");
    for(const side of teams)
     close(base.energyActual[side],base.energyEstimated[side],"base inferred energy");
    assert.ok(base.opponentEnergyPeak<=12&&base.opponentEnergyPeak>=0,"peak energy bound");
    baseRows.push({style,cadence,seed,team,winner:base.winner,
     opponentEnergyPeak:base.opponentEnergyPeak,
     ready4Seconds:base.opponentEnergyReady4Seconds,
     ready7Seconds:base.opponentEnergyReady7Seconds});
    for(const variant of policies){
     const trial=await run({...args,variant});
     assert.ok(trial?.finished&&trial.variant===variant,"variant duel finishes");
     assert.deepEqual(trial.initialHand,base.initialHand,"matched initial deck");
     assert.deepEqual(trial.openingQueue,base.openingQueue,"matched deck queue");
     for(const side of teams){
      close(trial.energyActual[side],trial.energyEstimated[side],"trial inferred energy");
      assert.ok(trial.avgEnergy[side]>=0&&trial.avgEnergy[side]<=12,"energy rules");
     }
     const ev=trial.decisionEvents[team];
     rows.push({...args,variant,baselineWinner:base.winner,winner:trial.winner,
      delta:points(trial,team)-points(base,team),
      triggers:ev.variantTriggers||0,reserves:ev.variantReserves||0,
      stagedFort:ev.stagedFort||0,hasDrone:ev.hasDrone||0,
      fundedDrone:ev.fundedDrone||0,safeDefense:ev.safeDefense||0,
      recoveryWindows:ev.enemyRecoveryWindow||0,giantSoon:ev.enemyGiantSoon||0,
      baseCards:base.cards[team],trialCards:trial.cards[team],
      baseHp:base.castleHp[team],trialHp:trial.castleHp[team],
      baseFortSeconds:base.fortSeconds[team],trialFortSeconds:trial.fortSeconds[team],
      baseEnemyCastleDamage:base.damage[3-team],trialEnemyCastleDamage:trial.damage[3-team]});
    }
   }
  assert.equal(baseRows.length,48);
  assert.equal(rows.length,96);
  assert.ok(baseRows.some(x=>x.style==="banker"&&x.ready7Seconds>0),
   "banking opponent must create a real 7-energy reaction window");
  const sanity=await run({style:"banker",cadence:"standard",seed:17,team:1,
   variant:"tempoSiege"});
  assert.deepEqual(sanity,await run({style:"banker",cadence:"standard",seed:17,
   team:1,variant:"tempoSiege"}),"candidate reproducible");
  assert.deepEqual(errors,[],"no browser page errors");
  const agg=set=>({comparisons:set.length,
   netWins:sum(set,x=>x.delta),improved:set.filter(x=>x.delta>0).length,
   worsened:set.filter(x=>x.delta<0).length,
   unchanged:set.filter(x=>x.delta===0).length,
   triggers:sum(set,x=>x.triggers),reserves:sum(set,x=>x.reserves),
   changedCards:set.filter(x=>JSON.stringify(x.baseCards)!==JSON.stringify(x.trialCards)).length,
   stagedFort:sum(set,x=>x.stagedFort),
   droneInHand:sum(set,x=>x.hasDrone),
   droneFunded:sum(set,x=>x.fundedDrone),
   safeDefense:sum(set,x=>x.safeDefense),
   meanEnemyCastleDamageDelta:mean(set.map(x=>x.trialEnemyCastleDamage-x.baseEnemyCastleDamage)),
   meanOwnCastleHpDelta:mean(set.map(x=>x.trialHp-x.baseHp)),
   meanFortSecondsDelta:mean(set.map(x=>x.trialFortSeconds-x.baseFortSeconds))});
  const summary={kind:"Training-only observed energy recharge + strategic banking opponent",
   version:3,seeds,styles,cadences,baselineGames:baseRows.length,
   comparisonGames:rows.length,forecastVerified:true,
   baselineBanker:{
    scenarios:baseRows.filter(x=>x.style==="banker").length,
    meanReady7Seconds:mean(baseRows.filter(x=>x.style==="banker").map(x=>x.ready7Seconds)),
    meanReady4Seconds:mean(baseRows.filter(x=>x.style==="banker").map(x=>x.ready4Seconds)),
    meanPeakEnergy:mean(baseRows.filter(x=>x.style==="banker").map(x=>x.opponentEnergyPeak))
   },
   policies:Object.fromEntries(policies.map(policy=>{
    const set=rows.filter(x=>x.variant===policy);
    return [policy,{...agg(set),
     byStyle:Object.fromEntries(styles.map(style=>[style,agg(set.filter(x=>x.style===style))])),
     bySide:Object.fromEntries(teams.map(team=>[team,agg(set.filter(x=>x.team===team))]))}];
   })),
   limits:["Banker is a deliberately scripted counterfactual opponent, not proof of human skill.",
    "Observed energy only; no opponent hand peeking.",
    "Comparison reuses deterministic seeds but random draws can diverge after distinct actions.",
    "No holdout seeds used. No combat stat/card-cost balance modifications."]};
  fs.writeFileSync(path.join(out,"baseline.json"),JSON.stringify(baseRows,null,2));
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("TEMPO ECONOMY SUMMARY",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
