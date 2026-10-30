// Test offline fallback even when Firebase CDN is blocked by a school network.
// Uses only bundled standalone/local game assets; no database writes.
"use strict";
const {chromium}=require("playwright"),fs=require("node:fs"),http=require("node:http"),path=require("node:path"),assert=require("node:assert/strict");
const root=process.cwd(),delay=ms=>new Promise(r=>setTimeout(r,ms));
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}
 res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(f).pipe(res);
});
(async()=>{
 let browser;
 try{
  await new Promise(r=>server.listen(8771,"127.0.0.1",r));
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  for(const source of ["online.html","online-ipad.html"]){
   const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true});
   const errors=[];page.on("pageerror",err=>errors.push(err.message));
   // Block just Firebase, not the game scripts or original Gald character art.
   await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
   await page.goto("http://127.0.0.1:8771/"+source+"?qa=1",{waitUntil:"domcontentloaded"});
   await page.locator('[data-solo-level="hard"]').click();
   assert.equal(await page.locator('[data-solo-level="hard"]').getAttribute("aria-pressed"),"true");
   await page.locator("#netSolo").click();
   assert.equal(await page.evaluate(()=>window.ShokokuNet.soloDifficulty),"hard");
   const verifySeparateDecks=()=>page.evaluate(()=>{
    const snapshot=window.__shokokuQa.snapshot();
    const blue=snapshot.hand[1],red=snapshot.hand[2];
    return {blue,red,unique:new Set(blue).size===4&&new Set(red).size===4,
      different:blue.join(",")!==red.join(",")};
   });
   for(let i=0;i<12;i++){
    const hands=await verifySeparateDecks();
    assert.ok(hands.unique,source+" duplicate card in opening draw");
    assert.ok(hands.different,source+" identical host and guest opening draws");
    if(i<11)await page.evaluate(()=>window.ShokokuNet.rematch());
   }
   // Mulligan comes before the original 10-second placement phase.
   assert.equal(await page.evaluate(()=>window.__shokokuQa.snapshot().phase),"mulligan");
   assert.equal(await page.locator("#mulliganCards .mulliganCard").count(),4);
   await page.locator("#mulliganCards .mulliganCard").nth(0).click();
   assert.equal(await page.locator("#mulliganConfirm").innerText(),"選んだ1枚を交換");
   await page.locator("#mulliganConfirm").click();
   await page.waitForFunction(()=>window.__shokokuQa.snapshot().phase==="prep");
   assert.equal(await page.locator("#mulliganOverlay").evaluate(el=>el.classList.contains("hidden")),true);
   await page.waitForFunction(()=>window.ShokokuNet?.isSolo===true&&window.ShokokuNet?.isOnline===false&&window.ShokokuNet?.isHost===true);
   await page.locator("#onlinePanel").waitFor({state:"hidden"});
   const badge=await page.locator("#networkBar").innerText();assert.match(badge,/OFFLINE/);
   await page.waitForFunction(()=>window.KokokuArt&&window.KokokuArt.drawUnit,null,{timeout:15000});
   await page.evaluate(()=>{
    window.__offlineRender={red:0,blue:0};
    const old=window.KokokuArt.drawUnit;
    window.KokokuArt.drawUnit=function(ctx,unit,clock){
     if(unit.team===2)window.__offlineRender.red++;
     if(unit.team===1)window.__offlineRender.blue++;
     return old.call(this,ctx,unit,clock);
    };
   });
   // The opening red BOT spawns off the blue player's screen. Culling is valid:
   // verify its presence in simulation, move the QA camera, then require rendering.
   await page.waitForFunction(()=>window.__shokokuQa.snapshot().units.some(u=>u.team===2),null,{timeout:9000});
   await page.evaluate(()=>window.__shokokuQa.setCamera(1015,220));
   await page.waitForFunction(()=>window.__offlineRender.red>0,null,{timeout:9000});
   await page.evaluate(()=>window.__shokokuQa.setCamera(300,330));
   await page.waitForFunction(()=>window.__shokokuQa.snapshot().camera.x<600);
   // Unit rendering alone isn't enough: tick locally, not using Firebase.
   const first=await page.locator("#prepTime").innerText();
   await delay(1600);
   const second=await page.locator("#prepTime").innerText();
   assert.notEqual(first,second,"Offline match's local preparation must advance");
   // Local BOT is team 2, the human remains team 1.
   await page.locator('button.card[data-id="infantry"]').click();
   const rect=await page.locator("#field").boundingBox();
   await page.mouse.click(rect.x+rect.width*.12,rect.y+rect.height*.45);
   await page.waitForFunction(()=>window.__offlineRender.blue>0,null,{timeout:9000});
   // Regression: optimized HUD must keep the visible energy and accessibility
   // progressbar in sync with the authoritative local simulation.
   await page.waitForFunction(()=>{
    const s=window.__shokokuQa?.snapshot();if(!s)return false;
    const energy=s.energy[1],rail=document.getElementById("resourceRail");
    const shown=parseInt(document.getElementById("resourceNumber").textContent,10);
    const aria=Number(rail.getAttribute("aria-valuenow"));
    return shown===Math.floor(energy)&&Math.abs(aria-energy)<.15;
   },null,{timeout:5000});
   // Local rematch must restart from a fresh mulligan, not a stale hand.
   await page.evaluate(()=>window.ShokokuNet.rematch());
   assert.equal(await page.evaluate(()=>window.__shokokuQa.snapshot().phase),"mulligan");
   await page.locator("#mulliganConfirm").click();
   await page.waitForFunction(()=>window.__shokokuQa.snapshot().phase==="prep");
   assert.equal(await page.locator("#prepTime").innerText(),"00:10");
   assert.ok(await page.locator("#onlinePanel").evaluate(e=>e.classList.contains("hidden")));
   if(errors.length)throw Error(source+" browser errors: "+errors.join(" | "));
   console.log("PASS:",source,"solo match with Firebase blocked, blue/red units, local timer, and offline rematch");
   await page.close();
  }
 }finally{
  if(browser)await browser.close();
  await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
