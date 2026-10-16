// Training-only frontline budget policy A/B and actual-action scenario.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-staged-budget";fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const seeds=[17,41,73],teams=[1,2];
const pts=(x,team)=>x.winner===0?.5:x.winner===team?1:0;
const mean=items=>items.length?items.reduce((a,b)=>a+b,0)/items.length:0;
const agg=rows=>({
 comparisons:rows.length,delta:rows.reduce((n,r)=>n+r.delta,0),
 improved:rows.filter(r=>r.delta>0).length,
 worsened:rows.filter(r=>r.delta<0).length,
 unchanged:rows.filter(r=>r.delta===0).length,
 activeWaits:rows.reduce((a,r)=>a+r.waits,0),
 activeTankPlays:rows.reduce((a,r)=>a+r.tanks,0),
 planStarts:rows.reduce((a,r)=>a+(r.started||0),0),
 planCancelled:rows.reduce((a,r)=>a+(r.cancelled||0),0),
 cancelReasons:rows.reduce((map,row)=>{
  for(const [reason,count] of Object.entries(row.cancelReasons||{}))
   map[reason]=(map[reason]||0)+count;
  return map;
 },{}),
 changedCards:rows.filter(r=>JSON.stringify(r.refCards)!==JSON.stringify(r.trialCards)).length,
 meanCastleDamageDelta:mean(rows.map(r=>r.trialCastleDamage-r.baseCastleDamage)),
 meanFortTimeDelta:mean(rows.map(r=>r.trialFort-r.baseFort))
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8801,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8801/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const scenario=spec=>page.evaluate(s=>{
   if(!window.__shokokuQa.setBotScenario(s))throw Error("invalid scenario");
   return window.__shokokuQa.runBotOnce();
  },spec);
  // Deliberately establish a covered fort with healthy forward capture troops
  // and an uncovered NEXT objective. Baseline buys scout, trial saves for tank.
  const spec={difficulty:"hard",energy:5,enemyEnergy:1,elapsed:160,
   fortOwners:[0,0,2],hand:["scout","engineer","tank","archer"],
   allies:[{key:"scout",x:700,y:205},{key:"engineer",x:690,y:208}],enemies:[]};
  const baselineAction=await scenario({...spec,variant:"baseline"});
  const trialAction=await scenario({...spec,variant:"stagedBudget"});
  assert.equal(baselineAction.action?.id,"scout","control continues capture");
  assert.equal(trialAction.action,null,"covered reserve intentionally waits");
  assert.equal(trialAction.spent,0,"cannot spend unearned resources");
  assert.equal(trialAction.acted,true,"reservation is deliberate action");
  const run=(seed,style,team,mirror=false,variant="baseline")=>page.evaluate(x=>
   window.__shokokuQa.runDuel(x.seed,x.style,"hard",x.team,"standard",
    x.mirror,x.variant==="baseline"?0:x.team,x.variant),
   {seed,style,team,mirror,variant});
  const rows=[],baseRows=[];
  for(const seed of seeds)for(const team of teams)for(const style of
   ["self","rush","fortress","banker"]){
    const mirrors=style==="self"?[false,true]:[false];
    for(const mirror of mirrors){
     const baseline=await run(seed,style,team,mirror);
     const trial=await run(seed,style,team,mirror,"stagedBudget");
     assert.ok(baseline?.finished&&trial?.finished,"both games finish");
     assert.deepEqual(baseline.initialHand,trial.initialHand);
     assert.deepEqual(baseline.openingQueue,trial.openingQueue);
     for(const t of teams){
      assert.ok(Math.abs(baseline.energyActual[t]-baseline.energyEstimated[t])<1e-6);
      assert.ok(Math.abs(trial.energyActual[t]-trial.energyEstimated[t])<1e-6);
     }
     const ev=trial.decisionEvents[team];
     baseRows.push({seed,team,style,mirror,winner:baseline.winner,
      spent:baseline.spent[team],actions:baseline.actions[team]});
     rows.push({seed,team,style,mirror,refWinner:baseline.winner,
      trialWinner:trial.winner,delta:pts(trial,team)-pts(baseline,team),
      waits:ev.budgetWait||0,tanks:ev.budgetTank||0,
      started:ev.budgetStarted||0,cancelled:ev.budgetCancelled||0,
      cancelReasons:ev.budgetCancelReasons||{},
      refCards:baseline.cards[team],trialCards:trial.cards[team],
      trialDecisionAudit:trial.decisionAudit[team],
      baseCastleDamage:baseline.damage[3-team],
      trialCastleDamage:trial.damage[3-team],
      baseFort:baseline.fortSeconds[team],trialFort:trial.fortSeconds[team]});
    }
   }
  assert.equal(rows.length,30);
  assert.deepEqual(errors,[],"no browser runtime errors");
  const summary={kind:"TRAIN-only staged budget arbitration versus identical baseline",
   version:3,seeds,scenarios:rows.length,scenarioActionDifference:true,
   overall:agg(rows),
   byStyle:Object.fromEntries(["self","rush","fortress","banker"].map(style=>
    [style,agg(rows.filter(x=>x.style===style))])),
   byTeam:Object.fromEntries(teams.map(team=>[team,agg(rows.filter(x=>x.team===team))])),
   seedScores:Object.fromEntries(seeds.map(seed=>
    [seed,agg(rows.filter(x=>x.seed===seed))])),
   limitations:["Not a human or unseen-seed assessment.",
    "Only committed to the actual BOT after independent unseen-seed validation.",
    "Seed pairing controls opening cards, but action-dependent PRNG draw counts may diverge.",
    "A healthy forward formation may change during a prolonged savings window."]};
  fs.writeFileSync(path.join(out,"baseline.json"),JSON.stringify(baseRows,null,2));
  fs.writeFileSync(path.join(out,"comparisons.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("STAGED BUDGET SUMMARY",JSON.stringify(summary));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
