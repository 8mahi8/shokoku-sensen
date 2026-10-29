#!/usr/bin/env node
"use strict";
/**
 * Stage 3 PRE-IMPLEMENTATION balance screen.
 * Reads the existing classes and spells from online-game.js.
 * Does not inject candidates into the actual game, build, or live balance.
 *
 * Primary model (SOP v1.2): all attacks legal, 1 unit vs 1 unit, stationary,
 * t=0 simultaneous first hit, then each cool; no AI, air checks, movement,
 * splash, charges, self-destruction, delayed impact, summons, buffs or defense.
 *
 * Secondary model: card vs card with actual qty, stationary, both teams attack
 * simultaneously at t=0, subsequent independent cooldowns. Each attacker
 * targets first living enemy in deterministic spawn order. No splash, reach,
 * target priorities, abilities or movement. This is NOT a gameplay simulation.
 */
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const src=fs.readFileSync(path.join(__dirname,"..","online-game.js"),"utf8");
function objectAt(startMarker){
 const start=src.indexOf(startMarker);
 const close=src.indexOf("\n};",start);
 assert(start>=0&&close>start,"missing "+startMarker);
 return vm.runInNewContext("("+src.slice(start+startMarker.length,close+2)+")",{}, {timeout:1000});
}
const classes=objectAt("const CLASSES=");
const spells=objectAt("const SPELLS=");
const existing=Object.fromEntries(Object.entries(classes).filter(([,d])=>!d.internalOnly));
assert(Object.keys(existing).length>=18,"expected actual stage 2 roster");
assert(spells.ward.cost===3&&spells.gravity.duration===2.5,"spell baseline changed: review candidate");

const kaiju={
 name:"砦進撃怪獣（仮案）",size:"large",cost:7,limit:2,qty:1,
 hp:1150,damage:72,cool:2.25,range:40,vision:1050,speed:22,r:27,
 behavior:"capture",capture:3,hitAir:false,flying:false,
 targetPriority:{fort:4,castle:2,unit:1}
};
const gale={
 name:"疾風号令（仮案）",cost:3,limit:3,radius:125,duration:4,
 speedMultiplier:1.5,eligible:"allied units (ground and flying), voluntary move only",
 zone:"fixed circle; effect only while inside; no lingering"
};
assert.equal(kaiju.targetPriority.fort,4);
assert.equal(kaiju.targetPriority.castle,2);
assert.equal(kaiju.targetPriority.unit,1);

const all={...existing,kaiju};
const entries=Object.entries(all);
const round=v=>Number.isFinite(v)?Math.round(v*100)/100:null;
function fightOne(a,b){
 let hpA=a.hp,hpB=b.hp,atA=0,atB=0,hitsA=0,hitsB=0;
 for(let i=0;i<10000;i++){
  const time=Math.min(atA,atB);
  if(time>300||!Number.isFinite(time))return {winner:"none",remainingHp:null,time:null,hitsA,hitsB};
  if(atA<=time+1e-9){hpB-=a.damage;atA+=a.cool;hitsA++;}
  if(atB<=time+1e-9){hpA-=b.damage;atB+=b.cool;hitsB++;}
  if(hpA<=0&&hpB<=0)return {winner:"draw",remainingHp:0,time:round(time),hitsA,hitsB};
  if(hpB<=0)return {winner:"a",remainingHp:round(hpA),time:round(time),hitsA,hitsB};
  if(hpA<=0)return {winner:"b",remainingHp:round(hpB),time:round(time),hitsA,hitsB};
 }
 throw Error("one-unit iteration overflow");
}
function fightCards(a,b){
 const A=Array.from({length:a.qty},(_,i)=>({hp:a.hp,next:0,id:i}));
 const B=Array.from({length:b.qty},(_,i)=>({hp:b.hp,next:0,id:i}));
 const live=xs=>xs.filter(x=>x.hp>0);
 let hitsA=0,hitsB=0;
 for(let i=0;i<20000;i++){
  const aliveA=live(A),aliveB=live(B);
  if(!aliveA.length||!aliveB.length)throw Error("unexpected empty card at beginning");
  const time=Math.min(...aliveA.map(x=>x.next),...aliveB.map(x=>x.next));
  if(!Number.isFinite(time)||time>300)return {winner:"none",remainingHp:null,time:null,hitsA,hitsB};
  const damageToA=new Map(),damageToB=new Map();
  for(const u of aliveA)if(u.next<=time+1e-9){
   const target=aliveB[0];
   damageToB.set(target,(damageToB.get(target)||0)+a.damage);
   u.next+=a.cool;hitsA++;
  }
  for(const u of aliveB)if(u.next<=time+1e-9){
   const target=aliveA[0];
   damageToA.set(target,(damageToA.get(target)||0)+b.damage);
   u.next+=b.cool;hitsB++;
  }
  for(const [u,damage] of damageToA)u.hp-=damage;
  for(const [u,damage] of damageToB)u.hp-=damage;
  const survivingA=live(A),survivingB=live(B);
  if(!survivingA.length||!survivingB.length){
   const winner=!survivingA.length&&!survivingB.length?"draw":survivingA.length?"a":"b";
   const remainingHp=winner==="a"?survivingA.reduce((n,u)=>n+u.hp,0):
    winner==="b"?survivingB.reduce((n,u)=>n+u.hp,0):0;
   return {winner,remainingHp:round(remainingHp),time:round(time),hitsA,hitsB};
  }
 }
 throw Error("card iteration overflow");
}
const oneVsAll=Object.fromEntries(entries.map(([id,d])=>[id,Object.fromEntries(
 entries.map(([target,other])=>[target,fightOne(d,other)]))]));
