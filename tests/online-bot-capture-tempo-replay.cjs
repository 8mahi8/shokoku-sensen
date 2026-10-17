// Extended replay of a pre-registered QA policy; ONLY previously consumed seeds.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-capture-tempo-replay";fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(p).pipe(res);
});
const seeds=[17,41,73,101,131,163],sides=[1,2],
 styles=["self","rush","balanced","fortress","banker"];
const point=(g,t)=>g.winner===0?.5:g.winner===t?1:0;
const sum=(a,fn)=>a.reduce((n,x)=>n+fn(x),0);
const avg=(a,fn)=>a.length?sum(a,fn)/a.length:0;
const agg=rows=>({
 pairs:rows.length,improved:rows.filter(x=>x.delta>0).length,
 worsened:rows.filter(x=>x.delta<0).length,
 unchanged:rows.filter(x=>x.delta===0).length,netScore:sum(rows,x=>x.delta),
 triggers:sum(rows,x=>x.plays),predictedThreats:sum(rows,x=>x.threats),
 checks:sum(rows,x=>x.checks),
 changedCardMix:rows.filter(x=>JSON.stringify(x.cards)!==JSON.stringify(x.baseCards)).length,
 meanOwnHpDelta:avg(rows,x=>x.ownHp-x.baseOwnHp),
 meanEnemyDamageDelta:avg(rows,x=>x.enemyDamage-x.baseEnemyDamage),
 meanFortSecondsDelta:avg(rows,x=>x.fortTime-x.baseFortTime),
 meanSpentDelta:avg(rows,x=>x.spent-x.baseSpent)
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8812,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8812/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(q,variant)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,x.cadence,x.mirror,
   x.variant==="baseline"?0:x.team,x.variant),{...q,variant});
  const pairs=[];
  for(const seed of seeds)for(const team of sides)for(const style of styles){
   const situations=style==="self"?
    [{mirror:false,cadence:"standard"},{mirror:true,cadence:"standard"}]:
    [{mirror:false,cadence:"standard"},{mirror:false,cadence:"fast"}];
   for(const situation of situations){
    const q={seed,team,style,...situation};
    const base=await run(q,"baseline"),trial=await run(q,"captureTempoInfantry");
    assert.ok(base?.finished&&trial?.finished);
    assert.deepEqual(base.initialHand,trial.initialHand);
    assert.deepEqual(base.openingQueue,trial.openingQueue);
    for(const side of sides){
     assert.ok(Math.abs(base.energyActual[side]-base.energyEstimated[side])<1e-6);
     assert.ok(Math.abs(trial.energyActual[side]-trial.energyEstimated[side])<1e-6);
    }
    const ev=trial.decisionEvents[team];
    pairs.push({...q,controlWinner:base.winner,winner:trial.winner,
     delta:point(trial,team)-point(base,team),
     plays:ev.captureTempoPlayed||0,threats:ev.captureTempoWindow||0,
     checks:ev.captureTempoConsidered||0,
     cards:trial.cards[team],baseCards:base.cards[team],
     ownHp:trial.castleHp[team],baseOwnHp:base.castleHp[team],
     enemyDamage:trial.damage[3-team],baseEnemyDamage:base.damage[3-team],
     fortTime:trial.fortSeconds[team],baseFortTime:base.fortSeconds[team],
     spent:trial.spent[team],baseSpent:base.spent[team]});
   }
  }
  assert.equal(pairs.length,120);
  assert.deepEqual(errors,[]);
  const report={kind:"Extended known-seed early capture tempo replay; NOT holdout",
   seeds,totalGames:240,comparisonPairs:120,
   overall:agg(pairs),
   byTeam:Object.fromEntries(sides.map(t=>[t,agg(pairs.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,agg(pairs.filter(r=>r.style===s))])),
   byCadence:Object.fromEntries(["standard","fast"].map(s=>[s,agg(pairs.filter(r=>r.cadence===s))])),
   bySeed:Object.fromEntries(seeds.map(s=>[s,agg(pairs.filter(r=>r.seed===s))])),
   caveats:["Seeds already used in previous research; selection bias possible.",
    "Score changes must be confirmed on NEW independent seeds before promotion.",
    "BOT baseline, online rules, movement and balance remain unchanged."]};
  fs.writeFileSync(path.join(out,"pairs.json"),JSON.stringify(pairs,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("CAPTURE TEMPO REPLAY SUMMARY",JSON.stringify(report));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});