# 小国戦線III｜BOT探索 Worker 分離・安全境界 QA V8（2026-10-18）

## 結論

**ブラウザの描画を止めずに戦術探索の負荷を別スレッドへ移す基盤をQA環境で実証**。ただし今回は実ゲームの `tick(1/30)` ではなく、読み取り専用の軽量な戦術候補生成モデルを Worker 側で動かし、270msの計算負荷を与えた。実物の20秒先・二手探索エンジンの Worker 移植、端末Safariでの試験、勝率のA/B比較は**まだ行っていない**。

**main、オンライン通信、ゲーム本体、公開iPad HTMLは変更していない**。すべて `develop` の `tests/` とQAワークフローに隔離。

## ファイル

- `tests/online-bot-worker-prototype.js`：描画・DOM・Firebase・真の戦闘状態・敵の非公開カードへの参照がない Worker 専用の役割型評価モデル。実際の戦闘を進めるものではない。渡された合法初手候補を現在の公開戦況の近似スコアでソートする。
- `tests/online-bot-worker-bridge.inc.js`：現在の手札・自軍エネルギー・所有砦・見えている部隊から簡素な送信用スナップショットを生成。初手候補は本体の `canPay` と `validTarget` で合法確認してから送る。返答も**ホスト側で再検証**する。古い盤面・別リクエストID・期限切れ・不正なカードは採用しない。
- `tests/online-bot-worker-isolation.cjs`：実ゲームのlocalhost QA画面で Blob Worker を作成し、対応可否、ゲートによる起動選別、非同期高負荷、アニメーション継続、スナップショット更新、要求上書き、タイムアウト・Worker再作成、CSPによるWorker拒否を検証。計算中の物理戦闘の変化を隔離するため、**このQAハーネスだけでtickを一時停止**し、描画/ブラウザのアニメーションは継続させる。
- `.github/workflows/online-bot-worker-isolation.yml`：Chromiumで再現するGitHub ActionsとJSON artifactの保存。

## 自動検証の実結果

[GitHub Actions #39136619088](https://github.com/8mahi8/shokoku-sensen/actions/runs/39136619088) **SUCCESS**。前段階の試験は「速度0でも物理tickが完全停止しない」ことにより、検査中の盤面が勝手に変わり意図通り「stale」と判定されたため、**テスト環境だけ物理を完全固定**して再実行した。これは本番での状態変化が無視できる証拠ではない。

| 検査 | 結果 |
|---|---|
| Blob Worker起動 | 成功 |
| 戦術分岐のない資源不足局面 | ゲートでスキップ |
| 敵が砦を争っていて合法な行動が複数ある局面 | Workerの提案を受領（QAで実際に召喚しない） |
| 敵が城壁付近にいて緊急防衛すべき局面 | ゲートでスキップ |
| Worker内部の重負荷 | 約 **270.1ms** |
| その間のメインスレッド animation frame callback | **16回** |
| 高負荷応答の往復時間 | 約 **270.2ms** |
| 候補の再検証 | 9候補、実ゲームの手札・資源・配置範囲でチェック |
| リクエスト中にゲーム状態が変わる | **stale：破棄** |
| 新しいリクエストで先のリクエストを上書き | **superseded → accepted** |
| 制限時間を超える重負荷 | **timeout：破棄** |
| ワーカー停止→再生成 | **accepted：回復** |
| `Content-Security-Policy: worker-src 'none'` の厳格環境 | 作成APIが成功したように見えても結果を取得できず、**timeoutフォールバック** |
| Worker返答を通じた実対戦の召喚・資源変更 | **ゼロ**（テストは提案のみ） |

単一のLinux Chromium環境での測定。**iPad Safari / Google Sitesに埋め込んだHTML / オンラインFirebaseでの計測ではない。** Workerが使えれば描画への同期負荷を軽減できる可能性はあるものの、2本のスレッドが同時に走る端末全体のCPU・メモリ負荷は別途検証が必要。

## 安全な非同期実行の原則

1. `Worker` に送るのは**自分の使用可能カード・資源、公開地形、見えている部隊のみ**。敵の隠れた手札や未発生の行動を参照しない。
2. ゲートに該当しなければ**従来BOTの即時戦術判断**に任せる。
3. Workerは**提案者**であって**ゲームの行動権限を持たない**。本体が署名に対応する現在の盤面を確認し、最新の手札・エネルギー・合法配置を再確認する。古い提案なら破棄する。
4. `postMessage` の `id` と `version` で要求を識別し、Workerの結果が後から届いても古い結果は採用しない。
5. 処理期限・例外・CSPブロックのどれが起きても**カードを自動購入せず、旧BOTを維持する**。Workerオブジェクトを明示的に `terminate()` し、`URL.revokeObjectURL` を利用してリソース解放する。
6. Blob Workerは同一オリジン扱いであっても、CSPの `worker-src` 制約に従う。Google Sites/学校iPadの実配置で実測するまで、利用可能とは断定しない。

参考：MDN [Worker()](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker)、[CSP worker-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/worker-src)、[Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)。APIの一般的な対応と、特定のGoogle Sites埋め込み環境の許可は別問題。

## 残った課題（昇格前の必須条件）

- **最大の設計課題：厳密な盤面一致は実戦中ほぼ毎フレーム無効になる。** 今回は物理を固定したので Worker の提案を受け取れたが、戦闘は通常30Hzで動く。厳密にすべての座標/HP/自軍資源まで一致させると、長い探索はほぼ必ず stale になる。これを無条件に緩めず、結果受領時に観測局面を再評価し、敵の危険な移動・失われたカード・変化した砦・所定の期限を別々に扱う**安全な再検証条件**を設計し、その偽陽性・偽陰性をQAと完全対戦で計測する。
- **本物の二手探索はWorkerへまだ移せていない**：現在の本物の `tick(1/30)` はゲーム本体のDOM/UIやネットワーク状態などに依存する。可搬な戦闘コアを抽出するか、プロキシ＋少数分岐をWorkerの独立近似モデルで行うか比較すべき。高速化だけを理由に劣化した戦闘評価を採用しない。
- **オンライン・iPadの実機検証が未実施**：Safari Web Worker、Blob URL、Sites埋め込みCSP、学校端末の描画フレーム時間、メモリ、通信の遅延や同期誤差をテストする。Worker作成やエラー処理によってオンライン対戦への影響を起こさない。
- **完全試合勝率のA/Bが未実施**：本当にWorkerが行動を改善するか、旧BOTと先後ペア・対照seed・敵の様々な戦術・完全試合で計測し、独立holdoutで採否を決める。

## 今回の採用・不採用

**研究コードとして維持**：分離Worker、提案だけの非権限モデル、実ゲームの再合法チェック、鮮度チェック、タイムアウト、CSPフォールバック。

**通常BOTへの導入は見送り**：Worker近似AIを20秒二手探索の代替として使うこと、古い状態に基づく行動の許容、iPadでの通信や本番Firebaseへの自動変更。

次の研究は「非同期結果の安全な新鮮度評価」を優先し、将来的に別スレッドの探索評価を通常BOTの戦術提案に利用できる状態まで進める。
