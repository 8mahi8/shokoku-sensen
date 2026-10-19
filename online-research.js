/* Opt-in, local-only, anonymous match observations for future batch research.
 * No auto-training, analytics service, identifying data, or cloud match archive.
 * Host is authoritative for accepted actions. Consent flags only use room presence.
 */
(()=>{
"use strict";
const VERSION=1,KEY="shokoku-research-batch-v1",MAX_MATCHES=8,MAX_ACTIONS=500,MAX_SAMPLES=80;
const $=id=>document.getElementById(id);
let soloConsent=false,onlineConsent=false,onlineBoth=false,inRoom=false,playing=false;
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
 if(mode==="solo"?!soloConsent:!onlineBoth)return;
 active={schema:VERSION,mode,teams:[1,2],difficulty:mode==="solo"?world.difficulty:null,
  result:null,actions:[],samples:[],stopped:false,overflow:false};
 lastSampleAt=-Infinity;
 sample(world,true);
 status("記録中（端末内のみ）。勝敗確定後にJSONを書き出してね");
 sync();
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
function finish(world){
 if(!active)return;
 sample(world,true);
 const hp=world.capitals.map(c=>compact(c.hp));
 active.result={winner:hp[0]===hp[1]?0:hp[0]>hp[1]?1:2,
  duration:energy(world.elapsed),castleHp:hp,
  fortOwners:world.forts.map(f=>f.owner)};
 archived.push(active);
 archived=archived.slice(-MAX_MATCHES);
 active=null;
 const saved=safeSave();
 status((saved?"端末内に一時保存":"端末保存不可。画面を閉じる前に")+
  "｜"+archived.length+"試合分。JSON書き出しを忘れずに");
 sync();
}
function withdraw(){
 if(active){active=null;lastSampleAt=-Infinity;}
 status("記録を破棄しました。対戦データは追加しません");
 sync();
}
function payload(){return {schema:VERSION,format:"shokoku-anonymous-match-batch",matches:archived.slice()};}
function exportJson(){
 if(!archived.length){status("保存する試合がまだないよ");return;}
 const json=JSON.stringify(payload());
 const field=$("researchText");
 if(field){field.value=json;field.hidden=false;}
 try{
  const blob=new Blob([json],{type:"application/json"});
  const u=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=u;a.download="shokoku-match-batch.json";a.style.display="none";
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),1000);
  status("JSON書き出しを実行。保存されなければ下のテキストをコピーしてね");
 }catch(_){status("ダウンロード不可。下のテキストをコピーしてね");}
 if(field)field.select();
}
function clear(){
 if(active){status("記録中は削除できません。先に記録を停止してね");return;}
 archived=[];try{localStorage.removeItem(KEY)}catch(_){}
 const field=$("researchText");if(field){field.value="";field.hidden=true;}
 status("保存済みの試合記録をこの端末から消去しました");
 sync();
}
function syncOnline(o){
 if(o){
  onlineConsent=!!o.ownConsent;onlineBoth=!!o.bothConsent;inRoom=!!o.inRoom;playing=!!o.playing;
  // Withdrawal in either seat invalidates all unexported active observations.
  if(active&&active.mode!=="solo"&&!onlineBoth)withdraw();
 }
 const checkbox=$("researchConsent");
 if(checkbox){
  checkbox.checked=inRoom?onlineConsent:soloConsent;
  checkbox.disabled=playing;
 }
 const hint=$("researchHint");
 if(hint)hint.textContent=inRoom?
  onlineBoth?"双方の同意あり。ホスト端末だけが記録します":
  "双方がONにすると次の試合から記録します":
  "1人プレイの記録をON/OFF（通常対戦は双方の同意が必要）";
 sync();
}
function sync(){
 const counter=$("researchCount");if(counter)counter.textContent=archived.length+"試合保存";
 const live=$("researchLive");
 if(live){live.hidden=!active;live.textContent="● 対戦記録中（停止）";}
 const exportButtons=document.querySelectorAll("[data-research-export]");
 exportButtons.forEach(b=>{b.disabled=!archived.length;});
}
function init(){
 const panel=$("onlineDialog"),dialog=$("dialog");
 if(!panel||!dialog)return;
 const controls=document.createElement("div");
 controls.id="researchTools";
 controls.style.cssText="margin:8px 0;padding:8px;border:1px solid #668c95;border-radius:9px;font-size:12px;line-height:1.5";
 controls.innerHTML='<label><input id="researchConsent" type="checkbox"> 匿名の対戦データを研究用に記録する（任意）</label>'+
  '<div id="researchHint">1人プレイの記録をON/OFF（通常対戦は双方の同意が必要）</div>'+
  '<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:5px">'+
  '<span id="researchCount">0試合保存</span><button type="button" data-research-export>JSON書き出し</button>'+
  '<button type="button" id="researchClear">記録削除</button></div>'+
  '<div id="researchStatus" role="status"></div>'+
  '<textarea id="researchText" hidden readonly aria-label="JSONコピー用テキスト" style="width:100%;height:55px"></textarea>'+
  '<small>記録するのはゲーム内の手・戦況・勝敗だけ。名前・ルーム番号・端末ID・チャットは保存しません。自動送信なし。端末保存が使えない場合に備えて終了後にJSONを書き出してください。</small>';
 panel.insertBefore(controls,$("netStatus"));
 const endTools=document.createElement("div");
 endTools.style.cssText="margin-top:7px;display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap";
 endTools.innerHTML='<button type="button" data-research-export>対戦データJSONを保存</button><span id="researchEndHint" style="font-size:11px">記録ONの試合のみ</span>';
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
 $("researchConsent").addEventListener("change",async e=>{
  const value=!!e.target.checked;
  if(inRoom){
   try{await window.ShokokuNet?.setResearchConsent?.(value)}
   catch(err){status("同意設定の変更に失敗: "+String(err?.message||err));e.target.checked=!value;}
  }else soloConsent=value;
  syncOnline();
 });
 document.querySelectorAll("[data-research-export]").forEach(b=>b.addEventListener("click",exportJson));
 $("researchClear").addEventListener("click",clear);
 syncOnline();
}
window.ShokokuResearch={
 get active(){return !!active},
 get soloConsent(){return soloConsent},
 begin,action,sample,finish,syncOnline,withdraw,
 // For tests only, this returns anonymized logs without triggering downloads.
};
if(location.hostname==="localhost"||location.hostname==="127.0.0.1"){
 window.__shokokuResearchQa={get:payload,enableSolo:()=>{soloConsent=true;syncOnline();},clear};
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
else init();
})();