"use strict";
// Route verification: only use legal capture deployments if getFort targets that fort.
// The original expert BOT and unit routing are unmodified outside QA variant.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-route-capture-opportunity";fs.mkdirSync(out,{recursive:true});
const srv=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(p).pipe(res);
});
const seeds=[17,41,73,101,131,163],teams=[1,2],
 styles=["self","rush","balanced","fortress","banker"];
const sum=(xs,f)=>xs.reduce((n,v)=>n+f(v),0),
 avg=(xs,f)=>xs.length?sum(xs,f)/xs.length:null,
 score=(g,t)=>g.winner===0?.5:g.winner===t?1:0;
(async()=>{
 let browser;
 try{
  await new Promise(ok=>srv.listen(8875,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8875/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(q,variant)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,x.cadence,x.mirror,
   x.variant==="baseline"?0:x.team,x.variant),{...q,variant});
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles){
   const opts=style==="self"?[{mirror:false,cadence:"standard"},
    {mirror:true,cadence:"standard"}]:[{mirror:false,cadence:"standard"},
    {mirror:false,cadence:"fast"}];
   for(const settings of opts){
    const q={seed,team,style,...settings},control=await run(q,"baseline"),
     trial=await run(q,"captureRouteOpportunity");
    assert.ok(control?.finished&&trial?.finished&&control.elapsed>0&&trial.elapsed>0);
    assert.deepEqual(control.initialHand,trial.initialHand);
    assert.deepEqual(control.openingQueue,trial.openingQueue);
    for(const game of [control,trial]){
     assert.ok(Math.abs(game.energyActual[team]-game.energyEstimated[team])<1e-6);
    }
    const ev=trial.decisionEvents[team];
    rows.push({...q,baseline:{score:score(control,team),hp:control.castleHp[team],
      damage:control.damage[3-team],fort:control.fortSeconds[team],
      cards:control.cards[team],spent:control.spent[team]},
     trial:{score:score(trial,team),hp:trial.castleHp[team],
      damage:trial.damage[3-team],fort:trial.fortSeconds[team],
      cards:trial.cards[team],spent:trial.spent[team]},
     audited:ev.routeOpportunity||0,plays:ev.routeOpportunityPlays||0,
     samples:ev.routeOpportunitySamples||[]});
   }
  }
  assert.equal(rows.length,120);assert.deepEqual(errors,[]);
  const result={kind:"QA-only exact route capture action opportunity test",
   seeds,pairedConditions:120,fullGames:240,
   improved:rows.filter(x=>x.trial.score>x.baseline.score).length,
   worsened:rows.filter(x=>x.trial.score<x.baseline.score).length,
   unchanged:rows.filter(x=>x.trial.score===x.baseline.score).length,
   meanHpDelta:avg(rows,x=>x.trial.hp-x.baseline.hp),
   meanEnemyDamageDelta:avg(rows,x=>x.trial.damage-x.baseline.damage),
   meanFortDelta:avg(rows,x=>x.trial.fort-x.baseline.fort),
   meanSpendDelta:avg(rows,x=>x.trial.spent-x.baseline.spent),
   routeMismatchConsidered:sum(rows,x=>x.audited),
   legallyRoutedCapturePlays:sum(rows,x=>x.plays),
   distinctMatchesWithPlay:rows.filter(x=>x.plays>0).length,
   byTeam:Object.fromEntries(teams.map(t=>[t,{
    improved:rows.filter(x=>x.team===t&&x.trial.score>x.baseline.score).length,
    worsened:rows.filter(x=>x.team===t&&x.trial.score<x.baseline.score).length,
    plays:sum(rows.filter(x=>x.team===t),x=>x.plays)}])),
   byStyle:Object.fromEntries(styles.map(s=>[s,{
    improved:rows.filter(x=>x.style===s&&x.trial.score>x.baseline.score).length,
    worsened:rows.filter(x=>x.style===s&&x.trial.score<x.baseline.score).length,
    plays:sum(rows.filter(x=>x.style===s),x=>x.plays)}])),
   examples:rows.flatMap(x=>x.samples.map(z=>({...z,seed:x.seed,team:x.team,
    style:x.style,cadence:x.cadence}))).slice(0,25),
   limitations:["Known seeds, so no independent generalization claim.",
    "Unit routing and BLUE side deep-capture behavior are not changed.",
    "No main, live BOT, unit balance or network changes.",
    "Action difference is not automatically a strength increase."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(result,null,2));
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  console.log("ROUTE CAPTURE OPPORTUNITY SUMMARY",JSON.stringify(result));
 }finally{if(browser)await browser.close();await new Promise(ok=>srv.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
