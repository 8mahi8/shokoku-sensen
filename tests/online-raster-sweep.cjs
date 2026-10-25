"use strict";
// Phase A: same-tab Linux headless WebKit comparisons of actual playable
// 10-unit scenes. All overrides exist ONLY in the loopback-served HTML bytes.
// Nothing changes online-game.js, school Google Sites HTML, main, or Firebase.
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {webkit}=require("playwright");
const root=process.cwd(),output=path.join(root,"qa-raster-sweep");
fs.mkdirSync(output,{recursive:true});
const original=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
const substitute=(html,from,to)=>{
 assert.equal(html.split(from).length,2,"QA-only injection anchor must be unique: "+from);
 return html.replace(from,to);
};
let html=substitute(original,"adaptCanvasQuality(now);",
 "if(!window.__qaDisableAdaptiveDpr)adaptCanvasQuality(now);");
html=substitute(html,"terrain();drawSpellFields(now);",
 "if(!window.__qaSkipTerrain)terrain();drawSpellFields(now);");
html=substitute(html,'S.units.length<(lowFpsCrowdedSprites?6:(!NET.isHost&&guestLowPower?28:40))',
 'S.units.length<(window.__qaDenseAtSix?6:(lowFpsCrowdedSprites?6:(!NET.isHost&&guestLowPower?28:40)))');
html=substitute(html,'((u.key==="guardian"||u.key==="tank")&&!guestSimplifyVisuals()&&!lowFpsCrowdedSprites)||',
 '((u.key==="guardian"||u.key==="tank")&&!guestSimplifyVisuals()&&!lowFpsCrowdedSprites&&!window.__qaDenseAtSix)||');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(req.url.split("?")[0]);
 const file=path.resolve(root,"."+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.setHeader("content-type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(pathname==="/online-ipad.html"){res.end(html);return;}
 fs.createReadStream(file).pipe(res);
});
const round=n=>Math.round(n*100)/100;
const conditions=[];
for(const scene of ["heavy","light"]){
 // Symmetric sequence counters warmup drift and sample ordering; 2 trials each.
 for(const dpr of [1.45,1.0,.8,.8,1.0,1.45])
  conditions.push({scene,dpr,tiles:false,terrain:true,probe:"raster"});
 // Compare low-threshold cached sprites to regular artwork at fixed DPR.
 for(const tiles of [false,true,true,false])
  conditions.push({scene,dpr:1,tiles,terrain:true,probe:"sprite-cache"});
}
// Static background is a *diagnostic control only*. Never propose shipping it.
for(const terrain of [true,false,false,true])
 conditions.push({scene:"heavy",dpr:1,tiles:false,terrain,probe:"background-control"});
