"use strict";
// Research-only reproducible comparison of greedy top-6 vs role-protected
// first-action portfolios. We deliberately do not tune on fresh cases.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),folder="qa-bot-portfolio-review";
fs.mkdirSync(folder,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 helper=fs.readFileSync(path.join(root,"tests/online-bot-rollout-portfolio.inc.js"),"utf8");
const anchor=" window.__shokokuQa={\n";
assert.equal(game.split(anchor).length,2);
const injected=game.replace(anchor,"\n"+helper+"\n"+
 " window.__shokokuQa={\n searchPortfolio:qaRolloutPortfolioSearch,\n");
const srv=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p===path.join(root,"online-game.js")){res.end(injected);return;}
 fs.createReadStream(p).pipe(res);
});
const historical=[
 [],[{key:"scout",x:960,y:205}],
 [{key:"scout",x:940,y:205},{key:"scout",x:975,y:211}],
 [{key:"drone",x:1010,y:205}],
 [{key:"tank",x:915,y:205}],
 [{key:"scout",x:1040,y:444}],
 [{key:"drone",x:905,y:444},{key:"scout",x:960,y:444}],
 [{key:"scout",x:980,y:205},{key:"drone",x:930,y:444}]
];
const hands=[
 ["scout","engineer","archer","sentinel"],
 ["tank","guardian","archer","engineer"],
 ["drone","scout","suppress","ward"],
 ["sentinel","archer","scout","barrage"],
 ["suppress","engineer","tank","archer"]
];
const cases=[];
for(let i=0;i<24;i++){
 const p=historical[i%historical.length],
  energy=[2.6,3.4,4.3,7.2,9.1][Math.floor(i/2)%5],
  hand=hands[(i*3+Math.floor(i/8))%hands.length],
  lane=i%4===0?444:205;
 const enemies=p.map(e=>({...e,y:lane===444&&e.y===205?444:e.y}));
 cases.push({name:"regression-"+String(i).padStart(2,"0"),pool:"old24",spec:{
  difficulty:"hard",elapsed:20+(i*17)%170,energy,enemyEnergy:3+(i%3)*2,
  hand,fortOwners:i%3===0?[0,0,0]:i%3===1?[0,0,2]:[0,2,2],
  enemies,allies:i%5===0?[{key:"sentinel",x:850,y:lane}]:[] }});
}
// Fresh, fully specified deterministic scenes: different seeds, card mixes,
// threats, starting arrangements from the old V4 regression generator.
// Do not refit policy based on their outcomes: diagnostic results only.
const combos=[
 [{key:"scout",x:1080,y:205},{key:"drone",x:1110,y:444}],
 [{key:"tank",x:1065,y:444},{key:"drone",x:885,y:205}],
 [{key:"scout",x:1125,y:205},{key:"scout",x:1120,y:444}],
 [{key:"engineer",x:1040,y:444},{key:"drone",x:940,y:444}],
 [{key:"sentinel",x:850,y:205},{key:"scout",x:1115,y:205}],
 [{key:"guardian",x:925,y:205}],
 [{key:"suppress",x:1060,y:444},{key:"drone",x:890,y:205}],
 [{key:"archer",x:1090,y:205},{key:"scout",x:1070,y:444}],
 [{key:"scout",x:1130,y:444}],
 []
];
const freshHands=[
 ["guardian","scout","tank","archer"],
 ["sentinel","suppress","engineer","barrage"],
 ["drone","ward","archer","tank"],
 ["scout","engineer","guardian","suppress"],
 ["archer","sentinel","tank","scout"],
 ["guardian","engineer","barrage","drone"]
];
for(let i=0;i<20;i++){
 const enemy=combos[(i*7+1)%combos.length],
  hand=freshHands[(i*5+2)%freshHands.length],energy=[2.1,4.8,6.6,8.4,11][i%5];
 cases.push({name:"fresh-"+String(i).padStart(2,"0"),pool:"fresh20",spec:{
  difficulty:"hard",elapsed:25+(i*29)%145,energy,enemyEnergy:4+(i%4)*1.5,
  hand,fortOwners:[[0,0,0],[0,2,0],[0,0,2],[2,2,0]][i%4],
  enemies:enemy,allies:i%6===2?[{key:"archer",x:830,y:205}]:[]
 }});
}
(async()=>{
 let browser;
 try{
  await new Promise(ok=>srv.listen(8885,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8885/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const measure=(spec,mode)=>page.evaluate(p=>{
   const t=performance.now(),result=window.__shokokuQa.searchPortfolio(
    p.spec,20,p.seeds,p.responses,p.mode);
   return {ms:performance.now()-t,result};
  },{spec,seeds:[17,41],responses:["idle","counterpush"],mode});
  const rows=[];
  for(const sample of cases){
   const full=await measure(sample.spec,"two"),
    naive=await measure(sample.spec,"budget"),
    portfolio=await measure(sample.spec,"portfolio");
   for(const [label,x] of [["full",full],["naive",naive],["portfolio",portfolio]])
    assert.ok(x.result?.best,label+" must produce action for "+sample.name);
   const a=full.result,b=naive.result,c=portfolio.result;
   const key=x=>[x.id,x.x,x.y].join(":");
   assert.ok(c.firstEvaluated<=10,"portfolio budget at most 10 initial candidates");
   assert.ok(c.firstEvaluated<=a.firstEvaluated);
   assert.ok(c.options.some(x=>x.id==="wait"));
   assert.ok(c.options.some(x=>key(x)===key(a.legacy)),
    "legacy fallback always preserved");
   assert.ok(c.roleCoverage.length===c.rolesAvailable.length,
    "each available strategic role has a coverage record");
   const represented=new Set(c.options.map(key));
   assert.ok(c.roleCoverage.every(x=>represented.has(key(x))),
    "each protected role's chosen location must survive pruning");
   assert.ok(c.options.every(x=>x.runs.every(r=>
    r.secondAction&&r.secondOptions<=5&&r.secondOptions<=r.secondGenerated)),
    "all candidates evaluate legal and bounded second decisions");
   const fullBestKey=key(a.best);
   const fullRetained=represented.has(fullBestKey),
    naiveRetained=b.options.some(x=>key(x)===fullBestKey);
   const op=x=>x.id+"/"+x.x+"/"+x.y;
   rows.push({name:sample.name,pool:sample.pool,energy:sample.spec.energy,
    hand:sample.spec.hand,enemy:sample.spec.enemies.map(x=>x.key),
    fullChoice:op(a.best),naiveChoice:op(b.best),
    portfolioChoice:op(c.best),fullRetained,naiveRetained,
    roleCoverage:c.roleCoverage,availableRoles:c.rolesAvailable,
    firstGenerated:c.generatedFirst,firstEvaluated:c.firstEvaluated,
    fullMs:+full.ms.toFixed(2),naiveMs:+naive.ms.toFixed(2),
    portfolioMs:+portfolio.ms.toFixed(2),
    portfolioWorst:c.best.conservativeScore,fullWorst:a.best.conservativeScore,
    isSameAsFull:fullBestKey===key(c.best),
    naiveSameAsFull:fullBestKey===key(b.best)});
  }
  assert.deepEqual(errors,[]);
  const stats=pool=>{
   const x=rows.filter(r=>r.pool===pool);
   const sum=key=>x.reduce((n,r)=>n+r[key],0);
   return {scenes:x.length,fullCandidateRetainedByPortfolio:x.filter(r=>r.fullRetained).length,
    fullCandidateRetainedByNaive:x.filter(r=>r.naiveRetained).length,
    portfolioDecisionsMatchFull:x.filter(r=>r.isSameAsFull).length,
    naiveDecisionsMatchFull:x.filter(r=>r.naiveSameAsFull).length,
    avgInitialCandidates:+(sum("firstEvaluated")/x.length).toFixed(2),
    fullMs:+sum("fullMs").toFixed(1),naiveMs:+sum("naiveMs").toFixed(1),
    portfolioMs:+sum("portfolioMs").toFixed(1)};
  };
  const report={kind:"Role-protected tactical portfolio vs top-six greedy vs full 30Hz",
   knownRegression:stats("old24"),freshDiagnostic:stats("fresh20"),
   failures:rows.filter(r=>!r.fullRetained||!r.isSameAsFull),
   rows,
   caveats:["Score agreement is not actual wins or improvement against humans.",
    "Fresh20 may not be reused for tuning; later testing needs new held-out trials.",
    "QA run times from headless Chromium, NOT measured on real iPad Safari.",
    "First action roles and hidden opponent actions are separate: no future leak.",
    "The default game, current BOT, deployable iPad HTML and main remain untouched."]};
  fs.writeFileSync(path.join(folder,"summary.json"),JSON.stringify(report,null,2));
  console.log("PORTFOLIO RESEARCH SUMMARY",JSON.stringify({
   ...report,rows:undefined,
   failures:report.failures.map(x=>({name:x.name,pool:x.pool,hand:x.hand,
    enemy:x.enemy,full:x.fullChoice,portfolio:x.portfolioChoice,
    fullRetained:x.fullRetained}))}));
 }finally{if(browser)await browser.close();await new Promise(ok=>srv.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
