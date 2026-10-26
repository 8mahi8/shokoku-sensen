// Real-time, full-match 1v1 regression: Chromium host, WebKit iPad-like guest.
// No time skipping, artificial winner, replay logging or production page changes.
// Uses one disposable Firebase room and deletes it in finally.
"use strict";
const {chromium,webkit}=require("playwright");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const assert=require("node:assert/strict");
const root=process.cwd(),dir=path.join(root,"qa-full-match");
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
 let allSamples=[],actions=[],pageErrors=[],startedAt=0,lastGameElapsed=0,finished=false;
 let endedStatus="",endReason="",cleanupOk=false;
 try{
  await new Promise(r=>server.listen(8766,"127.0.0.1",r));
  hostBrowser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  guestBrowser=await webkit.launch({headless:true});
  hostContext=await hostBrowser.newContext({viewport:{width:1194,height:834}});
  guestContext=await guestBrowser.newContext({viewport:{width:1194,height:834},
   deviceScaleFactor:2,hasTouch:true});
  host=await hostContext.newPage();guest=await guestContext.newPage();
  for(const [side,page] of [["host",host],["guest",guest]]){
   page.on("pageerror",e=>pageErrors.push(side+": "+e.message));
  }
  await Promise.all([
   host.goto("http://127.0.0.1:8766/online.html?qa=1&perf=1"),
   guest.goto("http://127.0.0.1:8766/online-ipad.html?qa=1&perf=1")
  ]);
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
  await guest.locator("#netReady").click();
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
     gapOver250:gaps.filter(x=>x>=250).length,
     gapOver500:gaps.filter(x=>x>=500).length,
     gapOver1000:gaps.filter(x=>x>=1000).length,
     seq:d.seq||0,eventSeq:d.eventSeq||0,
     eventAgeMs:d.eventAgeMs||0,applyAgeMs:d.ageMs||0,
     updatesHz:d.updatesHz||0,applyMs:d.applyMs||0,
     coalesced:d.coalesced||0,error:d.error||"",frameError:window.__onlineFrameError||"",
     diagnostic:document.querySelector('[aria-label="通信・描画の診断"]')?.textContent?.slice(-360)||""};
   },side);
  }
  async function attemptSummon(page,side){
   const before=await state();
   const uid=Number(before?.world?.uid)||0;
   const at=Date.now(),elapsed=round((at-startedAt)/1000);
   try{
    const card=page.locator('button.card[data-id="infantry"]');
    if(!((await card.getAttribute("class"))||"").includes("selected"))
     await card.click({timeout:6000});
    const bounds=await page.locator("#field").boundingBox();
    if(!bounds)throw Error("Canvas has no bounding rect");
    await page.mouse.click(bounds.x+bounds.width*(side==="host"?.14:.86),
     bounds.y+bounds.height*.48);
    const confirmed=await wait(async()=>{
     const now=await state();
     return (Number(now?.world?.uid)||0)>uid?now:null;
    },"unit summon confirmed",3800).catch(()=>null);
    const result={side,elapsed,uiMs:Date.now()-at,accepted:!!confirmed};
    actions.push(result);return result;
   }catch(e){
    const result={side,elapsed,uiMs:Date.now()-at,accepted:false,error:String(e.message).slice(0,150)};
    actions.push(result);return result;
   }
  }
  await Promise.all([host,guest].map(p=>p.evaluate(()=>window.__shokokuQa.resetFrameBench())));
  startedAt=Date.now();
  let nextAction=Date.now()+3500,nextStats=Date.now()+5000,cycles=0;
  const hardDeadline=Date.now()+495000;
  while(Date.now()<hardDeadline){
   const now=Date.now();
   if(now>=nextAction){
    // Actual iPad-like pointer taps, alternately one player every 7 s.
    // Leave enough resource regeneration to make summons legal.
    const side=cycles%2===0?"host":"guest";
    const result=await attemptSummon(side==="host"?host:guest,side);
    cycles++;
    if(cycles%8===0)console.log("FULL MATCH SUMMON",JSON.stringify(result));
    nextAction=Date.now()+7000;
   }
   if(now>=nextStats){
    const [h,g]=await Promise.all([sample(host,"host"),sample(guest,"guest")]);
    allSamples.push({atSec:round((Date.now()-startedAt)/1000),host:h,guest:g});
    lastGameElapsed=Math.max(lastGameElapsed,h.elapsed||0);
    if(allSamples.length%4===0)console.log("FULL MATCH WINDOW",JSON.stringify({
     atSec:round((Date.now()-startedAt)/1000),
     gameSec:round(h.elapsed||0),units:g.units,hostGapMs:h.maxGap,
     guestGapMs:g.maxGap,guestNetworkAgeMs:g.applyAgeMs,
     guestFrames:g.frameCount,guestUpdatesHz:g.updatesHz,
     summonAttempts:actions.length,summonAccepted:actions.filter(x=>x.accepted).length
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
  if(host)await host.screenshot({path:path.join(dir,"full-match-final-host.png")}).catch(()=>{});
  if(guest)await guest.screenshot({path:path.join(dir,"full-match-final-guest.png")}).catch(()=>{});
  const guestGaps=allSamples.flatMap(x=>[x.guest.maxGap]);
  const hostGaps=allSamples.flatMap(x=>[x.host.maxGap]);
  const summary={
   test:"real full online match, no time skip",durationWallSec:round((Date.now()-startedAt)/1000),
   gameElapsedSec:round(lastGameElapsed),completed:finished,status:endedStatus,endReason,
   scenario:"Chromium host and iPad-size WebKit guest; both humans automated via actual touch-like clicks",
   frameWindows:allSamples.length,
   guestLongestFrameGapMs:Math.max(0,...guestGaps),
   hostLongestFrameGapMs:Math.max(0,...hostGaps),
   guestWindowsOver500ms:allSamples.filter(x=>x.guest.gapOver500>0).length,
   guestWindowsOver1000ms:allSamples.filter(x=>x.guest.gapOver1000>0).length,
   guestMaxRenderWorkMs:Math.max(0,...allSamples.map(x=>x.guest.maxFrameJs)),
   guestMaxSnapshotAgeMs:Math.max(0,...allSamples.map(x=>x.guest.applyAgeMs)),
   lastGuestSeq:allSamples.at(-1)?.guest.seq||0,
   actionAttempts:actions.length,actionAccepted:actions.filter(x=>x.accepted).length,
   actionFailures:actions.filter(x=>!x.accepted),
   guestActionUiMaxMs:Math.max(0,...actions.filter(x=>x.side==="guest").map(x=>x.uiMs)),
   pageErrors,
   limitations:"Linux headless WebKit is not physical school Safari or Google Sites iframe"
  };
  fs.writeFileSync(path.join(dir,"full-match-results.json"),JSON.stringify({summary,samples:allSamples,actions},null,2));
  console.log("FULL MATCH RESULT",JSON.stringify(summary));
  assert.ok(finished,"Full match must reach a genuine win, loss or time-expiry result");
  assert.ok(lastGameElapsed>30,"Match must progress through meaningful battle time");
  assert.ok(actions.some(x=>x.side==="guest"&&x.accepted),"Guest pointer controls should actually summon a unit");
  assert.equal(pageErrors.length,0,"No JS uncaught errors");
  console.log("PASS: full real-time two-browser Firebase match with periodic input and frame/network monitoring");
 }finally{
  for(const ctx of [hostContext,guestContext])if(ctx)await ctx.close().catch(()=>{});
  for(const browser of [hostBrowser,guestBrowser])if(browser)await browser.close().catch(()=>{});
  if(roomCode){
   await sleep(650);
   const endpoint=dbRoot+"/"+roomCode+".json";
   const resp=await fetch(endpoint,{method:"DELETE"}).catch(()=>null);
   if(resp?.ok){
    const verification=await fetch(endpoint).then(r=>r.json()).catch(()=>undefined);
    cleanupOk=verification===null;
   }
   console.log("FULL MATCH TEMP ROOM CLEANUP",cleanupOk?"confirmed":"FAILED");
  }
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error("FULL MATCH TEST FAILED",e);process.exitCode=1});
