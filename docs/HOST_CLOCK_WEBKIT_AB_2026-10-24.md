# 小国戦線III｜90ms / 150ms ホスト時計のWebKit比較（2026-10-24）

## バージョンと禁止事項
- **学校Google Sites版は「再戦修正版」のまま**。ユーザーが実際に貼り替えた報告なしに公開版を更新済みと扱わない。
- この比較はGitHub PR #22の開発ブランチのみ。main、Google Sites、Firebase Rules、既存ルームに変更なし。
- 実ゲームの `online-game.js` と単体HTMLは改造しない。QA用ローカルHTTP応答のメモリー上のHTML文字列だけで、ホスト時計フレーム制限を90/150msに切り替える。

## 完了済みの回帰・通信・描画テスト
[2026-10-24のPlaywright環境修正 SHA 9a192f6](https://github.com/8mahi8/shokoku-sensen/commit/9a192f650d1715313cc010b3cb98d5f33bd84c43) に対応するGitHub Actionsは、以下8系統が**すべて成功**：
- [基本とロジック回帰](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916965)
- [学校iPad画面QA](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916883)
- [実Firebaseホスト／ゲスト2ブラウザQA](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916863)
- [Chromium/WebKitゲストラボ](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916913)
- [WebKit HUD一致診断](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916893)
- [戦闘視覚レビュー](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916872)
- [ゲスト旧版との履歴A/B比較](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916870)
- [WebKit同一タブ性能診断](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916941)

## 負荷調査で既に見えていること
- 同一タブWebKitの「実カードによる合法的な10部隊対戦」では、軽装側で概ね**11fps**、戦車＋守護兵がいる側で**8〜9fps**だった。大型側で戦場描画を止めると**約13fps**に増えた。
- その時のゲームJSロジック計測値はフレーム当たり平均約**0.2〜0.5ms以下**、描画は**約5〜6ms**。残りのrAF待機やコンポジターはJS計測で正確には解剖できない。
- **Linux上のheadless WebKitの値であり、学校実iPadのFPSやCPU能力を測ったものではない。** フレーム差が全て戦闘ロジック起因とも描画起因とも断定しない。

## 新しいABBA試験
- [tests/online-host-clock-cap-ab.cjs](../tests/online-host-clock-cap-ab.cjs) で、WebKitの同一ブラウザー／同一画面解像度にて、実カードを使った`heavy`と`light`を各2回ずつ**90ms / 150ms をABBA順**に入れ替える。
- 測定項目：実経過／試合時間の進行割合、rAF FPS・p95間隔、ゲーム処理時間・描画時間、両チームの実エネルギー増分。
- 見た目の手札/配置/双方のコスト処理は本番の実関数を使用。通信はオフライン実験なのでFirebaseを使わない。テスト結果を`qa-host-clock-ab/results.json`に保存する（GitHub Actions短期アーティファクト）。
- 新しい比較試験は[WebKit性能QA #40091681407](https://github.com/8mahi8/shokoku-sensen/actions/runs/40091681407)で実行。**合格と数値は完了ログを確認した後にだけ記す。**

## 判断の優先順位
1. まず対応後の実Firebase通信全系統が合格した事実を維持する。
2. 90msより150msのホスト時計がゲーム時間の失速を改善し、JS処理負荷で明確に悪化しないかABで評価。
3. 現行30Hz・最大5tickと確定エネルギー使用判定は変更しない。差がある場合のみ最小のコード修正を検討し、無益な大規模改修をしない。
4. 最終決定はホスト／ゲストを交換した学校iPad実機の混戦・エネルギー表示・カード使用感による。


## 2026-10-24 最終追補：ABBA結果（CI完了）
[GitHub Actions #40091681407](https://github.com/8mahi8/shokoku-sensen/actions/runs/40091681407) は **success**。既存のheavy same-page、static-vs-live、今回追加の`online-host-clock-cap-ab.cjs`の3ステップすべて合格。

8測定（実カード10体/シーン、各条件2回、各約1.9〜2.0秒）の平均：

| シーン | 上限 | FPS平均 | 実経過に対するゲーム時間進行 | JSロジック平均ms/フレーム | 描画平均ms/フレーム | フレーム間隔p95平均 |
|---|---:|---:|---:|---:|---:|---:|
| light | 90ms | 11.52 | 1.02倍 | 0.27 | 5.48 | 96ms |
| light | 150ms | 11.57 | 1.02倍 | 0.36 | 6.42 | 92ms |
| heavy | 90ms | 9.55 | 0.83倍 | 0.74 | 5.69 | 128ms |
| heavy | 150ms | 8.81 | 1.05倍 | 0.27 | 6.06 | 134ms |

個々の測定はログ内の`HOST CLOCK CAP AB`と`HOST CLOCK CAP SUMMARY`で確認可能。試験アーティファクト`qa-host-clock-ab/results.json`にも収録。
- `heavy`で150msはホストゲーム時計の実時間追従を**明らかに改善**した一方、平均FPSは同環境で9.55→8.81と低下。測定回数2回ずつ、測定が短く、キャッシュ・温度・順序・同時負荷・WebKitスケジューリング差は排除できない。
- `heavy`90msの最初の試験にロジックp95 21msという一過性の外れ値があるため、ロジック平均の差（0.74 vs 0.27ms）を150msの性能上の勝利とは判定しない。
- `light`ではどちらもゲーム時計の進行率約1.02、FPS約11.5で実質差なし。
- ゲーム時計進行が1.05倍など100%をわずかに超えるのは、観測時点の`rAF`サンプリングと固定30Hz刻みの誤差も含むため、5%の恒久的高速化を意味しない。
- **両陣営のエネルギー増分は全8試験で一致**し、描画・ロジック例外は発生しなかった。
- この結果のみでは「学校iPadのFPSが8.81」「150msが実端末の描画負荷を必ず増減させる」とは言えない。

### 現時点の判断
**150msを維持**。ゲーム時間・両陣営エネルギー・進軍の公平性を改善する効果がある一方、Linux headless WebKitで観測したFPS差だけを理由に90msへ戻す根拠はない。固定30Hz、最大5tickはそのまま維持する。実際の学校iPadで混戦時の動作・処理落ち・ホスト/ゲスト交代を観察してから採否を確定する。

Google Sitesでの公開版は引き続きユーザーが貼った「再戦修正版」。本テストで学校版、main、ゲーム本体HTML、Firebase設定・データは変更していない。
