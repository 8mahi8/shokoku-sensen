// Regression: after a time-over result, a .93s stale clock is rendered as 00:00.
// The host fixture injects a QA-only hook into the localhost HTTP response
// while using real Firebase, real host result flow and a WebKit guest client.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {chromium,webkit}=require("playwright");
const root=process.cwd(),BASE="https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1";
const out=path.join(root,"qa-online-timeover-ui");fs.mkdirSync(out,{recursive:true});
const src=fs.readFileSync(path.join(root,"online-game.js"),"utf8");
const anchor="window.__shokokuQa={";
assert.equal(src.split(anchor).length,2,"QA hook anchor is unique");
const extra=[
 " resultTimeoverQa:()=>{",
 "  if(!NET.isHost||S.phase!==\"battle\")return false;",
 "  S.seconds=.93;",
 "  end(\"win\",\"時間切れ！ 首都の残りHP割合で判定した。\");",
 "  return true;",
 " },",
 " resultCastleQa:()=>{",
 "  if(!NET.isHost||S.phase!==\"battle\")return false;",
 "  S.capitals[0].hp=2700;S.capitals[1].hp=0;",
 "  end(\"win\",\"首都が破壊された！\");",
 "  return true;",
 " },"
].join("\n");
const modified=src.replace(anchor,anchor+extra);
const server=http.createServer((req,res)=>{
 const route=decodeURIComponent(req.url.split("?")[0]);
 const file=path.resolve(root,"."+route);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("missing");return;
 }
 res.writeHead(200,{"Content-Type":file.endsWith(".js")?"text/javascript; charset=utf-8":
  "text/html; charset=utf-8","Cache-Control":"no-store"});
 if(route==="/online-game.js"){res.end(modified);return;}
 fs.createReadStream(file).pipe(res);
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label,timeout=20000)=>{
 const end=Date.now()+timeout;let last;
 while(Date.now()<end){
  try{if(await fn())return;}catch(e){last=e;}
  await sleep(160);
 }
 throw Error("Timeout "+label+(last?" / "+last.message:""));
};
(async()=>{
 let hb,gb,host,guest,code="",started=false;
 const errors=[];
 try{
  await new Promise(r=>server.listen(8785,"127.0.0.1",r));started=true;
  hb=await chromium.launch({headless:true,args:["--no-sandbox"]});
  gb=await webkit.launch({headless:true});
  host=await hb.newPage({viewport:{width:1024,height:650}});
  guest=await gb.newPage({viewport:{width:1024,height:650},hasTouch:true});
  for(const [label,page] of [["host",host],["guest",guest]])
   page.on("pageerror",e=>errors.push(label+": "+e.message));
  await Promise.all([
   host.goto("http://127.0.0.1:8785/online.html?qa=1"),
   guest.goto("http://127.0.0.1:8785/online-ipad.html?qa=1")
  ]);
  for(const page of [host,guest])
   await wait(async()=>(await page.locator("#netStatus").innerText()).includes("接続OK"),
    "Firebase status",30000);
  await host.locator("#netCreate").click();
  await wait(async()=>{
   code=(await host.locator("#netRoom").innerText()).trim();
   return /^\d{5}$/.test(code);
  },"new disposable room");
  await guest.locator("#netJoinCode").fill(code);
  await guest.locator("#netJoin").click();
  await wait(async()=>await guest.locator("#netRoom").innerText()===code,"guest joined");
  await guest.locator("#netReady").click();await host.locator("#netReady").click();
  await wait(async()=>host.locator("#netStart").isEnabled(),"both READY");
  await host.locator("#netStart").click();
  await wait(async()=>(await host.evaluate(()=>window.__shokokuQa.snapshot().phase))==="battle" &&
   (await guest.evaluate(()=>window.__shokokuQa.snapshot().phase))==="battle",
   "natural prep completed",35000);
  assert.equal(await host.evaluate(()=>window.__shokokuQa.resultTimeoverQa()),true);
  await wait(async()=>(await host.locator("#dialogTitle").innerText())==="勝利！" &&
   (await guest.locator("#dialogTitle").innerText())==="敗北",
   "both players received result",18000);
  for(const [name,page] of [["host",host],["guest",guest]]){
   assert.match(await page.locator("#dialogText").innerText(),/時間切れ/);
   assert.match(await page.locator("#rules").innerText(),/残り時間：00:00/,
    name+" displays time-over 00:00 despite .93s clock");
   await page.screenshot({path:path.join(out,name+"-timeover-00-00.png"),timeout:16000});
  }
  // Second room round: final castle HP must come from the authoritative
  // result node even if the guest has not applied the terminal world packet.
  await host.locator("#start").click();
  await wait(async()=>await host.locator("#onlinePanel").isVisible()&&
   await guest.locator("#onlinePanel").isVisible(),"round-two lobby",16000);
  await guest.locator("#netReady").click();await host.locator("#netReady").click();
  await wait(async()=>host.locator("#netStart").isEnabled(),"round-two ready");
  await host.locator("#netStart").click();
  await wait(async()=>(await host.evaluate(()=>window.__shokokuQa.snapshot().phase))==="battle"&&
   (await guest.evaluate(()=>window.__shokokuQa.snapshot().phase))==="battle",
   "round-two battle",35000);
  assert.equal(await host.evaluate(()=>window.__shokokuQa.resultCastleQa()),true);
  await wait(async()=>(await host.locator("#dialogTitle").innerText())==="勝利！"&&
   (await guest.locator("#dialogTitle").innerText())==="敗北",
   "castle result on both devices",16000);
  assert.match(await host.locator("#dialogText").innerText(),/首都が破壊された/);
  assert.match(await guest.locator("#dialogText").innerText(),/首都が破壊された/,
   "guest must show the CURRENT round result, not stale prior time-up");
  const hostText=await host.locator("#rules").innerText(),
        guestText=await guest.locator("#rules").innerText();
  assert.match(hostText,/自軍首都：2700 \/ 3000/);
  assert.match(hostText,/敵軍首都：0 \/ 3000/);
  assert.match(guestText,/自軍首都：0 \/ 3000/);
  assert.match(guestText,/敵軍首都：2700 \/ 3000/);
  await host.screenshot({path:path.join(out,"host-castle-final-hp.png"),timeout:16000});
  await guest.screenshot({path:path.join(out,"guest-castle-final-hp.png"),timeout:16000});
  console.log("PASS: exact terminal castle HP 2700/0 shared by host and WebKit guest");
  assert.deepEqual(errors,[],"no page exceptions");
  console.log("PASS: 00:00 time-over result on Chromium host and WebKit guest with stale .93s final world");
 }finally{
  if(/^\d{5}$/.test(code)){
   const response=await fetch(BASE+"/"+code+".json",{method:"DELETE"}).catch(()=>null);
   console.log("QA TEMP ROOM CLEANUP",response?.status??"ERROR");
  }
  await guest?.close().catch(()=>{});
  await host?.close().catch(()=>{});
  await gb?.close().catch(()=>{});
  await hb?.close().catch(()=>{});
  if(started)await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error("TIMEOVER RESULT UI FAILED",e);process.exitCode=1});
