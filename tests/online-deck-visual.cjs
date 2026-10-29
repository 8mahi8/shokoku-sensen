// Browser-only UI evidence: never create a Firebase room or change published builds.
"use strict";
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const assert=require("node:assert/strict");
const {chromium,webkit}=require("playwright");
const root=process.cwd(),out=path.join(root,"qa-deck-editor-visual");fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("not found");return;
 }
 res.writeHead(200,{"Content-Type":p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8","Cache-Control":"no-store"});
 fs.createReadStream(p).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(8778,"127.0.0.1",r));
 try{
  for(const [engine,browserType] of [["chromium",chromium],["webkit",webkit]]){
   const browser=await browserType.launch({headless:true,args:engine==="chromium"?["--no-sandbox"]:[]});
   try{
    const page=await browser.newPage({viewport:{width:1024,height:650},hasTouch:true,deviceScaleFactor:1});
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://127.0.0.1:8778/online-ipad.html?qa=1",{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>!!window.ShokokuDeck?.eligible()?.length);
    await page.evaluate(()=>window.ShokokuDeck.open());
    await page.locator("#deckEditor").waitFor({state:"visible"});
    assert.equal(await page.locator("#deckSelected .deckTile").count(),10);
    assert.equal(await page.locator("#deckPool .deckTile").count(),5);
    for(const id of ["duelist","crusher","ranger_engineer","interceptor","ground_bomber"])
     assert.equal(await page.locator('#deckPool .deckTile[data-card-id="'+id+'"]').count(),1,"missing real new character "+id);
    // All default portraits exist; swapping must preserve *every* tile Canvas.
    const preSwap=await page.evaluate(()=>{
     const ids=[...document.querySelectorAll("#deckEditor .deckTile")];
     ids.forEach((tile,i)=>tile.querySelector("canvas").dataset.qaPortraitIdentity=String(i));
     return ids.map(tile=>[tile.dataset.cardId,tile.querySelector("canvas").dataset.qaPortraitIdentity]);
    });
    await page.locator("#deckPool .deckTile[data-card-id=duelist]").click();
    await page.locator("#deckSelected .deckTile[data-card-id=scout]").click();
    assert.equal(await page.locator("#deckSelected .deckTile[data-card-id=duelist]").count(),1,"real character swapping in");
    assert.equal(await page.locator("#deckPool .deckTile").count(),5);
    const postSwap=await page.evaluate(()=>[...document.querySelectorAll("#deckEditor .deckTile")]
     .map(tile=>[tile.dataset.cardId,tile.querySelector("canvas").dataset.qaPortraitIdentity]));
    assert.deepEqual(postSwap.slice().sort((a,b)=>a[0].localeCompare(b[0])),
     preSwap.slice().sort((a,b)=>a[0].localeCompare(b[0])),
     "touch swap must reuse all 15 card portraits instead of rebuilding Canvas");

    // Cancel must not mutate persisted deck; a future editor open begins from draft.
    await page.locator("#deckCancel").click();
    await page.evaluate(()=>window.ShokokuDeck.open());
    assert.equal(await page.locator("#deckSelected .deckTile[data-card-id=scout]").count(),1,"cancel rolls back");

    assert.equal(await page.locator("#deckCount").innerText(),"10 / 10種類");
    assert.equal(await page.locator("#deckSave").isEnabled(),true);
    await page.screenshot({path:path.join(out,engine+"-default.png")});
    await page.setViewportSize({width:820,height:500});
    await page.screenshot({path:path.join(out,engine+"-compact.png")});
    const compact=await page.evaluate(()=>({w:document.documentElement.scrollWidth,
     viewport:innerWidth,selected:document.querySelectorAll("#deckSelected .deckTile").length}));
    assert.ok(compact.w<=compact.viewport+2,"compact editor must not overflow horizontally");
    assert.equal(compact.selected,10);
    await page.locator("#deckCancel").click();
    await page.setViewportSize({width:1024,height:650});
    await page.evaluate(()=>{
     const ids=["scout","engineer","archer","barrage","sentinel","suppress","guardian","ward","drone","tank"];
     const c=Object.fromEntries(ids.map((id,i)=>[id,{name:id,cost:i%5+2,hp:100,hitAir:true,limit:5}]));
     c.infantry={name:"basic",cost:2,hp:100};
     c.future={name:"追加カード（試験専用）",cost:4,hp:100,limit:5};
     window.ShokokuDeck.configure(c);
     window.ShokokuDeck.open();
    });
    assert.equal(await page.locator("#deckPool .deckTile").count(),1);
    await page.locator("#deckPool .deckTile[data-card-id=future]").click();
    assert.match(await page.locator("#deckNotice").innerText(),/交換/);
    await page.locator("#deckSelected .deckTile[data-card-id=scout]").click();
    assert.equal(await page.locator("#deckSelected .deckTile").count(),10);
    assert.equal(await page.locator("#deckSelected .deckTile[data-card-id=future]").count(),1);
    await page.screenshot({path:path.join(out,engine+"-swapped.png")});
    await page.setViewportSize({width:390,height:760});
    await page.screenshot({path:path.join(out,engine+"-portrait.png")});
    const portrait=await page.evaluate(()=>({w:document.documentElement.scrollWidth,viewport:innerWidth}));
    assert.ok(portrait.w<=portrait.viewport+2,"portrait editor must not overflow horizontally");
    await page.locator("#deckSave").click();
    const saved=await page.evaluate(()=>window.ShokokuDeck.current());
    assert.equal(saved.length,10);assert.ok(saved.includes("future"));assert.ok(!saved.includes("scout"));
    await page.evaluate(()=>window.ShokokuDeck.configure({
     infantry:{name:"basic",cost:2},
     ...Object.fromEntries(["scout","engineer","archer","barrage","sentinel","suppress","guardian","ward","drone","tank","future"]
      .map(id=>[id,{name:id,cost:3,hp:100}]))
    }));
    assert.equal(await page.evaluate(()=>window.ShokokuDeck.current().includes("future")),true);
    assert.deepEqual(errors,[],"browser errors");
    console.log("PASS: "+engine+" deck 10/10, touch swap, save and reopened draft");
   }finally{await browser.close();}
  }
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});