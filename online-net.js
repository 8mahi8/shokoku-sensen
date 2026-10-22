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
const clientId=token(), ROOM_VERSION=2;
let db=null,room=null,roomCode="",game=null,team=0,host=false,seq=0,commandSeq=0,lastGuestSeq=0;
let connected=false,players=null,meta=null,result=null,phase="none",lastSend=0,watchers=[],disconnectOp=null;
let lastRemoteSeq=0,serverOffset=0,presencePending=false,solo=false,guestBot=false,soloDifficulty='normal',guestBotSwitchPending=false;
let lastRemoteAppliedAt=0,lastSyncReadAt=0,syncWarning=false;
let lastStateEventAt=0,lastStateEventSeq=0,lastRestReadSeq=0,lastRestReadAt=0,restReadPending=false,restReadEpoch=0;
let lastHostPublishAt=0,lastHostPublishSeq=0,lastApplyError="";
// Local diagnostics only; never add them to Firebase or anonymous match logs.
let lastPayloadChars=0,lastEncodeMs=0,lastAckMs=0,lastApplyMs=0;
let coalescedPackets=0,publishRetries=0,publishFailures=0;
let qaMuteSdkSnapshots=false;
// Browser-only measurements: never upload these metrics to Firebase.
let appliedGaps=[],appliedPackets=0;
// When reconnecting after a stall Firebase can deliver several obsolete
// snapshots together. Apply only the newest on the next visible frame.
let pendingRemote=null,remoteScheduled=false,remoteEpoch=0;
let publishing=false,publishPending=false,networkEpoch=0,publishStartedAt=0,publishRetryAt=0,publishRetryCount=0,publishSerial=0;
const show=s=>{const el=$("netStatus");if(el)el.textContent=s;};
const setError=e=>{console.warn("Online:",e);show("通信エラー："+(e?.code==="PERMISSION_DENIED"?"Firebaseのルーム権限を確認してください":e?.message||String(e)));};
function onlinePanel(visible){$("onlinePanel").classList.toggle("hidden",!visible);}
function updateUI(){
 const inRoom=!!room,guest=!!players?.guest,ready=!!players?.host?.ready&&!!players?.guest?.ready;
 const seat=host?"host":"guest",other=host?"guest":"host";
 const seatValid=!inRoom||players?.[seat]?.id===clientId,peerOnline=!!players?.[other]?.online;
 $("netRoom").textContent=inRoom?roomCode:"-----";
 $("netSeat").textContent=inRoom?(host?"青軍／ホスト":"赤軍／ゲスト"):"参加前";
 $("netRoomInfo").textContent=inRoom?("ルーム "+roomCode+" ／ "+(host?"青軍":"赤軍")+(guest?" ／ 2人参加":" ／ 友達を待っています")):"5桁の番号で友達と対戦";
 $("netCreate").disabled=inRoom;
 $("netJoin").disabled=inRoom;
 $("netReady").disabled=!inRoom||!seatValid||!connected||!peerOnline||meta?.status!=="lobby";
 $("netReady").textContent=host&&players?.host?.ready||!host&&players?.guest?.ready?"準備OK ✓":"準備完了";
 $("netStart").hidden=!host;
 $("netStart").disabled=!host||!ready||!peerOnline||!seatValid||meta?.status!=="lobby"||!connected;
 $("netShare").disabled=!inRoom;
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
function receiveGuestWorld(packet){
 if(packet?.round===meta?.round&&Number.isInteger(packet.seq)){
  lastStateEventAt=performance.now();lastStateEventSeq=Math.max(lastStateEventSeq,packet.seq);
 }
 if(!packet||!Number.isInteger(packet.seq)||packet.round!==meta?.round||
  !packet.world||packet.seq<=Math.max(lastRemoteSeq,pendingRemote?.seq||0))return;
 if(pendingRemote)coalescedPackets++;
 pendingRemote=packet;
 if(remoteScheduled)return;
 remoteScheduled=true;const epoch=remoteEpoch;
 requestAnimationFrame(()=>{
  remoteScheduled=false;
  if(epoch!==remoteEpoch||host||!room)return;
  const latest=pendingRemote;pendingRemote=null;
  if(!latest||latest.round!==meta?.round)return;
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
   lastApplyError="";
   if(syncWarning){syncWarning=false;updateUI();}
  }catch(e){lastApplyError=String(e?.message||e);setError(e)}
 });
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
   receiveGuestWorld(data);
  }).catch(error=>{
   if(epoch!==remoteEpoch||ref!==room||host)return;
   lastApplyError="REST "+String(error?.message||error);
   // SDK read remains a compatibility fallback if REST is unavailable.
   ref.child("state").once("value").then(snap=>{
    if(epoch===remoteEpoch&&ref===room&&!host)receiveGuestWorld(snap.val());
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
 if(now-lastRemoteAppliedAt<3500)return;
 if(!syncWarning){
  syncWarning=true;
  $("networkBar").classList.remove("hidden");
  $("networkBar").textContent="ONLINE "+roomCode+" ｜ 戦況同期が遅れています";
 }
 if(now-lastSyncReadAt<4500)return;
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
 solo=false;guestBot=false;
 lastPayloadChars=0;lastEncodeMs=0;lastAckMs=0;lastApplyMs=0;coalescedPackets=0;publishRetries=0;publishFailures=0;
 appliedGaps=[];appliedPackets=0;
 lastStateEventAt=0;lastStateEventSeq=0;lastRestReadSeq=0;lastRestReadAt=0;restReadPending=false;lastHostPublishAt=0;lastHostPublishSeq=0;lastApplyError="";
 remoteEpoch++;restReadEpoch++;pendingRemote=null;remoteScheduled=false;lastRemoteAppliedAt=0;lastSyncReadAt=0;syncWarning=false;
 networkEpoch++;publishing=false;publishPending=false;publishStartedAt=0;publishRetryAt=0;publishRetryCount=0;publishSerial++;
 roomCode=code;team=isHost?1:2;host=isHost;seq=0;commandSeq=0;lastGuestSeq=0;lastRemoteSeq=0;lastSend=0;window.__onlineSeq=0;
 players=null;meta=null;phase="lobby";result=null;
 room=db.ref(ROOT+"/"+code);
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
   phase="lobby";seq=0;commandSeq=0;lastGuestSeq=0;lastRemoteSeq=0;lastSend=0;
   lastPayloadChars=0;lastEncodeMs=0;lastAckMs=0;lastApplyMs=0;coalescedPackets=0;publishRetries=0;publishFailures=0;
   appliedGaps=[];appliedPackets=0;lastRemoteAppliedAt=0;lastSyncReadAt=0;syncWarning=false;
   lastStateEventAt=0;lastStateEventSeq=0;lastRestReadSeq=0;lastRestReadAt=0;lastApplyError="";
   remoteEpoch++;pendingRemote=null;remoteScheduled=false;
   networkEpoch++;publishing=false;publishPending=false;publishStartedAt=0;publishRetryAt=0;publishRetryCount=0;publishSerial++;
   window.__onlineSeq=0;window.__onlineHandSig="";
   game?.resetForLobby?.();
   onlinePanel(meta?.status!=="playing");$("networkBar").classList.add("hidden");
   if(meta?.status!=="playing")show("再戦の準備をしてください。2人とも準備完了で開始できます");
  }
  if(meta?.status==="playing"&&(before!=="playing"||newRound)){
   phase="playing";lastRemoteAppliedAt=performance.now();onlinePanel(false);
   if(host){
    game?.begin();
    maybePublish(true);
   }else if(newRound)restRecoverGuest();
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
    if(!valid)room.child("feedback").set({seq:data.seq,message:"召喚できませんでした。コスト・範囲・カードを確認。"}).catch(()=>{});
    else maybePublish(true);
   }
   try{await snap.ref.remove()}catch(e){setError(e)}
  });
 }else{
  attach(room.child("state"),"value",snap=>{
   if(room!==openedRoom)return;
   if(!qaMuteSdkSnapshots)receiveGuestWorld(snap.val());
  });
  attach(room.child("feedback"),"value",snap=>{
   if(room!==openedRoom)return;
   const feedback=snap.val();
   if(feedback?.seq===commandSeq)show(feedback.message);
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
    meta:{version:ROOM_VERSION,status:"lobby",round:1,createdAt:now},
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
  setupRoom(code,false);
 }catch(e){setError(e)}
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
  if(guestBot&&meta?.status==="lobby"&&!players?.guest?.ready&&connected)await ready();
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
async function ready(){
 if(!room||meta?.status!=="lobby")return;
 try{
  const seat=host?"host":"guest",me=players?.[seat];
  if(me?.id!==clientId)throw Error("参加者情報が一致しません");
  await room.child("players/"+seat+"/ready").set(!me.ready);
 }catch(e){setError(e)}
}
async function startMatch(){
 if(!host||!room||meta?.status!=="lobby"||!players?.host?.ready||!players?.guest?.ready||!players?.guest?.online||!connected)return;
 try{
  const result=await room.child("meta").transaction(old=>{
   if(!old||old.status!=="lobby")return;
   return {...old,status:"playing",startedAt:Date.now()};
  },undefined,false);
  if(!result.committed)throw Error("開始状態が変わりました");
 }catch(e){setError(e)}
}

function sendCommand(c){
 if(host||!room||phase!=="playing")return;
 if(!c||typeof c.id!=="string"||!Number.isFinite(c.x)||!Number.isFinite(c.y))return;
 const seq=++commandSeq;
 room.child("commands").push({by:clientId,seq,round:meta?.round||1,id:c.id,x:c.x,y:c.y,time:Date.now()+serverOffset}).catch(setError);
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
 if(!host||!room||meta?.status!=="finished"||!connected)return;
 try{
  $("start").disabled=true;
  await room.update({
   "meta/status":"lobby","meta/startedAt":null,"meta/round":(meta.round||1)+1,
   "players/host/ready":false,"players/guest/ready":false,
   state:null,result:null,commands:null,feedback:null
  });
 }catch(e){setError(e)}finally{$("start").disabled=false;}
}
function resetLobby(){
 const leaving=room,seat=host?"host":"guest",leavingDisconnect=disconnectOp;
 // Return to the room picker immediately. Never block Safari/Sites navigation
 // on a Firebase read/write; onDisconnect remains a fallback for stale presence.
 room=null;phase="none";solo=false;guestBot=false;guestBotSwitchPending=false;
 remoteEpoch++;restReadEpoch++;pendingRemote=null;remoteScheduled=false;
 restReadPending=false;lastRemoteAppliedAt=0;lastSyncReadAt=0;syncWarning=false;
 networkEpoch++;publishing=false;publishPending=false;publishStartedAt=0;publishRetryAt=0;publishRetryCount=0;publishSerial++;
 detach();roomCode="";team=0;host=false;players=null;meta=null;result=null;
 seq=0;commandSeq=0;lastGuestSeq=0;lastRemoteSeq=0;lastSend=0;
 lastPayloadChars=0;lastEncodeMs=0;lastAckMs=0;lastApplyMs=0;coalescedPackets=0;publishRetries=0;publishFailures=0;
 window.__onlineSeq=0;window.__onlineHandSig="";
 document.body.classList.remove("soloMode");
 $("networkBar").classList.add("hidden");
 game?.resetForLobby?.();
 onlinePanel(true);updateUI();
 show("新しいルームを作成するか、5桁の番号で参加してください");
 if(leaving&&connected){
  // Only change our own seat; a new visitor could have claimed a stale seat.
  leaving.child("players/"+seat).transaction(old=>
   old?.id===clientId?{...old,online:false,ready:false}:undefined,
   undefined,false).then(()=>{
    // Remove the OLD disconnect hook only after the explicit leave is settled.
    // Otherwise it could mark a replacement guest offline later.
    leavingDisconnect?.cancel?.().catch(e=>console.warn("Old room disconnect hook:",e));
   }).catch(e=>console.warn("Room exit cleanup:",e));
 }
}
const api={
 get team(){return solo?1:team},get isHost(){return host||solo},
  get isOnline(){return !solo},get isSolo(){return solo},get guestBot(){return guestBot},
  get botActive(){return solo||guestBot},get soloDifficulty(){return soloDifficulty},
 registerGame(x){game=x},maybePublish,checkGuestSync,syncDiagnostics,sendCommand,finish,resultForMe,hasResult,resultReason,resetLobby,rematch,
 reportVisibility(hidden){if(hidden&&phase==="playing")show("画面を離れると通信が遅れる場合があります。");}
};
window.ShokokuNet=api;
if((location.hostname==="localhost"||location.hostname==="127.0.0.1")&&new URLSearchParams(location.search).has("qa")){
 window.__shokokuNetQa={
  muteSdkSnapshots:flag=>{qaMuteSdkSnapshots=!!flag;},
  triggerRecovery:()=>{lastRemoteAppliedAt=performance.now()-6500;lastSyncReadAt=0;checkGuestSync();},
  stats:syncDiagnostics,packGuestWorld,worldSizePreview
 };
}
document.addEventListener("DOMContentLoaded",()=>{
 $("netCreate").addEventListener("click",create);
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
