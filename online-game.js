"use strict";
/* 小国戦線 III — one-screen fortress card battler. No external dependencies. */
(() => {
const NET=window.ShokokuNet;
if(!NET)throw Error("online-net.js must load first");
const ME=()=>NET.team||1;
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
// Randomized each round, then rotated without replacement.
function shuffledDeck(){
 const d=DECK_IDS.slice();
 for(let i=d.length-1;i>0;i--){
  const j=Math.floor(Math.random()*(i+1));
  [d[i],d[j]]=[d[j],d[i]];
 }
 return d;
}
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
 energy:[0,8,8],observedEnergy:[0,8,8],left:[null,{},{}],units:[],forts:[],capitals:[],effects:[],projectiles:[],deaths:[],tickCount:0,
 uid:0,botThink:0,botPrepDone:false,selected:null,drag:null,pointer:null,hand:[null,[],[]],queue:[null,[],[]],spells:{incoming:[],zones:[]},view:{w:1,h:1,s:1,ox:0,oy:0,dpr:1},
 hudTick:0,noticeUntil:0,clock:0,cam:{x:415,y:330,tx:415,ty:330,moving:false},underAttackUntil:0,lastAlert:-10};
function resetWorld(){
 S.prep=PREP;S.seconds=MATCH;S.elapsed=0;S.uid=0;S.botThink=7;S.botPrepDone=false;S.botSaveLarge=false;
 S.energy=[0,8,8];S.observedEnergy=[0,8,8];qaSiegePlans=[null,null,null];qaWindowPlans=[null,null,null];qaConcedePlans=[null,null,null];S.units=[];S.effects=[];S.projectiles=[];S.deaths=[];S.tickCount=0;S.selected=null;S.drag=null;S.pointer=null;
 S.cam={x:ME()===1?300:980,y:330,tx:ME()===1?300:980,ty:330,moving:false};S.underAttackUntil=0;S.lastAlert=-10;
 S.left=[null,{},{}];S.hand=[null,[],[]];S.queue=[null,[],[]];S.spells={incoming:[],zones:[]};
 // The same randomized deck on both teams preserves symmetrical card access.
 const deck=shuffledDeck();
 for(const team of [1,2]){
  for(const [id,d] of Object.entries(CATALOG))S.left[team][id]=d.limit;
  S.hand[team]=deck.slice(0,HAND_SIZE);
  S.queue[team]=deck.slice(HAND_SIZE);
 }
 S.remoteSprites=null;
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
 if(team===ME()){S.selected=id==="infantry"?"infantry":null;buildCards();updateHUD();}
 return true;
}
function notice(message){
 const el=$("announcement");el.textContent=message;el.classList.add("visible");S.noticeUntil=performance.now()+2600;
}
function begin(){
 resetWorld();clampCamera();S.phase="prep";S.speed=1;
 $("speed").textContent="速度 1.00×";$("pause").textContent="Ⅱ 停止";
 $("overlay").classList.add("hidden");
 $("prepBanner").classList.add("visible");
 $("fieldHint").textContent="開戦準備：資源8で初期配置を決めよう。キャラは動かない。";
 // No opening BOT spawns: both players decide their own preparation.
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
 if(team===ME()){S.selected=null;buildCards();updateHUD();}
 return true;
}
function playCard(team,id,x,y){
 if(!NET.isHost&&team===ME()){
  if(!validTarget(team,id,x,y)||!canPay(team,id))return false;
  NET.sendCommand({id,x,y});
  return true;
 }
 const ok=isSpell(id)?castSpell(team,id,x,y):deploy(team,id,x,y);
 // Track only observable, legal card spending, never the hidden opponent hand.
 if(ok)S.observedEnergy[team]=Math.max(0,S.observedEnergy[team]-CATALOG[id].cost);
 if(ok&&duelStats){
  duelStats.actions[team]++;
  duelStats.spent[team]+=CATALOG[id].cost;
  duelStats.cards[team][id]=(duelStats.cards[team][id]||0)+1;
  // Non-invasive localhost battle-spend ledger for episode outcomes.
  if(duelStats.actionLedger)
   duelStats.actionLedger.push({at:S.elapsed,team,id,cost:CATALOG[id].cost});
 }
 return ok;
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
  // Trial-only nearest capture targeting for AI sides. Normal player and
  // standard BOT movement are unchanged.
  if(["nearestCapture","directorPathAligned"].includes(qaBotVariants[u.team])){
   options.sort((a,b)=>Math.abs(a.x-u.x)-Math.abs(b.x-u.x));
   return options[0];
  }
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
 // Read-only battle instrumentation. Never affects target selection or damage.
 if(qaOpeningAudit?.uids.has(u.uid)){
  const m=qaOpeningAudit;
  m.attacks++;
  if(target.kind==="unit"&&ref.hp>0){
   m.unitHits++;
   m.unitDamage+=Math.min(ref.hp,d.damage*shieldMultiplier(ref.team,ref.x,ref.y));
  }else if(target.kind==="fort"&&ref.owner!==u.team){
   m.fortHits++;
   m.fortProgress+=Math.min(ref.hp,d.capture);
  }else if(target.kind==="capital"){
   m.castleHits++;
  }
 }
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
// Known regeneration timeline: forecast affordability without hidden cards/energy.
function secondsUntilAffordable(energy,cost,elapsed=S.elapsed){
 if(!Number.isFinite(energy)||!Number.isFinite(cost)||!Number.isFinite(elapsed)||
    energy<0||cost>ENERGY_CAP||cost<0||elapsed<0)return Infinity;
 let needed=Math.max(0,cost-Math.min(ENERGY_CAP,energy)),clock=elapsed,total=0;
 for(const [limitTime,perSecond] of [[100,.25],[210,.36],[270,.53],[Infinity,.7]]){
  if(clock>=limitTime)continue;
  const availableTime=limitTime-clock,wait=needed/perSecond;
  if(wait<=availableTime)return total+wait;
  total+=availableTime;needed-=availableTime*perSecond;clock=limitTime;
 }
 return total;
}
// Guest BOT uses normal guest commands; only the host changes world state.
let botLastAction=null;
// Only populated by the localhost ?qa=1 tournament harness.
let duelStats=null;
// Localhost QA-only source effectiveness audit for one explicitly played wave.
let qaOpeningAudit=null;
// Development QA-only policy overrides. Standard gameplay always uses baseline.
let qaBotVariants=[null,"baseline","baseline"];
// Persist an explicit plan only for the QA experimental policy. Never shipped.
let qaSiegePlans=[null,null,null];
// QA-only bounded affordability-window plans; never used by the regular BOT.
let qaWindowPlans=[null,null,null];
// QA-only deliberate concession: wait briefly instead of spending 2 energy
// on a doomed outpost. This state is never used by the standard BOT.
let qaConcedePlans=[null,null,null];
function botUse(team,id,x,y){
 const accepted=playCard(team,id,x,y);
 if(accepted){
  botLastAction={team,id,x,y,elapsed:S.elapsed};
  // Measure whether a short wait yielded the intended capture card.
  // This accounting only runs in localhost QA duels.
  const plan=qaBotVariants[team]==="forecastSpendWindow"?qaWindowPlans[team]:null;
  if(plan){
   const ev=duelStats?.decisionEvents?.[team];
   const key=S.elapsed>plan.deadline?"windowExpired":
    id==="scout"?"windowScoutAfterWait":"windowInterrupted";
   if(ev)ev[key]=(ev[key]||0)+1;
   qaWindowPlans[team]=null;
  }
 }
 return accepted;
}
// QA-only six-second contact forecast. This is a kinematic estimate, not a
// replacement for combat physics: units may stop to fight sooner than predicted.
// It reads only visible units, public class stats and real getFort routing.
function forecastCaptureContact(team,x,y){
 const target=getFort({team,key:"scout",x,y});
 if(!target)return {target:null,risk:0,contacts:[]};
 const toward=(from,to,speed,t)=>{
  const gap=dist(from,to);
  const fraction=gap>0?Math.min(1,speed*t/gap):0;
  return {x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction};
 };
 const contacts=[];
 for(const foe of S.units){
  if(foe.hp<=0||foe.team===team)continue;
  const d=CLASSES[foe.key],goal=getFort(foe)||
   wallTarget(capital(team),foe.homeY??foe.y);
  let earliest=null,meet=null;
  for(const t of [2,4,6]){
   const scout=toward({x,y},target,CLASSES.scout.speed,t);
   const enemyPoint=d.behavior==="guard"?foe:toward(foe,goal,d.speed,t);
   if(dist(scout,enemyPoint)<Math.min(d.vision,205)+CLASSES.scout.r+12){
    earliest=t;meet=enemyPoint;break;
   }
  }
  if(earliest===null)continue;
  // A nearby existing fighter can contest that contact. Do not count
  // another capture runner as a dedicated defensive screen.
  const screened=S.units.some(u=>u.hp>u.max*.4&&u.team===team&&
   !CLASSES[u.key].capture&&dist(u,meet)<Math.max(105,CLASSES[u.key].range+40)&&
   (!d.flying||CLASSES[u.key].hitAir));
  if(screened)continue;
  const weight=d.damage>=33||d.size==="large"?2:1;
  contacts.push({key:foe.key,eta:earliest,weight});
 }
 return {target,risk:contacts.reduce((n,c)=>n+c.weight,0),contacts};
}
function botPreparation(){
 if(!NET.botActive||S.phase!=="prep"||S.botPrepDone||S.prep>8.5)return;
 const x=limit(border(2)+40,40,W-40),fort=S.forts.find(f=>f.x===867),y=fort?.y??210;
 for(const id of ["scout","engineer","archer","infantry"])
  if(canPay(2,id)&&botUse(2,id,x,y)){S.botPrepDone=true;break;}
}
// Expert heuristics operate within the same hand, economy and placement rules.
// v3.9 tactical BOT. Same deck order, charges, energy rate and deployment rules as a human.
function botExpertAction(team=2){
 // Observe the current decision BEFORE any card is spent. This data exists
 // only inside seeded localhost QA duels, never normal game/online matches.
 const decisionAudit=duelStats?.decisionAudit?.[team];
 const beforeActions=decisionAudit?duelStats.actions[team]:0;
 const before=decisionAudit?{
  energy:S.energy[team],enemyEnergy:S.observedEnergy[3-team],
  enemyEta4:secondsUntilAffordable(S.observedEnergy[3-team],4),
  ownedFort:S.forts.some(f=>f.owner===team),
  pendingFort:S.forts.some(f=>f.owner!==team),
  allies:S.units.filter(u=>u.team===team&&u.hp>0).length,
  enemies:S.units.filter(u=>u.team!==team&&u.hp>0).length,
  largeHand:availableCard(team,"tank"),
  captureHand:availableCard(team,"scout")||availableCard(team,"engineer"),
  forward:S.units.filter(u=>u.team===team&&u.hp>0&&
   (team===1?u.x>border(team)-100:u.x<border(team)+100)).length,
  underPressure:S.units.some(u=>u.team!==team&&u.hp>0&&
   (team===1?u.x<border(team)+250:u.x>border(team)-250))
 }:null;
 try{
 const hard=S.difficulty==="hard",edge=border(team),power=S.energy[team];
 const qaPolicy=qaBotVariants[team];
 // Deterministic estimate from visible plays, starting energy, known regen.
 const opposingPower=S.observedEnergy[3-team];
 const enemyReady2=secondsUntilAffordable(opposingPower,2);
 const enemyReady4=secondsUntilAffordable(opposingPower,4);
 const enemyReady7=secondsUntilAffordable(opposingPower,7);
 // Use RED-facing x values for identical tactical decisions on either side.
 const dir=team===2?1:-1,front=x=>team===2?x:W-x;
 const foes=S.units.filter(u=>u.team!==team&&u.hp>0),friends=S.units.filter(u=>u.team===team&&u.hp>0);
 const raiders=foes.filter(u=>front(u.x)>front(edge)-380),castleThreat=foes.filter(u=>front(u.x)>front(WALL_FACE[team])-180);
 const fort=S.forts.filter(f=>f.owner!==team).sort((a,b)=>front(b.x)-front(a.x))[0];
 const threatened=S.forts.filter(f=>f.owner===team).map(f=>{
  const enemies=foes.filter(u=>Math.abs(u.x-f.x)<155&&Math.abs(u.y-f.y)<135);
  const allies=friends.filter(u=>Math.abs(u.x-f.x)<155&&Math.abs(u.y-f.y)<135);
  return {f,enemies,score:2*enemies.length-allies.length};
 }).filter(c=>c.enemies.length&&c.score>=0).sort((a,b)=>b.score-a.score)[0];
 const urgent=castleThreat.length>0||!!threatened;
 const event=duelStats?.decisionEvents?.[team];
 // QA-only observational opportunity map. This must NOT influence card use.
 // Read our own hand/queue, public terrain and currently visible enemy units.
 if(qaPolicy==="opportunityAudit"&&event){
  const ownFort=S.forts.filter(f=>f.owner===team);
  const hand=S.hand[team].filter(id=>availableCard(team,id));
  const funded=hand.filter(id=>canPay(team,id));
  const pending=foes.map(u=>{
   const cls=CLASSES[u.key],target=getFort(u);
   return cls.behavior!=="guard"&&cls.speed>0&&target?.owner===team?
    {u,fort:target,eta:dist(u,target)/cls.speed}:null;
  }).filter(Boolean);
  const near=pending.filter(x=>x.eta<=12),soon=near.filter(x=>x.eta<=6.5);
  const lacksCover=near.filter(x=>!friends.some(v=>
   v.hp>v.max*.4&&Math.abs(v.x-x.fort.x)<150&&
   Math.abs(v.y-x.fort.y)<135&&
   (!CLASSES[x.u.key].flying||CLASSES[v.key].hitAir)));
  const tally=key=>{event[key]=(event[key]||0)+1;};
  tally("mapDecisions");
  if(!ownFort.length)tally("mapNoOwnedFort");
  if(urgent)tally("mapUrgent");
  if(power<2)tally("mapEnergyUnder2");
  if(power>=2&&power<3)tally("mapEnergyTwoThree");
  if(power>=3&&power<4)tally("mapEnergyThreeFour");
  if(power>=4)tally("mapEnergyFourPlus");
  if(!funded.length)tally("mapNoFundedHand");
  if(power>=2&&!funded.length)tally("mapInfantryOnlyAvailable");
  if(availableCard(team,"scout"))tally("mapScoutInHand");
  if(S.queue[team].includes("scout"))tally("mapScoutInQueue");
  if(fort&&S.queue[team].includes("scout"))tally("mapScoutQueueWithObjective");
  if(fort&&availableCard(team,"scout")&&!canPay(team,"scout"))
   tally("mapScoutEnergyBlocked");
  if(near.length)tally("mapOwnedFortContact12s");
  if(soon.length)tally("mapOwnedFortContact6s");
  if(lacksCover.length)tally("mapOwnedFortWithoutScreen12s");
  if(soon.length&&!urgent)tally("mapPreUrgent6s");
  if(lacksCover.length&&!urgent&&power>=2&&power<3)tally("mapCheapScreenBudget");
  if(lacksCover.length&&!urgent&&power>=2&&power<3&&
    !canPay(team,"archer")&&!canPay(team,"sentinel"))tally("mapCheapScreenReady");
  const histogram=event.mapPlayableHand||(event.mapPlayableHand={});
  const key=String(funded.length);
  histogram[key]=(histogram[key]||0)+1;
  const examples=event.mapSamples||(event.mapSamples=[]);
  if(examples.length<24&&(near.length||power>=2&&power<3&&!funded.length)){
   examples.push({time:+S.elapsed.toFixed(1),power:+power.toFixed(2),
    hand:hand.slice(),queue:S.queue[team].slice(),funded:funded.slice(),
    ownedForts:ownFort.length,urgent,nearCount:near.length,soonCount:soon.length,
    nearestEta:near.length?+Math.min(...near.map(v=>v.eta)).toFixed(1):null,
    uncovered:lacksCover.length});
  }
 }
 if(event){
  event.calls++;
  if(urgent)event.urgent++;
  if(power>=7)event.energy7++;
  event.opponentLow=(event.opponentLow||0)+(opposingPower<=2.5?1:0);
  event.opponentHigh=(event.opponentHigh||0)+(opposingPower>=7?1:0);
  event.opponentCanBarrage=(event.opponentCanBarrage||0)+(opposingPower>=4?1:0);
  event.enemyRecoveryWindow=(event.enemyRecoveryWindow||0)+(enemyReady4>5?1:0);
  event.enemyGiantSoon=(event.enemyGiantSoon||0)+(enemyReady7<=8?1:0);
  event.stagedFort=(event.stagedFort||0)+(S.forts.some(f=>f.owner===team)?1:0);
  event.hasDrone=(event.hasDrone||0)+(availableCard(team,"drone")?1:0);
  event.fundedDrone=(event.fundedDrone||0)+(power>=4?1:0);
  event.safeDefense=(event.safeDefense||0)+(!urgent?1:0);
  if(["tank","guardian"].some(id=>availableCard(team,id)))event.giantInHand++;
 }
 const focus=castleThreat.sort((a,b)=>front(b.x)-front(a.x))[0]||threatened?.enemies[0]||
  raiders.sort((a,b)=>front(b.x)-front(a.x))[0];
 const defendY=castleThreat.length?focus?.y:threatened?.f.y;
 const laneY=defendY??focus?.y??fort?.y??330;
 const spawn=(id,y,margin=35)=>canPay(team,id)&&botUse(team,id,
  limit(edge+dir*margin,40,W-40),limit(y,70,H-70));

 // Aim the 1.3s delayed barrage where walking enemies will roughly be at impact.
 // Do not stack an expensive cast over a still-incoming allied barrage.
 const projected=u=>{
  const speed=u.walking?CLASSES[u.key].speed*SPELLS.barrage.delay*.7:0;
  return {x:limit(u.x+Math.cos(u.facing||0)*speed,30,W-30),
   y:limit(u.y+Math.sin(u.facing||0)*speed,40,H-35)};
 };
 const targets=raiders.map(u=>{
  const center=projected(u),hits=raiders.filter(v=>{
   const p=projected(v);return Math.hypot(p.x-center.x,p.y-center.y)<SPELLS.barrage.radius*.94;
  });
  return {center,hits:hits.length,value:hits.reduce((sum,v)=>
   sum+1+(CLASSES[v.key].size==="large"?.85:0),0)};
 }).sort((a,b)=>b.value-a.value)[0];
 const groupSize=targets?.hits??0;
 const alreadyTargeted=targets&&S.spells.incoming.some(shot=>shot.team===team&&shot.time>0&&
  Math.hypot(shot.x-targets.center.x,shot.y-targets.center.y)<SPELLS.barrage.radius*.85);
 if(targets&&(groupSize>=(hard?2:3)||urgent&&groupSize===2)&&
  canPay(team,"barrage")&&!alreadyTargeted&&
  botUse(team,"barrage",targets.center.x,targets.center.y))return true;

 // Counters are only useful if a real target and a gap in coverage exist.
 const flyer=raiders.find(u=>CLASSES[u.key].flying);
 if(flyer&&friends.filter(u=>u.key==="archer"&&front(u.x)>front(edge)-175&&Math.abs(u.y-flyer.y)<130).length<2&&
  spawn("archer",flyer.y,60))return true;
 const giant=raiders.find(u=>CLASSES[u.key].size==="large");
 if(giant&&friends.filter(u=>u.key==="guardian"&&front(u.x)>front(edge)-175&&Math.abs(u.y-giant.y)<150).length===0&&
  spawn("guardian",giant.y,35))return true;
 // QA-only deliberate outpost concession. Castle threats, barrage,
 // anti-air and heavy counters have already been considered above.
 // Holding is a real option: forego the desperate 2-energy infantry play,
 // save for an in-hand sentinel, then counterattack after the delay.
 let concessionHold=false;
 if(qaPolicy==="concedeFort"||qaPolicy==="fortTradeReclaim"||qaPolicy==="fortRiskBudget"||qaPolicy==="fortLastLine"||qaPolicy==="fortDefenseValue"){
  const trade=qaPolicy==="fortTradeReclaim"||qaPolicy==="fortRiskBudget"||qaPolicy==="fortLastLine"||qaPolicy==="fortDefenseValue";
  const weighCounter=qaPolicy==="fortDefenseValue";
  const assessRisk=qaPolicy==="fortRiskBudget"||qaPolicy==="fortLastLine";
  const assessLastLine=qaPolicy==="fortLastLine";
  // Strategic criticality: losing the home-side outpost when only one
  // controlled fort remains can directly expose the capital. A deep fort
  // can be traded if visible enemies are still far from our own castle.
  // Only friendly fort ownership, own HP and visible units are used.
  const hostileCastleEta=units=>units.filter(u=>!CLASSES[u.key].flying&&
    CLASSES[u.key].speed>0).reduce((best,u)=>Math.min(best,Math.max(0,
    front(WALL_FACE[team])-front(u.x)-70)/CLASSES[u.key].speed),Infinity);
  const criticalOutpost=(target,units)=>{
   if(!assessLastLine||!target)return false;
   const ownedCount=S.forts.filter(f=>f.owner===team).length;
   const castleUncovered=!friends.some(u=>u.hp>0&&
    front(u.x)>front(WALL_FACE[team])-195&&
    (!CLASSES[u.key].capture||u.key==="engineer"));
   const horizon=ownedCount<=1?24:16;
   const eta=hostileCastleEta(units);
   return capital(team).hp<=1500||castleUncovered&&eta<=horizon;
  };
  const previous=qaConcedePlans[team];
  const threatenedFort=threatened?.f;
  // The regular capturer AI selects the highest-x reachable unowned fort;
  // predict the *actual* route after losing this owned fort. No unit retargeting.
  const engineerCanReachAfterLoss=target=>{
   if(!target)return false;
   const from=limit(edge+dir*35,40,W-40),movement=team===1?1:-1;
   return S.forts.filter(f=>(f.owner!==team||f===target)&&
    movement*(f.x-from)>=-42&&Math.abs(f.y-target.y)<220)
    .sort((a,b)=>b.x-a.x)[0]===target;
  };
  const deepRaid=foes.some(u=>front(u.x)>front(WALL_FACE[team])-230);
  const emergency=castleThreat.length>0||deepRaid;
  if(event){
   event.concedeConsidered=(event.concedeConsidered||0)+1;
   if(threatenedFort)event.concedeThreatened=(event.concedeThreatened||0)+1;
   if(emergency)event.concedeDeepEmergency=(event.concedeDeepEmergency||0)+1;
  }
  if(previous?.active){
   // Episode-level diagnostics, not strategy: did the fort actually fall
   // before the held resources became a legal counterattack?
   const resolved=()=>{
    if(!event)return;
    event.concedeResolved=(event.concedeResolved||0)+1;
    const lost=S.forts[previous.fortIndex]?.owner!==team;
    if(lost)event.concedeResolvedLost=(event.concedeResolvedLost||0)+1;
    else event.concedeResolvedHeld=(event.concedeResolvedHeld||0)+1;
    event.concedeResolutionSeconds=(event.concedeResolutionSeconds||0)+
     Math.max(0,S.elapsed-previous.start);
   };
   if(event&&S.forts[previous.fortIndex]?.owner!==team)
    event.concedeWaitingAfterLoss=(event.concedeWaitingAfterLoss||0)+1;
   const expired=S.elapsed>previous.deadline;
   const reserved=previous.card||"sentinel";
   const unusable=!availableCard(team,reserved);
   // Public, geometry-based clock: can the visible assault reach our capital
   // sooner than the held counter can influence the battle?
   const threatTime=foes.filter(u=>!CLASSES[u.key].flying&&CLASSES[u.key].speed>0)
    .reduce((best,u)=>Math.min(best,Math.max(0,
     front(WALL_FACE[team])-front(u.x)-70)/CLASSES[u.key].speed),Infinity);
   const target=S.forts[previous.fortIndex];
   const recaptureTravel=target?Math.abs(limit(edge+dir*35,40,W-40)-target.x)/
    CLASSES.engineer.speed:Infinity;
   const threatenedBeforeResponse=assessRisk&&reserved==="engineer"&&
    threatTime<=Math.min(8,recaptureTravel*.6)+1;
   const lastLineAlert=criticalOutpost(target,foes);
   if(event&&threatenedBeforeResponse)
    event.riskLateRecapture=(event.riskLateRecapture||0)+1;
   if(event&&lastLineAlert)
    event.lastLineAbort=(event.lastLineAbort||0)+1;
   if(emergency||expired||unusable||threatenedBeforeResponse||lastLineAlert){
    if(event){
     const reason=emergency?"danger":expired?"expired":
      unusable?"missingCard":lastLineAlert?"lastLine":"lateRecapture";
     const causes=event.concedeCancelled||(event.concedeCancelled={});
     causes[reason]=(causes[reason]||0)+1;
    }
    resolved();
    qaConcedePlans[team]={blockedUntil:S.elapsed+12};
   }else if(canPay(team,reserved)){
    // Capturers must really route back to the lost outpost; engineers sent
    // to a different fort do not count as an intentional recapture.
    const target=S.forts[previous.fortIndex];
    const takeBack=reserved==="engineer"&&target?.owner!==team&&
     getFort({team,key:"engineer",x:limit(edge+dir*35,40,W-40),
      y:previous.y})===target;
    const play=reserved==="engineer"&&!takeBack
     ? (canPay(team,"sentinel")?"sentinel":null):reserved;
    if(play&&spawn(play,previous.y,35)){
     if(event){
      event.concedeCounterattack=(event.concedeCounterattack||0)+1;
      if(trade&&play==="engineer"){
       event.tradeReclaimDeployed=(event.tradeReclaimDeployed||0)+1;
       const claims=event.tradeReclaimTargets||(event.tradeReclaimTargets=[]);
       claims.push({index:previous.fortIndex,at:S.elapsed});
      }else if(trade){
       event.tradeDefenderDeployed=(event.tradeDefenderDeployed||0)+1;
      }
     }
     resolved();
     qaConcedePlans[team]={blockedUntil:S.elapsed+14};
     return true;
    }
    if(event&&trade)event.tradeRouteOrCardInvalid=(event.tradeRouteOrCardInvalid||0)+1;
    resolved();
    qaConcedePlans[team]={blockedUntil:S.elapsed+12};
   }else{
    concessionHold=true;
    if(event)event.concedeHeld=(event.concedeHeld||0)+1;
   }
  }
  const plan=qaConcedePlans[team];
  if(!concessionHold&&!plan?.active&&
    (!plan||S.elapsed>=plan.blockedUntil)&&
    threatenedFort&&!emergency&&S.elapsed>=20&&S.elapsed<=235&&
    power>=2&&power<4&&
    (availableCard(team,"sentinel")||
     (trade&&availableCard(team,"engineer")&&
      engineerCanReachAfterLoss(threatenedFort)))){
   const attackers=threatened.enemies.filter(u=>!CLASSES[u.key].flying);
   const fastBreakthrough=attackers.some(u=>CLASSES[u.key].speed>=30);
   // QA-only counter-value comparison. An in-hand stationary splash
   // defender may protect the castle better than a slow capturer.
   const counterGuard=weighCounter&&fastBreakthrough&&availableCard(team,"sentinel");
   const reserve=counterGuard?"sentinel":
    trade&&availableCard(team,"engineer")&&
     engineerCanReachAfterLoss(threatenedFort)?"engineer":"sentinel";
   if(event&&weighCounter){
    event.valueFastScenarios=(event.valueFastScenarios||0)+(fastBreakthrough?1:0);
    event.valueSentinelPriorities=(event.valueSentinelPriorities||0)+(counterGuard?1:0);
   }
   if(event&&trade){
    event.tradeEngineerOptions=(event.tradeEngineerOptions||0)+
     (reserve==="engineer"?1:0);
   }
   const alliedDefense=friends.filter(u=>Math.abs(u.x-threatenedFort.x)<190&&
    Math.abs(u.y-threatenedFort.y)<140);
   const eta=secondsUntilAffordable(power,4);
   if(event)event.concedeCandidates=(event.concedeCandidates||0)+1;
   // Compare the resource-wait window with the arrival of visible enemies at
   // our capital. This is deliberately pessimistic (straight-line movement).
   // Low-value recapture is rejected if castle defense would be too late.
   const threatEta=attackers.reduce((best,u)=>Math.min(best,Math.max(0,
    front(WALL_FACE[team])-front(u.x)-70)/Math.max(1,CLASSES[u.key].speed)),Infinity);
   const projectedSpawn=limit(edge+dir*35,40,W-40);
   const recaptureTime=Math.abs(projectedSpawn-threatenedFort.x)/CLASSES.engineer.speed;
   const requiredWindow=eta+(reserve==="engineer"
    ?Math.min(8,recaptureTime*.6):4);
   const lastLineCritical=criticalOutpost(threatenedFort,attackers);
   const castleSafe=(!assessRisk||threatEta>requiredWindow)&&!lastLineCritical;
   if(event&&assessLastLine){
    event.lastLineEvaluated=(event.lastLineEvaluated||0)+1;
    if(lastLineCritical)event.lastLineDenied=(event.lastLineDenied||0)+1;
    else event.lastLineAllowed=(event.lastLineAllowed||0)+1;
   }
   if(event&&assessRisk){
    event.riskWindowsChecked=(event.riskWindowsChecked||0)+1;
    if(!castleSafe)event.riskRejected=(event.riskRejected||0)+1;
    else event.riskPassed=(event.riskPassed||0)+1;
   }
   if(attackers.length>=2&&alliedDefense.length===0&&eta<=8&&castleSafe){
    const objectiveIndex=S.forts.indexOf(threatenedFort);
    qaConcedePlans[team]={active:true,start:S.elapsed,card:reserve,
     deadline:S.elapsed+11,y:threatenedFort.y,fortIndex:objectiveIndex};
    if(duelStats?.counterEpisodes){
     duelStats.counterEpisodes.push({
      team,variant:qaPolicy,start:S.elapsed,fortIndex:objectiveIndex,
      reserve,energyStart:power,ownedFortsStart:S.forts.filter(f=>f.owner===team).length,
      fastAttackersStart:attackers.filter(u=>CLASSES[u.key].speed>=30).length,
      enemiesStart:foes.length,castleHpStart:capital(team).hp,
      enemyCastleHpStart:capital(3-team).hp,
      fortControl15:0,fortControl30:0,fortControl60:0,fortControl90:0,
      castleDamage15:null,castleDamage30:null,castleDamage60:null,castleDamage90:null,
      enemyCastleDamage15:null,enemyCastleDamage30:null,
      enemyCastleDamage60:null,enemyCastleDamage90:null,
      ownedAt15:null,ownedAt30:null,ownedAt60:null,ownedAt90:null,
      fortFrontier30:null,fortFrontier60:null,fortFrontier90:null,
      firstLoss:null,firstRecapture:null
     });
    }
    concessionHold=true;
    if(event){
     event.concedeStarted=(event.concedeStarted||0)+1;
     if(trade)event.tradeEngineerPlans=(event.tradeEngineerPlans||0)+
      (reserve==="engineer"?1:0);
    }
   }
  }
 }
 if(urgent&&!concessionHold){
  const incoming=foes.filter(u=>front(u.x)>front(edge)-255&&Math.abs(u.y-laneY)<145);
  const defense=friends.filter(u=>front(u.x)>front(edge)-175&&Math.abs(u.y-laneY)<145);
  if(incoming.length>=2&&spawn("suppress",laneY,50))return true;
  if(incoming.length&&defense.length<incoming.length+1&&spawn("sentinel",laneY,35))return true;
  if(defense.length<incoming.length+1&&spawn("archer",laneY,60))return true;
  if(defense.length<incoming.length+1&&spawn("infantry",laneY,35))return true;
 }
 // Skip non-emergency spending while the 4-cost counter is being prepared.
 // Real castle pressure cancels the hold on the next thought.
 if(concessionHold)return true;

 // Ward cannot protect the same army twice, so avoid overlapping active zones.
 if(canPay(team,"ward")){
  const candidate=friends.map(u=>{
   const close=friends.filter(v=>dist(v,u)<SPELLS.ward.radius*.85);
   const threatenedAllies=close.filter(v=>foes.some(e=>dist(e,v)<CLASSES[e.key].vision+35));
   const existing=S.spells.zones.some(z=>z.team===team&&z.time>1.5&&
    Math.hypot(z.x-u.x,z.y-u.y)<SPELLS.ward.radius*.70);
   return {u,score:threatenedAllies.length+
    (threatenedAllies.some(v=>CLASSES[v.key].size==="large")?1:0),existing};
  }).filter(p=>!p.existing).sort((a,b)=>b.score-a.score)[0];
  if(candidate&&candidate.score>=(hard?2:3)&&
   botUse(team,"ward",candidate.u.x,candidate.u.y))return true;
 }
 // QA-only strategic director: evaluate *every* fort as an objective before
 // picking the next card, rather than spending on the first affordable unit.
 // Counters, urgent defense and real defensive wards above keep priority.
 if(["objectiveDirector","directorNoSave","directorCaptureOnly","directorRouteAware","directorPathAligned"].includes(qaPolicy)){
  const objectives=S.forts.filter(f=>f.owner!==team).filter(f=>{
   if(!["directorRouteAware","directorPathAligned"].includes(qaPolicy))return true;
   // A chosen lane must lead to its real in-game capture objective.
   // In particular the human BLUE-side movement AI can intentionally skip
   // a near fort; do not count a card spawn as a near-fort capture action.
   const probe={team,key:"scout",x:limit(edge+dir*35,40,W-40),
    y:limit(f.y,70,H-70)};
   return getFort(probe)===f;
  }).map(f=>{
   const friendlyCapturers=friends.filter(u=>CLASSES[u.key].capture&&
    (["directorRouteAware","directorPathAligned"].includes(qaPolicy)
     ?getFort(u)===f
     :Math.abs(u.x-f.x)<205&&Math.abs(u.y-f.y)<130));
   const enemyDefenders=foes.filter(u=>Math.abs(u.x-f.x)<185&&Math.abs(u.y-f.y)<135);
   const friendlyCover=friends.filter(u=>!CLASSES[u.key].capture&&
    Math.abs(u.x-f.x)<215&&Math.abs(u.y-f.y)<155);
   const forwardDistance=Math.abs(f.x-edge);
   // A contested fort with a weak capture wave should not attract further
   // unescorted scouts. Nearby objectives and insufficient coverage score high.
   const score=170-forwardDistance*.16+(f.owner===0?20:0)+
    (friendlyCapturers.length===0?65:0)+
    Math.min(3,friendlyCapturers.length)*9-
    enemyDefenders.length*16+Math.min(2,friendlyCover.length)*4;
   return {f,score,workers:friendlyCapturers,defenders:enemyDefenders,cover:friendlyCover};
  }).sort((a,b)=>b.score-a.score||a.f.x-b.f.x);
  const objective=objectives[0],progress=objective?.workers.length??0;
  const guard=S.forts.filter(f=>f.owner===team).map(f=>{
   const attackers=foes.filter(u=>Math.abs(u.x-f.x)<245&&Math.abs(u.y-f.y)<165);
   const defenders=friends.filter(u=>Math.abs(u.x-f.x)<190&&Math.abs(u.y-f.y)<165);
   return {f,attackers,defenders,danger:attackers.length*2-defenders.length};
  }).sort((a,b)=>b.danger-a.danger)[0];
  const record=key=>{if(event)event.directorActions=(event.directorActions||{});
   if(event)event.directorActions[key]=(event.directorActions[key]||0)+1;};
  const deploy=(id,y,why)=>{if(spawn(id,y,id==="archer"||id==="suppress"?60:35)){
   record(why);return true;}return false;};
  if(guard?.attackers.length&&guard.danger>0&&
   !friends.some(u=>u.key==="sentinel"&&Math.abs(u.x-guard.f.x)<180&&
    Math.abs(u.y-guard.f.y)<135)&&
   (deploy("sentinel",guard.f.y,"holdFort")||deploy("archer",guard.f.y,"holdFort")))return true;
  if(objective){
   const y=objective.f.y;
   // First establish a real capture lane. If contested, send a durable
   // capturing unit instead of blindly feeding an unguarded scout.
   if(progress===0){
    if(objective.defenders.length>0){
     if(deploy("engineer",y,"captureContested")||
        deploy("scout",y,"captureContested"))return true;
    }else if(deploy("scout",y,"captureOpen")||
             deploy("engineer",y,"captureOpen"))return true;
   }
   if(progress>=1&&objective.defenders.length>objective.cover.length&&
     !friends.some(u=>u.key==="suppress"&&Math.abs(u.y-y)<140&&
      Math.abs(u.x-edge)<205)&&
     (deploy("suppress",y,"escort")||deploy("archer",y,"escort")))return true;
   // A second capture unit is useful only for a contested or genuinely
   // under-staffed target; already assigned workers count as committed.
   if(progress===1&&objective.defenders.length>=1&&
    (deploy("engineer",y,"reinforce")||deploy("scout",y,"reinforce")))return true;
  }
  // Once a wave is already committed, reserve a little for a meaningful
  // follow-up rather than converting every 2 energy into more infantry.
  // Never wait during an actual raid or when no advance troops survive.
  if(qaPolicy!=="directorCaptureOnly"&&!urgent&&friends.length>=2&&S.forts.some(f=>f.owner===team)&&
    !raiders.some(u=>front(u.x)>front(edge)-180)&&
    (progress>=1||!objective)){
   const attackY=objective?.f.y??(friends.find(u=>front(u.x)<front(edge)-30)?.y??330);
   const attacking=friends.some(u=>front(u.x)<front(edge)-20);
   if(attacking&&
    (deploy("tank",attackY,"siegeTank")||
     deploy("drone",attackY,"siegeDrone")||
     deploy("suppress",attackY,"siegeSupport")))return true;
   if(qaPolicy==="objectiveDirector"&&attacking&&power>=2&&power<4&&friends.length>=3){
    record("saveForPush");return true;
   }
  }
  // No strategic opportunity worth buying right now: let the standard
  // battle logic handle general defenses and miscellaneous cards.
 }
 const workers=fort?friends.filter(u=>CLASSES[u.key].capture&&
  (qaPolicy==="captureCoverage"?Math.abs(u.x-fort.x)<300:
   front(u.x)>front(fort.x)-175)&&Math.abs(u.y-fort.y)<135):[];
 const needFort=!!fort&&workers.length<(S.elapsed<40?1:2);
 if(event&&needFort)event.needFort++;
 // Independent QA-only policy probes. Do not alter existing movement,
 // high-priority counters or base decisions unless conditions truly apply.
 const surgical=reason=>{if(event){
  const counts=event.surgicalChoices||(event.surgicalChoices={});
  counts[reason]=(counts[reason]||0)+1;
 }};
 // QA-only short affordability window. Unlike a 7-cost giant saving plan,
 // this requires a scout ALREADY in our four-card hand (not hidden in the
 // queue), a real unclaimed fort, and at most 2.5s to three energy.
 // If forecast contacts are likely, immediately fall back to normal tactics.
 // QA-only economical forward interception. Forecast an actual capture
 // unit reaching an owned fort within six seconds, but keep the established
 // high-priority emergency, anti-air, barrage and ward branches untouched.
 if(qaPolicy==="forecastCheapScreen"&&!urgent&&power>=2&&power<3){
  if(event)event.cheapScreenChecks=(event.cheapScreenChecks||0)+1;
  // Only intervene if a stronger, already affordable guard/archer cannot
  // handle the approach. A 2-cost infantry play uses the standard hand rules.
  if(!canPay(team,"archer")&&!canPay(team,"sentinel")){
   const spawnX=limit(edge+dir*35,40,W-40);
   const threats=foes.map(u=>{
    const d=CLASSES[u.key],target=getFort(u);
    if(d.flying||d.behavior==="guard"||d.speed<20||
     !target||target.owner!==team)return null;
    const eta=dist(u,target)/d.speed;
    // Our inexpensive ground infantry must actually have time to move from
    // the legal spawn line to the threatened fort. The 12s horizon is a
    // travel-budget constraint, not a guess that an enemy is already here.
    const distanceToFort=Math.abs(spawnX-target.x);
    const screenEta=Math.max(0,distanceToFort-CLASSES.infantry.range)/
     CLASSES.infantry.speed;
    if(eta>12||eta<1.5||distanceToFort>240||screenEta>eta+1)return null;
    const covered=friends.some(v=>v.hp>v.max*.45&&
     Math.abs(v.x-target.x)<150&&Math.abs(v.y-target.y)<135&&
     (!d.flying||CLASSES[v.key].hitAir));
    return !covered?{target,eta,source:u}:null;
   }).filter(Boolean).sort((a,b)=>a.eta-b.eta);
   if(event)event.cheapScreenThreats=(event.cheapScreenThreats||0)+threats.length;
   if(threats.length&&spawn("infantry",threats[0].target.y,35)){
    if(event)event.cheapScreenPlays=(event.cheapScreenPlays||0)+1;
    return true;
   }
  }
 }
 // QA-only 2-cost infantry as a real capture alternative for a stranded
 // four-card hand. No hidden opponent state, no movement change.
 // QA-only opponent-cost gate: this handless infantry diversion only
 // makes sense when publicly estimated enemy counterplay is unfunded.
 if(qaPolicy==="captureSpendGate"&&!urgent&&fort&&power>=2&&
    power<4&&S.elapsed<130){
  if(event)event.spendGateConsidered=(event.spendGateConsidered||0)+1;
  const assigned=friends.some(u=>CLASSES[u.key].capture&&
   (getFort(u)===fort||Math.abs(u.y-fort.y)<135&&
    Math.abs(u.x-fort.x)<250));
  const affordable=S.hand[team].some(id=>canPay(team,id));
  const minCost=S.hand[team].filter(id=>availableCard(team,id))
   .reduce((best,id)=>Math.min(best,CATALOG[id].cost),Infinity);
  const eta=secondsUntilAffordable(power,minCost);
  const unsafe=foes.some(u=>Math.abs(u.y-fort.y)<145&&
   (Math.abs(u.x-fort.x)<200||Math.abs(u.x-edge)<230));
  const heavyVisible=foes.some(u=>CLASSES[u.key].size==="large");
  const enemyCanCounter=opposingPower>=4||enemyReady7<=9;
  const candidate=!assigned&&!affordable&&minCost<=5&&eta>=3&&!unsafe;
  if(event){
   event.spendGateOpportunity=(event.spendGateOpportunity||0)+(candidate?1:0);
   event.spendGateEnemyFunds=(event.spendGateEnemyFunds||0)+
    (candidate&&enemyCanCounter?1:0);
   event.spendGateHeavyVisible=(event.spendGateHeavyVisible||0)+
    (candidate&&heavyVisible?1:0);
  }
  if(candidate&&!enemyCanCounter&&!heavyVisible&&
     spawn("infantry",fort.y,35)){
   if(event)event.spendGatePlayed=(event.spendGatePlayed||0)+1;
   return true;
  }
 }
 if(qaPolicy==="captureTempoInfantry"&&!urgent&&fort&&power>=2&&
    S.elapsed<130){
  if(event)event.captureTempoConsidered=(event.captureTempoConsidered||0)+1;
  const deployed=friends.some(u=>CLASSES[u.key].capture&&
   (getFort(u)===fort||Math.abs(u.y-fort.y)<135&&
    Math.abs(u.x-fort.x)<250));
  const handPlayable=S.hand[team].some(id=>canPay(team,id));
  const cheapest=S.hand[team].filter(id=>availableCard(team,id))
   .reduce((best,id)=>Math.min(best,CATALOG[id].cost),Infinity);
  const wait=secondsUntilAffordable(power,cheapest);
  if(event&&!handPlayable&&wait>=3)
   event.captureTempoWindow=(event.captureTempoWindow||0)+1;
  const unsafe=foes.some(u=>Math.abs(u.y-fort.y)<145&&
   (Math.abs(u.x-fort.x)<200||Math.abs(u.x-edge)<230));
  if(!deployed&&!handPlayable&&wait>=3&&!unsafe&&
   spawn("infantry",fort.y,35)){
   if(event)event.captureTempoPlayed=(event.captureTempoPlayed||0)+1;
   return true;
  }
 }
 if(qaPolicy==="forecastSpendWindow"){
  const previous=qaWindowPlans[team];
  if(previous&&S.elapsed>previous.deadline){
   if(event)event.windowExpired=(event.windowExpired||0)+1;
   qaWindowPlans[team]=null;
  }
  if(event){
   event.windowDecisions=(event.windowDecisions||0)+1;
   event.windowNeedFort=(event.windowNeedFort||0)+(needFort?1:0);
   event.windowScoutInHand=(event.windowScoutInHand||0)+
    (needFort&&availableCard(team,"scout")?1:0);
   event.windowScoutInQueue=(event.windowScoutInQueue||0)+
    (needFort&&S.queue[team].includes("scout")?1:0);
  }
  if(needFort&&!urgent&&availableCard(team,"scout")&&
   power>=2&&power<CLASSES.scout.cost){
   const eta=secondsUntilAffordable(power,CLASSES.scout.cost);
   if(event){
    event.windowAffordableSoon=(event.windowAffordableSoon||0)+(eta<=2.5?1:0);
   }
   if(eta<=2.5){
    const x=limit(edge+dir*35,40,W-40),forecast=forecastCaptureContact(team,x,fort.y);
    const nearby=foes.some(u=>Math.abs(u.x-edge)<210&&
     Math.abs(u.y-fort.y)<145);
    if(event){
     event.windowForecastChecks=(event.windowForecastChecks||0)+1;
     event.windowUnsafe=(event.windowUnsafe||0)+(forecast.risk>0||nearby?1:0);
    }
    if(forecast.target&&forecast.risk===0&&!nearby){
     if(!qaWindowPlans[team]){
      qaWindowPlans[team]={deadline:S.elapsed+5};
      if(event)event.windowStarted=(event.windowStarted||0)+1;
     }
     if(event)event.windowWaiting=(event.windowWaiting||0)+1;
     return true;
    }
   }
  }
 }
 if(qaPolicy==="preemptFort"&&!urgent&&power>=4){
  const threatenedSoon=S.forts.filter(f=>f.owner===team).map(f=>{
   const enemies=foes.filter(u=>Math.abs(u.x-f.x)<330&&Math.abs(u.y-f.y)<140);
   const cover=friends.filter(u=>Math.abs(u.x-f.x)<195&&Math.abs(u.y-f.y)<140);
   return {f,enemies,cover};
  }).filter(a=>a.enemies.length&&a.enemies.length>a.cover.length)
   .sort((a,b)=>b.enemies.length-a.enemies.length)[0];
  if(threatenedSoon&&!threatenedSoon.cover.some(u=>u.key==="sentinel")&&
     spawn("sentinel",threatenedSoon.f.y,35)){
   surgical("preemptFort");return true;
  }
 }
 if(qaPolicy==="escortCapturer"&&!urgent&&power>=2){
  const unescorted=S.forts.filter(f=>f.owner!==team).map(f=>{
   const units=friends.filter(u=>CLASSES[u.key].capture&&
    Math.abs(u.x-f.x)<205&&Math.abs(u.y-f.y)<110);
   const enemies=foes.filter(u=>Math.abs(u.x-f.x)<210&&Math.abs(u.y-f.y)<130);
   const support=friends.filter(u=>!CLASSES[u.key].capture&&
    Math.abs(u.x-f.x)<180&&Math.abs(u.y-f.y)<120);
   return {f,units,enemies,support};
  }).filter(v=>v.units.length&&v.enemies.length&&!v.support.length)
   .sort((a,b)=>b.enemies.length-a.enemies.length)[0];
  if(unescorted&&spawn("archer",unescorted.f.y,60)){
   surgical("escortCapturer");return true;
  }
 }
 if(qaPolicy==="forecastCapture"&&!urgent&&fort){
  // Instrument the entire eligibility funnel, including turns where energy
  // or the current hand make the proposed intervention impossible.
  const scoutReady=canPay(team,"scout");
  const engineerReady=canPay(team,"engineer");
  const archerReady=canPay(team,"archer");
  if(event){
   event.forecastObserved=(event.forecastObserved||0)+1;
   event.forecastNeedFort=(event.forecastNeedFort||0)+(needFort?1:0);
   event.forecastScoutReady=(event.forecastScoutReady||0)+(needFort&&scoutReady?1:0);
   event.forecastEngineerReady=(event.forecastEngineerReady||0)+(needFort&&engineerReady?1:0);
   event.forecastArcherReady=(event.forecastArcherReady||0)+(needFort&&archerReady?1:0);
  }
  if(needFort&&(scoutReady||engineerReady||archerReady)){
   const x=limit(edge+dir*35,40,W-40),y=fort.y;
   const forecast=forecastCaptureContact(team,x,y);
   if(event){
    event.forecastChecks=(event.forecastChecks||0)+1;
    event.forecastContacts=(event.forecastContacts||0)+forecast.contacts.length;
    event.forecastRisky=(event.forecastRisky||0)+(forecast.risk>=2?1:0);
   }
   if(forecast.risk>=2){
    // A sturdy capture unit must go to the same target as the scout.
    if(scoutReady&&engineerReady&&
     forecast.target===getFort({team,key:"engineer",x,y})&&
     spawn("engineer",y,35)){
     surgical("forecastCapture");return true;
    }
    // If the tougher worker is not ready, establish a ranged screen before
    // feeding a vulnerable scout into the predicted contact lane.
    if(scoutReady&&archerReady&&spawn("archer",y,60)){
     surgical("forecastScreen");return true;
    }
   }
  }
 }
 if(qaPolicy==="laneScout"&&needFort&&canPay(team,"scout")){
  // Score actual card destination using existing getFort, never retarget units.
  const options=S.forts.filter(f=>f.owner!==team).map(f=>{
   const x=limit(edge+dir*35,40,W-40),y=f.y;
   const target=getFort({key:"scout",team,x,y});
   if(!target)return null;
   const foesNear=foes.filter(u=>Math.abs(u.x-target.x)<185&&
    Math.abs(u.y-target.y)<145).length;
   const assigned=friends.filter(u=>CLASSES[u.key].capture&&
    getFort(u)===target).length;
   return {y,target,score:foesNear*3+assigned*2+Math.abs(target.x-edge)/450};
  }).filter(Boolean).sort((a,b)=>a.score-b.score);
  if(options.length){
   const current=getFort({key:"scout",team,
    x:limit(edge+dir*35,40,W-40),y:fort.y});
   if(options[0].target!==current&&spawn("scout",options[0].y,35)){
    surgical("laneScout");return true;
   }
  }
 }
 // QA-only stateful siege intent. Unlike one-turn affordability thresholds,
 // a healthy forward capture group can protect a bounded 7-energy investment.
 // Emergency defense, counters and wards always run before this stage.
 if(qaPolicy==="stagedBudget"||qaPolicy==="screenBudget"){
  const covered=S.forts.some(f=>f.owner===team)&&
   friends.filter(u=>CLASSES[u.key].capture&&u.hp>u.max*.4&&
    front(u.x)<front(edge)+60).length>=2;
  const closeRaiders=raiders.filter(u=>front(u.x)>front(edge)-160);
  const screenedRaiders=closeRaiders.filter(e=>friends.some(a=>
   a.hp>a.max*.45&&Math.abs(a.x-e.x)<135&&Math.abs(a.y-e.y)<105&&
   front(a.x)>=front(e.x)-80&&
   (!CLASSES[e.key].flying||CLASSES[a.key].hitAir)));
  const exposedRaiders=closeRaiders.length-screenedRaiders.length;
  const closeUnsafe=qaPolicy==="screenBudget"?exposedRaiders>0:closeRaiders.length>0;
  const safe=!urgent&&covered&&availableCard(team,"tank")&&!closeUnsafe;
  if(event&&qaPolicy==="screenBudget"){
   event.screenChecks=(event.screenChecks||0)+1;
   event.screenedContacts=(event.screenedContacts||0)+screenedRaiders.length;
   event.unscreenedContacts=(event.unscreenedContacts||0)+exposedRaiders;
  }
  const plan=qaSiegePlans[team];
  if(plan?.active&&(!safe||S.elapsed>plan.deadline)){
   // A plan may have been disrupted between BOT thoughts; classify the
   // observable reason at its next evaluation, not a causal claim.
   const cause=S.elapsed>plan.deadline?"expired":
    urgent?"emergency":
    !S.forts.some(f=>f.owner===team)?"lostFort":
    !availableCard(team,"tank")?"tankUnusable":
    !covered?"frontlineLost":"enemyClose";
   if(event){
    const snapshots=event.budgetCancelSnapshots||(event.budgetCancelSnapshots=[]);
    if(snapshots.length<30)snapshots.push({
     t:+S.elapsed.toFixed(1),reason:cause,energy:+power.toFixed(2),
     closeRaiders:closeRaiders.length,screened:screenedRaiders.length,
     exposed:exposedRaiders,allies:friends.length,
     enemyToEdge:closeRaiders.length?
      +Math.max(0,front(edge)-Math.max(...closeRaiders.map(u=>front(u.x)))).toFixed(1):null,
     nearestEnemyClass:closeRaiders.sort((a,b)=>front(b.x)-front(a.x))[0]?.key||null,
     nearestEnemySpeed:closeRaiders[0]?CLASSES[closeRaiders[0].key].speed:null
    });
   }
   qaSiegePlans[team]={blockedUntil:S.elapsed+18};
   if(event){
    event.budgetCancelled=(event.budgetCancelled||0)+1;
    const counts=event.budgetCancelReasons||(event.budgetCancelReasons={});
    counts[cause]=(counts[cause]||0)+1;
   }
  }
  const active=qaSiegePlans[team];
  if(safe&&S.elapsed>=50&&(!active||active.blockedUntil<=S.elapsed)){
   qaSiegePlans[team]={active:true,deadline:S.elapsed+23};
   if(event)event.budgetStarted=(event.budgetStarted||0)+1;
  }
  if(qaSiegePlans[team]?.active&&safe){
   if(power>=7&&spawn("tank",fort?.y??laneY,38)){
    qaSiegePlans[team]={blockedUntil:S.elapsed+14};
    if(event)event.budgetTank=(event.budgetTank||0)+1;
    return true;
   }
   if(power<7){
    if(event)event.budgetWait=(event.budgetWait||0)+1;
    return true;
   }
  }
 }
 // QA-only hypothesis C: a guarded economy window saves for a giant only when
 // there is a healthy capture group and the frontline is not being raided.
 const reserveGiants=["tank","guardian"].filter(id=>availableCard(team,id));
 const reserveReady=S.elapsed>25&&!urgent&&reserveGiants.length>0&&
  friends.length>=3&&friends.some(u=>CLASSES[u.key].capture)&&
  !raiders.some(u=>front(u.x)>front(edge)-160);
 if(event&&reserveReady)event.reserveReady=(event.reserveReady||0)+1;
 if(qaPolicy==="reserveEarly"&&reserveReady){
  if(power>=7&&spawn(reserveGiants.includes("tank")?"tank":"guardian",
    fort?.y??laneY,38))return true;
  if(power>=2.5&&power<7)return true;
 }
 // QA-only hypothesis A: after securing a fort and having two capture troops,
 // spend a real 7-energy tank window on offense before making more capture troops.
 if(qaPolicy==="siegeWindow"&&!urgent&&S.elapsed>45&&power>=7&&
    S.forts.some(f=>f.owner===team)&&
    friends.filter(u=>CLASSES[u.key].capture).length>=2&&
    spawn("tank",fort?.y??laneY,38))return true;
 // A depleted opponent is unable to fund an immediate expensive counter;
 // press only with a real forward squad and no urgent defensive problem.
 if(qaPolicy==="opponentPunish"&&opposingPower<=2.5&&!urgent&&fort&&
  S.elapsed>30&&power>=3&&friends.length>=2&&
  friends.some(u=>front(u.x)<front(edge)-75)&&
  spawn("scout",fort.y,35)){
   if(event)event.variantTriggers=(event.variantTriggers||0)+1;
   return true;
 }
 // Four public energy is sufficient to afford a barrage, if in hand.
 // A high-cost defense is only justified by visible enemies in a threatened lane.
 if(qaPolicy==="opponentGuard"&&opposingPower>=4&&!urgent&&
  raiders.length>0&&friends.length>=2&&
  friends.filter(u=>u.key==="sentinel"&&Math.abs(u.y-laneY)<130&&
   Math.abs(u.x-edge)<160).length===0&&spawn("sentinel",laneY,35)){
   if(event)event.variantTriggers=(event.variantTriggers||0)+1;
   return true;
 }
 // QA-only opportunistic flanking: low-energy enemy cannot answer a 4-cost
 // aerial push within six seconds. Need a captured staging fort and at least
 // one surviving friendly fighter, with no immediate defense duty.
 if(qaPolicy==="tempoSiege"&&!urgent&&S.elapsed>18&&power>=4&&
    availableCard(team,"drone")&&S.forts.some(f=>f.owner===team)&&
    friends.length>=1&&enemyReady4>6&&
    !raiders.some(u=>front(u.x)>front(edge)-160)&&
    spawn("drone",fort?.y??laneY,35)){
   if(event)event.variantTriggers=(event.variantTriggers||0)+1;
   return true;
 }
 // QA-only proactive defense: intercept a visible approach while there
 // is still time to place guards; do not invent invisible enemy units.
 if(qaPolicy==="tempoScreen"&&!urgent&&enemyReady4<=5&&power>=4&&
    friends.length>=2&&
    foes.some(u=>Math.abs(u.x-edge)<460&&Math.abs(u.x-edge)>245&&
     Math.abs(u.y-laneY)<180)&&
    friends.filter(u=>u.key==="sentinel"&&Math.abs(u.y-laneY)<150&&
     Math.abs(u.x-edge)<180).length===0&&spawn("sentinel",laneY,35)){
   if(event)event.variantTriggers=(event.variantTriggers||0)+1;
   return true;
 }
 if(needFort&&spawn("scout",fort.y,35))return true;
 if(needFort&&spawn("engineer",fort.y,35))return true;

 const archers=friends.filter(u=>u.key==="archer").length;
 if(S.elapsed<45&&archers<2&&spawn("archer",laneY,60))return true;

 // Save for giants only if owned lanes are not under pressure, and the
 // objective capture line already has troops. No hidden energy advantages.
 const giants=["tank","guardian"].filter(id=>availableCard(team,id));
 if(giants.length&&S.elapsed>18&&!urgent){
  const chosen=giants.includes("tank")?"tank":giants[0];
  if(power>=7&&spawn(chosen,chosen==="tank"?fort?.y??laneY:laneY,38))return true;
  if(power>=4&&!needFort&&friends.length>=2&&
   !raiders.some(u=>front(u.x)>front(edge)-160))return true;
 }
 if(groupSize>=2&&spawn("suppress",targets.center.y,50))return true;
 if(raiders.length>=2&&spawn("sentinel",laneY,35))return true;
 if(archers<3&&spawn("archer",laneY,62))return true;
 for(const id of ["scout","engineer","archer","suppress","drone","sentinel","tank","guardian"]){
  const y=id==="scout"||id==="engineer"||id==="tank"?fort?.y??laneY:laneY;
  if(spawn(id,y,id==="archer"||id==="suppress"?60:35))return true;
 }
 if((power>=10||urgent)&&spawn("infantry",laneY,35))return true;
 return false;
 }finally{
  if(decisionAudit){
   const played=duelStats.actions[team]>beforeActions;
   const card=played?botLastAction.id:"none";
   const phase=before.underPressure?"defend":before.ownedFort&&before.forward>=2?
    "staged":before.pendingFort?"capture":"advance";
   const energyBucket=before.energy<2?"0-2":before.energy<4?"2-4":
    before.energy<7?"4-7":"7-12";
   decisionAudit.calls++;
   decisionAudit.byPhase[phase]=(decisionAudit.byPhase[phase]||0)+1;
   decisionAudit.byEnergy[energyBucket]=(decisionAudit.byEnergy[energyBucket]||0)+1;
   decisionAudit.byCard[card]=(decisionAudit.byCard[card]||0)+1;
   const perPhase=decisionAudit.phaseCards[phase]??(decisionAudit.phaseCards[phase]={});
   perPhase[card]=(perPhase[card]||0)+1;
   if(before.largeHand){
    decisionAudit.tankInHand++;
    if(before.energy<7)decisionAudit.tankUnaffordable++;
    if(before.ownedFort&&before.forward>=2){
     decisionAudit.tankFrontlineOpportunity++;
     if(before.energy>=7)decisionAudit.tankFundedOpportunity++;
     else if(played&&CATALOG[card].cost<7)decisionAudit.tankDeferredByCheapPlay++;
    }
   }
   if(before.energy>=4&&before.enemyEta4>6&&before.ownedFort&&
      before.allies>0)decisionAudit.enemyResourceWindow++;
   if(decisionAudit.samples.length<40&&(
      (before.largeHand&&before.ownedFort&&before.forward>=2)||
      (before.underPressure&&before.energy>=4)
     )){
    decisionAudit.samples.push({time:+S.elapsed.toFixed(1),phase,energy:+before.energy.toFixed(2),
     enemyEnergy:+before.enemyEnergy.toFixed(2),
     enemyEta4:+before.enemyEta4.toFixed(1),allies:before.allies,
     forward:before.forward,largeHand:before.largeHand,
     card,chosenCost:played?CATALOG[card].cost:0});
   }
  }
 }
}
function botAction(){
 const allies=S.units.filter(u=>u.team===2&&u.hp>0);
 const enemies=S.units.filter(u=>u.team===1&&u.hp>0);
 // The BOT shares the player's card hand, costs, and charge limits.
 if(S.difficulty!=="easy"){botExpertAction();return;}
 if(canPay(2,"barrage")&&enemies.length){
  const best=enemies.map(t=>({target:t,hits:enemies.filter(u=>dist(t,u)<SPELLS.barrage.radius).length}))
   .sort((a,b)=>b.hits-a.hits)[0];
  if(best.hits>=2&&Math.random()<.75){botUse(2,"barrage",best.target.x,best.target.y);return;}
 }
 if(canPay(2,"ward")&&allies.length){
  const best=allies.map(t=>({target:t,hits:allies.filter(u=>dist(t,u)<SPELLS.ward.radius).length,
   threatened:enemies.some(u=>dist(t,u)<150)})).filter(x=>x.threatened).sort((a,b)=>b.hits-a.hits)[0];
  if(best&&best.hits>=2&&Math.random()<.7){botUse(2,"ward",best.target.x,best.target.y);return;}
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
  botUse(2,giant,x,limit(y,70,H-70));
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
  botUse(2,"suppress",limit(border(2)+32,60,W-50),limit(spot.y,70,H-70));return;
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
 botUse(2,chosen,x,limit(y,70,H-70));
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
 if(NET.isHost)NET.finish({result,reason});
 S.phase="result";
 const titles={win:"勝利！",lose:"敗北",draw:"引き分け"};
 $("dialogTitle").textContent=titles[result]||"対戦終了";
 $("dialogText").textContent=reason+"　前哨基地と初期配置を変えると展開も大きく変わるよ。";
 $("rules").innerHTML="自軍首都："+Math.ceil(capital(ME()).hp)+" / "+START_HP+
 "<br>敵軍首都："+Math.ceil(capital(3-ME()).hp)+" / "+START_HP+
 "<br>残り時間："+numTime(S.seconds)+
 "<br>"+(NET.isSolo?"オフライン BOT対戦":"1vs1 オンライン対戦");
 $("start").textContent=NET.isSolo?"BOTと再戦":NET.isHost?"同じルームで再戦":"新しいルームで遊ぶ";
 $("overlay").classList.remove("hidden");
 $("prepBanner").classList.remove("visible");
}
function finishTime(){
 const a=capital(1).hp/START_HP,b=capital(2).hp/START_HP;
 end(Math.abs(a-b)<1e-6?"draw":a>b?"win":"lose","時間切れ！ 首都の残りHP割合で判定した。");
}
function tick(dt){
 if(!NET.isHost||S.phase!=="battle")return;
 S.elapsed+=dt;S.seconds-=dt;
 for(const team of [1,2]){
  const gain=dt*rate();
  S.energy[team]=Math.min(ENERGY_CAP,S.energy[team]+gain);
  S.observedEnergy[team]=Math.min(ENERGY_CAP,S.observedEnergy[team]+gain);
 }
 unitStep(dt);spellStep(dt);
 for(const fallen of S.deaths)fallen.t-=dt;
 S.deaths=S.deaths.filter(fallen=>fallen.t>0);
 for(const fx of S.effects)fx.t-=dt;
 S.effects=S.effects.filter(f=>f.t>0);
 for(const shot of S.projectiles)shot.t-=dt;
 S.projectiles=S.projectiles.filter(f=>f.t>0);
 if(S.effects.length>140)S.effects.splice(0,S.effects.length-140);
 if(S.projectiles.length>110)S.projectiles.splice(0,S.projectiles.length-110);
 if(NET.isSolo&&S.phase==="battle")botStep(dt);
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
// Keep Retina quality on fast devices; switch to a cheaper Canvas raster on
// consistently slow tablet displays. A one-way change avoids resolution flicker.
let tabletDprCap=1.45,qualityWindowStart=0,qualityFrames=0,qualityMeasured=false;
function adaptCanvasQuality(now){
 if(qualityMeasured||!(S.phase==="battle"||S.phase==="prep")||document.hidden){
  if(document.hidden){qualityWindowStart=0;qualityFrames=0;}
  return;
 }
 if(!qualityWindowStart){qualityWindowStart=now;return;}
 qualityFrames++;
 const elapsed=now-qualityWindowStart;
 if(elapsed<3400)return;
 const fps=qualityFrames/(elapsed/1000);
 qualityWindowStart=now;qualityFrames=0;
 if(fps<38&&S.view.dpr>1.02){
  tabletDprCap=1.0;qualityMeasured=true;fit();
 }
}
function fit(){
 const rect=area.getBoundingClientRect(),v=S.view;
 v.w=Math.max(1,rect.width);v.h=Math.max(1,rect.height);
 // Reduce Retina tablet raster overdraw; simulation coordinates remain untouched.
 const tablet=(window.innerWidth||v.w)>=700&&(window.matchMedia?.("(pointer: coarse)").matches||/iPad/i.test(navigator.userAgent||""));
 v.dpr=Math.min(window.devicePixelRatio||1,tablet?tabletDprCap:2);
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
 const allies=S.units.filter(u=>u.team===ME()&&u.hp>0);
 const enemies=S.units.filter(u=>u.team!==ME()&&u.hp>0);
 let best=null,score=-Infinity;
 for(const u of allies){
  const nearby=enemies.filter(v=>dist(v,u)<180).length;
  const value=nearby*150+(ME()===1?u.x:W-u.x)*.22;
  if(value>score){best=u;score=value;}
 }
 if(best)return cameraTo(best.x+(ME()===1?75:-75),best.y);
 const active=S.forts.filter(f=>f.owner!==ME()).sort((a,b)=>ME()===1?a.x-b.x:b.x-a.x)[0];
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
function renderTerrainBackdrop(g){
 g.fillStyle="#2b4e42";g.fillRect(0,0,W,H);
 const ground=g.createLinearGradient(0,0,0,H);
 ground.addColorStop(0,"#35604e");ground.addColorStop(.5,"#335a4c");ground.addColorStop(1,"#1f3c36");
 g.fillStyle=ground;g.fillRect(0,0,W,H);
 g.fillStyle="#73957e16";g.fillRect(35,260,1210,126);
 // Natural path details rather than discrete lanes.
 for(let i=0;i<75;i++){
  const x=(i*167+84)%W,y=(i*131+63)%H;
  g.strokeStyle=i%3===0?"#b0be8e25":"#092b272c";g.lineWidth=2.5;
  g.beginPath();g.moveTo(x-10,y+5);g.quadraticCurveTo(x,y-5,x+12,y+2);g.stroke();
 }
}
// Fixed ground is rasterized once; deploy lines stay dynamic.
let terrainBase=null,terrainCacheEnabled=true;
function terrain(){
 if(terrainCacheEnabled){
  if(!terrainBase){
   terrainBase=document.createElement("canvas");terrainBase.width=W;terrainBase.height=H;
   renderTerrainBackdrop(terrainBase.getContext("2d"));
  }
  ctx.drawImage(terrainBase,0,0);
 }else renderTerrainBackdrop(ctx);
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
 // Smooth presentation only. Combat physics and Firebase state stay authoritative.
 if(!NET.isHost&&S.remoteSprites){
  const v=S.remoteSprites.get(u.uid);
  if(v){
   const now=performance.now(),dt=Math.max(0,Math.min(.07,(now-v.lastFrame)/1000));
   v.lastFrame=now;
   const age=Math.max(0,Math.min(.17,(now-v.updatedAt)/1000));
   const alpha=1-Math.exp(-dt*13);
   v.x+=(v.targetX+v.vx*age-v.x)*alpha;
   v.y+=(v.targetY+v.vy*age-v.y)*alpha;
   u={...u,x:v.x,y:v.y};
  }
 }
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
 const legal=canPay(ME(),item)&&validTarget(ME(),item,p.x,p.y);
 const radius=isSpell(item)?SPELLS[item].radius:39;
 ctx.strokeStyle=legal?"#9deaff":"#ff9aa3";ctx.fillStyle=legal?"#7bdfff34":"#ff788a39";ctx.lineWidth=3;
 ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.font="bold 13px system-ui";ctx.textAlign="center";ctx.fillStyle="#fff";
 ctx.fillText(legal?(isSpell(item)?SPELLS[item].name:"召喚可能"):"使用不可",p.x,p.y-radius-13);
}
// Inspired by the readability of silhouette-led realtime strategy battles:
// cache recognizable character artwork under heavy crowding, never gameplay state.
const denseSpriteCache=new Map(),FAST_W=164,FAST_H=190,FAST_AX=82,FAST_AY=155;
let useDenseSpriteCache=true,denseCacheBroken=false,denseSpritesRendered=0,fullSpritesRendered=0;
function cachedSprite(u,pose){
 const key=u.key+"/"+u.team+"/"+pose;
 if(denseSpriteCache.has(key))return denseSpriteCache.get(key);
 if(denseCacheBroken||!window.KokokuArt?.drawUnit)return null;
 try{
  const tile=document.createElement("canvas");tile.width=FAST_W;tile.height=FAST_H;
  const g=tile.getContext("2d");if(!g)throw Error("Canvas2D unavailable");
  const sample={...u,x:FAST_AX,y:FAST_AY,hp:100,max:100,
   spawnAt:-100,spawnDuration:.4,deathProgress:0,flash:0,hitAt:-100,drift:0,
   walking:pose===1||pose===2,walkPhase:pose===2?3.2:.4,windup:0,
   attackAnim:pose===3?(MOTION.attack[u.key]||.5)*.6:0,
   attackAnimMax:MOTION.attack[u.key]||.5};
  window.KokokuArt.drawUnit(g,sample,Math.max(300,S.clock));
  denseSpriteCache.set(key,tile);
  return tile;
 }catch(error){denseCacheBroken=true;denseSpriteCache.clear();return null;}
}
function renderCrowdedUnit(u){
 // Keep dramatic large units, their unique Gald sprite atlas, and normal
 // fights at full detail. Only small/medium sprites get a cheap crowded LOD.
 if(!useDenseSpriteCache||denseCacheBroken||S.units.length<40||
   u.key==="guardian"||u.key==="tank"||!window.KokokuArt){
  fullSpritesRendered++;drawUnit(u);return;
 }
 const pose=(u.attackAnim||0)>.12?3:!u.walking?0:Math.sin(u.walkPhase||0)>0?1:2;
 const sprite=cachedSprite(u,pose);
 if(!sprite){fullSpritesRendered++;drawUnit(u);return;}
 denseSpritesRendered++;
 // Small colored ground indicator separates friend and foe in overlapping crowds.
 ctx.strokeStyle=u.team===1?"#7fe4ffad":"#ff879bac";ctx.lineWidth=1.65;
 ctx.beginPath();ctx.ellipse(u.x,u.y+1,Math.max(14,CLASSES[u.key].r+6),7,0,0,Math.PI*2);ctx.stroke();
 ctx.drawImage(sprite,Math.round(u.x-FAST_AX),Math.round(u.y-FAST_AY));
 if(u.flash>0){
  ctx.save();ctx.globalAlpha=Math.min(.42,u.flash*.85);ctx.fillStyle="#fff";
  ctx.beginPath();ctx.arc(u.x,u.y-38,14,0,Math.PI*2);ctx.fill();ctx.restore();
 }
 if(u.hp<u.max){
  const ratio=Math.max(0,Math.min(1,u.hp/u.max)),y=u.y-(u.key==="drone"?100:105);
  ctx.fillStyle="#10242b";ctx.fillRect(u.x-22,y,44,6);
  ctx.fillStyle=TEAM[u.team];ctx.fillRect(u.x-21,y+1,42*ratio,4);
 }
}
// Large-unit arrival: short, non-blocking battlefield atmosphere cue.
// A newly seen large unit is enough to synchronize this visual on host and guest;
// no Firebase messages, gameplay timestamps, combat rules or additional DOM layers.
const GRAND_DURATION=880,grandSeen=new Set();
let grandInBattle=false,grandArrival=null,grandEffectEnabled=true;
function observeGrandArrival(now){
 if(S.phase!=="battle"){
  grandInBattle=false;grandArrival=null;grandSeen.clear();return;
 }
 // Do not replay entrances for units already on the field when joining/restarting.
 if(!grandInBattle){
  grandInBattle=true;
  for(const u of S.units)if(u.key==="guardian"||u.key==="tank")grandSeen.add(u.uid);
  return;
 }
 for(const u of S.units){
  if(u.key!=="guardian"&&u.key!=="tank" || grandSeen.has(u.uid))continue;
  grandSeen.add(u.uid);
  // The new UID is authoritative. Avoid comparing local and remote clocks:
  // a guest who waited in a room may be many seconds ahead of the host.
  // Units existing on battle entry were already registered in grandSeen.
  if(grandEffectEnabled)grandArrival={uid:u.uid,team:u.team,key:u.key,x:u.x,y:u.y,started:now};
 }
 if(grandArrival&&now-grandArrival.started>=GRAND_DURATION)grandArrival=null;
}
function paintGrandArrival(now){
 const a=grandArrival;if(!a||!grandEffectEnabled)return;
 const elapsed=Math.max(0,now-a.started);
 if(elapsed>=GRAND_DURATION)return;
 // Ease up then out, avoiding flashes, heavy CSS filters, camera shake and blur.
 const phase=elapsed/GRAND_DURATION,amplitude=Math.sin(phase*Math.PI);
 const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
 const intensity=amplitude*(reduced?.28:1);
 if(intensity<.002)return;
 const v=S.view,color=a.team===1?"#79dbff":"#ff8c9a";
 ctx.save();
 ctx.setTransform(v.dpr,0,0,v.dpr,0,0);
 ctx.fillStyle=a.team===1?"#2b6478":"#703544";
 ctx.globalAlpha=intensity*.085;ctx.fillRect(0,0,v.w,v.h);
 ctx.strokeStyle=color;
 ctx.globalAlpha=intensity*.30;ctx.lineWidth=7;
 ctx.strokeRect(5,5,Math.max(0,v.w-10),Math.max(0,v.h-10));
 ctx.globalAlpha=intensity*.15;ctx.lineWidth=21;
 ctx.strokeRect(15,15,Math.max(0,v.w-30),Math.max(0,v.h-30));
 // The source is world-relative. If the summon point is off-camera, the subtle
 // screen tint still warns of a heavy enemy without disclosing their position.
 if(!reduced){
  const px=v.ox+a.x*v.s,py=v.oy+a.y*v.s;
  if(px>-110&&px<v.w+110&&py>-110&&py<v.h+110){
   ctx.globalAlpha=intensity*.65;
   ctx.lineWidth=3.2;
   const radius=20+phase*125;
   ctx.beginPath();ctx.arc(px,py,radius,0,Math.PI*2);ctx.stroke();
  }
 }
 ctx.restore();
}
// Visual-only rejection of entirely off-camera sprite work.
let drawCullingEnabled=true;
function draw(){
 const now=performance.now();observeGrandArrival(now);
 denseSpritesRendered=0;fullSpritesRendered=0;
 const v=S.view,d=v.dpr;
 const minX=-v.ox/v.s,maxX=(v.w-v.ox)/v.s,minY=-v.oy/v.s,maxY=(v.h-v.oy)/v.s;
 const visible=(x,y,rx=155,above=225,below=85)=>
  !drawCullingEnabled||(x>=minX-rx&&x<=maxX+rx&&y>=minY-below&&y<=maxY+above);
 ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,v.w,v.h);
 ctx.fillStyle="#0d2426";ctx.fillRect(0,0,v.w,v.h);
 ctx.save();ctx.translate(v.ox,v.oy);ctx.scale(v.s,v.s);
 terrain();drawSpellFields();
 // Walls occupy the full vertical edge; render behind units regardless of center Y.
 for(const c of S.capitals)if(visible(WALL_FACE[c.team],H/2,115,H/2,H/2))drawCapital(c);
 const objects=[];
 for(const p of S.forts)if(visible(p.x,p.y,60,100,55))objects.push({y:p.y+20,draw:()=>drawFort(p)});
 for(const u of S.units)if(visible(u.x,u.y))objects.push({y:u.y,draw:()=>renderCrowdedUnit(u)});
 for(const gone of S.deaths){
  if(!visible(gone.x,gone.y))continue;
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
  if(!visible(e.x,e.y,(e.r||20)+30,(e.r||20)+50,(e.r||20)+35))continue;
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
  if(!visible(x,y,35,45,45))continue;
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
 paintGrandArrival(now);
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
 for(const id of ["infantry",...S.hand[ME()]]){
  const d=CATALOG[id],available=S.left[ME()][id]>0,spell=isSpell(id);
  const button=document.createElement("button");
  button.type="button";button.className="card"+(id==="infantry"?" permanent":"")+(spell?" spell":"")+(d.size?" tier-"+d.size:"");
  button.dataset.id=id;
  button.setAttribute("aria-label",d.name+" コスト"+d.cost+" "+(spell?"スペル":SIZE_LABEL[d.size]));
  if(S.selected===id)button.classList.add("selected");
  if(!available)button.classList.add("depleted");
  if(!canPay(ME(),id))button.classList.add("unavailable");
  const left=Number.isFinite(CATALOG[id].limit)?"残 "+S.left[ME()][id]:"∞";
  button.innerHTML='<div class="cardTop"><span class="cardCost">'+d.cost+'</span><span class="cardQuantity">'+
   (spell?"魔法":id==="infantry"?"常時":"×"+d.qty)+'</span></div>'+
   '<canvas class="cardPortrait" width="128" height="72" aria-hidden="true"></canvas>'+
   '<div class="cardName">'+d.name+'</div>'+
   '<div class="cardBottom"><span class="cardLeft">'+left+'</span>'+
   (spell?'<span class="cardSpell">魔法</span>':'<span class="cardTier">'+SIZE_LABEL[d.size]+(d.capture?' ⚑':'')+'</span>')+'</div>';
  if(window.KokokuArt)window.KokokuArt.drawPortrait(button.querySelector("canvas"),id,ME());
  button.addEventListener("pointerdown",e=>cardDown(e,id));
  button.addEventListener("contextmenu",e=>{e.preventDefault();if(S.phase==="prep"||S.phase==="battle")openCardInfo(id);});
  cards.append(button);
 }
 const next=S.queue[ME()].find(id=>S.left[ME()][id]>0);
 $("nextCard").textContent=next?"次："+CATALOG[next].name:"次：残りなし";
}

let galleryResume="menu",infoResume="menu";
function openCardInfo(id){
 const d=CATALOG[id];if(!d||S.phase==="inspect")return;
 infoResume=S.phase;if(S.phase!=="prep"&&S.phase!=="battle")S.phase="inspect";
 S.drag=null;
 $("cardInfoName").textContent=d.name;
 $("cardInfoRole").textContent=isSpell(id)?"スペル":SIZE_LABEL[d.size]+" · "+(d.capture?"占領可能":"戦闘専門");
 const remaining=Number.isFinite(S.left[ME()][id])?S.left[ME()][id]:"無制限";
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
 if(window.KokokuArt)window.KokokuArt.drawPortrait($("cardInfoPortrait"),id,ME());
 $("cardInfoOverlay").classList.remove("hidden");
 $("cardInfoClose").focus();
}
function closeCardInfo(){
 if(S.phase==="inspect")S.phase=infoResume;
 $("cardInfoOverlay").classList.add("hidden");
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
 if(S.phase==="prep"||S.phase==="battle"){notice("対戦中は図鑑を開けません");return;}
 if(S.phase==="gallery")return;
 galleryResume=S.phase;S.phase="gallery";
 $("galleryOverlay").classList.remove("hidden");
 $("galleryClose").focus();
}
function closeGallery(){
 if(S.phase!=="gallery")return;
 S.phase=galleryResume;$("galleryOverlay").classList.add("hidden");
}
// Read-only objective overview; color matches the fixed blue/red HUD sides.
function updateFortNavigation(){
 const nav=$("fortNav");
 nav.hidden=!(S.phase==="battle"||S.phase==="prep");
 if(nav.hidden||S.forts.length!==3)return;
 let blue=0,red=0;
 const buttons=nav.querySelectorAll("button[data-fort]");
 for(let i=0;i<3;i++){
  const fort=S.forts[i],button=buttons[i];
  if(fort.owner===1)blue++;else if(fort.owner===2)red++;
  const blueNear=S.units.some(u=>u.hp>0&&u.team===1&&Math.abs(u.x-fort.x)<110&&Math.abs(u.y-fort.y)<105);
  const redNear=S.units.some(u=>u.hp>0&&u.team===2&&Math.abs(u.x-fort.x)<110&&Math.abs(u.y-fort.y)<105);
  const contested=blueNear&&redNear;
  const threatened=(fort.owner===1&&redNear)||(fort.owner===2&&blueNear);
  const advancing=(fort.owner!==1&&blueNear)||(fort.owner!==2&&redNear);
  const owner=fort.owner===1?"青軍":fort.owner===2?"赤軍":"中立";
  const state=contested?"争奪":threatened?"警戒":advancing?"攻略":owner;
  button.classList.toggle("owner-blue",fort.owner===1);
  button.classList.toggle("owner-red",fort.owner===2);
  button.classList.toggle("contested",contested);
  button.classList.toggle("under-pressure",threatened);
  const label=button.querySelector(".fortState");
  if(label.textContent!==state)label.textContent=state;
  const description="第"+(i+1)+"前哨基地 "+owner+(contested?"、争奪中":threatened?"、敵接近":advancing?"、攻略中":"")+"。タップで確認";
  if(button.getAttribute("aria-label")!==description)button.setAttribute("aria-label",description);
 }
 const summary="基地 青"+blue+"・赤"+red;
 if($("fortSummary").textContent!==summary)$("fortSummary").textContent=summary;
}
function updateHUD(){
 if(!S.capitals.length)return;
 updateFortNavigation();
 $("clock").textContent=S.phase==="prep"?numTime(S.prep):numTime(S.seconds);
 $("phaseLabel").textContent=S.phase==="gallery"?"図鑑（停止中）":S.phase==="prep"?"開戦準備":S.phase==="paused"?"一時停止":S.phase==="battle"?(S.elapsed<100?"序盤｜布陣":S.elapsed<210?"中盤｜攻防":"終盤｜総力戦"):"試遊";
 $("blueText").textContent=Math.ceil(capital(1).hp)+" / "+START_HP;
 $("redText").textContent=Math.ceil(capital(2).hp)+" / "+START_HP;
 $("blueBar").style.width=100*capital(1).hp/START_HP+"%";
 $("redBar").style.width=100*capital(2).hp/START_HP+"%";
 const energy=limit(S.energy[ME()],0,ENERGY_CAP);
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
 const owners=S.forts.filter(f=>f.owner===ME()).length;
 $("remaining").textContent="前哨基地 "+owners+" / 3";
 $("homeCam").classList.toggle("danger",S.underAttackUntil>S.clock);
 for(const b of cards.children){
  const id=b.dataset.id;if(!id)continue;
  const d=CATALOG[id];
  const ready=canPay(ME(),id);
  b.classList.toggle("unavailable",!ready);
  b.classList.toggle("ready",ready);
  b.classList.toggle("depleted",S.left[ME()][id]<=0);
  b.classList.toggle("selected",S.selected===id);
 }
 if(performance.now()>S.noticeUntil)$("announcement").classList.remove("visible");
}
function cardDown(e,id){
 if(NET.guestBot){notice("BOT操作中。右上で手動に戻せます");return;}
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
 if(!wasSwipe&&S.selected&&!NET.guestBot){
  const pt=point(e.clientX,e.clientY),id=S.selected;
  if(!playCard(ME(),id,pt.x,pt.y))notice(cardFailure(ME(),id));
 }
 S.pointer=null;
}

function resumeButton(){
 notice("オンライン対戦は一時停止できません");return;
 if(S.phase==="battle"){S.phase="paused";$("pause").textContent="▶ 再開";}
 else if(S.phase==="paused"){S.phase="battle";$("pause").textContent="Ⅱ 停止";}
}
function start(){
 resetWorld();fit();buildEnergyMeter();buildCards();buildGallery();
 NET.registerGame({
  begin,setDifficulty:level=>{
    if(["easy","normal","hard"].includes(level)){
      S.difficulty=level;
      document.querySelectorAll("[data-level]").forEach(b=>b.classList.toggle("active",b.dataset.level===level));
    }
   },setBotControl:active=>{
    if(active){S.selected=null;S.drag=null;S.pointer=null;S.botThink=2.5;S.botPrepDone=false;}
    buildCards();updateHUD();
   },resetForLobby:()=>{
   resetWorld();S.phase="menu";S.remoteSprites=null;
   $("overlay").classList.add("hidden");$("prepBanner").classList.remove("visible");
   buildCards();updateHUD();
  },showResult:()=>{if(S.phase!=="result")end(NET.resultForMe(),NET.resultReason());},world:()=>({
   phase:S.phase,prep:S.prep,seconds:S.seconds,elapsed:S.elapsed,clock:S.clock,
   energy:S.energy,left:S.left,hand:S.hand,queue:S.queue,units:S.units,
   forts:S.forts,capitals:S.capitals,spells:S.spells,effects:S.effects,
   projectiles:S.projectiles,deaths:S.deaths,uid:S.uid,speed:S.speed
  }),
  accept:c=>{
   if(!NET.isHost||!c||typeof c.id!=="string"||!Number.isFinite(c.x)||!Number.isFinite(c.y))return false;
   return validTarget(2,c.id,c.x,c.y)&&playCard(2,c.id,c.x,c.y);
  },
  apply:(data,seq)=>{
   if(NET.isHost||!data||!(seq>(window.__onlineSeq||0)))return;
   window.__onlineSeq=seq;
   const was=S.phase,localClock=S.clock;
   const oldSelected=S.selected,oldCam=S.cam;
   for(const field of ["prep","seconds","elapsed","clock","energy","left","hand","queue",
    "units","forts","capitals","spells","effects","projectiles","deaths","uid","speed"]){
    if(data[field]!==undefined)S[field]=data[field];
   }
   if(data.phase==="prep"||data.phase==="battle"){
    S.phase=data.phase;
    if(NET.guestBot&&data.phase==="battle"&&was!=="battle")S.botThink=3;
    $("overlay").classList.add("hidden");
    $("prepBanner").classList.toggle("visible",S.phase==="prep");
    if(was==="menu")cameraTo(980,330);
   }else if(data.phase==="result"){
    if(NET.hasResult()&&S.phase!=="result")end(NET.resultForMe(),NET.resultReason());
   }
   S.selected=oldSelected;S.cam=oldCam;
   // Never rewind character animations when a delayed packet arrives.
   S.clock=Math.max(localClock,S.clock);
   const now=performance.now(),sprites=S.remoteSprites||(S.remoteSprites=new Map());
   const seen=new Set();
   for(const u of S.units){
    seen.add(u.uid);
    let v=sprites.get(u.uid);
    if(!v){
     sprites.set(u.uid,{x:u.x,y:u.y,targetX:u.x,targetY:u.y,vx:0,vy:0,updatedAt:now,lastFrame:now});
     continue;
    }
    const elapsed=Math.max(.085,Math.min(.75,(now-v.updatedAt)/1000));
    const dx=u.x-v.targetX,dy=u.y-v.targetY;
    if(Math.hypot(dx,dy)>100){v.x=u.x;v.y=u.y;v.vx=0;v.vy=0;}
    else{v.vx=limit(dx/elapsed,-65,65);v.vy=limit(dy/elapsed,-65,65);}
    v.targetX=u.x;v.targetY=u.y;v.updatedAt=now;
   }
   for(const id of sprites.keys())if(!seen.has(id))sprites.delete(id);
   const sig=JSON.stringify([S.hand[ME()],S.queue[ME()],S.left[ME()]]);
   if(sig!==window.__onlineHandSig){window.__onlineHandSig=sig;buildCards();}
   updateHUD();
  }
 });
 // Refresh card and gallery portraits once the high-quality Gald atlas is built.
 window.addEventListener("gald-ready",()=>{buildCards();buildGallery();});
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
 $("homeCam").addEventListener("click",()=>cameraTo(WALL_FACE[ME()]+(ME()===1?115:-115),H/2));
 $("frontCam").addEventListener("click",frontlineCamera);
 $("fortNav").querySelectorAll("button[data-fort]").forEach(button=>button.addEventListener("click",()=>{
  if(S.phase!=="battle"&&S.phase!=="prep")return;
  const fort=S.forts[Number(button.dataset.fort)];
  if(fort)cameraTo(fort.x,fort.y);
 }));
 $("speed").addEventListener("click",()=>{
  notice("オンライン対戦は速度固定です");return;
  const options=[.85,.65,1];S.speed=options[(options.indexOf(S.speed)+1)%options.length];
  $("speed").textContent="速度 "+S.speed.toFixed(2)+"×";
  notice("対戦速度 "+S.speed.toFixed(2)+"×（準備時間は10秒固定）");
 });
 document.querySelectorAll("[data-level]").forEach(b=>b.addEventListener("click",()=>{
  S.difficulty=b.dataset.level;
  document.querySelectorAll("[data-level]").forEach(x=>x.classList.toggle("active",x===b));
 }));
 $("start").addEventListener("click",()=>NET.isHost?NET.rematch():NET.resetLobby());
 $("newRoom").addEventListener("click",()=>NET.resetLobby());
 document.addEventListener("visibilitychange",()=>{
  if(document.hidden&&S.phase==="battle")NET.reportVisibility(true);
 });
 document.addEventListener("contextmenu",e=>e.preventDefault());
 window.addEventListener("keydown",e=>{
  if(e.code==="Escape"&&S.phase==="gallery"){e.preventDefault();closeGallery();return;}
  if(e.code==="Escape"&&S.phase==="inspect"){e.preventDefault();closeCardInfo();return;}
  if(e.code==="Space"){e.preventDefault();resumeButton();}
  if(/^[1-5]$/.test(e.key)&&(S.phase==="prep"||S.phase==="battle")){
   S.selected=Number(e.key)===1?"infantry":S.hand[ME()][Number(e.key)-2]||null;buildCards();
  }
 });
 let previous=performance.now(),acc=0;
 function frame(now){
  const delta=Math.min(.09,Math.max(0,(now-previous)/1000));previous=now;
  adaptCanvasQuality(now);
  S.clock+=delta;
  updateCamera(delta);
  inspectHold(now);
  if(NET.isHost&&S.phase==="prep"){
   S.prep=Math.max(0,S.prep-delta);
   if(NET.isSolo)botPreparation();
   if(S.prep<=0){
    S.phase="battle";S.botThink=4;
    $("prepBanner").classList.remove("visible");
    $("fieldHint").textContent="タップで召喚 ／ スワイプで画面移動。スペルはどこでも使える。";
    notice("開戦！ 前哨基地を奪って敵首都を目指そう");
   }
  }else if(NET.isHost&&S.phase==="battle"){
   acc+=delta;
   let iter=0;
   while(acc>=1/30&&iter<5&&S.phase==="battle"){
    tick(S.speed/30);acc-=1/30;iter++;
   }
   if(iter===5)acc=0;
  }else acc=0;
  if(NET.guestBot&&(S.phase==="prep"||S.phase==="battle")){
   if(S.phase==="prep")botPreparation();
   else botStep(delta*S.speed);
  }
  S.hudTick+=delta;
  if(S.hudTick>=.12){S.hudTick=0;updateHUD();}
  if(NET.isHost&&!NET.isSolo&&(S.phase==="prep"||S.phase==="battle"||S.phase==="result"))NET.maybePublish();
  draw();requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}

// Test-only readback. Enabled only on loopback via ?qa=1.
if((location.hostname==="localhost"||location.hostname==="127.0.0.1")&&new URLSearchParams(location.search).has("qa")){
 window.__shokokuQa={
 captureObjective:(team,x,y,variant="baseline",kind="scout")=>{
  if(!NET.isSolo||![1,2].includes(team)||!["scout","engineer"].includes(kind)||
    !Number.isFinite(x)||!Number.isFinite(y)||
    !["baseline","nearestCapture","directorPathAligned"].includes(variant))return null;
  const previous=qaBotVariants[team];
  try{
   qaBotVariants[team]=variant;
   const target=getFort({team,x,y,key:kind});
   return target?{x:target.x,y:target.y,owner:target.owner}:null;
  }finally{qaBotVariants[team]=previous;}
 },
 resourceForecast:(energy,elapsed=90)=>({
  eta2:secondsUntilAffordable(energy,2,elapsed),
  eta4:secondsUntilAffordable(energy,4,elapsed),
  eta7:secondsUntilAffordable(energy,7,elapsed)
 }),
 // Batch simulation runs the SAME 30Hz combat/energy/spell/fort code as a match,
 // with no drawing, network traffic or player input; only on localhost ?qa=1.
 runDuel:(seed,blueStyle="balanced",difficulty="hard",tacticalTeam=2,scriptedCadence="standard",mirrorTerrain=false,variantTeam=0,variant="baseline")=>{
  if(!NET.isSolo||!Number.isInteger(seed)||seed<0||seed>2147483647||
    !["rush","balanced","fortress","banker","self"].includes(blueStyle)||
    !["hard","normal"].includes(difficulty)||![1,2].includes(tacticalTeam)||
    !["standard","fast"].includes(scriptedCadence)||typeof mirrorTerrain!=="boolean"||
    (blueStyle!=="self"&&mirrorTerrain)||![0,1,2].includes(variantTeam)||
    !["baseline","siegeWindow","captureCoverage","reserveEarly","opponentPunish","opponentGuard","tempoSiege","tempoScreen","stagedBudget","screenBudget","objectiveDirector","directorNoSave","directorCaptureOnly","directorRouteAware","nearestCapture","directorPathAligned","preemptFort","escortCapturer","laneScout","forecastCapture","forecastSpendWindow","forecastCheapScreen","opportunityAudit","captureTempoInfantry","captureSpendGate","concedeFort","fortTradeReclaim","fortRiskBudget","fortLastLine","fortDefenseValue"].includes(variant)||
    (blueStyle!=="self"&&variantTeam!==0&&variantTeam!==tacticalTeam)||
    (variantTeam===0&&variant!=="baseline"))return null;
  const originalRandom=Math.random,originalVariants=qaBotVariants;
  let state=(seed>>>0)||1;
  Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  try{
   duelStats={seed,blueStyle,difficulty,tacticalTeam,variantTeam,variant,actions:[0,0,0],spent:[0,0,0],
    decisionEvents:[null,{calls:0,urgent:0,energy7:0,giantInHand:0,needFort:0},
     {calls:0,urgent:0,energy7:0,giantInHand:0,needFort:0}],
    decisionAudit:[null,1,2].map(t=>t?{
     calls:0,byPhase:{},byEnergy:{},byCard:{},phaseCards:{},
     tankInHand:0,tankUnaffordable:0,tankFrontlineOpportunity:0,
     tankFundedOpportunity:0,tankDeferredByCheapPlay:0,
     enemyResourceWindow:0,samples:[]}:null),
    cards:[null,{},{}],fortSeconds:[0,0,0],energyIntegral:[0,0,0],maxUnits:[0,0,0],
    fortLossRecords:[],actionLedger:[],counterEpisodes:[]};
   qaBotVariants=[null,"baseline","baseline"];
   if(variantTeam)qaBotVariants[variantTeam]=variant;
   resetWorld();S.phase="battle";S.prep=0;S.speed=1;S.difficulty=difficulty;
   // This switches only the QA map; it does not modify game map or balance.
   if(mirrorTerrain)S.forts.forEach(f=>{f.x=W-f.x;});
   S.botThink=blueStyle==="self"?1000:(tacticalTeam===2?3.1:1000);
   S.botPrepDone=true;
   $("overlay").classList.add("hidden");$("prepBanner").classList.remove("visible");
   // Identical starting resources, shared randomized deck, symmetrical opening.
   const openingHand=S.hand[1].slice(),openingQueue=S.queue[1].slice();
   const open=(team)=>{
    const id=["scout","engineer","archer","infantry"].find(c=>canPay(team,c));
    if(id){
     const openingY=blueStyle==="self"
      ?S.forts.slice().sort((a,b)=>Math.abs(a.x-border(team))-Math.abs(b.x-border(team)))[0].y
      :(team===1?190:205);
     botUse(team,id,limit(border(team)+(team===1?-35:35),35,W-35),openingY);
    }
   };
   open(1);open(2);
   let opponentThink=3.1,tacticalThink=3.1;
   const scriptedTeam=3-tacticalTeam;
   const side=x=>scriptedTeam===1?x:W-x;
   const blueAction=()=>{
    const allies=S.units.filter(u=>u.team===scriptedTeam&&u.hp>0);
    const enemyUnits=S.units.filter(u=>u.team===tacticalTeam&&u.hp>0);
    const raider=enemyUnits.filter(u=>side(u.x)<side(border(scriptedTeam))+255).sort((a,b)=>side(a.x)-side(b.x))[0];
    const fort=S.forts.filter(f=>f.owner!==scriptedTeam).sort((a,b)=>side(a.x)-side(b.x))[0];
    const workers=fort?allies.filter(u=>CLASSES[u.key].capture&&side(u.x)<side(fort.x)+145&&Math.abs(u.y-fort.y)<135):[];
    const need=fort&&workers.length<1;
    const pressure=enemyUnits.some(u=>side(u.x)<490);
    const lane=pressure?raider?.y??330:fort?.y??330;
    const spawn=(id,y,margin=32)=>canPay(scriptedTeam,id)&&botUse(scriptedTeam,id,
     limit(border(scriptedTeam)+(scriptedTeam===1?-margin:margin),35,W-35),limit(y,70,H-70));
    const pack=raider&&enemyUnits.filter(u=>dist(u,raider)<80);
    if(pack?.length>=3&&canPay(scriptedTeam,"barrage")&&
     botUse(scriptedTeam,"barrage",raider.x,raider.y))return true;
    if(pressure){
     if(spawn("suppress",lane,45))return true;
     if(spawn("sentinel",lane,30))return true;
    }
    if(enemyUnits.some(u=>side(u.x)<720&&CLASSES[u.key].flying)&&
      spawn("archer",lane,55))return true;
    if(enemyUnits.some(u=>side(u.x)<700&&CLASSES[u.key].size==="large")&&
      spawn("guardian",lane,35))return true;
    // Controlled opponent that holds publicly observable resources; it
    // still obeys the same card, energy and unit limits as a real player.
    if(blueStyle==="banker"){
     if(pressure&&enemyUnits.length>=2&&spawn("sentinel",lane,30))return true;
     if(S.energy[scriptedTeam]>=7){
      if(spawn("tank",lane,35))return true;
      if(spawn("guardian",lane,35))return true;
      if(need&&spawn("scout",fort.y,32))return true;
      if(spawn("archer",lane,55))return true;
     }
     return false;
    }
    const prior=blueStyle==="rush"?["scout","engineer","drone","archer","infantry"]:
     blueStyle==="fortress"?["sentinel","archer","suppress","engineer","scout","infantry"]:
      ["scout","archer","engineer","suppress","drone","infantry"];
    if(need){
     if(spawn("scout",fort.y,32))return true;
     if(spawn("engineer",fort.y,34))return true;
    }
    if(blueStyle!=="rush"&&S.energy[scriptedTeam]>=7&&spawn("tank",lane,35))return true;
    for(const id of prior)if(spawn(id,id==="engineer"||id==="scout"?fort?.y??lane:lane,
     id==="archer"||id==="suppress"?60:32))return true;
    if(S.energy[scriptedTeam]>=10&&spawn("infantry",lane,35))return true;
    return false;
   };
   const dt=1/30,selfThink=[0,3.1,3.1];
   let opponentEnergyPeak=0,opponentEnergyReady4Seconds=0,
    opponentEnergyReady7Seconds=0;
   // Existing game limits 300 seconds. More than 9000 ticks indicates a regression.
   for(let step=0;step<9100&&S.phase==="battle";step++){
    if(blueStyle==="self"){
     // Both teams use precisely the SAME hard/normal expert policy, resources
     // and thought cadence. The first-to-think side is explicit and paired.
     for(const team of [tacticalTeam,3-tacticalTeam]){
      selfThink[team]-=dt;
      if(selfThink[team]<=0){
       botExpertAction(team);
       const mod=difficulty==="hard"?[1.2,1.9]:[2.5,3.8];
       selfThink[team]=rand(mod[0],mod[1]);
      }
     }
    }else{
     opponentThink-=dt;
     if(opponentThink<=0){
      blueAction();
      const pace=blueStyle==="rush"?2.6:blueStyle==="fortress"?3.4:3.0;
      const factor=scriptedCadence==="fast"?.65:1;
      opponentThink=(pace+Math.random()*.6)*factor;
     }
     // QA-only: when expert plays BLUE, suppress RED's normal botStep.
     if(tacticalTeam===1){
      tacticalThink-=dt;
      if(tacticalThink<=0){
       botExpertAction(1);
       tacticalThink=rand(...(difficulty==="hard"?[1.2,1.9]:[2.5,3.8]));
      }
     }
    }
    // QA observation of actual post-fort-loss castle exposure, without
    // changing any tactical decision or battle simulation.
    const priorOwners=S.forts.map(f=>f.owner);
    tick(dt);
    const losses=duelStats.fortLossRecords;
    for(let i=0;i<S.forts.length;i++){
     const lostTeam=priorOwners[i];
     if(!lostTeam||S.forts[i].owner===lostTeam)continue;
     const face=lostTeam===2?x=>x:x=>W-x;
     const contenders=S.units.filter(u=>u.team!==lostTeam&&u.hp>0&&
      CLASSES[u.key].speed>0);
     const predicted=contenders.reduce((best,u)=>Math.min(best,
      Math.max(0,face(WALL_FACE[lostTeam])-face(u.x)-70)/CLASSES[u.key].speed),Infinity);
     losses.push({team:lostTeam,fortIndex:i,time:S.elapsed,
      ownerAfter:S.forts[i].owner,hpAtLoss:capital(lostTeam).hp,
      predictedCastleETA:Number.isFinite(predicted)?predicted:null,
      firstCastleRaider:null,firstCastleDamage:null,
      regainSeconds:null,actualCastleDamage30:0,observedSeconds:0});
    }
    for(const rec of losses){
     const age=S.elapsed-rec.time;
     if(age>30)continue;
     rec.observedSeconds=Math.max(0,age);
     rec.actualCastleDamage30=Math.max(0,rec.hpAtLoss-capital(rec.team).hp);
     if(rec.firstCastleDamage===null&&rec.actualCastleDamage30>0)
      rec.firstCastleDamage=age;
     if(rec.firstCastleRaider===null&&S.units.some(u=>u.team!==rec.team&&u.hp>0&&
      (rec.team===2?u.x:W-u.x)>1154-180))
      rec.firstCastleRaider=age;
     if(rec.regainSeconds===null&&S.forts[rec.fortIndex].owner===rec.team)
      rec.regainSeconds=age;
    }
    // Post-plan real-engine 15/30s outcome windows; policy never reads this.
    for(const ep of duelStats.counterEpisodes){
     const age=S.elapsed-ep.start;
     if(age<0||age>90+dt)continue;
     const held=S.forts[ep.fortIndex]?.owner===ep.team;
     if(age<=15+dt*.5&&held)ep.fortControl15+=dt;
     if(age<=30+dt*.5&&held)ep.fortControl30+=dt;
     if(age<=60+dt*.5&&held)ep.fortControl60+=dt;
     if(age<=90+dt*.5&&held)ep.fortControl90+=dt;
     if(!held&&ep.firstLoss===null)ep.firstLoss=age;
     if(held&&ep.firstLoss!==null&&ep.firstRecapture===null)ep.firstRecapture=age;
     if(age>=15&&ep.castleDamage15===null){
      ep.castleDamage15=Math.max(0,ep.castleHpStart-capital(ep.team).hp);
      ep.enemyCastleDamage15=Math.max(0,ep.enemyCastleHpStart-capital(3-ep.team).hp);
      ep.ownedAt15=held;
     }
     if(age>=30&&ep.castleDamage30===null){
      ep.castleDamage30=Math.max(0,ep.castleHpStart-capital(ep.team).hp);
      ep.enemyCastleDamage30=Math.max(0,ep.enemyCastleHpStart-capital(3-ep.team).hp);
      ep.ownedAt30=held;
      ep.fortFrontier30=ep.team===1?border(1)-244:1036-border(2);
     }
     if(age>=60&&ep.castleDamage60===null){
      ep.castleDamage60=Math.max(0,ep.castleHpStart-capital(ep.team).hp);
      ep.enemyCastleDamage60=Math.max(0,ep.enemyCastleHpStart-capital(3-ep.team).hp);
      ep.ownedAt60=held;
      ep.fortFrontier60=ep.team===1?border(1)-244:1036-border(2);
     }
     if(age>=90&&ep.castleDamage90===null){
      ep.castleDamage90=Math.max(0,ep.castleHpStart-capital(ep.team).hp);
      ep.enemyCastleDamage90=Math.max(0,ep.enemyCastleHpStart-capital(3-ep.team).hp);
      ep.ownedAt90=held;
      ep.fortFrontier90=ep.team===1?border(1)-244:1036-border(2);
     }
    }
    const opponentEnergy=S.observedEnergy[scriptedTeam];
    opponentEnergyPeak=Math.max(opponentEnergyPeak,opponentEnergy);
    if(opponentEnergy>=4)opponentEnergyReady4Seconds+=dt;
    if(opponentEnergy>=7)opponentEnergyReady7Seconds+=dt;
    for(const f of S.forts)if(f.owner===1||f.owner===2)duelStats.fortSeconds[f.owner]+=dt;
    // Observational QA only: did the specific fort get reclaimed after
    // a real route-checked engineer was deployed? Not proof of causality.
    for(const observedTeam of [1,2]){
     const ev=duelStats.decisionEvents[observedTeam];
     for(const claim of ev.tradeReclaimTargets||[]){
      if(!claim.recovered&&S.forts[claim.index]?.owner===observedTeam){
       claim.recovered=true;
       ev.tradeFortRecovered=(ev.tradeFortRecovered||0)+1;
       const target=S.forts[claim.index];
       if(S.units.some(u=>u.team===observedTeam&&u.key==="engineer"&&
         u.hp>0&&Math.abs(u.x-target.x)<145&&Math.abs(u.y-target.y)<150))
        ev.tradeRecoveredWithEngineerNear=(ev.tradeRecoveredWithEngineerNear||0)+1;
      }
     }
    }
    for(const team of [1,2]){
     duelStats.energyIntegral[team]+=S.energy[team]*dt;
     const count=S.units.filter(u=>u.team===team).length;
     duelStats.maxUnits[team]=Math.max(duelStats.maxUnits[team],count);
    }
    if(!Number.isFinite(S.energy[1])||!Number.isFinite(S.energy[2])||
     S.energy[1]<0||S.energy[2]<0||S.energy[1]>ENERGY_CAP+.0001||
     S.energy[2]>ENERGY_CAP+.0001)throw Error("unfair energy");
   }
   const hp=[null,Math.max(0,capital(1).hp),Math.max(0,capital(2).hp)];
   const winner=hp[1]===hp[2]?0:hp[1]>hp[2]?1:2;
   const elapsed=S.elapsed;
   return {seed,blueStyle,difficulty,tacticalTeam,scriptedTeam,scriptedCadence,mirrorTerrain,
    variantTeam,variant,opponentEnergyPeak,opponentEnergyReady4Seconds,
    opponentEnergyReady7Seconds,decisionEvents:duelStats.decisionEvents.map(x=>x&&{...x}),
    decisionAudit:duelStats.decisionAudit,
    energyEstimated:S.observedEnergy.slice(),energyActual:S.energy.slice(),winner,elapsed,
    initialHand:openingHand,openingQueue:openingQueue,
    castleHp:hp,damage:[null,START_HP-hp[1],START_HP-hp[2]],
    actions:duelStats.actions.slice(),spent:duelStats.spent.slice(),
    cards:duelStats.cards.map(v=>v&&{...v}),
    fortSeconds:duelStats.fortSeconds.slice(),
    fortLossRecords:duelStats.fortLossRecords.map(r=>({...r})),
    counterEpisodes:duelStats.counterEpisodes.map(ep=>{
     const hostile=duelStats.actionLedger.filter(a=>a.team!==ep.team&&a.at>ep.start);
     const prior=t=>hostile.filter(a=>a.at<=ep.start+t+1e-6);
     const a15=prior(15),a30=prior(30),a60=prior(60),a90=prior(90),
      cost=a=>a.reduce((s,x)=>s+x.cost,0);
     return {...ep,fortControl15:+ep.fortControl15.toFixed(2),
      fortControl30:+ep.fortControl30.toFixed(2),
      fortControl60:+ep.fortControl60.toFixed(2),
      fortControl90:+ep.fortControl90.toFixed(2),
      observedSeconds:Math.min(30,Math.max(0,elapsed-ep.start)),
      observedSeconds90:Math.min(90,Math.max(0,elapsed-ep.start)),
      enemyPlays15:ep.castleDamage15===null?null:a15.length,
      enemyPlays30:ep.castleDamage30===null?null:a30.length,
      enemyPlays60:ep.castleDamage60===null?null:a60.length,
      enemyPlays90:ep.castleDamage90===null?null:a90.length,
      enemySpend15:ep.castleDamage15===null?null:cost(a15),
      enemySpend30:ep.castleDamage30===null?null:cost(a30),
      enemySpend60:ep.castleDamage60===null?null:cost(a60),
      enemySpend90:ep.castleDamage90===null?null:cost(a90)};
    }),
    avgEnergy:duelStats.energyIntegral.map((v,i)=>i?v/Math.max(.0001,elapsed):0),
    maxUnits:duelStats.maxUnits.slice(),
    finished:S.phase==="result"};
  }finally{duelStats=null;qaBotVariants=originalVariants;Math.random=originalRandom;}
 },


 // Controlled 7-energy role trial; localhost QA only. Real playCard, unitStep,
 // siege damage, target selection, area damage and 30Hz tick are unchanged.
 runHeavyTrial:(seed,role="siege",kind="heavy",opponent="open",team=1)=>{
  const cases={siege:["open","screen","defender","giant"],
   defense:["swarm","giant","air","ranged"]};
  if(!NET.isSolo||!Number.isInteger(seed)||seed<0||seed>2147483647||
     !cases[role]?.includes(opponent)||!["heavy","alternatives"].includes(kind)||
     ![1,2].includes(team))return null;
  const oldRandom=Math.random,oldDuel=duelStats;
  let state=(seed>>>0)||1;
  Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  try{
   duelStats=null;
   resetWorld();
   S.phase="battle";S.prep=0;S.speed=1;S.difficulty="hard";
   S.botThink=99999;S.botPrepDone=true;
   $("overlay").classList.add("hidden");
   $("prepBanner").classList.remove("visible");
   const foe=3-team;
   // Give the advancing side the closest forward fort; use the same board
   // ownership in both arms of the matched 7-cost comparison.
   const advanced=role==="siege"?team:foe;
   const forward=advanced===1?S.forts[2]:S.forts[0];
   forward.owner=advanced;forward.hp=POST_HP;
   const ours=role==="siege"?
    (kind==="heavy"?["tank"]:["suppress","archer"]):
    (kind==="heavy"?["guardian"]:["sentinel","scout"]);
   const enemyCases=role==="siege"?
    {open:[],screen:["scout","archer"],defender:["sentinel","archer"],giant:["tank"]}:
    {swarm:["infantry","infantry","infantry"],giant:["tank"],
     air:["drone"],ranged:["suppress","archer"]};
   const theirs=enemyCases[opponent];
   const arm=(side,ids)=>{
    S.energy[side]=ids.reduce((n,id)=>n+CATALOG[id].cost,0);
    S.hand[side]=[...new Set(ids.filter(id=>id!=="infantry"))];
    S.queue[side]=[];
    return ids.reduce((n,id)=>n+CATALOG[id].cost,0);
   };
   const cost=arm(team,ours),otherCost=arm(foe,theirs);
   if(cost!==7||otherCost>7)throw Error("role trial invalid cost");
   const actor=side=>role==="siege"?(side===team?"advance":"defend"):
    (side===team?"defend":"advance");
   const spawn=(side,ids)=>{
    const mode=actor(side);
    const x=limit(border(side)+(side===1?-35:35),40,W-40);
    for(let i=0;i<ids.length;i++){
     const y=limit(328+(i-(ids.length-1)/2)*25,70,H-70);
     if(!playCard(side,ids[i],x,y))throw Error("cannot deploy "+side+":"+ids[i]+" at "+x+","+y);
    }
   };
   spawn(team,ours);
   spawn(foe,theirs);
   const tracked=S.units.map(u=>({ref:u,team:u.team,key:u.key,startHp:u.max,
    startX:u.x,life:0,engagedAt:null}));
   const baseHp=[null,capital(1).hp,capital(2).hp];
   const duration=120,dt=1/30;
   let firstContact=null,fortTime=0,steps=0;
   const damageSnapshots={30:null,60:null,90:null};
   const castleFallAt=[null,null,null];
   for(;steps<duration*30&&S.phase==="battle";steps++){
    tick(dt);
    for(const side of [1,2])if(castleFallAt[side]===null&&capital(side).hp<=0)
      castleFallAt[side]=S.elapsed;
    if([900,1800,2700].includes(steps+1)){
     const sec=(steps+1)/30;
     damageSnapshots[sec]=[null,baseHp[1]-capital(1).hp,baseHp[2]-capital(2).hp];
    }
    for(const u of tracked)if(u.ref.hp>0)u.life+=dt;
    if(S.forts.some(f=>f.owner===team))fortTime+=dt;
    if(firstContact===null&&(tracked.some(u=>u.ref.hp<u.startHp)||
      capital(1).hp<baseHp[1]||capital(2).hp<baseHp[2]))firstContact=S.elapsed;
    if(!Number.isFinite(S.energy[1])||!Number.isFinite(S.energy[2])||
      S.energy[1]<0||S.energy[2]<0||S.energy[1]>ENERGY_CAP+.0001||
      S.energy[2]>ENERGY_CAP+.0001)throw Error("energy bounds");
   }
   for(const sec of [30,60,90])if(damageSnapshots[sec]===null)
    damageSnapshots[sec]=[null,baseHp[1]-capital(1).hp,baseHp[2]-capital(2).hp];
   const members=(side)=>tracked.filter(u=>u.team===side);
   const metrics=side=>{
    const own=members(side),enemies=members(3-side);
    return {deployed:own.length,alive:own.filter(u=>u.ref.hp>0).length,
     survivalSeconds:own.reduce((s,u)=>s+u.life,0),
     survivalSecondsPerUnit:own.reduce((s,u)=>s+u.life,0)/Math.max(1,own.length),
     remainingUnitHp:own.reduce((s,u)=>s+Math.max(0,u.ref.hp),0),
     enemyUnitDamage:enemies.reduce((s,u)=>s+Math.min(u.startHp,
       Math.max(0,u.startHp-u.ref.hp)),0),
     enemyUnitsDefeated:enemies.filter(u=>u.ref.hp<=0).length,
     enemyCastleDamage:baseHp[3-side]-capital(3-side).hp,
     enemyCastleAt30:damageSnapshots[30][3-side],
     enemyCastleAt60:damageSnapshots[60][3-side],
     enemyCastleAt90:damageSnapshots[90][3-side],
     enemyCastleFallAt:castleFallAt[3-side],
     ownCastleAt30:damageSnapshots[30][side],
     ownCastleAt60:damageSnapshots[60][side],
     ownCastleDamage:baseHp[side]-capital(side).hp,
     progress:own.reduce((s,u)=>s+(side===1?u.ref.x-u.startX:u.startX-u.ref.x),0),
     remainingEnergy:S.energy[side]};
   };
   const stat=metrics(team);
   return {seed,role,kind,opponent,team,spent:cost,enemySpent:otherCost,
    cards:ours,enemyCards:theirs,firstContact,elapsed:S.elapsed,
    stats:stat,opponentStats:metrics(foe),
    forts:S.forts.map(f=>({x:f.x,owner:f.owner,hp:f.hp})),
    finished:steps>0,seeded:true};
  }finally{duelStats=oldDuel;Math.random=oldRandom;}
 },

 setBotScenario:spec=>{
  if(!NET.isSolo||!spec||!Array.isArray(spec.enemies)||!Array.isArray(spec.hand))return false;
  resetWorld();S.phase="battle";S.botThink=999;S.prep=0;
  S.difficulty=spec.difficulty||"hard";S.elapsed=spec.elapsed??80;
  S.energy=[0,spec.enemyActualEnergy??spec.enemyEnergy??8,spec.energy??8];
  S.observedEnergy=[0,spec.enemyEnergy??8,spec.energy??8];
  qaBotVariants=[null,"baseline",spec.variant||"baseline"];
  S.hand[2]=spec.hand.slice();S.queue[2]=[];
  if(Array.isArray(spec.fortOwners))S.forts.forEach((f,i)=>f.owner=spec.fortOwners[i]||0);
  const place=(team,u)=>{
   const d=CLASSES[u.key],x=u.x,y=u.y;
   if(!d)throw Error("unknown class "+u.key);
   S.units.push({uid:++S.uid,key:u.key,team,x,y,anchorX:x,anchorY:y,homeY:y,
    hp:d.hp,max:d.hp,attack:0,flash:0,attackAnim:0,attackAnimMax:MOTION.attack[u.key],
    windup:0,hitAt:-100,spawnAt:-100,spawnDuration:.5,lock:null,walkPhase:0,
    walking:u.walking??false,drift:0,facing:u.facing??(team===1?0:Math.PI)});
  };
  spec.enemies.forEach(u=>place(1,u));(spec.allies||[]).forEach(u=>place(2,u));
  botLastAction=null;updateHUD();return true;
 },
 progressBotScenario:spec=>{
  // Localhost-QA-only staged exercise of a held reserve. No public UI path.
  if(!NET.isSolo||S.phase!=="battle"||!spec||
   !Number.isFinite(spec.elapsed)||spec.elapsed<S.elapsed||spec.elapsed>300||
   !Number.isFinite(spec.energy)||spec.energy<0||spec.energy>ENERGY_CAP||
   !Array.isArray(spec.fortOwners)||spec.fortOwners.length!==3||
   spec.fortOwners.some(owner=>![0,1,2].includes(owner)))return false;
  S.elapsed=spec.elapsed;S.seconds=MATCH-S.elapsed;
  S.energy[2]=spec.energy;
  S.observedEnergy[2]=spec.energy;
  S.forts.forEach((f,i)=>{f.owner=spec.fortOwners[i];f.hp=POST_HP;});
  updateHUD();
  return true;
 },
 // Localhost-only deterministic 30Hz counterfactual from an identical
 // threatened-fort scene. This is an isolation test, not a full game winner.
 simulateFortDecision:(seed,spec,variant="baseline",duration=45)=>{
  if(!NET.isSolo||!Number.isInteger(seed)||seed<1||seed>2147483647||
   !["baseline","concedeFort","fortTradeReclaim","fortRiskBudget","fortLastLine","fortDefenseValue"].includes(variant)||
   !spec||!Array.isArray(spec.hand)||spec.hand.length!==4||
   !spec.hand.every(id=>DECK_IDS.includes(id))||
   !Array.isArray(spec.enemies)||spec.enemies.length>15||
   !spec.enemies.every(u=>CLASSES[u.key]&&Number.isFinite(u.x)&&Number.isFinite(u.y))||
   !Array.isArray(spec.fortOwners)||spec.fortOwners.length!==3||
   spec.fortOwners.some(v=>![0,1,2].includes(v))||
   (spec.allies&&!Array.isArray(spec.allies))||
   !Number.isFinite(spec.energy)||spec.energy<0||spec.energy>ENERGY_CAP||
   !Number.isFinite(duration)||duration<5||duration>60)return null;
  const oldRandom=Math.random,oldStats=duelStats,oldVariants=qaBotVariants;
  let state=seed>>>0;
  Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  try{
   duelStats=null;
   if(!window.__shokokuQa.setBotScenario({...spec,variant}))return null;
   S.seconds=MATCH-S.elapsed;S.botThink=99999;
   const fortIndex=spec.fortOwners.findIndex(v=>v===2);
   if(fortIndex<0)return null;
   const owned=S.forts.map(f=>f.owner);
   const startHp=capital(2).hp,startEnemyHp=capital(1).hp;
   const dt=1/30,steps=Math.round(duration/dt);
   let controlled=0,lost=false,recaptured=false,enemyEntered=false;
   let firstCastleDamage=null,firstCastleRaider=null,actual=0,peakOwnUnits=0;
   const actions=[],snapshots=[];
   for(let step=0;step<steps&&S.phase==="battle";step++){
    if(step%45===0){
     const initial=S.energy[2];botLastAction=null;botExpertAction(2);
     if(initial>S.energy[2]+.001)
      actions.push({time:+(step*dt).toFixed(2),card:botLastAction?.id||null,
       cost:+(initial-S.energy[2]).toFixed(2)});
    }
    tick(dt);
    actual++;
    if(S.forts[fortIndex].owner===2)controlled+=dt;
    if(S.forts[fortIndex].owner!==2)lost=true;
    if(lost&&S.forts[fortIndex].owner===2)recaptured=true;
    if(S.units.some(u=>u.team===1&&u.hp>0&&u.x>WALL_FACE[2]-180)){
     enemyEntered=true;
     if(firstCastleRaider===null)firstCastleRaider=+(step*dt).toFixed(2);
    }
    if(firstCastleDamage===null&&capital(2).hp<startHp-.001)
     firstCastleDamage=+(step*dt).toFixed(2);
    peakOwnUnits=Math.max(peakOwnUnits,S.units.filter(u=>u.team===2&&u.hp>0).length);
    if(step%300===299)snapshots.push({at:+((step+1)*dt).toFixed(1),
     hp:capital(2).hp,fortOwner:S.forts[fortIndex].owner,
     energy:+S.energy[2].toFixed(2)});
    for(const t of [1,2])if(!Number.isFinite(S.energy[t])||
     S.energy[t]<0||S.energy[t]>ENERGY_CAP+.001)throw Error("counterfactual invalid economy");
   }
   return {seed,variant,duration,elapsed:actual*dt,
    openingFortOwners:owned,fortIndex,controlledSeconds:controlled,lost,recaptured,
    castleDamage:startHp-capital(2).hp,enemyCastleDamage:startEnemyHp-capital(1).hp,
    ownCastleHp:capital(2).hp,enemyEntered,firstCastleRaider,firstCastleDamage,
    ownLivingUnits:S.units.filter(u=>u.team===2&&u.hp>0).length,
    peakOwnUnits,energy:S.energy[2],actions,snapshots,seeded:true};
  }finally{duelStats=oldStats;qaBotVariants=oldVariants;Math.random=oldRandom;}
 },
 // Paired local-only opening-spend experiment. Identical visible units,
 // resources and random seed; only the first emergency purchase differs.
 simulateDefenseOpening:(seed,spec,choice="infantryNow",duration=50)=>{
  if(!NET.isSolo||!Number.isInteger(seed)||seed<1||seed>2147483647||
   !["baseline","infantryNow","skipFirst","saveFor4"].includes(choice)||
   !spec||!Array.isArray(spec.hand)||spec.hand.length!==4||
   !spec.hand.every(id=>DECK_IDS.includes(id))||
   !Array.isArray(spec.enemies)||spec.enemies.length>15||
   !spec.enemies.every(u=>CLASSES[u.key]&&Number.isFinite(u.x)&&Number.isFinite(u.y))||
   !Array.isArray(spec.fortOwners)||spec.fortOwners.length!==3||
   spec.fortOwners.some(v=>![0,1,2].includes(v))||
   (spec.allies&&!Array.isArray(spec.allies))||
   !Number.isFinite(spec.energy)||spec.energy<2||spec.energy>=4||
   !["engineer","sentinel"].includes(spec.reserve)||
   !Number.isFinite(duration)||duration<10||duration>60)return null;
  const oldRandom=Math.random,oldDuel=duelStats,oldVariants=qaBotVariants,
   oldAudit=qaOpeningAudit;
  let state=seed>>>0;
  Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  try{
   duelStats=null;qaOpeningAudit=null;
   if(!window.__shokokuQa.setBotScenario({...spec,variant:"baseline"}))return null;
   S.seconds=MATCH-S.elapsed;S.botThink=99999;
   const firstFort=spec.fortOwners.findIndex(v=>v===2);
   if(firstFort<0)return null;
   const y=S.forts[firstFort].y,originalOwners=S.forts.map(f=>f.owner),
    initially=S.units.filter(u=>u.team===1&&u.hp>0).map(u=>u.uid),
    castleStart=capital(2).hp;
   const stepDt=1/30,steps=Math.round(duration/stepDt);
   let firstAction=null,firstCost=0,firstTime=null,spentOpening=0,
    reservePaid=false,openingCount=0,controlled=0,lost=false,
    recaptured=false,enemyEntered=false,initialThreatsAlive=0,
    firstCastleHit=null,firstFortLoss=null;
   const actions=[],snapshots=[];
   const stamp=step=>+(step*stepDt).toFixed(2);
   const spawnX=()=>limit(border(2)+35,40,W-40);
   const spend=(id,time)=>{
    const before=S.energy[2],uidBefore=S.uid;
    botLastAction=null;
    const ok=botUse(2,id,spawnX(),y);
    if(ok){
     const cost=before-S.energy[2];
     actions.push({time,card:id,cost:+cost.toFixed(2)});
     if(firstTime===null){
      firstTime=time;firstAction=id;firstCost=cost;
      if(id==="infantry"){
       qaOpeningAudit={uids:new Set(S.units.filter(u=>u.team===2&&u.uid>uidBefore)
        .map(u=>u.uid)),attacks:0,unitHits:0,unitDamage:0,
        fortHits:0,fortProgress:0,castleHits:0};
       openingCount=qaOpeningAudit.uids.size;
      }
     }
     return true;
    }
    return false;
   };
   for(let step=0;step<steps&&S.phase==="battle";step++){
    if(step===0){
     if(choice==="baseline"){
      const initial=S.energy[2],firstUid=S.uid;
      botLastAction=null;botExpertAction(2);
      if(initial>S.energy[2]+.001){
       const id=botLastAction?.id||null,cost=initial-S.energy[2];
       actions.push({time:0,card:id,cost:+cost.toFixed(2)});
       firstAction=id;firstCost=cost;firstTime=0;
       if(id==="infantry"){
        qaOpeningAudit={uids:new Set(S.units.filter(u=>u.team===2&&u.uid>firstUid).map(u=>u.uid)),
         attacks:0,unitHits:0,unitDamage:0,fortHits:0,fortProgress:0,castleHits:0};
        openingCount=qaOpeningAudit.uids.size;
       }
      }
     }else if(choice==="infantryNow"){
      spend("infantry",0);
     }
    }else if(choice==="saveFor4"&&!reservePaid){
     if(canPay(2,spec.reserve)){
      if(spend(spec.reserve,stamp(step)))reservePaid=true;
     }
    }else if(step%45===0){
     const before=S.energy[2],uidBefore=S.uid;
     botLastAction=null;botExpertAction(2);
     if(before>S.energy[2]+.001){
      const id=botLastAction?.id||null,cost=before-S.energy[2],now=stamp(step);
      actions.push({time:now,card:id,cost:+cost.toFixed(2)});
      if(firstTime===null){
       firstTime=now;firstAction=id;firstCost=cost;
       if(id==="infantry"){
        qaOpeningAudit={uids:new Set(S.units.filter(u=>u.team===2&&u.uid>uidBefore).map(u=>u.uid)),
         attacks:0,unitHits:0,unitDamage:0,fortHits:0,fortProgress:0,castleHits:0};
        openingCount=qaOpeningAudit.uids.size;
       }
      }
     }
    }
    // In a reserve-only opening, baseline decisions resume next regular
    // cadence tick. A skipped first turn resumes at 1.5s.
    tick(stepDt);
    if(S.forts[firstFort].owner===2)controlled+=stepDt;
    if(S.forts[firstFort].owner!==2){
     if(!lost)firstFortLoss=stamp(step);
     lost=true;
    }
    if(lost&&S.forts[firstFort].owner===2)recaptured=true;
    if(S.units.some(u=>u.team===1&&u.hp>0&&u.x>WALL_FACE[2]-180))enemyEntered=true;
    if(firstCastleHit===null&&capital(2).hp<castleStart-.001)firstCastleHit=stamp(step);
    if(step%300===299)snapshots.push({at:stamp(step+1),hp:capital(2).hp,
     energy:+S.energy[2].toFixed(3),owner:S.forts[firstFort].owner});
    if(S.energy[2]<-1e-6||S.energy[2]>ENERGY_CAP+1e-5)throw Error("illegal energy");
   }
   const audited=qaOpeningAudit,initialUnits=S.units.filter(u=>audited?.uids.has(u.uid));
   initialThreatsAlive=S.units.filter(u=>initially.includes(u.uid)&&u.hp>0).length;
   return {seed,choice,elapsed:S.elapsed-spec.elapsed,firstAction,firstTime,firstCost,
    openingUnits:openingCount,openingStillAlive:initialUnits.filter(u=>u.hp>0).length,
    initialThreatsAlive,initialThreatsTotal:initially.length,
    openingCombat:audited?{attacks:audited.attacks,unitHits:audited.unitHits,
     unitDamage:+audited.unitDamage.toFixed(2),fortHits:audited.fortHits,
     fortProgress:audited.fortProgress,castleHits:audited.castleHits}:null,
    fortIndex:firstFort,openingOwners:originalOwners,
    castleDamage:castleStart-capital(2).hp,fortOwnedSeconds:controlled,
    lost,recaptured,firstFortLoss,firstCastleHit,enemyEntered,
    energy:S.energy[2],actions,snapshots,seeded:true};
  }finally{qaOpeningAudit=oldAudit;duelStats=oldDuel;qaBotVariants=oldVariants;Math.random=oldRandom;}
 },
 runBotOnce:()=>{
  if(!NET.isSolo||S.phase!=="battle")return null;
  const initial=S.energy[2],acted=botExpertAction();
  return {acted,action:botLastAction,spent:initial-S.energy[2],
    remaining:S.energy[2],opponentEstimated:S.observedEnergy[1],
    incoming:S.spells.incoming.length,wards:S.spells.zones.length,
    units:S.units.length};
 },

 setTerrainCache:enabled=>{terrainCacheEnabled=!!enabled;},
 setDrawCulling:on=>{drawCullingEnabled=!!on;},
 setDenseSpriteCache:on=>{useDenseSpriteCache=!!on;},
 grandState:()=>({battleReady:grandInBattle,enabled:grandEffectEnabled,
  active:grandArrival&&{...grandArrival,age:performance.now()-grandArrival.started},seen:grandSeen.size}),
 setGrandEffect:on=>{grandEffectEnabled=!!on;},
 prepareGrandTest:()=>{
  if(!NET.isSolo)return false;
  S.phase="battle";S.botThink=999;S.prep=0;S.energy=[0,12,12];
  $("prepBanner").classList.remove("visible");
  return true;
 },
 spawnGrandTest:(team,key)=>{
  if(!NET.isSolo||S.phase!=="battle"||![1,2].includes(team)||
     !["guardian","tank"].includes(key))return false;
  S.energy[team]=12;S.left[team][key]=Math.max(1,S.left[team][key]||0);
  if(!S.hand[team].includes(key))S.hand[team][0]=key;
  return deploy(team,key,team===1?155:1125,330);
 },
 spriteStats:()=>({cached:denseSpritesRendered,full:fullSpritesRendered,
  tiles:denseSpriteCache.size,active:useDenseSpriteCache,broken:denseCacheBroken}),
 setCamera:(x,y)=>cameraTo(x,y),
 setFortTest:(owners,contest=false)=>{
  if(!NET.isSolo||!Array.isArray(owners)||owners.length!==3||
    owners.some(owner=>![0,1,2].includes(owner)))return false;
  S.forts.forEach((f,i)=>{f.owner=owners[i];f.hp=POST_HP;});
  if(contest){
   const f=S.forts[1],d=CLASSES.infantry;
   for(const team of [1,2]){
    const x=f.x+(team===1?-25:25);
    S.units.push({uid:++S.uid,key:"infantry",team,x,y:f.y,anchorX:x,anchorY:f.y,
     homeY:f.y,hp:d.hp,max:d.hp,attack:20,attackAnim:0,attackAnimMax:.5,
     flash:0,spawnAt:-100,spawnDuration:.5,drift:0,walking:false,walkPhase:0,facing:team===1?0:Math.PI});
   }
  }
  updateFortNavigation();return true;
 },
 seedMassBattle:()=>{
  if(!NET.isSolo)return false;
  resetWorld();S.phase="battle";S.prep=0;S.elapsed=120;S.seconds=180;S.botThink=999;
  S.energy=[0,12,12];S.cam={x:330,y:330,tx:330,ty:330,moving:false};clampCamera();
  const keys=["infantry","archer","scout","engineer","sentinel","suppress","guardian","drone","tank"];
  for(const team of [1,2])for(let i=0;i<65;i++){
   const id=keys[i%keys.length],d=CLASSES[id],x=team===1?250+(i%13)*31:1180-(i%13)*31,y=125+Math.floor(i/13)*94;
   S.units.push({uid:++S.uid,key:id,team,x,y,anchorX:x,anchorY:y,homeY:y,
    hp:d.hp,max:d.hp,attack:.5,facing:team===1?0:Math.PI,flash:0,
    attackAnim:0,attackAnimMax:MOTION.attack[id],windup:0,hitAt:-100,
    spawnAt:-100,spawnDuration:.5,lock:null,walkPhase:i*.11,walking:true,drift:i*.25});
  }
  $("overlay").classList.add("hidden");$("prepBanner").classList.remove("visible");
  buildCards();updateHUD();return true;
 },
 setDpr:d=>{
  if(!Number.isFinite(d)||d<.6||d>2)return;
  S.view.dpr=d;cv.width=Math.round(S.view.w*d);cv.height=Math.round(S.view.h*d);
 },
 quality:()=>({tabletDprCap,qualityMeasured,qualityFrames}),
 snapshot:()=>({
  phase:S.phase,selected:S.selected,prep:S.prep,elapsed:S.elapsed,
  energy:S.energy.slice(),camera:{x:S.cam.x,y:S.cam.y},
  view:{...S.view},hand:S.hand.map(h=>h&&h.slice()),
  units:S.units.map(u=>({uid:u.uid,team:u.team,key:u.key,x:u.x,y:u.y}))
 })};
}
start();
})();