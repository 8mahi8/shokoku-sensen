"use strict";
/* Shokoku Sensen / BOT alpha 1 - local deterministic-ish simulation, no network */
(() => {
 const $ = id => document.getElementById(id);
 const canvas = $("world"), ctx = canvas.getContext("2d");
 const mini = $("minimap"), mc = mini.getContext("2d");
 const field = $("field"), actions = $("actions");
 const W=24,H=48,T=48, WW=W*T,WH=H*T;
 const colors={blue:"#5fb7ee",red:"#f17b83",neutral:"#b7b59a",gold:"#e4c57e"};
 const unitsDef={
  infantry:{name:"歩兵",cost:3,hp:95,damage:13,range:48,speed:93,cd:.83,sight:185,r:9,type:"ground",desc:"安価な基本部隊"},
  rifle:{name:"射撃兵",cost:4,hp:75,damage:15,range:142,speed:76,cd:1.0,sight:212,r:9,type:"ground",desc:"遠距離射撃"},
  shield:{name:"盾兵",cost:4,hp:190,damage:12,range:48,speed:62,cd:1.0,sight:167,r:11,type:"ground",desc:"前線の耐久役"},
  anti:{name:"対戦車兵",cost:4,hp:83,damage:18,range:138,speed:72,cd:1.18,sight:220,r:9,type:"ground",desc:"車両に特効"},
  scout:{name:"偵察兵",cost:2,hp:50,damage:7,range:68,speed:142,cd:.75,sight:305,r:7,type:"ground",desc:"高速・広い視界"},
  armored:{name:"装甲車",cost:6,hp:210,damage:20,range:118,speed:92,cd:1,sight:230,r:14,type:"vehicle",desc:"高速な車両"},
  tank:{name:"戦車",cost:9,hp:350,damage:36,range:150,speed:64,cd:1.5,sight:245,r:17,type:"vehicle",desc:"強力な突破役"},
  mortar:{name:"迫撃砲",cost:7,hp:72,damage:39,range:255,speed:49,cd:2.4,sight:305,r:12,type:"ground",desc:"遠距離の範囲攻撃"}
 };
 const buildDef={
  power:{name:"発電所",cost:10,sec:7,cols:2,rows:2,hp:220,desc:"資源 +0.38/秒"},
  barracks:{name:"兵舎",cost:7,sec:5,cols:2,rows:2,hp:245,desc:"盾兵・対戦車・偵察"},
  factory:{name:"車両工場",cost:14,sec:8,cols:3,rows:3,hp:310,desc:"装甲車・戦車"},
  artillery:{name:"砲兵施設",cost:11,sec:8,cols:3,rows:2,hp:265,desc:"迫撃砲"},
  turret:{name:"防衛砲台",cost:7,sec:5,cols:2,rows:2,hp:260,desc:"周囲の敵を自動攻撃"},
  radar:{name:"監視塔",cost:4,sec:3,cols:1,rows:1,hp:130,desc:"周囲の視界が広がる"}
 };
 const unlockedBy={barracks:["shield","anti","scout"],factory:["armored","tank"],artillery:["mortar"]};
 const state={playing:false,paused:false,over:false,seconds:360,tick:0,uid:1,bid:1,
  money:[0,12,12],baseRate:1.2,units:[],buildings:[],zones:[],effects:[],
  tab:"units",selected:{kind:"unit",id:"infantry"},targetLanes:[0,1,2],lastBot:0,botBuild:0,
  camera:{x:WW/2,y:WH-430,zoom:1},pointer:{x:0,y:0},noticeUntil:0,noticeText:"",
  orders:[[null,"advance","advance","advance"],[null,"advance","advance","advance"]]
 };
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const rand=(a,b)=>a+Math.random()*(b-a);
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const zoneAt=(x,y)=>{
  const c=Math.floor(x/T),r=Math.floor(y/T);
  if(c<0||c>=W||r<0||r>=H)return null;
  if(r<14||r>=34)return null;
  return state.zones[Math.floor((r-14)/10)*3+Math.floor(c/8)];
 };
 const ownerAt=(x,y)=>{
  const r=Math.floor(y/T);
  if(r<0||r>=H||x<0||x>=WW)return 0;
  if(r<14)return 2;
  if(r>=34)return 1;
  const z=zoneAt(x,y);return z?z.owner:0;
 };
 const buildingCenter=b=>({x:(b.col+b.cols/2)*T,y:(b.row+b.rows/2)*T});
 const colTeam=t=>t===1?colors.blue:t===2?colors.red:colors.neutral;
 const activeBuildings=(team,type)=>state.buildings.filter(b=>b.team===team&&b.type===type&&b.hp>0&&b.progress>=1);
 const unlocked=(team,u)=>{
  if(u==="infantry"||u==="rifle")return true;
  return Object.keys(unlockedBy).some(b=>unlockedBy[b].includes(u)&&activeBuildings(team,b).length>0);
 };
 const income=team=>state.baseRate+activeBuildings(team,"power").length*.38;
 const notify=(message)=>{state.noticeText=message;state.noticeUntil=performance.now()+2400;$("notice").textContent=message;$("notice").classList.add("active")};
 const laneFor=x=>clamp(Math.floor(x/(WW/3)),0,2);
 const laneX=lane=>(lane+.5)*(WW/3);
 const hpFraction=team=> {
  const b=state.buildings.find(x=>x.team===team&&x.type==="capital");
  return b?Math.max(0,b.hp/b.max):0;
 };
 function addBuilding(team,type,col,row,done){
  let def=buildDef[type],isFort=type==="fort",isCapital=type==="capital";
  const b={id:state.bid++,team,type,col,row,cols:isCapital?4:isFort?2:def.cols,rows:isCapital?4:isFort?2:def.rows,
   max:isCapital?1650:isFort?460:def.hp,hp:isCapital?1650:isFort?460:def.hp,progress:done?1:0,
   sec:isCapital||isFort?0:def.sec,cooldown:0};
  state.buildings.push(b);return b;
 }
 function reset(){
  state.playing=true;state.paused=false;state.over=false;state.seconds=360;state.tick=0;
  state.uid=1;state.bid=1;state.money=[0,12,12];state.units=[];state.buildings=[];state.effects=[];
  state.zones=Array.from({length:6},(_,i)=>({id:i,row:Math.floor(i/3),lane:i%3,owner:0,claim:0,progress:0}));
  state.targetLanes=[0,1,2];state.lastBot=0;state.botBuild=0;
  state.orders=[[null,"advance","advance","advance"],[null,"advance","advance","advance"]];
  addBuilding(1,"capital",10,42,true);addBuilding(2,"capital",10,2,true);
  addBuilding(1,"fort",3,36,true);addBuilding(1,"fort",19,36,true);
  addBuilding(2,"fort",3,10,true);addBuilding(2,"fort",19,10,true);
  state.camera.zoom=Math.min(1.02,Math.max(.58,(field.clientWidth-55)/WW));
  state.camera.x=WW/2;state.camera.y=WH-410;
  state.tab="units";state.selected={kind:"unit",id:"infantry"};
  $("pause").textContent="一時停止";$("overlay").classList.add("hidden");
  renderTabs();renderActions();updateHud();
  notify("BOT戦開始！ 兵士を召喚して領土を確保しよう");
 }
 function canPlace(team,type,col,row){
  const d=buildDef[type];if(!d)return false;
  if(col<0||row<0||col+d.cols>W||row+d.rows>H)return false;
  for(let y=row;y<row+d.rows;y++)for(let x=col;x<col+d.cols;x++){
   if(ownerAt((x+.5)*T,(y+.5)*T)!==team)return false;
  }
  for(const b of state.buildings)if(b.hp>0&&col<b.col+b.cols&&col+d.cols>b.col&&row<b.row+b.rows&&row+d.rows>b.row)return false;
  return true;
 }
 function build(team,type,col,row){
  const d=buildDef[type];
  if(!d||state.money[team]<d.cost||!canPlace(team,type,col,row))return false;
  state.money[team]-=d.cost;addBuilding(team,type,col,row,false);
  if(team===1)notify(d.name+"を建設中（"+d.sec+"秒）");
  return true;
 }
 function spawn(team,type,x,y){
  const d=unitsDef[type];if(!d||!unlocked(team,type)||state.money[team]<d.cost)return false;
  if(ownerAt(x,y)!==team)return false;
  if(state.units.filter(u=>u.team===team).length>=75)return false;
  for(const b of state.buildings){
   if(b.hp<=0)continue;
   if(x>b.col*T-12&&x<(b.col+b.cols)*T+12&&y>b.row*T-12&&y<(b.row+b.rows)*T+12)return false;
  }
  state.money[team]-=d.cost;
  const lane=laneFor(x);
  state.units.push({id:state.uid++,team,type,x,y,homeX:x,lane,hp:d.hp,max:d.hp,atk:d.damage,cd:rand(.1,.35),angle:team===1?-Math.PI/2:Math.PI/2});
  return true;
 }
 function moveToward(u,tx,ty,dt,mult){
  const dx=tx-u.x,dy=ty-u.y,dd=Math.hypot(dx,dy);
  if(dd>2){
   const speed=unitsDef[u.type].speed*(mult||1);
   u.x+=dx/dd*Math.min(dd,speed*dt);u.y+=dy/dd*Math.min(dd,speed*dt);
   u.x=clamp(u.x,9,WW-9);u.y=clamp(u.y,9,WH-9);
   u.angle=Math.atan2(dy,dx);
  }
 }
 function targetFor(u){
  const d=unitsDef[u.type];
  let best=null,score=1e9;
  for(const enemy of state.units){
   if(enemy.hp<=0||enemy.team===u.team)continue;
   const r=dist(u,enemy),reach=d.sight+25;
   if(r>reach)continue;
   let priority=r;
   if(u.type==="anti"&&unitsDef[enemy.type].type==="vehicle")priority-=110;
   if(u.type==="mortar")priority+=40;
   if(priority<score){score=priority;best={obj:enemy,x:enemy.x,y:enemy.y,r:unitsDef[enemy.type].r,building:false}}
  }
  for(const b of state.buildings){
   if(b.hp<=0||b.team===u.team)continue;
   const c=buildingCenter(b),r=Math.hypot(u.x-c.x,u.y-c.y);
   if(r>d.sight+35)continue;
   let priority=r+15;
   if(u.type==="tank"||u.type==="mortar")priority-=55;
   if(priority<score){score=priority;best={obj:b,x:c.x,y:c.y,r:Math.max(b.cols,b.rows)*T*.37,building:true}}
  }
  return best;
 }
 function frontGoal(team,lane){
  const dir=team===1?-1:1,mode=state.orders[team-1][lane+1],x=laneX(lane);
  if(mode==="retreat")return {x,y:team===1?WH-400:400};
  if(mode==="defend")return {x,y:team===1?WH-720:720};
  if(mode==="capture"){
   const order=team===1?[1,0]:[0,1];
   const desired=order.map(r=>state.zones[r*3+lane]).find(z=>z.owner!==team);
   if(desired)return {x,y:(14+desired.row*10+5)*T};
  }
  return {x,y:team===1?140:WH-140};
 }
 function updateUnits(dt){
  for(const u of state.units){
   if(u.hp<=0)continue;
   const def=unitsDef[u.type];u.cd=Math.max(0,u.cd-dt);
   const target=targetFor(u);
   const goal=frontGoal(u.team,u.lane);
   if(target){
    const separation=Math.hypot(u.x-target.x,u.y-target.y);
    if(separation<=def.range+target.r){
     u.angle=Math.atan2(target.y-u.y,target.x-u.x);
     if(u.cd<=0){
      let damage=def.damage;
      if(u.type==="anti"&&!target.building&&unitsDef[target.obj.type].type==="vehicle")damage*=2.45;
      if(u.type==="mortar"){
       for(const other of state.units){
        if(other.team!==u.team&&other.hp>0&&Math.hypot(other.x-target.x,other.y-target.y)<57)other.hp-=damage*.7;
       }
       if(!target.building)target.obj.hp+=damage*.7;
      }
      target.obj.hp-=damage;u.cd=def.cd;
      state.effects.push({x:target.x,y:target.y,time:.23,r:u.type==="mortar"?35:10,team:u.team});
     }
    }else moveToward(u,target.x,target.y,dt);
   }else{
    if(Math.hypot(u.x-goal.x,u.y-goal.y)>28)moveToward(u,goal.x,goal.y,dt);
   }
  }
  state.units=state.units.filter(u=>u.hp>0);
 }
 function updateBuildings(dt){
  for(const b of state.buildings){
   if(b.hp<=0)continue;
   if(b.progress<1){
    b.progress=Math.min(1,b.progress+dt/b.sec);
    if(b.progress===1&&b.team===1)notify(buildDef[b.type].name+"完成！");
    continue;
   }
   if(b.type!=="fort"&&b.type!=="capital"&&b.type!=="turret")continue;
   b.cooldown=Math.max(0,b.cooldown-dt);
   if(b.cooldown>0)continue;
   const c=buildingCenter(b);
   const range=b.type==="capital"?230:b.type==="fort"?195:172;
   let target=null,best=1e9;
   for(const u of state.units){
    if(u.team===b.team||u.hp<=0)continue;
    const d=Math.hypot(c.x-u.x,c.y-u.y);
    if(d<range&&d<best){best=d;target=u;}
   }
   if(target){
    target.hp-=b.type==="capital"?28:b.type==="fort"?22:18;
    b.cooldown=b.type==="capital"?.9:b.type==="fort"?1.08:1.15;
    state.effects.push({x:target.x,y:target.y,r:14,time:.18,team:b.team});
   }
  }
  for(const e of state.effects)e.time-=dt;
  state.effects=state.effects.filter(e=>e.time>0);
  let blueHq=state.buildings.find(b=>b.team===1&&b.type==="capital");
  let redHq=state.buildings.find(b=>b.team===2&&b.type==="capital");
  if(blueHq.hp<=0){endGame(false,"首都が破壊された");return;}
  if(redHq.hp<=0){endGame(true,"敵首都を破壊した");return;}
  state.buildings=state.buildings.filter(b=>b.hp>0||b.type==="fort"||b.type==="capital");
 }
 function canCapture(team,z){
  if(team===1&&z.row===1)return true;
  if(team===2&&z.row===0)return true;
  const neighbors=state.zones.filter(v=>Math.abs(v.row-z.row)+Math.abs(v.lane-z.lane)===1);
  return neighbors.some(v=>v.owner===team);
 }
 function updateCapture(dt){
  for(const z of state.zones){
   const xa=z.lane*8*T,xb=(z.lane+1)*8*T,ya=(14+z.row*10)*T,yb=(24+z.row*10)*T;
   let a=0,b=0;
   for(const u of state.units){
    if(u.hp>0&&u.x>=xa&&u.x<xb&&u.y>=ya&&u.y<yb){if(u.team===1)a++;else b++;}
   }
   let contender=a&&!b?1:b&&!a?2:0;
   if(!contender||contender===z.owner||!canCapture(contender,z)){
    z.progress=Math.max(0,z.progress-dt*.4);
    if(z.progress===0)z.claim=0;
    continue;
   }
   if(z.claim!==contender){z.claim=contender;z.progress=0;}
   z.progress+=dt;
   if(z.progress>=5){
    z.owner=contender;z.progress=0;z.claim=0;
    if(contender===1)notify(["左","中央","右"][z.lane]+"方面の領土を確保！");
    else notify("敵が"+["左","中央","右"][z.lane]+"方面の領土を占領");
    renderActions();
   }
  }
 }
 function botPlacement(type){
  const d=buildDef[type],minRow=2,maxRow=14-d.rows;
  for(let attempt=0;attempt<35;attempt++){
   const col=Math.floor(rand(1,W-d.cols-1)),row=Math.floor(rand(minRow,maxRow));
   if(canPlace(2,type,col,row))return {col,row};
  }
  return null;
 }
 function botBuild(type){
  const p=botPlacement(type);
  return p?build(2,type,p.col,p.row):false;
 }
 function botSpawn(type,lane){
  let x=laneX(lane)+rand(-95,95),y=rand(11*T,13*T);
  if(ownerAt(x,y)!==2)y=12*T;
  for(let n=0;n<8;n++){
   const sx=clamp(x+rand(-55,55),20,WW-20),sy=y-rand(0,56);
   if(spawn(2,type,sx,sy))return true;
  }
  return false;
 }
 function updateBot(dt){
  state.lastBot+=dt;state.botBuild+=dt;
  if(state.botBuild>7){
   state.botBuild=0;
   const powers=activeBuildings(2,"power").length;
   if(powers<2&&state.money[2]>=buildDef.power.cost+3)botBuild("power");
   else if(!activeBuildings(2,"barracks").length&&state.money[2]>=12)botBuild("barracks");
   else if(!activeBuildings(2,"factory").length&&state.seconds<260&&state.money[2]>=18)botBuild("factory");
   else if(!activeBuildings(2,"artillery").length&&state.seconds<160&&state.money[2]>=18)botBuild("artillery");
   else if(state.money[2]>27&&powers<4)botBuild("power");
   else if(state.money[2]>22&&Math.random()<.4)botBuild("turret");
  }
  if(state.lastBot<rand(2.7,3.3))return;
  state.lastBot=0;
  const blueUnits=state.units.filter(u=>u.team===1);
  let danger=[0,0,0];
  for(const u of blueUnits)if(u.y<WH*.66)danger[laneFor(u.x)]+=u.type==="tank"?3:1;
  let lane=Math.random()<.48?danger.indexOf(Math.max(...danger)):Math.floor(rand(0,3));
  let options=["infantry","rifle","infantry","rifle"];
  if(unlocked(2,"anti")&&blueUnits.some(u=>unitsDef[u.type].type==="vehicle"))options.push("anti","anti");
  if(unlocked(2,"shield"))options.push("shield");
  if(unlocked(2,"tank")&&state.money[2]>=13)options.push("tank");
  if(unlocked(2,"armored")&&state.money[2]>=10)options.push("armored");
  if(unlocked(2,"mortar"))options.push("mortar");
  for(let i=0;i<3;i++){
   const type=options[Math.floor(Math.random()*options.length)];
   if(botSpawn(type,lane))break;
  }
 }
 function endGame(win,reason){
  if(state.over)return;
  state.over=true;state.playing=false;
  $("dialogTitle").textContent=win?"勝利！":"敗北";
  $("dialogText").textContent=reason+"。もう一度挑戦して戦略を磨こう。";
  $("instructions").innerHTML="残り時間："+formatTime(state.seconds)+"<br>自軍資源："+Math.floor(state.money[1])+"　／　敵軍資源："+Math.floor(state.money[2])+"<br>※ BOTの判断・兵種性能は初期調整中の仮設定です。";
  $("start").textContent="再戦する";
  $("overlay").classList.remove("hidden");
 }
 function formatTime(n){n=Math.ceil(Math.max(n,0));return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");}
 function timeResult(){
  const destroyed=team=>state.buildings.filter(b=>b.team===team&&b.type==="fort"&&b.hp<=0).length;
  let pointsBlue=destroyed(2),pointsRed=destroyed(1),win;
  if(pointsBlue!==pointsRed)win=pointsBlue>pointsRed;
  else{
   const damageOnRed=state.buildings.filter(b=>b.team===2&&(b.type==="capital"||b.type==="fort")).reduce((a,b)=>a+(1-Math.max(0,b.hp/b.max)),0);
   const damageOnBlue=state.buildings.filter(b=>b.team===1&&(b.type==="capital"||b.type==="fort")).reduce((a,b)=>a+(1-Math.max(0,b.hp/b.max)),0);
   if(Math.abs(damageOnRed-damageOnBlue)<.001){endDraw();return;}
   win=damageOnRed>damageOnBlue;
  }
  endGame(win,"時間切れ・固定砦と拠点へのダメージで判定");
 }
 function endDraw(){
  if(state.over)return;
  state.over=true;state.playing=false;
  $("dialogTitle").textContent="引き分け";
  $("dialogText").textContent="拠点の破壊数・ダメージ量も同点。";
  $("instructions").textContent="もう一度プレイして戦術を試そう。";
  $("start").textContent="再戦する";$("overlay").classList.remove("hidden");
 }
 function step(dt){
  if(!state.playing||state.paused||state.over)return;
  state.tick+=dt;state.seconds-=dt;
  state.money[1]=Math.min(80,state.money[1]+income(1)*dt);
  state.money[2]=Math.min(80,state.money[2]+income(2)*dt);
  updateBot(dt);updateUnits(dt);updateBuildings(dt);updateCapture(dt);
  if(state.seconds<=0)timeResult();
 }
 function resize(){
  const w=field.clientWidth,h=field.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  canvas.style.width=w+"px";canvas.style.height=h+"px";
  state.camera.x=clamp(state.camera.x,w/(2*state.camera.zoom),Math.max(w/(2*state.camera.zoom),WW-w/(2*state.camera.zoom)));
 }
 function viewSize(){return {w:field.clientWidth,h:field.clientHeight};}
 function cameraClamp(){
  const s=viewSize(),c=state.camera,hw=s.w/(2*c.zoom),hh=s.h/(2*c.zoom);
  c.x=hw*2>=WW?WW/2:clamp(c.x,hw,WW-hw);
  c.y=hh*2>=WH?WH/2:clamp(c.y,hh,WH-hh);
 }
 function worldToScreen(x,y){
  const c=state.camera,s=viewSize();return {x:(x-c.x)*c.zoom+s.w/2,y:(y-c.y)*c.zoom+s.h/2};
 }
 function screenToWorld(x,y){
  const c=state.camera,s=viewSize();return {x:(x-s.w/2)/c.zoom+c.x,y:(y-s.h/2)/c.zoom+c.y};
 }
 function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
 }
 function visible(u){
  if(u.team===1)return true;
  for(const ally of state.units)if(ally.team===1&&Math.hypot(ally.x-u.x,ally.y-u.y)<unitsDef[ally.type].sight)return true;
  for(const b of state.buildings)if(b.team===1&&b.hp>0&&b.progress>=1){
   const c=buildingCenter(b);
   if(Math.hypot(c.x-u.x,c.y-u.y)<(b.type==="radar"?420:b.type==="capital"?330:245))return true;
  }
  return false;
 }
 function renderWorld(){
  const s=viewSize(),c=state.camera;ctx.clearRect(0,0,s.w,s.h);
  ctx.save();ctx.translate(s.w/2-c.x*c.zoom,s.h/2-c.y*c.zoom);ctx.scale(c.zoom,c.zoom);
  ctx.fillStyle="#294637";ctx.fillRect(0,0,WW,WH);
  ctx.fillStyle="#344d3d";
  for(let y=0;y<WH;y+=T*4)for(let x=0;x<WW;x+=T*4)if((x+y/T)%3===0)ctx.fillRect(x,y,T*4,T*4);
  ctx.fillStyle="#f17b8326";ctx.fillRect(0,0,WW,14*T);
  ctx.fillStyle="#5fb7ee25";ctx.fillRect(0,34*T,WW,14*T);
  for(const z of state.zones){
   const x=z.lane*8*T,y=(14+z.row*10)*T;
   ctx.fillStyle=z.owner===1?"#59b5ef30":z.owner===2?"#ff7e8b30":"#bdb48e12";
   ctx.fillRect(x,y,8*T,10*T);
   ctx.strokeStyle="#9eb9a255";ctx.lineWidth=2;ctx.strokeRect(x+2,y+2,8*T-4,10*T-4);
   ctx.fillStyle=z.owner===1?"#70c5f7":z.owner===2?"#f58a94":"#b9b9a6";
   roundRect(ctx,x+8,y+8,124,29,7);ctx.fill();
   ctx.fillStyle="#0c2331";ctx.font="bold 17px system-ui";
   ctx.fillText(["左","中央","右"][z.lane]+" · "+(z.owner===0?"中立":z.owner===1?"青領":"赤領"),x+16,y+28);
   if(z.progress>0){
    ctx.fillStyle="#142b35";ctx.fillRect(x+8,y+42,124,8);
    ctx.fillStyle=colTeam(z.claim);ctx.fillRect(x+8,y+42,124*Math.min(z.progress/5,1),8);
   }
  }
  ctx.strokeStyle="#e4e9d71a";ctx.lineWidth=1;
  ctx.beginPath();for(let x=0;x<=WW;x+=T){ctx.moveTo(x,0);ctx.lineTo(x,WH);}
  for(let y=0;y<=WH;y+=T){ctx.moveTo(0,y);ctx.lineTo(WW,y);}ctx.stroke();
  for(const b of state.buildings){
   if(b.hp<=0)continue;
   const x=b.col*T,y=b.row*T,w=b.cols*T,h=b.rows*T;
   ctx.fillStyle="#06152270";roundRect(ctx,x+7,y+9,w-1,h-1,12);ctx.fill();
   ctx.fillStyle=b.team===1?"#27577c":"#7d3946";roundRect(ctx,x+2,y+2,w-5,h-5,10);ctx.fill();
   ctx.strokeStyle=colTeam(b.team);ctx.lineWidth=4;ctx.stroke();
   ctx.strokeStyle="#ffffff25";ctx.lineWidth=2;
   ctx.beginPath();ctx.moveTo(x+11,y+16);ctx.lineTo(x+w-14,y+16);ctx.stroke();
   ctx.fillStyle=b.type==="power"?"#ffcb69":b.type==="radar"?"#90e4ec":b.type==="capital"?"#d6effa":"#bdd1e0";
   ctx.font="bold "+(b.type==="capital"?35:25)+"px system-ui";ctx.textAlign="center";
   const symbol={power:"⚡",barracks:"▤",factory:"▣",artillery:"◎",turret:"✥",radar:"⌁",fort:"◆",capital:"⬡"}[b.type];
   ctx.fillText(symbol,x+w/2,y+h/2+10);
   ctx.font="bold 13px system-ui";ctx.fillStyle="#f5f9fc";ctx.fillText(({capital:"首都",fort:"固定砦",power:"発電所",barracks:"兵舎",factory:"車両工場",artillery:"砲兵施設",turret:"砲台",radar:"監視塔"})[b.type],x+w/2,y+h-11);
   if(b.progress<1){ctx.fillStyle="#061625a8";ctx.fillRect(x,y,w,h*(1-b.progress));}
   const hp=clamp(b.hp/b.max,0,1);
   ctx.fillStyle="#102135";ctx.fillRect(x,y-9,w,6);
   ctx.fillStyle=colTeam(b.team);ctx.fillRect(x,y-9,w*hp,6);
   ctx.textAlign="left";
  }
  for(const u of state.units){
   if(u.hp<=0||!visible(u))continue;
   const d=unitsDef[u.type];ctx.save();ctx.translate(u.x,u.y);ctx.rotate(u.angle);
   ctx.fillStyle="#071b29a0";ctx.beginPath();ctx.ellipse(3,5,d.r+3,d.r*.85,0,0,Math.PI*2);ctx.fill();
   ctx.fillStyle=u.team===1?"#48b7ee":"#ec6f7c";ctx.strokeStyle=u.team===1?"#bceaff":"#ffc2c9";ctx.lineWidth=2;
   if(d.type==="vehicle"){
    roundRect(ctx,-d.r,-d.r*.76,d.r*2,d.r*1.52,5);ctx.fill();ctx.stroke();
    ctx.fillStyle="#172e3e";roundRect(ctx,-2,-4,d.r+12,8,2);ctx.fill();
   }else{
    ctx.beginPath();ctx.moveTo(d.r+3,0);ctx.lineTo(-d.r,-d.r*.8);ctx.lineTo(-d.r,d.r*.8);ctx.closePath();ctx.fill();ctx.stroke();
   }
   ctx.restore();
   ctx.fillStyle="#071927";ctx.fillRect(u.x-14,u.y-d.r-13,28,4);
   ctx.fillStyle=u.team===1?"#68d0ff":"#ff9191";ctx.fillRect(u.x-14,u.y-d.r-13,28*Math.max(0,u.hp/u.max),4);
  }
  for(const e of state.effects){ctx.globalAlpha=Math.min(1,e.time/.22);ctx.strokeStyle=colTeam(e.team);ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,e.r*(1+(.24-e.time)),0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;
  if(state.selected.kind==="building"&&state.pointer.onField){
   const d=buildDef[state.selected.id],p=screenToWorld(state.pointer.x,state.pointer.y);
   const col=Math.floor(p.x/T),row=Math.floor(p.y/T),valid=canPlace(1,state.selected.id,col,row);
   ctx.fillStyle=valid?"#75e2ae76":"#ff7b7b66";
   ctx.fillRect(col*T,row*T,d.cols*T,d.rows*T);
   ctx.strokeStyle=valid?"#8de9b1":"#ff9999";ctx.lineWidth=3;ctx.strokeRect(col*T,row*T,d.cols*T,d.rows*T);
  }
  ctx.restore();
 }
 function renderMinimap(){
  const w=mini.width,h=mini.height,sx=w/WW,sy=h/WH;
  mc.clearRect(0,0,w,h);mc.fillStyle="#294b3a";mc.fillRect(0,0,w,h);
  mc.fillStyle="#d16c7155";mc.fillRect(0,0,w,14*T*sy);
  mc.fillStyle="#5da9e855";mc.fillRect(0,34*T*sy,w,14*T*sy);
  for(const z of state.zones){mc.fillStyle=z.owner===1?"#59adf5a0":z.owner===2?"#ed747da0":"#c6b89555";
   mc.fillRect(z.lane*8*T*sx,(14+z.row*10)*T*sy,8*T*sx,10*T*sy);
  }
  for(const b of state.buildings)if(b.hp>0){const c=buildingCenter(b);mc.fillStyle=colTeam(b.team);mc.fillRect(c.x*sx-2,c.y*sy-2,4,4);}
  for(const u of state.units)if(visible(u)){mc.fillStyle=colTeam(u.team);mc.fillRect(u.x*sx-1,u.y*sy-1,2,2);}
  const view=viewSize(),cw=view.w/state.camera.zoom,ch=view.h/state.camera.zoom;
  mc.strokeStyle="#fff";mc.lineWidth=1.5;mc.strokeRect((state.camera.x-cw/2)*sx,(state.camera.y-ch/2)*sy,cw*sx,ch*sy);
 }
 function updateHud(){
  $("money").textContent=Math.floor(state.money[1]);
  $("income").textContent="＋"+income(1).toFixed(2)+"/秒";
  $("clock").textContent=formatTime(state.seconds);
  $("blueForts").textContent=state.buildings.filter(b=>b.team===1&&b.type==="fort"&&b.hp>0).length+"/2";
  $("redForts").textContent=state.buildings.filter(b=>b.team===2&&b.type==="fort"&&b.hp>0).length+"/2";
  const s=state.selected;
  $("selection").textContent=s.kind==="unit"?(unitsDef[s.id]?unitsDef[s.id].name:""):(s.kind==="building"?buildDef[s.id].name:"命令");
  if(performance.now()>state.noticeUntil)$("notice").classList.remove("active");
 }
 const renderTabs=()=>{
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===state.tab));
 };
 function renderActions(){
  let entries=[];
  if(state.tab==="units")entries=Object.keys(unitsDef).map(id=>({id,kind:"unit",name:unitsDef[id].name,desc:unitsDef[id].desc,cost:unitsDef[id].cost,lock:!unlocked(1,id)}));
  if(state.tab==="buildings")entries=Object.keys(buildDef).map(id=>({id,kind:"building",name:buildDef[id].name,desc:buildDef[id].desc,cost:buildDef[id].cost,lock:false}));
  if(state.tab==="orders")entries=[
   {id:"advance",kind:"order",name:"進軍",desc:"敵首都に向かう",cost:0},
   {id:"capture",kind:"order",name:"領土制圧",desc:"未占領の区画へ",cost:0},
   {id:"defend",kind:"order",name:"防衛",desc:"自軍側で迎撃",cost:0},
   {id:"retreat",kind:"order",name:"撤退",desc:"後方へ移動",cost:0}
  ];
  actions.replaceChildren();
  for(const a of entries){
   const btn=document.createElement("button");btn.className="action";
   if(state.selected.kind===a.kind&&state.selected.id===a.id)btn.classList.add("active");
   btn.disabled=!!a.lock;
   const title=document.createElement("span");title.className="name";title.textContent=a.lock?"🔒 "+a.name:a.name;
   const desc=document.createElement("span");desc.className="desc";desc.textContent=a.lock?"対応施設が必要":a.desc;
   const cost=document.createElement("span");cost.className="cost";cost.textContent=a.kind==="order"?"命令":a.cost+" 資源";
   btn.append(title,desc,cost);
   btn.addEventListener("click",()=>{
    if(a.kind==="order"){
     for(const lane of state.targetLanes)state.orders[0][lane+1]=a.id;
     notify((state.targetLanes.length===3?"全方面":["左","中央","右"][state.targetLanes[0]]+"方面")+"： "+a.name+"命令");
    }
    state.selected={kind:a.kind,id:a.id};renderActions();updateHud();
   });
   actions.append(btn);
  }
 }
 function selectLanes(list){
  state.targetLanes=list;
  for(const [id,lane] of [["orderAll",null],["orderLeft",0],["orderCenter",1],["orderRight",2]]){
   $(id).classList.toggle("active",lane===null?list.length===3:list.length===1&&list[0]===lane);
  }
 }
 function tapWorld(sx,sy){
  if(!state.playing||state.paused)return;
  const p=screenToWorld(sx,sy);
  if(p.x<0||p.y<0||p.x>=WW||p.y>=WH)return;
  const s=state.selected;
  if(s.kind==="unit"){
   if(!unlocked(1,s.id)){notify("軍事施設を建築すると兵種が解放されます");return;}
   if(ownerAt(p.x,p.y)!==1){notify("自軍領土内で召喚してください");return;}
   if(!spawn(1,s.id,p.x,p.y)){notify("資源不足、建物との重複、または部隊数上限です");return;}
  }else if(s.kind==="building"){
   const col=Math.floor(p.x/T),row=Math.floor(p.y/T);
   if(!build(1,s.id,col,row))notify("資源不足・領土外・配置できない位置です");
  }else notify("作戦命令は下のカードで実行します");
  renderActions();updateHud();
 }
 function setZoom(z){
  state.camera.zoom=clamp(z,.48,1.55);cameraClamp();
 }
 let pointers=new Map(),touchDist=0,dragMoved=false,downX=0,downY=0;
 canvas.addEventListener("pointerdown",e=>{
  if(!state.playing)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);
  const r=canvas.getBoundingClientRect();let x=e.clientX-r.left,y=e.clientY-r.top;
  pointers.set(e.pointerId,{x,y});dragMoved=false;downX=x;downY=y;
  state.pointer={x,y,onField:true};
  if(pointers.size===2){const p=[...pointers.values()];touchDist=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
 });
 canvas.addEventListener("pointermove",e=>{
  const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  state.pointer={x,y,onField:true};
  if(!pointers.has(e.pointerId))return;
  const last=pointers.get(e.pointerId);pointers.set(e.pointerId,{x,y});
  if(pointers.size>=2){
   const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
   if(touchDist)setZoom(state.camera.zoom*d/touchDist);
   touchDist=d;dragMoved=true;return;
  }
  if(Math.hypot(x-downX,y-downY)>9)dragMoved=true;
  if(dragMoved){
   state.camera.x-=(x-last.x)/state.camera.zoom;
   state.camera.y-=(y-last.y)/state.camera.zoom;cameraClamp();
  }
 });
 function endPointer(e){
  if(!pointers.has(e.pointerId))return;
  pointers.delete(e.pointerId);
  const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(!dragMoved&&pointers.size===0)tapWorld(x,y);
  if(pointers.size===0)touchDist=0;
 }
 canvas.addEventListener("pointerup",endPointer);
 canvas.addEventListener("pointercancel",e=>{pointers.delete(e.pointerId);touchDist=0;dragMoved=true;});
 canvas.addEventListener("pointerleave",()=>state.pointer.onField=false);
 canvas.addEventListener("wheel",e=>{e.preventDefault();setZoom(state.camera.zoom*(e.deltaY<0?1.09:.91));},{passive:false});
 mini.addEventListener("pointerdown",e=>{
  if(!state.playing)return;e.preventDefault();
  const r=mini.getBoundingClientRect();state.camera.x=clamp((e.clientX-r.left)/r.width*WW,0,WW);
  state.camera.y=clamp((e.clientY-r.top)/r.height*WH,0,WH);cameraClamp();
 });
 document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
  state.tab=b.dataset.tab;
  state.selected=state.tab==="units"?{kind:"unit",id:"infantry"}:state.tab==="buildings"?{kind:"building",id:"power"}:{kind:"order",id:"advance"};
  renderTabs();renderActions();
 }));
 $("orderAll").addEventListener("click",()=>selectLanes([0,1,2]));
 $("orderLeft").addEventListener("click",()=>selectLanes([0]));
 $("orderCenter").addEventListener("click",()=>selectLanes([1]));
 $("orderRight").addEventListener("click",()=>selectLanes([2]));
 $("home").addEventListener("click",()=>{state.camera.x=WW/2;state.camera.y=WH-380;cameraClamp();});
 $("zoomIn").addEventListener("click",()=>setZoom(state.camera.zoom*1.2));
 $("zoomOut").addEventListener("click",()=>setZoom(state.camera.zoom/1.2));
 $("pause").addEventListener("click",()=>{
  if(!state.playing)return;
  state.paused=!state.paused;$("pause").textContent=state.paused?"再開":"一時停止";notify(state.paused?"一時停止中":"戦闘再開");
 });
 $("start").addEventListener("click",reset);
 document.addEventListener("visibilitychange",()=>{if(document.hidden&&state.playing){state.paused=true;$("pause").textContent="再開";}});
 window.addEventListener("resize",()=>{resize();cameraClamp();});
 window.addEventListener("contextmenu",e=>e.preventDefault());
 resize();cameraClamp();renderActions();
 let last=performance.now(),acc=0;
 function frame(now){
  const dt=Math.min(.1,(now-last)/1000);last=now;acc+=dt;
  let n=0;while(acc>=1/30&&n<4){step(1/30);acc-=1/30;n++;}
  if(n===4)acc=0;
  cameraClamp();renderWorld();renderMinimap();updateHud();
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
})();