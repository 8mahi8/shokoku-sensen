// Stage-2 combat and Canvas QA in real Chromium/WebKit, no Firebase writes.
// Hooks are injected into an in-memory localhost-only HTML response.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {chromium,webkit}=require("playwright");
const root=process.cwd(),out=path.join(root,"qa-stage2-browser");
fs.mkdirSync(out,{recursive:true});
function stage2Setup(scene){
 if(!NET.isSolo||!["art","pierce","catapult","kamikaze","summoner","gravity"].includes(scene))
  throw Error("Stage 2 QA requires localhost solo mode");
 resetWorld();S.phase="prep";S.botThink=999999;S.forts=[];
 S.cam.x=640;S.cam.tx=640;S.cam.y=330;S.cam.ty=330;clampCamera();
 const place=(team,id)=>{
  const pool=window.ShokokuDeck.eligible(),deck=[id,...pool.filter(k=>k!==id).slice(0,9)];
  if(deck.length!==10)throw Error("invalid 10-card test deck");
  S.activeDecks[team]=deck;S.hand[team]=deck.slice(0,4);S.queue[team]=deck.slice(4);
  S.energy[team]=12;S.observedEnergy[team]=12;
  if(!playCard(team,id,team===1?170:1100,300))throw Error("real card rejected "+team+":"+id);
  return S.units[S.units.length-1];
 };
 const move=(u,x,y)=>{u.x=x;u.y=y;u.anchorX=x;u.anchorY=y;u.homeY=y;u.attack=0;return u;};
 // QA test targets are position-controlled, not claims about a legal full deck.
 const target=(key,team,x,y)=>{
  const d=CLASSES[key];
  const u={uid:++S.uid,key,team,x,y,anchorX:x,anchorY:y,homeY:y,
   hp:d.hp,max:d.hp,attack:999,attackAnim:0,attackAnimMax:MOTION.attack[key],
   flash:0,windup:0,hitAt:-100,spawnAt:-100,spawnDuration:.4,
   lock:null,walkPhase:0,walking:false,drift:0,facing:team===1?0:Math.PI};
  S.units.push(u);return u;
 };
 const q={scene};
 if(scene==="art"){
  const ids=["piercer","catapult","kamikaze","mech_summoner"];
  for(const team of [1,2])for(let i=0;i<ids.length;i++)
   move(place(team,ids[i]),500+i*70,team===1?225:390);
  for(const parent of S.units.filter(u=>u.key==="mech_summoner"))
   if(!spawnSmallMachine(parent))throw Error("small machine not spawned");
 }else if(scene==="pierce"){
  q.actor=move(place(1,"piercer"),500,300);
  q.foes=Array.from({length:11},(_,i)=>target("engineer",2,555+i*10,300));
  q.air=target("drone",2,605,300);
 }else if(scene==="catapult"){
  q.actor=move(place(1,"catapult"),500,300);
  q.primary=target("engineer",2,620,300);
  q.air=target("drone",2,650,300);
  q.ally=target("infantry",1,630,320);
 }else if(scene==="kamikaze"){
  q.actor=move(place(1,"kamikaze"),520,300);
  q.primary=target("infantry",2,556,300);
  q.other=target("engineer",2,580,300);
  q.air=target("drone",2,575,300);
 }else if(scene==="summoner"){
  q.actor=move(place(1,"mech_summoner"),500,300);
 }else{
  q.victim=target("infantry",2,500,300);
  q.ally=target("infantry",1,800,300);
  S.phase="battle";
  const deck=["gravity",...window.ShokokuDeck.eligible().filter(k=>k!=="gravity").slice(0,9)];
  S.activeDecks[1]=deck;S.hand[1]=deck.slice(0,4);S.queue[1]=deck.slice(4);
  S.energy[1]=12;S.observedEnergy[1]=12;
  if(!playCard(1,"gravity",400,300))throw Error("real gravity spell rejected");
 }
 S.phase="inspect";window.__stage2Actors=q;
 return {scene,units:S.units.map(u=>({key:u.key,team:u.team})),zones:S.spells.zones.length};
}
function stage2Run(){
 const q=window.__stage2Actors;if(!q)throw Error("stage2 setup missing");
 const scene=q.scene;let result;
 if(scene==="art"){
  result={keys:S.units.map(u=>u.key),teams:S.units.map(u=>u.team)};
 }else if(scene==="pierce"){
  const f=q.foes[0];fire(q.actor,{kind:"unit",ref:f,x:f.x,y:f.y});
  const lance=S.projectiles.at(-1);
  result={mainDamage:420-f.hp,secondary:q.foes.slice(1).map(u=>420-u.hp),
   airHp:q.air.hp,projectiles:S.projectiles.length,flightEndX:lance.tx};
  // Freeze the *visual only* lance mid-flight for screenshot evidence.
  // The real damage was already resolved at fire time.
  lance.t=lance.max*.35;
 }else if(scene==="catapult"){
  fire(q.actor,{kind:"unit",ref:q.primary,x:q.primary.x,y:q.primary.y});
  const shot=S.spells.incoming[0];
  const saved={x:shot?.x,y:shot?.y,kind:shot?.kind,projectiles:S.projectiles.length};
  q.primary.x=800;spellStep(1.09);
  const before={primary:q.primary.hp,air:q.air.hp};
  spellStep(.02);
  result={saved,before,after:{primary:q.primary.hp,air:q.air.hp,ally:q.ally.hp},
   remaining:S.spells.incoming.length};
 }else if(scene==="kamikaze"){
  unitStep(.1);
  const before={x:q.actor.x,health:q.actor.hp};
  for(let i=0;i<9&&q.actor.hp>0;i++)unitStep(.1);
  result={before,dead:q.actor.hp<=0,enemy:q.primary.hp,
   secondary:q.other.hp,airHp:q.air.hp};
 }else if(scene==="summoner"){
  let last=0;const counts=[];
  for(const t of [2,4,6,11,16,21,26,31]){
   S.clock+=t-last;unitStep(t-last);last=t;
   counts.push(S.units.filter(u=>u.key==="small_machine").length);
  }
  result={counts,spawned:q.actor.summonCount||0,
   robots:S.units.filter(u=>u.key==="small_machine").map(u=>({x:u.x,y:u.y,team:u.team}))};
 }else if(scene==="gravity"){
  const start=q.victim.x;
  unitStep(.1);const held=q.victim.x;
  spellStep(1);const pulled=q.victim.x;
  unitStep(.1);const center=q.victim.x;
  spellStep(1.5);unitStep(.1);
  result={start,held,pulled,center,released:q.victim.x,zones:S.spells.zones.length};
 }
 const painted={},original=window.KokokuArt.drawUnit,oldBolt=drawPiercerBolt;
 let pierceBoltDraws=0;
 drawPiercerBolt=function(...args){pierceBoltDraws++;return oldBolt(...args);};
 window.KokokuArt.drawUnit=function(...args){
  const u=args[1];if(u?.key)painted[u.team+":"+u.key]=(painted[u.team+":"+u.key]||0)+1;
  return original.apply(this,args);
 };
 try{draw();}finally{window.KokokuArt.drawUnit=original;drawPiercerBolt=oldBolt;}
 return {scene,result,painted,pierceBoltDraws,frameError:window.__onlineFrameError||null};
}
const htmlOriginal=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
const anchor="window.__shokokuQa={";
assert.equal(htmlOriginal.split(anchor).length,2,"one localhost QA insertion anchor");
const injected="stage2Setup:"+stage2Setup.toString()+",stage2Run:"+stage2Run.toString()+",";
const html=htmlOriginal.replace(anchor,anchor+injected);
const server=http.createServer((req,res)=>{
 const pathname=req.url.split("?")[0];
 const p=path.resolve(root,"."+decodeURIComponent(pathname));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("content-type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(pathname==="/online-ipad.html"){res.end(html);return;}
 fs.createReadStream(p).pipe(res);
});
const scenarios=["art","pierce","catapult","kamikaze","summoner","gravity"];
function verify(scene,o){
 assert.equal(o.frameError,null,scene+" frame error");
 assert.ok(Object.keys(o.painted).length>0,scene+" should draw actual unit artwork");
 const r=o.result;
 if(scene==="art"){
  for(const team of [1,2])for(const id of
   ["piercer","catapult","kamikaze","mech_summoner","small_machine"])
   assert.ok(o.painted[team+":"+id]>0,"missing art "+team+":"+id);
 }else if(scene==="pierce"){
  assert.equal(r.mainDamage,55);
  assert.deepEqual(r.secondary,[33,33,33,33,33,33,33,33,33,0]);
  assert.equal(r.airHp,120);assert.ok(r.projectiles>0);
  assert.ok(r.flightEndX>650,"piercing lance flies past the primary target");
  assert.ok(o.pierceBoltDraws>0,"piercing energy lance must be painted");
 }else if(scene==="catapult"){
  assert.equal(r.saved.kind,"catapult");assert.equal(r.saved.x,620);
  assert.equal(r.saved.y,300);assert.ok(r.saved.projectiles>0);
  assert.equal(r.before.primary,420);assert.equal(r.before.air,120);
  assert.equal(r.after.primary,420);assert.equal(r.after.air,5);
  assert.equal(r.after.ally,105);assert.equal(r.remaining,0);
 }else if(scene==="kamikaze"){
  assert.ok(r.before.health>0,"cannot explode before contact");
  assert.ok(r.before.x>520,"must move before touching enemy");
  assert.equal(r.dead,true);assert.ok(r.enemy<=0);
  assert.equal(r.secondary,120);assert.equal(r.airHp,120);
 }else if(scene==="summoner"){
  assert.deepEqual(r.counts,[1,2,3,4,5,6,7,8]);
  assert.equal(r.spawned,8);assert.equal(r.robots.length,8);
 }else if(scene==="gravity"){
  assert.equal(r.start,500);assert.equal(r.held,500);
  assert.equal(r.pulled,400);assert.equal(r.center,400);
  assert.ok(r.released<400,"movement must resume after gravity expires");
  assert.equal(r.zones,0);
 }
}
(async()=>{
 const browsers=[],rows=[];
 try{
  await new Promise(resolve=>server.listen(8792,"127.0.0.1",resolve));
  for(const [name,engine] of [["chromium",chromium],["webkit",webkit]]){
   const browser=await engine.launch({headless:true});browsers.push(browser);
   const context=await browser.newContext({viewport:{width:1194,height:834},
    hasTouch:true,deviceScaleFactor:1});
   const page=await context.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/www.gstatic.com/firebasejs/**",route=>route.abort());
   await page.goto("http://127.0.0.1:8792/online-ipad.html?qa=1",
    {waitUntil:"domcontentloaded",timeout:30000});
   await page.locator("#netSolo").waitFor({state:"visible",timeout:20000});
   await page.locator("#netSolo").click();
   await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep");
   await page.waitForFunction(()=>!!window.KokokuArt?.drawUnit);
   for(const scene of scenarios){
    const setup=await page.evaluate(s=>window.__shokokuQa.stage2Setup(s),scene);
    assert.equal(setup.scene,scene);
    await page.waitForTimeout(80);
    await page.screenshot({path:path.join(out,name+"-"+scene+"-before.png"),
     animations:"disabled",timeout:20000});
    const observation=await page.evaluate(()=>window.__shokokuQa.stage2Run());
    verify(scene,observation);
    assert.deepEqual(errors,[],name+":"+scene+" browser errors");
    await page.screenshot({path:path.join(out,name+"-"+scene+"-after.png"),
     animations:"disabled",timeout:20000});
    rows.push({browser:name,setup,observation});
    console.log("STAGE2_BROWSER_PASS "+name+" "+scene+" "+JSON.stringify(observation.result));
   }
   await context.close();await browser.close();browsers.pop();
  }
  assert.equal(rows.length,12);
  const chrome=rows.filter(r=>r.browser==="chromium"),safari=rows.filter(r=>r.browser==="webkit");
  assert.deepEqual(chrome.map(r=>r.observation.result),safari.map(r=>r.observation.result),
   "Chromium and WebKit Stage-2 calculations differ");
  fs.writeFileSync(path.join(out,"results.json"),JSON.stringify({
   rows,limitations:["Synthetic QA target placement and time advancement.",
    "Actual deployment of Stage-2 actors and actual combat/Canvas logic.",
    "No real Firebase 1v1, physical Safari iPad, or manual visual inspection."]},null,2));
  console.log("PASS Stage-2 12 Chromium/WebKit Canvas + combat scenarios");
 }finally{
  for(const b of browsers)try{await b.close()}catch(_){}
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
