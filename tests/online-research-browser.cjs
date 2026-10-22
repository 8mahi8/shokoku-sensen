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
   await page.locator("#researchArchiveConsent").waitFor({state:"visible"});
   assert.equal(await page.locator("#researchArchiveConsent").isChecked(),false,
    "room log archive requires explicit consent from both participants");
   assert.equal(await page.locator("#researchArchiveConsent").isDisabled(),true,
    "cannot consent outside a room");
   assert.equal(await page.locator("#researchConsent").isChecked(),true,"anonymous local logging defaults on");
   assert.equal(await page.locator("[data-research-export]").first().isDisabled(),true);
   await page.locator("#researchConsent").uncheck();
   assert.equal(await page.locator("#researchConsent").isChecked(),false,"solo recording can be disabled");
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
   assert.equal(match.matchType,"human-vs-bot","solo remains distinguishable from human-human");
   assert.equal(await page.locator("[data-research-share]").first().isEnabled(),true);
   assert.ok(match.actions.length>0,"accepted card plays must be captured");
   assert.ok(match.samples.length>1&&match.samples.length<=80,"periodic samples bounded");
   assert.ok([0,1,2].includes(match.result.winner),"winner in correct range");
   const flat=JSON.stringify(match);
   for(const forbidden of ["clientId","roomCode","guestId","email","ipAddress"])
    assert.ok(!flat.includes(forbidden),"must not include identifying field "+forbidden);
   assert.equal(await page.locator("[data-research-export]").last().isEnabled(),true);
   await page.locator("[data-research-export]").first().click();
   await page.locator("[data-research-copy]").first().click();
   assert.equal(await page.locator("#researchEndText").inputValue().then(s=>JSON.parse(s).matches.length),1);
   assert.equal(await page.locator("#researchText").inputValue().then(s=>JSON.parse(s).matches.length),1);
   // Use real game objects, not fabricated JSON: stress the transport copy
   // with 130 troops and verify source physics stays untouched.
   const payload=await page.evaluate(()=>{
    const raw={units:[{uid:7,x:42.123456789,y:-7.4567890123,hp:3.33333333333}],
     unused:Infinity,negative:-Infinity,invalid:NaN,integer:12345};
    const packed=window.__shokokuNetQa.packGuestWorld(raw);
    const seed=window.__shokokuQa.seedMassBattle();
    return {packed,source:raw,seed};

   });
   assert.equal(payload.source.units[0].x,42.123456789,"authoritative source untouched");
   assert.equal(payload.packed.world.units[0].x,42.123,"subpixel transfer precision");
   assert.equal(payload.packed.world.units[0].y,-7.457,"negative coordinates quantized");
   assert.equal(payload.packed.world.unused,1000000000,"Infinity remains a finite transfer sentinel");
   assert.equal(payload.packed.world.negative,null,"legacy -Infinity JSON semantics kept");
   assert.equal(payload.packed.world.invalid,null,"legacy NaN JSON semantics kept");
   assert.equal(payload.packed.world.integer,12345,"integer fields preserved");
   assert.ok(payload.seed,"mass-battle QA data created");
   // Allow real 30Hz simulation to advance some unit coordinates from the
   // integer-only spawn positions before comparing serialization savings.
   await page.waitForFunction(()=>{
    const units=window.__shokokuQa.snapshot().units;
    return units.length>=100&&units.some(u=>Math.abs(u.x-Math.round(u.x))>.001);
   },null,{timeout:10000});
   const sizes=await page.evaluate(()=>window.__shokokuNetQa.worldSizePreview());
   console.log("PAYLOAD",label,source,JSON.stringify(sizes));
   assert.ok(sizes.unitCount>=100&&sizes.packedChars<sizes.rawChars,
    "real moving 130-unit game state must have smaller transport JSON");
   await page.reload({waitUntil:"domcontentloaded"});
   const reloaded=await page.evaluate(()=>window.__shokokuResearchQa.get().matches.length);
   assert.equal(reloaded,1,"local history persists across reload if storage available");
   await page.locator("#researchClear").click();
   assert.equal(await page.evaluate(()=>window.__shokokuResearchQa.get().matches.length),0);
   assert.deepEqual(errors,[],"no JavaScript browser errors");
   console.log("PASS",label,source,"default-on local match logging, opt-out, export, persist, erase");
   await page.close();
   // Phone-sized recovery page: no actual Firebase reads or writes in this QA.
   // Check the end user's fetch -> share / download route in both engines.
   if(label==="Chromium-paste")continue;
   const phone=await browser.newPage({viewport:{width:390,height:844},
    hasTouch:true,acceptDownloads:true});
   const phoneErrors=[];phone.on("pageerror",e=>phoneErrors.push(String(e.message)));
   const headers={"access-control-allow-origin":"*"};
   const phoneMatch={schema:1,mode:"online",matchType:"human-vs-human",
    actions:[{t:2,phase:"battle",team:1,card:"scout",x:300,y:200,
     energyBefore:8,ownHand:["scout","tank"]}],
    samples:[{t:2,energy:[8,6],castles:[3000,3000],
     forts:[[0,12],[1,12],[2,12]],units:[[1,"scout",300,200,195]]}],
    result:{winner:1,duration:50,castleHp:[3000,2800],fortOwners:[0,1,2]},
    guestControlHistory:[{t:0,guest:"human"}]};
   await phone.route("**/shokokuRooms1v1.json?shallow=true",r=>r.fulfill({
    status:200,contentType:"application/json",headers,body:JSON.stringify({"12345":true})}));
   await phone.route("**/shokokuRooms1v1/12345/researchRounds.json",r=>r.fulfill({
    status:200,contentType:"application/json",headers,body:JSON.stringify({
     "1":{schema:1,createdAt:123,match:phoneMatch}})}));
   await phone.addInitScript(()=>{
    Object.defineProperty(navigator,"canShare",{configurable:true,value:()=>true});
    Object.defineProperty(navigator,"share",{configurable:true,value:async data=>{
     window.__sharedResearch={name:data.files[0].name,
      text:await data.files[0].text()};
    }});
   });
   await phone.goto("http://127.0.0.1:8798/research-recover.html");
   assert.equal(await phone.locator("#share").isDisabled(),true,
    "phone cannot share before it recovers a match");
   await phone.locator("#fetchAll").click();
   await phone.waitForFunction(()=>!document.querySelector("#share").disabled);
   assert.match(await phone.locator("#status").textContent(),/1試合を回収/);
   await phone.locator("#share").click();
   await phone.waitForFunction(()=>!!window.__sharedResearch);
   const shared=await phone.evaluate(()=>window.__sharedResearch);
   assert.equal(shared.name,"shokoku-research-recovered.json");
   assert.equal(JSON.parse(shared.text).matches[0].actions[0].card,"scout");
   assert.ok(!shared.text.includes("12345"),"room codes must not enter shared JSON");
   const dlEvent=phone.waitForEvent("download");
   await phone.locator("#download").click();
   const dl=await dlEvent;
   assert.equal(dl.suggestedFilename(),"shokoku-research-recovered.json");
   await phone.locator("#copy").click();
   assert.equal(await phone.locator("#copyText").isVisible(),true,
    "selectable JSON fallback must be available inside school-style frames");
   const fallback=await phone.locator("#copyText").inputValue();
   assert.equal(JSON.parse(fallback).matches[0].actions[0].card,"scout");
   assert.ok(!fallback.includes("12345"),"copy fallback strips room identifiers");
   assert.deepEqual(phoneErrors,[],"phone recovery page has no JS errors");
   console.log("PASS",label,"phone recovery fetch, native share and file download");
   await phone.close();
  }
 }finally{
  for(const b of browsers)await b.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(err=>{console.error(err);process.exitCode=1});
