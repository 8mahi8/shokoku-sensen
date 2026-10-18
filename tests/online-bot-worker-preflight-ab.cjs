"use strict";
// Live 30Hz test. Never freezes physics DURING a Worker request.
// Samples different tactical configurations and pre-registered compute delays.
// Results measure eligibility, not rollout quality or win rate.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-worker-preflight-ab";
fs.mkdirSync(out,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 gate=fs.readFileSync(path.join(root,"tests/online-bot-search-gate.inc.js"),"utf8"),
 bridge=fs.readFileSync(path.join(root,"tests/online-bot-worker-bridge.inc.js"),"utf8"),
 worker=fs.readFileSync(path.join(root,"tests/online-bot-worker-prototype.js"),"utf8");
const expert="function botExpertAction(team=2){",tick="function tick(dt){",
 anchor=" window.__shokokuQa={\n";
for(const marker of [expert,tick,anchor])
 assert.equal(game.split(marker).length,2,"QA injection anchor changed: "+marker);
const patched=game.replace(expert,"\n"+gate+"\n"+bridge+"\n"+expert)
 .replace(tick,tick+"\n if(qaWorkerQaFrozen)return;")
 .replace(anchor," window.__shokokuQa={\n workerStart:qaWorkerStart,\n workerStop:qaWorkerStop,\n workerSubmit:qaWorkerSubmit,\n workerFreeze:qaWorkerFreeze,\n workerUnfreeze:qaWorkerUnfreeze,\n workerCapture:qaWorkerCapture,\n gateAssess:qaGateAssess,\n");
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(p).pipe(res);
});
const base={difficulty:"hard",elapsed:60,energy:8,enemyEnergy:6,
 hand:["tank","guardian","scout","archer"],fortOwners:[0,0,0],
 enemies:[],allies:[]};
