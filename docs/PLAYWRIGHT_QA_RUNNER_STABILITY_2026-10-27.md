# Playwright QA runner stability — 2026-10-27

## Evidence
- [CI two-browser run #40509005592](https://github.com/8mahi8/shokoku-sensen/actions/runs/40509005592) `browser-live (yes, no)` was cancelled **before running test code**. Job log spent approximately 12 min downloading Ubuntu packages from `azure.archive.ubuntu.com`; `playwright install --with-deps chromium webkit` never completed before job cancellation. This is not a gameplay regression.
- [Battle visual run #40509005769](https://github.com/8mahi8/shokoku-sensen/actions/runs/40509005769) initially failed with `page.evaluate: Target crashed` in the first WebKit scene after two screenshots. Possible resource/environment problem, not yet proven; re-run was requested. Do not treat game art as broken without a reproducible crash.
- [Playwright official CI docs](https://playwright.dev/docs/ci) provide a version-pinned browser-and-dependencies Docker image for GitHub Actions; [Playwright Docker docs](https://playwright.dev/docs/docker) recommend matching Playwright package and image versions.

## Minimal workflow-only change
- Browser live and moving battle visual workflows now use `mcr.microsoft.com/playwright:v1.56.1-noble` (same version as pinned `playwright@1.56.1`).
- Eliminate per-job `npx playwright install --with-deps ...` and dependence on apt mirrors for those workflows. Preserve existing command, test matrix, timeout, artifacts and Firebase temporary-room cleanup.
- Docker uses `--ipc=host` to reduce Chromium shared-memory pressure, consistent with the Playwright container recommendation.
- NO game HTML/JS, Google Sites, `main`, Firebase security rules, balancing or network protocol changed.

## Acceptance
- Require live Firebase browser matrix (all three conditions) + visual review CI to finish successfully with this new workflow before treating the runner change as verified.
- Container Linux WebKit FPS is NOT physical iPad Safari FPS. Slow WebKit headless should remain recorded as a limitation rather than overclaiming optimization.
