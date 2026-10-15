// Developer-only interactive input QA: real taps, drag, touch-pointer, long press,
// screenshots, recorded video and frame-time sampling. WebKit and Chromium.
"use strict";
const {webkit,chromium}=require("playwright"),fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const root=process.cwd(),out="qa-touch-captures";
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const name=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!name.startsWith(root+path.sep)||!fs.existsSync(name)){res.writeHead(404);res.end("missing");return;}
 res.setHeader("Content-Type",name.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(name).pipe(res);
});
const cases=[
 {name:"landscape",w:1194,h:834,html:"online.html"},
 {name:"sites",w:900,h:520,html:"online-ipad.html"},
 {name:"portrait",w:820,h:1100,html:"online.html"}
];
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8778,"127.0.0.1",ok));
  const results=[];
  for(const engine of [{name:"chromium",type:chromium},{name:"webkit",type:webkit}]){
   browser=await engine.type.launch({headless:true});
   for(const cfg of cases){
    const key=engine.name+"-"+cfg.name;
    const context=await browser.newContext({viewport:{width:cfg.w,height:cfg.h},hasTouch:true,
      deviceScaleFactor:2,recordVideo:{dir:out,size:{width:cfg.w,height:cfg.h}}});
    const page=await context.newPage(),errors=[];
    const snapshot=()=>page.evaluate(()=>window.__shokokuQa.snapshot());
    page.on("pageerror",e=>errors.push(e.message));
    try{
     await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
     await page.goto("http://127.0.0.1:8778/"+cfg.html+"?qa=1",{waitUntil:"domcontentloaded"});
     await page.locator("#netSolo").click();
     await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
     const initial=await snapshot();
     assert.ok(initial.view.w>=700&&initial.view.h>=190,key+" arena dimensions");
     const infantry=page.locator('.card[data-id="infantry"]');
     let r=await infantry.boundingBox(),cx=r.x+r.width/2,cy=r.y+r.height/2;
     await page.touchscreen.tap(cx,cy);
     assert.equal((await snapshot()).selected,"infantry",key+" tap select");
     await page.touchscreen.tap(cx,cy);
     assert.equal((await snapshot()).selected,null,key+" tap toggle");
     await page.touchscreen.tap(cx,cy);
     const f=await page.locator("#field").boundingBox(),v=(await snapshot()).view;
     await page.touchscreen.tap(f.x+v.ox+155*v.s,f.y+v.oy+350*v.s);
     const deployed=await snapshot();
     assert.ok(deployed.units.some(u=>u.team===1),key+" legal summon");
     assert.ok(deployed.energy[1]<initial.energy[1],key+" summon costs energy");
     await page.screenshot({path:path.join(out,key+"-deployed.png")});
     const start={x:f.x+f.width*.74,y:f.y+f.height*.52},end={x:f.x+f.width*.31,y:start.y};
     await page.mouse.move(start.x,start.y);await page.mouse.down();
     await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();
     const swiped=await snapshot();
     assert.ok(swiped.camera.x>deployed.camera.x+12,key+" mouse swipe pans");
     assert.equal(swiped.units.filter(u=>u.team===1).length,deployed.units.filter(u=>u.team===1).length,key+" swipe never summons");
     // Synthetic pointerType=touch verifies the touch branch without claiming hardware equivalence.
     await page.evaluate(({start,end})=>{
      const cv=document.querySelector("#field");
      const send=(kind,x,y)=>cv.dispatchEvent(new PointerEvent(kind,{bubbles:true,cancelable:true,
       pointerId:44,pointerType:"touch",isPrimary:true,clientX:x,clientY:y,buttons:kind==="pointerup"?0:1}));
      send("pointerdown",start.x,start.y);
      for(let n=1;n<=7;n++)send("pointermove",start.x+(end.x-start.x)*n/7,start.y+(end.y-start.y)*n/7);
      send("pointerup",end.x,end.y);
     },{start:{x:f.x+f.width*.31,y:f.y+f.height*.57},end:{x:f.x+f.width*.69,y:f.y+f.height*.57}});
     const touch=await snapshot();
     assert.ok(touch.camera.x<swiped.camera.x-8,key+" touch pointer swipe pans");
     assert.equal(touch.units.filter(u=>u.team===1).length,deployed.units.filter(u=>u.team===1).length,key+" touch swipe no summon");
     await page.screenshot({path:path.join(out,key+"-swiped.png")});
     const other=page.locator('.card:not([data-id="infantry"])').first(),p=await other.boundingBox(),selected=touch.selected;
     await page.mouse.move(p.x+p.width/2,p.y+p.height/2);
     await page.mouse.down();
     await page.locator("#cardInfoOverlay").waitFor({state:"visible",timeout:4000});
     await page.mouse.up();
     assert.equal((await snapshot()).selected,selected,key+" long press must not select a card");
     await page.screenshot({path:path.join(out,key+"-long-press.png")});
     await page.locator("#cardInfoClose").click();
     assert.ok(await page.locator("#cardInfoOverlay").isHidden(),key+" modal closes");
     const frames=await page.evaluate(()=>new Promise(ok=>{
      let first=0,last=0,d=[];
      function loop(t){if(!first)first=t;if(last)d.push(t-last);last=t;
       if(t-first<1100)requestAnimationFrame(loop);
       else {d.sort((a,b)=>a-b);ok({count:d.length,medianMs:d[Math.floor(d.length*.5)]||null,p95Ms:d[Math.floor(d.length*.95)]||null});}}
      requestAnimationFrame(loop);
     }));
     assert.ok(frames.count>=8,key+" frame stall "+JSON.stringify(frames));
     assert.deepEqual(errors,[],key+" uncaught errors");
     results.push({key,frames});
     console.log("PASS",key,"tap, legal summon, mouse & touch swipe, long-press, close, frame sample",JSON.stringify(frames));
    }catch(e){
     await page.screenshot({path:path.join(out,key+"-FAILED.png")}).catch(()=>{});
     throw e;
    }finally{await page.close();await context.close();}
   }
   await browser.close();browser=null;
  }
  fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(results,null,2));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
