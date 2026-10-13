#!/usr/bin/env python3
"""Export an approved procedural SVG rig as a transparent sprite atlas.

Install: pip install playwright pillow; python -m playwright install chromium
Run at repo root: python tools/characters/export_atlas.py --spec characters/gald/character.json --output /tmp/gald-atlas
This is an OFFLINE QA/export utility. It does not change the live Gald lazy renderer.
"""
from __future__ import annotations
import argparse
import asyncio
import json
import math
import shutil
from io import BytesIO
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright


def manifest(path: Path) -> dict:
    spec = json.loads(path.read_text(encoding="utf-8"))
    atlas = spec["atlas"]
    if spec["facing"] not in ("right", "left") or not spec["test_api"]:
        raise ValueError("Missing source orientation or test API")
    if any(atlas[key] < 1 for key in ("frame_width", "frame_height", "columns")):
        raise ValueError("Invalid frame size or column count")
    if not atlas["states"] or any(row["frames"] < 2 for row in atlas["states"]):
        raise ValueError("All animation states need two or more frames")
    return spec


async def export(spec: dict, root: Path, output: Path,
                 limit: int | None = None, chromium: str | None = None):
    cfg = spec["atlas"]
    source = root / spec["source_file"]
    if not source.is_file():
        raise FileNotFoundError(source)
    if limit is not None and limit < 1:
        raise ValueError("--limit must be >= 1")
    output.mkdir(parents=True, exist_ok=True)
    cell = (cfg["frame_width"], cfg["frame_height"])
    viewport = cfg["viewport"]
    frames = []
    errors = []
    async with async_playwright() as p:
        browser_path = chromium or shutil.which("chromium") or shutil.which("chromium-browser")
        launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
        if browser_path:
            launch["executable_path"] = browser_path
        browser = await p.chromium.launch(**launch)
        try:
            page = await browser.new_page(viewport=viewport, device_scale_factor=1)
            page.on("pageerror", lambda e: errors.append(str(e)))
            await page.set_content(source.read_text(encoding="utf-8"), wait_until="load")
            await page.evaluate("""api => {
              const rig = window[api];
              if (!rig || !rig.render) throw new Error('Missing character rig API '+api);
              rig.state.playing = false;
              const svg = document.getElementById('arena');
              if (!svg || !document.getElementById('character')) throw new Error('Missing character SVG');
              for (const node of Array.from(svg.children))
                if (node.tagName.toLowerCase() !== 'defs' && node.id !== 'character')
                  node.style.display = 'none';
              svg.style.cssText='position:fixed;left:0;top:0;width:920px;height:620px';
              document.body.style.cssText='margin:0;background:transparent';
            }""", spec["test_api"])
            await page.add_style_tag(content="""html,body,.stage,.wrap,.layout{
              background:transparent!important;background-image:none!important;
              box-shadow:none!important;border:0!important
            }body::before,.stage::after{display:none!important}""")
            for row in cfg["states"]:
                for k in range(row["frames"]):
                    await page.evaluate("""([api, name, phase, variant])=>{
                      const rig=window[api];
                      rig.state.mode=name;rig.state.phase=phase;
                      rig.state.design=variant;rig.state.zoom=1;
                      rig.state.playing=false;rig.render();
                    }""", [spec["test_api"], row["name"], k / row["frames"], spec["design_variant"]])
                    png = await page.screenshot(clip=cfg["crop"], omit_background=True,
                                                animations="disabled")
                    frame = Image.open(BytesIO(png)).convert("RGBA").resize(cell, Image.Resampling.LANCZOS)
                    if frame.getbbox() is None:
                        raise ValueError("Blank sprite frame: "+row["name"]+":"+str(k))
                    frames.append(frame)
                    if limit is not None and len(frames) >= limit:
                        break
                if limit is not None and len(frames) >= limit:
                    break
            if errors:
                raise RuntimeError("Browser errors: "+"; ".join(errors))
        finally:
            await browser.close()
    cols = cfg["columns"]
    image = Image.new("RGBA", (cols*cell[0], math.ceil(len(frames)/cols)*cell[1]), (0,0,0,0))
    for i, frame in enumerate(frames):
        image.alpha_composite(frame, ((i % cols)*cell[0], (i // cols)*cell[1]))
    name = spec["id"]+"-atlas"
    image.save(output/(name+".webp"),format="WEBP",quality=85,method=5)
    image.save(output/(name+".png"),format="PNG",optimize=True)
    expected = sum(row["frames"] for row in cfg["states"])
    meta = {"id": spec["id"], "frame_width": cell[0], "frame_height": cell[1],
            "columns": cols, "states": cfg["states"], "anchor": cfg["anchor"],
            "expected_frames": expected, "generated_frames": len(frames),
            "complete": len(frames)==expected}
    (output/(name+".json")).write_text(json.dumps(meta,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Exported",len(frames),"/",expected,"frames to",output)
    if len(frames)<expected: print("QA ONLY: partial atlas cannot be shipped")


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec",required=True,type=Path)
    parser.add_argument("--root",type=Path,default=Path.cwd())
    parser.add_argument("--output",type=Path,default=Path("/tmp/character-atlas"))
    parser.add_argument("--limit",type=int,default=None)
    parser.add_argument("--chromium",default=None)
    args=parser.parse_args()
    root=args.root.resolve()
    asyncio.run(export(manifest((root/args.spec).resolve()),root,args.output.resolve(),
                       args.limit,args.chromium))