const situations=[
 {name:"no-contact-capital-choice",changes:{}},
 {name:"neutral-fort-scout-distant",changes:{enemies:[{key:"scout",x:1020,y:444}]}},
 {name:"two-lanes-distant",changes:{enemies:[{key:"scout",x:970,y:205},
  {key:"drone",x:915,y:444}],allies:[{key:"sentinel",x:690,y:205}]}},
 {name:"air-threat-no-contact",changes:{enemies:[{key:"drone",x:890,y:444}]}},
 {name:"safe-allied-screen",changes:{enemies:[{key:"scout",x:905,y:444}],
  allies:[{key:"sentinel",x:700,y:205}]}},
 {name:"heavy-approach",changes:{enemies:[{key:"tank",x:930,y:205}]}},
 {name:"crosslane-approach",changes:{enemies:[{key:"scout",x:930,y:205}],
  allies:[{key:"sentinel",x:750,y:444}],fortOwners:[0,0,2]}},
 {name:"near-fort-contact",changes:{enemies:[{key:"scout",x:860,y:205}],
  allies:[{key:"sentinel",x:850,y:205}],fortOwners:[0,0,2]}},
 {name:"heavy-versus-defender",changes:{enemies:[{key:"guardian",x:875,y:205}],
  allies:[{key:"archer",x:835,y:205}],fortOwners:[0,0,2]}},
 {name:"two-lane-melee",changes:{enemies:[{key:"scout",x:865,y:205},
  {key:"drone",x:865,y:444}],allies:[{key:"sentinel",x:850,y:205}],
  fortOwners:[0,0,2]}},
 {name:"castle-threat-fallback",changes:{enemies:[{key:"scout",x:1120,y:205}]}},
 {name:"no-resources-fallback",changes:{energy:1.5}}
];
const workloadMs=[35,90,170,270],samples=[];
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8895,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8894/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const initialized=await page.evaluate(s=>window.__shokokuQa.workerStart(s),worker);
  assert.ok(initialized?.ok,"Worker could not initialize");
  for(const situation of situations)for(const stressMs of workloadMs)for(const mode of ["conservative","conservativePreflight"]){
   const spec={...base,...situation.changes,
    elapsed:base.elapsed+((stressMs/35)|0)*3};
   const data=await page.evaluate(async({spec,stressMs,mode})=>{
    const qa=window.__shokokuQa;
    if(!qa.setBotScenario(spec)||!qa.workerFreeze())throw Error("bad scenario");
    const prior=qa.workerCapture(2),gate=qa.gateAssess(2);
    let frames=0,started=true;const render=()=>{
     if(!started)return;frames++;requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
    qa.workerUnfreeze(); // Real 30Hz ticks continue during processing.
    const result=await qa.workerSubmit(2,stressMs,850,true,mode);
    qa.workerFreeze();started=false;
    const after=qa.workerCapture(2);
    const beforeMap=new Map(prior.units.map(u=>[u.uid,u]));
    const travel=after.units.reduce((max,u)=>{
     const old=beforeMap.get(u.uid);
     return Math.max(max,old?Math.hypot(u.x-old.x,u.y-old.y):0);
    },0);
    return {gateReason:gate.reason,gateEligible:gate.eligible,gateForks:gate.reasons,
     outcome:result.status,staleReason:result.reason??null,
     workerMs:result.workerMs??null,roundTripMs:result.elapsed??null,
     frames,gameElapsed:+(after.elapsed-prior.elapsed).toFixed(3),
     maxMove:+travel.toFixed(2),
     hpChanges:after.units.reduce((n,u)=>{
      const old=beforeMap.get(u.uid);
      return n+(old&&old.hp!==u.hp?1:0);
     },0),unitCountChanged:prior.units.length!==after.units.length};
   },{spec,stressMs,mode});
   samples.push({scene:situation.name,stressMs,mode,...data});
   if(data.gateEligible)assert.ok(["accepted","acceptedRevalidated","stale",
    "timeout","superseded","illegal","preflightSkip"].includes(data.outcome),
    "unexpected candidate status "+JSON.stringify(data));
   else assert.equal(data.outcome,"gateSkip",
    "no-strategy or urgent scenes should bypass Worker");
   // Gate-suppressed requests resolve synchronously, legitimately before
   // the browser can schedule a single render frame.
   if(data.gateEligible&&data.outcome!=="preflightSkip")assert.ok(data.frames>0,
    "render callbacks must stay responsive on workload "+JSON.stringify(data));
  }
  await page.evaluate(()=>window.__shokokuQa.workerStop());
  assert.deepEqual(errors,[]);
  const summaries=arr=>{
   const considered=arr.filter(s=>s.gateEligible),
    accepted=considered.filter(s=>["accepted","acceptedRevalidated"].includes(s.outcome));
   const by={};for(const s of arr){
    const k=s.outcome==="stale"?"stale:"+s.staleReason:s.outcome;
    by[k]=(by[k]||0)+1;
   }
   const jobs=considered.filter(s=>s.outcome!=="preflightSkip");
   return {cases:arr.length,candidates:considered.length,accepted:accepted.length,
    acceptedRate:considered.length?+(accepted.length/considered.length*100).toFixed(1):null,
    workerJobs:jobs.length,
    preflightSkipped:considered.length-jobs.length,
    reasons:by,avgFrames:+(arr.reduce((sum,x)=>sum+x.frames,0)/arr.length).toFixed(1)};
  };
  const byMode=["conservative","conservativePreflight"].map(mode=>({mode,
   ...summaries(samples.filter(s=>s.mode===mode))}));
  const byModeAndCost=["conservative","conservativePreflight"].flatMap(mode=>
   workloadMs.map(delay=>({mode,delayMs:delay,
    ...summaries(samples.filter(s=>s.mode===mode&&s.stressMs===delay))})));
  const paired=[];
  for(const scene of situations)for(const delay of workloadMs){
   const rows=samples.filter(s=>s.scene===scene.name&&s.stressMs===delay);
   const before=rows.find(s=>s.mode==="conservative"),
    after=rows.find(s=>s.mode==="conservativePreflight");
   paired.push({scene:scene.name,delayMs:delay,before:before.outcome,
    after:after.outcome,wasUseful:["accepted","acceptedRevalidated"].includes(before.outcome),
    lostUseful:["accepted","acceptedRevalidated"].includes(before.outcome)&&
     !["accepted","acceptedRevalidated"].includes(after.outcome)});
  }
  const byCost=workloadMs.map(delay=>({delayMs:delay,
   ...summaries(samples.filter(s=>s.stressMs===delay))}));
  const bySituation=situations.map(x=>({scene:x.name,
   ...summaries(samples.filter(s=>s.scene===x.name))}));
  const report={kind:"V11 QA Worker no-work preflight versus V10 baseline on paired 30Hz running scenarios",
   workloadMs,situations:situations.length,summary:summaries(samples),
   byMode,byModeAndCost,paired,byCost,bySituation,rows:samples,
   limits:["Synthetic 12-scene battleground matrix, not random full-duel sampling.",
    "Different worker loads simulated with deterministic busy work; true two-step rollout not executed.",
    "No BOT used Worker advice and no changes to public game, network or main.",
    "Real 30Hz physics and rendering continued during the outstanding request.",
    "This is headless Chromium performance, not Safari on school iPad.",
    "Pre-registered acceptance contract: <=0.30 game seconds, <12 world-px movement, no HP/fort/hand/spell changes or melee contact.",
    "Rejected decisions need immediate baseline BOT fallback rather than further synchronous search.",
    "Preflight is an opt-in experimental mode and skips work when the *same* V9 contact veto would later reject it."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("WORKER PREFLIGHT A/B SUMMARY",JSON.stringify({...report,rows:undefined}));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
