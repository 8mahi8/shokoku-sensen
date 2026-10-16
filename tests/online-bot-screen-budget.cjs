// Train-only screen-aware siege budgeting: controlled scenes and paired real duels.
"use strict";
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),
 assert=require("node:assert/strict"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-screen-budget";fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const points=(g,t)=>g.winner===0?.5:g.winner===t?1:0;
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const sum=(set,fn)=>set.reduce((s,x)=>s+fn(x),0);
function metrics(set){
 return {comparisons:set.length,delta:sum(set,r=>r.delta),
  improved:set.filter(r=>r.delta>0).length,worsened:set.filter(r=>r.delta<0).length,
  unchanged:set.filter(r=>r.delta===0).length,
  planStarts:sum(set,r=>r.events.budgetStarted||0),
  planCancelled:sum(set,r=>r.events.budgetCancelled||0),
  waits:sum(set,r=>r.events.budgetWait||0),
  tanks:sum(set,r=>r.events.budgetTank||0),
  screenedContacts:sum(set,r=>r.events.screenedContacts||0),
  unscreenedContacts:sum(set,r=>r.events.unscreenedContacts||0),
  cardChanged:set.filter(r=>JSON.stringify(r.cards)!==JSON.stringify(r.controlCards)).length,
  ownCastleHpDeltaMean:mean(set.map(r=>r.ownHp-r.controlOwnHp)),
  opponentCastleDamageDeltaMean:mean(set.map(r=>r.opponentDamage-r.controlOpponentDamage)),
  fortTimeDeltaMean:mean(set.map(r=>r.fortTime-r.controlFortTime)),
  cancelReasons:set.reduce((s,r)=>{
   for(const [k,v] of Object.entries(r.events.budgetCancelReasons||{}))s[k]=(s[k]||0)+v;
   return s;
  },{})};
}
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8802,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8802/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const action=spec=>page.evaluate(s=>{
   const qa=window.__shokokuQa;
   if(!qa.setBotScenario(s))throw Error("invalid QA scene");
   return qa.runBotOnce();
  },spec);
  const scene={difficulty:"hard",energy:5,enemyEnergy:1,elapsed:160,
   fortOwners:[0,0,2],hand:["scout","engineer","tank","archer"],
   allies:[{key:"scout",x:720,y:205},{key:"engineer",x:725,y:215}],
   enemies:[{key:"scout",x:690,y:205}]};
  const baseline=await action({...scene,variant:"baseline"});
  const strict=await action({...scene,variant:"stagedBudget"});
  const screened=await action({...scene,variant:"screenBudget"});
  assert.equal(baseline.action?.id,"scout","normal captures next fort");
  assert.equal(strict.action?.id,"scout","old policy cancels when any enemy is close");
  assert.equal(screened.action,null,"covered enemy is not automatically a siege blocker");
  assert.equal(screened.spent,0,"screen-aware policy defers card");
  const exposed=await action({...scene,variant:"screenBudget",
   allies:[{key:"scout",x:720,y:440},{key:"engineer",x:725,y:440}]});
  assert.ok(exposed.action?.id&&exposed.spent>0,"unscreened enemy must cancel saving and spend on a valid defense/capture");
  const airborne=await action({...scene,variant:"screenBudget",
   enemies:[{key:"drone",x:690,y:205}]});
  assert.ok(airborne.action?.id&&airborne.spent>0,"melee cannot screen a flying enemy");
  const run=(seed,style,team,mirror,variant)=>page.evaluate(x=>
   window.__shokokuQa.runDuel(x.seed,x.style,"hard",x.team,
    "standard",x.mirror,x.variant==="baseline"?0:x.team,x.variant),
   {seed,style,team,mirror,variant});
  const rows=[],contexts=[],seeds=[17,41,73],styles=["self","rush","fortress","banker"],
   policies=["stagedBudget","screenBudget"];
  for(const seed of seeds)for(const team of [1,2])for(const style of styles){
   for(const mirror of style==="self"?[false,true]:[false]){
    const ref=await run(seed,style,team,mirror,"baseline");
    assert.ok(ref?.finished,"reference duel finishes");
    contexts.push({seed,style,team,mirror,winner:ref.winner});
    for(const policy of policies){
     const trial=await run(seed,style,team,mirror,policy);
     assert.ok(trial?.finished,"policy match finishes");
     assert.deepEqual(trial.initialHand,ref.initialHand,"paired hands");
     assert.deepEqual(trial.openingQueue,ref.openingQueue,"paired draw queue");
     for(const t of [1,2]){
      assert.ok(Math.abs(trial.energyActual[t]-trial.energyEstimated[t])<1e-6,"public opponent energy tracked");
      assert.ok(trial.avgEnergy[t]>=0&&trial.avgEnergy[t]<=12,"energy rules");
     }
     const e=trial.decisionEvents[team];
     const cancellationCount=Object.values(e.budgetCancelReasons||{}).reduce((a,b)=>a+b,0);
     assert.equal(cancellationCount,e.budgetCancelled||0,"no missing cancellation reason");
     assert.ok((e.budgetCancelSnapshots||[]).length<=30,"sample cap");
     rows.push({seed,style,team,mirror,policy,controlWinner:ref.winner,
      winner:trial.winner,delta:points(trial,team)-points(ref,team),
      events:e,
      cards:trial.cards[team],controlCards:ref.cards[team],
      ownHp:trial.castleHp[team],controlOwnHp:ref.castleHp[team],
      opponentDamage:trial.damage[3-team],controlOpponentDamage:ref.damage[3-team],
      fortTime:trial.fortSeconds[team],controlFortTime:ref.fortSeconds[team]});
    }
   }
  }
  assert.equal(contexts.length,30);
  assert.equal(rows.length,60);
  assert.deepEqual(await run(17,"self",1,false,"screenBudget"),
   await run(17,"self",1,false,"screenBudget"),"screen-aware policy deterministic");
  assert.deepEqual(errors,[],"no browser errors");
  const summary={kind:"Train-only siege screens versus old candidate and baseline",version:1,
   contexts:contexts.length,trialGames:rows.length,seeds,
   scenarioChecks:["covered close enemy","unscreened close enemy","flying enemy cannot be melee-screened"],
   policy:Object.fromEntries(policies.map(policy=>{
    const set=rows.filter(r=>r.policy===policy);
    return [policy,{...metrics(set),
     byStyle:Object.fromEntries(styles.map(style=>[style,metrics(set.filter(r=>r.style===style))])),
     bySide:Object.fromEntries([1,2].map(team=>[team,metrics(set.filter(r=>r.team===team))]))}];
   })),
   limitations:["These are training seeds observed in earlier work, NOT independent validation.",
    "A nearby healthy unit may still lose against a stronger enemy; screen classification is an approximation.",
    "The policy is QA-only and cannot change the shipped expert behavior.",
    "Resource regeneration, card costs, unit strength and combat rules remain unchanged.",
    "Different choices may change later PRNG consumption."]};
  fs.writeFileSync(path.join(out,"baseline.json"),JSON.stringify(contexts,null,2));
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("SCREEN BUDGET SUMMARY",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
