// Stage3 paired ABBA comparison of 1 vs 2 sprite tile builds per paint.
// Identical real Firebase, WebKit guest, same page and cold-cache reset between trials.
// QA-only fixture inside localhost host code; never inserted into school HTML.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {chromium,webkit}=require("playwright");
const root=process.cwd(),out=path.join(root,"qa-stage3-cache-budget-abba");
const dbRoot="https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1";
fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function poll(fn,label,timeout=30000){
 const deadline=Date.now()+timeout;let last;
 while(Date.now()<deadline){try{const v=await fn();if(v)return v;}catch(e){last=e;}await sleep(220);}
 throw Error("Timeout "+label+(last?" / "+last.message:""));
}
function fixtureStage3(mode){
 if(!NET.isHost||NET.isSolo||!["plain","gale"].includes(mode))throw Error("invalid perf fixture");
 S.units=[];S.effects=[];S.projectiles=[];S.deaths=[];S.uid=0;S.tickCount=0;
 S.spells={incoming:[],zones:[]};S.botThink=999999;S.botPrepDone=true;
 S.phase="battle";S.prep=0;S.speed=1;S.elapsed=60;S.clock=60;
 S.forts=[{x:410,y:190,hp:12,owner:0},{x:633,y:444,hp:12,owner:0},
  {x:867,y:205,hp:12,owner:0}];
 const cards=["infantry","piercer","archer","sentinel","guardian","tank","catapult",
  "mech_summoner","kaiju","kamikaze"];
 for(const team of [1,2]){
  for(let i=0;i<cards.length;i++){
   const key=cards[i],d=CLASSES[key],x=(team===1?560:805)+(i%2)*15;
   const y=95+i*48;
   const unit={uid:++S.uid,key,team,x,y,anchorX:x,anchorY:y,homeY:y,
    hp:d.hp,max:d.hp,attack:i%3===0?.4:1,attackAnim:0,
    attackAnimMax:MOTION.attack[key],flash:0,windup:0,hitAt:-100,
    spawnAt:-100,spawnDuration:.4,lock:null,walkPhase:0,walking:false,
    drift:0,facing:team===1?0:Math.PI};
   if(mode==="gale")applyStatusEffect(unit,{key:"gale",stat:"moveSpeed",
    mult:1.5,remaining:4});
   S.units.push(unit);
  }
 }
 NET.maybePublish(true);
 return {mode,units:S.units.length,kaiju:S.units.filter(x=>x.key==="kaiju").length,
  gale:S.units.filter(x=>x.statusEffects?.length).length};
}
const anchor="window.__shokokuQa={";
let hostGame=fs.readFileSync(path.join(root,"online-game.js"),"utf8");
assert.equal(hostGame.split(anchor).length,2);
hostGame=hostGame.replace(anchor,anchor+
 "\n fixtureStage3:("+fixtureStage3.toString()+"),");
