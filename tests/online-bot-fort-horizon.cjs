"use strict";
// Real 30Hz complete battles, including opponent's legal summons.
// 15/30/60/90s tactical episodes are observational, not causal comparisons.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-trade-horizon";fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(file).pipe(res);
});
const seeds=[17,41,73,101,131,163],sides=[1,2],
 styles=["self","rush","balanced","fortress","banker"],
 variants=["baseline","fortTradeReclaim","fortDefenseValue"];
const score=(g,t)=>g.winner===0?.5:g.winner===t?1:0;
const sum=(a,f)=>a.reduce((n,x)=>n+f(x),0);
const avg=(a,f)=>a.length?sum(a,f)/a.length:null;
const metric=(rows)=>{
 const eps=rows.flatMap(r=>r.episodes),e15=eps.filter(e=>e.castleDamage15!==null),
  e30=eps.filter(e=>e.castleDamage30!==null),
  e60=eps.filter(e=>e.castleDamage60!==null),
  e90=eps.filter(e=>e.castleDamage90!==null);
 const median=(a,f)=>{if(!a.length)return null;const z=a.map(f).sort((a,b)=>a-b);return z[Math.floor(z.length/2)]};
 const delta=(a,b,f)=>avg(rows,r=>f(r[a])-f(r[b]));
 return {matches:rows.length,episodes:eps.length,complete15:e15.length,complete30:e30.length,
  complete60:e60.length,complete90:e90.length,
  reserveSentinel:eps.filter(e=>e.reserve==="sentinel").length,
  reserveEngineer:eps.filter(e=>e.reserve==="engineer").length,
  meanOwnCastleLoss15:avg(e15,e=>e.castleDamage15),
  meanOwnCastleLoss30:avg(e30,e=>e.castleDamage30),
  meanOwnCastleLoss60:avg(e60,e=>e.castleDamage60),
  meanOwnCastleLoss90:avg(e90,e=>e.castleDamage90),
  meanEnemyCastleLoss15:avg(e15,e=>e.enemyCastleDamage15),
  meanEnemyCastleLoss30:avg(e30,e=>e.enemyCastleDamage30),
  meanEnemyCastleLoss60:avg(e60,e=>e.enemyCastleDamage60),
  meanEnemyCastleLoss90:avg(e90,e=>e.enemyCastleDamage90),
  meanFortControl15:avg(e15,e=>e.fortControl15),
  meanFortControl30:avg(e30,e=>e.fortControl30),
  meanFortControl60:avg(e60,e=>e.fortControl60),
  meanFortControl90:avg(e90,e=>e.fortControl90),
  lostWithin30:e30.filter(e=>e.firstLoss!==null).length,
  regainedWithin30:e30.filter(e=>e.firstRecapture!==null&&e.firstRecapture<=30).length,
  regainedWithin60:e60.filter(e=>e.firstRecapture!==null&&e.firstRecapture<=60).length,
  regainedWithin90:e90.filter(e=>e.firstRecapture!==null&&e.firstRecapture<=90).length,
  ownedAt60:e60.filter(e=>e.ownedAt60).length,
  ownedAt90:e90.filter(e=>e.ownedAt90).length,
  avgFrontline60:avg(e60,e=>e.fortFrontier60),
  avgFrontline90:avg(e90,e=>e.fortFrontier90),
  meanEnemyPlays15:avg(e15,e=>e.enemyPlays15),
  meanEnemyPlays30:avg(e30,e=>e.enemyPlays30),
  meanEnemyPlays60:avg(e60,e=>e.enemyPlays60),
  meanEnemyPlays90:avg(e90,e=>e.enemyPlays90),
  meanEnemySpend15:avg(e15,e=>e.enemySpend15),
  meanEnemySpend30:avg(e30,e=>e.enemySpend30),
  meanEnemySpend60:avg(e60,e=>e.enemySpend60),
  meanEnemySpend90:avg(e90,e=>e.enemySpend90),
  reinforced15:e15.filter(e=>e.enemyPlays15>0).length,
  reinforced30:e30.filter(e=>e.enemyPlays30>0).length,
  reinforced60:e60.filter(e=>e.enemyPlays60>0).length,
  reinforced90:e90.filter(e=>e.enemyPlays90>0).length,
  withReinforcementsDamage30:avg(e30.filter(e=>e.enemyPlays30>0),e=>e.castleDamage30),
  withoutReinforcementsDamage30:avg(e30.filter(e=>e.enemyPlays30===0),e=>e.castleDamage30),
  medianStartingEnergy:median(eps,e=>e.energyStart),
  winDeltaValueVsTrade:sum(rows,r=>score(r.value,r.team)-score(r.trade,r.team)),
  winsValueVsTrade:rows.filter(r=>score(r.value,r.team)>score(r.trade,r.team)).length,
  lossesValueVsTrade:rows.filter(r=>score(r.value,r.team)<score(r.trade,r.team)).length,
  winDeltaValueVsBaseline:sum(rows,r=>score(r.value,r.team)-score(r.base,r.team)),
  ownHpDiffValueTrade:avg(rows,r=>r.value.castleHp[r.team]-r.trade.castleHp[r.team]),
  enemyDamageDiffValueTrade:avg(rows,r=>r.value.damage[3-r.team]-r.trade.damage[3-r.team]),
  fortTimeDiffValueTrade:avg(rows,r=>r.value.fortSeconds[r.team]-r.trade.fortSeconds[r.team])
 };
};

