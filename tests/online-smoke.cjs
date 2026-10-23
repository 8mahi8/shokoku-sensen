// Run: node tests/online-smoke.cjs (no npm dependencies)
"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const read=p=>fs.readFileSync(p,"utf8");
const net=read("online-net.js"),game=read("online-game.js");
for(const p of ["v3.js","online-net.js","online-game.js","gald-render.js","v3-art.js"]){
 new vm.Script(read(p),{filename:p});
}
for(const p of ["online-embed.html","online-ipad.html"]){
 const html=read(p);
 assert.ok(html.includes(net.trim()),"Missing current online-net.js in "+p);
 assert.ok(html.includes(game.trim()),"Missing current online-game.js in "+p);
 const inline=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 assert.ok(inline.length>=4,p+" inline scripts unexpectedly missing");
 for(const [index,script] of inline.entries())new vm.Script(script,{filename:p+"#script"+index});
 assert.ok(html.includes('id="newRoom"'),p+" lacks new room button");
}
// School HTML balance editor must be at the top of both pasteable bundles.
// It must drive actual CLASSES HP/base-damage numbers, not display-only labels.
const classStart=game.indexOf("const CLASSES={");
const classEnd=game.indexOf("const IDS=Object.keys(CLASSES);",classStart);
assert.ok(classStart>0&&classEnd>classStart,"Online unit stat block missing");
const initializeClasses=new Function("window",game.slice(classStart,classEnd)+";return CLASSES;");
const originalClasses=initializeClasses({});
const schoolKeys=Object.keys(originalClasses);
assert.equal(schoolKeys.length,9,"Only nine playable unit types, no spells");
let defaultEditor=null;
for(const pageName of ["online-ipad.html","online-embed.html"]){
 const html=read(pageName);
 const tag=html.match(/<script id="shokoku-school-unit-stats">([\s\S]*?)<\/script>/);
 assert.ok(tag,pageName+" school tuning script must exist");
 assert.ok(html.indexOf(tag[0])<html.indexOf("<style>"),"Tuning table must be visible at the beginning");
 const globals={};new vm.Script(tag[1],{filename:pageName+"#balance"}).runInNewContext({window:globals});
 const table=globals.SHOKOKU_UNIT_STATS;
 assert.deepEqual(Object.keys(table).sort(),schoolKeys.slice().sort(),"All characters must be editable");
 for(const id of schoolKeys){
  assert.equal(table[id].hp,originalClasses[id].hp,pageName+" default HP "+id);
  assert.equal(table[id].damage,originalClasses[id].damage,pageName+" default damage "+id);
 }
 if(defaultEditor)assert.equal(tag[1],defaultEditor,"Both Google Sites bundles must use same values");
 defaultEditor=tag[1];
 const baseline=initializeClasses(globals);
 for(const id of schoolKeys){
  assert.equal(baseline[id].hp,originalClasses[id].hp);
  assert.equal(baseline[id].damage,originalClasses[id].damage);
 }
 const edited={...table,infantry:{hp:177,damage:29},guardian:{hp:2222,damage:147}};
 const result=initializeClasses({SHOKOKU_UNIT_STATS:edited});
 assert.equal(result.infantry.hp,177,"Infantry HP is a runtime stat");
 assert.equal(result.infantry.damage,29,"Infantry damage is a runtime stat");
 assert.equal(result.guardian.hp,2222,"Guardian HP is a runtime stat");
 assert.equal(result.guardian.damage,147,"Guardian damage is a runtime stat");
 assert.equal(result.infantry.cost,originalClasses.infantry.cost,"Editing HP must not change cost");
 assert.equal(result.guardian.splashScale,originalClasses.guardian.splashScale,
  "Editing base damage must not change splash ratio");
 for(const id of schoolKeys.filter(x=>!["infantry","guardian"].includes(x))){
  assert.equal(result[id].hp,originalClasses[id].hp,id+" HP remains default");
  assert.equal(result[id].damage,originalClasses[id].damage,id+" damage remains default");
 }
 const bad=initializeClasses({SHOKOKU_UNIT_STATS:{
  infantry:{hp:-1,damage:Infinity},guardian:{hp:"200",damage:999999}
 }});
 assert.equal(bad.infantry.hp,originalClasses.infantry.hp,"Invalid HP ignored");
 assert.equal(bad.infantry.damage,originalClasses.infantry.damage,"Invalid damage ignored");
 assert.equal(bad.guardian.hp,originalClasses.guardian.hp,"Non-numeric HP ignored");
 assert.equal(bad.guardian.damage,originalClasses.guardian.damage,"Out-of-range damage ignored");
}
assert.ok(!read("online.html").includes('id="shokoku-school-unit-stats"'),
 "Published modular online.html keeps its original balanced defaults");

