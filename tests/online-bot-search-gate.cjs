"use strict";
// QA-only. Gate observes *full completed duels* without executing any search.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-search-gate";fs.mkdirSync(out,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 helper=fs.readFileSync(path.join(root,"tests/online-bot-search-gate.inc.js"),"utf8");
const anchor=" window.__shokokuQa={\n",expert="function botExpertAction(team=2){";
assert.equal(game.split(anchor).length,2);
assert.equal(game.split(expert).length,2);
const patched=game.replace(expert,expert+"\n qaGateOnDecision(team);")
 .replace(anchor,"\n"+helper+"\n"+
  " window.__shokokuQa={\n gateAssess:qaGateAssess,\n gatePaired:qaGateRunPaired,\n");
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
  await new Promise(ok=>server.listen(8888,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8888/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const scenes=[
   {name:"calm-opening",spec:{elapsed:20,difficulty:"hard",energy:4,enemyEnergy:4,
    hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,0],
    enemies:[],allies:[]},expected:"noStrategicFork"},
   {name:"immediate-castle",spec:{elapsed:90,difficulty:"hard",energy:7,enemyEnergy:7,
    hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
    enemies:[{key:"scout",x:1160,y:205}],allies:[]},expected:"urgentCastleThreat"},
   {name:"fort-under-threat",spec:{elapsed:90,difficulty:"hard",energy:7,enemyEnergy:7,
    hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,2],
    enemies:[{key:"scout",x:860,y:205}],allies:[{key:"sentinel",x:850,y:205}]},
    expected:"candidate"},
   {name:"mixed-threats",spec:{elapsed:110,difficulty:"hard",energy:8,enemyEnergy:7,
    hand:["guardian","archer","scout","sentinel"],fortOwners:[0,0,2],
    enemies:[{key:"drone",x:920,y:444},{key:"scout",x:925,y:205}],allies:[]},
    expected:"candidate"},
   {name:"large-versus-capture",spec:{elapsed:30,difficulty:"hard",energy:8,enemyEnergy:5,
    hand:["tank","guardian","scout","archer"],fortOwners:[0,0,0],
    enemies:[],allies:[]},expected:"candidate"},
   {name:"no-resources",spec:{elapsed:35,difficulty:"hard",energy:1.1,enemyEnergy:4,
    hand:["scout","engineer","archer","sentinel"],fortOwners:[0,0,0],
    enemies:[],allies:[]},expected:"insufficientEnergy"}
  ];
  const spot=[];
  for(const scene of scenes){
   const g=await page.evaluate(spec=>{
    if(!window.__shokokuQa.setBotScenario(spec))throw Error("invalid scenario");
    return window.__shokokuQa.gateAssess(2);
   },scene.spec);
   assert.ok(g&&g.reason===scene.expected,
    scene.name+" expected "+scene.expected+" got "+g?.reason);
   spot.push({name:scene.name,reason:g.reason,reasons:g.reasons,
    options:g.alternatives});
  }
  const styles=["rush","balanced","fortress","banker","self"];
  const pairs=[];
  for(const style of styles)for(const seed of [241,293])for(const side of [1,2]){
   const entry=await page.evaluate(p=>
    window.__shokokuQa.gatePaired(p.seed,p.style,p.side),
    {seed,style,side});
   assert.ok(entry.baseline.finished&&entry.shadow.finished);
   assert.deepEqual(entry.baseline,entry.shadow,
    "read-only observer must not alter a single paired duel result");
   const teamGate=entry.gate[side];
   assert.ok(teamGate.decisions>0,"expert must make decisions");
   assert.ok(teamGate.selected<=teamGate.eligible&&teamGate.eligible<=teamGate.decisions);
   assert.ok(teamGate.selectedSamples.every((x,i,a)=>
    i===0||x.time-a[i-1].time>=11.98),"12s cooldown respected");
   pairs.push({style,seed,side,winner:entry.baseline.winner,
    elapsed:entry.baseline.elapsed,gate:teamGate});
  }
  assert.deepEqual(errors,[],"no game JavaScript errors");
  const aggregate={decisions:0,eligible:0,selected:0,
   cooldownSuppressed:0,reasons:{},forks:{}};
  for(const p of pairs){
   const x=p.gate;
   for(const k of ["decisions","eligible","selected","cooldownSuppressed"])
    aggregate[k]+=x[k];
   for(const [k,v] of Object.entries(x.reasons))
    aggregate.reasons[k]=(aggregate.reasons[k]||0)+v;
   for(const [k,v] of Object.entries(x.forks))
    aggregate.forks[k]=(aggregate.forks[k]||0)+v;
  }
  aggregate.eligiblePercent=+(100*aggregate.eligible/aggregate.decisions).toFixed(2);
  aggregate.searchPercent=+(100*aggregate.selected/aggregate.decisions).toFixed(2);
  const summary={kind:"Read-only tactical-fork gate on complete seeded 30Hz duels",
   styles,seedSet:[241,293],bothExpertSides:true,
   pairedDuels:pairs.length,spot,aggregate,
   byStyle:styles.map(style=>{
    const sample=pairs.filter(p=>p.style===style);
    return {style,decisions:sample.reduce((a,p)=>a+p.gate.decisions,0),
     eligible:sample.reduce((a,p)=>a+p.gate.eligible,0),
     selected:sample.reduce((a,p)=>a+p.gate.selected,0)}
   }),
   sampledSelections:pairs.flatMap(p=>p.gate.selectedSamples.map(x=>({
    style:p.style,seed:p.seed,side:p.side,...x
   }))).slice(0,80),
   constraints:["Gate records only; selected means hypothetical search eligibility, NEVER executes a rollout.",
    "No change to the game decisions, card spending, or battlefield.",
    "Same-seed/style/side paired duel outcome fields match exactly.",
    "Only the localhost QA server injects this observer; main/game assets are unchanged.",
    "Not a win-rate improvement or Safari benchmark."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("TACTICAL GATE SUMMARY",JSON.stringify({...summary,sampledSelections:undefined}));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
