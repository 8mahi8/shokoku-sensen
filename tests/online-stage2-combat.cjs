// Stage 2 regression tests: execute extracted production battle logic, no browser needed.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"..","online-game.js"),"utf8");
function section(a,b){
 const i=source.indexOf(a),j=source.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,"Missing engine section "+a);
 return source.slice(i,j);
}
const W=1280,H=660;
const S={phase:"battle",clock:3,elapsed:0,uid:0,tickCount:0,
 energy:[0,12,12],left:[null,{},{}],hand:[null,[],[]],queue:[null,[],[]],activeDecks:[null,[],[]],
 units:[],forts:[],capitals:[{team:1,hp:3000},{team:2,hp:3000}],
 effects:[],projectiles:[],deaths:[],spells:{zones:[],incoming:[]},underAttackUntil:0,lastAlert:-100};
let API,notices=[],results=[];
const ctx={Math,S,W,H,WALL_TOP:69,WALL_BOTTOM:590,WALL_FACE:{1:126,2:1154},
 MOTION:null,CASTLE_DAMAGE:1,POST_HP:12,
 rand:(a,b)=>(a+b)/2,limit:(v,a,b)=>Math.min(b,Math.max(a,v)),
 dist:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),
 enemy:t=>3-t,capital:t=>S.capitals[t-1],
 wallTarget:(c,y)=>({kind:"capital",ref:c,x:c.team===1?126:1154,y:Math.min(578,Math.max(81,y)),r:15}),
 notice:t=>notices.push(t),end:(...v)=>results.push(v),buildCards:()=>{},updateHUD:()=>{},ME:()=>0,
 qaOpeningAudit:null,duelStats:null,qaBotVariants:[null,"",""],qaCastleHitEvents:[],
 canPlace:(t,x,y)=>t===1?x<=244:x>=1036,
 canPay:(t,id)=>S.energy[t]>=API.CATALOG[id].cost&&S.hand[t].includes(id)&&S.activeDecks[t].includes(id),
 validTarget:()=>true
};
vm.createContext(ctx);
vm.runInContext([
 section("const MOTION={","const CLASSES={"),
 section("const CLASSES={","// School-friendly Google Sites HTML:"),
 section("const SPELLS={","const CATALOG="),
 "const CATALOG={...CLASSES,...SPELLS};const HAND_SIZE=4;",
 "const isSpell=id=>Object.prototype.hasOwnProperty.call(SPELLS,id);",
 section("function advanceHand(team,id){","const TEAM="),
 section("function deploy(team,id,x,y){","function notice(message){"),
 section("function castSpell(team,id,x,y){","function playCard(team,id,x,y){"),
 section("function shieldMultiplier(team,x,y){","function getFort(u){"),
 section("// Target traits are shared data-driven selectors.","function rate(){"),
 "globalThis.API={CLASSES,SPELLS,CATALOG,deploy,castSpell,fire,unitStep,spellStep,selectPriorityTargets,gravityZoneFor};"
].join("\n"),ctx,{filename:"stage2-extracted-engine.js"});
API=ctx.API;
function unit(key,team,x,y,uid=++S.uid){
 const d=API.CLASSES[key];
 return {uid,key,team,x,y,anchorX:x,anchorY:y,homeY:y,hp:d.hp,max:d.hp,attack:0,
  flash:0,attackAnim:0,windup:0,walkPhase:0,facing:0,hitAt:-100};
}
function reset(){
 S.units=[];S.forts=[];S.capitals=[{team:1,hp:3000},{team:2,hp:3000}];
 S.spells={incoming:[],zones:[]};S.effects=[];S.projectiles=[];S.deaths=[];
 S.uid=0;S.tickCount=0;S.clock=3;S.elapsed=0;S.energy=[0,12,12];
 S.left=[null,{},{}];S.hand=[null,[],[]];S.queue=[null,[],[]];S.activeDecks=[null,[],[]];
 for(const t of [1,2])for(const [k,v] of Object.entries(API.CLASSES))S.left[t][k]=v.limit;
 for(const t of [1,2])for(const [k,v] of Object.entries(API.SPELLS))S.left[t][k]=v.limit;
 results=[];notices=[];
}
function test(name,fn){reset();fn();console.log("PASS "+name);}
test("stage2 cards have user-approved parameters and child stays hidden",()=>{
 const C=API.CLASSES;
 assert.deepEqual([C.piercer.cost,C.piercer.hp,C.piercer.damage,C.piercer.pierceCount],[3,170,55,10]);
 assert.deepEqual([C.catapult.cost,C.catapult.hp,C.catapult.damage,C.catapult.cool,C.catapult.splash],[8,700,115,4.5,85]);
 assert.equal(C.ranger_engineer.capture,2);
 assert.ok(C.small_machine.internalOnly&&C.small_machine.deckEligible===false);
 assert.equal(C.mech_summoner.summonTimes.join(","),"2,4,6,11,16,21,26,31");
 assert.equal(API.SPELLS.gravity.duration,2.5);
 assert.equal(API.SPELLS.gravity.cost,3);
});
test("pierce hits 10 targets maximum, main 55 and behind targets 33",()=>{
 const atk=unit("piercer",1,420,300);
 const foes=Array.from({length:12},(_,i)=>unit("engineer",2,470+i*6,300));
 const off=unit("engineer",2,495,340),ally=unit("engineer",1,495,300),air=unit("drone",2,500,300);
 S.units=[atk,...foes,off,ally,air];
 API.fire(atk,{kind:"unit",ref:foes[0],x:foes[0].x,y:foes[0].y});
 assert.equal(foes[0].hp,420-55);
 assert.equal(foes.slice(1,10).filter(v=>v.hp===387).length,9);
 assert.ok(foes.slice(10).every(v=>v.hp===420));
 assert.equal(off.hp,420);assert.equal(ally.hp,420);assert.equal(air.hp,120);
});
test("catapult marks fixed impact position and hits ground plus flying for 115 after 1.1s",()=>{
 const atk=unit("catapult",1,280,300),primary=unit("engineer",2,450,300),
 nearby=unit("drone",2,475,300),ally=unit("infantry",1,450,300);
 S.units=[atk,primary,nearby,ally];
 API.fire(atk,{kind:"unit",ref:primary,x:450,y:300});
 assert.equal(primary.hp,420);
 assert.equal(S.spells.incoming.length,1);
 primary.x=700;
 API.spellStep(1.09);
 assert.equal(primary.hp,420);assert.equal(nearby.hp,120);
 API.spellStep(.02);
 assert.equal(primary.hp,420);assert.equal(nearby.hp,5);
 assert.equal(ally.hp,105);
});
test("cast gravity moves an enemy without preventing attacks or changing existing AI priorities",()=>{
 const victim=unit("infantry",2,500,300);
 const caster=unit("infantry",1,800,300);S.units=[victim,caster];
 S.hand[1]=["gravity"];S.activeDecks[1]=["gravity"];
 assert.equal(API.castSpell(1,"gravity",400,300),true);
 assert.equal(S.spells.zones[0].kind,"gravity");
 assert.equal(API.gravityZoneFor(victim).kind,"gravity");
 const before=victim.x;
 API.unitStep(.1);assert.equal(victim.x,before,"voluntary movement held");
 API.spellStep(1);assert.equal(victim.x,400,"small unit pulled 100 in 1 sec");
 assert.equal(API.gravityZoneFor(caster),null,"friendly unit not affected");
 API.unitStep(.1);assert.equal(victim.x,400,"center stays locked");
 API.spellStep(1.5);
 assert.equal(S.spells.zones.length,0);
 API.unitStep(.1);assert.ok(victim.x<400,"normal AI resumes toward the enemy castle after expiration");
});
test("catapult never targets distant castle but attacks its wall upon bodily contact",()=>{
 const a=unit("catapult",1,1050,300);S.units=[a];
 assert.equal(API.selectPriorityTargets(a).attack,null,"castle=0 avoids long range siege");
 API.unitStep(.1);assert.equal(S.capitals[1].hp,3000);
 a.x=1154;a.attack=0;
 API.unitStep(.1);assert.equal(S.capitals[1].hp,2885);
 a.attack=0;
 const enemyUnit=unit("infantry",2,1140,300);S.units.push(enemyUnit);
 API.unitStep(.1);assert.equal(S.capitals[1].hp,2885,"enemy troop takes precedence");
 assert.equal(S.spells.incoming.at(-1).kind,"catapult");
});
test("kamikaze detonates on contact but not upon being killed by another unit",()=>{
 const a=unit("kamikaze",1,300,300),first=unit("engineer",2,315,300),
 side=unit("engineer",2,340,300),air=unit("drone",2,340,300);
 S.units=[a,first,side,air];
 API.fire(a,{kind:"unit",ref:first,x:first.x,y:first.y});
 assert.equal(first.hp,270);assert.equal(side.hp,307.5);assert.equal(air.hp,120);assert.ok(a.hp<=0);
 const b=unit("kamikaze",1,400,300);
 S.units.push(b);const effects=S.effects.length;
 // Unrelated damage can kill the unit but must never produce an explosion.
 ctx.hitUnit(b,150);
 assert.ok(b.hp<=0);assert.equal(S.effects.length,effects+1,"only ordinary defeat effect");
});
test("summoner creates robots at 2,4,6,11,16,21,26,31 seconds and stops at eight",()=>{
 const a=unit("mech_summoner",1,300,300);S.units=[a];
 let t=0;
 for(const threshold of [2,4,6,11,16,21,26,31]){
  API.unitStep(threshold-t);t=threshold;
  assert.equal(S.units.filter(u=>u.key==="small_machine").length,
   [2,4,6,11,16,21,26,31].indexOf(threshold)+1);
 }
 API.unitStep(10);
 assert.equal(S.units.filter(u=>u.key==="small_machine").length,8);
});
test("summoner respects per-side 65-unit cap and retries when slot opens",()=>{
 const a=unit("mech_summoner",1,300,300);
 S.units=[a,...Array.from({length:64},(_,i)=>unit("infantry",1,300+i%12,200+i%16))];
 API.unitStep(2);assert.equal(S.units.length,65);
 assert.equal(a.summonCount||0,0);
 S.units.pop();API.unitStep(.1);
 assert.equal(a.summonCount,1);assert.equal(S.units.length,65);
});
console.log("STAGE2_COMBAT_QA: registered cards, pierce, delayed area, self-destruct, castle contact, eight timed robots and gravity PASS");