const cardsVsAll=Object.fromEntries(entries.map(([id,d])=>[id,Object.fromEntries(
 entries.map(([target,other])=>[target,fightCards(d,other)]))]));
const kaijuOne=Object.fromEntries(entries.filter(([id])=>id!=="kaiju").map(([id,d])=>[id,fightOne(kaiju,d)]));
const kaijuCards=Object.fromEntries(entries.filter(([id])=>id!=="kaiju").map(([id,d])=>[id,fightCards(kaiju,d)]));
const stats=Object.fromEntries(entries.map(([id,d])=>[id,{
 name:d.name,size:d.size,cost:d.cost,qty:d.qty,hp:d.hp,cardHp:d.qty*d.hp,
 damage:d.damage,cool:d.cool,attackRate:round(d.damage/d.cool),
 hpPerCost:round(d.qty*d.hp/d.cost),
 damageRatePerCost:round(d.qty*d.damage/d.cool/d.cost)
}]));
const boosts=Object.fromEntries(entries.map(([id,d])=>[id,{
 speed:d.speed,baseIn4s:round(d.speed*gale.duration),
 idealBuffedIn4s:round(d.speed*gale.speedMultiplier*gale.duration),
 idealExtra:round(d.speed*(gale.speedMultiplier-1)*gale.duration),
 fixedCircleExtraFromCenter:round(Math.min(
 d.speed*(gale.speedMultiplier-1)*gale.duration,
 gale.radius*(1-1/gale.speedMultiplier)))
}]));
const fortHp=12,fortHits=Math.ceil(fortHp/kaiju.capture);
const model={
 assumptions:{
 primary:"1 vs 1; both hit at t0, then every cooldown, including flying targets abstractly; no abilities, range, AI, siege or capture",
 secondary:"card qty vs card qty; t0 simultaneous; target first living soldier; no splash, flying immunity, on-contact death, child spawning, range, movement or AI",
 warning:"All costs compared; results are not predictions of combat against special cards.",
 },
 kaiju, gale,
 fort:{hp:fortHp,capturePerHit:kaiju.capture,requiredHits:fortHits,
 attackTimeFromFirstHit:round((fortHits-1)*kaiju.cool),
 fromBlueSpawn244ToFort410Travel:round((410-244)/kaiju.speed),
 approxBlueSpawnToFortCaptured:round((410-244)/kaiju.speed+(fortHits-1)*kaiju.cool),
 note:"No enemy, no offsets or initial summon delay; fort x=410, summon x=244 at same y"},
 stats,boosts,kaijuOne,kaijuCards,oneVsAll,cardsVsAll
};
assert.equal(Object.keys(kaijuOne).length,Object.keys(existing).length);
assert.equal(Object.keys(kaijuCards).length,Object.keys(existing).length);
assert.equal(kaijuOne.guardian.winner,"b");
assert.equal(kaijuOne.tank.winner,"b");
assert.equal(kaijuOne.catapult.winner,"a");
assert.equal(kaijuCards.archer.winner,"a");
assert.equal(model.fort.requiredHits,4);
assert.equal(model.fort.attackTimeFromFirstHit,6.75);
if(process.argv.includes("--json"))console.log(JSON.stringify(model,null,2));
else{
 console.log("Stage 3 preimplementation balance: kaiju "+kaiju.cost+" cost, "+kaiju.hp+" hp, "+kaiju.damage+"/"+kaiju.cool+"s, "+kaiju.qty+" per card");
 console.log("Real existing roster (no edits): "+Object.keys(existing).length+" cards; all "+entries.length+" including candidate.");
 console.log("Fort "+fortHp+"HP / capture "+kaiju.capture+" = "+fortHits+" hits, "+model.fort.attackTimeFromFirstHit+"s after first attack.");
 console.log("VS existing roster (primary 1v1 / secondary card-vs-card, no special mechanics):");
 for(const [id,d] of Object.entries(existing)){
  const one=kaijuOne[id],card=kaijuCards[id];
  console.log(id+" ["+d.name+"] cost "+d.cost+" qty "+d.qty+
   "  1v1:"+one.winner+" HP:"+one.remainingHp+" s:"+one.time+
   "  card:"+card.winner+" HP:"+card.remainingHp+" s:"+card.time);
 }
 console.log("Gale "+gale.cost+" cost "+gale.duration+"s radius "+gale.radius+
  " speed x"+gale.speedMultiplier+" uses "+gale.limit);
 for(const id of ["scout","interceptor","guardian","tank","catapult","kaiju"]){
  console.log("  "+id+" speed "+boosts[id].speed+
   " maximum extra x"+boosts[id].idealExtra+
   " zone-center extra x"+boosts[id].fixedCircleExtraFromCenter);
 }
 console.log("STAGE3_DESIGN_BALANCE_QA: PASS (all "+entries.length+" x "+entries.length+" one-unit AND card duels)");
}
