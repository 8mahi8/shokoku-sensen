"use strict";
// Observational QA-only route coverage audit. Never modifies committed game logic.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-route-coverage-audit";
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,"online-game.js"),"utf8");
const needle='   tally("mapDecisions");';
assert.equal(source.split(needle).length,2,"QA instrumentation anchor changed");
const injected=source.replace(needle,needle+`
   // QA audit only: report whether the current X/Y capture-unit heuristic
   // agrees with actual unit targeting (getFort) and practical proximity.
   if(fort){
    const need=S.elapsed<40?1:2;
    const workers=friends.filter(u=>CLASSES[u.key].capture);
    const heuristic=workers.filter(u=>front(u.x)>front(fort.x)-175&&
     Math.abs(u.y-fort.y)<135);
    const route=workers.filter(u=>getFort(u)===fort);
    const routeNear=route.filter(u=>Math.abs(u.x-fort.x)<=300&&
     Math.abs(u.y-fort.y)<135);
    const tallyCoverage=name=>{event[name]=(event[name]||0)+1;};
    tallyCoverage("routeFortObserved");
    if(heuristic.length>=need)tallyCoverage("routeHeuristicCovered");
    if(route.length>=need)tallyCoverage("routeAssignedCovered");
    if(routeNear.length>=need)tallyCoverage("routeNearCovered");
    if(heuristic.length>=need&&route.length<need)
     tallyCoverage("routeWrongAssignment");
    if(heuristic.length>=need&&routeNear.length<need)
     tallyCoverage("routePhantomCoverage");
    if(heuristic.length<need&&routeNear.length>=need)
     tallyCoverage("routeMissedCoverage");
    if(heuristic.length>=need&&route.length>=need&&routeNear.length<need)
     tallyCoverage("routeTooDistant");
    if(heuristic.length>=need&&routeNear.length<need){
     const samples=event.routeCoverageSamples||(event.routeCoverageSamples=[]);
     if(samples.length<18)samples.push({at:+S.elapsed.toFixed(2),
      energy:+power.toFixed(2),need,heuristic:heuristic.length,route:route.length,
      nearby:routeNear.length,fortX:+fort.x.toFixed(1),
      fortY:+fort.y.toFixed(1),hand:S.hand[team].slice(),
      workers:workers.slice(0,8).map(u=>({kind:u.key,
       x:+u.x.toFixed(1),y:+u.y.toFixed(1),
       target:getFort(u)?.x??null})),scoutReady:canPay(team,"scout"),
      engineerReady:canPay(team,"engineer")});
    }
   }
`);
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p===path.join(root,"online-game.js")){res.end(injected);return;}
 fs.createReadStream(p).pipe(res);
});
const seeds=[17,41,73],teams=[1,2],styles=["self","rush","fortress","banker"];
const counters=["routeFortObserved","routeHeuristicCovered","routeAssignedCovered",
 "routeNearCovered","routeWrongAssignment","routePhantomCoverage",
 "routeMissedCoverage","routeTooDistant"];
const sum=(rows,key)=>rows.reduce((v,r)=>v+(r.events[key]||0),0);
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8874,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8874/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(q,variant)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,"standard",x.mirror,
   x.variant==="baseline"?0:x.team,x.variant),{...q,variant});
  const rows=[],fields=["winner","elapsed","initialHand","openingQueue",
   "castleHp","damage","actions","spent","cards","fortSeconds","energyEstimated",
   "energyActual","maxUnits"];
  for(const seed of seeds)for(const team of teams)for(const style of styles)
   for(const mirror of style==="self"?[false,true]:[false]){
    const q={seed,team,style,mirror};
    const base=await run(q,"baseline"),aud=await run(q,"opportunityAudit");
    assert.ok(base?.finished&&aud?.finished,"complete matches");
    for(const field of fields)assert.deepEqual(aud[field],base[field],
     "observer must never change battle: "+field);
    rows.push({...q,events:aud.decisionEvents[team],
     deltaScore:(aud.winner===team?1:aud.winner===0?.5:0)-
      (base.winner===team?1:base.winner===0?.5:0)});
   }
  assert.deepEqual(errors,[]);
  assert.equal(rows.length,30);
  const summary={kind:"Observational QA route coverage audit; no tactical decisions changed",
   seeds,pairedConditions:30,fullGames:60,
   invariant:"Outcomes, actions, deck, energy, castle/fort HP match baseline exactly",
   decisionCounters:Object.fromEntries(counters.map(k=>[k,sum(rows,k)])),
   byTeam:Object.fromEntries(teams.map(t=>[t,Object.fromEntries(
    counters.map(k=>[k,sum(rows.filter(r=>r.team===t),k)]))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,Object.fromEntries(
    counters.map(k=>[k,sum(rows.filter(r=>r.style===s),k)]))])),
   examples:rows.flatMap(r=>(r.events.routeCoverageSamples||[])
    .map(e=>({...r,events:undefined,...e}))).slice(0,30),
   caveats:["Decision count is repeated BOT thinking, not independent match evidence.",
    "A unit assigned toward the fort may be intercepted or rerouted later.",
    "Route proximity 300px is an audit category, not an adopted tactic.",
    "Known train seeds only. No independent holdout or normal BOT change."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  console.log("ROUTE COVERAGE AUDIT SUMMARY",JSON.stringify({...summary,examples:summary.examples.slice(0,8)}));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
