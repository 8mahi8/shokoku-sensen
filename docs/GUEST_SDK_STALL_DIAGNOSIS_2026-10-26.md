# ゲストSDK受信停滞の実戦調査（2026-10-26）

## 対象と優先順位
学校iPad Safariで、ゲスト側だけが突発的に全画面カクつき、召喚操作まで遅くなる実機報告。通常時は十分快適なため、無差別な画質低下、Firebase更新間隔の変更、ゲーム全体の書き直しは行わない。

- 開発ブランチ: `perf/online-guest-snapshot-diagnostics-20261020`、PR #22はDraft。
- 学校Google Sites版（HTML直接埋込）、main、本番Firebaseルール・保存データは触らない。
- 学校実機とLinux headless WebKitは別環境。

## 既存の実Firebase BOT対BOTの実行結果

[成功run #40339084192](https://github.com/8mahi8/shokoku-sensen/actions/runs/40339084192) / 対象commit `93a6940a755e86c0ad3535088ba9b817b7db83cf`。
`online-bot-vs-bot-real-match` artifactの`bot-vs-bot-results.json`を全25サンプル点検した。

- 壁時計138.3秒、試合内127.3秒で首都破壊、実BOT同士の合法的対戦、実Firebase経由。
- 青BOT13使用、赤BOT11送信、同時最多11体、未処理JSエラー0、テストルーム削除確認。
- WebKitゲスト最大フレーム間隔345ms、500ms以上の停止0件。ただし計測は5秒単位のフレーム窓で、学校iPadの実測ではない。
- **壁時計15.6秒**: ホスト最終送信試行seq=120、ゲストSDK最終受信seq=98、ゲスト適用seq=98。SDK受信から2,898ms、画面適用から2,895ms。直前の5秒窓でゲスト描画84フレーム、最大フレーム間隔82ms、描画JS最大10ms。
- **壁時計20.8秒**: ホストseq=156、ゲストSDK受信seq=156、画面適用seq=155。SDKイベント経過1ms、適用経過118ms。受信は自然復帰している。
- 他の24サンプルの適用経過はすべて205ms以下（15.6秒の外れ値を除く）。

## 現時点の解釈

今回の約3秒の更新停滞中、ゲスト描画フレームは続き、`eventSeq`と`appliedSeq`が同じ98で止まっている。したがってこの**観測事象**では、`game.apply`やCanvasだけに原因を帰す根拠は弱く、**ゲストへのSDKイベント到達前の経路**が優先調査対象。

ただしホストのseq=120は「送信を試みた番号」であり、**Firebaseサーバーがseq=120を保存済みだった証拠ではない**。可能性として、ホストの書込み/ACK停滞、ネットワーク、Firebase RTDB内部の配送、ゲストSDK購読の停止が残る。学校での全画面・入力停止が同原因ともまだ断定できない。

既存の`online-net.js`は、状態適用から3,500ms経過後にREST回復を試みる。今回は2,895ms地点を観測しただけなので、その瞬間に回復策が動いていなかった可能性があるが、経過途中の真のピークは5秒ごとの記録では特定不能。

## 次の実戦計測（QAコードのみ）

[追加commit dfac671c](https://github.com/8mahi8/shokoku-sensen/commit/dfac671ce385163af62094187ebe2b8f40759424)で`tests/online-bot-vs-bot.cjs`へ限定計測を追加。

- 実際のBOT対BOT中に約950msごとにホストとゲストの**ローカル診断値だけ**を読み取る。
- ゲストSDKイベントが1,250ms以上途切れ、かつホスト送信試行seqが4以上先行しているときのみ、Firebase RESTの最新`state.seq`を一度取得。通信が停滞している場合の計測への影響を抑えるため、1,900ms以上の間隔と2,500msのGETタイムアウトを設定。
- `hostSeq` / `hostAckMs` / `hostRetries` / `guestSdkSeq` / `guestAppliedSeq` / `restSeq`、それぞれの経過時間を`stallProbes`としてGitHub ActionsのQA artifactにのみ保存。**ゲームのFirebaseへ診断値を書き込まない**。ルーム番号も記録しない。
- `restSeq`がゲスト受信より先行する場合はSDK配送側が候補、`restSeq`も遅い場合はホスト書込み/RTDB経路が候補、RESTが失敗する場合はサーバー到達性の調査を優先。
- 自然発生しなければ`stallProbes=0`という結果を残し、人工的な負荷やSDK妨害を「実戦再現」と扱わない。

## 修正に進む判断基準

実戦のREST照合で受信経路の停滞が確認でき、RESTがSDKより先に最新stateを取得できる場合のみ、**ゲスト側の回復開始閾値を限定的に早める**などをA/Bで検証する。RESTも古い/失敗するなら読取頻度を上げても解決にならない。変更前後のBOT通し対戦、ゲスト操作・再戦・Firebase cleanupを検査してから学校向け候補とする。

この検証で突発的全画面停止や入力不能そのものが再現されたことにはならない。学校Google Sites用HTMLの差し替えは、本人の許可まで行わない。
