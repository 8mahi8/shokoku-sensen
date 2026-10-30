// Mulligan business rules use the actual shipped source, not a duplicate model.
"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const assert=require("node:assert/strict");
const source=fs.readFileSync(path.join(__dirname,"..","online-game.js"),"utf8");
const net=fs.readFileSync(path.join(__dirname,"..","online-net.js"),"utf8");
function section(a,b){
 const i=source.indexOf(a),j=source.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,"missing game section "+a);
 return source.slice(i,j);
}
const S={phase:"mulligan",mulligan:{time:20,done:[null,false,false]},
 hand:[null,["a","b","c","d"],["a","b","c","d"]],
 queue:[null,["e","f","g","h","i","j"],["e","f","g","h","i","j"]],prep:10};
const NET={isHost:true,sendMulligan:()=>false};
let uiUpdates=0,published=0;
const nodes={prepBanner:{classList:{add:()=>{}}},fieldHint:{textContent:""}};
const ctx={S,NET,PREP:10,ME:()=>1,Set,Math,Array,Number,
 mulliganSelected:new Set(),mulliganSubmitted:false,mulliganRendered:"",
 $:id=>nodes[id],buildCards:()=>{},updateHUD:()=>{},
 updateMulliganUI:()=>{uiUpdates++;}};
vm.createContext(ctx);
vm.runInContext("const HAND_SIZE=4;\n"+
 section("function applyMulliganHand(","const isSpell=id=>")+
 section("function beginPlacement(){","function setupMulliganUI(){")+
 "\nglobalThis.QA={applyMulliganHand,beginPlacement,confirmMulligan,submitMulligan};",ctx);
const api=ctx.QA;
const equal=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
for(let k=0;k<=4;k++){
 const hand=["a","b","c","d"],queue=["e","f","g","h","i","j"];
 const slots=Array.from({length:k},(_,i)=>i);
 assert.equal(api.applyMulliganHand(hand,queue,slots),true);
 equal(hand,[...["e","f","g","h"].slice(0,k),...["a","b","c","d"].slice(k)]);
 equal(queue,[...["e","f","g","h","i","j"].slice(k),...["a","b","c","d"].slice(0,k)]);
 assert.equal(new Set([...hand,...queue]).size,10);
 assert.equal(hand.length,4);assert.equal(queue.length,6);
}
console.log("PASS exchange 0..4 stays ten unique, no immediate rejected redrawn");
const hh=["a","b","c","d"],qq=["e","f","g","h","i","j"];
assert.equal(api.applyMulliganHand(hh,qq,[3,1]),true);
equal(hh,["a","f","c","e"]);
equal(qq,["g","h","i","j","d","b"]);
for(const slots of [[1,1],[-1],[4],["2"],[0,1,2,3,4],null]){
 const before=JSON.stringify([hh,qq]);
 assert.equal(api.applyMulliganHand(hh,qq,slots),false);
 assert.equal(JSON.stringify([hh,qq]),before,"invalid request never mutates");
}
console.log("PASS noncontiguous slots keep positions; invalid lists are rejected");
assert.equal(api.confirmMulligan(1,[0,2]),true);
assert.equal(S.phase,"mulligan");
assert.equal(S.mulligan.done[1],true);
equal(S.hand[1],["e","b","f","d"]);
equal(S.queue[1],["g","h","i","j","a","c"]);
assert.equal(api.confirmMulligan(1,[0]),false);
assert.equal(api.confirmMulligan(2,[1,1]),false);
assert.equal(api.confirmMulligan(2,[]),true);
assert.equal(S.phase,"prep");
assert.equal(S.prep,10);
equal(S.hand[2],["a","b","c","d"]);
assert.equal(api.confirmMulligan(2,[]),false);
console.log("PASS host authoritative one-shot, both ready -> 10s prep");
S.phase="mulligan";S.mulligan={time:11,done:[null,false,false]};
NET.isHost=false;
const guestPackets=[];
NET.sendMulligan=slots=>{guestPackets.push(slots.slice());return true};
ctx.mulliganSelected=new Set([0,3]);ctx.mulliganSubmitted=false;
assert.equal(api.submitMulligan(),true);
assert.equal(ctx.mulliganSubmitted,true);
assert.equal(api.submitMulligan(),false);
equal(guestPackets,[[0,3]]);
assert.equal(S.mulligan.done[1],false);
assert.equal(S.phase,"mulligan");
console.log("PASS guest submits slots once without mutating authoritative hand");
for(const required of ['S.phase="mulligan"','S.mulligan.time<=0',
 'for(const team of [1,2])if(!S.mulligan.done[team])confirmMulligan(team,[])',
 'S.mulligan=data.mulligan||null','mulligan:S.mulligan',
 'S.phase==="mulligan"||S.phase==="prep"']){
 assert.ok(source.includes(required),"missing shipped lifecycle "+required);
}
for(const required of ['data.kind==="mulligan"','game?.mulligan?.(data.slots)',
 'function sendMulligan(slots)','guestPlayableWorld()']){
 assert.ok(net.includes(required),"missing network integration "+required);
}
console.log("PASS phase timer, guest snapshot, transport wiring");
console.log("MULLIGAN_QA PASS");