let guestHtml=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
const budgetAnchor="const DENSE_TILE_BUILDS_PER_FRAME=2;";
assert.equal(guestHtml.split(budgetAnchor).length,2,"exact cache-budget source anchor");
guestHtml=guestHtml.replace(budgetAnchor,"let DENSE_TILE_BUILDS_PER_FRAME=2;");
const guestQaAnchor="window.__shokokuQa={";
assert.equal(guestHtml.split(guestQaAnchor).length,2);
const guestControl=[
 "cacheAbReset:budget=>{",
 " if(![1,2].includes(budget))return false;",
 " DENSE_TILE_BUILDS_PER_FRAME=budget;denseSpriteCache.clear();",
 " denseCacheBroken=false;lowFpsCrowdedSprites=true;",
 " lowFpsCrowdedSpritesAt=performance.now()-500;",
 " guestLowPower=false;guestLastPaint=0;qualityMeasured=true;",
 " S.remoteSprites=null;return true;",
 "},"
].join("\n");
guestHtml=guestHtml.replace(guestQaAnchor,guestQaAnchor+guestControl);
const probe='datum.gapMs>=180&&!document.hidden';
assert.equal(guestHtml.split(probe).length,2,"guest hitch diagnostics source anchor");
guestHtml=guestHtml.replace(probe,'datum.gapMs>=90&&!document.hidden');
const server=http.createServer((req,res)=>{
 try{
  const uri=decodeURIComponent(req.url.split("?")[0]);
  const file=path.resolve(root,"."+uri);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
   res.writeHead(404);res.end("missing");return;
  }
  res.writeHead(200,{"content-type":file.endsWith(".js")?
   "text/javascript; charset=utf-8":"text/html; charset=utf-8","cache-control":"no-store"});
  if(uri==="/online-game.js"){res.end(hostGame);return;}
  if(uri==="/online-ipad.html"){res.end(guestHtml);return;}
  fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end("server");}
});
function stat(items){
 const xs=items.filter(Number.isFinite).sort((a,b)=>a-b);
 const pct=p=>xs.length?Math.round(xs[Math.min(xs.length-1,Math.floor((xs.length-1)*p))]*10)/10:null;
 return {count:xs.length,p50:pct(.5),p95:pct(.95),max:pct(1)};
}
async function sample(page,side,mode){
 return page.evaluate(({side,mode})=>{
  const q=window.__shokokuQa,rows=q.frameBench().filter(x=>x.phase==="battle");
  const d=window.ShokokuNet.syncDiagnostics(),snap=q.snapshot();
  const maxDraw=Math.max(0,...rows.map(x=>x.drawMs||0));
  const hitches=rows.filter(x=>x.gapMs>=90).map(x=>({
   gapMs:Math.round(x.gapMs),drawMs:Math.round(x.drawMs),
   jsMs:Math.round(x.totalMs),logicMs:Math.round(x.logicMs),units:x.units,
   newCachedTiles:x.newCachedTiles||0,
   sdkSeq:x.hitchNet?.sdkSeq??null,appliedSeq:x.hitchNet?.appliedSeq??null,
   sdkAgeMs:x.hitchNet?.sdkAgeMs??null,appliedAgeMs:x.hitchNet?.appliedAgeMs??null,
   restSeq:x.hitchNet?.restSeq??null,applyMs:x.hitchNet?.applyMs??null
  }));
  const sorted=field=>rows.map(x=>x[field]).filter(Number.isFinite).sort((a,b)=>a-b);
  const p95=a=>a.length?a[Math.min(a.length-1,Math.floor((a.length-1)*.95))]:null;
  return {side,mode,phase:snap.phase,units:snap.units.length,
   elapsed:snap.elapsed,seq:d.seq||0,eventSeq:d.eventSeq||0,
   eventAgeMs:d.eventAgeMs||0,applyAgeMs:d.ageMs||0,
   updatesHz:d.updatesHz||0,applyMs:d.applyMs||0,
   frameError:window.__onlineFrameError||null,
   frameCount:rows.length,maxDraw:Math.round(maxDraw),
   gapP95:Math.round(p95(sorted("gapMs"))||0),
   gapMax:Math.round(Math.max(0,...rows.map(x=>x.gapMs||0))),
   drawP95:Math.round(p95(sorted("drawMs"))||0),
   logicP95:Math.round(p95(sorted("logicMs"))||0),
   totalP95:Math.round(p95(sorted("totalMs"))||0),
   cache:q.spriteStats(),quality:q.quality(),
   hitches};
 },{side,mode});
}
(async()=>{
 let hostBrowser,guestBrowser,host,guest,code="";const results=[],errors=[];
 let cleanup=false;
 try{
  await new Promise(ok=>server.listen(8792,"127.0.0.1",ok));
  hostBrowser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  guestBrowser=await webkit.launch({headless:true});
  host=await hostBrowser.newPage({viewport:{width:1024,height:650}});
  guest=await guestBrowser.newPage({viewport:{width:1024,height:650},hasTouch:true,
   deviceScaleFactor:2});
  for(const [who,page] of [["host",host],["guest",guest]]){
   page.on("pageerror",error=>errors.push(who+": "+error.message));
   page.setDefaultTimeout(17000);
  }
  await Promise.all([
   host.goto("http://127.0.0.1:8792/online.html?qa=1"),
   guest.goto("http://127.0.0.1:8792/online-ipad.html?qa=1")
  ]);
  // Localhost QA usually disables adaptive art for controlled A/B.
  // Here we need production-equivalent behavior while tracing real hitches.
  await guest.evaluate(()=>{window.__qaEnableCrowdedArtAdapt=true;});
  for(const page of [host,guest])
   await poll(async()=>(await page.locator("#netStatus").innerText()).includes("接続OK"),
    "Firebase connected",35000);
  await host.locator("#netCreate").click();
  code=await poll(async()=>{
   const label=(await host.locator("#netRoom").innerText()).trim();
   return /^\d{5}$/.test(label)?label:null;
  },"temporary room");
  await guest.locator("#netJoinCode").fill(code);
  await guest.locator("#netJoin").click();
  await poll(async()=>await guest.locator("#netRoom").innerText()===code,"guest joined");
  await guest.locator("#netReady").click();
  await host.locator("#netReady").click();
  await poll(async()=>host.locator("#netStart").isEnabled(),"both seats ready");
  await host.locator("#netStart").click();
  await poll(async()=>await host.locator("#onlinePanel").isHidden()&&
   await guest.locator("#onlinePanel").isHidden(),"playing",35000);
  const orderedBudgets=[2,1,1,2];
  for(const [trial,budget] of orderedBudgets.entries()){
   const mode="plain";
   const before=await guest.evaluate(()=>window.ShokokuNet.syncDiagnostics().seq||0);
   const created=await host.evaluate(x=>window.__shokokuQa.fixtureStage3(x),mode);
   assert.equal(created.units,20);assert.equal(created.kaiju,2);
   assert.equal(created.gale,mode==="gale"?20:0);
   await poll(async()=>{
    const q=await guest.evaluate(()=>({
     seq:window.ShokokuNet.syncDiagnostics().seq||0,
     snap:window.__shokokuQa.snapshot()
    }));
    return q.seq>before&&q.snap.phase==="battle"&&q.snap.units.some(x=>x.key==="kaiju");
   },"guest receives stage3 "+mode,12000);
   const resetOk=await guest.evaluate(b=>window.__shokokuQa.cacheAbReset(b),budget);
   assert.equal(resetOk,true,"QA cache-mode switch and cold reset");
   await Promise.all([host,guest].map(p=>p.evaluate(()=>window.__shokokuQa.resetFrameBench())));
   await sleep(9000); // matched 9s intervals under real host/guest Firebase.
   const [h,g]=await Promise.all([
    sample(host,"chromium-host",mode),sample(guest,"webkit-guest",mode)
   ]);
   assert.ok(g.seq>before+10,"Firebase snapshots advanced during "+mode);
   assert.ok(h.frameCount>100,"host rendered the scene");
   assert.ok(g.frameCount>10,"guest rendered the scene");
   assert.equal(h.frameError,null);assert.equal(g.frameError,null);
   await guest.screenshot({path:path.join(out,"guest-budget"+budget+"-"+trial+".png")});
   results.push({budget,trial,mode,created,host:h,guest:g});
   console.log("STAGE3_CACHE_ABBA_TRIAL "+JSON.stringify({
    budget,trial,mode,host:{frames:h.frameCount,gapP95:h.gapP95,drawP95:h.drawP95},
    guest:{frames:g.frameCount,gapP95:g.gapP95,drawP95:g.drawP95,
     maxGap:g.gapMax,longHitches:g.hitches.filter(x=>x.gapMs>=180).slice(0,12),
     over90:g.hitches.length,finalSeq:g.seq,cache:g.cache,quality:g.quality}}));
  }
  assert.deepEqual(errors,[],"no browser errors");
  console.log("STAGE3_CACHE_ABBA_COMPLETE "+JSON.stringify({order:orderedBudgets,
   results:results.map(r=>({budget:r.budget,trial:r.trial,hostFrames:r.host.frameCount,
    guestFrames:r.guest.frameCount,gapP95:r.guest.gapP95,drawP95:r.guest.drawP95,
    gapMax:r.guest.gapMax,cacheTiles:r.guest.cache.tiles}))}));
 }finally{
  fs.writeFileSync(path.join(out,"trace.json"),JSON.stringify({orderedBudgets:[2,1,1,2],results,errors,notes:[
   "Localhost QA-only synthetic crowd; no school deployment, no gameplay-code change",
   "Real Firebase host+guest with real Canvas and network, but Linux headless browsers",
   "Hitches >=90ms include same-frame SDK/REST snapshot ages (QA only)",
   "A single run cannot establish the root cause of intermittent school iPad stutter"
  ]},null,2));
  // Disconnect sockets before deleting. Otherwise the live RTDB clients can
  // rewrite presence/metadata after DELETE and invalidate readback.
  await guest?.close().catch(()=>{});
  await host?.close().catch(()=>{});
  await guestBrowser?.close().catch(()=>{});
  await hostBrowser?.close().catch(()=>{});
  let deleteStatus=0,verifyStatus=0;
  if(code){
   await sleep(850);
   for(let attempt=0;attempt<3&&!cleanup;attempt++){
    try{
     const endpoint=dbRoot+"/"+code+".json";
     const response=await fetch(endpoint,{method:"DELETE"});
     deleteStatus=response.status;
     if(!response.ok)break;
     await sleep(550);
     const after=await fetch(endpoint);
     verifyStatus=after.status;
     cleanup=after.ok&&(await after.json())===null;
    }catch(e){console.warn("cleanup",e.message);}
   }
  }
  await new Promise(ok=>server.close(ok));
  console.log("STAGE3_CACHE_ABBA_CLEANUP "+JSON.stringify({cleanup,deleteStatus,verifyStatus}));
  if(code&&!cleanup)process.exitCode=1;
 }
})().catch(error=>{console.error("STAGE3_HITCH_TRACE_FAILED",error);process.exitCode=1});
