"use strict";
// Runs seeded full-history BOT-v-BOT replays then samples ~real-time battle
// windows with the actual 30Hz engine. Worker results NEVER control a unit.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-worker-real-duel";
fs.mkdirSync(out,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 gate=fs.readFileSync(path.join(root,"tests/online-bot-search-gate.inc.js"),"utf8"),
 bridge=fs.readFileSync(path.join(root,"tests/online-bot-worker-bridge.inc.js"),"utf8"),
 duel=fs.readFileSync(path.join(root,"tests/online-bot-worker-real-duel.inc.js"),"utf8"),
 worker=fs.readFileSync(path.join(root,"tests/online-bot-worker-prototype.js"),"utf8");
const expert="function botExpertAction(team=2){",tick="function tick(dt){\n if(!NET.isHost||S.phase!==\"battle\")return;",
 anchor=" window.__shokokuQa={\n";
for(const marker of [expert,tick,anchor])
 assert.equal(game.split(marker).length,2,"QA injection anchor changed: "+marker);
const patched=game.replace(expert,"\n"+gate+"\n"+bridge+"\n"+duel+"\n"+expert)
 .replace(tick,"function tick(dt){\n if(qaRealDuel?.finished)return;\n if(!NET.isHost||S.phase!==\"battle\")return;\n qaRealDuelTick(dt);")
 .replace(anchor," window.__shokokuQa={\n realDuelStart:qaRealDuelStart,\n realDuelStop:qaRealDuelStop,\n realDuelStatus:qaRealDuelStatus,\n workerStart:qaWorkerStart,\n workerStop:qaWorkerStop,\n");
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
  await new Promise(ok=>server.listen(8897,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8897/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const pairs=[],skips=[];
  // Each checkpoint is reached by genuinely simulating the preceding
  // match with two legacy hard BOTs. Only the observation window runs at
  // real browser frame cadence, not 300 seconds wall-clock per match.
  for(const seed of [317,773])for(const checkpoint of [30,105,190]){
   const versions=[];
   for(const policy of ["off","conservativePreflight"]){
    const boot=await page.evaluate((args)=>{
     const q=window.__shokokuQa;
     if(args.policy==="off")q.workerStop();
     else{
      const w=q.workerStart(args.worker);
      if(!w.ok)throw Error("workerStart failed "+JSON.stringify(w));
     }
     return q.realDuelStart(args.seed,args.checkpoint,10,120,args.policy);
    },{seed,checkpoint,policy,worker});
    if(!boot.ok){
     assert.equal(boot.reason,"matchEndedBeforeCheckpoint",
      "Unexpected replay failure "+JSON.stringify(boot));
     skips.push({seed,checkpoint,policy,boot});continue;
    }
    await page.waitForFunction(()=>{
     const s=window.__shokokuQa.realDuelStatus();
     return !!s&&s.finished&&!s.pending;
    },{timeout:22000});
    const result=await page.evaluate(()=>window.__shokokuQa.realDuelStop());
    assert.ok(result&&result.observeTicks>200,
     "Real-time 30Hz ticks were not executed "+JSON.stringify(result));
    assert.ok(result.world.elapsed>=checkpoint+9.95);
    assert.ok(result.probes>=20,"expected repeated state-gate probes");
    assert.ok(result.responses.every(x=>
     ["accepted","acceptedRevalidated","stale","preflightSkip",
      "timeout","illegal","superseded","workerError","invalidMessage"].includes(x.status)));
    versions.push(result);
   }
   if(versions.length!==2)continue;
   const a=versions.find(v=>v.policy==="off"),
    b=versions.find(v=>v.policy==="conservativePreflight");
   assert.ok(a&&b,"missing paired arms");
   assert.deepEqual(a.entry,b.entry,
    "seeded real-world replay to checkpoint must be identical");
   assert.deepEqual(a.world,b.world,
    "only shadow worker, baseline combat game must be identical");
   assert.deepEqual(a.gameDecisions,b.gameDecisions,
    "legacy BOT decision schedule must be identical");
   pairs.push({seed,checkpoint,entry:a.entry,end:a.world,
    baseline:{probes:a.probes,eligibleChecks:a.eligibleChecks,
     skipped:a.skipped,nonEligible:a.nonEligible},
    shadow:{probes:b.probes,eligibleChecks:b.eligibleChecks,
     runCalls:b.runCalls,nonEligible:b.nonEligible,skipped:b.skipped,
     responses:b.responses}});
  }
  assert.deepEqual(errors,[],"browser JavaScript errors");
  assert.ok(pairs.length>=3,"too many checkpoint games ended before sampling");
  const counts={checked:0,eligible:0,submitted:0,accepted:0,
   preflightSkip:0,stale:0,timeout:0,other:0};
  const reasons={};const byCheckpoint={};
  for(const p of pairs){
   const s=p.shadow;
   counts.checked+=s.probes;counts.eligible+=s.eligibleChecks;
   counts.submitted+=s.runCalls;
   for(const x of s.responses){
    if(x.status==="accepted"||x.status==="acceptedRevalidated")
     counts.accepted++;
    else if(x.status==="preflightSkip")counts.preflightSkip++;
    else if(x.status==="stale")counts.stale++;
    else if(x.status==="timeout")counts.timeout++;
    else counts.other++;
    const key=x.reason?x.status+":"+x.reason:x.status;
    reasons[key]=(reasons[key]||0)+1;
   }
   const stage=String(p.checkpoint);
   byCheckpoint[stage]??={sessions:0,checked:0,eligible:0,submitted:0};
   byCheckpoint[stage].sessions++;
   byCheckpoint[stage].checked+=s.probes;
   byCheckpoint[stage].eligible+=s.eligibleChecks;
   byCheckpoint[stage].submitted+=s.runCalls;
  }
  counts.acceptancePerCompleted=counts.submitted?
   +(counts.accepted/counts.submitted*100).toFixed(1):null;
  counts.workerWorkAvoided=counts.preflightSkip;
  const report={kind:"Real BOT-vs-BOT seeded baseline matches, live 30Hz Worker-shadow windows",
   pairs:pairs.length,skips,checkpointSecs:[30,105,190],
   liveSecondsPerArm:10,workerCostMs:120,counts,reasons,byCheckpoint,pairsData:pairs,
   constraints:[
    "Each checkpoint was reached through the real engine and legal original hard BOT for BOTH teams.",
    "Only the 10s observation windows were paced at actual browser requestAnimationFrame/30Hz; replay to checkpoints was accelerated by sequential tick.",
    "Original BOT took the same action before and during both arms, while Worker results were logged only.",
    "Every original BOT battle checkpoint & 10s endpoint is asserted equal across Worker-OFF and Worker-ON.",
    "No original 300-second complete match outcome comparison; this is not a real win-rate result.",
    "No gameplay or Firebase change, no deployed code, no school Safari performance evidence.",
    "If Worker would have prevented baseline BOT acting, that is a separate production A/B requiring proper authoritative scheduling."
   ]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("WORKER REAL DUEL TELEMETRY SUMMARY",
   JSON.stringify({...report,pairsData:undefined}));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
