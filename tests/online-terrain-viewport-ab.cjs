// Standalone QA experiment. OFF by default in public game; evaluate cropped
// terrain source pixels against the old full-image path at identical world time.
// One-off measurement only, not an FPS claim about real iPad Safari.
"use strict";
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const assert=require("node:assert/strict"),{chromium,webkit}=require("playwright");
const root=process.cwd(),out=path.join(root,"qa-terrain-viewport-ab");fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const target=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.setHeader("content-type",target.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(target).pipe(res);
});
const profiles=[{name:"webkit-ipad",engine:webkit,width:1194,height:834},
 {name:"chromium-sites",engine:chromium,width:900,height:520}];
const scenes=["standard","dense"];
const runs=[];
(async()=>{
 await new Promise(resolve=>server.listen(8787,"127.0.0.1",resolve));
 try{
  for(const profile of profiles){
   const browser=await profile.engine.launch({headless:true});
   try{
    const ctx=await browser.newContext({viewport:{width:profile.width,height:profile.height},
     deviceScaleFactor:2,hasTouch:true});
    try{
     const page=await ctx.newPage(),errors=[];
     page.on("pageerror",e=>errors.push(e.message));
     await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
     await page.goto("http://127.0.0.1:8787/online-ipad.html?qa=1",{waitUntil:"domcontentloaded"});
     await page.locator("#netSolo").waitFor({state:"visible",timeout:20000});
     await page.locator("#netSolo").click();
     await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep");
     await page.waitForFunction(()=>window.KokokuArt?.drawUnit);
     for(const scene of scenes){
      const setup=await page.evaluate(s=>window.__shokokuQa.seedRealisticBattle(s),scene);
      assert.ok(setup?.actions?.every(a=>a.ok),scene+" has only legal card actions");
      for(const x of [300,980]){
       const row=await page.evaluate(({x})=>{
        const q=window.__shokokuQa,c=document.getElementById("field"),
         g=c.getContext("2d"),height=c.height,width=c.width;
        // Freeze simulation progression within this single JS task. Nothing
        // else can interleave an rAF callback until the evaluation completes.
        q.snapCameraForQa(x,330);q.setGrandEffect(false);
        q.setTerrainViewportCrop(false);q.paintOnceForQa();
        const base=g.getImageData(0,0,width,height).data;
        q.setTerrainViewportCrop(true);q.paintOnceForQa();
        const candidate=g.getImageData(0,0,width,height).data;
        let differences=0,worst=0,total=0;
        for(let i=0;i<base.length;i++){
         const error=Math.abs(base[i]-candidate[i]);
         if(error){differences++;worst=Math.max(worst,error);total+=error;}
        }
        const bench=mode=>{
         q.setTerrainViewportCrop(mode);
         for(let warm=0;warm<3;warm++)q.paintOnceForQa();
         const samples=[];
         for(let i=0;i<24;i++){
          const start=performance.now();q.paintOnceForQa();
          samples.push(performance.now()-start);
         }
         samples.sort((a,b)=>a-b);
         return {meanMs:Math.round(samples.reduce((a,b)=>a+b,0)/samples.length*100)/100,
          p50Ms:Math.round(samples[12]*100)/100,p95Ms:Math.round(samples[22]*100)/100};
        };
        const batches=[];
        for(const enabled of [false,true,true,false,true,false,false,true]){
         batches.push({crop:enabled,...bench(enabled)});
        }
        q.setTerrainViewportCrop(false);
        // A direct screenshot AFTER the test uses the production render path.
        q.paintOnceForQa();
        return {camera:q.snapshot().camera,width,height,changedComponents:differences,
         worstError:worst,sumError:total,
         cropped:batches.filter(v=>v.crop),baseline:batches.filter(v=>!v.crop)};
       },{x});
       const output={profile:profile.name,scene,viewport:[profile.width,profile.height],requestedCameraX:x,...row};
       assert.equal(output.changedComponents,0,
        profile.name+"/"+scene+" camera "+x+" must remain pixel-identical");
       runs.push(output);
       console.log("TERRAIN VIEWPORT AB",JSON.stringify(output));
       // Full-page screenshot after hundreds of synchronous Canvas frames
       // once exceeded 12s in headless WebKit. Pixel-identical raw imageData
       // is a stronger assertion here and avoids saturating the QA compositor.
       fs.writeFileSync(path.join(out,"terrain-ab.json"),JSON.stringify(runs,null,2));
      }
     }
     assert.deepEqual(errors,[],profile.name+" must not throw browser JS errors");
     await page.close();
    }finally{await ctx.close();}
   }finally{await browser.close();}
  }
  fs.writeFileSync(path.join(out,"terrain-ab.json"),JSON.stringify(runs,null,2));
  assert.equal(runs.length,profiles.length*scenes.length*2);
  console.log("PASS: terrain viewport A/B pixel identity and 8 measured camera-scene combinations");
 }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
