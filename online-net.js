/* 小国戦線 III 1vs1 — Firebase RTDB transport, isolated from BRAWL rooms.
 * No game rules here. The host alone ticks battles and validates guest actions.
 * This is friend-play networking, not a tamper-proof or anti-cheat backend.
 */
(()=>{
"use strict";
const FIREBASE_DB_URL="https://mygame-df915-default-rtdb.firebaseio.com/";
const ROOT="shokokuRooms1v1";
const $=id=>document.getElementById(id);
const token=()=>{const a=new Uint32Array(2);if(window.crypto?.getRandomValues)crypto.getRandomValues(a);else throw Error("安全な乱数が使えません");return Array.from(a,x=>x.toString(36)).join("-");};
const clientId=token(), ROOM_VERSION=3;
let db=null,room=null,roomCode="",game=null,team=0,host=false,seq=0,commandSeq=0,lastGuestSeq=0;
let connected=false,players=null,meta=null,result=null,phase="none",lastSend=0,watchers=[],disconnectOp=null,botDisconnectOp=null,guestSyncHeartbeat=null;
let lastRemoteSeq=0,serverOffset=0,presencePending=false,solo=false,guestBot=false,soloDifficulty='normal',guestBotSwitchPending=false,hostBotSwitchPending=false;
let lastRemoteAppliedAt=0,lastSyncReadAt=0,syncWarning=false;
let lastStateEventAt=0,lastStateEventSeq=0,lastRestReadSeq=0,lastRestReadAt=0,restReadPending=false,restReadEpoch=0;
let lastHostPublishAt=0,lastHostPublishSeq=0,lastApplyError="";
// Local diagnostics only; never add them to Firebase or anonymous match logs.
let lastPayloadChars=0,lastEncodeMs=0,lastAckMs=0,lastApplyMs=0;
let coalescedPackets=0,publishRetries=0,publishFailures=0,lastFeedbackSeq=0;
let qaMuteSdkSnapshots=false,qaFreezeGuestWorld=false;
// Browser-only measurements: never upload these metrics to Firebase.
let appliedGaps=[],appliedPackets=0;
// When reconnecting after a stall Firebase can deliver several obsolete
// snapshots together. Apply only the newest on the next visible frame.
let pendingRemote=null,remoteScheduled=false,remoteEpoch=0,remoteApplyFallback=null,remoteFrameFlush=null;
const hostBotSeat=()=>host&&players?.guest?.online===true&&players.guest.localBot===true&&players.guest.id==="bot:"+clientId;
function cancelRemoteFallback(){if(remoteApplyFallback!==null){clearTimeout(remoteApplyFallback);remoteApplyFallback=null;}}
function stopGuestHeartbeat(){
 if(guestSyncHeartbeat!==null){clearInterval(guestSyncHeartbeat);guestSyncHeartbeat=null;}
}
let publishing=false,publishPending=false,networkEpoch=0,publishStartedAt=0,publishRetryAt=0,publishRetryCount=0,publishSerial=0;
const show=s=>{const el=$("netStatus");if(el)el.textContent=s;};
const setError=e=>{console.warn("Online:",e);show("通信エラー："+(e?.code==="PERMISSION_DENIED"?"Firebaseのルーム権限を確認してください":e?.message||String(e)));};
function onlinePanel(visible){$("onlinePanel").classList.toggle("hidden",!visible);}
// A meta event is not proof the first playable world has been applied.
function guestPlayableWorld(){
 const state=game?.world?.();
 return !host&&lastRemoteSeq>0&&(state?.phase==="prep"||state?.phase==="battle");
}
function updateUI(){
 const inRoom=!!room,guest=!!players?.guest?.online;
 const currentSeat=host?"host":"guest",mine=meta?.deckLobby?.[currentSeat];
 const ready=!!meta?.deckLobby?.host?.ready&&!!meta?.deckLobby?.guest?.ready;
 const ownBot=hostBotSeat();
 const seat=host?"host":"guest",other=host?"guest":"host";
 const seatValid=!inRoom||players?.[seat]?.id===clientId,peerOnline=!!players?.[other]?.online;
 $("netRoom").textContent=inRoom?roomCode:"-----";
 $("netSeat").textContent=inRoom?(host?"青軍／ホスト":"赤軍／ゲスト"):"参加前";
 $("netRoomInfo").textContent=inRoom?("ルーム "+roomCode+" ／ "+(host?"青軍":"赤軍")+(guest?" ／ 2人参加":" ／ 友達を待っています")):"5桁の番号で友達と対戦";
 $("netCreate").disabled=inRoom;
 $("netJoin").disabled=inRoom;
 $("netReady").disabled=!inRoom||!seatValid||!connected||!peerOnline||meta?.status!=="lobby";
 const myReady=!!mine?.ready&&mine.seatId===clientId&&mine.round===meta?.round;
 $("netReady").textContent=myReady?"準備OK ✓｜解除":"準備完了";
 window.ShokokuDeck?.setLocked(myReady);
 $("netStart").hidden=!host;
 $("netStart").disabled=!host||!ready||!peerOnline||!seatValid||meta?.status!=="lobby"||!connected;
 $("netShare").disabled=!inRoom;
 $("netHostBot").hidden=!(inRoom&&host&&meta?.status==="lobby"&&(!players?.guest?.online||ownBot));
 $("netHostBot").disabled=!connected||hostBotSwitchPending;
 $("netHostBot").textContent=ownBot?"🤖 BOTを退出させる":"🤖 BOTを参加させる";
  const guestControl=inRoom&&!host&&seatValid;
  $("netGuestBot").hidden=!guestControl;
  $("netGuestBot").disabled=!guestControl||!connected||guestBotSwitchPending;
  $("netGuestBot").textContent=guestBot?"BOT操作：ON ✓":"この参加端末をBOT操作";
  $("netGuestBot").setAttribute("aria-pressed",String(guestBot));
  $("guestBotLive").hidden=!(guestControl&&meta?.status==="playing");
  $("guestBotLive").textContent=guestBot?"🤖 BOT操作 ON｜手動へ":"🎮 手動操作｜BOTへ";
  $("guestBotLive").setAttribute("aria-pressed",String(guestBot));
 if(inRoom&&meta?.status==="lobby"&&connected)
  show(!seatValid?"参加情報が変更されました。新しいルームへ接続し直してください":!peerOnline?"相手の接続を待っています":ready?"2人準備OK。ホストが開始できます。":"2人参加中。両方が準備完了を押してください");
 if(inRoom&&meta?.status==="playing"&&connected){
  $("networkBar").classList.remove("hidden");
  $("networkBar").textContent="ONLINE "+roomCode+" ｜ "+(host?"青軍":"赤軍")+" ｜ "+(!connected?"通信切断：再接続中":!seatValid?"参加情報が無効":!peerOnline?"相手の再接続を待っています":"接続中");
 }else if(inRoom&&meta?.status==="finished"){
  $("networkBar").classList.remove("hidden");
  $("networkBar").textContent="ONLINE "+roomCode+" ｜ 試合終了";
 }
}
function attach(ref,event,fn){ref.on(event,fn,setError);watchers.push([ref,event,fn]);}
function detach(){
 for(const [ref,event,fn] of watchers)ref.off(event,fn);
 watchers=[];
 // Keep the server's onDisconnect cleanup armed until the tab really disconnects.
 // Cancelling it here would leave stale 'online:true' rooms after a page reload.
 disconnectOp=null;
}
function initFirebase(){
 if(db)return db;
 if(!window.firebase?.database)throw Error("Firebase SDKが読み込めません。学校のネットワーク制限を確認してください。");
 if(!firebase.apps.length)firebase.initializeApp({databaseURL:FIREBASE_DB_URL});
 db=firebase.database();
 return db;
}
async function registerPresence(){
 if(presencePending||!connected||!room)return;
 presencePending=true;
 const current=room,playerRef=current.child("players/"+(host?"host":"guest"));
 try{
  const record=(await playerRef.once("value")).val();
  if(current!==room||!connected)return;
  if(record?.id!==clientId){show("参加者IDが一致しません。新しいルームで接続し直してください");return;}
  const op=playerRef.onDisconnect();
  await op.update({online:false,lastSeen:firebase.database.ServerValue.TIMESTAMP});
  if(current!==room||!connected){await op.cancel().catch(()=>{});return;}
  disconnectOp=op;
  await playerRef.child("online").set(true);
 }catch(e){setError(e)}finally{
  presencePending=false;
  if(room&&room!==current&&connected)registerPresence().catch(setError);
 }
}
// Quantize only the transport copy. Host physics and card legality retain all
// original floating-point precision; 0.001 world unit is visually subpixel.
function packGuestWorld(source){
 const json=JSON.stringify(source,(_key,value)=>{
  if(value===Infinity)return 1000000000; // unlimited infantry capacity
  if(typeof value!=="number"||!Number.isFinite(value)||Number.isInteger(value))return value;
  return Math.round(value*1000)/1000;
 });
 return {world:JSON.parse(json),chars:json.length};
}
function worldSizePreview(){
 const original=game?.world?.();
 if(!original)return null;
 const raw=JSON.stringify(original,(_key,value)=>value===Infinity?1000000000:value);
 const packed=packGuestWorld(original);
 return {unitCount:original.units?.length||0,rawChars:raw.length,
  packedChars:packed.chars,reductionPct:Math.round(1000*(1-packed.chars/raw.length))/10};
}
function receiveGuestWorld(packet,source="sdk"){
 // QA only: block even REST recovery and queued snapshots during a HUD test.
 if(qaFreezeGuestWorld)return;
 if(source==="sdk"&&packet?.round===meta?.round&&Number.isInteger(packet.seq)){
  lastStateEventAt=performance.now();lastStateEventSeq=Math.max(lastStateEventSeq,packet.seq);
 }
 if(!packet||!Number.isInteger(packet.seq)||packet.round!==meta?.round||
  !packet.world||packet.seq<=Math.max(lastRemoteSeq,pendingRemote?.seq||0))return;
 if(pendingRemote)coalescedPackets++;
 pendingRemote=packet;
 if(remoteScheduled)return;
 remoteScheduled=true;const epoch=remoteEpoch;
 // iPad iframe can delay rAF after Firebase snapshots have already arrived.
 let finished=false;
 const flush=()=>{
  // A callback from a previous room/round must never clear the new queue.
  if(finished||epoch!==remoteEpoch)return;
  finished=true;cancelRemoteFallback();remoteScheduled=false;
  if(remoteFrameFlush===flush)remoteFrameFlush=null;
  if(host||!room)return;
  const latest=pendingRemote;pendingRemote=null;
  if(qaFreezeGuestWorld||!latest||latest.round!==meta?.round)return;
  try{
   const applyStart=performance.now();
   game?.apply(latest.world,latest.seq);
   const appliedAt=performance.now();
   lastApplyMs=appliedAt-applyStart;
   if(lastRemoteAppliedAt>0){
    appliedGaps.push(Math.max(0,appliedAt-lastRemoteAppliedAt));
    if(appliedGaps.length>32)appliedGaps.shift();
   }
   appliedPackets++;lastRemoteSeq=latest.seq;lastRemoteAppliedAt=appliedAt;
   // Protect the initial touch from arriving while game phase is still menu.
   if(phase==="playing"&&guestPlayableWorld())onlinePanel(false);
   lastApplyError="";
   if(syncWarning){syncWarning=false;updateUI();}
  }catch(e){lastApplyError=String(e?.message||e);setError(e)}
 };
 remoteFrameFlush=flush;
 remoteApplyFallback=setTimeout(()=>{
  if(epoch===remoteEpoch&&remoteScheduled&&!document.hidden)flush();
 },650);
 requestAnimationFrame(flush);
}
// The game loop may have been queued before the SDK listener's rAF callback.
// Apply its latest coalesced packet just BEFORE drawing, avoiding one extra
// visibly stale frame on a slow guest WebKit rAF. The existing rAF/650ms
// fallback remains for cases without a game paint callback.
function flushGuestBeforePaint(){
 if(!host&&room&&remoteScheduled&&remoteFrameFlush)remoteFrameFlush();
}
// rAF can keep painting an old world even when Firebase snapshots stop arriving.
// An occasional one-shot read gives the guest a second way to receive the latest
// state; the warning distinguishes network silence from low Canvas FPS.
// REST fallback bypasses RTDB's local event cache: once("value") can replay
// a stale locally cached snapshot when an SDK listener is stalled.
function restRecoverGuest(){
 if(restReadPending||host||!room||!roomCode)return;
 const epoch=remoteEpoch,code=roomCode,ref=room;
 restReadPending=true;
 const controller=typeof AbortController!=="undefined"?new AbortController():null;
 const timeout=setTimeout(()=>controller?.abort(),6000);
 fetch(FIREBASE_DB_URL+ROOT+"/"+code+"/state.json?ts="+Date.now(),
  {cache:"no-store",signal:controller?.signal}).then(async response=>{
   if(!response.ok)throw Error("状態再取得 HTTP "+response.status);
   const data=await response.json();
   if(epoch!==remoteEpoch||ref!==room||host)return;
   lastRestReadAt=performance.now();
   if(Number.isInteger(data?.seq))lastRestReadSeq=data.seq;
   receiveGuestWorld(data,"rest");
  }).catch(error=>{
   if(epoch!==remoteEpoch||ref!==room||host)return;
   lastApplyError="REST "+String(error?.message||error);
   // SDK read remains a compatibility fallback if REST is unavailable.
   ref.child("state").once("value").then(snap=>{
    // A cached one-shot read is not evidence the live SDK listener resumed.
    if(epoch===remoteEpoch&&ref===room&&!host)receiveGuestWorld(snap.val(),"cache");
   }).catch(setError);
  }).finally(()=>{
   clearTimeout(timeout);
   if(epoch===remoteEpoch&&ref===room)restReadPending=false;
  });
}
function checkGuestSync(){
 if(host||!room||phase!=="playing")return;
 const now=performance.now();
 if(!lastRemoteAppliedAt)lastRemoteAppliedAt=now;
 const appliedAge=now-lastRemoteAppliedAt;
 if(appliedAge<1100)return;
 // The browser may still paint old frames when SDK events stop arriving.
 // A real Firebase BOT duel showed SDK seq=82 while REST already had seq=97.
 // Read after ~1.1s of SDK silence; preserve the slower fallback for
 // received-but-not-applied packets (e.g. stalled Safari rAF).
 const sdkAge=lastStateEventAt?now-lastStateEventAt:appliedAge;
 if(sdkAge<1100&&appliedAge<3500)return;
 // Short SDK delivery hiccups are not shown as a user-visible warning.
 if(appliedAge>=3500&&!syncWarning){
  syncWarning=true;
  $("networkBar").classList.remove("hidden");
  $("networkBar").textContent="ONLINE "+roomCode+" ｜ 戦況同期が遅れています";
 }
 // A zero timestamp means "never fetched" and must not delay first recovery.
 // The first REST read may arrive before a paused host resumes. Retry
 // occasionally, bounded to at most one fallback read per 2.2 seconds.
 if(lastSyncReadAt&&now-lastSyncReadAt<2200)return;
 lastSyncReadAt=now;
 restRecoverGuest();
}
function syncDiagnostics(){
 const gaps=appliedGaps,avg=gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:0;
 const now=performance.now();
 return {connected,phase,role:solo?"solo":host?"host":"guest",
  packets:appliedPackets,seq:host?lastHostPublishSeq:lastRemoteSeq,
  eventSeq:lastStateEventSeq,restSeq:lastRestReadSeq,
  gapMs:Math.round(avg),maxGapMs:Math.round(gaps.length?Math.max(...gaps):0),
  updatesHz:avg?Math.round(10000/avg)/10:0,
  ageMs:Math.round(lastRemoteAppliedAt?now-lastRemoteAppliedAt:0),
  eventAgeMs:Math.round(lastStateEventAt?now-lastStateEventAt:0),
  restAgeMs:Math.round(lastRestReadAt?now-lastRestReadAt:0),
  publishAgeMs:Math.round(lastHostPublishAt?now-lastHostPublishAt:0),
  syncing:restReadPending,error:lastApplyError,
  // Character count is not billed bytes: TLS and RTDB framing are excluded.
  snapshotChars:lastPayloadChars,encodeMs:Math.round(lastEncodeMs*10)/10,
  ackMs:Math.round(lastAckMs),applyMs:Math.round(lastApplyMs*10)/10,
  coalesced:coalescedPackets,retries:publishRetries,writeFailures:publishFailures};
}
function setupRoom(code,isHost){
 stopGuestHeartbeat();
 solo=false;guestBot=false;
 lastPayloadChars=0;lastEncodeMs=0;lastAckMs=0;lastApplyMs=0;coalescedPackets=0;publishRetries=0;publishFailures=0;
 appliedGaps=[];appliedPackets=0;
 lastStateEventAt=0;lastStateEventSeq=0;lastRestReadSeq=0;lastRestReadAt=0;restReadPending=false;lastHostPublishAt=0;lastHostPublishSeq=0;lastApplyError="";
 cancelRemoteFallback();
 remoteEpoch++;restReadEpoch++;pendingRemote=null;remoteScheduled=false;remoteFrameFlush=null;lastRemoteAppliedAt=0;lastSyncReadAt=0;syncWarning=false;
 networkEpoch++;publishing=false;publishPending=false;publishStartedAt=0;publishRetryAt=0;publishRetryCount=0;publishSerial++;
 lastFeedbackSeq=0;
 roomCode=code;team=isHost?1:2;host=isHost;seq=0;commandSeq=0;lastGuestSeq=0;lastRemoteSeq=0;lastSend=0;window.__onlineSeq=0;
 players=null;meta=null;phase="lobby";result=null;
 room=db.ref(ROOT+"/"+code);
 // resetLobby clears team=0 and the previous match is reset with BLUE
 // camera. Align only the camera AFTER assigning the new team, BEFORE
 // registering Firebase listeners. Never reroll decks or reset a second time.
 game?.alignLobbyCameraForSeat?.();
 const openedRoom=room;
 if(connected)registerPresence().catch(setError);
 attach(room.child("players"),"value",snap=>{
  if(room!==openedRoom)return;
  players=snap.val();
  updateUI();
 });
 attach(room.child("meta"),"value",snap=>{
  if(room!==openedRoom)return;
  const before=meta?.status,priorRound=meta?.round;
  meta=snap.val();
  // Short lobby transitions may be skipped: detect new rounds by number.
  const newRound=Number(priorRound)>0&&Number(meta?.round)>Number(priorRound);
  if(newRound||(meta?.status==="lobby"&&before==="finished")){
   phase="lobby";seq=0;commandSeq=0;lastGuestSeq=0;lastRemoteSeq=0;lastSend=0;lastFeedbackSeq=0;
   lastPayloadChars=0;lastEncodeMs=0;lastAckMs=0;lastApplyMs=0;coalescedPackets=0;publishRetries=0;publishFailures=0;
   appliedGaps=[];appliedPackets=0;lastRemoteAppliedAt=0;lastSyncReadAt=0;syncWarning=false;
   lastStateEventAt=0;lastStateEventSeq=0;lastRestReadSeq=0;lastRestReadAt=0;lastApplyError="";
   cancelRemoteFallback();
   remoteEpoch++;pendingRemote=null;remoteScheduled=false;remoteFrameFlush=null;
   networkEpoch++;publishing=false;publishPending=false;publishStartedAt=0;publishRetryAt=0;publishRetryCount=0;publishSerial++;
   window.__onlineSeq=0;window.__onlineHandSig="";
   game?.resetForLobby?.();
   onlinePanel(meta?.status!=="playing"||(!host&&!guestPlayableWorld()));$("networkBar").classList.add("hidden");
   if(meta?.status!=="playing")show("再戦の準備をしてください。2人とも準備完了で開始できます");
  }
  if(meta?.status==="playing"&&(before!=="playing"||newRound)){
   phase="playing";lastRemoteAppliedAt=performance.now();
   if(host){
    if(!validLockedDecks(meta?.lockedDecks,meta?.round)){
     show("デッキ確定データが不正です。再戦ロビーで準備し直してください");return;
    }
    onlinePanel(false);
    try{game?.begin();maybePublish(true);}catch(e){setError(e);onlinePanel(true);}
   }else{
    if(guestPlayableWorld())onlinePanel(false);
    else{onlinePanel(true);show("戦況を同期しています…");}
    if(newRound)restRecoverGuest();
   }
  }
  if(meta?.status==="finished"&&before!=="finished"){
   phase="finished";
   if(!host&&result)game?.showResult?.(result);
  }
  updateUI();
 });
 attach(room.child("result"),"value",snap=>{
  if(room!==openedRoom)return;
  result=snap.val();
  if(result&&!host&&meta?.status==="finished")game?.showResult?.(result);
 });
 if(host){
  attach(room.child("commands"),"child_added",async snap=>{
   if(room!==openedRoom)return;
   const data=snap.val();if(!data)return;
   // Only accepted orders from this room's registered guest; all gameplay checks run in host.
   if(meta?.status==="playing"&&data.round===meta.round&&data.by===players?.guest?.id&&players?.guest?.online&&
      Number.isInteger(data.seq)&&data.seq>lastGuestSeq){
    lastGuestSeq=data.seq;
    const valid=game?.accept({id:data.id,x:data.x,y:data.y})===true;
    if(!valid)room.child("feedback").set({seq:data.seq,round:meta.round,message:"召喚できませんでした。コスト・範囲・カードを確認。"}).catch(()=>{});
    else maybePublish(true);
   }
   try{await snap.ref.remove()}catch(e){setError(e)}
  });
 }else{
  // Check liveness outside the painting loop, which Safari can throttle.
  // Normal frames still perform the faster existing 120ms check.
  guestSyncHeartbeat=setInterval(()=>{if(!document.hidden)checkGuestSync();},1500);
  guestSyncHeartbeat?.unref?.(); // Node-only: don't hold simulated CI process open.
  attach(room.child("state"),"value",snap=>{
   if(room!==openedRoom)return;
   if(!qaMuteSdkSnapshots)receiveGuestWorld(snap.val());
  });
  attach(room.child("feedback"),"value",snap=>{
   if(room!==openedRoom)return;
   const feedback=snap.val();
   // Earlier errors must not disappear when the player has already sent
   // another command. Accept the newest unseen rejection for THIS round.
   if(feedback?.round===meta?.round&&Number.isInteger(feedback?.seq)&&
      feedback.seq<=commandSeq&&feedback.seq>lastFeedbackSeq){
    lastFeedbackSeq=feedback.seq;
    show(feedback.message);
    game?.notify?.(feedback.message);
   }
  });
 }
 updateUI();
}
async function create(){
 try{
  $("netCreate").disabled=true;initFirebase();
  for(let attempt=0;attempt<12;attempt++){
   const code=String(10000+Math.floor(Math.random()*90000));
   const ref=db.ref(ROOT+"/"+code);
   const now=Date.now()+serverOffset;
   const proposed={
    meta:{version:ROOM_VERSION,status:"lobby",round:1,createdAt:now,
     deckLobby:{host:{seatId:clientId,round:1,revision:0,ready:false,deckIds:window.ShokokuDeck.current()}}},
    players:{host:{id:clientId,ready:false,online:true,joinedAt:now}}
   };
   const result=await ref.transaction(old=>{
    if(old===null)return proposed;
    const expired=now-(old.meta?.createdAt||0)>24*60*60*1000;
    return expired&&!old.players?.host?.online&&!old.players?.guest?.online?proposed:undefined;
   },undefined,false);
   if(result.committed){setupRoom(code,true);return}
  }
  throw Error("ルーム番号を確保できませんでした");
 }catch(e){setError(e);$("netCreate").disabled=false;}
}
async function join(){
 const code=String($("netJoinCode").value||"").replace(/\D/g,"").slice(0,5);
 if(!/^\d{5}$/.test(code)){show("5桁のルーム番号を入力してください");return}
 try{
  initFirebase();const ref=db.ref(ROOT+"/"+code);
  const status=(await ref.child("meta").once("value")).val();
  const owner=(await ref.child("players/host").once("value")).val();
  if(!status||status.status!=="lobby"||status.version!==ROOM_VERSION||!(status.round>=1)||!owner?.online||Date.now()+serverOffset-(status.createdAt||0)>24*60*60*1000)
   throw Error("参加できるルームが見つかりません（ホストが接続中か確認してください）");
  const now=Date.now()+serverOffset;
  const p=await ref.child("players/guest").transaction(old=>(old===null||old.online===false)?{id:clientId,ready:false,online:true,joinedAt:now,botControl:false}:undefined,undefined,false);
  if(!p.committed)throw Error("そのルームにはすでに2人います");
  const latest=(await ref.child("meta").once("value")).val();
  if(latest?.status!=="lobby"){
   await ref.child("players/guest").transaction(old=>old?.id===clientId?null:undefined,undefined,false);
   throw Error("試合が先に開始されました。別のルームに参加してください");
  }
  // Seat reservation is separate from the lobby transaction: bind the exact
  // winning clientId before it is allowed to submit a deck or ready up.
  const seated=await ref.child("meta").transaction(old=>{
   if(!old||old.status!=="lobby"||old.version!==ROOM_VERSION||old.round!==latest.round)return;
   if(old.deckLobby?.guest?.seatId&&old.deckLobby.guest.seatId!==clientId&&
      old.deckLobby.guest.ready)return;
   return {...old,deckLobby:{...old.deckLobby,guest:{
    seatId:clientId,round:old.round,revision:0,ready:false,deckIds:window.ShokokuDeck.current()}}};
  },undefined,false);
  if(!seated.committed){
   await ref.child("players/guest").transaction(old=>old?.id===clientId?null:undefined,undefined,false);
   throw Error("入室中にロビーが更新されました。もう一度参加してください");
  }
  setupRoom(code,false);
 }catch(e){setError(e)}
}
async function toggleHostBot(){
 if(!host||!room||meta?.status!=="lobby"||!connected||hostBotSwitchPending)return;
 hostBotSwitchPending=true;
 const current=room,botId="bot:"+clientId,remove=hostBotSeat();
 try{
  const tx=await current.child("players/guest").transaction(old=>{
   if(remove)return old?.localBot===true&&old?.id===botId?{...old,online:false,ready:false}:undefined;
   if(old?.online===true)return;
   return {id:botId,ready:true,online:true,botControl:true,localBot:true,joinedAt:Date.now()+serverOffset};
  },undefined,false);
  if(!tx.committed||room!==current||meta?.status!=="lobby")
   throw Error("BOTの参加状態が変わりました。ルームを確認してください");
  // A BOT seat must own a valid deck in the same authoritative lobby as READY.
  const botMeta=await current.child("meta").transaction(old=>{
   if(!old||old.status!=="lobby"||old.version!==ROOM_VERSION)return;
   const next={...old.deckLobby};
   if(remove)delete next.guest;
   else next.guest={seatId:botId,round:old.round,revision:0,ready:true,
    deckIds:window.ShokokuDeck.standard()};
   return {...old,deckLobby:next};
  },undefined,false);
  if(!botMeta.committed)throw Error("BOTデッキの準備に失敗しました");
  if(!remove){
   game?.setDifficulty?.(soloDifficulty);
   // If the host tab vanishes, do not leave a fake guest occupying the room.
   const onLeave=current.child("players/guest").onDisconnect();
   await onLeave.update({online:false,ready:false});
   if(current!==room){await onLeave.cancel();return;}
   botDisconnectOp=onLeave;
  }else if(botDisconnectOp){
   const onLeave=botDisconnectOp;botDisconnectOp=null;
   await onLeave.cancel().catch(e=>console.warn("BOT disconnect cleanup:",e));
  }
  show(remove?"BOTが退出しました。友達が参加できます":"BOTが赤軍として参加しました。準備完了を押して開始できます");
 }catch(e){setError(e)}finally{hostBotSwitchPending=false;updateUI();}
}
async function toggleGuestBot(){
 if(solo||!room||host||players?.guest?.id!==clientId||!connected||guestBotSwitchPending)return;
 guestBotSwitchPending=true;
 const currentRoom=room,next=!guestBot;
 try{
  const changed=await currentRoom.child("players/guest").transaction(old=>
   old?.id===clientId?{...old,botControl:next}:undefined,undefined,false);
  if(!changed.committed||room!==currentRoom)throw Error("参加情報が変更されました");
  guestBot=next;
  game?.setBotControl?.(guestBot);
  updateUI();
  if(guestBot&&meta?.status==="lobby"&&!meta?.deckLobby?.guest?.ready&&connected)await ready();
  show(guestBot?"BOT操作ON。ホストが開始すると自動召喚します":"手動操作に戻しました");
 }catch(e){setError(e)}
 finally{guestBotSwitchPending=false;updateUI();}
}
function startSolo(){
 if(room||solo)return;
 game?.setDifficulty?.(soloDifficulty);
 solo=true;guestBot=false;team=1;host=false;
 document.body.classList.add("soloMode");
 $("onlinePanel").classList.add("hidden");
 $("networkBar").classList.remove("hidden");
 $("networkBar").textContent="OFFLINE｜青軍 vs BOT赤軍";
 game?.begin();
}
function validLockedDecks(value,round){
 return !!value&&value.round===round&&value.version===ROOM_VERSION&&
  window.ShokokuDeck?.validate(value.hostDeckIds)&&
  window.ShokokuDeck?.validate(value.guestDeckIds)&&
  typeof value.hostSeatId==="string"&&typeof value.guestSeatId==="string";
}
async function ready(){
 if(!room||meta?.status!=="lobby"||!connected)return;
 const current=room,seat=host?"host":"guest",me=players?.[seat];
 const expectedRound=meta?.round,expectedSeat=clientId;
 if(me?.id!==expectedSeat){show("参加者情報が一致しません");return;}
 const old=meta?.deckLobby?.[seat],nextReady=!(old?.ready&&old.seatId===expectedSeat);
 const chosen=window.ShokokuDeck?.current();
 if(nextReady&&!window.ShokokuDeck?.validate(chosen)){
  show("デッキは重複なしの10種類で完成させてください");return;
 }
 $("netReady").disabled=true;
 try{
  const result=await current.child("meta").transaction(state=>{
   if(!state||state.status!=="lobby"||state.version!==ROOM_VERSION||
      state.round!==expectedRound)return;
   const seatRecord=state.deckLobby?.[seat];
   if(seatRecord?.seatId!==expectedSeat)return;
   const ids=nextReady?chosen:seatRecord.deckIds;
   if(!window.ShokokuDeck.validate(ids))return;
   return {...state,deckLobby:{...state.deckLobby,[seat]:{
    ...seatRecord,seatId:expectedSeat,round:expectedRound,
    revision:(seatRecord.revision||0)+1,ready:nextReady,deckIds:ids}}};
  },undefined,false);
  if(!result.committed)throw Error("準備中に参加情報が変わりました。やり直してください");
 }catch(e){setError(e)}finally{updateUI();}
}
async function startMatch(){
 if(!host||!room||meta?.status!=="lobby"||!connected||!players?.guest?.online)return;
 const current=room,expectedRound=meta.round,hostId=players?.host?.id,guestId=players?.guest?.id;
 if(hostId!==clientId||!guestId)return;
 $("netStart").disabled=true;
 try{
  const result=await current.child("meta").transaction(state=>{
   if(!state||state.status!=="lobby"||state.version!==ROOM_VERSION||
      state.round!==expectedRound)return;
   const a=state.deckLobby?.host,b=state.deckLobby?.guest;
   if(!a?.ready||!b?.ready||a.seatId!==hostId||b.seatId!==guestId||
      a.round!==expectedRound||b.round!==expectedRound||
      !window.ShokokuDeck.validate(a.deckIds)||!window.ShokokuDeck.validate(b.deckIds))return;
   const lockedDecks={round:expectedRound,version:ROOM_VERSION,
    hostSeatId:hostId,guestSeatId:guestId,
    hostDeckIds:a.deckIds.slice(),guestDeckIds:b.deckIds.slice()};
   return {...state,status:"playing",startedAt:Date.now(),lockedDecks};
  },undefined,false);
  if(!result.committed)throw Error("対戦開始前に準備状態が変わりました。確認してください");
 }catch(e){setError(e)}finally{updateUI();}
}
function sendCommand(c){
 if(host||!room||phase!=="playing"||!connected||players?.guest?.id!==clientId)return false;
 if(!c||typeof c.id!=="string"||!Number.isFinite(c.x)||!Number.isFinite(c.y))return false;
 const seq=++commandSeq;
 room.child("commands").push({by:clientId,seq,round:meta?.round||1,id:c.id,x:c.x,y:c.y,time:Date.now()+serverOffset}).catch(setError);
 return true; // Queued locally, not yet host-confirmed.
}
function maybePublish(force=false){
 if(!host||!room||phase!=="playing"||!game||!connected)return;
 const now=performance.now();
 if(publishing){
  if(force)publishPending=true;
  // A Firebase set() promise can remain unresolved during network stalls,
  // while the guest keeps rendering a frozen snapshot. Retry at a bounded
  // pace rather than permanently locking the one-snapshot publisher.
  if(now-publishStartedAt<2800||(publishRetryAt&&
    now-publishRetryAt<(publishRetryCount>=8?18000:4800)))return;
  // At 8 retries switch to a slower watch, not a permanent deadlock.
  publishRetryAt=now;publishRetryCount=Math.min(8,publishRetryCount+1);publishRetries++;
 }else if(!force&&now-lastSend<(game.world()?.units?.length>=50?180:125))return;
 lastSend=now;publishing=true;publishStartedAt=now;
 const current=room,epoch=networkEpoch,serial=++publishSerial;
 let packed;
 try{
  const encodeStart=performance.now();
  packed=packGuestWorld(game.world());
  lastEncodeMs=performance.now()-encodeStart;
  lastPayloadChars=packed.chars;
 }catch(e){
  // A serialization failure must never freeze the sole snapshot publisher.
  publishing=false;setError(e);return;
 }
 lastHostPublishAt=performance.now();lastHostPublishSeq=seq+1;
 const sentAt=performance.now();
 current.child("state").set({seq:++seq,round:meta?.round||1,world:packed.world,at:Date.now()+serverOffset})
  .then(()=>{if(epoch===networkEpoch&&current===room&&serial===publishSerial)
   lastAckMs=performance.now()-sentAt;})
  .catch(e=>{publishFailures++;setError(e)}).finally(()=>{
   if(epoch!==networkEpoch||current!==room||serial!==publishSerial)return;
   publishing=false;publishRetryCount=0;
   if(publishPending){publishPending=false;maybePublish(true)}
  });
}
function finish(data){
 if(solo)return;
 if(!host||!room||phase!=="playing")return;
 phase="finished";
 // Force publish the final world before closing, so the guest sees the last HP.
 const world=packGuestWorld(game.world()).world;
 const winner=data.result==="draw"?0:data.result==="win"?1:2,at=Date.now()+serverOffset;
 room.update({
  state:{seq:++seq,round:meta?.round||1,world:{...world,phase:"result"},at},
  result:{winner,reason:data.reason,at},
  "meta/status":"finished"
 }).catch(setError);
}
function resultForMe(){return !result||result.winner===0?"draw":result.winner===team?"win":"lose"}
function hasResult(){return !!result}
function resultReason(){return result?.reason||"対戦終了"}
async function rematch(){
 if(solo){game?.begin();return;}
 if(!room||!connected)return;
 if(!host){
  if(meta?.status==="finished"){
   $("start").disabled=true;
   $("start").textContent="ホストの再戦を待っています…";
   $("dialogText").textContent="ホストが再戦を押すと、同じルームの準備画面に戻ります。退出する場合は「ルームを退出する」を押してください。";
  }
  return;
 }
 if(meta?.status!=="finished")return;
 const current=room,oldRound=meta.round;
 try{
  $("start").disabled=true;
  const changed=await current.child("meta").transaction(old=>{
   if(!old||old.status!=="finished"||old.round!==oldRound)return;
   const nextRound=oldRound+1,deckLobby={};
   for(const seat of ["host","guest"]){
    const rec=old.deckLobby?.[seat];
    if(!rec)continue;
    const bot=seat==="guest"&&hostBotSeat();
    deckLobby[seat]={...rec,round:nextRound,ready:bot,revision:0,
     deckIds:bot?window.ShokokuDeck.standard():rec.deckIds};
   }
   return {...old,status:"lobby",startedAt:null,round:nextRound,
    deckLobby,lockedDecks:null};
  },undefined,false);
  if(!changed.committed)throw Error("再戦の状態が変わりました");
  await current.update({state:null,result:null,commands:null,feedback:null});
 }catch(e){setError(e)}finally{$("start").disabled=false;}
}
function resetLobby(){
 const leaving=room,seat=host?"host":"guest",leavingDisconnect=disconnectOp;
 const leavingBot=hostBotSeat(),leavingBotId="bot:"+clientId;
 const leavingPlayers=players;
 const leavingBotOp=botDisconnectOp;botDisconnectOp=null;
 // Return to the room picker immediately. Never block Safari/Sites navigation
 // on a Firebase read/write; onDisconnect remains a fallback for stale presence.
 room=null;phase="none";solo=false;guestBot=false;guestBotSwitchPending=false;hostBotSwitchPending=false;
 cancelRemoteFallback();stopGuestHeartbeat();
 remoteEpoch++;restReadEpoch++;pendingRemote=null;remoteScheduled=false;remoteFrameFlush=null;
 restReadPending=false;lastRemoteAppliedAt=0;lastSyncReadAt=0;syncWarning=false;
 networkEpoch++;publishing=false;publishPending=false;publishStartedAt=0;publishRetryAt=0;publishRetryCount=0;publishSerial++;
 detach();roomCode="";team=0;host=false;players=null;meta=null;result=null;
 seq=0;commandSeq=0;lastGuestSeq=0;lastRemoteSeq=0;lastSend=0;lastFeedbackSeq=0;
 lastPayloadChars=0;lastEncodeMs=0;lastAckMs=0;lastApplyMs=0;coalescedPackets=0;publishRetries=0;publishFailures=0;
 window.__onlineSeq=0;window.__onlineHandSig="";
 document.body.classList.remove("soloMode");
 $("networkBar").classList.add("hidden");
 game?.resetForLobby?.();
 onlinePanel(true);updateUI();
 show("新しいルームを作成するか、5桁の番号で参加してください");
 if(leaving&&connected&&leavingPlayers?.[seat]?.id===clientId){
  // Leave the registered seats with one atomic RTDB write, not transaction()
  // against a room whose Firebase listeners were just removed. A transaction
  // can abort locally when the old room's SDK cache is no longer hydrated.
  // Never await here: the room picker must remain usable during network stalls.
  const patch={
   ["players/"+seat+"/online"]:false,
   ["players/"+seat+"/ready"]:false
  };
  if(seat==="host"&&leavingBot&&
     leavingPlayers?.guest?.id===leavingBotId&&leavingPlayers.guest.localBot===true){
   patch["players/guest/online"]=false;
   patch["players/guest/ready"]=false;
  }
  leaving.update(patch).then(()=>{
   leavingDisconnect?.cancel?.().catch(e=>console.warn("Old room disconnect hook:",e));
   if(leavingBot)leavingBotOp?.cancel?.().catch(e=>console.warn("Old BOT disconnect hook:",e));
  }).catch(e=>console.warn("Room exit cleanup:",e));
 }
}
const api={
 get team(){return solo?1:team},get isHost(){return host||solo},
 get matchDecks(){return !solo&&meta?.status==="playing"?meta?.lockedDecks:null},
  get isOnline(){return !solo},get isSolo(){return solo},get guestBot(){return guestBot},
  get hostBot(){return hostBotSeat()},get botActive(){return solo||guestBot||hostBotSeat()},
 get canSendCommand(){return !host&&!!room&&phase==="playing"&&connected&&players?.guest?.id===clientId},
 get soloDifficulty(){return soloDifficulty},
 registerGame(x){game=x},maybePublish,checkGuestSync,flushGuestBeforePaint,syncDiagnostics,sendCommand,finish,resultForMe,hasResult,resultReason,resetLobby,rematch,
 reportVisibility(hidden){if(hidden&&phase==="playing")show("画面を離れると通信が遅れる場合があります。");}
};
window.ShokokuNet=api;
if((location.hostname==="localhost"||location.hostname==="127.0.0.1")&&new URLSearchParams(location.search).has("qa")){
 window.__shokokuNetQa={
  muteSdkSnapshots:flag=>{qaMuteSdkSnapshots=!!flag;},
  freezeGuestWorld:flag=>{qaFreezeGuestWorld=!!flag;},
  triggerRecovery:()=>{lastRemoteAppliedAt=performance.now()-6500;lastSyncReadAt=0;checkGuestSync();},
  stats:syncDiagnostics,packGuestWorld,worldSizePreview
 };
}
document.addEventListener("DOMContentLoaded",()=>{
 $("netCreate").addEventListener("click",create);
 $("netHostBot").addEventListener("click",toggleHostBot);
  $("netSolo").addEventListener("click",startSolo);
  document.querySelectorAll("[data-solo-level]").forEach(button=>button.addEventListener("click",()=>{
    if(room||solo)return;
    const level=button.dataset.soloLevel;
    if(!["easy","normal","hard"].includes(level))return;
    soloDifficulty=level;
    document.querySelectorAll("[data-solo-level]").forEach(b=>{
      const selected=b.dataset.soloLevel===level;
      b.classList.toggle("selected",selected);
      b.setAttribute("aria-pressed",String(selected));
    });
  }));
  $("netGuestBot").addEventListener("click",toggleGuestBot);
  $("guestBotLive").addEventListener("click",toggleGuestBot);
 $("netJoin").addEventListener("click",join);
 $("netReady").addEventListener("click",ready);
 $("netStart").addEventListener("click",startMatch);
 $("netShare").addEventListener("click",()=>{
  if(!roomCode)return;
  $("netJoinCode").value=roomCode;
  $("netJoinCode").select();
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(roomCode).then(()=>show("ルーム番号をコピーしました")).catch(()=>show("番号を選択しました。コピーして共有してください"));
  else show("番号を選択しました。コピーして共有してください");
 });
 try{initFirebase();db.ref(".info/serverTimeOffset").on("value",snap=>{serverOffset=Number(snap.val())||0;});db.ref(".info/connected").on("value",snap=>{
  const wasConnected=connected;
  connected=snap.val()===true;if(!connected)show("通信が切れました。自動再接続を待っています。");else if(!room)show("接続OK。ルームを作成・参加できます。");
  if(connected&&room){
   registerPresence().catch(setError);
   if(!wasConnected&&host&&phase==="playing"){
    publishing=false;publishSerial++;publishRetryCount=0;publishRetryAt=0;
    maybePublish(true);
   }
  }
  updateUI();
 })}catch(e){setError(e)}
 updateUI();
});
})();
