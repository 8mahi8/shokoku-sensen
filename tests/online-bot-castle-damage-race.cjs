"use strict";
// Real 30Hz full games, plus QA-only controlled castle damage race scenes.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-castle-damage-race";fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const seeds=[17,41,73,101,131,163],teams=[1,2],
 styles=["self","rush","balanced","fortress","banker"];
const score=(g,t)=>g.winner===0?.5:g.winner===t?1:0,
 sum=(xs,f)=>xs.reduce((a,x)=>a+f(x),0),
 mean=(xs,f)=>xs.length?sum(xs,f)/xs.length:null;
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8851,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8851/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const spec={
   difficulty:"hard",elapsed:120,energy:7,enemyEnergy:7,
   hand:["tank","sentinel","drone","engineer"],fortOwners:[2,2,2],
   castleHp:[null,420,1200],raceWindow:{ownLoss:200,enemyLoss:400},
   allies:[{key:"tank",x:180,y:327}],
   enemies:[{key:"scout",x:1095,y:327},{key:"scout",x:1110,y:327}]
  };
  const scene=(variant,changes={})=>page.evaluate(x=>{
   if(!window.__shokokuQa.setBotScenario({...x.spec,variant:x.variant}))
    throw Error("QA scene rejected");
   return window.__shokokuQa.runBotOnce();
  },{variant,spec:{...spec,...changes}});
  const ahead=await scene("castleDamageRace"),baseline=await scene("baseline");
  const behind=await scene("castleDamageRace",{
   castleHp:[null,1600,300],raceWindow:{ownLoss:300,enemyLoss:110}});
  const noHistory=await scene("castleDamageRace",{raceWindow:null});
  const noPressure=await scene("castleDamageRace",{allies:[]});
  assert.equal(ahead.action?.id,"tank","winning damage race sends offensive reinforcement");
  assert.notEqual(baseline.action?.id,"tank","normal BOT remains unmodified");
  assert.notEqual(behind.action?.id,"tank","must not ignore defense when losing race");
  assert.notEqual(noHistory.action?.id,"tank","HP gap alone is not an estimated damage race");
  assert.notEqual(noPressure.action?.id,"tank","must have real attacker by enemy castle");
  const run=(s,v)=>page.evaluate(x=>window.__shokokuQa.runDuel(x.seed,x.style,
   "hard",x.team,x.cadence,x.mirror,x.variant==="baseline"?0:x.team,x.variant),
   {...s,variant:v});
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles){
   const cases=style==="self"?[{mirror:false,cadence:"standard"},
    {mirror:true,cadence:"standard"}]:[{mirror:false,cadence:"standard"},
    {mirror:false,cadence:"fast"}];
   for(const c of cases){
    const q={seed,team,style,...c};
    const base=await run(q,"baseline"),guard=await run(q,"fortDefenseValue"),
     trial=await run(q,"castleDamageRace");
    for(const g of [base,guard,trial]){
     assert.ok(g?.finished&&g.elapsed>0,"all 30Hz games complete");
     assert.ok(Math.abs(g.energyActual[team]-g.energyEstimated[team])<1e-6);
    }
    assert.deepEqual(base.initialHand,trial.initialHand);
    assert.deepEqual(base.openingQueue,trial.openingQueue);
    assert.deepEqual(guard.initialHand,trial.initialHand);
    const ev=trial.decisionEvents[team];
    assert.ok((ev.raceChecks||0)>0);
    assert.equal(base.decisionEvents[team].raceQualified||0,0);
    assert.ok((ev.raceQualified||0)>=(ev.raceOffense||0));
    const pack=g=>({winner:g.winner,castleHp:g.castleHp,damage:g.damage,
     spent:g.spent,fortSeconds:g.fortSeconds});
    rows.push({...q,base:pack(base),guard:pack(guard),trial:pack(trial),
     events:{raceChecks:ev.raceChecks||0,raceQualified:ev.raceQualified||0,
      raceOffense:ev.raceOffense||0,raceBanked:ev.raceBanked||0,
      examples:ev.raceExamples||[]}});
   }
  }
  assert.equal(rows.length,120);
  assert.deepEqual(errors,[]);
  const aggregate=a=>({
   pairs:a.length,
   betterVsGuard:a.filter(r=>score(r.trial,r.team)>score(r.guard,r.team)).length,
   worseVsGuard:a.filter(r=>score(r.trial,r.team)<score(r.guard,r.team)).length,
   sameVsGuard:a.filter(r=>score(r.trial,r.team)===score(r.guard,r.team)).length,
   scoreVsGuard:sum(a,r=>score(r.trial,r.team)-score(r.guard,r.team)),
   scoreVsBase:sum(a,r=>score(r.trial,r.team)-score(r.base,r.team)),
   meanOwnHpVsGuard:mean(a,r=>r.trial.castleHp[r.team]-r.guard.castleHp[r.team]),
   meanEnemyDamageVsGuard:mean(a,r=>r.trial.damage[3-r.team]-r.guard.damage[3-r.team]),
   meanFortTimeVsGuard:mean(a,r=>r.trial.fortSeconds[r.team]-r.guard.fortSeconds[r.team]),
   meanSpendVsGuard:mean(a,r=>r.trial.spent[r.team]-r.guard.spent[r.team]),
   qualifiedDecisions:sum(a,r=>r.events.raceQualified),
   forwardPlays:sum(a,r=>r.events.raceOffense),
   bankingDecisions:sum(a,r=>r.events.raceBanked),
   matchedGamesWithTrigger:a.filter(r=>r.events.raceQualified>0).length
  });
  const summary={kind:"Known-seed QA castle damage acceptance",
   seeds,fullGames:360,matchedConditions:120,
   scenarios:{ahead:ahead.action?.id||null,normal:baseline.action?.id||null,
    behind:behind.action?.id||null,noHistory:noHistory.action?.id||null,
    noPressure:noPressure.action?.id||null},
   overall:aggregate(rows),byTeam:Object.fromEntries(teams.map(t=>
    [t,aggregate(rows.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>
    [s,aggregate(rows.filter(r=>r.style===s))])),
   caveats:["Prior actual damage rate may change when the opponent responds.",
    "No independent holdouts used; all six seeds pre-explored.",
    "Damage tolerance remains QA-only; regular BOT and main unchanged."]};
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("CASTLE DAMAGE RACE SUMMARY",JSON.stringify(summary));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});