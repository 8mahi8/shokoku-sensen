"use strict";
// QA-only: actual opening 2-cost infantry performance against the same
// initial scene with deferred resource spending. Previously used seeds only.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 http=require("node:http"),{chromium}=require("playwright");
const out="qa-bot-infantry-value",root=process.cwd();
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(file).pipe(res);
});
const seeds=[17,41,73,101,131],choices=["baseline","infantryNow","skipFirst","saveFor4"];
const defaults={difficulty:"hard",elapsed:80,energy:2.5,enemyEnergy:2.5,allies:[]};
const engineer=["engineer","guardian","tank","ward"],sentinel=["sentinel","guardian","tank","ward"];
const cases=[
 {id:"lastSlowEngineer",spec:{...defaults,hand:engineer,reserve:"engineer",fortOwners:[0,0,2],
  enemies:[{key:"engineer",x:770,y:205},{key:"engineer",x:790,y:205}]}},
 {id:"lastFastScout",spec:{...defaults,hand:engineer,reserve:"engineer",fortOwners:[0,0,2],
  enemies:[{key:"scout",x:830,y:205},{key:"scout",x:850,y:205}]}},
 {id:"forwardSlowEngineer",spec:{...defaults,hand:engineer,reserve:"engineer",fortOwners:[0,2,2],
  enemies:[{key:"engineer",x:610,y:444},{key:"engineer",x:630,y:444}]}},
 {id:"forwardFastScout",spec:{...defaults,hand:engineer,reserve:"engineer",fortOwners:[0,2,2],
  enemies:[{key:"scout",x:610,y:444},{key:"scout",x:630,y:444}]}},
 {id:"homeGuardedEngineer",spec:{...defaults,hand:engineer,reserve:"engineer",fortOwners:[0,0,2],
  allies:[{key:"sentinel",x:1100,y:205}],
  enemies:[{key:"engineer",x:770,y:205},{key:"engineer",x:790,y:205}]}},
 {id:"lastScoutSentinel",spec:{...defaults,hand:sentinel,reserve:"sentinel",fortOwners:[0,0,2],
  enemies:[{key:"scout",x:830,y:205},{key:"scout",x:850,y:205}]}},
 {id:"forwardScoutSentinel",spec:{...defaults,hand:sentinel,reserve:"sentinel",fortOwners:[0,2,2],
  enemies:[{key:"scout",x:610,y:444},{key:"scout",x:630,y:444}]}}
];
const sum=(a,f)=>a.reduce((v,x)=>v+f(x),0);
const avg=(a,f)=>a.length?sum(a,f)/a.length:0;
const tally=rows=>{
 const delta=(a,b,key)=>avg(rows,r=>r.arms[a][key]-r.arms[b][key]);
 return {sets:rows.length,
  initialInfantryCombat:{
   hits:sum(rows,r=>r.arms.infantryNow.openingCombat?.unitHits||0),
   damage:sum(rows,r=>r.arms.infantryNow.openingCombat?.unitDamage||0),
   attacks:sum(rows,r=>r.arms.infantryNow.openingCombat?.attacks||0),
   fortsHit:sum(rows,r=>r.arms.infantryNow.openingCombat?.fortHits||0),
   unitsSurvived:sum(rows,r=>r.arms.infantryNow.openingStillAlive||0),
   totalUnits:sum(rows,r=>r.arms.infantryNow.openingUnits||0)
  },
  meanCastleDamage:Object.fromEntries(choices.map(c=>[c,avg(rows,r=>r.arms[c].castleDamage)])),
  meanFortHeldSeconds:Object.fromEntries(choices.map(c=>[c,avg(rows,r=>r.arms[c].fortOwnedSeconds)])),
  castleDamageSave4MinusInfantry:delta("saveFor4","infantryNow","castleDamage"),
  castleDamageSkipMinusInfantry:delta("skipFirst","infantryNow","castleDamage"),
  castleDamageBaselineMinusInfantry:delta("baseline","infantryNow","castleDamage"),
  fortHeldSave4MinusInfantry:delta("saveFor4","infantryNow","fortOwnedSeconds"),
  initialEnemyAlive:Object.fromEntries(choices.map(c=>[c,avg(rows,r=>r.arms[c].initialThreatsAlive)])),
  castleBreaches:Object.fromEntries(choices.map(c=>[c,rows.filter(r=>r.arms[c].enemyEntered).length])),
  bothCastleIntact:rows.filter(r=>!r.arms.saveFor4.castleDamage&&!r.arms.infantryNow.castleDamage).length,
  save4LessDamage:rows.filter(r=>r.arms.saveFor4.castleDamage<r.arms.infantryNow.castleDamage).length,
  save4MoreDamage:rows.filter(r=>r.arms.saveFor4.castleDamage>r.arms.infantryNow.castleDamage).length,
  save4SameDamage:rows.filter(r=>r.arms.saveFor4.castleDamage===r.arms.infantryNow.castleDamage).length
 };
};
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8831,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8831/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const rows=[];
  for(const c of cases)for(const seed of seeds){
   const arms={};
   for(const choice of choices){
    const data=await page.evaluate(q=>window.__shokokuQa.simulateDefenseOpening(
     q.seed,q.spec,q.choice,50),{seed,spec:c.spec,choice});
    assert.ok(data?.seeded&&data.elapsed>49,"must run whole 50-second battle");
    assert.equal(data.firstAction,choice==="saveFor4"?c.spec.reserve:"infantry",
     "first real card is the planned legal purchase");
    if(choice==="skipFirst")assert.ok(data.firstTime>=1.5,"delayed opening is not same as instant");
    if(choice==="infantryNow"){
     assert.equal(data.firstCost,2,"infantry obeys legal 2 energy");
     assert.equal(data.openingUnits,2,"real infantry is two units");
    }
    if(choice==="saveFor4"){
     assert.ok(Math.abs(data.firstCost-4)<.001,"reserve must really cost 4");
     assert.ok(data.firstTime>3&&data.firstTime<10,"4-cost purchase follows natural resource recovery");
    }
    assert.ok(data.castleDamage>=0&&data.castleDamage<=3000);
    assert.ok(data.energy>=0&&data.energy<=12.001);
    arms[choice]=data;
   }
   rows.push({id:c.id,seed,arms});
  }
  assert.equal(rows.length,cases.length*seeds.length);
  assert.deepEqual(errors,[],"unexpected browser exception");
  const report={kind:"First 2-cost defense efficacy vs skip-1.5s or funded 4-cost counter",
   seeds,comparisonSets:rows.length,totalSimulations:rows.length*choices.length,
   overall:tally(rows),byCase:Object.fromEntries(cases.map(c=>[c.id,tally(rows.filter(r=>r.id===c.id))])),
   caveats:["All seeds have been used before; this is neither holdout nor win-rate validation.",
    "Scenario has no additional enemy summons, so later counterplay is absent.",
    "Baseline and forced infantry may diverge due to legality or choice priority.",
    "Measured first infantry damage is effective primary-target damage, not hypothetical damage.",
    "50s local castle survival and fort uptime differ from full 300s competitive results.",
    "Card deck is intentionally constrained to isolate the opening choice."]};
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("INFANTRY VALUE SUMMARY",JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});