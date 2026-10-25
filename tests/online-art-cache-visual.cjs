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
"  walking:pose===1||pose===2,walkPhase:pose===2?3.2:.4,windup:0,",
"  attackAnim:pose===3?(MOTION.attack[key]||.5)*.6:0,",
"  attackAnimMax:MOTION.attack[key]||.5};",
" return {tile:cachedSprite(u,pose),sample,ax,ay,frame:Math.max(300,S.clock)};",
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
   document.body.append(montage);
   return {report,version:window.GaldArt.version};
  });
  assert.equal(audit.report.length,72,"nine types, both teams, four poses");
  assert.ok(audit.version.includes("B-04"),"large Gald sprite atlas loaded");
  const clipped=audit.report.filter(x=>x.outsideCount>5);
  console.log("CACHE ART OUTSIDE TILE",JSON.stringify(clipped));
  assert.deepEqual(errors,[],"no unexpected browser errors");
  assert.equal(clipped.filter(x=>x.key==="guardian"||x.key==="tank").length,0,
   "large character cache may not truncate visible art");
  await page.locator("#qaCacheMontage").screenshot({
   path:path.join(out,"cache-vs-full-guardian-tank.png"),animations:"disabled",
   timeout:20000
  });
  fs.writeFileSync(path.join(out,"art-cache-audit.json"),JSON.stringify({
   report:audit.report,clipped,notes:[
    "Same unit properties and same frame for full and cached art",
    "Offline localhost only; no Firebase writes, rules, or game simulation changes",
    "Linux headless WebKit, not a physical iPad measurement"
   ]},null,2));
  console.log("PASS: 72 full-vs-cache art poses and heavy silhouette clipping audit");
 }finally{
  await ctx?.close().catch(()=>{});await browser?.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
