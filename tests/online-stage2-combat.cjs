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
 section("// Lightweight per-unit timed statuses, shared by future buffs and debuffs.","function playCard(team,id,x,y){"),
 section("function shieldMultiplier(team,x,y){","function getFort(u){"),
 section("// Target traits are shared data-driven selectors.","function rate(){"),
 "globalThis.API={CLASSES,SPELLS,CATALOG,deploy,castSpell,fire,unitStep,spellStep,effectiveMoveSpeed,selectPriorityTargets,gravityZoneFor};"
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
 assert.ok(C.small_machine_elite.internalOnly&&C.small_machine_elite.deckEligible===false);
 assert.deepEqual([C.small_machine.hp,C.small_machine.damage,C.small_machine.cool],[105,18,1.5]);
 assert.deepEqual([C.small_machine_elite.hp,C.small_machine_elite.damage,C.small_machine_elite.cool],[220,35,1.5]);
 assert.equal(C.small_machine_elite.capture,0);
 assert.equal(C.small_machine_elite.hitAir,false);
 assert.equal(C.mech_summoner.cost,5);
 assert.equal(C.mech_summoner.hp,340);
 assert.equal(C.mech_summoner.limit,2);
 assert.equal(C.small_machine_elite.behavior,C.small_machine.behavior);
 assert.equal(C.mech_summoner.summonTimes.join(","),"2,4,6,11,16,21,26,31");
 assert.equal(API.SPELLS.gravity.duration,2.5);
 assert.equal(API.SPELLS.gravity.cost,3);
});
test("drone trial speed decreases to 30 without altering movement buff scaling",()=>{
 const drone=unit("drone",1,420,300);
 assert.equal(API.CLASSES.drone.speed,30,"only the trial move-speed baseline changes");
 assert.equal(API.CLASSES.drone.qty,2,"drone still summons a pair");
 assert.equal(API.CLASSES.drone.limit,3,"approved drone cap is 3 deployments / 6 bodies");
 assert.equal(API.effectiveMoveSpeed(drone),30);
 drone.statusEffects=[{key:"gale",stat:"moveSpeed",mult:1.5,remaining:4}];
 assert.equal(API.effectiveMoveSpeed(drone),45,"gale remains multiplicative");
});
test("pierce hits 10 targets maximum, main 55 and behind targets 33",()=>{
 const atk=unit("piercer",1,420,300);
 const foes=Array.from({length:12},(_,i)=>unit("engineer",2,470+i*6,300));
 const off=unit("engineer",2,495,370),ally=unit("engineer",1,495,300),air=unit("drone",2,500,370);
 S.units=[atk,...foes,off,ally,air];
 API.fire(atk,{kind:"unit",ref:foes[0],x:foes[0].x,y:foes[0].y});
 assert.equal(foes[0].hp,420-55);
 assert.equal(foes.slice(1,10).filter(v=>v.hp===387).length,9);
 assert.ok(foes.slice(10).every(v=>v.hp===420));
 assert.equal(off.hp,420);assert.equal(ally.hp,420);assert.equal(air.hp,120);
});
test("tripled pierce lane hits ground and air but not off-ray or allied targets",()=>{
 const atk=unit("piercer",1,420,300),main=unit("engineer",2,470,300);
 const near=unit("engineer",2,500,340),outside=unit("engineer",2,500,343);
 const ahead=unit("engineer",2,450,300),far=unit("engineer",2,640,300);
 const ally=unit("engineer",1,500,340),air=unit("drone",2,500,320);
 S.units=[atk,main,near,outside,ahead,far,ally,air];
 assert.equal(API.CLASSES.piercer.pierceWidth,42);
 API.fire(atk,{kind:"unit",ref:main,x:main.x,y:main.y});
 assert.equal(main.hp,365,"the primary still takes 55");
 assert.equal(near.hp,387,"40px offset takes 33 pierce");
 assert.equal(outside.hp,420,"43px offset is excluded");
 assert.equal(ahead.hp,420,"targets before the primary cannot be pierced");
 assert.equal(far.hp,420,"pierce does not extend beyond max range + unit radius");
 assert.equal(ally.hp,420,"friendly unit is never hit");
 assert.equal(air.hp,87,"flying secondary receives 33");
});

