// Practical BOT tactic scenarios in a real browser / real battle engine.
"use strict";
const {chromium}=require("playwright"),http=require("node:http"),fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=process.cwd(),server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);res.end("404");return;}
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");fs.createReadStream(p).pipe(res);
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8785,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  for(const html of ["online.html","online-ipad.html"]){
   const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true});
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   try{
    await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
    await page.goto("http://127.0.0.1:8785/"+html+"?qa=1",{waitUntil:"domcontentloaded"});
    await page.locator("#netSolo").click();
    await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
    async function run(spec){
     return page.evaluate(s=>{
      const qa=window.__shokokuQa;
      if(!qa.setBotScenario(s))throw Error("invalid scenario");
      return qa.runBotOnce();
     },spec);
    }
    const init={difficulty:"hard",energy:9,elapsed:90,fortOwners:[0,0,0],allies:[],enemies:[]};
    const barrage=await run({...init,hand:["barrage","scout","archer","engineer"],
     enemies:[{key:"infantry",x:870,y:270,walking:true},{key:"infantry",x:885,y:285,walking:true},{key:"scout",x:895,y:275,walking:true}]});
    assert.equal(barrage.action?.id,"barrage");
    assert.equal(barrage.spent,4,"delayed barrage uses actual energy");
    assert.ok(barrage.action.x>870,"anticipate moving enemy rather than shooting behind it");
    const flyer=await run({...init,hand:["archer","scout","engineer","sentinel"],
     enemies:[{key:"drone",x:900,y:280}]});
    assert.equal(flyer.action?.id,"archer","flying threat needs anti-air");
    assert.equal(flyer.spent,2);
    const giant=await run({...init,hand:["guardian","archer","scout","sentinel"],
     enemies:[{key:"tank",x:920,y:240}]});
    assert.equal(giant.action?.id,"guardian","large counter needs defender");
    assert.equal(giant.spent,7);
    const fort=await run({...init,hand:["sentinel","archer","suppress","tank"],energy:6,
     fortOwners:[0,0,2],enemies:[{key:"infantry",x:855,y:205},{key:"infantry",x:890,y:220},{key:"infantry",x:920,y:203}],
     allies:[{key:"infantry",x:840,y:207}]});
    assert.equal(fort.action?.id,"suppress","under-threat owned fort outranks giant saving");
    assert.equal(fort.spent,5);
    const ward=await run({...init,hand:["ward","tank","engineer","scout"],
     enemies:[{key:"infantry",x:880,y:280},{key:"infantry",x:890,y:320}],
     allies:[{key:"infantry",x:945,y:280},{key:"archer",x:942,y:315},{key:"infantry",x:935,y:295}]});
    assert.equal(ward.action?.id,"ward","ward only for threatened group");
    assert.equal(ward.spent,3);
    const saving=await run({...init,hand:["tank","engineer","scout","infantry"],energy:5,
     fortOwners:[2,2,2],allies:[{key:"scout",x:825,y:205},{key:"engineer",x:810,y:209}]});
    assert.equal(saving.action,null,"safe frontline can save toward 7-cost giant");
    assert.equal(saving.spent,0);
    const seven=await run({...init,hand:["tank","engineer","scout","infantry"],energy:12,
     fortOwners:[2,2,2],allies:[{key:"scout",x:820,y:205},{key:"engineer",x:810,y:210}]});
    assert.equal(seven.action?.id,"tank","spend affordable 7-cost unit with safe frontline");
    assert.equal(seven.spent,7);
    const normal=await run({...init,difficulty:"normal",energy:4,hand:["barrage","scout","engineer","archer"],
     enemies:[{key:"infantry",x:860,y:280},{key:"infantry",x:880,y:280}]});
    assert.notEqual(normal.action?.id,"barrage","normal is less accurate with 2-target clusters");
    assert.ok(normal.spent>=0&&normal.spent<=4);
    assert.deepEqual(errors,[],html+" page errors");
    console.log("PASS",html,"8 tactical scenarios: prediction, defenders, anti-air, anti-large, ward, resources");
   }finally{await page.close();}
  }
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(error=>{console.error(error);process.exitCode=1});
