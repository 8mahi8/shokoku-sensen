// Real stage-one gameplay extraction: deploy, fire, damage, fort capture, and splash.
// No browser, RTDB, or packages. Only world/DOM dependencies are mocked.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const src=fs.readFileSync(path.join(__dirname,"..","online-game.js"),"utf8");
function section(start,end){
 const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,"Missing real engine section "+start+" -> "+end);
 return src.slice(a,b);
}
const S={phase:"battle",clock:3,elapsed:0,energy:[0,12,12],
 left:[null,{},{}],hand:[null,[],[]],queue:[null,[],[]],
 activeDecks:[null,[],[]],units:[],forts:[],capitals:[],
 effects:[],projectiles:[],deaths:[],spells:{zones:[]},uid:0,
 underAttackUntil:0,lastAlert:-100};
const notices=[],results=[];
let API;
const scope={
 window:{},S,Math,POST_HP:12,CASTLE_DAMAGE:1,
 dist:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),
 limit:(v,a,b)=>Math.max(a,Math.min(b,v)),
 rand:(a,b)=>(a+b)/2,ME:()=>0,notice:s=>notices.push(s),
 end:(...args)=>results.push(args),buildCards:()=>{},updateHUD:()=>{},
 SPELLS:{ward:{mult:.55}},qaOpeningAudit:null,duelStats:null,
 qaBotVariants:[null,"",""],qaCastleHitEvents:[],
 canPlace:(team,x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&
  (team===1?x<=244:x>=1036)&&y>=42&&y<=623,
 canPay:(team,id)=>!!API?.CLASSES[id]&&S.energy[team]>=API.CLASSES[id].cost&&
  (id==="infantry"||S.hand[team].includes(id))&&
  (id==="infantry"||S.activeDecks[team].includes(id))
};
vm.createContext(scope);
vm.runInContext([
 section("const MOTION={","const CLASSES={"),
 section("const CLASSES={","// School-friendly Google Sites HTML:"),
 "const HAND_SIZE=4;",
 section("function advanceHand(team,id){","const TEAM="),
 section("function deploy(team,id,x,y){","function notice(message){"),
 section("function shieldMultiplier(team,x,y){","function spellStep(dt){"),
 section("function attackUnit(target,value){","function unitStep(dt){"),
 "globalThis.API={CLASSES,deploy,fire};"
].join("\n"),scope,{filename:"stage1-extracted-engine.js"});
API=scope.API;
const roster=["duelist","crusher","ranger_engineer","interceptor","ground_bomber"];
function reset(){
 S.phase="battle";S.clock=3;S.elapsed=0;S.energy=[0,12,12];S.uid=0;
 S.units=[];S.forts=[];S.capitals=[];S.effects=[];S.projectiles=[];S.deaths=[];
 S.spells={zones:[]};S.hand=[null,[],[]];S.queue=[null,[],[]];
 S.activeDecks=[null,[],[]];S.left=[null,{},{}];
 for(const team of [1,2])
  for(const [id,d] of Object.entries(API.CLASSES))S.left[team][id]=d.limit;
 notices.length=0;results.length=0;
}
function unit(key,team,x,y,uid=1){
 const c=API.CLASSES[key];
 return {uid,key,team,x,y,hp:c.hp,max:c.hp,walkPhase:0,facing:0,drift:0};
}
function test(label,fn){reset();fn();console.log("PASS: "+label);}
for(const team of [1,2]){
 test("all five stage-one cards deploy on "+(team===1?"blue":"red")+" side and rotate hand",()=>{
  for(const id of roster){
   const c=API.CLASSES[id],x=team===1?180:1100;
   S.energy[team]=12;
   S.activeDecks[team]=[id,"scout","archer","engineer"];
   S.hand[team]=[id,"scout","archer","engineer"];
   S.queue[team]=["sentinel"];
   const before=S.units.length,limitBefore=S.left[team][id];
   assert.equal(API.deploy(team,id,x,300),true,id+" deploy");
   assert.equal(S.units.length,before+c.qty,id+" unit count");
   const spawned=S.units.at(-1);
   assert.equal(spawned.key,id);
   assert.equal(spawned.team,team);
   assert.equal(spawned.hp,c.hp);
   assert.ok(Number.isFinite(spawned.attackAnimMax)&&spawned.attackAnimMax>0,"attack animation registered");
   assert.equal(S.energy[team],12-c.cost);
   assert.equal(S.left[team][id],limitBefore-1);
   assert.equal(S.hand[team].includes("sentinel"),true,"hand must rotate");
   assert.equal(S.queue[team].includes(id),true,"played card returns if charges remain");
  }
 });
}
test("non-selected class cannot be summoned even with enough energy",()=>{
 S.hand[1]=["duelist"];S.activeDecks[1]=["scout"];
 assert.equal(API.deploy(1,"duelist",160,300),false);
 assert.equal(S.units.length,0);
});
test("duelist and interceptor deal one ordinary hit, not an invented combo",()=>{
 const opponent=unit("engineer",2,500,300);
 S.units=[opponent];
 API.fire(unit("duelist",1,450,300,2),{kind:"unit",ref:opponent,x:500,y:300});
 assert.equal(opponent.hp,420-22);
 API.fire(unit("interceptor",1,460,300,3),{kind:"unit",ref:opponent,x:500,y:300});
 assert.equal(opponent.hp,420-22-38);
});
test("crusher does the same 150 damage to small and large targets",()=>{
 const a=unit("infantry",2,500,300),b=unit("guardian",2,570,300,3);
 S.units=[a,b];
 const crusher=unit("crusher",1,450,300,2);
 API.fire(crusher,{kind:"unit",ref:a,x:a.x,y:a.y});
 assert.ok(a.hp<=0);
 assert.equal(S.deaths.length,1,"lethal target creates standard death effect");
 API.fire(crusher,{kind:"unit",ref:b,x:b.x,y:b.y});
 assert.equal(b.hp,1400-150,"no hidden large-unit bonus");
});
test("ranged engineer uses updated capture=2 rather than damage=30 on enemy fort",()=>{
 const fort={x:500,y:300,owner:2,hp:12};
 S.forts=[fort];
 const engineer=unit("ranger_engineer",1,450,300);
 API.fire(engineer,{kind:"fort",ref:fort,x:500,y:300});
 assert.equal(fort.hp,10);
 for(let i=0;i<5;i++)API.fire(engineer,{kind:"fort",ref:fort,x:500,y:300});
 assert.equal(fort.owner,1);
 assert.equal(fort.hp,12,"captured fort resets to full 12");
});
test("red ranged engineer can recapture the same neutral fort",()=>{
 const fort={x:700,y:300,owner:1,hp:12};
 const engineer=unit("ranger_engineer",2,740,300);
 API.fire(engineer,{kind:"fort",ref:fort,x:700,y:300});
 assert.equal(fort.hp,10);
});
test("ground bomber hits ground splash, never a flying bystander or ally",()=>{
 const direct=unit("infantry",2,500,300),secondary=unit("infantry",2,550,300,3);
 const airborne=unit("drone",2,530,300,4),ally=unit("infantry",1,540,300,5);
 S.units=[direct,secondary,airborne,ally];
 API.fire(unit("ground_bomber",1,445,300,2),{kind:"unit",ref:direct,x:500,y:300});
 assert.equal(direct.hp,105-55);
 assert.equal(secondary.hp,105-33);
 assert.equal(airborne.hp,120,"flying splash must stay immune");
 assert.equal(ally.hp,105,"friendly fire remains disabled");
 assert.ok(S.projectiles.some(p=>p.kind==="ground_bomber"));
});
console.log("STAGE1_COMBAT_QA: 2 teams x 5 live deployments, damage, capture, splash and deck-rotation checks passed");
