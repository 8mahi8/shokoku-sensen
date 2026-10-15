// Local-only reproducible duel baseline. This compares the v4 RED tactical AI
// against THREE transparent BLUE scripted strategies; NOT against itself, humans
// or the previous v3.9 AI. All runs use the real battle simulation and rules.
"use strict";
const {chromium}=require("playwright"),http=require("node:http"),fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=process.cwd(),folder="qa-bot-tournament";fs.mkdirSync(folder,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8791,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:8791/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const records=[];
  for(const policy of ["rush","balanced","fortress"]){
   for(let seed=1;seed<=6;seed++){
    // Yield between synchronous accelerated matches; avoid running draw loops.
    const game=await page.evaluate(({seed,policy})=>window.__shokokuQa.runDuel(seed*139+17,policy,"hard"),{seed,policy});
    assert.ok(game&&game.finished,"entire 300 second duel must finish");
    assert.ok(game.elapsed>0&&game.elapsed<=302, "valid match clock");
    assert.ok(game.actions[1]>0&&game.actions[2]>0,"both bots must actually play");
    assert.ok(game.spent[1]>0&&game.spent[2]>0,"both use nonfree cards");
    assert.ok(game.maxUnits[1]<=65&&game.maxUnits[2]<=65,"no hidden extra units");
    assert.ok(game.avgEnergy[1]>=0&&game.avgEnergy[2]<=12,"balanced energy bounds");
    records.push(game);
    console.log("PASS",policy,seed,"winner="+game.winner,"secs="+game.elapsed.toFixed(1),
     "blue="+game.actions[1],"red="+game.actions[2],"fort="+game.fortSeconds[2].toFixed(0));
   }
  }
  const summary={kind:"v4 RED vs scripted BLUE baseline (not symmetric self-play)",
   version:1,total:records.length,
   outcomes:{red:records.filter(r=>r.winner===2).length,blue:records.filter(r=>r.winner===1).length,
     draw:records.filter(r=>r.winner===0).length},
   byStrategy:Object.fromEntries(["rush","balanced","fortress"].map(policy=>{
    const set=records.filter(r=>r.blueStyle===policy);
    return [policy,{games:set.length,redWins:set.filter(r=>r.winner===2).length,
     blueWins:set.filter(r=>r.winner===1).length,draws:set.filter(r=>r.winner===0).length,
     redFortSecondsMean:set.reduce((n,r)=>n+r.fortSeconds[2],0)/set.length}];
   }))};
  fs.writeFileSync(path.join(folder,"matches.json"),JSON.stringify(records,null,2));
  fs.writeFileSync(path.join(folder,"summary.json"),JSON.stringify(summary,null,2));
  assert.equal(records.length,18);
  assert.deepEqual(errors,[]);
  console.log("BASELINE",JSON.stringify(summary));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