const page=read("online.html");
assert.ok(page.includes('./online-net.js?v=11')&&page.includes('./online-game.js?v=17'),
 "online.html must load the current core game and network modules");
assert.ok(!page.includes('online-research.js'),"obsolete research module must not be loaded");
for(const p of ["online-ipad.html","online-embed.html"]){
 const html=read(p);
 assert.ok(!html.includes("ShokokuResearch")&&!html.includes("archiveConsent"),
  p+" must exclude unused battle-data collection");
}
assert.ok(!net.includes("ShokokuResearch")&&!net.includes("archiveRound"),
 "network transport must not include research archive hooks");
assert.ok(!game.includes("ShokokuResearch"),"game loop must not sample research data");
for(const functionName of ["sendCommand","maybePublish","finish","resultForMe","hasResult","resultReason"])
 assert.ok(net.includes("function "+functionName+"("),
  "network code must keep essential game function "+functionName);
assert.ok(page.includes('id="newRoom"'));
assert.ok(net.includes('data.round===meta.round'));
assert.ok(net.includes('packet.round!==meta?.round'));
assert.ok(net.includes('async function rematch()'));
assert.ok(net.includes('if(!host){')&&net.includes('ホストの再戦を待っています…'),"guest rematch must wait without leaving its room");
assert.ok(game.includes('$("start").addEventListener("click",()=>NET.rematch());'),"rematch button must not eject guests");
assert.ok(game.includes('NET.isHost?"同じルームで再戦":"再戦する（ホスト待ち）"'),"host and guest primary button captions differ");
assert.ok(game.includes('"ルームを退出する"'),"secondary button must clearly indicate leaving");
for(const p of ["online-ipad.html","online-embed.html"])
 assert.ok(read(p).includes('<button id="newRoom">ルームを退出する</button>'),p+" pasteable HTML must label exit separately");
