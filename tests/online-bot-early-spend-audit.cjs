"use strict";
// QA-only observation: dynamically add counters to the served HTTP response.
// No modification to production game, card logic, or decision paths.
const assert=require("node:assert/strict"),fs=require("node:fs"),
path=require("node:path"),http=require("node:http"),{chromium}=require("playwright");
const root=process.cwd(),out="qa-bot-early-spend-audit";fs.mkdirSync(out,{recursive:true});
let src=fs.readFileSync(path.join(root,"online-game.js"),"utf8");
const head='  const before=decisionAudit?{\n   energy:S.energy[team]';
const after='  const played=duelStats.actions[team]>beforeActions;\n   const card=played?botLastAction.id:"none";';
assert.equal(src.split(head).length,2,"early snapshot source changed");
assert.equal(src.split(after).length,2,"action telemetry source changed");
src=src.replace(head,[
 '  const before=decisionAudit?{',
 '   at:S.elapsed, startHand:S.hand[team].slice(),',
 '   startLeft:{...S.left[team]},',
 '   energy:S.energy[team]'
].join("\n"));
src=src.replace(after,after+"\n"+[
 '   if(before.at<=120){',
 '    const targetIds=["scout","engineer","sentinel","tank"];',
 '    const pending=targetIds.filter(id=>before.startHand.includes(id)&&',
 '     before.startLeft[id]>0&&before.energy<CATALOG[id].cost);',
 '    const delays=Object.fromEntries(pending.map(id=>{',
 '     const previous=secondsUntilAffordable(before.energy,CATALOG[id].cost);',
 '     const next=secondsUntilAffordable(S.energy[team],CATALOG[id].cost);',
 '     return [id,+Math.max(0,next-previous).toFixed(2)];',
 '    }));',
 '    (decisionAudit.earlyChoices||(decisionAudit.earlyChoices=[])).push({',
 '     at:+before.at.toFixed(2),energy:+before.energy.toFixed(3),',
 '     chosen:card,cost:played?CATALOG[card].cost:0,',
 '     pending,delays,hand:before.startHand,',
 '     needsFort:before.pendingFort,underPressure:before.underPressure',
 '    });',
 '   }'
].join("\n"));
const srv=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(req.url.split("?")[0]));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);res.end("404");return;
 }
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
 if(p===path.join(root,"online-game.js")){res.end(src);return;}
 fs.createReadStream(p).pipe(res);
});
const seeds=[17,41,73,101,131,163],teams=[1,2],
styles=["self","rush","fortress","banker"];
const sum=(xs,f)=>xs.reduce((v,x)=>v+f(x),0);
(async()=>{
 let browser;
 try{
  await new Promise(ok=>srv.listen(8876,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1194,height:834}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/www.gstatic.com/firebasejs/**",r=>r.abort());
  await page.goto("http://127.0.0.1:8876/online.html?qa=1",{waitUntil:"domcontentloaded"});
  await page.locator("#netSolo").click();
  await page.waitForFunction(()=>window.__shokokuQa?.snapshot().phase==="prep");
  const run=(q,variant)=>page.evaluate(x=>window.__shokokuQa.runDuel(
   x.seed,x.style,"hard",x.team,"standard",x.mirror,
   x.variant==="baseline"?0:x.team,x.variant),{...q,variant});
  const rows=[],fields=["winner","elapsed","initialHand","openingQueue",
   "castleHp","damage","actions","spent","cards","fortSeconds","energyEstimated",
   "energyActual","maxUnits"];
  for(const seed of seeds)for(const team of teams)for(const style of styles)
   for(const mirror of style==="self"?[false,true]:[false]){
    const q={seed,team,style,mirror};
    const baseline=await run(q,"baseline"),audit=await run(q,"opportunityAudit");
    assert.ok(baseline?.finished&&audit?.finished);
    for(const field of fields)assert.deepEqual(audit[field],baseline[field],
     "observational variant must be identical: "+field);
    const choices=audit.decisionAudit[team].earlyChoices||[];
    assert.ok(choices.length>0,"early action choices tracked");
    rows.push({...q,choices});
   }
  assert.deepEqual(errors,[]);
  assert.equal(rows.length,60);
  const all=rows.flatMap(row=>row.choices.map(c=>({...c,seed:row.seed,team:row.team,style:row.style})));
  const names=["scout","engineer","archer","sentinel","guardian","tank","drone",
   "infantry","suppress","barrage","ward","none"];
  const summarize=xs=>({
   decisions:xs.length,plays:xs.filter(r=>r.chosen!=="none").length,
   cardCounts:Object.fromEntries(names.map(n=>[n,xs.filter(r=>r.chosen===n).length])),
   scoutPending:xs.filter(r=>r.pending.includes("scout")).length,
   scoutDelayedPlays:xs.filter(r=>r.chosen!=="none"&&r.delays.scout>0).length,
   engineerDelayedPlays:xs.filter(r=>r.chosen!=="none"&&r.delays.engineer>0).length,
   sentinelDelayedPlays:xs.filter(r=>r.chosen!=="none"&&r.delays.sentinel>0).length,
   tankDelayedPlays:xs.filter(r=>r.chosen!=="none"&&r.delays.tank>0).length,
   lowEnergyScoutSpend:xs.filter(r=>r.energy>=2&&r.energy<3&&
    r.pending.includes("scout")&&r.chosen!=="none").length
  });
  const report={kind:"Observational early-action affordability audit at actual decision timestamps",
   seeds,pairedConditions:rows.length,fullGames:rows.length*2,
   overall:summarize(all),
   byTeam:Object.fromEntries(teams.map(t=>[t,summarize(all.filter(r=>r.team===t))])),
   byStyle:Object.fromEntries(styles.map(s=>[s,summarize(all.filter(r=>r.style===s))])),
   largestScoutDelays:all.filter(r=>r.delays.scout>0).sort((a,b)=>
    b.delays.scout-a.delays.scout).slice(0,15),
   examples:all.filter(r=>r.chosen!=="none").slice(0,20),
   limits:["Read-only locally instrumented online-game.js, untouched repository game file.",
    "Same hand/deck/actions/winner/HP/energy must match for baseline and audit.",
    "Affordability differences estimate delay if no further spending; not guaranteed actual missed opportunity.",
    "Train seeds only; no independent holdout, card values or network changes."]};
  fs.writeFileSync(path.join(out,"summary.json"),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(out,"matches.json"),JSON.stringify(rows,null,2));
  console.log("EARLY SPEND AUDIT SUMMARY",JSON.stringify(report));
 }finally{if(browser)await browser.close();await new Promise(ok=>srv.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
