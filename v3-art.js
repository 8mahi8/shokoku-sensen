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
 suppress:["#e8a16a","#5b5c83"],sentinel:["#8ca6d5","#303e63"],guardian:["#8ca7ad","#416f79"],drone:["#6ce1cc","#425e9d"],tank:["#d4bb86","#557885"],
 duelist:["#d1a2e1","#554988"],crusher:["#d68b74","#68424e"],ranger_engineer:["#8fc8ad","#315b72"],interceptor:["#e6c17d","#436a89"],ground_bomber:["#b9cf79","#426787"],
 piercer:["#96cbdf","#3c5c8f"],catapult:["#bb9a73","#564858"],kamikaze:["#ecb779","#963c65"],mech_summoner:["#72c5b9","#3a6577"],small_machine:["#a7d5ca","#365977"],kaiju:["#6a997e","#344c67"],
 barrage:["#bd7e48","#392c47"],ward:["#398c96","#303a78"],gravity:["#886add","#2a427b"],gale:["#6aca8b","#367b86"]
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

function sentinel(g,p,s){
 const {step,hit,t}=s;
 // Frontline interceptor, with a wide tower shield and short sweeping blade.
 limb(g,-17,-21+step*1.2,13,21,"#31495d");
 limb(g,5,-21-step*1.2,14,21,"#31495d");
 round(g,-22,-7+step*1.2,23,9,4,"#243947");
 round(g,3,-7-step*1.2,22,9,4,"#243947");
 path(g,[[-23,-49],[-17,-61],[17,-61],[27,-48],[19,-21],[-20,-21]],"#536b87",INK,3);
 path(g,[[-22,-48],[-39,-44],[-35,-24],[-20,-27]],p.primary,INK,2.8);
 path(g,[[19,-50],[36,-45],[32,-26],[19,-27]],p.primary,INK,2.8);
 round(g,-14,-47,30,29,6,p.deep,INK,3);
 round(g,-5,-41,16,18,4,"#1b354d",p.accent,1.7);
 crystal(g,3,-34,6,p.glow);
 helm(g,1,-60,p,p.deep);
 path(g,[[-9,-72],[-5,-83],[5,-76],[13,-81],[14,-66]],"#a9b8cc",INK,2.5);
 // Distinct crescent-topped shield, shown on the leading arm.
 g.save();g.translate(-24+hit*9,-31-hit*3);
 path(g,[[-13,-21],[6,-23],[19,-15],[17,9],[0,25],[-16,9]],"#2a4961",INK,3.2);
 path(g,[[-8,-13],[5,-16],[11,-11],[10,6],[0,15],[-9,6]],p.deep,p.accent,2);
 line(g,[[0,-11],[0,13]],p.glow,2.6);line(g,[[-6,0],[6,0]],p.glow,2.6);
 g.restore();
 // A heavy warding blade sweeps forward when engaging intruders.
 line(g,[[17,-29],[31+hit*12,-39]],"#617b8a",8);
 line(g,[[17,-29],[31+hit*12,-39]],p.accent,3);
 path(g,[[29+hit*12,-43],[43+hit*14,-71],[40+hit*14,-31],[35+hit*12,-25]],METAL,INK,2.5);
 line(g,[[38+hit*13,-60],[39+hit*13,-33]],p.glow,2.2);
 if(Math.sin(t*2.4)>.5){oval(g,-29,-16,2.5,2.5,p.glow,null);}
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
 path(g,[[31,-51],[44+hit*19,-45-hit*13],[36+hit*19,-24-hit*5],[24,-30]],p.primary,INK,2);
 path(g,[[-16,-72],[-8,-88],[0,-80],[11,-87],[20,-72]],"#9bb8b5",INK,3);
 oval(g,0,-65,19,16,p.deep,INK,3);
 line(g,[[-11,-66],[-2,-63]],p.glow,3);line(g,[[4,-63],[13,-66]],p.glow,3);
 chest(g,1,-41,p,12);
 for(const x of [-18,15])line(g,[[x,-34],[x+3,-24]],p.accent,3);
}
function drone(g,p,s){
 const {t}=s;const flap=Math.sin(t*6.2)*7;
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
 line(g,[[10,-56],[51-hit*13,-59]],"#2f4b58",13);
 line(g,[[13,-57],[51-hit*13,-59]],p.accent,3);
 round(g,48-hit*13,-67,12,16,3,INK,p.accent,2);
 crystal(g,1,-38,9,p.glow);
 path(g,[[-34,-28],[-29,-37],[-26,-24]],p.accent,null);
}

