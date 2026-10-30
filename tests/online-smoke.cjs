// Run: node tests/online-smoke.cjs (no npm dependencies)
"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const read=p=>fs.readFileSync(p,"utf8");
const net=read("online-net.js"),game=read("online-game.js"),art=read("v3-art.js"),deck=read("online-deck.js");
assert.ok(net.includes('room=db.ref(ROOT+"/"+code);\\n game?.resetForLobby?.();')===false,
 "this assertion just guards against a literal escaped newline in the Firebase source");
const roomSetup=net.slice(net.indexOf("function setupRoom(code,isHost){"),net.indexOf("async function create(){"));
assert.ok(roomSetup.indexOf('team=isHost?1:2;')>=0&&
 roomSetup.indexOf('game?.alignLobbyCameraForSeat?.();')>roomSetup.indexOf('team=isHost?1:2;')&&
 roomSetup.indexOf('game?.alignLobbyCameraForSeat?.();')<roomSetup.indexOf('attach(room.child("players")'),
 "joining a room must align the seat camera before Firebase events");
assert.ok(game.includes('alignLobbyCameraForSeat:()=>{')&&
 game.includes('panCamera(target-S.cam.x,330-S.cam.y);'),
 "seat camera correction must not trigger second match reset");
for(const p of ["v3.js","online-deck.js","online-net.js","online-game.js","gald-render.js","v3-art.js"]){
 new vm.Script(read(p),{filename:p});
}
for(const p of ["online-embed.html","online-ipad.html"]){
 const html=read(p);
 assert.ok(html.includes(net.trim()),"Missing current online-net.js in "+p);
 assert.ok(html.includes(deck.trim()),"Missing current online-deck.js in "+p);
 assert.ok(html.includes(game.trim()),"Missing current online-game.js in "+p);
 assert.ok(html.includes(art.trim()),"Missing current v3-art.js in "+p);
 const inline=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 assert.ok(inline.length>=4,p+" inline scripts unexpectedly missing");
 for(const [index,script] of inline.entries())new vm.Script(script,{filename:p+"#script"+index});
 assert.ok(html.includes('id="newRoom"'),p+" lacks new room button");
}
// School HTML balance editor must be at the top of both pasteable bundles.
// It must drive actual CLASSES HP/base-damage numbers, not display-only labels.
const classStart=game.indexOf("const CLASSES={");
const classEnd=game.indexOf("const IDS=Object.keys(CLASSES)",classStart);
assert.ok(classStart>0&&classEnd>classStart,"Online unit stat block missing");
const initializeClasses=new Function("window",game.slice(classStart,classEnd)+";return CLASSES;");
const originalClasses=initializeClasses({});

{
 // 2026-10-31 user-approved precise buffs, without unauthorized cost/area/AI changes.
 const start=game.indexOf("const SPELLS={"),end=game.indexOf("const CATALOG=",start);
 assert.ok(start>0&&end>start,"spell definitions must be available");
 const spells=new Function(game.slice(start,end)+"return SPELLS;")();
 assert.equal(originalClasses.engineer.damage,35,"approved heavy engineer attack");
 assert.equal(originalClasses.engineer.hp,420,"heavy engineer HP is unchanged");
 assert.equal(originalClasses.engineer.cost,4,"heavy engineer cost is unchanged");
 assert.equal(originalClasses.engineer.capture,2,"heavy engineer fort capture is unchanged");
 assert.equal(spells.barrage.damage,180,"approved barrage hit damage");
 assert.equal(spells.barrage.cost,4,"barrage cost stays 4");
 assert.equal(spells.barrage.limit,2,"barrage usage cap stays 2");
 assert.equal(spells.barrage.radius,82,"barrage area stays 82");
 assert.equal(spells.barrage.delay,1.3,"barrage delay stays 1.3");
 const stepStart=game.indexOf("function spellStep(dt){");
 const stepEnd=game.indexOf("\nfunction getFort(u){",stepStart);
 assert.ok(stepStart>0&&stepEnd>stepStart,"real spell step found");
 const inside={team:2,x:100,y:100,hp:170};
 const outside={team:2,x:183,y:100,hp:170};
 const own={team:1,x:100,y:110,hp:170};
 const state={units:[inside,outside,own],effects:[],spells:{
  incoming:[{kind:"barrage",team:1,x:100,y:100,r:82,time:1.3}],zones:[]}};
 const spellStep=new Function("S","hitUnit","SPELLS","applyGravity","notice",
  game.slice(stepStart,stepEnd)+"return spellStep;");
 const run=spellStep(state,(u,p)=>{u.hp-=p;},spells,()=>{},()=>{});
 run(1.29);
 assert.equal(inside.hp,170,"no premature spell impact");
 run(.02);
 assert.equal(inside.hp,-10,"shipping spell step applies 180 damage");
 assert.equal(outside.hp,170,"outside the blast remains untouched");
 assert.equal(own.hp,170,"no friendly spell damage");
 assert.equal(state.spells.incoming.length,0,"impact resolves once");
 console.log("PASS: approved heavy engineer 35, barrage 180 and unchanged spell/fort constraints");
}

const schoolKeys=Object.keys(originalClasses).filter(id=>!originalClasses[id].internalOnly);
assert.ok(!schoolKeys.includes("small_machine_elite")&&!schoolKeys.includes("small_machine"),
 "Summoned robot variants must never be standalone editable/deck cards");
// The initial nine remain a compatibility baseline, NOT a cap on future classes.
// Every future unit must opt into the same data-driven targeting contract.
const baselineUnitIds=["infantry","scout","engineer","archer","sentinel",
 "suppress","guardian","drone","tank"];
for(const id of baselineUnitIds)
 assert.ok(schoolKeys.includes(id),"baseline unit missing: "+id);
assert.ok(schoolKeys.length>=baselineUnitIds.length,
 "new unit types may be added without changing this test");
for(const [id,d] of Object.entries(originalClasses)){
 const p=d.targetPriority;
 assert.ok(p&&typeof p==="object",id+" must declare targetPriority");
 for(const key of ["castle","fort","unit"])
  assert.ok(Number.isInteger(p[key])&&p[key]>=0&&p[key]<=4,
   id+" invalid target priority: "+key);
 for(const [key,v] of Object.entries(p))
  assert.ok(Number.isInteger(v)&&v>=0&&v<=4,id+" invalid optional priority "+key);
}

// A new roster entry needs explicit visual wiring; otherwise the fallback
// renders a different character or places HP bars at NaN coordinates.
const artSource=read("v3-art.js");
function literalMap(source,label){
 const match=source.match(new RegExp("const "+label+"=\\{([\\s\\S]*?)\\};"));
 assert.ok(match,"Missing visual/animation registry "+label);
 return new Function("return ({"+match[1]+"});")();
}
const motion=literalMap(game,"MOTION");
const colors=literalMap(artSource,"UNIT_COLORS");
const scales=literalMap(artSource,"UNIT_SCALE");
const heights=literalMap(artSource,"BODY_HEIGHT");
const spriteMatch=artSource.match(/const SPRITES=\{([^}]+)\};/);
assert.ok(spriteMatch,"Missing character sprite registry");
const spriteIds=new Set(spriteMatch[1].split(",").map(s=>s.trim()));
for(const id of Object.keys(originalClasses)){
 assert.ok(Number.isFinite(motion.attack[id])&&motion.attack[id]>0,
  id+" missing positive attack animation duration");
 assert.ok(spriteIds.has(id),id+" has no explicit unit art");
 assert.ok(Array.isArray(colors[id])&&colors[id].length===2,
  id+" has no card portrait colors");
 assert.ok(Number.isFinite(scales[id])&&scales[id]>0,
  id+" has no unit drawing scale");
 assert.ok(Number.isFinite(heights[id])&&heights[id]>0,
  id+" has no HP-bar body height");
}

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


// The editor is a catalog consumer; gameplay owns the authoritative match deck.
assert.ok(deck.includes('const COUNT=10')&&deck.includes('new Set(ids).size===COUNT'),
 "Deck editor must enforce 10 distinct card IDs");
assert.ok(deck.includes('Number.isFinite(data.limit)?data.limit+"回":"∞"')&&
 deck.includes('"種類 ｜ 出撃予算 "+budget'),
 "deck editor exposes per-card use caps and 10-card finite budget");
assert.ok(game.includes('window.ShokokuDeck?.configure(CATALOG)'),
 "Game roster must feed the editor without a duplicate card table");
assert.ok(game.includes('S.activeDecks')&&game.includes('NET.matchDecks'),
 "Host must seed each side from its own locked selection");
assert.ok(net.includes('lockedDecks')&&net.includes('validLockedDecks'),
 "Online start must atomically lock both validated decks");
for(const path of ["online.html","online-ipad.html","online-embed.html"]){
 const html=read(path);
 for(const id of ["deckEditor","deckSelected","deckPool","deckOpen","deckSave","deckLobbyRow"])
  assert.ok(html.includes('id="'+id+'"'),path+" lacks "+id);
}

