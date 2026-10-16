// Train-only energy-policy test against opponent strategy AND action cadence diversity.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 http=require("node:http"),{chromium}=require("playwright");
const out="qa-bot-energy-opponents",root=process.cwd();fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const seeds=[17,41,73],styles=["rush","balanced","fortress"],cadences=["standard","fast"];
const policies=["opponentPunish","opponentGuard"],teams=[1,2];
const points=(g,t)=>g.winner===0?.5:g.winner===t?1:0;
function aggregate(rows){
 return {comparisons:rows.length,delta:rows.reduce((n,r)=>n+r.delta,0),
  improved:rows.filter(x=>x.delta>0).length,worsened:rows.filter(x=>x.delta<0).length,
  unchanged:rows.filter(x=>x.delta===0).length,
  cardChange:rows.filter(x=>JSON.stringify(x.baselineCards)!==JSON.stringify(x.variantCards)).length,
  triggers:rows.reduce((n,r)=>n+(r.events.variantTriggers||0),0),
  enemyLow:rows.reduce((n,r)=>n+(r.events.opponentLow||0),0),
  enemyReady4:rows.reduce((n,r)=>n+(r.events.opponentCanBarrage||0),0),
  enemyReady7:rows.reduce((n,r)=>n+(r.events.opponentHigh||0),0)};
}
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8798,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8798/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(seed,style,cadence,team,variant="baseline")=>page.evaluate(x=>
    window.__shokokuQa.runDuel(x.seed,x.style,"hard",x.team,
     x.cadence,false,x.variant==="baseline"?0:x.team,x.variant),
    {seed,style,cadence,team,variant});
  const rows=[],ref=[];
  for(const style of styles)for(const cadence of cadences)for(const seed of seeds)for(const team of teams){
   const baseline=await run(seed,style,cadence,team);
   assert.ok(baseline?.finished,"baseline duel finishes");
   for(const side of teams)assert.ok(Math.abs(baseline.energyEstimated[side]-baseline.energyActual[side])<1e-6,"energy reconstructed");
   ref.push({style,cadence,seed,team,winner:baseline.winner});
   for(const policy of policies){
    const trial=await run(seed,style,cadence,team,policy);
    assert.ok(trial?.finished,"trial duel finishes");
    assert.deepEqual(trial.initialHand,baseline.initialHand,"same initial hand");
    assert.deepEqual(trial.openingQueue,baseline.openingQueue,"same deck");
    for(const side of teams){
     assert.ok(Math.abs(trial.energyEstimated[side]-trial.energyActual[side])<1e-6,"public resource accounting");
     assert.ok(trial.avgEnergy[side]>=0&&trial.avgEnergy[side]<=12,"legal energy");
    }
    rows.push({style,cadence,seed,team,policy,baselineWinner:baseline.winner,
     trialWinner:trial.winner,
     delta:points(trial,team)-points(baseline,team),
     events:trial.decisionEvents[team],
     baselineCards:baseline.cards[team],variantCards:trial.cards[team]});
   }
  }
  assert.equal(ref.length,36);assert.equal(rows.length,72);
  assert.deepEqual(errors,[],"no page errors");
  const summary={kind:"Train-only resource-aware BOT vs three scripted enemy styles",
   version:1,seeds,baselineGames:ref.length,comparisons:rows.length,
   policy:Object.fromEntries(policies.map(policy=>{
    const group=rows.filter(x=>x.policy===policy);
    return [policy,{...aggregate(group),
     byStyle:Object.fromEntries(styles.map(style=>
      [style,aggregate(group.filter(x=>x.style===style))])),
     byCadence:Object.fromEntries(cadences.map(c=>
      [c,aggregate(group.filter(x=>x.cadence===c))])),
     byTeam:Object.fromEntries(teams.map(team=>
      [team,aggregate(group.filter(x=>x.team===team))]))}];
   })),
   limitations:["Scripted opponents are not human players and cadence is not skill rating.",
    "Only train seeds; no new independent evaluation.",
    "Paired seeds do not hold random consumption sequence constant after decisions.",
    "Opponent deck remains hidden; energy is reconstructed from observed purchases."]};
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("ENERGY OPPONENT DIVERSITY SUMMARY",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
