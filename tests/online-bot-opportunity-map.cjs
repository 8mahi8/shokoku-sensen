// Behavioral identity / observed opportunity mapping of the unmodified expert BOT.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-opportunity-map";fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(p).pipe(res);
});
const seeds=[17,41,73],teams=[1,2],styles=["self","rush","fortress","banker"];
const sum=(a,f)=>a.reduce((n,x)=>n+f(x),0);
const statFields=["mapDecisions","mapNoOwnedFort","mapUrgent","mapEnergyUnder2",
 "mapEnergyTwoThree","mapEnergyThreeFour","mapEnergyFourPlus",
 "mapNoFundedHand","mapInfantryOnlyAvailable","mapScoutInHand",
 "mapScoutInQueue","mapScoutQueueWithObjective","mapScoutEnergyBlocked",
 "mapOwnedFortContact12s","mapOwnedFortContact6s",
 "mapOwnedFortWithoutScreen12s","mapPreUrgent6s","mapCheapScreenBudget","mapCheapScreenReady"];
const summary=a=>({games:a.length,
 counters:Object.fromEntries(statFields.map(k=>[k,sum(a,r=>r.event[k]||0)])),
 playableHandCounts:Object.fromEntries([0,1,2,3,4].map(n=>
  [String(n),sum(a,r=>r.event.mapPlayableHand?.[String(n)]||0)]))});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8809,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8809/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(q,variant)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,"standard",x.mirror,
   x.variant==="baseline"?0:x.team,x.variant),{...q,variant});
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles)
   for(const mirror of style==="self"?[false,true]:[false]){
    const q={seed,team,style,mirror};
    const base=await run(q,"baseline"),audit=await run(q,"opportunityAudit");
    assert.ok(base?.finished&&audit?.finished);
    for(const key of ["winner","elapsed","initialHand","openingQueue",
     "castleHp","damage","actions","spent","cards","fortSeconds",
     "energyEstimated","energyActual","maxUnits"]){
     assert.deepEqual(audit[key],base[key],"observational variant must be identical: "+key);
    }
    assert.ok((audit.decisionEvents[team].mapDecisions||0)>0);
    rows.push({...q,event:audit.decisionEvents[team]});
   }
  assert.equal(rows.length,30);
  assert.deepEqual(errors,[]);
  const result={kind:"TRAIN-only behavior-identical expert actionability audit",
   seeds,baselineGames:30,observedGames:30,
   overall:summary(rows),
   byTeam:Object.fromEntries(teams.map(t=>[t,summary(rows.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,summary(rows.filter(r=>r.style===s))])),
   samples:rows.flatMap(r=>(r.event.mapSamples||[]).map(p=>({...p,seed:r.seed,team:r.team,style:r.style}))).slice(0,90),
   guarantees:["Audit and control produce identical outcomes, draws, spending, cards and units.",
    "Private enemy hand and true energy are never inspected.",
    "No new or altered card selection policy. Known seeds only."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(result,null,2));
  fs.writeFileSync(path.join(out,"rows.json"),JSON.stringify(rows,null,2));
  console.log("OPPORTUNITY MAP SUMMARY",JSON.stringify({...result,samples:result.samples.slice(0,12)}));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});