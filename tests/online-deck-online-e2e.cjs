// One disposable Firebase room, two real browsers, deck-ready and rematch.
"use strict";
const {chromium,webkit}=require("playwright");
const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const assert=require("node:assert/strict");
const root=process.cwd(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const BASE="https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1";
const wait=async(fn,label,ms=30000)=>{
 const until=Date.now()+ms;let latest;
 while(Date.now()<until){
  try{const value=await fn();if(value)return value;}catch(e){latest=e;}
  await sleep(180);
 }
 throw Error("Timeout "+label+(latest?" / "+latest.message:""));
};
const server=http.createServer((req,res)=>{
 const filepath=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!filepath.startsWith(root+path.sep)||!fs.existsSync(filepath)||!fs.statSync(filepath).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.writeHead(200,{"content-type":filepath.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8","cache-control":"no-store"});
 fs.createReadStream(filepath).pipe(res);
});
(async()=>{
 let hb,gb,host,guest,code="",issues=[];
 try{
  await new Promise(r=>server.listen(8783,"127.0.0.1",r));
  hb=await chromium.launch({headless:true,args:["--no-sandbox"]});
  gb=await webkit.launch({headless:true});
  host=await hb.newPage({viewport:{width:1024,height:650}});
  guest=await gb.newPage({viewport:{width:1024,height:650},hasTouch:true});
  for(const [label,page] of [["host",host],["guest",guest]])page.on("pageerror",e=>issues.push(label+": "+e.message));
  await Promise.all([host.goto("http://127.0.0.1:8783/online.html?qa=1"),guest.goto("http://127.0.0.1:8783/online-ipad.html?qa=1")]);
  for(const page of [host,guest])
   await wait(async()=>(await page.locator("#netStatus").innerText()).includes("接続OK"),"RTDB ready");
  await host.locator("#netCreate").click();
  code=await wait(async()=>{
   const v=(await host.locator("#netRoom").innerText()).trim();
   return /^\d{5}$/.test(v)?v:false;
  },"room creation");
  await guest.locator("#netJoinCode").fill(code);
  await guest.locator("#netJoin").click();
  await wait(async()=>await guest.locator("#netRoom").innerText()===code,"guest joins");
  const meta=async()=>{
   const response=await fetch(BASE+"/"+code+"/meta.json");
   if(!response.ok)throw Error("DB "+response.status);
   return response.json();
  };
  // Different, legal decks prove the new 5 cards are real selections, not
  // merely decorative catalog tiles. Guest uses the standalone iPad HTML.
  for(const [page,newId,oldId] of [[host,"duelist","scout"],[guest,"ground_bomber","tank"]]){
   await page.locator("#deckOpen").click();
   assert.equal(await page.locator("#deckSelected .deckTile").count(),10);
   assert.equal(await page.locator("#deckPool .deckTile").count(),5);
   await page.locator('#deckPool .deckTile[data-card-id="'+newId+'"]').click();
   await page.locator('#deckSelected .deckTile[data-card-id="'+oldId+'"]').click();
   assert.equal(await page.locator('#deckSelected .deckTile[data-card-id="'+newId+'"]').count(),1);
   await page.locator("#deckSave").click();
   const saved=await page.evaluate(()=>window.ShokokuDeck.current());
   assert.equal(saved.length,10);assert.ok(saved.includes(newId));assert.ok(!saved.includes(oldId));
  }
  await guest.locator("#netReady").click();
  await host.locator("#netReady").click();
  await wait(async()=>host.locator("#netStart").isEnabled(),"both ready");
  await host.locator("#netStart").click();
  await wait(async()=>{
   const state=await meta();
   return state?.status==="playing"&&state.lockedDecks?.hostDeckIds?.length===10&&
    state.lockedDecks?.guestDeckIds?.length===10&&
    await host.locator("#onlinePanel").isHidden()&&await guest.locator("#onlinePanel").isHidden();
  },"match starts with ten cards each");
  const locked=await meta();
  assert.ok(locked.lockedDecks.hostDeckIds.includes("duelist"));
  assert.ok(!locked.lockedDecks.hostDeckIds.includes("scout"));
  assert.ok(locked.lockedDecks.guestDeckIds.includes("ground_bomber"));
  assert.ok(!locked.lockedDecks.guestDeckIds.includes("tank"));
  assert.equal(new Set(locked.lockedDecks.hostDeckIds).size,10);
  assert.equal(new Set(locked.lockedDecks.guestDeckIds).size,10);
  await wait(async()=>host.evaluate(()=>window.__shokokuDeckQa?.activeDecks()?.[1]?.includes("duelist")),
   "host in-game selected deck");
  await wait(async()=>guest.evaluate(()=>window.__shokokuDeckQa?.activeDecks()?.[2]?.includes("ground_bomber")),
   "guest in-game selected deck");
  const hostDeck=await host.evaluate(()=>window.__shokokuDeckQa.activeDecks());
  const guestDeck=await guest.evaluate(()=>window.__shokokuDeckQa.activeDecks());
  assert.ok(hostDeck[1].includes("duelist")&&!hostDeck[1].includes("scout"));
  assert.ok(guestDeck[2].includes("ground_bomber")&&!guestDeck[2].includes("tank"));
  assert.deepEqual(hostDeck[2],guestDeck[2],"host and guest see the same locked red deck");
  console.log("PASS: two-browser Firebase independently edited 10-unique decks with real new cards");
  await host.evaluate(()=>window.ShokokuNet.finish({result:"win",reason:"deck QA"}));
  await wait(async()=>(await meta())?.status==="finished","finish reaches server");
  await host.evaluate(()=>window.ShokokuNet.rematch());
  await wait(async()=>{
   const state=await meta();
   return state?.round===2&&state?.status==="lobby"&&
    await host.locator("#onlinePanel").isVisible()&&await guest.locator("#onlinePanel").isVisible();
  },"both clients back to round-two lobby");
  const after=await meta();
  assert.equal(after.deckLobby.host.ready,false);assert.equal(after.deckLobby.guest.ready,false);
  assert.equal(after.lockedDecks??null,null);
  await guest.locator("#netReady").click();await host.locator("#netReady").click();
  await wait(async()=>host.locator("#netStart").isEnabled(),"round two ready");
  await host.locator("#netStart").click();
  await wait(async()=>(await meta())?.lockedDecks?.round===2,"round two locked");
  const rematchDecks=(await meta()).lockedDecks;
  assert.ok(rematchDecks.hostDeckIds.includes("duelist"),"host deck persisted into rematch");
  assert.ok(rematchDecks.guestDeckIds.includes("ground_bomber"),"guest deck persisted into rematch");
  await wait(async()=>guest.evaluate(()=>window.__shokokuDeckQa?.activeDecks()?.[2]?.includes("ground_bomber")),
   "guest in-game rematch deck stays custom");
  assert.deepEqual(issues,[],"page errors");
  console.log("PASS: Firebase rematch retains 10 selections but requires fresh READY and fresh locked round");
 }finally{
  if(/^\d{5}$/.test(code)){
   const response=await fetch(BASE+"/"+code+".json",{method:"DELETE"}).catch(()=>null);
   console.log("QA TEMP ROOM CLEANUP",response?.status??"ERROR");
  }
  await guest?.close().catch(()=>{});await host?.close().catch(()=>{});
  await gb?.close().catch(()=>{});await hb?.close().catch(()=>{});
  if(server.listening)await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error("DECK E2E FAILED",e);process.exitCode=1});