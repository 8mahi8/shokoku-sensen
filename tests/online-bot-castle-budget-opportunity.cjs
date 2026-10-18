"use strict";
// QA-only counterfactual spending opportunity audit. No gameplay files changed.
// Traces are exposed only via an in-memory localhost response patch.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-castle-budget-opportunity";
fs.mkdirSync(out,{recursive:true});
const original=fs.readFileSync(path.join(root,"online-game.js"),"utf8");
const anchor="    forecastAudit,\n    castleHp:hp,";
assert.equal(original.split(anchor).length,2,"unexpected runDuel QA API structure");
const instrumented=original.replace(anchor,
 '    forecastAudit,\n    qaActionLedger:duelStats.actionLedger.map(a=>'+
 '({at:+a.at.toFixed(3),team:a.team,id:a.id,cost:a.cost})),\n    castleHp:hp,');
const srv=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(file===path.join(root,"online-game.js")){res.end(instrumented);return;}
 fs.createReadStream(file).pipe(res);
});
const seeds=[17,41,73,101,131,163],teams=[1,2],
 styles=["self","rush","balanced","fortress","banker"];
const sum=(xs,f)=>xs.reduce((t,x)=>t+f(x),0);
const avg=(xs,f)=>xs.length?sum(xs,f)/xs.length:null;
const label=id=>["scout","engineer"].includes(id)?"capture":
 ["sentinel","guardian","ward"].includes(id)?"defense":
 ["archer","drone","tank","suppress","barrage"].includes(id)?"combat":"other";
const within=(a,team,start,end)=>a.filter(x=>x.team===team&&
 x.at>=start-.002&&x.at<end+.002);
