/* Anonymous match observations for local batch research and optional cloud export.
 * Local archives remain on device. Cloud upload requires BOTH players to opt in
 * separately, and backend security rules must be configured before deployment.
 */
(()=>{
"use strict";
const VERSION=1,KEY="shokoku-research-batch-v1",MAX_MATCHES=8,MAX_ACTIONS=500,MAX_SAMPLES=80;
const $=id=>document.getElementById(id);
let soloConsent=true,onlineConsent=false,onlineBoth=false,inRoom=false,playing=false;
let ownCloudConsent=false,bothCloudConsent=false;
let active=null,archived=[],notice="",lastSampleAt=-Infinity;
function safeLoad(){
 try{
  const v=JSON.parse(localStorage.getItem(KEY)||"[]");
  if(Array.isArray(v))return v.filter(x=>x?.schema===VERSION&&Array.isArray(x.actions)&&Array.isArray(x.samples)).slice(-MAX_MATCHES);
 }catch(_){}
 return [];
}
function safeSave(){
 try{
  localStorage.setItem(KEY,JSON.stringify(archived.slice(-MAX_MATCHES)));
  return true;
 }catch(_){return false;}
}
archived=safeLoad();
function status(s){notice=s;const el=$("researchStatus");if(el)el.textContent=s;}
const compact=n=>Math.round(Number(n)||0),energy=n=>Math.round((Number(n)||0)*100)/100;
const classifyControl=c=>c==="bot"?"bot":c==="human"?"human":"unknown";
function researchMatchType(history){
 const states=new Set(history.map(x=>x.guest));
 if(states.has("unknown")||!states.size)return "unknown";
 if(states.size>1)return "mixed";
 return states.has("bot")?"human-vs-bot":"human-vs-human";
}
function snapshot(world){
 return {t:energy(world.elapsed),
  energy:[energy(world.energy[1]),energy(world.energy[2])],
  castles:world.capitals.map(c=>compact(c.hp)),
  forts:world.forts.map(f=>[f.owner,compact(f.hp)]),
  units:world.units.filter(u=>u.hp>0).slice(0,180).map(u=>[u.team,u.key,compact(u.x),compact(u.y),compact(u.hp)])
 };
}
function begin(mode,world){
 if(active)return;
 if(mode==="online"&&window.ShokokuNet&&!window.ShokokuNet.isHost)return;
 if(mode==="solo"?!soloConsent:!onlineBoth)return;
 active={schema:VERSION,mode,teams:[1,2],difficulty:mode==="solo"?world.difficulty:null,
  cloudAtStart:mode==="online"&&bothCloudConsent,
  matchType:mode==="solo"?"human-vs-bot":"unknown",
  guestControlHistory:mode==="solo"?[]:[{t:energy(world.elapsed),guest:classifyControl(world.guestControl)}],
  result:null,actions:[],samples:[],stopped:false,overflow:false};
 lastSampleAt=-Infinity;
 sample(world,true);
 status("記録中（端末内のみ）。勝敗確定後にJSONを書き出してね");
 sync();
}
function observeGuestControl(guest,t){
 if(!active||active.mode!=="online")return;
 const state=classifyControl(guest),last=active.guestControlHistory.at(-1);
 if(last?.guest===state)return;
 // If transitions grow beyond our bounded event budget, never pretend this
 // was a stable human-human match; the classification stays mixed/unknown.
 if(active.guestControlHistory.length>=32){active.controlOverflow=true;return;}
 active.guestControlHistory.push({t:energy(t),guest:state});
}
function action(a){
 if(!active)return;
 if(active.actions.length>=MAX_ACTIONS){active.overflow=true;return;}
 if(![1,2].includes(a.team)||!Number.isFinite(a.t)||!Number.isFinite(a.x)||!Number.isFinite(a.y))return;
 active.actions.push({t:energy(a.t),phase:a.phase,team:a.team,card:a.card,
  x:compact(a.x),y:compact(a.y),energyBefore:energy(a.energyBefore),
  ownHand:Array.isArray(a.ownHand)?a.ownHand.slice(0,4):[]});
}
function sample(world,force=false){
 if(!active||!world||!Number.isFinite(world.elapsed))return;
 if(!force&&world.elapsed-lastSampleAt<8)return;
 if(active.samples.length>=MAX_SAMPLES){active.overflow=true;return;}
 active.samples.push(snapshot(world));lastSampleAt=world.elapsed;
}
// Whitelist only game observations. Room numbers, client IDs, nicknames,
// timestamps, session tokens and arbitrary DOM state are never copied.
function cloudPayload(match){
 return {schema:1,mode:"online",matchType:match.matchType,
  guestControlHistory:match.guestControlHistory.map(x=>({t:x.t,guest:x.guest})),
  controlOverflow:!!match.controlOverflow,overflow:!!match.overflow,
  actions:match.actions.map(x=>({t:x.t,phase:x.phase,team:x.team,
   card:x.card,x:x.x,y:x.y,energyBefore:x.energyBefore,ownHand:x.ownHand.slice(0,4)})),
  samples:match.samples.map(x=>({t:x.t,energy:x.energy,castles:x.castles,
   forts:x.forts,units:x.units})),
  result:match.result};
}
const CLOUD_QUOTA_KEY="shokoku-cloud-daily-v1",CLOUD_DAILY_CAP=12;
function reserveCloudQuota(){
 try{
  const day=new Date().toISOString().slice(0,10);
  const previous=JSON.parse(localStorage.getItem(CLOUD_QUOTA_KEY)||"null");
  const n=previous?.day===day?Number(previous.count)||0:0;
  if(n>=CLOUD_DAILY_CAP)return false;
  localStorage.setItem(CLOUD_QUOTA_KEY,JSON.stringify({day,count:n+1}));
  return true;
 }catch(_){return false;} // fail closed when iframe storage is blocked
}
function finish(world){
 if(!active)return;
 sample(world,true);
 if(active.mode==="online")active.matchType=active.controlOverflow?"unknown":researchMatchType(active.guestControlHistory);
 const hp=world.capitals.map(c=>compact(c.hp));
 active.result={winner:hp[0]===hp[1]?0:hp[0]>hp[1]?1:2,
  duration:energy(world.elapsed),castleHp:hp,
  fortOwners:world.forts.map(f=>f.owner)};
 const completed=active;
 archived.push(completed);
 archived=archived.slice(-MAX_MATCHES);
 active=null;
 const saved=safeSave();
 status((saved?"端末内に一時保存":"端末保存不可。画面を閉じる前に")+
  "｜"+archived.length+"試合分。必要ならJSONを書き出してね");
 sync();
 if(completed.mode!=="online"||!completed.cloudAtStart||!onlineBoth||!bothCloudConsent)return;
 if(!reserveCloudQuota()){
  status("端末には保存済み。クラウドの1日12試合上限か、端末保存制限で未送信");
  return;
 }
 // Do not await a cloud request in the rendering/gameplay result transition.
 // Transport checks fresh consent again immediately before writing.
 const publisher=window.ShokokuNet?.publishResearch;
 if(typeof publisher!=="function")return;
 status("端末に保存済み。匿名研究データをFirebaseへ送信中…");
 Promise.resolve().then(()=>publisher(cloudPayload(completed))).then(r=>{
  status(r?.saved?"端末に保存済み。匿名研究データをFirebaseへ送信済み":
   "端末に保存済み。クラウドは未送信（同意変更・容量など）");
 }).catch(e=>{
  status("端末に保存済み。クラウド送信失敗（Firebase権限・回線・設定を確認）");
  console.warn("Research cloud save:",String(e?.message||e));
 });
}
function withdraw(){
 if(active){active=null;lastSampleAt=-Infinity;}
 status("記録を破棄しました。対戦データは追加しません");
 sync();
}
function payload(){return {schema:VERSION,format:"shokoku-anonymous-match-batch",matches:archived.slice()};}
function reveal(json){
 const fields=[$("researchText"),$("researchEndText")];
 for(const field of fields)if(field){field.value=json;field.hidden=false;}
 const target=$("overlay")&&!$("overlay").classList.contains("hidden")?
  $("researchEndText"):$("researchText");
 if(target)target.select();
}
function exportJson(){
 if(!archived.length){status("保存する試合がまだないよ");return;}
 const json=JSON.stringify(payload());
 reveal(json);
 try{
  const blob=new Blob([json],{type:"application/json"});
  const u=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=u;a.download="shokoku-match-batch.json";a.style.display="none";
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),1000);
  status("JSON書き出しを実行。保存されなければ下のテキストをコピーしてね");
 }catch(_){status("ダウンロード不可。下のテキストをコピーしてね");}
 }