// Rule copy must not contradict the approved ten-card deck and custom spell caps.
for(const p of ["online.html","online-ipad.html","online-embed.html"]){
 const html=read(p);
 assert.ok(html.includes("デッキで選んだ10種類のカードは4枚手札で循環"),
  p+" must explain the current rotating ten-card deck");
 assert.ok(html.includes("使用回数が0になると循環から外れます"),
  p+" must explain exhausted cards");
 for(const stale of ["ほかの8兵種と2種類のスペル","各3回まで、開戦後","9種類の近未来ファンタジー兵士"])
  assert.ok(!html.includes(stale),p+" contains stale UI instructions: "+stale);
}
const page=read("online.html");
assert.ok(page.includes('./online-deck.js?v=3')&&page.includes('./online-net.js?v=15')&&page.includes('./online-game.js?v=24'),
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
// Simulate a late WebKit rAF after the SDK has delivered multiple worlds.
// The game frame must apply the most recent pending packet before drawing;
// a stale callback from an earlier room must not cancel the new pending one.
{
 const begin=net.indexOf('function receiveGuestWorld(packet,source="sdk"){');
 const end=net.indexOf('// rAF can keep painting an old world',begin);
 assert.ok(begin>=0&&end>begin,'guest snapshot coalescing source present');
 const js=net.slice(begin,end);
 const create=new Function('callbacks','applied',
  'const performance={now:()=>1000},document={hidden:false};'+
  'const setTimeout=()=>42,clearTimeout=()=>{};'+
  'const requestAnimationFrame=fn=>callbacks.push(fn);'+
  'let qaFreezeGuestWorld=false,meta={round:1},lastStateEventAt=0,lastStateEventSeq=0;'+
  'let lastRemoteSeq=0,pendingRemote=null,coalescedPackets=0,remoteScheduled=false;'+
  'let remoteEpoch=0,remoteApplyFallback=null,remoteFrameFlush=null,host=false,room={};'+
  'let lastApplyMs=0,lastRemoteAppliedAt=0,appliedGaps=[],appliedPackets=0;'+
  'let lastApplyError="",syncWarning=false;'+
  'const cancelRemoteFallback=()=>{remoteApplyFallback=null};'+
  'const game={apply:(world,seq)=>applied.push(seq)};'+
  'let phase="playing";const guestPlayableWorld=()=>false,onlinePanel=()=>{};'+
  'const updateUI=()=>{},setError=e=>{throw e};'+
  js+
  'return {receive:receiveGuestWorld,paint:flushGuestBeforePaint,'+
  'newRound:()=>{remoteEpoch++;meta.round++;lastRemoteSeq=0;pendingRemote=null;'+
  'remoteScheduled=false;remoteFrameFlush=null;},'+
  'waiting:()=>remoteScheduled,seq:()=>lastRemoteSeq};');
 const callbacks=[],applied=[],qa=create(callbacks,applied);
 const pkt=(round,seq)=>({round,seq,world:{units:[]}});
 qa.receive(pkt(1,1));qa.receive(pkt(1,2));
 assert.equal(callbacks.length,1,'coalesced packets share one rAF');
 qa.paint();assert.deepEqual(applied,[2],'latest world applied BEFORE draw');
 assert.equal(qa.waiting(),false,'prepaint removes pending queue');
 callbacks.shift()();assert.deepEqual(applied,[2],'original rAF cannot double-apply');
 qa.receive(pkt(1,3));const old=callbacks.shift();
 qa.newRound();qa.receive(pkt(2,4));
 old();assert.equal(qa.waiting(),true,'stale epoch callback keeps new queue');
 qa.paint();assert.deepEqual(applied,[2,4],'new round applies its own packet');
 callbacks.shift()();assert.deepEqual(applied,[2,4],'new callback cannot double apply');
 assert.ok(game.includes('NET.flushGuestBeforePaint?.();'),'paint loop hooks coalesced flush');
 assert.ok(game.includes('"描画モード "+(isHost?"ホスト通常":guestLowPower?"ゲスト約30FPS上限":"ゲスト通常")'),
  "the existing opt-in local diagnostics must reveal guest 30FPS cap");
 assert.ok(game.includes('lowFpsCrowdedSprites?" / 兵士キャッシュ中":" / 兵士通常"'),
  "the existing local-only panel reveals auto-cached art state");
 assert.ok(game.includes('if(was==="menu")panCamera(980-S.cam.x,330-S.cam.y);'),
  "red guest snaps to its own deployment camera when new room begins");
 assert.ok(!game.includes('if(was==="menu")cameraTo(980,330);'),
  "old slow camera travel should not leave initial red taps invalid");
 assert.ok(game.indexOf('NET.flushGuestBeforePaint?.();')<game.indexOf('trackGuestFrameHitch(now-previous);'),
  'guest hitch diagnosis samples the latest applied state after prepaint flush');
 assert.ok(net.includes('registerGame(x){game=x},maybePublish,checkGuestSync,flushGuestBeforePaint,'),
  'game can request prepaint sync');
 assert.ok(read('guest-lab-game.html').includes('NET.flushGuestBeforePaint?.();'),
  'same-device guest lab receives prepaint sync');
 console.log('PASS: prepaint newest-world flush, no duplicate apply, stale round isolation');
}

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
assert.ok(game.includes("const DENSE_TILE_BUILDS_PER_FRAME=2;"),
 "at most two new character pose tiles in each rendered frame");
assert.ok(game.includes("denseSpriteBuildsThisFrame=0;\n const v=S.view,d=v.dpr;"),
 "new-tile budget resets at start of each frame");
assert.ok(game.includes("fullSpritesRendered++;drawUnit(u,true);return;"),
 "cached art misses keep original full-resolution art without duplicate guest interpolation");
const shuffled=game.match(/function shuffledDeck\(ids=DECK_IDS\)\{[\s\S]*?\n\}/);
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
assert.ok(game.includes('let deck=shuffledDeck(source)'),'Each team gets its own shuffled deck');
assert.ok(game.includes('for(const team of [1,2])')&&game.indexOf('let deck=shuffledDeck(source)')>game.indexOf('for(const team of [1,2])'),'Shuffle must happen inside the team initialization loop');
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
const presentStart=game.indexOf("function presentRemoteUnit(u){"),presentEnd=game.indexOf("\nfunction drawUnit(u,alreadyPresented=false){",presentStart);
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
// Reproduce irregular 170-240ms network snapshots on a walking troop.
let jitterNow=1000;
const stJitter={remoteSprites:new Map([[7,{
 x:100,y:25,targetX:100,targetY:25,vx:40,vy:0,updatedAt:1000,lastFrame:1000
}]])};
const presentJitter=new Function("NET","S","performance","Math",
 presentSource+";return presentRemoteUnit")(
 {isHost:false},stJitter,{now:()=>jitterNow},Math);
const walker={uid:7,x:100,y:25,walkPhase:0,walking:true,attackAnim:0,flash:0};
jitterNow=1170;presentJitter(walker);
jitterNow=1200;const midJitter=presentJitter(walker);
jitterNow=1220;const laterJitter=presentJitter(walker);
assert.ok(laterJitter.x>midJitter.x+.02,
 "guest moving troops keep motion when packet jitter exceeds 170ms");
for(let i=0;i<60;i++){jitterNow+=16;presentJitter(walker);}
assert.ok(stJitter.remoteSprites.get(7).x<=100+40*.24+1e-5,
 "guest speculative walk position never exceeds 240ms of last velocity");
const visualBeforeStop=stJitter.remoteSprites.get(7).x;
jitterNow+=16;
assert.ok(presentJitter({...walker,walking:false}).x<visualBeforeStop,
 "authoritative stop cancels extrapolation");
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
 const fortEnd=game.indexOf("\n// Target traits are shared data-driven selectors.",fortStart);
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
 let dispatched=[],hints=[],rebuild=0,selectedRefresh=0,hud=0,allowSend=true;
 const gameState={selected:"scout"};
 const netStubs={isHost:false,sendCommand(c){if(!allowSend)return false;dispatched.push(c);return true}};
 const play=new Function("NET","ME","S","validTarget","canPay","buildCards","refreshSelectedCardClasses","updateHUD",
  "isSpell","castSpell","deploy","CATALOG","duelStats","queueGuestCommandHint",
  game.slice(cardStart,cardEnd)+";return playCard;")(
  netStubs,()=>2,gameState,()=>true,()=>true,
  ()=>rebuild++,()=>selectedRefresh++,()=>hud++,()=>false,()=>false,()=>false,
  {scout:{cost:3},infantry:{cost:2}},null,(x,y)=>hints.push({x,y}));
 assert.equal(play(2,"scout",900,300),true);
 assert.equal(gameState.selected,null,"RED clears nonpermanent card immediately");
 assert.deepEqual(dispatched,[{id:"scout",x:900,y:300}]);
  assert.deepEqual(hints,[{x:900,y:300}],"successful queued guest order receives local feedback");
 assert.equal(rebuild,0);assert.equal(selectedRefresh,1);assert.equal(hud,1);
 gameState.selected="infantry";
 assert.equal(play(2,"infantry",900,300),true);
 assert.equal(gameState.selected,"infantry","permanent infantry remains selected");
  assert.equal(hints.length,2,"infantry queued order also gets immediate feedback");
 allowSend=false;gameState.selected="scout";
 assert.equal(play(2,"scout",900,300),false);
 assert.equal(gameState.selected,"scout","offline command does not pretend success");
  assert.equal(hints.length,2,"failed transport must not show a queued-command hint");
  allowSend=true;netStubs.guestBot=true;
  assert.equal(play(2,"infantry",920,310),true,"guest BOT may still issue legal orders");
  assert.equal(hints.length,2,"BOT-controlled guest does not draw human input hints");
  netStubs.guestBot=false;

 // Pure rendering contract: guest-only, visual-only, transient, and bounded.
// A queued marker must not claim host confirmation or touch game state.
const hintStart=game.indexOf("function queueGuestCommandHint(");
const hintEnd=game.indexOf("\nfunction drawPreview(){",hintStart);
assert.ok(hintStart>0&&hintEnd>hintStart,"guest command hint renderer exists");
let drawTime=1000,labels=[],paintArcs=0,captionPlates=0,captionOpacity=[],alphaStack=[];
const guestRole={isHost:false},hintState={phase:"battle"};
const ctxMock={globalAlpha:1,save(){alphaStack.push(this.globalAlpha)},restore(){this.globalAlpha=alphaStack.pop()},beginPath(){},arc(){paintArcs++;},
 stroke(){},fill(){},fillText(value){labels.push(value);captionOpacity.push(this.globalAlpha)}};
const hintsQa=new Function("NET","S","performance","ctx","Math","H","rounded",
 "const GUEST_COMMAND_HINT_MS=650;let guestCommandHints=[],lastGuestHintPainted=0;\n"+
 game.slice(hintStart,hintEnd)+
 "\nreturn {queue:queueGuestCommandHint,draw:drawGuestCommandHints,read:()=>({items:guestCommandHints.slice(),painted:lastGuestHintPainted})};")(
 guestRole,hintState,{now:()=>drawTime},ctxMock,Math,660,()=>{captionPlates++;});
hintsQa.queue(1100,320);
drawTime=1016;hintsQa.draw(drawTime);
assert.equal(hintsQa.read().painted,1,"queued guest tap paints on next available frame");
assert.deepEqual(labels,["送信中"],"display explicitly says in transit, not successful summon");
assert.ok(paintArcs>0,"visual cue draws on canvas without a DOM rebuild");
assert.equal(captionPlates,1,"text caption uses a distinct contrast plate for readability");
drawTime=1500;hintsQa.draw(drawTime);
assert.ok(captionOpacity.at(-1)>=.65,"queued feedback remains readable after 500ms, before the final fade");
drawTime=1700;hintsQa.draw(drawTime);
assert.equal(hintsQa.read().items.length,0,"queued visual cue expires in 650ms");
for(let i=0;i<9;i++)hintsQa.queue(1070+i,315);
assert.equal(hintsQa.read().items.length,4,"rapid guest taps cannot accumulate unbounded markers");
guestRole.isHost=true;hintsQa.draw(drawTime);
assert.equal(hintsQa.read().items.length,0,"host never keeps guest-only hints");
hintsQa.queue(1150,310);
assert.equal(hintsQa.read().items.length,0,"host never enqueues a guest marker");
guestRole.isHost=false;hintState.phase="menu";hintsQa.queue(1150,310);
hintsQa.draw(drawTime);
assert.equal(hintsQa.read().items.length,0,"lobby and rematch remove pending visual hints");
assert.ok(game.includes("guestCommandHints=[];lastGuestHintPainted=0;"),
 "new round resets local queued markers");
assert.ok(game.includes("drawGuestCommandHints(now);drawPreview()"),
 "marker renders in battlefield space before regular tap preview");

assert.ok(game.includes('S.hand[ME()].includes(oldSelected)&&S.left[ME()][oldSelected]>0'),
  "old card selection must be removed after host hand rotation");
 assert.ok(net.includes('get canSendCommand(){return !host&&!!room&&phase==="playing"&&connected'),
  "offline/invalid guest must not queue commands");
 assert.ok(net.includes("if(qaFreezeGuestWorld)return;")&&net.includes("if(qaFreezeGuestWorld||!latest"),
  "QA freeze intercepts SDK, REST and pending-frame application");
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
 const timing=game.match(/const delta=Math\.min\((\.\d+),Math\.max\(0,\(now-previous\)\/1000\)\);previous=now;/);
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

 // Drive the REAL fixed-step accumulator and REAL tick()/rate() engine
 // without Canvas or network. This catches low-FPS clock regressions that
 // a simple arithmetic estimate would miss (both armies share the host tick).
 const rateBegin=game.indexOf("function rate(){");
 const rateEnd=game.indexOf("\n// Known regeneration timeline:",rateBegin);
 const tickBegin=game.indexOf("function tick(dt){");
 const tickEnd=game.indexOf("\n// The tactical world remains",tickBegin);
 const accumulator=frameSection.match(/   acc\+=delta;[\s\S]*?   if\(iter===5\)acc=0;/)?.[0];
 assert.ok(rateBegin>=0&&rateEnd>rateBegin&&tickBegin>=0&&tickEnd>tickBegin&&accumulator,
  "real engine timing fragments must remain extractable");
 const runClockCase=(fps,speed=1)=>{
  const state={phase:"battle",elapsed:0,seconds:600,speed,
   energy:[0,0,0],observedEnergy:[0,0,0],deaths:[],effects:[],projectiles:[],
   units:[{x:0}]};
  const online={isHost:true,isSolo:false,hostBot:false};
  const actualRate=new Function("S",game.slice(rateBegin,rateEnd)+"\nreturn rate;")(state);
  const actualTick=new Function("S","NET","ENERGY_CAP","rate","unitStep",
   "spellStep","botStep","finishTime",
   game.slice(tickBegin,tickEnd)+"\nreturn tick;")(
    state,online,12,actualRate,dt=>{state.units[0].x+=10*dt;},
    ()=>{},()=>{},()=>{throw Error("unexpected finishTime in host clock QA");});
  const stepFrame=new Function("S","tick","delta","previousAcc",
   "let acc=previousAcc;\n"+accumulator+"\nreturn acc;");
  let fractional=0;
  for(let frame=0;frame<fps*20;frame++){
   fractional=stepFrame(state,actualTick,Math.min(cap,1/fps),fractional);
  }
  return state;
 };
 for(const fps of [60,30,15,10,8]){
  const actual=runClockCase(fps);
  assert.ok(Math.abs(actual.elapsed-20)<1/30+1e-5,
   fps+"FPS should preserve 20s of host simulation");
  assert.ok(Math.abs(actual.energy[1]-5)<.01,
   fps+"FPS actual tick must recover BLUE energy at +0.25/s");
  assert.ok(Math.abs(actual.energy[2]-actual.energy[1])<1e-12,
   fps+"FPS RED and BLUE gain identical host-authoritative energy");
  assert.ok(Math.abs(actual.observedEnergy[1]-actual.energy[1])<1e-12,
   fps+"FPS visible host energy ledger follows confirmed state");
  assert.ok(Math.abs(actual.units[0].x-200)<.4,
   fps+"FPS unit update must receive the same simulated time");
 }
 const restricted=runClockCase(5);
 assert.ok(restricted.elapsed>14.9&&restricted.elapsed<15.1,
  "5FPS protects host CPU by advancing roughly 15 simulated seconds");
 assert.ok(Math.abs(restricted.energy[1]-3.75)<.02,
  "5FPS resource recovery slows with the bounded host clock");
 const faster=runClockCase(10,2);
 assert.ok(Math.abs(faster.elapsed-40)<.07&&Math.abs(faster.energy[1]-10)<.02,
  "2x match speed remains consistent under 10FPS host scheduling");
 console.log("PASS: real host tick, energy parity, and unit clock at 60/30/15/10/8/5FPS");

}


