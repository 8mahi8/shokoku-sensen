// Review actual mid-match scenes, not just impossible 130-unit crowds.
// Render real 30Hz combat/deployment, record visible heavy art, spells,
// movements and within-profile rAF timing. No Firebase writes or game tweaks.
// CI headless FPS must never be described as physical iPad FPS.
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
const scenes=[
 {id:"standard",units:14,large:0,spells:0,description:"mid-match infantry/scout/engineer/archer engagement"},
 {id:"light",units:10,large:0,spells:0,description:"exactly 10 ordinary units at same frontline as heavy control"},
 {id:"heavy",units:10,large:2,spells:0,description:"tank vs guardian with infantry and archers"},
 {id:"spell",units:8,large:0,spells:1,description:"suppressor and archer vs drones/sentinel with live barrage"},
 {id:"heavy",trial:2,units:10,large:2,spells:0,description:"repeat tank/guardian after other scenarios"},
 {id:"light",trial:2,units:10,large:0,spells:0,description:"repeat matched control in reverse order"}
];
const allResults=[];
const round=n=>Math.round(n*10)/10;
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
   for(const scene of scenes){
    // A fresh page resets one-way DPR/quality adaptation so scenes are comparable.
    const page=await context.newPage(),errors=[],tag=profile.name+"-"+scene.id+"-t"+(scene.trial||1);
    const movie=page.video();
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("**/www.gstatic.com/firebasejs/**",route=>route.abort());
    await page.goto("http://127.0.0.1:8776/online-ipad.html?qa=1&perf=1",
     {waitUntil:"domcontentloaded"});
    await page.locator("#netSolo").waitFor({state:"visible",timeout:20000});
    await page.locator("#netSolo").click();
    await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep");
    await page.waitForFunction(()=>window.KokokuArt?.drawUnit,null,{timeout:15000});
    // Instrument only QA browser paint callbacks (never shipping game logic).
    // Compare total draw cost AND cost per art invocation for each actual unit.
    await page.evaluate(()=>{
     const orig=window.KokokuArt.drawUnit;
     window.__shokokuArtProfile={byKind:{},totalMs:0,totalCalls:0};
     window.KokokuArt.drawUnit=function(...args){
      const start=performance.now(),id=String(args[1]?.key||"unknown");
      try{return orig.apply(this,args);}
      finally{
       const ms=performance.now()-start,p=window.__shokokuArtProfile;
       const s=p.byKind[id]||(p.byKind[id]={calls:0,ms:0,maxMs:0});
       s.calls++;s.ms+=ms;s.maxMs=Math.max(ms,s.maxMs);
       p.totalMs+=ms;p.totalCalls++;
      }
     };
    });
    const setup=await page.evaluate(s=>window.__shokokuQa.seedRealisticBattle(s),scene.id);
    assert.ok(setup&&setup.actions.every(a=>a.ok),tag+" must use real legal cards");
    assert.equal(setup.units,scene.units,tag+" initial unit count");
    assert.equal(setup.heavy.length,scene.large,tag+" heavy sprite count");
    assert.equal(setup.spells,scene.spells,tag+" real spell count");
    assert.ok(setup.actions.every(a=>a.energyAfter>=0&&a.energyBefore<=12),
     tag+" cannot bypass resource budget");
    // Hide diagnostics text in normal screenshots without disabling measurement.
    await page.addStyleTag({
     content:'[aria-label="通信・描画の診断"]{opacity:0!important}'
    });
    const shot=async name=>page.screenshot({
     path:path.join(out,tag+"-"+name+".png"),fullPage:false,animations:"disabled"});
    await shot("00-enter");
    await page.waitForTimeout(950);
    await shot("01-first-second");
    // Reset instrumentation after initial sprite loads/first-frame effects so
    // the 3.5s measure reflects steady-state battle artwork.
    await page.evaluate(()=>{window.__shokokuArtProfile={byKind:{},totalMs:0,totalCalls:0};});
    const measure=await page.evaluate(async()=>{
     const start=performance.now(),gaps=[],positions=new Map();
     const first=window.__shokokuQa.snapshot();
     for(const u of first.units)positions.set(u.uid,[u.x,u.y]);
     await new Promise(resolve=>{
      let prev=performance.now();
      const sample=now=>{
       gaps.push(now-prev);prev=now;
       if(now-start>=3500)resolve();else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
     });
     const now=performance.now(),q=window.__shokokuQa.snapshot(),s=window.__shokokuQa.realisticBattleStatus();
     let moved=0;
     for(const u of q.units){const old=positions.get(u.uid);
      if(old&&Math.hypot(u.x-old[0],u.y-old[1])>.75)moved++;
     }
     gaps.sort((a,b)=>a-b);
     const percentile=p=>Math.round(gaps[Math.min(gaps.length-1,Math.floor(gaps.length*p))]||0);
     const art=window.__shokokuArtProfile;
     return {fps:Math.round(gaps.length*1000/(now-start)*10)/10,frameCount:gaps.length,
      gapP50Ms:percentile(.50),gapP95Ms:percentile(.95),gapMaxMs:percentile(.9999),
      unitsInitially:positions.size,unitsFinal:q.units.length,moved,
      artCalls:art.totalCalls,artMs:Math.round(art.totalMs*10)/10,
      artByKind:Object.fromEntries(Object.entries(art.byKind).map(([kind,v])=>
       [kind,{calls:v.calls,ms:Math.round(v.ms*10)/10,
        msPerCall:Math.round(v.ms/Math.max(1,v.calls)*1000)/1000,
        maxMs:Math.round(v.maxMs*10)/10}])),
      ...s,qaOverlay:document.querySelector('[aria-label="通信・描画の診断"]')?.textContent||""};
    });
    await shot("02-engaged");
    const row={profile:profile.name,scene:scene.id,trial:scene.trial||1,description:scene.description,setup,measure};
    allResults.push(row);
    assert.ok(measure.frameCount>0,tag+" must render future frames");
    assert.ok(measure.moved>0,tag+" must show real movement");
    assert.equal(measure.frameError,null,tag+" cannot have recovered frame exceptions");
    assert.deepEqual(errors,[],tag+" must have no uncaught browser errors");
    console.log("REALISTIC BATTLE",JSON.stringify({profile:profile.name,scene:scene.id,
     trial:scene.trial||1,units:scene.units,large:scene.large,spells:scene.spells,
     fps:measure.fps,p95:measure.gapP95Ms,moved:measure.moved,ends:measure.unitsFinal,
     artCalls:measure.artCalls,artMs:measure.artMs,artByKind:measure.artByKind,
     effects:measure.effects,projectiles:measure.projectiles,
     cachedTiles:measure.cachedTiles}));
    await page.close();
    if(movie)await movie.saveAs(path.join(out,tag+".webm"));
   }
   await context.close();await browser.close();browsers.pop();
  }
  fs.writeFileSync(path.join(out,"realistic-results.json"),JSON.stringify(allResults,null,2));
  assert.equal(allResults.length,profiles.length*scenes.length);
  console.log("PASS: normal/mixed, tank/guardian, and spell combat, WebKit + compact Sites; videos/screenshots saved for human review");
 }finally{
  for(const browser of browsers)try{await browser.close()}catch(_){}
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