/* Five stage-one units use the same Canvas pose renderer and palette as the
 * nine original units. Distinct silhouettes, not a placeholder infantry copy.
 * When adding future characters, add a sprite function and registry metadata. */
function duelist(g,p,s){
 const {step,hit,windup}=s;
 limb(g,-10,-21+step*2,10,21,p.deep);limb(g,4,-21-step*2,11,21,p.deep);
 path(g,[[-16,-44],[-9,-53],[12,-50],[19,-35],[10,-18],[-15,-20]],p.primary,INK,2.8);
 path(g,[[-12,-42],[-26,-52],[-22,-26]],p.cloth,INK,2.2);
 chest(g,2,-34,p,5);helm(g,1,-56,p);
 line(g,[[-9,-35],[-22+hit*8,-25],[0+hit*16,-60]],METAL,5);
 line(g,[[11,-34],[29+hit*11,-22],[48+hit*16,-49]],METAL,5);
 line(g,[[0+hit*16,-60],[4+hit*16,-71]],p.glow,3.5);
 line(g,[[48+hit*16,-49],[53+hit*16,-58]],p.glow,3.5);
 if(windup>0.1)oval(g,28,-36,4,4,p.accent,null);
}
function crusher(g,p,s){
 const {step,hit,windup}=s;
 limb(g,-18,-21+step*2,17,23,"#53616a");limb(g,5,-21-step*2,17,23,"#53616a");
 path(g,[[-26,-50],[-19,-58],[21,-57],[31,-43],[22,-19],[-23,-18]],p.primary,INK,3.4);
 round(g,-21,-48,42,26,6,p.deep,INK,3);chest(g,0,-34,p,9);
 round(g,-15,-71,28,24,6,"#455766",INK,3);line(g,[[-4,-60],[8,-60]],p.glow,3);
 const swing=-windup*.48+hit*.48;
 g.save();g.translate(14,-37);g.rotate(swing);
 line(g,[[0,0],[44,-35]],METAL,8);
 round(g,35,-72,30,38,6,"#8c9aa6",INK,3.6);
 line(g,[[38,-63],[57,-63]],p.accent,4);crystal(g,50,-52,7,p.glow);
 g.restore();
}
function ranger_engineer(g,p,s){
 const {step,hit}=s;
 limb(g,-12,-18+step*2,12,20,"#365669");limb(g,3,-18-step*2,13,20,"#365669");
 path(g,[[-19,-49],[-11,-57],[16,-54],[22,-40],[16,-20],[-16,-20]],p.primary,INK,2.9);
 chest(g,2,-37,p,6);helm(g,0,-58,p,"#2c5c6d");
 // A long-distance capture launcher with a flag-like marker.
 round(g,13,-43,44,11,4,"#77969a",INK,2.7);
 line(g,[[18,-38],[63+hit*8,-38]],p.accent,3.5);
 path(g,[[63+hit*8,-44],[74+hit*8,-38],[63+hit*8,-32]],p.glow,INK,1.5);
 line(g,[[-18,-36],[-18,-79]],METAL,3);
 path(g,[[-17,-76],[3,-68],[-17,-59]],p.glow,INK,2);
}
function interceptor(g,p,s){
 const {step,hit,t}=s;
 // Fast armored wheel-mount: distinguish from the capture scout by shield/dual fins.
 oval(g,-22,0,12,10,"#263a48","#0d2635",2.7);oval(g,21,0,12,10,"#263a48","#0d2635",2.7);
 oval(g,-22,0,5,5,p.glow,null);oval(g,21,0,5,5,p.glow,null);
 path(g,[[-33,-12],[-8,-26],[20,-19],[32,-8],[21,4],[-25,3]],p.deep,INK,3);
 path(g,[[-25,-24],[-38,-37],[-17,-30]],p.accent,INK,2);
 limb(g,-6,-24,10,13,p.deep);
 path(g,[[-10,-54],[-3,-63],[12,-58],[18,-38],[0,-30]],p.primary,INK,2.6);
 helm(g,2,-62,p);chest(g,6,-42,p,5);
 path(g,[[-16,-54],[-22,-65],[-10,-75],[0,-65],[-2,-47]],p.accent,INK,2.4);
 line(g,[[15,-42],[42+hit*10,-40]],METAL,4.5);
 path(g,[[50+hit*10,-40],[39+hit*10,-47],[39+hit*10,-33]],p.glow,INK,2);
 if(Math.sin(t*6)>0)line(g,[[-38,-6],[-50,-6]],p.glow,2);
}
function ground_bomber(g,p,s){
 const {hit,t}=s;
 const hover=Math.sin(t*5)*2;
 path(g,[[-45,-38],[-16,-53],[5,-51],[44,-35],[28,-24],[-28,-26]],p.primary,INK,3);
 path(g,[[-51,-42],[-32,-60],[-17,-49],[-30,-31]],p.deep,INK,2.6);
 path(g,[[49,-41],[30,-60],[16,-48],[29,-30]],p.deep,INK,2.6);
 oval(g,0,-44+hover,19,18,"#354957",INK,3);
 oval(g,0,-44+hover,11,12,p.accent,INK,2.4);
 crystal(g,1,-44+hover,7,p.glow);
 path(g,[[-14,-28],[-8,-7],[9,-7],[15,-28]],"#6b7c81",INK,3);
 oval(g,0,-10,10,5,p.glow,null);
 if(hit>.1){line(g,[[-9,-5],[-17,8]],p.accent,3);line(g,[[9,-5],[17,8]],p.accent,3);}
}
// Stage 2 silhouettes are distinct and readable at small iPad canvas sizes.
function piercer(g,p,s){
 const hit=s.hit,step=s.step;
 limb(g,-10,-19+step,10,18,p.deep);limb(g,3,-19-step,10,18,p.deep);
 path(g,[[-15,-46],[-5,-57],[13,-52],[17,-23],[-12,-22]],p.primary,INK,2.6);
 round(g,-13,-57,24,16,5,p.deep,INK,2);
 oval(g,-1,-59,8,6,"#182e42",p.accent,1.7);
 chest(g,1,-34,p,5);
 // Long-barreled piercing crossbow with a clearly visible rail.
 line(g,[[6,-36],[45+hit*7,-37]],METAL,6);
 line(g,[[14,-39],[47+hit*9,-39]],p.glow,2.8);
 path(g,[[44+hit*9,-46],[55+hit*9,-37],[44+hit*9,-29]],p.accent,INK,1.8);
 line(g,[[26,-54],[31,-37],[26,-20]],p.accent,2.7);
}
function catapult(g,p,s){
 const hit=s.hit,step=s.step;
 for(const x of [-30,29]){
  oval(g,x,-7+step*.35,16,17,"#253e48",INK,3);
  oval(g,x,-7+step*.35,8,9,p.accent,INK,2);
 }
 path(g,[[-42,-31],[-28,-45],[25,-45],[44,-29],[32,-11],[-31,-11]],p.deep,INK,3.5);
 round(g,-28,-43,56,21,5,p.primary,INK,2.5);
 line(g,[[-8,-35],[-4,-87-hit*8]],"#45535f",12);
 line(g,[[-5,-83-hit*8],[35+hit*8,-93+hit*6]],METAL,9);
 oval(g,34+hit*8,-94+hit*6,14,10,"#364958",INK,2.5);
 crystal(g,34+hit*8,-99+hit*6,8,p.glow);
 line(g,[[-25,-29],[21,-29]],p.accent,3.5);
 round(g,-12,-56,24,12,4,"#273847",INK,2);
}
function kamikaze(g,p,s){
 const hover=Math.sin(s.t*5)*2,hit=s.hit;
 path(g,[[-46,-36+hover],[-19,-55+hover],[22,-57+hover],[48,-34+hover],[20,-25+hover],[-19,-25+hover]],p.deep,INK,3.1);
 path(g,[[-20,-48+hover],[-12,-71+hover],[29,-52+hover],[32,-35+hover]],p.primary,INK,2.5);
 path(g,[[31+hit*12,-45+hover],[51+hit*14,-36+hover],[31+hit*12,-28+hover]],p.accent,INK,2);
 round(g,-13,-43+hover,24,13,6,"#243746",p.accent,2.4);
 crystal(g,12,-38+hover,8,p.glow);
 path(g,[[-38,-29+hover],[-21,-19+hover],[-8,-27+hover]],"#e5a866",INK,2.1);
 path(g,[[-38,-39+hover],[-60,-40+hover],[-45,-30+hover]],p.glow,null);
}
function mech_summoner(g,p,s){
 const step=s.step,hit=s.hit,t=s.t;
 for(const x of [-18,18])limb(g,x-8,-19+(x<0?step:-step),16,23,"#3c5461");
 path(g,[[-30,-56],[-20,-62],[22,-62],[31,-53],[26,-21],[-25,-21]],p.deep,INK,3.2);
 round(g,-22,-55,44,32,7,p.primary,INK,3);
 oval(g,0,-38,14,14,"#203845",p.accent,2.5);
 crystal(g,0,-38,9,p.glow);
 oval(g,0,-65,14,11,p.deep,INK,2.5);
 line(g,[[-7,-65],[8,-65]],p.glow,3);
 line(g,[[0,-74],[0,-88]],METAL,3);
 oval(g,0,-91,4+Math.sin(t*4),4,p.glow,null);
 round(g,22,-48,13,21,4,p.accent,INK,2);
 if(hit>0)crystal(g,31,-30,4,p.glow);
}
// Original low, heavy fortress beast with a side-view horn and armored back.
function kaiju(g,p,s){
 const walk=s.step*3;
 path(g,[[-25,-37],[-49,-45],[-52,-28],[-36,-19],[-25,-19]],"#54765f",INK,3);
 path(g,[[-49,-44],[-65,-62],[-61,-31],[-52,-28]],p.accent,INK,2.4);
 for(const x of [-27,-7,18]){
  const lift=walk*(x<0?1:-1);
  round(g,x-12,-22+lift,22,25,6,"#385562",INK,3);
  round(g,x-16,-1+lift,27,8,4,"#466f6a",INK,2);
 }
 path(g,[[-36,-49],[-22,-70],[6,-72],[29,-60],[40,-42],[30,-20],[-31,-22]],"#5e897c",INK,3.8);
 path(g,[[-29,-61],[-21,-88],[-8,-67],[0,-93],[13,-67],[20,-80],[25,-57]],"#d0c18e",INK,2.6);
 path(g,[[11,-67],[31,-78],[48,-64],[48,-43],[35,-32],[17,-42]],"#6a9a89",INK,3.3);
 path(g,[[34,-65],[58+s.hit*5,-74],[47,-50]],"#dfd49b",INK,2.5);
 oval(g,29,-54,5,4,"#1c2a32",p.glow,1.8);
 line(g,[[37,-39],[47,-37]],"#234744",3);
 path(g,[[-25,-38],[-9,-50],[7,-39],[16,-28],[-12,-25]],"#315665",INK,2.7);
 crystal(g,-4,-44,7,p.glow);
}
function small_machine(g,p,s){
 const step=s.step,hit=s.hit;
 for(const x of [-9,8])limb(g,x-6,-12+(x<0?step:-step),11,15,"#354754");
 round(g,-18,-36,36,26,6,p.deep,INK,2.4);
 round(g,-13,-32,26,17,4,p.primary,INK,2.1);
 oval(g,0,-26,6,5,p.glow,p.accent,1.5);
 line(g,[[15,-24],[29+hit*7,-19]],METAL,5);
 path(g,[[25+hit*7,-26],[35+hit*7,-19],[25+hit*7,-12]],p.accent,INK,1.5);
 line(g,[[0,-39],[4,-46]],p.accent,2);
}
const SPRITES={infantry,scout,engineer,archer,suppress,sentinel,guardian,drone,tank,duelist,crusher,ranger_engineer,interceptor,ground_bomber,piercer,catapult,kamikaze,mech_summoner,small_machine,kaiju};
function paint(g,key,team,clock=0,unit={}){
 const p=PALETTES[team]||PALETTES[1];
 const moving=!!unit.walking;
 const step=moving?Math.sin((unit.walkPhase||clock*5)*.76)*.9:Math.sin(clock*1.45+(unit.uid||0))*.14;
 const attack=Math.max(0,Math.min(1,(unit.attackAnim||0)/(unit.attackAnimMax||.34)));
 const hit=attack>0?Math.sin((1-attack)*PI)*1:0;
 const windup=Math.max(0,Math.min(1,unit.windup||0));
 const state={step,hit,t:clock,unit,windup};
 g.save();g.lineJoin="round";g.lineCap="round";
 // Amplify individual motion at the new camera scale without changing hitboxes.
 const momentum={infantry:8,scout:12,engineer:9,archer:3,sentinel:10,
  suppress:2,guardian:13,drone:4,tank:-11}[key]??4;
 const brace=key==="guardian"?7:key==="tank"?5:key==="sentinel"?4:2;
 const recoil=hit*(key==="tank"||key==="guardian"?.075:.035);
 const spring=moving?Math.abs(Math.sin(unit.walkPhase||clock*6))*.018:0;
 g.scale(1+spring+recoil,1-spring*.6-recoil*.7);
 if(team===2)g.scale(-1,1);
 g.translate(momentum*hit-windup*brace,-Math.sin(clock*1.45+(unit.uid||0))*(moving?1.2:.7));
 if(key==="guardian")g.rotate(-windup*.085+hit*.10);
 else if(key==="sentinel")g.rotate(-windup*.07+hit*.06);
 else if(key==="engineer")g.rotate(-windup*.055+hit*.04);
 else if(key==="scout")g.rotate(-windup*.065);
 const reaction=Math.max(0,1-Math.max(0,clock-(unit.hitAt??-100))/.31);
 if(reaction>0){
  g.translate(-reaction*(key==="guardian"||key==="tank"?3:5),-reaction*2);
  g.rotate(-reaction*(key==="guardian"||key==="tank"?.018:.05));
 }
 (SPRITES[key]||infantry)(g,p,state);
 if(unit.flash>0){
  g.globalAlpha=Math.min(.35,unit.flash*1.4);oval(g,0,-40,25,40,"#ffffff",null);
 }
 g.restore();
}
const UNIT_SCALE={infantry:.93,scout:.99,engineer:1.07,archer:.94,suppress:1.12,sentinel:1.11,guardian:1.73,drone:1.08,tank:1.79,
 duelist:.98,crusher:1.13,ranger_engineer:1.00,interceptor:1.06,ground_bomber:1.10,
 piercer:1.06,catapult:1.66,kamikaze:1.02,mech_summoner:1.09,small_machine:.72,kaiju:1.62};
