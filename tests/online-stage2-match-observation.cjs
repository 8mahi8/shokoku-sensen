// Stage-2 observed continuous real Firebase match: visual and lag evidence.
"use strict";
const {chromium,webkit}=require("playwright");
const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const assert=require("node:assert/strict");
const root=process.cwd(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ART=path.join(root,"qa-stage2-match-observation");
fs.mkdirSync(ART,{recursive:true});
const percentile=(a,p)=>{
 if(!a.length)return null;
 const sorted=a.slice().sort((x,y)=>x-y);
 return Math.round(sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)))]*10)/10;
};
const frameSummary=a=>{
 const rows=a.filter(x=>x.phase==="battle");
 const gaps=rows.map(x=>x.gapMs).filter(Number.isFinite);
 const draw=rows.map(x=>x.drawMs).filter(Number.isFinite);
 return {frames:rows.length,p50:percentile(gaps,.5),p95:percentile(gaps,.95),
  p99:percentile(gaps,.99),max:gaps.length?Math.round(Math.max(...gaps)):null,
  over100:gaps.filter(x=>x>100).length,over250:gaps.filter(x=>x>250).length,
  drawP95:percentile(draw,.95),unitsMax:Math.max(0,...rows.map(x=>x.units||0))};
};
const BASE="https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1";
const wait=async(fn,label,ms=30000)=>{
 const until=Date.now()+ms;let latest;
 while(Date.now()<until){
  try{const value=await fn();if(value)return value;}catch(e){latest=e;}
  await sleep(180);
 }
 throw Error("Timeout "+label+(latest?" / "+latest.message:""));
};
// Localhost-only guest readback; no production HTML or game logic changes.
const guestSource=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
const qaAnchor="window.__shokokuQa={";
assert.equal(guestSource.split(qaAnchor).length,2,"single QA hook anchor");
const guestHtml=guestSource.replace(qaAnchor,
 qaAnchor+"stage2Zones:()=>S.spells.zones.map(z=>({...z})),");
