// Verify the actual bundled guest-BOT control callback without browser/Firebase.
// This is a lightweight contract test, not a claim of improved win rate.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const files=["online-game.js","online-ipad.html","online-embed.html"];
const blocks=[];
for(const file of files){
 const src=fs.readFileSync(file,"utf8");
 const start=src.indexOf("setBotControl:active=>{");
 const end=src.indexOf("},resetForLobby:()=>{",start);
 assert.ok(start>=0&&end>start,file+": BOT control callback exists");
 assert.equal(src.indexOf("setBotControl:active=>{",start+1),-1,
  file+": exactly one callback");
 const arrow=src.slice(start+"setBotControl:".length,end+1);
 blocks.push(arrow);
 const NET={isSolo:false};
 let builds=0,huds=0;
 const S={difficulty:"normal",selected:"scout",drag:{},pointer:{},
  botThink:9,botPrepDone:true};
 const control=new Function("S","NET","buildCards","updateHUD",
  "return ("+arrow+");")(S,NET,()=>builds++,()=>huds++);
 control(true);
 assert.equal(S.difficulty,"hard",file+": online guest BOT uses hard");
 assert.equal(S.botThink,2.5,file+": reset BOT decision timer");
 assert.equal(S.botPrepDone,false);
 assert.equal(S.selected,null);
 control(false);
 assert.equal(S.difficulty,"normal",file+": manual control resets online default");
 assert.equal(builds,2);
 assert.equal(huds,2);
 NET.isSolo=true;
 S.difficulty="easy";
 control(true);
 assert.equal(S.difficulty,"easy",file+": never override solo practice preference");
 S.difficulty="hard";
 control(false);
 assert.equal(S.difficulty,"hard",file+": solo hard remains selected");
}
assert.equal(blocks[1],blocks[0],"iPad inline BOT logic matches main");
assert.equal(blocks[2],blocks[0],"Google Sites inline BOT logic matches main");
console.log("PASS guest BOT existing hard preset, manual fallback, solo isolation, all 3 bundles");