const BODY_HEIGHT={infantry:77,scout:83,engineer:85,archer:83,suppress:78,sentinel:87,guardian:97,drone:64,tank:73,
 duelist:80,crusher:93,ranger_engineer:82,interceptor:86,ground_bomber:66,
 piercer:85,catapult:100,kamikaze:72,mech_summoner:94,small_machine:54,kaiju:96};
// Changes are visual only: gameplay movement, collision, range and cost remain unchanged.
function drawUnit(g,u,clock){
 // The Gald sprite cache replaces only the guardian artwork. Retain the
 // original Canvas guardian as a safe fallback while loading or on error.
 if(u.key==="guardian"&&window.GaldArt?.drawUnit(g,u,clock))return;
 const flying=u.key==="drone"||u.key==="ground_bomber",heavy=u.key==="guardian"||u.key==="tank"||u.key==="kaiju";
 const bob=flying?20+Math.sin(clock*4+(u.drift||0))*4:0;
 const size=UNIT_SCALE[u.key]||.95;
 const recoil=Math.max(0,(u.attackAnim||0)/(u.attackAnimMax||.34));
 const impact=recoil>0?Math.sin((1-recoil)*PI):0;
 const direction=u.team===1?1:-1;
 const entering=Number.isFinite(u.spawnAt)?Math.max(0,Math.min(1,(clock-u.spawnAt)/(u.spawnDuration||.45))):1;
 const appear=.5-.5*Math.cos(PI*entering);
 const death=Math.max(0,Math.min(1,u.deathProgress||0));
 g.save();g.globalAlpha*=Math.max(0,1-death*death);
 g.translate(u.x,u.y);
 if(entering<1){
  g.save();g.globalAlpha*=.7*(1-entering);
  g.strokeStyle=u.team===1?"#76dfff":"#ff9da9";g.lineWidth=heavy?4:2.4;
  g.beginPath();g.ellipse(0,4,15+appear*(heavy?41:26),7+appear*(heavy?19:12),0,0,TAU);g.stroke();
  if(heavy){g.beginPath();g.ellipse(0,4,8+appear*31,5+appear*13,0,0,TAU);g.stroke();}
  g.restore();
 }
 if(death>0){
  g.rotate(direction*death*(heavy?.48:.78));
  g.translate(direction*(heavy?12:18)*death,(heavy?12:18)*death);
 }
 oval(g,2,5,(heavy?32:22)*size,flying?7:9,"#0a222a9b",null);
 if(u.walking){
  // Distinct running/hovering cues; these are drawn rather than persistent particles.
  if(u.key==="scout"||u.key==="tank"){
   g.save();g.globalAlpha=.30;g.strokeStyle=u.team===1?"#91eeff":"#ffb8bc";
   g.lineWidth=heavy?3.8:2.5;g.lineCap="round";
   for(let i=0;i<3;i++){
    const xx=-direction*(17+i*12),yy=-4+i*2;
    g.beginPath();g.moveTo(xx,yy);g.lineTo(xx-direction*(11+i*4),yy);g.stroke();
   }
   g.restore();
  }
  if(heavy){
   g.save();g.globalAlpha=.28+.16*Math.abs(Math.sin(u.walkPhase||0));
   g.strokeStyle="#dbe7cf";g.lineWidth=2;
   g.beginPath();g.ellipse(0,3,23+Math.abs(Math.sin((u.walkPhase||0)*.76))*5,7,0,0,TAU);g.stroke();g.restore();
  }
 }
 g.save();g.translate(0,-bob-(1-appear)*(heavy?18:13));
 g.scale(size*(.73+.27*appear),size*(.73+.27*appear));
 paint(g,u.key,u.team,clock,u);
 if(impact>.08){
  // Character-local strike glints emphasize the action without filling the whole screen.
  const p=PALETTES[u.team]||PALETTES[1];
  g.save();g.globalAlpha=impact*(heavy||u.key==="sentinel"?.9:.55);g.strokeStyle=p.glow;g.lineWidth=heavy?3.6:2.4;
  const px=u.key==="tank"?58:u.key==="suppress"?45:u.key==="archer"?40:u.key==="guardian"?35:u.key==="sentinel"?36:27;
  const py=u.key==="tank"?-59:u.key==="archer"?-40:-35;
  g.beginPath();g.moveTo(direction*px-7,py-9);g.lineTo(direction*px+7,py+9);
  g.moveTo(direction*px+7,py-9);g.lineTo(direction*px-7,py+9);g.stroke();
  if(heavy||u.key==="sentinel"){
   g.beginPath();g.ellipse(0,1,u.key==="guardian"?46:u.key==="tank"?39:25,11,0,0,TAU);g.stroke();
  }
  g.restore();
 }
 if(flying){
  g.save();g.strokeStyle="#a1effa66";g.lineWidth=1.7;g.setLineDash([3,4]);
  g.beginPath();g.moveTo(0,-9);g.lineTo(0,18);g.stroke();g.restore();
 }
 g.restore();g.restore();
 if(death===0&&u.hp<u.max){
  const y=u.y-(BODY_HEIGHT[u.key]*size+bob+10);
  const ratio=Math.max(0,Math.min(1,u.hp/u.max));
  round(g,u.x-22,y,44,6,3,"#132d36",null);
  round(g,u.x-21,y+1,42*ratio,4,2,TEAMFILL(u.team),null);
 }
}
function TEAMFILL(team){return team===2?"#ff879b":"#7ddcf6";}
function paintSpell(g,key,team,w,h){
 const cx=w*.52,cy=h*.52;
 g.save();g.translate(cx,cy);g.lineCap="round";
 if(key==="barrage"){
  for(let i=2;i>=0;i--){
   const radius=8+i*14;
   oval(g,0,4,radius,radius*.64,i===0?"#f7d3a7":"#ffa64a18",i===0?"#fcf0d5":i===1?"#f8b16466":"#eeb27748",2.5);
  }
  path(g,[[-48,-29],[-12,-13],[-5,3],[-26,-3]],"#f3a85d","#fff0bb",2);
  path(g,[[-35,-34],[-10,-15],[10,-5],[15,8],[1,17],[-15,14],[-20,-4]],"#ef864e","#572c43",2.8);
  path(g,[[-19,-19],[6,-9],[20,2],[20,12],[7,20],[-8,12],[-10,-4]],"#ffc373","#fff0bf",2);
  crystal(g,12,7,10,"#fff2bb");
 }else if(key==="gale"){
  oval(g,0,0,38,26,"#8fffc528","#c5ffe1",3);
  for(const offset of [-18,0,18])line(g,[[-41,offset],[6,offset-8],[35,offset-17]],"#c8ffce",4);
  path(g,[[5,16],[23,-7],[38,5]],"#8affba",INK,2.2);
 }else if(key==="gravity"){
  oval(g,0,0,37,29,"#a879ff22","#d6c8ff",3);
  for(let i=0;i<3;i++){
   const theta=i*TAU/3,xx=Math.cos(theta)*29,yy=Math.sin(theta)*20;
   oval(g,xx,yy,7,5,"#7e67da","#e4d5ff",1.4);
   line(g,[[xx,yy],[xx*.45,yy*.45]],"#a8b8ff",2);
  }
  crystal(g,0,0,12,"#e3c7ff");
 }else{
  g.strokeStyle="#aefafa";g.lineWidth=3;
  oval(g,0,0,39,26,"#4de8dd25","#77fff3aa",2.4);
  path(g,[[0,-29],[25,-15],[22,11],[0,29],[-22,11],[-25,-15]],"#62e5dc44","#d6ffff",3.3);
  path(g,[[0,-19],[16,-10],[15,8],[0,20],[-15,8],[-16,-10]],"#6bdcff78","#eafcf9",1.5);
  crystal(g,0,0,12,"#edfff7");
  for(let i=0;i<5;i++){
   const a=i*TAU/5;oval(g,Math.cos(a)*38,Math.sin(a)*25,2.5,2.5,"#b5ffff",null);
  }
 }
 g.restore();
}
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
 if(key==="guardian"&&window.GaldArt?.drawPortrait(g,w,h,team)){
  // High-quality Gald sprite is ready.
 }else if(key==="barrage"||key==="ward"||key==="gravity"||key==="gale")paintSpell(g,key,team,w,h);
 else{
  g.save();g.translate(w*.51,h*.97);
  const artScale=Math.min(w/128,h/72)*.78;
  g.scale(artScale,artScale);
  paint(g,key,team,0,{uid:1,flash:0,walking:false});
  g.restore();
 }
 g.fillStyle="#ffffff35";round(g,8,8,3,16,1,g.fillStyle,null);
 g.restore();
}
window.KokokuArt={drawUnit,drawPortrait,version:"1.2-stage3-kaiju-gale"};
})();
