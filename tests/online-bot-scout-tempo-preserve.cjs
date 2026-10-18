"use strict";
// QA-only disciplined 3-cost scout reserve under covered fort pressure.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-scout-tempo-preserve";fs.mkdirSync(out,{recursive:true});
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
const sum=(xs,f)=>xs.reduce((s,x)=>s+f(x),0),
 avg=(xs,f)=>xs.length?sum(xs,f)/xs.length:null,
 score=(x,t)=>x.winner===0?.5:x.winner===t?1:0;
(async()=>{
 let browser;
 try{
  await new Promise(ok=>srv.listen(8877,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8877/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const fixture={difficulty:"hard",elapsed:75,energy:2.5,enemyEnergy:5,
   hand:["scout","tank","engineer","ward"],fortOwners:[0,0,2],
   enemies:[{key:"scout",x:860,y:205}],
   allies:[{key:"sentinel",x:840,y:205}]};
  const setup=(variant,extra={})=>page.evaluate(x=>{
   if(!window.__shokokuQa.setBotScenario({...x.fixture,...x.extra,variant:x.variant}))
    throw Error("QA fixed scene rejected");
   return window.__shokokuQa.runBotOnce();
  },{variant,fixture,extra});
  const first=await setup("baseline");
  const hold=await setup("scoutTempoPreserve");
  const fund=await setup("scoutTempoPreserve",{energy:3});
  const danger=await setup("scoutTempoPreserve",{
   enemies:[{key:"scout",x:1140,y:330}]});
  assert.equal(first.action?.id,"infantry","usual contested-fort emergency infantry");
  assert.equal(hold.action,null,"short covered fort should hold for scout");
  assert.equal(hold.spent,0,"hold spends zero legal energy");
  assert.equal(fund.action?.id,"scout","released three-cost scout must be purchased");
  assert.notEqual(danger.action?.id,"scout","castle danger overrides scout plan");
  const run=(q,variant)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,x.cadence,x.mirror,
   x.variant==="baseline"?0:x.team,x.variant),{...q,variant});
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles){
   const opts=style==="self"?[{mirror:false,cadence:"standard"},
    {mirror:true,cadence:"standard"}]:[{mirror:false,cadence:"standard"},
    {mirror:false,cadence:"fast"}];
   for(const settings of opts){
    const q={seed,team,style,...settings};
    const base=await run(q,"baseline");
    const trial=await run(q,"scoutTempoPreserve");
    assert.ok(base?.finished&&trial?.finished&&base.elapsed>0&&trial.elapsed>0);
    assert.deepEqual(base.initialHand,trial.initialHand);
    assert.deepEqual(base.openingQueue,trial.openingQueue);
    for(const g of [base,trial])for(const t of teams)
     assert.ok(Math.abs(g.energyEstimated[t]-g.energyActual[t])<1e-6);
    const ev=trial.decisionEvents[team]||{};
    rows.push({...q,
     score:{base:score(base,team),trial:score(trial,team)},
     base:{winner:base.winner,castle:base.castleHp[team],
      enemyDamage:base.damage[3-team],spent:base.spent[team],
      forts:base.fortSeconds[team],cards:base.cards[team]},
     trial:{winner:trial.winner,castle:trial.castleHp[team],
      enemyDamage:trial.damage[3-team],spent:trial.spent[team],
      forts:trial.fortSeconds[team],cards:trial.cards[team]},
     ev:{opportunities:ev.scoutTempoOpportunities||0,
      emergencyDeferred:ev.scoutTempoEmergencyDeferred||0,
      held:ev.scoutTempoHeld||0,released:ev.scoutTempoReleased||0}});
   }
  }
  assert.equal(rows.length,120);assert.deepEqual(errors,[]);
  const aggregate=xs=>({conditions:xs.length,
   improved:xs.filter(x=>x.score.trial>x.score.base).length,
   worsened:xs.filter(x=>x.score.trial<x.score.base).length,
   unchanged:xs.filter(x=>x.score.trial===x.score.base).length,
   ownHpDelta:avg(xs,x=>x.trial.castle-x.base.castle),
   enemyDamageDelta:avg(xs,x=>x.trial.enemyDamage-x.base.enemyDamage),
   fortDelta:avg(xs,x=>x.trial.forts-x.base.forts),
   spendDelta:avg(xs,x=>x.trial.spent-x.base.spent),
   changedCardMix:xs.filter(x=>JSON.stringify(x.trial.cards)!==
    JSON.stringify(x.base.cards)).length,
   opportunities:sum(xs,x=>x.ev.opportunities),
   emergencyDeferred:sum(xs,x=>x.ev.emergencyDeferred),
   held:sum(xs,x=>x.ev.held),
   released:sum(xs,x=>x.ev.released)});
  const summary={kind:"Short guarded scout affordability plan vs baseline",
   fixed:{baseline:first.action?.id||null,hold:hold.action?.id||null,
    release:fund.action?.id||null,danger:danger.action?.id||null},
   seeds,pairedConditions:rows.length,fullGames:rows.length*2,
   overall:aggregate(rows),
   byTeam:Object.fromEntries(teams.map(t=>[t,aggregate(rows.filter(x=>x.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,aggregate(rows.filter(x=>x.style===s))])),
   changed:rows.filter(x=>x.ev.held>0||x.ev.released>0).map(x=>({
    seed:x.seed,team:x.team,style:x.style,cadence:x.cadence,
    scoreDelta:x.score.trial-x.score.base,hpDelta:x.trial.castle-x.base.castle,
    held:x.ev.held,released:x.ev.released})).slice(0,40),
   limitations:["Research-used train seeds only, never independent holdout.",
    "Short reserve may still lose a useful infantry interception; fixed scene is not evidence of winning.",
    "No changes to normal BOT, production main, card balance, or online networking."]};
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("SCOUT TEMPO PRESERVE SUMMARY",JSON.stringify(summary));
 }finally{if(browser)await browser.close();await new Promise(ok=>srv.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