test("piercer hits flying primary and mixed airborne/ground secondaries",()=>{
 const a=unit("piercer",1,420,300),main=unit("drone",2,470,300);
 S.units=[a,main];
 assert.equal(API.CLASSES.piercer.hitAir,true);
 assert.equal(API.selectPriorityTargets(a).attack.ref,main,"airborne target acquired");
 const air=unit("drone",2,510,322),ground=unit("engineer",2,515,300),
  before=unit("drone",2,455,300),off=unit("drone",2,520,350),
  friendly=unit("drone",1,510,310);
 S.units.push(air,ground,before,off,friendly);
 API.fire(a,{kind:"unit",ref:main,x:main.x,y:main.y});
 assert.equal(main.hp,65,"55 airborne main damage");
 assert.equal(air.hp,87,"33 airborne secondary damage");
 assert.equal(ground.hp,387,"33 ground secondary damage");
 assert.equal(before.hp,120,"air before target is excluded");
 assert.equal(off.hp,120,"air outside 42px lane is excluded");
 assert.equal(friendly.hp,120,"friendly flyer not hit");
});
test("ranged engineer can directly hit air and still prioritizes capturing forts",()=>{
 const a=unit("ranger_engineer",1,420,300),air=unit("drone",2,460,300);
 S.units=[a,air];
 assert.equal(API.CLASSES.ranger_engineer.hitAir,true);
 assert.equal(API.CLASSES.ranger_engineer.capture,2);
 assert.equal(API.selectPriorityTargets(a).attack.ref,air);
 API.fire(a,{kind:"unit",ref:air,x:air.x,y:air.y});
 assert.equal(air.hp,90,"30 vs flying unit");
 assert.equal(S.projectiles.at(-1).kind,"ranger_engineer");
 S.forts=[{x:445,y:300,owner:2,hp:12}];
 assert.equal(API.selectPriorityTargets(a).attack.kind,"fort",
  "fort priority 3 must remain above unit priority 1");
});
test("suppress and tank splash hit flying bystanders and flying target groups",()=>{
 for(const key of ["suppress","tank"]){
  const d=API.CLASSES[key],a=unit(key,1,420,300),
   main=unit("engineer",2,460,300),air=unit("drone",2,470,320),
   ground=unit("engineer",2,475,330),
   outside=unit("drone",2,460,300+d.splash+2),friendly=unit("drone",1,468,300);
  S.units=[a,main,air,ground,outside,friendly];
  API.fire(a,{kind:"unit",ref:main,x:main.x,y:main.y});
  const splash=d.damage*d.splashScale;
  assert.equal(main.hp,420-d.damage,key+" unchanged primary");
  assert.ok(Math.abs(air.hp-(120-splash))<1e-8,key+" flying splash");
  assert.ok(Math.abs(ground.hp-(420-splash))<1e-8,key+" ground splash");
  assert.equal(outside.hp,120,key+" airborne outside range");
  assert.equal(friendly.hp,120,key+" allied air immune");
  const a2=unit(key,1,420,300),mainAir=unit("drone",2,460,300),
   air2=unit("drone",2,475,310);
  S.units=[a2,mainAir,air2];
  assert.equal(API.selectPriorityTargets(a2).attack.ref,mainAir,key+" air primary acquired");
  API.fire(a2,{kind:"unit",ref:mainAir,x:mainAir.x,y:mainAir.y});
  assert.equal(mainAir.hp,120-d.damage,key+" primary flying damage");
  assert.ok(Math.abs(air2.hp-(120-splash))<1e-8,key+" airborne behind main");
 }
});
test("ground-only splash does not accidentally become anti-air",()=>{
 for(const key of ["sentinel","guardian","ground_bomber"]){
  const d=API.CLASSES[key],a=unit(key,1,420,300),
   main=unit("engineer",2,455,300),air=unit("drone",2,460,315);
  S.units=[a,main,air];
  assert.equal(d.hitAir,false);
  API.fire(a,{kind:"unit",ref:main,x:main.x,y:main.y});
  assert.equal(air.hp,120,key+" airborne bystander excluded");
  S.units=[a,air];
  assert.notEqual(API.selectPriorityTargets(a).attack?.ref,air,
   key+" cannot directly select airborne unit");
 }
});
test("gravity pulls grounded enemies but never flying drone or bomber",()=>{
 const ground=unit("infantry",2,480,300),drone=unit("drone",2,480,310),
  bomber=unit("kamikaze",2,480,330),ally=unit("infantry",1,480,320);
 S.units=[ground,drone,bomber,ally];
 S.hand[1]=["gravity"];S.activeDecks[1]=["gravity"];
 assert.equal(API.castSpell(1,"gravity",400,300),true);
 assert.equal(API.gravityZoneFor(ground).kind,"gravity");
 for(const u of [drone,bomber,ally])assert.equal(API.gravityZoneFor(u),null);
 const positions=[drone.x,drone.y,bomber.x,bomber.y,ally.x,ally.y];
 API.spellStep(1);
 assert.ok(ground.x<480,"ground unit is pulled");
 assert.deepEqual([drone.x,drone.y,bomber.x,bomber.y,ally.x,ally.y],positions,
  "flying enemies and allies are never displaced by gravity");
});
test("contact blast trial is 400 primary, 300 splash, 90 radius, 4-cost single-use",()=>{
 const C=API.CLASSES.kamikaze;
 assert.deepEqual([C.cost,C.qty,C.hp,C.damage,C.speed,C.splash,C.splashScale,C.limit],
  [4,1,150,400,43,90,.75,4]);
 const actor=unit("kamikaze",1,400,300),primary=unit("engineer",2,440,300);
 const justInside=unit("engineer",2,440,389),outside=unit("engineer",2,440,391);
 const ally=unit("infantry",1,443,300),air=unit("drone",2,455,300);
 S.units=[actor,primary,justInside,outside,ally,air];
 API.fire(actor,{kind:"unit",ref:primary,x:primary.x,y:primary.y});
 assert.equal(primary.hp,20,"420-HP main target survives 400 with 20");
 assert.equal(justInside.hp,120,"300 splash reaches radius 89");
 assert.equal(outside.hp,420,"splash stops outside radius 90");
 assert.equal(ally.hp,105);assert.equal(air.hp,120);
 assert.ok(actor.hp<=0,"contact bomber self-destructs on hit");
 const castleBomber=unit("kamikaze",1,1100,300);
 const before=S.capitals[1].hp;
 API.fire(castleBomber,{kind:"capital",ref:S.capitals[1],x:1154,y:300});
 assert.equal(S.capitals[1].hp,before-400,"one collision deals 400 siege damage");
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
 assert.equal(first.hp,20);assert.equal(side.hp,120);assert.equal(air.hp,120);assert.ok(a.hp<=0);
 const b=unit("kamikaze",1,400,300);
 S.units.push(b);const effects=S.effects.length;
 // Unrelated damage can kill the unit but must never produce an explosion.
 ctx.hitUnit(b,150);
 assert.ok(b.hp<=0);assert.equal(S.effects.length,effects+1,"only ordinary defeat effect");
});
test("contact bomber approaches until hitboxes touch instead of exploding at sight-range edge",()=>{
 const attacker=unit("kamikaze",1,300,300),victim=unit("infantry",2,336,300);
 S.units=[attacker,victim];
 // Acquisition threshold is 28 + target radius 12; physical collision is 17 + 12.
 assert.equal(API.selectPriorityTargets(attacker).attack.ref,victim);
 API.unitStep(.1);
 assert.equal(attacker.hp,150,"not exploded before physical contact");
 assert.ok(attacker.x>300,"bomber moves toward target rather than freezing within acquisition range");
 for(let i=0;i<8&&attacker.hp>0;i++)API.unitStep(.1);
 assert.ok(attacker.hp<=0,"bomb detonates after actual contact");
});
test("summoner births 7 lightly buffed robots and one elite at 31s, never a ninth",()=>{
 const a=unit("mech_summoner",1,300,300);S.units=[a];
 let elapsed=0;
 const times=[2,4,6,11,16,21,26,31];
 for(const threshold of times){
  API.unitStep(threshold-elapsed-.01);elapsed=threshold-.01;
  assert.equal(S.units.filter(u=>u.key.startsWith("small_machine")).length,
   times.indexOf(threshold),"the next child must not spawn early");
  API.unitStep(.01);elapsed=threshold;
  const children=S.units.filter(u=>u.key.startsWith("small_machine"));
  assert.equal(children.length,times.indexOf(threshold)+1);
  assert.equal(children.at(-1).key,threshold===31?"small_machine_elite":"small_machine");
  assert.equal(children.at(-1).max,threshold===31?220:105);
 }
 API.unitStep(15);
 assert.equal(a.summonCount,8);
 assert.equal(S.units.filter(u=>u.key==="small_machine").length,7);
 assert.equal(S.units.filter(u=>u.key==="small_machine_elite").length,1);
});
test("gravity fields never act as allied shields; ward remains a separate spell",()=>{
 const gravity={kind:"gravity",team:1,x:400,y:300,r:125,time:2.5};
 const ally=unit("infantry",1,400,300),enemy=unit("infantry",2,400,300);
 S.units=[ally,enemy];S.spells.zones=[gravity];
 ctx.hitUnit(ally,20);ctx.hitUnit(enemy,20);
 assert.equal(ally.hp,85);assert.equal(enemy.hp,85,"gravity must not grant a ward multiplier");
 S.spells.zones.push({kind:"ward",team:1,x:400,y:300,r:93,time:5.2});
 ctx.hitUnit(ally,20);ctx.hitUnit(enemy,20);
 assert.equal(ally.hp,74,"ward still cuts damage to 55%");
 assert.equal(enemy.hp,65,"enemy gets no friendly ward");
});
test("killing the summoner stops future births but leaves already spawned robots alive",()=>{
 const summoner=unit("mech_summoner",1,300,300);S.units=[summoner];
 API.unitStep(2);
 const robot=S.units.find(u=>u.key==="small_machine");
 assert.ok(robot);
 ctx.hitUnit(summoner,400);
 API.unitStep(30);
 assert.equal(S.units.filter(u=>u.key==="small_machine").length,1);
 assert.equal(robot.hp,105,"children must not die automatically with their summoner");
});
test("summoner respects per-side 65-unit cap and retries when slot opens",()=>{
 const a=unit("mech_summoner",1,300,300);
 S.units=[a,...Array.from({length:64},(_,i)=>unit("infantry",1,300+i%12,200+i%16))];
 API.unitStep(2);assert.equal(S.units.length,65);
 assert.equal(a.summonCount||0,0);
 S.units.pop();API.unitStep(.1);
 assert.equal(a.summonCount,1);assert.equal(S.units.length,65);
});
test("two summoners track the eighth elite independently",()=>{
 const a=unit("mech_summoner",1,250,250),b=unit("mech_summoner",2,1000,450);
 S.units=[a,b];
 for(const dt of [2,2,2,5,5,5,5,5])API.unitStep(dt);
 assert.equal(a.summonCount,8);assert.equal(b.summonCount,8);
 for(const team of [1,2]){
  const robots=S.units.filter(u=>u.team===team&&u.key.startsWith("small_machine"));
  assert.equal(robots.filter(u=>u.key==="small_machine").length,7);
  assert.equal(robots.filter(u=>u.key==="small_machine_elite").length,1);
 }
});
test("elite waits for the 65-unit cap and retries without becoming ordinary",()=>{
 const a=unit("mech_summoner",1,300,300);
 S.units=[a];
 for(const dt of [2,2,2,5,5,5,5])API.unitStep(dt);
 assert.equal(a.summonCount,7);
 while(S.units.filter(u=>u.team===1&&u.hp>0).length<65)
  S.units.push(unit("infantry",1,350,240));
 API.unitStep(5);
 assert.equal(a.summonCount,7);
 assert.equal(S.units.filter(u=>u.key==="small_machine_elite").length,0);
 S.units.pop();
 API.unitStep(.1);
 assert.equal(a.summonCount,8);
 assert.equal(S.units.filter(u=>u.key==="small_machine_elite").length,1);
});
test("elite is internally spawned only, using the same collision and attack rules",()=>{
 const elite=unit("small_machine_elite",1,400,300);
 const enemy=unit("infantry",2,418,300);
 S.units=[elite,enemy];
 API.fire(elite,{kind:"unit",ref:enemy,x:enemy.x,y:enemy.y});
 assert.equal(enemy.hp,70,"elite deals exactly 35 attack damage");
 assert.equal(API.CLASSES.small_machine_elite.capture,0);
 assert.equal(API.CLASSES.small_machine_elite.hitAir,false);
 assert.equal(API.CLASSES.small_machine_elite.internalOnly,true);
 assert.equal(API.CLASSES.small_machine_elite.deckEligible,false);
});
test("three new cards use approved costs and low-touch effects",()=>{
 const med=API.CLASSES.medic,aa=API.SPELLS.anti_air_missile,bolt=API.SPELLS.small_lightning;
 assert.deepEqual([med.cost,med.limit,med.qty,med.hp,med.damage,med.cool,med.healRadius,med.healAmount,med.healInterval],[2,4,1,120,10,2,90,20,2]);
 assert.equal(med.behavior,"guard");assert.equal(med.capture,0);assert.equal(med.hitAir,false);
 assert.deepEqual([aa.cost,aa.limit,aa.radius,aa.damage,aa.groundDamage,aa.delay],[2,3,100,200,25,.4]);
 assert.deepEqual([bolt.cost,bolt.limit,bolt.radius,bolt.damage,bolt.delay],[1,4,45,30,.3]);
});
test("medic heals weakest HP percentage every 2s; respects 90 radius, uid and max HP",()=>{
 const med=unit("medic",1,400,300),injured=unit("engineer",1,420,300),
  outside=unit("engineer",1,491,300),enemy=unit("engineer",2,650,300);
 injured.hp=200;outside.hp=30;enemy.hp=30;
 S.units=[med,injured,outside,enemy];
 for(const u of S.units)u.attack=999;
 API.unitStep(1.99);
 assert.equal(injured.hp,200,"first heal cannot happen before 2s");
 API.unitStep(.01);
 assert.equal(injured.hp,220,"healing pulse restores exactly 20 HP");
 assert.equal(outside.hp,30,"unit beyond radius excluded");
 assert.equal(enemy.hp,30,"opponent excluded");
 assert.equal(med.hp,120,"medic cannot heal itself");
 const ally2=unit("engineer",1,425,300);ally2.hp=220;ally2.attack=999;
 injured.hp=220;S.units.push(ally2);
 API.unitStep(2);
 assert.equal(injured.hp,240,"lower uid wins tie at same HP ratio");
 assert.equal(ally2.hp,220,"only one ally healed per pulse");
 injured.hp=415;ally2.hp=420;
 API.unitStep(2);
 assert.equal(injured.hp,420,"HP cannot exceed max");
 assert.ok(S.effects.some(x=>x.type==="heal"),"healing has visible effect echo");
});
test("medic can heal allied flyer but not after its own death",()=>{
 const med=unit("medic",1,400,300),drone=unit("drone",1,410,300);
 med.attack=999;drone.attack=999;drone.hp=99;S.units=[med,drone];
 API.unitStep(2);
 assert.equal(drone.hp,119);
 ctx.hitUnit(med,120);drone.hp=55;
 API.unitStep(2);assert.equal(drone.hp,55,"dead medic cannot heal");
 assert.equal(S.capitals[0].hp,3000);
});
test("AA guided missile: delayed host-owned single-target nearest flyer, ground fallback and miss",()=>{
 const far=unit("ground_bomber",2,490,300),near=unit("drone",2,450,300),
  ground=unit("engineer",2,405,300),friend=unit("drone",1,402,300);
 S.units=[far,near,ground,friend];
 S.hand[1]=["anti_air_missile"];S.activeDecks[1]=["anti_air_missile"];
 assert.equal(API.castSpell(1,"anti_air_missile",400,300),true);
 assert.equal(S.left[1].anti_air_missile,2);
 assert.equal(S.energy[1],10);
 assert.equal(near.hp,120,"damage must wait for .4s");
 API.spellStep(.39);assert.equal(near.hp,120);
 API.spellStep(.02);
 assert.ok(near.hp<=0,"closest flyer receives 200");
 assert.equal(far.hp,230,"no second flyer damaged");
 assert.equal(ground.hp,420,"no ground damage while flying target is available");
 assert.equal(friend.hp,120);
 assert.equal(S.spells.incoming.length,0);
 S.units=[ground,friend];S.hand[1]=["anti_air_missile"];
 assert.equal(API.castSpell(1,"anti_air_missile",400,300),true);
 API.spellStep(.4);
 assert.equal(ground.hp,395,"ground fallback is only 25");
 S.units=[friend];S.hand[1]=["anti_air_missile"];
 assert.equal(API.castSpell(1,"anti_air_missile",400,300),true);
 API.spellStep(.4);
 assert.equal(friend.hp,120,"no enemy means no damage");
 assert.equal(S.left[1].anti_air_missile,0,"miss consumes last finite charge");
 assert.equal(S.capitals[0].hp,3000);
 assert.equal(S.capitals[1].hp,3000);
});
test("small lightning strikes every nearby ground and flying enemy after .3s",()=>{
 const ground=unit("infantry",2,430,300),air=unit("drone",2,410,320),
  outside=unit("infantry",2,446,300),friend=unit("infantry",1,400,300);
 S.units=[ground,air,outside,friend];
 S.hand[1]=["small_lightning"];S.activeDecks[1]=["small_lightning"];
 assert.equal(API.castSpell(1,"small_lightning",400,300),true);
 assert.equal(S.energy[1],11);assert.equal(S.left[1].small_lightning,3);
 API.spellStep(.29);assert.equal(ground.hp,105);
 API.spellStep(.02);
 assert.equal(ground.hp,75);assert.equal(air.hp,90);
 assert.equal(outside.hp,105);assert.equal(friend.hp,105);
 assert.equal(S.capitals[0].hp,3000);assert.equal(S.capitals[1].hp,3000);
 assert.equal(S.spells.incoming.length,0);
});
test("stage3 kaiju objective and gale status",()=>{
 const a=unit("kaiju",1,300,300),e=unit("infantry",2,329,300);
 S.units=[a,e];S.forts=[{x:430,y:300,hp:12,owner:2}];
 assert.equal(API.selectPriorityTargets(a).attack,null);
 API.unitStep(.1);assert.ok(a.x>300);assert.equal(e.hp,105);
 S.hand[1]=["gale"];S.activeDecks[1]=["gale"];
 assert.equal(API.castSpell(1,"gale",a.x,a.y),true);
 assert.equal(a.statusEffects[0].remaining,4);
 assert.equal(e.statusEffects,undefined);
 a.x=550;API.unitStep(.1);
 assert.ok(a.statusEffects[0].remaining<4);
 for(let i=0;i<41;i++)API.unitStep(.1);
 assert.ok(!a.statusEffects.length);
});
console.log("STAGE2_COMBAT_QA: registered cards, pierce, delayed area, self-destruct, castle contact, eight timed robots and gravity PASS");
