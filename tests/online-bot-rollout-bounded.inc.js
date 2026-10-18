"use strict";
// Source-injected only on localhost QA pages by online-bot-rollout-search.cjs.
// Exact 30Hz physics, real legal card purchases; no speculative "AI" endpoint.
// v3: two legal friendly decisions against multiple hypothetical responses.
// Enemy response branches are public *hypothetical* policies. Their common
// hand is injected from a published roster, never read from the live enemy.
function qaRolloutTwoStepBounded(spec,horizon=20,seeds=[17,41,73],responses=["idle"],mode="bounded"){
 if(!NET.isSolo||!spec||!Array.isArray(spec.hand)||!Array.isArray(spec.enemies)||
  !Number.isFinite(horizon)||horizon<4||horizon>35||
  !Array.isArray(seeds)||seeds.length<1||seeds.length>8||
  seeds.some(n=>!Number.isInteger(n)||n<1)||
  !Array.isArray(responses)||responses.length<1||responses.length>3||
  responses.some(p=>!["idle","fortify","counterpush","latePush"].includes(p))||
  new Set(responses).size!==responses.length||
  !["one","two","bounded"].includes(mode)||horizon<12)return null;
 const ok=window.__shokokuQa.setBotScenario({...spec,variant:"baseline"});
 if(!ok)return null;
 const team=2,other=1,initial=structuredClone(S);
 const oldRandom=Math.random,oldDuel=duelStats,oldVariants=qaBotVariants,
  oldAction=botLastAction,oldPlans=[qaSiegePlans,qaWindowPlans,qaConcedePlans,
   qaRaceBudgetPlans,qaCastleHitEvents];
 const reset=()=>{
  Object.assign(S,structuredClone(initial));
  qaBotVariants=[null,"baseline","baseline"];
  qaSiegePlans=[null,null,null];qaWindowPlans=[null,null,null];
  qaConcedePlans=[null,null,null];qaRaceBudgetPlans=[null,null,null];
  qaCastleHitEvents=[];duelStats=null;botLastAction=null;
  S.botThink=1000000;
 };
 let randomState=1;
 const seedRng=n=>{
  randomState=(n>>>0)||1;
  Math.random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;
   return randomState/4294967296;};
 };
 // At +6s, recompute *legal* choices from the newly visible battlefield.
 // Choose via a separate 6s local exact-engine search with no scripted future
 // enemy action. No access to the response label or the upcoming +9s action.
 const chooseNext=()=>{
  const state=structuredClone(S),savedRandom=randomState,savedAction=botLastAction;
  const edge=border(team),edgeX=limit(edge+35,40,W-40);
  const visibleEnemy=S.units.filter(u=>u.team===other&&u.hp>0)
   .sort((a,b)=>b.x-a.x)[0];
  const objective=S.forts.filter(f=>f.owner!==team)
   .sort((a,b)=>b.x-a.x)[0];
  const y=limit(visibleEnemy?.y??objective?.y??330,70,H-70);
  const objY=limit(objective?.y??y,70,H-70);
  const options=[{id:"wait",x:null,y:null,cost:0}];
  const add=(id,x,y)=>{
   if(options.length>=16||!canPay(team,id)||!validTarget(team,id,x,y))return;
   if(options.some(a=>a.id===id&&a.x===x&&a.y===y))return;
   options.push({id,x,y,cost:CATALOG[id].cost});
  };
  for(const id of new Set(["infantry",...S.hand[team]])){
   if(!CATALOG[id]||!canPay(team,id))continue;
   if(isSpell(id)){
    if(id==="barrage"&&visibleEnemy)add(id,visibleEnemy.x,visibleEnemy.y);
    if(id==="ward"){
     const ally=S.units.filter(u=>u.team===team&&u.hp>0&&
      S.units.some(v=>v.team===other&&v.hp>0&&dist(v,u)<210))[0];
     if(ally)add(id,ally.x,ally.y);
    }
    continue;
   }
   add(id,edgeX,id==="scout"||id==="engineer"||id==="tank"?objY:y);
   if(visibleEnemy&&["infantry","archer","sentinel","suppress","guardian"].includes(id)){
    const intercept=limit(visibleEnemy.x+75,40,W-40);
    add(id,intercept,y);
   }
  }
  const generatedOptions=options.length;
  if(mode==="bounded"){
   // Safety-first beam: preserve WAIT, then at most 4 other legal
   // choices, ranked by observable current threat and objective.
   // No future action labels, unknown enemy cards, or rollout rewards.
   const foeClasses=S.units.filter(u=>u.team===other&&u.hp>0);
   const air=foeClasses.some(u=>CLASSES[u.key].flying);
   const large=foeClasses.some(u=>CLASSES[u.key].size==="large");
   const pack=foeClasses.length>=2;
   const danger=foeClasses.some(u=>u.x>WALL_FACE[team]-360);
   const val=action=>{
    let v=0;
    if(!foeClasses.length){
     if(action.id==="scout")v+=130;
     if(action.id==="engineer")v+=115;
     if(action.id==="tank")v+=65;
    }else{
     if(air&&action.id==="archer")v+=110;
     if(large&&action.id==="guardian")v+=120;
     if(!air&&action.id==="sentinel")v+=80;
     if(!air&&action.id==="infantry")v+=65;
     if(pack&&action.id==="barrage")v+=100;
     if(pack&&action.id==="suppress")v+=80;
     if(action.id==="ward")v+=35;
     if(action.id==="archer")v+=35;
     if(action.id==="scout"||action.id==="engineer")v+=25;
     if(danger&&action.x!==null&&Math.abs(action.x-visibleEnemy.x)<135)v+=40;
    }
    if(action.id==="scout"||action.id==="engineer")v+=12;
    return v-action.cost*3;
   };
   const best=options.slice(1).sort((a,b)=>val(b)-val(a)||
    a.cost-b.cost||a.id.localeCompare(b.id)||a.x-b.x||a.y-b.y).slice(0,4);
   options.splice(1,options.length-1,...best);
  }
  const oldOwn=capital(team).hp,oldEnemy=capital(other).hp;
  const foes=new Map(S.units.filter(u=>u.team===other).map(u=>[u.uid,u.hp]));
  const friends=new Map(S.units.filter(u=>u.team===team).map(u=>[u.uid,u.hp]));
  let best=null;
  // The next card gets the entire remaining search horizon (e.g. 14s
  // after t+6 in a 20s search). A 6s sub-horizon undervalues slow capture.
  const nextFrames=Math.round((horizon-6)*30);
  for(const action of options){
   Object.assign(S,structuredClone(state));randomState=savedRandom;botLastAction=null;
   if(action.id!=="wait"&&!botUse(team,action.id,action.x,action.y))continue;
   let ownFort=0,enemyFort=0;
   for(let k=0;k<nextFrames&&S.phase==="battle";k++){
    tick(1/30);
    for(const fort of S.forts){
     if(fort.owner===team)ownFort+=1/30;
     if(fort.owner===other)enemyFort+=1/30;
    }
   }
   const foeDamage=[...foes].reduce((v,[uid,hp])=>{
    const u=S.units.find(x=>x.uid===uid);
    return v+Math.max(0,hp-(u?.hp??0));
   },0);
   const friendLoss=[...friends].reduce((v,[uid,hp])=>{
    const u=S.units.find(x=>x.uid===uid);
    return v+Math.max(0,hp-(u?.hp??0));
   },0);
   const newSurvive=S.units.filter(u=>u.team===team&&!friends.has(u.uid))
    .reduce((v,u)=>v+Math.max(0,u.hp),0);
   const score=1.4*(oldEnemy-capital(other).hp-oldOwn+capital(team).hp)+
    .32*foeDamage-.30*friendLoss+
    8*(ownFort-enemyFort)+
    22*(S.forts.filter(f=>f.owner===team).length-
      S.forts.filter(f=>f.owner===other).length)+
    .03*newSurvive-12*action.cost;
   if(!best||score>best.score+1e-5||
    (Math.abs(score-best.score)<=1e-5&&action.cost<best.cost))
    best={...action,score:+score.toFixed(3)};
  }
  Object.assign(S,state);randomState=savedRandom;botLastAction=savedAction;
  return {chosen:best??options[0],optionsEvaluated:options.length,optionsGenerated:generatedOptions};
 };
 try{
  const edge=border(team),x=limit(edge+35,40,W-40);
  const target=S.forts.filter(f=>f.owner!==team)
   .sort((a,b)=>b.x-a.x)[0];
  const threat=S.units.filter(u=>u.team!==team&&u.hp>0)
   .sort((a,b)=>b.x-a.x)[0];
  const objectiveY=target?.y??330, threatY=threat?.y??objectiveY;
  const choices=[{id:"wait",x:null,y:null,cost:0}];
  const legalIds=["infantry",...S.hand[team]].filter(id=>CLASSES[id]&&canPay(team,id));
  for(const id of new Set(legalIds)){
   const primaryY=id==="scout"||id==="engineer"||id==="tank"?
    objectiveY:threatY;
   const locations=[{x,y:primaryY,role:"forward"}];
   if(threat&&target&&Math.abs(threatY-objectiveY)>115)
    locations.push({x,y:objectiveY,role:"objective"});
   // Prevent a failure mode of greedy lane spawn: a guard dropped BEHIND
   // fast hostile raiders may never engage before they reach the castle.
   // Include one legal interception placement closer to the threatened wall.
   if(threat&&["infantry","archer","sentinel","suppress","guardian"].includes(id)){
    const interceptX=limit(threat.x+(team===2?75:-75),40,W-40);
    if(canPlace(team,interceptX,threatY))
     locations.push({x:interceptX,y:threatY,role:"intercept"});
   }
   const unique=new Set();
   for(const point of locations){
    if(!canPlace(team,point.x,point.y))continue;
    const key=point.x+","+point.y;
    if(unique.has(key))continue;unique.add(key);
    choices.push({id,x:point.x,y:point.y,role:point.role,cost:CLASSES[id].cost});
   }
  }
  // Reference only: what the existing BOT would actually do on this scene.
  reset();seedRng(seeds[0]);botExpertAction(team);
  const legacy=botLastAction?{id:botLastAction.id,x:botLastAction.x,
   y:botLastAction.y,cost:CATALOG[botLastAction.id].cost}:
   {id:"wait",x:null,y:null,cost:0};
  // Compare the reference action under the same fixed simulator. It may be
  // a spell, unlike the v0 candidate search (ground/air units only).
  if(legacy.id!=="wait"&&!choices.some(c=>c.id===legacy.id&&
   c.x===legacy.x&&c.y===legacy.y))choices.push({...legacy,legacyOnly:true});
  const results=[];
  for(const option of choices){
   const runs=[];
   for(const response of responses)for(const seed of seeds){
    reset();seedRng(seed);
    // All options face exactly the same hypothetical enemy hand and
    // available energy. This is NOT the opponent's actual hidden hand.
    S.hand[other]=["scout","engineer","archer","sentinel"];
    S.queue[other]=[];
    const startingOwn=capital(team).hp,startingEnemy=capital(other).hp,
     ownOldHP=new Map(S.units.filter(u=>u.team===team).map(u=>[u.uid,u.hp])),
     enemyOldHP=new Map(S.units.filter(u=>u.team===other).map(u=>[u.uid,u.hp]));
    const preEnergy=S.energy[team];
    let success=true;
    if(option.id!=="wait"){
     // Real validation, hand use, cost, card cycling and placement.
     success=botUse(team,option.id,option.x,option.y);
    }
    if(!success){runs.push({invalid:true});continue;}
    let ownFortSeconds=0,enemyFortSeconds=0,steps=0;
    let responsePlays=0,secondAction=null,secondOptions=0,secondGenerated=0;
    const frames=Math.round(horizon*30);
    for(let i=0;i<frames&&S.phase==="battle";i++){
     if(mode!=="one"&&i===180){
      const plan=chooseNext();
      secondOptions=plan.optionsEvaluated;secondGenerated=plan.optionsGenerated;
      const choice=plan.chosen;
      const energyBefore=S.energy[team];
      const accepted=choice.id==="wait"||botUse(team,choice.id,choice.x,choice.y);
      if(!accepted)throw Error("selected 6s follow-up was not legal");
      secondAction={id:choice.id,x:choice.x,y:choice.y,
       cost:choice.cost,at:+S.elapsed.toFixed(3),
       charged:+(energyBefore-S.energy[team]).toFixed(4)};
     }
     // At +3s/+9s the hypothetical enemy may make a legal new
     // purchase at its own available deployment frontier. No fake
     // future units or direct manipulation of HP/energy are allowed.
     if(response!=="idle"&&(i===270||(i===90&&response!=="latePush"))){
      const x=limit(border(other)-35,40,W-40);
      const threat=S.units.filter(u=>u.team===team&&u.hp>0)
       .sort((a,b)=>a.x-b.x)[0];
      const y=limit(threat?.y??(i===90?205:444),70,H-70);
      const offers=response==="fortify"
       ?(i===90?["sentinel","archer","infantry"]:["archer","infantry"])
       :(i===90?["scout","engineer","infantry"]:["engineer","scout","infantry"]);
      for(const id of offers){
       if(canPay(other,id)&&playCard(other,id,x,y)){
        responsePlays++;break;
       }
      }
     }
     tick(1/30);steps++;
     for(const f of S.forts){
      if(f.owner===team)ownFortSeconds+=1/30;
      else if(f.owner===other)enemyFortSeconds+=1/30;
     }
    }
    const ownDamage=Math.max(0,startingOwn-capital(team).hp),
     enemyCastleDamage=Math.max(0,startingEnemy-capital(other).hp);
    const enemyUnitDamage=[...enemyOldHP].reduce((v,[uid,hp])=>{
     const current=S.units.find(u=>u.uid===uid);
     return v+Math.max(0,hp-(current?.hp??0));
    },0);
    const ownInitialLoss=[...ownOldHP].reduce((v,[uid,hp])=>{
     const current=S.units.find(u=>u.uid===uid);
     return v+Math.max(0,hp-(current?.hp??0));
    },0);
    const newUnitSurvivor=S.units.filter(u=>u.team===team&&!ownOldHP.has(u.uid))
     .reduce((n,u)=>n+Math.max(0,u.hp),0);
    const owned=S.forts.filter(f=>f.owner===team).length,
     opposed=S.forts.filter(f=>f.owner===other).length;
    // Frozen v0 weights, NOT tuned to held-out wins; no look-ahead cheats.
    const score=1.4*(enemyCastleDamage-ownDamage)+
      .32*enemyUnitDamage-.30*ownInitialLoss+
      8*(ownFortSeconds-enemyFortSeconds)+
      22*(owned-opposed)+.03*newUnitSurvivor-
      12*(option.cost+(secondAction?.cost||0));
    runs.push({seed,response,responsePlays,secondAction,secondOptions,secondGenerated,
     score:+score.toFixed(3),ownDamage:+ownDamage.toFixed(2),
     enemyCastleDamage:+enemyCastleDamage.toFixed(2),
     enemyUnitDamage:+enemyUnitDamage.toFixed(2),
     ownOldLoss:+ownInitialLoss.toFixed(2),newSurvivor:+newUnitSurvivor.toFixed(2),
     ownFortSeconds:+ownFortSeconds.toFixed(2),
     enemyFortSeconds:+enemyFortSeconds.toFixed(2),owned,opposed,
     spent:+(option.cost+(secondAction?.cost||0)).toFixed(2),
     elapsed:+(steps/30).toFixed(2)});
   }
   const valid=runs.filter(r=>!r.invalid);
   if(!valid.length)continue;
   const responseMeans=Object.fromEntries(responses.map(p=>{
    const subset=valid.filter(r=>r.response===p);
    return [p,subset.length
     ?+(subset.reduce((v,r)=>v+r.score,0)/subset.length).toFixed(3)
     :null];
   }));
   const vals=Object.values(responseMeans).filter(v=>v!==null);
   const conservativeScore=Math.min(...vals);
   results.push({...option,runs,responseMeans,
    conservativeScore:+conservativeScore.toFixed(3),
    meanScore:+(valid.reduce((v,r)=>v+r.score,0)/valid.length).toFixed(3)});
  }
  // Maximize the WORST response branch, then expected score among modeled
  // branches. This guards against one favorable future dominating a choice.
  results.sort((a,b)=>b.conservativeScore-a.conservativeScore||
   b.meanScore-a.meanScore||
   a.cost-b.cost||a.id.localeCompare(b.id)||a.y-b.y);
  const old=results.find(r=>r.id===legacy.id&&r.x===legacy.x&&r.y===legacy.y);
  return {horizon,seeds,responses,mode,followUpAt:6,legacy,best:results[0]||null,
   legacyScore:old?.meanScore??null,
   legacyConservativeScore:old?.conservativeScore??null,
   options:results,limits:[
    "Exact 30Hz physics + hypothetical opponent reinforcements at 3s/9s.",
    "Same frozen state and seeded streams for each initial action and response.",
    "At 6s, exact-engine full or bounded beam evaluates next legal cards over the remaining horizon, never reading future opponent labels.",
    "Enemy response is up to two legal hypothetical scripted actions at 3s and 9s.",
    "Enemy hypothetical hand is a public assumption, not actual private data.",
    "Heuristic score is NOT actual winning probability.",
    "Offline fixed-scene proof of concept; not deployed as regular BOT."]};
 }finally{
  Object.assign(S,initial);
  Math.random=oldRandom;duelStats=oldDuel;qaBotVariants=oldVariants;
  botLastAction=oldAction;
  [qaSiegePlans,qaWindowPlans,qaConcedePlans,qaRaceBudgetPlans,qaCastleHitEvents]=oldPlans;
 }
}
