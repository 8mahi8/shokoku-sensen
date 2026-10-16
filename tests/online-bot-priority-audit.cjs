// Observational diagnosis of decision order. No candidate-policy tuning.
"use strict";
const assert=require("node:assert/strict"),http=require("node:http"),
 fs=require("node:fs"),path=require("node:path"),{chromium}=require("playwright");
const dir="qa-bot-priority-audit",root=process.cwd();fs.mkdirSync(dir,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const sum=(o)=>Object.values(o).reduce((a,b)=>a+b,0);
const collect=(objects,key)=>objects.reduce((a,b)=>a+(b[key]||0),0);
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8800,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8800/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=({seed,style,team,mirror=false})=>page.evaluate(x=>
   window.__shokokuQa.runDuel(x.seed,x.style,"hard",x.team,
    "standard",x.mirror),{seed,style,team,mirror});
  const games=[],audits=[];
  const seeds=[17,41,73];
  const requests=[];
  for(const seed of seeds)for(const team of [1,2]){
   for(const mirror of [false,true])requests.push({seed,style:"self",team,mirror});
   for(const style of ["rush","balanced","banker"])
    requests.push({seed,style,team,mirror:false});
  }
  for(const q of requests){
   const g=await run(q);
   assert.ok(g?.finished,"real match completes");
   assert.ok(g.decisionAudit?.length===3,"decision audit initialized");
   for(const side of [1,2]){
    const a=g.decisionAudit[side];
    assert.equal(sum(a.byPhase),a.calls,"each decision has exactly one phase");
    assert.equal(sum(a.byEnergy),a.calls,"each decision has exactly one resource bucket");
    assert.equal(sum(a.byCard),a.calls,"each decision has exactly one outcome");
    assert.ok(a.samples.length<=40,"bounded traces");
    assert.ok(a.tankFundedOpportunity<=a.tankFrontlineOpportunity);
    assert.ok(a.tankDeferredByCheapPlay<=a.tankFrontlineOpportunity);
    const choices=sum(Object.fromEntries(Object.entries(a.byCard).filter(([card])=>card!=="none")));
    if(q.style==="self"||side===q.team){
     assert.ok(a.calls>0,"expert BOT must act");
     assert.equal(choices,g.actions[side]-1,"every non-opening expert play is audited");
    }else{
     assert.equal(a.calls,0,"scripted side should not produce expert audit");
    }
    if(a.calls)audits.push({seed:q.seed,style:q.style,team:q.team,mirror:q.mirror,
     side,winner:g.winner,...a});
   }
   games.push({seed:q.seed,style:q.style,team:q.team,mirror:q.mirror,
    winner:g.winner,elapsed:g.elapsed,actions:g.actions,spent:g.spent,
    castleHp:g.castleHp});
  }
  assert.equal(games.length,requests.length);
  assert.deepEqual(await run(requests[0]),await run(requests[0]),
   "audit cannot change seeded replay");
  assert.deepEqual(errors,[],"no browser errors");
  const aggregate=(set)=>({
   games:set.length,decisions:collect(set,"calls"),tankInHand:collect(set,"tankInHand"),
   tankUnaffordable:collect(set,"tankUnaffordable"),
   tankFrontlineOpportunity:collect(set,"tankFrontlineOpportunity"),
   tankFundedOpportunity:collect(set,"tankFundedOpportunity"),
   tankDeferredByCheapPlay:collect(set,"tankDeferredByCheapPlay"),
   enemyResourceWindow:collect(set,"enemyResourceWindow"),
   byPhase:set.reduce((a,r)=>{
    for(const [k,v] of Object.entries(r.byPhase))a[k]=(a[k]||0)+v;
    return a;
   },{}),
   byEnergy:set.reduce((a,r)=>{
    for(const [k,v] of Object.entries(r.byEnergy))a[k]=(a[k]||0)+v;
    return a;
   },{}),
   byCard:set.reduce((a,r)=>{
    for(const [k,v] of Object.entries(r.byCard))a[k]=(a[k]||0)+v;
    return a;
   },{}),
   phaseCards:set.reduce((a,r)=>{
    for(const [phase,choices] of Object.entries(r.phaseCards)){
     if(!a[phase])a[phase]={};
     for(const [card,n] of Object.entries(choices))a[phase][card]=(a[phase][card]||0)+n;
    }
    return a;
   },{})
  });
  const summary={version:1,kind:"Observational expert card-priority audit, NOT A/B",
   scenarios:games.length,observedExpertSides:audits.length,seeds,
   overall:aggregate(audits),
   byStyle:Object.fromEntries(["self","rush","balanced","banker"].map(style=>
    [style,aggregate(audits.filter(r=>r.style===style))])),
   byTeam:Object.fromEntries([1,2].map(team=>[team,aggregate(audits.filter(r=>r.side===team))])),
   limitations:["Only observable decision conditions; no counterfactual match result.",
    "Samples capped to 40 per game per side, counters count all decisions.",
    "Openings from generic QA setup excluded from expert audit.",
    "No BOT policy/energy/card-stat changes; not holdout validation."]};
  fs.writeFileSync(path.join(dir,"matches.json"),JSON.stringify(games,null,2));
  fs.writeFileSync(path.join(dir,"decisions.json"),JSON.stringify(audits,null,2));
  fs.writeFileSync(path.join(dir,"summary.json"),JSON.stringify(summary,null,2));
  console.log("BOT PRIORITY AUDIT SUMMARY",JSON.stringify(summary));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