{
 // Execute the actual guest clock reconciliation from the shipped apply().
 // Old behavior Math.max(localClock,clock) retained minutes of lobby time,
 // causing host-relative hitAt/spawnAt animations to start fully expired.
 const marker="   // A guest can spend minutes in the lobby";
 const begin=game.indexOf(marker),end=game.indexOf("\n   const now=performance.now();",begin);
 assert.ok(begin>=0&&end>begin,"remote round visual clock reconciliation exists");
 const source=game.slice(begin,end);
 const reconcile=new Function("S","was","localClock",
  source+"\nreturn S.clock;");
 const check=(previousPhase,nextPhase,remoteClock,oldClock,expected)=>{
  const state={phase:nextPhase,clock:remoteClock,energy:[0,2,3]};
  const energy=state.energy.slice();
  assert.equal(reconcile(state,previousPhase,oldClock),expected,
   previousPhase+" => "+nextPhase+" remote clock "+remoteClock+" local "+oldClock);
  assert.equal(state.clock,expected);
  assert.deepEqual(state.energy,energy,"clock sync may not change spendable resources");
 };
 check("menu","prep",.4,180,.4);
 check("menu","battle",12,90,12); // late match join
 check("result","prep",.2,307,.2); // same-room rematch
 check("prep","prep",.65,.8,.8); // do not rewind on network lag
 check("prep","battle",2.1,2.0,2.1);
 check("battle","battle",3.1,3.3,3.3);
 check("battle","battle",4.2,3.3,4.2);
 check("menu","menu",.5,60,60);
 // The Gald animation runner uses host-relative spawnAt and hitAt.
 const art=read("gald-render.js");
 assert.ok(art.includes("(t-u.spawnAt)")&&art.includes("t-u.hitAt"),
  "clock is used to time spawn and hit animation in actual art renderer");
 for(const path of ["online-ipad.html","online-embed.html"])
  assert.ok(read(path).includes(game.trim()),
   path+" must include the identical re-anchored game engine");
 assert.ok(read("guest-lab-game.html").includes(
  "S.clock=enteringRemoteRound?S.clock:Math.max(localClock,S.clock);"),
  "specialized guest lab bundle must also have the visual clock fix");
 console.log("PASS: guest visual clock re-anchors on first match or rematch, never rewinds in battle");
}


