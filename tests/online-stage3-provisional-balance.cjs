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
// Stage 3 is now in development: pull current balance from actual game.
assert.equal(existing.guardian.hp,1300,"approved guardian HP now in development");
assert.equal(existing.tank.hp,1000,"approved tank HP now in development");
const approvedExisting={
 ...existing,
 guardian:{...existing.guardian,hp:1300},
 tank:{...existing.tank,hp:1000}
};

const kaiju={
 name:"砦進撃怪獣（仮案）",size:"large",cost:6,limit:2,qty:1,
 hp:1000,damage:72,cool:2.25,range:40,vision:220,speed:22,r:27,
 behavior:"capture",capture:3,hitAir:false,flying:false,
 targetPriority:{fort:4,castle:2,unit:1}
};
const gale={
 name:"疾風号令（本人了承）",cost:3,limit:3,radius:125,duration:4,
 speedMultiplier:1.5,eligible:"allied units (ground and flying), voluntary move only",
 zone:"snapshot targets on cast; buff follows each unit for four seconds"
};
assert.equal(kaiju.targetPriority.fort,4);
assert.equal(kaiju.targetPriority.castle,2);
assert.equal(kaiju.targetPriority.unit,1);

assert.equal(existing.kaiju.hp,kaiju.hp,"prototype and live kaiju differ");
assert.equal(spells.gale.speedMultiplier,gale.speedMultiplier,"prototype and live gale differ");
const all={...approvedExisting,kaiju};
const beforeAll={...existing,guardian:{...existing.guardian,hp:1400},tank:{...existing.tank,hp:1100},kaiju};
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
const hpAdjustment={};
for(const id of ["guardian","tank"]){
 const previous=beforeAll[id],approved=approvedExisting[id];
 hpAdjustment[id]={previousHp:previous.hp,approvedHp:approved.hp,opponents:{}};
 for(const [otherId,opponent] of Object.entries(all)){
  const beforeOpponent=beforeAll[otherId];
  hpAdjustment[id].opponents[otherId]={
   oneBefore:fightOne(previous,beforeOpponent),
   oneAfter:fightOne(approved,opponent),
   cardBefore:fightCards(previous,beforeOpponent),
   cardAfter:fightCards(approved,opponent)
  };
 }
}
const oneVsAll=Object.fromEntries(entries.map(([id,d])=>[id,Object.fromEntries(
 entries.map(([target,other])=>[target,fightOne(d,other)]))]));
const cardsVsAll=Object.fromEntries(entries.map(([id,d])=>[id,Object.fromEntries(
 entries.map(([target,other])=>[target,fightCards(d,other)]))]));