async function copyJson(){
 if(!archived.length){status("保存する試合がまだないよ");return;}
 const json=JSON.stringify(payload());reveal(json);
 try{
  if(!navigator.clipboard?.writeText)throw Error("copy not supported");
  await navigator.clipboard.writeText(json);
  status("匿名の試合ログをコピーしました。別ファイルに保存してね");
 }catch(_){status("自動コピー不可。表示したテキストを選択してコピーしてね");}
}
async function shareJson(){
 if(!archived.length){status("保存する試合がまだないよ");return;}
 const json=JSON.stringify(payload());
 reveal(json);
 try{
  // iPad Safari's Files/Share sheet can work even when a Sites iframe blocks downloads.
  if(typeof File!=="function"||!navigator.share)throw Error("share unsupported");
  const file=new File([json],"shokoku-match-batch.json",{type:"application/json"});
  if(navigator.canShare&&!navigator.canShare({files:[file]}))throw Error("files unsupported");
  await navigator.share({title:"小国戦線III 対戦ログ",files:[file]});
  status("共有メニューを開きました。ファイルへ保存されたか確認してね");
 }catch(_){status("共有できませんでした。下のJSONをコピーして保存してね");}
}
function clear(){
 if(active){status("記録中は削除できません。先に記録を停止してね");return;}
 archived=[];try{localStorage.removeItem(KEY)}catch(_){}
 for(const field of [$("researchText"),$("researchEndText")])
  if(field){field.value="";field.hidden=true;}
 status("保存済みの試合記録をこの端末から消去しました");
 sync();
}
function syncOnline(o){
 if(o){
  onlineConsent=!!o.ownConsent;onlineBoth=!!o.bothConsent;inRoom=!!o.inRoom;playing=!!o.playing;
  ownCloudConsent=!!o.ownCloudConsent;bothCloudConsent=!!o.bothCloudConsent&&onlineBoth;
  // Withdrawal in either seat invalidates all unexported active observations.
  if(active&&active.mode!=="solo"&&!onlineBoth)withdraw();
 }
 const checkbox=$("researchConsent");
 if(checkbox){
  checkbox.checked=inRoom?onlineConsent:soloConsent;
  checkbox.disabled=playing;
 }
 const cloud=$("researchCloudConsent");
 if(cloud){
  cloud.checked=inRoom&&ownCloudConsent;
  cloud.disabled=!inRoom||(playing&&!ownCloudConsent);
 }
 const cloudHint=$("researchCloudHint");
 if(cloudHint)cloudHint.textContent=inRoom?
  bothCloudConsent?"双方が同意中。試合完了後にホストから研究用Firebaseへ自動送信（匿名）":
  "クラウド送信は未同意。双方がチェックした試合だけ送信。既送信分の削除は管理者へ":
  "クラウドは初期OFF。オンラインルーム参加後に双方が同意できます";
 const hint=$("researchHint");
 if(hint)hint.textContent=inRoom?
  onlineBoth?"匿名対戦記録 ON（ホスト端末のみ）。どちらも停止できます":
  "匿名対戦記録 OFF（どちらかが無効にしています）":
  "匿名記録は初期ON。必要ならここでOFFにできます";
 sync();
}
function sync(){
 const counter=$("researchCount");if(counter)counter.textContent=archived.length+"試合保存";
 const live=$("researchLive");
 if(live){live.hidden=!(active||(playing&&inRoom&&onlineBoth));
  live.textContent=active?"● 記録中（停止）":"● 研究記録に同意中（停止）";}
 const exportButtons=document.querySelectorAll("[data-research-export],[data-research-copy],[data-research-share]");
 exportButtons.forEach(b=>{b.disabled=!archived.length;});
}
function init(){
 const panel=$("onlineDialog"),dialog=$("dialog");
 if(!panel||!dialog)return;
 const controls=document.createElement("div");
 controls.id="researchTools";
 controls.style.cssText="margin:8px 0;padding:8px;border:1px solid #668c95;border-radius:9px;font-size:12px;line-height:1.5";
 controls.innerHTML='<label><input id="researchConsent" type="checkbox"> 匿名対戦記録（初期ON・いつでも停止可）</label>'+
  '<div id="researchHint">対戦ログはホスト端末だけに保存します。どちらかがOFFにすると記録しません。</div>'+
  '<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:5px">'+
  '<span id="researchCount">0試合保存</span><button type="button" data-research-export>JSON書き出し</button><button type="button" data-research-copy>コピー</button><button type="button" data-research-share>共有</button>'+
  '<button type="button" id="researchClear">記録削除</button></div>'+
  '<div id="researchStatus" role="status"></div>'+
  '<textarea id="researchText" hidden readonly aria-label="JSONコピー用テキスト" style="width:100%;height:55px"></textarea>'+
  '<small>身内対戦の改善用に匿名のカード使用・戦況・勝敗を初期ONで記録します。嫌ならOFF・対戦中は右上の停止ボタンから無効化できます。名前・ルーム番号・端末ID・チャットは保存せず、自動送信もしません。終了後は必要に応じてJSONを書き出してください。</small>';
 controls.insertAdjacentHTML("beforeend",
  '<div style="border-top:1px solid #42616a;margin-top:7px;padding-top:7px">'+
  '<label><input id="researchCloudConsent" type="checkbox"> 匿名研究データを試合後にFirebaseへ自動送信（初期OFF）</label>'+
  '<div id="researchCloudHint">オンラインの両者が同意したときだけ保存します</div>'+
  '<small>端末保存とは別の任意設定。カード使用・部隊位置・試合結果と保存時刻がゲーム管理用Firebaseに残ります。名前・端末ID・ルーム番号は含みません。1端末1日12試合まで。送信済み記録の削除は管理者がFirebase上で実施します。アクセス制限が未設定なら送信は失敗します。</small></div>');
 panel.insertBefore(controls,$("netStatus"));
 const endTools=document.createElement("div");
 endTools.style.cssText="margin-top:7px;display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap";
 endTools.innerHTML='<button type="button" data-research-export>対戦データJSONを保存</button><button type="button" data-research-copy>JSONコピー</button><button type="button" data-research-share>共有</button><span id="researchEndHint" style="font-size:11px">記録ONの試合のみ</span>'+'<textarea id="researchEndText" hidden readonly aria-label="コピー用JSON" style="width:100%;height:70px"></textarea>';
 dialog.appendChild(endTools);
 const live=document.createElement("button");
 live.id="researchLive";live.hidden=true;live.type="button";
 live.style.cssText="position:fixed;top:4px;right:4px;z-index:40;font-size:10px;padding:5px;background:#452d37;color:#fff;border:1px solid #a99;border-radius:5px";
 live.addEventListener("click",async()=>{
  // Both seats may withdraw. Host recording is erased as soon as consent changes.
  if(inRoom){
   try{await window.ShokokuNet?.setResearchConsent?.(false);}catch(e){status("記録停止エラー: "+String(e?.message||e))}
  }else{soloConsent=false;withdraw();}
 });
 document.body.appendChild(live);
 $("researchCloudConsent").addEventListener("change",async e=>{
  const value=!!e.target.checked;
  try{
   const ok=await window.ShokokuNet?.setCloudConsent?.(value);
   if(!ok)e.target.checked=!value;
  }catch(err){status("クラウド同意の更新失敗: "+String(err?.message||err));e.target.checked=!value;}
  syncOnline();
 });
 $("researchConsent").addEventListener("change",async e=>{
  const value=!!e.target.checked;
  if(inRoom){
   try{await window.ShokokuNet?.setResearchConsent?.(value)}
   catch(err){status("同意設定の変更に失敗: "+String(err?.message||err));e.target.checked=!value;}
  }else soloConsent=value;
  syncOnline();
 });
 document.querySelectorAll("[data-research-export]").forEach(b=>b.addEventListener("click",exportJson));
 document.querySelectorAll("[data-research-copy]").forEach(b=>b.addEventListener("click",copyJson));
 document.querySelectorAll("[data-research-share]").forEach(b=>b.addEventListener("click",shareJson));
 $("researchClear").addEventListener("click",clear);
 syncOnline();
}
window.ShokokuResearch={
 get active(){return !!active},
 get soloConsent(){return soloConsent},
 get cloudAllowed(){return bothCloudConsent&&onlineBoth},
 begin,action,sample,finish,observeGuestControl,syncOnline,withdraw,
 // For tests only, this returns anonymized logs without triggering downloads.
};
if(location.hostname==="localhost"||location.hostname==="127.0.0.1"){
 window.__shokokuResearchQa={get:payload,current:()=>active?{
 mode:active.mode,actions:active.actions.length,samples:active.samples.length,
 guestControlHistory:active.guestControlHistory.map(x=>x.guest)}:null,
 enableSolo:()=>{soloConsent=true;syncOnline();},clear};
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
else init();
})();