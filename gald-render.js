/* Gald B-04 runtime bridge for Shokoku Sensen III.
 * Generates and caches 66 transparent sprite frames from the source 2D rig.
 * All visual: combat mechanics, unit hitboxes, and BOT behavior stay untouched.
 * Classic guardian remains in use until this cache is ready.
 */
(()=>{
'use strict';
const FRAME_W=330,FRAME_H=372,COLS=8;
const ORDER=[['idle',8],['walk',18],['punch',22],['hit',8],['death',10]];
const INDEX={};let index=0;
for(const [name,n] of ORDER){INDEX[name]={first:index,count:n};index+=n;}
const START=index;
let atlas=null,loading=false,failed=false;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function activeFrame(u,t){
 let state='idle',f=0;
 if(Number.isFinite(u.deathProgress)&&u.deathProgress>0){state='death';f=clamp(u.deathProgress,0,.999);}
 else if(Number.isFinite(u.hitAt)&&t-u.hitAt>=0&&t-u.hitAt<.30){state='hit';f=(t-u.hitAt)/.30;}
 else if((u.attackAnim||0)>0){state='punch';f=1-u.attackAnim/(u.attackAnimMax||.98);}
 else if(u.walking){state='walk';f=((u.walkPhase||0)/(2*Math.PI)%1+1)%1;}
 else{state='idle';f=((t+(u.uid||0)*.13)/3.8%1+1)%1;}
 const item=INDEX[state];
 return item.first+Math.min(item.count-1,Math.floor(clamp(f,0,.999)*item.count));
}
function drawUnit(g,u,t){
 if(!atlas)return false;
 const ix=activeFrame(u,t),width=201,height=227;
 const anchorX=105/330*width,anchorY=292.8/372*height;
 const death=clamp(u.deathProgress||0,0,1);
 const spawn=Number.isFinite(u.spawnAt)?clamp((t-u.spawnAt)/(u.spawnDuration||1),0,1):1;
 const appear=1-Math.pow(1-spawn,3),size=.8+.2*appear,dir=u.team===1?1:-1;
 g.save();g.translate(u.x,u.y);
 g.fillStyle=dir>0?'#5bdbed2e':'#f187962e';
 g.beginPath();g.ellipse(0,2,48,10,0,0,Math.PI*2);g.fill();
 g.globalAlpha=clamp((.4+.6*appear)*(1-death*.8),0,1);
 g.scale(dir*size,size);
 if(dir<0&&'filter' in g)g.filter='hue-rotate(160deg) saturate(1.25)';
 g.drawImage(atlas,(ix%COLS)*FRAME_W,Math.floor(ix/COLS)*FRAME_H,FRAME_W,FRAME_H,
   -anchorX,-anchorY,width,height);
 g.restore();
 if(death===0&&u.hp<u.max){
  const ratio=clamp(u.hp/u.max,0,1),x=u.x-32,y=u.y-187;
  g.fillStyle='#132b31';g.fillRect(x-1,y-1,66,9);
  g.fillStyle=dir>0?'#7ddcf6':'#ff879b';g.fillRect(x,y,64*ratio,7);
 }
 return true;
}
function drawPortrait(g,w,h,team){
 if(!atlas)return false;
 const height=Math.min(w*.92,h*1.20),width=height*FRAME_W/FRAME_H,dir=team===1?1:-1;
 const anchorX=105/FRAME_W*width,anchorY=292.8/FRAME_H*height;
 g.save();g.translate(w*.53,h*.94);g.scale(dir,1);
 if(dir<0&&'filter' in g)g.filter='hue-rotate(160deg) saturate(1.25)';
 g.drawImage(atlas,0,0,FRAME_W,FRAME_H,-anchorX,-anchorY,width,height);
 g.restore();return true;
}
async function makeImage(svgText){
 const objectUrl=URL.createObjectURL(new Blob([svgText],{type:'image/svg+xml;charset=utf-8'}));
 const img=new Image();img.src=objectUrl;
 try{await img.decode();return img;}
 finally{URL.revokeObjectURL(objectUrl);}
}
async function load(){
 if(loading||atlas||failed)return;loading=true;
 const frame=document.createElement('iframe');
 frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');
 frame.style.cssText='display:none!important';
 const ready=()=>new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('Gald source load timeout')),12000);
  frame.onload=()=>{clearTimeout(timeout);resolve();};
  frame.onerror=()=>{clearTimeout(timeout);reject(new Error('Gald source unavailable'));};
 });
 try{
  const arrived=ready();frame.src='./gald-source.html?v=1';document.body.append(frame);
  await arrived;
  const doc=frame.contentDocument,api=frame.contentWindow.GOLEM_TEST;
  if(!doc||!api)throw Error('Gald source rig API unavailable');
  api.state.playing=false;api.state.zoom=1;api.state.design='bastion';api.state.travel=0;
  const defs=doc.getElementById('arena').querySelector('defs').outerHTML;
  const header='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="330" height="372" viewBox="240 0 550 620">';
  const out=document.createElement('canvas');
  out.width=COLS*FRAME_W;out.height=Math.ceil(START/COLS)*FRAME_H;
  const ctx=out.getContext('2d',{alpha:true});if(!ctx)throw Error('No sprite-cache canvas');
  let i=0;
  for(const [name,n]of ORDER){
   for(let k=0;k<n;k++){
    api.state.mode=name;api.state.phase=k/n;api.render();
    const img=await makeImage(header+defs+doc.getElementById('character').outerHTML+'</svg>');
    ctx.drawImage(img,(i%COLS)*FRAME_W,Math.floor(i/COLS)*FRAME_H,FRAME_W,FRAME_H);
    i++;
   }
  }
  atlas=out;window.dispatchEvent(new Event('gald-ready'));
 }catch(err){failed=true;console.warn('Gald art: using fallback guardian',err);}
 finally{frame.remove();loading=false;}
}
window.GaldArt={drawUnit,drawPortrait,isReady:()=>!!atlas,getFrameIndex:activeFrame,ensureLoaded:load,version:'B-04 66-frame cached'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();