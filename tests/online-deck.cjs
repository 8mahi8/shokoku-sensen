"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync("online-deck.js","utf8");
const base=["scout","engineer","archer","barrage","sentinel","suppress","guardian","ward","drone","tank"];
const catalog=Object.fromEntries(["infantry",...base].map(id=>[id,{name:id,cost:2,hitAir:true}]));
function boot(saved=null,throwStorage=false){
 const memory=new Map();if(saved!==null)memory.set("shokoku-deck-v1",JSON.stringify(saved));
 const storage={getItem:key=>{if(throwStorage)throw Error("storage blocked");return memory.get(key)||null},
  setItem:(key,value)=>{if(throwStorage)throw Error("storage blocked");memory.set(key,value)}};
 const window={};
 const document={addEventListener(){},getElementById(){return null}};
 vm.runInNewContext(source,{window,document,localStorage:storage,console});
 return {api:window.ShokokuDeck,memory};
}
const a=boot();a.api.configure(catalog);
assert.equal(a.api.current().length,10);
assert.ok(a.api.validate(base));
assert.ok(!a.api.validate(base.slice(1)),"nine candidates rejected");
assert.ok(!a.api.validate([...base,"scout"]),"eleven rejected");
assert.ok(!a.api.validate([...base.slice(0,9),"scout"]),"duplicate rejected");
assert.ok(!a.api.validate(["infantry",...base.slice(0,9)]),"permanent infantry rejected");
assert.ok(!a.api.validate([...base.slice(0,9),"unknown"]),"unregistered card rejected");
const next={...catalog,newGuard:{name:"newGuard",cost:5,hitAir:true,deckEligible:true}};
a.api.configure(next);
assert.equal(a.api.eligible().length,11,"new class appears without an editor ID table");
assert.ok(a.api.validate([...base.slice(0,9),"newGuard"]),"new character can replace any old card");
assert.ok(!a.api.validate([...base.slice(0,9),"infantry"]),"infantry remains out of deck");
const hidden={...next,newGuard:{...next.newGuard,deckEligible:false}};
a.api.configure(hidden);assert.equal(a.api.eligible().length,10,"unpublished class hidden");
const b=boot({version:1,ids:["scout","scout","unknown","newGuard"]});
b.api.configure(next);
const fixed=b.api.current();
assert.equal(fixed.length,10);assert.equal(new Set(fixed).size,10);
assert.ok(b.api.validate(fixed),"corrupt saved deck repairs without duplicate");
const c=boot(null,true);c.api.configure(catalog);
assert.ok(c.api.validate(c.api.current()),"blocked third-party storage cannot block play");
c.api.resetDraft();assert.ok(c.api.validate(c.api.current()));
console.log("PASS: deck 10 unique IDs, permanent infantry, future cards, banned drafts, and storage fallback");