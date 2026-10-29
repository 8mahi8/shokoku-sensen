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
     const poolCount=await page.evaluate(()=>window.ShokokuDeck.eligible().length-10);
     assert.ok(poolCount>=5,"Stage-1 cards must remain available after pool expansion");
    assert.equal(await page.locator("#deckSelected .deckTile").count(),10);
    assert.equal(await page.locator("#deckPool .deckTile").count(),poolCount);
    // With 20 eligible cards, SAVE must stay visible without scrolling
    // through the long unselected card list in school landscape mode.
    const footer=await page.evaluate(()=>{
     const f=document.querySelector("#deckEditorFoot"),b=document.querySelector("#deckSave");
     const r=f.getBoundingClientRect(),k=b.getBoundingClientRect();
     const hit=document.elementFromPoint(k.left+k.width/2,k.top+k.height/2);
     return {position:getComputedStyle(f).position,top:r.top,bottom:r.bottom,
      height:innerHeight,saveH:k.height,saveVisible:k.top>=0&&k.bottom<=innerHeight,
      footerVisible:r.top>=-2&&r.bottom<=innerHeight+2,
      hitSave:hit===b||b.contains(hit)};
    });
    assert.equal(footer.position,"sticky","deck actions must stick to viewport");
    assert.ok(footer.footerVisible&&footer.saveVisible&&footer.hitSave,
     "save/return must be visible and tappable "+JSON.stringify(footer));
    assert.ok(footer.saveH>=40,"confirm target should not become tiny");
    await page.screenshot({path:path.join(out,engine+"-sticky-actions.png")});
    for(const id of ["duelist","crusher","ranger_engineer","interceptor","ground_bomber"])
     assert.equal(await page.locator('#deckPool .deckTile[data-card-id="'+id+'"]').count(),1,"missing real new character "+id);
    // Use the existing battle-card dialog (the new card preview), not
    // a small status line below the editor.
    await page.locator('#deckPool .deckCell:has(.deckTile[data-card-id="ranger_engineer"]) .deckDetail').click();
    await page.locator("#cardInfoOverlay").waitFor({state:"visible"});
    assert.equal(await page.locator("#cardInfoName").innerText(),"遠距離工兵");
    assert.match(await page.locator("#cardInfoStats").innerText(),/HP/);
    assert.match(await page.locator("#cardInfoStats").innerText(),/300/);
    const foreground=await page.evaluate(()=>({
     overlay:Number(getComputedStyle(document.querySelector("#cardInfoOverlay")).zIndex),
     editor:Number(getComputedStyle(document.querySelector("#deckEditor")).zIndex),
     hidden:document.querySelector("#deckEditor").getAttribute("aria-hidden"),
     width:document.documentElement.scrollWidth
    }));
    assert.ok(foreground.overlay>foreground.editor,"card details must appear above editor");
    assert.equal(foreground.hidden,"true");
    assert.ok(foreground.width<=1026,"detail must not cause horizontal overflow");
    await page.screenshot({path:path.join(out,engine+"-detail.png")});
    await page.locator("#cardInfoClose").click();
    assert.equal(await page.locator("#cardInfoOverlay").isVisible(),false);
    // Stage-2 cards must be inspectable from the editor, even when their tiles
    // start below the fold. Test every new id with a real detail-button click.
    for(const [id,name,role] of [
     ["piercer","貫通射手","地上"],
     ["catapult","遠投投石器","大型"],
     ["kamikaze","突貫爆撃機","飛行"],
     ["mech_summoner","機械召喚師","地上"],
     ["gravity","引力","スペル"]
    ]){
     const cell=page.locator('#deckPool .deckCell:has(.deckTile[data-card-id="'+id+'"])');
     assert.equal(await cell.count(),1,"missing Stage-2 editor candidate "+id);
     await cell.locator(".deckDetail").click();
     assert.equal(await page.locator("#cardInfoName").innerText(),name);
     assert.match(await page.locator("#cardInfoRole").innerText(),new RegExp(role));
     assert.ok((await page.locator("#cardInfoNote").innerText()).length>=8,"no card note "+id);
     if(id==="gravity")assert.match(await page.locator("#cardInfoStats").innerText(),/2.5/);
     await page.locator("#cardInfoClose").click();
     assert.equal(await page.locator("#cardInfoOverlay").isVisible(),false);
    }
    // Use two actual touches with a new spell, then restore the old deck.
    await page.locator('#deckPool .deckTile[data-card-id="gravity"]').tap();
    await page.locator('#deckSelected .deckTile[data-card-id="barrage"]').tap();
    assert.equal(await page.locator('#deckSelected .deckTile[data-card-id="gravity"]').count(),1);
    assert.equal(await page.locator('#deckSelected .deckTile[data-card-id="barrage"]').count(),0);
    await page.screenshot({path:path.join(out,engine+"-stage2-swap.png")});
    await page.locator('#deckPool .deckTile[data-card-id="barrage"]').tap();
    await page.locator('#deckSelected .deckTile[data-card-id="gravity"]').tap();
    assert.equal(await page.locator('#deckSelected .deckTile[data-card-id="barrage"]').count(),1);
    assert.equal(await page.locator('#deckSelected .deckTile[data-card-id="gravity"]').count(),0);
    assert.equal(await page.locator("#deckEditor").getAttribute("aria-hidden"),"false");
    assert.equal(await page.locator("#deckSelected .deckTile").count(),10);
    // All default portraits exist; swapping must preserve *every* tile Canvas.
    const preSwap=await page.evaluate(()=>{
     const ids=[...document.querySelectorAll("#deckEditor .deckTile")];
     ids.forEach((tile,i)=>tile.querySelector("canvas").dataset.qaPortraitIdentity=String(i));
     return ids.map(tile=>[tile.dataset.cardId,tile.querySelector("canvas").dataset.qaPortraitIdentity]);
    });
    await page.locator("#deckPool .deckTile[data-card-id=duelist]").click();
    await page.locator("#deckSelected .deckTile[data-card-id=scout]").click();
    assert.equal(await page.locator("#deckSelected .deckTile[data-card-id=duelist]").count(),1,"real character swapping in");
    assert.equal(await page.locator("#deckPool .deckTile").count(),poolCount);
    const postSwap=await page.evaluate(()=>[...document.querySelectorAll("#deckEditor .deckTile")]
     .map(tile=>[tile.dataset.cardId,tile.querySelector("canvas").dataset.qaPortraitIdentity]));
    assert.deepEqual(postSwap.slice().sort((a,b)=>a[0].localeCompare(b[0])),
     preSwap.slice().sort((a,b)=>a[0].localeCompare(b[0])),
     "touch swap must reuse all eligible card portraits instead of rebuilding Canvas");

    // Reverse-order selection: chose the existing card FIRST, then the candidate.
    // Use genuine touch input on both engines and preserve portrait identity.
    await page.locator("#deckSelected .deckTile[data-card-id=engineer]").tap();
    assert.equal(await page.locator("#deckSelected .deckTile.pending[data-card-id=engineer]").count(),1);
    assert.match(await page.locator("#deckNotice").innerText(),/未採用/);
    await page.locator("#deckPool .deckTile[data-card-id=crusher]").tap();
    assert.equal(await page.locator("#deckSelected .deckTile[data-card-id=crusher]").count(),1);
    assert.equal(await page.locator("#deckPool .deckTile[data-card-id=engineer]").count(),1);
    // Details should never replace or edit the currently selected draft.
    await page.locator('#deckSelected .deckCell:has(.deckTile[data-card-id=crusher]) .deckDetail').click();
    await page.locator("#cardInfoOverlay").waitFor({state:"visible"});
    assert.equal(await page.locator("#cardInfoName").innerText(),"重撃砕兵");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#cardInfoOverlay").isVisible(),false);
    assert.equal(await page.locator("#deckSelected .deckTile[data-card-id=crusher]").count(),1);
    assert.equal(await page.locator("#deckSelected .deckTile").count(),10);
    assert.equal(await page.locator("#deckPool .deckTile").count(),poolCount);
    assert.equal(await page.locator("#deckEditor .deckTile.pending").count(),0);
    const reverseSwap=await page.evaluate(()=>[...document.querySelectorAll("#deckEditor .deckTile")]
     .map(tile=>[tile.dataset.cardId,tile.querySelector("canvas").dataset.qaPortraitIdentity]));
    assert.deepEqual(reverseSwap.slice().sort((a,b)=>a[0].localeCompare(b[0])),
     preSwap.slice().sort((a,b)=>a[0].localeCompare(b[0])),
     "reverse swap must also preserve every portrait Canvas");

    // Tap the same chosen tile twice to cancel the pending selection.
    await page.locator("#deckSelected .deckTile[data-card-id=crusher]").tap();
    assert.equal(await page.locator("#deckEditor .deckTile.pending").count(),1);
    await page.locator("#deckSelected .deckTile[data-card-id=crusher]").tap();
    assert.equal(await page.locator("#deckEditor .deckTile.pending").count(),0);
    // Switching highlight within the same section should not spend a slot.
    await page.locator("#deckSelected .deckTile[data-card-id=duelist]").tap();
    await page.locator("#deckSelected .deckTile[data-card-id=crusher]").tap();
    assert.equal(await page.locator("#deckSelected .deckTile.pending[data-card-id=crusher]").count(),1);
    await page.locator("#deckSelected .deckTile[data-card-id=crusher]").tap();
    assert.equal(await page.locator("#deckSelected .deckTile").count(),10);

    // Cancel must not mutate persisted deck; a future editor open begins from draft.
    await page.locator("#deckCancel").click();
    await page.evaluate(()=>window.ShokokuDeck.open());
    assert.equal(await page.locator("#deckSelected .deckTile[data-card-id=scout]").count(),1,"cancel rolls back");

    assert.equal(await page.locator("#deckCount").innerText(),"10 / 10種類");
    assert.equal(await page.locator("#deckSave").isEnabled(),true);
    await page.screenshot({path:path.join(out,engine+"-default.png")});
    await page.setViewportSize({width:820,height:500});
    const compactFooter=await page.evaluate(()=>{
     const r=document.querySelector("#deckEditorFoot").getBoundingClientRect();
     const k=document.querySelector("#deckSave").getBoundingClientRect();
     return {top:r.top,bottom:r.bottom,saveBottom:k.bottom,innerHeight};
    });
    assert.ok(compactFooter.top>=-2&&compactFooter.bottom<=compactFooter.innerHeight+2&&
     compactFooter.saveBottom<=compactFooter.innerHeight,
     "small landscape iPad must retain actions "+JSON.stringify(compactFooter));
    await page.locator('#deckSelected .deckCell:has(.deckTile[data-card-id=guardian]) .deckDetail').click();
    await page.locator("#cardInfoOverlay").waitFor({state:"visible"});
    await page.screenshot({path:path.join(out,engine+"-compact-detail.png")});
    await page.locator("#cardInfoClose").click();
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