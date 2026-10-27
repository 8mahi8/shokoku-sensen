// Real-time full expert BOT-vs-BOT: existing AI drives both sides, no scripted unit taps.
// No time skipping, artificial winner, replay logging or production page changes.
// Uses one disposable Firebase room and deletes it in finally.
"use strict";
const {chromium,webkit}=require("playwright");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const assert=require("node:assert/strict");
const root=process.cwd(),dir=path.join(root,"qa-online-bot-vs-bot");
fs.mkdirSync(dir,{recursive:true});
const dbRoot="https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label,ms=25000)=>{
 const until=Date.now()+ms;let error;
 while(Date.now()<until){
  try{const value=await fn();if(value)return value}catch(e){error=e}
  await sleep(300);
 }
 throw Error("Timeout "+label+(error?": "+error.message:""));
};
const server=http.createServer((req,res)=>{
 const filepath=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!filepath.startsWith(root+path.sep)||!fs.existsSync(filepath)||
    !fs.statSync(filepath).isFile()){res.writeHead(404);res.end("not found");return}
 const ext=path.extname(filepath);
 res.writeHead(200,{"content-type":ext===".html"?"text/html; charset=utf-8":
  ext===".js"?"text/javascript; charset=utf-8":"application/octet-stream",
  "cache-control":"no-store"});
 fs.createReadStream(filepath).pipe(res);
});
const round=n=>Math.round(n*10)/10;
const percentile=(sorted,p)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]:0;
(async()=>{
 let hostBrowser,guestBrowser,hostContext,guestContext,host,guest,roomCode="";
 let allSamples=[],pageErrors=[],startedAt=0,lastGameElapsed=0,finished=false;
 let maxBlue=0,maxRed=0,maxUnits=0,latestBotStats=null;
 let endedStatus="",endReason="",cleanupOk=false;
 let stallProbes=[];
 try{
  await new Promise(r=>server.listen(8766,"127.0.0.1",r));
  hostBrowser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  guestBrowser=await webkit.launch({headless:true});
  hostContext=await hostBrowser.newContext({viewport:{width:1194,height:834},
   // Observe what the authoritative host actually displayed at the same time
   // as the WebKit guest, rather than guessing from packet counters alone.
   recordVideo:{dir,size:{width:960,height:672}}});
  guestContext=await guestBrowser.newContext({viewport:{width:1194,height:834},
   deviceScaleFactor:2,hasTouch:true,
   // QA-only visual review: record what the WebKit guest actually displays.
   // This is local to GitHub Actions; never upload gameplay video to Firebase.
   recordVideo:{dir,size:{width:960,height:672}}});
  host=await hostContext.newPage();guest=await guestContext.newPage();
  for(const [side,page] of [["host",host],["guest",guest]]){
   page.on("pageerror",e=>pageErrors.push(side+": "+e.message));
  }
  await Promise.all([
   host.goto("http://127.0.0.1:8766/online.html?qa=1&perf=1"),
   guest.goto("http://127.0.0.1:8766/online-ipad.html?qa=1&perf=1")
  ]);
  // Exercise production's low-FPS adaptive art mode, normally suppressed
  // on localhost only to keep other graphical A/B tests comparable.
  await guest.evaluate(()=>{window.__qaEnableCrowdedArtAdapt=true;});
  for(const p of [host,guest])
   await wait(async()=>(await p.locator("#netStatus").innerText()).includes("接続OK"),"Firebase connected",35000);
  await host.locator("#netCreate").click();
  roomCode=await wait(async()=>{
   const c=(await host.locator("#netRoom").innerText()).trim();
   return /^\d{5}$/.test(c)?c:null;
  },"temporary room");
  await guest.locator("#netJoinCode").fill(roomCode);
  await guest.locator("#netJoin").click();
  await wait(async()=>(await guest.locator("#netRoom").innerText()).trim()===roomCode,"guest joined");
  // The real red BOT participates from the guest device, not from host.
  await guest.locator("#netGuestBot").click();
  await wait(async()=>await guest.locator("#netGuestBot").getAttribute("aria-pressed")==="true",
   "red guest BOT enabled");
  await wait(async()=>(await guest.locator("#netReady").innerText()).includes("✓"),
   "guest BOT auto readied");
  const blueBot=await host.evaluate(()=>window.__shokokuQa.autoBlueBotForQa(true));
  assert.equal(blueBot,true,"loopback host enabled real blue expert AI");
  await host.locator("#netReady").click();
  await wait(async()=>host.locator("#netStart").isEnabled(),"both seats ready");
  await host.locator("#netStart").click();
  await wait(async()=>await host.locator("#onlinePanel").isHidden()&&
   await guest.locator("#onlinePanel").isHidden(),"game started");
  const stateURL=dbRoot+"/"+roomCode+"/state.json",metaURL=dbRoot+"/"+roomCode+"/meta.json";
  async function state(){
   const r=await fetch(stateURL);
   if(!r.ok)throw Error("RTDB state HTTP "+r.status);
   return r.json();
  }
  async function sample(page,side){
   return page.evaluate(side=>{
    const q=window.__shokokuQa;
    const frames=q.frameBench().filter(x=>x.phase==="battle");
    const gaps=frames.map(x=>x.gapMs).filter(Number.isFinite).sort((a,b)=>a-b);
    const times=frames.map(x=>x.totalMs).filter(Number.isFinite).sort((a,b)=>a-b);
    const draws=frames.map(x=>x.drawMs).filter(Number.isFinite).sort((a,b)=>a-b);
    const p=(x,v)=>x.length?x[Math.min(x.length-1,Math.floor(x.length*v))]:0;
    const g=q.snapshot(),d=window.ShokokuNet.syncDiagnostics();
    q.resetFrameBench();
    return {side,phase:g.phase,elapsed:g.elapsed,units:g.units.length,frameCount:frames.length,
     p50Gap:Math.round(p(gaps,.50)),p95Gap:Math.round(p(gaps,.95)),
     maxGap:Math.round(p(gaps,1)),maxDraw:Math.round(p(draws,1)),
     maxFrameJs:Math.round(p(times,1)),
     maxNewCachedTiles:Math.max(0,...frames.map(x=>x.newCachedTiles||0)),
     cacheTiles:window.__shokokuQa.spriteStats()?.tiles||0,
     gapOver250:gaps.filter(x=>x>=250).length,
     gapOver500:gaps.filter(x=>x>=500).length,
     gapOver1000:gaps.filter(x=>x>=1000).length,
     seq:d.seq||0,eventSeq:d.eventSeq||0,
     eventAgeMs:d.eventAgeMs||0,applyAgeMs:d.ageMs||0,
     updatesHz:d.updatesHz||0,applyMs:d.applyMs||0,
     coalesced:d.coalesced||0,error:d.error||"",frameError:window.__onlineFrameError||"",
     publishAgeMs:d.publishAgeMs||0,ackMs:d.ackMs||0,
     publishRetries:d.retries||0,publishFailures:d.writeFailures||0,
     restSeq:d.restSeq||0,restAgeMs:d.restAgeMs||0,
     bots:q.botStats(),
     blueCount:g.units.filter(x=>x.team===1).length,
     redCount:g.units.filter(x=>x.team===2).length,
     diagnostic:document.querySelector('[aria-label="通信・描画の診断"]')?.textContent?.slice(-360)||""};
   },side);
  }
  await Promise.all([host,guest].map(p=>p.evaluate(()=>window.__shokokuQa.resetFrameBench())));
  startedAt=Date.now();
  let nextStats=Date.now()+5000;
  let nextStallCheck=Date.now()+950,lastStallProbeAt=0;
  const hardDeadline=Date.now()+495000;
  while(Date.now()<hardDeadline){
   const now=Date.now();
   // Observe real BOT gameplay. Only on SDK silence, compare the RTDB
   // server's actual latest seq with host-published and guest-received seq.
   // Test-only reads never change rooms, rules, or production code.
   if(now>=nextStallCheck){
    nextStallCheck=now+950;
    const [hd,gd]=await Promise.all([
     host.evaluate(()=>window.ShokokuNet.syncDiagnostics()),
     guest.evaluate(()=>window.ShokokuNet.syncDiagnostics())
    ]);
    if(gd.phase==="playing"&&gd.eventAgeMs>=1250&&
      (hd.seq-gd.eventSeq>=4||hd.publishAgeMs>=1250)&&
      now-lastStallProbeAt>=1900){
     lastStallProbeAt=now;
     const probe={atSec:round((Date.now()-startedAt)/1000),
      hostSeq:hd.seq,hostPublishAgeMs:hd.publishAgeMs,
      hostAckMs:hd.ackMs,hostRetries:hd.retries,hostWriteFailures:hd.writeFailures,
      guestSdkSeq:gd.eventSeq,guestAppliedSeq:gd.seq,
      guestSdkAgeMs:gd.eventAgeMs,guestAppliedAgeMs:gd.ageMs,
      guestApplyMs:gd.applyMs,guestCoalesced:gd.coalesced,
      restSeq:null,restError:null};
     try{
      const response=await fetch(stateURL+"?staleProbe="+Date.now(),
       {signal:AbortSignal.timeout(2500),cache:"no-store"});
      if(!response.ok)throw Error("HTTP "+response.status);
      const latest=await response.json();
      probe.restSeq=Number.isInteger(latest?.seq)?latest.seq:null;
     }catch(e){probe.restError=String(e?.message||e)}
     stallProbes.push(probe);
     console.log("BOT VS BOT STALL PROBE",JSON.stringify(probe));
    }
   }
   if(now>=nextStats){
    const [h,g]=await Promise.all([sample(host,"host"),sample(guest,"guest")]);
    allSamples.push({atSec:round((Date.now()-startedAt)/1000),host:h,guest:g});
    lastGameElapsed=Math.max(lastGameElapsed,h.elapsed||0);
    maxUnits=Math.max(maxUnits,h.units);maxBlue=Math.max(maxBlue,h.blueCount);
    maxRed=Math.max(maxRed,h.redCount);latestBotStats={host:h.bots,guest:g.bots};
    if(allSamples.length%4===0)console.log("BOT VS BOT WINDOW",JSON.stringify({
     atSec:round((Date.now()-startedAt)/1000),
     gameSec:round(h.elapsed||0),units:g.units,hostGapMs:h.maxGap,
     guestGapMs:g.maxGap,guestNetworkAgeMs:g.applyAgeMs,
     guestFrames:g.frameCount,guestUpdatesHz:g.updatesHz,
     blueBotActions:h.bots.played[1],redBotActions:g.bots.played[2],
     maxUnits,maxBlue,maxRed
    }));
    nextStats=Date.now()+5000;
   }
   const m=await (await fetch(metaURL)).json();
   if(m?.status==="finished"){
    finished=true;endedStatus=m.status;
    const pkt=await state();
    const w=pkt?.world||{};
    lastGameElapsed=w.elapsed||lastGameElapsed;
    endReason=(await host.locator("#dialogText").innerText()).slice(0,100);
    break;
   }
   await sleep(550);
  }
  if(host)await host.screenshot({path:path.join(dir,"bot-vs-bot-final-host.png")}).catch(()=>{});
  if(guest)await guest.screenshot({path:path.join(dir,"bot-vs-bot-final-guest.png")}).catch(()=>{});
  const guestGaps=allSamples.flatMap(x=>[x.guest.maxGap]);
  const hostGaps=allSamples.flatMap(x=>[x.host.maxGap]);
  const summary={
   test:"real full expert BOT-vs-BOT over Firebase, no time skip",durationWallSec:round((Date.now()-startedAt)/1000),
   gameElapsedSec:round(lastGameElapsed),completed:finished,status:endedStatus,endReason,
   scenario:"Chromium host drives blue expert BOT; iPad-size WebKit guest drives real red BOT over RTDB",
   frameWindows:allSamples.length,
   guestLongestFrameGapMs:Math.max(0,...guestGaps),
   hostLongestFrameGapMs:Math.max(0,...hostGaps),
   guestWindowsOver500ms:allSamples.filter(x=>x.guest.gapOver500>0).length,
   guestWindowsOver1000ms:allSamples.filter(x=>x.guest.gapOver1000>0).length,
   guestMaxRenderWorkMs:Math.max(0,...allSamples.map(x=>x.guest.maxFrameJs)),
   guestMaxNewCachedTilesPerFrame:Math.max(0,...allSamples.map(x=>x.guest.maxNewCachedTiles)),
   guestMaxCacheTilesSeen:Math.max(0,...allSamples.map(x=>x.guest.cacheTiles)),
   guestMaxSnapshotAgeMs:Math.max(0,...allSamples.map(x=>x.guest.applyAgeMs)),
   hostMaxPublishAgeMs:Math.max(0,...allSamples.map(x=>x.host.publishAgeMs)),
   hostMaxPublishRetries:Math.max(0,...allSamples.map(x=>x.host.publishRetries)),
   maxSdkEventAgeMs:Math.max(0,...allSamples.map(x=>x.guest.eventAgeMs),
    ...stallProbes.map(x=>x.guestSdkAgeMs)),
   stallProbes:stallProbes.length,
   restAheadOfSdkCount:stallProbes.filter(x=>x.restSeq!==null&&
    x.restSeq>x.guestSdkSeq).length,
   lastGuestSeq:allSamples.at(-1)?.guest.seq||0,
   maxUnits,maxBlue,maxRed,
   blueBotActions:latestBotStats?.host.played[1]||0,
   redBotActions:latestBotStats?.guest.played[2]||0,
   blueDecisions:latestBotStats?.host.blueDecisions||0,
   blueBotEnabled:latestBotStats?.host.autoBlue||false,
   redGuestBotEnabled:latestBotStats?.guest.guestBot||false,
   pageErrors,
   limitations:"Linux headless WebKit is not physical school Safari or Google Sites iframe; guest BOT issues validated network commands"
  };
  fs.writeFileSync(path.join(dir,"bot-vs-bot-results.json"),JSON.stringify({summary,samples:allSamples,stallProbes},null,2));
  console.log("BOT VS BOT RESULT",JSON.stringify(summary));
  assert.ok(finished,"Full match must reach a genuine win, loss or time-expiry result");
  assert.ok(lastGameElapsed>30,"Match must progress through meaningful battle time");
  assert.ok(summary.blueBotActions>=6,"blue BOT must independently make legal plays");
  assert.ok(summary.redBotActions>=6,"red guest BOT must actually issue legal network commands");
  assert.ok(maxBlue>=1&&maxRed>=1,"host and guest BOTs must both field troops");
  assert.equal(pageErrors.length,0,"No JS uncaught errors");
  assert.ok(summary.guestMaxNewCachedTilesPerFrame<=2,
   "cache tiles must not be created more than twice per guest painting frame");
  console.log("GUEST CACHE ADAPTATION",JSON.stringify({
   maxTilesBuiltInFrame:summary.guestMaxNewCachedTilesPerFrame,
   totalCachedTilesSeen:summary.guestMaxCacheTilesSeen}));
  console.log("PASS: full 300s real BOT-vs-BOT Firebase match with frame/network monitoring");
 }finally{
  for(const ctx of [hostContext,guestContext])if(ctx)await ctx.close().catch(()=>{});
  // Videos are finalized when the context closes. Keep the entire real match
  // so momentary visual stutter can be reviewed, not just a final screenshot.
  if(guest?.video())await guest.video().saveAs(path.join(dir,"bot-vs-bot-guest-full-match.webm")).catch(e=>console.error("GUEST VIDEO SAVE FAILED",e));
  if(host?.video())await host.video().saveAs(path.join(dir,"bot-vs-bot-host-full-match.webm")).catch(e=>console.error("HOST VIDEO SAVE FAILED",e));
  for(const browser of [hostBrowser,guestBrowser])if(browser)await browser.close().catch(()=>{});
  if(roomCode){
   await sleep(650);
   const endpoint=dbRoot+"/"+roomCode+".json";
   const resp=await fetch(endpoint,{method:"DELETE"}).catch(()=>null);
   if(resp?.ok){
    const verification=await fetch(endpoint).then(r=>r.json()).catch(()=>undefined);
    cleanupOk=verification===null;
   }
   console.log("BOT VS BOT TEMP ROOM CLEANUP",cleanupOk?"confirmed":"FAILED");
  }
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error("BOT VS BOT TEST FAILED",e);process.exitCode=1});
