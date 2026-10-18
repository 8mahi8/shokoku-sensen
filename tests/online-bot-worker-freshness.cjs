"use strict";
// QA-only freshness contract, attached to the same local real-engine closure.
// Test deliberate benign aging, critical threats, and a genuinely running tick.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-worker-freshness";
fs.mkdirSync(out,{recursive:true});
const original=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 gate=fs.readFileSync(path.join(root,"tests/online-bot-search-gate.inc.js"),"utf8"),
 bridge=fs.readFileSync(path.join(root,"tests/online-bot-worker-bridge.inc.js"),"utf8"),
 source=fs.readFileSync(path.join(root,"tests/online-bot-worker-prototype.js"),"utf8");
const anchor=" window.__shokokuQa={\n",expert="function botExpertAction(team=2){",
 tickAnchor="function tick(dt){";
for(const needle of [anchor,expert,tickAnchor])
 assert.equal(original.split(needle).length,2,"anchor changed "+needle);
const game=original.replace(expert,"\n"+gate+"\n"+bridge+"\n"+expert)
 .replace(tickAnchor,tickAnchor+"\n if(qaWorkerQaFrozen)return;")
 .replace(anchor," window.__shokokuQa={\n workerStart:qaWorkerStart,\n workerStop:qaWorkerStop,\n workerSubmit:qaWorkerSubmit,\n workerFreeze:qaWorkerFreeze,\n workerUnfreeze:qaWorkerUnfreeze,\n workerSignature:qaWorkerSignature,\n workerPerturb:qaWorkerPerturb,\n gateAssess:qaGateAssess,\n");
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p===path.join(root,"online-game.js")){res.end(game);return;}
 fs.createReadStream(p).pipe(res);
});
const scene={difficulty:"hard",elapsed:90,energy:7,enemyEnergy:7,
 hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
 enemies:[{key:"scout",x:860,y:205}],allies:[{key:"sentinel",x:850,y:205}]};
const quiet={difficulty:"hard",elapsed:48,energy:8,enemyEnergy:8,
 hand:["tank","guardian","scout","archer"],fortOwners:[0,0,0],
 enemies:[],allies:[]};
const benignScene={...quiet,enemies:[{key:"scout",x:905,y:444}],
 allies:[{key:"sentinel",x:700,y:205}]};
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8891,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8891/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  assert.equal((await page.evaluate(s=>window.__shokokuQa.workerStart(s),source)).ok,true);
  const prep=spec=>page.evaluate(x=>{
   const q=window.__shokokuQa;
   if(!q.setBotScenario(x)||!q.workerFreeze())throw Error("invalid QA scene");
   if(!q.gateAssess(2).eligible)throw Error("not a candidate");
   return q.workerSignature(2);
  },spec);
  const attempt=(name,mutation,mode="conservative")=>page.evaluate(async p=>{
   const q=window.__shokokuQa;
   const pending=q.workerSubmit(2,90,750,true,p.mode);
   await new Promise(resolve=>setTimeout(resolve,12));
   if(!q.workerPerturb(p.mutation,2))throw Error("mutation rejected");
   return pending;
  },{name,mutation,mode});
  const rows=[];
  for(const entry of [
   {label:"benign drift strict",mutation:"benign",mode:"strict",fixture:"benignScene",expected:"stale",reason:"strictSignatureChanged"},
   {label:"benign movement and regen",mutation:"benign",mode:"conservative",fixture:"benignScene",expected:"acceptedRevalidated",reason:"benignMovementAndRegen"},
   {label:"contact without immediate hit",mutation:"benign",fixture:"scene",expected:"stale",reason:"combatContact"},
   {label:"fort capture",mutation:"fort",expected:"stale",reason:"fortChanged"},
   {label:"castle hit",mutation:"castle",expected:"stale",reason:"castleChanged"},
   {label:"card rotation",mutation:"card",expected:"stale",reason:"cardsChanged"},
   {label:"unexplained spend",mutation:"energy",expected:"stale",reason:"unexpectedEnergy"},
   {label:"unit hurt",mutation:"hp",expected:"stale",reason:"unitHpChanged"},
   {label:"enemy reinforcement",mutation:"spawn",expected:"stale",reason:"unitCountChanged"},
   {label:"enemy fast reposition",mutation:"largeMove",expected:"stale",reason:"unitMovement"},
   {label:"old proposal",mutation:"age",expected:"stale",reason:"age"}
  ]){
   await prep(entry.fixture==="benignScene"?benignScene:scene);
   const result=await attempt(entry.label,entry.mutation,entry.mode);
   assert.equal(result.status,entry.expected,entry.label+" status: "+JSON.stringify(result));
   assert.equal(result.reason||result.freshness,entry.reason,entry.label);
   rows.push({...entry,actual:result.status,latencyMs:result.elapsed});
  }
  // A live, actively contested fort is too unstable for the short
  // relaxation; contact must be rejected EVEN BEFORE HP actually changes.
  await prep(scene);
  const combatLive=await page.evaluate(async()=>{
   const q=window.__shokokuQa;
   q.workerUnfreeze();
   const result=await q.workerSubmit(2,120,900,true,"conservative");
   q.workerFreeze();
   return result;
  });
  assert.equal(combatLive.status,"stale",
   "active contact during a real battle must never be reused");
  // Realtime: DO NOT freeze tick. The battle clock & energy genuinely
  // advance every 1/30s, while the worker computes. There is no HP clash.
  const live=[];
  for(let i=0;i<3;i++){
   await prep(quiet);
   const result=await page.evaluate(async ()=>{
    const q=window.__shokokuQa;
    if(!q.workerUnfreeze())throw Error("cannot start real ticks");
    const before=q.workerSignature(2),t=performance.now();
    const proposal=await q.workerSubmit(2,120,800,true,"conservative");
    const after=q.workerSignature(2);
    q.workerFreeze();
    return {proposal,changed:before!==after,elapsed:performance.now()-t};
   });
   assert.equal(result.proposal.status,"acceptedRevalidated",
    "Natural battle ticks/regen should safely revalidate: "+JSON.stringify(result));
   assert.ok(result.changed,"actual 30Hz battle state advanced");
   live.push({status:result.proposal.status,workerMs:result.proposal.workerMs,
    roundTripMs:result.proposal.elapsed,changed:result.changed});
  }
  await page.evaluate(()=>window.__shokokuQa.workerStop());
  assert.deepEqual(errors,[]);
  const report={kind:"Host-side conservative Worker freshness contract on real game engine",
   entries:rows.length,rows,naturalLiveTicks:live,activeCombatLive:combatLive,
   safety:["All critical HP/fort/hand/energy/roster changes vetoed",
    "Short benign deterministic movement and naturally regenerated energy allowed",
    "Worker did not purchase, spend, move, or issue any online commands",
    "3 real unfrozen Chromium battle-clock cases, not iPad Safari tests",
    "This is a cheap role-ranker, NOT the actual future 30Hz two-step search",
    "No automatic Worker result application to BOT; QA-only validation."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("WORKER FRESHNESS SUMMARY",JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
