"use strict";
// V13 policy FROZEN before independent holdout. No threshold tuning after
// reading these results. The game JS remains unchanged outside localhost.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-fort-counter-v13-holdout";
fs.mkdirSync(out,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 hook=fs.readFileSync(path.join(root,"tests/online-bot-fort-counter-reserve-v13.inc.js"),"utf8"),
 anchor=" if(urgent&&!concessionHold){",
 whitelist='"castleRaceChoice"].includes(variant)';
assert.equal(game.split(anchor).length,2);assert.equal(game.split(whitelist).length,2);
const patched=game.replace(anchor,"\n"+hook+"\n"+anchor)
 .replace(whitelist,'"castleRaceChoice","fortCounterReserve13"].includes(variant)');
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(p).pipe(res);
});
const score=(g,team)=>g.winner===0?.5:g.winner===team?1:0;
const seeds=[20261919,20261931,20262003,20262033,20262107,20262119,20262189,20262203];
const styles=["self","rush","balanced","fortress","banker"],teams=[1,2];
const mean=(xs,fn)=>xs.length?xs.reduce((x,y)=>x+fn(y),0)/xs.length:0;
const metrics=rows=>({
 trials:rows.length,
 better:rows.filter(x=>x.delta>0).length,
 worse:rows.filter(x=>x.delta<0).length,
 neutral:rows.filter(x=>x.delta===0).length,
 net:rows.reduce((sum,x)=>sum+x.delta,0),
 impacted:rows.filter(x=>JSON.stringify(x.base)!==JSON.stringify(x.candidate)).length,
 held:rows.reduce((sum,x)=>sum+x.held,0),
 avgOwnHp:+mean(rows,x=>x.candidate.ownHp-x.base.ownHp).toFixed(2),
 avgEnemyDamage:+mean(rows,x=>x.candidate.enemyDamage-x.base.enemyDamage).toFixed(2),
 avgFortSeconds:+mean(rows,x=>x.candidate.fortSeconds-x.base.fortSeconds).toFixed(3),
 avgSpend:+mean(rows,x=>x.candidate.spent-x.base.spent).toFixed(3)
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8912,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8912/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles){
   const settings=style==="self"?
    [{cadence:"standard",mirror:false},{cadence:"standard",mirror:true}]:
    [{cadence:"standard",mirror:false},{cadence:"fast",mirror:false}];
   for(const setting of settings){
    const q={seed,team,style,...setting};
    const run=variant=>page.evaluate(x=>window.__shokokuQa.runDuel(
     x.seed,x.style,"hard",x.team,x.cadence,x.mirror,x.team,x.variant),
     {...q,variant});
    const original=await run("baseline");
    const trial=await run("fortCounterReserve13");
    assert.ok(original?.finished&&trial?.finished);
    assert.deepEqual(original.initialHand,trial.initialHand);
    assert.deepEqual(original.openingQueue,trial.openingQueue);
    assert.ok(Math.abs(original.energyActual[team]-original.energyEstimated[team])<1e-6);
    assert.ok(Math.abs(trial.energyActual[team]-trial.energyEstimated[team])<1e-6);
    const snap=g=>({winner:g.winner,ownHp:g.castleHp[team],
     enemyDamage:g.damage[3-team],spent:g.spent[team],
     fortSeconds:g.fortSeconds[team],cards:g.cards[team]});
    rows.push({...q,delta:score(trial,team)-score(original,team),
     held:trial.decisionEvents[team]?.v13Held||0,
     base:snap(original),candidate:snap(trial)});
   }
  }
  assert.deepEqual(errors,[]);assert.equal(rows.length,160);
  const bySeed=Object.fromEntries(seeds.map(s=>[s,metrics(rows.filter(x=>x.seed===s))]));
  const byTeam=Object.fromEntries(teams.map(t=>[t,metrics(rows.filter(x=>x.team===t))]));
  const byStyle=Object.fromEntries(styles.map(s=>[s,metrics(rows.filter(x=>x.style===s))]));
  const overall=metrics(rows);
  // Preregistered AFTER research-set observations and BEFORE holdout labels.
  const improvedSeeds=seeds.filter(s=>bySeed[s].better>0).length;
  const gate={
   minIndependentWinningSeeds:2,minNetScore:2,
   maxWorse:0,byTeamNonnegative:true,minAvgHp:0,minChangedMatches:6
  };
  const promotionEligible=overall.worse===0&&overall.net>=2&&
   overall.avgOwnHp>=0&&overall.impacted>=6&&improvedSeeds>=2&&
   byTeam[1].net>=0&&byTeam[2].net>=0;
  const report={
   kind:"FROZEN independent seed holdout for v13 counter-spend plan",
   seeds,researchSet:[17,41,73,101,131,163],
   paired:rows.length,totalSimulatedGames:rows.length*2,
   overall,bySeed,byTeam,byStyle,improvedSeeds,gate,
   eligibleForManualReview:promotionEligible,
   safeguards:[
    "Variants identical to research (no late changes to thresholds or legal-card rules)",
    "All matches use real 30Hz physics, both teams and opponent styles, equal initial hand",
    "Separate initial hand/queue and actual versus observed energy audited",
    "A single winning research match is not sufficient for promotion",
    "Even passing this gate would only trigger manual review and iPad regression tests",
    "No actual game or public main changes; server intercept injects variant only"]
  };
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  console.log("FORT COUNTER V13 HOLDOUT SUMMARY",JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
