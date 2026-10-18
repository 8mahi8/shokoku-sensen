 // QA V13: preserve enough energy for a real 4-cost anti-raid guard when
 // the original fast fallback would use a 2-cost temporary defender.
 // Never apply this to the last fort when the capital is endangered.
 if(qaPolicy==="fortCounterReserve13"&&urgent&&!castleThreat.length&&
  !concessionHold&&threatened&&S.elapsed>=20&&S.elapsed<=235&&
  power>=2&&power<4&&availableCard(team,"sentinel")){
  const attackers=threatened.enemies.filter(u=>!CLASSES[u.key].flying),
   defenders=friends.filter(u=>u.hp>u.max*.35&&
    Math.abs(u.x-threatened.f.x)<180&&Math.abs(u.y-threatened.f.y)<135&&
    !CLASSES[u.key].capture),
   owned=S.forts.filter(f=>f.owner===team).length,
   wallSafe=foes.every(u=>Math.abs(u.x-WALL_FACE[team])>=320),
   eta4=secondsUntilAffordable(power,4),
   noExpensiveDefense=power<4,
   fastBreakthrough=attackers.some(u=>CLASSES[u.key].speed>=34);
  const candidate=attackers.length>=1&&attackers.length<=2&&
   !defenders.length&&wallSafe&&!fastBreakthrough&&
   eta4<=4.8&&noExpensiveDefense&&
   (owned>=2||capital(team).hp>=2450&&
    foes.every(u=>Math.abs(u.x-WALL_FACE[team])>440));
  if(event){
   event.v13Checked=(event.v13Checked||0)+1;
   if(candidate){
    event.v13Held=(event.v13Held||0)+1;
    const samples=event.v13Examples||(event.v13Examples=[]);
    if(samples.length<30)samples.push({t:+S.elapsed.toFixed(2),
     power:+power.toFixed(2),eta4:+eta4.toFixed(2),
     owned,fortX:threatened.f.x,
     attackers:attackers.map(u=>u.key),noDefenders:!defenders.length});
   }
  }
  if(candidate)return true; // Let legacy BOT re-evaluate and counter next turn.
 }
