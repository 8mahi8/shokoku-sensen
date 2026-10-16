// Train-only strategic director head-to-head with unchanged expert behavior.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),
 http=require("node:http"),path=require("node:path"),{chromium}=require("playwright");
const out="qa-bot-objectives",root=process.cwd();fs.mkdirSync(out,{recursive:true});
const srv=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(p).pipe(res);
});
const seeds=[17,41,73,101,131],teams=[1,2],styles=["self","rush","fortress","banker"];
const score=(g,t)=>g.winner===0?.5:g.winner===t?1:0;
const sum=(r,f)=>r.reduce((a,b)=>a+f(b),0);
const mean=(r,f)=>r.length?sum(r,f)/r.length:0;
const aggregate=rows=>({
 comparisons:rows.length,netWins:sum(rows,r=>r.delta),
 improved:rows.filter(r=>r.delta>0).length,
 worsened:rows.filter(r=>r.delta<0).length,
 unchanged:rows.filter(r=>r.delta===0).length,
 cardMixChanged:rows.filter(r=>JSON.stringify(r.controlCards)!==JSON.stringify(r.trialCards)).length,
 chosen:Object.fromEntries([...new Set(rows.flatMap(r=>Object.keys(r.actions)))].map(k=>
  [k,sum(rows,r=>r.actions[k]||0)])),
 meanCastleDamageDelta:mean(rows,r=>r.trialCastleDamage-r.baseCastleDamage),
 meanOwnCastleHpDelta:mean(rows,r=>r.trialOwnCastleHp-r.baseOwnCastleHp),
 meanFortHoldingDelta:mean(rows,r=>r.trialFortSeconds-r.baseFortSeconds),
 meanSpentDelta:mean(rows,r=>r.trialSpent-r.baseSpent)
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>srv.listen(8803,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8803/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const scene=spec=>page.evaluate(s=>{
   if(!window.__shokokuQa.setBotScenario(s))throw Error("scenario init failed");
   return window.__shokokuQa.runBotOnce();
  },spec);
  const spec={difficulty:"hard",elapsed:65,energy:5,enemyEnergy:1,
   fortOwners:[0,0,0],hand:["scout","engineer","archer","tank"],
   enemies:[{key:"scout",x:838,y:205},{key:"scout",x:849,y:205},
    {key:"scout",x:857,y:205}],allies:[]};
  const baseScene=await scene({...spec,variant:"baseline"});
  const directorScene=await scene({...spec,variant:"objectiveDirector"});
  assert.ok(baseScene.acted&&directorScene.acted,"both bots act");
  assert.equal(baseScene.action?.id,"scout","baseline picks nearest fort");
  assert.equal(directorScene.action?.id,"scout","director deploys a real capture unit");
  assert.notEqual(directorScene.action?.y,baseScene.action?.y,
   "director directs capture to an alternate open fort");
  const run=(q,variant)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,"standard",x.mirror,
   x.variant==="baseline"?0:x.team,x.variant),{...q,variant});
  const rows=[],baselines=[];
  for(const seed of seeds)for(const style of styles)for(const team of teams)
   for(const mirror of style==="self"?[false,true]:[false]){
    const q={seed,style,team,mirror};
    const base=await run(q,"baseline");
    const trial=await run(q,"objectiveDirector");
    assert.ok(base?.finished&&trial?.finished,"paired matches finish");
    assert.deepEqual(base.initialHand,trial.initialHand,"same starting deck");
    assert.deepEqual(base.openingQueue,trial.openingQueue,"same draw order");
    for(const side of teams){
     assert.ok(Math.abs(base.energyActual[side]-base.energyEstimated[side])<1e-6);
     assert.ok(Math.abs(trial.energyActual[side]-trial.energyEstimated[side])<1e-6);
    }
    const ev=trial.decisionEvents[team],actions=ev.directorActions||{};
    const expert=trial.decisionAudit[team];
    assert.ok(expert.calls>0,"real decisions audited");
    assert.ok(Object.values(actions).every(x=>Number.isInteger(x)&&x>=0));
    rows.push({...q,controlWinner:base.winner,trialWinner:trial.winner,
     delta:score(trial,team)-score(base,team),actions,
     controlCards:base.cards[team],trialCards:trial.cards[team],
     baseCastleDamage:base.damage[3-team],trialCastleDamage:trial.damage[3-team],
     baseOwnCastleHp:base.castleHp[team],trialOwnCastleHp:trial.castleHp[team],
     baseFortSeconds:base.fortSeconds[team],trialFortSeconds:trial.fortSeconds[team],
     baseSpent:base.spent[team],trialSpent:trial.spent[team]});
    baselines.push({...q,winner:base.winner,cardCounts:base.cards[team]});
   }
  assert.equal(rows.length,50);assert.equal(baselines.length,50);
  assert.deepEqual(await run({seed:17,style:"self",team:2,mirror:false},"objectiveDirector"),
   await run({seed:17,style:"self",team:2,mirror:false},"objectiveDirector"),
   "seeded repeatability");
  assert.deepEqual(errors,[],"no browser errors");
  const summary={kind:"TRAIN-only objective-aware strategy A/B",version:1,seeds,
   baselineGames:baselines.length,comparisonGames:rows.length,scenarioLaneChanged:true,
   overall:aggregate(rows),
   byStyle:Object.fromEntries(styles.map(style=>[style,aggregate(rows.filter(r=>r.style===style))])),
   byTeam:Object.fromEntries(teams.map(team=>[team,aggregate(rows.filter(r=>r.team===team))])),
   bySeed:Object.fromEntries(seeds.map(seed=>[seed,aggregate(rows.filter(r=>r.seed===seed))])),
   limitations:["Train seeds only, not unseen validation or proof of better human-game play.",
    "Both sides use the same shuffled deck, costs and combat rules.",
    "Different choices may alter downstream PRNG consumption.",
    "The strategic director is QA-only; production BOT remains unchanged."]};
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"baseline.json"),JSON.stringify(baselines,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("OBJECTIVE DIRECTOR SUMMARY",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>srv.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
