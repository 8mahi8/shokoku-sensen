// Target priority + unitStep behavioral regression suite. No npm packages.
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const src=fs.readFileSync(path.join(__dirname,"..","online-game.js"),"utf8");
function section(a,b){
 const start=src.indexOf(a),end=src.indexOf(b,start+a.length);
 assert.ok(start>=0&&end>start,"Missing live game source section "+a);
 return src.slice(start,end);
}
const source=[
 section("const CLASSES={","// School-friendly Google Sites HTML:"),
 section("// Lightweight per-unit timed statuses, shared by future buffs and debuffs.","function castSpell(team,id,x,y){"),
 section("// Target traits are shared data-driven selectors.","function moveToward(u,x,y,dt){"),
 section("function gravityZoneFor(u){","function attackUnit(target,value){"),
 section("function unitStep(dt){","function rate(){")
].join("\n");
const W=1280,H=660;
const S={units:[],forts:[],capitals:[{team:1,hp:3000},{team:2,hp:3000}],spells:{zones:[]},tickCount:0,clock:0,elapsed:0};
const shots=[];
let API;
const ctx={Math,S,W,H,WALL_TOP:69,WALL_BOTTOM:H-70,SPELLS:{gravity:{speeds:{small:100,medium:70,large:35}}},MOTION:{windup:.44},duelStats:null,
 dist:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),
 limit:(v,a,b)=>Math.max(a,Math.min(b,v)),
 enemy:t=>3-t,capital:t=>S.capitals[t-1],
 wallTarget:(c,y)=>({kind:"capital",ref:c,x:c.team===1?126:1154,y:Math.max(81,Math.min(578,y)),r:15}),
 fire:(u,t)=>{shots.push({u,t});u.attack=API.CLASSES[u.key].cool;}
};
vm.createContext(ctx);
vm.runInContext(source+"\n;globalThis.API={CLASSES,selectPriorityTargets,priorityFor,unitStep};",ctx);
API=ctx.API;
const actor=(key,team=1,x=300,y=200,uid=10)=>({
 uid,key,team,x,y,anchorX:x,anchorY:y,homeY:y,
 hp:API.CLASSES[key].hp,max:API.CLASSES[key].hp,
 attack:0,flash:0,attackAnim:0,windup:0,walkPhase:0,facing:0
});
const fort=(x,y,owner=0)=>({x,y,owner,hp:12});
function reset(){S.units=[];S.forts=[];S.spells={zones:[]};S.tickCount=0;shots.length=0;}
function test(name,fn){reset();fn();console.log("PASS "+name);}
const chosen=u=>API.selectPriorityTargets(u);
const moved=(u,dt=.1)=>{let x=u.x,y=u.y;API.unitStep(dt);return Math.hypot(u.x-x,u.y-y);};
test("baseline nine classes keep explicit priorities without a roster-size cap",()=>{
 const vals={infantry:[2,1,2],archer:[2,0,2],scout:[3,3,1],engineer:[3,3,1],
 sentinel:[1,0,2],suppress:[2,0,2],guardian:[1,0,2],drone:[2,0,2],tank:[2,0,2]};
 assert.ok(Object.keys(API.CLASSES).length>=Object.keys(vals).length,
  "future roster entries must not be rejected by an exact-nine test");
 for(const [name,list] of Object.entries(vals)){
  const p=API.CLASSES[name].targetPriority;
  assert.deepEqual([p.castle,p.fort,p.unit],list);
 }
 assert.equal(API.CLASSES.guardian.targetPriority.largeUnit,3);
 assert.equal(API.CLASSES.tank.targetPriority.largeUnit,3);
});
test("basic infantry ignores sight-only fort 1",()=>{
 const a=actor("infantry");S.units=[a];S.forts=[fort(370,200)];
 assert.equal(chosen(a).approach,null);assert.equal(chosen(a).attack,null);
 S.forts[0].x=325;assert.equal(chosen(a).attack.kind,"fort");
});
test("basic infantry shoots unit 2 before closer fort 1",()=>{
 const a=actor("infantry"),e=actor("infantry",2,329,200,11);
 S.units=[a,e];S.forts=[fort(310,200)];
 assert.equal(chosen(a).attack.ref,e);moved(a);assert.equal(shots[0].t.kind,"unit");
});
test("archer ignores fort entirely",()=>{
 const a=actor("archer");S.units=[a];S.forts=[fort(310,200)];
 assert.equal(chosen(a).attack,null);assert.equal(chosen(a).approach,null);
});
test("scout shoots fort 3 before enemy 1",()=>{
 const a=actor("scout"),e=actor("infantry",2,325,200,11);
 S.units=[a,e];S.forts=[fort(340,200)];
 assert.equal(chosen(a).attack.kind,"fort");moved(a);
 assert.equal(shots[0].t.kind,"fort");
});
test("scout retaliates while still moving to fort",()=>{
 const a=actor("scout"),e=actor("infantry",2,325,200,11);
 S.units=[a,e];S.forts=[fort(380,200)];
 assert.equal(chosen(a).attack.ref,e);assert.equal(chosen(a).approach.kind,"fort");
 assert.ok(moved(a)>0);assert.equal(shots[0].t.kind,"unit");
});
test("engineer same priority, different capture power",()=>{
 const a=actor("engineer");S.units=[a];S.forts=[fort(380,200)];
 assert.equal(chosen(a).approach.kind,"fort");
 assert.equal(API.CLASSES.engineer.capture,2);
});
test("scout reselects closest of equal-priority castle and fort (no lock)",()=>{
 const a=actor("scout",1,1080,320);S.units=[a];S.forts=[fort(1100,380)];
 assert.equal(chosen(a).approach.kind,"fort");
 S.forts[0].y=430;assert.equal(chosen(a).approach.kind,"capital");
});
test("scout does not chase sight-only enemy 1",()=>{
 const a=actor("scout"),e=actor("infantry",2,370,200,11);
 S.units=[a,e];assert.equal(chosen(a).approach,null);
 assert.ok(moved(a)>0);
});
test("suppress uses nearest not hidden swarm score",()=>{
 const a=actor("suppress"),near=actor("infantry",2,370,200,11),
 far=actor("infantry",2,395,200,12),far2=actor("infantry",2,415,200,13);
 S.units=[a,near,far,far2];assert.equal(chosen(a).attack.ref,near);
});
test("guard castle 1 in range only, not chased",()=>{
 const a=actor("sentinel",1,1080,320);S.units=[a];
 assert.equal(chosen(a).approach,null);
 a.x=1130;assert.equal(chosen(a).attack.kind,"capital");
 moved(a);assert.equal(shots[0].t.kind,"capital");
});
test("guard can chase targets within fixed anchor circle",()=>{
 const a=actor("sentinel"),e=actor("infantry",2,480,200,11);
 S.units=[a,e];a.x=510;
 assert.equal(chosen(a).attack.ref,e);
 e.x=600;assert.equal(chosen(a).approach,null);
 assert.ok(moved(a)>0);assert.ok(a.x<510);
});
test("guard can defend in-range beyond anchor circle without pursuit",()=>{
 const a=actor("sentinel"),e=actor("infantry",2,520,200,11);
 a.x=500;S.units=[a,e];
 assert.equal(chosen(a).attack.ref,e);assert.equal(chosen(a).approach,null);
});
test("guardian large priority 3 overrides closer infantry 2",()=>{
 const a=actor("guardian"),small=actor("infantry",2,325,200,11),big=actor("tank",2,350,200,12);
 S.units=[a,small,big];assert.equal(chosen(a).attack.ref,big);
});
test("guardian cannot hit airborne large",()=>{
 const a=actor("guardian"),b=actor("tank",2,345,200,11);
 API.CLASSES.largeAir={...API.CLASSES.drone,size:"large",flying:true};b.key="largeAir";
 S.units=[a,b];assert.equal(chosen(a).attack,null);delete API.CLASSES.largeAir;
});
test("tank large 3 beats castle 2 when both in range",()=>{
 const a=actor("tank",1,1130,320),b=actor("guardian",2,1050,320,11);
 S.units=[a,b];assert.equal(chosen(a).attack.ref,b);
});
test("tank hits castle 2 while large 3 is out of range",()=>{
 const a=actor("tank",1,1040,320),b=actor("guardian",2,850,320,11);
 S.units=[a,b];assert.equal(chosen(a).attack.kind,"capital");
});
test("progress troop shoots rear enemy but will not turn around to chase",()=>{
 const a=actor("infantry",1,350,200),e=actor("infantry",2,325,200,11);
 S.units=[a,e];assert.equal(chosen(a).attack.ref,e);
 e.x=255;assert.equal(chosen(a).approach,null);
});
test("own fort is no longer a candidate",()=>{
 const a=actor("scout");S.units=[a];S.forts=[fort(380,200)];
 assert.equal(chosen(a).approach.kind,"fort");
 S.forts[0].owner=1;assert.equal(chosen(a).approach,null);
});
test("blue/red mirror symmetry",()=>{
 const a=actor("guardian",1,300,200),e=actor("guardian",2,355,200,11);
 S.units=[a,e];assert.equal(chosen(a).attack.ref,e);assert.equal(chosen(e).attack.ref,a);
});
test("specific largeUnit 0 overrides normal unit 2",()=>{
 const a=actor("tank"),large=actor("guardian",2,350,200,11),small=actor("infantry",2,330,200,12);
 S.units=[a,large,small];const p=API.CLASSES.tank.targetPriority;
 p.largeUnit=0;assert.equal(chosen(a).attack.ref,small);
 p.largeUnit=3;assert.equal(chosen(a).attack.ref,large);
});
test("future flyingUnit category works with no new AI",()=>{
 const a=actor("archer"),air=actor("drone",2,400,200,11),ground=actor("infantry",2,340,200,12);
 S.units=[a,air,ground];const p=API.CLASSES.archer.targetPriority;
 p.flyingUnit=3;assert.equal(chosen(a).attack.ref,air);
 delete p.flyingUnit;assert.equal(chosen(a).attack.ref,ground);
});
test("new roster entry reuses common selector without unit-specific AI",()=>{
 const clone=JSON.parse(JSON.stringify(API.CLASSES.archer));
 API.CLASSES.futureSpecial={...clone,name:"Future Special",targetPriority:{
  castle:0,fort:0,unit:0,largeUnit:3
 }};
 try{
  const a=actor("futureSpecial"),normal=actor("infantry",2,320,200,11),
   large=actor("guardian",2,350,200,12);
  S.units=[a,normal,large];S.forts=[fort(310,200)];
  assert.equal(chosen(a).attack.ref,large);
  moved(a);assert.equal(shots[0].t.ref,large);
 }finally{delete API.CLASSES.futureSpecial;}
});
test("new castle-only priority ignores other in-range threats",()=>{
 const clone=JSON.parse(JSON.stringify(API.CLASSES.infantry));
 API.CLASSES.futureCastle={...clone,name:"Future Castle",targetPriority:{
  castle:3,fort:0,unit:0
 }};
 try{
  const a=actor("futureCastle",1,1130,320),enemy=actor("infantry",2,1138,320,11);
  S.units=[a,enemy];S.forts=[fort(1130,320)];
  assert.equal(chosen(a).attack.kind,"capital");
  moved(a);assert.equal(shots[0].t.kind,"capital");
 }finally{delete API.CLASSES.futureCastle;}
});
test("all classes expose independent valid priorities",()=>{
 for(const [id,d] of Object.entries(API.CLASSES)){
  const p=d.targetPriority;
  for(const k of ["castle","fort","unit"]){
   assert.equal(Number.isInteger(p[k])&&p[k]>=0&&p[k]<=4,true,id+" "+k);
  }
 }
});

