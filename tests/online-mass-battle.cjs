// Dense 130-unit simulation on real WebKit/Chromium, 3 viewport sizes.
// Benchmark culling A/B within each running browser; no Firebase rooms are used.
"use strict";
const {chromium,webkit}=require("playwright"),http=require("node:http"),fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=process.cwd(),folder="qa-mass-battle";fs.mkdirSync(folder,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end("404");return;}
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
const cases=[{name:"landscape",w:1194,h:834,src:"online.html"},{name:"portrait",w:820,h:1100,src:"online.html"},{name:"sites",w:900,h:520,src:"online-ipad.html"}];
async function sample(page,ms=1100){
 return page.evaluate(ms=>new Promise(resolve=>{
  let start=0,last=0,drawCalls=0,delta=[];
  const original=window.KokokuArt.drawUnit;
  window.KokokuArt.drawUnit=function(...args){drawCalls++;return original.apply(this,args)};
  function frame(t){if(!start)start=t;if(last)delta.push(t-last);last=t;
   if(t-start<ms)requestAnimationFrame(frame);
   else{window.KokokuArt.drawUnit=original;delta.sort((a,b)=>a-b);
    resolve({frames:delta.length,drawCalls,medianMs:delta[Math.floor(delta.length/2)]||0,p95Ms:delta[Math.floor(delta.length*.95)]||0});}
  }
  requestAnimationFrame(frame);
 }),ms);
}
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8777,"127.0.0.1",ok));
  const results=[];
  for(const engine of [{name:"chromium",browser:chromium},{name:"webkit",browser:webkit}]){
   browser=await engine.browser.launch({headless:true});
   for(const c of cases){
    const key=engine.name+"-"+c.name,ctx=await browser.newContext({
     viewport:{width:c.w,height:c.h},hasTouch:true,deviceScaleFactor:2});
    const page=await ctx.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
    try{
     await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
     await page.goto("http://127.0.0.1:8777/"+c.src+"?qa=1",{waitUntil:"domcontentloaded"});
     await page.locator("#netSolo").click();
     await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
     assert.ok(await page.evaluate(()=>window.__shokokuQa.seedMassBattle()),"stress seed allowed");
     const start=await page.evaluate(()=>window.__shokokuQa.snapshot());
     assert.equal(start.units.length,130,"max-cap 65 per team");
     assert.equal(start.units.filter(u=>u.team===1).length,65);
     assert.equal(start.units.filter(u=>u.team===2).length,65);
     await page.evaluate(()=>window.__shokokuQa.setDrawCulling(false));
     const without=await sample(page);
     await page.evaluate(()=>window.__shokokuQa.setDrawCulling(true));
     const withCulling=await sample(page);
     const after=await page.evaluate(()=>window.__shokokuQa.snapshot());
     assert.ok(after.units.length>40,"normal simulation should continue");
     // FPS can improve after culling; total draws may increase because there
     // are more frames. Compare the number of expensive sprite draws per frame.
     const originalPerFrame=without.drawCalls/Math.max(1,without.frames);
     const culledPerFrame=withCulling.drawCalls/Math.max(1,withCulling.frames);
     assert.ok(culledPerFrame<originalPerFrame*.94,
       key+" offscreen draws per frame were not reduced: "+JSON.stringify({without,withCulling}));
     assert.deepEqual(errors,[],key+" runtime errors");
     await page.screenshot({path:path.join(folder,key+".png")});
     const result={key,without,withCulling,unitsRemaining:after.units.length};
     results.push(result);console.log("PASS",JSON.stringify(result));
    }catch(e){
     await page.screenshot({path:path.join(folder,key+"-FAIL.png")}).catch(()=>{});
     throw e;
    }finally{await page.close();await ctx.close();}
   }
   await browser.close();browser=null;
  }
  fs.writeFileSync(path.join(folder,"results.json"),JSON.stringify(results,null,2));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
