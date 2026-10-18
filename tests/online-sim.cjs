// Deterministic two-client Firebase RTDB simulation; no network, no npm packages.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {webcrypto}=require("node:crypto"),{performance}=require("node:perf_hooks");
const source=fs.readFileSync("online-net.js","utf8");
const store={},listeners=[],writes=[];let pushId=0;
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
 async set(value){write(this.path,value);notify([this.path])}
 async remove(){return this.set(null)}
 async update(fields){const paths=[];for(const [k,value] of Object.entries(fields)){const p=this.path+"/"+k;write(p,value);paths.push(p)}notify(paths)}
 async transaction(fn){const old=read(this.path),value=fn(old);if(value===undefined)return {committed:false};await this.set(value);return {committed:true}}
 push(value){const ref=this.child("cmd"+(++pushId));return ref.set(value)}
 onDisconnect(){return {update:async()=>{},cancel:async()=>{}}}
}
const database=()=>({ref:path=>new Ref(path)});
database.ServerValue={TIMESTAMP:Date.now()};
const firebase={apps:[],initializeApp(o){this.apps.push(o)},database};
function client(){
 const dom=new Map(),callbacks={};
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
  console,Date,Math,Uint32Array,Promise,performance,
  navigator:{clipboard:{writeText:async()=>{}}},location:{reload(){}},setTimeout,clearTimeout,
  requestAnimationFrame:fn=>queueMicrotask(()=>fn(performance.now()))};
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
 return {api,game,get,click:async id=>{const el=get(id);assert.ok(el.onclick,"no click listener "+id);return el.onclick()}};
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
 const receivedCount=guest.game.received.length;
 await new Ref("shokokuRooms1v1/"+code+"/state").set({seq:999,round:1,world:{phase:"battle",units:[{key:"stale"}]}});
 await settle();
 assert.equal(guest.game.received.length,receivedCount,"stale round should be ignored");
 await guest.api.resetLobby();await settle();
 assert.equal(read("shokokuRooms1v1/"+code+"/players/guest/online"),false,"explicit leave must mark guest offline");
 assert.ok(writes.every(p=>p.startsWith("shokokuRooms1v1/")),"must never write BRAWL rooms");
 console.log("PASS: two-player create/join, ready/start, commands/snapshot, winner, rematch, stale packet, isolated path");
})().catch(e=>{console.error(e);process.exitCode=1});
