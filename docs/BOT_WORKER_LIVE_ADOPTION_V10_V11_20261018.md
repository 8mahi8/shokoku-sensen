# 小国戦線III｜V10–V11 Worker判断の受理率と接敵前スキップ（2026-10-18）

## 一文結論

通常の30Hzゲームを止めずにWorkerの戦術提案が使える頻度を測った。事前に分かった接敵中の局面をWorkerへ送らずに済む**保守的preflight**を追加し、既知局面の同一条件比較では有効提案 **20件を全て保ちつつ、32要求中12件のWorker起動を省略**した。追加の別16局面でも、有効提案 **16件を全て保ちつつ、26要求中10件を省略**できた。**あくまで意図的に構成したQA用戦況**での結果。実戦BOTの勝率改善は未確認。

## 外部資料から導いた評価観点

- [MDN — Worker.postMessage()](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage)／[structured clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)：送信時の盤面はWorker側へ複製され、その後もゲームは進行する。候補が完成したタイミングでホストが鮮度と行動の合法性を必ず再確認する。Workerが自動的に最新座標を共有するわけではない。
- [MDN — Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)：隠れたタブやiframeではアニメーションコールバックやタイマーが制限され得る。テストした可視のChromiumだけでGoogle Sites埋込み/iPad Safariを保証できない。
- [Gaina et al. (2020), Rolling Horizon Evolutionary Algorithms for General Video Game Playing](https://arxiv.org/abs/2003.12331)：ゲームの観測と再計画を繰り返す方向性。論文の結果がこのゲームの召喚候補の価値を保証するわけではない。
- [Learning Planning Budgets in Real-Time RL (2026)](https://arxiv.org/html/2606.26463v1)：考える間にも環境が動く前提で、固定計算予算と状態依存の予算配分を比較する研究。小国戦線の「十分考えた結果を処理し終わるころには古い」という現象に直接関係する。**論文の学習ゲートを移植したのではなく**、今後の時間予算設計の参考とする。

## 研究コードの実装場所

1. `tests/online-bot-worker-live-coverage.cjs`＋`.github/workflows/online-bot-worker-live-coverage.yml`：最初の戦況12種類×Worker内部の合成計算負荷35/90/170/270ms＝48ケース。実物の `tick(1/30)` はWorker計算中も進め続ける。ゲートで呼ばなかったケースと、Workerが結果を返すまでにゲーム状態が変化して棄却したケースを分けて計測。workerランキングは**近似評価**であって本物の2手30Hzロールアウトではない。
2. `tests/online-bot-worker-bridge.inc.js` の `qaWorkerInContact`, `qaWorkerPreflight` と `qaWorkerSubmit(...,"conservativePreflight")`：送信前の見えている自軍・敵軍が現在のクラス射程/最低110ワールドpxの警戒距離に入っている場合、従来のV9の受信後安全検査が棄却することがほぼ確定的なので、最初から**preflightSkip**。通常 `conservative` モードを変えず、明示的に指定した場合にのみ実行する。もともとの `qaGateAssess` と独立する補助条件。
3. `tests/online-bot-worker-preflight-ab.cjs`＋Actions：同じ12戦況/4負荷を**旧conservativeと新conservativePreflight**で繰り返し、見送ったWorker計算の数と元の有効回答が維持されたかを比較。
4. `tests/online-bot-worker-preflight-holdout.cjs`＋Actions：新しい16戦況（空戦と地上戦の分離、異なるカード/資源、激戦中の5構成、城前危機、資源不足、戦術分岐なし）×負荷60/180ms×旧/新方式＝64ケース。既知12局面の結果を見てから追加した**別条件**の試験であり、一般分布に対する統計的holdoutや無作為完全対戦ではない。パラメータは変更せず検査した。
5. Worker自体のアルゴリズム、本番ゲーム `online-game.js`、公開 `main`、友達とのオンライン対戦、Firebase、Safari向け配布ファイルは**一切変更していない**。

## V10：実際の戦闘エンジン稼働中の最初の採用率

[Actions #39138276205](https://github.com/8mahi8/shokoku-sensen/actions/runs/39138276205) **SUCCESS**。

| 項目 | 結果 |
|---|---:|
| 用意した戦況×合成負荷 | 12×4=48 |
| ゲートから探索候補扱い | 32 |
| ゲートで実行しない | 16 |
| V9安全再検査を通過 | **18/32 = 56.3%** |
| 状態変化で結果を棄却 | 14 |
| 合成負荷35/90/170msの各受理率 | 各 **5/8 = 62.5%** |
| 合成負荷270msの受理率 | **3/8 = 37.5%** |

状態変化による拒否主因：HP変化8、部隊の死亡/増員による数変更4、移動距離超過2。3つの接敵条件では試行12件全て不採用となった。つまり高速化だけでは交戦中の計算は**安全な回答にならない**。また「Workerで安全に採用できた」とは、本物のBOTがその行動を実際に実行して勝ったことではない。

## V11：Worker起動前に接敵検査をするA/B

[Actions #39138710809](https://github.com/8mahi8/shokoku-sensen/actions/runs/39138710809) **SUCCESS**。

| 指標（各方式とも48場面） | V10保守的再検証 | V11接敵preflight |
|---|---:|---:|
| ゲートから探索候補 | 32 | 32 |
| Workerへ実際に仕事を送る | **32** | **20** |
| ゲーム状態を再検査後、利用可能な回答 | **20** | **20** |
| 接敵状態を計算前に除外 | 0 | **12** |
| 使える提案をpreflightで誤って除外 | 該当なし | **0** |

同一条件での結果にはゲーム/ブラウザタイミングのばらつきがある（V10単独では18/32、V11の再実行対照では20/32）。**方式の改善比較には同一CI実行内の並行条件比較20対20**を使い、V10の18とV11の20を直接比較して「強くなった」と主張しない。

## 新しい16局面での追加検証

[Actions #39138883545](https://github.com/8mahi8/shokoku-sensen/actions/runs/39138883545) **SUCCESS**。

| 指標（各方式とも32場面） | 従来 | 接敵preflight |
|---|---:|---:|
| 探索候補 | 26 | 26 |
| Workerへ送った仕事 | 26 | **16** |
| 安全に返せた提案 | **16** | **16** |
| 接敵状態を送る前に除外 | 0 | **10** |
| 利用できた提案の消失 | — | **0** |

5種類の新しい交戦状態×2負荷＝10回で、従来は後から全て `stale` となったのに対し、新方式は `preflightSkip` を返した。非交戦状態8種類では新方式が8×2＝16回全て `acceptedRevalidated`。緊急城防衛・資源不足・戦術的比較不要の3種類では旧方式/新方式とも既存の探索ゲートでスキップ。

**採用率そのものは安全判定を保ったまま、Workerに出す無駄な計算を削った**。スキップで浮いたCPU時間の価値はWorker合成負荷に依存し、まだSafariで数値化していない。交戦中の最適な戦術を選べるようになったわけではない。

## 推奨する次の工程

1. **完全試合中の現実的な起動率・棄却理由の記録**：これまでは人工的に設置した盤面群。BOT対BOT/複数の敵スタイルで時間に応じた戦況変化を含む実プレイを走らせ、結果は絶対に行動へ反映せず、同じ条件でWorker起動・採用率と描画負荷を測る。現在の `runDuel` は同期高速進行なので、単純にWorkerを差し込むとメッセージが処理されない。可視ブラウザの30Hzループを利用する計測専用オーケストレーションが必要。
2. **状態ごとの思考予算**：相手が砦/城へ到達する時間や、味方の次の攻撃までの時間が短いほど短い予算または探索禁止とし、静かな局面でも適切な結果を返す価値があるか検証する。具体的な閾値は未使用データで反証検証。
3. **本当の30Hz二手探索のWorker移植**：共有のDOM依存なしに戦闘コアを分離しなければ、現在の高速Workerは軽量な近似戦術モデルのまま。ブラウザ描画と戦闘コードの両方が同時に動くiPad Safariでメモリ・FPS・オンライン同期を検証。
4. **BOTの強さ**：結果を行動に反映した段階で旧BOTとの先後/seed/敵スタイルを固定した完全対戦A/Bを実施。最終採用まで公開mainは更新しない。

## 判断

- **V11 preflightはQA研究版として維持**。Workerの有効回答維持・無駄な仕事の省略が2つのシーン群で確認された。
- **通常BOT・友達との対戦には未導入**。本当の探索と比較していないので「強さが上がった」とは言わない。学校iPad・Google Sitesの負荷は引き続き未検証。
