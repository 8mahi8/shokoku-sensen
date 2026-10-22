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
assert.ok(page.includes('./online-net.js?v=10')&&page.includes('./online-game.js?v=14'),
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
let now=1100;
const netStub={isHost:false},unit={uid:1,x:30,y:20,walkPhase:2,walking:true,attackAnim:.4,flash:.3};
const view={remoteSprites:new Map([[1,{
 x:10,y:20,targetX:30,targetY:20,vx:23,vy:0,updatedAt:1000,lastFrame:1000
}]])};
const present=new Function("NET","S","performance","Math",presentSource+";return presentRemoteUnit");
const animate=present(netStub,view,{now:()=>now},Math);
const output=animate(unit);
assert.ok(output.x>10&&output.x<35,"guest visual position should interpolate");
assert.ok(output.walkPhase>2&&output.walkPhase<4,"walk cycle advances smoothly between snapshots");
assert.ok(output.attackAnim<.4&&output.attackAnim>0,"attack animation progresses between snapshots");
assert.ok(output.flash<.3&&output.flash>0,"hit effect decays between snapshots");
assert.equal(unit.walkPhase,2,"authoritative snapshot must remain unchanged");
now=1400;
const aged=animate(unit);
assert.ok(aged.walkPhase<=2+23*.31*.251,"extrapolation must be bounded after stalled packets");
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
assert.ok(net.includes("syncDiagnostics"),"network performance sampling must exist");
assert.ok(net.includes("remoteApplyFallback=setTimeout("),"stalled Safari rAF fallback missing");
assert.ok(net.includes("cancelRemoteFallback();"),"old rAF fallback must be cancellable");
assert.ok(net.includes("get hostBot(){return hostBotSeat()}"),"host BOT participation missing");
assert.ok(game.includes('(NET.isSolo||NET.hostBot)&&S.phase==="battle"'),"host BOT simulation missing");
assert.ok(game.includes("NET.isSolo||NET.hostBot"),"host BOT preparation missing");
for(const p of ["online.html","online-ipad.html","online-embed.html"])
 assert.ok(read(p).includes('id="netHostBot"'),p+" missing BOT join button");
assert.ok(game.includes("setupPerfPanel()"),"opt-in performance overlay must exist");

console.log("PASS: syntax, editable school HP/damage (both bundles), safe fallbacks, round isolation, reconnect, rematch, decks, BOT and tablet UI");
