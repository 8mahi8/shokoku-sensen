"use strict";
// REAL guest snapshot receive/apply/render in WebKit and Chromium.
// Test server injects local QA hooks; no live Firebase rooms or secrets.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium,webkit}=require("playwright");
const root=process.cwd(),out="qa-guest-v15";fs.mkdirSync(out,{recursive:true});
const g=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 n=fs.readFileSync(path.join(root,"online-net.js"),"utf8");
const qaKey=" window.__shokokuQa={\n";
assert.equal(g.split(qaKey).length,2);
const extra=[
 ' airData:()=>({droneHp:CLASSES.drone.hp,fireDamage:SPELLS.barrage.damage,hitAir:Object.fromEntries(Object.entries(CLASSES).map(([id,c])=>[id,!!c.hitAir]))}),',
 ' fireOnDrone:()=>{',
 '  window.__shokokuQa.setBotScenario({hand:["barrage","archer","scout","engineer"],energy:12,enemies:[{key:"drone",x:850,y:205}],allies:[]});',
 '  S.spells.incoming.push({team:2,x:850,y:205,r:SPELLS.barrage.radius,time:1/30});',
 '  tick(1/30);return {alive:S.units.filter(u=>u.team===1&&u.hp>0).length};',
 ' },',
 ' armTest:(id)=>{',
 '  window.__shokokuQa.setBotScenario({hand:["barrage","archer","scout","engineer"],energy:12,enemies:[{key:"drone",x:845,y:205}],allies:[{key:id,x:911,y:205}]});',
 '  S.botThink=9999;S.seconds=150;',
 '  const drone=S.units.find(u=>u.key==="drone"),first=drone.hp;',
 '  for(let i=0;i<170&&drone.hp>0;i++)tick(1/30);',
 '  return {id,first,after:drone.hp,attacked:drone.hp<first};',
 ' },',
 ' remoteWorld:()=>JSON.parse(JSON.stringify({',
 '  phase:S.phase,prep:S.prep,seconds:S.seconds,elapsed:S.elapsed,clock:S.clock,energy:S.energy,left:S.left,hand:S.hand,queue:S.queue,',
 '  units:S.units,forts:S.forts,capitals:S.capitals,spells:S.spells,effects:S.effects,projectiles:S.projectiles,deaths:S.deaths,uid:S.uid,speed:S.speed',
 ' },(k,v)=>v===Infinity?1000000000:v)),'
].join("\n");
const patchedGame=g.replace(qaKey,qaKey+extra+"\n");
const setup="function setupRoom(code,isHost){";
assert.equal(n.split(setup).length,2);
const netExtra=[
 'window.__qaGuestNet={',
 ' enter:()=>{remoteEpoch++;pendingRemote=null;remoteScheduled=false;room={};host=false;solo=false;guestBot=false;team=2;phase="playing";meta={round:1,status:"playing"};lastRemoteSeq=0;window.__onlineSeq=0;return true;},',
 ' send:packet=>receiveGuestWorld(packet),',
 ' stats:()=>({received:lastRemoteSeq,applied:window.__onlineSeq||0,pending:pendingRemote?.seq??null,scheduled:remoteScheduled})',
 '};'
].join("\n");
const patchedNet=n.replace(setup,netExtra+"\n"+setup);
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p===path.join(root,"online-game.js")){res.end(patchedGame);return;}
 if(p===path.join(root,"online-net.js")){res.end(patchedNet);return;}
 fs.createReadStream(p).pipe(res);
});
async function measure(engineName,engine){
 const browser=await engine.launch({headless:true});
 try{
  const rows=[];
  for(const entry of [
   {name:"tablet",viewport:{width:1194,height:834},hasTouch:true,deviceScaleFactor:2},
   {name:"compact",viewport:{width:900,height:520},hasTouch:true,deviceScaleFactor:2}
  ]){
   const context=await browser.newContext(entry),page=await context.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
   await page.goto("http://127.0.0.1:8916/online.html?qa=1",{waitUntil:"domcontentloaded"});
   await page.locator("#netSolo").click();
   await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
   const balance=await page.evaluate(()=>{
    const q=window.__shokokuQa;
    return {stats:q.airData(),fire:q.fireOnDrone(),
     ranged:["archer","suppress","tank","drone"].map(x=>q.armTest(x)),
     melee:["infantry","sentinel"].map(x=>q.armTest(x))};
   });
   assert.ok(balance.stats.droneHp<=balance.stats.fireDamage);
   assert.equal(balance.fire.alive,0);
   assert.ok(balance.ranged.every(x=>x.attacked),JSON.stringify(balance.ranged));
   assert.ok(balance.melee.every(x=>!x.attacked),JSON.stringify(balance.melee));
   const world=await page.evaluate(()=>{
    const q=window.__shokokuQa;
    if(!q.seedMassBattle())throw Error("mass battle unavailable");
    return q.remoteWorld();
   });
   assert.equal(world.units.length,130);
   const burst=await page.evaluate(world=>{
    const q=window.__qaGuestNet;q.enter();
    for(let i=1;i<=120;i++)q.send({seq:i,round:1,world});
    return q.stats();
   },world);
   assert.equal(burst.received,120);
   await page.waitForFunction(()=>window.__qaGuestNet.stats().applied===120);
   const initial=await page.evaluate(()=>({
    dpr:window.__shokokuQa.snapshot().view.dpr,
    phase:window.__shokokuQa.snapshot().phase,
    stats:window.__qaGuestNet.stats()
   }));
   assert.equal(initial.phase,"battle");
   assert.ok(initial.dpr<=1.01,"guest tablet DPR too high: "+initial.dpr);
   const fps=await page.evaluate(async world=>{
    const q=window.__qaGuestNet;
    let frames=0,stutters=0,last=null,first=null,active=true;
    const count=t=>{if(!active)return;if(first===null)first=t;
     if(last!==null&&t-last>170)stutters++;last=t;frames++;
     requestAnimationFrame(count);};
    requestAnimationFrame(count);
    for(let i=121;i<=149;i++){
     await new Promise(done=>setTimeout(done,75));
     q.send({seq:i,round:1,world:{...world,clock:world.clock+i*.06}});
    }
    await new Promise(done=>setTimeout(done,200));
    active=false;
    return {frames,stutters,duration:(last-first)/1000,stats:q.stats()};
   },world);
   assert.equal(fps.stats.applied,149);
   assert.ok(fps.frames>=20,"render loop frozen "+JSON.stringify(fps));
   assert.ok(fps.stutters<=4,"main-thread stalled "+JSON.stringify(fps));
   assert.deepEqual(errors,[]);
   rows.push({browser:engineName,layout:entry.name,dpr:initial.dpr,fps,
    air:balance.stats,fire:balance.fire,targets:balance.ranged});
   await page.close();await context.close();
  }
  return rows;
 }finally{await browser.close();}
}
(async()=>{
 try{
  await new Promise(ok=>server.listen(8916,"127.0.0.1",ok));
  const rows=[...await measure("chromium",chromium),
   ...await measure("webkit",webkit)];
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(rows,null,2));
  console.log("GUEST V15 SUMMARY",JSON.stringify(rows));
 }finally{await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