(async()=>{
 let browser,ctx;
 try{
  await new Promise(resolve=>server.listen(8781,"127.0.0.1",resolve));
  browser=await webkit.launch({headless:true});
  ctx=await browser.newContext({viewport:{width:1194,height:834},
   hasTouch:true,deviceScaleFactor:2});
  const page=await ctx.newPage(),errors=[];
  page.on("pageerror",err=>errors.push(err.message));
  await page.route("**/www.gstatic.com/firebasejs/**",route=>route.abort());
  await page.goto("http://127.0.0.1:8781/online-ipad.html?qa=1&perf=1",
   {waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").waitFor({state:"visible",timeout:20000});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep");
  const atlasReady=await page.waitForFunction(()=>window.GaldArt?.isReady?.()===true,
   null,{timeout:35000}).then(()=>true).catch(()=>false);
  assert.equal(atlasReady,true,"ensure same warmed high-quality atlas for all measurements");
  await page.evaluate(()=>{window.__qaDisableAdaptiveDpr=true;});
  const rows=[];
  for(let index=0;index<conditions.length;index++){
   const condition=conditions[index];
   // Set a fresh *real legal* battle, reusing the same page and warmed atlas.
   const seeded=await page.evaluate(c=>{
    window.__qaSkipTerrain=!c.terrain;
    window.__qaDenseAtSix=c.tiles;
    window.__shokokuQa.setDrawDisabledForQa(false);
    const seed=window.__shokokuQa.seedRealisticBattle(c.scene);
    window.__shokokuQa.setDpr(c.dpr);
    return seed;
   },condition);
   assert.ok(seeded&&seeded.units===10&&seeded.actions.every(a=>a.ok),
    "ten actually legal deployed units in "+condition.scene);
   if(condition.scene==="heavy")assert.equal(seeded.heavy.length,2);
   else assert.equal(seeded.heavy.length,0);
   await page.waitForTimeout(300);
   const reading=await page.evaluate(async c=>{
    const qa=window.__shokokuQa,field=document.getElementById("field");
    qa.resetFrameBench();
    const state0=qa.snapshot();
    const started=performance.now(),gaps=[];
    await new Promise(resolve=>{
     let last=performance.now();
     const loop=now=>{
      gaps.push(Math.max(0,now-last));last=now;
      if(now-started>=1650)resolve();else requestAnimationFrame(loop);
     };
     requestAnimationFrame(loop);
    });
    const elapsed=performance.now()-started,bench=qa.frameBench();
    const state1=qa.snapshot(),sprites=qa.spriteStats();
    const sorted=gaps.slice().sort((a,b)=>a-b);
    const p95=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]||0;
    const mean=key=>bench.reduce((acc,x)=>acc+x[key],0)/Math.max(1,bench.length);
    return {fps:gaps.length*1000/elapsed,gapP95Ms:p95,
     drawMeanMs:mean("drawMs"),hudMeanMs:mean("hudMs"),
     logicMeanMs:mean("logicMs"),
     clockFraction:(state1.elapsed-state0.elapsed)/(elapsed/1000),
     backing:[field.width,field.height],
     energyBlueGain:state1.energy[1]-state0.energy[1],
     energyRedGain:state1.energy[2]-state0.energy[2],
     unitsAtEnd:state1.units.length,tilesInCache:sprites.tiles,
     cachedSpritesLastFrame:sprites.cached,
     frameSamples:bench.length,errors:window.__onlineFrameError||null};
   },condition);
   assert.equal(reading.errors,null,"no game frame exception");
   assert.ok(reading.frameSamples>=8,"enough browser samples");
   assert.ok(reading.clockFraction>0&&reading.clockFraction<1.35,"bounded host clock");
   assert.ok(Math.abs(reading.energyBlueGain-reading.energyRedGain)<.05,
    "host energy still fair across teams");
   assert.equal(reading.backing[0],Math.round(1194*condition.dpr),
    "DPR fixture must be exact and not silently auto-adapt");
   if(condition.tiles)assert.ok(reading.tilesInCache>0,
    "low threshold must actually use pre-rendered art");
   const row={run:index+1,...condition,...Object.fromEntries(Object.entries(reading)
    .map(([key,value])=>[key,typeof value==="number"?round(value):value]))};
   rows.push(row);console.log("RASTER SWEEP ROW",JSON.stringify(row));
  }
  assert.deepEqual(errors,[],"no JavaScript page errors");
  const summary=[];
  for(const probe of ["raster","sprite-cache","background-control"]){
   const variants=probe==="raster"?[1.45,1,.8]:[false,true];
   for(const scene of ["heavy","light"]){
    for(const variant of variants){
     const subset=rows.filter(row=>row.probe===probe&&row.scene===scene&&
      (probe==="raster"?row.dpr===variant:
       probe==="sprite-cache"?row.tiles===variant:row.terrain===variant));
     if(subset.length===0)continue;
     assert.equal(subset.length,2,"each comparison must have two matched samples");
     const avg=k=>round(subset.reduce((sum,row)=>sum+row[k],0)/subset.length);
     summary.push({probe,scene,variant,
      n:subset.length,meanFps:avg("fps"),meanP95Ms:avg("gapP95Ms"),
      meanDrawMs:avg("drawMeanMs"),meanLogicMs:avg("logicMeanMs"),
      meanClockFraction:avg("clockFraction")});
    }
   }
  }
  console.log("RASTER SWEEP SUMMARY",JSON.stringify(summary));
  fs.writeFileSync(path.join(output,"results.json"),JSON.stringify({
   summary,rows,atlasReady,notes:[
    "All switches QA-only in localhost HTTP response; production game is untouched",
    "Same warmed WebKit tab, matched scenes and symmetrical repetitions",
    "Frames are sampled while real combat proceeds; units can die during each trial",
    "Raster DPR .8 is a visual fidelity tradeoff and is not approved for shipping",
    "Disabling terrain is a diagnostic control, not a playable candidate",
    "Linux headless WebKit is not a physical school iPad: use qualitative results only"
   ]},null,2));
  // Full production adaptive path: do not force the low-threshold cache.
  // A severe <17fps window acts after ~2s; 17-23fps requires two windows.
  // Observe every 225ms because combat may eliminate units before 6.7s.
  const fresh=await page.evaluate(()=>{
   window.__qaSkipTerrain=false;
   window.__qaDenseAtSix=false;
   window.__qaEnableCrowdedArtAdapt=true;
   const scenario=window.__shokokuQa.seedRealisticBattle("heavy");
   window.__shokokuQa.setDpr(1);
   return {scenario,sprites:window.__shokokuQa.spriteStats()};
  });
  assert.equal(fresh.scenario.units,10);
  assert.equal(fresh.sprites.cached,0,"auto-fallback must begin with full artwork");
  await page.screenshot({path:path.join(output,"adaptive-before.png")});
  const checkpoints=[];
  for(let k=0;k<30;k++){
   await page.waitForTimeout(225);
   const live=await page.evaluate(()=>({
    sprites:window.__shokokuQa.spriteStats(),
    units:window.__shokokuQa.snapshot().units.length,
    error:window.__onlineFrameError||null
   }));
   checkpoints.push({atMs:(k+1)*225,units:live.units,
    cached:live.sprites.cached,error:live.error});
  }
  await page.screenshot({path:path.join(output,"adaptive-after.png")});
  console.log("RASTER AUTO FALLBACK",JSON.stringify({checkpoints}));
  assert.ok(checkpoints.every(x=>x.error===null),"no frame errors");
  assert.ok(checkpoints.some(x=>x.cached>0),
   "adaptive fallback must render cached units in an actual battle");
  assert.deepEqual(errors,[],"no JavaScript page errors after adaptive test");
  console.log("PASS: production severe-FPS fallback changes cached sprites only after sustained slow battle");
  console.log("PASS: QA-only DPR / sprite-cache / background control");
 }finally{
  await ctx?.close().catch(()=>{});
  await browser?.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(err=>{console.error(err);process.exitCode=1;});