assert.ok(game.includes('$("newRoom").addEventListener("click",()=>NET.resetLobby());'),"explicit leave button must remain");
assert.ok(net.includes('async function registerPresence()'));
assert.ok(net.includes('"meta/status":"finished"'));
assert.ok(game.includes('resetForLobby:'));
assert.ok(game.includes('S.remoteSprites')&&!game.includes('remoteBlend'),'Guest uses frame smoothing');
const shuffled=game.match(/function shuffledDeck\(\)\{[\s\S]*?\n\}/);
assert.ok(shuffled,'Fisher-Yates shuffle function present');
const keys=['scout','engineer','archer','barrage','sentinel','suppress','guardian','ward','drone','tank'];
const createDeck=new Function('DECK_IDS','Math',shuffled[0]+';return shuffledDeck()');
const orders=new Set();
for(let i=0;i<64;i++){
 const d=createDeck(keys,Math);
 assert.deepEqual([...d].sort(),[...keys].sort(),'No duplicate or missing card');
 orders.add(d.join(','));
}
assert.ok(orders.size>=3,'Shuffled decks must vary across matches');
assert.ok(game.includes('let deck=shuffledDeck()'),'Each team gets its own shuffled deck');
assert.ok(game.includes('for(const team of [1,2])')&&game.indexOf('let deck=shuffledDeck()')>game.indexOf('for(const team of [1,2])'),'Shuffle must happen inside the team initialization loop');
assert.ok(game.includes('blueOpening=deck.slice(0,HAND_SIZE).join(",")'),'Host opening is captured');
assert.ok(game.includes('deck.slice(0,HAND_SIZE).join(",")===blueOpening'),'Guest identical opening is rerolled');
assert.ok(game.includes('S.hand[team]=deck.slice(0,HAND_SIZE)')&&game.includes('S.queue[team]=deck.slice(HAND_SIZE)'),'Team draw uses independent deck and queue');
assert.ok(page.includes('object-fit:contain'),'Portraits must not stretch');
for(const id of ["netSolo","netGuestBot","guestBotLive"]){
 assert.ok(page.includes('id="'+id+'"'),id+" control missing");
 for(const p of ["online-ipad.html","online-embed.html"])assert.ok(read(p).includes('id="'+id+'"'),id+" missing from "+p);
}
assert.ok(net.includes('if(solo){game?.begin();return;}'),"offline rematch must work");
assert.ok(net.includes('get isHost(){return host||solo}'),"offline local simulation must tick");
assert.ok(net.includes('get botActive(){return solo||guestBot||hostBotSeat()}'),"offline, guest-operated and host-supplied BOT modes active");
assert.ok(game.includes('botPreparation()'),"BOT must enter preparation phase");
assert.ok(game.includes('if((NET.isSolo||NET.hostBot)&&S.phase==="battle")botStep(dt)'),"offline BOT and host-supplied guest BOT must think in simulation");
assert.ok(game.includes('if(NET.guestBot&&(S.phase==="prep"||S.phase==="battle"))'),"guest BOT must think from client frame");
const ai=game.slice(game.indexOf('function botExpertAction(team=2){'),game.indexOf('function botStep(dt){'));
assert.ok(ai.startsWith('function botExpertAction(team=2){'),"expert tactical AI must be present");
assert.ok(!ai.includes('deploy(2,')&&!ai.includes('castSpell(2,'),"guest AI must use normal validated commands");
assert.ok(ai.includes('botUse(team,')&&ai.includes('canPay(team,'),"AI must use validated team-aware dispatch adapter");


// Smooth both position and walk/attack animation, not just Canvas frames.
const presentStart=game.indexOf("function presentRemoteUnit(u){"),presentEnd=game.indexOf("\nfunction drawUnit(u){",presentStart);
const presentSource=presentStart>=0&&presentEnd>presentStart?game.slice(presentStart,presentEnd):null;
assert.ok(presentSource,"guest sprite interpolation function missing");
let now=1016;
const netStub={isHost:false},unit={uid:1,x:30,y:20,walkPhase:2,walking:true,attackAnim:.4,flash:.3};
const view={remoteSprites:new Map([[1,{
 x:10,y:20,targetX:30,targetY:20,vx:23,vy:0,updatedAt:1000,lastFrame:1000
}]])};
const present=new Function("NET","S","performance","Math",presentSource+";return presentRemoteUnit");
const animate=present(netStub,view,{now:()=>now},Math);
const output=animate(unit);
assert.ok(output.x>10&&output.x<35,"guest visual position should interpolate");
assert.ok(output.walkPhase>2,"walk cycle advances with displayed motion");
assert.ok(output.attackAnim<.4&&output.attackAnim>0,"attack animation progresses between snapshots");
assert.ok(output.flash<.3&&output.flash>0,"hit effect decays between snapshots");
assert.equal(unit.walkPhase,2,"authoritative snapshot must remain unchanged");
// Repeated frames should progress the same visual gait, not restart each
// time from the snapshot's walking phase.
now+=16;
const next=animate(unit);
assert.ok(next.walkPhase>output.walkPhase,"gait must advance between packets");
const sprite=view.remoteSprites.get(1);
sprite.updatedAt=now;sprite.targetX=35;
now+=16;
const nextSnapshot={...unit,walkPhase:0.3,x:35};
const afterPacket=animate(nextSnapshot);
assert.ok(afterPacket.walkPhase>=next.walkPhase,"new snapshot must not reset feet phase");
assert.equal(nextSnapshot.walkPhase,0.3,"guest walk visuals never mutate received snapshot");
// A short hitch must not advance a full unbounded number of gait cycles.
now+=500;
const aged=animate(nextSnapshot);
assert.ok(Number.isFinite(aged.walkPhase),"stalled visual gait stays finite");
assert.ok(aged.walkPhase-afterPacket.walkPhase<=16*.31+1e-9,
 "gait progress per painted frame stays bounded after a long hitch");
