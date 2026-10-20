"use strict";
// QA-only same-page control for WebKit: avoid a new document, SVG sprite loader,
// document initialization and first-paint side effects between the light/heavy
// scenes. Separate render/not-render controls; never touch Firebase or main.
const {webkit}=require("playwright");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const assert=require("node:assert/strict");
const root=process.cwd(),dir=path.resolve(root,"qa-stable-browser");
fs.mkdirSync(dir,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.setHeader("content-type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(file).pipe(res);
});
const round=n=>Math.round(n*100)/100;
const schedule=[
 {scene:"light",noPaint:false},{scene:"heavy",noPaint:false},
 {scene:"heavy",noPaint:false},{scene:"light",noPaint:false},
 {scene:"light",noPaint:true},{scene:"heavy",noPaint:true},
 {scene:"heavy",noPaint:true},{scene:"light",noPaint:true}
];
const results=[];
(async()=>{
 let browser,ctx;
 try{
  await new Promise(resolve=>server.listen(8777,"127.0.0.1",resolve));
  browser=await webkit.launch({headless:true});
  ctx=await browser.newContext({viewport:{width:1194,height:834},hasTouch:true,deviceScaleFactor:2});
  const page=await ctx.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",route=>route.abort());
  await page.goto("http://127.0.0.1:8777/online-ipad.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").waitFor({state:"visible",timeout:20000});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep");
  // Try to let the 66-frame Gald atlas finish. Otherwise note that it was not
  // ready; don't fabricate that a completed asset was used.
  const atlasReady=await page.waitForFunction(()=>window.GaldArt?.isReady?.()===true,
   null,{timeout:35000}).then(()=>true).catch(()=>false);
  console.log("ATLAS READY BEFORE CONTROL:",atlasReady);
  await page.waitForTimeout(1000);
  for(let idx=0;idx<schedule.length;idx++){
   const item=schedule[idx];
   const seed=await page.evaluate(scene=>window.__shokokuQa.seedRealisticBattle(scene),item.scene);
   assert.ok(seed&&seed.units===10&&seed.actions.every(a=>a.ok),"expected 10 actual summoned units");
   assert.equal(seed.heavy.length,item.scene==="heavy"?2:0,"matched heavy units");
   // Permit assets and HUD/scene change to settle, then measure the same
   // running page. In no-paint controls game logic stays fully active.
   await page.waitForTimeout(750);
   const measured=await page.evaluate(async noPaint=>{
    window.__shokokuQa.setDrawDisabledForQa(noPaint);
    window.__shokokuQa.resetFrameBench();
    const start=performance.now(),intervals=[];
    await new Promise(resolve=>{
     let previous=performance.now();
     const loop=now=>{
      intervals.push(now-previous);previous=now;
      if(now-start>=2300)resolve();else requestAnimationFrame(loop);
     };
     requestAnimationFrame(loop);
    });
    const frames=window.__shokokuQa.frameBench();
    const mean=key=>round2(frames.reduce((acc,r)=>acc+r[key],0)/Math.max(1,frames.length));
    function round2(n){return Math.round(n*100)/100}
    return {fps:round2(intervals.length*1000/(performance.now()-start)),
      frameSamples:frames.length,logicMs:mean("logicMs"),hudMs:mean("hudMs"),
      drawMs:mean("drawMs"),totalMs:mean("totalMs"),
      waitMs:mean("gapAfterPrevMs"),gapMs:mean("gapMs"),
      galaReady:!!window.GaldArt?.isReady?.(),
      units:window.__shokokuQa.snapshot().units.length,
      frameError:window.__onlineFrameError||null};
   },item.noPaint);
   assert.ok(measured.frameSamples>=5,"must obtain multiple gameplay frame samples");
   assert.equal(measured.frameError,null,"no crash in controlled scenes");
   if(item.noPaint)assert.ok(measured.drawMs<=.03,"render skipped, tick remains live");
   results.push({...item,run:idx+1,...measured});
   console.log("STABLE COMPARISON",JSON.stringify(results.at(-1)));
  }
  fs.writeFileSync(path.join(dir,"same-page-matched.json"),JSON.stringify({
   atlasReady,results,notes:["Same WebKit tab and same warmed game assets across all scenes",
   "Drawing-off keeps the active simulation and HUD; never used in published gameplay",
   "Headless GitHub CI results must not be treated as real school iPad FPS"]
  },null,2));
  assert.deepEqual(errors,[],"no browser Javascript errors");
  console.log("PASS: same-tab warm-asset matched light/heavy comparisons, with/without painting");
 }finally{
  await ctx?.close().catch(()=>{});
  await browser?.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