{
 // Test the real browser fallback closure in a pure Node sandbox, without
 // relying on expensive headless WebKit scheduling or altering gameplay.
 const begin=game.indexOf("let lowFpsCrowdedSprites=false,lowFpsCrowdedSpritesAt=0;");
 const end=game.indexOf("function adaptCanvasQuality(now){",begin);
 assert.ok(begin>0&&end>begin,"low-FPS crowded art sampler present");
 const block=game.slice(begin,end);
 const create=new Function("S","document","qaFrameBench","window",block+
  "\nreturn {step:adaptCrowdedSprites,reset:resetCrowdedArtForMatch,"+
  "active:()=>lowFpsCrowdedSprites,at:()=>lowFpsCrowdedSpritesAt};");
 const check=(fps,phase,count,hidden=false,qa=null,qaEnabled=false)=>{
  const state={phase,units:Array.from({length:count},(_,i)=>({uid:i}))};
  const renderer=create(state,{hidden},qa,{__qaEnableCrowdedArtAdapt:qaEnabled});
  renderer.step(1);
  for(let t=1;t<=7000;t+=1000/fps)renderer.step(t+1);
  return renderer.active();
 };
 assert.equal(check(10,"battle",10),true,
  "two sustained 10FPS windows in a crowded battle enable cached art");
 assert.equal(check(60,"battle",10),false,
  "normal 60FPS preserves fully animated artwork");
 assert.equal(check(20,"battle",10),true,
  "two moderately slow windows activate cached art");
 assert.equal(check(30,"battle",10),false,
  "full-detail animations remain at 30FPS");
 assert.equal(check(10,"prep",10),false,
  "slow lobby / prep frames cannot trigger artwork degradation");
 assert.equal(check(10,"battle",5),false,
  "small battles retain full animation even at low FPS");
 assert.equal(check(10,"battle",10,true),false,
  "hidden pages must not falsely activate the fallback");
 assert.equal(check(10,"battle",10,false,{}),false,
  "local QA is unchanged by production adaptive artwork");
 assert.equal(check(10,"battle",10,false,{},true),true,
  "local QA can explicitly opt in to the real production adaptive sampler");
 // Exercise a whole session: after severe FPS activates cache once, the new
 // rematch begins with full art and requires a fresh low-FPS observation.
 {
  const session=create({phase:"battle",units:Array.from({length:10},(_,i)=>({uid:i}))},
   {hidden:false},null,{});
  session.step(1);
  for(let t=1;t<=7000;t+=100)session.step(t+1);
  assert.equal(session.active(),true,"first match severe FPS engages the fallback");
  assert.ok(session.at()>0,"activation remembers an entry time");
  session.reset();
  assert.equal(session.active(),false,"rematch begins with full artwork");
  assert.equal(session.at(),0,"rematch resets the blend timestamp");
  session.step(8000);
  for(let t=8000;t<=14000;t+=1000/60)session.step(t+1);
  assert.equal(session.active(),false,"rematch recovers to 60FPS full artwork");
  session.step(15000);
  for(let t=15000;t<=22000;t+=100)session.step(t+1);
  assert.equal(session.active(),true,"new severe slowdown may re-enable cache");
 }
 assert.ok(game.includes("resetCrowdedArtForMatch();"),
  "actual resetWorld() must clear the old round's fallback");
 assert.ok(game.includes("S.units.length<(lowFpsCrowdedSprites?6:"),
  "severe mode uses cached artwork for medium-sized fights");
 assert.ok(game.includes("const preserveMoment=lowFpsCrowdedSprites&&("),
  "spawn and hit moments remain full-detail artwork");
 for(const path of ["online-ipad.html","online-embed.html"])
  assert.ok(read(path).includes(game.trim()),
   path+" must embed the exact post-fallback online-game.js");
 assert.ok(read("guest-lab-game.html").includes(
  "adaptCrowdedSprites(now);"),"guest-lab bundle keeps the fallback");
 console.log("PASS: severe low-FPS adaptive art cache, full-detail transitions and bundled pages");
}


{
 // Guardian Gald atlas is rendered at width 201 and height 227, with
 // anchorX 105/330 and anchorY 292.8/372 of that destination size.
 // Old 164x190 tiles clipped ~55px from the right, 24px at the top.
 const packed=game.match(/const BIG_W=(\d+),BIG_H=(\d+),BIG_AX=(\d+),BIG_AY=(\d+)/);
 assert.ok(packed,"large-art cache tile layout exists");
 const compact=game.match(/FAST_W=(\d+),FAST_H=(\d+),FAST_AX=(\d+),FAST_AY=(\d+)/);
 assert.ok(compact,"compact artwork layout exists");
 const [sw,sh,sx,sy]=compact.slice(1).map(Number);
 assert.ok(sw>=192&&sh>=214&&sx>=96&&sy>=167,
  "ordinary attack poses need margin inside compact tile");
 const [bigW,bigH,ax,ay]=packed.slice(1).map(Number);
 const gald=read("gald-render.js");
 assert.ok(gald.includes("width=201,height=227"),"expected actual Gald atlas size");
 const left=ax-105/330*201,top=ay-292.8/372*227;
 assert.ok(left>=5&&left+201<=bigW-5,
  "Gald guardian must not clip horizontally on cached tile");
 assert.ok(top>=5&&top+227<=bigH-5,
  "Gald guardian must not clip vertically on cached tile");
 assert.ok(game.includes("tile.width=big?BIG_W:FAST_W")&&
  game.includes("u.key===\"guardian\"||u.key===\"tank\""),
  "only bulky models receive the larger tiles");
 assert.ok(game.includes("const y=u.y-(cachedHealthTop[u.key]||105)")&&
  game.includes("guardian:187")&&game.includes("tank:141"),
  "cached HP bars must align vertically with full-size renderers");
 for(const path of ["online-ipad.html","online-embed.html"])
  assert.ok(read(path).includes(game.trim()),
   path+" must match the corrected cache engine");
 assert.ok(read("guest-lab-game.html").includes("const BIG_W=282"),
  "guest visual QA includes the correct cache bounds");
 console.log("PASS: large cached sprites fit, guardian/tank HP bars align");
}


