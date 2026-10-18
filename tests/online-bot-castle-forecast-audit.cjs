"use strict";
// Observational audit only: compare forecasts at time t with hits from
// those same UIDs during [t,t+12]. Verify accounting does not change outcomes.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-castle-forecast-audit";
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(file).pipe(res);
});
const seeds=[17,41,73,101,131,163],teams=[1,2],
 styles=["self","rush","balanced","fortress","banker"];
const sum=(a,f)=>a.reduce((n,x)=>n+f(x),0),
 avg=(a,f)=>a.length?sum(a,f)/a.length:null,
 metrics=g=>({winner:g.winner,elapsed:g.elapsed,castleHp:g.castleHp,
  damage:g.damage,actions:g.actions,spent:g.spent,cards:g.cards,
  fortSeconds:g.fortSeconds,initialHand:g.initialHand,openingQueue:g.openingQueue});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8867,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8867/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(q,audit)=>page.evaluate(s=>window.__shokokuQa.runDuel(s.seed,s.style,
   "hard",s.team,s.cadence,s.mirror,s.team,"fortDefenseValue",s.audit),{...q,audit});
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles){
   const variants=style==="self"?[{mirror:false,cadence:"standard"},
    {mirror:true,cadence:"standard"}]:[{mirror:false,cadence:"standard"},
    {mirror:false,cadence:"fast"}];
   for(const q0 of variants){
    const q={seed,team,style,...q0};
    const plain=await run(q,false),audited=await run(q,true);
    assert.deepEqual(metrics(audited),metrics(plain),
     "read-only attribution must not change actions, winners, resource spend or match clock");
    assert.equal(plain.forecastAudit,null);
    assert.ok(Array.isArray(audited.forecastAudit));
    assert.ok(audited.forecastAudit.length>0);
    for(const w of audited.forecastAudit){
     assert.ok(w.observedSeconds>=0&&w.observedSeconds<=12+.01);
     assert.ok(w.predicted>=0&&w.actual>=0);
     assert.ok(w.actual<=w.enemyHpAtStart+1e-5);
     assert.ok(w.actual<=w.allDamage+.002,"source attribution cannot exceed total hits");
     assert.ok(Math.abs(w.allDamage-(w.actual+w.otherDamage))<=.003);
     assert.ok(w.trackedCount===w.classes.length);
     assert.ok(w.censored===!w.completed);
     assert.ok(w.hits===0||w.actual>0);
     assert.ok(w.activity&&Number.isFinite(w.activity.alive));
     assert.ok(w.activity.alive>=0);
     assert.ok(Math.abs(w.activity.alive-w.covered)<.025,
      "unit seconds must partition selected targets");
     assert.ok(w.covered<=w.trackedCount*w.observedSeconds+w.trackedCount*.05,
      "unit seconds cannot exceed potential exposure");
     assert.ok(w.deadOrGone>=0);
     assert.ok(w.activity.enemyNearby<=w.activity.alive+.02);
     assert.ok(w.activity.inCastleRange<=w.activity.castleTarget+.02);
     assert.ok(w.defenderObservedSeconds<=w.observedSeconds+.05);
     assert.ok(w.nearbyEnemyObservedSeconds<=w.observedSeconds+.05);
     if(w.hits>0)assert.ok(w.firstCastleHitAt!==null);
     if(w.firstEnemyTargetAt!==null)assert.ok(w.activity.enemyTarget>0);
     if(w.firstFortTargetAt!==null)assert.ok(w.activity.fortTarget>0);
    }
    rows.push({...q,winner:audited.winner,elapsed:audited.elapsed,
     windows:audited.forecastAudit});
   }
  }
  assert.deepEqual(errors,[]);
  assert.equal(rows.length,120);
  const windows=rows.flatMap(r=>r.windows.map(w=>({...w,style:r.style,
   seed:r.seed,team:r.team,mirror:r.mirror,cadence:r.cadence})));
  const complete=windows.filter(w=>w.completed);
  const moving=complete.filter(w=>w.predicted>0.01);
  const traffic=moving.filter(w=>w.actual>0);
  const falsePositive=moving.filter(w=>w.actual===0);
  const pessimistic=complete.filter(w=>w.predicted<=.01&&w.actual>0);
  const share=(a,b)=>b?a/b:null;
  const group=ws=>({
   windows:ws.length,
   predictionPositive:ws.filter(w=>w.predicted>0.01).length,
   actualPositive:ws.filter(w=>w.actual>0).length,
   forecastTotal:sum(ws,w=>w.predicted),
   attributedActualTotal:sum(ws,w=>w.actual),
   otherUnitsActualTotal:sum(ws,w=>w.otherDamage),
   allActualTotal:sum(ws,w=>w.allDamage),
   meanPredicted:avg(ws,w=>w.predicted),
   meanActual:avg(ws,w=>w.actual),
   meanSignedError:avg(ws,w=>w.error),
   meanAbsoluteError:avg(ws,w=>Math.abs(w.error)),
   optimisticFraction:share(ws.filter(w=>w.predicted>w.actual+1).length,ws.length),
   hitZeroFraction:share(ws.filter(w=>w.actual===0).length,ws.length),
   fromUncountedUnitsFraction:share(sum(ws,w=>w.otherDamage),sum(ws,w=>w.allDamage))
  });
  const summary={
   status:"read-only actual source-hit evaluation",seeds,
   pairedConditions:rows.length,fullGames:rows.length*2,
   windows:windows.length,completeWindows:complete.length,censoredWindows:windows.length-complete.length,
   withPredictedDamage:moving.length,observedActualHits:traffic.length,
   forecastPositiveButZeroHits:falsePositive.length,
   forecastZeroButRealHits:pessimistic.length,
   forecastPositiveHitRate:share(traffic.length,moving.length),
   overall:group(complete),forecastPositive:group(moving),
   defended:group(moving.filter(w=>w.defenders>0)),
   undefended:group(moving.filter(w=>w.defenders===0)),
   nearbyEnemies:group(moving.filter(w=>w.nearbyEnemy>0)),
   noNearbyEnemies:group(moving.filter(w=>w.nearbyEnemy===0)),
   byStyle:Object.fromEntries(styles.map(k=>[k,group(moving.filter(w=>w.style===k))])),
   byTeam:Object.fromEntries(teams.map(k=>[k,group(moving.filter(w=>w.team===k))])),
   tenLargestMisses:moving.slice().sort((a,b)=>b.error-a.error).slice(0,10).map(w=>({
    seed:w.seed,team:w.team,style:w.style,at:w.at,predicted:w.predicted,
    actual:w.actual,defenders:w.defenders,nearbyEnemy:w.nearbyEnemy,
    classes:w.classes,newFriendlyPlays:w.newFriendlyPlays,
    otherDamage:w.otherDamage})),
   limitations:["Actual is damage by snapshot UIDs only, other newly spawned units have separate ledger.",
    "Predictions follow current V3 optimistic formula and do not estimate future card plays or defensive targeting.",
    "Only complete 12-second horizons are used for accuracy totals; early match endings are censored.",
    "Each 12-second window within a match is dependent; do not treat windows as independent games.",
    "All six seeds are previously explored; holdout seeds untouched.",
    "Action parity audited versus no-audit on all 120 matched conditions."]};
  fs.writeFileSync(path.join(out,"windows.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("CASTLE FORECAST AUDIT SUMMARY",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});