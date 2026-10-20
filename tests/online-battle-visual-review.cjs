// Human-review evidence: live, moving battles rather than menu-only screenshots.
// CI collects WebKit video and sequential screenshots without Firebase writes.
// These artifacts are for visual inspection; FPS is reported, not equated with
// real hardware, and gameplay/bot code is never changed for the recordings.
"use strict";
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const assert=require("node:assert/strict"),{chromium,webkit}=require("playwright");
const root=process.cwd(),out=path.join(root,"qa-battle-visual");
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.setHeader("content-type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(file).pipe(res);
});
const profiles=[
 {name:"webkit-ipad-landscape",engine:webkit,width:1194,height:834,video:true},
 {name:"chromium-sites-compact",engine:chromium,width:900,height:520,video:false}
];
(async()=>{
 const browsers=[];
 try{
  await new Promise(resolve=>server.listen(8776,"127.0.0.1",resolve));
  for(const profile of profiles){
   const browser=await profile.engine.launch({headless:true});browsers.push(browser);
   const context=await browser.newContext({
    viewport:{width:profile.width,height:profile.height},hasTouch:true,
    deviceScaleFactor:2,
    ...(profile.video?{recordVideo:{dir:out,size:{width:profile.width,height:profile.height}}}:{})
   });
   const page=await context.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   // Offline human-vs-BOT uses the same 30Hz game simulation without touching RTDB.
   await page.route("**/www.gstatic.com/firebasejs/**",route=>route.abort());
   await page.goto("http://127.0.0.1:8776/online-ipad.html?qa=1&perf=1",
    {waitUntil:"domcontentloaded"});
   await page.locator("#netSolo").waitFor({state:"visible",timeout:20000});
   await page.locator("#netSolo").click();
   await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep");
   // Show a user-triggered summon so visuals cover more than BOT idle poses.
   await page.locator('button.card[data-id="infantry"]').click();
   const rect=await page.locator("#field").boundingBox();
   assert.ok(rect&&rect.width>300&&rect.height>190,"battlefield canvas visible");
   await page.mouse.click(rect.x+rect.width*.13,rect.y+rect.height*.47);
   await page.waitForFunction(()=>window.__shokokuQa.snapshot().units.some(x=>x.team===1),
    null,{timeout:15000});
   await page.waitForFunction(()=>window.__shokokuQa.snapshot().phase==="battle",
    null,{timeout:26000});
   const shot=async name=>page.screenshot({path:path.join(out,profile.name+"-"+name+".png"),
    fullPage:false,animations:"disabled"});
   await page.waitForTimeout(950);await shot("battle-open");
   await page.waitForTimeout(2200);await shot("battle-3sec");
   await page.evaluate(()=>window.__shokokuQa.setCamera(985,330));
   await page.waitForTimeout(800);await shot("battle-guest-side");
   // A crowded battle catches sprite overlap, dense-cache bugs, slow draw work,
   // and illegible UI that a near-empty opening board cannot show.
   const seeded=await page.evaluate(()=>window.__shokokuQa.seedMassBattle());
   assert.equal(seeded,true,"stress battle established");
   const first=await page.evaluate(()=>window.__shokokuQa.snapshot());
   assert.equal(first.units.length,130,"dense field contains 130 initially");
   await page.waitForTimeout(900);await shot("crowded-open");
   const motion=await page.evaluate(async()=>{
    const start=performance.now(),times=[],positions=new Map();
    for(const u of window.__shokokuQa.snapshot().units)positions.set(u.uid,[u.x,u.y]);
    await new Promise(resolve=>{
     let prev=performance.now();
     const next=now=>{
      times.push(now-prev);prev=now;
      if(now-start>=3500)resolve();
      else requestAnimationFrame(next);
     };
     requestAnimationFrame(next);
    });
    const s=window.__shokokuQa.snapshot(),sorted=times.slice().sort((a,b)=>a-b);
    let moved=0;
    for(const u of s.units){
     const old=positions.get(u.uid);
     if(old&&Math.hypot(u.x-old[0],u.y-old[1])>.75)moved++;
    }
    return {frames:times.length,fps:Math.round(times.length*1000/(performance.now()-start)*10)/10,
     gapP95Ms:Math.round(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]||0),
     maxGapMs:Math.round(sorted.at(-1)||0),initialUnits:positions.size,
     remainingUnits:s.units.length,movingUnits:moved,frameError:window.__onlineFrameError||null};
   });
   await shot("crowded-later");
   assert.ok(motion.frames>0,"frames must continue to render during stress");
   assert.ok(motion.movingUnits>0,"units must move in actual simulated battle");
   assert.equal(motion.frameError,null,"no uncaught game frame error");
   assert.deepEqual(errors,[],"browser runtime JavaScript errors");
   console.log("BATTLE VISUAL REVIEW",profile.name,JSON.stringify(motion));
   // Context closure finalizes the Playwright WebKit video on disk.
   await context.close();await browser.close();browsers.pop();
  }
  console.log("PASS: real moving normal and crowded battles recorded for human visual inspection");
 }finally{
  for(const browser of browsers)try{await browser.close()}catch(_){}
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
