#!/usr/bin/env node
"use strict";
/**
 * Design-only stage-1 balance calculator (2026-10-29).
 *
 * Reads EXISTING units from online-game.js, not a duplicate hardcoded list.
 * PRE-IMPLEMENTATION stage-1 proposals are below and must be reviewed together
 * with docs/NEW_UNITS_STAGE1_FIVE_DESIGN_V1_2026-10-29.md.
 *
 * Base model: 1 UNIT vs 1 UNIT at stationary melee/contact distance.
 * Both are ready to hit at t=0. An exact-time tie is resolved simultaneously.
 * No movement, initial spawn attack delay, spells, fort/castle, splash to
 * extra targets, friendly units, range gaps, energy, vision, or target changes.
 * hitAir/flying legality IS respected. This is screening, not a match forecast.
 */
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");

const source=fs.readFileSync(path.join(__dirname,"..","online-game.js"),"utf8");
const marker="const CLASSES=";
const start=source.indexOf(marker);
const close=start>=0?source.indexOf("\n};",start):-1;
assert.ok(start>=0&&close>start,"Cannot locate CLASSES in online-game.js");
const existing=vm.runInNewContext("("+source.slice(start+marker.length,close+2)+")",Object.create(null),{timeout:1000});
assert.ok(existing.infantry&&existing.scout&&existing.guardian,"Existing unit set has changed unexpectedly");
// Keep actual existing classes intact: sentinel adjustment is DESIGN ONLY.
// It must not be misrepresented as a deployed change.
const proposedExisting={...existing,sentinel:{...existing.sentinel,hp:440,cool:1.60}};
const proposal={
 duelist:{name:"04 双剣兵",hp:145,damage:22,cool:0.55,hitAir:false,flying:false},
 crusher:{name:"08 重撃砕兵",hp:460,damage:150,cool:2.65,hitAir:false,flying:false,
   targetPriority:{castle:2,fort:0,unit:2}}, // NOT largeUnit: user explicitly rejected specialization
 ranger_engineer:{name:"13 遠距離工兵",hp:300,damage:30,cool:1.40,hitAir:false,flying:false},
 interceptor:{name:"24 迅速迎撃騎兵",hp:195,damage:38,cool:1.15,hitAir:false,flying:false},
 ground_bomber:{name:"43 対地爆撃翼",hp:230,damage:55,cool:1.90,hitAir:false,flying:true}
};
function duel(left,right,{firstLeft=0,firstRight=0}={}){
 const eps=1e-8;
 const hitLeft=!(right.flying&&!left.hitAir);
 const hitRight=!(left.flying&&!right.hitAir);
 const result={winner:"",remainingHp:0,time:0,leftHits:0,rightHits:0};
 if(!hitLeft&&!hitRight)return {...result,winner:"neither-can-hit",time:null};
 let hpL=left.hp,hpR=right.hp;
 let nextL=hitLeft?firstLeft:Infinity,nextR=hitRight?firstRight:Infinity;
 for(let iter=0;iter<5000;iter++){
  const t=Math.min(nextL,nextR);
  if(!Number.isFinite(t)||t>300)return {...result,winner:"no-decision",time:null};
  const fireL=nextL<=t+eps,fireR=nextR<=t+eps;
  // Both attacks at this same timestamp are counted even if one is lethal.
  if(fireL){hpR-=left.damage;nextL+=left.cool;result.leftHits++;}
  if(fireR){hpL-=right.damage;nextR+=right.cool;result.rightHits++;}
  if(hpL<=0||hpR<=0){
   result.time=Math.round(t*100)/100;
   if(hpL<=0&&hpR<=0){result.winner="simultaneous-KO";return result;}
   result.winner=hpR<=0?"left":"right";
   result.remainingHp=Math.max(0,Math.round((hpR<=0?hpL:hpR)*100)/100);
   return result;
  }
 }
 throw Error("Duel iteration limit exceeded");
}
const checks=[
 ["duelist","scout","left",5,4.4],
 ["duelist","sentinel","right",308,3.2],
 ["crusher","engineer","left",320,5.3],
 ["crusher","sentinel","left",212,5.3],
 ["crusher","guardian","right",850,6.15],
 ["ranger_engineer","scout","left",48,8.4],
 ["ranger_engineer","engineer","right",150,11.2],
 ["interceptor","scout","left",27,5.75],
 ["ground_bomber","suppress","right",105,7.6],
 ["ground_bomber","guardian","left",230,43.7],
 ["ground_bomber","drone","right",120,15],
 ["sentinel","engineer","left",195,9.6],
 ["sentinel","suppress","left",140,9.6]
];
for(const [id,other,winner,hp,time] of checks){
 const res=duel(proposal[id]||proposedExisting[id],proposedExisting[other]);
 assert.equal(res.winner,winner,id+" vs "+other+" winner");
 assert.equal(res.remainingHp,hp,id+" vs "+other+" remaining HP");
 assert.equal(res.time,time,id+" vs "+other+" time");
}
if(process.argv.includes("--json")){
 const data=Object.fromEntries(Object.entries(proposal).map(([id,p])=>[id,Object.fromEntries(
 Object.entries(proposedExisting).map(([oid,o])=>[oid,duel(p,o)]))]));
 console.log(JSON.stringify({assumptions:"1 unit each, stationary, t0 first attack, no range/move/splash secondaries",duels:data},null,2));
}else{
 console.log("Stage 1 theoretical 1v1 analysis — unit vs unit; first hit t=0; no movement/range gap");
 console.log("Calculations use the currently deployed CLASSES (including Stage 3 heavy HP).");
 console.log("| Prototype | Existing opponent (1 unit) | Winner | Winner remaining HP | Time (s) |");
 console.log("|---|---|---|---:|---:|");
 for(const [id,p] of Object.entries(proposal)){
  for(const [other,o] of Object.entries(proposedExisting)){
   const r=duel(p,o);
   const who=r.winner==="left"?p.name:r.winner==="right"?o.name:r.winner;
   console.log(`| ${p.name} | ${o.name} | ${who} | ${r.remainingHp} | ${r.time} |`);
  }
 }
 console.log("\nWarnings: infantry, archer and drone each deploy 2 units per card, but this table only represents 1 unit; flying immunity, guard anchor, ranged approach and splash can radically alter the outcome.");
}
console.error("Balance-theory assertions OK ("+checks.length+" sample duels). This does NOT simulate live combat.");