const shorthand=actions=>actions.map(a=>({at:a.at,id:a.id,cost:a.cost,role:label(a.id)}));
const approxSame=(a,b)=>a.team===b.team&&a.id===b.id&&Math.abs(a.at-b.at)<.04;
const score=(g,t)=>g.winner===0?.5:g.winner===t?1:0;
(async()=>{
 let browser;
 try{
  await new Promise(ok=>srv.listen(8872,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8872/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(q,variant)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,x.cadence,x.mirror,x.team,x.variant),
   {...q,variant});
  const rows=[],episodes=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles){
   const cases=style==="self"?[{mirror:false,cadence:"standard"},
    {mirror:true,cadence:"standard"}]:[{mirror:false,cadence:"standard"},
    {mirror:false,cadence:"fast"}];
   for(const settings of cases){
    const q={seed,team,style,...settings};
    const guard=await run(q,"fortDefenseValue");
    const v3=await run(q,"castleRaceValue");
    const v7=await run(q,"castleRaceForce");
    for(const g of [guard,v3,v7]){
     assert.ok(g&&g.finished&&g.elapsed>0&&g.qaActionLedger,
      "all duels must use same complete 30Hz engine");
     assert.ok(Math.abs(g.energyActual[team]-g.energyEstimated[team])<1e-6);
     assert.equal(g.actions[team],g.qaActionLedger.filter(a=>a.team===team).length);
    }
    assert.deepEqual(guard.initialHand,v7.initialHand);
    assert.deepEqual(guard.openingQueue,v7.openingQueue);
    assert.deepEqual(v3.initialHand,v7.initialHand);
    const plans=v7.decisionEvents[team].raceBudgetSamples||[];
    const firstDiffIndex=(()=>{
     const ga=guard.qaActionLedger,va=v7.qaActionLedger;
     for(let i=0;i<Math.min(ga.length,va.length);i++)
      if(!approxSame(ga[i],va[i]))return i;
     return ga.length===va.length?-1:Math.min(ga.length,va.length);
    })();
    const ga=guard.qaActionLedger,va=v7.qaActionLedger;
    const firstDivergence=firstDiffIndex<0?null:{
     guard:ga[firstDiffIndex]||null,v7:va[firstDiffIndex]||null};
    for(const p of plans){
     const start=p.at,wait=p.waitTo4;
     const beforeA=ga.filter(a=>a.at<start-.002),
      beforeB=va.filter(a=>a.at<start-.002);
     const identicalBefore=beforeA.length===beforeB.length&&
      beforeA.every((x,i)=>approxSame(x,beforeB[i]));
     const baseWaiting=within(ga,team,start,start+wait);
     const v7Waiting=within(va,team,start,start+wait);
     const base12=within(ga,team,start,start+12);
     const v712=within(va,team,start,start+12);
     episodes.push({...q,start:+start.toFixed(3),
      budgetAtStart:p.energy,waitTo4:wait,leadEta:p.leadEta,
      leadDistance:p.leadDistance,projected12:p.projected12,
      sameActionsBeforeStart:identicalBefore,
      guardDuringWait:shorthand(baseWaiting),
      v7DuringWait:shorthand(v7Waiting),
      guardNext12:shorthand(base12),v7Next12:shorthand(v712),
      guardDefensesNext12:base12.filter(a=>label(a.id)==="defense").length,
      guardCapturesNext12:base12.filter(a=>label(a.id)==="capture").length,
      guardCombatNext12:base12.filter(a=>label(a.id)==="combat").length,
      v7DefensesNext12:v712.filter(a=>label(a.id)==="defense").length,
      v7CapturesNext12:v712.filter(a=>label(a.id)==="capture").length,
      v7CombatNext12:v712.filter(a=>label(a.id)==="combat").length,
      deltaOwnHp:v7.castleHp[team]-guard.castleHp[team],
      deltaEnemyDamage:v7.damage[3-team]-guard.damage[3-team],
      firstDivergence});
    }
    rows.push({...q,
     scores:{defense:score(guard,team),v3:score(v3,team),v7:score(v7,team)},
     outcome:{guard:{winner:guard.winner,ownHp:guard.castleHp[team],
       enemyDamage:guard.damage[3-team],spent:guard.spent[team]},
      v7:{winner:v7.winner,ownHp:v7.castleHp[team],
       enemyDamage:v7.damage[3-team],spent:v7.spent[team]}},
     actions:{guard:guard.qaActionLedger.length,v3:v3.qaActionLedger.length,
      v7:v7.qaActionLedger.length},firstDivergence,
     sameActions:ga.length===va.length&&ga.every((a,i)=>approxSame(a,va[i])),
     events:{eligible:v7.decisionEvents[team].raceBudgetEligible||0,
      started:v7.decisionEvents[team].raceBudgetStarted||0,
      held:v7.decisionEvents[team].raceBudgetWait||0,
      deployed:v7.decisionEvents[team].raceBudgetDeployed||0,
      aborted:v7.decisionEvents[team].raceBudgetAborted||0,
      reasons:v7.decisionEvents[team].raceBudgetAbortReasons||{}}});
   }
  }
  assert.deepEqual(errors,[]);
  assert.equal(rows.length,120);
  assert.equal(sum(rows,r=>r.events.started),episodes.length,
   "all savings episodes must have a start sample");
  const clean=episodes.filter(x=>x.sameActionsBeforeStart);
  const changed=rows.filter(x=>!x.sameActions);
  const countType=(xs,key,type)=>sum(xs,x=>x[key].filter(a=>a.role===type).length);
  const report={kind:"Counterfactual action opportunity diagnostic, QA-only (unmodified tactics)",
   engine:"real 30Hz runDuel with QA return-value-only action ledger",
   seeds,pairedConditions:rows.length,games:rows.length*3,
   comparison:{improved:rows.filter(r=>r.scores.v7>r.scores.defense).length,
    worsened:rows.filter(r=>r.scores.v7<r.scores.defense).length,
    differentActionLedgers:changed.length,
    meanOwnHpDelta:avg(rows,r=>r.outcome.v7.ownHp-r.outcome.guard.ownHp),
    meanEnemyDamageDelta:avg(rows,r=>r.outcome.v7.enemyDamage-r.outcome.guard.enemyDamage)},
   plans:{started:episodes.length,matchedHistoryAtStart:clean.length,
    alreadyDivergedAtStart:episodes.length-clean.length,
    guardSpentDuringWait:episodes.filter(x=>x.guardDuringWait.length>0).length,
    matchedHistoryGuardSpentDuringWait:clean.filter(x=>x.guardDuringWait.length>0).length,
    matchedHistoryNoGuardSpendDuringWait:clean.filter(x=>!x.guardDuringWait.length).length,
    guardCombatDuringWait:countType(episodes,"guardDuringWait","combat"),
    guardDefenseDuringWait:countType(episodes,"guardDuringWait","defense"),
    guardCaptureDuringWait:countType(episodes,"guardDuringWait","capture"),
    guardCombatNext12:countType(episodes,"guardNext12","combat"),
    guardDefenseNext12:countType(episodes,"guardNext12","defense"),
    guardCaptureNext12:countType(episodes,"guardNext12","capture"),
    v7CombatNext12:countType(episodes,"v7Next12","combat"),
    v7DefenseNext12:countType(episodes,"v7Next12","defense"),
    v7CaptureNext12:countType(episodes,"v7Next12","capture"),
    v7Deployed:sum(rows,r=>r.events.deployed),
    v7Aborted:sum(rows,r=>r.events.aborted),
    reasons:Object.fromEntries(["defense","expired","lostWindow","valueLost"].map(k=>
     [k,sum(rows,r=>r.events.reasons[k]||0)]))},
   interpretation:[
    "Baseline legal actions within the wait window are observed counterfactual purchases, not guaranteed causal lost damage.",
    "Only episodes with identical prior action ledgers are clean first-branch comparisons; world geometry is not asserted identical.",
    "Actions in a 12 second window may include later reactive actions; do not add overlapping windows as independent trials.",
    "Seeds are research-used. Do not use these outcomes as a new holdout or tune thresholds on them.",
    "No character stats, hand/queue, tactical policy, networking, or production source is changed."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(out,"episodes.json"),JSON.stringify(episodes,null,2));
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  console.log("CASTLE BUDGET OPPORTUNITY SUMMARY",JSON.stringify(report));
  console.log("CASTLE BUDGET EPISODES",JSON.stringify(episodes.map(e=>({
   seed:e.seed,team:e.team,style:e.style,cadence:e.cadence,start:e.start,
   waitTo4:e.waitTo4,matched:e.sameActionsBeforeStart,
   guardDuringWait:e.guardDuringWait,v7DuringWait:e.v7DuringWait,
   guardNext12:e.guardNext12,v7Next12:e.v7Next12
  }))));
 }finally{if(browser)await browser.close();await new Promise(ok=>srv.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
