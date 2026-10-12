/* 小国戦線 III — キャラクターアート v1
 * 完全にプログラムで描画するオリジナル2Dキャラ。外部画像・有料生成・依存ライブラリ不要。
 * 描画のみを担当し、HP/速度/射程/AIなど戦闘ルールには干渉しません。
 */
(()=>{
"use strict";
const PI=Math.PI,TAU=PI*2,INK="#102632",METAL="#d7e3dc",GOLD="#efcb77";
const PALETTES={
  1:{primary:"#82c9e2",deep:"#34677f",bright:"#e5f9fc",glow:"#56e7ff",cloth:"#34658a",accent:"#f5cb6c"},
  2:{primary:"#f1a5ad",deep:"#914e64",bright:"#fff2df",glow:"#ff728b",cloth:"#894960",accent:"#f5c576"}
};
const UNIT_COLORS={
 infantry:["#4d99b8","#294c75"],scout:["#efcc79","#346e89"],engineer:["#d7a963","#3b6574"],archer:["#a784dc","#435d8f"],
 suppress:["#e8a16a","#5b5c83"],guardian:["#8ca7ad","#416f79"],drone:["#6ce1cc","#425e9d"],tank:["#d4bb86","#557885"]
};
function path(g,points,fill,stroke=INK,lineWidth=2.4){
 g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();
 if(fill){g.fillStyle=fill;g.fill();}
 if(stroke){g.strokeStyle=stroke;g.lineWidth=lineWidth;g.stroke();}
}
function round(g,x,y,w,h,r,fill,stroke=INK,lw=2.4){
 r=Math.min(r,w/2,h/2);g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);
 g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();
 if(fill){g.fillStyle=fill;g.fill();}
 if(stroke){g.strokeStyle=stroke;g.lineWidth=lw;g.stroke();}
}
function oval(g,x,y,rx,ry,fill,stroke=INK,lw=2){
 g.beginPath();g.ellipse(x,y,rx,ry,0,0,TAU);
 if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw;g.stroke();}
}
function line(g,points,color=INK,width=3){
 g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));
 g.lineCap="round";g.lineJoin="round";g.lineWidth=width;g.strokeStyle=color;g.stroke();
}
function crystal(g,x,y,r,color){
 g.save();g.shadowColor=color;g.shadowBlur=9;
 path(g,[[x,y-r],[x+r*.78,y],[x,y+r],[x-r*.78,y]],color,"#f1fffe",1.2);
 g.restore();oval(g,x-r*.17,y-r*.28,r*.17,r*.3,"#ffffff",null);
}
function limb(g,x,y,a,b,fill,outline=INK){round(g,x,y,a,b,4,fill,outline,2.5);}
function helm(g,x,y,p,style){
 oval(g,x,y,12,11,p.primary,INK,2.5);
 path(g,[[x-10,y-4],[x-6,y-15],[x+3,y-18],[x+11,y-9],[x+11,y-4]],style||p.deep,INK,2);
 round(g,x+1,y-5,12,6,2,INK,"#182b37",1);
 line(g,[[x+5,y-3],[x+10,y-3]],p.glow,2.3);
}
function chest(g,x,y,p,r=8){crystal(g,x,y,r,p.glow);}
function infantry(g,p,s){
 const {step,hit}=s;
 path(g,[[-12,-39],[-24,-49],[-20,-15],[-9,-16]],p.cloth,INK,2.5); // cape
 limb(g,-11,-18+step*3,10,19,p.deep);limb(g,3,-18-step*3,10,19,p.deep);
 round(g,-13,-5+step*3,16,8,4,"#284653");
 round(g,0,-5-step*3,17,8,4,"#284653");
 path(g,[[-14,-40],[-8,-48],[11,-45],[17,-34],[12,-17],[-10,-17]],p.primary,INK,2.8);
 line(g,[[-13,-30],[14,-28]],p.deep,4);
 chest(g,4,-32,p,6);
 // compact embossed shield, instantly identifies the frontline soldier
 g.save();g.translate(-15,-28);
 path(g,[[-9,-13],[3,-16],[9,-11],[9,8],[0,17],[-9,9]],p.deep,INK,3);
 line(g,[[-3,-10],[-3,10]],p.accent,2.5);line(g,[[-6,-2],[5,-2]],p.accent,2.5);g.restore();
 helm(g,1,-53,p,p.deep);
 path(g,[[-8,-61],[-7,-68],[6,-68],[11,-62]],p.primary,INK,2);
 // spear with gold point
 line(g,[[17,-5],[23+hit*8,-67]],"#3c4b56",4);
 line(g,[[17,-5],[23+hit*8,-67]],p.accent,1.4);
 path(g,[[23+hit*8,-73],[17+hit*8,-60],[29+hit*8,-60]],METAL,INK,1.6);
}
function scout(g,p,s){
 const {step,hit,t}=s;
 // hoverrunner bike, large wheels and fluttering pennant
 oval(g,-20,0,13,10,"#253740","#0a2635",3);oval(g,22,0,13,10,"#253740","#0a2635",3);
 oval(g,-20,0,6,5,p.glow,null);oval(g,22,0,6,5,p.glow,null);
 path(g,[[-26,-9],[-14,-20],[13,-19],[31,-8],[22,3],[-17,5]],p.deep,INK,3);
 line(g,[[-17,-10],[20,-10]],p.accent,3.5);
 path(g,[[-5,-10],[9,-20],[30,-15],[18,-7]],p.primary,INK,2);
 line(g,[[-24,-14],[-29,-7]],p.glow,3);
 // scarf trails behind
 path(g,[[-9,-47],[-30,-49],[-41,-44+step*2],[-23,-39],[-8,-40]],p.accent,INK,2);
 limb(g,-10,-19,11,16,p.deep);
 path(g,[[-13,-47],[-7,-55],[8,-51],[14,-32],[-8,-27]],p.primary,INK,2.5);
 helm(g,2,-55,p,p.primary);
 path(g,[[4,-68],[1,-78],[11,-70]],p.accent,INK,2);
 chest(g,7,-40,p,4.5);
 // glowing lance
 line(g,[[17,-34],[35+hit*7,-55]],METAL,4);
 path(g,[[42+hit*7,-59],[29+hit*7,-58],[36+hit*7,-46]],p.glow,INK,2);
 // speed flare
 if(step>0.25){line(g,[[-35,-12],[-44,-12]],p.glow,2);}
}
function engineer(g,p,s){
 const {step,hit}=s;
 // wide reinforced exosuit with bright reactor and heavy ram
 limb(g,-16,-22+step*1.4,15,24,"#495c66");
 limb(g,4,-22-step*1.4,17,24,"#495c66");
 round(g,-22,-8+step*1.4,22,10,4,"#344750");
 round(g,2,-8-step*1.4,24,10,4,"#344750");
 path(g,[[-25,-50],[-17,-56],[20,-54],[27,-44],[23,-18],[-24,-18]],"#b88c53",INK,3.2);
 round(g,-21,-47,39,25,5,p.primary,INK,3);
 path(g,[[-26,-45],[-39,-42],[-40,-26],[-26,-23]],"#c7b8a1",INK,2.8);
 path(g,[[18,-47],[33,-41],[31,-24],[20,-21]],p.deep,INK,3);
 round(g,-10,-40,24,20,5,"#3a5260",p.accent,2);
 chest(g,2,-30,p,7);
 round(g,-14,-71,28,23,7,p.deep,INK,3);
 path(g,[[-18,-63],[-13,-75],[9,-77],[17,-66]],p.primary,INK,2.8);
 round(g,-5,-61,19,8,3,INK,null);
 line(g,[[0,-58],[10,-58]],p.glow,3);
 // ram/drill arm
 line(g,[[27,-38],[37+hit*12,-30]],"#465763",12);
 line(g,[[27,-38],[37+hit*12,-30]],p.accent,4);
 round(g,30+hit*12,-39,17,17,4,"#526876",INK,2.8);
 path(g,[[55+hit*12,-30],[43+hit*12,-39],[43+hit*12,-21]],METAL,INK,2.7);
 for(let i=0;i<3;i++)line(g,[[-18+i*9,-21],[-14+i*9,-21]],p.accent,2);
}
function archer(g,p,s){
 const {step,hit,t}=s;
 // tall pointed wizard hood + independent radiant arc bow
 path(g,[[-12,-49],[-20,-14],[-9,0],[12,-1],[18,-30],[13,-52]],p.cloth,INK,3);
 path(g,[[-19,-17],[-26,-5],[-6,-8]],p.deep,INK,2);
 limb(g,-9,-15+step,9,17,"#354d72");limb(g,3,-15-step,9,17,"#354d72");
 path(g,[[-13,-49],[-7,-61],[10,-60],[18,-37],[10,-18],[-13,-20]],"#836ac6",INK,2.8);
 line(g,[[-9,-30],[12,-32]],p.accent,3);chest(g,3,-37,p,5);
 path(g,[[-15,-57],[-9,-74],[5,-81],[16,-59],[11,-47],[-7,-47]],p.cloth,INK,2.5);
 oval(g,0,-56,9,9,"#f3ceb6",INK,1.9);
 line(g,[[3,-57],[11,-57]],p.glow,2.5);
 // spellbow is elegant and recognizable even at small resolution
 line(g,[[14,-34],[26+hit*6,-38]],p.primary,5);
 g.save();g.shadowBlur=7;g.shadowColor=p.glow;
 g.beginPath();g.moveTo(27,-60);g.quadraticCurveTo(47+hit*5,-40,27,-18);
 g.strokeStyle=p.glow;g.lineWidth=4;g.stroke();g.restore();
 line(g,[[27,-60],[27,-18]],"#f1f9ed",1.1);
 crystal(g,29+hit*9,-39,7,p.glow);
 if(Math.sin(t*3)>.2)oval(g,-15,-24,2,2,p.glow,null);
}
function suppress(g,p,s){
 const {step,hit,t}=s;
 limb(g,-16,-16+step,15,18,"#465565");limb(g,6,-16-step,17,18,"#465565");
 path(g,[[-29,-42],[-23,-52],[21,-52],[28,-37],[21,-12],[-25,-13]],"#bb7958",INK,3);
 round(g,-23,-48,46,30,7,p.deep,INK,2.5);
 for(let i=0;i<3;i++)line(g,[[-13+i*11,-43],[-13+i*11,-31]],p.accent,3);
 oval(g,0,-55,17,14,p.primary,INK,3);
 round(g,-8,-61,20,9,3,INK,null);
 crystal(g,7,-57,4,p.glow);
 line(g,[[16,-36],[38+hit*9,-29]],"#34434b",14);
 line(g,[[16,-36],[38+hit*9,-29]],p.accent,5);
 oval(g,43+hit*9,-28,10,11,"#344b56",INK,2);
 crystal(g,43+hit*9,-28,6,p.glow);
}
function guardian(g,p,s){
 const {step,hit,t}=s;
 path(g,[[-22,-46],[-39,-31],[-35,-12],[-21,-14]],"#6c858b",INK,3);
 path(g,[[22,-46],[38,-30],[34,-12],[21,-16]],"#6c858b",INK,3);
 round(g,-25,-21+step,21,25,6,p.deep,INK,3);
 round(g,6,-21-step,21,25,6,p.deep,INK,3);
 path(g,[[-31,-55],[-17,-65],[19,-65],[31,-54],[30,-25],[18,-18],[-20,-18],[-31,-33]],"#759ca5",INK,4);
 path(g,[[-31,-51],[-44,-47],[-36,-24],[-24,-30]],"#9fb7b2",INK,2);
 path(g,[[31,-51],[44+hit*7,-45],[36+hit*7,-24],[24,-30]],p.primary,INK,2);
 path(g,[[-16,-72],[-8,-88],[0,-80],[11,-87],[20,-72]],"#9bb8b5",INK,3);
 oval(g,0,-65,19,16,p.deep,INK,3);
 line(g,[[-11,-66],[-2,-63]],p.glow,3);line(g,[[4,-63],[13,-66]],p.glow,3);
 chest(g,1,-41,p,12);
 for(const x of [-18,15])line(g,[[x,-34],[x+3,-24]],p.accent,3);
}
function drone(g,p,s){
 const {t}=s;const flap=Math.sin(t*8)*7;
 // levitating quad-wing fae reconnaissance drone
 path(g,[[-13,-34],[-40,-49-flap],[-36,-20],[-11,-21]],p.deep,INK,2.8);
 path(g,[[13,-34],[40,-49-flap],[36,-20],[11,-21]],p.primary,INK,2.8);
 path(g,[[-9,-24],[-31,-11+flap*.35],[-11,-11]],"#5c949e",INK,2);
 path(g,[[9,-24],[31,-11+flap*.35],[11,-11]],"#5c949e",INK,2);
 path(g,[[-17,-40],[-7,-51],[12,-51],[22,-40],[17,-24],[-14,-24]],p.deep,INK,3);
 oval(g,0,-39,15,11,"#254e67",p.accent,2);
 crystal(g,4,-40,9,p.glow);
 oval(g,-26,-48-flap,5,5,p.glow,null);
 oval(g,26,-48-flap,5,5,p.glow,null);
 line(g,[[-5,-24],[0,-15],[6,-24]],p.accent,2.5);
}
function tank(g,p,s){
 const {step,hit,t}=s;
 // arcane siege carriage / war crawler
 round(g,-37,-11,33,19,7,"#263e4b",INK,3);
 round(g,7,-11,33,19,7,"#263e4b",INK,3);
 for(const x of [-29,-18,17,28])oval(g,x,0,5,6,p.accent,INK,1);
 path(g,[[-42,-20],[-31,-50],[18,-55],[35,-41],[39,-20]],p.deep,INK,3);
 path(g,[[-32,-40],[-24,-57],[13,-62],[30,-42],[22,-20],[-29,-20]],"#94a9ad",INK,3);
 path(g,[[-26,-34],[-15,-43],[10,-45],[22,-33],[14,-26],[-21,-26]],p.primary,INK,2);
 round(g,-9,-64,29,16,5,p.deep,INK,3);
 line(g,[[10,-56],[51+hit*7,-59]],"#2f4b58",13);
 line(g,[[13,-57],[51+hit*7,-59]],p.accent,3);
 round(g,48+hit*7,-67,12,16,3,INK,p.accent,2);
 crystal(g,1,-38,9,p.glow);
 path(g,[[-34,-28],[-29,-37],[-26,-24]],p.accent,null);
}
const SPRITES={infantry,scout,engineer,archer,suppress,guardian,drone,tank};
function paint(g,key,team,clock=0,unit={}){
 const p=PALETTES[team]||PALETTES[1];
 const moving=!!unit.walking;
 const step=moving?Math.sin(unit.walkPhase||clock*6)*.9:Math.sin(clock*1.9+(unit.uid||0))*.16;
 const attack=Math.max(0,Math.min(1,(unit.attackAnim||0)/.34));
 const hit=attack>0?Math.sin((1-attack)*PI)*1:0;
 const state={step,hit,t:clock,unit};
 g.save();g.lineJoin="round";g.lineCap="round";
 if(team===2)g.scale(-1,1);
 // subtle breath, foot animation, and faction accent in silhouette
 g.translate(0,-Math.sin(clock*2.1+(unit.uid||0))*.65);
 (SPRITES[key]||infantry)(g,p,state);
 if(unit.flash>0){
  g.globalAlpha=Math.min(.35,unit.flash*1.4);oval(g,0,-40,25,40,"#ffffff",null);
 }
 g.restore();
}
function drawUnit(g,u,clock){
 const flying=u.key==="drone";const bob=flying?16+Math.sin(clock*4+(u.drift||0))*3:0;
 g.save();g.translate(u.x,u.y);
 oval(g,2,4,flying?23:Math.max(14,((u.key==="engineer"||u.key==="guardian"||u.key==="tank")?29:19)),flying?6:8,"#0a222a80",null);
 if(u.key==="scout"&&u.walking){g.globalAlpha=.45;oval(g,-28,2,10,3,"#c9dfc5",null);g.globalAlpha=1;}
 g.translate(0,-bob);paint(g,u.key,u.team,clock,u);
 if(flying){g.save();g.strokeStyle="#a1effa66";g.lineWidth=1.5;g.setLineDash([3,4]);g.beginPath();g.moveTo(0,-8);g.lineTo(0,16);g.stroke();g.restore();}
 g.restore();
 if(u.hp<u.max){
  const y=u.y-(u.key==="guardian"?100: u.key==="archer"?92: u.key==="scout"?87: u.key==="engineer"?86: u.key==="drone"?bob+65: u.key==="tank"?73:77);
  const ratio=Math.max(0,Math.min(1,u.hp/u.max));
  round(g,u.x-21,y,42,6,3,"#132d36",null);
  round(g,u.x-20,y+1,40*ratio,4,2,TEAMFILL(u.team),null);
 }
}
function TEAMFILL(team){return team===2?"#ff879b":"#7ddcf6";}
function drawPortrait(canvas,key,team=1){
 if(!canvas||!canvas.getContext)return;
 const g=canvas.getContext("2d");if(!g)return;
 const w=canvas.width,h=canvas.height;
 g.save();g.clearRect(0,0,w,h);
 const colors=UNIT_COLORS[key]||UNIT_COLORS.infantry;
 const grad=g.createLinearGradient(0,0,w,h);
 grad.addColorStop(0,colors[0]);grad.addColorStop(1,colors[1]);
 round(g,1,1,w-2,h-2,9,grad,null);
 // translucent crest ring, consistent across all cards
 g.strokeStyle="#ffffff3b";g.lineWidth=2;
 g.beginPath();g.arc(w*.54,h*.48,34,0,TAU);g.stroke();
 g.fillStyle="#071f3140";g.beginPath();g.ellipse(w*.54,h*.86,32,8,0,0,TAU);g.fill();
 g.save();g.translate(w*.51,h*.93);g.scale(.99,.99);
 paint(g,key,team,0,{uid:1,flash:0,walking:false});
 g.restore();
 g.fillStyle="#ffffff35";round(g,8,8,3,16,1,g.fillStyle,null);
 g.restore();
}
window.KokokuArt={drawUnit,drawPortrait,version:"1.0"};
})();