const stopped=animate({...nextSnapshot,walking:false});
assert.equal(stopped.walkPhase,aged.walkPhase,"stopped unit keeps last visual stance");
netStub.isHost=true;
assert.equal(animate(unit),unit,"host visuals must remain authoritative");
// Projectile and effect phases on guests must advance smoothly *without*
// changing Firebase snapshots or their host-authoritative timing/damage.
const visualStart=game.indexOf("function guestVisualTimeRemaining(");
const visualEnd=game.indexOf("\n// Both full-art and cached sprites",visualStart);
assert.ok(visualStart>0&&visualEnd>visualStart,"guest effect/projectile interpolation missing");
const visualSource=game.slice(visualStart,visualEnd);
const visualNet={isHost:false},visualState={remoteVisualReceivedAt:1000,speed:1};
const visualRemaining=new Function("NET","S",visualSource+";return guestVisualTimeRemaining")(visualNet,visualState);
const projectile={t:.5,max:.7,x:10,y:10,tx:30,ty:10},effect={t:.4,max:.5};
assert.equal(visualRemaining(projectile.t,1100),.4,"guest projectile must advance by 100ms");
assert.equal(visualRemaining(effect.t,1200),.2,"guest effect must advance by 200ms");
assert.equal(projectile.t,.5,"projectile snapshot must not be mutated");
assert.equal(effect.t,.4,"effect snapshot must not be mutated");
assert.equal(visualRemaining(.5,2000),.25,"extrapolation after lost packets is bounded");
assert.equal(visualRemaining(.2,1300),0,"expired visual should stop showing");
visualNet.isHost=true;
assert.equal(visualRemaining(.5,1150),.5,"host remains authoritative");
assert.ok(game.includes("S.remoteVisualReceivedAt=now"),"receiving a packet must reset visual time");
assert.ok(game.includes("const remaining=guestVisualTimeRemaining(shot.t,now)"),"projectile paint must interpolate");
assert.ok(game.includes("const remaining=guestVisualTimeRemaining(e.t,now)"),"effect paint must interpolate");
// Received barrage warnings, ward countdown and death echoes are visual timers,
// not 125-180ms stepped snapshots. Check both the source paths and a real
// 60FPS clock advance. No guest-time calculation may mutate the received state.
const warning={time:.5,total:.6},ward={time:1.5},dead={t:.4,maxTime:.5};
visualNet.isHost=false;
visualState.remoteVisualReceivedAt=1000;
const atFrame=1016;
assert.ok(Math.abs(visualRemaining(warning.time,atFrame)-.484)<1e-9,
 "warning ring must advance smoothly on a 16ms frame");
assert.ok(Math.abs(visualRemaining(dead.t,atFrame)-.384)<1e-9,
 "death pose must advance smoothly on a 16ms frame");
assert.ok(Math.abs(visualRemaining(ward.time,atFrame)-1.484)<1e-9,
 "ward countdown must advance on guest frames");
assert.deepEqual(warning,{time:.5,total:.6},"host-owned barrage time unchanged");
assert.deepEqual(dead,{t:.4,maxTime:.5},"host-owned death time unchanged");
assert.ok(game.includes("function drawSpellFields(now){"),"spell visuals must read frame timestamp");
assert.ok(game.includes("const remainingTime=guestVisualTimeRemaining(shot.time,now)"),
 "barrage warning ring must use display time");
assert.ok(game.includes("const remainingTime=guestVisualTimeRemaining(zone.time,now)"),
 "ward countdown must use display time");
assert.ok(game.includes("const remaining=guestVisualTimeRemaining(gone.t,now)"),
 "death animation must use display time");
