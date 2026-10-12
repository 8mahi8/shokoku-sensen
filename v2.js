"use strict";
/* 小国戦線 II — cards + capture outposts + shared deployment line.
   Offline BOT alpha; all balance values intentionally provisional. */
(() => {
const $ = id => document.getElementById(id);
const canvas=$("battle"), g=canvas.getContext("2d");
const mini=$("map"), mg=mini.getContext("2d");
const area=$("arena"), cardHolder=$("cards");
const W=990,H=1920,LANES=[165,495,825],CAPHP=4500,POSTHP=14;
// Base gameplay pace. Camera movement and touch input stay instant.
const PACE={move:.52,attackInterval:1.45,damage:.86,baseAttackInterval:1.55,baseDamage:29};
const MATCH_SECONDS=420, FINAL_SURGE_SECONDS=120;
const BLUE="#74d4ff",RED="#ff8294",NEUTRAL="#e9d199",INK="#e1f3ed";
const C={
 infantry:{name:"歩兵分隊",icon:"♟",cost:3,count:4,hp:92,dmg:14,speed:86,range:43,rate:.92,sight:170,r:10,mode:"normal",target:"ground",capture:true,note:"占領・4体",armor:false},
 scout:{name:"斥候ライダー",icon:"➤",cost:3,count:1,hp:150,dmg:13,speed:154,range:43,rate:.88,sight:170,r:15,mode:"objective",target:"ground",capture:true,note:"高速・奇襲",armor:false},
 archer:{name:"魔導射手",icon:"✧",cost:3,count:3,hp:67,dmg:21,speed:74,range:198,rate:1.25,sight:257,r:10,mode:"normal",target:"both",capture:false,note:"対地・対空",armor:false},
 suppress:{name:"制圧機兵",icon:"✳",cost:4,count:1,hp:265,dmg:39,speed:66,range:138,rate:1.48,sight:215,r:18,mode:"normal",target:"ground",splash:51,capture:false,note:"対集団・範囲",armor:true},
 golem:{name:"守護ゴーレム",icon:"⬡",cost:4,count:1,hp:520,dmg:29,speed:61,range:48,rate:1.10,sight:200,r:21,mode:"guard",target:"ground",capture:false,note:"迎撃・高耐久",armor:true},
 breaker:{name:"破甲術師",icon:"⚡",cost:4,count:2,hp:85,dmg:35,speed:70,range:178,rate:1.55,sight:240,r:10,mode:"normal",target:"ground",antiArmor:2.3,capture:false,note:"対重装甲",armor:false},
 drone:{name:"浮遊ドローン",icon:"✦",cost:4,count:2,hp:122,dmg:17,speed:124,range:126,rate:.85,sight:190,r:14,mode:"normal",target:"ground",flying:true,capture:false,note:"飛行・進撃",armor:false},
 tank:{name:"魔導重戦車",icon:"▰",cost:6,count:1,hp:665,dmg:53,speed:60,range:128,rate:1.55,sight:213,r:23,mode:"normal",target:"ground",splash:33,capture:false,note:"重装甲・突破",armor:true}
};
const ids=Object.keys(C);
const state={playing:false,paused:false,over:false,seconds:MATCH_SECONDS,tick:0,difficulty:"easy",speed:.75,
 energy:[0,7,4],hands:[null,null,null],units:[],posts:[],capitals:[],shots:[],uid:0,
 cameraY:1430,scale:1,selected:null,drag:null,pan:null,noticeTime:0,botDelay:1.8,
 viewW:0,viewH:0,pxRatio:1,uiTimer:0,lastTick:0};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const random=(a,b)=>a+Math.random()*(b-a);
const side=t=>t===1?BLUE:t===2?RED:NEUTRAL;
const laneOf=x=>clamp(Math.floor(x/(W/3)),0,2);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const time=n=>{n=Math.max(0,Math.ceil(n));return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0")};
const diffRate=()=>state.difficulty==="easy"?.55:state.difficulty==="hard"?1.2:1;
const base=(team)=>state.capitals.find(c=>c.team===team);
const postsOwned=(team)=>state.posts.filter(p=>p.owner===team);
const summonLine=(team)=>{
 let line=team===1?1550:370;
 for(const p of state.posts)if(p.owner===team){
  if(team===1)line=Math.min(line,p.y-85);
  else line=Math.max(line,p.y+85);
 }
 return clamp(line,140,H-140);
};
function validSpawn(team,x,y){
 if(x<24||x>W-24||y<46||y>H-46)return false;
 return team===1?y>=summonLine(1):y<=summonLine(2);
}
function makeDeck(){
 const deck=ids.slice();
 for(let j=deck.length-1;j>0;j--){let k=Math.floor(Math.random()*(j+1));[deck[j],deck[k]]=[deck[k],deck[j]];}
 // Keep at least one early capture card so the first match gets going.
 if(!deck.slice(0,4).some(id=>C[id].capture)){
  const k=deck.findIndex(id=>C[id].capture);
  [deck[0],deck[k]]=[deck[k],deck[0]];
 }
 return {hand:deck.slice(0,4),queue:deck.slice(4)};
}
function initialize(){
 state.playing=true;state.paused=false;state.over=false;state.seconds=MATCH_SECONDS;state.tick=0;state.lastTick=0;
 state.energy=[0,7,4];state.units=[];state.uid=0;state.shots=[];state.selected=null;state.drag=null;
 state.hands=[null,makeDeck(),makeDeck()];
 state.posts=[{x:165,y:490,owner:0,hp:POSTHP},{x:495,y:790,owner:0,hp:POSTHP},{x:495,y:1130,owner:0,hp:POSTHP},{x:825,y:1430,owner:0,hp:POSTHP}];
 state.capitals=[{x:495,y:1800,team:1,hp:CAPHP,max:CAPHP,cool:0},{x:495,y:120,team:2,hp:CAPHP,max:CAPHP,cool:0}];
 state.botDelay=state.difficulty==="easy"?15:1.1;state.cameraY=1415;state.uiTimer=0;state.noticeTime=0;
 $("modal").classList.add("hidden");$("pause").textContent="Ⅱ 停止";
 $("begin").textContent="BOT戦を始める";
 displayCards();updateHud();message("前哨基地を占領して、召喚ラインを押し上げよう！");
}
function message(t){
 $("frontAlert").textContent=t;$("frontAlert").classList.add("on");state.noticeTime=performance.now()+2800;
}
function playCard(team,index,x,y){
 if(!state.playing||state.paused||state.over)return false;
 const pile=state.hands[team];
 if(!pile||index<0||index>=pile.hand.length)return false;
 const id=pile.hand[index],def=C[id];
 if(state.energy[team]<def.cost||!validSpawn(team,x,y))return false;
 if(state.units.filter(u=>u.team===team).length+def.count>100){if(team===1)message("部隊数上限に達しています");return false;}
 state.energy[team]-=def.cost;
 pile.hand.splice(index,1);
 pile.hand.push(pile.queue.shift());
 pile.queue.push(id);
 for(let i=0;i<def.count;i++){
  const offset=(i-(def.count-1)/2)*23;
  const px=clamp(x+offset,25,W-25);
  const py=clamp(y+Math.abs(offset)*.32*(team===1?1:-1),50,H-50);
  state.units.push({id:++state.uid,key:id,team,x:px,y:py,anchorX:px,anchorY:py,lane:laneOf(x),
    hp:def.hp,max:def.hp,atk:random(.15,.8),facing:team===1?-Math.PI/2:Math.PI/2, bob:random(0,6),hitFlash:0});
 }
 if(team===1){state.selected=null;displayCards();}
 return true;
}
function findPostGoal(u){
 const d=C[u.key];if(!d.capture)return null;
 const same=state.posts.filter(p=>p.owner!==u.team&&Math.abs(p.x-LANES[u.lane])<=100);
 const ahead=same.filter(p=>u.team===1?p.y<u.y+85:p.y>u.y-85);
 if(!ahead.length)return null;
 if(d.mode==="objective")return ahead.reduce((a,b)=>u.team===1?(a.y<b.y?a:b):(a.y>b.y?a:b));
 return ahead.reduce((a,b)=>Math.abs(a.y-u.y)<Math.abs(b.y-u.y)?a:b);
}
function objectiveFor(u){
 const def=C[u.key],fort=base(u.team===1?2:1);
 const post=findPostGoal(u);
 if(post&&(def.mode==="objective"||distance(u,post)<260))return {kind:"post",ref:post,x:post.x,y:post.y};
 if(u.team===1){
  if(u.y>530)return {kind:"point",x:LANES[u.lane],y:420};
  return {kind:"point",x:fort.x,y:fort.y};
 }
 if(u.y<1390)return {kind:"point",x:LANES[u.lane],y:1510};
 return {kind:"point",x:fort.x,y:fort.y};
}
function closestEnemy(u){
 const d=C[u.key],radius=d.mode==="guard"?220:d.sight;
 let candidate=null,score=Infinity;
 for(const v of state.units){
  if(v.team===u.team||v.hp<=0)continue;
  if(C[v.key].flying&&d.target!=="both"&&d.target!=="air")continue;
  if(!C[v.key].flying&&d.target==="air")continue;
  const dst=distance(u,v);
  if(dst>radius)continue;
  if(d.mode==="guard"&&Math.hypot(v.x-u.anchorX,v.y-u.anchorY)>240)continue;
  const heavyBias=d.antiArmor&&C[v.key].armor?-65:0;
  const flightBias=d.target==="both"&&C[v.key].flying?-14:0;
  const points=dst+heavyBias+flightBias;
  if(points<score){score=points;candidate={kind:"unit",ref:v,x:v.x,y:v.y,r:C[v.key].r};}
 }
 const enemyBase=base(u.team===1?2:1);
 const db=distance(u,enemyBase);
 if(db<d.sight+65&&db-56<score){candidate={kind:"capital",ref:enemyBase,x:enemyBase.x,y:enemyBase.y,r:57};}
 return candidate;
}
function approach(u,x,y,dt,factor=1){
 const dx=x-u.x,dy=y-u.y,dd=Math.hypot(dx,dy);
 if(dd<.4)return;
 const amount=Math.min(dd,C[u.key].speed*PACE.move*dt*factor);
 u.x=clamp(u.x+dx/dd*amount,18,W-18);
 u.y=clamp(u.y+dy/dd*amount,25,H-25);
 u.facing=Math.atan2(dy,dx);
}
function hitUnit(v,value,attacker){
 const a=C[attacker.key],b=C[v.key];
 const mitigation=b.armor&&!a.antiArmor?(a.dmg<=21?.72:.86):1;
 const armorBonus=b.armor&&a.antiArmor?a.antiArmor:1;
 const final=Math.max(1,value*PACE.damage*mitigation*armorBonus);
 v.hp-=final;v.hitFlash=.13;
}
function strike(u,target){
 const d=C[u.key],obj=target.ref;
 u.atk=d.rate*PACE.attackInterval;
 if(target.kind==="post"){
  if(!d.capture||obj.owner===u.team)return;
  obj.hp=Math.max(0,obj.hp-1);
  state.shots.push({x:obj.x,y:obj.y,life:.22,max:.22,r:17,team:u.team});
  if(obj.hp<=0){
   obj.owner=u.team;obj.hp=POSTHP;
   if(u.team===1)message("前哨基地を確保！ 3レーンの召喚ラインが前進");
   else message("敵が前哨基地を奪取！ 召喚ラインに注意");
  }
  return;
 }
 if(target.kind==="capital"){
  obj.hp-=d.dmg*PACE.damage;obj.hp=Math.max(0,obj.hp);
  state.shots.push({x:obj.x,y:obj.y,life:.22,max:.22,r:40,team:u.team});
  if(obj.hp<=0)finish(u.team===1?"win":"lose","首都が破壊された！");
  return;
 }
 if(target.kind==="unit"){
  if(obj.hp<=0)return;
  hitUnit(obj,d.dmg,u);
  if(d.splash){
   for(const enemy of state.units){
    if(enemy===obj||enemy.hp<=0||enemy.team===u.team||C[enemy.key].flying)continue;
    if(Math.hypot(enemy.x-obj.x,enemy.y-obj.y)<d.splash)hitUnit(enemy,d.dmg*.60,u);
   }
  }
  state.shots.push({x:obj.x,y:obj.y,life:.19,max:.19,r:d.splash||12,team:u.team});
 }
}
function unitsStep(dt){
 for(const u of state.units){
  if(u.hp<=0)continue;
  const d=C[u.key];
  u.atk=Math.max(0,u.atk-dt);u.hitFlash=Math.max(0,u.hitFlash-dt);
  let foe=closestEnemy(u),post=findPostGoal(u),pDist=post?distance(u,post):Infinity;
  if(d.mode==="guard"){
   if(foe){
    if(distance(u,foe)<=d.range+foe.r){u.facing=Math.atan2(foe.y-u.y,foe.x-u.x);if(u.atk<=0)strike(u,foe);}
    else approach(u,foe.x,foe.y,dt);
   }else if(Math.hypot(u.x-u.anchorX,u.y-u.anchorY)>12)approach(u,u.anchorX,u.anchorY,dt);
   continue;
  }
  // Objective-focused scouts mostly evade fights and prioritize capturable posts.
  if(d.mode==="objective"){
   if(post){
    if(pDist<=d.range+27){if(u.atk<=0)strike(u,{kind:"post",ref:post,x:post.x,y:post.y});}
    else approach(u,post.x,post.y,dt);
   }else if(foe&&foe.kind==="capital"){
    if(distance(u,foe)<=d.range+foe.r){if(u.atk<=0)strike(u,foe);}else approach(u,foe.x,foe.y,dt);
   }else{
    const target=objectiveFor(u);approach(u,target.x,target.y,dt);
   }
   continue;
  }
  if(foe){
   if(distance(u,foe)<=d.range+foe.r){u.facing=Math.atan2(foe.y-u.y,foe.x-u.x);if(u.atk<=0)strike(u,foe);}
   else approach(u,foe.x,foe.y,dt);
  }else if(post&&pDist<=240){
   if(pDist<=d.range+26){if(u.atk<=0)strike(u,{kind:"post",ref:post,x:post.x,y:post.y});}
   else approach(u,post.x,post.y,dt);
  }else{
   const obj=objectiveFor(u);
   if(obj.kind==="point"&&obj.y===base(u.team===1?2:1).y&&distance(u,obj)<d.range+53){
    if(u.atk<=0)strike(u,{kind:"capital",ref:base(u.team===1?2:1),x:obj.x,y:obj.y});
   }else approach(u,obj.x,obj.y,dt);
  }
 }
 state.units=state.units.filter(u=>u.hp>0);
}
function capitalStep(dt){
 for(const c of state.capitals){
  c.cool=Math.max(0,c.cool-dt);if(c.cool>0||c.hp<=0)continue;
  const targets=state.units.filter(u=>u.team!==c.team&&u.hp>0&&distance(u,c)<205);
  if(!targets.length)continue;
  targets.sort((a,b)=>distance(a,c)-distance(b,c));
  targets[0].hp-=PACE.baseDamage;targets[0].hitFlash=.2;c.cool=PACE.baseAttackInterval;
  state.shots.push({x:targets[0].x,y:targets[0].y,life:.22,max:.22,r:21,team:c.team});
 }
 for(const s of state.shots)s.life-=dt;
 state.shots=state.shots.filter(s=>s.life>0);
}
function botStep(dt){
 state.botDelay-=dt;if(state.botDelay>0)return;
 const team=2,pile=state.hands[team],usable=pile.hand.map((id,index)=>({id,index,d:C[id]})).filter(c=>c.d.cost<=state.energy[team]);
 state.botDelay=(state.difficulty==="easy"?random(5,7):random(1.4,2.4))/diffRate();
 if(!usable.length)return;
 const ownPosts=postsOwned(2).length;
 const firstClaim=state.posts.find(p=>p.owner!==2&&p.y<850);
 let sorted=usable.slice();
 sorted.sort((a,b)=>{
  const aBonus=a.d.capture&&ownPosts<2?-2:0;
  const bBonus=b.d.capture&&ownPosts<2?-2:0;
  return a.d.cost+aBonus-(b.d.cost+bBonus);
 });
 const choose=Math.random()<(state.difficulty==="hard"?.65:.45)?sorted[0]:usable[Math.floor(Math.random()*usable.length)];
 let lane=Math.floor(random(0,3));
 const unitsBlue=state.units.filter(u=>u.team===1);
 const danger=[0,0,0];for(const u of unitsBlue){if(u.y<970)danger[laneOf(u.x)]+=C[u.key].cost;}
 if(Math.max(...danger)>6&&Math.random()<(state.difficulty==="easy"?.3:.65))lane=danger.indexOf(Math.max(...danger));
 else if(choose.d.capture&&firstClaim&&Math.random()<.7)lane=laneOf(firstClaim.x);
 else if(choose.d.mode==="objective"){
  const targets=state.posts.filter(p=>p.owner!==2).sort((a,b)=>a.y-b.y);
  if(targets.length&&Math.random()<.65)lane=laneOf(targets[0].x);
 }
 let x=LANES[lane]+random(-85,85);
 // start near the current accessible frontline; defenders can be a bit behind
 let line=summonLine(2);
 let y=Math.min(line-25,choose.d.mode==="guard"?line-110:line-22);
 y=clamp(y,66,H-55);
 if(playCard(2,choose.index,x,y)&&state.difficulty==="hard")state.botDelay*=.85;
}
function endByClock(){
 const blue=base(1).hp/CAPHP,red=base(2).hp/CAPHP;
 if(Math.abs(blue-red)<1e-8)finish("draw","時間切れ。首都の残りHPが同じだった。");
 else finish(blue>red?"win":"lose","時間切れ。首都の残りHPで勝敗が決まった。");
}
function finish(outcome,reason){
 if(state.over)return;
 state.over=true;state.playing=false;
 const titles={win:"勝利！",lose:"敗北",draw:"引き分け"};
 $("dialogTitle").textContent=titles[outcome];
 $("dialogText").textContent=reason+"　デッキの回し方と前哨基地を狙うタイミングを調整して、もう一度試せるよ。";
 $("rules").innerHTML="自軍首都HP："+Math.max(0,Math.ceil(base(1).hp))+" / "+CAPHP+
 "<br>敵首都HP："+Math.max(0,Math.ceil(base(2).hp))+" / "+CAPHP+
 "<br>残り時間："+time(state.seconds)+"<br>※ これはBOT対戦α版。コストや戦闘バランスはまだ調整中。";
 $("begin").textContent="再戦する";$("modal").classList.remove("hidden");
}
function step(dt){
 if(!state.playing||state.paused||state.over)return;
 state.seconds-=dt;state.tick+=dt;
 const regen=state.difficulty==="easy"?(state.seconds<=FINAL_SURGE_SECONDS?1.0:.5):(state.seconds<=FINAL_SURGE_SECONDS?1.3:.65);
 for(const team of [1,2])state.energy[team]=Math.min(10,state.energy[team]+dt*regen*(team===2?diffRate():1));
 botStep(dt);unitsStep(dt);capitalStep(dt);
 if(!state.over&&state.seconds<=0)endByClock();
}
function fit(){
 state.pxRatio=Math.min(window.devicePixelRatio||1,2);
 state.viewW=area.clientWidth;state.viewH=area.clientHeight;
 canvas.width=Math.max(1,Math.round(state.viewW*state.pxRatio));
 canvas.height=Math.max(1,Math.round(state.viewH*state.pxRatio));
 canvas.style.width=state.viewW+"px";canvas.style.height=state.viewH+"px";
 g.setTransform(state.pxRatio,0,0,state.pxRatio,0,0);
 state.scale=state.viewW/W;
 limitCamera();
}
function viewSpan(){return state.viewH/state.scale;}
function limitCamera(){
 const half=viewSpan()/2;
 state.cameraY=viewSpan()>=H?H/2:clamp(state.cameraY,half,H-half);
}
function screenToWorld(x,y){return {x:x/state.scale,y:(y-state.viewH/2)/state.scale+state.cameraY};}
function worldToScreen(x,y){return {x:x*state.scale,y:(y-state.cameraY)*state.scale+state.viewH/2};}
function rounded(x,y,w,h,r){
 r=Math.min(r,w/2,h/2);g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();
}
function drawPost(p){
 const color=side(p.owner),halo=Math.sin(state.tick*3+p.y)*3;
 g.save();g.translate(p.x,p.y);
 g.fillStyle="#051e2a88";g.beginPath();g.ellipse(4,15,42,21,0,0,Math.PI*2);g.fill();
 g.strokeStyle=color;g.lineWidth=3;g.beginPath();g.arc(0,0,41+halo,0,Math.PI*2);g.stroke();
 g.fillStyle="#233f46";g.strokeStyle=color;g.lineWidth=4;
 g.beginPath();for(let i=0;i<6;i++){const t=Math.PI/3*i-Math.PI/6;const x=Math.cos(t)*29,y=Math.sin(t)*29;if(i===0)g.moveTo(x,y);else g.lineTo(x,y);}g.closePath();g.fill();g.stroke();
 g.fillStyle=color;g.beginPath();g.moveTo(-4,-18);g.lineTo(17,-11);g.lineTo(-4,-3);g.closePath();g.fill();
 g.strokeStyle="#d6e4de";g.lineWidth=2;g.beginPath();g.moveTo(-6,-19);g.lineTo(-6,18);g.stroke();
 g.fillStyle="#101d25";rounded(-37,-59,74,11,5);g.fill();
 g.fillStyle=color;rounded(-35,-57,70*Math.max(0,p.hp/POSTHP),7,3);g.fill();
 g.font="bold 12px system-ui";g.textAlign="center";g.fillStyle="#e6f4e5";
 g.fillText(p.owner===0?"中立基地":p.owner===1?"自軍基地":"敵軍基地",0,61);
 g.restore();
}
function drawCapital(c){
 const col=side(c.team),rad=72;
 g.save();g.translate(c.x,c.y);
 g.fillStyle="#091921aa";g.beginPath();g.ellipse(0,30,98,47,0,0,Math.PI*2);g.fill();
 g.strokeStyle=col+"66";g.lineWidth=3;g.beginPath();g.arc(0,0,rad+10+Math.sin(state.tick*2)*5,0,Math.PI*2);g.stroke();
 g.fillStyle=c.team===1?"#214f6a":"#683645";
 g.strokeStyle=col;g.lineWidth=5;rounded(-55,-54,110,108,15);g.fill();g.stroke();
 g.fillStyle="#d5d8e4";g.beginPath();g.moveTo(0,-41);g.lineTo(31,0);g.lineTo(0,42);g.lineTo(-31,0);g.closePath();g.fill();
 g.fillStyle=c.team===1?"#78d5f9":"#f78e9f";g.beginPath();g.arc(0,0,18,0,Math.PI*2);g.fill();
 g.font="bold 18px system-ui";g.textAlign="center";g.fillStyle="#fff";g.fillText(c.team===1?"自軍首都":"敵軍首都",0,-84);
 g.restore();
}
function drawUnit(u){
 const d=C[u.key],col=side(u.team),flying=d.flying;
 g.save();
 // Ground shadow stays below floating body.
 g.fillStyle="#07172085";g.beginPath();g.ellipse(u.x+4,u.y+8,d.r+6,d.r*.68,0,0,Math.PI*2);g.fill();
 const lift=flying?19+Math.sin(state.tick*5+u.bob)*4:0;
 g.translate(u.x,u.y-lift);g.rotate(u.facing);
 g.fillStyle=u.hitFlash>0?"#ffffff":col;g.strokeStyle="#e0edeb";g.lineWidth=2.1;
 switch(u.key){
  case "infantry":g.beginPath();g.moveTo(13,0);g.lineTo(-8,-9);g.lineTo(-8,9);g.closePath();g.fill();g.stroke();break;
  case "scout":g.beginPath();g.moveTo(20,0);g.lineTo(-16,-11);g.lineTo(-8,0);g.lineTo(-16,11);g.closePath();g.fill();g.stroke();break;
  case "archer":g.beginPath();g.arc(0,0,10,0,Math.PI*2);g.fill();g.stroke();g.strokeStyle="#f0d28c";g.beginPath();g.moveTo(1,-7);g.lineTo(12,0);g.lineTo(1,7);g.stroke();break;
  case "suppress":rounded(-17,-14,34,28,6);g.fill();g.stroke();g.fillStyle="#ead890";g.fillRect(0,-5,25,10);break;
  case "golem":rounded(-20,-20,40,40,9);g.fill();g.stroke();g.fillStyle="#f4d68d";g.beginPath();g.arc(0,0,9,0,Math.PI*2);g.fill();break;
  case "breaker":g.beginPath();g.moveTo(15,0);g.lineTo(0,-12);g.lineTo(-12,0);g.lineTo(0,12);g.closePath();g.fill();g.stroke();g.fillStyle="#dcd2f7";g.fillRect(0,-3,14,6);break;
  case "drone":g.beginPath();g.moveTo(15,0);g.lineTo(-4,-7);g.lineTo(-17,-15);g.lineTo(-15,0);g.lineTo(-17,15);g.lineTo(-4,7);g.closePath();g.fill();g.stroke();g.fillStyle="#f8d894";g.beginPath();g.arc(0,0,6,0,Math.PI*2);g.fill();break;
  case "tank":rounded(-24,-18,48,36,8);g.fill();g.stroke();g.fillStyle="#182f39";rounded(-7,-9,40,18,4);g.fill();g.fillStyle="#ebd18b";g.beginPath();g.arc(0,0,10,0,Math.PI*2);g.fill();break;
 }
 g.restore();
 if(d.flying){g.strokeStyle=col+"70";g.lineWidth=1;g.setLineDash([3,5]);g.beginPath();g.moveTo(u.x,u.y);g.lineTo(u.x,u.y-lift);g.stroke();g.setLineDash([]);}
 if(u.hp/u.max<.99){
  g.fillStyle="#111b21";g.fillRect(u.x-20,u.y-lift-d.r-13,40,5);
  g.fillStyle=col;g.fillRect(u.x-20,u.y-lift-d.r-13,40*Math.max(0,u.hp/u.max),5);
 }
}
function drawBattle(){
 const h=state.viewH,w=state.viewW;
 g.clearRect(0,0,w,h);g.fillStyle="#172e30";g.fillRect(0,0,w,h);
 g.save();g.translate(0,h/2-state.cameraY*state.scale);g.scale(state.scale,state.scale);
 g.fillStyle="#234238";g.fillRect(0,0,W,H);
 for(let l=0;l<3;l++){
  g.fillStyle=l===1?"#365444":"#2c493d";g.fillRect(l*330+5,0,320,H);
  g.fillStyle="#6a8f6c17";g.fillRect(l*330+12,0,306,H);
  g.strokeStyle="#d6dbb530";g.lineWidth=2;g.setLineDash([12,16]);g.beginPath();g.moveTo(LANES[l],0);g.lineTo(LANES[l],H);g.stroke();
 }
 g.setLineDash([]);
 // soft terrain details, no building/grid cells
 g.strokeStyle="#aec5a911";g.lineWidth=3;
 for(let i=0;i<60;i++){
  const x=((i*239+69)%980),y=(i*407+91)%1900;
  g.beginPath();g.moveTo(x-17,y+6);g.quadraticCurveTo(x,y-8,x+19,y+3);g.stroke();
 }
 g.fillStyle="#f36f7c20";g.fillRect(0,0,W,205);
 g.fillStyle="#4ebdf321";g.fillRect(0,H-205,W,205);
 const blueLine=summonLine(1),redLine=summonLine(2);
 g.fillStyle="#67ccff13";g.fillRect(0,blueLine,W,H-blueLine);
 g.fillStyle="#ff829214";g.fillRect(0,0,W,redLine);
 g.lineWidth=4;g.setLineDash([13,11]);
 g.strokeStyle="#8ae0ffbb";g.beginPath();g.moveTo(0,blueLine);g.lineTo(W,blueLine);g.stroke();
 g.strokeStyle="#ff98a5bb";g.beginPath();g.moveTo(0,redLine);g.lineTo(W,redLine);g.stroke();
 g.setLineDash([]);
 g.font="bold 14px system-ui";g.textAlign="right";g.fillStyle="#a5e6ff";g.fillText("自軍召喚ライン",W-20,blueLine+23);
 g.fillStyle="#ffc6d0";g.fillText("敵軍召喚ライン",W-20,redLine-12);
 g.strokeStyle="#a4beb066";g.lineWidth=4;
 g.beginPath();g.moveTo(330,0);g.lineTo(330,H);g.moveTo(660,0);g.lineTo(660,H);g.stroke();
 for(const p of state.posts)drawPost(p);
 for(const c of state.capitals)drawCapital(c);
 for(const u of state.units)drawUnit(u);
 for(const s of state.shots){
  g.globalAlpha=Math.min(1,s.life/s.max);g.strokeStyle=side(s.team);g.lineWidth=4;
  g.beginPath();g.arc(s.x,s.y,s.r*(1.25-s.life/s.max*.5),0,Math.PI*2);g.stroke();
 }g.globalAlpha=1;
 let placement=null;
 if(state.drag&&state.drag.active&&state.drag.yScreen!=null){
  const rect=area.getBoundingClientRect();
  if(state.drag.xScreen>=rect.left&&state.drag.xScreen<=rect.right&&state.drag.yScreen>=rect.top&&state.drag.yScreen<=rect.bottom)
   placement=screenToWorld(state.drag.xScreen-rect.left,state.drag.yScreen-rect.top);
 }else if(state.selected!=null&&state.pan&&state.pan.preview)placement=state.pan.preview;
 if(placement){
  const card=state.drag?.active?C[state.drag.key]:C[state.hands[1].hand[state.selected]];
  if(card){
   const good=validSpawn(1,placement.x,placement.y);
   g.fillStyle=good?"#66d3ff35":"#fa858a50";g.strokeStyle=good?"#85dcff":"#ff9999";g.lineWidth=3;
   g.beginPath();g.arc(placement.x,placement.y,45,0,Math.PI*2);g.fill();g.stroke();
   g.textAlign="center";g.font="bold 15px system-ui";g.fillStyle="#fff";
   g.fillText(good?"召喚可能":"召喚不可",placement.x,placement.y-56);
  }
 }
 g.restore();
 if(state.drag&&state.drag.active){
  const rect=area.getBoundingClientRect();
  if(state.drag.xScreen>=rect.left&&state.drag.xScreen<rect.right&&state.drag.yScreen>=rect.top&&state.drag.yScreen<rect.bottom){
   const p=screenToWorld(state.drag.xScreen-rect.left,state.drag.yScreen-rect.top);
   if(!validSpawn(1,p.x,p.y)){
    g.fillStyle="#ffbbb8";g.font="bold 12px system-ui";g.fillText("青い召喚範囲へ配置",w/2,h-18);
   }
  }
 }
}
function drawMinimap(){
 const w=mini.width,h=mini.height,sx=w/W,sy=h/H;mg.clearRect(0,0,w,h);
 mg.fillStyle="#264239";mg.fillRect(0,0,w,h);
 mg.fillStyle="#d8727d44";mg.fillRect(0,0,w,370*sy);
 mg.fillStyle="#5bbaf14a";mg.fillRect(0,summonLine(1)*sy,w,(H-summonLine(1))*sy);
 mg.fillStyle="#d97b8950";mg.fillRect(0,0,w,summonLine(2)*sy);
 mg.strokeStyle="#a8cdb95a";for(const x of [330,660]){mg.beginPath();mg.moveTo(x*sx,0);mg.lineTo(x*sx,h);mg.stroke();}
 for(const p of state.posts){
  mg.fillStyle=side(p.owner);mg.beginPath();mg.arc(p.x*sx,p.y*sy,4,0,Math.PI*2);mg.fill();
 }
 for(const c of state.capitals){mg.fillStyle=side(c.team);mg.fillRect(c.x*sx-5,c.y*sy-4,10,8);}
 for(const u of state.units){mg.fillStyle=side(u.team);mg.fillRect(u.x*sx-1,u.y*sy-1.5,2,3);}
 const half=viewSpan()/2;mg.strokeStyle="#fff";mg.lineWidth=2;mg.strokeRect(0,(state.cameraY-half)*sy,w,(half*2)*sy);
}
function displayCards(){
 const hand=state.hands[1];if(!hand)return;
 cardHolder.replaceChildren();
 hand.hand.forEach((id,index)=>{
  const d=C[id],button=document.createElement("button");button.type="button";button.className="card";
  if(d.cost>state.energy[1])button.classList.add("cant");
  if(index===state.selected)button.classList.add("selected");
  button.setAttribute("aria-label",d.name+" コスト"+d.cost);
  button.innerHTML='<div class="cardhead"><span class="cardCost">'+d.cost+'</span><span class="cardGlyph">'+d.icon+'</span></div><span class="cardName">'+d.name+'</span><span class="cardNote">'+d.note+'</span>';
  button.addEventListener("pointerdown",e=>cardPointerDown(e,index,id));
  cardHolder.append(button);
 });
 const next=hand.queue[0];$("nextGlyph").textContent=C[next].icon;$("nextName").textContent=C[next].name;
}
function updateHud(){
 $("clock").textContent=time(state.seconds);
 $("period").textContent=state.seconds<=FINAL_SURGE_SECONDS?"エネルギー2倍":state.difficulty==="easy"?"練習BOT｜ゆっくり":"前哨基地戦";
 const cBlue=base(1),cRed=base(2);
 if(cBlue){$("blueHp").style.width=100*clamp(cBlue.hp/CAPHP,0,1)+"%";$("blueHpText").textContent=Math.ceil(Math.max(0,cBlue.hp))+" / "+CAPHP;}
 if(cRed){$("redHp").style.width=100*clamp(cRed.hp/CAPHP,0,1)+"%";$("redHpText").textContent=Math.ceil(Math.max(0,cRed.hp))+" / "+CAPHP;}
 $("energyNum").innerHTML=Math.floor(state.energy[1])+' <span style="font-size:12px;color:#ad97b5">/ 10</span>';
 $("energyFill").style.width=100*state.energy[1]/10+"%";
 $("energyNote").textContent="毎秒 +"+(state.difficulty==="easy"?(state.seconds<=FINAL_SURGE_SECONDS?"1.0":"0.5"):(state.seconds<=FINAL_SURGE_SECONDS?"1.3":"0.65"));
 if(state.hands[1]){
  [...cardHolder.children].forEach((el,index)=>{const id=state.hands[1].hand[index];if(id){el.classList.toggle("cant",C[id].cost>state.energy[1]);el.classList.toggle("selected",state.selected===index);}});
 }
 for(const [index,id] of ["leftLight","middleLight","rightLight"].entries()){
  const units=state.units.filter(u=>laneOf(u.x)===index);
  const power=units.reduce((a,u)=>a+(u.team===1?C[u.key].cost:-C[u.key].cost),0);
  $(id).className=power>0?"blue":power<0?"red":"";
 }
 if(performance.now()>state.noticeTime)$("frontAlert").classList.remove("on");
}
function cardPointerDown(e,index,id){
 if(!state.playing||state.paused)return;
 e.preventDefault();
 state.drag={pointer:e.pointerId,index,key:id,startX:e.clientX,startY:e.clientY,xScreen:e.clientX,yScreen:e.clientY,active:false};
}
function globalPointerMove(e){
 const drag=state.drag;
 if(!drag||drag.pointer!==e.pointerId)return;
 drag.xScreen=e.clientX;drag.yScreen=e.clientY;
 if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>11)drag.active=true;
 const ghost=$("dragGhost");
 if(drag.active){
  ghost.style.display="flex";ghost.style.left=(e.clientX-34)+"px";ghost.style.top=(e.clientY-79)+"px";
  $("ghostGlyph").textContent=C[drag.key].icon;$("ghostName").textContent=C[drag.key].name;
 }
}
function globalPointerUp(e){
 const drag=state.drag;if(!drag||e.pointerId!==drag.pointer)return;
 const rect=area.getBoundingClientRect();
 const within=e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom;
 if(drag.active&&within){
  const p=screenToWorld(e.clientX-rect.left,e.clientY-rect.top);
  if(!playCard(1,drag.index,p.x,p.y))message(state.energy[1]<C[drag.key].cost?"エネルギーが足りない！":"青い召喚範囲に配置してね");
 }else if(!drag.active){state.selected=drag.index;displayCards();}
 state.drag=null;$("dragGhost").style.display="none";updateHud();
}
function arenaDown(e){
 if(!state.playing||state.paused||state.drag||!(e.target===canvas||e.target===area))return;
 const rect=area.getBoundingClientRect();state.pan={id:e.pointerId,y:e.clientY,x:e.clientX,initialY:state.cameraY,moved:false,preview:screenToWorld(e.clientX-rect.left,e.clientY-rect.top)};
 area.setPointerCapture?.(e.pointerId);
}
function arenaMove(e){
 const pan=state.pan;if(!pan||e.pointerId!==pan.id)return;
 const dist=Math.hypot(e.clientX-pan.x,e.clientY-pan.y);
 if(dist>9)pan.moved=true;
 if(pan.moved){state.cameraY=pan.initialY-(e.clientY-pan.y)/state.scale;limitCamera();}
 else{
  const rect=area.getBoundingClientRect();pan.preview=screenToWorld(e.clientX-rect.left,e.clientY-rect.top);
 }
}
function arenaUp(e){
 const pan=state.pan;if(!pan||pan.id!==e.pointerId)return;
 if(!pan.moved&&state.selected!=null){
  const rect=area.getBoundingClientRect(),p=screenToWorld(e.clientX-rect.left,e.clientY-rect.top);
  const key=state.hands[1].hand[state.selected];
  if(!playCard(1,state.selected,p.x,p.y))message(state.energy[1]<C[key].cost?"エネルギーが足りない！":"青い召喚範囲に配置してね");
 }
 state.pan=null;
}
function mapJump(e){
 if(!state.playing)return;
 const r=mini.getBoundingClientRect();
 state.cameraY=clamp((e.clientY-r.top)/r.height*H,0,H);limitCamera();
}
function setup(){
 fit();
 window.addEventListener("resize",fit);
 document.addEventListener("pointermove",globalPointerMove);
 document.addEventListener("pointerup",globalPointerUp);
 document.addEventListener("pointercancel",e=>{if(state.drag&&state.drag.pointer===e.pointerId){state.drag=null;$("dragGhost").style.display="none";}});
 area.addEventListener("pointerdown",arenaDown);
 area.addEventListener("pointermove",arenaMove);
 area.addEventListener("pointerup",arenaUp);
 area.addEventListener("pointercancel",e=>{if(state.pan?.id===e.pointerId)state.pan=null;});
 area.addEventListener("wheel",e=>{e.preventDefault();state.cameraY+=e.deltaY/state.scale;limitCamera();},{passive:false});
 mini.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();mapJump(e);});
 $("home").addEventListener("click",()=>{state.cameraY=1600;limitCamera();});
 $("center").addEventListener("click",()=>{state.cameraY=960;limitCamera();});
 $("speedBtn").addEventListener("click",()=>{
  const modes=[.75,.5,1];const i=modes.indexOf(state.speed);
  state.speed=modes[(i+1)%modes.length];
  $("speedBtn").textContent="速度 "+state.speed.toFixed(2)+"×";
  message(state.speed<1?"ゆっくりモード":"戦闘速度 "+state.speed.toFixed(2)+"×");
 });
 $("pause").addEventListener("click",()=>{
  if(!state.playing)return;
  state.paused=!state.paused;$("pause").textContent=state.paused?"▶ 再開":"Ⅱ 停止";
  message(state.paused?"一時停止中":"戦闘再開");
 });
 document.querySelectorAll("[data-diff]").forEach(btn=>btn.addEventListener("click",()=>{
  state.difficulty=btn.dataset.diff;
  document.querySelectorAll("[data-diff]").forEach(x=>x.classList.toggle("active",x===btn));
 }));
 $("begin").addEventListener("click",initialize);
 document.addEventListener("visibilitychange",()=>{if(document.hidden&&state.playing){state.paused=true;$("pause").textContent="▶ 再開";}});
 document.addEventListener("contextmenu",e=>e.preventDefault());
 window.addEventListener("keydown",e=>{
  if(e.code==="Space"&&state.playing){e.preventDefault();$("pause").click();}
  if(state.playing&&/^[1-4]$/.test(e.key)){state.selected=Number(e.key)-1;displayCards();}
 });
 let previous=performance.now(),acc=0;
 function frame(now){
  const elapsed=Math.min(.1,(now-previous)/1000);previous=now;acc+=elapsed;
  let loops=0;while(acc>=1/30&&loops<4){step(1/30*state.speed);acc-=1/30;loops++;}
  if(loops===4)acc=0;
  drawBattle();drawMinimap();
  state.uiTimer+=elapsed;
  if(state.uiTimer>.12){updateHud();state.uiTimer=0;}
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}
setup();
})();