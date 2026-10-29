// Time-over results UI regression: a stale guest clock (.93s) must NOT
// render 00:01 on the final result if the authoritative reason is time-up.
// A QA-only host hook simulates the condition: NOT a natural-match test.
// Host module instrumentation exists only in localhost HTTP response memory.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),http=require("node:http"),path=require("node:path");
const {chromium,webkit}=require("playwright");
const root=process.cwd(),BASE="https://mygame-df915-default-rtdb.firebaseio.com/shokokuRooms1v1";
const output=path.join(root,"qa-online-timeover-ui");fs.mkdirSync(output,{recursive:true});
const original=fs.readFileSync(path.join(root,"online-game.js"),"utf8");
const anchor="window.__shokokuQa={";
assert.equal(original.split(anchor).length,2,"one local QA anchor in host game");
const patched=original.replace(anchor,anchor+