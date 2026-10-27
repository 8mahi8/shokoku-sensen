// Live Firebase two-browser test. Cross-engine (Chromium host / WebKit guest) or
// matched WebKit host / WebKit guest. Runs in GitHub Actions only.
// Creates one disposable room in shokokuRooms1v1, then deletes it after both tabs close.
// A separate WebKit guest must paint and receive real Firebase battle snapshots.
// Does NOT access or transmit research data.
"use strict";
const {chromium,webkit}=require("playwright"),fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const assert=require("node:assert/strict");
const root=process.cwd(),urlDB="https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1";
const qaRecordVideo=process.env.SHOKOKU_QA_RECORD_VIDEO!=="no";
const qaMatchedWebkit=process.env.SHOKOKU_QA_MATCHED_WEBKIT==="yes";
const qaVideoDir=path.join(root,"qa-online-guest-visual");fs.mkdirSync(qaVideoDir,{recursive:true});
console.log("LIVE GUEST TEST MODE",JSON.stringify({
 host:qaMatchedWebkit?"WebKit":"Chromium",guest:"WebKit",
 hostPage:qaMatchedWebkit?"online-ipad.html":"online.html",
 recordVideo:qaRecordVideo
}));
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end("not found");return}
 res.writeHead(200,{"content-type":mime[path.extname(file)]||"application/octet-stream","cache-control":"no-store"});
 fs.createReadStream(file).pipe(res);
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
// Raw Playwright calls can remain pending until Actions cancels the job.
// Keep every custom deadline bounded even when one poll hangs indefinitely.
const bounded=async(promise,label,timeoutMs=12000)=>{
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(Error("Browser operation timeout: "+label)),timeoutMs);
 })]);}
 finally{clearTimeout(timer);}
};
const deadline=async (f,label,timeout=18000)=>{
 const end=Date.now()+timeout;let error;
 while(Date.now()<end){
  const left=end-Date.now();
  try{const v=await bounded(Promise.resolve().then(f),label+" poll",Math.min(8000,Math.max(1,left)));if(v)return v;}
  catch(e){error=e;}
  if(Date.now()<end)await delay(Math.min(300,end-Date.now()));
 }
 throw Error("Timed out "+label+" "+(error?.message||""));
};
(async()=>{
 let browser,guestBrowser,hostCtx,guestCtx,code="",botCode="",swapCode="",pages=[];
 let standardBeforeSwap=null;
 try{
  await new Promise(r=>server.listen(8765,"127.0.0.1",r));
  browser=qaMatchedWebkit?await webkit.launch({headless:true}):
   await chromium.launch({headless:true,args:["--no-sandbox"]});
  guestBrowser=await webkit.launch({headless:true});
  hostCtx=await browser.newContext({
   viewport:{width:1194,height:834},
   ...(qaMatchedWebkit?{deviceScaleFactor:2,hasTouch:true}:{})
  });
  guestCtx=await guestBrowser.newContext({
   viewport:{width:1194,height:834},deviceScaleFactor:2,hasTouch:true,
   ...(qaRecordVideo?{recordVideo:{dir:qaVideoDir,size:{width:1194,height:834}}}:{})
  });
  const host=await hostCtx.newPage(),guest=await guestCtx.newPage();
  pages=[host,guest];const errors=[];
  // Bound screenshots and actions even with an unresponsive headless WebKit.
  for(const page of pages){page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(20000);}
  // Idle headless WebKit reference before loading any game HTML, RTDB or CSS.
  // Without this, slow CI rAF scheduling can be misattributed to game Canvas.
  const idleReference=await guest.evaluate(()=>new Promise(resolve=>{
   const start=performance.now(),gaps=[];
   let previous=0;
   function frame(now){
    if(previous)gaps.push(now-previous);
    previous=now;
    if(now-start<1800){requestAnimationFrame(frame);return;}
    const sorted=gaps.slice().sort((a,b)=>a-b);
    const p=ratio=>Math.round((sorted[Math.min(sorted.length-1,Math.floor(sorted.length*ratio))]||0)*10)/10;
    resolve({samples:gaps.length,gapP50Ms:p(.5),gapP95Ms:p(.95),
     elapsedMs:Math.round(now-start)});
   }
   requestAnimationFrame(frame);
  }));
  console.log("IDLE WEBKIT RAF BASELINE",JSON.stringify({recordVideo:qaRecordVideo,...idleReference}));
  for(const [name,p] of [["host",host],["guest",guest]])p.on("pageerror",err=>errors.push(name+": "+err.message));
  await Promise.all([
   host.goto("http://127.0.0.1:8765/"+(qaMatchedWebkit?"online-ipad.html":"online.html")+"?qa=1&perf=1"),
   guest.goto("http://127.0.0.1:8765/online-ipad.html?qa=1&perf=1")
  ]);
  for(const p of pages)await deadline(async()=>((await p.locator("#netStatus").innerText()).includes("接続OK")), "Firebase connection",30000);
  await host.locator("#netCreate").click();
  code=await deadline(async()=>{const v=(await host.locator("#netRoom").innerText()).trim();return /^[0-9]{5}$/.test(v)?v:null},"host create",22000);
  await guest.locator("#netJoinCode").fill(code);await guest.locator("#netJoin").click();
  await deadline(async()=>(await guest.locator("#netRoom").innerText()).trim()===code,"guest join");
  // This release is 1vs1-only: no per-seat research consent, room archive,
  // or background match-history collector. Exercise the real room shape.
  const seats=await deadline(async()=>{
   const response=await fetch(urlDB+"/"+code+"/players.json");
   return response.ok?await response.json():null;
  },"host and guest presence",18000);
  assert.equal(seats?.host?.online,true);
  assert.equal(seats?.guest?.online,true);
  for(const seat of ["host","guest"]){
   assert.equal(seats[seat].researchConsent,undefined,"no legacy match consent on "+seat);
   assert.equal(seats[seat].archiveConsent,undefined,"no cloud archive preference on "+seat);
  }
  for(const p of [host,guest]){
   assert.equal(await p.locator("#researchConsent").count(),0);
   assert.equal(await p.locator("#researchArchiveConsent").count(),0);
   assert.equal(await p.evaluate(()=>window.ShokokuResearch),undefined);
  }
  // Guest device can substitute a tactical robot: toggling also readies it.
  await deadline(async()=>await guest.locator("#netGuestBot").isVisible(),"guest BOT toggle visible");
  await guest.locator("#netGuestBot").click();
  await deadline(async()=>((await guest.locator("#netGuestBot").getAttribute("aria-pressed"))==="true"),"BOT enabled");
  await deadline(async()=>((await guest.locator("#netReady").innerText()).includes("✓")),"guest BOT automatically ready");
  await host.locator("#netReady").click();
  await deadline(async()=>await host.locator("#netStart").isEnabled(),"both ready");
  await host.locator("#netStart").click();
  for(const [name,p] of [["host",host],["guest",guest]]){
   await deadline(async()=>p.locator("#overlay").evaluate(el=>el.classList.contains("hidden")),name+" start");
  }
  // Host and guest are now plain game clients; no match recording runs.
  assert.equal(await host.evaluate(()=>window.ShokokuResearch),undefined);
  async function summon(p,team){
   await p.locator('button.card[data-id="infantry"]').click();
   const rect=await p.locator("#field").boundingBox();
   assert.ok(rect&&rect.width>200&&rect.height>150,"canvas visible");
   for(const fraction of (team===1?[.14,.08,.22]:[.86,.92,.78]))
    await p.mouse.click(rect.x+rect.width*fraction,rect.y+rect.height*.48);
  }
  await summon(host,1);
  const botToggle=guest.locator("#guestBotLive");
  assert.ok(await botToggle.isVisible(),"Guest BOT toggle should remain accessible in-match");
  assert.equal(await botToggle.getAttribute("aria-pressed"),"true");
  const stateURL=urlDB+"/"+code+"/state.json";
  const state=async()=>{const response=await fetch(stateURL);return response.ok?response.json():null};
  const packet=await deadline(async()=>{
   const d=await state();
   const units=d?.world?.units||[];
   return units.some(u=>u.team===1)&&units.some(u=>u.team===2)?d:null;
  },"blue human and red BOT units synchronized to Firebase",25000);
  assert.ok(packet.world.energy?.length>=3&&packet.world.capitals?.length===2&&packet.world.forts?.length===3);
  // The diagnostic HUD must report actual painting and live guest snapshots,
  // without requiring DevTools (school Safari and Google Sites are restricted).
  const perf=guest.locator('[aria-label="通信・描画の診断"]');
  await deadline(async()=>{
   const text=await perf.innerText();
   return /描画 [0-9]+ FPS/.test(text)&&/通信 guest [0-9.]+更新\/秒/.test(text)&&/seq [1-9][0-9]*/.test(text);
  },"guest render + snapshot diagnostics",20000);
  const perfText=await perf.innerText();
  console.log("GUEST PERF",JSON.stringify({text:perfText}));
  await guest.screenshot({path:path.join(qaVideoDir,"guest-prep.png"),fullPage:false});
  const hostStats=await host.evaluate(()=>window.__shokokuNetQa.stats());
  assert.ok(hostStats.snapshotChars>0&&hostStats.encodeMs>=0,
   "host diagnostics should observe payload work");
  const guestStats=await guest.evaluate(()=>window.__shokokuNetQa.stats());
  assert.ok(guestStats.applyMs>=0&&guestStats.coalesced>=0&&guestStats.packets>0,
   "guest diagnostics should measure applied snapshots");
  assert.ok(perfText.includes("反映 ")&&perfText.includes("最新優先 "),
   "WebKit iPad shows rendering-versus-network diagnostics without developer tools");
  console.log("SYNC DIAGNOSTICS",JSON.stringify({host:hostStats,guest:guestStats}));
  // The BOT has already spent a card, so its live hand rotation differs legitimately.
  // Ensure it still owns the same card types and honors the host's authoritative deck.
  const cards=t=>[...packet.world.hand[t],...packet.world.queue[t]].sort();
  assert.deepEqual(cards(1),cards(2),"BOT and host have same card types (rotation may differ)");

  // Switching BOT off should permit manual guest input without affecting multiplayer.
  await botToggle.click();
  await deadline(async()=>(await botToggle.getAttribute("aria-pressed"))==="false",
   "BOT switch transactional acknowledgment",18000);
  const manualCount=packet.world.units.filter(u=>u.team===2).length;
  await summon(guest,2);
  const afterManual=await deadline(async()=>{
   const current=await state();
   return current?.world?.units?.filter(u=>u.team===2).length>manualCount?current:null;
  },"manual guest control after BOT off",18000);
  // Firebase having state is not enough: the WebKit receiver must apply it.
  await deadline(async()=>(await guest.evaluate(()=>window.__onlineSeq||0))>=afterManual.seq,
   "WebKit guest receives and applies manual guest summon",18000);
  await guest.screenshot({path:path.join(qaVideoDir,"guest-battle-after-summons.png"),fullPage:false});
  await delay(1200);
  await guest.screenshot({path:path.join(qaVideoDir,"guest-battle-1200ms-later.png"),fullPage:false});
  // Regression: guest remains interactive but battle snapshots cease,
  // including the minute around a host-fired barrage ("ファイヤー").
  // Keep the real RTDB test room as the only temporary write target.
  await deadline(async()=>await host.evaluate(()=>window.__shokokuQa?.snapshot().phase==="battle"),
   "host battle start",20000);
  await host.evaluate(()=>window.__shokokuNetQa.muteSdkSnapshots(false));
  await guest.evaluate(()=>window.__shokokuNetQa.muteSdkSnapshots(true));
  // Drain any listener callback already queued before the mute was enabled.
  await delay(300);
  const seqBefore=await guest.evaluate(()=>window.__onlineSeq||0);
  const beforeFire=await state();
  const fire=await host.evaluate(()=>window.__shokokuQa.fireStress(1,650,330));
  assert.equal(fire,true,"host should be able to fire a real barrage in the battle simulation");
  const firedState=await deadline(async()=>{
   const d=await state();
   return d?.seq>beforeFire.seq&&d.world?.elapsed>beforeFire.world.elapsed+0.15?d:null;
  },"host battle continues after barrage",15000);
  assert.equal(firedState.world.phase,"battle","host battle remains active after barrage");
  // RTDB may omit empty spell arrays after impact; the receiver must still paint.
  // Muting SDK snapshots does NOT mute the independent REST recovery watchdog.
  // If the watchdog recovered already, a higher seq is CORRECT rather than a
  // frozen-world failure: prove it came from REST, not the muted SDK listener.
  await delay(650);
  const muted=await guest.evaluate(()=>window.__shokokuNetQa.stats());
  assert.ok(muted.seq>=seqBefore,"guest must not move backward while SDK snapshots muted");
  if(muted.seq>seqBefore){
   assert.ok(muted.restSeq>=muted.seq&&muted.restSeq>seqBefore,
    "with SDK muted, newer state must come from REST recovery");
   console.log("AUTOMATIC GUEST REST RECOVERY",JSON.stringify({
    from:seqBefore,to:muted.seq,rest:muted.restSeq
   }));
  }
  // Fast-forward only the staleness watchdog; the subsequent REST read
  // still hits real Firebase, so the test cannot pass on a cached SDK state.
  await guest.evaluate(()=>window.__shokokuNetQa.triggerRecovery());
  const recovered=await deadline(async()=>{
   const diag=await guest.evaluate(()=>window.__shokokuNetQa.stats());
   return diag.restSeq>=firedState.seq&&diag.seq>=firedState.seq?diag:null;
  },"WebKit guest recovers barrage-era state via Firebase REST",15000);
  assert.ok(recovered.restSeq>seqBefore,"REST recovered a newer guest world");
  await guest.evaluate(()=>window.__shokokuNetQa.muteSdkSnapshots(false));
  console.log("GUEST REST RECOVERY",JSON.stringify({from:seqBefore,to:recovered.seq,rest:recovered.restSeq}));
  await guest.screenshot({path:path.join(qaVideoDir,"guest-after-network-recovery.png"),fullPage:false});
  // This is an actual BROWSER NETWORK outage, not only a muted Firebase
  // callback. The host remains online and keeps publishing authoritative
  // snapshots. Do not suppress exceptions or treat stale data as recovery.
  // Playwright's context.offline does not reliably shut down an already-open
  // Firebase WebSocket in headless WebKit. Explicitly close that SDK transport
  // *as well*, then force browser networking offline. These are test-only
  // disruptions; they are not changes to the game's reconnection mechanism.
  await guest.evaluate(()=>firebase.database().goOffline());
  await guestCtx.setOffline(true);
  try{
   // Drain any snapshot previously queued for requestAnimationFrame before
   // proving that no NEW authoritative packets can cross the cut connection.
   await delay(550);
   const offlineBefore=await guest.evaluate(()=>({
    seq:window.__onlineSeq||0,elapsed:window.__shokokuQa.snapshot().elapsed
   }));
   const hostBeforeOffline=await state();
   await delay(2200);
   const frozen=await guest.evaluate(()=>({
    seq:window.__onlineSeq||0,elapsed:window.__shokokuQa.snapshot().elapsed,
    online:window.ShokokuNet.syncDiagnostics().connected
   }));
   const duringOutage=await state();
   assert.ok(duringOutage.seq>hostBeforeOffline.seq,
    "host must advance its authoritative state while guest is offline");
   // A REST request that started BEFORE the browser went offline may still
   // finish during the cutoff. Let it drain, then prove the guest stays
   // frozen while the host keeps moving under the sustained outage.
   await delay(1500);
   const frozenLater=await guest.evaluate(()=>({
    seq:window.__onlineSeq||0,
    diag:window.ShokokuNet.syncDiagnostics()
   }));
   let hostLater=await state();
   if(!(hostLater?.seq>duringOutage.seq)){
    // Headless WebKit sometimes skips multiple rAF/publish cycles even when
    // only the OTHER page is disconnected. Log the real stall instead of
    // falsely blaming the offline guest or assuming host made progress.
    const hostStall=await host.evaluate(()=>({
     phase:window.__shokokuQa.snapshot().phase,
     diag:window.ShokokuNet.syncDiagnostics(),
     fps:window.__shokokuQa.frameBench().slice(-32).map(f=>f.gapMs),
     error:window.__onlineFrameError||null
    })).catch(e=>({error:String(e)}));
    console.log("REAL HOST PUBLISH PAUSE WHILE GUEST OFFLINE",JSON.stringify({
     hostSeqBefore:hostBeforeOffline?.seq,hostSeqDuring:duringOutage?.seq,
     hostSeqLater:hostLater?.seq,host:hostStall
    }));
    // Do not accept permanent host stalls: observe bounded recovery, then
    // retain the same strict "host advances while guest offline" assertion.
    hostLater=await deadline(async()=>{
     const v=await state();return v?.seq>duringOutage.seq?v:null;
    },"WebKit host resumes publishing while remote guest stays offline",6000);
   }
   assert.ok(hostLater.seq>duringOutage.seq,
    "host keeps advancing while guest connection stays cut");
   assert.equal(frozenLater.seq,frozen.seq,
    "once in-flight pre-cut reads settle, offline guest receives no NEW state");
   assert.equal(frozenLater.diag.connected,false,
    "Firebase SDK must report offline while browser transport is cut");
   console.log("REAL GUEST OFFLINE",JSON.stringify({
    before:offlineBefore,offline:frozen,later:frozenLater.seq,
    hostSeqBefore:hostBeforeOffline.seq,hostSeqDuring:duringOutage.seq,
    hostSeqLater:hostLater.seq
   }));
  }finally{
   // Always restore BOTH transport and page networking after the test.
   await guestCtx.setOffline(false);
   await guest.evaluate(()=>firebase.database().goOnline());
  }
  const onlineHostState=await deadline(async()=>{
   const next=await state();return next?.seq>0&&next?.world?.phase==="battle"?next:null;
  },"host continues after guest SDK/browser restore",18000);
  const liveAgain=await deadline(async()=>{
   const v=await guest.evaluate(()=>({
    seq:window.__onlineSeq||0,
    diag:window.ShokokuNet.syncDiagnostics(),
    world:window.__shokokuQa.snapshot(),
    error:window.__onlineFrameError||null
   }));
   return v.seq>=onlineHostState.seq&&v.world.phase==="battle"&&
    v.diag.connected&&v.diag.error===""&&!v.error?v:null;
  },"WebKit guest catches up after offline/online network transition",25000);
  assert.ok(liveAgain.seq>0,"recovery must apply authoritative snapshots");
  console.log("REAL GUEST NETWORK RESTORED",JSON.stringify({
   to:liveAgain.seq,connected:liveAgain.diag.connected,
   count:liveAgain.world.units.length,phase:liveAgain.world.phase
  }));
  await guest.screenshot({path:path.join(qaVideoDir,"guest-after-physical-reconnect.png"),
   fullPage:false});
  // Cloud match archiving is retired. Confirm no research node is created
  // during real Firebase battle, including the end of the first round.
  const oldArchive=await fetch(urlDB+"/"+code+"/researchRounds.json");
  assert.equal(oldArchive.status,200);
  assert.equal(await oldArchive.json(),null,"no match archive generated in live Firebase room");
  // Continuous school 1v1: one temporary Firebase room must survive six
  // host->guest rematches, including realistic 18/20-unit battles.
  // No permanent room or change to the public Google Sites deployment.
  // Do not add extra local test rooms or ever modify the existing real-player data.
  for(const round of [2,3,4,5,6,7]){
   await host.evaluate(()=>window.ShokokuNet.finish({result:"win",reason:"QA round transition"}));
   await deadline(async()=>{
    const r=await fetch(urlDB+"/"+code+"/meta.json");
    return r.ok&&(await r.json())?.status==="finished";
   },"round "+(round-1)+" finish persisted",18000);
   await host.evaluate(()=>window.ShokokuNet.rematch());
   await deadline(async()=>{
    const r=await fetch(urlDB+"/"+code+"/meta.json");
    const m=r.ok?await r.json():null;
    return m?.round===round&&m?.status==="lobby"&&
     (await host.locator("#onlinePanel").isVisible())&&
     (await guest.locator("#onlinePanel").isVisible());
   },"round "+round+" both clients returned to lobby",18000);
   // Each player must start this real Firebase rematch with a fresh local
   // rendering-quality assessment, even if the last round had poor FPS.
   const freshQuality=await Promise.all([host,guest].map(p=>p.evaluate(()=>({
    ...window.__shokokuQa.quality(),phase:window.__shokokuQa.snapshot().phase
   }))));
   for(const [index,quality] of freshQuality.entries()){
    const name=index===0?"host":"guest";
    assert.equal(quality.phase,"menu",name+" returns to fresh lobby");
    assert.equal(quality.tabletDprCap,1.45,name+" restores normal DPR budget");
    assert.equal(quality.guestLowPower,false,name+" resets guest painting limiter");
    assert.equal(quality.qualityMeasured,false,name+" rechecks quality next match");
    assert.equal(quality.qualityFrames,0,name+" clears the old FPS window");
   }
   console.log("REAL FIREBASE ROUND QUALITY RESET",JSON.stringify({
    round,host:freshQuality[0],guest:freshQuality[1]
   }));
   await guest.locator("#netReady").click();
   await host.locator("#netReady").click();
   await deadline(async()=>host.locator("#netStart").isEnabled(),"round "+round+" ready",18000);
   await host.locator("#netStart").click();
   await deadline(async()=>{
    const w=await state();
    return w?.round===round&&w?.seq>=1&&
     (await guest.evaluate(()=>window.__onlineSeq||0))>=1&&
     (await host.locator("#overlay").evaluate(e=>e.classList.contains("hidden")))&&
     (await guest.locator("#overlay").evaluate(e=>e.classList.contains("hidden")));
   },"round "+round+" guest gets fresh snapshot and gameplay overlay",22000);
   // Build realistic combat with actual legal costs/deployments on host.
   // The resulting WebKit guest render uses real Firebase state, not
   // a directly injected client-side fake or 130-unit stress preset.
   const scenario={2:"standard",3:"light",4:"heavy",5:"spell",6:"crowded",7:"dense"}[round];
   console.log("LIVE FIREBASE SCENE START",JSON.stringify({scenario,round,recordVideo:qaRecordVideo,matchedWebkit:qaMatchedWebkit}));
   const expected={standard:14,light:10,heavy:10,spell:8,crowded:18,dense:20}[scenario];
   const seeded=await host.evaluate(s=>window.__shokokuQa.seedRealisticBattle(s),scenario);
   assert.ok(seeded&&seeded.units===expected&&seeded.actions.every(a=>a.ok),
    "legal realistic host scene "+scenario);
   if(scenario==="heavy")
    assert.deepEqual(seeded.heavy.slice().sort(),["guardian","tank"],
     "real heavy artwork for tank and guardian");
   // Capture a FIXED authoritative seq before waiting for WebKit. A guest may
   // legitimately trail the continuously published host by 1–3 packets.
   // Requiring it to overtake a constantly moving state.json seq was flaky.
   const firstScene=await deadline(async()=>{
    const packet=await state();
    if(packet?.round!==round||packet?.world?.phase!=="battle"||
       packet.world.elapsed<100||!Array.isArray(packet.world.units)||
       packet.world.units.length<1||packet.world.units.length>expected)return null;
    return {seq:packet.seq,unitCount:packet.world.units.length};
   },"realistic "+scenario+" host published initial scene",18000);
   const synced=await deadline(async()=>{
    const guestInfo=await guest.evaluate(()=>({
     seq:window.__onlineSeq||0,scene:window.__shokokuQa.snapshot(),
     diag:window.ShokokuNet.syncDiagnostics()
    }));
    if(guestInfo.seq<firstScene.seq||guestInfo.scene.elapsed<100||
       guestInfo.scene.units.length===0||guestInfo.scene.phase!=="battle")return null;
    return guestInfo;
   },"realistic "+scenario+" host world reaches WebKit guest",22000).catch(async error=>{
    const server=await state().catch(()=>null);
    const guestInfo=await guest.evaluate(()=>({
     seq:window.__onlineSeq||0,scene:window.__shokokuQa.snapshot(),
     diagnostics:window.ShokokuNet.syncDiagnostics()
    })).catch(e=>({error:String(e)}));
    console.error("REALISTIC GUEST SYNC FAILURE",JSON.stringify({
     scenario,round,firstScene,server:{seq:server?.seq,count:server?.world?.units?.length,
      elapsed:server?.world?.elapsed,phase:server?.world?.phase},guest:guestInfo
    }));
    throw error;
   });
   assert.equal(synced.scene.phase,"battle","guest must display real battle "+scenario);
   assert.equal(synced.diag.error,"","guest application errors in "+scenario);
   // Visual QA already covers all artwork. Reduce screenshot pressure in
   // no-video network diagnostics; only the dense scene keeps a still image.
   if(qaRecordVideo||scenario==="dense"){
    console.log("LIVE FIREBASE SCENE SCREENSHOT",JSON.stringify({scenario,kind:"initial"}));
    await bounded(guest.screenshot({path:path.join(qaVideoDir,"realistic-"+scenario+"-guest-initial.png"),
     fullPage:false,timeout:12000}),"screenshot initial "+scenario,14000);
   }
   // Measure the SAME real Firebase battle at both ends of the connection.
   // A host-only Chromium FPS from an earlier unrelated test is not a valid
   // answer to host-vs-guest performance, especially with WebKit as guest.
   await Promise.all([host,guest].map(page=>page.evaluate(()=>{
    window.__shokokuQa.resetFrameBench();
    window.__qaPairStartedAt=performance.now();
   })));
   await delay(1500);
   // Collect the rAF timing BEFORE screenshot capture; screenshot itself can
   // stall the render loop and contaminate frame-gap percentiles.
   const benchReadback=()=>{
    const frames=window.__shokokuQa.frameBench().filter(r=>r.phase==="battle");
    const gaps=frames.map(r=>r.gapMs).filter(Number.isFinite).sort((a,b)=>a-b);
    const percentile=(numbers,fraction)=>numbers[Math.min(numbers.length-1,Math.floor(numbers.length*fraction))]||0;
    const round=n=>Math.round(n*10)/10;
    const ordered=key=>frames.map(r=>r[key]).filter(Number.isFinite).sort((a,b)=>a-b);
    const elapsedMs=performance.now()-window.__qaPairStartedAt;
    const hitches=frames.filter(r=>r.hitchNet).sort((a,b)=>b.gapMs-a.gapMs);
    return {phase:window.__shokokuQa.snapshot().phase,
     count:window.__shokokuQa.snapshot().units.length,
     perf:window.ShokokuNet.syncDiagnostics(),
     frameSamples:frames.length,
     elapsedMs:round(elapsedMs),
     observedFps:round(frames.length*1000/Math.max(1,elapsedMs)),
     gapP50Ms:round(percentile(gaps,.50)),
     gapP95Ms:round(percentile(gaps,.95)),
     gapMaxMs:round(gaps.at(-1)||0),
     totalP95Ms:round(percentile(ordered("totalMs"),.95)),
     drawP95Ms:round(percentile(ordered("drawMs"),.95)),
     logicP95Ms:round(percentile(ordered("logicMs"),.95)),
     hudP95Ms:round(percentile(ordered("hudMs"),.95)),
     networkP95Ms:round(percentile(ordered("networkMs"),.95)),
     gapAfterPrevP95Ms:round(percentile(ordered("gapAfterPrevMs"),.95)),
     hitchSamples:hitches.length,
     worstHitches:hitches.slice(0,3).map(r=>({gapMs:round(r.gapMs),
      outsidePrevFrameMs:round(r.gapAfterPrevMs),frameJsMs:round(r.totalMs),
      drawMs:round(r.drawMs),...r.hitchNet})),
     frameError:window.__onlineFrameError||null};
   };
   const [hostLater,later]=await Promise.all([
    host.evaluate(benchReadback),guest.evaluate(benchReadback)
   ]);
   assert.equal(hostLater.frameError,null,"Chromium host should not throw during "+scenario);
   assert.ok(hostLater.frameSamples>=5,"Chromium host must paint multiple frames after "+scenario);
   assert.equal(hostLater.phase,"battle","Chromium host must remain in battle during "+scenario);
   if(scenario==="standard")standardBeforeSwap={
    originalHost:{fps:hostLater.observedFps,gapP95Ms:hostLater.gapP95Ms,units:hostLater.count},
    originalGuest:{fps:later.observedFps,gapP95Ms:later.gapP95Ms,units:later.count}
   };
   console.log("REAL FIREBASE HOST GUEST PAIR",JSON.stringify({
    scenario,recordVideo:qaRecordVideo,
    host:{browser:qaMatchedWebkit?"WebKit":"Chromium",role:"host",units:hostLater.count,frames:hostLater.frameSamples,
     durationMs:hostLater.elapsedMs,fps:hostLater.observedFps,
     gapP50Ms:hostLater.gapP50Ms,gapP95Ms:hostLater.gapP95Ms,
     drawP95Ms:hostLater.drawP95Ms,totalP95Ms:hostLater.totalP95Ms},
    guest:{browser:"WebKit",role:"guest",units:later.count,frames:later.frameSamples,
     durationMs:later.elapsedMs,fps:later.observedFps,
     gapP50Ms:later.gapP50Ms,gapP95Ms:later.gapP95Ms,
     drawP95Ms:later.drawP95Ms,totalP95Ms:later.totalP95Ms},
    caveat:qaMatchedWebkit?"same engine, same viewport, same HTML; not physical iPad Safari":
     "browser engine and network role differ; not physical iPad Safari"
   }));
   // Visual QA already covers all artwork. Reduce screenshot pressure in
   // no-video network diagnostics; only the dense scene keeps a still image.
   if(qaRecordVideo||scenario==="dense"){
    console.log("LIVE FIREBASE SCENE SCREENSHOT",JSON.stringify({scenario,kind:"after-1100ms"}));
    await bounded(guest.screenshot({path:path.join(qaVideoDir,"realistic-"+scenario+"-guest-after-1100ms.png"),
     fullPage:false,timeout:12000}),"screenshot after-1100ms "+scenario,14000);
   }
   assert.equal(later.frameError,null,"WebKit guest should not throw during "+scenario);
   assert.ok(later.frameSamples>=5,"WebKit must paint multiple frames after "+scenario);
   assert.equal(later.phase,"battle","WebKit guest must remain in battle during "+scenario);
   console.log("REAL FIREBASE GUEST SCENE",JSON.stringify({
    scenario,recordVideo:qaRecordVideo,initialUnits:seeded.units,heavy:seeded.heavy,
    packetStats:{seq:synced.seq,updatesHz:synced.diag.updatesHz,applyMs:synced.diag.applyMs},
    after1500ms:{count:later.count,updatesHz:later.perf.updatesHz,
      applyMs:later.perf.applyMs,frameSamples:later.frameSamples,
      gapP50Ms:later.gapP50Ms,gapP95Ms:later.gapP95Ms,gapMaxMs:later.gapMaxMs,
      drawP95Ms:later.drawP95Ms,totalP95Ms:later.totalP95Ms,
      logicP95Ms:later.logicP95Ms,hudP95Ms:later.hudP95Ms,
      networkP95Ms:later.networkP95Ms,gapAfterPrevP95Ms:later.gapAfterPrevP95Ms,
      hitchSamples:later.hitchSamples,worstHitches:later.worstHitches}
   }));
   // Matched REAL Firebase WebKit negative control: keep incoming state,
   // JavaScript, HUD and combat running, but temporarily skip only Canvas paint.
   // A/B/A in the SAME warm guest tab avoids comparing unrelated browsers.
   if(scenario==="dense"){
    const capture=async(skipPaint)=>{
     await guest.evaluate(skip=>{
      window.__shokokuQa.setDrawDisabledForQa(skip);
      window.__shokokuQa.resetFrameBench();
     },skipPaint);
     await delay(1600);
     return await guest.evaluate(()=>{
      const samples=window.__shokokuQa.frameBench().filter(x=>x.phase==="battle");
      const gaps=samples.map(x=>x.gapMs).filter(Number.isFinite).sort((a,b)=>a-b);
      const totals=samples.map(x=>x.totalMs).filter(Number.isFinite).sort((a,b)=>a-b);
      const p95=x=>Math.round((x[Math.min(x.length-1,Math.floor(x.length*.95))]||0)*10)/10;
      const net=window.ShokokuNet.syncDiagnostics();
      return {frames:samples.length,gapP50Ms:Math.round((gaps[Math.min(gaps.length-1,Math.floor(gaps.length*.5))]||0)*10)/10,gapP95Ms:p95(gaps),totalP95Ms:p95(totals),
       updatesHz:net.updatesHz,seq:net.seq,worldUnits:window.__shokokuQa.snapshot().units.length,
       error:window.__onlineFrameError||null};
     });
    };
    // Separate Canvas execution from the DOM/CSS compositing cost. Hide the
    // entire game surface WITHOUT pausing Firebase or rAF; retain a tiny visible
    // marker so WebKit does not classify the tab as visually empty/backgrounded.
    const setUiHidden=async hidden=>guest.evaluate(hidden=>{
     const app=document.getElementById("app");
     if(!app)throw Error("QA missing #app");
     if(hidden){
      app.dataset.qaBeforeVisibility=app.style.visibility;
      app.style.visibility="hidden";
      const marker=document.createElement("div");
      marker.id="qa-visible-marker";
      marker.style.cssText="position:fixed;top:0;right:0;width:16px;height:16px;background:#fff;z-index:2147483647;pointer-events:none";
      document.body.appendChild(marker);
     }else{
      app.style.visibility=app.dataset.qaBeforeVisibility||"";
      delete app.dataset.qaBeforeVisibility;
      document.getElementById("qa-visible-marker")?.remove();
     }
    },hidden);
    // Canvas drawing and Canvas element COMPOSITING are different: the last
    // painted bitmap can still cost WebKit even when no new draw() executes.
    const setCanvasHidden=async hidden=>guest.evaluate(hidden=>{
     const field=document.getElementById("field");
     if(!field)throw Error("QA missing #field");
     if(hidden){
      field.dataset.qaBeforeVisibility=field.style.visibility;
      field.style.visibility="hidden";
     }else{
      field.style.visibility=field.dataset.qaBeforeVisibility||"";
      delete field.dataset.qaBeforeVisibility;
     }
    },hidden);
    const setPartHidden=async(id,hidden)=>guest.evaluate(({id,hidden})=>{
     const element=document.getElementById(id);
     if(!element)throw Error("QA missing #"+id);
     if(hidden){
      element.dataset.qaSavedVisibility=element.style.visibility;
      element.style.visibility="hidden";
     }else{
      element.style.visibility=element.dataset.qaSavedVisibility||"";
      delete element.dataset.qaSavedVisibility;
     }
    },{id,hidden});
    let disabled,canvasHidden,cardsHidden,bottomHidden,hiddenUi,restored;
    try{
     disabled=await capture(true);
     await setCanvasHidden(true);
     canvasHidden=await capture(true);
     await setPartHidden("cards",true);
     cardsHidden=await capture(true);
     await setPartHidden("cards",false);
     await setPartHidden("bottom",true);
     bottomHidden=await capture(true);
     await setPartHidden("bottom",false);
     await setCanvasHidden(false);
     await setUiHidden(true);
     hiddenUi=await capture(true);
     await setUiHidden(false);
     restored=await capture(false);
    }finally{
     for(const id of ["cards","bottom"])await setPartHidden(id,false);
     await setCanvasHidden(false);
     await setUiHidden(false);
     await guest.evaluate(()=>window.__shokokuQa.setDrawDisabledForQa(false));
    }
    for(const [label,stats] of [["Canvas off",disabled],["Canvas hidden",canvasHidden],
      ["cards hidden",cardsHidden],["bottom hidden",bottomHidden],
      ["all CSS hidden",hiddenUi],["paint restored",restored]]){
     assert.ok(stats.frames>=4,label+" control must sample actual frames");
     assert.equal(stats.error,null,label+" guest must keep game processing");
    }
    assert.ok(disabled.seq>0&&canvasHidden.seq>=disabled.seq&&cardsHidden.seq>=canvasHidden.seq
      &&bottomHidden.seq>=cardsHidden.seq&&hiddenUi.seq>=bottomHidden.seq
      &&restored.seq>=hiddenUi.seq,"Firebase guest must continue through all display controls");
    console.log("LIVE GUEST CANVAS AB/A",JSON.stringify({recordVideo:qaRecordVideo,
     paintOnBefore:{frames:later.frameSamples,gapP95Ms:later.gapP95Ms,totalP95Ms:later.totalP95Ms},
     paintOff:disabled,canvasOffElementHidden:canvasHidden,
     canvasOffCardsHidden:cardsHidden,canvasOffBottomHidden:bottomHidden,
     canvasOffUiHidden:hiddenUi,paintRestored:restored}));
   }
  }
  console.log("CONSECUTIVE ROUNDS: 7 starts incl. 6 rematches, 8-20 unit scenes in one temporary Firebase room, no research archive");
  // Actual new-game button path must return to the room picker inside Sites,
  // without iframe location.reload() or awaiting a Firebase round-trip.
  const originalUrl=guest.url();
  await guest.evaluate(()=>document.getElementById("newRoom").click());
  await deadline(async()=>guest.locator("#onlinePanel").isVisible()&&
    (await guest.locator("#netRoom").innerText()).trim()==="-----"&&
    await guest.locator("#netCreate").isEnabled(),"embedded guest can begin a new game",6000);
  assert.equal(guest.url(),originalUrl,"new game must not reload the iframe");
  assert.equal(await guest.evaluate(()=>window.__onlineSeq),0,"old round cursor resets");
  if(errors.length)throw Error("Browser JavaScript errors: "+errors.slice(0,8).join(" | "));
  // One-device online room path: a host can add a real Firebase BOT guest
  // without a second phone/tablet. Prove the seat is ready and the match starts.
  await host.evaluate(()=>document.getElementById("newRoom").click());
  await deadline(async()=>await host.locator("#netCreate").isEnabled()&&
   (await host.locator("#netRoom").innerText()).trim()==="-----","host returns to room picker",7000);
  await host.locator("#netCreate").click();
  botCode=await deadline(async()=>{
   const number=(await host.locator("#netRoom").innerText()).trim();
   return /^[0-9]{5}$/.test(number)?number:null;
  },"host creates own BOT room");
  await deadline(async()=>host.locator("#netHostBot").isVisible(),"host BOT join button available");
  await host.locator("#netHostBot").click();
  const botJoined=await deadline(async()=>{
   const response=await fetch(urlDB+"/"+botCode+"/players/guest.json");
   return response.ok?(await response.json()):null;
  },"BOT guest is written to Firebase");
  assert.equal(botJoined?.localBot,true,"BOT must occupy an explicit guest seat");
  assert.equal(botJoined?.online,true,"BOT guest must be online");
  assert.equal(botJoined?.ready,true,"BOT guest must auto-ready");
  assert.equal(await host.evaluate(()=>window.ShokokuNet.hostBot),true,
   "host must control its own BOT seat");
  await host.locator("#netReady").click();
  await deadline(async()=>host.locator("#netStart").isEnabled(),"ready host with BOT",9000);
  await host.locator("#netStart").click();
  await deadline(async()=>host.evaluate(()=>window.__shokokuQa.snapshot().phase==="prep"),
   "BOT room starts real game",9000);
  console.log("LIVE HOST BOT ROOM",JSON.stringify({recordVideo:qaRecordVideo,
   matchedWebkit:qaMatchedWebkit,code:botCode,guestReady:botJoined.ready,
   phase:"prep",hostBot:true}));
  console.log("HOST BOT PRE-EXIT",JSON.stringify(await host.evaluate(()=>({
   hostBot:window.ShokokuNet.hostBot,connected:window.ShokokuNet.syncDiagnostics().connected
  }))));
  await host.evaluate(()=>document.getElementById("newRoom").click());
  await deadline(async()=>host.locator("#netCreate").isEnabled(),"leave BOT room",7000);
  await delay(700);
  console.log("HOST BOT POST-EXIT",JSON.stringify({
   guest:await (await fetch(urlDB+"/"+botCode+"/players/guest.json")).json(),
   players:await (await fetch(urlDB+"/"+botCode+"/players.json")).json()
  }));
  await deadline(async()=>{
   const response=await fetch(urlDB+"/"+botCode+"/players/guest.json");
   if(!response.ok)return false;
   const seat=await response.json();
   return seat===null||seat.online===false;
  },"owned BOT seat marked offline on host exit",9000);
  console.log("LIVE HOST BOT EXIT",JSON.stringify({code:botCode,guestSeatOffline:true}));
  // Fixed-device role inversion: the old red guest creates a new room as
  // blue host, and the old blue host joins as red guest. This verifies the
  // *same browser pages* survive leaving/rejoining with changed roles, not
  // merely matching two different browsers with their original role.
  // A third disposable Firebase room is deleted in finally. Never touch a
  // real player's match or change any game protocol/security rules.
  console.log("LIVE ROLE SWAP START",JSON.stringify({recordVideo:qaRecordVideo,matchedWebkit:qaMatchedWebkit}));
  await guest.locator("#netCreate").click();
  swapCode=await deadline(async()=>{
   const number=(await guest.locator("#netRoom").innerText()).trim();
   return /^[0-9]{5}$/.test(number)?number:null;
  },"old guest creates new room as blue host",17000);
  await host.locator("#netJoinCode").fill(swapCode);
  await host.locator("#netJoin").click();
  await deadline(async()=>{
   const roomNumber=(await host.locator("#netRoom").innerText()).trim();
   const roles=await Promise.all([host,guest].map(p=>p.evaluate(()=>({
    isHost:window.ShokokuNet.isHost,team:window.ShokokuNet.team,
    canSend:window.ShokokuNet.canSendCommand
   }))));
   return roomNumber===swapCode&&!roles[0].isHost&&roles[0].team===2&&
    roles[1].isHost&&roles[1].team===1;
  },"same-device role swap and join",20000);
  const swappedSeats=await deadline(async()=>{
   const response=await fetch(urlDB+"/"+swapCode+"/players.json");
   const seats=response.ok?await response.json():null;
   return seats?.host?.online&&seats?.guest?.online?seats:null;
  },"swapped room both seats online",15000);
  assert.ok(swappedSeats.host.id!==swappedSeats.guest.id,
   "role swapped real Firebase room has two independent client IDs");
  // The new team must own the correct camera BEFORE the first server battle
  // snapshot, not just eventually after a lucky menu -> prep callback order.
  const lobbyCameras=await Promise.all([host,guest].map(p=>p.evaluate(()=>({
   camera:window.__shokokuQa.snapshot().camera,team:window.ShokokuNet.team,
   phase:window.__shokokuQa.snapshot().phase
  }))));
  assert.equal(lobbyCameras[0].team,2);
  assert.ok(lobbyCameras[0].camera.x>640,
   "swapped red guest must face red deploy territory BEFORE start: "+JSON.stringify(lobbyCameras));
  assert.equal(lobbyCameras[1].team,1);
  assert.ok(lobbyCameras[1].camera.x<640,
   "swapped blue host must face blue deploy territory BEFORE start: "+JSON.stringify(lobbyCameras));
  console.log("ROLE SWAP LOBBY CAMERAS",JSON.stringify(lobbyCameras));
  await host.locator("#netReady").click();
  await guest.locator("#netReady").click();
  await deadline(async()=>await guest.locator("#netStart").isEnabled(),
   "swapped host sees both players ready",17000);
  await guest.locator("#netStart").click();
  for(const [name,page] of [["swapped blue host",guest],["swapped red guest",host]]){
   await deadline(async()=>page.locator("#overlay").evaluate(e=>e.classList.contains("hidden")),
    name+" enters gameplay",25000);
  }
  // Manual red input must cross Firebase to the new host, and come back
  // through that same page's WebKit/Chromium receiver after roles invert.
  // The guest's game overlay may hide from the first state packet before
  // the independent Firebase meta/players listeners finish their callbacks.
  // Do not classify that brief transition as a broken guest connection;
  // still FAIL the QA if the former host never becomes able to send.
  await deadline(async()=>await host.evaluate(()=>window.ShokokuNet.canSendCommand),
   "old host becomes an active remote-command guest after role swap",18000)
   .catch(async error=>{
    const client=await host.evaluate(()=>({
     team:window.ShokokuNet.team,isHost:window.ShokokuNet.isHost,
     canSendCommand:window.ShokokuNet.canSendCommand,
     net:window.ShokokuNet.syncDiagnostics(),
     scene:window.__shokokuQa.snapshot().phase
    })).catch(e=>({error:String(e)}));
    const response=await fetch(urlDB+"/"+swapCode+"/meta.json").catch(()=>null);
    const meta=response?.ok?await response.json():null;
    console.error("ROLE SWAP GUEST COMMAND TIMEOUT",JSON.stringify({client,meta}));
    throw error;
   });
  // A new red guest should already be aimed at the red deployment zone;
  // use a fixed legal world position rather than a viewport percentage, so
  // this actually verifies the touch-to-world coordinate transform.
  await host.locator('button.card[data-id="infantry"]').click();
  const tap=await host.evaluate(()=>{
   const scene=window.__shokokuQa.snapshot(),rect=document.getElementById("fieldArea").getBoundingClientRect();
   const worldX=1130,worldY=405,view=scene.view;
   return {screenX:rect.left+view.ox+worldX*view.s,
    screenY:rect.top+view.oy+worldY*view.s,
    bounds:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},
    camera:scene.camera,view:scene.view};
  });
  assert.ok(tap.screenX>tap.bounds.left+10&&tap.screenX<tap.bounds.right-10&&
   tap.screenY>tap.bounds.top+10&&tap.screenY<tap.bounds.bottom-10,
   "red home deployment point must be on-screen as soon as guest starts: "+JSON.stringify(tap));
  await host.mouse.click(tap.screenX,tap.screenY);
  console.log("ROLE SWAP GUEST RED TAP",JSON.stringify({tap,recordVideo:qaRecordVideo}));
  const roleStateURL=urlDB+"/"+swapCode+"/state.json";
  // The video-enabled WebKit job once hung after the tap for >10min without
  // producing a result: a failed poll must not itself hang while collecting
  // feedback/command diagnostics. Abort each Firebase REST read explicitly.
  const roleJson=async(pathPart)=>{
   const controller=new AbortController();
   const abort=setTimeout(()=>controller.abort(),6500);
   try{
    const res=await fetch(urlDB+"/"+swapCode+pathPart+".json",{signal:controller.signal});
    if(!res.ok)throw Error("HTTP "+res.status+" on "+pathPart);
    return await res.json();
   }finally{clearTimeout(abort)}
  };
  const roleWorld=()=>roleJson("/state");
  console.log("ROLE SWAP WAIT RED PUBLISH",JSON.stringify({recordVideo:qaRecordVideo,matchedWebkit:qaMatchedWebkit}));
  const redPublished=await deadline(async()=>{
   const packet=await roleWorld();
   return packet?.world?.units?.some(u=>u.team===2)?packet:null;
  },"swapped red manual summon published by new host",23000)
   .catch(async error=>{
    const collect=async(promise,name)=>bounded(promise,name,7000).catch(e=>({error:String(e)}));
    const [hostUi,guestUi,current,feedback,commands]=await Promise.all([
     collect(host.evaluate(()=>({net:window.ShokokuNet.syncDiagnostics(),scene:window.__shokokuQa.snapshot(),canSend:window.ShokokuNet.canSendCommand})),"swap host UI"),
     collect(guest.evaluate(()=>({net:window.ShokokuNet.syncDiagnostics(),scene:window.__shokokuQa.snapshot()})),"swap guest UI"),
     collect(roleWorld(),"swap latest RTDB state"),
     collect(roleJson("/feedback"),"swap command feedback"),
     collect(roleJson("/commands"),"swap pending commands")
    ]);
    console.error("ROLE SWAP MANUAL RED TAP FAILURE",JSON.stringify({hostUi,guestUi,
     server:{seq:current?.seq,units:current?.world?.units?.length,phase:current?.world?.phase},feedback,commands,tap}));
    throw error;
   });
  console.log("ROLE SWAP RED PUBLISHED",JSON.stringify({seq:redPublished.seq,
   redUnits:redPublished.world.units.filter(u=>u.team===2).length}));
  await deadline(async()=>await host.evaluate(()=>window.__onlineSeq||0)>=redPublished.seq,
   "swapped red guest receives its own host-confirmed summon",21000);
  // Same 14-unit gameplay scene as the initial role assignment. The FPS
  // comparison is informational, NOT an assertion about headless WebKit FPS.
  const swapSeed=await guest.evaluate(()=>window.__shokokuQa.seedRealisticBattle("standard"));
  assert.ok(swapSeed&&swapSeed.units===14&&swapSeed.actions.every(a=>a.ok),
   "swapped host seeds actual legal-card standard battle");
  const swapSeededState=await deadline(async()=>{
   const packet=await roleWorld();
   return packet?.world?.phase==="battle"&&packet.world.units?.length===14?packet:null;
  },"role-swapped standard battle reaches RTDB",20000);
  await deadline(async()=>await host.evaluate(()=>window.__onlineSeq||0)>=swapSeededState.seq,
   "swapped remote client applies standard battle snapshot",23000);
  await Promise.all([host,guest].map(page=>page.evaluate(()=>{
   window.__shokokuQa.resetFrameBench();window.__qaPairStartedAt=performance.now();
  })));
  await delay(1900);
  const readRoleWindow=()=>{
   const frames=window.__shokokuQa.frameBench().filter(x=>x.phase==="battle");
   const sorted=frames.map(x=>x.gapMs).filter(Number.isFinite).sort((a,b)=>a-b);
   const elapsedMs=performance.now()-window.__qaPairStartedAt;
   return {isHost:window.ShokokuNet.isHost,team:window.ShokokuNet.team,
    phase:window.__shokokuQa.snapshot().phase,
    seq:window.ShokokuNet.syncDiagnostics().seq,
    units:window.__shokokuQa.snapshot().units.length,
    frames:frames.length,fps:Math.round(frames.length*1000/Math.max(1,elapsedMs)*10)/10,
    gapP95Ms:Math.round((sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]||0)*10)/10,
    quality:window.__shokokuQa.quality(),
    frameError:window.__onlineFrameError||null};
  };
  const [oldHostNowGuest,oldGuestNowHost]=await Promise.all([
   host.evaluate(readRoleWindow),guest.evaluate(readRoleWindow)
  ]);
  assert.equal(oldHostNowGuest.isHost,false,"former host must paint as guest");
  assert.equal(oldGuestNowHost.isHost,true,"former guest must simulate as host");
  assert.equal(oldHostNowGuest.team,2);assert.equal(oldGuestNowHost.team,1);
  assert.equal(oldHostNowGuest.frameError,null);
  assert.equal(oldGuestNowHost.frameError,null);
  assert.ok(oldHostNowGuest.frames>=4&&oldGuestNowHost.frames>=4,
   "both roles paint several frames after swapping browser roles");
  assert.ok(oldHostNowGuest.seq>=swapSeededState.seq,
   "role-swapped guest continues applying Firebase updates");
  assert.equal(oldHostNowGuest.phase,"battle");
  console.log("REAL FIREBASE FIXED-DEVICE ROLE CROSSOVER",JSON.stringify({
   matchedWebkit:qaMatchedWebkit,recordVideo:qaRecordVideo,
   standardBeforeSwap,oldHostNowGuest,oldGuestNowHost,
   manualGuestCommandReceived:true,scenario:"standard"
  }));
  // Leave both sides so no old-host/old-guest role can leak into a later room.
  // This button lives inside the hidden end-of-match overlay during battle.
  // The existing in-game new-room flow intentionally uses DOM click while
  // gameplay is active; a Playwright locator.click() would wait forever for
  // visibility and falsely fail an otherwise working role-crossover test.
  await host.evaluate(()=>document.getElementById("newRoom").click());
  await guest.evaluate(()=>document.getElementById("newRoom").click());
  for(const page of [host,guest])await deadline(async()=>
   (await page.locator("#netRoom").innerText()).trim()==="-----"&&
   await page.locator("#netCreate").isEnabled(),
   "role swapped clients return to room picker",8000);
  console.log("PASS: "+(qaMatchedWebkit?"WebKit host + WebKit guest":"Chromium host + WebKit guest")+
   " real Firebase 1v1, no research logging, recovery, rematches and new room "+code);
 }finally{
  for(const p of pages){try{await p.close()}catch{}}
  if(hostCtx)try{await hostCtx.close()}catch{}
  if(guestCtx)try{await guestCtx.close()}catch{}
  if(browser)try{await browser.close()}catch{}
  if(guestBrowser)try{await guestBrowser.close()}catch{}
  for(const tempCode of [code,botCode,swapCode].filter(Boolean)){
   // Let onDisconnect presence operations finish before removing our own room.
   await delay(750);
   const u=urlDB+"/"+tempCode+".json";
   const del=await fetch(u,{method:"DELETE"});
   if(!del.ok)console.error("WARNING: Cleanup failed, HTTP "+del.status+" for test room "+tempCode);
   else {
    const check=await fetch(u);
    const payload=await check.text();
    console.log("CLEANUP:",payload.trim()==="null"?"confirmed":"not confirmed");
   }
  }
  await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
