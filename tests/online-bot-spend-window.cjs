// QA-only, short affordability window. Existing fixed train seeds only.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const out="qa-bot-spend-window",root=process.cwd();
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const seeds=[17,41,73],teams=[1,2],styles=["self","rush","fortress","banker"];
const score=(g,t)=>g.winner===0?.5:g.winner===t?1:0;
const sum=(a,f)=>a.reduce((n,x)=>n+f(x),0);
const mean=(a,f)=>a.length?sum(a,f)/a.length:0;
const agg=a=>({
 pairs:a.length,improved:a.filter(r=>r.delta>0).length,
 worsened:a.filter(r=>r.delta<0).length,
 unchanged:a.filter(r=>r.delta===0).length,netScore:sum(a,r=>r.delta),
 started:sum(a,r=>r.started),waitDecisions:sum(a,r=>r.waitDecisions),
 scoutedAfterWait:sum(a,r=>r.scoutedAfterWait),
 interrupted:sum(a,r=>r.interrupted),expired:sum(a,r=>r.expired),
 scoutInHand:sum(a,r=>r.scoutInHand),scoutInQueue:sum(a,r=>r.scoutInQueue),
 affordabilityWindows:sum(a,r=>r.affordabilityWindows),
 forecastChecks:sum(a,r=>r.forecastChecks),unsafe:sum(a,r=>r.unsafe),
 changedCardMix:a.filter(r=>JSON.stringify(r.cards)!==JSON.stringify(r.baseCards)).length,
 ownHpDelta:mean(a,r=>r.ownHp-r.baseOwnHp),
 damageDelta:mean(a,r=>r.damage-r.baseDamage),
 fortSecondsDelta:mean(a,r=>r.fortSeconds-r.baseFortSeconds),
 spentDelta:mean(a,r=>r.spent-r.baseSpent)
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8807,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8807/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const scene=spec=>page.evaluate(s=>{
   const qa=window.__shokokuQa;
   if(!qa.setBotScenario(s))throw Error("scenario rejected");
   return qa.runBotOnce();
  },spec);
  const safe={difficulty:"hard",elapsed:280,energy:2.5,enemyEnergy:1,
   fortOwners:[0,0,0],hand:["scout","archer","tank","sentinel"],
   enemies:[],allies:[]};
  const before=await scene({...safe,variant:"baseline"});
  const wait=await scene({...safe,variant:"forecastSpendWindow"});
  assert.equal(before.action?.id,"archer","baseline spends affordable two energy");
  assert.equal(wait.action,null,"candidate defers cheap card to buy available scout");
  assert.equal(wait.spent,0);
  const funded=await scene({...safe,energy:3,variant:"forecastSpendWindow"});
  assert.equal(funded.action?.id,"scout","when affordable, normal capture immediately resumes");
  assert.equal(funded.spent,3);
  const slow=await scene({...safe,elapsed:80,variant:"forecastSpendWindow"});
  assert.equal(slow.action?.id,"archer","do not wait too long in low regen stage");
  const absent=await scene({...safe,variant:"forecastSpendWindow",
   hand:["engineer","archer","tank","sentinel"]});
  assert.equal(absent.action?.id,"archer","queue/absent scout cannot be saved for");
  const danger=await scene({...safe,variant:"forecastSpendWindow",
   enemies:[{key:"scout",x:960,y:205}]});
  assert.notEqual(danger.action,null,"visible approaching enemy cancels plan");
  const run=(q,v)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,"standard",x.mirror,
   x.variant==="baseline"?0:x.team,x.variant),{...q,variant:v});
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles)
   for(const mirror of style==="self"?[false,true]:[false]){
    const q={seed,team,style,mirror};
    const base=await run(q,"baseline"),trial=await run(q,"forecastSpendWindow");
    assert.ok(base?.finished&&trial?.finished,"both matches finish");
    assert.deepEqual(base.initialHand,trial.initialHand);
    assert.deepEqual(base.openingQueue,trial.openingQueue);
    for(const t of teams){
     assert.ok(Math.abs(base.energyActual[t]-base.energyEstimated[t])<1e-6);
     assert.ok(Math.abs(trial.energyActual[t]-trial.energyEstimated[t])<1e-6);
    }
    const ev=trial.decisionEvents[team];
    rows.push({...q,delta:score(trial,team)-score(base,team),
     winner:trial.winner,baseWinner:base.winner,
     started:ev.windowStarted||0,waitDecisions:ev.windowWaiting||0,
     scoutedAfterWait:ev.windowScoutAfterWait||0,
     interrupted:ev.windowInterrupted||0,expired:ev.windowExpired||0,
     scoutInHand:ev.windowScoutInHand||0,scoutInQueue:ev.windowScoutInQueue||0,
     affordabilityWindows:ev.windowAffordableSoon||0,
     forecastChecks:ev.windowForecastChecks||0,unsafe:ev.windowUnsafe||0,
     cards:trial.cards[team],baseCards:base.cards[team],
     ownHp:trial.castleHp[team],baseOwnHp:base.castleHp[team],
     damage:trial.damage[3-team],baseDamage:base.damage[3-team],
     fortSeconds:trial.fortSeconds[team],baseFortSeconds:base.fortSeconds[team],
     spent:trial.spent[team],baseSpent:base.spent[team]});
   }
  assert.equal(rows.length,30);
  assert.deepEqual(errors,[],"no unhandled browser errors");
  const summary={seeds,kind:"QA-only short scout affordability window; trained seeds",
   baselineGames:30,trialGames:30,
   fixedScenarios:{safe:"wait",funded:"scout",slow:"archer",
    noScoutInHand:"archer",approachingEnemy:"act"},
   overall:agg(rows),byTeam:Object.fromEntries(teams.map(t=>[t,agg(rows.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,agg(rows.filter(r=>r.style===s))])),
   limitations:["Known seeds, not independent holdout.",
    "Class-speed risk is an approximation. Wait can lose initiative.",
    "Explicit short wait requires scout in hand and affordability within 2.5 seconds.",
    "Regular BOT and published branch unchanged."]};
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("SCOUT SPEND WINDOW SUMMARY",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});