{
 // The real Canvas renderer uses sin(walkPhase*.76) for a walking leg.
 // Old cached sample phases .4 and 3.2 both had positive sine and could
 // not represent the opposite stride. Extract the actual pose selector.
 const w=game.match(/const CACHED_STRIDE_PEAK=Math\.PI\/\(2\*\.76\)/);
 assert.ok(w,"cached walk stride samples come from real 0.76 gait");
 const peak=Math.PI/(2*.76);
 assert.ok(Math.sin(peak*.76)>.999,"first cached leg swings forward");
 assert.ok(Math.sin(3*peak*.76)<-.999,"second cached leg swings back");
 assert.ok(game.includes("Math.sin((u.walkPhase||0)*.76)>=0?1:2"),
  "live pose selector must use same stride period as full-art renderer");
 assert.ok(game.includes("lowFpsCrowdedSpritesAt=now"),
  "only real emergency cache activation starts the fade");
 assert.ok(game.includes("Math.min(1,Math.max(0,(performance.now()-lowFpsCrowdedSpritesAt)/180))"),
  "crossfade must be finite and end rapidly to preserve FPS");
 assert.ok(game.includes("window.KokokuArt.drawUnit(ctx,{...u,hp:100,max:100},S.clock)"),
  "transition must use already-interpolated position without double guest easing");
 const art=read("v3-art.js");
 assert.ok(art.includes("Math.sin((unit.walkPhase||clock*5)*.76)"),
  "pose sampling and full Canvas source must have same stride period");
 for(const path of ["online-ipad.html","online-embed.html"])
  assert.ok(read(path).includes(game.trim()),path+" must match gait/transition code");
 assert.ok(read("guest-lab-game.html").includes("CACHED_STRIDE_PEAK"),
  "QA guest-lab bundle includes matching gait");
 console.log("PASS: opposite cached walking strides and bounded fade-on switch");
}


{
 // Reproduce real 150ms host clock cap and 60FPS guest drawing for twenty
 // seconds. With the old Math.max-only clock the host at 5FPS advances only
 // 15 seconds while a 60FPS guest races ahead 20 seconds, permanently
 // expiring its host-relative spawn and hit visual effects.
 const begin=game.indexOf("function guestVisualClockPace(now){");
 const end=game.indexOf("\nfunction guestVisualTimeRemaining(",begin);
 assert.ok(begin>=0&&end>begin,"host-anchored guest presentation pace exists");
 const source=game.slice(begin,end);
 const factory=new Function("NET","S","limit",source+
  "\nreturn guestVisualClockPace;");
 const limit=(x,a,b)=>Math.max(a,Math.min(b,x));
 const simulate=hostFps=>{
  const state={clock:0,remoteHostClock:null,remoteVisualReceivedAt:0,phase:"battle"};
  const net={isHost:false},pace=factory(net,state,limit);
  let hostClock=0,lastHostAt=0,lastPacketAt=0,maxLead=0;
  for(let frame=1;frame<=1200;frame++){
   const t=frame/60,now=1000+t*1000;
   while(lastHostAt+1/hostFps<=t+1e-9){
    hostClock+=Math.min(.15,1/hostFps);
    lastHostAt+=1/hostFps;
   }
   if(lastPacketAt+.2<=t+1e-9){
    state.remoteHostClock=hostClock;state.remoteVisualReceivedAt=now;
    state.clock=Math.max(state.clock,hostClock);
    lastPacketAt+=.2;
   }
   const previous=state.clock;
   state.clock+=(1/60)*pace(now);
   assert.ok(state.clock>=previous,"guest presentation clock must not rewind");
   maxLead=Math.max(maxLead,state.clock-hostClock);
  }
  return {hostClock,guestClock:state.clock,maxLead};
 };
 for(const fps of [30,10,8,5,4]){
  const {hostClock,guestClock,maxLead}=simulate(fps);
  assert.ok(maxLead<=.55,"guest clock may not run seconds ahead at "+fps+"FPS");
  assert.ok(guestClock>=hostClock,"guest must not trail latest host clock");
  if(fps>=8)assert.ok(Math.abs(guestClock-20)<.25,
   "normal 8-30FPS should retain host-like full-speed animation clock");
  else assert.ok(guestClock-hostClock<.5,
   "extremely slow host remains visually synchronized without a backwards jump");
 }
 const idle={clock:23,remoteHostClock:null,remoteVisualReceivedAt:0,phase:"menu"};
 const guestPace=factory({isHost:false},idle,limit);
 assert.equal(guestPace(9000),1,"menu phase retains normal clock pace");
 idle.phase="battle";
 assert.equal(guestPace(9000),1,"guest awaiting first packet retains normal clock");
 idle.remoteHostClock=22;idle.remoteVisualReceivedAt=8000;
 assert.equal(guestPace(9000),0,"stale guest may not run far beyond last host clock");
 assert.equal(factory({isHost:true},idle,limit)(9000),1,
  "host game clock must never be throttled by a guest-only guard");
 assert.ok(game.includes("S.clock+=delta*guestVisualClockPace(now);"),
  "render frame must use bounded guest presentation pace");
 assert.ok(game.includes("S.remoteHostClock=Number.isFinite(data.clock)?data.clock:null;"),
  "each authoritative snapshot must anchor the guest pacing");
 for(const p of ["online-ipad.html","online-embed.html"])
  assert.ok(read(p).includes(game.trim()),p+" must embed matching visual pacing");
 assert.ok(read("guest-lab-game.html").includes("function guestVisualClockPace(now){"),
  "guest lab also includes presentation clock guard");
 console.log("PASS: 30/10/8/5/4FPS host/guest visual clock stays bounded and monotonic");
}


{
 // Run the production round-quality reset function with the same mutable
 // flags used by the real frame-loop DPR and guest paint throttling logic.
 const start=game.indexOf("let tabletDprCap=1.45,qualityWindowStart=");
 const end=game.indexOf("// Preserve full art normally.",start);
 assert.ok(start>0&&end>start,"adaptive Canvas quality reset must be present");
 const source=game.slice(start,end);
 const create=new Function("S","fit",source+
  "\nreturn {set:(v)=>{tabletDprCap=v.cap;qualityWindowStart=v.t0;"+
  "qualityFrames=v.frames;qualityMeasured=v.measured;guestLowPower=v.guest;"+
  "guestLastPaint=v.paint;},reset:resetAdaptiveCanvasForMatch,"+
  "get:()=>({cap:tabletDprCap,t0:qualityWindowStart,frames:qualityFrames,"+
  "measured:qualityMeasured,guest:guestLowPower,paint:guestLastPaint})};");
 const state={view:{w:1194,h:834}},calls=[];
 const qa=create(state,()=>calls.push("fit"));
 qa.set({cap:1,guest:true,measured:true,t0:6000,frames:7,paint:6200});
 qa.reset();
 assert.deepEqual(qa.get(),{cap:1.45,t0:0,frames:0,measured:false,
  guest:false,paint:0},"rematch restores full raster and re-samples frame rate");
 assert.deepEqual(calls,["fit"],
  "a lowered host raster must restore Canvas backing pixels once");
 qa.reset();
 assert.equal(calls.length,1,
  "no extra fit/layout work when the quality is already at normal DPR");
 state.view={w:1,h:1};
 qa.set({cap:1,guest:true,measured:true,t0:7000,frames:1,paint:7200});
 qa.reset();
 assert.equal(calls.length,1,
  "initial 1px canvas startup must not trigger premature resizing");
 // Exercise the real adaptive FPS governor with deterministic rAF timing.
 const governorStart=game.indexOf("function adaptCanvasQuality(now){");
 const governorEnd=game.indexOf("\nfunction fit(){",governorStart);
 assert.ok(governorStart>0&&governorEnd>governorStart,
  "adaptive FPS governor is present");
 const makeGovernor=new Function("S","NET","document","fit",
  game.slice(start,governorEnd)+
  "\nreturn {tick:adaptCanvasQuality,quality:()=>({guestLowPower,guestQualityRecoveredAt})};");
 const governor=makeGovernor({phase:"battle",view:{dpr:1,w:1100,h:700}},
  {isHost:false},{hidden:false},()=>{});
 for(let i=0;i<=135;i++)governor.tick(1000+i*29);
 assert.equal(governor.quality().guestLowPower,true,
  "34FPS initially triggers existing 30FPS guest safety fallback");
 for(let i=0;i<=570;i++)governor.tick(5000+i*16.67);
 assert.equal(governor.quality().guestLowPower,false,
  "8.5s of recovered >=55FPS restores native render cadence");
 assert.ok(governor.quality().guestQualityRecoveredAt>0);
 for(let i=0;i<=190;i++)governor.tick(15200+i*27);
 assert.equal(governor.quality().guestLowPower,false,
  "20s hysteresis prevents immediate render quality oscillation");
 assert.ok(game.includes("resetAdaptiveCanvasForMatch();"),
  "actual resetWorld() must reset DPR quality and guest frame limiter");
 assert.ok(game.includes("if(!NET.isHost&&guestLowPower&&now-guestLastPaint<30)return;"),
  "guest frame throttle remains only an adaptive fallback");
 for(const p of ["online-ipad.html","online-embed.html"])
  assert.ok(read(p).includes(game.trim()),
   p+" must embed the exact quality reset logic");
 assert.ok(read("guest-lab-game.html").includes("resetAdaptiveCanvasForMatch();"),
  "guest lab must embed match-local quality reset");
 console.log("PASS: repeat matches restore Canvas DPR and guest FPS quality, then re-sample");
}


