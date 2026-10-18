"use strict";
// QA-only choice safeguard, never production BOT. Uses the real 30Hz engine.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-castle-race-choice";fs.mkdirSync(out,{recursive:true});
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
const sum=(xs,f)=>xs.reduce((a,x)=>a+f(x),0);
const avg=(xs,f)=>xs.length?sum(xs,f)/xs.length:null;
const score=(g,team)=>g.winner===0?.5:g.winner===team?1:0;
(async()=>{
 let browser;
 try{
  await new Promise(ok=>srv.listen(8873,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8873/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const fixture={difficulty:"hard",elapsed:120,energy:7,enemyEnergy:5,
   hand:["drone","tank","archer","sentinel"],fortOwners:[0,2,2],
   allies:[{key:"tank",x:350,y:316},{key:"archer",x:365,y:326}],enemies:[]};
  const setup=(variant,extra={})=>page.evaluate(({variant,spec})=>{
    if(!window.__shokokuQa.setBotScenario({...spec,variant}))throw Error("invalid fixed scene");
    return window.__shokokuQa.runBotOnce();
  },{variant,spec:{...fixture,...extra}});
  const forceGiant=await setup("castleRaceForce");
  const choiceGiant=await setup("castleRaceChoice");
  assert.equal(forceGiant.action?.id,"drone","old V7 spends drone despite available 7-cost tank");
  assert.equal(choiceGiant.action?.id,"tank","choice protects an immediately legal tank");
  const captureScene={energy:4,hand:["drone","scout","archer","tank"]};
  const forceCapture=await setup("castleRaceForce",captureScene);
  const choiceCapture=await setup("castleRaceChoice",captureScene);
  assert.equal(forceCapture.action?.id,"drone","old V7 drone consumes a needed capturer's budget");
  assert.equal(choiceCapture.action?.id,"scout","choice preserves legal fort capture");
  const saveScene={energy:2.5,hand:["drone","archer","sentinel","tank"]};
  const forceWait=await setup("castleRaceForce",saveScene);
  const choiceWait=await setup("castleRaceChoice",saveScene);
  assert.equal(forceWait.action,null,"old candidate saves");
  assert.equal(choiceWait.action,null,"new candidate still supports a safe non-conflicting save");
  const run=(q,variant)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,x.cadence,x.mirror,x.team,x.variant),
   {...q,variant});
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles){
   const opts=style==="self"?[{mirror:false,cadence:"standard"},
    {mirror:true,cadence:"standard"}]:[{mirror:false,cadence:"standard"},
    {mirror:false,cadence:"fast"}];
   for(const settings of opts){
    const q={seed,team,style,...settings};
    const baseline=await run(q,"fortDefenseValue"),
     force=await run(q,"castleRaceForce"),
     choice=await run(q,"castleRaceChoice");
    for(const g of [baseline,force,choice]){
     assert.ok(g?.finished&&g.elapsed>0);
     assert.ok(Math.abs(g.energyActual[team]-g.energyEstimated[team])<1e-6);
    }
    assert.deepEqual(baseline.initialHand,choice.initialHand);
    assert.deepEqual(baseline.openingQueue,choice.openingQueue);
    assert.deepEqual(force.initialHand,choice.initialHand);
    assert.deepEqual(force.openingQueue,choice.openingQueue);
    const ev=choice.decisionEvents[team]||{};
    rows.push({...q,
     score:{baseline:score(baseline,team),force:score(force,team),choice:score(choice,team)},
     outcomes:{baseline:{winner:baseline.winner,ownHp:baseline.castleHp[team],
       enemyDamage:baseline.damage[3-team],spent:baseline.spent[team],
       fortSeconds:baseline.fortSeconds[team],cards:baseline.cards[team]},
      force:{winner:force.winner,ownHp:force.castleHp[team],
       enemyDamage:force.damage[3-team],spent:force.spent[team],
       fortSeconds:force.fortSeconds[team],cards:force.cards[team]},
      choice:{winner:choice.winner,ownHp:choice.castleHp[team],
       enemyDamage:choice.damage[3-team],spent:choice.spent[team],
       fortSeconds:choice.fortSeconds[team],cards:choice.cards[team]}},
     events:{veto:ev.choiceOpportunityVeto||0,reasons:ev.choiceOpportunityReasons||{},
      examples:ev.choiceOpportunitySamples||[],started:ev.raceBudgetStarted||0,
      held:ev.raceBudgetWait||0,deployed:ev.raceBudgetDeployed||0,
      aborted:ev.raceBudgetAborted||0}});
   }
  }
  assert.equal(rows.length,120);assert.deepEqual(errors,[]);
  const cmp=(key)=>({improved:rows.filter(r=>r.score.choice>r.score[key]).length,
   worsened:rows.filter(r=>r.score.choice<r.score[key]).length,
   neutral:rows.filter(r=>r.score.choice===r.score[key]).length,
   hpDelta:avg(rows,r=>r.outcomes.choice.ownHp-r.outcomes[key].ownHp),
   enemyDamageDelta:avg(rows,r=>r.outcomes.choice.enemyDamage-r.outcomes[key].enemyDamage),
   spendDelta:avg(rows,r=>r.outcomes.choice.spent-r.outcomes[key].spent),
   fortDelta:avg(rows,r=>r.outcomes.choice.fortSeconds-r.outcomes[key].fortSeconds)});
  const report={kind:"QA-only opportunity-cost gate for legal drone reserve",
   fixed:{forceGiant:forceGiant.action?.id,choiceGiant:choiceGiant.action?.id,
    forceCapture:forceCapture.action?.id,choiceCapture:choiceCapture.action?.id,
    forceWait:forceWait.action?.id||null,choiceWait:choiceWait.action?.id||null},
   researchSeeds:seeds,paired:rows.length,fullGames:rows.length*3,
   vsBaseline:cmp("baseline"),vsForce:cmp("force"),
   vetoThoughts:sum(rows,r=>r.events.veto),plansStarted:sum(rows,r=>r.events.started),
   heldThoughts:sum(rows,r=>r.events.held),
   dronesDeployed:sum(rows,r=>r.events.deployed),
   plansAborted:sum(rows,r=>r.events.aborted),
   byTeam:Object.fromEntries(teams.map(t=>[t,rows.filter(r=>r.team===t).map(r=>
    r.score.choice-r.score.baseline).reduce((n,v)=>n+v,0)])),
   byStyle:Object.fromEntries(styles.map(s=>[s,rows.filter(r=>r.style===s).map(r=>
    r.score.choice-r.score.baseline).reduce((n,v)=>n+v,0)])),
   failures:rows.filter(r=>r.score.choice<r.score.baseline)
    .map(r=>({seed:r.seed,team:r.team,style:r.style,cadence:r.cadence})),
   limits:["Previously explored research seeds; this is NOT independent holdout.",
    "No production BOT, gameplay economy, hand, unit stats or network changes.",
    "Veto thought counts are repeated decisions, not independent match counts.",
    "Any wins here need new independent validation before production promotion."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  console.log("CASTLE RACE CHOICE SUMMARY",JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(ok=>srv.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
