# V16 WebKit guest performance and distribution checks (2026-10-19)

## Scope
Development branch only. Public main and live GitHub Pages remain untouched.
Goal: differentiate remote state progression, actual Canvas paint frequency, Safari-style reception, and verified air balance.

## Confirmed browser tests
- V16 six-browser-configuration suite succeeded on commit 9b6f097 / run 39146709826: Chromium tablet and compact external JS, WebKit tablet/compact external JS, plus WebKit iPad standalone and Google Sites HTML bundles.
- Dense test: 130 units, burst of 120 incoming packets and continuing sequence through 149. Verified coalescing, latest snapshot, no page errors, cached sprite interpolation, air hits and barrage damage, and stale old-round callbacks after rematch.
- Baseline headless WebKit was approximately 13-21 Canvas paints/second while Chromium was 50-60. These values are Linux headless browser benchmarks, **not physical school iPad FPS**.
- Real Firebase test run 39146818918 succeeded with Chromium host + WebKit guest using the full inline online-ipad.html. Verified room, start, guest auto-BOT, manual override, host-authoritative state and actual guest __onlineSeq applied; test room was cleaned up.

## Measured alternative: 0.8x raster tier
An emergency tablet-guest DPR 0.8 mode triggered during dense low-FPS scenes. V16 run 39147269929 confirmed guestDprCap=0.8 and actual view DPR=0.8 in WebKit. Frame rates still hovered near 13fps for iPad and embedded versions, approximately unchanged from baseline, so **rejected**: a visible image-quality tradeoff without reliable measurable benefit. Reverted.

## Low-risk rendering experiment
Followed MDN Canvas optimization advice to use an opaque 2D context when every frame paints the entire background. The battle canvas uses getContext('2d',{alpha:false}); cached sprite canvases remain transparent. This is a rendering-only optimization: network, game rules, physics, target selection, damage, and bot policies do not change. Effect must be assessed through CI and/or physical Safari observations; do not claim a performance gain before measurement.

## Acceptance gaps
1. Physical iPad Safari + PC match with heavy troops, spells, manual guest actions and rematch.
2. Actual Google Sites embedding, which can have different policy and frame constraints from localhost WebKit.
3. Stable FPS and responsiveness over longer multi-minute sessions, not solely short synthetic bursts.

Reference: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
