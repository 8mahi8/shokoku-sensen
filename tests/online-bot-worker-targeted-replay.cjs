"use strict";
// Replay around organic Worker-eligible decisions discovered in complete
// legacy BOT-v-BOT games, then let actual 30Hz browser frames and Worker
// advance concurrently. Candidate-selected sample: NOT representative.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-worker-targeted-replay";
fs.mkdirSync(out,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 gate=fs.readFileSync(path.join(root,"tests/online-bot-search-gate.inc.js"),"utf8"),
 bridge=fs.readFileSync(path.join(root,"tests/online-bot-worker-bridge.inc.js"),"utf8"),
 duel=fs.readFileSync(path.join(root,"tests/online-bot-worker-real-duel.inc.js"),"utf8"),
 worker=fs.readFileSync(path.join(root,"tests/online-bot-worker-prototype.js"),"utf8");
const expert="function botExpertAction(team=2){",
 tick="function tick(dt){\n if(!NET.isHost||S.phase!==\"battle\")return;",
 anchor=" window.__shokokuQa={\n";
for(const x of [expert,tick,anchor])assert.equal(game.split(x).length,2);
const patched=game.replace(expert,"\n"+gate+"\n"+bridge+"\n"+duel+"\n"+expert)
 .replace(tick,"function tick(dt){\n if(qaRealDuel?.finished)return;\n if(!NET.isHost||S.phase!==\"battle\")return;\n qaRealDuelTick(dt);")
 .replace(anchor," window.__shokokuQa={\n realDuelAudit:qaRealDuelAudit,\n realDuelStart:qaRealDuelStart,\n realDuelStop:qaRealDuelStop,\n realDuelStatus:qaRealDuelStatus,\n workerStart:qaWorkerStart,\n workerStop:qaWorkerStop,\n");
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
  await new Promise(ok=>server.listen(8899,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8899/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const discovered=[];
  for(const seed of [773,5813,6931,7807,4421]){
   const a=await page.evaluate(seed=>window.__shokokuQa.realDuelAudit(seed,true),seed);
   assert.ok(a.finished);
   const found=a.audit.samples.filter(x=>x.reason==="request"&&x.at>4&&x.at<a.world.elapsed-7);
   for(const event of found){
    const checkpoint=Math.max(0,Math.floor(event.at)-2);
    if(!discovered.some(x=>x.seed===seed&&Math.abs(x.checkpoint-checkpoint)<9))
     discovered.push({seed,checkpoint,event});
   }
  }
  const chosen=discovered.filter(x=>
   discovered.filter(y=>y.seed===x.seed).indexOf(x)<2).slice(0,8);
  assert.ok(chosen.length>=4,"Expected naturally occurring non-contact gate events");
  const pairs=[],skips=[];
  for(const target of chosen){
   const trials=[];
   for(const policy of ["off","conservativePreflight"]){
    const boot=await page.evaluate(x=>{
     const q=window.__shokokuQa;
     if(x.policy==="off")q.workerStop();
     else if(!q.workerStart(x.worker).ok)throw Error("worker unsupported");
     return q.realDuelStart(x.seed,x.checkpoint,6,120,x.policy);
    },{...target,policy,worker});
    if(!boot.ok){skips.push({target,policy,boot});continue;}
    try{
     await page.waitForFunction(()=>{
      const s=window.__shokokuQa.realDuelStatus();
      return !!s&&s.finished&&!s.pending;
     },null,{timeout:18000});
    }catch(e){
     const cur=await page.evaluate(()=>window.__shokokuQa.realDuelStatus());
     throw Error("Targeted replay timeout "+JSON.stringify({target,policy,cur,error:String(e)}));
    }
    const trial=await page.evaluate(()=>window.__shokokuQa.realDuelStop());
    if(trial.phase!=="battle"||trial.observeTicks<110){
     skips.push({target,policy,reason:"endedEarly",at:trial.world.elapsed});continue;
    }
    trials.push(trial);
   }
   if(trials.length!==2)continue;
   const base=trials.find(x=>x.policy==="off"),
    shadow=trials.find(x=>x.policy==="conservativePreflight");
   assert.deepEqual(base.entry,shadow.entry);
   assert.deepEqual(base.world,shadow.world);
   assert.deepEqual(base.gameDecisions,shadow.gameDecisions);
   pairs.push({target,baseline:{probes:base.probes,eligible:base.eligibleChecks},
    shadow:{probes:shadow.probes,eligible:shadow.eligibleChecks,
     jobs:shadow.runCalls,responses:shadow.responses}});
  }
  assert.deepEqual(errors,[]);
  assert.ok(pairs.length>=3,"insufficient reproducible targeted snapshots");
  const stats={windows:pairs.length,eligibleChecks:0,workerCalls:0,
   preflightSkips:0,accepted:0,stale:0,other:0};
  const reasons={};
  for(const pair of pairs){
   stats.eligibleChecks+=pair.shadow.eligible;
   stats.workerCalls+=pair.shadow.jobs;
   for(const x of pair.shadow.responses){
    if(x.status==="preflightSkip")stats.preflightSkips++;
    else if(["accepted","acceptedRevalidated"].includes(x.status))stats.accepted++;
    else if(x.status==="stale")stats.stale++;
    else stats.other++;
    const name=x.reason?x.status+":"+x.reason:x.status;
    reasons[name]=(reasons[name]||0)+1;
   }
  }
  const report={kind:"Worker reality check near naturally occurring legal BOT strategic forks",
   discovered:discovered.length,chosen:chosen.length,stats,reasons,pairs,skips,
   limits:[
    "These windows were deliberately selected BECAUSE complete matches had open strategic forks; adoption fraction is not unbiased.",
    "All historical games were completed with original same-seed hard BOT on both sides.",
    "The six-second windows were actually paced at browser rAF and 30Hz while Worker requests ran independently.",
    "Comparison confirms identical baseline battle outcomes (Worker ignored by gameplay).",
    "Worker is still a cheap role-scoring proxy, NOT full physics two-step search.",
    "No Safari, mobile CPU, online Firebase or full rollout win rate measured."
   ]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("BOT TARGETED WORKER REAL REPLAY SUMMARY",
   JSON.stringify({...report,pairs:pairs.map(p=>({target:p.target,
    baseline:p.baseline,
    shadow:{probes:p.shadow.probes,eligible:p.shadow.eligible,
     jobs:p.shadow.jobs,
     outcomes:p.shadow.responses.map(x=>({status:x.status,reason:x.reason}))}}))}));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
