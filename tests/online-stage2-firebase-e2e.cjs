// Stage-2 new-card real Firebase E2E, two browsers, disposable room.
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
// Localhost-only guest readback; no production HTML or game logic changes.
const guestSource=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
const qaAnchor="window.__shokokuQa={";
assert.equal(guestSource.split(qaAnchor).length,2,"single QA hook anchor");
const guestHtml=guestSource.replace(qaAnchor,
 qaAnchor+"stage2Zones:()=>S.spells.zones.map(z=>({...z})),"+
 "stage2Incoming:()=>S.spells.incoming.map(z=>({...z})),"+
 "stage2ProbeUnits:()=>S.units.filter(u=>u.key==='catapult'||u.key==='guardian'||u.key==='mech_summoner'||u.key==='small_machine').map(u=>({uid:u.uid,key:u.key,hp:u.hp,summonCount:u.summonCount||0})),");
const hostGameSource=fs.readFileSync(path.join(root,"online-game.js"),"utf8");
assert.equal(hostGameSource.split(qaAnchor).length,2,"host must have a single QA hook anchor");
// The staged fixture exists ONLY in this localhost test, never in shipped game files.
// Exercise production fire/unitStep/spellStep, then real RTDB snapshots for guest.
const hostGameHtml=hostGameSource.replace(qaAnchor,qaAnchor+`
 stage2WireFixture:()=>{
  if(!NET.isHost||S.phase!=="battle")return null;
  const make=(key,team,x,y)=>{
   const d=CLASSES[key];
   return {uid:++S.uid,key,team,x,y,anchorX:x,anchorY:y,homeY:y,
    hp:d.hp,max:d.hp,attack:0,facing:team===1?0:Math.PI,flash:0,
    attackAnim:0,attackAnimMax:MOTION.attack[key],windup:0,hitAt:-100,
    spawnAt:S.clock-2,spawnDuration:.5,lock:null,walkPhase:0,walking:false,drift:0};
  };
  const shooter=make("catapult",1,580,150);
  const target=make("guardian",2,760,150);
  const summoner=make("mech_summoner",1,115,570);
  S.units.push(shooter,target,summoner);
  // Real delayedArea attack creates a normal 1.1-second production incoming shot.
  fire(shooter,{kind:"unit",ref:target,x:target.x,y:target.y,r:CLASSES.guardian.r});
  NET.maybePublish(true);
  return {shooter:shooter.uid,target:target.uid,summoner:summoner.uid,
    hpBefore:target.hp,impact:{x:target.x,y:target.y},delay:CLASSES.catapult.impactDelay};
 },
 stage2WireStatus:(ids)=>{
  const find=id=>S.units.find(u=>u.uid===id);
  const target=find(ids.target),summoner=find(ids.summoner);
  return {phase:S.phase,elapsed:S.elapsed,targetHp:target?.hp,
   summonerAlive:!!summoner&&summoner.hp>0,
   spawned:summoner?.summonCount||0,children:S.units.filter(u=>u.key==="small_machine"&&u.team===1).length,
   incoming:S.spells.incoming.filter(s=>s.kind==="catapult").map(s=>({...s}))};
 },
 `);

const server=http.createServer((req,res)=>{
 const filepath=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!filepath.startsWith(root+path.sep)||!fs.existsSync(filepath)||!fs.statSync(filepath).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.writeHead(200,{"content-type":filepath.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8","cache-control":"no-store"});
 if(req.url.split("?")[0]==="/online-ipad.html"){res.end(guestHtml);return;}
 if(req.url.split("?")[0]==="/online-game.js"){res.end(hostGameHtml);return;}
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

  // After legal Stage-2 card exercise, stage a controlled shot+summoner on
  // the same LIVE disposable Firebase match. No shipping source is modified.
  // This isolates visual transport and 31s child schedule from battle RNG.
  const fixture=await host.evaluate(()=>window.__shokokuQa.stage2WireFixture());
  assert.ok(fixture&&fixture.delay===1.1,"real catapult must have a 1.1s flight");
  const readState=async()=>{
   const response=await fetch(BASE+"/"+code+"/state.json");
   if(!response.ok)throw Error("DB "+response.status);
   return (await response.json())?.world;
  };
  let publishedShot=null,receivedShot=null;
  await wait(async()=>{
   const w=await readState();
   const incoming=Array.isArray(w?.spells?.incoming)?w.spells.incoming:
    Object.values(w?.spells?.incoming||{});
   publishedShot=incoming.find(q=>q.kind==="catapult"&&q.x===fixture.impact.x&&q.y===fixture.impact.y);
   return publishedShot;
  },"catapult incoming published to real Firebase",2300);
  await wait(async()=>{
   receivedShot=await guest.evaluate(point=>window.__shokokuQa.stage2Incoming()
    .find(q=>q.kind==="catapult"&&q.x===point.x&&q.y===point.y),fixture.impact);
   return receivedShot;
  },"guest sees real catapult warning before impact",2500);
  assert.equal(receivedShot.damage,115);
  assert.equal(receivedShot.total,1.1);
  console.log("PASS: real Firebase catapult incoming guest delivery",
   JSON.stringify({impact:fixture.impact,guestRemaining:receivedShot.time}));
  // Production 30Hz combat must lower the same target's authoritative HP.
  await wait(async()=>{
   const local=await host.evaluate(ids=>window.__shokokuQa.stage2WireStatus(ids),fixture);
   return local.targetHp<fixture.hpBefore;
  },"catapult landing damages authoritative target",5500);
  await wait(async()=>{
   const remote=await guest.evaluate(ids=>window.__shokokuQa.stage2ProbeUnits()
    .find(u=>u.uid===ids.target),fixture);
   return remote?.hp<fixture.hpBefore;
  },"WebKit guest sees delayed catapult damage",5500);
  // Real-time summoning without time skipping. The eight timestamps are
  // 2/4/6/11/16/21/26/31s; observe count and remote parent while time moves.
  const childSamples=[];
  let previousCount=0;
  const started=Date.now();
  while(Date.now()-started<40500){
   const local=await host.evaluate(ids=>window.__shokokuQa.stage2WireStatus(ids),fixture);
   if(local.spawned>previousCount){
    childSamples.push({spawned:local.spawned,elapsed:local.elapsed,
      secondsSinceFixture:Math.round((Date.now()-started)/100)/10});
    previousCount=local.spawned;
   }
   assert.equal(local.phase,"battle","live QA round must continue");
   assert.ok(local.summonerAlive,"QA summoner must survive the full schedule");
   if(local.spawned===8)break;
   await sleep(450);
  }
  assert.equal(previousCount,8,"all eight scheduled children must spawn at real 30Hz");
  await wait(async()=>{
   const child=await guest.evaluate(id=>window.__shokokuQa.stage2ProbeUnits()
    .find(u=>u.uid===id),fixture.summoner);
   return child?.summonCount===8;
  },"WebKit guest receives all eight child-spawn updates",8000);
  const guestChildren=await guest.evaluate(()=>window.__shokokuQa.stage2ProbeUnits()
   .filter(u=>u.key==="small_machine").length);
  assert.ok(guestChildren>0,"guest must display surviving generated child units");
  console.log("PASS: real-time 31s mechanical summoner and WebKit guest snapshot",
   JSON.stringify({childSamples,guestChildren}));

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
  await gb?.close().catch(()=>{});await hb?.close().catch(()=>{});
  if(server.listening)await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error("DECK E2E FAILED",e);process.exitCode=1});