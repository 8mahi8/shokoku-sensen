"use strict";
const fs=require("node:fs"),http=require("node:http"),path=require("node:path"),
 assert=require("node:assert/strict"),{chromium,webkit}=require("playwright");
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end();return;
 }
 res.setHeader("content-type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(p).pipe(res);
});
(async()=>{
 let browsers=[];
 try{
  await new Promise(ok=>server.listen(8798,"127.0.0.1",ok));
  for(const [label,engine,source] of [
    ["Chromium",chromium,"online.html"],
    ["WebKit",webkit,"online-ipad.html"],
    ["Chromium-paste",chromium,"online-embed.html"]]){
   const browser=await engine.launch({headless:true});
   browsers.push(browser);
   const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true,acceptDownloads:true});
   const errors=[];page.on("pageerror",e=>errors.push(String(e.message)));
   await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
   await page.goto("http://127.0.0.1:8798/"+source+"?qa=1",{waitUntil:"domcontentloaded"});
   await page.locator("#researchConsent").waitFor({state:"visible"});
   assert.equal(await page.locator("#researchConsent").isChecked(),false,"consent defaults off");
   assert.equal(await page.locator("[data-research-export]").first().isDisabled(),true);
   await page.locator("#researchConsent").check();
   await page.locator("#netSoloLevels button[data-solo-level='hard']").click();
   await page.locator("#netSolo").click();
   await page.waitForFunction(()=>window.ShokokuResearch?.active===true);
   await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep");
   const played=await page.evaluate(()=>{
    return window.__shokokuQa.runDuel(20261017,"balanced","hard",2);
   });
   assert.ok(played?.finished,"full 30Hz game must finish");
   await page.waitForFunction(()=>window.ShokokuResearch?.active===false);
   const batch=await page.evaluate(()=>window.__shokokuResearchQa.get());
   assert.equal(batch.matches.length,1,"one completed opted-in match");
   const match=batch.matches[0];
   assert.equal(match.mode,"solo");
   assert.ok(match.actions.length>0,"accepted card plays must be captured");
   assert.ok(match.samples.length>1&&match.samples.length<=80,"periodic samples bounded");
   assert.ok([0,1,2].includes(match.result.winner),"winner in correct range");
   const flat=JSON.stringify(match);
   for(const forbidden of ["clientId","roomCode","guestId","email","ipAddress"])
    assert.ok(!flat.includes(forbidden),"must not include identifying field "+forbidden);
   assert.equal(await page.locator("[data-research-export]").last().isEnabled(),true);
   await page.locator("[data-research-export]").first().click();
   assert.equal(await page.locator("#researchText").inputValue().then(s=>JSON.parse(s).matches.length),1);
   await page.reload({waitUntil:"domcontentloaded"});
   const reloaded=await page.evaluate(()=>window.__shokokuResearchQa.get().matches.length);
   assert.equal(reloaded,1,"local history persists across reload if storage available");
   await page.locator("#researchClear").click();
   assert.equal(await page.evaluate(()=>window.__shokokuResearchQa.get().matches.length),0);
   assert.deepEqual(errors,[],"no JavaScript browser errors");
   console.log("PASS",label,source,"opt-in captured complete match, export, persist, erase");
   await page.close();
  }
 }finally{
  for(const b of browsers)await b.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(err=>{console.error(err);process.exitCode=1});
