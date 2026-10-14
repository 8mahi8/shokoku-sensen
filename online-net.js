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
const clientId=token(), ROOM_VERSION=1;
let db=null,room=null,roomCode="",game=null,team=0,host=false,seq=0,commandSeq=0,lastGuestSeq=0;
let connected=false,players=null,meta=null,result=null,phase="none",lastSend=0,watchers=[],disconnectOp=null;
let lastRemoteSeq=0,serverOffset=0,presencePending=false,solo=false,guestBot=false;
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
  $("netGuestBot").disabled=!guestControl||!connected;
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
 }catch(e){setError(e)}finally{presencePending=false;}
}
function setupRoom(code,isHost){
 solo=false;guestBot=false;
 roomCode=code;team=isHost?1:2;host=isHost;seq=0;commandSeq=0;lastGuestSeq=0;lastRemoteSeq=0;lastSend=0;window.__onlineSeq=0;
 players=null;meta=null;phase="lobby";result=null;
 room=db.ref(ROOT+"/"+code);
 if(connected)registerPresence().catch(setError);
 attach(room.child("players"),"value",snap=>{
  players=snap.val();
  updateUI();
 });
 attach(room.child("meta"),"value",snap=>{
  const before=meta?.status;meta=snap.val();
  if(meta?.status==="lobby"&&before==="finished"){
   phase="lobby";seq=0;commandSeq=0;lastGuestSeq=0;lastRemoteSeq=0;lastSend=0;
   window.__onlineSeq=0;window.__onlineHandSig="";
   game?.resetForLobby?.();onlinePanel(true);$("networkBar").classList.add("hidden");
   show("再戦の準備をしてください。2人とも準備完了で開始できます");
  }
  if(meta?.status==="playing"&&before!=="playing"){
   phase="playing";onlinePanel(false);
   if(host){
    game?.begin();
    maybePublish(true);
   }
  }
  if(meta?.status==="finished"&&before!=="finished"){
   phase="finished";
   if(!host&&result)game?.showResult?.(result);
  }
  updateUI();
 });
 attach(room.child("result"),"value",snap=>{
  result=snap.val();
  if(result&&!host&&meta?.status==="finished")game?.showResult?.(result);
 });
 if(host){
  attach(room.child("commands"),"child_added",async snap=>{
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
   const packet=snap.val();
   if(!packet||!Number.isInteger(packet.seq)||packet.round!==meta?.round||!packet.world||packet.seq<=lastRemoteSeq)return;
   lastRemoteSeq=packet.seq;game?.apply(packet.world,packet.seq);
  });
  attach(room.child("feedback"),"value",snap=>{
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
  const p=await ref.child("players/guest").transaction(old=>(old===null||old.online===false)?{id:clientId,ready:false,online:true,joinedAt:now}:undefined,undefined,false);
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
 if(solo||!room||host||players?.guest?.id!==clientId)return;
 guestBot=!guestBot;
 game?.setBotControl?.(guestBot);
 updateUI();
 if(guestBot&&meta?.status==="lobby"&&!players?.guest?.ready&&connected)await ready();
 show(guestBot?"BOT操作ON。ホストが開始すると自動召喚します":"手動操作に戻しました");
}
function startSolo(){
 if(room||solo)return;
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
 if(!host||!room||phase!=="playing"||!game)return;
 const now=performance.now();if(!force&&now-lastSend<180)return;
 lastSend=now;
 const world=JSON.parse(JSON.stringify(game.world(),(k,v)=>v===Infinity?1000000000:v));
 room.child("state").set({seq:++seq,round:meta?.round||1,world,at:Date.now()+serverOffset}).catch(setError);
}
function finish(data){
 if(solo)return;
 if(!host||!room||phase!=="playing")return;
 phase="finished";
 // Force publish the final world before closing, so the guest sees the last HP.
 const world=JSON.parse(JSON.stringify(game.world(),(k,v)=>v===Infinity?1000000000:v));
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
async function resetLobby(){
 if(solo){location.reload();return;}
 const leaving=room,seat=host?"host":"guest";
 // Write offline before navigating, and leave onDisconnect armed as a fallback.
 // Never write another player's seat after their ID has changed.
 room=null;phase="none";
 if(leaving&&connected){
  try{
   const ref=leaving.child("players/"+seat),current=(await ref.once("value")).val();
   if(current?.id===clientId)
    await ref.update({online:false,ready:false,lastSeen:firebase.database.ServerValue.TIMESTAMP});
  }catch(e){setError(e)}
 }
 detach();roomCode="";team=0;host=false;players=null;meta=null;result=null;
 location.reload();
}
const api={
 get team(){return solo?1:team},get isHost(){return host||solo},
  get isOnline(){return !solo},get isSolo(){return solo},get guestBot(){return guestBot},
  get botActive(){return solo||guestBot},
 registerGame(x){game=x},maybePublish,sendCommand,finish,resultForMe,hasResult,resultReason,resetLobby,rematch,
 reportVisibility(hidden){if(hidden&&phase==="playing")show("画面を離れると通信が遅れる場合があります。");}
};
window.ShokokuNet=api;
document.addEventListener("DOMContentLoaded",()=>{
 $("netCreate").addEventListener("click",create);
  $("netSolo").addEventListener("click",startSolo);
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
  connected=snap.val()===true;if(!connected)show("通信が切れました。自動再接続を待っています。");else if(!room)show("接続OK。ルームを作成・参加できます。");
  if(connected&&room)registerPresence().catch(setError);
  updateUI();
 })}catch(e){setError(e)}
 updateUI();
});
})();
