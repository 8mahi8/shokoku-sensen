# 小国戦線III｜BOT探索 Worker 新鮮度契約 V9｜外部技術資料からの実装・検証（2026-10-18）

## 位置づけ

前回 `docs/BOT_WORKER_ISOLATION_V8_20261018.md` の残課題は、「正しく非同期処理できても、毎30Hzで戦場が変わるので一致条件が厳しすぎるとWorkerの提案が常に破棄される」ことだった。今回は**通常BOTへつなぐ前の安全検証**として、本物のゲームエンジンを使い、古い提案の条件付き再利用をテストした。

**公開main、online-game.js、オンライン通信、iPad版HTML、通常BOTの行動は不変更**。変更は `develop` 上の `tests/` 専用Worker bridge/Playwright QAとCIのみ。計算しているのは依然として**軽いrole-based候補ランキング**であり、本来の20秒先・二手30Hz物理探索ではない。

## 今回読み直した外部資料

1. [MDN — Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)：Workerのオブジェクトは原則メインスレッドからコピーされ、共有の盤面を直接更新しない。blob/data URL workerは生成元documentのCSPを継承する。したがって `Worker.postMessage` で渡した敵の位置は**送信時点の記録**。
2. [MDN — Structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)：メッセージの複製規則。WorkerへDOMやライブの関数付きゲーム状態をそのまま渡さず、部隊の座標・HP・カードID等に絞るべき。
3. [MDN — Worker.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage)：データの受信はメッセージキューに配送される。`setTimeout` の呼び出し順序だけを期限判定に使わず、**結果受信時にもperformance.now()から実時間を検査する**。
4. [Moraes等（2019）— Evolving Action Abstractions for Real-Time Planning in Extensive-Form Games](https://ojs.aaai.org/index.php/AAAI/article/view/4072)：リアルタイムの膨大な行動空間から有望な戦略の部分集合を選択する研究。本作は既存戦術ポートフォリオV6として行動役割を絞る。**本作固有の閾値の正当性を論文が保証するわけではない**。
5. [Gaina等（2020）— Rolling Horizon Evolutionary Algorithms for General Video Game Playing](https://arxiv.org/abs/2003.12331)：短い行動計画を評価し次の決断で再計画する研究。「予測を実行し続ける」のではなく新しい観測に応じて再評価する基本方針を参考にした。勝率や時間予算の移植は別途検証が必要。

## V9：Workerの回答を受け取る側の条件

`tests/online-bot-worker-bridge.inc.js` 内の `qaWorkerCapture`, `qaWorkerFreshness`, `qaWorkerSubmit` に追加した。いずれもlocalhost QAサーバで一時注入したゲームスクリプト内だけで実行。

**厳格モード** (`strict`、既存の互換デフォルト)：送信時署名と現在盤面の署名が同じなら採用候補。少しでも変化したら `stale`。城・砦・部隊・資源・手札・スペル変化を考慮。

**保守的な再検証モード** (`conservative`、QAで明示したときだけ)：

- 常にWorkerの結果に含まれる候補が**送信時点の合法な候補集合内**か、現在の手札・資源・配置条件で**なお合法**かをゲームホストで再検証する。Workerは実際の召喚権限を持たない。
- 戦闘フェーズとチームが不変。シミュレーション内の経過時間が**0〜0.30ゲーム秒以内**である。
- 味方の手札・山札キュー・残り使用回数が同じ。全砦の所有権/耐久度、双方の城HP、スペル状態が同じ。
- 友軍と敵の各部隊ID/チーム/種類が同じ、**死亡・追加召喚なし**、HPが変化していない。すべての部隊の移動距離が**最大12ワールドpx**以内。
- 資源の差分が負でなく、観測した経過秒数の自然回復量を超えない。意図せぬ消費を見過ごさない。
- 最新の戦況でも戦術比較ゲートが依然として有効で、城前危機などになっていない。さらに、敵が城への緊急警戒帯（185px）をまたいでいない。
- **攻撃前の接敵警戒**：味方と敵の距離が射程と最低110pxの警戒値以内なら、まだHPが減っていなくても `combatContact` として破棄する。戦闘が始まる直前に突然危険な結果を採用するのを防ぐ。
- 別の問い合わせが新しく発行されていたら `superseded` とし旧結果を捨てる。結果ハンドラー自身が現在の `performance.now()` と送信時刻を比較し、時間制限を過ぎた後にタイマ発火が遅延しても**期限切れを採用しない**。
- これらに該当しない場合のみ `acceptedRevalidated` として**提案を返す**。本当の召喚はテスト中一度も実行しない。

閾値 `0.30s / 12px / 110px` は事故を避ける**保守的な初期仮説**。実戦勝率・偽陽性・勝ち筋の消失を検査した承認済み閾値ではない。緩くすると過去の判断を危険に受け入れるリスクが増え、厳しくすると使える回答を捨てる。

## 自動テスト

### 初期段階：静的10件＋本当に物理を動かす3件

[Actions #39137392313](https://github.com/8mahi8/shokoku-sensen/actions/runs/39137392313) **SUCCESS**。校正前の安全ルール：
- 意図的に+0.15秒・小移動・自然回復だけ起こすとstrictはreject、conservativeはaccept。
- 砦の変化、城HPの変化、手札のローテーション、資源の減少、部隊の被ダメージ、敵増援、激しい位置移動、経過時間超過はいずれも**reject**。
- 物理を止めずにゲームの30Hz `tick` を実行し続けた3例で、Worker約120ms後も時間と資源の変化を確認しつつ3/3回 **`acceptedRevalidated`**。これは**交戦なしの静かな試合条件**での結果。

### 接敵前の危険も追加した改良版

[Actions #39137569659](https://github.com/8mahi8/shokoku-sensen/actions/runs/39137569659) **SUCCESS**、続いてfixtureの距離条件を明示した [Actions #39137659831](https://github.com/8mahi8/shokoku-sensen/actions/runs/39137659831) **SUCCESS**。

- 静的**11件**すべて想定通り：前述の拒否8件＋時間/モード差に加えて「部隊が既に接触中、だがHPがまだ変化していない」条件もreject。
- **自然に動いた3件**は、穏やかな試合で3/3 `acceptedRevalidated`。
- **交戦中1件**は実際に30Hzで接敵させ、`unitHpChanged` により `stale` となった。
- 所定の戦術候補が本番で強いか、Human相手に勝てるかの証拠ではない。

### Workerの旧機能も回帰テスト

[Actions #39137545796](https://github.com/8mahi8/shokoku-sensen/actions/runs/39137545796) **SUCCESS**：前V8のWorker起動、アニメーション応答性、stale、superseded、timeout、再起動、CSP worker-src制限でのfail-closed挙動が維持される。

## 特に重要な留意点

- **接敵が常に激しい場所では、conservativeでも結果を捨てる**。それは本番用AIとしては判断機会を失う可能性がある。だから当面は旧BOTの即時判断が最終的な防衛を担う。
- **同一ゲーム時刻を進めない凍結QAと、実際に時間を進めるQAの双方を実施**。後者では戦闘のない安全な局面のみ再利用成功。交戦中の強さは未確認。
- 研究用Workerは通常BOTの呼び出し経路に入っていない。意図的に結果を適用しない設計なので、「BOTが勝つようになった」と言うのは誤り。
- 初期モデルは目視可能な部隊/自軍手札/自軍資源のみ使い、敵の隠れた手札・将来の行動を覗かない。
- **学校iPad Safari・Google Sites埋込・実オンライン通信は未検証**。CSP/CPU/メモリ/端末のバックグラウンド状態を実測し、本番導入条件を決定する。

## 次の優先順位

1. 長い探索ほど古い判断が使えず、短い探索ほど予測が浅い。**実際のgate対象となる多様な局面**でWorker返答の採用率・拒否理由・時間分布と旧BOTの結果を調査。測定seedは今後の閾値調整と最終holdoutを混同しない。
2. 実 `tick` に依存した2手探索をWorkerへ移植するなら**DOMとネットワーク副作用を持たないシミュレーションコアへの分離**が必要。ライブラリ互換性（iPad Safari）を確認する。
3. 本番投入の判定材料は、実行速度だけでなく、合法性、完全な試合A/B、先後逆、複数BOTスタイル、iPad実機フレーム時間・オンライン遅延の総合。
4. 短期Workerモデルのスコアを最終決定として使わず、従来BOTの判断をフォールバックに残す。ゲートが探索を呼べないときでも従来対戦が継続することを維持する。

**採用**：研究用の `conservative` 再検証方式（明示時のみ）。 **保留**：実ゲームのBOT自動使用・公開mainへの反映。