#!/usr/bin/env python3
"""Rig QA for browser errors, representative poses, phone layout and planted foot position.

Install: pip install playwright pillow; python -m playwright install chromium.
Run at repo root: python tools/characters/qa_rig.py --spec characters/gald/character.json --output /tmp/gald-qa
PASS does not certify artistic quality; visually judge the review sheet and animation.
"""
from __future__ import annotations
import argparse
import json
import shutil
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

POSES=[("idle",.15),("walk",.19),("walk",.51),("punch",.29),
       ("punch",.43),("punch",.53),("punch",.68),("hit",.20),("death",.70)]

def run(spec:dict,source:Path,output:Path,chromium:str|None=None):
    output.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        launch={"headless":True,"args":["--no-sandbox","--disable-dev-shm-usage"]}
        browser_path=chromium or shutil.which("chromium") or shutil.which("chromium-browser")
        if browser_path:launch["executable_path"]=browser_path
        browser=p.chromium.launch(**launch)
        try:
            page=browser.new_page(viewport={"width":1440,"height":900},device_scale_factor=1)
            errors=[]
            page.on("pageerror",lambda e:errors.append(str(e)))
            page.set_content(source.read_text(encoding="utf-8"),wait_until="load")
            images=[]
            for mode,t in POSES:
                page.evaluate("""([api,mode,phase,variant])=>{
                  const rig=window[api];if(!rig)throw Error('Missing rig API');
                  rig.state.mode=mode;rig.state.phase=phase;
                  rig.state.playing=false;rig.state.zoom=1;rig.state.design=variant;rig.render();
                }""",[spec["test_api"],mode,t,spec["design_variant"]])
                img=Image.open(BytesIO(page.locator("#arena").screenshot())).convert("RGB")
                img.thumbnail((455,305))
                images.append((mode+" "+str(t),img))
            threshold=spec.get("qa",{}).get("grounded_punch_max_screen_drift_px")
            if threshold is not None:
                distance=page.evaluate("""apiName=>{
                  const rig=window[apiName],results=[];
                  for(const phase of [.05,.18,.32,.43,.51,.57,.68,.83]){
                    rig.state.mode='punch';rig.state.playing=false;
                    rig.state.phase=phase;rig.render();
                    const root=document.getElementById('character').getAttribute('transform');
                    const a=root.match(/translate\\(([-.\\d]+) ([-.\\d]+)\\) scale\\(([-.\\d]+)\\)/);
                    if(!a)throw Error('Body transform changed; update QA');
                    const [x,y,s]=a.slice(1).map(Number),points=[];
                    for(const id of ['frontFoot','backFoot']){
                      const b=document.getElementById(id).getAttribute('transform');
                      const m=b.match(/translate\\(([-.\\d]+) ([-.\\d]+)\\)/);
                      if(!m)throw Error('Foot transform changed: '+id);
                      points.push([x+s*Number(m[1]),y+s*Number(m[2])]);
                    }
                    results.push(points);
                  }
                  return Math.max(...results.flatMap(row=>row.flatMap((point,i)=>
                    point.map((v,j)=>Math.abs(v-results[0][i][j])))));
                }""",spec["test_api"])
                if distance>threshold:
                    raise AssertionError(f"Planted feet drift {distance} pixels (> {threshold})")
                print("Planted foot drift:",round(distance,4),"px")
            page.set_viewport_size({"width":390,"height":850})
            if page.evaluate("document.body.scrollWidth")>400:
                raise AssertionError("Mobile UI has horizontal overflow")
            if errors:raise RuntimeError("Browser errors: "+"; ".join(errors))
            sheet=Image.new("RGB",(3*480,3*350),"#13252c")
            painter=ImageDraw.Draw(sheet)
            for i,(name,img) in enumerate(images):
                x=i%3*480;y=i//3*350
                sheet.paste(img,(x+(480-img.width)//2,y))
                painter.text((x+15,y+319),name,fill="white")
            sheet.save(output/"pose-review.jpg",quality=90)
            print("PASS: "+str(len(POSES))+" poses, planted-foot check when applicable, phone viewport, JS errors")
            print("REVIEW BY EYE:",output/"pose-review.jpg")
        finally:
            browser.close()

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec",required=True,type=Path)
    parser.add_argument("--root",type=Path,default=Path.cwd())
    parser.add_argument("--output",type=Path,default=Path("/tmp/character-qa"))
    parser.add_argument("--chromium",default=None)
    args=parser.parse_args()
    root=args.root.resolve()
    spec=json.loads((root/args.spec).read_text(encoding="utf-8"))
    run(spec,root/spec["source_file"],args.output.resolve(),args.chromium)