// Keep earlier HP1150 kaiju design as a comparison fixture only.
const oldKaiju={...kaiju,hp:1150};
const hpRevision=Object.fromEntries(entries.filter(([id])=>id!=="kaiju").map(([id,d])=>[id,{
  before:fightOne(oldKaiju,d),after:fightOne(kaiju,d),
  cardBefore:fightCards(oldKaiju,d),cardAfter:fightCards(kaiju,d)
}]));
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
 castSnapshotExtra:round(d.speed*(gale.speedMultiplier-1)*gale.duration)
}]));
const fortHp=12,fortHits=Math.ceil(fortHp/kaiju.capture);
const model={
 assumptions:{
 primary:"1 vs 1; both hit at t0, then every cooldown, including flying targets abstractly; no abilities, range, AI, siege or capture",
 secondary:"card qty vs card qty; t0 simultaneous; target first living soldier; no splash, flying immunity, on-contact death, child spawning, range, movement or AI",
 warning:"All costs compared; results are not predictions of combat against special cards.",
 },
 kaiju, gale, hpRevision, hpAdjustment,
 fort:{hp:fortHp,capturePerHit:kaiju.capture,requiredHits:fortHits,
 attackTimeFromFirstHit:round((fortHits-1)*kaiju.cool),
 fromBlueSpawn244ToFort410Travel:round((410-244)/kaiju.speed),
 approxBlueSpawnToFortCaptured:round(Math.max(0,(410-244)-(kaiju.range+24))/kaiju.speed+(fortHits-1)*kaiju.cool),
 note:"No enemy, no offsets or initial summon delay; fort x=410, summon x=244 at same y"},
 stats,boosts,kaijuOne,kaijuCards,oneVsAll,cardsVsAll
};
// Proposed snapshot-on-cast buff model only; independent of production game.
const statusProto={
 add(unit,effect){
  const statuses=unit.statuses||(unit.statuses=[]);
  const same=statuses.find(x=>x.key===effect.key);
  if(same){
   same.remaining=Math.max(same.remaining,effect.remaining);
   same.mult=effect.mult; // same named effect refreshes, never stacks
  }else statuses.push({...effect});
 },
 cast(units,team,x,y){
  const affected=[];
  for(const u of units){
   if(u.team!==team||u.hp<=0||Math.hypot(u.x-x,u.y-y)>gale.radius)continue;
   this.add(u,{key:"gale",stat:"moveSpeed",remaining:gale.duration,mult:gale.speedMultiplier});
   affected.push(u.uid);
  }
  return affected;
 },
 step(unit,dt){
  if(!unit.statuses)return;
  for(const effect of unit.statuses)effect.remaining-=dt;
  unit.statuses=unit.statuses.filter(x=>x.remaining>1e-8);
 },
 speed(unit){return unit.baseSpeed*(unit.statuses||[]).reduce((v,s)=>s.stat==="moveSpeed"?v*s.mult:v,1);}
};
const unitsForBuff=[
 {uid:1,team:1,hp:100,x:100,y:100,baseSpeed:kaiju.speed},
 {uid:2,team:1,hp:100,x:226,y:100,baseSpeed:41},
 {uid:3,team:1,hp:100,x:224,y:100,baseSpeed:18},
 {uid:4,team:2,hp:100,x:101,y:101,baseSpeed:41},
 {uid:5,team:1,hp:0,x:99,y:99,baseSpeed:41}
];
const affected=statusProto.cast(unitsForBuff,1,100,100);
assert.deepEqual(affected,[1,3],"only alive allies inside at cast get buff");
unitsForBuff[0].x=1000; // Leaving the cast area DOES NOT remove an applied buff.
statusProto.step(unitsForBuff[0],2);
assert.equal(statusProto.speed(unitsForBuff[0]),kaiju.speed*1.5);
const newcomer={uid:6,team:1,hp:100,x:100,y:100,baseSpeed:22};
assert.equal(statusProto.speed(newcomer),22,"later spawns never inherit past buff");
statusProto.cast(unitsForBuff,1,100,100); // Refresh re-cast only if still inside.
assert.equal(unitsForBuff[0].statuses[0].remaining,2,"moved unit does not get fresh duration");
assert.equal(unitsForBuff[2].statuses.length,1,"same buff should refresh, not stack endlessly");
statusProto.step(unitsForBuff[0],2);
assert.equal(statusProto.speed(unitsForBuff[0]),kaiju.speed,"buff expires after four seconds");
assert.equal(statusProto.speed(unitsForBuff[3]),41,"enemy receives no buff");
// Illustrate the same minimal data model for a potential future DEBUFF.
// No slow card or debuff stat value is being approved or added to the game.
const slowFixture={uid:7,team:2,hp:100,x:0,y:0,baseSpeed:20};
statusProto.add(slowFixture,{key:"qaSlow",stat:"moveSpeed",remaining:3,mult:.7});
assert.equal(statusProto.speed(slowFixture),14);
statusProto.add(slowFixture,{key:"qaSlow",stat:"moveSpeed",remaining:3,mult:.7});
assert.equal(slowFixture.statuses.length,1,"re-applying the same debuff never stacks");
statusProto.add(slowFixture,{key:"gale",stat:"moveSpeed",remaining:4,mult:1.5});
assert.ok(Math.abs(statusProto.speed(slowFixture)-21)<1e-8,
 "independent haste and slow combine as ordinary speed modifiers");