assert.ok(game.includes("deathProgress:1-ratio"),"death art must use locally advanced ratio");
assert.ok(game.includes("terrain();drawSpellFields(now);"),"spell painter receives frame time");
assert.ok(!game.includes("deathProgress:1-gone.t/gone.maxTime"),
 "death art must not use stepped snapshot time");
assert.ok(net.includes("syncDiagnostics"),"network performance sampling must exist");
assert.ok(net.includes("remoteApplyFallback=setTimeout("),"stalled Safari rAF fallback missing");
assert.ok(net.includes("cancelRemoteFallback();"),"old rAF fallback must be cancellable");
assert.ok(net.includes("get hostBot(){return hostBotSeat()}"),"host BOT participation missing");
assert.ok(game.includes('(NET.isSolo||NET.hostBot)&&S.phase==="battle"'),"host BOT simulation missing");
assert.ok(game.includes("NET.isSolo||NET.hostBot"),"host BOT preparation missing");
for(const p of ["online.html","online-ipad.html","online-embed.html"])
 assert.ok(read(p).includes('id="netHostBot"'),p+" missing BOT join button");
assert.ok(game.includes("setupPerfPanel()"),"opt-in performance overlay must exist");
// Energy progress is a fraction of authoritative resource, not an inaccurate
// seconds-left countdown at a rate transition. Test both source and Sites bundle.
const fractionSource=game.match(/function nextEnergyProgress\(energy\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(fractionSource,"energy progress helper missing");
const nextEnergyProgress=new Function("ENERGY_CAP","limit",
  fractionSource+";return nextEnergyProgress")(12,(v,min,max)=>Math.max(min,Math.min(max,v)));
for(const [v,want] of [[0,0],[7,0],[7.25,.25],[7.99,.99],[8,0],[11.5,.5],[12,1],[13,1],[-1,0]]){
 assert.ok(Math.abs(nextEnergyProgress(v)-want)<1e-8,
  "next energy fraction "+v+" should equal "+want);
}
for(const p of ["online.html","online-ipad.html","online-embed.html","guest-lab-game.html"]){
 const html=read(p);
 assert.ok(html.includes('id="nextEnergyFill"'),p+" next-energy fill missing");
 assert.ok(html.includes('aria-label="次の1エネルギーまでの進捗"'),p+" accessible meter missing");
 if(p==="online.html")assert.ok(html.includes("online-game.js"),"modular online page must load energy HUD logic");
 else assert.ok(html.includes("nextEnergyProgress(energy)"),p+" dynamic energy meter missing");
 assert.ok(!html.includes('"あと "+((Math.floor(energy)+1-energy)/(rate()*S.speed))'),
  p+" old rate-based seconds-left display remains");
}


{
 // Verify the REAL shipped HUD estimator without Firebase or a live room.
 const begin=game.indexOf("function guestDisplayEnergy(");
 const end=game.indexOf("\n// The next-energy meter uses",begin);
 assert.ok(begin>=0&&end>begin,"guest-only display estimator exists");
 const state={phase:"battle",elapsed:80,speed:1,remoteVisualReceivedAt:800};
 const netRole={isHost:false},visibility={hidden:false};
 const estimate=new Function("S","NET","document","performance","ENERGY_CAP",
  game.slice(begin,end)+"\nreturn guestDisplayEnergy;")(state,netRole,visibility,{now:()=>1000},12);
 const close=(actual,expected,reason)=>assert.ok(Math.abs(actual-expected)<1e-8,
  reason+": "+actual+" != "+expected);
 close(estimate(4.2,1000),4.25,"200ms early-game gain");
 close(estimate(4.2,1200),4.2875,"350ms prediction bound");
 close(estimate(4.2,30000),4.2875,"no infinite refill during network stall");
 close(estimate(4.99,1000),4.999,"no unconfirmed whole point");
 close(estimate(11.9995,1000),11.9995,"never reduce confirmed value");
 close(estimate(12,1000),12,"energy cap 12");
 state.elapsed=99.9;
 close(estimate(2.1,1000),2.1+.1*.25+.1*.36,"100s rate switch");
 state.elapsed=209.9;
 close(estimate(2.1,1000),2.1+.1*.36+.1*.53,"210s rate switch");
 state.elapsed=269.9;
 close(estimate(2.1,1000),2.1+.1*.53+.1*.7,"270s rate switch");
 state.elapsed=80;netRole.isHost=true;
 close(estimate(4.2,1000),4.2,"host unchanged");
 netRole.isHost=false;state.phase="prep";
 close(estimate(4.2,1000),4.2,"preparation unchanged");
 state.phase="battle";visibility.hidden=true;
 close(estimate(4.2,1000),4.2,"background unchanged");
 visibility.hidden=false;state.remoteVisualReceivedAt=0;
 close(estimate(4.2,1000),4.2,"before initial remote snapshot unchanged");
 state.remoteVisualReceivedAt=999;
 close(estimate(2,1000),2.00025,"spend reanchors new authoritative value");
 state.speed=0;close(estimate(2,1000),2,"zero-speed battle unchanged");
 assert.ok(game.includes("const confirmedEnergy=limit(S.energy[ME()],0,ENERGY_CAP);"));
 assert.ok(game.includes("Math.floor(confirmedEnergy)"));
 assert.ok(game.includes("const ariaValue=confirmedEnergy.toFixed(2)"));
 assert.ok(game.includes("return S.energy[team]+1e-6>=d.cost;"),
  "card affordability remains authoritative");
 for(const p of ["online-ipad.html","online-embed.html"]){
  assert.ok(read(p).includes(game.trim()),p+" inline JS sync");
 }
 assert.ok(read("guest-lab-game.html").includes("function guestDisplayEnergy(confirmed"),
  "lab-only BOT game must include the new HUD estimator");
 console.log("PASS: bounded guest energy HUD estimation, confirmed costs, and stage boundaries");
}


{
 const fortStart=game.indexOf("function getFort(u){");
 const fortEnd=game.indexOf("\nfunction nearbyEnemy(u){",fortStart);
 assert.ok(fortStart>0&&fortEnd>fortStart);
 const fortSource=game.slice(fortStart,fortEnd);
 const fortState={difficulty:"normal",forts:[
  {x:410,y:190,owner:0},{x:633,y:444,owner:0},{x:867,y:205,owner:0}]};
 const classes={scout:{capture:1,behavior:"capture"},
  engineer:{capture:2,behavior:"capture"}};
 const getFort=new Function("CLASSES","S","qaBotVariants","dist",
  fortSource+";return getFort;")(classes,fortState,[null,"baseline","baseline"],
   (a,b)=>Math.hypot(a.x-b.x,a.y-b.y));
 for(const difficulty of ["easy","normal","hard"]){
  fortState.difficulty=difficulty;
  for(const key of ["scout","engineer"]){
   // Forward-deep priority must not secretly depend on BLUE vs RED
   // or on the locally selected solo BOT difficulty.
   assert.equal(getFort({team:1,key,x:440,y:250})?.x,867,
    difficulty+": BLUE "+key+" moves toward forward objective");
   assert.equal(getFort({team:2,key,x:840,y:250})?.x,410,
    difficulty+": RED "+key+" mirrors the forward policy");
  }
 }
 assert.ok(!fortSource.includes("u.team===2&&S.difficulty"),
  "human RED cannot inherit difficulty-dependent bot path");

 const cardStart=game.indexOf("function playCard(team,id,x,y){");
 const cardEnd=game.indexOf("\nfunction shieldMultiplier(",cardStart);
 assert.ok(cardStart>0&&cardEnd>cardStart);
 let dispatched=[],rebuild=0,hud=0,allowSend=true;
 const gameState={selected:"scout"};
 const netStubs={isHost:false,sendCommand(c){if(!allowSend)return false;dispatched.push(c);return true}};
 const play=new Function("NET","ME","S","validTarget","canPay","buildCards","updateHUD",
  "isSpell","castSpell","deploy","CATALOG","duelStats",
  game.slice(cardStart,cardEnd)+";return playCard;")(
  netStubs,()=>2,gameState,()=>true,()=>true,
  ()=>rebuild++,()=>hud++,()=>false,()=>false,()=>false,
  {scout:{cost:3},infantry:{cost:2}},null);
 assert.equal(play(2,"scout",900,300),true);
 assert.equal(gameState.selected,null,"RED clears nonpermanent card immediately");
 assert.deepEqual(dispatched,[{id:"scout",x:900,y:300}]);
 assert.equal(rebuild,1);assert.equal(hud,1);
 gameState.selected="infantry";
 assert.equal(play(2,"infantry",900,300),true);
 assert.equal(gameState.selected,"infantry","permanent infantry remains selected");
 allowSend=false;gameState.selected="scout";
 assert.equal(play(2,"scout",900,300),false);
 assert.equal(gameState.selected,"scout","offline command does not pretend success");

 assert.ok(game.includes('S.hand[ME()].includes(oldSelected)&&S.left[ME()][oldSelected]>0'),
  "old card selection must be removed after host hand rotation");
 assert.ok(net.includes('get canSendCommand(){return !host&&!!room&&phase==="playing"&&connected'),
  "offline/invalid guest must not queue commands");
 assert.ok(net.includes('feedback?.round===meta?.round')&&net.includes('game?.notify?.(feedback.message)'),
  "RED gets visible rejected-command notification with round isolation");
 assert.ok(game.includes('notify:message=>notice(message)'),
  "guest client must expose in-battle rejection notice");
 for(const id of ["online-ipad.html","online-embed.html"]){
  assert.ok(read(id).includes(game.trim()),id+" game JS must be synced");
  assert.ok(read(id).includes(net.trim()),id+" Firebase JS must be synced");
 }
 assert.ok(read("guest-lab-game.html").includes("function guestLabBluePrepare()"),
  "special one-device guest-lab host bot code must survive");
 console.log("PASS: role-fair forward targeting, RED selection, command refusal/feedback, and iframe parity");
}


{
 // The actual host frame path should recover more of a moderate 100-150ms
 // browser scheduling gap without attempting an unbounded catch-up.
 const timing=game.match(/const delta=Math\\.min\\((\\.\\d+),Math\\.max\\(0,\\(now-previous\\)\\/1000\\)\\);previous=now;/);
 assert.ok(timing,"host fixed-timestep frame limiter missing");
 const cap=Number(timing[1]);
 assert.equal(cap,.15,"maximum frame time must stay bounded to 150ms");
 const frameSection=game.slice(game.indexOf("function frame(now){"),game.indexOf("// Test-only readback."));
 assert.ok(frameSection.includes("while(acc>=1/30&&iter<5&&S.phase===\"battle\")"),
  "no more than five physics steps per rendered frame");
 assert.ok(frameSection.includes("tick(S.speed/30)"),"host continues fixed 30Hz gameplay steps");
 assert.ok(frameSection.includes("if(iter===5)acc=0"),"catchup remains bounded");
 const simulate=fps=>{
  let acc=0,steps=0;
  for(let i=0;i<fps*60;i++){
   acc+=Math.min(cap,1/fps);
   let count=0;
   while(acc>=1/30-1e-10&&count<5){acc-=1/30;count++;steps++;}
   if(count===5)acc=0;
  }
  return steps/30;
 };
 assert.ok(simulate(60)>59.9,"normal 60FPS game clock unchanged");
 assert.ok(simulate(30)>59.9,"normal 30FPS game clock unchanged");
 assert.ok(simulate(10)>59.9,"10FPS host can catch up without losing a tenth of the match");
 assert.ok(simulate(8)>59.9,"8FPS host can catch up under the bounded limit");
 assert.ok(simulate(5)<50,"5FPS host is still bounded instead of spiralling");
 assert.ok(simulate(5)>44.9,"5FPS host must lose less time than the prior 90ms cap");
 console.log("PASS: bounded host clock catch-up at 30/10/8FPS, with 5FPS safety cap");
}

console.log("PASS: syntax, editable school HP/damage (both bundles), safe fallbacks, round isolation, reconnect, rematch, decks, BOT and tablet UI");
