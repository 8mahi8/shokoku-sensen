"use strict";
// No new spells, purchases or strategy branches: the additional code is a
// passive scorer attached to actual legal BOT-v-BOT self-play physics.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-attrition-v14-natural";
fs.mkdirSync(out,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 model=fs.readFileSync(path.join(root,"tests/online-bot-attrition-v14.inc.js"),"utf8"),
 natural=fs.readFileSync(path.join(root,"tests/online-bot-attrition-v14-natural.inc.js"),"utf8"),
 anchor=" window.__shokokuQa={\n",
 tickLine=' if(S.phase==="battle"&&S.seconds<=0)finishTime();';
for(const a of [anchor,tickLine])assert.equal(game.split(a).length,2,"source marker changed "+a);
const tickDeclaration="function tick(dt){";
assert.equal(game.split(tickDeclaration).length,2);
const patched=game.replace(tickDeclaration,
 "\n"+model+"\n"+natural+"\n"+tickDeclaration)
 .replace(anchor," window.__shokokuQa={\n"+
 " attritionNaturalStart:qaAttritionNaturalStart,\n"+
 " attritionNaturalFinish:qaAttritionNaturalFinish,\n")
 .replace(tickLine," if(qaAttritionNatural)qaAttritionNaturalTick();\n"+tickLine);
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(p).pipe(res);
});
const seeds=[28411,28447,28499,28517,28591,28603],
 styles=["self","rush","balanced","fortress","banker"];
const settings=style=>style==="self"?
 [{cadence:"standard",mirror:false},{cadence:"standard",mirror:true}]:
 [{cadence:"standard",mirror:false},{cadence:"fast",mirror:false}];
const score=rows=>{
 const avg=(fn)=>rows.length?rows.reduce((sum,x)=>sum+fn(x),0)/rows.length:0;
 const absolute=key=>avg(x=>Math.abs(x.pre[key]-x.outcome.margin));
 const active=rows.filter(x=>x.outcome.own<.99||x.outcome.enemy<.99);
 const classify=(key,arr)=>{const useful=arr.filter(x=>Math.abs(x.outcome.margin)>.15);
  return {number:useful.length,correct:useful.filter(x=>{
   const label=v=>v>.15?1:v<-.15?-1:0;
   return label(x.pre[key])===label(x.outcome.margin);
  }).length};};
 return {n:rows.length,maeHpOnly:+absolute("hpMargin").toFixed(4),
  maeAttrition:+absolute("margin").toFixed(4),
  percentChange:+(100*(absolute("margin")/Math.max(.001,absolute("hpMargin"))-1)).toFixed(2),
  realCombatWindows:active.length,
  hpOnlyClass:classify("hpMargin",rows),
  attritionClass:classify("margin",rows),
  classInRealCombat:{hpOnly:classify("hpMargin",active),
   attrition:classify("margin",active)},
  fortLost:rows.filter(x=>!x.outcome.held).length
 };
};
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8915,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8915/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const games=[],windows=[];
  for(const seed of seeds)for(const style of styles)for(const opts of settings(style)){
   const gameData=await page.evaluate(({seed,style,...options})=>{
    const qa=window.__shokokuQa;
    const run=()=>qa.runDuel(seed,style,"hard",2,
     options.cadence,options.mirror,0,"baseline");
    const baseline=run();
    if(!qa.attritionNaturalStart(2,18))throw Error("audit unavailable");
    const observed=run();
    const telemetry=qa.attritionNaturalFinish();
    return {baseline,observed,telemetry};
   },{seed,style,...opts});
   const {baseline,observed,telemetry}=gameData;
   assert.ok(baseline?.finished&&observed?.finished,
    "must compare complete lawful battles");
   for(const key of ["winner","elapsed","castleHp","actions","spent",
    "cards","fortSeconds","initialHand","openingQueue"]){
    assert.deepEqual(baseline[key],observed[key],
     "read-only attrition observer altered game "+seed+"/"+style+"/"+key);
   }
   assert.equal(telemetry.started,
    telemetry.completed+telemetry.censored,
    "all started windows completed or censored");
   games.push({seed,style,...opts,winner:observed.winner,
    elapsed:observed.elapsed,
    observedWindows:telemetry.completed,
    censoredWindows:telemetry.censored,
    skippedNoDefender:telemetry.skippedNoDefender,
    skippedNoEnemy:telemetry.skippedNoEnemy});
   windows.push(...telemetry.results.map(x=>({...x,seed,style,
    cadence:opts.cadence,mirror:opts.mirror})));
  }
  assert.deepEqual(errors,[]);assert.equal(games.length,60);
  assert.ok(windows.length>=10,
   "insufficient naturally occurring local encounters for analysis "+windows.length);
  const byStyle=Object.fromEntries(styles.map(style=>
   [style,score(windows.filter(x=>x.style===style))]));
  const byNewAction={
   noOpponentCards:score(windows.filter(x=>x.contextual.enemyCardsPlayed===0)),
   opponentCards:score(windows.filter(x=>x.contextual.enemyCardsPlayed>0)),
   neitherTeamPlayed:score(windows.filter(x=>
    x.contextual.enemyCardsPlayed===0&&x.contextual.ownCardsPlayed===0)),
   anySpellPlayed:score(windows.filter(x=>
    x.contextual.enemySpellsPlayed+x.contextual.ownSpellsPlayed>0)),
   noSpellPlayed:score(windows.filter(x=>
    x.contextual.enemySpellsPlayed+x.contextual.ownSpellsPlayed===0)),
   newlyPresentNearby:score(windows.filter(x=>x.contextual.newUnitsNearFort>0))
  };
  const report={
   kind:"V14 passive generalization to full legal 30Hz BOT vs BOT matches",
   seededMatches:games.length,seeds,
   observations:windows.length,
   censored:games.reduce((sum,x)=>sum+x.censoredWindows,0),
   overall:score(windows),
   byStyle,byNewAction,
   byPhase:{
    early:score(windows.filter(x=>x.at<100)),
    middle:score(windows.filter(x=>x.at>=100&&x.at<210)),
    late:score(windows.filter(x=>x.at>=210))
   },
   games,
   interpretation:[
    "All full matches compared observer OFF against observer ON; outcomes and all actions matched.",
    "This is a domain-shift check: normal BOT and opponent styles can summon spells and additional units inside an 18s prediction window.",
    "The model sees only present local units and public class data, not future enemy spawns.",
    "Unit HP label tracks the SAME existing units, no credit for newly spawned reinforcements.",
    "Fort hold is a separately observed contextual label, not the target for this attrition MAE.",
    "Windows from the same match and different forts are correlated; no independent inference on win-rate or online human play.",
    "No change to main, online gameplay, Firebase, published build or school iPad.",
    "Do not retune the old held-out prediction model against these outcomes."]
  };
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(out,"windows.json"),JSON.stringify(windows,null,2));
  console.log("BOT ATTRITION NATURAL MATCH SUMMARY",
   JSON.stringify({...report,games:games.map(x=>({...x})).slice(0,6)}));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
