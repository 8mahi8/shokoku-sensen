// Extended known-training-seed check for targeted scout-lane selection.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-lane-replay";
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const seeds=[17,41,73,101,131,163],sides=[1,2];
const styles=["self","rush","balanced","fortress","banker"];
const point=(g,t)=>g.winner===0?.5:g.winner===t?1:0;
const sum=(arr,fn)=>arr.reduce((n,x)=>n+fn(x),0);
const mean=(arr,fn)=>arr.length?sum(arr,fn)/arr.length:0;
const agg=rows=>({
 comparisons:rows.length,
 netWins:sum(rows,r=>r.delta),
 improved:rows.filter(r=>r.delta>0).length,
 worsened:rows.filter(r=>r.delta<0).length,
 unchanged:rows.filter(r=>r.delta===0).length,
 actionsChanged:sum(rows,r=>r.triggers),
 cardsChanged:rows.filter(r=>JSON.stringify(r.cards)!==JSON.stringify(r.baseCards)).length,
 enemyCastleDamageDelta:mean(rows,r=>r.enemyCastleDamage-r.baseEnemyCastleDamage),
 ownCastleHpDelta:mean(rows,r=>r.ownHp-r.baseOwnHp),
 fortSecondsDelta:mean(rows,r=>r.fortSeconds-r.baseFortSeconds)
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8805,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8805/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(q,variant="baseline")=>page.evaluate(x=>
   window.__shokokuQa.runDuel(x.seed,x.style,"hard",x.team,
    x.cadence,x.mirror,x.variant==="baseline"?0:x.team,x.variant),
   {...q,variant});
  const rows=[];
  for(const seed of seeds)for(const team of sides)for(const style of styles){
   const situations=style==="self"?
    [{mirror:false,cadence:"standard"},{mirror:true,cadence:"standard"}]:
    [{mirror:false,cadence:"standard"},{mirror:false,cadence:"fast"}];
   for(const situation of situations){
    const q={seed,team,style,...situation};
    const base=await run(q);
    const trial=await run(q,"laneScout");
    assert.ok(base?.finished&&trial?.finished,"matches finished");
    assert.deepEqual(base.initialHand,trial.initialHand,"same initial hand");
    assert.deepEqual(base.openingQueue,trial.openingQueue,"same queue");
    assert.ok(Math.abs(base.energyActual[team]-base.energyEstimated[team])<1e-6);
    assert.ok(Math.abs(trial.energyActual[team]-trial.energyEstimated[team])<1e-6);
    rows.push({...q,baseWinner:base.winner,winner:trial.winner,
     delta:point(trial,team)-point(base,team),
     triggers:trial.decisionEvents[team].surgicalChoices?.laneScout||0,
     cards:trial.cards[team],baseCards:base.cards[team],
     ownHp:trial.castleHp[team],baseOwnHp:base.castleHp[team],
     enemyCastleDamage:trial.damage[3-team],baseEnemyCastleDamage:base.damage[3-team],
     fortSeconds:trial.fortSeconds[team],baseFortSeconds:base.fortSeconds[team]});
   }
  }
  assert.equal(rows.length,120,"exact contextual comparisons");
  assert.deepEqual(errors,[],"no browser errors");
  const summary={kind:"Extended known-training-seed scout lane replay, NOT holdout",
   version:1,seeds,rows:rows.length,totalGames:rows.length*2,
   overall:agg(rows),
   byTeam:Object.fromEntries(sides.map(t=>[t,agg(rows.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,agg(rows.filter(r=>r.style===s))])),
   byCadence:Object.fromEntries(["standard","fast"].map(c=>[c,agg(rows.filter(r=>r.cadence===c))])),
   bySeed:Object.fromEntries(seeds.map(s=>[s,agg(rows.filter(r=>r.seed===s))])),
   limits:["All six seeds were used in earlier development/training, not independent evaluation.",
    "A change to scout lane is rare; few improvements cannot establish a reliable advantage.",
    "The usual default BOT and all player routing remain unchanged."]};
  fs.writeFileSync(path.join(out,"rows.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("SCOUT LANE REPLAY SUMMARY",JSON.stringify(summary));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
