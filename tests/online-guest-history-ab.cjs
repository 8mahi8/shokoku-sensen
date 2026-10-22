"use strict";
/*
 * A/B history investigation for school-iPad guest lag.
 * Four VERIFIED repository versions, not guessed snapshots:
 * V17 known good by user on 10/18, Oct19 log introduction,
 * Oct20 guest tune/main, current development candidate.
 * All are run inside same headless WebKit with identical synthetic guest
 * battle scenes. This is NOT proof of performance on physical school iPads.
 * No Firebase room or personal data is touched.
 */
const {execFileSync}=require("node:child_process");
const {webkit}=require("playwright");
const http=require("node:http");
const assert=require("node:assert/strict");
const versions=[
  ["V17-known-good","0a1566921d48c0a7981101b540f360e9fba1671b"],
  ["V20-research","21ba084a70efdc82eef7b40ed59dd0d5cfbb97c8"],
  ["V21-guest-tune","7db1c98cb51d9841f5f43941767c9972cbef932d"],
  ["PR22-candidate","HEAD"]
];
const helper=String.raw`
const _qaOriginalRegisterGame=NET.registerGame.bind(NET);
NET.registerGame=(game)=>{window.__qaGuestGame=game;return _qaOriginalRegisterGame(game);};
window.__qaBecomeGuest=count=>{
 const all=S.units,half=Math.floor(count/2);
 S.units=[...all.filter(u=>u.team===1).slice(0,half),
          ...all.filter(u=>u.team===2).slice(0,count-half)];
 Object.defineProperty(NET,"isHost",{configurable:true,get:()=>false});
 Object.defineProperty(NET,"isSolo",{configurable:true,get:()=>false});
 S.remoteSprites=new Map();
 fit();
 return {units:S.units.length,dpr:S.view.dpr};
};
window.__qaSyncGuest=seq=>{
 // Workload from the same actual S world fields used by regular snapshots;
 // do not do any real Firebase reads/writes. Quantization excluded from
 // the guest because host does it before transmission.
 for(const u of S.units)u.x+=u.team===1?.22:-.22;
 const raw=window.__qaGuestGame.world();
 const copy=JSON.parse(JSON.stringify(raw,(k,v)=>v===Infinity?1000000000:v));
 window.__qaGuestGame.apply(copy,seq);
};
`;
function loadHtml(ref){
 const original=execFileSync("git",["show",ref+":online-ipad.html"],{encoding:"utf8",maxBuffer:5e6});
 assert.equal(original.split("function start(){").length,2,"single start anchor in "+ref);
 return original.replace("function start(){",helper+"function start(){");
}
const pages=new Map(versions.map(([name,sha])=>["/"+name+".html",loadHtml(sha)]));
const server=http.createServer((req,res)=>{
 const text=pages.get(req.url.split("?")[0]);
 if(!text){res.writeHead(404);res.end("missing");return;}
 res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
 res.end(text);
});
const median=xs=>xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length/2)]||0;
(async()=>{
 await new Promise(ok=>server.listen(8787,"127.0.0.1",ok));
 let browser;
 try{
  browser=await webkit.launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:1194,height:834},deviceScaleFactor:2,hasTouch:true});
  // Interleaved order (ABBA across version+scene combinations) reduces thermal,
  // browser-startup and cached-font timing biases.
  const combinations=[];
  for(const count of [10,20,50])for(const [name] of versions)combinations.push({name,count});
  const plan=[...combinations,...combinations.slice().reverse()];
  const out=[];
  for(let i=0;i<plan.length;i++){
   const {name,count}=plan[i];
   const page=await ctx.newPage(),errors=[];
   page.on("pageerror",err=>errors.push(err.message));
   await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
   try{
    await page.goto("http://127.0.0.1:8787/"+name+".html",{waitUntil:"domcontentloaded",timeout:30000});
    await page.locator("#netSolo").waitFor({state:"visible",timeout:18000});
    await page.locator("#netSolo").click();
    await page.waitForFunction(()=>window.__shokokuQa?.snapshot()?.phase==="prep",{timeout:20000}).catch(()=>{});
    await page.waitForFunction(()=>window.__shokokuQa?.seedMassBattle&&window.__qaBecomeGuest&&window.__qaGuestGame,
       null,{timeout:18000});
    // Preserve an identical 5v5/10v10/25v25 scene from each revision's
    // built-in 130-unit load generator; only scene unit count is trimmed.
    const setup=await page.evaluate(count=>{
      if(!window.__shokokuQa.seedMassBattle())throw Error("seedMassBattle rejected");
      return window.__qaBecomeGuest(count);
    },count);
    assert.equal(setup.units,count);
    const result=await page.evaluate(async()=>{
      let seq=1,observed=0,failed=null;
      const pump=setInterval(()=>{try{window.__qaSyncGuest(++seq);observed++}catch(e){failed=String(e.message)}},180);
      await new Promise(ok=>setTimeout(ok,400));
      const begin=performance.now(),gaps=[];
      await new Promise(ok=>{
        let previous=performance.now();
        function step(t){
          gaps.push(t-previous);previous=t;
          if(t-begin>=2600)ok();else requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
      clearInterval(pump);
      const s=gaps.slice().sort((a,b)=>a-b);
      return {fps:Number((gaps.length*1000/(performance.now()-begin)).toFixed(2)),
        p95FrameMs:Number((s[Math.floor(s.length*.95)]||0).toFixed(1)),
        frames:gaps.length,applied:observed,seq,
        lastError:failed,frameError:window.__onlineFrameError||null};
    });
    assert.ok(result.fps>0&&result.applied>=8&&!result.lastError&&!result.frameError,
     "guest replay execution failed: "+JSON.stringify({name,count,result}));
    assert.equal(errors.length,0,name+" JS errors: "+errors.join("|"));
    const item={name,count,pass:i>=combinations.length?2:1,...setup,...result};
    out.push(item);
    console.log("GUEST-HISTORY-AB",JSON.stringify(item));
   }finally{await page.close();}
  }
  console.log("GUEST-HISTORY-SUMMARY",JSON.stringify(
   versions.map(([name])=>({name,byScene:[10,20,50].map(count=>{
    const rows=out.filter(o=>o.name===name&&o.count===count);
    return {count,medianFps:median(rows.map(o=>o.fps)),
      runs:rows.map(o=>o.fps),frameP95s:rows.map(o=>o.p95FrameMs)};
   })}))
  ));
  await ctx.close();
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
