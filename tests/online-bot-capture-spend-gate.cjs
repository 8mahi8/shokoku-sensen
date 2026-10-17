"use strict";
// Paired, real-engine training-only trial of legal infantry capture tempo.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-capture-spend-gate";
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(file).pipe(res);
});
const seeds=[17,41,73],teams=[1,2],styles=["self","rush","fortress","banker"];
const score=(r,t)=>r.winner===0?.5:r.winner===t?1:0;
const sum=(a,f)=>a.reduce((s,r)=>s+f(r),0);
const avg=(a,f)=>a.length?sum(a,f)/a.length:0;
const agg=a=>({pairs:a.length,improved:a.filter(r=>r.delta>0).length,
 worsened:a.filter(r=>r.delta<0).length,unchanged:a.filter(r=>r.delta===0).length,
 winScoreDelta:sum(a,r=>r.delta),considered:sum(a,r=>r.considered),
 windows:sum(a,r=>r.windows),interventions:sum(a,r=>r.plays),
 cardMixChanged:a.filter(r=>JSON.stringify(r.cards)!==JSON.stringify(r.baseCards)).length,
 ownHpDelta:avg(a,r=>r.ownHp-r.baseOwnHp),
 damageDelta:avg(a,r=>r.damage-r.baseDamage),
 fortTimeDelta:avg(a,r=>r.fortTime-r.baseFortTime),
 spentDelta:avg(a,r=>r.spent-r.baseSpent)});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8814,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8814/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const scene=s=>page.evaluate(spec=>{
   if(!window.__shokokuQa.setBotScenario(spec))throw Error("invalid scene");
   return window.__shokokuQa.runBotOnce();
  },s);
  const basic={difficulty:"hard",elapsed:80,energy:2.5,enemyEnergy:1,
   hand:["tank","guardian","suppress","sentinel"],fortOwners:[0,0,0],
   allies:[],enemies:[]};
  const b=await scene({...basic,variant:"baseline"});
  const trial=await scene({...basic,variant:"captureSpendGate"});
  assert.equal(b.action,null,"baseline has no affordable hand");
  assert.equal(trial.action?.id,"infantry","two infantry are legally deployed");
  assert.equal(trial.spent,2);
  const opponentFunded=await scene({...basic,variant:"captureSpendGate",enemyEnergy:6});
  assert.notEqual(opponentFunded.action?.id,"infantry",
   "avoid speculative spending when enemy can afford an immediate counter");
  const opponentDepleted=await scene({...basic,variant:"captureSpendGate",enemyEnergy:1});
  assert.equal(opponentDepleted.action?.id,"infantry",
   "only a low-cost depleted-opponent window may divert resources");
  const heavySeen=await scene({...basic,variant:"captureSpendGate",
   enemies:[{key:"tank",x:500,y:444}]});
  assert.notEqual(heavySeen.action?.id,"infantry",
   "visible hostile heavy blocks capture speculation");
  const insufficient=await scene({...basic,variant:"captureSpendGate",energy:1.5});
  assert.equal(insufficient.spent,0);
  const captured=await scene({...basic,variant:"captureSpendGate",
   hand:["scout","tank","guardian","sentinel"],energy:3.5});
  assert.equal(captured.action?.id,"scout","affordable scout keeps priority");
  const ally=await scene({...basic,variant:"captureSpendGate",
   allies:[{key:"scout",x:900,y:205}]});
  assert.notEqual(ally.action?.id,"infantry","avoid redundant capture");
  const enemy=await scene({...basic,variant:"captureSpendGate",
   enemies:[{key:"scout",x:895,y:205}]});
  assert.notEqual(enemy.action?.id,"infantry","unsafe capture does not force spending");
  const late=await scene({...basic,variant:"captureSpendGate",elapsed:200});
  assert.notEqual(late.action?.id,"infantry","early-game proposal only");
  const run=(q,v)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,"standard",x.mirror,
   x.variant==="baseline"?0:x.team,x.variant),{...q,variant:v});
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles)
   for(const mirror of style==="self"?[false,true]:[false]){
    const q={seed,team,style,mirror};
    const base=await run(q,"baseline"),next=await run(q,"captureSpendGate");
    assert.ok(base?.finished&&next?.finished);
    assert.deepEqual(base.initialHand,next.initialHand);
    assert.deepEqual(base.openingQueue,next.openingQueue);
    for(const t of teams){
     assert.ok(Math.abs(base.energyActual[t]-base.energyEstimated[t])<1e-6);
     assert.ok(Math.abs(next.energyActual[t]-next.energyEstimated[t])<1e-6);
    }
    const ev=next.decisionEvents[team];
    rows.push({...q,delta:score(next,team)-score(base,team),
     winner:next.winner,baseWinner:base.winner,
     plays:ev.spendGatePlayed||0,windows:ev.spendGateOpportunity||0,
     considered:ev.spendGateConsidered||0,
     cards:next.cards[team],baseCards:base.cards[team],
     ownHp:next.castleHp[team],baseOwnHp:base.castleHp[team],
     damage:next.damage[3-team],baseDamage:base.damage[3-team],
     fortTime:next.fortSeconds[team],baseFortTime:base.fortSeconds[team],
     spent:next.spent[team],baseSpent:base.spent[team]});
   }
  assert.equal(rows.length,30);assert.deepEqual(errors,[]);
  const summary={kind:"Known-seed opponent-budget capture gate",
   seeds,baselineGames:30,trialGames:30,overall:agg(rows),
   byTeam:Object.fromEntries(teams.map(t=>[t,agg(rows.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,agg(rows.filter(r=>r.style===s))])),
   limitations:["Known seeds only. No holdout unless improvements survive training.",
    "Legal infantry use does not rotate the four-card hand.",
    "Production BOT and published branches unchanged."]};
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("CAPTURE SPEND GATE SUMMARY",JSON.stringify(summary));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});