statusProto.step(slowFixture,3);
assert.equal(statusProto.speed(slowFixture),30,"expired slow leaves haste active");
statusProto.step(slowFixture,1);
assert.equal(statusProto.speed(slowFixture),20,"all modifiers eventually expire");
assert.equal(gale.duration,4);
assert.equal(kaiju.cost,6);
assert.equal(kaiju.hp,1000,"latest user-selected monster HP");
assert.equal(kaiju.vision,220);
assert.equal(kaijuCards.crusher.winner,"a");
assert.equal(kaijuCards.crusher.remainingHp,100);
assert.equal(kaijuCards.guardian.winner,"b");
assert.equal(hpAdjustment.guardian.previousHp,1400);
assert.equal(hpAdjustment.guardian.approvedHp,1300);
assert.ok(hpAdjustment.guardian.opponents.kaiju.oneBefore.remainingHp!==hpAdjustment.guardian.opponents.kaiju.oneAfter.remainingHp,
 "guardian vs kaiju should change");
assert.equal(kaijuCards.guardian.winner,"b");
assert.equal(kaijuCards.tank.winner,"b");
assert.equal(hpAdjustment.tank.previousHp,1100);
assert.equal(hpAdjustment.tank.approvedHp,1000);
assert.ok(hpAdjustment.tank.opponents.kaiju.oneBefore.remainingHp!==hpAdjustment.tank.opponents.kaiju.oneAfter.remainingHp,
 "tank vs kaiju should change");
assert.equal(kaijuCards.tank.winner,"b");
assert.equal(hpRevision.guardian.before.winner,"b");
assert.equal(hpRevision.guardian.after.winner,"b");
assert.equal(kaijuCards.archer.remainingHp,860);
assert.equal(Object.keys(kaijuOne).length,Object.keys(existing).length-1);
assert.equal(Object.keys(kaijuCards).length,Object.keys(existing).length-1);
assert.equal(kaijuOne.guardian.winner,"b");
assert.equal(kaijuOne.tank.winner,"b");
assert.equal(kaijuOne.catapult.winner,"a");
assert.equal(kaijuCards.archer.winner,"a");
assert.equal(model.fort.requiredHits,4);
assert.equal(model.fort.attackTimeFromFirstHit,6.75);
if(process.argv.includes("--json"))console.log(JSON.stringify(model,null,2));
else{
 console.log("Stage 3 preimplementation balance: kaiju "+kaiju.cost+" cost, "+kaiju.hp+" hp, "+kaiju.damage+"/"+kaiju.cool+"s, "+kaiju.qty+" per card");
 console.log("Actual roster unchanged in online-game.js: "+Object.keys(existing).length+" cards; 2 approved HP changes only in design: guardian 1400->1300, tank 1100->1000; "+entries.length+" with candidate.");
 for(const id of ["guardian","tank"]){
  console.log("Approved "+id+" HP "+hpAdjustment[id].previousHp+"->"+hpAdjustment[id].approvedHp);
  for(const opponent of ["kaiju","guardian","tank","crusher","catapult","archer","infantry"]){
   const v=hpAdjustment[id].opponents[opponent];
   console.log(" "+id+" vs "+opponent+" one BEFORE:"+v.oneBefore.winner+"/"+v.oneBefore.remainingHp+"/"+v.oneBefore.time+" AFTER:"+v.oneAfter.winner+"/"+v.oneAfter.remainingHp+"/"+v.oneAfter.time
   +" card BEFORE:"+v.cardBefore.winner+"/"+v.cardBefore.remainingHp+"/"+v.cardBefore.time+" AFTER:"+v.cardAfter.winner+"/"+v.cardAfter.remainingHp+"/"+v.cardAfter.time);
  }
 }
 console.log("Fort "+fortHp+"HP / capture "+kaiju.capture+" = "+fortHits+" hits, "+model.fort.attackTimeFromFirstHit+"s after first attack.");
 console.log("VS existing roster (primary 1v1 / secondary card-vs-card, no special mechanics):");
 for(const [id,d] of Object.entries(approvedExisting)){
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
   " buffed-on-cast extra x"+boosts[id].castSnapshotExtra);
 }
 console.log("STAGE3_DESIGN_BALANCE_QA: PASS (all "+entries.length+" x "+entries.length+" one-unit AND card duels; approved guardian/tank before-after across all costs)");
}