const raceOutcome=(ep,g)=>{
 const duration=Math.max(0,g.elapsed-ep.start),ended=duration<90-1e-4,
  observed=Math.min(90,duration);
 if(ep.firstLoss===null||ep.firstLoss>observed+1e-3)
  return ended?"endedBeforeFortLoss":"fortNeverLost90";
 if(ep.firstRecapture!==null&&ep.firstRecapture<=observed+1e-3)
  return "recapturedBefore90";
 if(!ended)return "stillLost90";
 return g.winner===ep.team?"wonBeforeRecapture":
  g.winner===3-ep.team?"lostBeforeRecapture":"drewBeforeRecapture";
};
const raceLabels=["endedBeforeFortLoss","fortNeverLost90","recapturedBefore90",
 "stillLost90","wonBeforeRecapture","lostBeforeRecapture","drewBeforeRecapture"];
const raceSummary=(rows)=>{
 const all=which=>rows.flatMap(r=>r[which+"Episodes"].map(ep=>({ep,g:r[which]})));
 const group=entries=>{
  const states=Object.fromEntries(raceLabels.map(k=>[k,0]));
  entries.forEach(({ep,g})=>states[raceOutcome(ep,g)]++);
  const engineers=entries.filter(({ep})=>ep.reserve==="engineer");
  const possible=engineers.filter(({ep})=>ep.engineerRecaptureFloorSeconds<=90&&
   ep.engineerRecaptureFloorSeconds<=ep.timeLeftAtPlanSeconds);
  const threatBefore=engineers.filter(({ep})=>ep.visibleHostileCastleEtaSeconds!==null&&
   ep.visibleHostileCastleEtaSeconds<ep.engineerRecaptureFloorSeconds);
  return {episodes:entries.length,fortLost:entries.filter(({ep})=>ep.firstLoss!==null).length,
   states,engineerPlans:engineers.length,optimisticEngineerFloorFits90AndClock:possible.length,
   visibleCastleThreatSoonerThanEngineerFloor:threatBefore.length,
   meanEngineerFloorSeconds:avg(engineers,({ep})=>ep.engineerRecaptureFloorSeconds),
   meanTimeLeftAtPlan:avg(entries,({ep})=>ep.timeLeftAtPlanSeconds)};
 };
 const pairs=[];
 for(const r of rows){
  const taken=new Set();
  for(const t of r.tradeEpisodes){
   const i=r.valueEpisodes.findIndex((v,j)=>!taken.has(j)&&v.fortIndex===t.fortIndex&&
    Math.abs(v.start-t.start)<=.25);
   if(i<0)continue;
   taken.add(i);
   const v=r.valueEpisodes[i];
   pairs.push({seed:r.seed,team:r.team,fortIndex:t.fortIndex,
    startDifferenceSeconds:+Math.abs(v.start-t.start).toFixed(3),
    engineerPolicyOutcome:raceOutcome(t,r.trade),
    defensePolicyOutcome:raceOutcome(v,r.value),
    engineerReserve:t.reserve,defenseReserve:v.reserve});
  }
 }
 const trade=all("trade"),value=all("value");
 return {kind:"Competing match-end versus fort recapture, descriptive known-seed episodes",
  horizonSeconds:90,matchedFullGames:rows.length,byVariant:{
   fortTradeReclaim:group(trade),fortDefenseValue:group(value)},
  matchedPlanStarts:pairs.length,unmatchedEngineerPlans:trade.length-pairs.length,
  unmatchedDefensePlans:value.length-pairs.length,
  differentPairedOutcomeCategories:pairs.filter(p=>p.engineerPolicyOutcome!==p.defensePolicyOutcome).length,
  pairedEpisodes:pairs,
  caveats:["A match ending before 90 seconds is a competing event, not random censoring.",
   "Fort never lost is distinct from lost then recaptured.",
   "First recapture does not guarantee retention through 90 seconds.",
   "Engineer ETA is an optimistic no-opposition floor and is not observed success.",
   "Plan episodes are endogenous, matched starts are not randomized comparisons.",
   "Previously explored six seeds only; unused holdouts remain untouched."]};
};
// Pure-data edge cases, verified before launching the 360-match browser audit.
{
 const ep={start:100,team:2,firstLoss:5,firstRecapture:null};
 const g=(elapsed,winner)=>({elapsed,winner});
 assert.equal(raceOutcome(ep,g(120,1)),"lostBeforeRecapture");
 assert.equal(raceOutcome(ep,g(120,2)),"wonBeforeRecapture");
 assert.equal(raceOutcome(ep,g(120,0)),"drewBeforeRecapture");
 assert.equal(raceOutcome(ep,g(195,1)),"stillLost90");
 assert.equal(raceOutcome({...ep,firstRecapture:70},g(175,1)),"recapturedBefore90");
 assert.equal(raceOutcome({...ep,firstLoss:null},g(195,1)),"fortNeverLost90");
 assert.equal(raceOutcome({...ep,firstLoss:null},g(130,1)),"endedBeforeFortLoss");
 assert.equal(raceOutcome({...ep,firstLoss:110},g(200,1)),"fortNeverLost90");
 assert.equal(raceOutcome({...ep,firstLoss:110},g(160,1)),"endedBeforeFortLoss");
 assert.equal(raceOutcome({...ep,firstRecapture:100},g(195,1)),"stillLost90");
 assert.equal(raceOutcome({...ep,firstRecapture:80},g(140,1)),"lostBeforeRecapture");
}


