// Real Firebase + two-browser Stage-1 unit AI transition QA.
// Deterministic QA fixture injected ONLY into localhost-served host module.
// Unit targeting, 30 Hz combat, RTDB publish, guest apply and Canvas are real.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {chromium,webkit}=require("playwright");
const root=process.cwd(),BASE="https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1";
const out=path.join(root,"qa-unit-ai-firebase");fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const poll=async(fn,label,timeout=14000)=>{
 const end=Date.now()+timeout;let latest;
 while(Date.now()<end){
  try{const v=await fn();if(v)return v;}catch(e){latest=e;}
  await sleep(140);
 }
 throw Error("Timeout "+label+(latest?" / "+latest.message:""));
};
// These functions are serialized into an object living INSIDE online-game.js's
// private closure. They cannot be called from public Google Sites or CDN HTML.
function aiFirebaseSetup(id){
 if(!NET.isHost||NET.isSolo||S.phase!=="battle")throw Error("not live host battle");
 const supported=["rangerCapture","redRangerCapture","guardReturn","guardianRetarget","bomberSplash"];
 if(!supported.includes(id))throw Error("invalid fixture");
 S.units=[];S.effects=[];S.projectiles=[];S.deaths=[];S.uid=0;S.tickCount=0;
 S.spells={incoming:[],zones:[]};S.botThink=999999;S.botPrepDone=true;
 S.forts=[{x:410,y:190,hp:12,owner:0},
  {x:633,y:444,hp:12,owner:0},{x:867,y:205,hp:12,owner:0}];
 const make=(key,team,x,y,opts={})=>{
  const d=CLASSES[key],u={uid:++S.uid,key,team,x,y,anchorX:x,anchorY:y,
   homeY:y,hp:d.hp,max:d.hp,attack:opts.hold?1000000:0,
   attackAnim:0,attackAnimMax:MOTION.attack[key],
   flash:0,windup:0,hitAt:-100,spawnAt:-100,spawnDuration:.4,
   lock:null,walkPhase:0,walking:false,drift:0,facing:team===1?0:Math.PI};
  S.units.push(u);return u;
 };
 let subject,enemy,other,air,fort;
 if(id==="rangerCapture"){
  fort=S.forts[0];fort.hp=1;
  subject=make("ranger_engineer",1,390,190);
  enemy=make("infantry",2,415,190,{hold:true});
 }else if(id==="redRangerCapture"){
  fort=S.forts[2];fort.hp=1;
  subject=make("ranger_engineer",2,890,205);
  enemy=make("infantry",1,885,205,{hold:true});
 }else if(id==="guardReturn"){
  subject=make("interceptor",1,300,320);
  enemy=make("infantry",2,510,320,{hold:true});
 }else if(id==="guardianRetarget"){
  subject=make("guardian",1,400,320);
  enemy=make("tank",2,455,320,{hold:true});
  other=make("infantry",2,430,320,{hold:true});
 }else if(id==="bomberSplash"){
  subject=make("ground_bomber",1,300,320);
  enemy=make("infantry",2,385,320,{hold:true});
  other=make("infantry",2,410,320,{hold:true});
  air=make("drone",2,325,320,{hold:true});
 }
 window.__aiLiveFixture={id,subject:subject.uid,enemy:enemy.uid,
  other:other?.uid??null,air:air?.uid??null,fortIndex:fort?S.forts.indexOf(fort):null};
 NET.maybePublish(true);
 return window.__shokokuQa.aiFirebaseState();
}
function aiFirebaseState(){
 const f=window.__aiLiveFixture;if(!f)return null;
 const pick=uid=>uid===null?null:S.units.find(u=>u.uid===uid)||null;
 const subject=pick(f.subject),enemy=pick(f.enemy),other=pick(f.other),air=pick(f.air);
 const target=subject?selectPriorityTargets(subject):{attack:null,approach:null};
 const label=t=>!t?null:t.kind==="unit"?"unit:"+t.ref.key:t.kind;
 const compact=u=>u?{uid:u.uid,key:u.key,x:u.x,y:u.y,hp:u.hp}:null;
 const fort=f.fortIndex===null?null:S.forts[f.fortIndex];
 return {fixture:f.id,phase:S.phase,elapsed:S.elapsed,
  subject:compact(subject),enemy:compact(enemy),other:compact(other),
  air:compact(air),fort:fort?{x:fort.x,y:fort.y,hp:fort.hp,owner:fort.owner}:null,
  attack:label(target.attack),approach:label(target.approach),
  units:S.units.length};
}
function aiFirebaseChange(action){
 const f=window.__aiLiveFixture;if(!f||S.phase!=="battle")throw Error("no live fixture");
 const enemy=S.units.find(u=>u.uid===f.enemy);
 if(action==="leaveAnchor"&&f.id==="guardReturn"&&enemy)enemy.x=650;
 else if(action==="removeLarge"&&f.id==="guardianRetarget"&&enemy)enemy.hp=0;
 else throw Error("invalid fixture transition");
 NET.maybePublish(true);
 return window.__shokokuQa.aiFirebaseState();
}
function aiFirebaseGuestState(){
 return {phase:S.phase,elapsed:S.elapsed,
  units:S.units.map(u=>({uid:u.uid,key:u.key,team:u.team,hp:u.hp,x:u.x,y:u.y})),
  forts:S.forts.map(f=>({x:f.x,y:f.y,owner:f.owner,hp:f.hp})),
  frameError:window.__onlineFrameError||null};
}
const anchor="window.__shokokuQa={";
const moduleFile=fs.readFileSync(path.join(root,"online-game.js"),"utf8");
assert.equal(moduleFile.split(anchor).length,2,"unique QA insertion anchor");
const hook="\n aiFirebaseSetup:("+aiFirebaseSetup.toString()+"),"+
 "\n aiFirebaseState:("+aiFirebaseState.toString()+"),"+
 "\n aiFirebaseChange:("+aiFirebaseChange.toString()+"),";
