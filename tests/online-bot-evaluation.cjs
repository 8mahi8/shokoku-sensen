// Paired, seeded RED/BLUE tactical BOT evaluation: train vs unseen holdout.
// The opponent policies are simple scripts, NOT tactical BOT self-play.
"use strict";
const {chromium}=require("playwright");
const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const assert=require("node:assert/strict");
const root=process.cwd(),folder="qa-bot-evaluation";
fs.mkdirSync(folder,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const seeds={train:[17,41,73],holdout:[2003,2017,2063]};
const styles=["rush","balanced","fortress"];
function mean(values){return values.length?values.reduce((total,n)=>total+n,0)/values.length:null;}
function sideStats(games,team){
 return {games:games.length,wins:games.filter(g=>g.winner===team).length,
  losses:games.filter(g=>g.winner===3-team).length,
  draws:games.filter(g=>g.winner===0).length,
  avgEnergy:mean(games.map(g=>g.avgEnergy[team])),
  avgActions:mean(games.map(g=>g.actions[team])),
  avgSpent:mean(games.map(g=>g.spent[team])),
  avgFortSeconds:mean(games.map(g=>g.fortSeconds[team])),
  avgCastleHp:mean(games.map(g=>g.castleHp[team]))};
}
function report(games){
 const wins=games.filter(g=>g.winner===g.tacticalTeam).length;
 return {
  games:games.length,tacticalWins:wins,
  tacticalLosses:games.filter(g=>g.winner===g.scriptedTeam).length,
  draws:games.filter(g=>g.winner===0).length,
  tacticalWinRate:wins/games.length,
  tacticalAsBlue:sideStats(games.filter(g=>g.tacticalTeam===1),1),
  tacticalAsRed:sideStats(games.filter(g=>g.tacticalTeam===2),2),
  byStyle:Object.fromEntries(styles.map(style=>{
   const rows=games.filter(g=>g.blueStyle===style);
   return [style,{games:rows.length,tacticalWinRate:
    rows.filter(g=>g.winner===g.tacticalTeam).length/rows.length,
    tacticalBlue:sideStats(rows.filter(g=>g.tacticalTeam===1),1),
    tacticalRed:sideStats(rows.filter(g=>g.tacticalTeam===2),2)}];
  }))
 };
}
function riskSignals(g){
 const t=g.tacticalTeam,opponent=g.scriptedTeam,tags=[];
 // Indicators for investigation only; NOT causal diagnoses.
 if(g.winner!==t&&g.avgEnergy[t]>=7)tags.push("loss_with_high_reserve");
 if(g.winner!==t&&g.fortSeconds[t]<g.fortSeconds[opponent]*.6)
  tags.push("loss_with_low_fort_control");
 if(g.winner!==t&&!g.cards[t]?.archer&&g.cards[opponent]?.drone)
  tags.push("loss_without_anti_air_card_use");
 return tags;
}
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8792,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8792/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(seed,style,team)=>page.evaluate(({seed,style,team})=>
   window.__shokokuQa.runDuel(seed,style,"hard",team),{seed,style,team});
  const replay=await run(seeds.train[0],"balanced",1);
  assert.deepEqual(await run(seeds.train[0],"balanced",1),replay,
   "same scenario must replay exactly");
  const matches=[],pairs=[];
  for(const [split,values] of Object.entries(seeds)){
   for(const style of styles)for(const seed of values){
    const blue=await run(seed,style,1),red=await run(seed,style,2);
    for(const g of [blue,red]){
     assert.ok(g?.finished&&g.elapsed>0&&g.elapsed<=302,"complete match");
     assert.ok(g.actions[1]>0&&g.actions[2]>0,"both sides take actions");
     assert.ok(g.spent[1]>0&&g.spent[2]>0,"both sides use paid cards");
     assert.ok(g.maxUnits[1]<=65&&g.maxUnits[2]<=65,"unit caps");
     assert.ok([1,2].every(t=>g.avgEnergy[t]>=0&&g.avgEnergy[t]<=12),"energy bounds");
     g.split=split;g.riskSignals=riskSignals(g);matches.push(g);
    }
    assert.deepEqual(blue.initialHand,red.initialHand,"paired initial hands");
    assert.deepEqual(blue.openingQueue,red.openingQueue,"paired starting decks");
    pairs.push({split,style,seed,
     tacticalBlueWon:blue.winner===1,tacticalRedWon:red.winner===2,
     blueTacticalMatchWinner:blue.winner,redTacticalMatchWinner:red.winner,
     category:blue.winner===1&&red.winner===2?"both_tactical_win":
      blue.winner===2&&red.winner===1?"both_tactical_lose":"side_or_rng_sensitive"});
    console.log("PAIR",split,style,seed,"BLUE",blue.winner,"RED",red.winner);
   }
  }
  assert.equal(matches.length,36);
  assert.equal(pairs.length,18);
  assert.deepEqual(errors,[],"page errors");
  const summary={
   kind:"paired tactical BOT vs scripted opponents (not tactical self-play)",
   version:2,seedSets:seeds,styles,replayVerified:true,
   limitations:["Tactical and scripted policies have different capabilities.",
    "Fort positions and opening deployment Y are not perfectly mirror symmetric.",
    "Swapped factions may consume PRNG values in a different order.",
    "Do not use these outcomes for player-skill or card balance claims."],
   train:report(matches.filter(g=>g.split==="train")),
   holdout:report(matches.filter(g=>g.split==="holdout")),
   pairs:pairs.length,
   riskSignalCounts:Object.fromEntries(
    ["loss_with_high_reserve","loss_with_low_fort_control","loss_without_anti_air_card_use"]
     .map(tag=>[tag,matches.filter(g=>g.riskSignals.includes(tag)).length]))};
  fs.writeFileSync(path.join(folder,"matches.json"),JSON.stringify(matches,null,2));
  fs.writeFileSync(path.join(folder,"pairs.json"),JSON.stringify(pairs,null,2));
  fs.writeFileSync(path.join(folder,"summary.json"),JSON.stringify(summary,null,2));
  console.log("PAIRED EVALUATION",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
