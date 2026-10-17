"use strict";
// Test-only local battles, never production matchmaking or unpublished information.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const out="qa-bot-concede-fort",root=process.cwd();
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(file).pipe(res);
});
const seeds=[17,41,73],teams=[1,2],styles=["self","rush","fortress","banker"];
const score=(r,t)=>r.winner===0?.5:r.winner===t?1:0;
const sum=(a,f)=>a.reduce((s,r)=>s+f(r),0);
const avg=(a,f)=>a.length?sum(a,f)/a.length:0;
const agg=a=>({pairs:a.length,improved:a.filter(r=>r.delta>0).length,
 worsened:a.filter(r=>r.delta<0).length,unchanged:a.filter(r=>r.delta===0).length,
 winScoreDelta:sum(a,r=>r.delta),
 considered:sum(a,r=>r.considered),threatened:sum(a,r=>r.threatened),
 candidates:sum(a,r=>r.candidates),started:sum(a,r=>r.started),
 held:sum(a,r=>r.held),counterattacks:sum(a,r=>r.counterattacks),
 cancelledDanger:sum(a,r=>r.cancelDanger),cancelledExpired:sum(a,r=>r.cancelExpired),
 cardMixChanged:a.filter(r=>JSON.stringify(r.cards)!==JSON.stringify(r.baseCards)).length,
 ownHpDelta:avg(a,r=>r.ownHp-r.baseOwnHp),
 damageDelta:avg(a,r=>r.damage-r.baseDamage),
 fortTimeDelta:avg(a,r=>r.fortTime-r.baseFortTime),
 spentDelta:avg(a,r=>r.spent-r.baseSpent)});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8818,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8818/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const scene=s=>page.evaluate(spec=>{
   if(!window.__shokokuQa.setBotScenario(spec))throw Error("invalid local test scene");
   return window.__shokokuQa.runBotOnce();
  },s);
  const spec={difficulty:"hard",elapsed:80,energy:2.5,enemyEnergy:1,
   fortOwners:[0,0,2],hand:["sentinel","guardian","tank","ward"],
   enemies:[{key:"scout",x:866,y:205},{key:"scout",x:880,y:205}],allies:[]};
  const base=await scene({...spec,variant:"baseline"});
  const hold=await scene({...spec,variant:"concedeFort"});
  assert.equal(base.action?.id,"infantry","standard bot spends emergency infantry to hold the outpost");
  assert.equal(base.spent,2);
  assert.equal(hold.action,null,"outpost can be deliberately conceded for a stronger counter");
  assert.equal(hold.spent,0,"held energy is not secretly spent");
  const noSentinel=await scene({...spec,variant:"concedeFort",
   hand:["suppress","guardian","tank","ward"]});
  assert.equal(noSentinel.action?.id,"infantry","without reserve counter in our current hand, defend normally");
  const defended=await scene({...spec,variant:"concedeFort",
   allies:[{key:"archer",x:858,y:205}]});
  assert.equal(defended.action?.id,"infantry","existing defenders do not trigger an abandonment plan");
  const castle=await scene({...spec,variant:"concedeFort",
   enemies:[{key:"scout",x:1020,y:205},{key:"scout",x:1040,y:205}]});
  assert.notEqual(castle.action,null,"castle pressure never allows a reserve hold");
  const air=await scene({...spec,variant:"concedeFort",
   enemies:[{key:"drone",x:866,y:205},{key:"drone",x:880,y:205}]});
  assert.notEqual(air.action,null,"air threats are not treated as an expendable ground fort");
  const ready=await scene({...spec,variant:"concedeFort",energy:4.1});
  assert.equal(ready.action?.id,"sentinel","funded hard counter is immediately playable");
  const low=await scene({...spec,variant:"concedeFort",energy:1});
  assert.equal(low.spent,0,"never cheat resource rules");
  const run=(q,v)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,"standard",x.mirror,
   x.variant==="baseline"?0:x.team,x.variant),{...q,variant:v});
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles)
   for(const mirror of style==="self"?[false,true]:[false]){
    const q={seed,team,style,mirror};
    const baseline=await run(q,"baseline"),candidate=await run(q,"concedeFort");
    assert.ok(baseline?.finished&&candidate?.finished,"games finish");
    assert.deepEqual(candidate.initialHand,baseline.initialHand);
    assert.deepEqual(candidate.openingQueue,baseline.openingQueue);
    for(const t of teams){
     assert.ok(Math.abs(baseline.energyActual[t]-baseline.energyEstimated[t])<1e-6);
     assert.ok(Math.abs(candidate.energyActual[t]-candidate.energyEstimated[t])<1e-6);
    }
    const ev=candidate.decisionEvents[team];
    rows.push({...q,delta:score(candidate,team)-score(baseline,team),
     baseWinner:baseline.winner,winner:candidate.winner,
     considered:ev.concedeConsidered||0,threatened:ev.concedeThreatened||0,
     candidates:ev.concedeCandidates||0,started:ev.concedeStarted||0,
     held:ev.concedeHeld||0,counterattacks:ev.concedeCounterattack||0,
     cancelDanger:ev.concedeCancelled?.danger||0,
     cancelExpired:ev.concedeCancelled?.expired||0,
     cards:candidate.cards[team],baseCards:baseline.cards[team],
     ownHp:candidate.castleHp[team],baseOwnHp:baseline.castleHp[team],
     damage:candidate.damage[3-team],baseDamage:baseline.damage[3-team],
     fortTime:candidate.fortSeconds[team],baseFortTime:baseline.fortSeconds[team],
     spent:candidate.spent[team],baseSpent:baseline.spent[team]});
   }
  assert.equal(rows.length,30);assert.deepEqual(errors,[],"no browser exceptions");
  const result={kind:"QA-only sacrifice fort to bank sentinel instead of basic infantry",
   seeds,totalGames:60,scenario:{reserve:"wait",normal:"infantry",ready:"sentinel",
    withAlly:"defend",castle:"defend",air:"defend",noReserve:"defend"},
   overall:agg(rows),
   byTeam:Object.fromEntries(teams.map(t=>[t,agg(rows.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,agg(rows.filter(r=>r.style===s))])),
   limitations:["Known training seeds only, not independent evidence.",
    "Sentinel can defend but cannot recapture a fort; this is a deliberate short-term concession.",
    "Castle counterattacks and emergency branches may cancel an active hold.",
    "Online/main and standard BOT remain unchanged."]};
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(result,null,2));
  console.log("FORT CONCESSION SUMMARY",JSON.stringify(result));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});