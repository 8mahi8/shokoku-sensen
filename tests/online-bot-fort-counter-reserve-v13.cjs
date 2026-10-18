"use strict";
// QA-only V13. All modifications are injected into localhost served source.
// Every match uses the same 30Hz game tick, card limits and deployment rules.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-fort-counter-reserve-v13";
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 hook=fs.readFileSync(path.join(root,"tests/online-bot-fort-counter-reserve-v13.inc.js"),"utf8"),
 anchor=" if(urgent&&!concessionHold){",
 whitelist='"castleRaceChoice"].includes(variant)';
assert.equal(source.split(anchor).length,2);
assert.equal(source.split(whitelist).length,2);
const patched=source.replace(anchor,"\n"+hook+"\n"+anchor)
 .replace(whitelist,'"castleRaceChoice","fortCounterReserve13"].includes(variant)');
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(p).pipe(res);
});
const avg=(xs,f)=>xs.reduce((s,x)=>s+f(x),0)/(xs.length||1);
const result=(g,team)=>g.winner===0?.5:g.winner===team?1:0;
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8911,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8911/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const fixed={
   difficulty:"hard",elapsed:82,energy:3.5,enemyEnergy:6,
   hand:["sentinel","archer","scout","tank"],fortOwners:[2,0,2],
   enemies:[{key:"engineer",x:815,y:205}],allies:[]
  };
  const setup=async(variant,updates)=>page.evaluate(({variant,spec,updates})=>{
   const q=window.__shokokuQa;
   if(!q.setBotScenario({...spec,variant}))throw Error("bad fixed scenario");
   const first=q.runBotOnce();
   if(updates){
    if(!q.progressBotScenario(updates))throw Error("bad timed resource update");
    return {first,second:q.runBotOnce()};
   }
   return {first};
  },{variant,spec:fixed,updates});
  const fallback=await setup("baseline");
  const candidate=await setup("fortCounterReserve13");
  // The actual 4-cost counter is unaffordable at 3.5 energy: candidate
  // must save, whereas baseline may use its ready archer/infantry.
  assert.equal(candidate.first.action,null,"candidate must save current energy");
  assert.equal(candidate.first.remaining,3.5);
  const firstBase=fallback.first.action?.id??null;
  assert.ok(firstBase!==null,"baseline must spend immediately to compare");
  const funded=await setup("fortCounterReserve13",
   {elapsed:84,energy:4.5,fortOwners:[2,0,2]});
  assert.equal(funded.first.action,null);
  assert.equal(funded.second.action?.id,"sentinel",
   "the saved four resources must be usable for real guard counter");
  const mustDefend=await setup("fortCounterReserve13");
  assert.ok(mustDefend.first.acted===true);
  const fixedResult={baseline:firstBase,candidate:candidate.first.action?.id??null,
   counterAfterRecovery:funded.second.action?.id??null};
  const seeds=[17,41,73,101,131,163],teams=[1,2],
   styles=["self","rush","balanced","fortress","banker"],rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles){
   const settings=style==="self"?
    [{cadence:"standard",mirror:false},{cadence:"standard",mirror:true}]:
    [{cadence:"standard",mirror:false},{cadence:"fast",mirror:false}];
   for(const setup of settings){
    const q={seed,team,style,...setup};
    const run=variant=>page.evaluate(x=>window.__shokokuQa.runDuel(
     x.seed,x.style,"hard",x.team,x.cadence,x.mirror,x.team,x.variant),{...q,variant});
    const baseline=await run("baseline");
    const candidate=await run("fortCounterReserve13");
    assert.ok(baseline?.finished&&candidate?.finished,
     "complete real 30Hz games required");
    assert.deepEqual(baseline.initialHand,candidate.initialHand);
    assert.deepEqual(baseline.openingQueue,candidate.openingQueue);
    assert.ok(Math.abs(candidate.energyActual[team]-candidate.energyEstimated[team])<1e-6);
    assert.ok(Math.abs(baseline.energyActual[team]-baseline.energyEstimated[team])<1e-6);
    const events=candidate.decisionEvents[team];
    rows.push({...q,
     delta:result(candidate,team)-result(baseline,team),
     baseline:{winner:baseline.winner,ownHp:baseline.castleHp[team],
      enemyDamage:baseline.damage[3-team],fortSeconds:baseline.fortSeconds[team],
      spent:baseline.spent[team],cards:baseline.cards[team]},
     candidate:{winner:candidate.winner,ownHp:candidate.castleHp[team],
      enemyDamage:candidate.damage[3-team],fortSeconds:candidate.fortSeconds[team],
      spent:candidate.spent[team],cards:candidate.cards[team]},
     episodes:events.v13Held??0,
     checked:events.v13Checked??0,
     samples:events.v13Examples??[]});
   }
  }
  assert.equal(rows.length,120);assert.deepEqual(errors,[]);
  const metrics=xs=>({
   paired:xs.length,better:xs.filter(x=>x.delta>0).length,
   worse:xs.filter(x=>x.delta<0).length,
   tied:xs.filter(x=>x.delta===0).length,
   scoreChange:+xs.reduce((s,x)=>s+x.delta,0).toFixed(3),
   averageOwnHp:+avg(xs,x=>x.candidate.ownHp-x.baseline.ownHp).toFixed(2),
   averageEnemyDamage:+avg(xs,x=>x.candidate.enemyDamage-x.baseline.enemyDamage).toFixed(2),
   averageFortSeconds:+avg(xs,x=>x.candidate.fortSeconds-x.baseline.fortSeconds).toFixed(2),
   averageSpend:+avg(xs,x=>x.candidate.spent-x.baseline.spent).toFixed(3),
   considered:xs.reduce((s,x)=>s+x.checked,0),
   heldDecisions:xs.reduce((s,x)=>s+x.episodes,0),
   changedOutcomes:xs.filter(x=>JSON.stringify(x.baseline)!==JSON.stringify(x.candidate)).length
  });
  const summary={kind:"V13 4-resource counter hold, real full-game comparison",
   source:"QA-only script injection, original game/assets unchanged",
   fixedResult,seeds,metrics:metrics(rows),
   byStyle:Object.fromEntries(styles.map(style=>[style,metrics(rows.filter(x=>x.style===style))])),
   byTeam:Object.fromEntries(teams.map(team=>[team,metrics(rows.filter(x=>x.team===team))])),
   examples:rows.filter(x=>x.episodes>0).slice(0,20).map(x=>({
    seed:x.seed,team:x.team,style:x.style,events:x.episodes,delta:x.delta,
    samples:x.samples.slice(0,5)
   })),
   acceptanceRule:{changedMatchAtLeast:4,betterMustExceedWorse:true,
    bothTeamsNonNegative:true,noMajorOwnHpLoss:true},
   conclusion:"Research evidence only. No production promotion even if threshold passes until new independent seed test."};
  summary.passesResearchGate=summary.metrics.changedOutcomes>=4&&
   summary.metrics.better>summary.metrics.worse&&
   Object.values(summary.byTeam).every(x=>x.scoreChange>=0)&&
   summary.metrics.averageOwnHp>=-20;
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  console.log("FORT COUNTER V13 SUMMARY",JSON.stringify(summary));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
