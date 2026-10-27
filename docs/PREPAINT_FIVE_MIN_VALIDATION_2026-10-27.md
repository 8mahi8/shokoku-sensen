# 受信済み戦況の描画前反映｜実Firebase5分検証とCI安定化（2026-10-27夜）

## 対象・公開版の保護
- ゲームコード [b949e8b](https://github.com/8mahi8/shokoku-sensen/commit/b949e8b2e739d97007eed75d3840130b91e8b151)：ゲストの受信済み最新状態を描画前に一回適用。二重適用・旧roundキャンセル防止を含む。
- QA環境のみ [6d318d5](https://github.com/8mahi8/shokoku-sensen/commit/6d318d57e4c3e82931626b1c0b8aeea1e9e0cfa0)：Playwright 1.56.1相当の公式コンテナを使用し、CIのaptミラー停滞を回避。
- 開発ブランチ／Draft PR #22のみ。学校Google Sites公開版、`main`、本番Firebaseルールには変更なし。

## 実Firebase BOT vs BOT 全試合結果
[run #40509005551](https://github.com/8mahi8/shokoku-sensen/actions/runs/40509005551) SUCCESS、`bot-vs-bot-results.json`とホスト・ゲスト録画を確認。
- 経過ゲーム時間300秒、実壁時計310.9秒、正常に時間切れ決着。
- 青ホストBOT34手／赤ゲストBOT33手、同時最大15体。実Firebase sequence最終2288。
- ゲスト最大rAF間隔473ms、500ms以上0、JS page error0、ホストのpublish再送0、REST照合を要する長いSDK停滞0。
- ゲスト最大描画関連実行時間39ms、1フレームあたり新規キャッシュ最大2。
- WebKitゲストは5秒サンプルの平均約30 frame / 5秒（約6FPS）、ホスト側約274 frame / 5秒（約55FPS）。**実iPadではない**。再現するラグは残り、表示滑らかさ合格ではない。
- ゲスト録画から時刻8/28/55/85/115/145/175/205/235/265/292/310秒の12場面を抽出し目視。確認した範囲で戦闘/カード/HUDが継続表示。全フレーム目視ではない。

## 画面・機能
- [smoke #40509005480](https://github.com/8mahi8/shokoku-sensen/actions/runs/40509005480) SUCCESS：最新snapshotを描画前に適用、二重適用防止、旧round callback隔離の合成回帰。
- [guest lab #40509005558](https://github.com/8mahi8/shokoku-sensen/actions/runs/40509005558) SUCCESS：WebKit/Chromium。
- [iPad UI #40509005734](https://github.com/8mahi8/shokoku-sensen/actions/runs/40509005734) SUCCESS。Sitesコンパクト画面とゲスト実画面スクリーンショットを目視、大きな表示崩れなし。
- [キャラクター画像 #40509005568](https://github.com/8mahi8/shokoku-sensen/actions/runs/40509005568) SUCCESS。
- [WebKit HUD #40509005913](https://github.com/8mahi8/shokoku-sensen/actions/runs/40509005913) 再実行でSUCCESS。

## 実Firebase2ブラウザ・戦闘映像
- 旧head [#40509005592](https://github.com/8mahi8/shokoku-sensen/actions/runs/40509005592) の録画ありはaptミラー取得時間が12分タイムアウトを圧迫し、ゲームのテストに到達せずcancelled。これはゲームの失敗を示さない。
- ブラウザ映像レビュー旧run #40509005769は最初のWebKit標準場面で`page.evaluate: Target crashed`、原因は未確定。環境差を切り分けるためテスト用の公式コンテナへ移行。
- **コンテナ化後** [実Firebase2ブラウザ #40511464388](https://github.com/8mahi8/shokoku-sensen/actions/runs/40511464388) の`browser-live(yes,no)`（録画ありChromiumホスト／WebKitゲスト）はSUCCESS。通常14体場面のゲスト323ms hitch時`SDK seq=16/applied seq=16`、混戦20体場面232ms hitch時`SDK seq=25/applied seq=25`。古い描画前反映の未適用が減った**整合的観測**であり、別runとの厳密A/Bではない。
- **コンテナ化後** [戦闘描画 #40511464414](https://github.com/8mahi8/shokoku-sensen/actions/runs/40511464414) SUCCESS。22シーン、Chromiumコンパクト表示で60FPS前後、WebKit iPad条件で約8〜12FPS、Canvas非描画対照約14〜23FPS。ゲーム判定に影響しないQA上の切り分けであり、学校実iPadの数値ではない。
- 本記録執筆時点で新コンテナの録画なし／同一WebKit2ブラウザ条件は未完了。**全部合格と書かない。**

## Google Driveの学校試遊候補（本番未反映）
- TXT: https://drive.google.com/file/d/1CPLfIRMLtaaAcGXIKiFUc9WejD9-1-dw/view
- HTML: https://drive.google.com/file/d/1AEHvVElNLLUbnDGEOH1K7EVDow6pAQue/view
- ともに332,162 bytes、Drive metadata読戻し確認。ローカル原本`git hash-object=b6be2f10d8a757c79b26521cf73503a0455048d9`、最新開発ブランチの`online-ipad.html` blob SHAと一致。旧ファイルは上書きしていない。

## 次工程
1. コンテナ化したリアルFirebase2ブラウザの残り2条件の結果確認（進行中/queuedを合格としない）。
2. 学校iPad Safari/Google Sitesのホスト・ゲスト交代実機比較が採否の最終条件。
3. 頭打ちのheadless WebKit rAF FPSと受信済みスナップショット反映鮮度を混同せず、根拠あるボトルネックのみ次回修正。

参考: [MDN requestAnimationFrame](https://developer.mozilla.org/ja/docs/Web/API/Window/requestAnimationFrame)、[Firebase RTDB event listener](https://firebase.google.com/docs/database/web/read-and-write)、[Playwright Docker](https://playwright.dev/docs/docker)。
