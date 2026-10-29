// Natural real-time Firebase multiplayer match, not an accelerated / finished-by-QA simulation.
// Both players use different legal decks, natural energy regen and actual canvas taps.
// Test runs against a disposable room and deletes it in finally. No production rules change.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {chromium,webkit}=require("playwright");
const root=process.cwd(),BASE="https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1";
const ART=path.join(root,"qa-natural-full-match");
fs.mkdirSync(ART,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const poll=async(fn,label,timeout=20000)=>{
 const end=Date.now()+timeout;let last;
 while(Date.now()<end){
  try{const result=await fn();if(result)return result;}catch(e){last=e;}
  await sleep(170);
 }
 throw Error("Timeout: "+label+(last?" / "+last.message:""));
};
const server=http.createServer((req,res)=>{
 try{
  const route=decodeURIComponent(req.url.split("?")[0]);
  const p=path.resolve(root,"."+route);
  if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
   res.writeHead(404);res.end("missing");return;
  }
  res.writeHead(200,{"Content-Type":p.endsWith(".js")?
   "text/javascript; charset=utf-8":"text/html; charset=utf-8","Cache-Control":"no-store"});
  fs.createReadStream(p).pipe(res);
 }catch(e){res.writeHead(500);res.end("error");}
});
const stage=["duelist","crusher","ranger_engineer","interceptor","ground_bomber"];
async function deck(page,removed){
 await page.locator("#deckOpen").click();
 for(let i=0;i<stage.length;i++){
  await page.locator('#deckPool .deckTile[data-card-id="'+stage[i]+'"]').click();
  await page.locator('#deckSelected .deckTile[data-card-id="'+removed[i]+'"]').click();
 }
 await page.locator("#deckSave").click();
 const selected=await page.evaluate(()=>window.ShokokuDeck.current());
 assert.equal(new Set(selected).size,10);
 assert.ok(stage.every(c=>selected.includes(c)));
 return selected;
}
async function snap(page){
 return page.evaluate(()=>({
  s:window.__shokokuQa?.snapshot()||null,
  seq:window.__onlineSeq||0,
  deck:window.__shokokuDeckQa?.activeDecks(),
  frameError:window.__onlineFrameError||null
 }));
}
async function tryPlay(page,team,step,roundPlayed){
 const state=await snap(page);
 if(state.s?.phase!=="battle")return null;
 const hand=state.s.hand[team],energy=state.s.energy[team];
 if(!Array.isArray(hand))return null;
 const ids=[...hand].sort((a,b)=>{
  const x=(stage.includes(a)&&!roundPlayed.has(a)?3:0),
        y=(stage.includes(b)&&!roundPlayed.has(b)?3:0);
  return y-x;
 });
 // At low energy, the always-available infantry provides natural pressure.
 let id=ids.find(id=>roundPlayed.has(id)===false &&
  state.s.energy[team]>=2.01&&state.deck[team].includes(id) &&
  state.s.hand[team].includes(id) &&
  // original engine eligibility also checks remaining card charges
  true);
 // Prefer a newer card when it is actually affordable; don't guess costs.
 id=null;
 const choices=[...ids,"infantry"];
 for(const key of choices){
  const eligible=await page.evaluate(({side,card})=>
   window.__shokokuDeckQa.playable(side,card),{side:team,card:key});
  const el=page.locator('#cards .card[data-id="'+key+'"]');
  if(eligible&&await el.count()&&await el.isVisible()&&
    !(await el.getAttribute("class")).includes("unavailable")&&
    !(await el.getAttribute("class")).includes("depleted")){
   id=key;break;
  }
 }
 if(!id)return null;
 const worldX=team===1?183:1092,worldY=[190,425,275,205,440,325][step%6];
 const projected=await page.evaluate(({x,y})=>{
  const r=document.getElementById("fieldArea").getBoundingClientRect();
  const v=window.__shokokuQa.snapshot().view;
  const clientX=r.left+v.ox+v.s*x,clientY=r.top+v.oy+v.s*y;
  const hit=document.elementFromPoint(clientX,clientY);
  return {x:clientX,y:clientY,hit:hit?.id||null,
   visible:clientX>=r.left+1&&clientX<r.right-1&&
    clientY>=r.top+1&&clientY<r.bottom-1};
 },{x:worldX,y:worldY});
 if(!projected.visible||projected.hit!=="field")return {skipped:"camera",id,team};
 try{
  const card=page.locator('#cards .card[data-id="'+id+'"]');
  if(team===2)await card.tap({timeout:5500});
  else await card.click({timeout:5500});
  if(team===2)await page.touchscreen.tap(projected.x,projected.y);
  else await page.mouse.click(projected.x,projected.y);
  roundPlayed.add(id);
  return {id,team,energy:+energy.toFixed(2)};
 }catch(error){return {skipped:String(error).slice(0,100),team,id};}
}
(async()=>{
 let hostBrowser,guestBrowser,host,guest,code="",listening=false,failed=false;
 const errors=[],roundLog=[],beginTime=Date.now();
 try{
  await new Promise(r=>server.listen(8798,"127.0.0.1",r));listening=true;
  hostBrowser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  guestBrowser=await webkit.launch({headless:true});
  host=await hostBrowser.newPage({viewport:{width:1024,height:650}});
  guest=await guestBrowser.newPage({viewport:{width:1024,height:650},hasTouch:true});
  for(const [who,page] of [["host",host],["guest",guest]]){
   page.setDefaultTimeout(9500);
   page.on("pageerror",e=>errors.push(who+": "+e.message));
  }
  await Promise.all([
   host.goto("http://127.0.0.1:8798/online.html?qa=1"),
   guest.goto("http://127.0.0.1:8798/online-ipad.html?qa=1")
  ]);
  await poll(async()=>(await host.locator("#netStatus").innerText()).includes("接続OK"),
   "host RTDB connected");
  await poll(async()=>(await guest.locator("#netStatus").innerText()).includes("接続OK"),
   "guest RTDB connected");
  const hostDeck=await deck(host,["scout","engineer","sentinel","drone","tank"]);
  const guestDeck=await deck(guest,["scout","engineer","archer","sentinel","tank"]);
  assert.notDeepEqual(hostDeck,guestDeck);
  await host.locator("#netCreate").click();
  code=await poll(async()=>{
   const label=(await host.locator("#netRoom").innerText()).trim();
   return /^\d{5}$/.test(label)?label:false;
  },"room created");
  await guest.locator("#netJoinCode").fill(code);
  await guest.locator("#netJoin").click();
  await poll(async()=>await guest.locator("#netRoom").innerText()===code,"guest joined");
  await guest.locator("#netReady").click();await host.locator("#netReady").click();
  await poll(async()=>await host.locator("#netStart").isEnabled(),"both READY");
  await host.locator("#netStart").click();
  await poll(async()=>await host.evaluate(()=>window.__shokokuQa.snapshot().phase==="battle") &&
   await guest.evaluate(()=>window.__shokokuQa.snapshot().phase==="battle"),
   "both start natural 30Hz battle",40000);
  const meta=await (await fetch(BASE+"/"+code+"/meta.json")).json();
  assert.deepEqual(meta.lockedDecks.hostDeckIds,hostDeck);
  assert.deepEqual(meta.lockedDecks.guestDeckIds,guestDeck);
  console.log("NATURAL MATCH START",JSON.stringify({round:meta.round,
   decksDifferent:true,stageOnePresent:stage.every(c=>hostDeck.includes(c)&&guestDeck.includes(c))}));
  const played=[null,new Set(),new Set()],used=[null,[],[]];
  let prevSeq=0,prevElapsed=0,lastSeqAdvance=Date.now(),lastRealProgress=Date.now();
  let maxUnits=0,fortChanges=0,damagedSeen=false,combatDeaths=0;
  let ownersBefore="0,0,0",lastHealth=null,firstHostPhase="battle";
  let firstGuestPhase="battle",iterations=0,endedNaturally=false;
  const deadlineAt=Date.now()+365000; // natural match limit 300s + 65s for CI drift
  let nextActionAt=Date.now(),nextLogAt=Date.now(),nextShotAt=Date.now();
  while(Date.now()<deadlineAt){
   const [h,g]=await Promise.all([snap(host),snap(guest)]);
   assert.equal(h.frameError,null,"host Canvas error");
   assert.equal(g.frameError,null,"guest Canvas error");
   assert.equal(errors.length,0,"page exceptions");
   firstHostPhase=h.s.phase;firstGuestPhase=g.s.phase;
   if(h.s.elapsed>prevElapsed+.04){prevElapsed=h.s.elapsed;lastRealProgress=Date.now();}
   // Snapshots can legally lag; do not let a stuck guest pass silently.
   if(g.seq>prevSeq){prevSeq=g.seq;lastSeqAdvance=Date.now();}
   if(h.s.phase!=="result"){
    assert.ok(Date.now()-lastRealProgress<12000,
     "host stopped advancing the natural match clock");
    assert.ok(Date.now()-lastSeqAdvance<16000,
     "WebKit guest stopped applying Firebase match state");
   }
   if(h.s.phase==="result"){
    endedNaturally=true;
    await poll(async()=>await guest.evaluate(()=>window.__shokokuQa.snapshot().phase==="result"),
     "guest sees natural victory/time-up result",16000);
    break;
   }
   assert.equal(h.s.phase,"battle","host battle phase must remain live");
   assert.equal(g.s.phase,"battle","guest must stay in live battle");
   assert.ok(h.s.elapsed>=prevElapsed-.1);
   if(Date.now()>=nextActionAt){
    const side=iterations%2+1;
    const player=side===1?host:guest;
    const result=await tryPlay(player,side,iterations,played[side]);
    if(result&&result.id&&!result.skipped)used[side].push(result.id);
    iterations++;
    nextActionAt=Date.now()+2400;
   }
   if(Date.now()>=nextLogAt){
    const response=await fetch(BASE+"/"+code+"/state.json");
    assert.ok(response.ok,"Firebase state read available");
    const state=await response.json();
    const w=state?.world||{};
    const units=Array.isArray(w.units)?w.units:Object.values(w.units||{});
    const forts=Array.isArray(w.forts)?w.forts:Object.values(w.forts||{});
    const capitals=Array.isArray(w.capitals)?w.capitals:Object.values(w.capitals||{});
    maxUnits=Math.max(maxUnits,units.length);
    if(units.some(u=>u.hp<u.max))damagedSeen=true;
    const health=capitals.map(c=>c.hp);
    if(lastHealth&&health.some((hp,i)=>hp<lastHealth[i]))combatDeaths++;
    lastHealth=health;
    const owners=forts.map(f=>f.owner).join(",");
    if(owners!==ownersBefore){fortChanges++;ownersBefore=owners;}
    const evidence={elapsed:Math.round(h.s.elapsed),guestElapsed:Math.round(g.s.elapsed),
     units:units.length,maxUnits,owners,fortChanges,castleHp:health,damagedSeen,
     seq:state?.seq,guestSeq:g.seq,blue:used[1].length,red:used[2].length,
     msSinceGuestSync:Date.now()-lastSeqAdvance};
    roundLog.push(evidence);console.log("NATURAL MATCH CHECKPOINT",JSON.stringify(evidence));
    nextLogAt=Date.now()+15000;
   }
   if(Date.now()>=nextShotAt){
    const n=Math.floor(h.s.elapsed/60);
    await guest.screenshot({path:path.join(ART,"guest-at-"+n+"m.png"),
     animations:"disabled",timeout:12000});
    nextShotAt=Date.now()+60000;
   }
   await sleep(320);
  }
  assert.equal(endedNaturally,true,"natural match must reach a real result, not QA finish()");
  const endSnap=await snap(host),guestEnd=await snap(guest);
  const summary={hostPhase:firstHostPhase,guestPhase:firstGuestPhase,
   elapsed:+endSnap.s.elapsed.toFixed(2),maxUnits,fortChanges,
   damagedSeen,castleHitsObserved:combatDeaths,
   actionsBlue:used[1].length,actionsRed:used[2].length,
   unitsUsedBlue:[...new Set(used[1])],unitsUsedRed:[...new Set(used[2])],
   guestSeq:guestEnd.seq,wallMs:Date.now()-beginTime};
  assert.ok(used[1].length>=2&&used[2].length>=2,
   "both human seats must successfully attempt multiple card placements");
  assert.ok(guestEnd.seq>50,"real Firebase guest must have received many state packets");
  await host.screenshot({path:path.join(ART,"host-natural-result.png"),timeout:16000});
  await guest.screenshot({path:path.join(ART,"guest-natural-result.png"),timeout:16000});
  fs.writeFileSync(path.join(ART,"summary.json"),JSON.stringify({summary,roundLog},null,2));
  console.log("PASS NATURAL FULL MATCH",JSON.stringify(summary));
  // No synthetic winner / force finish anywhere in this script.
 }catch(e){failed=true;throw e}
 finally{
  if(/^\d{5}$/.test(code)){
   const res=await fetch(BASE+"/"+code+".json",{method:"DELETE"}).catch(()=>null);
   console.log("QA TEMP ROOM CLEANUP",res?.status??"ERROR");
  }
  if(failed)fs.writeFileSync(path.join(ART,"failed.note"),"See workflow log; disposable room cleanup attempted.");
  await guest?.close().catch(()=>{});await host?.close().catch(()=>{});
  await guestBrowser?.close().catch(()=>{});await hostBrowser?.close().catch(()=>{});
  if(listening)await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error("NATURAL FULL MATCH FAILED",e);process.exitCode=1});
