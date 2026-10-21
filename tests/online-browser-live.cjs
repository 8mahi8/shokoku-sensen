// Live Chromium host + WebKit iPad guest end-to-end test. Runs in GitHub Actions only.
// Creates one room in shokokuRooms1v1, then deletes that same room after closing both tabs.
"use strict";
const {chromium,webkit}=require("playwright"),fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const assert=require("node:assert/strict");
const root=process.cwd(),urlDB="https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1";
const qaVideoDir=path.join(root,"qa-online-guest-visual");fs.mkdirSync(qaVideoDir,{recursive:true});
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end("not found");return}
 res.writeHead(200,{"content-type":mime[path.extname(file)]||"application/octet-stream","cache-control":"no-store"});
 fs.createReadStream(file).pipe(res);
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const deadline=async (f,label,timeout=18000)=>{
 const end=Date.now()+timeout;let error;
 while(Date.now()<end){try{const v=await f();if(v)return v}catch(e){error=e}await delay(300)}
 throw Error("Timed out "+label+" "+(error?.message||""));
};
(async()=>{
 let browser,guestBrowser,hostCtx,guestCtx,code="",pages=[];
 try{
  await new Promise(r=>server.listen(8765,"127.0.0.1",r));
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  guestBrowser=await webkit.launch({headless:true});
  hostCtx=await browser.newContext({viewport:{width:1194,height:834}});
  guestCtx=await guestBrowser.newContext({
   viewport:{width:1194,height:834},deviceScaleFactor:2,hasTouch:true,
   recordVideo:{dir:qaVideoDir,size:{width:1194,height:834}}
  });
  const host=await hostCtx.newPage(),guest=await guestCtx.newPage();
  pages=[host,guest];const errors=[];
  for(const [name,p] of [["host",host],["guest",guest]])p.on("pageerror",err=>errors.push(name+": "+err.message));
  await Promise.all([host.goto("http://127.0.0.1:8765/online.html?qa=1&perf=1"),guest.goto("http://127.0.0.1:8765/online-ipad.html?qa=1&perf=1")]);
  for(const p of pages)await deadline(async()=>((await p.locator("#netStatus").innerText()).includes("接続OK")), "Firebase connection",30000);
  await host.locator("#netCreate").click();
  code=await deadline(async()=>{const v=(await host.locator("#netRoom").innerText()).trim();return /^[0-9]{5}$/.test(v)?v:null},"host create",22000);
  await guest.locator("#netJoinCode").fill(code);await guest.locator("#netJoin").click();
  await deadline(async()=>(await guest.locator("#netRoom").innerText()).trim()===code,"guest join");
  // Both local and anonymous room archival start ON for new rooms.
  // Either friend can disable before or during a match.
  await deadline(async()=>(await host.locator("#researchConsent").isChecked())&&
    (await guest.locator("#researchConsent").isChecked())&&
    (await host.locator("#researchArchiveConsent").isChecked())&&
    (await guest.locator("#researchArchiveConsent").isChecked()),
   "both local and room research start enabled for both peers",20000);
  assert.equal(await host.evaluate(()=>window.ShokokuResearch.active),false,"no recording outside a match");
  await guest.locator("#researchConsent").uncheck();
  await deadline(async()=>{const response=await fetch(urlDB+"/"+code+"/players/guest.json");
    const player=response.ok?await response.json():null;
    return player?.researchConsent===false&&player?.archiveConsent===false;
  },"guest opt-out disables both local and cloud logs",20000);
  await deadline(async()=>(await host.locator("#researchHint").innerText()).includes("記録 OFF"),
    "host sees opt-out",20000);
  await guest.locator("#researchConsent").check();
  await deadline(async()=>(await host.locator("#researchHint").innerText()).includes("記録 ON"),
    "host sees recording restored",20000);
  assert.equal(await guest.locator("#researchArchiveConsent").isChecked(),false,
   "re-enabling local logging must not silently overwrite cloud opt-out");
  // Explicit opt-in on THIS disposable research QA room, never on real games.
  await host.locator("#researchArchiveConsent").check();
  await guest.locator("#researchArchiveConsent").check();
  await deadline(async()=>{
   const response=await fetch(urlDB+"/"+code+"/players.json");
   const peers=response.ok?await response.json():null;
   return peers?.host?.archiveConsent===true&&peers?.guest?.archiveConsent===true;
  },"both peers opt into archive",20000);
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
  await deadline(async()=>host.evaluate(()=>window.ShokokuResearch.active===true),
   "opt-in host logger active after battle start",15000);
  assert.equal(await guest.evaluate(()=>window.ShokokuResearch.active),false,
   "online guest must never create a research log");
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
   assert.equal(frozen.seq,offlineBefore.seq,
    "closed Firebase SDK guest must not apply new authoritative packets");
   console.log("REAL GUEST OFFLINE",JSON.stringify({
    before:offlineBefore,offline:frozen,
    hostSeqBefore:hostBeforeOffline.seq,hostSeqDuring:duringOutage.seq
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
  // Finish a recorded match in the existing QA room, then confirm that
  // the REAL Firebase permission allows an optional in-room archive.
  const finalWorld=(await state()).world;
  assert.ok(finalWorld?.capitals?.length===2&&finalWorld?.forts?.length===3);
  await host.evaluate(w=>{
   window.ShokokuResearch.finish(w);
   window.ShokokuNet.finish({result:"win",reason:"QA archive"});
  },finalWorld);
  const archived=await deadline(async()=>{
   const response=await fetch(urlDB+"/"+code+"/researchRounds/1.json");
   return response.ok?(await response.json())?.match:null;
  },"existing room accepts consented research record",15000);
  assert.equal(archived.schema,1);
  assert.equal(archived.mode,"online");
  assert.ok(Array.isArray(archived.actions)&&Array.isArray(archived.samples));
  assert.ok(!JSON.stringify(archived).includes(code));
  console.log("PASS LIVE RESEARCH ROOM ARCHIVE",JSON.stringify({
   actions:archived.actions.length,samples:archived.samples.length
  }));
  // Validate the exact user flow: on a phone-like viewport, open the
  // one-page collector, tap collect-all, and receive match JSON WITHOUT
  // entering any room number. Only anonymous researchRounds are fetched.
  const mobile=await hostCtx.newPage({viewport:{width:390,height:844}});
  pages.push(mobile);
  mobile.on("requestfailed",request=>{
   if(request.url().includes("mygame-df915-default-rtdb"))
    console.log("PHONE FIREBASE REQUEST ERROR",request.failure()?.errorText,request.url().split("?")[0]);
  });
  mobile.on("response",response=>{
   if(response.url().includes("mygame-df915-default-rtdb")&&!response.ok())
    console.log("PHONE FIREBASE HTTP",response.status(),response.url().split("?")[0]);
  });
  await mobile.goto("http://127.0.0.1:8765/research-recover.html");
  await mobile.locator("#fetchAll").click();
  const collected=await deadline(async()=>{
   const status=await mobile.locator("#status").innerText();
   if(status.startsWith("自動回収できません"))
    throw Error("recovery page reports: "+status);
   const data=await mobile.evaluate(()=>typeof batch!=="undefined"?batch:null);
   if(!data?.matches?.length)throw Error("phone status: "+status);
   return data;
  },"phone recovery without room number",35000);
  assert.ok(collected.matches.some(m=>m.actions?.length===archived.actions.length&&
   m.result?.duration===archived.result.duration),
   "one-click phone export includes QA archived match");
  assert.ok(!JSON.stringify(collected).includes(code),"room numbers must be stripped");
  assert.equal(await mobile.locator("#download").isEnabled(),true);
  console.log("PASS LIVE PHONE COLLECT-ALL",JSON.stringify({matches:collected.matches.length}));
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
   await guest.screenshot({path:path.join(qaVideoDir,"realistic-"+scenario+"-guest-initial.png"),
    fullPage:false});
   // Isolate active REAL Firebase WebKit guest frames from initial resource
   // loading and room transitions. Measurements are CI only, not school iPad.
   await guest.evaluate(()=>window.__shokokuQa.resetFrameBench());
   await delay(1500);
   await guest.screenshot({path:path.join(qaVideoDir,"realistic-"+scenario+"-guest-after-1100ms.png"),
    fullPage:false});
   const later=await guest.evaluate(()=>{
    const frames=window.__shokokuQa.frameBench().filter(r=>r.phase==="battle");
    const gaps=frames.map(r=>r.gapMs).filter(Number.isFinite).sort((a,b)=>a-b);
    const p95=gaps[Math.min(gaps.length-1,Math.floor(gaps.length*.95))]||0;
    return {phase:window.__shokokuQa.snapshot().phase,
     count:window.__shokokuQa.snapshot().units.length,
     perf:window.ShokokuNet.syncDiagnostics(),
     frameSamples:frames.length,
     gapP95Ms:Math.round(p95*10)/10,
     frameError:window.__onlineFrameError||null};
   });
   assert.equal(later.frameError,null,"WebKit guest should not throw during "+scenario);
   assert.ok(later.frameSamples>=5,"WebKit must paint multiple frames after "+scenario);
   assert.equal(later.phase,"battle","WebKit guest must remain in battle during "+scenario);
   console.log("REAL FIREBASE GUEST SCENE",JSON.stringify({
    scenario,initialUnits:seeded.units,heavy:seeded.heavy,
    packetStats:{seq:synced.seq,updatesHz:synced.diag.updatesHz,applyMs:synced.diag.applyMs},
    after1500ms:{count:later.count,updatesHz:later.perf.updatesHz,
      applyMs:later.perf.applyMs,frameSamples:later.frameSamples,gapP95Ms:later.gapP95Ms}
   }));
  }
  console.log("CONSECUTIVE ROUNDS: 7 starts incl. 6 rematches, 8-20 unit scenes in one temporary Firebase room");
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
  console.log("PASS: Chromium host + WebKit iPad inline guest, default-on opt-out telemetry, recovery and non-blocking new game in room "+code);
 }finally{
  for(const p of pages){try{await p.close()}catch{}}
  if(hostCtx)try{await hostCtx.close()}catch{}
  if(guestCtx)try{await guestCtx.close()}catch{}
  if(browser)try{await browser.close()}catch{}
  if(guestBrowser)try{await guestBrowser.close()}catch{}
  if(code){
   // Let onDisconnect presence operations finish before removing our own room.
   await delay(750);
   const u=urlDB+"/"+code+".json";
   const del=await fetch(u,{method:"DELETE"});
   if(!del.ok)console.error("WARNING: Cleanup failed, HTTP "+del.status+" for test room "+code);
   else {
    const check=await fetch(u);
    const payload=await check.text();
    console.log("CLEANUP:",payload.trim()==="null"?"confirmed":"not confirmed");
   }
  }
  await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
