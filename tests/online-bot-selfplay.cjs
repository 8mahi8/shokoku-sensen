// Equal-policy tactical self-play with held-out seeds and side/map/init-order swaps.
// Uses the real local battle engine, not a mock or the scripted comparison opponent.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {chromium}=require("playwright");
const root=process.cwd(),output="qa-bot-selfplay";
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const seedSets={train:[17,41,73],holdout:[2003,2017,2063]};
const levels=["hard","normal"],maps=[false,true],firstSides=[1,2];
function mean(a){return a.length?a.reduce((sum,v)=>sum+v,0)/a.length:0;}
function agg(rows){
 return {games:rows.length,blueWins:rows.filter(x=>x.winner===1).length,
  redWins:rows.filter(x=>x.winner===2).length,draws:rows.filter(x=>x.winner===0).length,
  avgElapsed:mean(rows.map(x=>x.elapsed)),
  blue:{avgFortSeconds:mean(rows.map(x=>x.fortSeconds[1])),
   avgEnergy:mean(rows.map(x=>x.avgEnergy[1])),
   avgActions:mean(rows.map(x=>x.actions[1])),
   avgCastleHp:mean(rows.map(x=>x.castleHp[1]))},
  red:{avgFortSeconds:mean(rows.map(x=>x.fortSeconds[2])),
   avgEnergy:mean(rows.map(x=>x.avgEnergy[2])),
   avgActions:mean(rows.map(x=>x.actions[2])),
   avgCastleHp:mean(rows.map(x=>x.castleHp[2]))}};
}
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8793,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8793/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=({seed,level,mirror,first})=>page.evaluate(
   ({seed,level,mirror,first})=>
    window.__shokokuQa.runDuel(seed,"self",level,first,"standard",mirror),
   {seed,level,mirror,first});
  const check=(game)=>{
   assert.ok(game?.finished&&game.elapsed>0&&game.elapsed<=302,"match must complete");
   assert.ok(game.actions[1]>0&&game.actions[2]>0,"both tactical bots must issue actions");
   assert.ok(game.spent[1]>0&&game.spent[2]>0,"both tactical bots pay for cards");
   assert.ok(game.maxUnits[1]<=65&&game.maxUnits[2]<=65,"army caps must hold");
   for(const team of [1,2]){
    assert.ok(game.avgEnergy[team]>=0&&game.avgEnergy[team]<=12,"energy bounds");
    assert.ok(game.castleHp[team]>=0&&game.castleHp[team]<=3000,"castle bounds");
    assert.ok(game.fortSeconds[team]>=0&&game.fortSeconds[team]<=3*302,"fort control bounds");
   }
  };
  const replayScenario={seed:seedSets.train[0],level:"hard",mirror:false,first:1};
  const replay=await run(replayScenario);
  check(replay);
  assert.deepEqual(await run(replayScenario),replay,"seeded match must be reproducible");
  const matches=[],pairs=[];
  for(const [split,seeds] of Object.entries(seedSets)){
   for(const seed of seeds)for(const level of levels)for(const mirror of maps){
    const firstBlue=await run({seed,level,mirror,first:1});
    const firstRed=await run({seed,level,mirror,first:2});
    for(const g of [firstBlue,firstRed]){check(g);g.split=split;matches.push(g);}
    assert.deepEqual(firstBlue.initialHand,firstRed.initialHand,"same starting deck");
    assert.deepEqual(firstBlue.openingQueue,firstRed.openingQueue,"same draw order");
    pairs.push({split,seed,level,mirror,
     firstBlueWinner:firstBlue.winner,firstRedWinner:firstRed.winner,
     unchangedWinner:firstBlue.winner===firstRed.winner,
     winnerChangedWhenOrderSwapped:firstBlue.winner!==firstRed.winner});
    console.log("SELF PAIR",split,seed,level,mirror?"mirrored":"original",
     "firstBlue",firstBlue.winner,"firstRed",firstRed.winner);
   }
  }
  assert.equal(matches.length,48);
  assert.equal(pairs.length,24);
  assert.deepEqual(errors,[],"no browser page errors");
  const summary={kind:"same tactical policy on both teams, not scripted comparison",version:1,
   seedSets,levels,replayVerified:true,matchCount:matches.length,pairedOrderCount:pairs.length,
   limitations:["Map reflection mirrors fort x but not initial UI/team controls; QA only.",
    "The same policy does not eliminate deployment-order or RNG-consumption effects.",
    "Holdout is reserved for assessment, not for choosing a new heuristic.",
    "Equal-policy self-play assesses side bias and failure modes, not human win rate."],
   train:agg(matches.filter(x=>x.split==="train")),
   holdout:agg(matches.filter(x=>x.split==="holdout")),
   byLevel:Object.fromEntries(levels.map(level=>[level,agg(matches.filter(x=>x.difficulty===level))])),
   byMap:Object.fromEntries(["original","mirrored"].map((name,i)=>
    [name,agg(matches.filter(x=>x.mirrorTerrain===!!i))])),
   bySplitAndMap:Object.fromEntries(Object.keys(seedSets).map(split=>
    [split,Object.fromEntries(["original","mirrored"].map((name,i)=>
     [name,agg(matches.filter(x=>x.split===split&&x.mirrorTerrain===!!i))]))])),
   changedWinnerWithFirstOrder:pairs.filter(x=>x.winnerChangedWhenOrderSwapped).length,
   cardsByTeam:[1,2].map(team=>{
    const cards={};
    for(const game of matches)for(const [id,count] of Object.entries(game.cards[team]||{}))
     cards[id]=(cards[id]||0)+count;
    return {team,cards};
   })};
  fs.writeFileSync(path.join(output,"matches.json"),JSON.stringify(matches,null,2));
  fs.writeFileSync(path.join(output,"pairs.json"),JSON.stringify(pairs,null,2));
  fs.writeFileSync(path.join(output,"summary.json"),JSON.stringify(summary,null,2));
  console.log("SELF PLAY SUMMARY",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(error=>{console.error(error);process.exitCode=1});
