"use strict";
// Complete, deterministic BOT-v-BOT full-match gate / preflight audit.
// The observer only reads real battle state; it cannot issue Worker actions.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-worker-full-match";
fs.mkdirSync(out,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 gate=fs.readFileSync(path.join(root,"tests/online-bot-search-gate.inc.js"),"utf8"),
 bridge=fs.readFileSync(path.join(root,"tests/online-bot-worker-bridge.inc.js"),"utf8"),
 duel=fs.readFileSync(path.join(root,"tests/online-bot-worker-real-duel.inc.js"),"utf8");
const expert="function botExpertAction(team=2){",
 tick="function tick(dt){\n if(!NET.isHost||S.phase!==\"battle\")return;",
 anchor=" window.__shokokuQa={\n";
for(const m of [expert,tick,anchor])assert.equal(game.split(m).length,2);
const patched=game.replace(expert,"\n"+gate+"\n"+bridge+"\n"+duel+"\n"+expert)
 .replace(tick,"function tick(dt){\n if(qaRealDuel?.finished)return;\n if(!NET.isHost||S.phase!==\"battle\")return;\n qaRealDuelTick(dt);")
 .replace(anchor," window.__shokokuQa={\n realDuelAudit:qaRealDuelAudit,\n");
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
  await new Promise(ok=>server.listen(8898,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8898/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const seeds=[317,521,773,1049,2039,2707,3301,4421,5813,6931,7807,8803];
  const games=[];
  for(const seed of seeds){
   const [base,audit]=await page.evaluate(seed=>{
    const q=window.__shokokuQa;
    return [q.realDuelAudit(seed,false),q.realDuelAudit(seed,true)];
   },seed);
   assert.ok(base.finished&&audit.finished,
    "Full 300s battle or castle victory required "+JSON.stringify({seed,base,audit}));
   assert.deepEqual(base.world,audit.world,
    "Full match ended differently when adding observer");
   assert.deepEqual(base.decisions,audit.decisions,
    "Legacy expert decision count changed under shadow observer");
   const a=audit.audit;assert.ok(a&&a.decisions>0);
   assert.ok(a.preflight+a.predictedRequest===a.eligible);
   assert.ok(a.eligible<=a.decisions);
   games.push({seed,at:audit.world.elapsed,finalHp:audit.world.capitalHp,
    units:audit.world.units,decisions:a.decisions,
    eligible:a.eligible,preflight:a.preflight,
    possibleWorkerJobs:a.predictedRequest,
    gates:a.gates,events:a.samples});
  }
  assert.deepEqual(errors,[]);
  const sum={decisions:0,eligible:0,preflight:0,possibleWorkerJobs:0};
  const gates={};let endedBefore190=0;
  for(const g of games){
   for(const k of Object.keys(sum))sum[k]+=g[k];
   if(g.at<190)endedBefore190++;
   for(const [key,v] of Object.entries(g.gates))
    gates[key]=(gates[key]||0)+v;
  }
  sum.eligibleRatePercent=+(100*sum.eligible/sum.decisions).toFixed(2);
  sum.workerCandidateRatePercent=+(100*sum.possibleWorkerJobs/sum.decisions).toFixed(2);
  sum.preflightSharePercent=sum.eligible?
   +(100*sum.preflight/sum.eligible).toFixed(2):null;
  const report={kind:"12 actual seeded complete BOT-vs-BOT games with gate and preflight observer",
   gameCount:games.length,seedSet:seeds,
   note:"The SAME complete match was replayed twice per seed; result state matched exactly.",
   earlyFinishedBefore190:endedBefore190,sum,gates,games,
   constraints:[
    "Every tick is the existing 30Hz battle engine; matches run accelerated in a synchronous loop, NOT at real-wall-clock fps.",
    "Every action is the existing legal expert BOT, with identical seeded RNG and side start.",
    "No Worker request was made; this audit counts requests that would pass gate/preflight.",
    "This is an observational comparison; successful gate doesn't prove Worker result would remain valid later.",
    "The real-time 10s Worker shadow test is a separate workflow.",
    "No player online/Firebase source changed; no code deployed to main."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("BOT FULL MATCH GATE AUDIT SUMMARY",
   JSON.stringify({...report,games:games.map(({events,...x})=>({...x,
    exampleCount:events.length}))}));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