{
 // Use the actual production snapshot scheduling function with fake Safari
 // paint callbacks. No Firebase writes or synthetic replacement algorithm.
 const begin=net.indexOf("function receiveGuestWorld(");
 const end=net.indexOf("\n// rAF can keep painting",begin);
 assert.ok(begin>0&&end>begin,"production guest packet scheduler must be extractable");
 const frames=[],timers=new Map(),applied=[],errors=[];
 let nextTimer=0,now=1000,throwOnce=false;
 const browser={hidden:false};
 const harness=new Function("applyWorld","requestAnimationFrame","setTimeout","clearTimeout","performance","document","errors",`
let room={},host=false,meta={round:1},lastRemoteSeq=0,pendingRemote=null,remoteScheduled=false,remoteEpoch=0,remoteApplyFallback=null;
let qaFreezeGuestWorld=false,lastStateEventAt=0,lastStateEventSeq=0,coalescedPackets=0,lastRemoteAppliedAt=0,appliedGaps=[],appliedPackets=0,lastApplyMs=0,lastApplyError="",syncWarning=false;
const game={apply:(world,seq)=>applyWorld(world,seq)};
function cancelRemoteFallback(){if(remoteApplyFallback!==null){clearTimeout(remoteApplyFallback);remoteApplyFallback=null;}}
function updateUI(){}
function setError(e){errors.push(String(e));}
let phase="playing";const guestPlayableWorld=()=>false,onlinePanel=()=>{};
`+net.slice(begin,end)+`
return {deliver:receiveGuestWorld,
 newRound:n=>{meta={round:n};cancelRemoteFallback();remoteEpoch++;pendingRemote=null;remoteScheduled=false;lastRemoteSeq=0;},
 stats:()=>({appliedPackets,lastRemoteSeq,coalescedPackets,remoteScheduled,pendingSeq:pendingRemote?.seq||0,sdkSeq:lastStateEventSeq})};
`);
 const qa=harness((world,seq)=>{if(throwOnce){throwOnce=false;throw Error("synthetic apply failure");}applied.push({seq,round:world.round});},
  callback=>frames.push(callback),
  callback=>{const id=++nextTimer;timers.set(id,callback);return id;},
  id=>timers.delete(id),
  {now:()=>now},browser,errors);
 const packet=(seq,round=1)=>({seq,round,world:{round}});
 qa.deliver(packet(1));qa.deliver(packet(2));
 assert.equal(frames.length,1,"bursty snapshots use one animation frame");
 assert.equal(qa.stats().coalescedPackets,1,"bursty snapshots coalesce");
 assert.equal(applied.length,0,"do not apply several snapshots before paint");
 frames.shift()();
 assert.deepEqual(applied,[{seq:2,round:1}],"first frame applies newest snapshot only");
 qa.deliver(packet(1));
 assert.equal(frames.length,0,"older packet must not requeue a frame");
 qa.deliver(packet(3));
 const stranded=frames.shift();
 now+=700;
 const fallback=timers.get(nextTimer);
 assert.ok(fallback,"Safari rAF fallback is registered");
 fallback();
 assert.equal(qa.stats().lastRemoteSeq,3,"stalled rAF fallback delivers newest world");
 stranded();
 assert.equal(applied.length,2,"a late rAF must not replay a fallback-applied packet");
 qa.deliver(packet(4));
 const latePriorRoundFrame=frames.shift();
 qa.newRound(2);
 qa.deliver(packet(99,1));
 assert.equal(frames.length,0,"obsolete round cannot schedule a new frame");
 qa.deliver(packet(1,2));
 const newRoundFrame=frames.shift();
 latePriorRoundFrame();
 assert.equal(qa.stats().lastRemoteSeq,0,"old round rAF must not consume new-round state");
 newRoundFrame();
 assert.deepEqual(applied.at(-1),{seq:1,round:2},"fresh round accepts seq 1");
 qa.deliver(packet(2,2));
 browser.hidden=true;
 const hiddenFallback=timers.get(nextTimer);
 hiddenFallback();
 assert.equal(qa.stats().lastRemoteSeq,1,"hidden iframe fallback must not force paint");
 browser.hidden=false;frames.shift()();
 assert.equal(qa.stats().lastRemoteSeq,2,"visible rAF resumes queued world");
 qa.deliver(packet(3,2));
 throwOnce=true;
 frames.shift()();
 assert.equal(qa.stats().lastRemoteSeq,2,"a failed apply cannot consume network sequence");
 assert.equal(errors.length,1,"apply error must surface in diagnostic feedback");
 qa.deliver(packet(3,2));frames.shift()();
 assert.equal(qa.stats().lastRemoteSeq,3,"failed packet can be retried with identical sequence");
 assert.deepEqual(applied.map(x=>x.seq),[2,3,1,2,3],"ordered verified snapshot delivery");
 const sdkSeqBeforeRest=qa.stats().sdkSeq;
 qa.deliver(packet(4,2),"rest");frames.shift()();
 assert.equal(qa.stats().sdkSeq,sdkSeqBeforeRest,"REST packet must not masquerade as Firebase SDK event");
 assert.equal(qa.stats().lastRemoteSeq,4,"REST packet still updates guest world");
 qa.deliver(packet(5,2),"cache");frames.shift()();
 assert.equal(qa.stats().sdkSeq,sdkSeqBeforeRest,"cached one-shot fallback cannot fake live SDK recovery");
 assert.equal(qa.stats().lastRemoteSeq,5,"cached one-shot fallback can still apply newer data");
 assert.ok(net.includes('receiveGuestWorld(snap.val(),"cache")'),"REST fallback must label SDK cache as non-live");
 console.log("PASS: real guest snapshot scheduler coalescing, stalled Safari rAF recovery, old-round isolation, hidden frames and retry");
}


{
 // Extract and execute production checkGuestSync against simulated clocks.
 // This verifies the early REST read does not display a warning or poll for
 // a normally arriving SDK stream, and keeps the 3.5s rAF safety path.
 const a=net.indexOf("function checkGuestSync(){");
 const b=net.indexOf("\nfunction syncDiagnostics()",a);
 assert.ok(a>0&&b>a,"guest synchronization watchdog exists");
 const test=new Function(`
let host=false,room={},phase="playing",lastRemoteAppliedAt=3000,lastStateEventAt=3000;
let lastSyncReadAt=0,syncWarning=false,roomCode="QA",now=4700,reads=0,warnings=0;
const performance={now:()=>now},restRecoverGuest=()=>{reads++};
const $=()=>({classList:{remove(){}},set textContent(value){warnings++}});
`+net.slice(a,b)+`
return (time,appliedAt,sdkAt)=>{
 now=time;lastRemoteAppliedAt=appliedAt;lastStateEventAt=sdkAt;
 checkGuestSync();return {reads,warnings,syncWarning};
};`)();
 assert.deepEqual(test(4000,3000,3000),{reads:0,warnings:0,syncWarning:false},
   "1.0s SDK silence is below REST recovery threshold");
  assert.deepEqual(test(4300,3000,3000),{reads:1,warnings:0,syncWarning:false},
   "1.3s real SDK silence starts one REST recovery without alarming player");
  assert.deepEqual(test(4400,3000,3000),{reads:1,warnings:0,syncWarning:false},
   "rechecking the stalled SDK must not spam REST");
  assert.deepEqual(test(5100,3900,5050),{reads:1,warnings:0,syncWarning:false},
   "fresh SDK events must not trigger early REST recovery");
  assert.deepEqual(test(6600,3000,3000),{reads:2,warnings:1,syncWarning:true},
   "REST can retry after 2.2s if the host was stalled on the first read");
  assert.deepEqual(test(9200,3000,3000),{reads:3,warnings:1,syncWarning:true},
   "prolonged stall retains warning and rate-limited REST fallback");
  console.log("PASS: SDK-only early REST recovery and slow rAF fallback");
}

