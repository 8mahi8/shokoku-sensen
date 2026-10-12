"use strict";
/* 小国戦線 III — one-screen fortress card battler. No external dependencies. */
(() => {
const $=id=>document.getElementById(id);
const cv=$("field"),ctx=cv.getContext("2d"),area=$("fieldArea"),cards=$("cards");
const W=1280,H=660,START_HP=2600,POST_HP=10,MATCH=300,PREP=10;
const BLUE="#80d9f5",RED="#ff889a",GOLD="#f3da91";
const CLASSES={
 infantry:{name:"基本歩兵",glyph:"♟",cost:2,limit:Infinity,qty:2,hp:125,damage:17,cool:1.45,range:26,vision:104,speed:23,r:12,behavior:"normal",capture:1,hitAir:false,armored:false,note:"占領・無制限"},
 scout:{name:"偵察ライダー",glyph:"➤",cost:3,limit:5,qty:1,hp:145,damage:16,cool:1.2,range:31,vision:115,speed:41,r:14,behavior:"capture",capture:1,hitAir:false,armored:false,note:"高速・占領"},
 engineer:{name:"重装工兵",glyph:"◆",cost:4,limit:5,qty:1,hp:315,damage:19,cool:1.6,range:32,vision:120,speed:16,r:18,behavior:"capture",capture:2,hitAir:false,armored:true,note:"耐久・占領"},
 archer:{name:"魔導射手",glyph:"✧",cost:3,limit:8,qty:2,hp:95,damage:20,cool:1.65,range:153,vision:195,speed:19,r:12,behavior:"normal",capture:0,hitAir:true,armored:false,note:"遠距離・対空"},
 suppress:{name:"制圧機兵",glyph:"✳",cost:4,limit:6,qty:1,hp:285,damage:40,cool:1.9,range:115,vision:150,speed:17,r:18,behavior:"normal",capture:0,hitAir:false,armored:true,splash:46,note:"対集団"},
 guardian:{name:"守護ゴーレム",glyph:"⬡",cost:4,limit:5,qty:1,hp:620,damage:32,cool:1.85,range:44,vision:130,speed:19,r:24,behavior:"guard",capture:0,hitAir:false,armored:true,note:"迎撃・守備"},
 drone:{name:"浮遊ドローン",glyph:"✦",cost:4,limit:5,qty:2,hp:135,damage:18,cool:1.25,range:98,vision:153,speed:34,r:15,behavior:"normal",capture:0,hitAir:false,flying:true,armored:false,note:"飛行・突破"},
 tank:{name:"魔導重戦車",glyph:"▰",cost:6,limit:3,qty:1,hp:755,damage:49,cool:2.0,range:108,vision:149,speed:15,r:25,behavior:"normal",capture:0,hitAir:false,armored:true,splash:24,note:"高耐久・重装"}
};
const IDS=Object.keys(CLASSES);
const TEAM={1:BLUE,2:RED};
const limit=(v,min,max)=>Math.max(min,Math.min(max,v));
const rand=(min,max)=>min+(max-min)*Math.random();
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const numTime=v=>{const s=Math.max(0,Math.ceil(v));return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")};
const S={phase:"menu",difficulty:"easy",speed:.85,prep:PREP,seconds:MATCH,elapsed:0,
 energy:[0,8,8],left:[null,{},{}],units:[],forts:[],capitals:[],effects:[],
 uid:0,botThink:0,selected:null,drag:null,pointer:null,view:{w:1,h:1,s:1,ox:0,oy:0,dpr:1},
 hudTick:0,noticeUntil:0,clock:0};
function resetWorld(){
 S.prep=PREP;S.seconds=MATCH;S.elapsed=0;S.uid=0;S.botThink=7;
 S.energy=[0,8,8];S.units=[];S.effects=[];S.selected=null;S.drag=null;S.pointer=null;
 S.left=[null,{},{}];
 for(const t of [1,2])for(const id of IDS)S.left[t][id]=CLASSES[id].limit;
 S.capitals=[{team:1,x:74,y:328,hp:START_HP,max:START_HP,attack:0},
             {team:2,x:1206,y:328,hp:START_HP,max:START_HP,attack:0}];
 S.forts=[{x:410,y:190,hp:POST_HP,owner:0},{x:633,y:444,hp:POST_HP,owner:0},{x:867,y:205,hp:POST_HP,owner:0}];
}
function capital(team){return S.capitals[team-1];}
function enemy(team){return team===1?2:1;}
function border(team){
 let edge=team===1?244:1036;
 for(const f of S.forts)if(f.owner===team)edge=team===1?Math.max(edge,f.x-48):Math.min(edge,f.x+48);
 return edge;
}
function canPlace(team,x,y){
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<25||x>W-25||y<42||y>H-37)return false;
 return team===1?x<=border(1):x>=border(2);
}
function canPay(team,id){
 return (S.phase==="prep"||S.phase==="battle")&&CLASSES[id]&&S.energy[team]+1e-6>=CLASSES[id].cost&&S.left[team][id]>0;
}
function deploy(team,id,x,y){
 if(!canPay(team,id)||!canPlace(team,x,y))return false;
 const d=CLASSES[id], count=S.units.filter(u=>u.team===team&&u.hp>0).length;
 if(count+d.qty>65){if(team===1)notice("部隊が多すぎる。少し減るまで待とう");return false;}
 S.energy[team]=Math.max(0,S.energy[team]-d.cost);
 if(Number.isFinite(S.left[team][id]))S.left[team][id]--;
 for(let i=0;i<d.qty;i++){
  const dy=(i-(d.qty-1)/2)*27;
  const px=limit(x+(team===1?-9:9)*i,30,W-30);
  const py=limit(y+dy,46,H-45);
  S.units.push({uid:++S.uid,key:id,team,x:px,y:py,anchorX:px,anchorY:py,homeY:py,
   hp:d.hp,max:d.hp,attack:rand(0,.65),facing:team===1?0:Math.PI,flash:0,
   drift:rand(0,Math.PI*2)});
 }
 if(team===1){S.selected=null;buildCards();updateHUD();}
 return true;
}
function notice(message){
 const el=$("announcement");el.textContent=message;el.classList.add("visible");S.noticeUntil=performance.now()+2600;
}
function begin(){
 resetWorld();S.phase="prep";S.speed=.85;
 $("speed").textContent="速度 0.85×";$("pause").textContent="Ⅱ 停止";
 $("overlay").classList.add("hidden");
 $("prepBanner").classList.add("visible");
 $("fieldHint").textContent="開戦準備：資源8で初期配置を決めよう。キャラは動かない。";
 // BOT receives exactly the same initial 8 energy and troop limits.
 deploy(2,"infantry",1085,190);
 deploy(2,"archer",1090,425);
 buildCards();updateHUD();
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
  options.sort((a,b)=>direction*(b.x-a.x));
  return options[0];
 }
 options.sort((a,b)=>dist(a,u)-dist(b,u));
 return options[0];
}
function nearbyEnemy(u){
 const d=CLASSES[u.key];
 let choice=null,score=Infinity;
 for(const v of S.units){
  if(v.team===u.team||v.hp<=0)continue;
  if(CLASSES[v.key].flying&&!d.hitAir)continue;
  const range=d.behavior==="guard"?Math.min(d.vision,165):d.vision;
  const distance=dist(u,v);if(distance>range)continue;
  if(d.behavior==="guard"&&Math.hypot(v.x-u.anchorX,v.y-u.anchorY)>180)continue;
  const scored=distance+(d.antiArmor&&CLASSES[v.key].armored?-26:0);
  if(scored<score){score=scored;choice={kind:"unit",ref:v,x:v.x,y:v.y,r:CLASSES[v.key].r};}
 }
 const c=capital(enemy(u.team));
 if(dist(u,c)<d.vision+66){
  const s=dist(u,c)-66;
  if(s<score){score=s;choice={kind:"capital",ref:c,x:c.x,y:c.y,r:64};}
 }
 return choice;
}
function moveToward(u,x,y,dt){
 const dx=x-u.x,dy=y-u.y,distance=Math.hypot(dx,dy);
 if(distance<.05)return;
 const amt=Math.min(distance,CLASSES[u.key].speed*dt);
 u.x=limit(u.x+dx/distance*amt,28,W-28);
 u.y=limit(u.y+dy/distance*amt,43,H-43);
 u.facing=Math.atan2(dy,dx);
}
function attackUnit(target,value,attacker){
 const att=CLASSES[attacker.key],def=CLASSES[target.key];
 let power=value;
 if(def.armored&&!att.antiArmor)power*=.78;
 if(def.armored&&att.antiArmor)power*=att.antiArmor;
 target.hp-=power;target.flash=.15;
}
function fire(u,target){
 const d=CLASSES[u.key],ref=target.ref;
 u.attack=d.cool;
 S.effects.push({x:target.x,y:target.y,t:.23,max:.23,team:u.team,r:d.splash||16});
 if(target.kind==="fort"){
  if(!d.capture||ref.owner===u.team)return;
  ref.hp=Math.max(0,ref.hp-d.capture);
  if(ref.hp<=0){
   ref.owner=u.team;ref.hp=POST_HP;
   notice(u.team===1?"前哨基地を確保！ 召喚ラインが前進":"敵が前哨基地を占領！");
  }
 }else if(target.kind==="capital"){
  ref.hp=Math.max(0,ref.hp-d.damage);
  if(ref.hp===0)end(u.team===1?"win":"lose","首都が破壊された！");
 }else if(target.kind==="unit"){
  if(ref.hp<=0)return;
  attackUnit(ref,d.damage,u);
  if(d.splash){
   for(const v of S.units){
    if(v.hp<=0||v===ref||v.team===u.team||CLASSES[v.key].flying)continue;
    if(dist(v,ref)<d.splash)attackUnit(v,d.damage*.57,u);
   }
  }
 }
}
function unitStep(dt){
 for(const u of S.units){
  if(u.hp<=0)continue;
  const d=CLASSES[u.key];
  u.attack=Math.max(0,u.attack-dt);u.flash=Math.max(0,u.flash-dt);
  const foe=nearbyEnemy(u),fort=getFort(u);
  if(d.behavior==="guard"){
   if(foe){
    if(dist(u,foe)<d.range+foe.r){u.facing=Math.atan2(foe.y-u.y,foe.x-u.x);if(u.attack<=0)fire(u,foe);}
    else moveToward(u,foe.x,foe.y,dt);
   }else if(Math.hypot(u.x-u.anchorX,u.y-u.anchorY)>7)moveToward(u,u.anchorX,u.anchorY,dt);
   continue;
  }
  if(d.behavior==="capture"&&fort){
   const immediate=foe&&foe.kind==="unit"&&dist(u,foe)<Math.max(d.range+foe.r,43);
   if(immediate&&u.key==="engineer"){if(u.attack<=0)fire(u,foe);}
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
  const cap=capital(enemy(u.team)),close=Math.abs(u.x-cap.x)<280;
  const tx=cap.x,ty=close?cap.y:u.homeY;
  moveToward(u,tx,ty,dt);
 }
 S.units=S.units.filter(u=>u.hp>0);
}
function baseStep(dt){
 for(const c of S.capitals){
  if(c.hp<=0)continue;
  c.attack=Math.max(0,c.attack-dt);
  if(c.attack>0)continue;
  const foes=S.units.filter(u=>u.team!==c.team&&dist(c,u)<160);
  if(!foes.length)continue;
  foes.sort((a,b)=>dist(c,a)-dist(c,b));
  const target=foes[0];target.hp-=33;target.flash=.2;c.attack=1.6;
  S.effects.push({x:target.x,y:target.y,t:.24,max:.24,team:c.team,r:21});
 }
}
function rate(){
 if(S.elapsed<100)return .25;
 if(S.elapsed<210)return .36;
 if(S.elapsed<270)return .53;
 return .7;
}
function botAction(){
 const affordable=IDS.filter(id=>canPay(2,id));
 if(!affordable.length)return;
 const owned=S.forts.filter(f=>f.owner===2).length;
 const press=S.units.filter(u=>u.team===1&&u.x>border(2)-180).length;
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
 const mod=S.difficulty==="easy"?1.55:S.difficulty==="hard"?.85:1;
 S.botThink=rand(4.2,6.4)*mod;
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
 for(const team of [1,2])S.energy[team]=Math.min(10,S.energy[team]+dt*rate()*(team===2&&S.difficulty==="easy"?.82:1));
 botStep(dt);unitStep(dt);baseStep(dt);
 for(const fx of S.effects)fx.t-=dt;
 S.effects=S.effects.filter(f=>f.t>0);
 if(S.phase==="battle"&&S.seconds<=0)finishTime();
}
function fit(){
 const rect=area.getBoundingClientRect(),v=S.view;
 v.w=rect.width;v.h=rect.height;v.dpr=Math.min(window.devicePixelRatio||1,2);
 cv.width=Math.max(1,Math.round(v.w*v.dpr));cv.height=Math.max(1,Math.round(v.h*v.dpr));
 cv.style.width=v.w+"px";cv.style.height=v.h+"px";
 v.s=Math.min(v.w/W,v.h/H);v.ox=(v.w-W*v.s)/2;v.oy=(v.h-H*v.s)/2;
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
 ctx.save();ctx.translate(c.x,c.y);
 const blue=c.team===1,col=blue?BLUE:RED;
 ctx.fillStyle="#05191c80";ctx.beginPath();ctx.ellipse(2,34,69,26,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=blue?"#276c86":"#844656";ctx.strokeStyle=col;ctx.lineWidth=4;
 rounded(ctx,-43,-60,86,118,11);ctx.fill();ctx.stroke();
 for(const x of [-45,-15,15,45]){
  ctx.fillStyle=blue?"#4f9bb6":"#b96776";
  rounded(ctx,x-10,-82,20,28,4);ctx.fill();ctx.stroke();
 }
 ctx.fillStyle="#173746";ctx.strokeStyle="#d5e9ec";ctx.lineWidth=2;
 rounded(ctx,-19,4,38,56,7);ctx.fill();ctx.stroke();
 ctx.fillStyle=col;ctx.beginPath();ctx.arc(0,-29,19,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#eaf5f0";ctx.font="bold 16px system-ui";ctx.textAlign="center";
 ctx.fillText(blue?"自軍首都":"敵軍首都",0,-104);
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
function drawPreview(){
 const item=S.drag&&S.drag.active?S.drag.id:S.selected;
 if(!item)return;
 const p=S.drag&&S.drag.active?point(S.drag.x,S.drag.y):(S.pointer&&S.pointer.pos);
 if(!p)return;
 const legal=canPay(1,item)&&canPlace(1,p.x,p.y);
 ctx.strokeStyle=legal?"#9deaff":"#ff9aa3";ctx.fillStyle=legal?"#7bdfff34":"#ff788a39";ctx.lineWidth=3;
 ctx.beginPath();ctx.arc(p.x,p.y,39,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.font="bold 13px system-ui";ctx.textAlign="center";ctx.fillStyle="#fff";
 ctx.fillText(legal?"召喚可能":"ここには置けない",p.x,p.y-52);
}
function draw(){
 const v=S.view,d=v.dpr;
 ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,v.w,v.h);
 ctx.fillStyle="#0d2426";ctx.fillRect(0,0,v.w,v.h);
 ctx.save();ctx.translate(v.ox,v.oy);ctx.scale(v.s,v.s);
 terrain();
 const objects=[];
 for(const c of S.capitals)objects.push({y:c.y-10,draw:()=>drawCapital(c)});
 for(const p of S.forts)objects.push({y:p.y+20,draw:()=>drawFort(p)});
 for(const u of S.units)objects.push({y:u.y,draw:()=>drawUnit(u)});
 objects.sort((a,b)=>a.y-b.y);
 for(const obj of objects)obj.draw();
 for(const e of S.effects){
  ctx.globalAlpha=e.t/e.max;ctx.strokeStyle=TEAM[e.team];ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(e.x,e.y,e.r*(1.35-e.t/e.max*.55),0,Math.PI*2);ctx.stroke();
 }
 ctx.globalAlpha=1;drawPreview();
 ctx.restore();
}
function buildCards(){
 cards.replaceChildren();
 for(const id of IDS){
  const d=CLASSES[id],available=S.left[1][id]>0;
  const button=document.createElement("button");
  button.type="button";button.className="card";
  button.dataset.id=id;button.setAttribute("aria-label",d.name+" コスト"+d.cost);
  if(S.selected===id)button.classList.add("selected");
  if(!available)button.classList.add("depleted");
  if(S.energy[1]+1e-6<d.cost)button.classList.add("unavailable");
  const left=Number.isFinite(S.left[1][id])?"残 "+S.left[1][id]:"∞";
  button.innerHTML='<div class="cardTop"><span class="cardCost">'+d.cost+'</span><span class="cardGlyph">'+d.glyph+'</span></div>'+
   '<div class="cardName">'+d.name+'</div>'+
   '<div class="cardBottom"><span class="cardLeft">'+left+'</span>'+
   (d.capture?'<span class="cardCapture">占領可</span>':'<span>戦闘</span>')+'</div>';
  button.addEventListener("pointerdown",e=>cardDown(e,id));
  cards.append(button);
 }
}
function updateHUD(){
 if(!S.capitals.length)return;
 $("clock").textContent=S.phase==="prep"?numTime(S.prep):numTime(S.seconds);
 $("phaseLabel").textContent=S.phase==="prep"?"開戦準備":S.phase==="paused"?"一時停止":S.phase==="battle"?(S.elapsed<100?"序盤｜布陣":S.elapsed<210?"中盤｜攻防":"終盤｜総力戦"):"試遊";
 $("blueText").textContent=Math.ceil(capital(1).hp)+" / "+START_HP;
 $("redText").textContent=Math.ceil(capital(2).hp)+" / "+START_HP;
 $("blueBar").style.width=100*capital(1).hp/START_HP+"%";
 $("redBar").style.width=100*capital(2).hp/START_HP+"%";
 $("resourceNumber").innerHTML=Math.floor(S.energy[1])+' <small>/ 10</small>';
 $("resourceLevel").style.width=100*S.energy[1]/10+"%";
 $("rate").textContent=S.phase==="prep"?"準備中：回復なし":"回復 毎秒 +"+rate().toFixed(2);
 $("prepTime").textContent=numTime(S.prep);
 const owners=S.forts.filter(f=>f.owner===1).length;
 $("remaining").textContent="前哨基地 "+owners+" / 3";
 for(const b of cards.children){
  const id=b.dataset.id;if(!id)continue;
  const d=CLASSES[id];
  b.classList.toggle("unavailable",S.energy[1]+1e-6<d.cost);
  b.classList.toggle("depleted",S.left[1][id]<=0);
  b.classList.toggle("selected",S.selected===id);
 }
 if(performance.now()>S.noticeUntil)$("announcement").classList.remove("visible");
}
function cardDown(e,id){
 if(S.phase!=="prep"&&S.phase!=="battle")return;
 e.preventDefault();
 S.drag={pointer:e.pointerId,id,originX:e.clientX,originY:e.clientY,x:e.clientX,y:e.clientY,active:false};
}
function onGlobalMove(e){
 const m=S.drag;
 if(!m||m.pointer!==e.pointerId)return;
 m.x=e.clientX;m.y=e.clientY;
 if(Math.hypot(e.clientX-m.originX,e.clientY-m.originY)>12)m.active=true;
 if(m.active){
  const ghost=$("dragging");ghost.style.display="flex";
  ghost.style.left=e.clientX+"px";ghost.style.top=e.clientY+"px";
  $("dragGlyph").textContent=CLASSES[m.id].glyph;$("dragName").textContent=CLASSES[m.id].name;
 }
}
function onGlobalUp(e){
 const m=S.drag;if(!m||m.pointer!==e.pointerId)return;
 const rect=area.getBoundingClientRect();
 const inside=e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom;
 if(m.active&&inside){
  const p=point(e.clientX,e.clientY);
  if(!deploy(1,m.id,p.x,p.y))notice(!canPay(1,m.id)?"資源不足、または召喚回数を使い切った":"青い召喚エリアに置いてね");
 }else if(!m.active){S.selected=m.id;buildCards();}
 S.drag=null;$("dragging").style.display="none";
}
function arenaDown(e){
 if(S.phase!=="prep"&&S.phase!=="battle")return;
 if(e.target!==cv)return;
 const pos=point(e.clientX,e.clientY);
 S.pointer={id:e.pointerId,pos};
}
function arenaMove(e){
 if(S.pointer?.id===e.pointerId)S.pointer.pos=point(e.clientX,e.clientY);
}
function arenaUp(e){
 if(S.pointer?.id!==e.pointerId)return;
 const p=point(e.clientX,e.clientY);
 if(S.selected){
  const id=S.selected;
  if(!deploy(1,id,p.x,p.y))notice(!canPay(1,id)?"資源不足、または召喚回数を使い切った":"青い召喚エリアに置いてね");
 }
 S.pointer=null;
}
function resumeButton(){
 if(S.phase==="battle"){S.phase="paused";$("pause").textContent="▶ 再開";}
 else if(S.phase==="paused"){S.phase="battle";$("pause").textContent="Ⅱ 停止";}
}
function start(){
 resetWorld();fit();buildCards();
 window.addEventListener("resize",fit);
 document.addEventListener("pointermove",onGlobalMove);
 document.addEventListener("pointerup",onGlobalUp);
 document.addEventListener("pointercancel",e=>{if(S.drag&&S.drag.pointer===e.pointerId){S.drag=null;$("dragging").style.display="none";}});
 area.addEventListener("pointerdown",arenaDown);
 area.addEventListener("pointermove",arenaMove);
 area.addEventListener("pointerup",arenaUp);
 area.addEventListener("pointercancel",()=>S.pointer=null);
 $("pause").addEventListener("click",resumeButton);
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
  if(e.code==="Space"){e.preventDefault();resumeButton();}
  if(/^[1-8]$/.test(e.key)&&(S.phase==="prep"||S.phase==="battle")){
   S.selected=IDS[Number(e.key)-1];buildCards();
  }
 });
 let previous=performance.now(),acc=0;
 function frame(now){
  const delta=Math.min(.09,Math.max(0,(now-previous)/1000));previous=now;
  S.clock+=delta;
  if(S.phase==="prep"){
   S.prep=Math.max(0,S.prep-delta);
   if(S.prep<=0){
    S.phase="battle";S.botThink=4;
    $("prepBanner").classList.remove("visible");
    $("fieldHint").textContent="城を守り、前哨基地を奪おう。自軍の青い範囲に部隊を召喚できる。";
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