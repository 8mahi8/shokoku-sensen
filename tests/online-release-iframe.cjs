// Pre-release browser regression for the *actual Google Sites paste HTML*.
// Test-only hooks are injected into an in-memory srcdoc copy, not production.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {chromium,webkit}=require("playwright");
const root=process.cwd(),out=path.join(root,"qa-release-iframe");
fs.mkdirSync(out,{recursive:true});
const bundle=fs.readFileSync(path.join(root,"online-embed.html"),"utf8");
const standAlone=fs.readFileSync(path.join(root,"online-ipad.html"),"utf8");
const net=fs.readFileSync(path.join(root,"online-net.js"),"utf8");
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8");
assert.ok(bundle.includes(net)&&bundle.includes(game),"Sites inline scripts out of sync");
assert.ok(standAlone.includes(net)&&standAlone.includes(game),"iPad inline scripts out of sync");
const qaGate='(location.hostname==="localhost"||location.hostname==="127.0.0.1")&&new URLSearchParams(location.search).has("qa")';
assert.equal(bundle.split(qaGate).length,3,"unexpected QA gate count in Sites bundle");
let srcdoc=bundle.replaceAll(qaGate,'(location.href==="about:srcdoc"||('+qaGate+'))');
const qaKey=" window.__shokokuQa={\n";
assert.equal(srcdoc.split(qaKey).length,2,"QA hook position changed");
srcdoc=srcdoc.replace(qaKey,qaKey+[
 ' releaseGateSkipPrep:()=>{if(!NET.isSolo)return false;S.prep=0;return true;},',
 ' releaseGateFault:()=>{',
 '  if(!NET.isSolo||S.phase!=="battle")return false;',
 '  const existing=S.spells;',
 '  S.spells={incoming:[],zones:null};',
 '  setTimeout(()=>{S.spells=existing;},240);',
 '  return true;',
 ' },'
].join("\n")+"\n");
const server=http.createServer((req,res)=>{
 res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
 res.end('<!doctype html><html><body style="margin:0"><h1>Sites embed test wrapper</h1><iframe id="site" sandbox="allow-scripts allow-same-origin" style="width:100%;height:750px;border:0"></iframe></body></html>');
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function run(engineName,engine,layout){
 const browser=await engine.launch({headless:true});
 const errors=[],report={browser:engineName,layout:layout.name};
 const context=await browser.newContext({viewport:layout.viewport,deviceScaleFactor:layout.dpr,hasTouch:layout.touch});
 const page=await context.newPage();
 page.on("pageerror",e=>errors.push(e.message));
 try{
  // Schools may block Firebase CDN. Offline play still must remain functional.
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8899/");
  await page.evaluate(html=>{document.getElementById("site").srcdoc=html;},srcdoc);
  await page.waitForFunction(()=>!!document.getElementById("site").contentWindow?.__shokokuQa?.snapshot,null,{timeout:30000});
  const frame=page.frameLocator("#site");
  const api=()=>page.evaluate(()=>document.getElementById("site").contentWindow.__shokokuQa.snapshot());
  const fault=()=>page.evaluate(()=>document.getElementById("site").contentWindow.__onlineFrameError||"");
  const logo=frame.locator("#netSolo");
  await logo.waitFor({state:"visible",timeout:12000});
  const canvas=await frame.locator("#field").boundingBox();
  assert.ok(canvas&&canvas.width>150&&canvas.height>120,"embedded game field must be visible");
  await logo.click();
  assert.equal(await page.evaluate(()=>document.getElementById("site").contentWindow.ShokokuNet.isSolo),true);
  assert.equal(await page.evaluate(()=>document.getElementById("site").contentWindow.__shokokuQa.releaseGateSkipPrep()),true);
  await frame.locator("#field").waitFor({state:"visible"});
  await page.waitForFunction(()=>document.getElementById("site").contentWindow.__shokokuQa.snapshot().phase==="battle",null,{timeout:12000});
  const before=await api();
  await delay(1000);
  const during=await api();
  assert.ok(during.elapsed>before.elapsed+.22,"simulation must advance inside iframe");
  assert.ok(during.seconds<before.seconds-.22,"battle timer must advance");
  assert.equal(await fault(),"","no frame errors before barrage");
  const fire=await page.evaluate(()=>document.getElementById("site").contentWindow.__shokokuQa.fireStress(1,650,330));
  assert.equal(fire,true,"barrage should be executed by real combat code");
  await delay(1100);
  const after=await api();
  assert.ok(after.elapsed>during.elapsed+.22,"battle freezes after barrage");
  assert.equal(await fault(),"","unexpected JavaScript frame error after barrage");
  assert.deepEqual(errors,[],"unexpected browser JavaScript errors");
  // Deliberately corrupt a spell array in the test-only copy. The rAF loop
  // must schedule its next frame even when one render throws an exception.
  const faultAt=after.elapsed;
  assert.equal(await page.evaluate(()=>document.getElementById("site").contentWindow.__shokokuQa.releaseGateFault()),true);
  await delay(900);
  const restored=await api();
  assert.ok(restored.elapsed>faultAt+.15,"render exception permanently stopped frame/simulation loop");
  assert.match(await fault(),/iterable|null|zones/i,"the synthetic error was not observed");
  report.elapsedAfterRecovery=restored.elapsed;
  report.canvas={width:Math.round(canvas.width),height:Math.round(canvas.height)};
  console.log("PASS RELEASE IFRAME",JSON.stringify(report));
  return report;
 }catch(e){
  const slug=engineName+"-"+layout.name;
  await page.screenshot({path:path.join(out,slug+"-FAIL.png"),fullPage:true}).catch(()=>{});
  fs.writeFileSync(path.join(out,slug+"-errors.json"),JSON.stringify({error:String(e),errors,report},null,2));
  throw e;
 }finally{await context.close();await browser.close()}
}
(async()=>{
 const reports=[];
 try{
  await new Promise(r=>server.listen(8899,"127.0.0.1",r));
  const variants=[
   {name:"desktop",viewport:{width:1194,height:834},dpr:1,touch:false},
   {name:"sites-tablet",viewport:{width:900,height:650},dpr:2,touch:true}
  ];
  for(const [name,engine] of [["chromium",chromium],["webkit",webkit]])
   for(const layout of variants)reports.push(await run(name,engine,layout));
  fs.writeFileSync(path.join(out,"results.json"),JSON.stringify(reports,null,2));
  console.log("PASS: production Google Sites HTML embedded as srcdoc in Chromium/WebKit, live battle clock, barrage and exception recovery");
 }finally{await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
