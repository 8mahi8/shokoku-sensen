// QA-only real battle A/B for early low-cost interception.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-early-screen";fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(p).pipe(res);
});
const seeds=[17,41,73],sides=[1,2],styles=["self","rush","fortress","banker"];
const point=(g,team)=>g.winner===0?.5:g.winner===team?1:0;
const sum=(a,fn)=>a.reduce((n,x)=>n+fn(x),0);
const avg=(a,fn)=>a.length?sum(a,fn)/a.length:0;
const agg=a=>({
 pairs:a.length,improved:a.filter(x=>x.delta>0).length,
 worsened:a.filter(x=>x.delta<0).length,
 unchanged:a.filter(x=>x.delta===0).length,scoreDelta:sum(a,x=>x.delta),
 checks:sum(a,x=>x.checks),predictedThreats:sum(a,x=>x.threats),
 interventions:sum(a,x=>x.plays),
 changedCardMix:a.filter(x=>JSON.stringify(x.cards)!==JSON.stringify(x.baseCards)).length,
 ownCastleHpDelta:avg(a,x=>x.ownHp-x.baseOwnHp),
 enemyCastleDamageDelta:avg(a,x=>x.enemyDamage-x.baseEnemyDamage),
 fortHoldingDelta:avg(a,x=>x.fortTime-x.baseFortTime),
 resourceSpendingDelta:avg(a,x=>x.spent-x.baseSpent)
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8808,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8808/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const scene=spec=>page.evaluate(s=>{
   if(!window.__shokokuQa.setBotScenario(s))throw Error("scenario failed");
   return window.__shokokuQa.runBotOnce();
  },spec);
  const sceneBase={difficulty:"hard",elapsed:80,energy:2.5,enemyEnergy:0,
   hand:["scout","tank","engineer","ward"],fortOwners:[0,0,2],allies:[]};
  const incoming={...sceneBase,enemies:[{key:"scout",x:650,y:205}]};
  const control=await scene({...incoming,variant:"baseline"});
  const planned=await scene({...incoming,variant:"forecastCheapScreen"});
  assert.equal(control.action,null,"usual bot waits with unaffordable hand");
  assert.equal(planned.action?.id,"infantry","preposition affordable infantry before contact");
  assert.equal(planned.spent,2,"normal infantry cost");
  const covered=await scene({...incoming,variant:"forecastCheapScreen",
   allies:[{key:"sentinel",x:840,y:205}]});
  assert.notEqual(covered.action?.id,"infantry","no duplicate screen on guarded fort");
  const earlier=await scene({...sceneBase,variant:"forecastCheapScreen",
   enemies:[{key:"scout",x:470,y:205}]});
  assert.equal(earlier.action?.id,"infantry",
   "screen may deploy while both sides still have travel time");
  const distant=await scene({...sceneBase,variant:"forecastCheapScreen",
   enemies:[{key:"scout",x:240,y:205}]});
  assert.notEqual(distant.action?.id,"infantry","far enemies are not imminent");
  const exhausted=await scene({...incoming,variant:"forecastCheapScreen",energy:1});
  assert.equal(exhausted.action,null,"no purchases without energy");
  const air=await scene({...sceneBase,variant:"forecastCheapScreen",
   enemies:[{key:"drone",x:655,y:205}]});
  assert.notEqual(air.action?.id,"infantry","ground infantry cannot screen air");
  const run=(q,variant)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,"standard",x.mirror,
   x.variant==="baseline"?0:x.team,x.variant),{...q,variant});
  const rows=[];
  for(const seed of seeds)for(const team of sides)for(const style of styles)
   for(const mirror of style==="self"?[false,true]:[false]){
    const q={seed,team,style,mirror};
    const base=await run(q,"baseline"),trial=await run(q,"forecastCheapScreen");
    assert.ok(base?.finished&&trial?.finished);
    assert.deepEqual(base.initialHand,trial.initialHand);
    assert.deepEqual(base.openingQueue,trial.openingQueue);
    for(const t of sides){
     assert.ok(Math.abs(base.energyActual[t]-base.energyEstimated[t])<1e-6);
     assert.ok(Math.abs(trial.energyActual[t]-trial.energyEstimated[t])<1e-6);
    }
    const event=trial.decisionEvents[team];
    rows.push({...q,baseWinner:base.winner,winner:trial.winner,
     delta:point(trial,team)-point(base,team),
     checks:event.cheapScreenChecks||0,threats:event.cheapScreenThreats||0,
     plays:event.cheapScreenPlays||0,
     cards:trial.cards[team],baseCards:base.cards[team],
     ownHp:trial.castleHp[team],baseOwnHp:base.castleHp[team],
     enemyDamage:trial.damage[3-team],baseEnemyDamage:base.damage[3-team],
     fortTime:trial.fortSeconds[team],baseFortTime:base.fortSeconds[team],
     spent:trial.spent[team],baseSpent:base.spent[team]});
   }
  assert.equal(rows.length,30);
  assert.deepEqual(errors,[]);
  const result={kind:"Train-only 6-second low-cost fort interception",
   seeds,baselineGames:30,trialGames:30,
   scenarios:{uncovered:"infantry",guarded:"no infantry",
    distant:"no infantry",unaffordable:"none",air:"no infantry"},
   overall:agg(rows),byTeam:Object.fromEntries(sides.map(t=>[t,agg(rows.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,agg(rows.filter(r=>r.style===s))])),
   limitations:["Known training seeds; not a holdout.",
    "Only owned fort imminent ground contact, never unseen enemy information.",
    "The estimated arrival assumes speed toward the engine-selected target.",
    "No promotion without paired win evidence."]};
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(result,null,2));
  console.log("EARLY SCREEN SUMMARY",JSON.stringify(result));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});