// Known-seed strategic choice audit of the unchanged expert BOT.
// This test injects a read-only observer only in the localhost QA server.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-strategic-choices";
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,"online-game.js"),"utf8");
const observer=fs.readFileSync(path.join(root,"tests/online-bot-strategic-choices.inc.js"),"utf8");
const markers=[
 "function botExpertAction(team=2){",
 " }finally{\n  if(decisionAudit){"
];
for(const marker of markers)assert.equal(source.split(marker).length,2,
 "Expected unique BOT instrumentation anchor: "+marker);
const patched=source.replace(markers[0],
 observer+"\n"+markers[0]+"\n if(qaStrategic.enabled&&qaStrategic.targetTeam===team)qaStrategicCapture(team);")
 .replace(markers[1],
 " }finally{\n  if(qaStrategic.enabled&&qaStrategic.targetTeam===team)qaStrategicResolve(team);\n  if(decisionAudit){");
assert.ok(patched.includes("qaStrategicResolve(team);"));
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(req.url.split("?")[0]);
 const file=path.resolve(root,"."+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",file.endsWith(".js")?
  "text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(file===path.join(root,"online-game.js")){res.end(patched);return;}
 fs.createReadStream(file).pipe(res);
});
const seeds=[17,41],teams=[1,2];
const styles=["self","rush","balanced","fortress","banker"];
const counterKeys=["decisions","noLegalSpend","twoLegalCards",
 "twoDistinctRoles","meaningfulChoice","fortUnderThreat",
 "ownCastleUnderPressure","enemyCastleUnderPressure","heavyAffordable",
 "blueMeaningful","redMeaningful","meaningfulPlayedCard",
 "meaningfulPlayedNone","playedNotInLegalList"];
const sum=(xs,key)=>xs.reduce((n,x)=>n+(x.audit.counts[key]||0),0);
const summary=rows=>({
 pairs:rows.length,
 counters:Object.fromEntries(counterKeys.map(k=>[k,sum(rows,k)]))
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(8867,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8867/online.html?qa=1",
   {waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const rows=[];
  for(const seed of seeds)for(const team of teams)for(const style of styles)
   for(const mirror of style==="self"?[false,true]:[false]){
    const q={seed,team,style,mirror};
    const base=await page.evaluate(p=>window.__shokokuQa.runDuel(
     p.seed,p.style,"hard",p.team,"standard",p.mirror),q);
    const result=await page.evaluate(p=>{
     window.__qaStrategicControl.reset(p.team);
     const game=window.__shokokuQa.runDuel(
      p.seed,p.style,"hard",p.team,"standard",p.mirror);
     const audit=window.__qaStrategicControl.snapshot();
     window.__qaStrategicControl.stop();
     return {game,audit};
    },q);
    const {game,audit}=result;
    assert.ok(base?.finished&&game?.finished,"Complete 30Hz simulated duel");
    for(const k of ["winner","elapsed","initialHand","openingQueue",
     "castleHp","damage","actions","spent","cards","fortSeconds",
     "energyEstimated","energyActual","maxUnits","decisionEvents"]){
     assert.deepEqual(game[k],base[k],"Read-only observer changed "+k);
    }
    assert.ok(audit.counts.decisions>0,"BOT must have made real decisions");
    assert.equal(audit.counts.playedNotInLegalList||0,0,
     "Played cards must be legal at decision start");
    assert.ok((audit.counts.meaningfulChoice||0)<=
     (audit.counts.twoDistinctRoles||0));
    rows.push({...q,baseWinner:base.winner,
     audit:{counts:audit.counts,records:audit.records}});
   }
  assert.equal(rows.length,24);
  assert.deepEqual(errors,[]);
  const result={
   kind:"TRAIN-only actionability and strategic-opportunity audit",
   pairedGames:rows.length,baselineGames:rows.length,
   knownResearchSeeds:seeds,styles,
   overall:summary(rows),
   byTeam:Object.fromEntries(teams.map(t=>[t,summary(rows.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,summary(rows.filter(r=>r.style===s))])),
   examples:rows.flatMap(r=>r.audit.records.map(p=>({...p,
    seed:r.seed,style:r.style,mirror:r.mirror}))).slice(0,100),
   interpretation:[
    "A legal choice is not necessarily a tactically good choice.",
    "Repeated decisions within one match are not independent matches.",
    "No hidden opponent hand/true resources, balance edits, or BOT policy edits.",
    "A/B outcomes are identical by design, so this does not prove strength."
   ]
  };
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(result,null,2));
  fs.writeFileSync(path.join(out,"rows.json"),JSON.stringify(rows,null,2));
  console.log("STRATEGIC OPPORTUNITY TOTALS",JSON.stringify(result.overall));
  console.log("BY TEAM",JSON.stringify(result.byTeam));
  console.log("BY STYLE",JSON.stringify(result.byStyle));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
