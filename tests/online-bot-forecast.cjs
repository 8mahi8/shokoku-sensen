// Six-second contact forecast: QA-only paired matches on previously used train seeds.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-forecast";
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(file).pipe(res);
});
const seeds=[17,41,73],teams=[1,2],styles=["self","rush","fortress","banker"];
const point=(g,t)=>g.winner===0?.5:g.winner===t?1:0;
const sum=(a,fn)=>a.reduce((n,x)=>n+fn(x),0);
const mean=(a,fn)=>a.length?sum(a,fn)/a.length:0;
const agg=a=>({
 comparisons:a.length,improved:a.filter(x=>x.delta>0).length,
 worsened:a.filter(x=>x.delta<0).length,
 unchanged:a.filter(x=>x.delta===0).length,
 netWins:sum(a,x=>x.delta),
 triggers:sum(a,x=>x.triggers),
 forecastChecks:sum(a,x=>x.checks),
 forecastContacts:sum(a,x=>x.contacts),
 forecastObserved:sum(a,x=>x.observed),
 forecastNeedFort:sum(a,x=>x.needFort),
 forecastScoutReady:sum(a,x=>x.scoutReady),
 forecastEngineerReady:sum(a,x=>x.engineerReady),
 forecastArcherReady:sum(a,x=>x.archerReady),
 forecastRisky:sum(a,x=>x.risky),
 forecastScreens:sum(a,x=>x.screens),
 cardsChanged:a.filter(x=>JSON.stringify(x.cards)!==JSON.stringify(x.baseCards)).length,
 enemyCastleDamageDelta:mean(a,x=>x.enemyDamage-x.baseEnemyDamage),
 ownCastleHpDelta:mean(a,x=>x.ownHp-x.baseOwnHp),
 fortSecondsDelta:mean(a,x=>x.fortSeconds-x.baseFortSeconds),
 spentDelta:mean(a,x=>x.spent-x.baseSpent)
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8806,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8806/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const scene=s=>page.evaluate(spec=>{
   const qa=window.__shokokuQa;
   if(!qa.setBotScenario(spec))throw Error("invalid forecast scenario");
   return qa.runBotOnce();
  },s);
  const shared={difficulty:"hard",elapsed:80,energy:5,enemyEnergy:1,
   fortOwners:[0,0,0],hand:["scout","engineer","archer","tank"],allies:[]};
  const exposed={...shared,enemies:[
   {key:"scout",x:835,y:205},{key:"scout",x:846,y:205}]};
  const baseline=await scene({...exposed,variant:"baseline"});
  const risky=await scene({...exposed,variant:"forecastCapture"});
  assert.equal(baseline.action?.id,"scout","normal opening still captures with a scout");
  assert.equal(risky.action?.id,"engineer","forecast uses legal tougher capture unit");
  assert.equal(risky.spent,4,"engineer actually costs 4");
  const unthreatened=await scene({...shared,variant:"forecastCapture",
   enemies:[{key:"scout",x:400,y:490}]});
  assert.equal(unthreatened.action?.id,"scout","remote unrelated unit keeps baseline decision");
  const screened=await scene({...exposed,variant:"forecastCapture",
   allies:[{key:"archer",x:895,y:205}]});
  assert.equal(screened.action?.id,"scout","existing frontline fire support avoids overinvestment");
  const unaffordable=await scene({...exposed,variant:"forecastCapture",energy:3});
  assert.equal(unaffordable.action?.id,"scout","no free resources granted for upgrade");
  const noEngineerBase=await scene({...exposed,variant:"baseline",
   hand:["scout","archer","tank","sentinel"]});
  const noEngineer=await scene({...exposed,variant:"forecastCapture",
   hand:["scout","archer","tank","sentinel"]});
  assert.equal(noEngineerBase.action?.id,"scout");
  assert.equal(noEngineer.action?.id,"archer","forecast screens an exposed capture wave");
  assert.equal(noEngineer.spent,2,"screen pays normal archer cost");
  const run=(q,v="baseline")=>page.evaluate(x=>
   window.__shokokuQa.runDuel(x.seed,x.style,"hard",x.team,"standard",x.mirror,
    x.variant==="baseline"?0:x.team,x.variant),{...q,variant:v});
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles)
   for(const mirror of style==="self"?[false,true]:[false]){
    const q={seed,team,style,mirror};
    const base=await run(q);
    const trial=await run(q,"forecastCapture");
    assert.ok(base?.finished&&trial?.finished,"real battles must finish");
    assert.deepEqual(trial.initialHand,base.initialHand);
    assert.deepEqual(trial.openingQueue,base.openingQueue);
    for(const t of teams){
     assert.ok(Math.abs(trial.energyActual[t]-trial.energyEstimated[t])<1e-6);
     assert.ok(Math.abs(base.energyActual[t]-base.energyEstimated[t])<1e-6);
    }
    const events=trial.decisionEvents[team];
    rows.push({...q,baseWinner:base.winner,winner:trial.winner,
     delta:point(trial,team)-point(base,team),
     triggers:events.surgicalChoices?.forecastCapture||0,
     checks:events.forecastChecks||0,contacts:events.forecastContacts||0,
     observed:events.forecastObserved||0,needFort:events.forecastNeedFort||0,
     scoutReady:events.forecastScoutReady||0,engineerReady:events.forecastEngineerReady||0,
     archerReady:events.forecastArcherReady||0,risky:events.forecastRisky||0,
     screens:events.surgicalChoices?.forecastScreen||0,
     cards:trial.cards[team],baseCards:base.cards[team],
     ownHp:trial.castleHp[team],baseOwnHp:base.castleHp[team],
     enemyDamage:trial.damage[3-team],baseEnemyDamage:base.damage[3-team],
     fortSeconds:trial.fortSeconds[team],baseFortSeconds:base.fortSeconds[team],
     spent:trial.spent[team],baseSpent:base.spent[team]});
   }
  assert.equal(rows.length,30);
  assert.deepEqual(errors,[],"no browser exceptions");
  const summary={kind:"Train-only forecast capture A/B",seeds,totalGames:60,
   scenarios:{danger:"engineer",safe:"scout",screened:"scout",resource:"scout",hand:"archer"},
   overall:agg(rows),
   byTeam:Object.fromEntries(teams.map(t=>[t,agg(rows.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,agg(rows.filter(r=>r.style===s))])),
   limitations:["Known training seeds only; not an independent holdout.",
    "Forecast ignores actual combat stops and measures risk, not true future certainty.",
    "Normal BOT, player controls and online network are untouched."]};
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("FORECAST CAPTURE SUMMARY",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
