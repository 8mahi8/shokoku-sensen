"use strict";
// Worker-only, non-authoritative prototype: no DOM, Firebase, real game
// engine or future enemy commands. It proposes an observable-state action.
// Main thread MUST independently recheck freshness, hand, energy and target.
const priorities={air:180,large:170,ground:120,fort:110,siege:100,tempo:70};
function score(action,scene){
 if(action.id==="wait")return 0;
 const d=scene.classes[action.id];
 if(!d)return -Infinity;
 const foes=scene.foes,own=scene.own,forts=scene.forts;
 const near=(list)=>list.length?Math.min(...list.map(u=>Math.hypot(u.x-action.x,u.y-action.y))):1000;
 const airborne=foes.filter(u=>scene.classes[u.key]?.flying);
 const ground=foes.filter(u=>!scene.classes[u.key]?.flying);
 const heavy=ground.filter(u=>scene.classes[u.key]?.size==="large");
 const threatened=ground.filter(u=>Math.abs(u.x-scene.wallX)<440);
 const uncaptured=forts.filter(f=>f.owner!==scene.team);
 let gain=0;
 if(d.hitAir&&airborne.length){
  gain=Math.max(gain,priorities.air-Math.min(120,near(airborne)*.1));
 }
 if(heavy.length&&action.id==="guardian")
  gain=Math.max(gain,priorities.large-Math.min(120,near(heavy)*.1));
 if(ground.length&&!d.flying&&["sentinel","guardian","infantry","archer","suppress"].includes(action.id))
  gain=Math.max(gain,priorities.ground-Math.min(125,near(ground)*.13));
 if(threatened.length&&["sentinel","archer","suppress"].includes(action.id))
  gain=Math.max(gain,125-Math.min(110,near(threatened)*.12));
 if(d.capture&&uncaptured.length){
  const objective=near(uncaptured);
  gain=Math.max(gain,priorities.fort+20*d.capture-.11*objective);
 }
 if(d.siege&&ground.length===0)
  gain=Math.max(gain,priorities.siege+15);
 if(own.length===0&&action.id==="infantry")gain=Math.max(gain,priorities.tempo);
 // This is a cheap role-aware approximation, NOT battle physics or wins.
 return gain-3*d.cost;
}
function evaluate(scene){
 const ranking=scene.actions.map((o,i)=>({i,action:o,score:score(o,scene)}));
 ranking.sort((a,b)=>b.score-a.score||
  a.action.cost-b.action.cost||a.i-b.i);
 return {winner:ranking[0]?.action||null,
  ranking:ranking.slice(0,6).map(x=>({id:x.action.id,x:x.action.x,y:x.action.y,
   score:+x.score.toFixed(3)})),examined:ranking.length};
}
self.onmessage=e=>{
 const {type,id,version,scene,spinMs}=e.data||{};
 if(type!=="evaluate"||!Number.isSafeInteger(id)||!Number.isSafeInteger(version)||
  !scene||!Array.isArray(scene.actions)||scene.actions.length>24||
  !Number.isFinite(spinMs)||spinMs<0||spinMs>800)return;
 const start=performance.now();
 const proposed=evaluate(scene);
 // Optional controlled CPU stress: proves heavy calculations can run
 // separately from rendering. NEVER part of the game AI decision.
 let count=0;
 if(spinMs){
  while(performance.now()-start<spinMs){
   score(scene.actions[count%scene.actions.length],scene);
   count++;
  }
 }
 self.postMessage({type:"result",id,version,proposed,
  workerMs:+(performance.now()-start).toFixed(2),iterations:count});
};
