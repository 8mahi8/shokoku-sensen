"use strict";
// QA-only observational report: fort loss -> possible castle danger.
// Never treat correlation between them as proof of causal damage.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-fort-exposure";fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(file).pipe(res);
});
const seeds=[17,41,73,101,131,163],teams=[1,2],
 styles=["self","rush","balanced","fortress","banker"];
const sum=(xs,fn)=>xs.reduce((n,x)=>n+fn(x),0);
const avg=(xs,fn)=>xs.length?sum(xs,fn)/xs.length:null;
const median=xs=>{if(!xs.length)return null;const s=xs.slice().sort((a,b)=>a-b);return s[Math.floor(s.length/2)]};
const classify=x=>x===null?"unestimated":x<=10?"0-10s":x<=20?"10-20s":"20s+";
const aggregate=rows=>{
 const losses=rows.flatMap(r=>r.losses),fifteen=losses.filter(e=>e.observedSeconds>=14.9),
 thirty=losses.filter(e=>e.observedSeconds>=29.9);
 return {games:rows.length,losses:losses.length,
  complete15:fifteen.length,complete30:thirty.length,
  damageWithin15:fifteen.filter(e=>e.firstCastleDamage!==null&&e.firstCastleDamage<=15).length,
  raiderWithin15:fifteen.filter(e=>e.firstCastleRaider!==null&&e.firstCastleRaider<=15).length,
  damageWithin30:thirty.filter(e=>e.firstCastleDamage!==null&&e.firstCastleDamage<=30).length,
  raiderWithin30:thirty.filter(e=>e.firstCastleRaider!==null&&e.firstCastleRaider<=30).length,
  regainWithin30:thirty.filter(e=>e.regainSeconds!==null&&e.regainSeconds<=30).length,
  meanCastleDamage30:avg(thirty,e=>e.actualCastleDamage30),
  medianForecastETA:median(losses.map(e=>e.predictedCastleETA).filter(Number.isFinite)),
  medianFirstDamage:median(thirty.map(e=>e.firstCastleDamage).filter(Number.isFinite)),
  predictions:{
   "0-10s":losses.filter(e=>classify(e.predictedCastleETA)==="0-10s").length,
   "10-20s":losses.filter(e=>classify(e.predictedCastleETA)==="10-20s").length,
   "20s+":losses.filter(e=>classify(e.predictedCastleETA)==="20s+").length,
   unestimated:losses.filter(e=>classify(e.predictedCastleETA)==="unestimated").length
  }};
};
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8825,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8825/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const runs=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles){
   for(const variant of style==="self"?
     [{mirror:false,cadence:"standard"},{mirror:true,cadence:"standard"}]:
     [{mirror:false,cadence:"standard"},{mirror:false,cadence:"fast"}]){
    const g=await page.evaluate(x=>window.__shokokuQa.runDuel(x.seed,x.style,"hard",
      x.team,x.cadence,x.mirror,0,"baseline"),
      {seed,team,style,...variant});
    assert.ok(g?.finished&&Array.isArray(g.fortLossRecords),"full real engine match/ledger");
    for(const t of teams)assert.ok(Math.abs(g.energyActual[t]-g.energyEstimated[t])<1e-6);
    for(const e of g.fortLossRecords){
     assert.ok(teams.includes(e.team)&&e.fortIndex>=0&&e.fortIndex<3);
     assert.ok(e.firstCastleDamage===null||e.firstCastleDamage>=0);
     assert.ok(e.observedSeconds>=0&&e.observedSeconds<=30.001);
    }
    runs.push({seed,team,style,...variant,losses:g.fortLossRecords});
   }
  }
  assert.equal(runs.length,120);
  assert.deepEqual(errors,[],"browser errors");
  const records=runs.flatMap(r=>r.losses.map(e=>({...e,seed:r.seed,
   tacticalTeam:r.team,style:r.style,mirror:r.mirror,cadence:r.cadence})));
  const summary={kind:"Observed castle exposure after outpost loss; NOT caused-by-loss estimates",
   games:runs.length,seeds,overall:aggregate(runs),
   byTeam:Object.fromEntries(teams.map(t=>[t,aggregate(runs.map(r=>({...r,losses:r.losses.filter(e=>e.team===t)})))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,aggregate(runs.filter(r=>r.style===s))])),
   byPredictedETA:Object.fromEntries(["0-10s","10-20s","20s+","unestimated"].map(b=>
     [b,aggregate(runs.map(r=>({...r,losses:r.losses.filter(e=>classify(e.predictedCastleETA)===b)})))])),
   cautions:["Only pre-used training seeds; no independent holdout consumed.",
    "Enemy units might be in combat or another lane; straight-line ETA is not real arrival time.",
    "Castle damage can be caused by other attacks and may not follow from this particular fort loss.",
    "Windows shorter than 15/30s are excluded from respective incident rate denominators.",
    "This audit changes neither live bot logic nor game physics."]};
  fs.writeFileSync(path.join(out,"fort-loss-events.json"),JSON.stringify(records,null,2));
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(summary,null,2));
  console.log("FORT EXPOSURE SUMMARY",JSON.stringify(summary));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});