test("later large deployment redirects guardian only on its next attack",()=>{
 const a=actor("guardian"),small=actor("infantry",2,325,200,11);
 S.units=[a,small];moved(a);
 assert.equal(shots.filter(s=>s.u===a).length,1);
 assert.equal(shots.find(s=>s.u===a).t.ref,small);
 const big=actor("tank",2,350,200,12);S.units.push(big);
 assert.equal(chosen(a).attack.ref,big);
 moved(a,.1);
 assert.equal(shots.filter(s=>s.u===a).length,1,"cooldown cannot retroactively retarget a fired hit");
 a.attack=0;moved(a);
 assert.equal(shots.filter(s=>s.u===a)[1].t.ref,big);
});
test("new closer target wins equal priority on next hit",()=>{
 const a=actor("archer"),first=actor("infantry",2,360,200,11);
 S.units=[a,first];moved(a);assert.equal(shots[0].t.ref,first);
 const closer=actor("infantry",2,320,200,12);S.units.push(closer);
 a.attack=0;moved(a);assert.equal(shots[1].t.ref,closer);
});
test("in-range priority 1 can interrupt sight-only priority 3",()=>{
 const a=actor("scout"),e=actor("infantry",2,324,200,11);
 S.units=[a,e];S.forts=[fort(380,200)];
 assert.equal(chosen(a).attack.ref,e);
 assert.equal(chosen(a).approach.kind,"fort");
 moved(a);assert.equal(shots[0].t.ref,e);
});
test("capture uses its own vision instead of remote fort lock",()=>{
 const a=actor("scout");S.units=[a];S.forts=[fort(416,200)];
 assert.equal(chosen(a).approach,null);
 S.forts[0].x=414;assert.equal(chosen(a).approach.kind,"fort");
});
test("guard uses original anchor circle even after its own displacement",()=>{
 const a=actor("sentinel"),e=actor("infantry",2,120,200,11);
 a.x=490;S.units=[a,e];
 assert.equal(chosen(a).attack,null);
 assert.equal(chosen(a).approach.ref,e);
 moved(a);assert.ok(a.x<490);
});
test("guard stops pursuit outside its anchor circle and returns",()=>{
 const a=actor("sentinel"),e=actor("infantry",2,500,200,11);
 a.x=430;S.units=[a,e];
 assert.equal(chosen(a).attack,null);
 assert.equal(chosen(a).approach,null);
 moved(a);assert.ok(a.x<430);
});
test("guard returns to anchor after its enemy is defeated",()=>{
 const a=actor("sentinel"),e=actor("infantry",2,455,200,11);
 a.x=400;e.hp=0;S.units=[a,e];
 assert.equal(chosen(a).attack,null);
 assert.equal(chosen(a).approach,null);
 moved(a);assert.ok(a.x<400);assert.equal(shots.length,0);
});
test("red progress troops do not turn back toward passed enemies",()=>{
 const a=actor("infantry",2,900,200),e=actor("infantry",1,990,200,11);
 S.units=[a,e];assert.equal(chosen(a).approach,null);
 moved(a);assert.ok(a.x<900);
});
test("fort ownership changes immediately invalidate its targeting",()=>{
 const a=actor("engineer");S.units=[a];S.forts=[fort(375,200)];
 assert.equal(chosen(a).approach.kind,"fort");
 S.forts[0].owner=1;assert.equal(chosen(a).approach,null);
 moved(a);assert.equal(shots.length,0);
});
test("future progress unit uses shared pursuit without a dedicated code path",()=>{
 API.CLASSES.futureProgress={...API.CLASSES.infantry,
  name:"Future Progress",capture:0,targetPriority:{castle:0,fort:0,unit:2}};
 try{
  const a=actor("futureProgress"),e=actor("infantry",2,380,200,11);
  S.units=[a,e];assert.equal(chosen(a).approach.ref,e);
  assert.ok(moved(a)>0);assert.ok(a.x>300);
 }finally{delete API.CLASSES.futureProgress;}
});
test("future capture unit uses shared fort targeting without a dedicated code path",()=>{
 API.CLASSES.futureCapture={...API.CLASSES.engineer,
  name:"Future Capture",targetPriority:{castle:3,fort:3,unit:1}};
 try{
  const a=actor("futureCapture");S.units=[a];S.forts=[fort(370,200)];
  assert.equal(chosen(a).approach.kind,"fort");
  assert.ok(moved(a)>0);assert.ok(a.x>300);
 }finally{delete API.CLASSES.futureCapture;}
});
test("future guard unit reuses anchored pursuit and return without new AI",()=>{
 API.CLASSES.futureGuard={...API.CLASSES.sentinel,
  name:"Future Guard",targetPriority:{castle:1,fort:0,unit:2}};
 try{
  const a=actor("futureGuard"),e=actor("infantry",2,425,200,11);
  S.units=[a,e];assert.equal(chosen(a).approach.ref,e);
  moved(a);assert.ok(a.x>300);
  // After a longer pursuit, the unit is outside its 7px idle tolerance.
  a.x=360;const chasedX=a.x;
  e.x=510;assert.equal(chosen(a).approach,null);
  moved(a);assert.ok(a.x<chasedX);
 }finally{delete API.CLASSES.futureGuard;}
});
test("stage-one roster has five distinct data-only behavior configurations",()=>{
 const expected={duelist:["normal",0,145,22,.55],crusher:["normal",0,460,150,2.65],
  ranger_engineer:["capture",2,300,30,1.4],interceptor:["guard",0,195,38,1.15],
  ground_bomber:["normal",0,230,55,1.9]};
 for(const [id,[behavior,capture,hp,damage,cool]] of Object.entries(expected)){
  const c=API.CLASSES[id];
  assert.equal(c.behavior,behavior,id+" behavior");
  assert.equal(c.capture,capture,id+" capture");
  assert.equal(c.hp,hp,id+" hp");assert.equal(c.damage,damage,id+" damage");
  assert.equal(c.cool,cool,id+" attack cooldown");
 }
 assert.equal(API.CLASSES.crusher.targetPriority.largeUnit,undefined,
  "crusher is intentionally generalist, never a large-target specialist");
 assert.equal(API.CLASSES.ground_bomber.flying,true);
 assert.equal(API.CLASSES.ground_bomber.hitAir,false);
});
test("stage-one long-range engineer attacks fort with shared capture priority",()=>{
 const a=actor("ranger_engineer"),enemy=actor("infantry",2,325,200,11);
 S.units=[a,enemy];S.forts=[fort(380,200)];
 assert.equal(chosen(a).attack.kind,"fort");
 moved(a);assert.equal(shots[0].t.kind,"fort");
});
test("stage-one fast guard obeys the spawn-anchor sensor and returns",()=>{
 const a=actor("interceptor"),enemy=actor("infantry",2,482,200,11);
 S.units=[a,enemy];assert.equal(chosen(a).approach.ref,enemy);
 assert.ok(moved(a)>0);assert.ok(a.x>300);
 a.x=475;enemy.x=540;
 assert.equal(chosen(a).approach,null);
 moved(a);assert.ok(a.x<475,"must return to spawn, not chase indefinitely");
});
test("stage-one bomber can hit ground but not other flying units",()=>{
 const a=actor("ground_bomber"),air=actor("drone",2,325,200,11),
  ground=actor("infantry",2,350,200,12);
 S.units=[a,air,ground];assert.equal(chosen(a).attack.ref,ground);
 air.x=325;ground.hp=0;assert.equal(chosen(a).attack,null);
});
test("stage-one generalist heavy hitter targets nearer small before distant large",()=>{
 const a=actor("crusher"),small=actor("infantry",2,320,200,11),
  big=actor("guardian",2,337,200,12);
 S.units=[a,small,big];
 assert.equal(chosen(a).attack.ref,small);
});
// Priority 4 extends the shared selector without adding a new behavior mode
// or changing the existing 0-3 units. Test a synthetic future capture kaiju.
function withObjective(fn){
 API.CLASSES.qaObjective={...API.CLASSES.engineer,
  name:"QA Objective",range:38,vision:520,
  targetPriority:{castle:2,fort:4,unit:2}};
 try{fn();}finally{delete API.CLASSES.qaObjective;}
}
test("priority 4 distant fort overrides in-range enemy 2 without retaliation",()=>withObjective(()=>{
 const a=actor("qaObjective",1,300,200),e=actor("infantry",2,323,200,11);
 S.units=[a,e];S.forts=[fort(410,200)];
 const c=chosen(a);
 assert.equal(c.attack,null,"sighted objective must suppress lower-priority attack");
 assert.equal(c.approach.kind,"fort");
 assert.ok(moved(a)>0);assert.ok(a.x>300);
 assert.equal(shots.filter(x=>x.u===a).length,0,"do not retaliate along the way");
}));
test("priority 4 in-range fort beats closer enemy 2",()=>withObjective(()=>{
 const a=actor("qaObjective",1,300,200),e=actor("infantry",2,316,200,11);
 S.units=[a,e];S.forts=[fort(329,200)];
 assert.equal(chosen(a).attack.kind,"fort");
 moved(a);assert.equal(shots[0].t.kind,"fort");
}));
test("priority 4 does not see targets beyond its configured vision",()=>withObjective(()=>{
 const a=actor("qaObjective",1,300,200),e=actor("infantry",2,319,200,11);
 S.units=[a,e];S.forts=[fort(940,200)];
 assert.equal(chosen(a).attack.ref,e);
 moved(a);assert.equal(shots[0].t.ref,e);
}));
test("priority 4 fort ownership change restores ordinary enemy attack",()=>withObjective(()=>{
 const a=actor("qaObjective",1,300,200),e=actor("infantry",2,321,200,11);
 S.units=[a,e];S.forts=[fort(405,200)];
 assert.equal(chosen(a).attack,null);
 S.forts[0].owner=1;
 assert.equal(chosen(a).attack.ref,e);
 moved(a);assert.equal(shots[0].t.ref,e);
}));
test("priority 4 pursuit works symmetrically for the red team",()=>withObjective(()=>{
 const a=actor("qaObjective",2,900,200),e=actor("infantry",1,880,200,11);
 S.units=[a,e];S.forts=[fort(780,200)];
 assert.equal(chosen(a).attack,null);
 assert.equal(chosen(a).approach.kind,"fort");
 moved(a);assert.ok(a.x<900);assert.equal(shots.filter(x=>x.u===a).length,0);
}));
test("priority 3 remains attack-first even against farther priority 3",()=>withObjective(()=>{
 const a=actor("qaObjective",1,300,200),e=actor("infantry",2,321,200,11);
 S.units=[a,e];S.forts=[fort(405,200)];
 const priority=API.CLASSES.qaObjective.targetPriority;
 priority.fort=3;
 assert.equal(chosen(a).attack.ref,e);
 assert.equal(chosen(a).approach.kind,"fort");
 moved(a);assert.equal(shots[0].t.ref,e);
}));
test("kaiju castle priority 1 selects closer defender",()=>{
 const a=actor("kaiju",1,1100,200),e=actor("infantry",2,1120,200,11);
 S.units=[a,e];
 const p=API.CLASSES.kaiju.targetPriority;
 assert.deepEqual([p.castle,p.fort,p.unit],[1,4,1]);
 assert.equal(chosen(a).attack.ref,e);
 moved(a);assert.equal(shots[0].t.ref,e);
});
test("kaiju fort priority 4 still overrides nearby enemy",()=>{
 const a=actor("kaiju",1,1100,200),e=actor("infantry",2,1120,200,11);
 S.units=[a,e];S.forts=[fort(1148,200,2)];
 assert.equal(chosen(a).attack.kind,"fort");
});
console.log("TARGET_PRIORITY_QA: 50 scenarios passed");
