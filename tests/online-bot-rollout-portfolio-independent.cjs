"use strict";
// Unseen scenario+seed diagnostic after role-target-distance bug fix.
// Do not tune again against this diagnostic sample.
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),dir="qa-bot-portfolio-independent";
fs.mkdirSync(dir,{recursive:true});
const game=fs.readFileSync(path.join(root,"online-game.js"),"utf8"),
 helper=fs.readFileSync(path.join(root,"tests/online-bot-rollout-portfolio.inc.js"),"utf8");
const anchor=" window.__shokokuQa={\n";
assert.equal(game.split(anchor).length,2,"original QA location changed");
const patched=game.replace(anchor,"\n"+helper+"\n"+
 " window.__shokokuQa={\n searchPortfolio:qaRolloutPortfolioSearch,\n");
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(p).pipe(res);
});
const hands=[
 ["archer","guardian","scout","ward"],
 ["tank","scout","archer","barrage"],
 ["engineer","sentinel","guardian","archer"],
 ["scout","suppress","drone","tank"],
 ["archer","ward","sentinel","suppress"],
 ["guardian","engineer","tank","barrage"],
 ["scout","engineer","archer","drone"]
];
const enemyArchetypes=[
 [{key:"scout",x:1100,y:190},{key:"drone",x:1080,y:444}],
 [{key:"tank",x:1070,y:444},{key:"scout",x:1110,y:190}],
 [{key:"drone",x:1120,y:205},{key:"scout",x:995,y:444}],
 [{key:"guardian",x:900,y:444},{key:"drone",x:950,y:205}],
 [{key:"sentinel",x:1120,y:444}],
 [{key:"archer",x:975,y:190},{key:"scout",x:1080,y:440}],
 [{key:"scout",x:1095,y:445},{key:"scout",x:985,y:200}],
 [{key:"drone",x:1085,y:444}],
 [{key:"tank",x:955,y:205}],
 [{key:"engineer",x:1030,y:200},{key:"drone",x:1090,y:430}],
 []
];
const scenarios=[];
for(let i=0;i<30;i++){
 const p=enemyArchetypes[(i*7+3)%enemyArchetypes.length],
  hand=hands[(i*5+1)%hands.length],
  energy=[3.15,5.55,7.35,8.65,11.2][(i*3)%5],
  fortOwners=[[0,0,0],[0,2,0],[0,0,2],[2,0,0],[0,2,2]][i%5];
 scenarios.push({name:"new-"+String(i).padStart(2,"0"),pool:"new30",spec:{
  difficulty:"hard",elapsed:31+(i*37)%155,energy,enemyEnergy:3.5+(i%5)*1.45,
  hand,fortOwners,enemies:p,allies:i%7===3?
   [{key:"sentinel",x:860,y:445}]:i%7===5?
   [{key:"archer",x:930,y:205}]:[] }});
}
scenarios.push({name:"known-mixed-lanes",pool:"previousRegression",spec:{
 difficulty:"hard",elapsed:139,energy:7.2,enemyEnergy:5,
 hand:["tank","guardian","archer","engineer"],fortOwners:[0,0,2],
 enemies:[{key:"scout",x:980,y:205},{key:"drone",x:930,y:444}],allies:[]}});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8886,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8886/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const sample=(spec,mode)=>page.evaluate(arg=>{
   const start=performance.now();
   const result=window.__shokokuQa.searchPortfolio(arg.spec,20,[223,271],
    ["idle","counterpush"],arg.mode);
   return {result,ms:performance.now()-start};
  },{spec,mode});
  const key=o=>[o.id,o.x,o.y].join(":");
  const rows=[];
  for(const scenario of scenarios){
   const full=await sample(scenario.spec,"two");
   const bounded=await sample(scenario.spec,"bounded");
   const greedy=await sample(scenario.spec,"budget");
   const portfolio=await sample(scenario.spec,"portfolio");
   const a=full.result,b=bounded.result,c=greedy.result,d=portfolio.result;
   assert.ok(a?.best&&b?.best&&c?.best&&d?.best);
   const keys=new Set(d.options.map(key));
   assert.ok(d.firstEvaluated<=10,"role portfolio exceeded research maximum");
   assert.ok(d.firstEvaluated<=a.firstEvaluated);
   assert.ok(keys.has(key({id:"wait",x:null,y:null})));
   assert.ok(keys.has(key(a.legacy)),"legacy must not disappear");
   assert.equal(d.rolesAvailable.length,d.roleCoverage.length);
   for(const role of d.roleCoverage)assert.ok(keys.has(key(role)),
    "protected strategy option was removed");
   for(const candidate of d.options)for(const run of candidate.runs)
    assert.ok(run.secondOptions<=5&&run.secondAction&&
     Number.isFinite(run.score),"legal finite bounded second choice");
   const score=x=>x.best.conservativeScore;
   const row={name:scenario.name,pool:scenario.pool,hand:scenario.spec.hand,
    enemy:scenario.spec.enemies.map(x=>x.key),energy:scenario.spec.energy,
    totalCandidates:a.firstEvaluated,kept:d.firstEvaluated,
    roles:d.roleCoverage,
    full:key(a.best),bounded:key(b.best),greedy:key(c.best),portfolio:key(d.best),
    retainsFull:keys.has(key(a.best)),
    portfolioMatchesFull:key(d.best)===key(a.best),
    portfolioMatchesBounded:key(d.best)===key(b.best),
    greedyMatchesFull:key(c.best)===key(a.best),
    scoreFull:score(a),scorePortfolio:score(d),
    timeMs:{full:+full.ms.toFixed(1),bounded:+bounded.ms.toFixed(1),
     greedy:+greedy.ms.toFixed(1),portfolio:+portfolio.ms.toFixed(1)}};
   rows.push(row);
  }
  assert.deepEqual(errors,[]);
  const stats=arr=>({
   cases:arr.length,
   referenceCandidateRetained:arr.filter(r=>r.retainsFull).length,
   matchesFull:arr.filter(r=>r.portfolioMatchesFull).length,
   matchesSecondBoundedControl:arr.filter(r=>r.portfolioMatchesBounded).length,
   naiveMatchesFull:arr.filter(r=>r.greedyMatchesFull).length,
   totalGenerated:arr.reduce((x,r)=>x+r.totalCandidates,0),
   totalKept:arr.reduce((x,r)=>x+r.kept,0),
   avgPortfolioMs:+(arr.reduce((x,r)=>x+r.timeMs.portfolio,0)/arr.length).toFixed(1),
   avgFullMs:+(arr.reduce((x,r)=>x+r.timeMs.full,0)/arr.length).toFixed(1)
  });
  const fresh=rows.filter(r=>r.pool==="new30");
  const known=rows.filter(r=>r.pool==="previousRegression");
  const report={kind:"Role-specific geometric portfolio independent diagnostic",
   seeds:[223,271],responses:["idle","counterpush"],
   newCases:stats(fresh),knownRegression:stats(known),
   mismatches:rows.filter(r=>!r.portfolioMatchesFull),rows,
   caveats:["Unseen diagnostic scenes, not complete full-game wins.",
    "Once observed, this new30 sample must not be reused as a tuned independent holdout.",
    "The reference mode searches the full inner action space; portfolio bounds the inner action space too.",
    "Do not equate action agreement with improved win rate.",
    "Safari/online performance not measured, main and public BOT unchanged."]};
  fs.writeFileSync(path.join(dir,"summary.json"),JSON.stringify(report,null,2));
  console.log("ROLE GEOMETRY SUMMARY",JSON.stringify({...report,rows:undefined,
   mismatches:report.mismatches.map(r=>({name:r.name,pool:r.pool,enemy:r.enemy,
    full:r.full,portfolio:r.portfolio,bounded:r.bounded,
    retainsFull:r.retainsFull,roles:r.roles}))}));
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
