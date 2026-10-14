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
   await page.goto("http://127.0.0.1:8771/"+source,{waitUntil:"domcontentloaded"});
   await page.locator("#netSolo").click();
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
   await page.waitForFunction(()=>window.__offlineRender.red>0,null,{timeout:9000});
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
   // Local rematch must restart without a room (no Firebase).
   await page.evaluate(()=>window.ShokokuNet.rematch());
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
