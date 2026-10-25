# 小国戦線III｜再戦時のCanvas解像度・ゲスト描画間引き再評価（2026-10-25）

## 背景
- 先行作業で「低FPS時キャラ画像キャッシュ」の試合間リセットは追加したが、その他の自動軽量化設定は引き継いだままだった。
- `qualityMeasured`（自動DPRの品質判定済み）、`tabletDprCap`（ホスト側Canvas描画解像度の上限）、`guestLowPower`（ゲストの約30ms描画間引き）とFPS計測窓・`guestLastPaint`は、従来ページが開いている間ずっと保持された。初回の試合中にたまたま処理落ちしても、次の再戦で自動再評価されなかった。
- 実iPadで頻繁に起きているという証拠はまだない。コードの再戦状態管理として修正。

## 最小限の改修
- [修正コミット](https://github.com/8mahi8/shokoku-sensen/commit/9c816df75a8efebd58316e0fef14e0706571777a)。
- `resetWorld()`から新しい`resetAdaptiveCanvasForMatch()`を呼ぶ。`tabletDprCap=1.45`、`guestLowPower=false`、`qualityMeasured=false`、`guestLastPaint=0`、`qualityWindowStart=qualityFrames=0`へ戻す。既存の`resetCrowdedArtForMatch()`も保持。
- 前の試合でDPRが下がっていた場合だけ`fit()`でCanvasの実ピクセルを戻す。初回起動時の1pxダミー画面や、画質の変化がなかった試合で余計なCanvasリサイズをしない。
- 最初の約3.4秒の計測後、重い端末では**既存のルール**でCanvas解像度とゲストの描画頻度を再調整する。WebKitやiPadに恒久的な高画質を強要しない。一時的に画質を戻してから再評価するトレードオフを伴う。
- 見た目とrAF画面描画頻度だけ。ホスト30Hz計算、HP/攻撃/エネルギー、勝敗、Firebaseデータ・アクセスルール、カード操作、ルーム管理は変更しない。
- 修正対象：`online-game.js`とその単体HTML版`online-ipad.html`・`online-embed.html`・`guest-lab-game.html`。**学校Google Sitesの現行版や10/24にユーザーへ渡したGoogle Drive試験用ファイルは変更しない**。PR #22はDraft、main変更なし。

## 自動テスト
- `tests/online-smoke.cjs`に、**実際の初期化関数を抽出して実行**する決定的QAを追加。低品質状態→再戦リセット→通常画質に回復（必要な時だけCanvas resize）→2回目のリセットではresize不要→初期化時1px画面ではresizeしない、を検査。
- `tests/online-art-cache-visual.cjs`にWebKitの実ゲーム場面を2回開始するQAを追加。DPR=1、ゲスト低FPSモードON、品質判定済みを一度強制し、次の試合開始でDPR上限1.45・バックバッファ幅増大・ゲスト低FPSモードOFF・FPS測定リセットを画面内から直接検証。localhost QAのみで本番のネットワーク/Firebase設定は触れない。
- CI結果は完了後の具体的なGitHub Actions runにて確認。ヘッドレスWebKitは実学校iPadのFPS・見た目を保証しない。

## 次の判断
- 新しい学校貼り付け用コードはこの作業では作り直さない。以前渡した安定版で先に学校テストする。
- 実機で「再戦直後だけ重くなる」ことが確認されたら、高DPRへ戻す前の短時間リハーサルや高速判定など、必要最小限の調整を検討する。

## 実Firebaseの連続再戦でも両端の画質設定を検査
- [QA追加コミット `777123e`](https://github.com/8mahi8/shokoku-sensen/commit/777123ecf0673a7b74581a646bc9eb7502facdad)。`tests/online-browser-live.cjs`に、同じルームで6回再戦する各ラウンドのロビー直後、**Chromium/WebKitのホストとWebKitゲスト両方**の`phase="menu"`、`tabletDprCap===1.45`、`guestLowPower===false`、`qualityMeasured===false`、`qualityFrames===0`を検証するアサーションを追加。
- こちらはオフラインの`seedRealisticBattle`だけでなく、実Firebaseで`meta.status`→`resetForLobby()`→双方の画面更新を通っているかを確認する狙い。計測ログはCIへ出力するだけで、ユーザーの対戦履歴やFirebaseへ保存しない。
- [実Firebase2ブラウザCI #40198227022](https://github.com/8mahi8/shokoku-sensen/actions/runs/40198227022)を実行。完了結果を確認するまではこの新規チェックを合格扱いにしない。
