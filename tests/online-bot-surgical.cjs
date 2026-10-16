// Narrow tactical interventions on existing expert policy: TRAIN-only comparison.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 http=require("node:http"),{chromium}=require("playwright");
const out="qa-bot-surgical",root=process.cwd();fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const seeds=[17,41,73],teams=[1,2],styles=["self","rush","fortress","banker"],
 policies=["preemptFort","escortCapturer","laneScout"];
const points=(g,t)=>g.winner===0?.5:g.winner===t?1:0;
const sum=(a,f)=>a.reduce((v,x)=>v+f(x),0);
const mean=(a,f)=>a.length?sum(a,f)/a.length:0;
function aggregate(a){
 return {comparisons:a.length,scoreDelta:sum(a,x=>x.delta),
  improved:a.filter(x=>x.delta>0).length,
  worsened:a.filter(x=>x.delta<0).length,
  unchanged:a.filter(x=>x.delta===0).length,
  cardChanged:a.filter(x=>JSON.stringify(x.cards)!==JSON.stringify(x.baseCards)).length,
  triggers:sum(a,x=>x.triggers),
  meanOwnHpDelta:mean(a,x=>x.ownHp-x.baseHp),
  meanEnemyDamageDelta:mean(a,x=>x.enemyDamage-x.baseDamage),
  meanFortHoldingDelta:mean(a,x=>x.fortTime-x.baseFortTime),
  meanResourceSpentDelta:mean(a,x=>x.spent-x.baseSpent)};
}
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8804,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",x=>errors.push(x.message));
  await page.route("**/www.gstatic.com/firebasejs/**",route=>route.abort());
  await page.goto("http://127.0.0.1:8804/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const scenario=spec=>page.evaluate(s=>{
   const qa=window.__shokokuQa;
   if(!qa.setBotScenario(s))throw Error("scenario setup failed");
   return qa.runBotOnce();
  },spec);
  const fortThreat={difficulty:"hard",elapsed:80,energy:6,enemyEnergy:1,
   fortOwners:[0,0,2],
   hand:["sentinel","scout","archer","engineer"],
   enemies:[{key:"scout",x:600,y:205}],allies:[]};
  const early=await scenario({...fortThreat,variant:"preemptFort"});
  assert.equal(early.action?.id,"sentinel","earlier fort protection is a real card purchase");
  assert.equal(early.spent,4);
  const captureFight={difficulty:"hard",elapsed:80,energy:5,enemyEnergy:1,
   fortOwners:[0,0,0],
   hand:["scout","archer","sentinel","engineer"],
   enemies:[{key:"scout",x:845,y:205}],
   allies:[{key:"scout",x:795,y:205}]};
  const escort=await scenario({...captureFight,variant:"escortCapturer"});
  assert.equal(escort.action?.id,"archer","capture escort uses a valid ranged unit");
  assert.equal(escort.spent,2);
  const laneFight={difficulty:"hard",elapsed:80,energy:5,enemyEnergy:1,
   fortOwners:[0,0,0],
   hand:["scout","archer","sentinel","engineer"],
   enemies:[{key:"scout",x:835,y:205},{key:"engineer",x:846,y:205}],
   allies:[]};
  const laneBase=await scenario({...laneFight,variant:"baseline"});
  const laneNew=await scenario({...laneFight,variant:"laneScout"});
  assert.equal(laneBase.action?.id,"scout");
  assert.equal(laneNew.action?.id,"scout");
  assert.notEqual(laneBase.action?.y,laneNew.action?.y,
   "trial should actually choose a different captured-fort lane");
  const run=(q,variant)=>page.evaluate(x=>
   window.__shokokuQa.runDuel(x.seed,x.style,"hard",x.team,
    "standard",x.mirror,x.variant==="baseline"?0:x.team,x.variant),
   {...q,variant});
  const records=[],baseRows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles)
   for(const mirror of style==="self"?[false,true]:[false]){
    const q={seed,team,style,mirror};
    const base=await run(q,"baseline");
    assert.ok(base?.finished);
    baseRows.push({...q,winner:base.winner});
    for(const variant of policies){
     const trial=await run(q,variant);
     assert.ok(trial?.finished);
     assert.deepEqual(trial.initialHand,base.initialHand);
     assert.deepEqual(trial.openingQueue,base.openingQueue);
     for(const side of teams){
      assert.ok(Math.abs(trial.energyActual[side]-trial.energyEstimated[side])<1e-6);
      assert.ok(Math.abs(base.energyActual[side]-base.energyEstimated[side])<1e-6);
     }
     const ev=trial.decisionEvents[team];
     records.push({...q,variant,delta:points(trial,team)-points(base,team),
      winner:trial.winner,controlWinner:base.winner,
      triggers:ev.surgicalChoices?.[variant]||0,
      cards:trial.cards[team],baseCards:base.cards[team],
      ownHp:trial.castleHp[team],baseHp:base.castleHp[team],
      enemyDamage:trial.damage[3-team],baseDamage:base.damage[3-team],
      fortTime:trial.fortSeconds[team],baseFortTime:base.fortSeconds[team],
      spent:trial.spent[team],baseSpent:base.spent[team]});
    }
   }
  assert.equal(baseRows.length,30);
  assert.equal(records.length,90);
  assert.deepEqual(errors,[]);
  const summary={kind:"Training-only narrow tactical policy comparisons",
   version:1,seeds,baselineGames:baseRows.length,comparisonGames:records.length,
   scenarioValidity:true,
   policies:Object.fromEntries(policies.map(policy=>{
    const set=records.filter(x=>x.variant===policy);
    return [policy,{...aggregate(set),
     byTeam:Object.fromEntries(teams.map(t=>[t,aggregate(set.filter(x=>x.team===t))])),
     byStyle:Object.fromEntries(styles.map(k=>[k,aggregate(set.filter(x=>x.style===k))]))}];
   })),
   limitations:["Repeated training seeds only, not a holdout.",
    "Real opponent hands remain unavailable; every card purchase uses standard rules.",
    "Different card uses may change sequential PRNG consumption.",
    "Strict baseline and candidate choices share same opening hand and queue."]};
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(records,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("SURGICAL TACTICS SUMMARY",JSON.stringify(summary));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