const server=http.createServer((req,res)=>{
 const filepath=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!filepath.startsWith(root+path.sep)||!fs.existsSync(filepath)||!fs.statSync(filepath).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.writeHead(200,{"content-type":filepath.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8","cache-control":"no-store"});
 if(req.url.split("?")[0]==="/online-ipad.html"){res.end(guestHtml);return;}
 fs.createReadStream(filepath).pipe(res);
});
(async()=>{
 let hb,gb,host,guest,code="",issues=[];
 try{
  await new Promise(r=>server.listen(8783,"127.0.0.1",r));
  hb=await chromium.launch({headless:true,args:["--no-sandbox"]});
  gb=await webkit.launch({headless:true});
  host=await hb.newPage({viewport:{width:1024,height:650}});
  const guestContext=await gb.newContext({viewport:{width:1024,height:650},
   hasTouch:true,deviceScaleFactor:1,recordVideo:{dir:ART,size:{width:1024,height:650}}});
  guest=await guestContext.newPage();
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
  // Both players draft all five Stage-2 new cards, but with different
  // remaining cards. Tap the editor exactly as a player would.
  const stageOne=["piercer","catapult","kamikaze","mech_summoner","gravity"];
  const swaps=[
   [host,["scout","engineer","sentinel","drone","tank"]],
   [guest,["scout","engineer","archer","sentinel","tank"]]
  ];
  for(const [page,removed] of swaps){
   await page.locator("#deckOpen").click();
   assert.equal(await page.locator("#deckSelected .deckTile").count(),10);
   assert.equal(await page.locator("#deckPool .deckTile").count(),
     await page.evaluate(()=>window.ShokokuDeck.eligible().length-10),
     "unselected pool must grow automatically when more cards are added");
   for(let i=0;i<stageOne.length;i++){
    await page.locator('#deckPool .deckTile[data-card-id="'+stageOne[i]+'"]').click();
    await page.locator('#deckSelected .deckTile[data-card-id="'+removed[i]+'"]').click();
   }
   assert.equal(await page.locator("#deckSelected .deckTile").count(),10);
   await page.locator("#deckSave").click();
   const saved=await page.evaluate(()=>window.ShokokuDeck.current());
   assert.equal(new Set(saved).size,10);
   assert.ok(stageOne.every(id=>saved.includes(id)));
   assert.ok(removed.every(id=>!saved.includes(id)));
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
  assert.ok(locked.lockedDecks.hostDeckIds.includes("piercer"));
  assert.ok(!locked.lockedDecks.hostDeckIds.includes("scout"));
  assert.ok(locked.lockedDecks.guestDeckIds.includes("gravity"));
  assert.ok(!locked.lockedDecks.guestDeckIds.includes("tank"));
  assert.equal(new Set(locked.lockedDecks.hostDeckIds).size,10);
  assert.equal(new Set(locked.lockedDecks.guestDeckIds).size,10);
  await wait(async()=>host.evaluate(()=>window.__shokokuDeckQa?.activeDecks()?.[1]?.includes("piercer")),
   "host in-game selected deck");
  await wait(async()=>guest.evaluate(()=>window.__shokokuDeckQa?.activeDecks()?.[2]?.includes("gravity")),
   "guest in-game selected deck");
  const hostDeck=await host.evaluate(()=>window.__shokokuDeckQa.activeDecks());
  const guestDeck=await guest.evaluate(()=>window.__shokokuDeckQa.activeDecks());
  assert.ok(hostDeck[1].includes("piercer")&&!hostDeck[1].includes("scout"));
  assert.ok(guestDeck[2].includes("gravity")&&!guestDeck[2].includes("tank"));
  assert.deepEqual(hostDeck[2],guestDeck[2],"host and guest see the same locked red deck");
  console.log("PASS: two-browser Firebase independently edited 10-unique decks with real new cards");
  // The original E2E only started a match and then called finish(). Play the
  // actual battle now: 10 real cards per side, including ALL five new troops,
  // with card selection and canvas placement (touch on the WebKit guest).
  // Only the QA energy top-up is synthetic; all spends, hand cycling, RTDB
  // commands, host validation, unit spawns and guest snapshots are real.
  await wait(async()=>{
   const a=await host.evaluate(()=>window.__shokokuQa?.snapshot().phase);
   const b=await guest.evaluate(()=>window.__shokokuQa?.snapshot().phase);
   return a==="battle"&&b==="battle";
  },"both players enter live battle",35000);
  const playedBySide={1:[],2:[]};
  for(const side of [1,2]){
   const player=side===1?host:guest,used=new Set();
   for(let action=0;action<10;action++){
    const hand=await player.evaluate(t=>window.__shokokuDeckQa.hand(t),side);
    const unused=hand.filter(id=>!used.has(id));
    assert.ok(unused.length>0,"an unused card must rotate into the hand");
    const id=unused.find(item=>stageOne.includes(item))||unused[0];
    assert.equal(await host.evaluate(t=>window.__shokokuQa.setEnergyForQa(t,12),side),true);
    if(side===2)await wait(async()=>
     (await guest.evaluate(()=>window.__shokokuQa.snapshot().energy[2]))>=11.9,
     "guest energy update",12000);
    const before=await host.evaluate(t=>window.__shokokuDeckQa.hand(t),side);
    if(side===2)await player.locator('#cards .card[data-id="'+id+'"]').tap();
    else await player.locator('#cards .card[data-id="'+id+'"]').click();
    assert.equal(await player.evaluate(()=>window.__shokokuQa.snapshot().selected),id,
     "card tap must select "+id);
    const worldX=side===1?175:1105,worldY=290+(action%5)*24;
    const projected=await player.evaluate(({x,y})=>{
     const state=window.__shokokuQa.snapshot(),v=state.view;
     const rect=document.getElementById("fieldArea").getBoundingClientRect();
     const px=rect.left+v.ox+v.s*x,py=rect.top+v.oy+v.s*y;
     const target=document.elementFromPoint(px,py);
     return {x:px,y:py,hit:target?.id||null,
      inside:px>=rect.left&&px<rect.right&&py>=rect.top&&py<rect.bottom};
    },{x:worldX,y:worldY});
    assert.ok(projected.inside&&projected.hit==="field",
     "placement coordinates must hit the real canvas: "+JSON.stringify(projected));
    if(side===2)await player.touchscreen.tap(projected.x,projected.y);
    else await player.mouse.click(projected.x,projected.y);
    await wait(async()=>{
     const next=await host.evaluate(t=>window.__shokokuDeckQa.hand(t),side);
     return JSON.stringify(next)!==JSON.stringify(before);
    },"host accepts "+side+":"+id,18000);
    if(stageOne.includes(id)){
     if(id==="gravity"){
      // Require the new spell to appear in host-published Firebase world.
      await wait(async()=>{
       const rsp=await fetch(BASE+"/"+code+"/state.json");
       if(!rsp.ok)return false;
       const world=(await rsp.json())?.world;
       return world?.spells?.zones?.some(z=>z.kind==="gravity"&&z.team===side);
      },"authoritative gravity spell published for "+side,9000);
      await wait(async()=>guest.evaluate(team=>
       window.__shokokuQa.stage2Zones().some(z=>z.kind==="gravity"&&z.team===team),side),
       "WebKit guest received gravity zone from host "+side,9000);
     }else{
      await wait(async()=>(await host.evaluate(({team,key})=>
       window.__shokokuQa.snapshot().units.some(u=>u.team===team&&u.key===key),
       {team:side,key:id})), "real "+id+" spawned for "+side,7000);
     }
     playedBySide[side].push(id);
    }
    // A guest order is not successful just because sendCommand returned true:
    // wait for the authoritative hand to appear on the guest as well.
    await wait(async()=>{
     const local=await guest.evaluate(t=>window.__shokokuDeckQa.hand(t),side);
     const authoritative=await host.evaluate(t=>window.__shokokuDeckQa.hand(t),side);
     return JSON.stringify(local)===JSON.stringify(authoritative);
    },"guest receives authoritative hand for "+side+":"+id,14000);
    used.add(id);
   }
   assert.deepEqual(new Set(playedBySide[side]),new Set(stageOne),
    "all four new units plus gravity must have been legally used by side "+side);
  }
  await wait(async()=>{
   const h=await host.evaluate(()=>window.__shokokuQa.snapshot());
   const g=await guest.evaluate(()=>window.__shokokuQa.snapshot());
   return h.phase==="battle"&&g.phase==="battle"&&
    g.elapsed>=1&&h.units.some(u=>u.team===1)&&h.units.some(u=>u.team===2)&&
    g.units.some(u=>u.team===1)&&g.units.some(u=>u.team===2);
  },"real two-sided battle arrives at WebKit guest",20000);
  // A Stage-2 deck can have no capturers and slow long-range troops.
  // Do not incorrectly require damage/capture inside a fixed short window.
  let battleEvidence=null;
  await wait(async()=>{
   const rsp=await fetch(BASE+"/"+code+"/state.json");
   if(!rsp.ok)return false;
   const world=(await rsp.json())?.world;
   if(!world)return false;
   const units=Array.isArray(world.units)?world.units:Object.values(world.units||{});
   const teams=[1,2].map(team=>units.filter(u=>u?.team===team));
   if(!teams.every(group=>group.some(u=>
     ["piercer","catapult","kamikaze","mech_summoner","small_machine"].includes(u.key))))return false;
   battleEvidence={elapsed:world.elapsed,units:units.length};
   return true;
  },"Firebase holds real Stage-2 units from both players",20000);
  console.log("PASS: authoritative Stage-2 RTDB",JSON.stringify(battleEvidence));
  // Observe real host-authoritative 30Hz play for 36 seconds without
  // speeding up time or scripting combat; this is a stress match because
  // QA energy was topped up during the initial 20 legal card placements.
  await Promise.all([
   host.evaluate(()=>window.__shokokuQa.setCamera(640,330)),
   guest.evaluate(()=>window.__shokokuQa.setCamera(640,330))
  ]);
  const observations=[];
  const deadline=Date.now()+36000;
  let hostClock=0,guestSeq=0,hostClockAt=Date.now(),guestSeqAt=Date.now();
  while(Date.now()<deadline){
   const [h,g]=await Promise.all([host,guest].map(page=>page.evaluate(()=>({
    s:window.__shokokuQa.snapshot(),seq:window.__onlineSeq||0,
    frames:window.__shokokuQa.frameBench(),net:window.__shokokuNetQa?.stats?.()||null,
    err:window.__onlineFrameError||null
   }))));
   assert.equal(h.err,null,"host Canvas exception");
   assert.equal(g.err,null,"guest Canvas exception");
   assert.equal(h.s.phase,"battle");assert.equal(g.s.phase,"battle");
   if(h.s.elapsed>hostClock+.01){hostClock=h.s.elapsed;hostClockAt=Date.now();}
   if(g.seq>guestSeq){guestSeq=g.seq;guestSeqAt=Date.now();}
   assert.ok(Date.now()-hostClockAt<9000,"host match-clock stalled");
   assert.ok(Date.now()-guestSeqAt<9000,"guest state delivery stalled");
   const hIds=new Map(h.s.units.map(u=>[u.uid,u]));
   const shared=g.s.units.filter(u=>hIds.has(u.uid));
   const offsets=shared.map(u=>Math.hypot(u.x-hIds.get(u.uid).x,u.y-hIds.get(u.uid).y));
   const index=observations.length;
   const sample={index,hostElapsed:+h.s.elapsed.toFixed(2),guestElapsed:+g.s.elapsed.toFixed(2),
    guestSeq:g.seq,hostUnits:h.s.units.length,guestUnits:g.s.units.length,
    sharedUnits:shared.length,offsetP95:percentile(offsets,.95),
    hostFrames:frameSummary(h.frames),guestFrames:frameSummary(g.frames),guestNet:g.net};
   observations.push(sample);
   console.log("STAGE2_MATCH_SAMPLE",JSON.stringify(sample));
   if(index%4===0){
    await Promise.all([
     host.screenshot({path:path.join(ART,"host-"+index+".png"),timeout:15000}),
     guest.screenshot({path:path.join(ART,"guest-"+index+".png"),timeout:15000})
    ]);
   }
   await sleep(1500);
  }
  const summary={
   count:observations.length,
   host:observations.at(-1).hostFrames,guest:observations.at(-1).guestFrames,
   hostElapsedDelta:+(observations.at(-1).hostElapsed-observations[0].hostElapsed).toFixed(2),
   guestElapsedDelta:+(observations.at(-1).guestElapsed-observations[0].guestElapsed).toFixed(2),
   guestSeqAdvance:observations.at(-1).guestSeq-observations[0].guestSeq,
   offsetP95Max:Math.max(0,...observations.map(x=>x.offsetP95||0))
  };
  assert.ok(observations.length>=10);
  assert.ok(summary.guestSeqAdvance>=20,"guest real RTDB snapshots must advance");
  assert.ok(summary.hostElapsedDelta>=15&&summary.guestElapsedDelta>=15);
  fs.writeFileSync(path.join(ART,"metrics.json"),JSON.stringify({summary,observations},null,2));
  console.log("STAGE2_MATCH_OBSERVATION_SUMMARY",JSON.stringify(summary));
  assert.deepEqual(issues,[],"no page errors during real live-card battle");
  console.log("PASS: 20 Stage-2 deck actions, real guest gravity sync and rematch");
  // End via an explicit QA result so the test need not wait five real minutes.
  // This tests finishing/rematch protocol, NOT natural victory balance.
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
  assert.ok(rematchDecks.hostDeckIds.includes("piercer"),"host deck persisted into rematch");
  assert.ok(rematchDecks.guestDeckIds.includes("gravity"),"guest deck persisted into rematch");
  await wait(async()=>guest.evaluate(()=>window.__shokokuDeckQa?.activeDecks()?.[2]?.includes("gravity")),
   "guest in-game rematch deck stays custom");
  assert.deepEqual(issues,[],"page errors");
  console.log("PASS: Firebase rematch retains 10 selections but requires fresh READY and fresh locked round");
 }finally{
  if(/^\d{5}$/.test(code)){
   const response=await fetch(BASE+"/"+code+".json",{method:"DELETE"}).catch(()=>null);
   console.log("QA TEMP ROOM CLEANUP",response?.status??"ERROR");
  }
  await guest?.close().catch(()=>{});await host?.close().catch(()=>{});
  await guest?.context()?.close().catch(()=>{});
  await gb?.close().catch(()=>{});await hb?.close().catch(()=>{});
  if(server.listening)await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error("DECK E2E FAILED",e);process.exitCode=1});