{
 const a=game.indexOf("function refreshSelectedCardClasses(){");
 const b=game.indexOf("\nfunction buildCards(){",a);
 assert.ok(a>0&&b>a,"lightweight selection handler exists");
 const buttons=["infantry","scout","archer"].map(id=>({dataset:{id},selected:false,classList:{toggle(name,on){this.parent.selected=on}}}));
 for(const item of buttons)item.classList.parent=item;
 const state={selected:"scout"};
 const update=new Function("cards","S",game.slice(a,b)+"\nreturn refreshSelectedCardClasses;")(
  {querySelectorAll(){return buttons;}},state);
 update();
 assert.deepEqual(buttons.map(x=>x.selected),[false,true,false],"only chosen card is selected");
 state.selected=null;update();
 assert.deepEqual(buttons.map(x=>x.selected),[false,false,false],"selection reset is cheap");
 assert.ok(game.includes("S.selected=S.selected===m.id?null:m.id;refreshSelectedCardClasses();"));
 assert.ok(game.includes('S.selected=null;refreshSelectedCardClasses();updateHUD();'));
 const hs=game.indexOf("function trackGuestFrameHitch(gapMs){");
 const he=game.indexOf("\nfunction togglePerfPanel(){",hs);
 assert.ok(hs>0&&he>hs,"in-memory guest hitch capture exists");
 const n={eventSeq:15,seq:14,eventAgeMs:125,ageMs:160};
 const role={isHost:false,syncDiagnostics:()=>n},document={hidden:false},
  S={phase:"battle",elapsed:20.3,units:[{},{}]};
 const qa=new Function("NET","document","S",
  "let lastGuestHitch=null,guestHitchCount=0,guestHitchWorst=0,perfPanel={},"+
  "perfPreviousDrawMs=4.6,perfPreviousTiles=2,guestLowPower=false,lowFpsCrowdedSprites=true;\n"+
  game.slice(hs,he)+
  "\nreturn {sample:trackGuestFrameHitch,last:()=>lastGuestHitch,"+
  "reset:()=>{lastGuestHitch=null;},panel:on=>perfPanel=on?{}:null,"+
  "totals:()=>[guestHitchCount,guestHitchWorst]};")(role,document,S);
 qa.sample(99);assert.equal(qa.last(),null,"under 100ms ignored");
 qa.sample(130);assert.deepEqual(qa.last(),
  {gapMs:130,units:2,elapsedSeconds:"20.3",sdkSeq:15,appliedSeq:14,
   sdkAgeMs:125,appliedAgeMs:160,beforeDrawMs:4.6,beforeTiles:2,
   quality:"通常",cached:true},
  "opt-in panel captures 100-179ms hitches with previous Canvas draw cost");
 assert.deepEqual(qa.totals(),[1,130]);
 qa.reset();qa.panel(false);qa.sample(179);assert.equal(qa.last(),null);
 qa.sample(180);assert.equal(qa.last().gapMs,180);
 assert.deepEqual(qa.totals(),[2,180]);
 qa.reset();role.isHost=true;qa.sample(800);assert.equal(qa.last(),null,"host ignored");
 role.isHost=false;document.hidden=true;qa.sample(800);assert.equal(qa.last(),null,"hidden iframe ignored");
 document.hidden=false;S.phase="menu";qa.sample(800);assert.equal(qa.last(),null,"menu ignored");
 assert.ok(game.includes('perfPreviousDrawMs=drawMs;perfPreviousTiles=denseSpriteBuildsThisFrame;'),
  "last paint duration and cache tiles are measured only with panel open");
 assert.ok(game.includes('lastGuestHitch=null;guestHitchCount=0;guestHitchWorst=0;'),
  "new match clears guest hitch evidence");
 assert.ok(game.includes("S.remoteSprites=null;lastGuestHitch=null;"),"new round clears old stop");
 assert.ok(game.includes("datum.hitchNet={sdkSeq:sync.eventSeq||0,appliedSeq:sync.seq||0,"),
  "QA frame benchmark correlates hitch with SDK and applied-world timing");
 assert.ok(game.includes('const qaFrameBench=(["localhost","127.0.0.1"].includes(location.hostname)'),
  "extra per-frame network samples remain loopback QA-only");
 for(const page of ["online-ipad.html","online-embed.html"])
  assert.ok(read(page).includes(game.trim()),"bundles match school game");
 console.log("PASS: lightweight card taps and recent in-memory guest hitch diagnosis");
}


{
 const botQaStart=game.indexOf("function qaRunBlueBot(dt){");
 const botQaEnd=game.indexOf("\n// QA-only six-second contact forecast.",botQaStart);
 assert.ok(botQaStart>0&&botQaEnd>botQaStart,"QA blue BOT driver exists");
 const state={phase:"prep",prep:7,speed:1},netRole={isHost:true},calls=[];
 const create=new Function("S","NET","qaFrameBench","botExpertAction","rand",
  "let qaBotPlayed=[0,0,0],qaBlueBot=true,qaBlueReady=false,qaBlueThink=1.5,qaBlueDecisions=0;\n"+
  game.slice(botQaStart,botQaEnd)+
  "\nreturn {tick:qaRunBlueBot,decisions:()=>qaBlueDecisions};");
 const qa=create(state,netRole,{samples:[]},team=>calls.push(team),(a,b)=>(a+b)/2);
 qa.tick(.1);assert.deepEqual(calls,[1],"expert blue BOT executes prep turn");
 state.phase="battle";
 for(let i=0;i<300;i++)qa.tick(.1);
 assert.ok(calls.length>=8,"expert blue BOT makes decisions during 30s");
 assert.ok(calls.every(team=>team===1),"never takes over guest/human side");
 netRole.isHost=false;const prev=calls.length;qa.tick(12);
 assert.equal(calls.length,prev,"QA driver cannot activate on guest");
 for(const name of ["online-ipad.html","online-embed.html"])
  assert.ok(read(name).includes(game.trim()),"school bundle matches QA engine");
 console.log("PASS: BOT-vs-BOT QA mirrors blue expert without changing normal gameplay");
}


{
 const start=game.indexOf("function updateFortNavigation(){");
 const stop=game.indexOf("\n// Avoid invalidating the entire card footer",start);
 assert.ok(start>=0&&stop>start,"fort navigation code is extractable");
 let mutations=0;
 const classes=()=>{const entries=new Set();return {
  contains:k=>entries.has(k),
  toggle:(k,on)=>{mutations++;if(on)entries.add(k);else entries.delete(k)}
 }};
 const nodes=[0,1,2].map(()=>({
  classList:classes(),attrs:{},state:{textContent:""}, 
  querySelector(q){assert.equal(q,".fortState");return this.state},
  getAttribute(k){return this.attrs[k]??null},
  setAttribute(k,v){mutations++;this.attrs[k]=v}
 }));
 const nav={_hidden:true,querySelectorAll:()=>nodes,
  get hidden(){return this._hidden},
  set hidden(v){mutations++;this._hidden=v}};
 const summary={_text:"",get textContent(){return this._text},
  set textContent(v){mutations++;this._text=v}};
 for(const node of nodes){
  let value="";
  node.state={get textContent(){return value},
   set textContent(v){mutations++;value=v}};
 }
 const el=id=>id==="fortNav"?nav:id==="fortSummary"?summary:null;
 const S={phase:"battle",forts:[{x:100,y:300,owner:1},{x:600,y:300,owner:0},{x:1100,y:300,owner:2}],units:[]};
 const putHudFlag=(node,key,on)=>{if(node.classList.contains(key)!==on)node.classList.toggle(key,on)};
 const update=new Function("$","S","putHudFlag",game.slice(start,stop)+"\nreturn updateFortNavigation;")(el,S,putHudFlag);
 update();assert.equal(nav.hidden,false);assert.equal(summary.textContent,"基地 青1・赤1");
 mutations=0;for(let i=0;i<20;i++)update();
 assert.equal(mutations,0,"unchanged forts must cause zero DOM mutations");
 S.units.push({hp:100,team:1,x:600,y:300},{hp:100,team:2,x:600,y:300});
 update();assert.ok(nodes[1].classList.contains("contested"));
 assert.equal(nodes[1].state.textContent,"争奪");
 mutations=0;for(let i=0;i<20;i++)update();
 assert.equal(mutations,0,"contested state must also remain DOM-stable");
 S.forts[1].owner=2;S.units.pop();update();
 assert.ok(nodes[1].classList.contains("owner-red"));
 assert.ok(nodes[1].classList.contains("under-pressure"));
 assert.equal(nodes[1].state.textContent,"警戒");
 S.phase="menu";mutations=0;update();assert.equal(nav.hidden,true);
 assert.equal(mutations,1,"hiding the fort nav changes only visibility");
 mutations=0;update();assert.equal(mutations,0,"hidden menu HUD remains stable");
 S.phase="battle";update();assert.equal(nav.hidden,false);
 assert.ok(game.includes('putHudFlag($("announcement"),"visible",false);'),
  "expired announcement must also avoid repeated class mutations");
 console.log("PASS: fort navigation preserves battle, contested, warning, and hidden states without no-op DOM writes");
}

