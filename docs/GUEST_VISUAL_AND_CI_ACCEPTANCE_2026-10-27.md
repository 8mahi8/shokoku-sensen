# 小国戦線III｜受信済み戦況の描画前反映＆QA安定化 最終検証（2026-10-27）
対象：GitHub開発ブランチ `perf/online-guest-snapshot-diagnostics-20261020` / Draft PR #22（本番未反映）。

## 実装した内容
- [b949e8b](https://github.com/8mahi8/shokoku-sensen/commit/b949e8b2e739d97007eed75d3840130b91e8b151): ゲストの最新受信snapshotをゲーム描画rAF直前に適用。再戦・部屋の古いcallbackの隔離、二重反映防止。host tick / Firebase送信ペースや戦闘判定の変更なし。
- [c2ac17f](https://github.com/8mahi8/shokoku-sensen/commit/c2ac17f63882d5a078d6781f3515cdcdc37a83e1): 短いフレームヒッチをネットワーク状態に結び付けるため、`flushGuestBeforePaint()`の後にゲスト停止診断を採取。CI独自deadline各ポーリングを最大8秒に抑制し、ブラウザ操作・撮影に上限と場面開始ログを追加。ネットワークQAの録画なしは重複撮影を削り、dense代表シーンを保持。
- [6d318d5](https://github.com/8mahi8/shokoku-sensen/commit/6d318d57e4c3e82931626b1c0b8aeea1e9e0cfa0): GitHub ActionsをPlaywright公式ブラウザ入りコンテナへ移行し、Ubuntu aptの長時間DLによるキャンセルを回避。
- [e088380](https://github.com/8mahi8/shokoku-sensen/commit/e0883804c6502b802b466c28fab545731c5252d4): 独立のビジュアルQAをシーンごとにWebKit browser/context分離。**22場面全てを残したまま**繰り返し発生したWebProcessクラッシュに対処。ゲームコードは変更していない。

## 最新の完走証拠
| 項目 | CI | 結果 |
| --- | --- | --- |
| Node smoke / ゲストprepaint最新seq・旧round防御 / JS構文・単体HTML整合 | [#40516092610](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092610) | SUCCESS |
| 実Firebase2ブラウザ3条件 (Chromium/WebKit録画あり・なし、WebKit両役) | [#40516092601](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092601) | **3/3 SUCCESS** |
| 実Firebase BOT双方のフルマッチ | [#40516092866](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092866) | SUCCESS |
| WebKit/Chromiumの合法な戦闘22場面（動画含む） | [#40517254705](https://github.com/8mahi8/shokoku-sensen/actions/runs/40517254705) | **22/22 SUCCESS** |
| 学校iPadサイズUI/Sites小型画面 | [#40516092678](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092678) | SUCCESS |
| WebKit HUD差分検証 | [#40516092686](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092686) | SUCCESS |
| 画像キャッシュ・キャラの輪郭 | [#40516092677](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092677) | SUCCESS |

### 長時間実戦の実データ
[run #40516092866](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092866)の`BOT VS BOT RESULT`に基づく。
- 戦闘ゲーム時間300秒、壁時計310.9秒、時間切れで正常決着。
- 青側BOT34手、赤ゲストBOT34手、最大同時16体。最終受信seq2314。
- ゲストrAF最大gap325ms、500ms以上0。ゲストのCanvas実行時間最大33ms。キャッシュ新規生成最大2/フレーム。
- 最終スナップショットが古い状態だった最大経過324ms、SDK受信イベント最大332ms、REST早期回復プローブ0。JSエラー0、書込再試行0。
- 一時Firebase試験ルームの削除はログで確認。
- 実WebKitゲスト録画315秒から12/40/70/100/135/170/205/240/275/305秒の10枚を抽出して目視。戦場の進行、カード、HP、ユニット、HUDの継続を確認。録画全フレーム目視ではない。

### 戦闘映像の実際の確認
- [run #40517254705](https://github.com/8mahi8/shokoku-sensen/actions/runs/40517254705)の画像・動画artifact（69ファイル）からWebKit標準14体／20体／大型10体／スペル戦／録画あり大型／Chromiumコンパクト大型の6シーンを抜粋し画像で確認。特に部隊とカードの位置・描画、砦、HP、HUD、正常な戦闘UIを確認。
- 実戦の各場面で移動unit数が0ではなく、描画と計測が継続。キャラ画像/カード/UIの致命的崩れを抜粋画像上で認めず。未確認の全フレームの完全性は保証しない。
- 旧 [#40516092654](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092654) は5シーン後にWebKit screenshotで`Target crashed`。新しい専用browser/contextによる22シーンのrunでSUCCESSとなった。クラッシュが二度と発生しない保証ではない。

## 解釈・次の設計部分
- **オンライン同期回復/最新状態描画のコード保護:** 高い。3構成7ラウンド＋BOT300秒＋局所regressionは通過。
- **デバッグ環境の再現性:** 改善。録画なしjobのタイムアウトが解消、映像QA22シーン完走。
- **実iPad Safariでの滑らかさ:** 未確定。headless WebKitは同一エンジンのホストも4〜7FPSと遅い検証あり、端末実測を代替しない。新prepaintはsnapshotの鮮度改善でrAF FPSを速めない。無根拠なCanvas画質低下やFirebase送信周期変更は行わない。
- 次工程は、学校Google Sitesの同一HTMLをiPad2台でホスト/ゲストを入れ替えて**短いカクつきの再発と診断（180ms以上のgap、反映seq）**を確認し、その事実に対応する小さな性能修正を判断する。実機検証前も品質検討は可能だが、同じheadless WebKit性能実験の単純反復は避ける。

## 公開・保存
- 学校で稼働中のGoogle Sites版、GitHub `main`、Firebase本番ルールは**変更していない**。
- Google Driveへの新規保存・既存Drive上書きは**行っていない**。今後も本人が依頼した時だけ。
- CI成果物と開発資料はGitHubで共有。学校向け実際の貼り替えは本人の指示時だけ。
