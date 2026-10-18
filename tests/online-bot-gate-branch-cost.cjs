"use strict";
// Optional real 30Hz shadow branch workload: no choices fed to actual BOT.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-gate-branch-cost";
fs.mkdirSync(out,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 helper=fs.readFileSync(path.join(root,"tests/online-bot-search-gate.inc.js"),"utf8");
const anchor=" window.__shokokuQa={\n",expert="function botExpertAction(team=2){";
assert.equal(game.split(anchor).length,2);assert.equal(game.split(expert).length,2);
const patched=game.replace(expert,"\n"+helper+"\n"+expert+"\n qaGateOnDecision(team);")
 .replace(anchor," window.__shokokuQa={\n gatePaired:qaGateRunPaired,\n");
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(p).pipe(res);
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8889,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8889/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const styles=["rush","balanced","fortress","banker","self"],cases=[];
  for(const style of styles)for(const side of [1,2]){
   const seed=side===1?241:293;
   const x=await page.evaluate(p=>
    window.__shokokuQa.gatePaired(p.seed,p.style,p.side,true),
    {seed,style,side});
   assert.deepEqual(x.baseline,x.shadow,
    "heavy read-only probes must have ZERO effect on matched duel outcomes");
   const g=x.gate[side];
   assert.ok(g.selected<=g.eligible);
   assert.ok(g.probes.length<=6);
   for(const p of g.probes){
    const m=p.measurement;
    assert.ok(m.skipped||(Number.isFinite(m.ms)&&m.ms>=0&&
     m.frames>0&&m.frames<=480&&m.alternatives>=1));
   }
   cases.push({style,side,seed,decisions:g.decisions,eligible:g.eligible,
    selected:g.selected,probes:g.probes});
  }
  assert.deepEqual(errors,[]);
  const measurements=cases.flatMap(x=>x.probes.map(p=>p.measurement))
   .filter(x=>!x.skipped);
  const vals=measurements.map(x=>x.ms).sort((a,b)=>a-b);
  const q=p=>vals.length?vals[Math.min(vals.length-1,
   Math.ceil(vals.length*p)-1)]:null;
  const report={
   kind:"Paired-duel shadow-only 8s branch physics cost, main-thread Chromium QA",
   pairs:cases.length,decisions:cases.reduce((v,c)=>v+c.decisions,0),
   eligible:cases.reduce((v,c)=>v+c.eligible,0),
   selected:cases.reduce((v,c)=>v+c.selected,0),
   measuredProbes:measurements.length,skippedTerminal:cases.flatMap(x=>x.probes)
    .filter(p=>p.measurement.skipped).length,
   ms:{min:vals[0]??null,p50:q(.50),p90:q(.90),p95:q(.95),max:vals.at(-1)??null},
   frames:measurements.reduce((v,c)=>v+c.frames,0),cases,
   limits:["This is a TWO-branch 8s physics cost probe, not full portfolio decision search.",
    "Measurements are synchronous JavaScript on headless Linux Chromium, not iPad Safari.",
    "Even rare >16.7ms long tasks can visibly stall the main thread; do not integrate synchronously.",
    "No candidate action was used in the real match, no game outcomes changed.",
    "Browser/online game files and published main remain unchanged."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("GATE PROBE COST SUMMARY",JSON.stringify({...report,cases:report.cases.map(
   ({probes,...rest})=>({...rest,probeCount:probes.length}))}));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
