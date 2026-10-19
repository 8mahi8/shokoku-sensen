"use strict";
// Strong difficulty evaluation: original hard BOT vs new expert policy.
// The game itself runs the real 30Hz physics and identical card restrictions.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),folder="qa-strong-bot";
fs.mkdirSync(folder,{recursive:true});
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(p).pipe(res);
});
// Freeze both partitions and acceptance criteria BEFORE the first comparison.
const train=[20266001,20266049,20266103,20266151];
const holdout=[20267013,20267069,20267119,20267173];
const styles=["rush","fortress","banker","self"];
const points=(game,team)=>game.winner===0?.5:game.winner===team?1:0;
function stats(rows){
 return {games:rows.length,improved:rows.filter(x=>x.delta>0).length,
  regressed:rows.filter(x=>x.delta<0).length,unchanged:rows.filter(x=>x.delta===0).length,
  netPoints:rows.reduce((v,x)=>v+x.delta,0),
  byTeam:Object.fromEntries([1,2].map(t=>[t,rows.filter(x=>x.team===t).reduce((v,x)=>v+x.delta,0)])),
  byStyle:Object.fromEntries(styles.map(s=>[s,rows.filter(x=>x.style===s).reduce((v,x)=>v+x.delta,0)]))
 };
}
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8898,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8898/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSoloLevels [data-solo-level=expert]").click();
  assert.equal(await page.locator("#netSoloLevels [data-solo-level=expert]").getAttribute("aria-pressed"),"true");
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  // Research candidate is a QA policy; only the selected team gets improved
  // positioning/cadence. The other side remains the unmodified hard BOT.
  const run=(seed,style,team,mode)=>page.evaluate(
   ({seed,style,team,mode})=>window.__shokokuQa.runDuel(
    seed,style,"hard",team,"standard",false,mode==="strongDefend"?team:0,mode),
   {seed,style,team,mode});
  const rows=[];
  for(const [partition,seeds] of Object.entries({train,holdout})){
   for(const seed of seeds)for(const style of styles)for(const team of [1,2]){
    const old=await run(seed,style,team,"baseline");
    const next=await run(seed,style,team,"strongDefend");
    assert.ok(old?.finished&&next?.finished,"full matches complete");
    assert.deepEqual(next.initialHand,old.initialHand,"identical initial cards");
    assert.deepEqual(next.openingQueue,old.openingQueue,"identical opening deck queue");
    assert.ok(next.actions[team]>0&&next.spent[team]>0,"new BOT must spend actual energy");
    assert.ok(next.maxUnits[team]<=65,"unit cap");
    assert.ok(next.avgEnergy[team]>=0&&next.avgEnergy[team]<=12,"ordinary energy bounds");
    rows.push({partition,seed,style,team,oldWinner:old.winner,newWinner:next.winner,
     delta:points(next,team)-points(old,team),oldHp:old.castleHp[team],
     newHp:next.castleHp[team],oldActions:old.actions[team],newActions:next.actions[team],
     oldSpent:old.spent[team],newSpent:next.spent[team],
     initialHand:old.initialHand,openingQueue:old.openingQueue});
   }
   console.log("STRONG BOT",partition,"partition complete:",rows.length,"paired comparisons");
  }
  assert.deepEqual(errors,[],"no browser JS exceptions");
  const training=stats(rows.filter(x=>x.partition==="train"));
  const unseen=stats(rows.filter(x=>x.partition==="holdout"));
  // Do not infer player win rate from scripted or self-play matches.
  // The gate deliberately rejects a strategy overfitted to one side.
  const eligible=unseen.netPoints>=2&&unseen.regressed<=3&&
    unseen.byTeam[1]>=0&&unseen.byTeam[2]>=0&&
    unseen.improved>=unseen.regressed+2;
  const report={candidate:"strongDefend-v2-adaptive",train:training,holdout:unseen,
    passingReleaseEvidence:eligible,
    preregisteredGate:{minHoldoutNetPoints:2,maxRegressions:3,
     bothTeamsNonnegative:true,minMoreWinsThanLosses:2},
    limitations:["self-play and three scripted policies, not human opponents",
     "unknown iPad Safari performance","requires online and iframe regression before release"]};
  fs.writeFileSync(path.join(folder,"summary.json"),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(folder,"matches.json"),JSON.stringify(rows,null,2));
  console.log("STRONG BOT RESULT",JSON.stringify(report));
  if(!eligible)process.exitCode=2;
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