// Comparison is descriptive. End-of-match labels are NEVER inputs to the game policy.
const pressureAudit=rows=>{
 const byVariant={},episodes=[];
 for(const [key,name] of [["trade","fortTradeReclaim"],["value","fortDefenseValue"]]){
  const items=rows.flatMap(r=>r[key+"Episodes"].map(ep=>({
   team:r.team,seed:r.seed,style:r.style,fortIndex:ep.fortIndex,start:ep.start,
   hpLead:ep.castleHpLeadAtPlan,
   ownHp:ep.castleHpStart,enemyHp:ep.enemyCastleHpStart,
   ownPressure:ep.alliedPressureAtEnemyCastle,
   enemyPressure:ep.hostilePressureAtOwnCastle,
   allies:ep.alliesAtPlan,hostiles:ep.hostilesAtPlan,
   allyWallDistance:ep.nearestAlliedToEnemyWall,
   hostileWallDistance:ep.nearestHostileToOwnWall,
   reserve:ep.reserve,
   outcome:raceOutcome(ep,r[key])
  })));
  episodes.push(...items.map(x=>({...x,variant:name})));
  const summary=a=>({
   count:a.length,
   meanHpLead:avg(a,x=>x.hpLead),
   allyPressurePresent:a.filter(x=>x.ownPressure>0).length,
   hostilePressurePresent:a.filter(x=>x.enemyPressure>0).length,
   bothSidesPressure:a.filter(x=>x.ownPressure>0&&x.enemyPressure>0).length,
   ownHpLead:a.filter(x=>x.hpLead>0).length
  });
  byVariant[name]={overall:summary(items),byOutcome:Object.fromEntries(
   raceLabels.map(label=>[label,summary(items.filter(x=>x.outcome===label))]))};
 }
 const pairs=rows.flatMap(r=>r.tradeEpisodes.flatMap(t=>{
  const v=r.valueEpisodes.find(x=>x.fortIndex===t.fortIndex&&Math.abs(x.start-t.start)<.25);
  if(!v)return [];
  return [{team:r.team,seed:r.seed,fort:t.fortIndex,start:t.start,
   sameHpLead:t.castleHpLeadAtPlan===v.castleHpLeadAtPlan,
   samePressure:t.alliedPressureAtEnemyCastle===v.alliedPressureAtEnemyCastle&&
    t.hostilePressureAtOwnCastle===v.hostilePressureAtOwnCastle,
   tradeOutcome:raceOutcome(t,r.trade),valueOutcome:raceOutcome(v,r.value)}];
 }));
 return {purpose:"Pre-decision observable castle pressure, not a causal estimator",
  distinctMatchedPlans:pairs.length,byVariant,pairedPlans:pairs,episodes,
  cautions:["Outcome labels are assigned only after each game ends and never affect BOT play.",
   "Two policies can log the same world state, so 44 records are not 44 independent situations.",
   "Presence within 300px is a descriptive pressure proxy, not a predicted win.",
   "No policy is selected or optimized using this small known-seed sample.",
   "All results use the existing six research seeds, not holdouts."]};
};

