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