const modifiedModule=moduleFile.replace(anchor,anchor+hook);
const guestHtml=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
assert.equal(guestHtml.split(anchor).length,2,"unique guest QA insertion anchor");
const modifiedGuest=guestHtml.replace(anchor,anchor+"\n aiFirebaseGuestState:("+aiFirebaseGuestState.toString()+"),");
const server=http.createServer((req,res)=>{
 try{
  const route=decodeURIComponent(req.url.split("?")[0]);
  const file=path.resolve(root,"."+route);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||
   !fs.statSync(file).isFile()){res.writeHead(404);res.end("missing");return;}
  res.writeHead(200,{"Content-Type":file.endsWith(".js")?
   "text/javascript; charset=utf-8":"text/html; charset=utf-8",
   "Cache-Control":"no-store"});
  if(route==="/online-game.js"){res.end(modifiedModule);return;}
  if(route==="/online-ipad.html"){res.end(modifiedGuest);return;}
  fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end("error");}
});
async function prepareDeck(page){
 const chosen=["duelist","crusher","ranger_engineer","interceptor","ground_bomber"];
 const removed=["scout","engineer","sentinel","drone","tank"];
 await page.locator("#deckOpen").click();
 for(let i=0;i<chosen.length;i++){
  await page.locator('#deckPool .deckTile[data-card-id="'+chosen[i]+'"]').click();
  await page.locator('#deckSelected .deckTile[data-card-id="'+removed[i]+'"]').click();
 }
 await page.locator("#deckSave").click();
 assert.equal(await page.evaluate(()=>window.ShokokuDeck.current().length),10);
}
(async()=>{
 let hostBrowser,guestBrowser,host,guest,roomCode="",started=false;
 const errors=[],results=[],began=Date.now();
 try{
  await new Promise(ok=>server.listen(8797,"127.0.0.1",ok));
  started=true;
  hostBrowser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  guestBrowser=await webkit.launch({headless:true});
  host=await hostBrowser.newPage({viewport:{width:1024,height:650}});
  guest=await guestBrowser.newPage({viewport:{width:1024,height:650},hasTouch:true});
  for(const [name,page] of [["host",host],["guest",guest]])
   page.on("pageerror",e=>errors.push(name+": "+e.message));
  await Promise.all([
   host.goto("http://127.0.0.1:8797/online.html?qa=1"),
   guest.goto("http://127.0.0.1:8797/online-ipad.html?qa=1")
  ]);
  for(const page of [host,guest])
   await poll(async()=>(await page.locator("#netStatus").innerText()).includes("接続OK"),
    "Firebase connection",26000);
  await prepareDeck(host);await prepareDeck(guest);
  await host.locator("#netCreate").click();
  roomCode=await poll(async()=>{
   const value=(await host.locator("#netRoom").innerText()).trim();
   return /^\d{5}$/.test(value)?value:false;
  },"create disposable room");
  await guest.locator("#netJoinCode").fill(roomCode);
  await guest.locator("#netJoin").click();
  await poll(async()=>await guest.locator("#netRoom").innerText()===roomCode,"join room");
  await guest.locator("#netReady").click();await host.locator("#netReady").click();
  await poll(async()=>host.locator("#netStart").isEnabled(),"both seats ready");
  await host.locator("#netStart").click();
  await poll(async()=>{
   const a=await host.evaluate(()=>window.__shokokuQa?.snapshot().phase);
   const b=await guest.evaluate(()=>window.__shokokuQa?.snapshot().phase);
   return a==="battle"&&b==="battle";
  },"both clients in live battle",35000);
  for(const id of ["rangerCapture","redRangerCapture","guardReturn","guardianRetarget","bomberSplash"]){
   const priorSeq=await guest.evaluate(()=>window.__onlineSeq||0);
   const initial=await host.evaluate(name=>window.__shokokuQa.aiFirebaseSetup(name),id);
   assert.equal(initial.fixture,id);
   const expectedSide=id==="redRangerCapture"?2:1;
   await poll(async()=>{
    const g=await guest.evaluate(()=>window.__shokokuQa?.snapshot());
    return (await guest.evaluate(()=>window.__onlineSeq||0))>priorSeq&&
     g.units.some(u=>u.key===initial.subject.key&&u.team===expectedSide);
   },"guest receives fresh "+id+" fixture",18000);
   let verified;
   if(id==="rangerCapture"||id==="redRangerCapture"){
    assert.equal(initial.attack,"fort","fort priority 3 must beat enemy priority 1");
    verified=await poll(async()=>{
     const v=await host.evaluate(()=>window.__shokokuQa.aiFirebaseState());
     return v.fort.owner===expectedSide&&v.enemy?.hp<105?v:false;
    },"fort capture followed by retarget to enemy "+id,12000);
    assert.equal(verified.fort.owner,expectedSide);
    assert.ok(verified.enemy.hp<105);
    assert.equal(verified.subject.key,"ranger_engineer");
   }else if(id==="guardReturn"){
    assert.equal(initial.approach,"unit:infantry");
    const chased=await poll(async()=>{
     const v=await host.evaluate(()=>window.__shokokuQa.aiFirebaseState());
     return v.subject.x>initial.subject.x+25?v:false;
    },"guard chases target inside spawn circle",6500);
    await host.evaluate(()=>window.__shokokuQa.aiFirebaseChange("leaveAnchor"));
    verified=await poll(async()=>{
     const v=await host.evaluate(()=>window.__shokokuQa.aiFirebaseState());
     return v.subject.x<=initial.subject.x+8&&v.approach===null?v:false;
    },"guard stops chasing and returns to anchor",6500);
    assert.ok(verified.subject.x<chased.subject.x-12, "the guard genuinely returned after pursuit");
   }else if(id==="guardianRetarget"){
    assert.equal(initial.attack,"unit:tank",
     "guardian must prefer large tank despite nearer infantry");
    const hit=await poll(async()=>{
     const v=await host.evaluate(()=>window.__shokokuQa.aiFirebaseState());
     return v.enemy?.hp<1100?v:false;
    },"guardian first hit lands on large enemy",4500);
    assert.ok(hit.enemy.hp<1100);
    await host.evaluate(()=>window.__shokokuQa.aiFirebaseChange("removeLarge"));
    verified=await poll(async()=>{
     const v=await host.evaluate(()=>window.__shokokuQa.aiFirebaseState());
     return v.attack==="unit:infantry"&&v.other?.hp<105?v:false;
    },"guardian changes target after large enemy removed",4500);
   }else if(id==="bomberSplash"){
    assert.equal(initial.attack,"unit:infantry");
    verified=await poll(async()=>{
     const v=await host.evaluate(()=>window.__shokokuQa.aiFirebaseState());
     return v.enemy?.hp<105&&v.other?.hp<105?v:false;
    },"flying bomber ground splash",4500);
    assert.equal(verified.air.hp,120,"airborne bystander must not take splash");
    assert.ok(verified.other.hp<105);
   }
   await poll(async()=>{
    const h=await host.evaluate(()=>window.__shokokuQa.snapshot());
    const g=await guest.evaluate(()=>window.__shokokuQa.snapshot());
    if(g.phase!=="battle")return false;
    const matching=g.units.some(u=>u.uid===h.units.find(w=>w.key===initial.subject.key&&w.team===expectedSide)?.uid);
    return matching&&Math.abs(g.elapsed-h.elapsed)<3;
   },"guest sees AI result "+id,16000);
   await poll(async()=>{
    const h=await host.evaluate(()=>window.__shokokuQa.aiFirebaseState());
    const g=await guest.evaluate(()=>window.__shokokuQa.aiFirebaseGuestState());
    if(g.phase!=="battle"||g.frameError||!h.subject)return false;
    const unit=g.units.find(u=>u.uid===h.subject.uid);
    if(!unit||unit.key!==h.subject.key||Math.abs(unit.x-h.subject.x)>25)return false;
    if(h.fort){
     const gf=g.forts.find(v=>v.x===h.fort.x&&v.y===h.fort.y);
     if(!gf||gf.owner!==h.fort.owner)return false;
    }
    if(id==="rangerCapture"||id==="redRangerCapture"){
     if(!(g.units.find(u=>u.uid===initial.enemy.uid)?.hp<105))return false;
    }
    if(id==="guardReturn"){
     if(!(g.units.find(u=>u.uid===initial.enemy.uid)?.x>610))return false;
    }
    if(id==="guardianRetarget"){
     if(!(g.units.find(u=>u.uid===initial.other.uid)?.hp<105))return false;
    }
    if(id==="bomberSplash"){
     if(!(g.units.find(u=>u.uid===initial.enemy.uid)?.hp<105))return false;
     if(!(g.units.find(u=>u.uid===initial.other.uid)?.hp<105))return false;
     if(g.units.find(u=>u.uid===initial.air.uid)?.hp!==120)return false;
    }
    return true;
   },"WebKit guest receives actual AI HP / fort state "+id,12000);
   console.log("PASS GUEST AI WORLD",id);
   await guest.evaluate(({x,y})=>window.__shokokuQa.setCamera(x,y),
    {x:initial.subject.x,y:initial.subject.y});
   await host.evaluate(({x,y})=>window.__shokokuQa.setCamera(x,y),
    {x:initial.subject.x,y:initial.subject.y});
   await sleep(420);
   await guest.screenshot({path:path.join(out,"webkit-guest-"+id+".png"),timeout:16000});
   await host.screenshot({path:path.join(out,"chromium-host-"+id+".png"),timeout:16000});
   results.push({scenario:id,initial,verified});
   console.log("PASS LIVE AI",JSON.stringify({id,initialTarget:initial.attack||initial.approach,
    finalTarget:verified.attack||verified.approach,final:verified}));
  }
  assert.deepEqual(errors,[],"no Chromium/WebKit page exceptions");
  console.log("PASS: five deterministic AI transitions run on the true host tick and reach WebKit guest via live RTDB",
   JSON.stringify({scenes:results.length,durationMs:Date.now()-began}));
 }finally{
  if(/^\d{5}$/.test(roomCode)){
   const r=await fetch(BASE+"/"+roomCode+".json",{method:"DELETE"}).catch(()=>null);
   console.log("QA TEMP ROOM CLEANUP",r?.status??"ERROR");
  }
  await guest?.close().catch(()=>{});
  await host?.close().catch(()=>{});
  await guestBrowser?.close().catch(()=>{});
  await hostBrowser?.close().catch(()=>{});
  if(started)await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error("LIVE AI E2E FAILED",e);process.exitCode=1});
