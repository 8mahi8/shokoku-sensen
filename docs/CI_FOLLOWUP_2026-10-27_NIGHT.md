# 2026-10-27 夜｜残存CIの再確認と検証継続

対象: 開発ブランチ `perf/online-guest-snapshot-diagnostics-20261020` / Draft PR #22。学校Google Sites版・main・Firebase本番設定は未変更。

## 実施したこと
- 前回コードコミット `f398a4a6` に対するCIの未完了を再照会。
- WebKit HUD [run 40498675038](https://github.com/8mahi8/shokoku-sensen/actions/runs/40498675038) は再試行（attempt 2）で **SUCCESS**。
- 2ブラウザ実Firebase [run 40498674989](https://github.com/8mahi8/shokoku-sensen/actions/runs/40498674989) は、`browser-live (yes, no)` と `browser-live (no, yes)` が **SUCCESS**、`browser-live (no, no)` は **cancelled**。workflow全体をSUCCESSと呼ばない。
- iPad UI [run 40498675030](https://github.com/8mahi8/shokoku-sensen/actions/runs/40498675030) は再試行（attempt 2）も **cancelled**。
- 未完了の2ジョブだけ `rerun_workflow_job` を依頼（browser-live job `122170521446`、UI job `122175025600`）。APIはいずれも success=true を返した。**再実行の完走結果は未確認**。

## 原因調査の優先順
1. 再実行ジョブの結果とキャンセル理由を確認する。既に成功したジョブは再実行しない。
2. [既存の性能証拠台帳](PERFORMANCE_EVIDENCE.md)にあるCanvas/HUD無効化・WebKit同士の役割比較を再実験せず再利用する。
3. 既存の実Firebase映像・rAF frame gap・SDK受信停止・REST回復ログを時刻合わせし、描画停止と通信停止を区別する。
4. 再現できたボトルネックだけ最小修正し、smoke・実Firebase・映像レビューを経て採否を決める。

参考: [web.dev INP](https://web.dev/articles/optimize-inp)、[Firebase RTDB optimize usage](https://firebase.google.com/docs/database/usage/optimize)。一般論だけで原因を断定しない。

学校iPad Safari / Google Sitesの軽いカクつきの根治は**未確認**。