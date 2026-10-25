"use strict";
// QA-only matched HUD experiment: keeps the same REAL ten-unit light/heavy
// simulated units, and pins the rendered card footer to the same visual fixture.
// The ship HTML and balance data are untouched. Only loopback served HTML differs.
const {webkit}=require("playwright");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const {createHash}=require("node:crypto");
const root=process.cwd(),out=path.join(root,"qa-matched-hud");
fs.mkdirSync(out,{recursive:true});
const original=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
function patch(src,from,to){
 assert.equal(src.split(from).length,2,"single injection anchor required: "+from);
 return src.replace(from,to);
}
let html=patch(original,"S.clock+=delta*guestVisualClockPace(now);",
 "if(!window.__qaTickPause)S.clock+=delta*guestVisualClockPace(now);");
html=patch(html,'}else if(NET.isHost&&S.phase==="battle"){',
 '}else if(NET.isHost&&S.phase==="battle"&&!window.__qaTickPause){');
html=patch(html,"function updateHUD(){\n if(!S.capitals.length)return;",
 "function updateHUD(){\n if(window.__qaHudLock)return;\n if(!S.capitals.length)return;");
const srv=http.createServer((req,res)=>{
 const name=decodeURIComponent(req.url.split("?")[0]),file=path.resolve(root,"."+name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.setHeader("content-type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(name==="/online-ipad.html")res.end(html);else fs.createReadStream(file).pipe(res);
});
const round=x=>Math.round(x*100)/100;
const A=["light","heavy","heavy","light"],B=["heavy","light","light","heavy"];
const plan=[
 ...A.map(scene=>({scene,hud:"natural",paint:false})),
 ...A.map(scene=>({scene,hud:"natural-lock",paint:false})),
 ...B.map(scene=>({scene,hud:"natural-lock",paint:true})),
 ...A.map(scene=>({scene,hud:"light",paint:false})),
 ...B.map(scene=>({scene,hud:"heavy",paint:false})),
 ...A.map(scene=>({scene,hud:"light",paint:true})),
 ...B.map(scene=>({scene,hud:"heavy",paint:true}))
];
const sha=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
(async()=>{
 let browser,ctx;
 try{
  await new Promise(resolve=>srv.listen(8781,"127.0.0.1",resolve));
  browser=await webkit.launch({headless:true});
  ctx=await browser.newContext({viewport:{width:1194,height:834},hasTouch:true,deviceScaleFactor:2});
  const page=await ctx.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",route=>route.abort());
  await page.goto("http://127.0.0.1:8781/online-ipad.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").waitFor({state:"visible",timeout:20000});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep");
  const atlasReady=await page.waitForFunction(()=>window.GaldArt?.isReady?.()===true,
   null,{timeout:35000}).then(()=>true).catch(()=>false);
  assert.ok(atlasReady,"same warmed Gald art for all comparisons");
  await page.evaluate(()=>{window.__qaTickPause=true;window.__qaHudLock=false;window.__shokokuQa.setDpr(1);});
  const backing=await page.evaluate(()=>[document.getElementById("field").width,document.getElementById("field").height]);
  // Capture two COMPLETELY different legitimate card footers, including their
  // chosen cards, images, cost, and 'unavailable' classes. Rendering fixtures
  // use an identical predecoded static PNG representation in both scenes.
  const fixtures={};
  for(const scene of ["light","heavy"]){
   const got=await page.evaluate(s=>{
    window.__qaHudLock=false;window.__qaTickPause=true;
    return window.__shokokuQa.seedRealisticBattle(s);
   },scene);
   assert.equal(got.units,10);
   fixtures[scene]=await page.evaluate(()=>{
    const source=document.getElementById("cards"),copy=source.cloneNode(true);
    const from=[...source.querySelectorAll("canvas.cardPortrait")];
    const to=[...copy.querySelectorAll("canvas.cardPortrait")];
    for(let i=0;i<to.length;i++){
     const img=document.createElement("img");
     img.className=to[i].className;img.alt="";img.setAttribute("aria-hidden","true");
     img.src=from[i].toDataURL("image/png");to[i].replaceWith(img);
    }
    const ids=["resourceNumber","resourceRail","resourceNext","rate","remaining","nextCard"];
    return {cards:copy.innerHTML,footer:Object.fromEntries(ids.map(id=>{
      const el=document.getElementById(id);
      return [id,{html:el.innerHTML,now:el.getAttribute("aria-valuenow")}];
     })),
     ids:[...source.children].map(c=>c.dataset.id),
     unavailable:source.querySelectorAll(".card.unavailable").length,
     filtered:[...source.children].filter(c=>getComputedStyle(c).filter!=="none").length
    };
   });
   assert.equal(fixtures[scene].ids.length,5,"five actual card choices");
  }
  const rows=[];
  for(let i=0;i<plan.length;i++){
   const p=plan[i],fixture=(p.hud==="natural"||p.hud==="natural-lock")?null:fixtures[p.hud];
   const setup=await page.evaluate(scene=>{
    window.__qaHudLock=false;window.__qaTickPause=true;
    window.__shokokuQa.setDrawDisabledForQa(false);
    document.getElementById("field").style.visibility="visible";
    return window.__shokokuQa.seedRealisticBattle(scene);
   },p.scene);
   assert.ok(setup?.actions.every(x=>x.ok)&&setup.units===10,"ten legally summoned units");
   assert.equal(setup.heavy.length,p.scene==="heavy"?2:0);
   if(fixture){
    const applied=await page.evaluate(async data=>{
     const cards=document.getElementById("cards");
     cards.innerHTML=data.cards;
     for(const [id,v] of Object.entries(data.footer)){
      const el=document.getElementById(id);
      el.innerHTML=v.html;
      if(v.now!=null)el.setAttribute("aria-valuenow",v.now);
     }
     await Promise.all([...cards.querySelectorAll("img.cardPortrait")].map(i=>i.decode()));
     window.__qaHudLock=true;
     return {cards:cards.innerHTML,footer:Object.fromEntries(Object.keys(data.footer).map(id=>{
      const el=document.getElementById(id);
      return [id,{html:el.innerHTML,now:el.getAttribute("aria-valuenow")}];
     }))};
    },fixture);
    assert.equal(applied.cards,fixture.cards,"exact frozen card HTML");
    assert.deepEqual(applied.footer,fixture.footer,"exact frozen footer state");
   }else await page.evaluate(lock=>{window.__qaHudLock=lock;},p.hud==="natural-lock");
   // Let any card-image upload and compositor changes settle before measuring.
   await page.waitForTimeout(250);
   const m=await page.evaluate(async p=>{
    window.__shokokuQa.setDrawDisabledForQa(!p.paint);
    document.getElementById("field").style.visibility=p.paint?"visible":"hidden";
    await new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));
    window.__shokokuQa.resetFrameBench();
    const cards=document.getElementById("cards"),
      before=window.__shokokuQa.snapshot(),
      beforeCards=cards.innerHTML,
      beforeFooter=[...["resourceNumber","resourceRail","resourceNext","rate","remaining","nextCard"]]
       .map(id=>document.getElementById(id).innerHTML).join("::");
    const start=performance.now(),gaps=[];
    await new Promise(resolve=>{
     let previous=performance.now();
     const step=now=>{
      gaps.push(now-previous);previous=now;
      if(now-start>=2200)resolve();else requestAnimationFrame(step);
     };
     requestAnimationFrame(step);
    });
    const after=window.__shokokuQa.snapshot(),bench=window.__shokokuQa.frameBench();
    const mean=k=>bench.reduce((a,b)=>a+b[k],0)/Math.max(1,bench.length);
    const sorted=gaps.slice().sort((a,b)=>a-b),p95=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]||0;
    const sign=s=>JSON.stringify(s.units.map(u=>[u.uid,u.key,u.x,u.y,u.hp]));
    return {
     fps:Math.round(gaps.length*1000/(performance.now()-start)*100)/100,
     p95GapMs:Math.round(p95*100)/100,
     logicMs:Math.round(mean("logicMs")*100)/100,
     drawMs:Math.round(mean("drawMs")*100)/100,
     totalMs:Math.round(mean("totalMs")*100)/100,
     unitsStart:before.units.length,unitsEnd:after.units.length,
     sameUnits:sign(before)===sign(after),
     elapsedDelta:after.elapsed-before.elapsed,
     heavy:after.units.filter(u=>u.key==="guardian"||u.key==="tank").length,
     unavailable:cards.querySelectorAll(".card.unavailable").length,
     cardIds:[...cards.children].map(c=>c.dataset.id),
     cardHtml:beforeCards,footerHtml:beforeFooter,
     unchangedCards:cards.innerHTML===beforeCards,
     unchangedFooter:[...["resourceNumber","resourceRail","resourceNext","rate","remaining","nextCard"]]
       .map(id=>document.getElementById(id).innerHTML).join("::")===beforeFooter,
     canvasWidth:document.getElementById("field").width,
     canvasHeight:document.getElementById("field").height,
     hudLocked:!!window.__qaHudLock,
     frameError:window.__onlineFrameError||null
    };
   },p);
   assert.equal(m.unitsStart,10);assert.equal(m.unitsEnd,10);
   assert.ok(m.sameUnits&&m.elapsedDelta===0,"fixed world remained identical");
   assert.equal(m.heavy,p.scene==="heavy"?2:0);
   assert.ok(m.unchangedCards&&m.unchangedFooter,"HUD remained frozen");
   assert.deepEqual([m.canvasWidth,m.canvasHeight],backing,"constant Canvas backing");
   assert.ok(m.frameError===null,"no browser exceptions");
   assert.equal(m.hudLocked,!!fixture||p.hud==="natural-lock");
   if(!p.paint)assert.ok(m.drawMs<=.03,"gameplay paint actually disabled");
   if(fixture){
    assert.deepEqual(m.cardIds,fixture.ids,"same card set for light/heavy");
    assert.equal(m.unavailable,fixture.unavailable,"same card status for light/heavy");
    assert.equal(m.cardHtml,fixture.cards,"identical card pixels+DOM for light/heavy");
   }
   const row={run:i+1,hud:p.hud,scene:p.scene,paint:p.paint,
     fps:m.fps,p95GapMs:m.p95GapMs,totalMs:m.totalMs,logicMs:m.logicMs,
     drawMs:m.drawMs,units:m.unitsEnd,heavy:m.heavy,
     unavailable:m.unavailable,hudHash:sha({cards:m.cardHtml,footer:m.footerHtml})};
   rows.push(row);
   console.log("MATCHED HUD",JSON.stringify(row));
   if(fixture&&!rows.slice(0,-1).some(r=>r.hud===p.hud&&r.scene===p.scene&&r.paint===p.paint)){
    await page.screenshot({path:path.join(out,p.hud+"-"+p.scene+(p.paint?"-paint":"-no-paint")+".png"),animations:"disabled"});
   }
  }
  for(const h of ["light","heavy"])for(const paint of [false,true]){
   const a=rows.filter(r=>r.hud===h&&r.paint===paint);
   assert.equal(a.length,4);assert.equal(new Set(a.map(r=>r.hudHash)).size,1,
     "matched HUD cards, status and energy must be byte-for-byte identical across scenes");
  }
  assert.deepEqual(errors,[],"uncaught browser errors");
  fs.writeFileSync(path.join(out,"results.json"),JSON.stringify({atlasReady,backing,
   fixtureHashes:Object.fromEntries(Object.entries(fixtures).map(([key,f])=>[key,sha(f)])),
   rows,notes:[
    "Production HTML unchanged: QA-served HTML only pauses 30Hz sim, animation time and HUD refresh",
    "Every scene seeds 10 real legal units; unit positions remain fixed during measurement",
    "Matched fixtures include exact card image pixels, card classes, card order, next card and resource HUD",
    "Natural-lock control holds the original Canvas card images/energy/classes, pausing only periodic HUD refresh",
    "Headless CI WebKit is not physical iPad Safari; rAF FPS is not gameplay FPS"
   ]},null,2));
  console.log("PASS: matched card HUD, independent natural HUD-refresh lock, and resource controls");
 }finally{
  await ctx?.close().catch(()=>{});
  await browser?.close().catch(()=>{});
  await new Promise(resolve=>srv.close(resolve));
 }
})().catch(e=>{console.error(e);process.exitCode=1});