"use strict";
// CI smoke for the single-device RED guest / BLUE BOT test page.
// Both iframes use a genuine temporary RTDB room; only that room is cleaned.
const {chromium,webkit}=require("playwright");
const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const assert=require("node:assert/strict");
const root=process.cwd();
const engine=process.env.GUEST_LAB_BROWSER==="webkit"?"webkit":"chromium";
const urlDB="https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1";
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.writeHead(200,{"content-type":file.endsWith(".html")?"text/html;charset=utf-8":
  file.endsWith(".js")?"text/javascript;charset=utf-8":"text/plain","cache-control":"no-store"});
 fs.createReadStream(file).pipe(res);
});
let browser,page,roomCode="";
const timeout=async (fn,label,ms=30000)=>{
 const until=Date.now()+ms;let last="";
 while(Date.now()<until){try{const v=await fn();if(v)return v}catch(e){last=e.message}await pause(300)}
 throw Error("Timed out "+label+": "+last);
};
(async()=>{
 try{
  await new Promise(resolve=>server.listen(8772,"127.0.0.1",resolve));
  browser=await (engine==="webkit"?webkit:chromium).launch({
   headless:true,...(engine==="chromium"?{args:["--no-sandbox"]}:{})
  });
  const context=await browser.newContext({viewport:{width:1194,height:834},
   deviceScaleFactor:engine==="webkit"?2:1,hasTouch:true});
  page=await context.newPage();
  const errors=[];
  page.on("pageerror",error=>{
    const message=String(error.message||"");
    // The Firebase SDK occasionally emits a bare failed .lp?disconn URL on
    // Linux WebKit when closing its transport. It is not game JavaScript.
    // Keep every other exception fatal, including guest frame/DOM failures.
    if(/^\/[^\s]*\.firebaseio\.com\/\.lp\?/.test(message))return;
    errors.push(message);
  });
  await page.goto("http://127.0.0.1:8772/guest-lab.html?qa=1");
  await timeout(async()=>page.locator("#start").isEnabled(),"lab init & RTDB connection",60000);
  await page.locator("#start").click();
  await timeout(async()=>{
   const t=await page.locator("#status").innerText();
   if(t.includes("エラー"))throw Error(t+" / "+await page.locator("#message").innerText());
   return t.includes("赤軍ゲストでプレイ中");
  },"lab creates host + joins guest + starts match",50000);
  roomCode=await page.evaluate(()=>document.getElementById("hostFrame").contentDocument.getElementById("netRoom").textContent.trim());
  assert.match(roomCode,/^\d{5}$/);
  const identity=await page.evaluate(()=>{
   const h=document.getElementById("hostFrame").contentWindow;
   const g=document.getElementById("guestFrame").contentWindow;
   return {blue:h.__shokokuGuestLabHost,red:g.__shokokuGuestLabHost,
     host:h.ShokokuNet.isHost,guest:g.ShokokuNet.isHost,team:g.ShokokuNet.team};
  });
  assert.deepEqual(identity,{blue:true,red:false,host:true,guest:false,team:2});
  const active=await timeout(async()=>{
   const diag=await page.evaluate(()=>{
    const h=document.getElementById("hostFrame").contentWindow,
      g=document.getElementById("guestFrame").contentWindow;
    return {h:h.ShokokuNet.syncDiagnostics(),g:g.ShokokuNet.syncDiagnostics(),
      guestSeq:g.__onlineSeq||0,hostError:h.__onlineFrameError||"",guestError:g.__onlineFrameError||""};
   });
   if(diag.hostError||diag.guestError)throw Error("Frame errors: "+JSON.stringify(diag));
   if(diag.h.seq<12||diag.g.seq<8||diag.guestSeq<8)return null;
   const response=await fetch(urlDB+"/"+roomCode+"/state.json");
   if(!response.ok)return null;
   const state=await response.json();
   if(state?.world?.phase!=="battle"||!(state.world?.elapsed>0.3))return null;
   if(!state.world.units?.some(u=>u.team===1))return null;
   return {diag,seq:state.seq,elapsed:state.world.elapsed,blueUnits:state.world.units.filter(u=>u.team===1).length};
  },"blue AI moves in real battle; red client receives Firebase frames",80000);
  assert.equal(active.diag.g.role,"guest");
  assert.ok(active.diag.g.seq>=8);
  // Verify the actual RED HUD predictor, not just command/snapshot arrival.
  // Silence only this QA client's SDK snapshot callbacks. The host keeps
  // simulating normally, and its own Firebase packets are not touched.
  fs.mkdirSync(path.join(root,"qa-guest-lab"),{recursive:true});
  const guestEnergyStart=await page.evaluate(()=>{
    const g=document.getElementById("guestFrame").contentWindow;
    g.__shokokuNetQa.muteSdkSnapshots(true);
    g.__shokokuNetQa.freezeGuestWorld(true);
    return {seq:g.__onlineSeq||0,...g.__shokokuQa.energyHud()};
  });
  assert.equal(guestEnergyStart.phase,"battle");
  assert.ok(guestEnergyStart.confirmed<12,"guest HUD needs room to regenerate");
  await pause(230);
  const guestEnergyDuring=await page.evaluate(()=>{
    const g=document.getElementById("guestFrame").contentWindow;
    return {seq:g.__onlineSeq||0,...g.__shokokuQa.energyHud()};
  });
  assert.equal(guestEnergyDuring.seq,guestEnergyStart.seq,
    "no guest authoritative snapshots during deliberate QA mute");
  assert.equal(guestEnergyDuring.confirmed,guestEnergyStart.confirmed,
    "muted snapshots must never change spendable energy");
  assert.ok(guestEnergyDuring.displayed>guestEnergyStart.confirmed+.01,
    "guest visible energy increases between received packets");
  await pause(700);
  const guestEnergyCap=await page.evaluate(()=>{
    const g=document.getElementById("guestFrame").contentWindow;
    return {seq:g.__onlineSeq||0,...g.__shokokuQa.energyHud(),
      bar:g.document.getElementById("nextEnergyFill").style.width};
  });
  await pause(330);
  const guestEnergyAfterCap=await page.evaluate(()=>{
    const g=document.getElementById("guestFrame").contentWindow;
    return {seq:g.__onlineSeq||0,...g.__shokokuQa.energyHud(),
      bar:g.document.getElementById("nextEnergyFill").style.width};
  });
  assert.equal(guestEnergyCap.confirmed,guestEnergyStart.confirmed);
  assert.equal(guestEnergyAfterCap.confirmed,guestEnergyStart.confirmed);
  assert.ok(Math.abs(guestEnergyAfterCap.displayed-guestEnergyCap.displayed)<.00001,
    "guest HUD estimation must stop once 350ms snapshot allowance is exhausted");
  assert.ok(guestEnergyAfterCap.displayed<Math.floor(guestEnergyStart.confirmed)+1,
    "prediction must not grant an unconfirmed whole energy point");
  console.log("GUEST ENERGY VISUAL PROBE",JSON.stringify({
    engine,hostStillActive:true,
    start:guestEnergyStart,during:guestEnergyDuring,
    capped:guestEnergyCap,stalled:guestEnergyAfterCap
  }));
  await page.screenshot({path:path.join(root,"qa-guest-lab","energy-stalled-"+engine+".png")})
    .catch(()=>{});
  await page.evaluate(()=>{
    const g=document.getElementById("guestFrame").contentWindow;
    g.__shokokuNetQa.freezeGuestWorld(false);
    g.__shokokuNetQa.muteSdkSnapshots(false);
  });
  const guestEnergyResumed=await timeout(async()=>page.evaluate(startSeq=>{
    const g=document.getElementById("guestFrame").contentWindow;
    const seq=g.__onlineSeq||0;
    if(seq<=startSeq)return null;
    return {seq,...g.__shokokuQa.energyHud()};
  },guestEnergyStart.seq),"guest returns to fresh energy after Firebase snapshot restoration",35000);
  assert.ok(guestEnergyResumed.confirmed>=guestEnergyStart.confirmed,
    "new host state must replenish confirmed energy after recovery");
  console.log("PASS: RED guest HUD progresses between packets, freezes at 350ms, and resyncs",JSON.stringify({
    engine,begin:guestEnergyStart,muted:guestEnergyAfterCap,recovered:guestEnergyResumed
  }));
  // Measure host-vs-guest card affordability across the same 2-energy
  // threshold in a REAL disposable Firebase room. Neither player is given
  // client-side spend authority; this is a QA-only state setup.
  const adjusted=await page.evaluate(()=>{
    const h=document.getElementById("hostFrame").contentWindow;
    return h.__shokokuQa.setEnergyForQa(2,1.65);
  });
  assert.equal(adjusted,true,"QA host may prepare a real red energy threshold");
  const baseline=await timeout(async()=>page.evaluate(()=>{
    const h=document.getElementById("hostFrame").contentWindow;
    const g=document.getElementById("guestFrame").contentWindow;
    const hv=h.__shokokuQa.snapshot(),gv=g.__shokokuQa.snapshot();
    if(hv.phase!=="battle"||gv.phase!=="battle"||
      hv.energy[2]<1.65||hv.energy[2]>=1.9||
      gv.energy[2]<1.65||gv.energy[2]>=1.9)return null;
    return {host:hv.energy[2],guest:gv.energy[2],hostElapsed:hv.elapsed};
  }),"guest receives low-energy threshold fixture",16000);
  const availability=await page.evaluate(()=>new Promise(resolve=>{
    const h=document.getElementById("hostFrame").contentWindow;
    const g=document.getElementById("guestFrame").contentWindow;
    const t0=performance.now(),initialElapsed=h.__shokokuQa.snapshot().elapsed;
    let hostReady=null,guestReady=null,hostElapsedAtReady=null;
    let hostEnergyAtGuest=null,guestEnergyAtHost=null,observations=0;
    const timer=setInterval(()=>{
      const now=performance.now()-t0;
      const hs=h.__shokokuQa.snapshot(),gs=g.__shokokuQa.snapshot();
      observations++;
      if(hostReady===null&&hs.energy[2]>=2){
        hostReady=now;hostElapsedAtReady=hs.elapsed;guestEnergyAtHost=gs.energy[2];
      }
      if(guestReady===null&&gs.energy[2]>=2){
        guestReady=now;hostEnergyAtGuest=hs.energy[2];
      }
      if((hostReady!==null&&guestReady!==null)||now>=23000){
        clearInterval(timer);
        resolve({hostReadyMs:hostReady,guestReadyMs:guestReady,
          lagMs:guestReady===null||hostReady===null?null:guestReady-hostReady,
          hostGameSeconds:hs.elapsed-initialElapsed,realSeconds:now/1000,
          hostElapsedAtReady,guestEnergyAtHost,hostEnergyAtGuest,observations,
          guestSeq:g.__onlineSeq||0});
      }
    },25);
  }));
  assert.ok(availability.hostReadyMs!==null,
    "host must reach actual 2-energy affordability in a live frame");
  assert.ok(availability.guestReadyMs!==null,
    "guest must eventually receive confirmed 2-energy affordability");
  assert.ok(availability.lagMs>=-80,
    "guest must not gain a full confirmed energy point before host");
  assert.ok(availability.lagMs<4000,
    "guest energy must not stay behind a confirmed host for several seconds");
  console.log("ENERGY AFFORDABILITY HOST GUEST PROBE",JSON.stringify({
    engine,baseline,availability,
    note:"headless browser observation; not physical school iPad FPS/latency"
  }));

  // Exercise the actual iPad-style pointer selection and Canvas tap from the
  // RED iframe. This must acknowledge the queued command immediately, while
  // the host remains the only authority allowed to spawn a soldier.
  const queuedTap=await page.evaluate(()=>{
    const g=document.getElementById("guestFrame").contentWindow;
    const doc=g.document,q=g.__shokokuQa;
    const state=q.snapshot();
    const startUid=Math.max(0,...state.units.filter(u=>u.team===2).map(u=>u.uid));
    const card=doc.querySelector('#cards [data-id="infantry"]');
    const field=doc.getElementById("field"),area=doc.getElementById("fieldArea");
    if(!card||!field||!area)return {error:"missing card/canvas",startUid};
    const cardId=41,fieldId=42;
    const cardEvent={pointerId:cardId,pointerType:"touch",bubbles:true,
      clientX:20,clientY:20};
    card.dispatchEvent(new g.PointerEvent("pointerdown",cardEvent));
    doc.dispatchEvent(new g.PointerEvent("pointerup",cardEvent));
    const selected=q.snapshot().selected;
    const v=q.snapshot().view,rect=area.getBoundingClientRect();
    const x=1150,y=330;
    const touch={pointerId:fieldId,pointerType:"touch",bubbles:true,
      clientX:rect.left+v.ox+x*v.s,clientY:rect.top+v.oy+y*v.s};
    field.dispatchEvent(new g.PointerEvent("pointerdown",touch));
    field.dispatchEvent(new g.PointerEvent("pointerup",touch));
    return {selected,after:q.snapshot().selected,startUid,
      markers:q.guestCommandHints(),energy:q.snapshot().energy[2],
      phase:q.snapshot().phase};
  });
  console.log("GUEST POINTER SEND HINT",JSON.stringify({engine,queuedTap}));
  assert.equal(queuedTap.selected,"infantry",
    "RED permanent infantry card should be selected by a real pointer event");
  assert.ok(queuedTap.energy>=2,"RED guest must have affordable confirmed resources");
  assert.equal(queuedTap.markers.items.length,1,
    "successfully queued guest summon must show exactly one local marker");
  assert.equal(queuedTap.markers.items[0].x,1150);
  assert.equal(queuedTap.markers.items[0].y,330);
  // Capture the *same Canvas bitmap immediately* after the cue was
  // painted. Playwright's locator.screenshot can start hundreds of ms
  // later, after a 650ms transient label has legitimately faded away.
  const cueFrame=await timeout(async()=>page.evaluate(()=>{
    const g=document.getElementById("guestFrame").contentWindow;
    if(g.__shokokuQa.guestCommandHints().lastPainted<=0)return null;
    const canvas=g.document.getElementById("field");
    return canvas.toDataURL("image/png");
  }),"RED queued summon hint reaches a WebKit/Chromium paint",1800);
  assert.ok(cueFrame.startsWith("data:image/png;base64,"),
    "real Canvas frame should be captured while cue is visible");
  fs.mkdirSync(path.join(root,"qa-guest-lab"),{recursive:true});
  fs.writeFileSync(path.join(root,"qa-guest-lab","guest-command-queued-"+engine+".png"),
    Buffer.from(cueFrame.split(",")[1],"base64"));
  const commandConfirmed=await timeout(async()=>page.evaluate(startUid=>{
    const h=document.getElementById("hostFrame").contentWindow;
    const g=document.getElementById("guestFrame").contentWindow;
    const hu=h.__shokokuQa.snapshot().units,gu=g.__shokokuQa.snapshot().units;
    const accepted=hu.find(u=>u.team===2&&u.uid>startUid&&
      u.x>1020&&Math.abs(u.y-330)<100);
    const received=gu.find(u=>u.uid===accepted?.uid);
    if(!accepted||!received)return null;
    return {uid:accepted.uid,hostX:accepted.x,guestX:received.x};
  },queuedTap.startUid),"host authoritatively spawns and guest receives tapped infantry",15000);
  console.log("PASS: RED touch gets queued cue, host confirms actual unit, guest renders it",
   JSON.stringify({engine,queuedTap,commandConfirmed}));
  await page.waitForTimeout(900);
  const expired=await page.evaluate(()=>{
    const g=document.getElementById("guestFrame").contentWindow;
    return g.__shokokuQa.guestCommandHints();
  });
  assert.equal(expired.items.length,0,"pending visual must disappear after 650ms");
  assert.equal(expired.lastPainted,0,"expired hint must stop painting");

  const rec=await fetch(urlDB+"/"+roomCode+"/players.json");
  const seats=await rec.json();
  assert.equal(seats.host.online,true);assert.equal(seats.guest.online,true);
  assert.notEqual(seats.host.id,seats.guest.id);
  assert.equal(seats.guest.botControl,false,"guest must remain manual");
  fs.mkdirSync(path.join(root,"qa-guest-lab"),{recursive:true});
  await page.screenshot({path:path.join(root,"qa-guest-lab","guest-lab-"+engine+".png")});
  console.log("PASS: one iPad-style tab hosts BLUE tactical AI; RED human guest receives real Firebase battle frames",JSON.stringify({
   engine,code:roomCode,hostSeq:active.diag.h.seq,guestSeq:active.diag.g.seq,blueUnits:active.blueUnits,elapsed:active.elapsed
  }));
  if(errors.length)throw Error("Browser exceptions "+errors.slice(0,5).join(" | "));

  // Regression: both players may press "同じルームで再戦".
  // The RED button must never throw away the original guest seat.
  await page.evaluate(()=>document.getElementById("hostFrame").contentWindow.ShokokuNet.finish({
    result:"win",reason:"Rematch button end-to-end QA"
  }));
  await timeout(async()=>page.evaluate(()=>{
    const guest=document.getElementById("guestFrame").contentWindow;
    const host=document.getElementById("hostFrame").contentWindow;
    return guest.ShokokuNet.syncDiagnostics().phase==="finished" &&
      guest.document.getElementById("start").textContent==="再戦する（ホスト待ち）" &&
      host.document.getElementById("start").textContent==="同じルームで再戦" &&
      guest.document.getElementById("newRoom").textContent==="ルームを退出する" &&
      host.document.getElementById("newRoom").textContent==="ルームを退出する" &&
      !guest.document.getElementById("overlay").classList.contains("hidden");
  }),"guest receives battle result with same-room rematch",22000);
  await page.evaluate(()=>document.getElementById("guestFrame").contentDocument.getElementById("start").click());
  const waiting=await page.evaluate(()=>{
    const guest=document.getElementById("guestFrame").contentWindow;
    return {role:guest.ShokokuNet.syncDiagnostics().role,
      code:guest.document.getElementById("netRoom").textContent.trim(),
      text:guest.document.getElementById("start").textContent.trim(),
      stillVisible:!guest.document.getElementById("overlay").classList.contains("hidden")};
  });
  assert.equal(waiting.role,"guest");
  assert.equal(waiting.code,roomCode,"RED rematch must retain same Firebase room");
  assert.ok(waiting.text.includes("待っています"),"RED shows host-rematch waiting status");
  assert.equal(waiting.stillVisible,true,"RED shows result until host starts rematch");
  const seatsWhileWaiting=await (await fetch(urlDB+"/"+roomCode+"/players.json")).json();
  assert.equal(seatsWhileWaiting.guest.online,true,"RED remains in room after tapping rematch");
  await page.evaluate(()=>document.getElementById("hostFrame").contentWindow.ShokokuNet.rematch());
  await timeout(async()=>page.evaluate(()=>{
    const h=document.getElementById("hostFrame").contentWindow,
      g=document.getElementById("guestFrame").contentWindow;
    return h.ShokokuNet.syncDiagnostics().phase==="lobby" &&
      g.ShokokuNet.syncDiagnostics().phase==="lobby" &&
      g.document.getElementById("overlay").classList.contains("hidden") &&
      !h.document.getElementById("netReady").disabled &&
      !g.document.getElementById("netReady").disabled;
  }),"round 2 lobby returns to both peers without losing seat",24000);
  const second=await (await fetch(urlDB+"/"+roomCode+"/meta.json")).json();
  assert.equal(second.round,2,"host increments Firebase round once");
  assert.equal(second.status,"lobby");
  const players2=await (await fetch(urlDB+"/"+roomCode+"/players.json")).json();
  assert.equal(players2.guest.online,true,"same guest still connected for round 2");
  await page.evaluate(()=>{
    document.getElementById("guestFrame").contentDocument.getElementById("netReady").click();
    document.getElementById("hostFrame").contentDocument.getElementById("netReady").click();
  });
  await timeout(async()=>page.evaluate(()=>{
    const h=document.getElementById("hostFrame").contentDocument;
    return !h.getElementById("netStart").disabled;
  }),"both ready for round 2",24000);
  await page.evaluate(()=>document.getElementById("hostFrame").contentDocument.getElementById("netStart").click());
  await timeout(async()=>page.evaluate(()=>{
    const h=document.getElementById("hostFrame").contentWindow,
      g=document.getElementById("guestFrame").contentWindow;
    return h.ShokokuNet.syncDiagnostics().phase==="playing" &&
      g.ShokokuNet.syncDiagnostics().phase==="playing" &&
      (g.__onlineSeq||0)>0;
  }),"round 2 starts with synchronized guest battle frames",26000);
  console.log("PASS: RED rematch stays seated, host starts round 2, both ready and RED sync resumes",JSON.stringify({engine}));
  if(errors.length)throw Error("Browser exceptions after rematch "+errors.slice(0,5).join(" | "));

  await page.locator("#restart").click();
  await timeout(async()=>page.locator("#start").isEnabled(),"lab returns to ready after reset",22000);
  console.log("PASS: restart creates fresh unoccupied test interface");
 }finally{
  if(page)await page.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  if(roomCode){
   await pause(600);
   const u=urlDB+"/"+roomCode+".json";
   const result=await fetch(u,{method:"DELETE"});
   assert.equal(result.ok,true,"temporary test room must be deleted");
   assert.equal(await (await fetch(u)).text(),"null","temporary room cleanup must be confirmed");
   console.log("CLEANUP: confirmed "+roomCode);
  }
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(error=>{console.error(error);process.exitCode=1});
