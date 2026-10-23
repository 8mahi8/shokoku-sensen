// Headless iPad-sized visual regression/geometry QA for online and Google Sites HTML.
"use strict";
const {chromium}=require("playwright");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const root=process.cwd();fs.mkdirSync("qa-ipad-screens",{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}
 res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(8766,"127.0.0.1",r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const profiles=[
   {name:"ipad-landscape",width:1194,height:834},
   {name:"ipad-portrait",width:820,height:1100},
   {name:"sites-frame-compact",width:900,height:520}
  ];
  for(const source of ["online.html","online-ipad.html"]){
   for(const profile of profiles){
    const ctx=await browser.newContext({viewport:profile,hasTouch:true,isMobile:false,deviceScaleFactor:2});
    const page=await ctx.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://127.0.0.1:8766/"+source,{waitUntil:"domcontentloaded"});
    await page.locator(".card").first().waitFor({timeout:20000});
    const m=await page.evaluate(()=>{
     const rect=x=>{const r=document.querySelector(x).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
     const cards=[...document.querySelectorAll(".card")].map(el=>{
      const r=el.getBoundingClientRect();return {width:r.width,height:r.height,bottom:r.bottom,top:r.top}});
     return {cards,portraitFit:getComputedStyle(document.querySelector(".cardPortrait")).objectFit,
      bottom:rect("#bottom"),field:rect("#fieldArea"),header:rect("#header"),
      viewport:{w:innerWidth,h:innerHeight},dpr:document.querySelector("#field").width/document.querySelector("#field").getBoundingClientRect().width,
      nav:rect("#cameraNav"),nextMeter:rect("#resourceNext"),
      nextFill:rect(".nextEnergyTrack"),nextLabel:document.querySelector("#nextEnergyLabel")?.textContent,
      nextAria:document.querySelector("#resourceNext")?.getAttribute("aria-valuenow")};
    });
    assert.equal(m.cards.length,5,source+" expected 5 playable cards");
    assert.equal(m.portraitFit,"contain",source+" portraits must preserve aspect ratio");
    assert.ok(m.cards.every(c=>c.width>=90),source+" narrow cards "+JSON.stringify(m));
    assert.ok(m.cards.every(c=>c.height>=profile.height*.095),source+" squashed cards "+JSON.stringify(m));
    assert.ok(m.cards.every(c=>c.bottom<=m.bottom.bottom+2),source+" card clipped by footer "+JSON.stringify(m));
    assert.ok(m.field.h>=190,source+" battlefield too short "+JSON.stringify(m));
    assert.ok(m.dpr<=1.47,source+" iPad canvas still using excessive DPR "+JSON.stringify(m));
    assert.ok(m.nextMeter.w>=55,source+" next-energy bar too narrow "+JSON.stringify(m));
    assert.ok(m.nextFill.h>=6&&m.nextFill.w>=55,source+" next-energy track not visible "+JSON.stringify(m));
    assert.ok(m.nextLabel,source+" next-energy label missing");
    assert.ok(m.nextAria!==null,source+" next-energy progressbar ARIA missing");
    assert.ok(!errors.length,source+" javascript errors: "+errors.join("|"));
    await page.addStyleTag({content:"#onlinePanel{display:none!important}#overlay{display:none!important}"});
    await page.screenshot({path:"qa-ipad-screens/"+source.replace(".html","")+"-"+profile.name+".png",fullPage:false});
    console.log("PASS:",source,profile.name,JSON.stringify({cards:m.cards.map(c=>Math.round(c.width)+"x"+Math.round(c.height)),field:Math.round(m.field.h),dpr:+m.dpr.toFixed(2)}));
    await ctx.close();
   }
  }
 }finally{
  if(browser)await browser.close();
  await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
