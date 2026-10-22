// Deterministic two-client Firebase RTDB simulation; no network, no npm packages.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {webcrypto}=require("node:crypto"),{performance}=require("node:perf_hooks");
const source=fs.readFileSync("online-net.js","utf8");
const store={},listeners=[],writes=[];let pushId=0,virtualNow=1000,holdNextStateWrite=false,holdStateListener=false,restFetchCount=0,heldExitWrite=false,refreshCount=0;
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const parts=p=>p.split("/").filter(Boolean);
function read(path){
 if(path===".info/connected")return true;
 if(path===".info/serverTimeOffset")return 0;
 let node=store;for(const seg of parts(path)){if(node==null)return null;node=node[seg];}
 return node===undefined?null:clone(node);
}
function write(path,value){
 const seg=parts(path);let node=store;
 for(const key of seg.slice(0,-1)){if(!node[key]||typeof node[key]!=="object")node[key]={};node=node[key];}
 const last=seg.at(-1);if(value===null)delete node[last];else node[last]=clone(value);
 writes.push(path);
}
function notify(paths){
 const touched=new Set();
 for(const w of listeners){
  if(w.event==="value"&&paths.some(p=>p===w.path||p.startsWith(w.path+"/")||w.path.startsWith(p+"/"))&&!touched.has(w)){
   if(holdStateListener&&w.path.endsWith("/state"))continue;
   touched.add(w);w.fn(new Snapshot(new Ref(w.path),read(w.path)));
  }
  if(w.event==="child_added")for(const p of paths){
   if(parts(p).length===parts(w.path).length+1&&p.startsWith(w.path+"/")&&read(p)!==null)
    w.fn(new Snapshot(new Ref(p),read(p)));
  }
 }
}
class Snapshot{
 constructor(ref,value){this.ref=ref;this.value=value}
 val(){return clone(this.value)}
}
class Ref{
 constructor(path){this.path=path}
 child(child){return new Ref(this.path+"/"+child)}
 once(){return Promise.resolve(new Snapshot(this,read(this.path)))}
 on(event,fn){
  listeners.push({path:this.path,event,fn});
  queueMicrotask(()=>{
   if(event==="value")fn(new Snapshot(this,read(this.path)));
   if(event==="child_added"){const current=read(this.path)||{};for(const k of Object.keys(current))fn(new Snapshot(this.child(k),current[k]));}
  });
 }
 off(event,fn){for(let i=listeners.length-1;i>=0;i--)if(listeners[i].path===this.path&&listeners[i].event===event&&listeners[i].fn===fn)listeners.splice(i,1)}
 async set(value){
  if(holdNextStateWrite&&this.path.endsWith("/state")){
   holdNextStateWrite=false;
   await new Promise(()=>{}); // Firebase write acknowledgement remains unresolved.
  }
  write(this.path,value);notify([this.path]);
 }
 async remove(){return this.set(null)}
 async update(fields){const paths=[];for(const [k,value] of Object.entries(fields)){const p=this.path+"/"+k;write(p,value);paths.push(p)}notify(paths)}
 async transaction(fn){
  if(heldExitWrite&&/\/players\/(host|guest)$/.test(this.path))return new Promise(()=>{});
  const old=read(this.path),value=fn(old);if(value===undefined)return {committed:false};
  await this.set(value);return {committed:true}
 }
 push(value){const ref=this.child("cmd"+(++pushId));return ref.set(value)}
 onDisconnect(){return {update:async()=>{},remove:async()=>{},cancel:async()=>{}}}
}
const database=()=>({ref:path=>new Ref(path)});
database.ServerValue={TIMESTAMP:Date.now()};
const firebase={apps:[],initializeApp(o){this.apps.push(o)},database};
function client(){
 const dom=new Map(),callbacks={};
 let pauseRaf=false;const delayedRaf=[];
 const get=id=>{
  if(!dom.has(id)){
   const el={textContent:"",value:"",disabled:false,hidden:false,
    classList:{add(){},remove(){},toggle(){}},select(){},setAttribute(name,v){this[name]=v},
    addEventListener(name,fn){this["on"+name]=fn}};
   dom.set(id,el);
  }
  return dom.get(id);
 };
 const document={getElementById:get,querySelectorAll:()=>[],body:{classList:{add(){},remove(){},toggle(){}}},addEventListener(name,fn){callbacks[name]=fn}};
 const context={window:{crypto:webcrypto,firebase},crypto:webcrypto,document,firebase,
  console,Date,Math,Uint32Array,Promise,URL,URLSearchParams,performance:{now:()=>virtualNow},
  navigator:{clipboard:{writeText:async()=>{}}},location:{reload(){refreshCount++},hostname:"localhost",search:""},setTimeout,clearTimeout,
  fetch:async url=>{
   restFetchCount++;
   const path=new URL(url).pathname.replace(/^\//,"").replace(/\.json$/,"");
   return {ok:true,status:200,json:async()=>read(path)};
  },
  requestAnimationFrame:fn=>pauseRaf?delayedRaf.push(fn):queueMicrotask(()=>fn(performance.now())),setInterval,clearInterval};
 vm.runInNewContext(source,context,{filename:"online-net.js"});
 callbacks.DOMContentLoaded();
 const api=context.window.ShokokuNet;
 const game={starts:0,resets:0,results:0,accepted:[],received:[],
  data:{phase:"prep",units:[],energy:[0,8,8],capitals:[],forts:[]},
  begin(){this.starts++;this.data={...this.data,phase:"prep",units:[]}},
  world(){return this.data},
  accept(cmd){this.accepted.push(cmd);this.data.units.push({uid:this.accepted.length,key:cmd.id,x:cmd.x,y:cmd.y});return true},
  apply(data,seq){this.received.push({data,seq})},
  showResult(){this.results++},
  resetForLobby(){this.resets++}
 };
 api.registerGame(game);
 return {api,game,get,pauseFrames:value=>{pauseRaf=value;
  if(!value)for(const fn of delayedRaf.splice(0))queueMicrotask(()=>fn(performance.now()));
 },click:async id=>{const el=get(id);assert.ok(el.onclick,"no click listener "+id);return el.onclick()}};
}
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};
(async()=>{
 const host=client(),guest=client();
 await settle();
 await host.click("netCreate");await settle();
 const code=host.get("netRoom").textContent;
 assert.match(code,/^[0-9]{5}$/);
 guest.get("netJoinCode").value=code;
 await guest.click("netJoin");await settle();
 assert.equal(guest.api.team,2);
 assert.equal(host.api.team,1);
 assert.equal(host.get("netSeat").textContent,"青軍／ホスト");
 assert.equal(guest.get("netSeat").textContent,"赤軍／ゲスト");
 await host.click("netReady");
 await guest.click("netReady");await settle();
 assert.equal(host.get("netStart").disabled,false);
 await host.click("netStart");await settle();
 assert.equal(host.game.starts,1);
 assert.ok(guest.game.received.length>0,"guest should receive initial snapshot");
 guest.api.sendCommand({id:"infantry",x:1060,y:320});await settle();
 assert.equal(host.game.accepted.length,1);
 assert.ok(guest.game.received.at(-1).data.units.length===1,"guest should see summons");
 // A failed JSON snapshot must not leave the host publisher permanently busy.
 // The next valid frame can always be transmitted after an invalid transient field.
 const beforeSerializationFailure=guest.game.received.at(-1).seq;
 host.game.data.temporaryUnsupported=BigInt(123);
 host.api.maybePublish(true);await settle();
 assert.equal(guest.game.received.at(-1).seq,beforeSerializationFailure,
  "invalid snapshot must never partially upload");
 delete host.game.data.temporaryUnsupported;
 host.game.data.elapsed=4.1234567;
 host.api.maybePublish(true);await settle();
 assert.ok(guest.game.received.at(-1).seq>beforeSerializationFailure,
  "host publisher must recover after JSON encoding failure");
 assert.equal(guest.game.received.at(-1).data.elapsed,4.123,
  "guest receives quantized timing without changing host's exact time");
 assert.equal(host.game.data.elapsed,4.1234567,"host physics remains unquantized");
 host.api.finish({result:"win",reason:"test winner"});await settle();
 assert.equal(guest.api.resultForMe(),"lose");
 assert.equal(guest.game.results,1);
 await host.api.rematch();await settle();
 assert.equal(read("shokokuRooms1v1/"+code+"/meta").round,2);
 assert.equal(host.game.resets,1);
 assert.equal(guest.game.resets,1);
 assert.equal(read("shokokuRooms1v1/"+code+"/state"),null);
 await host.click("netReady");await guest.click("netReady");await settle();
 await host.click("netStart");await settle();
 assert.equal(host.game.starts,2);
 // A stuck Firebase .set() promise must not silence all future host snapshots.
 const beforeFreeze=guest.game.received.at(-1).seq;
 holdNextStateWrite=true;
 virtualNow+=250;
 host.game.data.elapsed=13;
 host.api.maybePublish(true);await settle();
 assert.equal(guest.game.received.at(-1).seq,beforeFreeze,"simulated blocked write should not reach guest");
 virtualNow+=3200;
 host.game.data.elapsed=17;
 host.api.maybePublish();await settle();
 assert.ok(guest.game.received.at(-1).seq>beforeFreeze,"publisher must recover after a stuck acknowledgement");
 assert.equal(guest.game.received.at(-1).data.elapsed,17);
 // A stalled Firebase listener with fresh server state must recover via a
 // bounded one-shot read while the Canvas/game loop continues independently.
 // A delayed iframe rAF must not strand already received snapshots forever.
 const beforeRafStall=guest.game.received.at(-1).seq;
 guest.pauseFrames(true);
 host.game.data.elapsed=19;
 host.api.maybePublish(true);await settle();
 assert.equal(guest.game.received.at(-1).seq,beforeRafStall,"pending until callback or timeout");
 await new Promise(resolve=>setTimeout(resolve,720));await settle();
 assert.ok(guest.game.received.at(-1).seq>beforeRafStall,"fallback applies latest world");
 assert.equal(guest.game.received.at(-1).data.elapsed,19,"fallback reads newest state");
 guest.pauseFrames(false);await settle();
 const beforeListenerPause=guest.game.received.at(-1).seq;
 holdStateListener=true;
 virtualNow+=5000;
 host.game.data.elapsed=22;
 host.api.maybePublish(true);await settle();
 assert.equal(guest.game.received.at(-1).seq,beforeListenerPause,"listener stalls are simulated");
 guest.api.checkGuestSync();await settle();
 assert.ok(restFetchCount>0,"guest must bypass the stale SDK listener using HTTP REST");
 assert.equal(guest.game.received.at(-1).data.elapsed,22,"guest REST fallback fetches the latest world");
 holdStateListener=false;
 const receivedCount=guest.game.received.length;
 await new Ref("shokokuRooms1v1/"+code+"/state").set({seq:999,round:1,world:{phase:"battle",units:[{key:"stale"}]}});
 await settle();
 assert.equal(guest.game.received.length,receivedCount,"stale round should be ignored");
 // Simulate Firebase delivering finished -> next-round playing directly.
 // The skipped short lobby event must not keep the guest's old seq cursor.
 host.api.finish({result:"win",reason:"next game rollover"});await settle();
 const hostResets=host.game.resets,guestResets=guest.game.resets;
 await new Ref("shokokuRooms1v1/"+code+"/meta").update({round:3,status:"playing"});
 await settle();
 assert.equal(host.game.resets,hostResets+1,"host resets on round number change");
 assert.equal(guest.game.resets,guestResets+1,"guest resets without intermediate lobby notification");
 assert.equal(host.game.starts,3,"host starts third round after coalesced transition");
 assert.equal(read("shokokuRooms1v1/"+code+"/state").round,3,"new round snapshots carry the correct round");

 const oldGuestMeta=listeners.filter(l=>l.path==="shokokuRooms1v1/"+code+"/meta"&&l.event==="value").at(-1);
 const oldGuestPlayers=listeners.filter(l=>l.path==="shokokuRooms1v1/"+code+"/players"&&l.event==="value").at(-1);
 assert.ok(oldGuestMeta&&oldGuestPlayers);
 await guest.api.resetLobby();await settle();
 assert.equal(read("shokokuRooms1v1/"+code+"/players/guest/online"),false,"explicit leave must mark guest offline");
 assert.equal(guest.get("netRoom").textContent,"-----","new game returns to room picker");
 assert.equal(guest.get("netCreate").disabled,false,"new game allows creation without reload");
 assert.equal(refreshCount,0,"no iframe reload for a new game");
 await guest.click("netCreate");await settle();
 const secondRoom=guest.get("netRoom").textContent;
 assert.match(secondRoom,/^[0-9]{5}$/,"another new room can be created in the same page");
 const beforeGhost=guest.game.resets;
 oldGuestMeta.fn(new Snapshot(new Ref("shokokuRooms1v1/"+code+"/meta"),{status:"playing",round:99}));
 oldGuestPlayers.fn(new Snapshot(new Ref("shokokuRooms1v1/"+code+"/players"),{guest:{online:false}}));
 assert.equal(guest.game.resets,beforeGhost,"old room notifications must not reset the next game");
 assert.equal(guest.get("netRoom").textContent,secondRoom,"old room notifications must not replace new room identity");
 heldExitWrite=true;
 guest.api.resetLobby(); // Its Firebase cleanup will never resolve.
 assert.equal(guest.get("netRoom").textContent,"-----","a stalled cleanup must not freeze new game");
 assert.equal(guest.get("netCreate").disabled,false,"room picker remains interactive during stalled cleanup");
 assert.equal(refreshCount,0,"no iframe navigation even on stalled Firebase");
 // Host alone can add an AI-controlled red guest into the real room.
 heldExitWrite=false;
 const botHost=client();await settle();
 await botHost.click("netCreate");await settle();
 const botCode=botHost.get("netRoom").textContent;
 assert.equal(botHost.get("netHostBot").hidden,false,"host sees add BOT button");
 await botHost.click("netHostBot");await settle();
 const botSeat=read("shokokuRooms1v1/"+botCode+"/players/guest");
 assert.equal(botSeat.localBot,true);assert.equal(botSeat.ready,true);
 assert.equal(botHost.api.hostBot,true);assert.equal(botHost.api.botActive,true);
 await botHost.click("netReady");await settle();
 assert.equal(botHost.get("netStart").disabled,false);
 await botHost.click("netStart");await settle();
 assert.equal(botHost.game.starts,1,"single-device online BOT match starts");
 botHost.api.finish({result:"win",reason:"BOT test"});await settle();
 await botHost.api.rematch();await settle();
 assert.equal(read("shokokuRooms1v1/"+botCode+"/players/guest/ready"),true,"BOT auto-ready on rematch");
 await botHost.click("netHostBot");await settle();
 assert.equal(read("shokokuRooms1v1/"+botCode+"/players/guest").online,false,"BOT can be removed");
 assert.equal(botHost.api.hostBot,false);
 // The released BOT seat must be claimable by a genuine friend.
 const laterFriend=client();await settle();
 laterFriend.get("netJoinCode").value=botCode;
 await laterFriend.click("netJoin");await settle();
 assert.equal(laterFriend.api.team,2,"human guest can reclaim released BOT seat");
 assert.equal(botHost.get("netHostBot").hidden,true,"BOT add cannot evict real guest");
 await laterFriend.api.resetLobby();await settle();
 await botHost.click("netHostBot");await settle();
 botHost.api.resetLobby();await settle();
 assert.equal(read("shokokuRooms1v1/"+botCode+"/players/guest").online,false,"BOT cleaned on host leave");
 assert.equal(read("shokokuRooms1v1/"+botCode+"/players/host").online,false,"host seat cleaned on exit");
 assert.equal(read("shokokuRooms1v1/"+botCode+"/players/guest").ready,false,"BOT no longer ready after exit");
 // No match archiving, research consent or extra Firebase writes in simple 1v1.
 assert.equal(host.api.archiveRound,undefined,"host cannot upload match research");
 assert.equal(guest.api.archiveRound,undefined,"guest cannot upload match research");
 assert.equal(host.api.setResearchConsent,undefined);
 assert.equal(guest.api.setArchiveConsent,undefined);
 assert.ok(writes.every(p=>p.startsWith("shokokuRooms1v1/")),"must never write BRAWL rooms");
 console.log("PASS: 1v1, new-round sequence rollover, non-blocking new game, no iframe reload, stuck publisher and listener recovery");
})().catch(e=>{console.error(e);process.exitCode=1});
