"use strict";
// Pure VM test: never contacts the live Firebase project.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync("online-research.js","utf8");
const memory=new Map(),published=[];
let currentHost=true,refuse=false;
const storage={getItem:k=>memory.get(k)||null,
 setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const document={readyState:"loading",addEventListener(){},
 getElementById(){return null},querySelectorAll(){return []}};
const window={SHOKOKU_CLOUD_RESEARCH_READY:true,ShokokuNet:{
 get isHost(){return currentHost},
 publishResearch:async match=>{
  if(refuse)throw Error("PERMISSION_DENIED");
  published.push(JSON.parse(JSON.stringify(match)));return {saved:true};
 }
}};
vm.runInNewContext(source,{document,window,localStorage:storage,
 location:{hostname:"localhost"},console,Date,JSON,Array,Math,Number,Promise});
const research=window.ShokokuResearch,qa=window.__shokokuResearchQa;
const world=(t=0)=>({elapsed:t,difficulty:"hard",guestControl:"human",
 energy:[0,7,6],capitals:[{hp:3000},{hp:2800}],
 forts:[{owner:1,hp:12},{owner:0,hp:15},{owner:2,hp:14}],
 units:[{team:1,key:"scout",x:400,y:250,hp:120},
  {team:2,key:"archer",x:830,y:250,hp:70}],
 roomCode:"SHOULD_NOT_LEAK",clientId:"SECRET_ID",userName:"PRIVATE_NAME"});
const update=(cloud,local=true,ownCloud=cloud)=>research.syncOnline({
 inRoom:true,ownConsent:local,bothConsent:local,ownCloudConsent:ownCloud,
 bothCloudConsent:cloud,playing:false});
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};
(async()=>{
 assert.equal(research.cloudAllowed,false,"cloud opt-in must default off");
 update(false);
 research.begin("online",world());
 research.action({t:1,phase:"battle",team:1,card:"scout",x:300,y:222,
  energyBefore:9,ownHand:["scout","archer","tank","ward"]});
 research.finish(world(30));await flush();
 assert.equal(published.length,0,"local-only match must not upload");
 assert.equal(qa.get().matches.length,1,"existing local history preserved");
 // Cloud permission is not an implied consequence of the local checkbox.
 update(true);
 assert.equal(research.cloudAllowed,true);
 research.begin("online",world());
 assert.equal(research.active,true);
 research.action({t:2,phase:"battle",team:2,card:"archer",x:920,y:220,
  energyBefore:4,ownHand:["archer","barrage"]});
 research.finish(world(32));await flush();
 assert.equal(published.length,1,"one active opted-in online match uploaded");
 const saved=published[0];
 assert.equal(saved.schema,1);assert.equal(saved.mode,"online");
 assert.equal(saved.matchType,"human-vs-human");
 assert.equal(saved.actions.length,1);
 assert.equal(saved.samples.length,2);
 assert.ok(saved.result&&[0,1,2].includes(saved.result.winner));
 for(const forbidden of ["SHOULD_NOT_LEAK","SECRET_ID","PRIVATE_NAME",
  "roomCode","clientId","userName","cloudAtStart"]){
  assert.ok(!JSON.stringify(saved).includes(forbidden),
   forbidden+" must not appear in uploaded observations");
 }
 // Changing to true after a match begins cannot retroactively authorize upload.
 update(false);research.begin("online",world());update(true);
 research.finish(world(34));await flush();
 assert.equal(published.length,1,"mid-game late consent not sufficient");
 // Withdrawing either side during play blocks uploads without losing local logs.
 update(true);research.begin("online",world());update(false);
 research.finish(world(36));await flush();
 assert.equal(published.length,1,"mid-game consent revocation prevents upload");
 // Withdrawal of local logging throws away the entire active observation.
 update(true);research.begin("online",world());
 const countBefore=qa.get().matches.length;update(false,false);
 assert.equal(research.active,false);
 research.finish(world(37));await flush();
 assert.equal(qa.get().matches.length,countBefore,"withdrawn match discarded");
 assert.equal(published.length,1);
 // Only the authoritative host can create an online research record.
 currentHost=false;update(true);
 research.begin("online",world());assert.equal(research.active,false);
 currentHost=true;
 // Bot/solo runs are deliberately local even if old room flags were ON.
 research.begin("solo",world());research.finish(world(38));await flush();
 assert.equal(published.length,1,"solo gameplay never uploads");
 // Cloud failure must leave the local export intact.
 update(true);refuse=true;
 const localBefore=qa.get().matches.length;
 research.begin("online",world());research.finish(world(39));await flush();
 assert.equal(qa.get().matches.length,localBefore+1);
 assert.equal(published.length,1);
 // No more than 12 upload attempts per client-day (defense-in-depth only).
 refuse=false;qa.clear();memory.delete("shokoku-cloud-daily-v1");
 for(let i=0;i<14;i++){
  update(true);research.begin("online",world());research.finish(world(40+i));await flush();
 }
 assert.equal(published.length,13,"one prior success plus only twelve daily uploads");
 assert.equal(JSON.parse(memory.get("shokoku-cloud-daily-v1")).count,12);
 console.log("PASS: cloud opt-in defaults OFF, bilateral approval, revocation, anonymous whitelist, host-only, quota and local fallback");
})().catch(e=>{console.error(e);process.exitCode=1});
