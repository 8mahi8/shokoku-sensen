# 小国戦線III｜性能検証の証拠台帳・重複防止表

更新: 2026-10-22 / 対象: Draft PR #22 / 優先: 学校iPadの友達1vs1

> **このファイルを新しい性能実験の前に確認すること。** 同じ論点を「テストPASS」「違うCI番号」という理由だけで再実験しない。旧記録は現在も有効な仮説と実績を持つ。数字は断りがなければCIのheadless WebKitであり、学校の実iPadではない。

## 実験済み・再調査不要（条件が変わらない限り）

| 問題 | 実際の過去結果・参照 | 既に導入したもの / 決定 |
| --- | --- | --- |
| JavaScriptによるCanvas描画が主犯か | JS描画は約5〜7ms、フレーム間隔は100ms超もある [#39475276349](https://github.com/8mahi8/shokoku-sensen/actions/runs/39475276349)。描画無効化も試験済み [#39476259487](https://github.com/8mahi8/shokoku-sensen/actions/runs/39476259487) | 描画呼出し時間だけで原因を決めない。 |
| 戦車・ゴーレムの絵だけが重いのか | 矩形への一時置換も大差なし [#39483775642](https://github.com/8mahi8/shokoku-sensen/actions/runs/39483775642) | 正規アートは保持。絵の簡略化案を繰り返さない。 |
| Canvasが見える/見えないとHUD | Canvas描画停止、Canvas要素非表示、カードHUD非表示まで2026-10-21に試験済み [#39483192427](https://github.com/8mahi8/shokoku-sensen/actions/runs/39483192427) [#39485586259](https://github.com/8mahi8/shokoku-sensen/actions/runs/39485586259) | 2026-10-22の[#39762351318](https://github.com/8mahi8/shokoku-sensen/actions/runs/39762351318)以降は**実Firebaseゲスト**の再現確認として位置づける。探索がゼロから始まったわけではない。 |
| CSS filterを外せば改善するか | むしろ一部悪化 [#39486294923](https://github.com/8mahi8/shokoku-sensen/actions/runs/39486294923) | 不採用。 |
| カード肖像Canvasを隠す/PNG変換するか | FPS改善なし [#39486965057](https://github.com/8mahi8/shokoku-sensen/actions/runs/39486965057) | 不採用。 |
| 使用不能カードのopacityをやめるか | 改善小 [#39487709725](https://github.com/8mahi8/shokoku-sensen/actions/runs/39487709725) | 不採用。 |
| HUDを定期更新すると何が起きるか | 更新停止とHUD完全一致のABBA検証で差を分離 [#39489286303](https://github.com/8mahi8/shokoku-sensen/actions/runs/39489286303) [#39489661965](https://github.com/8mahi8/shokoku-sensen/actions/runs/39489661965) | **HUDの差分更新は既に実装・テスト済み** [#39490281824](https://github.com/8mahi8/shokoku-sensen/actions/runs/39490281824)。HUDを無効化したり「差分更新を新しく提案」しない。 |
| 125ms更新が180msより大幅に悪いか | V17・PR21・PR22で模擬反映間隔比較済み [#39749845828](https://github.com/8mahi8/shokoku-sensen/actions/runs/39749845828)。劇的なFPS差は再現できず | 根拠なく180msへ戻さない。実Firebaseと学校iPadの通信条件では未判定。 |
| 動画録画でWebKitが極端に重くなるのか | 録画なしでも大きなフレーム間隔が残る [#39761588111](https://github.com/8mahi8/shokoku-sensen/actions/runs/39761588111) | 録画ありのFPSを実機FPSと呼ばない。録画なし対照を記録。 |
| 空白のWebKit自体が低FPSか | 空白タブは録画あり/なしともrAF p95約17ms [#39763207726](https://github.com/8mahi8/shokoku-sensen/actions/runs/39763207726) | ゲーム表示・同時ホスト処理・合成/RTDBの影響は別途識別。 |
| 研究ログ撤去後の対戦機能 | 2クライアントシミュレーション [#39757328102](https://github.com/8mahi8/shokoku-sensen/actions/runs/39757328102)、実Firebaseで手動召喚・再接続・6回再戦 [#39757874377](https://github.com/8mahi8/shokoku-sensen/actions/runs/39757874377) | この機能を壊さない。実機の滑らかさは未保証。 |

## 進行中の検証：過去実験との差分を明記する

- [#39764042378](https://github.com/8mahi8/shokoku-sensen/actions/runs/39764042378): 実Firebaseの別WebKitゲストでCanvas「描画処理停止」と「Canvas要素非表示」の区別。2026-10-21のローカル固定戦場とは通信/戦闘進行条件が異なる。新しい論点は**実Firebase通信中でも同じ傾向か**。録画なし/ありの両方が完了したか確認する。
- [#39764606866](https://github.com/8mahi8/shokoku-sensen/actions/runs/39764606866): 同じ実FirebaseゲストでCanvas要素を隠したまま `#cards` と `#bottom` を別々に切り分ける。これも過去の `#cards` 非表示実験の延長であって、独立した初発見ではない。結果を確認してから同種のテスト追加を判断。

## 2026-10-22 最新版を「実際に動かしてみる」受入確認

- **対象**: このブランチの `online-ipad.html` は2026-10-22 [run #39756706656](https://github.com/8mahi8/shokoku-sensen/actions/runs/39756706656) の配布HTMLと **blob SHAが同一 (c88f104a)**。以後このファイルは変わっていない。学校の公開Google Sites HTMLと同一とは限らない。
- **最新の実ブラウザ評価**: [run #39764606866](https://github.com/8mahi8/shokoku-sensen/actions/runs/39764606866) の**録画なしWebKitゲストjobはSUCCESS**。Chromiumホストと一時的な実Firebaseルームで通常・軽量・大型・18体・20体の戦闘を描画。ゲーム内操作、同期、再戦、Firebase一時ルーム削除もPASS。workflow全体は録画ありjobがキャンセルされたため `cancelled` であり、全体SUCCESSと誤記しない。
- **実ゲームの1.5秒短時間WebKit録画なし計測**: 軽量10体は15フレーム/約1.5秒、gap p95 112ms。通常14体は11フレーム、gap p95 192ms。大型10体は12フレーム、gap p95 168ms。混戦18/20体は11フレーム、gap p95 150ms。おおむね **7〜10回/秒の描画**であり、これを滑らかと合格認定しない。通常/混戦はフレームによって描画処理12〜25ms程度なのにrAF間隔がそれより大きい。CIの短期値は学校実機FPSと一致しない。
- **画面映像のレビュー**: [run #39763630787](https://github.com/8mahi8/shokoku-sensen/actions/runs/39763630787) の実Firebase/WebKit録画と20体混戦スクリーンショットを確認。通常ユニット・HUD・カード・接続状態は描画され、診断HUDの時点によって4FPS、直前最大フレーム間隔500ms超を示している。動画のエンコード25fpsは実ゲーム描画fpsではない。滑らかになったと断言できない。
- **ローカル環境追加試行**: 全く同じ単体HTMLを持ち込みローカルChromiumでオフライン戦闘を実測しようとしたが、実行環境のブラウザナビゲーション制限 (`ERR_BLOCKED_BY_ADMINISTRATOR`) で `localhost` / `file://` の双方が読み込めず、**追加のChromium実測値は得られていない**。従来のChromiumとWebKitのGitHub Actions検証の結果は有効。この失敗をゲームの不具合と見なさない。
- **暫定判断**: オンライン対戦・同期復帰は正常。ただしCIのWebKit描画はまだ目立って遅く、ゲームが「もう十分軽い」とは未判定。学校Safari/Google Sitesで実際の2端末対戦を行い、まず重かった側の体感が改善したかを採用判定の主軸にする。これまでのCanvas/HUD差分更新やCSS不採用を再度ゼロから実験しない。

## 2026-10-22 表示補間の新規改善（従来のCanvas/カードHUD調査とは別）

- コード確認により、ゲストの兵士には `presentRemoteUnit` で位置・歩行/攻撃アニメーションの補間が既にある一方、**弾の `shot.t` と爆発 `effect.t` はスナップショット受信時のみ新値を得ており、ホストの30Hzシミュレーションと異なり受信間隔中は描画上静止する**ことを発見。これは実FPSが低くなる問題とは別の「カクついて見える」原因候補であり、旧Canvas/HUD検証の繰り返しではない。
- [commit d2d40a0](https://github.com/8mahi8/shokoku-sensen/commit/d2d40a06604a986e3cca774500de9e78c66e991c) でゲストの受信時刻を保持し、弾/爆発の**視覚上の残り時間だけ**受信後最大250ms進める。ホストの`tick`、当たり判定、ダメージ、Firebaseデータは不変。受信値の配列は書き換えず、毎回の描画時に一時値を導出。ルーム・試合リセット時刻は初期化。
- `online-game.js`、直接貼付けする `online-ipad.html` と `online-embed.html` を原子コミットで揃え、`tests/online-smoke.cjs` に非破壊・時間上限・ホスト無変化・HTML全コード一致のアサーションを追加。[Online 1v1 smoke #39771176204](https://github.com/8mahi8/shokoku-sensen/actions/runs/39771176204) **SUCCESS**。
- **これは表示の段差を減らす改修であり、FPS改善ではない**。学校iPadでのゲスト実視覚、同時ホスト/ゲストFPSやWebKit録画の最新結果はまだ確認していない。学校の貼付済み公開版とmainは変更していない。実際の画面レビューで不自然な弾移動/エフェクト終端がないことを確認してから公開候補にする。

## 2026-10-22 Phase 1 更新｜WebKit同士で役割差を測る

- 2026-10-22の開発方針: **ホストとゲストの実際のFPS・見た目・操作感を可能な限り等しくする**。ゲストだけ画質や演出を削ることを最初の対策にしない。学校iPadの同じ2台でホスト役を入れ替える実機検証を最終判断とする。
- 旧実Firebaseテストは Chromiumホスト + WebKitゲストでブラウザエンジンが違い、ゲストの低FPSをネットワーク上の役割のせいだと断定できなかった。**未実施の比較**: WebKitホスト + WebKitゲストで同一端末条件・同一貼付けHTML。
- [commit 58a2c0f](https://github.com/8mahi8/shokoku-sensen/commit/58a2c0f50588d8429a5ee67767768856aa7c9f00) で `tests/online-browser-live.cjs` に同一WebKitホスト/ゲスト条件を追加。両者はそれぞれ別WebKitプロセス、同一 1194x834 / DPR2 / touch、同一 `online-ipad.html?qa=1&perf=1`、1つの実Firebase一時ルーム、同じ1.5秒区間で rAFフレーム数・P50/P95間隔・同期・描画時間を記録。旧Chromiumホスト+WebKitゲストの録画あり/なしも維持。ワークフローの新しい3条件目は**動画なし**に限定し、同一条件を重複追加しない。
- この比較で WebKit同士でもゲストだけ遅いなら、ロール別の `adaptCanvasQuality` / `guestLowPower`、スナップショット適用、位置/エフェクト補間、HUDに絞る。ほぼ同速なら従来のChromium/WebKit環境差・合成負荷や学校iPad固有の条件を優先する。
- **コード上の確認事項（未採否）**: `guestLowPower` が一度ONになるとリセットされず、描画を `now - guestLastPaint < 30ms` で間引く。実際に60FPSへ回復した場合もゲストのみ最大約33FPSの見た目に制限される可能性がある。ただし低性能端末のオーバードロー防止でもあるため、データなしに消さない。検証結果を見て、両役同様の適応制御や自動回復を検討する。
- 旧WebKitヘッドレス実験で描画ON/OFF、Canvas/HUD非表示、肖像PNG、CSS filter/opacityなどは**既に検証済み**。本件の役割同条件の比較以外では同じテストを繰り返さない。学校版、main、本番Firebase設定は変更しない。

## 未解決だが、先に検証条件を揃える必要がある論点

1. **最大の実地不明点:** 2026-10-22に学校で重かったゲスト用HTMLと、その前に軽かった旧学校用HTMLの**正確なソース対応が未確定**。参考の3283129/b6c7880は近接ソース対照だが、旧実機の現物とは確認できていない。これを確定する前にログ有無や新UIのみを原因と決めない。
2. **現場固有:** 学校iPad Safari、Google Sites直接HTML埋込、同一端末/同一部隊数/ホスト・ゲスト交代での実測はまだ必要。ヘッドレスWebKitの175msは学校実機175msを意味しない。
3. **通信:** 125ms vs 180msは模擬反映で比較済み。次に必要なのは条件を揃えた**実Firebase/実機**での比較であり、同じ模擬テストを再実行することではない。
4. **UI負荷:** 差分HUD最適化は既に入っている。さらに変更するなら、**残る特定の繰り返しDOM更新またはCanvas/カード合成の現行コード行**を示し、維持する機能・視覚品質・検証指標を先に定める。
5. **オンライン以外**: BOTの研究は研究ログを使わず、オフラインの既存シミュレーション/テストに足す。オンライン通信・描画には負荷を加えない。

## 新しい検証の採用ルール

- この表と `docs/DEVELOPMENT_STATUS.md`、既存 `tests/online-hud-matched-control.cjs`、`tests/online-browser-live.cjs`、`tests/online-guest-history-ab.cjs` を最初に読む。
- 新テストを作る前に「**これまでの何と違うか / なぜ未解決か / 比較の判断基準**」を1行で説明できること。既に検証した内容なら既存CI成果物を読み、重複CIは回さない。
- 性能対策は数字のない単純なCSS削除・画質劣化・カード肖像の置換ではなく、**根拠を示した最小の変更**で行う。FPSだけでなく受信Hz/操作反映/フレーム間隔・再戦/退出/カード状態の回帰を同時に見る。
- ゲームを修正した場合、最低でも従来の `tests/online-smoke.cjs`、`tests/online-sim.cjs`、必要なブラウザQAを用いる。テストPASSを実機受入と混同しない。
- **main / 学校Google Sites / Firebase管理者設定 / 保存済みデータは許可なく変更しない。** 研究ログの自動記録・回収は復活させない。公開候補採用は学校実機の対戦合格後。
