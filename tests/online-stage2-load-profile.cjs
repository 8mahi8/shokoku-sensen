// Controlled Stage-2 high-density performance/visual investigation.
// No changes to game logic; localhost-only QA fixture inserted into HTML.
// A headless WebKit rAF measurement does NOT equal a physical school iPad FPS.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {webkit,chromium}=require("playwright");
const root=process.cwd(),out=path.join(root,"qa-stage2-load-profile");
fs.mkdirSync(out,{recursive:true});
const original=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
const anchor="window.__shokokuQa={";
assert.equal(original.split(anchor).length,2);
function setupLoadScene(scene){
 if(!NET.isSolo||!["old20","new20","gravity20","child20"].includes(scene))throw Error("QA only");
 resetWorld();S.phase="battle";S.prep=0;S.botThink=999999;
 S.elapsed=120;S.seconds=180;S.clock=120;S.speed=1;
 S.cam.x=740;S.cam.y=330;S.cam.tx=740;S.cam.ty=330;clampCamera();
 S.energy=[0,12,12];S.observedEnergy=[0,12,12];
 const created={};
 function put(key,team,x,y){
  const d=CLASSES[key];if(!d)throw Error("unknown "+key);
  const u={uid:++S.uid,key,team,x,y,anchorX:x,anchorY:y,homeY:y,
   hp:d.hp,max:d.hp,attack:Math.min(.4,d.cool*.3),facing:team===1?0:Math.PI,
   flash:0,attackAnim:0,attackAnimMax:MOTION.attack[key],windup:0,hitAt:-100,
   spawnAt:S.clock-2,spawnDuration:.5,lock:null,walkPhase:0,walking:false,drift:0};
  S.units.push(u);created[key]=(created[key]||0)+1;return u;
 }
 for(const team of [1,2]){
  const x=team===1?620:850;
  if(scene==="child20"){
   const parent=put("mech_summoner",team,x,330);
   for(let i=0;i<8;i++){
    if(!spawnSmallMachine(parent))throw Error("child cap");
    parent.summonCount=i+1;
    parent.summonElapsed=32;
    created.small_machine=(created.small_machine||0)+1;
   }
   put("guardian",team,x,500);
  }else{
   const old=["infantry","infantry","archer","archer","engineer",
    "scout","scout","sentinel","suppress","guardian"];
   const newIds=["piercer","piercer","catapult","catapult","kamikaze",
    "kamikaze","mech_summoner","mech_summoner","infantry","guardian"];
   const ids=scene==="old20"?old:newIds;
   for(let i=0;i<ids.length;i++)put(ids[i],team,x+(i%3-1)*22,118+i*48);
  }
 }
 if(scene==="gravity20"){
  // Use the normal production zone structure; movement/damage remain real.
  S.spells.zones.push({kind:"gravity",team:1,x:795,y:310,r:125,time:2.5,total:2.5});
  S.spells.zones.push({kind:"gravity",team:2,x:670,y:310,r:125,time:2.5,total:2.5});
 }
 const initial=S.units.length;
 if(initial!==20)throw Error("start count "+initial);
 if(scene==="child20"&&created.small_machine!==16)throw Error("expected 16 children");
 return {scene,initial,created,spells:S.spells.zones.length,clock:S.clock};
}
const extra="setupLoadScene:"+setupLoadScene.toString()+","+
 "loadStatus:()=>({units:S.units.length,children:S.units.filter(u=>u.key==='small_machine').length,"+
 "incoming:S.spells.incoming.filter(s=>s.kind==='catapult').length,"+
 "gravity:S.spells.zones.filter(z=>z.kind==='gravity').length,elapsed:S.elapsed}),";