{
 const a=net.indexOf("function guestPlayableWorld(){"),b=net.indexOf("\nfunction updateUI(){",a);
 assert.ok(a>0&&b>a,"guest readiness source exists");
 const make=new Function("world",
  "const game={world:()=>world};let host=false,lastRemoteSeq=0;"+net.slice(a,b)+
  "\nreturn {ready:guestPlayableWorld,setSeq:n=>lastRemoteSeq=n,setHost:v=>host=v};");
 const state={phase:"menu"},q=make(state);
 assert.equal(q.ready(),false,"menu is not playable");
 state.phase="prep";assert.equal(q.ready(),false,"no applied snapshot");
 q.setSeq(2);assert.equal(q.ready(),true,"ready after first prep snapshot");
 state.phase="battle";assert.equal(q.ready(),true,"battle ready");
 state.phase="menu";assert.equal(q.ready(),false,"rematch blocks input");
 q.setSeq(0);state.phase="prep";assert.equal(q.ready(),false,"old snapshot is insufficient");
 q.setSeq(3);q.setHost(true);assert.equal(q.ready(),false,"host independent");
 const setup=net.slice(net.indexOf("function setupRoom(code,isHost){"),net.indexOf("async function create(){"));
 assert.ok(net.includes('if(phase==="playing"&&guestPlayableWorld())onlinePanel(false);'),"world-apply opens view");
 assert.ok(setup.includes('onlinePanel(meta?.status!=="playing"||(!host&&!guestPlayableWorld()));'),"rematch gating");
 assert.ok(setup.includes('else{onlinePanel(true);show("戦況を同期しています…");}'),"loading state");
 for(const page of ["online-ipad.html","online-embed.html"])
  assert.ok(read(page).includes(net.trim()),"bundle network consistency "+page);
 assert.ok(read("guest-lab-game.html").includes("function guestPlayableWorld(){"),"guest lab gating");
 console.log("PASS: playable world required before guest input UI");
}
// Approved cap pass: extract the shipping class/spell tables rather than duplicating
// a fictional catalog.  The two multi-summon cards consume one use per pair.
{
 const spellStart=game.indexOf("const SPELLS={");
 const spellEnd=game.indexOf("const CATALOG=",spellStart);
 assert.ok(spellStart>0&&spellEnd>spellStart,"spell table boundaries");
 const actualSpells=new Function(game.slice(spellStart,spellEnd)+"return SPELLS;")();
 const chosenCaps={
  infantry:Infinity,scout:4,engineer:3,archer:5,sentinel:3,suppress:2,
  guardian:2,drone:3,tank:2,duelist:4,crusher:2,ranger_engineer:3,
  interceptor:4,ground_bomber:2,piercer:4,catapult:2,kamikaze:4,
  mech_summoner:2,kaiju:2,small_machine:0,
  barrage:2,ward:3,gravity:2,gale:3
 };
 const roster={...originalClasses,...actualSpells};
 assert.deepEqual(Object.keys(roster).sort(),Object.keys(chosenCaps).sort(),
  "every playable card plus internal child has a reviewed cap");
 for(const [id,cap] of Object.entries(chosenCaps))
  assert.equal(roster[id].limit,cap,"approved use limit: "+id);
 assert.equal(roster.archer.qty,2);
 assert.equal(roster.drone.qty,2);
 assert.equal(roster.infantry.limit,Infinity,"permanent basic unit remains unlimited");
 const chosen=base=>base.reduce((sum,id)=>sum+roster[id].cost*roster[id].limit,0);
 assert.equal(chosen(["scout","engineer","archer","barrage","sentinel",
  "suppress","guardian","ward","drone","tank"]),113,
  "approved default deck finite card budget");
 const all=Object.keys(roster).filter(id=>id!=="infantry"&&!roster[id].internalOnly);
 assert.equal(all.length,22);
 let combinations=0,minBudget=Infinity,maxBudget=-Infinity;
 const enumerate=(i,n,total)=>{
  if(n===10){combinations++;minBudget=Math.min(minBudget,total);maxBudget=Math.max(maxBudget,total);return;}
  if(i>=all.length||all.length-i<10-n)return;
  enumerate(i+1,n+1,total+roster[all[i]].cost*roster[all[i]].limit);
  enumerate(i+1,n,total);
 };
 enumerate(0,0,0);
 assert.equal(combinations,646646,"all 10 distinct card deck combinations");
 assert.equal(minBudget,94,"smallest deck finite budget");
 assert.equal(maxBudget,132,"largest deck finite budget");
 const deckState={hand:[null,["archer","drone","tank","ward"],[]],
  queue:[null,["scout","engineer","sentinel","barrage","suppress","guardian"],[]],
  left:[null,{archer:5,drone:1,tank:2,ward:3,scout:4,engineer:3,
   sentinel:3,barrage:2,suppress:2,guardian:2},{}]};
 const handStart=game.indexOf("function advanceHand(team,id){");
 const handEnd=game.indexOf("const TEAM=",handStart);
 assert.ok(handStart>0&&handEnd>handStart,"shipping hand rotation section");
 const advance=new Function("S","HAND_SIZE",game.slice(handStart,handEnd)+
  "return advanceHand;")(deckState,4);
 deckState.left[1].archer--;
 advance(1,"archer");
 assert.equal(deckState.hand[1].length,4);
 assert.ok(deckState.queue[1].includes("archer"),"card with uses left returns to queue");
 deckState.left[1].drone--;
 advance(1,"drone");
 assert.equal(deckState.left[1].drone,0);
 assert.equal(deckState.hand[1].length,4,"depleted card is replaced");
 assert.ok(!deckState.queue[1].includes("drone"),"depleted card leaves rotation");
 console.log("PASS: approved per-card caps, all deck budgets, and exhausted-card hand rotation");
}
// Battle cards must expose charges prominently without requiring card detail.
// This executes the shipping buildCards() with tiny DOM stubs, including an
// unaffordable card, instead of only looking for labels in the source.
{
 const start=game.indexOf("function buildCards(){");
 const finish=game.indexOf("\nlet galleryResume=",start);
 assert.ok(start>=0&&finish>start,"shipping card builder found");
 const state={hand:[null,["scout","suppress","barrage","guardian"],[]],
  left:[null,{infantry:Infinity,scout:4,suppress:1,barrage:2,guardian:2},{}],
  selected:null,queue:[null,["archer"],[]]};
 const catalog={...originalClasses,...new Function(
  game.slice(game.indexOf("const SPELLS={"),game.indexOf("const CATALOG="))+
  "return SPELLS;")()};
 const items=[],cardList={replaceChildren(){items.length=0;},append(button){items.push(button);}};
 const next={textContent:""};
 const doc={createElement(){const classes=new Set();return {
  className:"",dataset:{},classList:{add(c){classes.add(c);},contains(c){return classes.has(c);}},
  setAttribute(key,value){this[key]=value;},addEventListener(){},
  querySelector(){return {};},_classes:classes,innerHTML:""
 };}};
 const create=new Function("cards","S","ME","CATALOG","isSpell","SIZE_LABEL",
  "canPay","window","document","$","cardDown","openCardInfo",
  game.slice(start,finish)+"return buildCards;");
 const build=create(cardList,state,()=>1,catalog,id=>!originalClasses[id],
  {small:"小型",medium:"中型",large:"大型"},()=>false,{},doc,
  id=>id==="nextCard"?next:null,()=>{},()=>{});
 build();
 assert.equal(items.length,5,"basic + four rotating cards");
 const byId=id=>items.find(b=>b.dataset.id===id);
 assert.ok(byId("infantry").innerHTML.includes("∞"),"basic uses are unlimited");
 assert.ok(byId("scout").innerHTML.includes('class="cardUsesNow">4</strong>')&&
  byId("scout").innerHTML.includes("width:100%"),"full charges visible");
 assert.ok(byId("suppress")._classes.has("uses-critical")&&
  byId("suppress").innerHTML.includes('class="cardUsesNow">1</strong>')&&
  byId("suppress").innerHTML.includes("width:50%"),
  "last use is explicit and highlighted");
 assert.ok(byId("suppress")._classes.has("unavailable"),
  "energy shortage must not override remaining use state");
 assert.ok(byId("barrage").innerHTML.includes('class="cardUsesTotal">/2</span>'),
  "spells have the same limit HUD");
 assert.ok(byId("guardian").innerHTML.includes('class="cardUsesTotal">/2</span>'),
  "large units have the same limit HUD");
 assert.match(byId("suppress")["aria-label"],/残り1回 \/ 上限2回/,
  "full remaining count is accessible");
 state.left[1].scout=2;
 build();
 assert.ok(byId("scout")._classes.has("uses-low")&&
  byId("scout").innerHTML.includes("width:50%"),"partly depleted count updates");
 state.left[1].scout=0;
 build();
 assert.ok(byId("scout")._classes.has("uses-critical")&&
  byId("scout")._classes.has("depleted")&&
  byId("scout").innerHTML.includes("width:0%"),"exhausted has clear zero");
 const css=read("online.html");
 for(const selector of [".cardUsesNow",".cardLimitTrack",".card.uses-low .cardUses",
  ".card.uses-critical .cardUses",".card.unavailable:not(.depleted) .cardPortrait"])
  assert.ok(css.includes(selector),"CSS missing charge selector "+selector);
 for(const page of ["online-ipad.html","online-embed.html"])
  assert.ok(read(page).includes(".card.uses-critical .cardUses"),
   "standalone file must include remaining-charge UI "+page);
 console.log("PASS: in-battle charge counts, urgency colors, gauge, aria, energy dimming, standalone CSS");
}
console.log("PASS: syntax, editable school HP/damage (both bundles), safe fallbacks, round isolation, reconnect, rematch, decks, BOT and tablet UI");
