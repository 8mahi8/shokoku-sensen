// Matched, non-destructive performance regression investigation.
// The Oct 28 school-approved Git tree is the control. Candidate is the
// current development-branch HTML. Both run the same legal old-unit scenes.
// Not a physical iPad test, nor a claim about new Stage-2 card cost.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {execFileSync}=require("node:child_process");
const {webkit}=require("playwright");
const root=process.cwd(),output=path.join(root,"qa-stable-vs-stage2");
fs.mkdirSync(output,{recursive:true});
const SCHOOL_COMMIT="99a0d1d0cc18a987aefe0ab99dc1f7993160fe25";
const stableHtml=execFileSync("git",["show",SCHOOL_COMMIT+":online-ipad.html"],{
 encoding:"utf8",maxBuffer:2*1024*1024});
const devHtml=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
assert.ok(stableHtml.includes("window.__shokokuQa")&&devHtml.includes("window.__shokokuQa"),
 "both retained stable QA hooks");
assert.notEqual(stableHtml,devHtml,"two distinct builds required");
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(req.url.split("?")[0]);
 const main={"/ab-stable.html":stableHtml,"/ab-dev.html":devHtml}[pathname];
 if(main!==undefined){
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
  res.end(main);return;
 }
 const full=path.resolve(root,"."+pathname);
 if(!full.startsWith(root+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 const type=full.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8";
 res.writeHead(200,{"Content-Type":type,"Cache-Control":"no-store"});
 fs.createReadStream(full).pipe(res);
});
const pct=(a,p)=>a.length?Math.round(a[Math.min(a.length-1,Math.floor((a.length-1)*p))]*10)/10:null;
const stat=a=>{
 const sorted=a.filter(Number.isFinite).sort((x,y)=>x-y);
 return {n:sorted.length,p50:pct(sorted,.5),p95:pct(sorted,.95),
  p99:pct(sorted,.99),max:sorted.length?Math.round(sorted.at(-1)*10)/10:null,
  mean:sorted.length?Math.round(sorted.reduce((s,v)=>s+v,0)/sorted.length*10)/10:null};
};
const scenes=["light","dense","heavy"];
const variants=["stable","dev","dev","stable"]; // same-scene ABBA to limit runner drift
const trials=[];
async function measure(variant,scene,trial){
 const browser=await webkit.launch({headless:true});
 let context;
 try{
  context=await browser.newContext({
   viewport:{width:1194,height:834},hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.setDefaultTimeout(14000);
  await page.route("**/www.gstatic.com/firebasejs/**",route=>route.abort());
  await page.goto("http://127.0.0.1:8795/ab-"+variant+".html?qa=1",{
   waitUntil:"domcontentloaded",timeout:25000});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep",null,{timeout:15000});
  await page.waitForFunction(()=>!!window.KokokuArt?.drawUnit,null,{timeout:15000});
  const setup=await page.evaluate(kind=>window.__shokokuQa.seedRealisticBattle(kind),scene);
  assert.ok(setup&&setup.actions.every(a=>a.ok),
   "identical real-card test setup failed "+variant+":"+scene);
  const expected={light:10,dense:20,heavy:10};
  assert.equal(setup.units,expected[scene],"matched unit counts");
  await page.waitForTimeout(700); // warm-up independently on fresh browser
  await page.evaluate(()=>window.__shokokuQa.resetFrameBench());
  const reading=await page.evaluate(async()=>{
   const begin=performance.now();let previous=0,gameFrames=0;
   const intervals=[];
   await new Promise(resolve=>{
    const advance=now=>{
     if(previous)intervals.push(now-previous);
     previous=now;gameFrames++;
     if(now-begin>=3200)resolve();else requestAnimationFrame(advance);
    };
    requestAnimationFrame(advance);
   });
   const end=performance.now();
   return {durationMs:end-begin,frames:gameFrames,
    rafIntervals:intervals,frameBench:window.__shokokuQa.frameBench(),
    scene:window.__shokokuQa.realisticBattleStatus(),
    snapshot:window.__shokokuQa.snapshot(),
    frameError:window.__onlineFrameError||null};
  });
  assert.equal(reading.frameError,null,variant+" Canvas exception");
  assert.ok(reading.frames>0);
  assert.ok(reading.scene.elapsed>102,variant+" battle clock must advance");
  assert.deepEqual(errors,[],"unexpected page errors "+variant+":"+scene);
  const rows=reading.frameBench.filter(r=>r.phase==="battle");
  const gap=stat(rows.map(r=>r.gapMs)),draw=stat(rows.map(r=>r.drawMs));
  const logic=stat(rows.map(r=>r.logicMs)),net=stat(rows.map(r=>r.networkMs));
  const artFrames=rows.filter(r=>r.newCachedTiles>0).length;
  const row={variant,scene,trial,setup:{
   units:setup.units,spells:setup.spells,byTeam:setup.byTeam},
   durationMs:+reading.durationMs.toFixed(1),
   observedFrames:rows.length,raf:stat(reading.rafIntervals),
   gap,draw,logic,network:net,artFrames,frameError:reading.frameError,
   sceneFinal:{units:reading.snapshot.units.length,elapsed:reading.snapshot.elapsed}};
  return row;
 }finally{
  await context?.close().catch(()=>{});
  await browser.close().catch(()=>{});
 }
}
(async()=>{
 await new Promise(resolve=>server.listen(8795,"127.0.0.1",resolve));
 try{
  for(const scene of scenes){
   for(let i=0;i<variants.length;i++){
    const variant=variants[i];
    console.log("AB START",JSON.stringify({scene,variant,trial:i+1}));
    const row=await measure(variant,scene,i+1);
    trials.push(row);
    console.log("AB RESULT",JSON.stringify(row));
   }
  }
  const pairs=scenes.map(scene=>{
   const ss=trials.filter(r=>r.scene===scene&&r.variant==="stable");
   const dd=trials.filter(r=>r.scene===scene&&r.variant==="dev");
   const avg=(a,key)=>Math.round(a.reduce((sum,r)=>sum+(r[key]?.p95||0),0)/a.length*10)/10;
   return {scene,stable:{gapP95:avg(ss,"gap"),drawP95:avg(ss,"draw"),
     logicP95:avg(ss,"logic")},dev:{gapP95:avg(dd,"gap"),drawP95:avg(dd,"draw"),
     logicP95:avg(dd,"logic")},repeatCounts:{stable:ss.length,dev:dd.length}};
  });
  const results={baseline:SCHOOL_COMMIT,candidate:"current checked-out development head",
   conditions:"same no-video Linux WebKit; DPR2; 1194x834; solo legal cards; 3.2s steady-state each",
   scenes,order:"stable-dev-dev-stable per scene; separate WebKit process per trial",
   distinctions:["Only old roster identical-card scenarios; not Stage-2-specific abilities.",
    "Headless Linux WebKit does not equal school iPad Safari/Google Sites.",
    "Short windows and runner drift mean differences are exploratory, not a deployability verdict.",
    "No Firebase writes, no actual network in this isolated client render/simulation test."],
   pairs,trials};
  fs.writeFileSync(path.join(output,"matched-results.json"),JSON.stringify(results,null,2));
  console.log("AB MATCHED SUMMARY",JSON.stringify(pairs));
  console.log("PASS 12 matched stable vs development WebKit combat runs");
 }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error("AB INVESTIGATION FAILED",e);process.exitCode=1});
