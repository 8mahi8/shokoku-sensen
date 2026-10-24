"use strict";
// QA-only WebKit ABBA comparison of 90ms/150ms host frame caps.
// Injection is served on loopback in memory; released game HTML never changes.
// These Linux headless measurements are NOT school-iPad Safari measurements.
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {webkit}=require("playwright");
const root=process.cwd(),output=path.join(root,"qa-host-clock-ab");
fs.mkdirSync(output,{recursive:true});
const original=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
const anchor="const delta=Math.min(.15,Math.max(0,(now-previous)/1000));previous=now;";
assert.equal(original.split(anchor).length,2,"expected exact 150ms production frame clock anchor");
const html=original.replace(anchor,
 "const delta=Math.min(window.__qaClockCap===90 ? .09 : .15,Math.max(0,(now-previous)/1000));previous=now;");
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(req.url.split("?")[0]);
 const file=path.resolve(root,"."+name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.setHeader("content-type",file.endsWith(".html")?"text/html; charset=utf-8":"text/javascript; charset=utf-8");
 if(name==="/online-ipad.html")res.end(html);else fs.createReadStream(file).pipe(res);
});
const round=n=>Math.round(n*100)/100;
// Within-scene ABBA ordering balances drift and warm-up effects.
const plan=[
 {scene:"heavy",cap:90},{scene:"heavy",cap:150},
 {scene:"heavy",cap:150},{scene:"heavy",cap:90},
 {scene:"light",cap:150},{scene:"light",cap:90},
 {scene:"light",cap:90},{scene:"light",cap:150}
];
(async()=>{
 let browser,context;
 try{
  await new Promise(ok=>server.listen(8779,"127.0.0.1",ok));
  browser=await webkit.launch({headless:true});
  context=await browser.newContext({viewport:{width:1194,height:834},hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",route=>route.abort());
  await page.goto("http://127.0.0.1:8779/online-ipad.html?qa=1&perf=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").waitFor({state:"visible",timeout:20000});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep");
  await page.waitForFunction(()=>window.GaldArt?.isReady?.()===true,null,{timeout:35000});
  await page.evaluate(()=>window.__shokokuQa.setDpr(1));
  const rows=[];
  for(let i=0;i<plan.length;i++){
   const condition=plan[i];
   const seeded=await page.evaluate(c=>{
    window.__qaClockCap=c.cap;
    return window.__shokokuQa.seedRealisticBattle(c.scene);
   },condition);
   assert.ok(seeded&&seeded.units===10&&seeded.actions.every(x=>x.ok),"real playable 10-unit fixture");
   assert.equal(seeded.heavy.length,condition.scene==="heavy"?2:0);
   // Ensure the next frame has entered battle and all sprites are decoded.
   await page.waitForTimeout(330);
   const measurement=await page.evaluate(async()=>{
    const qa=window.__shokokuQa;
    qa.resetFrameBench();
    const before=qa.snapshot();
    const start=performance.now(),gaps=[];
    await new Promise(resolve=>{
     let previous=performance.now();
     const frame=now=>{
      gaps.push(Math.max(0,now-previous));previous=now;
      if(now-start>=1900)resolve();else requestAnimationFrame(frame);
     };
     requestAnimationFrame(frame);
    });
    const elapsedMs=performance.now()-start;
    const after=qa.snapshot(),bench=qa.frameBench();
    const median=items=>{
     const s=items.slice().sort((a,b)=>a-b);
     return s[Math.floor(s.length/2)]||0;
    };
    const p95=items=>{
     const s=items.slice().sort((a,b)=>a-b);
     return s[Math.min(s.length-1,Math.floor(s.length*.95))]||0;
    };
    const mean=k=>bench.reduce((s,f)=>s+f[k],0)/Math.max(1,bench.length);
    return {
     elapsedMs,clockAdvanceSec:after.elapsed-before.elapsed,
     timeFraction:(after.elapsed-before.elapsed)/(elapsedMs/1000),
     fps:gaps.length*1000/elapsedMs,
     gapMedianMs:median(gaps),gapP95Ms:p95(gaps),
     jsLogicMeanMs:mean("logicMs"),jsLogicP95Ms:p95(bench.map(x=>x.logicMs)),
     jsDrawMeanMs:mean("drawMs"),jsTotalMeanMs:mean("totalMs"),
     energyGainBlue:after.energy[1]-before.energy[1],
     energyGainRed:after.energy[2]-before.energy[2],
     unitsAtEnd:after.units.length,frameError:window.__onlineFrameError||null,
     browserFrameCount:gaps.length,benchCount:bench.length
    };
   });
   assert.equal(measurement.frameError,null,"frame loop has no uncaught paint or tick errors");
   assert.ok(measurement.browserFrameCount>=8&&measurement.benchCount>=8,"enough WebKit samples");
   assert.ok(measurement.clockAdvanceSec>0&&measurement.timeFraction>0,"host battle continues");
   assert.ok(Math.abs(measurement.energyGainBlue-measurement.energyGainRed)<.05,
    "authoritative energy regenerates at the same rate for both teams");
   const row={run:i+1,...condition,...Object.fromEntries(Object.entries(measurement)
    .map(([k,v])=>[k,typeof v==="number"?round(v):v]))};
   rows.push(row);
   console.log("HOST CLOCK CAP AB",JSON.stringify(row));
  }
  assert.deepEqual(errors,[],"no unexpected JavaScript errors");
  const summary=[];
  for(const scene of ["light","heavy"]){
   for(const cap of [90,150]){
    const sample=rows.filter(x=>x.scene===scene&&x.cap===cap);
    assert.equal(sample.length,2,"ABBA controls must be balanced");
    const avg=k=>round(sample.reduce((s,x)=>s+x[k],0)/sample.length);
    summary.push({scene,cap,meanFps:avg("fps"),meanHostTimeFraction:avg("timeFraction"),
     meanLogicMs:avg("jsLogicMeanMs"),meanDrawMs:avg("jsDrawMeanMs"),
     meanGapP95Ms:avg("gapP95Ms")});
   }
  }
  console.log("HOST CLOCK CAP SUMMARY",JSON.stringify(summary));
  fs.writeFileSync(path.join(output,"results.json"),JSON.stringify({
   summary,rows,notes:[
    "QA-only local in-memory override; the shipped clock cap remains 150ms",
    "Order balanced within a warm headless WebKit browser; not hardware-causal proof",
    "Uses real playable cards and real battle tick; no Firebase room or player logs",
    "Linux headless WebKit scheduling and FPS are NOT equivalent to physical school iPad Safari"
   ]},null,2));
  console.log("PASS: QA-only matched host clock cap 90/150ms ABBA comparison");
 }finally{
  await context?.close().catch(()=>{});
  await browser?.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
