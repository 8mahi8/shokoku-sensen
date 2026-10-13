// Live two-Chromium-context end-to-end smoke test. Runs in GitHub Actions only.
// Creates one room in shokokuRooms1v1, then deletes that same room after closing both tabs.
"use strict";
const {chromium}=require("playwright"),fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const assert=require("node:assert/strict");
const root=process.cwd(),urlDB="https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1";
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end("not found");return}
 res.writeHead(200,{"content-type":mime[path.extname(file)]||"application/octet-stream","cache-control":"no-store"});
 fs.createReadStream(file).pipe(res);
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const deadline=async (f,label,timeout=18000)=>{
 const end=Date.now()+timeout;let error;
 while(Date.now()<end){try{const v=await f();if(v)return v}catch(e){error=e}await delay(300)}
 throw Error("Timed out "+label+" "+(error?.message||""));
};
(async()=>{
 let browser,code="",pages=[];
 try{
  await new Promise(r=>server.listen(8765,"127.0.0.1",r));
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const hostCtx=await browser.newContext({viewport:{width:1194,height:834}});
  const guestCtx=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true});
  const host=await hostCtx.newPage(),guest=await guestCtx.newPage();
  pages=[host,guest];const errors=[];
  for(const [name,p] of [["host",host],["guest",guest]])p.on("pageerror",err=>errors.push(name+": "+err.message));
  await Promise.all([host.goto("http://127.0.0.1:8765/online.html"),guest.goto("http://127.0.0.1:8765/online.html")]);
  for(const p of pages)await deadline(async()=>((await p.locator("#netStatus").innerText()).includes("接続OK")), "Firebase connection",30000);
  await host.locator("#netCreate").click();
  code=await deadline(async()=>{const v=(await host.locator("#netRoom").innerText()).trim();return /^[0-9]{5}$/.test(v)?v:null},"host create",22000);
  await guest.locator("#netJoinCode").fill(code);await guest.locator("#netJoin").click();
  await deadline(async()=>(await guest.locator("#netRoom").innerText()).trim()===code,"guest join");
  await host.locator("#netReady").click();await guest.locator("#netReady").click();
  await deadline(async()=>await host.locator("#netStart").isEnabled(),"both ready");
  await host.locator("#netStart").click();
  for(const [name,p] of [["host",host],["guest",guest]]){
   await deadline(async()=>p.locator("#overlay").evaluate(el=>el.classList.contains("hidden")),name+" start");
  }
  async function summon(p,team){
   await p.locator('button.card[data-id="infantry"]').click();
   const rect=await p.locator("#field").boundingBox();
   assert.ok(rect&&rect.width>200&&rect.height>150,"canvas visible");
   for(const fraction of (team===1?[.14,.08,.22]:[.86,.92,.78]))
    await p.mouse.click(rect.x+rect.width*fraction,rect.y+rect.height*.48);
  }
  await summon(host,1);await summon(guest,2);
  const stateURL=urlDB+"/"+code+"/state.json";
  const state=async()=>{const response=await fetch(stateURL);return response.ok?response.json():null};
  const packet=await deadline(async()=>{
   const d=await state();
   const units=d?.world?.units||[];
   return units.some(u=>u.team===1)&&units.some(u=>u.team===2)?d:null;
  },"both blue/red infantry synced to Firebase",20000);
  assert.ok(packet.world.energy?.length>=3&&packet.world.capitals?.length===2&&packet.world.forts?.length===3);
  if(errors.length)throw Error("Browser JavaScript errors: "+errors.slice(0,8).join(" | "));
  console.log("PASS: two real Chromium pages joined Firebase room "+code+", summoned both teams, synchronized units/energy/capitals/forts");
 }finally{
  for(const p of pages){try{await p.close()}catch{}}
  if(browser)try{await browser.close()}catch{}
  if(code){
   // Let onDisconnect presence operations finish before removing our own room.
   await delay(750);
   const u=urlDB+"/"+code+".json";
   const del=await fetch(u,{method:"DELETE"});
   if(!del.ok)console.error("WARNING: Cleanup failed, HTTP "+del.status+" for test room "+code);
   else {
    const check=await fetch(u);
    const payload=await check.text();
    console.log("CLEANUP:",payload.trim()==="null"?"confirmed":"not confirmed");
   }
  }
  await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
