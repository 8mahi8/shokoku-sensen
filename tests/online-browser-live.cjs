// Live Chromium host + WebKit iPad guest end-to-end test. Runs in GitHub Actions only.
// Creates one room in shokokuRooms1v1, then deletes that same room after closing both tabs.
"use strict";
const {chromium,webkit}=require("playwright"),fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const assert=require("node:assert/strict");
const root=process.cwd(),urlDB="https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1";
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
 let browser,guestBrowser,code="",pages=[];
 try{
  await new Promise(r=>server.listen(8765,"127.0.0.1",r));
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  guestBrowser=await webkit.launch({headless:true});
  const hostCtx=await browser.newContext({viewport:{width:1194,height:834}});
  const guestCtx=await guestBrowser.newContext({
   viewport:{width:1194,height:834},deviceScaleFactor:2,hasTouch:true
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
  // The BOT has already spent a card, so its live hand rotation differs legitimately.
  // Ensure it still owns the same card types and honors the host's authoritative deck.
  const cards=t=>[...packet.world.hand[t],...packet.world.queue[t]].sort();
  assert.deepEqual(cards(1),cards(2),"BOT and host have same card types (rotation may differ)");

  // Switching BOT off should permit manual guest input without affecting multiplayer.
  await botToggle.click();
  assert.equal(await botToggle.getAttribute("aria-pressed"),"false");
  const manualCount=packet.world.units.filter(u=>u.team===2).length;
  await summon(guest,2);
  const afterManual=await deadline(async()=>{
   const current=await state();
   return current?.world?.units?.filter(u=>u.team===2).length>manualCount?current:null;
  },"manual guest control after BOT off",18000);
  // Firebase having state is not enough: the WebKit receiver must apply it.
  await deadline(async()=>(await guest.evaluate(()=>window.__onlineSeq||0))>=afterManual.seq,
   "WebKit guest receives and applies manual guest summon",18000);
   const guestOrder=await deadline(async()=>{
    const d=await guest.evaluate(()=>window.ShokokuNet.syncDiagnostics());
    return d.commandSent>0&&d.commandPending===0&&d.commandAccepted===d.commandSent?d:null;
   },"WebKit guest sees authoritative summon acknowledgement",18000);
   console.log("GUEST ORDER ACK",JSON.stringify({sent:guestOrder.commandSent,processed:guestOrder.commandProcessed,accepted:guestOrder.commandAccepted}));
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
  // Without listener delivery, WebKit still paints but retains an old world.
  await delay(650);
  assert.equal(await guest.evaluate(()=>window.__onlineSeq||0),seqBefore,
   "muted guest listener should keep a frozen visual world");
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
  if(errors.length)throw Error("Browser JavaScript errors: "+errors.slice(0,8).join(" | "));
  console.log("PASS: Chromium host + WebKit iPad inline guest, real Firebase BOT auto-ready, auto-deploy, manual override and sync in room "+code);
 }finally{
  for(const p of pages){try{await p.close()}catch{}}
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
