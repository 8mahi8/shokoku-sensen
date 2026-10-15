// Three accessible objective indicators and taps navigate without summoning.
"use strict";
const {chromium,webkit}=require("playwright"),http=require("node:http"),fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=process.cwd(),folder="qa-fort-navigation";fs.mkdirSync(folder,{recursive:true});
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end("missing");return;}
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");fs.createReadStream(f).pipe(res);
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8780,"127.0.0.1",ok));
  for(const engine of [{name:"chromium",type:chromium},{name:"webkit",type:webkit}]){
   browser=await engine.type.launch({headless:true});
   for(const cfg of [{name:"landscape",w:1194,h:834,src:"online.html"},{name:"portrait",w:820,h:1100,src:"online.html"},{name:"sites",w:900,h:520,src:"online-ipad.html"}]){
    const label=engine.name+"-"+cfg.name,ctx=await browser.newContext({viewport:{width:cfg.w,height:cfg.h},hasTouch:true,deviceScaleFactor:2});
    const p=await ctx.newPage(),errors=[];p.on("pageerror",e=>errors.push(e.message));
    try{
     await p.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
     await p.goto("http://127.0.0.1:8780/"+cfg.src+"?qa=1",{waitUntil:"domcontentloaded"});
     assert.ok(await p.locator("#fortNav").isHidden(),label+" lobby invisible");
     await p.locator("#netSolo").click();
     await p.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
     const nav=p.locator("#fortNav");
     assert.ok(await nav.isVisible(),label+" objective menu visible");
     const buttons=nav.locator("button[data-fort]");
     assert.equal(await buttons.count(),3);
     assert.match(await p.locator("#fortSummary").innerText(),/青0・赤0/);
     assert.ok(await p.evaluate(()=>window.__shokokuQa.setFortTest([1,0,2],true)),label+" QA setup");
     assert.match(await p.locator("#fortSummary").innerText(),/青1・赤1/);
     assert.match(await buttons.nth(0).getAttribute("aria-label"),/青軍/);
     assert.match(await buttons.nth(2).getAttribute("aria-label"),/赤軍/);
     assert.equal(await buttons.nth(1).locator(".fortState").innerText(),"争奪");
     const box=await buttons.nth(1).boundingBox();
     assert.ok(box&&box.width>=41&&box.height>=32,label+" accessible target");
     // Move away first: compact layouts may start within 50 world units of
     // the selected fort, which is not proof that clicking navigated.
     await p.evaluate(()=>window.__shokokuQa.setCamera(1100,330));
     await p.waitForFunction(()=>window.__shokokuQa.snapshot().camera.x>672,null,{timeout:4000});
     const before=await p.evaluate(()=>window.__shokokuQa.snapshot());
     await p.locator('.card[data-id="infantry"]').click();
     const selected=await p.evaluate(()=>window.__shokokuQa.snapshot());
     assert.equal(selected.selected,"infantry",label+" selects infantry");
     await p.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
     await p.waitForFunction(()=>Math.abs(window.__shokokuQa.snapshot().camera.x-633)<8,null,{timeout:4500});
     const after=await p.evaluate(()=>window.__shokokuQa.snapshot());
     assert.equal(after.selected,"infantry",label+" retains card");
     assert.equal(after.units.length,selected.units.length,label+" no false summon");
     assert.notEqual(Math.round(before.camera.x),Math.round(after.camera.x),label+" camera moved");
     assert.deepEqual(errors,[],label+" JS errors");
     await p.screenshot({path:path.join(folder,label+".png")});
     console.log("PASS",label,"owner, contest, nav, touch and no false summon");
    }catch(e){await p.screenshot({path:path.join(folder,label+"-FAIL.png")}).catch(()=>{});throw e;}
    finally{await p.close();await ctx.close();}
   }
   await browser.close();browser=null;
  }
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
