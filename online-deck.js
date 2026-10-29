/* 小国戦線III: player deck draft and small-touch iPad editor. */
(()=>{
"use strict";
const COUNT=10,DEFAULT=["scout","engineer","archer","barrage","sentinel","suppress","guardian","ward","drone","tank"];
const KEY="shokoku-deck-v1";
let catalog={},draft=DEFAULT.slice(),working=null,pending=null,locked=false,editorOpen=false;
const $=id=>document.getElementById(id);
const eligible=()=>Object.keys(catalog).filter(id=>id!=="infantry"&&catalog[id]?.deckEligible!==false);
function validate(ids){
 if(!Array.isArray(ids)||ids.length!==COUNT)return false;
 const pool=new Set(eligible());
 return ids.every(id=>typeof id==="string"&&pool.has(id))&&new Set(ids).size===COUNT;
}
function standard(){
 const ids=DEFAULT.filter(id=>eligible().includes(id));
 for(const id of eligible())if(ids.length<COUNT&&!ids.includes(id))ids.push(id);
 return ids;
}
function repair(value){
 const ids=Array.isArray(value)?value.filter(id=>eligible().includes(id)&&id!=="infantry"):[];
 const used=[...new Set(ids)].slice(0,COUNT);
 for(const id of standard())if(used.length<COUNT&&!used.includes(id))used.push(id);
 return validate(used)?used:standard();
}
function load(){
 try{
  const data=JSON.parse(localStorage.getItem(KEY)||"null");
  if(data?.version===1&&Array.isArray(data.ids))return repair(data.ids);
 }catch(_){}
 return standard();
}
function persist(){
 try{localStorage.setItem(KEY,JSON.stringify({version:1,ids:draft}));}catch(_){}
}
function configure(cards){
 catalog=cards||{};
 draft=load();
 // A catalog reset may change names/portraits for existing IDs. Reuse
 // DOM during ordinary edits, but never show old data after reconfigure.
 if(editorOpen){
  $("deckSelected")?.replaceChildren();
  $("deckPool")?.replaceChildren();
  render();
 }
 renderLobby();
}
function current(){return draft.slice();}
function newTile(id,inDeck){
 const data=catalog[id],button=document.createElement("button");
 button.type="button";
 button.className="deckTile"+(inDeck?" chosen":"")+(pending===id?" pending":"");
 button.dataset.cardId=id;button.setAttribute("aria-pressed",String(inDeck));
 button.setAttribute("aria-label",data.name+" コスト"+data.cost+(inDeck?" 採用中":" 未採用"));
 const canvas=document.createElement("canvas");canvas.width=128;canvas.height=72;canvas.className="deckPortrait";
 const cost=document.createElement("span");cost.className="deckCost";cost.textContent=String(data.cost);
 const name=document.createElement("span");name.className="deckName";name.textContent=data.name;
 const mark=document.createElement("span");mark.className="deckMark";mark.textContent=inDeck?"採用中":"追加候補";
 button.append(canvas,cost,name,mark);
 // The tile can move between selected and pool without recreating its Canvas.
 button.addEventListener("click",()=>choose(id,!!working?.includes(id)));
 const detail=document.createElement("button");
 detail.type="button";detail.className="deckDetail";detail.textContent="性能を見る";
 detail.setAttribute("aria-label",data.name+"の能力を見る");
 detail.addEventListener("click",()=>showInfo(id));
 const cell=document.createElement("div");cell.className="deckCell";cell.append(button,detail);
 if(window.KokokuArt?.drawPortrait)window.KokokuArt.drawPortrait(canvas,id,1);
 return cell;
}
// Update role/selection of an existing tile while preserving its portrait
// Canvas and event listener. A two-tap swap does not redraw all 15 portraits.
function updateTile(cell,id,inDeck){
 const tile=cell.querySelector(".deckTile"),data=catalog[id];
 tile.classList.toggle("chosen",inDeck);
 tile.classList.toggle("pending",pending===id);
 tile.setAttribute("aria-pressed",String(inDeck));
 tile.setAttribute("aria-label",data.name+" コスト"+data.cost+(inDeck?" 採用中":" 未採用"));
 cell.querySelector(".deckMark").textContent=inDeck?"採用中":"追加候補";
 return cell;
}
function showInfo(id){
 const card=catalog[id];if(!card)return;
 const parts=["消費 "+card.cost,"使用上限 "+(Number.isFinite(card.limit)?card.limit+"回":"無制限")];
 if(card.hp!==undefined){
  const behavior={normal:"進撃",capture:"占領",guard:"迎撃"}[card.behavior]||"進撃";
  parts.push(behavior,card.flying?"飛行":"地上", "1回"+(card.qty||1)+"体",
   "HP "+card.hp,"攻撃 "+card.damage,"攻撃間隔 "+card.cool+"秒",
   "射程 "+card.range,"速度 "+card.speed,card.hitAir?"対空可能":"対空不可",
   card.capture?"占領力 "+card.capture:"占領不可");
  if(card.splash)parts.push("範囲攻撃 "+card.splash);
  if(card.note)parts.push(card.note);
 }
 else parts.push("スペル",card.note||"");
 const info=$("deckInfo");info.textContent=card.name+"｜"+parts.join(" ・ ");
}
function choose(id,inDeck){
 if(locked||!editorOpen)return;
 if(!inDeck){pending=pending===id?null:id;render();return;}
 if(pending&&pending!==id){
  const idx=working.indexOf(id);
  if(idx>=0){working[idx]=pending;pending=null;render();}
  return;
 }
 showInfo(id);
}
function render(){
 if(!editorOpen||!working)return;
 const selected=$("deckSelected"),pool=$("deckPool");
 // Preserve the existing 15 Canvas elements and portraits across taps.
 // Only a genuinely new card (e.g. after a future roster extension)
 // requires a new portrait draw.
 const previous=new Map([...selected.children,...pool.children].map(cell=>
  [cell.querySelector(".deckTile")?.dataset.cardId,cell]));
 const tile=(id,inDeck)=>{
  const existing=previous.get(id);
  return existing?updateTile(existing,id,inDeck):newTile(id,inDeck);
 };
 selected.replaceChildren(...working.map(id=>tile(id,true)));
 pool.replaceChildren(...eligible().filter(id=>!working.includes(id)).map(id=>tile(id,false)));
 const full=working.length===COUNT;
 $("deckCount").textContent=working.length+" / "+COUNT+"種類";
 $("deckNotice").textContent=pending?"交換する採用カードをタップしてください":eligible().length===COUNT?
  "現在は全10種類を採用中。新しいカードが追加されると入れ替えできます。":"未採用カードをタップ → 外したい採用カードをタップで交換。性能を見るボタンで比較できます";
 $("deckInfo").textContent="";
 $("deckSave").disabled=!full||!validate(working);
 const avg=working.reduce((s,id)=>s+(Number(catalog[id]?.cost)||0),0)/COUNT;
 $("deckSummary").textContent="平均コスト "+avg.toFixed(1)+" ｜ 対空 "+working.filter(id=>catalog[id]?.hitAir).length+
 "種類 ｜ 占領 "+working.filter(id=>catalog[id]?.capture>0).length+
 "種類 ｜ スペル "+working.filter(id=>catalog[id]?.radius!==undefined).length+"種類";
}
function open(){
 if(locked||!Object.keys(catalog).length)return;
 working=draft.slice();pending=null;editorOpen=true;
 $("deckEditor").classList.remove("hidden");$("deckEditor").setAttribute("aria-hidden","false");
 render();
}
function close(save=false){
 if(!editorOpen)return;
 if(save&&validate(working)){draft=working.slice();persist();renderLobby();}
 working=null;pending=null;editorOpen=false;
 $("deckEditor").classList.add("hidden");$("deckEditor").setAttribute("aria-hidden","true");
}
function setLocked(value){
 locked=!!value;
 if(locked)close(false);
 renderLobby();
}
function renderLobby(){
 const button=$("deckOpen"),summary=$("deckLobbySummary");if(!button||!summary)return;
 summary.textContent="自分のデッキ："+draft.length+" / "+COUNT+"種類（候補"+eligible().length+"種類）";
 button.disabled=locked;
 button.textContent=locked?"編成確定済み":"デッキを見る・編集";
}
function resetDraft(){draft=standard();persist();renderLobby();}
function bind(){
 $("deckOpen")?.addEventListener("click",open);
 $("deckCancel")?.addEventListener("click",()=>close(false));
 $("deckSave")?.addEventListener("click",()=>close(true));
 $("deckReset")?.addEventListener("click",()=>{working=standard();pending=null;render();});
}
document.addEventListener("DOMContentLoaded",bind);
window.ShokokuDeck={configure,validate,eligible,current,standard,repair,open,close,setLocked,renderLobby,resetDraft};
})();