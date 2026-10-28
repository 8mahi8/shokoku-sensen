// Browser QA for seven real unit AI decisions and visible combat scenes.
// Run on the original school iPad HTML with localhost-only in-memory hooks.
// Neither school files nor Firebase data is modified.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {chromium,webkit}=require("playwright");
const root=process.cwd(),out=path.join(root,"qa-unit-ai-browser");
fs.mkdirSync(out,{recursive:true});
let html=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
const anchor="window.__shokokuQa={";
assert.equal(html.split(anchor).length,2,"unique localhost QA anchor");
const hook="\n unitAiSetup:(id)=>{\n  // QA-only deterministic unit placement, never included in the shipped HTML.\n  const initial=window.__shokokuQa.seedRealisticBattle(\"light\");\n  if(initial?.units!==10)throw Error(\"offline realistic battle setup failed\");\n  S.phase=\"inspect\"; // paint continues; automatic host ticks stop\n  S.botThink=999999;S.units=[];S.forts=[];S.effects=[];S.deaths=[];\n  S.projectiles=[];S.spells.incoming=[];S.spells.zones=[];\n  S.uid=0;S.clock=100;\n  S.cam.x=id===\"scoutFortChoice\"?1020:id===\"redNoBacktrack\"?860:440;\n  S.cam.tx=S.cam.x;S.cam.y=330;S.cam.ty=330;clampCamera();\n  const add=(key,team,x,y,opts={})=>{\n   const d=CLASSES[key];\n   const u={uid:++S.uid,key,team,x,y,anchorX:opts.anchorX??x,\n    anchorY:opts.anchorY??y,homeY:y,hp:d.hp,max:d.hp,\n    attack:opts.attack??0,attackAnim:0,attackAnimMax:MOTION.attack[key],\n    flash:0,windup:0,hitAt:-100,spawnAt:-100,spawnDuration:.4,\n    lock:null,walkPhase:0,walking:false,drift:0,facing:team===1?0:Math.PI};\n   S.units.push(u);return u;\n  };\n  let a,e,other;\n  switch(id){\n   case \"scoutInterrupt\":\n    a=add(\"scout\",1,300,300);e=add(\"infantry\",2,325,300,{attack:999});\n    S.forts.push({x:379,y:300,owner:0,hp:12});break;\n   case \"guardianLarge\":\n    a=add(\"guardian\",1,300,300);e=add(\"tank\",2,350,300,{attack:999});\n    other=add(\"infantry\",2,325,300,{attack:999});break;\n   case \"guardReturn\":\n    a=add(\"sentinel\",1,400,320,{anchorX:300,anchorY:320});\n    e=add(\"infantry\",2,520,320,{attack:999});break;\n   case \"guardOutsideSelfDefense\":\n    a=add(\"sentinel\",1,480,320,{anchorX:300,anchorY:320});\n    e=add(\"infantry\",2,520,320,{attack:999});break;\n   case \"scoutFortChoice\":\n    a=add(\"scout\",1,1080,320);\n    S.forts.push({x:1100,y:385,owner:0,hp:12});break;\n   case \"infantryFortIgnore\":\n    a=add(\"infantry\",1,300,320);\n    S.forts.push({x:370,y:320,owner:0,hp:12});break;\n   case \"redNoBacktrack\":\n    a=add(\"infantry\",2,900,320);\n    e=add(\"infantry\",1,960,320,{attack:999});break;\n   default:throw Error(\"unknown scenario \"+id);\n  }\n  window.__aiSubject=a;window.__aiEnemy=e;window.__aiOther=other;\n  const t=selectPriorityTargets(a);\n  const label=v=>!v?null:v.kind===\"unit\"?\"unit:\"+v.ref.key:v.kind;\n  return {attack:label(t.attack),approach:label(t.approach),x:a.x,\n   enemyHp:e?.hp??null,otherHp:other?.hp??null,fortHp:S.forts[0]?.hp??null};\n },\n unitAiAdvance:(count)=>{\n  if(!Number.isInteger(count)||count<1||count>60)throw Error(\"bad step count\");\n  const a=window.__aiSubject,e=window.__aiEnemy;\n  for(let n=0;n<count;n++){S.clock+=1/30;unitStep(1/30);}\n  return {x:a.x,enemyHp:e?.hp??null,otherHp:window.__aiOther?.hp??null,\n   fortHp:S.forts[0]?.hp??null,frameError:window.__onlineFrameError||null};\n },\n";
html=html.replace(anchor,anchor+hook);
const server=http.createServer((req,res)=>{
 const route=decodeURIComponent(req.url.split("?")[0]);
 const file=path.resolve(root,"."+route);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.setHeader("content-type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(route==="/online-ipad.html"){res.end(html);return;}
 fs.createReadStream(file).pipe(res);
});
const scenarios=["scoutInterrupt","guardianLarge","guardReturn",
 "guardOutsideSelfDefense","scoutFortChoice","infantryFortIgnore","redNoBacktrack"];
function verify(id,b,a){
 switch(id){
  case "scoutInterrupt":
   assert.equal(b.attack,"unit:infantry");assert.equal(b.approach,"fort");
   assert.ok(a.x>b.x&&a.enemyHp<b.enemyHp);break;
  case "guardianLarge":
   assert.equal(b.attack,"unit:tank");
   assert.ok(a.enemyHp<b.enemyHp);break;
  case "guardReturn":
   assert.equal(b.attack,null);assert.equal(b.approach,null);
   assert.ok(a.x<b.x);break;
  case "guardOutsideSelfDefense":
   assert.equal(b.attack,"unit:infantry");assert.equal(b.approach,null);
   assert.ok(a.enemyHp<b.enemyHp);assert.equal(a.x,b.x);break;
  case "scoutFortChoice":
   assert.equal(b.approach,"fort");assert.ok(a.x>b.x);
   assert.ok(a.fortHp<b.fortHp,"scout must eventually damage the chosen outpost");break;
  case "infantryFortIgnore":
   assert.equal(b.attack,null);assert.equal(b.approach,null);
   assert.ok(a.x>b.x);break;
  case "redNoBacktrack":
   assert.equal(b.approach,null);assert.ok(a.x<b.x);break;
 }
 assert.equal(a.frameError,null);
}
(async()=>{
 const browsers=[],rows=[];
 try{
  await new Promise(resolve=>server.listen(8791,"127.0.0.1",resolve));
  for(const [name,engine] of [["chromium",chromium],["webkit",webkit]]){
   const browser=await engine.launch({headless:true});browsers.push(browser);
   const context=await browser.newContext({viewport:{width:1194,height:834},
    hasTouch:true,deviceScaleFactor:2});
   const page=await context.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
   await page.goto("http://127.0.0.1:8791/online-ipad.html?qa=1",
    {waitUntil:"domcontentloaded",timeout:30000});
   await page.locator("#netSolo").waitFor({state:"visible",timeout:20000});
   await page.locator("#netSolo").click();
   await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep");
   await page.waitForFunction(()=>window.KokokuArt?.drawUnit);
   for(const id of scenarios){
    const before=await page.evaluate(v=>window.__shokokuQa.unitAiSetup(v),id);
    const after=await page.evaluate(()=>window.__shokokuQa.unitAiAdvance(15));
    verify(id,before,after);
    await page.waitForTimeout(150);
    await page.screenshot({path:path.join(out,name+"-"+id+".png"),
     animations:"disabled",timeout:20000});
    const error=await page.evaluate(()=>window.__onlineFrameError||null);
    assert.equal(error,null,name+" "+id+" Canvas exception");
    assert.deepEqual(errors,[],name+" "+id+" browser errors");
    rows.push({browser:name,scene:id,before,after});
    console.log("UNIT_AI_SCENE",JSON.stringify({browser:name,scene:id,before,after}));
   }
   await context.close();await browser.close();browsers.pop();
  }
  assert.equal(rows.length,14);
  const chromium=rows.filter(r=>r.browser==="chromium");
  const webkitRows=rows.filter(r=>r.browser==="webkit");
  assert.deepEqual(chromium.map(r=>r.before),webkitRows.map(r=>r.before),
   "both engines must choose the same priority candidates");
  assert.deepEqual(chromium.map(r=>r.after),webkitRows.map(r=>r.after),
   "both engines must reach identical tactical results after 15 ticks");
  fs.writeFileSync(path.join(out,"results.json"),JSON.stringify({
   rows,notes:["Deterministic offline QA-only positions; real game unitStep and Canvas",
    "Automatic battle tick paused during snapshot scenarios",
    "Not an actual physical iPad or live Firebase guest test"]},null,2));
  console.log("PASS: 14 Chromium/WebKit visual AI scenes with combat outcomes");
 }finally{
  for(const b of browsers)try{await b.close()}catch(_){}
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
