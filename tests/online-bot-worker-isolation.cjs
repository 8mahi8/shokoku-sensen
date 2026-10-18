"use strict";
// Browser QA: Blob Web Worker can propose tactics but never spend cards.
const assert=require("node:assert/strict"),fs=require("node:fs"),
path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-worker-isolation";
fs.mkdirSync(out,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 gate=fs.readFileSync(path.join(root,"tests/online-bot-search-gate.inc.js"),"utf8"),
 bridge=fs.readFileSync(path.join(root,"tests/online-bot-worker-bridge.inc.js"),"utf8"),
 workerSource=fs.readFileSync(path.join(root,"tests/online-bot-worker-prototype.js"),"utf8");
const anchor=" window.__shokokuQa={\n",expert="function botExpertAction(team=2){";
assert.equal(game.split(anchor).length,2);assert.equal(game.split(expert).length,2);
const patched=game.replace(expert,"\n"+gate+"\n"+bridge+"\n"+expert)
 .replace(anchor," window.__shokokuQa={\n workerStart:qaWorkerStart,\n workerStop:qaWorkerStop,\n workerSubmit:qaWorkerSubmit,\n workerFreeze:qaWorkerFreeze,\n workerSignature:qaWorkerSignature,\n gateAssess:qaGateAssess,\n");
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,"http://localhost:8890"),
  p=path.resolve(root,"."+decodeURIComponent(url.pathname));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p.endsWith("online.html")&&url.searchParams.has("cspBlock"))
  res.setHeader("Content-Security-Policy","worker-src 'none'");
 if(p===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(p).pipe(res);
});
const combat={difficulty:"hard",elapsed:90,energy:7,enemyEnergy:7,
 hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
 enemies:[{key:"scout",x:860,y:205}],allies:[{key:"sentinel",x:850,y:205}]};
const prep=(page,spec)=>page.evaluate(spec=>{
 const q=window.__shokokuQa;
 if(!q.setBotScenario(spec)||!q.workerFreeze())throw Error("scenario failed");
 return {gate:q.gateAssess(2),signature:q.workerSignature(2)};
},spec);
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8890,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const pageErrors=[];page.on("pageerror",e=>pageErrors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8890/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const init=await page.evaluate(source=>window.__shokokuQa.workerStart(source),workerSource);
  assert.equal(init.ok,true,"Blob worker initialized");
  const results={init,scenarios:[],tests:{}};
  for(const spec of [
   {name:"no-resources",value:{...combat,energy:1.1},reason:"insufficientEnergy"},
   {name:"strategic-fort",value:combat,reason:"candidate"},
   {name:"castle-emergency",value:{...combat,
    enemies:[{key:"scout",x:1125,y:205}]},reason:"urgentCastleThreat"}
  ]){
   const s=await prep(page,spec.value);
   assert.equal(s.gate.reason,spec.reason);
   const result=await page.evaluate(()=>window.__shokokuQa.workerSubmit(2,0,600,true));
   if(spec.reason==="candidate")assert.equal(result.status,"accepted");
   else assert.equal(result.status,"gateSkip");
   results.scenarios.push({name:spec.name,gate:s.gate.reason,
    worker:result.status,winner:result.chosen?.id??null});
  }
  await prep(page,combat);
  const baselineSig=await page.evaluate(()=>window.__shokokuQa.workerSignature(2));
  const responsive=await page.evaluate(async()=>{
   let frames=0,active=true;
   const tick=()=>{frames++;if(active)requestAnimationFrame(tick);};
   requestAnimationFrame(tick);
   const result=await window.__shokokuQa.workerSubmit(2,270,1200,true);
   active=false;return {frames,result};
  });
  assert.equal(responsive.result.status,"accepted");
  assert.ok(responsive.frames>=5,"render callbacks continued while worker computed");
  assert.ok(responsive.result.workerMs>=240,"worker actually performed CPU stress");
  assert.equal(await page.evaluate(()=>window.__shokokuQa.workerSignature(2)),baselineSig,
   "accepted worker result cannot mutate the game state");
  results.tests.responsiveness={frames:responsive.frames,workerMs:responsive.result.workerMs,
   roundTripMs:responsive.result.elapsed,candidates:responsive.result.examined,
   chosen:responsive.result.chosen};
  await prep(page,combat);
  const stale=await page.evaluate(async()=>{
   const q=window.__shokokuQa,task=q.workerSubmit(2,220,1000,true);
   await new Promise(resolve=>setTimeout(resolve,15));
   if(!q.progressBotScenario({elapsed:91,energy:4,fortOwners:[0,0,2]}))
    throw Error("unable to advance authoritative state");
   return task;
  });
  assert.equal(stale.status,"stale","old-world result must be rejected");
  results.tests.stale=stale.status;
  await prep(page,combat);
  const superseded=await page.evaluate(async()=>{
   const q=window.__shokokuQa,first=q.workerSubmit(2,140,900,true),
    second=q.workerSubmit(2,0,1200,true);
   return Promise.all([first,second]);
  });
  assert.equal(superseded[0].status,"superseded");
  assert.equal(superseded[1].status,"accepted");
  results.tests.superseded=superseded.map(x=>x.status);
  await prep(page,combat);
  const timeout=await page.evaluate(()=>window.__shokokuQa.workerSubmit(2,260,20,true));
  assert.equal(timeout.status,"timeout","worker deadline causes fallback");
  results.tests.timeout=timeout.status;
  const reinit=await page.evaluate(source=>window.__shokokuQa.workerStart(source),workerSource);
  assert.equal(reinit.ok,true,"worker can be recreated after timeout");
  await prep(page,combat);
  const restored=await page.evaluate(()=>window.__shokokuQa.workerSubmit(2,0,700,true));
  assert.equal(restored.status,"accepted");
  results.tests.recovered=restored.status;
  await page.evaluate(()=>window.__shokokuQa.workerStop());
  assert.deepEqual(pageErrors,[]);
  const blocked=await browser.newPage({viewport:{width:1194,height:834}});
  await blocked.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await blocked.goto("http://127.0.0.1:8890/online.html?qa=1&cspBlock=1",
   {waitUntil:"domcontentloaded"});
  await blocked.locator("#netSolo").click();
  await blocked.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const state=await blocked.evaluate(source=>window.__shokokuQa.workerStart(source),workerSource);
  await prep(blocked,combat);
  const fail=state.ok?await blocked.evaluate(()=>window.__shokokuQa.workerSubmit(
   2,0,200,true)):{status:"blockedAtConstruction"};
  assert.notEqual(fail.status,"accepted","restrictive CSP cannot run Blob worker");
  results.tests.restrictiveCSP={start:state.ok?"started":"blocked",status:fail.status};
  await blocked.close();
  const report={kind:"Real game snapshot to Blob Worker coarse proposal, QA-only",
   ...results,limitations:["Worker tactical ranking is a cheap role-aware PROXY, not 30Hz physics.",
    "No normal BOT changes, no purchases, no Firebase changes.",
    "Only Chromium CI; not measured on school Safari/Google Sites.",
    "Any stale snapshot is rejected; main game has sole action authority.",
    "Restrictive CSP blocks Blob workers: fallback must remain operational.",
    "270ms synthetic CPU stress runs in worker while animation callbacks continue."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("BOT WORKER ISOLATION SUMMARY",JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
