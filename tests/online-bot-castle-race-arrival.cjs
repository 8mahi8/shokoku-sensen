"use strict";
// Real 30Hz complete game comparisons, used known seeds only.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-castle-race-arrival";
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const filename=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",filename.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(filename).pipe(res);
});
const seeds=[17,41,73,101,131,163],teams=[1,2],
 styles=["self","rush","balanced","fortress","banker"];
const score=(g,team)=>g.winner===0?.5:g.winner===team?1:0;
const sum=(a,f)=>a.reduce((x,y)=>x+f(y),0);
const avg=(a,f)=>a.length?sum(a,f)/a.length:null;
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8853,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8853/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const fixture={difficulty:"hard",elapsed:120,energy:7,enemyEnergy:7,
   hand:["tank","sentinel","drone","engineer"],fortOwners:[2,2,2],
   castleHp:[null,420,1200],raceWindow:{ownLoss:200,enemyLoss:400},
   allies:[{key:"tank",x:180,y:327}],
   enemies:[{key:"scout",x:1095,y:327},{key:"scout",x:1110,y:327}]};
  const scene=(variant,changes={})=>page.evaluate(({variant,spec})=>{
   if(!window.__shokokuQa.setBotScenario({...spec,variant}))throw Error("scene rejected");
   return window.__shokokuQa.runBotOnce();
  },{variant,spec:{...fixture,...changes}});
  const oldAhead=await scene("castleDamageRace"),arriveAhead=await scene("castleRaceArrival"),
   arriveLate=await scene("castleRaceArrival",{fortOwners:[0,0,2]}),
   arriveLose=await scene("castleRaceArrival",{castleHp:[null,1600,300],
    raceWindow:{ownLoss:300,enemyLoss:110}}),
   arriveNoHistory=await scene("castleRaceArrival",{raceWindow:null}),
   arriveNoPressure=await scene("castleRaceArrival",{allies:[]}),
   defense=await scene("fortDefenseValue");
  assert.equal(oldAhead.action?.id,"tank","original trial buys tank without arrival ETA");
  assert.equal(arriveAhead.action?.id,"drone","timely unit preferred over late tank");
  assert.equal(arriveLate.action?.id,"sentinel","late unit leaves defense active");
  assert.equal(arriveLose.action?.id,"sentinel","losing damage race defends");
  assert.equal(arriveNoHistory.action?.id,"sentinel","no data means no race override");
  assert.equal(arriveNoPressure.action?.id,"sentinel","no ongoing attacker means no race override");
  assert.equal(defense.action?.id,"sentinel","existing defender intact");
  const run=(q,variant)=>page.evaluate(s=>window.__shokokuQa.runDuel(
   s.seed,s.style,"hard",s.team,s.cadence,s.mirror,s.variant==="baseline"?0:s.team,s.variant),
   {...q,variant});
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles){
   const scenarios=style==="self"?[{mirror:false,cadence:"standard"},
    {mirror:true,cadence:"standard"}]:[{mirror:false,cadence:"standard"},
    {mirror:false,cadence:"fast"}];
   for(const scenario of scenarios){
    const q={seed,team,style,...scenario};
    const guard=await run(q,"fortDefenseValue"),
     old=await run(q,"castleDamageRace"),arrival=await run(q,"castleRaceArrival");
    for(const g of [guard,old,arrival]){
     assert.ok(g&&g.finished&&g.elapsed>0,"complete 30Hz game required");
     assert.ok(Math.abs(g.energyActual[team]-g.energyEstimated[team])<1e-6);
    }
    assert.deepEqual(guard.initialHand,arrival.initialHand);
    assert.deepEqual(old.openingQueue,arrival.openingQueue);
    const events=arrival.decisionEvents[team];
    assert.ok((events.raceChecks||0)>0);
    assert.ok((events.raceQualified||0)>=(events.raceArrivalEvaluated||0));
    assert.ok((events.raceArrivalEvaluated||0)>=(events.raceArrivalDeployed||0));
    assert.equal(events.raceBanked||0,0);
    assert.equal((events.raceArrivalMissingHand||0)+(events.raceArrivalUnderfunded||0),
     events.raceArrivalNoAffordable||0);
    assert.equal(Object.values(events.raceArrivalEnergyBuckets||{}).reduce((a,b)=>a+b,0),
     events.raceArrivalEvaluated||0);
    assert.equal(events.raceOffense||0,events.raceArrivalDeployed||0);
    const compact=g=>({winner:g.winner,castleHp:g.castleHp,
     damage:g.damage,fortSeconds:g.fortSeconds,spent:g.spent});
    rows.push({...q,guard:compact(guard),old:compact(old),arrival:compact(arrival),
     events:{qualified:events.raceQualified||0,
      timelyPlays:events.raceArrivalDeployed||0,
      defenseFallback:events.raceArrivalFallback||0,
      noAffordable:events.raceArrivalNoAffordable||0,
      tooLate:events.raceArrivalTooLate||0,
      weakFront:events.raceArrivalWeakFront||0,
      missingHand:events.raceArrivalMissingHand||0,
      underfunded:events.raceArrivalUnderfunded||0,
      infantryAffordable:events.raceArrivalInfantryAffordable||0,
      energyBuckets:events.raceArrivalEnergyBuckets||{},
      examples:events.raceArrivalSamples||[]}});
   }
  }
  assert.deepEqual(errors,[]);
  assert.equal(rows.length,120);
  const summarize=a=>({
   conditions:a.length,betterThanDefense:a.filter(r=>score(r.arrival,r.team)>score(r.guard,r.team)).length,
   worseThanDefense:a.filter(r=>score(r.arrival,r.team)<score(r.guard,r.team)).length,
   betterThanPrevious:a.filter(r=>score(r.arrival,r.team)>score(r.old,r.team)).length,
   worseThanPrevious:a.filter(r=>score(r.arrival,r.team)<score(r.old,r.team)).length,
   scoreDeltaVsDefense:sum(a,r=>score(r.arrival,r.team)-score(r.guard,r.team)),
   scoreDeltaVsPrevious:sum(a,r=>score(r.arrival,r.team)-score(r.old,r.team)),
   ownHpDeltaVsDefense:avg(a,r=>r.arrival.castleHp[r.team]-r.guard.castleHp[r.team]),
   enemyCastleDamageDelta:avg(a,r=>r.arrival.damage[3-r.team]-r.guard.damage[3-r.team]),
   fortControlSecondsDelta:avg(a,r=>r.arrival.fortSeconds[r.team]-r.guard.fortSeconds[r.team]),
   totalQualifiedDecisions:sum(a,r=>r.events.qualified),
   timelyReinforcementPlays:sum(a,r=>r.events.timelyPlays),
   fallsBackToDefense:sum(a,r=>r.events.defenseFallback),
   lateOffers:sum(a,r=>r.events.tooLate),
   weakFront:sum(a,r=>r.events.weakFront),
   noAffordable:sum(a,r=>r.events.noAffordable),
   missingHand:sum(a,r=>r.events.missingHand),
   underfunded:sum(a,r=>r.events.underfunded),
   infantryAffordable:sum(a,r=>r.events.infantryAffordable),
   energyBuckets:Object.fromEntries(["under2","2to4","4to7","7plus"].map(key=>
    [key,sum(a,r=>r.events.energyBuckets[key]||0)])),
   gamesWithQualifiedRace:a.filter(r=>r.events.qualified>0).length
  });
  const report={kind:"QA arrival aware castle race versus older damage race and fort defense",
   seedScope:"previously explored only",seeds,fullGames:360,matchedConditions:120,
   fixedScenes:{oldAhead:oldAhead.action?.id,arrivalAhead:arriveAhead.action?.id,
    arrivalLate:arriveLate.action?.id,arrivalLosing:arriveLose.action?.id,
    noHistory:arriveNoHistory.action?.id,noPressure:arriveNoPressure.action?.id,
    defense:defense.action?.id},
   overall:summarize(rows),
   byTeam:Object.fromEntries(teams.map(t=>[t,summarize(rows.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(x=>[x,summarize(rows.filter(r=>r.style===x))])),
   caveats:["Optimistic travel ETA assumes no combat and is not a win prediction.",
    "Race history uses only actual earlier castle hits and current visible units.",
    "All six seeds are explored; independent holdouts untouched.",
    "Neither QA policy is promoted to regular BOT or main."]};
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("CASTLE RACE ARRIVAL SUMMARY",JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});