(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8835,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8835/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(q,v)=>page.evaluate(x=>window.__shokokuQa.runDuel(x.seed,x.style,"hard",
   x.team,x.cadence,x.mirror,x.variant==="baseline"?0:x.team,x.variant),{...q,variant:v});
  const rows=[];
  for(const seed of seeds)for(const team of sides)for(const style of styles){
   const settings=style==="self"?
    [{mirror:false,cadence:"standard"},{mirror:true,cadence:"standard"}]:
    [{mirror:false,cadence:"standard"},{mirror:false,cadence:"fast"}];
   for(const s of settings){
    const q={seed,team,style,...s};
    const base=await run(q,"baseline"),trade=await run(q,"fortTradeReclaim"),
     value=await run(q,"fortDefenseValue");
    for(const g of [base,trade,value]){
     assert.ok(g?.finished&&Array.isArray(g.counterEpisodes),
      "real 30Hz match and episode instrument must finish");
     assert.ok(Math.abs(g.energyActual[team]-g.energyEstimated[team])<1e-6);
    }
    assert.deepEqual(base.initialHand,trade.initialHand);
    assert.deepEqual(base.openingQueue,trade.openingQueue);
    assert.deepEqual(base.initialHand,value.initialHand);
    assert.deepEqual(base.openingQueue,value.openingQueue);
    assert.equal(base.counterEpisodes.length,0,"regular BOT never silently creates concession plans");
    for(const g of [trade,value])for(const e of g.counterEpisodes){
     assert.equal(e.team,team);
     assert.ok(e.start>=20&&e.start<=235);
     assert.ok(e.energyStart>=2&&e.energyStart<4);
     assert.ok(e.waitForFourSeconds>=0&&e.waitForFourSeconds<=8);
     assert.ok(e.engineerTravelFloorSeconds>=0);
     assert.ok(e.engineerCaptureFloorSeconds>=0);
     assert.ok(e.engineerRecaptureFloorSeconds>=e.waitForFourSeconds+
      e.engineerCaptureFloorSeconds-.002);
     assert.ok(e.timeLeftAtPlanSeconds>=0&&e.timeLeftAtPlanSeconds<=300);
     assert.equal(e.castleHpLeadAtPlan,e.castleHpStart-e.enemyCastleHpStart);
     assert.ok(Number.isInteger(e.alliedPressureAtEnemyCastle));
     assert.ok(Number.isInteger(e.hostilePressureAtOwnCastle));
     assert.ok(e.alliedPressureAtEnemyCastle>=0&&e.alliedPressureAtEnemyCastle<=e.alliesAtPlan);
     assert.ok(e.hostilePressureAtOwnCastle>=0&&e.hostilePressureAtOwnCastle<=e.hostilesAtPlan);
     assert.ok(e.nearestAlliedToEnemyWall===null||e.nearestAlliedToEnemyWall>=0);
     assert.ok(e.nearestHostileToOwnWall===null||e.nearestHostileToOwnWall>=0);
     assert.ok(e.fortControl15>=0&&e.fortControl15<=15.1);
     assert.ok(e.fortControl30>=0&&e.fortControl30<=30.1);
     assert.ok(e.fortControl60>=0&&e.fortControl60<=60.1);
     assert.ok(e.fortControl90>=0&&e.fortControl90<=90.1);
     assert.ok(e.castleDamage15===null||e.castleDamage15>=0);
     assert.ok(e.castleDamage30===null||e.castleDamage30>=0);
     assert.ok(e.firstRecapture===null||e.firstLoss!==null);
     if(e.castleDamage30!==null){
      assert.ok(e.castleDamage15!==null,"30 sec requires a completed 15 sec");
      assert.ok(e.enemyPlays30>=e.enemyPlays15);
      assert.ok(e.enemySpend30>=e.enemySpend15);
      assert.ok(e.castleDamage30>=e.castleDamage15);
     }
     if(e.castleDamage60!==null){
      assert.ok(e.castleDamage30!==null,"60sec requires 30sec");
      assert.ok(e.enemyPlays60>=e.enemyPlays30);
      assert.ok(e.enemySpend60>=e.enemySpend30);
      assert.ok(e.castleDamage60>=e.castleDamage30);
     }
     if(e.castleDamage90!==null){
      assert.ok(e.castleDamage60!==null,"90sec requires 60sec");
      assert.ok(e.enemyPlays90>=e.enemyPlays60);
      assert.ok(e.enemySpend90>=e.enemySpend60);
      assert.ok(e.castleDamage90>=e.castleDamage60);
     }
    }
    rows.push({...q,
     base:{winner:base.winner,elapsed:base.elapsed,castleHp:base.castleHp,damage:base.damage,fortSeconds:base.fortSeconds},
     trade:{winner:trade.winner,elapsed:trade.elapsed,castleHp:trade.castleHp,damage:trade.damage,
      fortSeconds:trade.fortSeconds},
     value:{winner:value.winner,elapsed:value.elapsed,castleHp:value.castleHp,damage:value.damage,
      fortSeconds:value.fortSeconds},
     episodes:[...trade.counterEpisodes,...value.counterEpisodes],
     tradeEpisodes:trade.counterEpisodes,valueEpisodes:value.counterEpisodes});
   }
  }
  assert.equal(rows.length,120);
  assert.deepEqual(errors,[]);
  const data=rows.flatMap(r=>r.episodes.map(e=>({...e,seed:r.seed,team:r.team,
   style:r.style,cadence:r.cadence,mirror:r.mirror})));
  const report={kind:"Observed matched full-duel fort-trade 15/30-second outcomes with actual opponent spawns",
   seeds,pairedCases:120,fullGames:360,episodes:data.length,variants,
   overall:metric(rows),
   byVariant:Object.fromEntries(variants.slice(1).map(v=>[v,
    metric(rows.map(r=>({...r,episodes:r[v==="fortDefenseValue"?"valueEpisodes":"tradeEpisodes"]})))])),
   byTeam:Object.fromEntries(sides.map(t=>[t,metric(rows.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,metric(rows.filter(r=>r.style===s))])),
   byReserve:Object.fromEntries(["engineer","sentinel"].map(k=>[k,
    metric(rows.map(r=>({...r,episodes:r.episodes.filter(e=>e.reserve===k)})))])),
   caveats:["Opponent actions are real in-game plays, including both scripted and hard-BOT reinforcement.",
    "Episodes are endogenous decisions; compare 15/30s observations descriptively, NOT as if randomized.",
    "Truncated horizons are excluded separately for each endpoint.",
    "Matched full-game results are paired by exact seed, team, opponent style and cadence.",
    "All six seeds were previously explored; independent holdout untouched.",
    "Primary objective is castle survival, followed by actionable fort control and attack tempo.",
    "No change was made to the live standard BOT, combat rules, or main branch."]};
  const pressure=pressureAudit(rows);
  fs.writeFileSync(path.join(out,"pressure-audit.json"),JSON.stringify(pressure,null,2));
  console.log("FORT PRESSURE AUDIT",JSON.stringify({...pressure,episodes:"in artifact",pairedPlans:"in artifact"}));
  const race=raceSummary(rows);
  fs.writeFileSync(path.join(out,"recapture-race.json"),JSON.stringify(race,null,2));
  console.log("FORT RECAPTURE RACE",JSON.stringify({...race,pairedEpisodes:"in artifact"}));
  fs.writeFileSync(path.join(out,"episodes.json"),JSON.stringify(data,null,2));
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("FORT HORIZON SUMMARY",JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});