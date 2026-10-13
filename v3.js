"use strict";
/* 小国戦線 III — one-screen fortress card battler. No external dependencies. */
(() => {
const $=id=>document.getElementById(id);
const cv=$("field"),ctx=cv.getContext("2d"),area=$("fieldArea"),cards=$("cards");
const W=1280,H=660,START_HP=3000,POST_HP=12,MATCH=300,PREP=10,CASTLE_DAMAGE=1.0;
// Separate camera presets for phones, tablets, and desktop, considering orientation.
const VIEW_PRESETS={
 phone:{landscape:1.09,portraitWorldWidth:640},
 tablet:{landscape:1.4,portraitWorldWidth:850},
 desktop:{landscape:1.5,portraitWorldWidth:800}
};
function chooseViewScale(w,h,screenWidth,screenHeight){
 const short=Math.min(screenWidth,screenHeight),long=Math.max(screenWidth,screenHeight);
 const isTablet=(window.navigator?.maxTouchPoints>1&&short>=600&&short<1100&&long<1500)||short>=600&&short<850&&long<=1350;
 const kind=short<600&&long<=1050?"phone":isTablet?"tablet":"desktop";
 const aspect=w/h,profile=VIEW_PRESETS[kind];
 // Landscape: fill available height/width but reduce phone zoom substantially.
 // Portrait: favour seeing more of the battlefield width; the unused upper/lower
 // space is letterboxed instead of cutting off the tactical map.
 const scale=aspect>=1.14
  ? Math.max(w/W,h/H)*profile.landscape
  : Math.min(w/profile.portraitWorldWidth,h/H*1.08);
 return {kind,orientation:aspect>=1.14?"landscape":"portrait",scale:Math.max(.1,scale)};
}
const WALL_TOP=69,WALL_BOTTOM=H-70,WALL_FACE={1:126,2:W-126};
const WALL_Y=y=>limit(y,WALL_TOP+12,WALL_BOTTOM-12);
const BLUE="#80d9f5",RED="#ff889a",GOLD="#f3da91";
const ENERGY_CAP=12;
// Rendering-only durations. Gameplay movement, recovery, cooldown and hits are unaffected.
const MOTION={
 spawn:{small:.55,medium:.78,large:1.06},
 defeat:{small:.59,medium:.81,large:1.16},
 attack:{infantry:.48,scout:.49,engineer:.64,archer:.56,
  sentinel:.70,suppress:.64,guardian:.98,drone:.54,tank:.84},
 windup:.44
};
const CLASSES={
 infantry:{name:"基本歩兵",glyph:"♟",size:"small",cost:2,limit:Infinity,qty:2,hp:105,damage:15,cool:1.45,range:26,vision:104,speed:23,r:12,behavior:"normal",capture:1,hitAir:false,note:"小型・占領・無制限"},
 scout:{name:"偵察ライダー",glyph:"➤",size:"medium",cost:3,limit:5,qty:1,hp:195,damage:28,cool:1.05,range:31,vision:115,speed:41,r:14,behavior:"capture",capture:1,hitAir:false,note:"中型・高速・少数戦・占領"},
 engineer:{name:"重装工兵",glyph:"◆",size:"medium",cost:4,limit:5,qty:1,hp:420,damage:34,cool:1.4,range:32,vision:120,speed:16,r:18,behavior:"capture",capture:2,hitAir:false,note:"中型・高耐久・近接・占領"},
 archer:{name:"魔導射手",glyph:"✧",size:"small",cost:2,limit:8,qty:2,hp:95,damage:20,cool:1.65,range:153,vision:195,speed:19,r:12,behavior:"normal",capture:0,hitAir:true,note:"小型・遠距離・対空"},
 sentinel:{name:"迎撃衛士",glyph:"⚔",size:"medium",cost:4,limit:5,qty:1,hp:540,damage:62,cool:1.45,range:44,vision:190,speed:20,r:20,behavior:"guard",capture:0,hitAir:false,splash:43,splashScale:.5,note:"中型・配置地点を守る迎撃前衛・近接薙ぎ払い"},
 suppress:{name:"制圧機兵",glyph:"✳",size:"medium",cost:5,limit:6,qty:1,hp:445,damage:76,cool:1.9,range:115,vision:150,speed:17,r:18,behavior:"normal",capture:0,hitAir:false,splash:70,splashScale:.8,note:"中型・密集対策・範囲砲撃"},
 guardian:{name:"守護ゴーレム",glyph:"⬡",size:"large",cost:7,limit:2,qty:1,hp:1400,damage:115,cool:2.05,range:52,vision:210,speed:18,r:24,behavior:"guard",capture:0,hitAir:false,splash:63,splashScale:.85,note:"大型・対大型迎撃・強力な範囲衝撃波"},
 drone:{name:"浮遊ドローン",glyph:"✦",size:"medium",cost:4,limit:5,qty:2,hp:135,damage:18,cool:1.25,range:98,vision:153,speed:34,r:15,behavior:"normal",capture:0,hitAir:false,flying:true,note:"中型・飛行・突破"},
 tank:{name:"魔導重戦車",glyph:"▰",size:"large",cost:7,limit:2,qty:1,hp:1100,damage:110,cool:2.05,range:125,vision:175,speed:15,r:25,behavior:"normal",capture:0,hitAir:false,splash:72,splashScale:.67,siege:2,note:"大型・長射程・範囲重砲・対城200%"},
};
const IDS=Object.keys(CLASSES);
const SPELLS={
 barrage:{name:"範囲砲撃",glyph:"☄",cost:4,limit:3,radius:82,damage:125,delay:1.3,note:"1.3秒後に敵兵へ範囲ダメージ。建物には無効"},
 ward:{name:"防護結界",glyph:"⬡",cost:3,limit:3,radius:93,duration:5.2,mult:.55,note:"5.2秒間、範囲内の味方へのダメージを45%軽減"}
};
const CATALOG={...CLASSES,...SPELLS};
const SIZE_LABEL={small:"小型",medium:"中型",large:"大型"};
const DECK_IDS=["scout","engineer","archer","barrage","sentinel","suppress","guardian","ward","drone","tank"];
const HAND_SIZE=4;
const isSpell=id=>Object.prototype.hasOwnProperty.call(SPELLS,id);
const hasCard=(team,id)=>id==="infantry"||S.hand[team].includes(id);
const availableCard=(team,id)=>S.left[team][id]>0&&hasCard(team,id);
function advanceHand(team,id){
 if(id==="infantry")return;
 const hand=S.hand[team],idx=hand.indexOf(id);
 if(idx<0)return;
 hand.splice(idx,1);
 if(S.left[team][id]>0)S.queue[team].push(id);
 while(hand.length<HAND_SIZE&&S.queue[team].length){
  const next=S.queue[team].shift();
  if(S.left[team][next]>0)hand.push(next);
 }
}
const TEAM={1:BLUE,2:RED};
const limit=(v,min,max)=>Math.max(min,Math.min(max,v));
const rand=(min,max)=>min+(max-min)*Math.random();
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const numTime=v=>{const s=Math.max(0,Math.ceil(v));return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")};
const S={phase:"menu",difficulty:"normal",speed:.85,prep:PREP,seconds:MATCH,elapsed:0,
 energy:[0,8,8],left:[null,{},{}],units:[],forts:[],capitals:[],effects:[],projectiles:[],deaths:[],tickCount:0,
 uid:0,botThink:0,selected:null,drag:null,pointer:null,hand:[null,[],[]],queue:[null,[],[]],spells:{incoming:[],zones:[]},view:{w:1,h:1,s:1,ox:0,oy:0,dpr:1},
 hudTick:0,noticeUntil:0,clock:0,cam:{x:415,y:330,tx:415,ty:330,moving:false},underAttackUntil:0,lastAlert:-10};
function resetWorld(){
 S.prep=PREP;S.seconds=MATCH;S.elapsed=0;S.uid=0;S.botThink=7;S.botSaveLarge=false;
 S.energy=[0,8,8];S.units=[];S.effects=[];S.projectiles=[];S.deaths=[];S.tickCount=0;S.selected=null;S.drag=null;S.pointer=null;
 S.cam={x:300,y:330,tx:300,ty:330,moving:false};S.underAttackUntil=0;S.lastAlert=-10;
 S.left=[null,{},{}];S.hand=[null,[],[]];S.queue=[null,[],[]];S.spells={incoming:[],zones:[]};
 for(const team of [1,2]){
  for(const [id,d] of Object.entries(CATALOG))S.left[team][id]=d.limit;
  S.hand[team]=DECK_IDS.slice(0,HAND_SIZE);
  S.queue[team]=DECK_IDS.slice(HAND_SIZE);
 }
 S.capitals=[{team:1,x:74,y:328,hp:START_HP,max:START_HP},
             {team:2,x:1206,y:328,hp:START_HP,max:START_HP}];
 S.forts=[{x:410,y:190,hp:POST_HP,owner:0},{x:633,y:444,hp:POST_HP,owner:0},{x:867,y:205,hp:POST_HP,owner:0}];
}
function capital(team){return S.capitals[team-1];}
function enemy(team){return team===1?2:1;}
function wallTarget(c,y){return {kind:"capital",ref:c,x:WALL_FACE[c.team],y:WALL_Y(y),r:15};}
function border(team){
 let edge=team===1?244:1036;
 // Captured forts advance the deploy line slightly BEYOND the fort, in the enemy direction.
 for(const f of S.forts)if(f.owner===team)edge=team===1?Math.max(edge,f.x+48):Math.min(edge,f.x-48);
 return edge;
}
function canPlace(team,x,y){
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<25||x>W-25||y<42||y>H-37)return false;
 return team===1?x<=border(1):x>=border(2);
}
function canPay(team,id){
 const d=CATALOG[id];
 if(!d||!availableCard(team,id))return false;
 if(S.phase!=="battle"&&!(S.phase==="prep"&&!isSpell(id)))return false;
 return S.energy[team]+1e-6>=d.cost;
}
function validTarget(team,id,x,y){
 if(!Number.isFinite(x)||!Number.isFinite(y))return false;
 if(isSpell(id))return S.phase==="battle"&&x>=30&&x<=W-30&&y>=40&&y<=H-35;
 return canPlace(team,x,y);
}
function cardFailure(team,id){
 if(!CATALOG[id])return "カードを選択してね";
 if(!hasCard(team,id))return "このカードは今の手札にないよ";
 if(S.left[team][id]<=0)return "召喚回数・使用回数が残っていないよ";
 if(isSpell(id)&&S.phase==="prep")return "スペルは開戦後に使えるよ";
 if(!canPay(team,id))return "エネルギーが足りない";
 return isSpell(id)?"戦場内を指定してね":"青い召喚範囲に置いてね";
}
function deploy(team,id,x,y){
 if(!CLASSES[id]||!canPay(team,id)||!canPlace(team,x,y))return false;
 const d=CLASSES[id], count=S.units.filter(u=>u.team===team&&u.hp>0).length;
 if(count+d.qty>65){if(team===1)notice("部隊が多すぎる。少し減るまで待とう");return false;}
 S.energy[team]=Math.max(0,S.energy[team]-d.cost);
 if(Number.isFinite(S.left[team][id]))S.left[team][id]--;
 advanceHand(team,id);
 for(let i=0;i<d.qty;i++){
  const dy=(i-(d.qty-1)/2)*27;
  const px=limit(x+(team===1?-9:9)*i,30,W-30);
  const py=limit(y+dy,46,H-45);
  S.units.push({uid:++S.uid,key:id,team,x:px,y:py,anchorX:px,anchorY:py,homeY:py,
   hp:d.hp,max:d.hp,attack:rand(0,.65),facing:team===1?0:Math.PI,flash:0,
   attackAnim:0,attackAnimMax:MOTION.attack[id],windup:0,hitAt:-100,
   spawnAt:S.clock,spawnDuration:MOTION.spawn[d.size],
   lock:null,walkPhase:rand(0,6.28),walking:false,
   drift:rand(0,Math.PI*2)});
 }
 if(team===2&&d.size==="large"&&S.phase==="battle")notice("敵軍が"+d.name+"を投入！");
 if(team===1){S.selected=id==="infantry"?"infantry":null;buildCards();updateHUD();}
 return true;
}
function notice(message){
 const el=$("announcement");el.textContent=message;el.classList.add("visible");S.noticeUntil=performance.now()+2600;
}
function begin(){
 resetWorld();clampCamera();S.phase="prep";S.speed=.85;
 $("speed").textContent="速度 0.85×";$("pause").textContent="Ⅱ 停止";
 $("overlay").classList.add("hidden");
 $("prepBanner").classList.add("visible");
 $("fieldHint").textContent="開戦準備：資源8で初期配置を決めよう。キャラは動かない。";
 // BOT receives exactly the same initial 8 energy and troop limits.
 if(S.difficulty==="easy"){
  deploy(2,"infantry",1085,190);deploy(2,"archer",1090,425);
 }else{
  deploy(2,"infantry",1060,205);
  deploy(2,"archer",1082,205);
  if(S.difficulty==="hard")deploy(2,"infantry",1060,445);
 }
 buildCards();updateHUD();
}
function castSpell(team,id,x,y){
 if(!isSpell(id)||!canPay(team,id)||!validTarget(team,id,x,y))return false;
 const d=SPELLS[id];
 S.energy[team]=Math.max(0,S.energy[team]-d.cost);
 S.left[team][id]--;
 advanceHand(team,id);
 if(id==="barrage")S.spells.incoming.push({team,x,y,r:d.radius,time:d.delay,total:d.delay});
 else S.spells.zones.push({team,x,y,r:d.radius,time:d.duration,total:d.duration});
 if(team===1){S.selected=null;buildCards();updateHUD();}
 return true;
}
function playCard(team,id,x,y){
 return isSpell(id)?castSpell(team,id,x,y):deploy(team,id,x,y);
}
function shieldMultiplier(team,x,y){
 return S.spells.zones.some(z=>z.team===team&&z.time>0&&Math.hypot(z.x-x,z.y-y)<=z.r)?SPELLS.ward.mult:1;
}
function hitUnit(u,power){
 if(u.hp<=0)return;
 u.hp-=power*shieldMultiplier(u.team,u.x,u.y);
 u.flash=.19;
 u.hitAt=S.clock;
 // Store only a short-lived visual echo; removal and battle calculations are unchanged.
 if(u.hp<=0){
  const d=CLASSES[u.key],lasting=MOTION.defeat[d.size];
  S.deaths.push({key:u.key,team:u.team,x:u.x,y:u.y,uid:u.uid,
   facing:u.facing,max:u.max,hp:0,t:lasting,maxTime:lasting,
   walkPhase:u.walkPhase||0,walking:false,flash:0,attackAnim:0,hitAt:-100,
   spawnAt:-100,drift:u.drift||0});
  if(S.deaths.length>34)S.deaths.splice(0,S.deaths.length-34);
  S.effects.push({x:u.x,y:u.y-9,t:.24,max:.24,team:u.team,r:d.size==="large"?35:17,type:"defeat"});
 }
}
function spellStep(dt){
 for(const shot of S.spells.incoming){
  shot.time-=dt;
  if(shot.time<=0){
   let hits=0;
   for(const u of S.units){
    if(u.hp<=0||u.team===shot.team)continue;
    if(Math.hypot(u.x-shot.x,u.y-shot.y)<shot.r){hitUnit(u,SPELLS.barrage.damage);hits++;}
   }
   S.effects.push({x:shot.x,y:shot.y,t:.52,max:.52,team:shot.team,r:shot.r,type:"barrage"});
   if(shot.team===1&&hits>=3)notice("範囲砲撃が敵兵"+hits+"体に命中！");
  }
 }
 S.spells.incoming=S.spells.incoming.filter(x=>x.time>0);
 for(const zone of S.spells.zones)zone.time-=dt;
 S.spells.zones=S.spells.zones.filter(x=>x.time>0);
}
function getFort(u){
 const d=CLASSES[u.key];if(!d.capture)return null;
 const direction=u.team===1?1:-1;
 const options=S.forts.filter(f=>f.owner!==u.team &&
   direction*(f.x-u.x)>=-42 &&
   Math.abs(f.y-u.y)<(d.behavior==="capture"?220:150));
 if(!options.length)return null;
 if(d.behavior==="capture"){
  // Objective troops can skip intermediate forts for a high-risk deep capture.
  // The experienced BOT secures the nearest fort first to advance its summon line.
  // Keep the player's original deep-capture behavior unchanged.
  if(u.team===2&&S.difficulty!=="easy")options.sort((a,b)=>b.x-a.x);
  else options.sort((a,b)=>direction*(b.x-a.x));
  return options[0];
 }
 options.sort((a,b)=>dist(a,u)-dist(b,u));
 return options[0];
}
function nearbyEnemy(u){
 const d=CLASSES[u.key],dir=u.team===1?1:-1,guard=d.behavior==="guard";
 const sight=guard?Math.min(d.vision,210):d.vision;
 let best=null,score=Infinity;
 // A defensive giant prioritizes an enemy giant inside its interception perimeter.
 if(u.key==="guardian"){
  const heavies=S.units.filter(v=>v.team!==u.team&&v.hp>0&&CLASSES[v.key].size==="large"&&
   dist(u,v)<=sight&&Math.hypot(v.x-u.anchorX,v.y-u.anchorY)<=240);
  if(heavies.length){
   heavies.sort((a,b)=>dist(u,a)-dist(u,b));
   const v=heavies[0];u.lock=v.uid;
   return {kind:"unit",ref:v,x:v.x,y:v.y,r:CLASSES[v.key].r};
  }
 }
 // Keep focus on a viable target instead of switching each frame.
 const previous=S.units.find(v=>v.uid===u.lock&&v.hp>0&&v.team!==u.team);
 if(previous&&(!CLASSES[previous.key].flying||d.hitAir)){
  const dx=dir*(previous.x-u.x),distance=dist(previous,u);
  if(distance<sight*1.16&&(guard||dx>=-Math.max(d.range+previous.r,35))){
   if(!guard||Math.hypot(previous.x-u.anchorX,previous.y-u.anchorY)<=(CLASSES[previous.key].size==="large"?240:180)){
    return {kind:"unit",ref:previous,x:previous.x,y:previous.y,r:CLASSES[previous.key].r};
   }
  }
 }
 u.lock=null;
 for(const v of S.units){
  if(v.team===u.team||v.hp<=0)continue;
  if(CLASSES[v.key].flying&&!d.hitAir)continue;
  const dx=dir*(v.x-u.x),distance=dist(u,v);
  if(distance>sight)continue;
  // Progress troops ignore passers-by behind them; close enemies can be fought without pursuit.
  if(!guard&&dx<-(d.range+CLASSES[v.key].r+5))continue;
  if(guard&&Math.hypot(v.x-u.anchorX,v.y-u.anchorY)>180)continue;
  const behindPenalty=!guard&&dx<0?35:0;
  const groupValue=u.key==="suppress"?Math.min(6,S.units.filter(other=>other.team!==u.team&&other.hp>0&&dist(other,v)<d.splash).length)*24:0;
  const candidate=distance+behindPenalty-(d.size==="large"&&CLASSES[v.key].size==="large"?24:0)-groupValue;
  if(candidate<score){score=candidate;best={kind:"unit",ref:v,x:v.x,y:v.y,r:CLASSES[v.key].r};}
 }
 const c=capital(enemy(u.team)),wall=wallTarget(c,u.y),wallDistance=Math.hypot(u.x-wall.x,u.y-wall.y);
 if(wallDistance<d.vision+28){
  const candidate=wallDistance-20;
  if(candidate<score){score=candidate;best=wall;}
 }
 if(best?.kind==="unit")u.lock=best.ref.uid;
 return best;
}

function moveToward(u,x,y,dt){
 const forward=u.team===1?1:-1;
 // Offensive troops never walk backward after a fast rider passes them.
 if(CLASSES[u.key].behavior!=="guard")x=forward===1?Math.max(u.x,x):Math.min(u.x,x);
 const dx=x-u.x,dy=y-u.y,distance=Math.hypot(dx,dy);
 if(distance<.05)return;
 const amt=Math.min(distance,CLASSES[u.key].speed*dt);
 u.x=limit(u.x+dx/distance*amt,28,W-28);
 u.y=limit(u.y+dy/distance*amt,43,H-43);
 u.facing=Math.atan2(dy,dx);
 u.walking=amt>.03;
 if(u.walking)u.walkPhase+=amt*.31;
}
function attackUnit(target,value){
 // No hidden armor or size reductions; direct damage uses the displayed attack value.
 hitUnit(target,value);
}
function fire(u,target){
 const d=CLASSES[u.key],ref=target.ref;
 u.attack=d.cool;
 // Longer artwork poses; hit resolution and combat cooldown are unchanged.
 u.attackAnimMax=MOTION.attack[u.key];
 u.attackAnim=u.attackAnimMax;
 u.windup=0;
 const impactLife=d.size==="large"?.42:.33;
 S.effects.push({x:target.x,y:target.y,t:impactLife,max:impactLife,team:u.team,r:d.splash||16,type:u.key});
 if(["archer","suppress","drone","tank"].includes(u.key)){
  S.projectiles.push({x:u.x,y:u.y-36,tx:target.x,ty:target.y-(target.kind==="unit"?34:8),
   t:u.key==="tank"?.56:.40,max:u.key==="tank"?.56:.40,team:u.team,kind:u.key});
 }
 if(["guardian","engineer","infantry","scout"].includes(u.key)&&S.effects.length<220){
  S.effects.push({x:u.x,y:u.y-30,t:.18,max:.18,team:u.team,r:19,type:"slash"});
 }
 if(target.kind==="fort"){
  if(!d.capture||ref.owner===u.team)return;
  ref.hp=Math.max(0,ref.hp-d.capture);
  if(ref.hp<=0){
   ref.owner=u.team;ref.hp=POST_HP;
   notice(u.team===1?"前哨基地を確保！ 召喚ラインが前進":"敵が前哨基地を占領！");
  }
 }else if(target.kind==="capital"){
  ref.hp=Math.max(0,ref.hp-d.damage*CASTLE_DAMAGE*(d.siege??1));
  if(ref.team===1){
   S.underAttackUntil=S.clock+3.5;
   if(S.clock-S.lastAlert>5){S.lastAlert=S.clock;notice("自軍城壁が攻撃中！ 自城ボタンで防衛を確認");}
  }
  if(ref.hp===0)end(u.team===1?"win":"lose","首都が破壊された！");
 }else if(target.kind==="unit"){
  if(ref.hp<=0)return;
  attackUnit(ref,d.damage,u);
  if(d.splash){
   for(const v of S.units){
    if(v.hp<=0||v===ref||v.team===u.team||CLASSES[v.key].flying)continue;
    if(dist(v,ref)<d.splash)attackUnit(v,d.damage*(d.splashScale??.57),u);
   }
  }
 }
}
function unitStep(dt){
 for(const u of S.units){
  if(u.hp<=0)continue;
  const d=CLASSES[u.key];
  u.attack=Math.max(0,u.attack-dt);u.flash=Math.max(0,u.flash-dt);
  u.attackAnim=Math.max(0,(u.attackAnim||0)-dt);u.walking=false;
  const foe=nearbyEnemy(u),fort=getFort(u);
  // Readable visual anticipation on the last fraction of an existing cooldown.
  // It never delays an actual strike or changes target selection.
  const inReach=foe&&dist(u,foe)<d.range+foe.r+9;
  u.windup=inReach&&u.attack>0&&u.attack<MOTION.windup?1-u.attack/MOTION.windup:0;
  if(d.behavior==="guard"){
   if(foe){
    if(dist(u,foe)<d.range+foe.r){u.facing=Math.atan2(foe.y-u.y,foe.x-u.x);if(u.attack<=0)fire(u,foe);}
    else moveToward(u,foe.x,foe.y,dt);
   }else if(Math.hypot(u.x-u.anchorX,u.y-u.anchorY)>7)moveToward(u,u.anchorX,u.anchorY,dt);
   continue;
  }
  if(d.behavior==="capture"&&fort){
   const immediate=foe&&foe.kind==="unit"&&dist(u,foe)<Math.max(d.range+foe.r,43);
   if(immediate&&(u.key==="engineer"||u.key==="scout")){if(u.attack<=0)fire(u,foe);}
   else if(dist(u,fort)<d.range+26){if(u.attack<=0)fire(u,{kind:"fort",ref:fort,x:fort.x,y:fort.y,r:24});}
   else moveToward(u,fort.x,fort.y,dt);
   continue;
  }
  if(foe){
   if(dist(u,foe)<d.range+foe.r){u.facing=Math.atan2(foe.y-u.y,foe.x-u.x);if(u.attack<=0)fire(u,foe);}
   else moveToward(u,foe.x,foe.y,dt);
   continue;
  }
  if(fort&&Math.abs(fort.x-u.x)<245){
   if(dist(u,fort)<d.range+26){if(u.attack<=0)fire(u,{kind:"fort",ref:fort,x:fort.x,y:fort.y,r:24});}
   else moveToward(u,fort.x,fort.y,dt);
   continue;
  }
  const cap=capital(enemy(u.team)),wall=wallTarget(cap,u.homeY);
  moveToward(u,wall.x,wall.y,dt);
 }
 // A light lateral separation reduces overlap without pushing armies backward.
 if((S.tickCount++%2)===0){
  const active=S.units.filter(u=>u.hp>0&&!CLASSES[u.key].flying);
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
   const a=active[i],b=active[j];
   if(a.team!==b.team||Math.abs(a.x-b.x)>38)continue;
   const gap=(CLASSES[a.key].r+CLASSES[b.key].r)*.65;
   const dx=a.x-b.x,dy=a.y-b.y,distance=Math.hypot(dx,dy);
   if(distance>=gap)continue;
   const push=Math.min(2.5,(gap-distance)*.27);
   const sign=dy===0?(a.uid<b.uid?-1:1):(dy>0?1:-1);
   a.y=limit(a.y+sign*push,43,H-43);
   b.y=limit(b.y-sign*push,43,H-43);
  }
 }
 S.units=S.units.filter(u=>u.hp>0);
}
function rate(){
 if(S.elapsed<100)return .25;
 if(S.elapsed<210)return .36;
 if(S.elapsed<270)return .53;
 return .7;
}
// Expert heuristics operate within the same hand, economy and placement rules.
// v3.9 tactical BOT. Same deck order, charges, energy rate and deployment rules as a human.
function botExpertAction(){
 const hard=S.difficulty==="hard",edge=border(2),power=S.energy[2];
 const foes=S.units.filter(u=>u.team===1&&u.hp>0),friends=S.units.filter(u=>u.team===2&&u.hp>0);
 const raiders=foes.filter(u=>u.x>edge-380);
 const desperate=foes.filter(u=>u.x>1035);
 const fort=S.forts.filter(f=>f.owner!==2).sort((a,b)=>b.x-a.x)[0];
 const focus=raiders.slice().sort((a,b)=>b.x-a.x)[0];
 const have=id=>availableCard(2,id),pay=id=>canPay(2,id);
 const group=raiders.map(u=>({u,neighbors:raiders.filter(v=>dist(v,u)<70)}))
  .sort((a,b)=>b.neighbors.length-a.neighbors.length)[0];
 const groupSize=group?.neighbors.length??0;
 const yFocus=focus?.y??fort?.y??330;
 const spawn=(id,y,margin=35)=>
   pay(id)&&deploy(2,id,limit(edge+margin,40,W-40),limit(y,70,H-70));
 // Use meaningful counters early. The BOT never receives free units or bonus damage.
 if(groupSize>=3&&pay("barrage")&&castSpell(2,"barrage",group.u.x,group.u.y))return true;
 if(groupSize>=3&&spawn("suppress",group.u.y,50))return true;
 if(raiders.some(u=>CLASSES[u.key].flying)&&spawn("archer",yFocus,58))return true;
 if(raiders.some(u=>CLASSES[u.key].size==="large")&&spawn("guardian",yFocus,34))return true;
 if(desperate.length){
  if(groupSize>=2&&spawn("sentinel",yFocus,32))return true;
  if(groupSize>=2&&spawn("suppress",yFocus,52))return true;
  const defenders=friends.filter(u=>u.x>850&&Math.abs(u.y-yFocus)<140);
  if(defenders.length<3&&spawn("archer",yFocus,65))return true;
  if(defenders.length<3&&spawn("infantry",yFocus,32))return true;
 }
 const giant=["tank","guardian"].filter(have);
 const workers=fort?friends.filter(u=>CLASSES[u.key].capture&&Math.abs(u.y-fort.y)<145&&u.x>fort.x-130):[];
 const needFort=!!fort&&workers.length<(S.elapsed<48?1:2);
 // The first meaningful plays must cycle the 4-card hand; infantry doesn't rotate it.
 if(S.elapsed<37&&needFort&&spawn("scout",fort.y,35))return true;
 if(S.elapsed<40&&friends.filter(u=>u.key==="archer").length<3&&spawn("archer",yFocus,64))return true;
 // A drawn giant is an explicit seven-energy investment, unless the castle is in danger.
 if(giant.length&&S.elapsed>18){
  const id=giant.includes("tank")&&!desperate.length?"tank":
   giant.includes("guardian")?"guardian":giant[0];
  if(power>=7&&spawn(id,id==="guardian"?yFocus:fort?.y??yFocus,38))return true;
  if(!desperate.length)return true;
 }
 if(needFort&&spawn("scout",fort.y,33))return true;
 if(needFort&&spawn("engineer",fort.y,35))return true;
 if(raiders.length>=2&&spawn("sentinel",yFocus,36))return true;
 if(groupSize>=2&&spawn("suppress",group.u.y,50))return true;
 if(friends.filter(u=>u.key==="archer").length<2&&spawn("archer",yFocus,70))return true;
 if(pay("ward")){
  const team=friends.map(u=>({u,value:friends.filter(v=>dist(v,u)<90&&raiders.some(e=>dist(e,v)<175)).length}))
   .sort((a,b)=>b.value-a.value)[0];
  if(team&&team.value>=2&&castSpell(2,"ward",team.u.x,team.u.y))return true;
 }
 if(groupSize>=2&&pay("barrage")&&castSpell(2,"barrage",group.u.x,group.u.y))return true;
 // Rotate non-permanent cards for the next tactical option; hold energy if necessary.
 for(const id of ["scout","archer","engineer","sentinel","suppress","drone"]){
  if(spawn(id,id==="scout"||id==="engineer"?fort?.y??330:yFocus,
   id==="archer"||id==="suppress"?64:36))return true;
 }
 // Basic infantry remains the low-cost emergency choice, not the default policy.
 if(power>=11&&spawn("infantry",yFocus,36))return true;
 if(desperate.length&&spawn("infantry",yFocus,36))return true;
 return true;
}
function botAction(){
 const allies=S.units.filter(u=>u.team===2&&u.hp>0);
 const enemies=S.units.filter(u=>u.team===1&&u.hp>0);
 // The BOT shares the player's card hand, costs, and charge limits.
 if(S.difficulty!=="easy"){botExpertAction();return;}
 if(canPay(2,"barrage")&&enemies.length){
  const best=enemies.map(t=>({target:t,hits:enemies.filter(u=>dist(t,u)<SPELLS.barrage.radius).length}))
   .sort((a,b)=>b.hits-a.hits)[0];
  if(best.hits>=2&&Math.random()<.75){castSpell(2,"barrage",best.target.x,best.target.y);return;}
 }
 if(canPay(2,"ward")&&allies.length){
  const best=allies.map(t=>({target:t,hits:allies.filter(u=>dist(t,u)<SPELLS.ward.radius).length,
   threatened:enemies.some(u=>dist(t,u)<150)})).filter(x=>x.threatened).sort((a,b)=>b.hits-a.hits)[0];
  if(best&&best.hits>=2&&Math.random()<.7){castSpell(2,"ward",best.target.x,best.target.y);return;}
 }
 // The BOT must sometimes save energy for its 7-cost giants, otherwise it
 // spends each small increment and never showcases large-vs-large tactics.
 const giantHand=["guardian","tank"].filter(id=>availableCard(2,id));
 const imminent=enemies.some(u=>u.x>(S.difficulty==="easy"?WALL_FACE[2]-165:850));
 if(imminent&&S.difficulty!=="easy")S.botSaveLarge=false;
 if(S.botSaveLarge&&(!giantHand.length||(imminent&&S.energy[2]<7)))S.botSaveLarge=false;
 if(!S.botSaveLarge&&giantHand.length&&S.elapsed>20&&S.energy[2]>=2.5&&!imminent&&Math.random()<.62){
  S.botSaveLarge=true;
 }
 if(S.botSaveLarge){
  if(S.energy[2]<7)return;
  const giant=giantHand.includes("tank")&&!imminent?"tank":giantHand[0];
  const target=enemies.filter(u=>u.x>560).sort((a,b)=>b.x-a.x)[0];
  const x=limit(border(2)+rand(20,65),38,W-35);
  const y=target?target.y:rand(190,455);
  deploy(2,giant,x,limit(y,70,H-70));
  S.botSaveLarge=false;
  return;
 }
 const affordable=IDS.filter(id=>canPay(2,id));
 if(!affordable.length)return;
 const owned=S.forts.filter(f=>f.owner===2).length;
 const press=S.units.filter(u=>u.team===1&&u.x>border(2)-180).length;
 const infantryThreat=enemies.filter(u=>u.key==="infantry"&&u.x>border(2)-290);
 if(affordable.includes("suppress")&&infantryThreat.length>=4){
  const spot=infantryThreat.sort((a,b)=>b.x-a.x)[0];
  deploy(2,"suppress",limit(border(2)+32,60,W-50),limit(spot.y,70,H-70));return;
 }
 const claimable=affordable.filter(id=>CLASSES[id].capture);
 const defenders=affordable.filter(id=>CLASSES[id].behavior==="guard"||id==="suppress"||id==="archer");
 let chosen=null;
 if(press>=3&&defenders.length&&Math.random()<.60)chosen=defenders[Math.floor(rand(0,defenders.length))];
 else if(owned<2&&claimable.length&&Math.random()<.60)chosen=claimable[Math.floor(rand(0,claimable.length))];
 else chosen=affordable[Math.floor(rand(0,affordable.length))];
 const target=S.forts.filter(f=>f.owner!==2).sort((a,b)=>b.x-a.x)[0];
 const x=limit(border(2)+rand(20,75),38,W-35);
 const y=chosen==="guardian"&&press?S.units.filter(u=>u.team===1).sort((a,b)=>b.x-a.x)[0]?.y||330:
   (target&&Math.random()<.72?target.y+rand(-35,35):rand(160,490));
 deploy(2,chosen,x,limit(y,70,H-70));
}
function botStep(dt){
 S.botThink-=dt;
 if(S.botThink>0)return;
 botAction();
 const mod=S.difficulty==="easy"?[6.5,9.0]:S.difficulty==="hard"?[1.2,1.9]:[2.5,3.8];
 S.botThink=rand(mod[0],mod[1]);
}
function end(result,reason){
 if(S.phase==="result")return;
 S.phase="result";
 const titles={win:"勝利！",lose:"敗北",draw:"引き分け"};
 $("dialogTitle").textContent=titles[result]||"対戦終了";
 $("dialogText").textContent=reason+"　前哨基地と初期配置を変えると展開も大きく変わるよ。";
 $("rules").innerHTML="自軍首都："+Math.ceil(capital(1).hp)+" / "+START_HP+
 "<br>敵軍首都："+Math.ceil(capital(2).hp)+" / "+START_HP+
 "<br>残り時間："+numTime(S.seconds)+
 "<br>※ 現在は試遊用のBOT戦。オンライン対戦はまだ未実装です。";
 $("start").textContent="もう一度対戦する";
 $("overlay").classList.remove("hidden");
 $("prepBanner").classList.remove("visible");
}
function finishTime(){
 const a=capital(1).hp/START_HP,b=capital(2).hp/START_HP;
 end(Math.abs(a-b)<1e-6?"draw":a>b?"win":"lose","時間切れ！ 首都の残りHP割合で判定した。");
}
function tick(dt){
 if(S.phase!=="battle")return;
 S.elapsed+=dt;S.seconds-=dt;
 for(const team of [1,2])S.energy[team]=Math.min(ENERGY_CAP,S.energy[team]+dt*rate()*(team===2&&S.difficulty==="easy"?.82:1));
 botStep(dt);unitStep(dt);spellStep(dt);
 for(const fallen of S.deaths)fallen.t-=dt;
 S.deaths=S.deaths.filter(fallen=>fallen.t>0);
 for(const fx of S.effects)fx.t-=dt;
 S.effects=S.effects.filter(f=>f.t>0);
 for(const shot of S.projectiles)shot.t-=dt;
 S.projectiles=S.projectiles.filter(f=>f.t>0);
 if(S.effects.length>140)S.effects.splice(0,S.effects.length-140);
 if(S.projectiles.length>110)S.projectiles.splice(0,S.projectiles.length-110);
 if(S.phase==="battle"&&S.seconds<=0)finishTime();
}
// The tactical world remains 1280 x 660, so unit travel time and attack ranges
// stay unchanged. A zoomed camera shows only a portion of it at once.
function clampCamera(){
 const v=S.view,c=S.cam,hx=v.w/(2*v.s),hy=v.h/(2*v.s);
 if(!Number.isFinite(hx)||!Number.isFinite(hy))return;
 const minX=Math.min(hx,W/2),maxX=Math.max(W-hx,W/2);
 const minY=Math.min(hy,H/2),maxY=Math.max(H-hy,H/2);
 c.x=limit(c.x,minX,maxX);c.y=limit(c.y,minY,maxY);
 c.tx=limit(c.tx,minX,maxX);c.ty=limit(c.ty,minY,maxY);
 v.ox=v.w/2-c.x*v.s;v.oy=v.h/2-c.y*v.s;
}
function fit(){
 const rect=area.getBoundingClientRect(),v=S.view;
 v.w=Math.max(1,rect.width);v.h=Math.max(1,rect.height);
 v.dpr=Math.min(window.devicePixelRatio||1,2);
 cv.width=Math.max(1,Math.round(v.w*v.dpr));cv.height=Math.max(1,Math.round(v.h*v.dpr));
 cv.style.width=v.w+"px";cv.style.height=v.h+"px";
 // Show roughly two thirds of the field horizontally, instead of the entire arena.
 const view=chooseViewScale(v.w,v.h,window.innerWidth||v.w,window.innerHeight||v.h+150);
 v.s=view.scale;v.device=view.kind;v.orientation=view.orientation;
 clampCamera();
}
function cameraTo(x,y){
 const c=S.cam;c.tx=x;c.ty=y;c.moving=true;clampCamera();
}
function panCamera(dx,dy){
 const c=S.cam;c.moving=false;
 c.x+=dx;c.y+=dy;c.tx=c.x;c.ty=c.y;clampCamera();
}
function updateCamera(dt){
 const c=S.cam;
 if(c.moving){
  const t=1-Math.exp(-Math.max(0,dt)*10);
  c.x+=(c.tx-c.x)*t;c.y+=(c.ty-c.y)*t;
  if(Math.hypot(c.tx-c.x,c.ty-c.y)<.2){c.x=c.tx;c.y=c.ty;c.moving=false;}
 }
 clampCamera();
}
function frontlineCamera(){
 // Prefer a live skirmish; otherwise the furthest friendly army or the nearest contested fort.
 const allies=S.units.filter(u=>u.team===1&&u.hp>0);
 const enemies=S.units.filter(u=>u.team===2&&u.hp>0);
 let best=null,score=-Infinity;
 for(const u of allies){
  const nearby=enemies.filter(v=>dist(v,u)<180).length;
  const value=nearby*150+u.x*.22;
  if(value>score){best=u;score=value;}
 }
 if(best)return cameraTo(best.x+75,best.y);
 const active=S.forts.filter(f=>f.owner!==1).sort((a,b)=>a.x-b.x)[0];
 cameraTo(active?active.x:W/2,active?active.y:H/2);
}
function point(clientX,clientY){
 const r=area.getBoundingClientRect(),v=S.view;
 return {x:(clientX-r.left-v.ox)/v.s,y:(clientY-r.top-v.oy)/v.s};
}
function rounded(g,x,y,w,h,r){
 r=Math.min(r,w/2,h/2);g.beginPath();g.moveTo(x+r,y);
 g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);
 g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();
}
function terrain(){
 ctx.fillStyle="#2b4e42";ctx.fillRect(0,0,W,H);
 const ground=ctx.createLinearGradient(0,0,0,H);
 ground.addColorStop(0,"#35604e");ground.addColorStop(.5,"#335a4c");ground.addColorStop(1,"#1f3c36");
 ctx.fillStyle=ground;ctx.fillRect(0,0,W,H);
 ctx.fillStyle="#73957e16";ctx.fillRect(35,260,1210,126);
 // Natural path details rather than discrete lanes.
 for(let i=0;i<75;i++){
  const x=(i*167+84)%W,y=(i*131+63)%H;
  ctx.strokeStyle=i%3===0?"#b0be8e25":"#092b272c";ctx.lineWidth=2.5;
  ctx.beginPath();ctx.moveTo(x-10,y+5);ctx.quadraticCurveTo(x,y-5,x+12,y+2);ctx.stroke();
 }
 ctx.fillStyle="#84dcfa12";ctx.fillRect(0,0,border(1),H);
 ctx.fillStyle="#ff9ca911";ctx.fillRect(border(2),0,W-border(2),H);
 ctx.lineWidth=2.5;ctx.setLineDash([10,10]);
 ctx.strokeStyle="#a2e5ffcb";ctx.beginPath();ctx.moveTo(border(1),0);ctx.lineTo(border(1),H);ctx.stroke();
 ctx.strokeStyle="#ffb0bacb";ctx.beginPath();ctx.moveTo(border(2),0);ctx.lineTo(border(2),H);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle="#c6f1ff";ctx.font="bold 14px system-ui";ctx.textAlign="left";
 ctx.fillText("自軍召喚ライン",limit(border(1)-135,10,W-140),28);
 ctx.textAlign="right";ctx.fillStyle="#ffd2d7";ctx.fillText("敵軍召喚ライン",limit(border(2)+135,140,W-10),28);
 ctx.fillStyle="#18455433";ctx.fillRect(0,0,110,H);
 ctx.fillStyle="#6b293233";ctx.fillRect(W-110,0,110,H);
}
function drawCapital(c){
 const blue=c.team===1,col=blue?BLUE:RED,face=WALL_FACE[c.team];
 ctx.save();
 ctx.fillStyle="#041c2388";ctx.fillRect(face-(blue?35:0),WALL_TOP+10,35,WALL_BOTTOM-WALL_TOP-15);
 const faceSide=blue?1:-1;
 // Passive fortress wall, with decorative battlements and no auto-turrets.
 ctx.fillStyle=blue?"#3b7c8f":"#925362";ctx.strokeStyle=blue?"#a9e0e7":"#f2b5ad";ctx.lineWidth=3;
 rounded(ctx,face-24,WALL_TOP,48,WALL_BOTTOM-WALL_TOP,7);ctx.fill();ctx.stroke();
 ctx.fillStyle=blue?"#234758":"#663e4a";
 for(let y=WALL_TOP+12;y<WALL_BOTTOM-12;y+=53){
  rounded(ctx,face-32,y,64,40,5);ctx.fill();
  ctx.fillStyle=blue?"#558fa2":"#b56c74";
  rounded(ctx,face-36,y-6,72,12,2);ctx.fill();
  ctx.fillStyle=blue?"#234758":"#663e4a";
 }
 // Tall luminous lanes on the inward side guide the eye along the wall.
 ctx.strokeStyle=col;ctx.lineWidth=4;
 ctx.beginPath();ctx.moveTo(face+faceSide*28,WALL_TOP+8);ctx.lineTo(face+faceSide*28,WALL_BOTTOM-8);ctx.stroke();
 for(let y=WALL_TOP+40;y<WALL_BOTTOM;y+=120){
  ctx.save();ctx.translate(face,y);
  ctx.fillStyle=blue?"#1c3945":"#503842";ctx.strokeStyle="#e2e7d6";ctx.lineWidth=2;
  rounded(ctx,-15,-24,30,46,7);ctx.fill();ctx.stroke();
  ctx.fillStyle=col;ctx.beginPath();ctx.arc(0,-5,9,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=col;ctx.beginPath();ctx.moveTo(-12,-32);ctx.lineTo(12,-32);ctx.stroke();
  ctx.restore();
 }
 ctx.font="bold 13px system-ui";ctx.fillStyle="#f1f7ed";ctx.textAlign="center";
 ctx.fillText(blue?"自軍城壁":"敵軍城壁",face,WALL_TOP-18);
 ctx.restore();
}
function drawFort(f){
 const col=f.owner===0?GOLD:TEAM[f.owner];
 ctx.save();ctx.translate(f.x,f.y);
 ctx.fillStyle="#07262399";ctx.beginPath();ctx.ellipse(1,15,37,16,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#4e5140";ctx.strokeStyle=col;ctx.lineWidth=4;
 ctx.beginPath();
 for(let i=0;i<6;i++){const a=i*Math.PI/3,xx=Math.cos(a)*29,yy=Math.sin(a)*22;if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);}
 ctx.closePath();ctx.fill();ctx.stroke();
 ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(-3,-39);ctx.lineTo(-3,17);ctx.stroke();
 ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(-3,-38);ctx.lineTo(23,-29);ctx.lineTo(-3,-20);ctx.fill();
 ctx.fillStyle="#15252b";rounded(ctx,-31,-62,62,9,4);ctx.fill();
 ctx.fillStyle=col;rounded(ctx,-29,-60,58*Math.max(0,f.hp/POST_HP),5,3);ctx.fill();
 ctx.fillStyle="#f3f0d8";ctx.font="bold 12px system-ui";ctx.textAlign="center";
 ctx.fillText(f.owner===0?"中立基地":f.owner===1?"自軍基地":"敵軍基地",0,48);
 ctx.restore();
}
function drawUnit(u){
 if(window.KokokuArt){window.KokokuArt.drawUnit(ctx,u,S.clock);return;}
 const d=CLASSES[u.key],col=TEAM[u.team],isAir=!!d.flying;
 const bob=isAir?18+Math.sin(S.clock*4+u.drift)*4:3;
 ctx.save();
 ctx.fillStyle="#061e2588";ctx.beginPath();ctx.ellipse(u.x+3,u.y+5,d.r+6,d.r*.6,0,0,Math.PI*2);ctx.fill();
 ctx.translate(u.x,u.y-bob);
 ctx.rotate(u.facing);
 ctx.strokeStyle="#d0f0ea";ctx.lineWidth=2;
 ctx.fillStyle=u.flash>0?"#ffffff":col;
 switch(u.key){
 case "infantry":
  ctx.beginPath();ctx.arc(0,0,11,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle="#14363f";ctx.fillRect(0,-3,14,6);break;
 case "scout":
  ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(-12,-10);ctx.lineTo(-6,0);ctx.lineTo(-12,10);ctx.closePath();ctx.fill();ctx.stroke();break;
 case "engineer":
  rounded(ctx,-17,-16,34,32,7);ctx.fill();ctx.stroke();
  ctx.fillStyle="#e1cf95";ctx.fillRect(-6,-7,14,14);break;
 case "archer":
  ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(0,-12);ctx.lineTo(-12,0);ctx.lineTo(0,12);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.strokeStyle="#f8dc93";ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(9,0);ctx.lineTo(0,8);ctx.stroke();break;
 case "suppress":
  rounded(ctx,-16,-15,32,30,6);ctx.fill();ctx.stroke();ctx.fillStyle="#e4d398";ctx.fillRect(0,-6,25,12);break;
 case "sentinel":
  rounded(ctx,-19,-20,38,40,7);ctx.fill();ctx.stroke();
  ctx.fillStyle="#e5d6aa";ctx.fillRect(-18,-8,15,18);break;
 case "guardian":
  rounded(ctx,-23,-24,46,48,10);ctx.fill();ctx.stroke();ctx.fillStyle="#f0dc9e";ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.fill();break;
 case "drone":
  ctx.beginPath();ctx.moveTo(16,0);ctx.lineTo(-10,-15);ctx.lineTo(-9,-4);ctx.lineTo(-9,4);ctx.lineTo(-10,15);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle="#f5d8a0";ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();break;
 case "tank":
  rounded(ctx,-25,-19,50,38,8);ctx.fill();ctx.stroke();
  ctx.fillStyle="#14353f";rounded(ctx,-6,-11,33,22,4);ctx.fill();
  ctx.fillStyle="#ecd89a";ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();break;
 }
 ctx.restore();
 if(u.hp<u.max){
  ctx.fillStyle="#14252a";ctx.fillRect(u.x-20,u.y-bob-d.r-14,40,5);
  ctx.fillStyle=col;ctx.fillRect(u.x-20,u.y-bob-d.r-14,40*Math.max(0,u.hp/u.max),5);
 }
 if(isAir){ctx.strokeStyle="#d6eae560";ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(u.x,u.y-bob+5);ctx.lineTo(u.x,u.y);ctx.stroke();ctx.setLineDash([]);}
}
function drawSpellFields(){
 for(const zone of S.spells.zones){
  ctx.save();
  ctx.fillStyle=zone.team===1?"#73ddff1b":"#ff91b81c";
  ctx.strokeStyle=zone.team===1?"#92e9ffaf":"#f8b2c0af";
  ctx.lineWidth=3;ctx.beginPath();ctx.arc(zone.x,zone.y,zone.r,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.strokeStyle="#e9fdff5a";ctx.setLineDash([8,11]);ctx.beginPath();ctx.arc(zone.x,zone.y,zone.r*.82,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  ctx.font="bold 14px system-ui";ctx.textAlign="center";ctx.fillStyle="#f0fdff";
  ctx.fillText("防護結界 "+Math.ceil(zone.time)+"秒",zone.x,zone.y-zone.r-13);
  ctx.restore();
 }
 for(const shot of S.spells.incoming){
  const remaining=Math.max(0,shot.time/shot.total);
  ctx.save();
  ctx.strokeStyle=shot.team===1?"#ffd184":"#ff8197";ctx.fillStyle=shot.team===1?"#ffbc6426":"#ff71882b";
  ctx.lineWidth=4;ctx.beginPath();ctx.arc(shot.x,shot.y,shot.r,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.arc(shot.x,shot.y,shot.r*(1-remaining*.65),0,Math.PI*2);
  ctx.strokeStyle=shot.team===1?"#ffeac0":"#ffdbdd";ctx.lineWidth=3;ctx.stroke();
  ctx.font="bold 14px system-ui";ctx.textAlign="center";ctx.fillStyle="#fff0db";
  ctx.fillText("砲撃予告",shot.x,shot.y-shot.r-13);ctx.restore();
 }
}
function drawPreview(){
 const item=S.selected;
 if(!item)return;
 const p=S.pointer&&!S.pointer.dragging?S.pointer.pos:null;
 if(!p)return;
 const legal=canPay(1,item)&&validTarget(1,item,p.x,p.y);
 const radius=isSpell(item)?SPELLS[item].radius:39;
 ctx.strokeStyle=legal?"#9deaff":"#ff9aa3";ctx.fillStyle=legal?"#7bdfff34":"#ff788a39";ctx.lineWidth=3;
 ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.font="bold 13px system-ui";ctx.textAlign="center";ctx.fillStyle="#fff";
 ctx.fillText(legal?(isSpell(item)?SPELLS[item].name:"召喚可能"):"使用不可",p.x,p.y-radius-13);
}
function draw(){
 const v=S.view,d=v.dpr;
 ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,v.w,v.h);
 ctx.fillStyle="#0d2426";ctx.fillRect(0,0,v.w,v.h);
 ctx.save();ctx.translate(v.ox,v.oy);ctx.scale(v.s,v.s);
 terrain();drawSpellFields();
 // Walls occupy the full vertical edge; render behind units regardless of center Y.
 for(const c of S.capitals)drawCapital(c);
 const objects=[];
 for(const p of S.forts)objects.push({y:p.y+20,draw:()=>drawFort(p)});
 for(const u of S.units)objects.push({y:u.y,draw:()=>drawUnit(u)});
 for(const gone of S.deaths){
  objects.push({y:gone.y,draw:()=>{
   if(window.KokokuArt){
    window.KokokuArt.drawUnit(ctx,{...gone,deathProgress:1-gone.t/gone.maxTime},S.clock);
   }else{
    ctx.save();ctx.globalAlpha=.35*(gone.t/gone.maxTime);
    ctx.strokeStyle=TEAM[gone.team];ctx.lineWidth=3;ctx.beginPath();
    ctx.arc(gone.x,gone.y-15,17*(1.2-gone.t/gone.maxTime),0,Math.PI*2);ctx.stroke();ctx.restore();
   }
  }});
 }
 objects.sort((a,b)=>a.y-b.y);
 for(const obj of objects)obj.draw();
 for(const e of S.effects){
  const f=e.t/e.max;
  ctx.save();ctx.globalAlpha=Math.min(1,f*1.4);
  const boom=e.type==="barrage"||e.type==="tank"||e.type==="suppress",spell=e.type==="barrage";
  const color=spell?"#ffe2a3":e.type==="archer"?"#d3abff":e.type==="drone"?"#98fff1":TEAM[e.team];
  ctx.strokeStyle=color;ctx.lineWidth=boom?4:2.5;
  ctx.beginPath();ctx.arc(e.x,e.y,Math.max(3,e.r*(1.26-.66*f)),0,Math.PI*2);ctx.stroke();
  if(boom||e.type==="slash"){
   const n=boom?8:4,base=e.r*(1-f)*.86;
   for(let k=0;k<n;k++){
    const angle=k*Math.PI*2/n+(e.x*0.19%1),px=e.x+Math.cos(angle)*base,py=e.y+Math.sin(angle)*base;
    ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+Math.cos(angle)*(8+7*(1-f)),py+Math.sin(angle)*(8+7*(1-f)));ctx.stroke();
   }
  }
  ctx.restore();
 }
 for(const shot of S.projectiles){
  const f=1-shot.t/shot.max;
  const x=shot.x+(shot.tx-shot.x)*f,y=shot.y+(shot.ty-shot.y)*f;
  const a=Math.atan2(shot.ty-shot.y,shot.tx-shot.x),len=shot.kind==="tank"?23:shot.kind==="suppress"?15:10;
  ctx.save();ctx.globalAlpha=Math.min(1,shot.t/.09);
  ctx.strokeStyle=shot.kind==="archer"?"#cfbcff":shot.kind==="drone"?"#8cfce2":shot.kind==="tank"?"#ffcf78":TEAM[shot.team];
  ctx.lineWidth=shot.kind==="tank"?8:shot.kind==="suppress"?6:4;
  ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=shot.kind==="tank"?15:10;ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(x-Math.cos(a)*len,y-Math.sin(a)*len);ctx.lineTo(x,y);ctx.stroke();
  ctx.restore();
 }
 ctx.globalAlpha=1;drawPreview();
 ctx.restore();
}
function buildEnergyMeter(){
 const rail=$("resourceRail");rail.replaceChildren();
 for(let i=0;i<ENERGY_CAP;i++){
  const segment=document.createElement("span");segment.className="resourceSegment";
  const fill=document.createElement("span");fill.className="resourceSegmentFill";
  segment.append(fill);rail.append(segment);
 }
}
function buildCards(){
 cards.replaceChildren();
 for(const id of ["infantry",...S.hand[1]]){
  const d=CATALOG[id],available=S.left[1][id]>0,spell=isSpell(id);
  const button=document.createElement("button");
  button.type="button";button.className="card"+(id==="infantry"?" permanent":"")+(spell?" spell":"")+(d.size?" tier-"+d.size:"");
  button.dataset.id=id;
  button.setAttribute("aria-label",d.name+" コスト"+d.cost+" "+(spell?"スペル":SIZE_LABEL[d.size]));
  if(S.selected===id)button.classList.add("selected");
  if(!available)button.classList.add("depleted");
  if(!canPay(1,id))button.classList.add("unavailable");
  const left=Number.isFinite(S.left[1][id])?"残 "+S.left[1][id]:"∞";
  button.innerHTML='<div class="cardTop"><span class="cardCost">'+d.cost+'</span><span class="cardQuantity">'+
   (spell?"魔法":id==="infantry"?"常時":"×"+d.qty)+'</span></div>'+
   '<canvas class="cardPortrait" width="128" height="72" aria-hidden="true"></canvas>'+
   '<div class="cardName">'+d.name+'</div>'+
   '<div class="cardBottom"><span class="cardLeft">'+left+'</span>'+
   (spell?'<span class="cardSpell">魔法</span>':'<span class="cardTier">'+SIZE_LABEL[d.size]+(d.capture?' ⚑':'')+'</span>')+'</div>';
  if(window.KokokuArt)window.KokokuArt.drawPortrait(button.querySelector("canvas"),id,1);
  button.addEventListener("pointerdown",e=>cardDown(e,id));
  button.addEventListener("contextmenu",e=>{e.preventDefault();if(S.phase==="prep"||S.phase==="battle")openCardInfo(id);});
  cards.append(button);
 }
 const next=S.queue[1].find(id=>S.left[1][id]>0);
 $("nextCard").textContent=next?"次："+CATALOG[next].name:"次：残りなし";
}

let galleryResume="menu",infoResume="menu";
function openCardInfo(id){
 const d=CATALOG[id];if(!d||S.phase==="inspect")return;
 infoResume=S.phase;S.phase="inspect";
 S.drag=null;
 $("cardInfoName").textContent=d.name;
 $("cardInfoRole").textContent=isSpell(id)?"スペル":SIZE_LABEL[d.size]+" · "+(d.capture?"占領可能":"戦闘専門");
 const remaining=Number.isFinite(S.left[1][id])?S.left[1][id]:"無制限";
 const infos=isSpell(id)?
   [["消費資源",d.cost],["使用回数",remaining+" 回"],["効果半径",d.radius],["持続・着弾時間",id==="barrage"?d.delay+" 秒":d.duration+" 秒"]]:
   [["消費資源",d.cost],["残り召喚回数",remaining],["1回の召喚数",d.qty+" 体"],
    ["HP",d.hp],["攻撃力",d.damage],["射程",d.range],["移動速度",d.speed],
    ["攻撃間隔",d.cool+" 秒"],["砦占領力",d.capture||"なし"]];
 if(!isSpell(id)&&d.splash){
  infos.push(["範囲攻撃半径",d.splash],["巻き込み攻撃力",Math.round(d.damage*(d.splashScale??.57))]);
 }
 if(!isSpell(id)&&d.siege)infos.push(["対城ダメージ",Math.round(d.damage*d.siege)+"（"+d.siege+"倍）"]);
 if(!isSpell(id)&&d.behavior==="guard")infos.push(["行動方針","設置地点付近で迎撃"]);
 $("cardInfoStats").replaceChildren();
 for(const [label,value] of infos){
  const row=document.createElement("div");row.className="infoStat";
  const k=document.createElement("span");k.textContent=label;
  const v=document.createElement("strong");v.textContent=String(value);
  row.append(k,v);$("cardInfoStats").append(row);
 }
 $("cardInfoNote").textContent=d.note;
 if(window.KokokuArt)window.KokokuArt.drawPortrait($("cardInfoPortrait"),id,1);
 $("cardInfoOverlay").classList.remove("hidden");
 $("cardInfoClose").focus();
}
function closeCardInfo(){
 if(S.phase!=="inspect")return;
 S.phase=infoResume;$("cardInfoOverlay").classList.add("hidden");
}
function inspectHold(now){
 const m=S.drag;
 if(m&&!m.active&&!m.infoShown&&now-m.startedAt>=540&&Math.hypot(m.x-m.originX,m.y-m.originY)<12){
  m.infoShown=true;openCardInfo(m.id);
 }
}

function buildGallery(){
 const group=$("galleryCards");group.replaceChildren();
 for(const id of IDS){
  const d=CLASSES[id],tile=document.createElement("div");tile.className="galleryTile";
  tile.innerHTML='<canvas width="240" height="150" aria-label="'+d.name+'のデザイン"></canvas>'+
   '<div class="galleryName">'+d.name+'</div>'+
   '<div class="galleryDetails"><span class="galleryRole">'+SIZE_LABEL[d.size]+' · '+(d.capture?"⚑ 占領可能":"✦ 戦闘専門")+'</span> · コスト '+d.cost+' · '+d.qty+'体召喚</div>'+
   '<div class="galleryDetails">'+d.note+'</div>';
  group.append(tile);
  if(window.KokokuArt)window.KokokuArt.drawPortrait(tile.querySelector("canvas"),id,1);
 }
}
function openGallery(){
 if(S.phase==="gallery")return;
 galleryResume=S.phase;S.phase="gallery";
 $("galleryOverlay").classList.remove("hidden");
 $("galleryClose").focus();
}
function closeGallery(){
 if(S.phase!=="gallery")return;
 S.phase=galleryResume;$("galleryOverlay").classList.add("hidden");
}
function updateHUD(){
 if(!S.capitals.length)return;
 $("clock").textContent=S.phase==="prep"?numTime(S.prep):numTime(S.seconds);
 $("phaseLabel").textContent=S.phase==="gallery"?"図鑑（停止中）":S.phase==="prep"?"開戦準備":S.phase==="paused"?"一時停止":S.phase==="battle"?(S.elapsed<100?"序盤｜布陣":S.elapsed<210?"中盤｜攻防":"終盤｜総力戦"):"試遊";
 $("blueText").textContent=Math.ceil(capital(1).hp)+" / "+START_HP;
 $("redText").textContent=Math.ceil(capital(2).hp)+" / "+START_HP;
 $("blueBar").style.width=100*capital(1).hp/START_HP+"%";
 $("redBar").style.width=100*capital(2).hp/START_HP+"%";
 const energy=limit(S.energy[1],0,ENERGY_CAP);
 $("resourceNumber").innerHTML=Math.floor(energy)+' <small>/ '+ENERGY_CAP+'</small>';
 const segments=$("resourceRail").children;
 for(let i=0;i<segments.length;i++)segments[i].children[0].style.width=100*limit(energy-i,0,1)+"%";
 $("resourceRail").setAttribute("aria-valuenow",energy.toFixed(2));
 const playing=S.phase==="battle",paused=["paused","gallery","inspect"].includes(S.phase);
 const next=energy>=ENERGY_CAP-1e-6?"MAX":playing?
   "あと "+((Math.floor(energy)+1-energy)/(rate()*S.speed)).toFixed(1)+"秒":paused?"停止中":"開戦後回復";
 $("resourceNext").textContent=next;
 $("rate").textContent=S.phase==="prep"?"準備中：回復なし":"回復 +"+rate().toFixed(2)+"/ゲーム秒";
 $("prepTime").textContent=numTime(S.prep);
 const owners=S.forts.filter(f=>f.owner===1).length;
 $("remaining").textContent="前哨基地 "+owners+" / 3";
 $("homeCam").classList.toggle("danger",S.underAttackUntil>S.clock);
 for(const b of cards.children){
  const id=b.dataset.id;if(!id)continue;
  const d=CATALOG[id];
  const ready=canPay(1,id);
  b.classList.toggle("unavailable",!ready);
  b.classList.toggle("ready",ready);
  b.classList.toggle("depleted",S.left[1][id]<=0);
  b.classList.toggle("selected",S.selected===id);
 }
 if(performance.now()>S.noticeUntil)$("announcement").classList.remove("visible");
}
function cardDown(e,id){
 if(S.phase!=="prep"&&S.phase!=="battle")return;
 e.preventDefault();
 S.drag={pointer:e.pointerId,id,originX:e.clientX,originY:e.clientY,x:e.clientX,y:e.clientY,active:false,startedAt:performance.now(),infoShown:false};
}
function onGlobalMove(e){
 const m=S.drag;if(!m||m.pointer!==e.pointerId)return;
 m.x=e.clientX;m.y=e.clientY;
 // Moving a finger on the card area is not a placement gesture.
 if(Math.hypot(e.clientX-m.originX,e.clientY-m.originY)>12)m.active=true;
}
function onGlobalUp(e){
 const m=S.drag;if(!m||m.pointer!==e.pointerId)return;
 if(!m.active){S.selected=S.selected===m.id?null:m.id;buildCards();}
 S.drag=null;
}
function arenaDown(e){
 if(S.phase!=="prep"&&S.phase!=="battle")return;
 if(e.target!==cv)return;
 S.cam.moving=false;
 S.pointer={id:e.pointerId,originX:e.clientX,originY:e.clientY,
  lastX:e.clientX,lastY:e.clientY,dragging:false,pos:point(e.clientX,e.clientY)};
}
function arenaMove(e){
 const p=S.pointer;if(!p||p.id!==e.pointerId)return;
 if(!p.dragging&&Math.hypot(e.clientX-p.originX,e.clientY-p.originY)>12)p.dragging=true;
 if(p.dragging){
  const dx=(p.lastX-e.clientX)/S.view.s,dy=(p.lastY-e.clientY)/S.view.s;
  panCamera(dx,dy);p.pos=null;
 }else p.pos=point(e.clientX,e.clientY);
 p.lastX=e.clientX;p.lastY=e.clientY;
}
function arenaUp(e){
 const p=S.pointer;if(!p||p.id!==e.pointerId)return;
 // A swipe only moves the camera; releasing it must NEVER deploy a unit.
 const wasSwipe=p.dragging||Math.hypot(e.clientX-p.originX,e.clientY-p.originY)>12;
 if(!wasSwipe&&S.selected){
  const pt=point(e.clientX,e.clientY),id=S.selected;
  if(!playCard(1,id,pt.x,pt.y))notice(cardFailure(1,id));
 }
 S.pointer=null;
}

function resumeButton(){
 if(S.phase==="battle"){S.phase="paused";$("pause").textContent="▶ 再開";}
 else if(S.phase==="paused"){S.phase="battle";$("pause").textContent="Ⅱ 停止";}
}
function start(){
 resetWorld();fit();buildEnergyMeter();buildCards();buildGallery();
 window.addEventListener("resize",fit);
 document.addEventListener("pointermove",onGlobalMove);
 document.addEventListener("pointerup",onGlobalUp);
 document.addEventListener("pointercancel",e=>{if(S.drag&&S.drag.pointer===e.pointerId){S.drag=null;}});
 area.addEventListener("pointerdown",arenaDown);
 area.addEventListener("pointermove",arenaMove);
 area.addEventListener("pointerup",arenaUp);
 area.addEventListener("pointercancel",()=>S.pointer=null);
 // Keep camera tracking alive when a swipe drifts outside the canvas.
 document.addEventListener("pointermove",arenaMove);
 document.addEventListener("pointerup",arenaUp);
 $("pause").addEventListener("click",resumeButton);
 $("galleryButton").addEventListener("click",openGallery);
 $("galleryFromMenu").addEventListener("click",openGallery);
 $("galleryClose").addEventListener("click",closeGallery);
 $("cardInfoClose").addEventListener("click",closeCardInfo);
 $("homeCam").addEventListener("click",()=>cameraTo(WALL_FACE[1]+115,H/2));
 $("frontCam").addEventListener("click",frontlineCamera);
 $("speed").addEventListener("click",()=>{
  const options=[.85,.65,1];S.speed=options[(options.indexOf(S.speed)+1)%options.length];
  $("speed").textContent="速度 "+S.speed.toFixed(2)+"×";
  notice("対戦速度 "+S.speed.toFixed(2)+"×（準備時間は10秒固定）");
 });
 document.querySelectorAll("[data-level]").forEach(b=>b.addEventListener("click",()=>{
  S.difficulty=b.dataset.level;
  document.querySelectorAll("[data-level]").forEach(x=>x.classList.toggle("active",x===b));
 }));
 $("start").addEventListener("click",begin);
 document.addEventListener("visibilitychange",()=>{
  if(document.hidden&&S.phase==="battle"){S.phase="paused";$("pause").textContent="▶ 再開";}
 });
 document.addEventListener("contextmenu",e=>e.preventDefault());
 window.addEventListener("keydown",e=>{
  if(e.code==="Escape"&&S.phase==="gallery"){e.preventDefault();closeGallery();return;}
  if(e.code==="Escape"&&S.phase==="inspect"){e.preventDefault();closeCardInfo();return;}
  if(e.code==="Space"){e.preventDefault();resumeButton();}
  if(/^[1-5]$/.test(e.key)&&(S.phase==="prep"||S.phase==="battle")){
   S.selected=Number(e.key)===1?"infantry":S.hand[1][Number(e.key)-2]||null;buildCards();
  }
 });
 let previous=performance.now(),acc=0;
 function frame(now){
  const delta=Math.min(.09,Math.max(0,(now-previous)/1000));previous=now;
  S.clock+=delta;
  updateCamera(delta);
  inspectHold(now);
  if(S.phase==="prep"){
   S.prep=Math.max(0,S.prep-delta);
   if(S.prep<=0){
    S.phase="battle";S.botThink=4;
    $("prepBanner").classList.remove("visible");
    $("fieldHint").textContent="タップで召喚 ／ スワイプで画面移動。スペルはどこでも使える。";
    notice("開戦！ 前哨基地を奪って敵首都を目指そう");
   }
  }else if(S.phase==="battle"){
   acc+=delta;
   let iter=0;
   while(acc>=1/30&&iter<5&&S.phase==="battle"){
    tick(S.speed/30);acc-=1/30;iter++;
   }
   if(iter===5)acc=0;
  }else acc=0;
  S.hudTick+=delta;
  if(S.hudTick>=.12){S.hudTick=0;updateHUD();}
  draw();requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}
start();
})();