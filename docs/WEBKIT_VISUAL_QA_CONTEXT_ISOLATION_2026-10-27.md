# WebKit battle visual QA process isolation（2026-10-27）

## 証拠
- [Visual QA #40516092654](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092654): 現行開発コードは最初のWebKitプロファイルで標準14体、混戦18/20体、軽量10体、大型10体の5場面は移動/アート/描画/エラーなしの実測を出力。次のスペル戦の最初の`page.screenshot`中に`Target crashed`。`pageerror`からのゲームJS例外とは異なる。
- 以前の [#40511464414](https://github.com/8mahi8/shokoku-sensen/actions/runs/40511464414) は同じ22シーンを成功。CI WebKit WebProcessが毎回必ず落ちるわけではないが、再現が複数回ある。
- もとの実装は同一browser/contextで**新しいpageだけ**作り替え、高DPRのCanvas戦闘とPNG/動画撮影を続けていた。解放しきれないbrowser側のCanvas/WebKitプロセスメモリ増加が仮説であり未計測。

## 最小QA構成変更
- **各シーンを別ブラウザプロセス＋contextで実行**し、画面・ユニット戦闘処理・画像・計測を終了したらcontext/browserを閉じて次へ進む。
- QAは既存の8/10/14/18/20体、タンク/ゴーレム、スペル、混戦、Chromium 900x520、録画有無、非描画対照、結果数・回帰assertを全部保持。場面開始ログのみ追加。
- 予想より時間がかかる/別のクラッシュが起きる可能性あり。次のCIが完走するまで成功とは扱わない。
- **製品ソース、Google Sites本番版、`main`、Firebase、既存Driveファイルは変更しない。** 将来のDrive保存は本人の明示指示時のみ。