const html=original.replace(anchor,anchor+extra);
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(req.url.split("?")[0]);
 if(pathname==="/online-ipad.html"){
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
  res.end(html);return;
 }
 const p=path.resolve(root,"."+pathname);
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(p).pipe(res);
});
function stat(xs){
 const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);
 const pt=p=>a.length?+a[Math.min(a.length-1,Math.floor((a.length-1)*p))].toFixed(2):null;
 return {count:a.length,p50:pt(.5),p95:pt(.95),p99:pt(.99),max:pt(1),
  mean:a.length?+(a.reduce((u,v)=>u+v,0)/a.length).toFixed(2):null};
}
async function sceneRun(browserType,scene,trial){
 const browser=await browserType.launch({headless:true});
 let context;
 try{
  context=await browser.newContext({viewport:{width:1194,height:834},
   hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",route=>route.abort());
  await page.goto("http://127.0.0.1:8796/online-ipad.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep");
  await page.waitForFunction(()=>window.KokokuArt?.drawUnit);
  const setup=await page.evaluate(s=>window.__shokokuQa.setupLoadScene(s),scene);
  assert.equal(setup.initial,20);
  // Fixed one-pixel backing: close to original guest iPad raster cap.
  await page.evaluate(()=>window.__shokokuQa.setDpr(1));
  await page.waitForTimeout(900);
  const initial=await page.evaluate(()=>window.__shokokuQa.loadStatus());
  await page.screenshot({path:path.join(out,browserType.name()+"-"+scene+"-"+trial+".png"),
   animations:"disabled",timeout:25000});
  await page.evaluate(()=>window.__shokokuQa.resetFrameBench());
  const sample=await page.evaluate(async()=>{
   const start=performance.now(),previous={at:0},gap=[];
   await new Promise(done=>{
    function observe(t){
     if(previous.at)gap.push(t-previous.at);
     previous.at=t;
     if(t-start>=3500)done();else requestAnimationFrame(observe);
    }
    requestAnimationFrame(observe);
   });
   return {duration:performance.now()-start,rafGaps:gap,
    frames:window.__shokokuQa.frameBench(),
    status:window.__shokokuQa.loadStatus(),
    error:window.__onlineFrameError||null};
  });
  const rows=sample.frames.filter(r=>r.phase==="battle");
  assert.equal(sample.error,null,"frame exception");
  assert.ok(sample.status.elapsed>setup.clock+.5,
   "production match must advance past fixture start");
  assert.ok(rows.length>10,"enough battle frames");
  assert.deepEqual(errors,[],"browser errors");
  const result={browser:browserType.name(),scene,trial,setup,initial,
   final:sample.status,frameCount:rows.length,
   raf:stat(sample.rafGaps),
   gap:stat(rows.map(r=>r.gapMs)),
   draw:stat(rows.map(r=>r.drawMs)),logic:stat(rows.map(r=>r.logicMs)),
   net:stat(rows.map(r=>r.networkMs)),
   maxUnitsSeen:Math.max(...rows.map(r=>r.units||0)),
   freshTiles:Math.max(0,...rows.map(r=>r.newCachedTiles||0)),error:sample.error};
  console.log("STAGE2_LOAD_SAMPLE "+JSON.stringify(result));
  return result;
 }finally{
  await context?.close().catch(()=>{});
  await browser.close().catch(()=>{});
 }
}
(async()=>{
 const results=[];
 await new Promise(resolve=>server.listen(8796,"127.0.0.1",resolve));
 try{
  const scenes=["old20","new20","gravity20","child20"];
  for(const scene of scenes){
   // ABBA control for runner/time drift within each engine.
   for(const [engine,reps] of [[webkit,2],[chromium,1]]){
    for(let trial=1;trial<=reps;trial++){
     console.log("STAGE2_LOAD_START "+JSON.stringify({engine:engine.name(),scene,trial}));
     results.push(await sceneRun(engine,scene,trial));
    }
   }
  }
  const summary=Object.fromEntries(["webkit","chromium"].map(browser=>
   [browser,scenes.map(scene=>{
    const a=results.filter(r=>r.browser===browser&&r.scene===scene);
    const avg=key=>+(a.reduce((s,r)=>s+(r[key]?.p95||0),0)/a.length).toFixed(2);
    return {scene,trials:a.length,initial:20,drawP95:avg("draw"),
     logicP95:avg("logic"),gapP95:avg("gap"),
     peakUnits:Math.max(...a.map(r=>r.maxUnitsSeen)),
     finalChildren:Math.max(...a.map(r=>r.final.children))};
   })]));
  assert.equal(results.length,12);
  fs.writeFileSync(path.join(out,"load-results.json"),JSON.stringify({
   summary,results,limitations:[
    "Controlled QA placements/units: old/new rosters and powers differ, not equal game outcomes.",
    "3.5-second post-warmup windows; new summoners can increase the count during the run.",
    "No Firebase in this single-client test, no physical iPad or Google Sites iframe.",
    "Headless WebKit/Chromium frame gaps cannot be read as iPad FPS.",
    "Effects and child mechanisms run in the unchanged production game engine."
   ]},null,2));
  console.log("STAGE2_LOAD_SUMMARY "+JSON.stringify(summary));
  console.log("PASS: 12 Stage-2 load/browser 20-unit stress scenarios");
 }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error("STAGE2_LOAD_FAILED",e);process.exitCode=1});
