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
  page.on("pageerror",error=>errors.push(error.message));
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
