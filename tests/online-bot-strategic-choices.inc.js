// Injected into localhost QA IIFE only; NOT loaded by any production HTML.
const qaStrategic={enabled:false,counts:{},records:[],pending:[null,null,null]};
const qaStrategicRole=id=>{
 if(["infantry","scout","engineer"].includes(id))return "capture";
 if(["archer","sentinel","suppress","guardian"].includes(id))return "defense";
 if(["tank","drone"].includes(id))return "siege";
 return "spell";
};
function qaStrategicCount(key){
 qaStrategic.counts[key]=(qaStrategic.counts[key]||0)+1;
}
function qaStrategicCapture(team){
 const own=S.units.filter(u=>u.team===team&&u.hp>0);
 const foes=S.units.filter(u=>u.team!==team&&u.hp>0);
 // Infantry is legally available outside the hand. Spells have a legal map
 // target, but legal != tactically effective. Account for the 65-unit cap.
 const x=limit(border(team)+(team===1?-35:35),40,W-40),y=330;
 const legal=["infantry",...S.hand[team]].filter(id=>{
  if(!canPay(team,id))return false;
  if(CLASSES[id]&&own.length+CLASSES[id].qty>65)return false;
  return validTarget(team,id,isSpell(id)?640:x,y);
 });
 const roles=[...new Set(legal.map(qaStrategicRole))];
 const fortThreatened=S.forts.some(f=>f.owner===team&&foes.some(u=>
  Math.abs(u.x-f.x)<155&&Math.abs(u.y-f.y)<135));
 const ownCastlePressure=foes.some(u=>Math.abs(u.x-WALL_FACE[team])<180);
 const enemyCastlePressure=own.some(u=>Math.abs(u.x-WALL_FACE[3-team])<180);
 const heavyReady=legal.some(id=>id==="tank"||id==="guardian");
 const meaningful=roles.length>=2&&
  (fortThreatened||ownCastlePressure||enemyCastlePressure||heavyReady);
 qaStrategic.pending[team]={
  team,at:+S.elapsed.toFixed(2),energy:+S.energy[team].toFixed(2),
  visibleOpponentEnergy:+S.observedEnergy[3-team].toFixed(2),
  ownCastleHp:+capital(team).hp.toFixed(1),
  enemyCastleHp:+capital(3-team).hp.toFixed(1),
  fortThreatened,ownCastlePressure,enemyCastlePressure,heavyReady,
  legal,roles,meaningful,beforeActions:duelStats?.actions?.[team]||0
 };
 qaStrategicCount("decisions");
 if(legal.length===0)qaStrategicCount("noLegalSpend");
 if(legal.length>=2)qaStrategicCount("twoLegalCards");
 if(roles.length>=2)qaStrategicCount("twoDistinctRoles");
 if(meaningful)qaStrategicCount("meaningfulChoice");
 if(meaningful&&fortThreatened)qaStrategicCount("fortUnderThreat");
 if(meaningful&&ownCastlePressure)qaStrategicCount("ownCastleUnderPressure");
 if(meaningful&&enemyCastlePressure)qaStrategicCount("enemyCastleUnderPressure");
 if(meaningful&&heavyReady)qaStrategicCount("heavyAffordable");
 if(meaningful&&team===1)qaStrategicCount("blueMeaningful");
 if(meaningful&&team===2)qaStrategicCount("redMeaningful");
}
function qaStrategicResolve(team){
 const before=qaStrategic.pending[team];
 qaStrategic.pending[team]=null;
 if(!before)return;
 const played=(duelStats?.actions?.[team]||0)>before.beforeActions
  ?botLastAction.id:"none";
 if(played!=="none"&&!before.legal.includes(played))
  qaStrategicCount("playedNotInLegalList");
 if(before.meaningful){
  qaStrategicCount("meaningfulPlayed"+(played==="none"?"None":"Card"));
  if(qaStrategic.records.length<140){
   const {beforeActions,...fields}=before;
   qaStrategic.records.push({...fields,played,playedRole:
    played==="none"?"wait":qaStrategicRole(played)});
  }
 }
}
window.__qaStrategicControl={
 reset:()=>{qaStrategic.enabled=true;qaStrategic.counts={};
  qaStrategic.records=[];qaStrategic.pending=[null,null,null];},
 stop:()=>{qaStrategic.enabled=false;},
 snapshot:()=>({counts:{...qaStrategic.counts},
  records:qaStrategic.records.map(r=>({...r,legal:r.legal.slice(),
   roles:r.roles.slice()}))})
};
