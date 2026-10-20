"use strict";
// QA-only experiment: compare a fixed 10-unit world to actual progressing
// combat within ONE warmed headless WebKit tab. No released game files change.
// The localhost HTML response is altered only in memory to pause simulation
// ticks and animation clock while rendering and rAF continue normally.
const {webkit}=require("playwright");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const assert=require("node:assert/strict");
const root=process.cwd(),out=path.resolve(root,"qa-static-war");
fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
const inject=(source,from,to)=>{
 assert.equal(source.split(from).length,2,"QA injection anchor must occur exactly once: "+from);
 return source.replace(from,to);
};
let qaHtml=inject(html,"S.clock+=delta;","if(!window.__qaTickPause)S.clock+=delta;");
qaHtml=inject(qaHtml,'}else if(NET.isHost&&S.phase==="battle"){',
 '}else if(NET.isHost&&S.phase==="battle"&&!window.__qaTickPause){');
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(req.url.split("?")[0]);
 const file=path.resolve(root,"."+name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 const isHtml=file.endsWith(".html");
 res.setHeader("content-type",isHtml?"text/html; charset=utf-8":"text/javascript; charset=utf-8");
 if(name==="/online-ipad.html"){res.end(qaHtml);return;}
 fs.createReadStream(file).pipe(res);
});
const round=x=>Math.round(x*100)/100;
const patterns=[
 ["live",["light","heavy","heavy","light"],false],
 ["freeze",["light","heavy","heavy","light"],false],
 ["live",["light","heavy","heavy","light"],true],
 ["freeze",["light","heavy","heavy","light"],true]
];
const baseline=patterns.flatMap(([mode,scenes,noPaint])=>scenes.map(scene=>({mode,scene,noPaint})));
const uiControl=[
 // With both the battlefield Canvas and Canvas drawing disabled, isolate
 // card portraits and the bottom cards HUD. Preserve layout in both cases.
 ...["light","heavy","heavy","light"].map(scene=>({mode:"freeze",scene,noPaint:true,canvasHidden:true,hideCards:false})),
 ...["light","heavy","heavy","light"].map(scene=>({mode:"freeze",scene,noPaint:true,canvasHidden:true,hideCards:true}))
];
const filterControls=[
 ...["light","heavy","heavy","light"].map(scene=>({mode:"freeze",scene,noPaint:true,canvasHidden:true,filterOff:false})),
 ...["light","heavy","heavy","light"].map(scene=>({mode:"freeze",scene,noPaint:true,canvasHidden:true,filterOff:true}))
];
const schedule=[...baseline,...uiControl,...filterControls];
const rows=[];
(async()=>{
 let browser,context;
 try{
  await new Promise(resolve=>server.listen(8778,"127.0.0.1",resolve));
  browser=await webkit.launch({headless:true});
  context=await browser.newContext({viewport:{width:1194,height:834},hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",route=>route.abort());
  await page.goto("http://127.0.0.1:8778/online-ipad.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").waitFor({state:"visible",timeout:20000});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep");
  const atlasReady=await page.waitForFunction(()=>window.GaldArt?.isReady?.()===true,
   null,{timeout:35000}).then(()=>true).catch(()=>false);
  // Constant backing resolution for the entire test, avoiding adaptation
  // or per-condition changes in the DPR. This is only a test-browser override.
  await page.evaluate(()=>{
   window.__shokokuQa.setDpr(1);window.__qaTickPause=false;
   const style=document.createElement("style");
   style.textContent="body.qa-no-card-filter .card.unavailable,body.qa-no-card-filter .card.depleted{filter:none!important}";
   document.head.append(style);
  });
  const expectedBacking=await page.evaluate(()=>[
   document.getElementById("field").width,document.getElementById("field").height]);
  console.log("FIXED CONTROL CONFIG",JSON.stringify({atlasReady,expectedBacking}));
  await page.waitForTimeout(400);
  for(let i=0;i<schedule.length;i++){
   const trial=schedule[i];
   const setup=await page.evaluate(control=>{
    window.__shokokuQa.setDrawDisabledForQa(false);
    document.getElementById("field").style.visibility="visible";
    document.getElementById("cards").style.visibility="visible";
    document.getElementById("nextCard").style.visibility="visible";
    document.body.classList.remove("qa-no-card-filter");
    window.__qaTickPause=false;
    // Both paths use the real legal-card summon process. Paused scenes
    // enter frozen mode before the browser can schedule the next rAF tick.
    const seeded=window.__shokokuQa.seedRealisticBattle(control.scene);
    window.__qaTickPause=control.mode==="freeze";
    return seeded;
   },trial);
   assert.ok(setup&&setup.actions.every(a=>a.ok), "legal deployment");
   assert.equal(setup.units,10,"10 initial real summoned units");
   assert.equal(setup.heavy.length,trial.scene==="heavy"?2:0,"heavy category");
   await page.waitForTimeout(300);
   const measured=await page.evaluate(async control=>{
    window.__shokokuQa.setDrawDisabledForQa(control.noPaint);
    document.getElementById("field").style.visibility=control.canvasHidden?"hidden":"visible";
    document.getElementById("cards").style.visibility=control.hideCards?"hidden":"visible";
    document.getElementById("nextCard").style.visibility=control.hideCards?"hidden":"visible";
    document.body.classList.toggle("qa-no-card-filter",!!control.filterOff);
    // Keep HUD, other DOM, Canvas and rAF alive. Only the battle simulation
    // clock and 30Hz tick are frozen in the injected localhost HTML.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    window.__shokokuQa.resetFrameBench();
    const before=window.__shokokuQa.snapshot();
    const start=performance.now(),gaps=[];
    await new Promise(resolve=>{
     let previous=performance.now();
     const sample=now=>{
      gaps.push(now-previous);previous=now;
      if(now-start>=2100)resolve();else requestAnimationFrame(sample);
     };
     requestAnimationFrame(sample);
    });
    const after=window.__shokokuQa.snapshot();
    const frames=window.__shokokuQa.frameBench();
    const avg=k=>frames.reduce((sum,x)=>sum+x[k],0)/Math.max(1,frames.length);
    const sorted=gaps.slice().sort((a,b)=>a-b);
    const pct=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]||0;
    const fingerprint=s=>JSON.stringify(s.units.map(u=>[u.uid,u.team,u.key,u.x,u.y]));
    const cv=document.getElementById("field");
    return {
     fps:Math.round(gaps.length*1000/(performance.now()-start)*100)/100,
     gapP50Ms:Math.round(pct(.5)*100)/100,gapP95Ms:Math.round(pct(.95)*100)/100,
     jsTotalMs:Math.round(avg("totalMs")*100)/100,
     jsLogicMs:Math.round(avg("logicMs")*100)/100,
     jsDrawMs:Math.round(avg("drawMs")*100)/100,
     frameSamples:frames.length,elapsedDelta:Math.round((after.elapsed-before.elapsed)*1000)/1000,
     sameUnitPositions:fingerprint(before)===fingerprint(after),
     unitsStart:before.units.length,unitsEnd:after.units.length,
     heaviesEnd:after.units.filter(u=>u.key==="tank"||u.key==="guardian").length,
     paused:!!window.__qaTickPause,drawDisabled:!!control.noPaint,
     canvasVisible:getComputedStyle(cv).visibility==="visible",
     cardsVisible:getComputedStyle(document.getElementById("cards")).visibility==="visible",
     filterOff:document.body.classList.contains("qa-no-card-filter"),
     unavailableCount:document.querySelectorAll("#cards .card.unavailable").length,
     filteredCardCount:[...document.querySelectorAll("#cards .card")].filter(c=>getComputedStyle(c).filter!=="none").length,
     backing:[cv.width,cv.height],frameError:window.__onlineFrameError||null
    };
   },trial);
   assert.equal(measured.paused,trial.mode==="freeze","simulator pause applies");
   assert.equal(measured.drawDisabled,trial.noPaint,"render control applies");
   assert.equal(measured.canvasVisible,!trial.canvasHidden,"canvas hide control applies");
   assert.equal(measured.cardsVisible,!trial.hideCards,"cards hide control applies");
   assert.equal(measured.filterOff,!!trial.filterOff,"CSS filter isolation applies");
   if(trial.filterOff)assert.equal(measured.filteredCardCount,0,"CSS card filters really removed");
   assert.deepEqual(measured.backing,expectedBacking,"constant Canvas size");
   assert.equal(measured.frameError,null,"no draw exceptions");
   assert.ok(measured.frameSamples>=8,"frame samples exist");
   if(trial.noPaint)assert.ok(measured.jsDrawMs<=.03,"drawing actually disabled");
   if(trial.mode==="freeze"){
    assert.equal(measured.elapsedDelta,0,"simulation does not advance");
    assert.equal(measured.unitsStart,10,"fixed initial count");
    assert.equal(measured.unitsEnd,10,"fixed final count");
    assert.ok(measured.sameUnitPositions,"fixed units do not move");
    assert.equal(measured.heaviesEnd,trial.scene==="heavy"?2:0,"large count remains fixed");
   }else assert.ok(measured.elapsedDelta>.2,"live combat really advances");
   rows.push({...trial,run:i+1,setupUnits:setup.units,...measured});
   console.log("STATIC LIVE CONTROL",JSON.stringify(rows.at(-1)));
   if(trial.mode==="freeze"&&!trial.noPaint&&
     !rows.slice(0,-1).some(r=>r.mode==="freeze"&&!r.noPaint&&r.scene===trial.scene)){
    await page.screenshot({path:path.join(out,"fixed-"+trial.scene+".png"),animations:"disabled"});
   }
  }
  // Guardrail: expected actual visual battles + fixed controls, no fabricated
  // offline FPS claims or unreviewed production optimization.
  assert.deepEqual(errors,[],"uncaught JS errors");
  fs.writeFileSync(path.join(out,"controlled-results.json"),JSON.stringify({
   atlasReady,expectedBacking,rows,
   notes:["Fixed controls keep ten legal units and their initial health untouched",
    "Frozen-world patch exists in QA-served HTML only (not repository HTML)",
    "Live rows intentionally permit deaths and moving projectiles",
    "QA-only visibility controls isolate battlefield Canvas and card HUD compositor contribution",
    "QA-only filter:none removes CSS filters without hiding cards or touching game balance",
    "Headless Linux WebKit is not an actual physical iPad Safari"]
  },null,2));
  console.log("PASS: WebKit fixed-vs-live, DOM visibility, and CSS card filter isolation");
 }finally{
  await context?.close().catch(()=>{});
  await browser?.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error(e);process.exitCode=1});