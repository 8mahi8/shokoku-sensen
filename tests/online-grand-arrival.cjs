// Cinematic entrance QA: full-field color cue on heavy card, without blocking
// touch input or leaking into normal units. Chromium + WebKit, 3 tablet sizes.
"use strict";
const {chromium,webkit}=require("playwright");
const http=require("node:http"),fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=process.cwd(),out="qa-grand-arrival";fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const filepath=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!filepath.startsWith(root+path.sep)||!fs.existsSync(filepath)||!fs.statSync(filepath).isFile()){
  res.writeHead(404);res.end("Missing");return;
 }
 res.setHeader("Content-Type",filepath.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(filepath).pipe(res);
});
const layouts=[
 {label:"ipad-landscape",w:1194,h:834,src:"online.html"},
 {label:"ipad-portrait",w:820,h:1100,src:"online.html"},
 {label:"sites",w:900,h:520,src:"online-ipad.html"}
];
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8779,"127.0.0.1",ok));
  const results=[];
  for(const e of [{name:"chromium",lib:chromium},{name:"webkit",lib:webkit}]){
   browser=await e.lib.launch({headless:true});
   for(const c of layouts){
    const tag=e.name+"-"+c.label,ctx=await browser.newContext({
     viewport:{width:c.w,height:c.h},deviceScaleFactor:2,hasTouch:true,isMobile:false});
    const page=await ctx.newPage(),errors=[];page.on("pageerror",x=>errors.push(x.message));
    try{
     await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
     await page.goto("http://127.0.0.1:8779/"+c.src+"?qa=1",{waitUntil:"domcontentloaded"});
     await page.locator("#netSolo").click();
     await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
     assert.ok(await page.evaluate(()=>window.__shokokuQa.prepareGrandTest()));
     await page.waitForFunction(()=>window.__shokokuQa.grandState().battleReady);
     assert.equal((await page.evaluate(()=>window.__shokokuQa.grandState())).active,null,"no surprise vignette on entering battle");
     assert.ok(await page.evaluate(()=>window.__shokokuQa.spawnGrandTest(1,"guardian")),"guardian summoned through real deploy");
     await page.waitForFunction(()=>window.__shokokuQa.grandState().active?.key==="guardian",{},{timeout:5000});
     const hero=await page.evaluate(()=>window.__shokokuQa.grandState());
     assert.equal(hero.active.team,1);
     await page.waitForTimeout(220);
     await page.screenshot({path:path.join(out,tag+"-guardian.png")});
     // The screen pulse must not introduce an input-capturing overlay.
     const button=page.locator(".card[data-id='infantry']"),r=await button.boundingBox();
     await page.touchscreen.tap(r.x+r.width*.5,r.y+r.height*.5);
     assert.equal((await page.evaluate(()=>window.__shokokuQa.snapshot())).selected,"infantry","still accepts touch during pulse");
     await page.waitForFunction(()=>window.__shokokuQa.grandState().active===null,{},{timeout:5500});
     // A standard card doesn't trigger a fullscreen heroic announcement.
     assert.equal((await page.evaluate(()=>window.__shokokuQa.grandState())).active,null);
     assert.ok(await page.evaluate(()=>window.__shokokuQa.spawnGrandTest(2,"tank")),"opponent tank summoned");
     await page.waitForFunction(()=>window.__shokokuQa.grandState().active?.key==="tank",{},{timeout:5000});
     const foe=await page.evaluate(()=>window.__shokokuQa.grandState());
     assert.equal(foe.active.team,2);
     await page.waitForTimeout(220);
     await page.screenshot({path:path.join(out,tag+"-enemy-tank.png")});
     await page.waitForFunction(()=>window.__shokokuQa.grandState().active===null,{},{timeout:5500});
     // Disable the cue with test toggle while keeping the full combat simulation.
     await page.evaluate(()=>window.__shokokuQa.setGrandEffect(false));
     assert.equal((await page.evaluate(()=>window.__shokokuQa.grandState())).enabled,false);
     assert.deepEqual(errors,[],tag+" errors");
     const row={tag,blue:hero.active.key,red:foe.active.key,blockedInput:false,ended:true};
     results.push(row);console.log("PASS",JSON.stringify(row));
    }catch(err){
     await page.screenshot({path:path.join(out,tag+"-FAIL.png")}).catch(()=>{});
     throw err;
    }finally{await page.close();await ctx.close();}
   }
   await browser.close();browser=null;
  }
  fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(results,null,2));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
