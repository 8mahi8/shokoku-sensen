// Isolated, resource-matched role studies. Descriptive QA, not card rebalancing.
// Siege tank vs suppress+archer; defensive guardian vs sentinel+scout.
// 7 energy in either arm; real playCard + real 30Hz unit simulation.
"use strict";
const {chromium}=require("playwright");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path"),assert=require("node:assert/strict");
const folder="qa-heavy-value",root=process.cwd();fs.mkdirSync(folder,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const seeds=[17,41,73,101,131,163];
const cases={siege:["open","screen","defender","giant"],
 defense:["swarm","giant","air","ranged"]};
const mean=(a)=>a.length?a.reduce((n,x)=>n+x,0)/a.length:0;
const diff=(rows,key)=>mean(rows.map(r=>r.heavy.stats[key]-r.alternatives.stats[key]));
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8796,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8796/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(seed,role,kind,opponent,team)=>page.evaluate(x=>
   window.__shokokuQa.runHeavyTrial(x.seed,x.role,x.kind,x.opponent,x.team),
   {seed,role,kind,opponent,team});
  const records=[];
  for(const [role,opponents] of Object.entries(cases)){
   for(const opponent of opponents)for(const seed of seeds)for(const team of [1,2]){
    const heavy=await run(seed,role,"heavy",opponent,team);
    const alternatives=await run(seed,role,"alternatives",opponent,team);
    for(const g of [heavy,alternatives]){
     assert.ok(g?.finished&&g.elapsed>0&&g.elapsed<=121,"valid complete trial");
     assert.equal(g.spent,7,"exact equal resource budget");
     assert.ok(g.enemySpent<=7,"opponent deployment within resource limit");
     assert.ok(g.stats.enemyCastleDamage>=0&&g.stats.enemyCastleDamage<=3000,"enemy castle damage");
     assert.ok(g.stats.enemyUnitDamage>=0,"unit damage nonnegative");
     assert.ok(g.stats.remainingEnergy>=0&&g.stats.remainingEnergy<=12,"legal energy");
     assert.ok(g.stats.survivalSeconds>=0,"survival time");
     assert.ok(g.stats.enemyCastleAt30>=0&&g.stats.enemyCastleAt60>=0&&g.stats.enemyCastleAt90>=0,"checkpoint damage bounds");
    }
    assert.deepEqual(heavy.enemyCards,alternatives.enemyCards,"same enemy");
    assert.equal(heavy.team,alternatives.team,"same side");
    records.push({seed,role,opponent,team,heavy,alternatives,
     deltaUnitDamage:heavy.stats.enemyUnitDamage-alternatives.stats.enemyUnitDamage,
     deltaCastleDamage:heavy.stats.enemyCastleDamage-alternatives.stats.enemyCastleDamage,
     deltaOwnDamage:heavy.stats.ownCastleDamage-alternatives.stats.ownCastleDamage});
   }
  }
  assert.equal(records.length,96);
  const reproduce=await run(17,"siege","heavy","open",1);
  assert.deepEqual(reproduce,records[0].heavy,"deterministic seeded replay");
  assert.deepEqual(errors,[],"page errors");
  const summary={kind:"7-energy fixed-force ROLE trials (not full-match win rate)",
   version:2,trialPairs:records.length,seeds,roles:Object.fromEntries(
    Object.entries(cases).map(([role,opponents])=>{
     const all=records.filter(r=>r.role===role);
     const stat=rows=>({pairs:rows.length,
      meanDeltaUnitDamage:diff(rows,"enemyUnitDamage"),
      meanDeltaCastleDamage:diff(rows,"enemyCastleDamage"),
      meanDeltaOwnCastleDamage:diff(rows,"ownCastleDamage"),
      meanDeltaSurvivalSeconds:diff(rows,"survivalSeconds"),
      meanDeltaSurvivalSecondsPerUnit:diff(rows,"survivalSecondsPerUnit"),
      meanDeltaCastleAt30:diff(rows,"enemyCastleAt30"),
      meanDeltaCastleAt60:diff(rows,"enemyCastleAt60"),
      meanDeltaCastleAt90:diff(rows,"enemyCastleAt90"),
      meanDeltaOwnCastleAt30:diff(rows,"ownCastleAt30"),
      heavyFasterCastle:rows.filter(r=>
       (r.heavy.stats.enemyCastleFallAt??121)<(r.alternatives.stats.enemyCastleFallAt??121)).length,
      alternativeFasterCastle:rows.filter(r=>
       (r.heavy.stats.enemyCastleFallAt??121)>(r.alternatives.stats.enemyCastleFallAt??121)).length,
      heavyMeanCastleFallOr121:mean(rows.map(r=>r.heavy.stats.enemyCastleFallAt??121)),
      alternativeMeanCastleFallOr121:mean(rows.map(r=>r.alternatives.stats.enemyCastleFallAt??121)),
      heavyBetterCastle:rows.filter(r=>r.deltaCastleDamage>0).length,
      heavyBetterUnitDamage:rows.filter(r=>r.deltaUnitDamage>0).length,
      heavyReducedOwnCastleDamage:rows.filter(r=>r.deltaOwnDamage<0).length,
      heavyMeanCastleDamage:mean(rows.map(r=>r.heavy.stats.enemyCastleDamage)),
      alternativeMeanCastleDamage:mean(rows.map(r=>r.alternatives.stats.enemyCastleDamage)),
      heavyMeanUnitDamage:mean(rows.map(r=>r.heavy.stats.enemyUnitDamage)),
      alternativeMeanUnitDamage:mean(rows.map(r=>r.alternatives.stats.enemyUnitDamage))});
     return [role,{...stat(all),byOpponent:Object.fromEntries(opponents.map(opponent=>
      [opponent,stat(all.filter(r=>r.opponent===opponent))]))}];
    })),
   caveats:["Fixed 7-cost lineups and 120 seconds; no adaptive BOT decisions after deployment.",
    "Fort ownership grants equal forward staging to both arms but is a selected battlefield setup.",
    "Defensive guardian is anchored by design and is not a siege unit.",
    "Different unit counts alter PRNG draw consumption; matched seeds are not independent RNG streams.",
    "Do not change card balance based only on these scenarios."]};
  fs.writeFileSync(path.join(folder,"matches.json"),JSON.stringify(records,null,2));
  fs.writeFileSync(path.join(folder,"summary.json"),JSON.stringify(summary,null,2));
  console.log("HEAVY VALUE SUMMARY",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
