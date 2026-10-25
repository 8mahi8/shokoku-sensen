"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {webkit}=require("playwright");
const root=process.cwd(),out=path.join(root,"qa-art-cache");
fs.mkdirSync(out,{recursive:true});
let html=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
const anchor="function guestSimplifyVisuals(){";
assert.equal(html.split(anchor).length,2,"unique QA art injection point");
const hook=[
"window.__qaCachedArtProbe=(key,team,pose)=>{",
" const u={key,team,uid:42},big=key==='guardian'||key==='tank';",
" const ax=big?BIG_AX:FAST_AX,ay=big?BIG_AY:FAST_AY;",
" const sample={...u,x:200,y:270,hp:100,max:100,",
"  spawnAt:-100,spawnDuration:.4,deathProgress:0,flash:0,hitAt:-100,drift:0,",
"  walking:pose===1||pose===2,",
"  walkPhase:pose===2?3*Math.PI/(2*.76):Math.PI/(2*.76),windup:0,",
"  attackAnim:pose===3?(MOTION.attack[key]||.5)*.6:0,",
"  attackAnimMax:MOTION.attack[key]||.5};",
" return {tile:cachedSprite(u,pose),sample,ax,ay,frame:Math.max(300,S.clock)};",
"};",
"window.__qaCacheBlendProbe=ageMs=>{",
" const u={uid:88771,key:'infantry',team:1,x:605,y:398,hp:100,max:100,",
"   spawnAt:-100,hitAt:-100,flash:0,walking:true,walkPhase:2.07,",
"   attackAnim:0,deathProgress:0};",
" cachedSprite(u,1);",
" const oldMode=lowFpsCrowdedSprites,oldAt=lowFpsCrowdedSpritesAt;",
" const previous=window.KokokuArt.drawUnit;",
" let fullCalls=0;",
" window.KokokuArt.drawUnit=(...a)=>{fullCalls++;return previous(...a);};",
" lowFpsCrowdedSprites=true;lowFpsCrowdedSpritesAt=performance.now()-ageMs;",
" const before=denseSpritesRendered;",
" try{renderCrowdedUnit(u);}finally{",
"  window.KokokuArt.drawUnit=previous;",
"  lowFpsCrowdedSprites=oldMode;lowFpsCrowdedSpritesAt=oldAt;",
" }",
" return {ageMs,fullCalls,cachedCalls:denseSpritesRendered-before};",
"};"].join("\n");
html=html.replace(anchor,hook+"\n"+anchor);
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(req.url.split("?")[0]);
 const file=path.resolve(root,"."+name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.setHeader("content-type",file.endsWith(".js")?
  "text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(name==="/online-ipad.html"){res.end(html);return;}
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 let browser,ctx;
 try{
  await new Promise(ok=>server.listen(8782,"127.0.0.1",ok));
  browser=await webkit.launch({headless:true});
  ctx=await browser.newContext({viewport:{width:1194,height:834},
   hasTouch:true,deviceScaleFactor:2});
  const page=await ctx.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",route=>route.abort());
  await page.goto("http://127.0.0.1:8782/online-ipad.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").waitFor({state:"visible",timeout:20000});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.GaldArt?.isReady?.()===true,null,{timeout:35000});
  const audit=await page.evaluate(()=>{
   const classes=["infantry","scout","engineer","archer","suppress",
    "sentinel","guardian","drone","tank"];
   const WIDTH=400,HEIGHT=375,CX=200,CY=270;
   const full=document.createElement("canvas");full.width=WIDTH;full.height=HEIGHT;
   const cached=document.createElement("canvas");cached.width=WIDTH;cached.height=HEIGHT;
   const a=full.getContext("2d",{willReadFrequently:true});
   const b=cached.getContext("2d",{willReadFrequently:true});
   const montage=document.createElement("canvas");
   montage.id="qaCacheMontage";montage.width=WIDTH*2;montage.height=HEIGHT*4;
   montage.style.cssText="position:absolute;left:0;top:0;z-index:9999;"+
    "width:800px;height:1500px;background:#21373f";
   const g=montage.getContext("2d"),report=[];
   for(const key of classes)for(const team of [1,2])for(const pose of [0,1,2,3]){
    const info=window.__qaCachedArtProbe(key,team,pose);
    if(!info.tile)throw Error("missing tile "+key+team+pose);
    a.clearRect(0,0,WIDTH,HEIGHT);b.clearRect(0,0,WIDTH,HEIGHT);
    window.KokokuArt.drawUnit(a,info.sample,info.frame);
    const left=CX-info.ax,top=CY-info.ay;
    b.drawImage(info.tile,left,top);
    const pixel=a.getImageData(0,0,WIDTH,HEIGHT).data;
    let totalVisible=0,outsideCount=0,outsideAlpha=0;
    for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
     const alpha=pixel[(y*WIDTH+x)*4+3];if(alpha<8)continue;
     totalVisible++;
     if(x<left||x>=left+info.tile.width||y<top||y>=top+info.tile.height){
      outsideCount++;outsideAlpha+=alpha;
     }
    }
    report.push({key,team,pose,tile:[info.tile.width,info.tile.height],
     totalVisible,outsideCount,outsideAlpha});
    if((key==="guardian"||key==="tank")&&team===1&&(pose===0||pose===3)){
     const row=(key==="tank"?2:0)+(pose===3?1:0);
     g.fillStyle="#1b3238";g.fillRect(0,row*HEIGHT,WIDTH*2,HEIGHT);
     g.drawImage(full,0,row*HEIGHT);g.drawImage(cached,WIDTH,row*HEIGHT);
     g.fillStyle="#fff";g.font="bold 18px sans-serif";
     g.fillText(key+" "+(pose===3?"attack":"idle")+" FULL",10,row*HEIGHT+30);
     g.fillText("CACHED",WIDTH+10,row*HEIGHT+30);
    }
   }
   // Verify the two cached gait poses visibly differ; old source samples
   // (.4 and 3.2) both produced forward swing and a stiff-looking stride.
   const gait=[];
   for(const key of ["infantry","scout","guardian","tank"])for(const team of [1,2]){
    const p1=window.__qaCachedArtProbe(key,team,1);
    const p2=window.__qaCachedArtProbe(key,team,2);
    const c1=document.createElement("canvas"),c2=document.createElement("canvas");
    c1.width=c2.width=p1.tile.width;c1.height=c2.height=p1.tile.height;
    const a1=c1.getContext("2d",{willReadFrequently:true});
    const a2=c2.getContext("2d",{willReadFrequently:true});
    a1.drawImage(p1.tile,0,0);a2.drawImage(p2.tile,0,0);
    const pix1=a1.getImageData(0,0,c1.width,c1.height).data;
    const pix2=a2.getImageData(0,0,c2.width,c2.height).data;
    let changed=0;
    for(let p=0;p<pix1.length;p+=4){
     let d=0;for(let k=0;k<4;k++)d+=Math.abs(pix1[p+k]-pix2[p+k]);
     if(d>65)changed++;
    }
    gait.push({key,team,changedPixels:changed});
   }
   document.body.append(montage);
   return {report,gait,version:window.GaldArt.version};
  });
  assert.equal(audit.report.length,72,"nine types, both teams, four poses");
  assert.ok(audit.version.includes("B-04"),"large Gald sprite atlas loaded");
  // Execute the actual game's emergency-cache drawing method at distinct
  // transition ages. Cache frames must render throughout, but the expensive
  // full frame must disappear completely after 180 ms.
  const setup=await page.evaluate(()=>window.__shokokuQa.seedRealisticBattle("heavy"));
  assert.equal(setup.units,10,"real playable battle before fade review");
  const blends=await page.evaluate(()=>[0,90,220].map(
   ageMs=>window.__qaCacheBlendProbe(ageMs)));
  console.log("CACHE SWITCH BLEND",JSON.stringify(blends));
  assert.deepEqual(blends.map(x=>x.fullCalls),[1,1,0],
   "full artwork must only be drawn in 180ms initial crossfade");
  assert.deepEqual(blends.map(x=>x.cachedCalls),[1,1,1],
   "cheap tile must stay visible for whole transition");
  assert.equal(audit.gait.length,8,"both teams, four representative walking classes");
  console.log("CACHE WALK POSE DIFFERENCES",JSON.stringify(audit.gait));
  for(const info of audit.gait)assert.ok(info.changedPixels>20,
   info.key+" team "+info.team+" must show distinct opposing stride frames");
  const clipped=audit.report.filter(x=>x.outsideCount>5);
  console.log("CACHE ART OUTSIDE TILE",JSON.stringify(clipped));
  assert.deepEqual(errors,[],"no unexpected browser errors");
  // Capture all visual evidence before making clipping a hard failure.
  await page.locator("#qaCacheMontage").screenshot({
   path:path.join(out,"cache-vs-full-guardian-tank.png"),animations:"disabled",
   timeout:20000
  });
  fs.writeFileSync(path.join(out,"art-cache-audit.json"),JSON.stringify({
   report:audit.report,clipped,gait:audit.gait,blends,notes:[
    "Same unit properties and same frame for full and cached art",
    "Offline localhost only; no Firebase writes, rules, or game simulation changes",
    "Linux headless WebKit, not a physical iPad measurement"
   ]},null,2));
  assert.equal(clipped.length,0,"all 72 full-art poses must fit cache tiles");
  console.log("PASS: 72 source-vs-cache art poses have no clipped silhouettes");
 }finally{
  await ctx?.close().catch(()=>{});await browser?.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
