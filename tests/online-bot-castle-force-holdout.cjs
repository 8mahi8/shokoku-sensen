"use strict";
// V7 one-time preregistered holdout. Runs ordinary 30Hz full games.
// Does not change BOT behavior or leak these future labels into training.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-castle-force-holdout";
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(file).pipe(res);
});
const seeds=[20261021,20261031,20261117,20261201,20270107,20270219],
 teams=[1,2],styles=["self","rush","balanced","fortress","banker"];
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8869,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8869/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles){
   const qs=style==="self"?[{mirror:false,cadence:"standard"},
    {mirror:true,cadence:"standard"}]:[{mirror:false,cadence:"standard"},
    {mirror:false,cadence:"fast"}];
   for(const opts of qs){
    const q={seed,team,style,...opts};
    const game=await page.evaluate(x=>window.__shokokuQa.runDuel(
     x.seed,x.style,"hard",x.team,x.cadence,x.mirror,x.team,
     "fortDefenseValue",true),q);
    assert.ok(game?.finished&&game.elapsed>0);
    assert.ok(Array.isArray(game.forecastAudit)&&game.forecastAudit.length>0);
    assert.ok(Math.abs(game.energyActual[team]-game.energyEstimated[team])<1e-6);
    assert.ok(game.forecastAudit.every(w=>w.prePower&&w.preThreat&&
     Number.isFinite(w.prePower.activeThreatHp)&&w.actual>=0));
    rows.push({...q,elapsed:game.elapsed,winner:game.winner,
     windows:game.forecastAudit});
   }
  }
  assert.deepEqual(errors,[]);
  assert.equal(rows.length,120);
  fs.writeFileSync(path.join(out,"windows.json"),JSON.stringify(rows,null,2));
  console.log("FORCE HOLDOUT GAMES",JSON.stringify({
   games:rows.length,seeds,windows:rows.reduce((a,r)=>a+r.windows.length,0)}));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});