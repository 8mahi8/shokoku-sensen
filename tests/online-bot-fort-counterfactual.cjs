"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-fort-counterfactual";fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(file).pipe(res);
});
const variants=["baseline","fortTradeReclaim","fortLastLine"],seeds=[17,41,73,101,131];
const base={difficulty:"hard",elapsed:80,energy:2.5,enemyEnergy:2.5,
 hand:["engineer","guardian","tank","ward"],allies:[]};
const cases=[
 {id:"lastSlow",spec:{...base,fortOwners:[0,0,2],
  enemies:[{key:"engineer",x:770,y:205},{key:"engineer",x:790,y:205}]}},
 {id:"lastFast",spec:{...base,fortOwners:[0,0,2],
  enemies:[{key:"scout",x:830,y:205},{key:"scout",x:850,y:205}]}},
 {id:"lastGuarded",spec:{...base,fortOwners:[0,0,2],
  allies:[{key:"sentinel",x:1100,y:205}],
  enemies:[{key:"engineer",x:770,y:205},{key:"engineer",x:790,y:205}]}},
 {id:"forwardSlow",spec:{...base,fortOwners:[0,2,2],
  enemies:[{key:"engineer",x:610,y:444},{key:"engineer",x:630,y:444}]}},
 {id:"forwardFast",spec:{...base,fortOwners:[0,2,2],
  enemies:[{key:"scout",x:610,y:444},{key:"scout",x:630,y:444}]}}
];
const mean=(xs,fn)=>xs.reduce((n,x)=>n+fn(x),0)/Math.max(1,xs.length);
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8829,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8829/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const rows=[];
  for(const c of cases)for(const seed of seeds){
   const arms={};
   for(const variant of variants){
    const data=await page.evaluate(a=>window.__shokokuQa.simulateFortDecision(
      a.seed,a.spec,a.variant,50),{seed,spec:c.spec,variant});
    assert.ok(data?.seeded&&data.elapsed>49.9,"real engine 50s completes "+c.id+"/"+variant+"/"+seed);
    assert.deepEqual(data.openingFortOwners,c.spec.fortOwners);
    assert.ok(data.castleDamage>=0&&data.castleDamage<=3000);
    assert.ok(data.energy>=0&&data.energy<=12.001);
    arms[variant]=data;
   }
   const first=variant=>arms[variant].actions.find(a=>a.time===0)?.card||null;
   if(c.id==="lastSlow"){
    assert.equal(first("baseline"),"infantry","baseline reflex defense spends infantry");
    assert.equal(first("fortTradeReclaim"),null,"old trade reserves during last-line danger");
    assert.equal(first("fortLastLine"),"infantry","critical last line chooses immediate defense");
   }
   if(c.id==="forwardSlow"){
    assert.equal(first("fortTradeReclaim"),null,"forward fort is tradable");
    assert.equal(first("fortLastLine"),null,"forward castle-safe case still allows retreat");
   }
   rows.push({case:c.id,seed,arms});
  }
  assert.equal(rows.length,cases.length*seeds.length);
  assert.deepEqual(errors,[],"browser exceptions");
  const summarize=items=>{
   const diff=(a,b,fn)=>mean(items,x=>fn(x.arms[a])-fn(x.arms[b]));
   return {scenarios:items.length,
    avgCastleDamage:Object.fromEntries(variants.map(v=>[v,mean(items,x=>x.arms[v].castleDamage)])),
    avgFortControlSeconds:Object.fromEntries(variants.map(v=>[v,mean(items,x=>x.arms[v].controlledSeconds)])),
    lostCount:Object.fromEntries(variants.map(v=>[v,items.filter(x=>x.arms[v].lost).length])),
    regainedCount:Object.fromEntries(variants.map(v=>[v,items.filter(x=>x.arms[v].recaptured).length])),
    castleDamageDeltaVsTrade:diff("fortLastLine","fortTradeReclaim",x=>x.castleDamage),
    castleDamageDeltaVsBaseline:diff("fortLastLine","baseline",x=>x.castleDamage),
    fortControlDeltaVsTrade:diff("fortLastLine","fortTradeReclaim",x=>x.controlledSeconds),
    actualDifferentFirstChoice:items.filter(x=>{
     const a=x.arms.fortTradeReclaim.actions.find(a=>a.time===0)?.card||null;
     const b=x.arms.fortLastLine.actions.find(a=>a.time===0)?.card||null;
     return a!==b;
    }).length};
  };
  const report={kind:"50s deterministic real-engine local counterfactual",
   seeds,totalScenarios:rows.length,totalArms:rows.length*variants.length,
   overall:summarize(rows),
   byCase:Object.fromEntries(cases.map(c=>[c.id,summarize(rows.filter(x=>x.case===c.id))])),
   caveats:["Enemy gets no new summons; cannot represent full-match competition.",
    "Isolated defense choice only; not a full-match win-rate estimate.",
    "Seeds already used in research; independent holdout untouched.",
    "Assembled local scenes may differ from typical hand/card distributions.",
    "Primary endpoint is own castle damage, not fort ownership alone."]};
  fs.writeFileSync(path.join(out,"pairs.json"),JSON.stringify(rows,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  console.log("FORT COUNTERFACTUAL SUMMARY",JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});