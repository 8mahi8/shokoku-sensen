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

## 2026-10-22 WebKit同士の役割差テスト：実測確定

[実Firebase同時計測 run #39772223658](https://github.com/8mahi8/shokoku-sensen/actions/runs/39772223658) **3条件全部SUCCESS**。7ラウンド・6再戦、通信切断復帰、端末のルーム退出・一時Firebaseルーム削除も成功。ブラウザQAの録画なし条件で確認（各場面約1.5秒の短時間測定、ランナーによるばらつきが大きい）。最新の `online-ipad.html` 本体は2026-10-22に修正された弾・エフェクトの視覚補間を含む。

| 戦闘 | Chromiumホスト / WebKitゲスト（FPS） | WebKitホスト / WebKitゲスト（FPS） |
| --- | --- | --- |
| 通常14体 | 59.5 / 7.6 | 4.2 / 4.5 |
| 軽量10体 | 60.3 / 12.6 | 6.3 / 5.9 |
| 大型10体 | 57.4 / 7.9 | 4.2 / 5.0 |
| 混戦20体 | 59.7 / 7.8 | 4.3 / 4.5 |

- **新たに支持された判断:** 異なるブラウザでのホスト60FPS・ゲスト約8FPSという差は**役割差の証明ではない**。WebKit同士・同一HTML・同一画面条件では役割で大きくFPSが違う結果は再現せず、両方が低FPS。headless Linux WebKit環境の描画・合成/ブラウザ特性の寄与が大きい可能性がある。
- WebKitの両側でアプリの `drawP95` は約8〜29msである一方、rAF間隔P95は数百ms。**同期JS描画命令だけでは説明できない**。過去のCanvas/HUD非表示対照もこの知見と整合するが、同じ対照の再実行や単純なCSS削除はしない。
- **除外できないこと:** 学校iPad Safariでゲストだけ遅いという実機報告。実機とCIのWebKitは同一環境ではない。Google Sites直接HTML埋め込みのiframe・古いHTMLとの版差・端末状態・Wi-Fi・役割を切り替えた比較は未検証。特に `guestLowPower` の描画間引きは実機上で30FPS程度の差を作る潜在要因だが、今回CIの4〜6FPS現象は間引きの33FPS上限だけでは説明できない。
- **学校用開発テスト版準備:** [Google Drive `Shokoku_III_学校テスト版_20261022_表示補間改善.txt`](https://drive.google.com/file/d/1h6DrKFgm-9yxVzqY1sZb36_tPJGWQtcz/view?usp=drivesdk)。GitHub Actions smoke #39771176204 から取り出した300KB級単体HTMLを .txt としてGoogle Driveに保存、ファイルmetadata size=308803 bytesを読戻し確認。既存の学校サイトと区別し、本人がテスト用Sitesにだけ貼り付ける。検証結果が良いと判断されるまでmain/学校公開版を変えない。
- 今後は同じ2台・Safariでの役割交代が最優先。**実際に低FPSか／兵や弾の位置だけが飛ぶのか／通信遅延か**をタイトル3タップの既存診断で区別する。QAの「headless両側4〜6FPS」を実iPadの快適性評価に流用しない。

## 2026-10-22 一台ゲスト実機プレイ結果：死亡・砲撃警告だけが段階的に動く

- 本人がGitHub Pagesの `guest-lab.html`（実Firebaseの赤軍ゲスト、同一ブラウザ内に青軍BOTホスト）を実際にプレイ。「**キャラが凄くヌルヌルしている**」「唯一カクカクするのは**キャラ死亡時のアニメーションとファイヤーの警告アニメーション**」と報告。以前の「ゲスト側キャラがカクカク」はこのテスト構成では大幅改善。実Google Sites版や別iPad同士でも同等とはまだ断定しない。
- 調査結果：`online-game.js` は弾・爆発の寿命に`guestVisualTimeRemaining`を既に使うが、**`S.deaths[].t`、`S.spells.incoming[].time`、`S.spells.zones[].time`は従来、受信パケット間に進めていなかった**。約125〜180ms更新に合わせて死亡ポーズ/砲撃リングが段階的にジャンプする理屈と一致。
- [修正 commit 6beb58b](https://github.com/8mahi8/shokoku-sensen/commit/6beb58bcf382b1b9713116021a5b63d8a5a4f982): ゲストだけ各描画フレーム時に`guestVisualTimeRemaining`で表示寿命を算出。死亡ポーズ、フェード、範囲砲撃警告リング、防護結界の秒数表示に使う。計算は表示専用で`S.deaths/S.spells`・当たり判定・着弾/召喚タイミング・Firebaseスナップショットは変更しない。ホストでは補間なし。従来の兵士歩行補間・ファイヤー実処理を保持。
- `online-game.js` / `online-ipad.html` / `online-embed.html` / `guest-lab-game.html` に同じ見た目修正を反映、`tests/online-smoke.cjs`で16ms連続経過・元パケット非破壊・受信時刻連携を検査。開発版CI結果は各リンクで追跡。本番Google Sitesは勝手に差し替えず、ラボページへのデプロイ後に本人が再び見比べられるようにする。

## 2026-10-22 追加の本人観察：キャラの動きだけがカクつく

- 本人は最新Google Sites版の試遊で「全体の通信ラグは気にならず、ゲスト停止もなし」に続けて、「**キャラがカクカクしてる**」と気付いた。これをUI/背景全体が遅いという報告に読み替えず、兵士の**位置補間と歩行ポーズ**を切り分ける。ホストかゲストか・画面表示FPSはこの報告だけでは確定していない。
- `online-game.js` の`presentRemoteUnit`は、位置をフレーム間補間する一方、歩行位相を受信パケットの`walkPhase`と`(now-updatedAt)*歩行速度`から**毎回再計算**していた。次のパケットで基準位相が急に進み、描画フレームと無関係に足の動きが飛ぶ可能性を発見。これは「画面全体のFPSが低い」問題とは別。
- [cc2f64e](https://github.com/8mahi8/shokoku-sensen/commit/cc2f64ebd0895667a82ba2f72fdfaa573b133b9b) で、ゲストの見た目専用`visualWalkPhase`をユニットごとの`remoteSprites`に保持し、**実際に画面上で移動した距離**だけ位相を前進させるよう変更。受信パケットで位相を巻き戻さず、移動停止時は最後のポーズを保ち、1フレームの増加量を制限。サーバー座標、攻撃、ダメージ、当たり判定、RTDBの内容、ホスト描画は変更しない。関連単体テストでは位相の連続性・元データの非破壊・長時間カクついた後の上限を確認。
- **採用条件**: 開発版CI smokeと戦闘画面レビューを確認し、学校iPad/Google Sitesで実際に「キャラの歩行が滑らか」か評価する。必要なら次段で見た目の向き変更と兵士座標の受信時ジャンプを独立に検証。**現在の安定Google Sites版は変更しない**。

## 2026-10-22 Google Sites試遊フィードバック：安定性を優先した現状基準

- 本人から今回の試遊結果として「今回は特に止まることもなく行けた」「ラグさも気にならないぐらい」「もっと行けるなら行ってほしいが、そんなに気にならない」と報告。**今回の試遊では、対戦途中のゲスト戦場表示停止は再発せず、体感ラグも許容範囲**。使用端末や対戦時間はこの報告だけでは確定しない。単発成功を根治と断定しない。
- **これを現在の安定ベースライン**とし、Google Sitesへ保存済みの版は勝手に差し替えない。main/Firebaseの本番設定も勝手に変更しない。性能向上のために試合中停止の再発リスクや見た目の劣化を許容しない。
- 調査で確認した残る改善候補: `online-game.js` ではゲスト負荷検知が `guestLowPower=true;qualityMeasured=true` を保持し、描画を `now-guestLastPaint < 30ms` で抑制。描画頻度は最大約33FPS（60Hzでは概ね30FPS）。**性能が回復したあとも通常FPSへ復帰できない可能性**がある。ただし、本人の実機でこの状態が発動していることは未確認。現時点でこの制限をむやみに削除・変更しない。
- 次の改善は開発版だけで行う。必要なら、低電力モードが実際に有効かを診断で確認した後、負荷が十分回復した時だけ短時間の描画頻度テストを行い、悪化なら即戻す仕組みを評価する。headless WebKit CI FPSを実機FPSの代用にしない。1vs1中のゲスト停止・再接続・ファイヤー発動・BOTとルーム退出を回帰テストし、学校Safariの再試遊でのみ本採用を判断。
- 意図: **体感上十分な安定性を保持しながら、効果が検証可能な最適化だけを採用する**。ユーザーに必要のない大量の追試を要求しない。

## 2026-10-22 ユーザー録画レビュー：冒頭もゲーム内も重い（受入不可）

- [run #39772223658](https://github.com/8mahi8/shokoku-sensen/actions/runs/39772223658) の録画ありWebKitゲスト動画約66秒について本人が「結構ひどくない？特に最初」と指摘。ローカルで動画を時間ごとに確認した。
- 冒頭約0〜5.0秒間はほぼ白い映像。QAのPlaywright `recordVideo` はページへの `goto` より前に有効になるため、この白画面を**Google Sitesでユーザーが同じだけ白画面を経験する証拠と扱わない**。ロード実時間の問題か録画準備なのかは未切り分け。
- 6〜20秒ごろはメニューと開戦前準備画面、20秒以降は戦闘シーン。後半も兵士・HUDのコマ間の動きが明らかに乏しい。録画25fpsはゲーム本体のFPSではない。録画なしWebKitでも約4〜13FPS、WebKit同士でホスト・ゲストいずれも約4〜6FPSを計測しており、**単に初回読み込みや録画のせいとは説明できない**。
- WebKit同士の `drawP95` は約13〜29msに対し rAF P95は約173〜675msと大きい。特定の兵士補間だけで解決するとは考えず、Canvas bitmap/カードHUD合成、初回アセット生成、テスト環境のスケジューリングを候補に残す。過去のDOM・Canvas可視性AB結果を再利用し、テストだけを無制限に増やさない。
- **完成・快適・学校採用とは判断しない**。公開Google Sitesを変更せず、同じiPad/Safariでホストとゲストを交代し、冒頭表示と試合中のFPS/兵士/弾の実際の動きを確認する。改善が再現してから本番反映する。

## 2026-10-22 本人実機比較による重要な補正｜CI録画の重さは実iPadと異なる

- 本人がWebKitゲスト録画を視聴し、「白画面は問題ではないが、その後の録画は極端にカクカク」「**学校のiPadはここまでひどくない**」と明言。**この実地観察を優先**し、CI録画から実機の快適性を過小評価しない。前節の「録画は受入不可」という判断は**CI映像に対してのみ**であり、実際の学校版が4〜6FPSという意味ではない。
- Linux/headless WebKit・GitHub Actionsランナーの合成や動画収録負荷はiPad Safari環境と異なる。CIでホストもゲストも低FPSだったことから、録画の重さをゲスト専用ロジックの不具合の証拠と扱わない。
- ユーザーの実iPad報告では、**ゲスト側がホストより重く見えた問題自体は残る**が、録画ほどの極端な動作不良ではない。学校端末での通常戦・混戦と役割交代の観察を採用判断に使う。
- 従って、ヘッドレス映像のFPSだけを根拠に画質・エフェクトを削らない。今後のCIは接続・戦闘・再戦・描画崩れの機能回帰検査を主用途とし、視覚の滑らかさの合格/不合格は学校Safariで確認する。

## 2026-10-22 ゲスト画面の再停止報告・一人用BOT参加【開発版】

**ユーザーによる症状の明確化（2026-10-22）：対戦をプレイしている最中に、ゲスト側の戦闘画面が突然止まる。** 退出ボタン、試合終了、新規ルーム、再戦、BOT座席退出時のフリーズを指した報告ではない。優先度の高い独立バグとして扱う。「退出清掃が実Firebaseで成功した」「再戦できた」等は途中フリーズの完治根拠としない。実機での1試合中、ホストは動くがゲスト表示だけが停止するケースの切り分けを優先。具体的には止まった時点の (1) ゲストのrAF進行・JS例外、(2) Firebase state.seq受信、(3) 最終game.apply seq、(4) host publish seq、(5) 描画自体の停止／ゲーム状態のみ停止 を別々に確認する。学校で貼り付けるまで本番Sites/mainは変更しない。



- **実機不具合報告**: 本人がスマホ/iPadで試行後、「昔も何回も起きているゲスト側の画面が固まっちゃうバグがあった」と再報告。これはこれまでの画質・滑らかさ調整より優先すべき機能障害。現時点で正確な発生条件/根本原因は未特定、完治は**未確認**。
- **コード上の停止要因候補**: `online-net.js` でゲストがFirebaseの最新スナップショットを受信しても、`requestAnimationFrame` の1回待ちで `game.apply()` するまで `remoteScheduled=true` のまま待機。Safari/Google Sites iframeでrAFが遅延すると最新状態が反映できない。追加対策: 可視タブで650ms以内にrAFが動かなければ最新スナップショットだけを反映し、rAFが動いた場合は通常通りに処理。既存ラウンド変更・退出時は古いfallbackをキャンセル。**これは描画そのものを再開させる保証ではなく、止まった受信反映キューの解消策**。
- **通信リスナーも停止したとき**: ゲームの毎フレーム処理とは別に、ゲストルーム中の1500ms軽量heartbeatを追加。`checkGuestSync` が既存の3.5秒/4.5秒閾値でREST復帰を試みる（ネットワーク正常時は追加RESTなし）。画面が非表示なら不要なチェックを抑える。退出でタイマー停止。
- **一人でオンラインルームを試す**: ホストのロビーに「🤖 BOTを参加させる/退出させる」を追加。BOTは実際のFirebase `players/guest` 座席を占めるが、**赤軍AI判断と攻撃判定はホスト端末の既存`botStep/botPreparation`で実行**。BOTのために第2のレンダリング端末やサーバー・ルームを増やさない。ホスト準備→対戦開始・再戦が可能。BOT席は通常ゲストと同様に`online:false,ready:false`で退出扱いとし、ホスト接続断にも`onDisconnect().update()`を登録。ルーム離脱後の更新失敗を受け、SDKの座席キャッシュを読み直してからID一致条件付きで退出処理を行う。友達が参加済みのルームではBOT参加ボタンは非表示。
- **保護対象**: 通常の2端末1v1、ゲストが自端末をBOT操作する既存機能、オフライン練習BOT、キャラ性能・Firebase本番設定・他ゲームの保存領域。自動対戦ログ収集は復活させない。
- **検証**: [Online 1v1 smoke #39781367035](https://github.com/8mahi8/shokoku-sensen/actions/runs/39781367035) SUCCESS。単体貼付けHTMLと分割JSの一致、BOT参加→ready→試合→再戦→BOT退出→ルーム退出、rAFを止めた後の650ms代替適用、前回の通信断/再送/ルーム遷移の模擬回帰を確認。新コードのブラウザ/実Firebase QAは別途確認が必要。
\n- **追加実Firebase QA結果（暫定）**: ホストがBOT席をFirebaseへ登録し、対戦を開始できるところまで実機代替Webブラウザで確認。[Run #39781858113](https://github.com/8mahi8/shokoku-sensen/actions/runs/39781858113) ではBOT退出後のFirebase座席清掃が不成功で、これを受け上記の通常ゲストと同じオフライン方式と座席事前読み直しを実装した。**再実測合格前に退出問題を修正完了と断定しない**。最新検証 [run #39783856319](https://github.com/8mahi8/shokoku-sensen/actions/runs/39783856319)。\n- **実機受入**: 端末1台の「オンラインルーム+BOT」はメニュー・召喚・戦闘・再戦の検証。**ゲストの固まりを再現/解消した証拠にはならない**。最後にスマホとiPadの2台でホスト/ゲストの役割を交替し、約1試合の途中でゲストが止まらないか確認。安定前にmainや公開Google Sitesへ入れない。

## 2026-10-22 過去コミットとの突合：同系統の退出/ゲスト停止修正は既存

1. [b26668f — 10/13](https://github.com/8mahi8/shokoku-sensen/commit/b26668fa97aee220aace6ab4c3118d470edd9014): **Firebase座席をonline:falseにしてから退出し、onDisconnectは保持**。当時の実装は `await ref.once` + `await ref.update` 後 `location.reload()` だったため、通信待ちが詰まると退出画面も固まる問題が残った。
2. [0a15669 — 10/18 V17](https://github.com/8mahi8/shokoku-sensen/commit/0a1566921d48c0a7981101b540f360e9fba1671b): ゲスト画面停止の別要因として、RTDBが空配列を省略するために描画スナップショット適用が失敗するケースを修正。配列正規化、rAFループの `try/finally` 継続、REST状態再取得・ホストスナップショット再送回復を導入。**現行の `online-game.js` には配列正規化とfinally再描画が残っている**ため、今回のゲスト停止を即座に同じ原因だと断定しない。
3. [7db1c98 — 10/20 PR #21](https://github.com/8mahi8/shokoku-sensen/commit/7db1c98cb51d9841f5f43941767c9972cbef932d): 学校の「新しいゲームで固まる」報告に対し、`resetLobby` の退出待ちとiframe再読込をやめ、先にロビーへ戻してから旧席 `transaction` を非同期実行する構成へ移行。ラウンド更新欠落・旧ルームのイベント混入も防止。**当時の検証は主に人間ゲストの退出・再参加とリスナー残存対策で、ホストが新規追加したBOT席を自動解放する実Firebase試験は存在しない**。
4. **今回の再発パターン**: BOT用の退出処理を、10/20型の旧リスナー解除後 `transaction` で実装してしまった。実Firebaseではホスト本人とBOT双方の `online:true` が残る再現ログがあり、何度か小変更しても改善しなかった。[run #39783152328](https://github.com/8mahi8/shokoku-sensen/actions/runs/39783152328)。前の10/13の「座席オフライン更新」、10/20の「画面遷移を待たせない」を同時に満たす設計へ戻すべきだった。
5. [81d2998 — 10/22](https://github.com/8mahi8/shokoku-sensen/commit/81d299836e50a6657c999f53749e48dba5938743): **保持した席ID/プレイヤー情報を確認し、旧ルームへ `update` 1回で host+BOT を同時に online:false / ready:false にする**。ロビー復帰は通信完了を待たない。この設計を変更するときは上記履歴を必読。
6. [実Firebase run #39785173571](https://github.com/8mahi8/shokoku-sensen/actions/runs/39785173571): **録画あり Chromiumホスト+WebKitゲストのjob 119846334570で実Firebase BOT参加→開始→退出がSUCCESS**。退室後 `players/host.online=false` と `players/guest.online=false`（双方ready:false）をHTTP読戻しで確認、一時2ルームの `CLEANUP: confirmed`。他条件のジョブが完了したとは限らず、実iPadでの確認は未実施。成功したのは `81d2998` のゲームコード（後続ドキュメント変更あり）。
7. 今後は**人間ゲスト退出/再参加とBOT席退出を別々の実Firebase受入ケース**として維持。さらにBOT退出→本物の友人参加、通信不能でもルーム画面遷移即時、ラウンド更新、ゲストRTDB空配列とrAF停止を回帰必須にする。

## 2026-10-18 実機で発生した「対戦途中のゲスト戦場停止」を2026-10-22報告と照合

- 2026-10-18、本人は**試合途中**のゲスト戦場画面が止まると報告。UIの操作は通るのに戦場表示のみ固まり、特に「ファイヤー」発動時に起きた。PC・iPadの組み合わせで「ゲスト側限定」と報告し、以前にも起きた症状だと明言していた。**新しいルームへ移るときのハング・再戦時のハング・単なる低FPSではない**。
- V17 [commit 0a15669](https://github.com/8mahi8/shokoku-sensen/commit/0a1566921d48c0a7981101b540f360e9fba1671b) では、RTDBが空のスペル・演出配列を省略/オブジェクト化することによる受信適用エラーを主原因として、ゲストの配列正規化、Canvasの `frame()` を `try/finally` で次回rAFまで保証、RESTで最新戦況を再取得する回復処理を導入。修正後に本人は実機で停止やカクつきがなかったと報告していた。
- **2026-10-22現行のコード実査**: `online-game.js` の `apply:(data,seq)` 内で `S.units/effects/projectiles/deaths` と `S.spells.incoming/zones` を `list()` 正規化し、`frame()` は `finally { requestAnimationFrame(frame) }` 相当の構造を維持。`online-net.js` は3.5秒の受信反映停止を検知して4.5秒間隔でREST復旧。今回の修正で650msの未反映受信fallback、1500ms heartbeatも追加。**旧V17修正が削除されたわけではない**。
- **テストギャップ**: 現行の `tests/online-browser-live.cjs` はファイヤー実発動→ホスト戦闘続行→REST再取得の成功を主に確認。途中でSDK受信を意図的に止めるため、**通常受信中、ファイヤーの前後を通してゲスト側でフレームが回り続けること/描画例外がゼロであることを連続検査する受入条件ではない**。また「ホストだけが進みゲスト戦場が止まる」自然発生の根本原因を示すログは得られていない。
- **次の開発優先順位**: (1) 同じ実Firebase+WebKitの戦闘中にファイヤーを複数回実行、同じルームでゲスト `__onlineSeq` とrAFフレーム数・`__onlineFrameError`・適用例外・ホストのseqを同時追跡、(2) 空配列省略/オブジェクト変換と実際の描画更新の回帰試験、(3) 学校Google Sites+iPad実機で確認。退出/BOT清掃に成功したことを中断フリーズ完治の根拠としない。安全のため本番Sites/mainは勝手に変更しない。

## 再発防止の固定ゲート：終了・再戦・ゲスト停止

- 本人が「前も同じことが起きた」と再指摘。**模擬テスト成功だけを根拠に「修正済み」「公開してよい」と書かない**。Firebase接続の実ブラウザ操作が成功し、テスト用ルームと一時データの清掃まで成功した実行IDを明記する。
- **退出条件（特にBOT）**: 1端末で実Firebaseへルーム作成→BOT赤軍を参加→準備/開始→退出→Firebaseの `players/host.online=false` かつ `players/guest.online=false` を確認。試合終了からの退出だけでなく、**試合進行中に退出する場合**も検証。離脱・再戦で古いルームの通知が次の試合に影響しないことを保証する。
- **BOT切替条件**: ロビーBOT参加→退出→友人ゲストが同席可能、友人がいるときはBOT追加できない、BOT戦からの再戦、ホストの突然の切断時のBOT席オフラインを確認。模擬試験で `players/guest` の `online` と `ready` の双方を検証。
- **ゲスト固着条件**: 既存の本番に近いFirebase SDKソケット切断→再接続、Firebaseリスナーの無応答、rAF停止、再戦時ラウンド切替を検証。rAFが再開できない時の受信状態反映と実描画フリーズは別の問題として追う。
- **2026-10-22 コード変更**: [81d2998](https://github.com/8mahi8/shokoku-sensen/commit/81d299836e50a6657c999f53749e48dba5938743) で旧リスナー解除後の `transaction` 2回から、保持している本人・BOT座席の同一ルーム `update` 1回に置換。単体・模擬QA [run #39785173750](https://github.com/8mahi8/shokoku-sensen/actions/runs/39785173750) SUCCESS、**実Firebaseの最終結果は独立に確認が必要**: [run #39785173571](https://github.com/8mahi8/shokoku-sensen/actions/runs/39785173571)。今後、この実Firebase退出チェックを省いて公開版への反映判断をしない。
- 古い成功runの結果を新コードの成功と取り違えない。**run SHAが採用候補のHEADと一致すること**を確認する。スマホ/iPadの体感は別途試験。

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


## 2026-10-26 学校iPad実機での本人報告：普段は良好、ときどき強いカクつき

- 本人が学校で試遊し、「**基本的にはめっちゃいい感じ**」「**たまにめっちゃかくかくになる**」と報告。この本人実機感想を、旧Linux/headless WebKitの約4～6FPS測定より優先する。**常時重いという旧問題は主観的にかなり改善**した一方、**一時的な激しいフレーム停止・通信更新停滞**の区別と原因特定は未完了。
- 本文時点で **Google Sitesへ貼った厳密なHTML版・カクついたのがホスト/ゲスト/両方か・同時に起きたか・兵士だけか画面全体か・発生時間・重いユニット/砲撃との関係は未確認**。最新版（10/25 Driveの原本一致HTML）を試したと決めつけない。
- 既存コード：`online-game.js` の `adaptCanvasQuality` は最初の3.4秒の低FPS評価後、ゲスト `guestLowPower` をその試合では保持し得る。 `adaptCrowdedSprites` は6体以上の連続/強いFPS低下で部隊描画キャッシュへ移行する。どちらも現状**今回の一時停止の原因だと証明されてはいない**。
- `online-net.js` は通常およそ125msごとにスナップショット送信し、Firebase書き込みの解決が止まった場合はリトライする。ゲストには最新のみ反映・rAF 650msフォールバック・REST再取得がある。**受信・描画・ホスト計算は別の停止原因**であり、単にFirebaseの送信間隔を詰めたり画質を落としたりしても根拠のある解決ではない。
- **次に必要な最小の実機区別**：強いカクつきは (A) ホスト・ゲストとも同時か、(B) ゲストだけか、(C) ホストだけか。これでホスト側処理/端末合成/ネットワーク切り分けの優先順位が変わる。任意でゲームタイトル3連打の端末内「通信・描画の診断」にある描画FPS・フレーム間隔最大・ゲスト更新/秒を利用。個人名・ルーム番号・対戦履歴・Firebase保存は不要。
- 新たな現象が確認できるまで**学校版・本番Firebase・対戦コードを不用意に変更しない**。根拠のないレンダラ品質劣化や既検証のCSS/Canvas負荷ABの再実施を避ける。


### 2026-10-26 本人追記：ゲスト側だけで再現

- 追加の本人回答：「**カクカクになったのはゲスト側だけだった**」。本人が学校で2端末対戦した際の観察。普段は快適だが、突発的にゲストのみ激しくカクつく。
- **優先度更新**：両端末共通のゲーム計算量・常時重いアートを主犯と決めず、(1) ゲスト自身のrAF/CSS合成・Canvas、(2) RTDB SDKの受信が一時止まる、(3) 受信後の`game.apply`/HUD差分更新負荷、(4) 学校側iframe/無線ネットワークの一過性停滞を中心に調査する。ホストが動いているだけではネットワーク問題と断定できない。
- **既存の回復機構**：`online-net.js` には125ms目安のホストスナップショット・ゲスト最新パケット優先・650msのrAF反映フォールバック・3.5秒超の受信停滞で警告およびREST再取得がある。`online-game.js` にはゲスト部隊の補間・3.4秒評価による描画品質制御がある。
- **切り分けの次の一手**：すでに搭載してあるタイトル3連打の診断表示で発生時の「描画FPS／フレーム最大間隔／通信guest更新回数・seq／SDK受信seq／適用時間」を見る。描画FPSだけ落ちて受信seqが進むならゲスト描画/合成、FPS維持で受信だけ止まるなら通信、受信進行で適用seqが止まるならゲスト反映経路が候補。発生時に診断が取れなければ過去記録から推測以上の断定をしない。
- 今回の本人回答に伴う**ゲームHTML・学校Google Sites・本番Firebase・main の変更なし**。実機でほぼ快適という現状を守り、根拠のない通信更新頻度変更、無条件画質劣化、同じレンダラAB試験の焼き直しをしない。


### 2026-10-26 本人追記：ゲスト全画面と召喚操作が同時に悪化

- 本人の追加観察：「**全体だったかなその時は、なんか兵士とか上手く出せなくなってた**」。前報の「ゲスト側だけカクカク」と組み合わせ、**ゲストに限定した全画面の一時的カクつき＋召喚の反応低下**を最優先の再現対象にする。兵士の歩行補間だけの問題とは扱わない。
- ゲームコードで、`onGlobalUp`（カード選択）時に`buildCards()`が5枚のカードDOMとCanvas肖像を毎回再生成していた。さらに、ゲストで召喚指示を送った直後も、ホストの確定スナップショットを待つ前に同じ5枚のCanvasを再生成していた。これはタップ時の余計な同期負荷として特定できるが、**観察された突発的なゲスト全画面停止の主因と証明できたわけではない**。
- 開発コミット [e8c3b699](https://github.com/8mahi8/shokoku-sensen/commit/e8c3b6991dad8150d8e229f907b6f11c82d97f22) で、選択時およびゲスト送信直後は**選択CSSだけ変更**するよう修正。実際の手札回転・勝敗・エネルギー・ホスト権限・Firebase通信は不変。学校貼り付け用2種HTMLも同コミットで同期。
- 同コミットで、ゲストの**画面フレーム間隔が450ms以上**のときだけ直近1件を端末メモリ上に一時記録（最大間隔、受信seq、適用seq、各経過時間、兵士数）。タイトル3回タップの既存任意診断UIであとから確認可能。**Firestore/RTDB/Drive/研究ログへ書き込まず**、次のロビーで消去。ホストや背景タブは対象外。
- 最初の [smoke run #40308915841](https://github.com/8mahi8/shokoku-sensen/actions/runs/40308915841) は、**既存テストが抽出した`playCard`のモックに新helperを渡さなかったためFAIL**（ゲーム本体の実行エラーを意味しない）。テストを修正した [commit 680c65d2](https://github.com/8mahi8/shokoku-sensen/commit/680c65d26f1c0746dfcf262aabcb669d02b50382) に対する [Online 1v1 smoke #40309053504](https://github.com/8mahi8/shokoku-sensen/actions/runs/40309053504) は**SUCCESS**。
- **今回の学校での「基本は快適」という安定版は一切変更していない**。これらはDraft PR #22内の次の試遊候補。実学校端末での効果は未検証で、描画負荷・通信状態を今後切り分けるための措置。


## 2026-10-26 実Firebaseで1試合を最初から終了まで連続計測（短時間ベンチではない）

- **本人の提案**：「1試合まるまるちゃんとしたら、ラグが確認できるのでは」。これを受け、新規 `tests/online-full-match.cjs` と `.github/workflows/online-full-match.yml` を追加。直接貼付け版と同じゲームJSで、localhostのテストサーバーから **Chromiumホスト + WebKitゲスト** を2ブラウザ起動し、双方が実Firebaseの使い捨てルームへ入り、**試合時間を飛ばさず**通常のゲームループで兵士を交互に召喚する。
- [**GitHub Actions Full match guest-stutter QA #40334799077**](https://github.com/8mahi8/shokoku-sensen/actions/runs/40334799077) **SUCCESS**。**壁時計310.6秒・ゲーム内300秒**で時間切れ決着まで完走。開始から終了まで5秒おきに58回、双方のフレーム間隔・描画JS時間・ゲスト受信seq/反映seqの遅れ・エラーを記録。マウス由来のpointer入力をPlaywrightで定期操作した結果、**41回の召喚試行が全件Firebase上の部隊ID増加で確認できた**。ゲストの一連の操作+確認の最大は558ms（単純なタップ処理時間だけではなく確認ポーリングも含む）。未処理ブラウザJSエラー0、作成したテスト用Firebaseルームは終了後削除・再読込でnullを確認。
- **テスト内の最大のフレーム間隔**：ゲスト**187ms**、ホスト**33ms**。ゲストの**500ms以上／1000ms以上のフレーム間隔は0回**。ゲストのスナップショット最終反映からの経過時間最大は**257ms**。この1試合では、本人の言う「画面全体が急にカクカクし、召喚しにくくなる」強い停止は再現せず。
- **解釈の限界**：CIのLinux/headless WebKitは学校の旧iPad Safari/Google Sites埋め込みiframeとは環境が違う。WebKitゲストは通してホストよりFPSが低く、**平均的な表示の滑らかさが実iPadと同等だとはみなさない**。テスト操作はPlaywrightのマウスポインターイベントであり、iPad実際の指によるタッチイベントとは完全一致しない。部隊数は途中概ね10体程度で、攻撃演出や混戦30体以上の再現を保証しない。**単発完走で断続的な学校不具合を完治と判定しない**。
- **今後の合理的な次段階**：学校サイト風iframe内でWebKitの実タッチ入力と複数枚カード選択・密集戦を行い、可能なら全試合測定の比較。恒常的な処理の軽さ・画質を壊さず、今回記録した**ゲスト単独の全画面停止／入力遅延**の再現を優先。過去の5秒・1.5秒テスト結果を「全試合テスト済み」と誤記しない。
- 学校Google Sites版、本番Firebaseルール、main、従来Drive配布ファイルは変更していない。

## 2026-10-26 実BOT対BOTオンライン対戦：AI同士が勝敗までプレイ

- 本人から「ただ歩兵を定期的に置くのでなく、BOT対BOTで普通に試合する」要望。localhostの`?qa=1`限定で、実戦BOT `botExpertAction(1)` をホスト青軍にも動かし、ゲストWebKit赤軍は既存の本物のオンライン `guestBot` を使用。戦闘物理・コスト・Firebaseコマンド・ゲーム内経過・首都破壊の実判定を省略しない。テストコードは`tests/online-bot-vs-bot.cjs`、CIは`.github/workflows/online-bot-vs-bot.yml`。通常学校版のBOT機能は変えない。
- [**BOT対BOT GitHub Actions #40339084192**](https://github.com/8mahi8/shokoku-sensen/actions/runs/40339084192) **SUCCESS**。壁時計**138.3秒**、ゲーム内**127.3秒**で首都が破壊され決着。青軍BOT実行カード**13回**、赤軍ゲストBOT送信**11回**、ホスト青軍BOT判断機会41回、戦場の同時最多兵士11体。JS未処理エラーなし、テストルーム削除とnull確認。赤軍側の送信件数はホストによる全件確定承認数ではない。
- ゲスト最大フレーム間隔**345ms**（ホスト33ms）、500ms以上の描画間隔なし。**最終スナップショット適用からの経過時間最大2895ms**、描画JS最長30ms。約2.9秒の値だけで「通信不調が原因」と決めず、SDK受信時刻・フレーム停止の同時性を次回照合する。学校の旧iPad Safari/Google Sites iframeではなく、Linux/headless WebKitの結果。
- 最初のGitHub Actions実行はブラウザ環境構築が長時間停止。Playwrightブラウザ同梱のコンテナに移行して実戦を成功させた。**学校Google Sites版・main・Firebaseルール・Drive既存候補には未反映**。

## 2026-10-26〜27｜実Firebase BOT対BOT：ゲストのSDK受信停滞とホスト送信停滞を分離

詳しくは [診断資料](GUEST_SDK_STALL_DIAGNOSIS_2026-10-26.md)。

- [最初のBOT実戦 #40339084192](https://github.com/8mahi8/shokoku-sensen/actions/runs/40339084192) SUCCESS：15.6秒地点でホスト送信試行seq120・ゲストSDK受信/適用seq98。SDK受信から2,898ms、状態適用から2,895ms。ゲストの同じ5秒描画窓は84フレーム、最大間隔82ms。ゲストSDKに状態が届く前の経路が有力だが、ホスト送信試行seqはサーバー保存完了の証明ではない。
- [因果検証のBOT実戦 #40342942177](https://github.com/8mahi8/shokoku-sensen/actions/runs/40342942177) SUCCESS：14.1秒地点にホストseq97／RESTサーバーseq97／ゲストSDK seq82・適用seq82を確認。SDK受信無応答1,950ms、ホストACK50ms、書込失敗0件。SDK受信よりサーバーが進んでいる事象を実測。計測追加 [dfac671c](https://github.com/8mahi8/shokoku-sensen/commit/dfac671ce385163af62094187ebe2b8f40759424)はテスト専用・実戦BOT・REST GET・CI artifactのみ。
- [対策commit f97c788a](https://github.com/8mahi8/shokoku-sensen/commit/f97c788a0ef3d2d2ab8bc7bc60f93dc7a03a92a4)：ゲストSDKイベントと状態適用がともに1,600ms以上滞る場合だけ既存REST再取得を早める。SDKが正常なときは元の3,500ms描画フォールバック維持。短い停滞では警告を出さない。RESTで取得したseqはSDK受信seqに混ぜず診断を分離する。戦闘ルール・送信頻度・画質は無変更。
- [HTML同期commit 649eb5af](https://github.com/8mahi8/shokoku-sensen/commit/649eb5afc33f062069cfa1a66531086a6eb90d9f)：`online-net.js` と `online-ipad.html`／`online-embed.html` 内の通信ソースを完全一致させた。中間smoke失敗はもう一方のHTMLに古い通信コードが残ったため。最新版 [smoke #40344599076](https://github.com/8mahi8/shokoku-sensen/actions/runs/40344599076)、[WebKit HUD #40344599044](https://github.com/8mahi8/shokoku-sensen/actions/runs/40344599044)、[キャッシュ画像 #40344599111](https://github.com/8mahi8/shokoku-sensen/actions/runs/40344599111)は全てSUCCESS。
- [修正後BOT実戦 #40344384040](https://github.com/8mahi8/shokoku-sensen/actions/runs/40344384040) SUCCESS：ゲーム内258.1秒、青BOT26回・赤BOT30回、最大11体、ゲスト最大フレーム間隔437ms、500ms以上0、JSエラー0、一時ルーム清掃成功。SDKよりRESTが進んでいた自然発生の停滞2回。
- [最新版BOT実戦 #40344599098](https://github.com/8mahi8/shokoku-sensen/actions/runs/40344599098) SUCCESS：ゲーム内300秒・時間切れ決着、最大20体、ゲスト最大フレーム間隔182ms、500ms以上0、JSエラー0、一時ルーム清掃成功。309.4秒時点、ゲストSDK seq2071のままRESTは2085に進み、ゲストはRESTでseq2084を適用済み（適用から37ms）という復帰を確認。一方、144.8秒地点で適用から3,913msの停滞が残る。同じ約5.5秒でホスト送信試行seqは993→1007の14増に留まり、通常の125ms目安より遅い。SDKだけではなくホスト送信パイプライン・RTDB側の停滞の可能性も調査が必要。
- **次の検証**：実BOT対BOTテストに、ホスト最終送信からの経過・ACK・再試行・書込失敗と、ゲスト停滞時の実REST seqを追加。ホストに新しい書き込みがないのか、RTDBには届いていてSDKだけ止まるのかを分離。根拠なくホスト再送頻度を上げたり品質を下げたりしない。学校実機問題の完治は未確認。
- 主な操作対象は開発Draft PR #22だけ。**学校Google Sites版、main、本番Firebaseルール、既存Google Drive貼付ファイルは変更していない。**


### 2026-10-27｜ホスト送信・ゲストSDK・RESTを同時照合（BOT対BOT実Firebase）

- [run #40346406655](https://github.com/8mahi8/shokoku-sensen/actions/runs/40346406655) **SUCCESS**、試験対象commit `628622fa`、成果物 `online-bot-vs-bot-real-match` の `bot-vs-bot-results.json` を解析。
- 壁時計315.9秒／試合内300秒のBOT実戦完走、青BOT32回・赤BOT33回、最大19体。ゲスト最大フレーム間隔349ms（500ms以上0件）、ホスト最大33ms、ゲスト最長描画JS35ms、JSエラー0件、実Firebaseテスト用ルーム清掃はCI通過。
- 停滞REST検査6回（ロビー1回＋試合中5回）。**試合中5/5回でREST seqがSDK seqを先行**。うち3件はホスト最終送信試行から117〜130ms、ゲストSDK無応答1650〜2029ms、REST先行12〜16seqで、受信SDKイベント停滞が有力。残る2件はホスト側にも1722ms・2062msの送信空白があり、送信経路側の要因も残る。詳しくは [ゲストSDK停滞診断](GUEST_SDK_STALL_DIAGNOSIS_2026-10-26.md)。
- 開発PR #22内のSDK無受信1600msからのREST再取得は維持。既存テスト（smoke、HUD WebKit、キャラクター画像、BOT実戦）で後退が見つかっていない。ただし学校iPad/Google Sites実機での突発的な全画面停止・入力低下の解消は未確認。**学校Google Sites版、main、Firebaseルールは変更していない**。


### 2026-10-27｜ゲスト実画面の動画レビュー（画面の固着を直接確認）

- QA用録画を追加した [commit `d4ce955`](https://github.com/8mahi8/shokoku-sensen/commit/d4ce955639303bf4e36daa6ade39854629828641) で [BOT実戦 run #40349273524](https://github.com/8mahi8/shokoku-sensen/actions/runs/40349273524) **SUCCESS**。Artifact `online-bot-vs-bot-real-match` にゲスト画面の約189秒動画 `bot-vs-bot-guest-full-match.webm` とデータを保存（14日間）。
- 壁時計186.8秒、ゲーム内176.1秒で首都破壊決着、青15・赤19アクション、最大11体、JSエラー0。最大ゲストフレーム間隔197ms、500ms以上0件。
- **録画フレームの直接レビュー**：91.6〜93.8秒頃は約2.2秒間、兵士と残り時間「03:43」がほぼ停止し、直後に「03:41」へ飛んだ。数値の「長い描画停止0回」とは異なり、**世界の状態更新停滞が視覚的なフリーズとして現れる**実例を確認。別の短い停滞も観測。対応するSDK無受信／ホスト送信空白があるが、一因への断定は不可。
- 切り出し方法とソース動画の出所、限界は [SDK停滞診断](GUEST_SDK_STALL_DIAGNOSIS_2026-10-26.md) に記載。学校実iPadおよびGoogle Sites埋込での同じ症状の再現・操作体感の改善は**引き続き未検証**。学校版・main・ルールは変更なし。


### 2026-10-27｜同時録画によるゲスト固着の確認と限定回復策

- [両視点動画つきBOT実戦 #40352533153](https://github.com/8mahi8/shokoku-sensen/actions/runs/40352533153) SUCCESS。実Firebaseで最後まで対戦、ゲスト最大フレーム間隔217ms・500ms以上0だが、SDKが2,252ms無受信、ホスト最終送信は114ms前、REST seq929がSDK seq924を先行。ゲスト画面の試合時計表示が約3.4秒変わらない区間を録画から確認。**rAFが動いていても戦況が静止して見える**。
- [限定修正commit `8cd0638e`](https://github.com/8mahi8/shokoku-sensen/commit/8cd0638e5f64d61a61ecc2f2b8d04be42e18d345)：SDKイベントとゲスト状態適用が止まった場合のみ、1,100msでREST回復開始、最短2,200ms間隔で再試行。SDK正常時・戦闘ルール・画質・ホスト送信頻度は変えない。[修正後のBOT実戦 #40353330150](https://github.com/8mahi8/shokoku-sensen/actions/runs/40353330150) SUCCESS。壁時計166.2秒、試合内154.9秒、ゲスト適用経過最大534ms（5秒間隔サンプル）、SDK最大2,091ms無受信中もREST seq930の前進を確認。別々の録画での試合時計最長静止は約3.4秒→2.0秒だったが厳密なA/Bではない。
- [キャッシュ誤認対策 `dfe5961f`](https://github.com/8mahi8/shokoku-sensen/commit/dfe5961f5506f7f98b0ee59ae9b7faaa0fc2df34)：REST失敗後のSDK単発 `once` をリアルタイムリスナーイベントと混同しない。[smoke #40354890270](https://github.com/8mahi8/shokoku-sensen/actions/runs/40354890270) SUCCESS。貼り付け用 `online-ipad.html`／`online-embed.html` も同期済み。
- [詳細な目視・プローブ記録](GUEST_SDK_STALL_DIAGNOSIS_2026-10-26.md)。Linux headless WebKitの結果は学校iPadの合格保証ではない。**学校Google Sites版・main・Firebaseルールは未変更**。


### 2026-10-27｜最新のキャッシュ誤認対策まで含めたBOT実戦・動画QA

- [実Firebase BOT対BOT実戦 #40354890152](https://github.com/8mahi8/shokoku-sensen/actions/runs/40354890152) **SUCCESS**、対象のゲームコードSHA `dfe5961f5506f7f98b0ee59ae9b7faaa0fc2df34`。壁時計261.7秒、ゲーム時間250.7秒で実際に首都破壊決着。青BOT29手、赤ゲストBOT28手、同時最多11体、JS未処理エラー0、実Firebase試験ルーム清掃PASS。ゲストとホスト両方の試合全体の録画がartifact `online-bot-vs-bot-real-match` にある。
- **映像だけでなく数値も確認**：ゲスト最大フレーム間隔517ms、500ms以上のフレーム窓は**1件**、1000ms以上0。ゲスト5秒定点サンプルの最大適用経過1596ms。SDKイベント無受信の最大3960msに対し、9回の停滞REST照合の**全9回でサーバーのseqがSDK受信seqを上回った**。例：壁時計147.4秒にSDK seq908・無受信3960msでも、REST seq938・最新適用seq936／適用から143ms。SDKイベントが止まっていてもRESTが救済している。
- **限界**：実際の試合中に500ms超の描画間隔が1件残る。SDK受信が止まっても常に1秒以内に表示更新する保証はない。ホスト側送信の一時停止、旧iPadの低FPS、Google Sites埋込iframeの負荷も残る。録画の主要場面を抽出し目視したが、実iPadで突発カクつき解消を保証しない。
- 同SHAに対する [Online smoke #40354890270](https://github.com/8mahi8/shokoku-sensen/actions/runs/40354890270)、[WebKit HUD #40354890170](https://github.com/8mahi8/shokoku-sensen/actions/runs/40354890170)、[ブラウザ戦闘視覚 #40354890106](https://github.com/8mahi8/shokoku-sensen/actions/runs/40354890106)、[実Firebase 2ブラウザ #40354890228](https://github.com/8mahi8/shokoku-sensen/actions/runs/40354890228) はSUCCESS。キャラ絵QA #40354890060 とiPad UI #40354890119はジョブがcancelされたため、同SHAのジョブをそれぞれ再実行依頼済み（結果を確認するまで合格と書かない）。
- 学校Sites用 `online-ipad.html`／`online-embed.html` は修正後 `online-net.js` を内包し、smokeの全文一致検証を通過。**学校Google Sites・main・Firebaseルールの変更なし**。開発PR #22はDraft。


## 2026-10-27 再発防止：キャラ描画キャッシュ初回生成のフレームスパイク

- [実装 b48081fb](https://github.com/8mahi8/shokoku-sensen/commit/b48081fb80b731fb1b0ff9e084b377be0d19014f) は、低FPS時のポーズタイル生成枚数を**毎フレーム最大2**へ分散し、キャッシュ待ちは通常のキャラ絵を描画する。既存のJS描画一般、CSS、HUD、RTDB送信間隔の実験とは別の**切替初回スパイク対策**。
- [WebKitキャラ画像検証 #40488358769](https://github.com/8mahi8/shokoku-sensen/actions/runs/40488358769) SUCCESS。10体の実ゲーム戦場で**新規2・2・2タイル／3フレーム**と分散、生成終了後10体は全員キャッシュ絵で表示。最初のフレームは7体、次は4体のキャラが通常のフルアートのままで欠落しない。72通りのキャッシュ絵で切れ・欠けなし、再戦で表示品質を初期状態へ戻す。
- [smoke #40488504924](https://github.com/8mahi8/shokoku-sensen/actions/runs/40488504924) SUCCESS。[通常BOT実Firebase #40488358990](https://github.com/8mahi8/shokoku-sensen/actions/runs/40488358990) SUCCESS（ゲーム190.8秒、ゲストの最大rAF間隔278ms、0.5秒以上のフレーム停止0、JS例外なし、最大10体）。このBOT実戦はQAの仕様上、自動キャッシュ切替を無効にしていたので、タイル枚数上限の実戦根拠とは**扱わない**。
- 本番同等のキャッシュ切替を有効化するBOT QA変更は [bed2b7d6](https://github.com/8mahi8/shokoku-sensen/commit/bed2b7d6691239d7ecef2b4e89e301287f8d652e)。最初のCIはQA文字列に `async()=>>` という構文誤りが入り起動前停止。ゲーム側の不具合ではない。修正版 [aee9710a](https://github.com/8mahi8/shokoku-sensen/commit/aee9710a2a3f474b847e30fb662d5fba5969a4cb) 後のrun [#40489499643](https://github.com/8mahi8/shokoku-sensen/actions/runs/40489499643) が対象。
- **性能主張の境界**：異なる試合のmax rAF gap比較から改善率は推定しない。headless WebKitのrAFはiPad Safari実機のFPSではない。Canvas内JS処理で説明不能な長いギャップも残り、単発フレームスパイク以外のカクつきに対して根治は未証明。学校Google Sites版を上書きせず安定版を温存。


### 2026-10-27 低FPSアート切替の実Firebase最終結果

- [BOT実戦 #40489499643](https://github.com/8mahi8/shokoku-sensen/actions/runs/40489499643) **SUCCESS**。低FPS自動切替をlocalhostでも明示ONにし、実FirebaseのChromiumホスト＋WebKitゲストで**ゲーム時間300秒を完走**。青45手/赤32手、最多17体、JSエラー0、ルーム清掃確認。WebKitゲストのキャッシュタイルは最大58枚、新規ビルドは**描画1フレーム最大2枚**。ゲスト最大フレームギャップ270ms、500ms以上0、JS描画最大34ms、SDK受信経過最大219ms、スナップショット適用から最大225ms。生成上限が**実戦中に実際に守られた**直接証拠。
- artifact `online-bot-vs-bot-real-match` ID 12728326226 のゲストフル録画315秒/960×672を回収。20〜295秒の12場面と112〜125秒の交戦を画像・映像で目視。該当場面に明らかなキャラ欠落なし。ただし学校iPadとは異なるLinux headless WebKit。**性能改善率は試合条件の異なる旧実戦と比較して断言しない**。

## 2026-10-30｜Stage 2・実Firebase戦闘映像と継続観測（新カード20回・36秒）

- **対象CI**：[Online Stage-2 sustained match observation #40918829528](https://github.com/8mahi8/shokoku-sensen/actions/runs/40918829528) は `completed/success`。開発ブランチ専用の `tests/online-stage2-match-observation.cjs` と `.github/workflows/online-stage2-match-observation.yml` を追加。学校公開版・main/stable・Firebase Rules・対戦AI・キャラ数値は変更していない。
- **試合条件と限界**：Chromiumホスト（`online.html`）＋WebKitゲスト（`online-ipad.html`）、同じ実Firebase一時ルーム、実タップで両陣営のデッキから各10回カード使用（合計20回）、**序盤の資源だけQA補充**。その後は本物の30Hzホスト戦闘処理とFirebase状態配信のまま**36秒ほど継続観測**。開始時約20体、観測中のピークは24体（両端の同時観測で確認）、終了時9体。最終勝敗までを自然決着させたフルマッチではなく、実戦中の連続ストレス試験。ルームは終了時に HTTP 200 で削除。
- **映像を実際に確認**：GitHub Actionsの録画WebM（約64秒）からゲーム中17〜61秒の12時点を抜き出して確認し、同じ試合のホスト／ゲスト各6枚のスクリーンショットを左右に並べて確認。両画面で投石器・爆撃機・子兵・円形のスペル効果・交戦位置の変化を視認。極端な画面崩壊やゲストの長時間停止は見当たらず。ただし画質／動きの「滑らかさ」は別。
- **実測**：連続観測の終了時点、直近約1000フレームの `gapMs`：Chromiumホスト p50=16.7ms / p95=16.7ms / 最大50ms、WebKitゲスト p50=31ms / p95=81ms / p99=103ms / 最大302ms。ゲストは100ms超の長い間隔が12回、250ms超が1回。CanvasのJS `drawMs` p95はホスト1.1ms、ゲスト7ms。WebKitで**描画間隔のばらつき・見た目のカクつきが残る**。これらはGitHub Actions上のヘッドレス＋ゲスト動画録画あり条件であり、学校iPad FPSとは呼ばない。
- **通信比較**：ゲスト `seq` は観測36秒ほどで265進み、両者の `elapsed` 増分は35.73秒／35.74秒。21サンプルでホスト−ゲスト試合経過時間差は平均約0.15秒、最大約0.27秒。両席に同じ `uid` があるユニットの位置ずれp95は各サンプル最大7.5ワールド座標。Firebaseのゲスト更新速度は観測中約6.7〜8.9回/秒、受信済み世界の経過時間は中央値約72ms、最大約209ms。**通信断・ゲスト側の試合時計停止は観測されない**が、ネットワーク遅延の確定診断にはこの片条件だけでなくネットワーク/SDK対照が必要。
- **解釈**：今回の強い観測事実は「通信状態は進み続けるが、ゲストのWebKitでフレーム生成が不均一」。しかし Chromiumホスト/WebKitゲストでブラウザエンジンが異なるため、**ゲスト役自体が遅いとは確定不可**。既存の同条件WebKit同士比較（本資料 #39772223658）では両端の描画が遅かった。過去に不採用としたCSS/Canvas/HUDの思いつき修正を再実行せず、学校の同型iPad2台で役割交代＋実体感を最終判定とする。
- **再現と証拠**：`node tests/online-stage2-match-observation.cjs`（Playwright 1.56.1・Node22・実Firebase到達可能なActions環境）。成果物はWorkflow artifact `stage2-sustained-match-screenshots-video-lag` の `metrics.json`、`host-*.png`、`guest-*.png`、`*.webm`。動画の25fpsエンコード値をゲームFPSと混同しないこと。

## 2026-10-30｜Stage 2 20体同数開始ストレス・旧ユニット/新能力/子兵の切り分け

- **目的**：「新ユニット追加で学校iPadのラグを再発させたか？」という懸念に対し、まず**同一開発版**で新能力を使った条件と既存ユニットだけの条件を比較して、JS処理・Canvas・WebKit rAFを分離する。学校公開・main・安定版・戦闘コード・Firebase設定を一切変更せず、**テストコード** `tests/online-stage2-load-profile.cjs` とWorkflow `.github/workflows/online-stage2-load-profile.yml` を追加した。
- **結果**：[GitHub Actions #40924093598](https://github.com/8mahi8/shokoku-sensen/actions/runs/40924093598) は **completed / success**。WebKit各シーン2回、Chromium各シーン1回（合計12回）。GitHub artifact `shokoku-stage2-twenty-unit-load-profile` には12枚の画面PNGと全トライアル `load-results.json` がある。実ファイルを回収し、全8種の代表画面をコンタクトシートで直接目視。主要キャラ/場/カード画面は表示されていたが、**テスト用強制同座標密集でキャラが重なるため、通常の美観や個別子兵の視認性合格には使わない**。
- **方法**：localhost `?qa=1` の一時HTMLだけにfixtureを注入し、元の `online-game.js` `unitStep`、`spellStep`、`draw`、`KokokuArt` を実行。1194×834・DPRを明示的に1へ設定、録画なし、開始20体・ウォームアップ0.9秒＋戦闘3.5秒を各々独立新ブラウザで実行。旧兵20体 `old20`、第2段階の貫通/投石/自爆/召喚を20体 `new20`、同配置＋引力2箇所 `gravity20`、子兵16＋召喚師2＋ゴーレム2で20体 `child20`。最後の3シーンは**QAによる高密度の強制配置**なので実デッキのコスト・陣地制約下で同時再現可能だという主張ではない。自然な戦闘の一部として `new20` は開始20体→最大22体、`gravity20` 最大21体まで変わっており、**全サンプル完全同数ではない**。
- **測定は各runのp95、同エンジン同シーンの複数runがある場合p95の単純平均**。短い試行を合体した正確なp95ではない。

| 開発版同条件20体開始 | WebKitフレーム間隔 p95 | WebKit Canvas描画 p95 | WebKit ロジック p95 | Chromiumフレーム間隔 p95 |
| --- | ---: | ---: | ---: | ---: |
| 既存ユニット `old20` | 119ms | 10.5ms | 1ms | 16.8ms |
| 新ユニット `new20`（最大22体） | 149.5ms | 9.5ms | 1.5ms | 16.7ms |
| `gravity20`（最大21体） | 132.5ms | 10ms | 2ms | 16.7ms |
| 召喚師＋子兵16 `child20` | 74ms | 6.5ms | 1ms | 16.7ms |

- **結論の強さ**：WebKit `new20` で元兵20体よりp95 rAF gapが長かった（119→149.5ms）ため、**全く悪化の兆候がないとは言えない**。ただし兵種・絵・位置/衝突・攻撃・生成数・戦況が違い、2×3.5秒のheadless CIという小標本。Canvas draw p95とロジック p95が同程度で、安定版ですらheadless WebKitが遅い旧証拠と整合。新能力のどこが原因かは**未特定**。16体の子兵そのものでは本実験でCanvas/ロジックの重大悪化は再現せず、ブラウザ種別で結果が大きく変わる。ゲスト役割差・Firebase同期は未測定（ソロ）。
- **採用判断**：旧版で実機合格した通信・画質・AIを変える理由は今はない。任意の大規模最適化・低画質化は不採用。実iPad/Sitesの旧安定と新開発のA/Bで体感差が出たとき、物理端末の同じシーンと同じ計測診断で原因を絞る。新能力の自然な友人戦・長時間プレイ・同数同配置の厳密負荷評価は別条件。今回の合格を「学校実機60FPS保証」と呼ばない。

## 2026-10-30｜学校ゲストの一瞬のカクつき：描画・通信を分けたStage3追加調査

**学校からの実報告**：以前の安定版よりゲストが時々カクつくが、基本は遊べる。原因はまだ未特定。学校用コードの変更やDriveへの再保存は指示されていない。

**今回の実検査**：`tests/online-stage2-load-profile.cjs` にStage3怪獣を含む20体の混成負荷`stage3-plain`と、同一編成20体へ疾風号令の期限付き効果をQA注入する`stage3-gale`を追加。旧4シーンも再測定。WebKit 2回/条件・Chromium 1回/条件、合計18シーン。GitHub Actions [#41038098220](https://github.com/8mahi8/shokoku-sensen/actions/runs/41038098220) **completed/success**。本体の`online-game.js`・`v3-art.js`・`online-net.js`・HTML・バランス・AIはこの調査では変更なし。

| 20体開始の合成ストレスシーン | WebKit p95フレーム間隔 | WebKit p95 Canvas JS描画 | WebKit p95ロジック | Chromium p95フレーム間隔 |
|---|---:|---:|---:|---:|
| 既存兵 old20 | 76ms | 7.5ms | 1ms | 16.7ms |
| Stage2新混成 new20 | 102ms | 6.5ms | 1ms | 16.8ms |
| Stage2＋引力 gravity20 | 96.5ms | 8ms | 1ms | 16.7ms |
| 子兵16体含む child20 | 56.5ms | 3.5ms | 1ms | 16.7ms |
| **Stage3怪獣を含む stage3-plain** | **88.5ms** | **6.5ms** | **1ms** | **16.7ms** |
| **同編成＋20体疾風効果 stage3-gale** | **95ms** | **8ms** | **1ms** | **16.7ms** |

数値は各試行のp95を単純平均した参考値。実Firebase通信なし、Windows/iPadとは異なるLinux headless WebKit/Chromium、1194×834・Canvas DPR1、試合の人工的な20体配置、0.9秒準備＋3.5秒計測という条件。新規召喚などで観測中のユニット数/位置は変動し、疾風号令の一斉付与は通常の合法なスペル発動場面ではなく**描画上限の合成試験**。ステージ間・試行順の変動があるため、疾風号令が6.5msのフレーム間隔悪化を引き起こしたと**断定不可**。長時間での稀な一時停止や実iPadの体感は測れていない。

**コード比較と解釈**：固定安定版`99a0d1d`とStage3の主要ネットワーク関数`packGuestWorld/receiveGuestWorld/maybePublish/sendCommand/checkGuestSync/syncDiagnostics/flushGuestBeforePaint`および`frame/tick/presentRemoteUnit`は本文一致。新キャラ絵、追加攻撃、状態バフ表示は差異。通信なしでもWebKitのrAF間隔とCanvas JS描画時間に大差があるので、ブラウザの合成/レンダリングスケジューリングも候補。これは**描画経路の疑いを支持するが、学校でのカクつき原因を特定した証拠ではない**。公式WebKitの[Timelines](https://webkit.org/web-inspector/timelines-tab/)はJavaScript/レイアウト/描画/合成を別々に見る方法を示すが、学校Safari実機のWeb Inspectorは今回使用していない。

**次**：`stable/school-ipad-20261028-99a0d1d`を保護したまま学校の同じ端末で旧版/Stage3版、双方の役割・同程度の部隊数を比較。既存タイトル3タップの診断にある描画FPS/フレーム最大間隔とSDK受信/適用シーケンスを、発生前後で照合する。画面更新だけ止まり受信が進むなら描画・合成側、FPS維持でstate受信が止まるなら通信側、両方進むのにユニット表示だけ飛ぶなら補間側を優先。WebKit CIだけで大規模低画質化、固定FPS制限、送信頻度変更、通信全面改修を行わない。

## 2026-10-30｜Stage3実Firebase/WebKit：フレーム遅延と受信・描画の同時刻診断

**きっかけ**：学校実機でゲストは概ね快適だが時々カクつき、以前の安定版では気にならなかった。通信だけでなくCanvas、画像キャッシュ、WebKitの更新処理を調査。

**新しいQA**：`tests/online-stage3-firebase-hitch-trace.cjs` と `.github/workflows/online-stage3-firebase-hitch-trace.yml`。実Firebaseに接続したChromiumホストとWebKitゲスト、localhost用にだけ注入した怪獣・大型・新旧ユニット混成20体の戦場を試験。実際のホスト30Hz戦闘と約125ms RTDB配信／ゲストCanvas描画を維持。診断用に90ms以上の各フレームについてCanvas描画、JSフレーム合計、SDK受信seqと経過時間、ゲスト適用seqと経過時間、キャッシュ新規生成枚数を照合。これは**学校用HTML・ゲーム本体への新しい計測コードや通信は追加しない**方式。動画録画なし。各シーン16.5秒、戦闘中も自然なダメージ・召喚あり。ただしQAによる20体同時強制配置であり、学校の通常デッキ戦の密度／戦況と同一ではない。

- **初回試験 [#41040552470](https://github.com/8mahi8/shokoku-sensen/actions/runs/41040552470)** は2シーンの計測自体は成功したが、終了時のFirebase一時ルーム削除確認が失敗したためワークフローは**failure**。旧版と同じく接続中のRTDBクライアントが削除直後に存在情報を再書込した可能性があるが、原因未確定。数値だけを参考にし、全体成功扱いしない。
- **修正試験 [#41040834899](https://github.com/8mahi8/shokoku-sensen/actions/runs/41040834899)** は**completed/success**。本番と同じ低FPS時スプライトキャッシュ自動切替をQAでも有効にし、ブラウザ接続を閉じた後850ms待って削除・読み戻し。Firebase一時ルームはDELETE 200、GET 200/nullで削除確認。
  - 最初の`plain`混成シーン：ゲストp95 rAF間隔133ms、Canvas JS描画p95 12ms、最大フレーム間隔250ms。250msのフレームではCanvas描画10ms・SDK受信41ms前・最新状態適用11ms前で、**その瞬間は受信も反映も進んでいた**。スクリーンショットは実際に取得して目視済み。大きな崩壊／キャラ消失なし、ただし強制密集による重なりはQA条件による。
  - 続く`gale`混成シーン：ゲストp95間隔55ms・描画6ms、最大68ms。シーンと実行順が変わっているので疾風号令が改善に寄与したという意味ではない。
- **同じplainシーンを冷状態と後半の温状態で比較した追加試験 [#41041123442](https://github.com/8mahi8/shokoku-sensen/actions/runs/41041123442)** は**completed/success**、3シーン`plain→gale→plain`。Firebase一時ルームはDELETE 200、GET 200/null、JSエラーなし。ゲスト描画の自動キャッシュ切替を実際に通している。
  - 初回plain：WebKit p95 rAF間隔**69ms**、Canvas描画p95 **7ms**、最大188ms。188msのカクつき時、新規キャッシュタイル生成**2枚**、描画4ms、総JS5ms、SDK受信25ms前、最新状態適用4ms前。最初のシーン終了時キャッシュ65タイル。
  - gale：rAF p95 **32ms**、Canvas描画p95 **2ms**、最大57ms。76タイルを保有。
  - **同じplainの再実行**：rAF p95 **35ms**、Canvas描画p95 **2ms**、最大49ms。78タイルを保有し、試験終盤にゲスト低FPSモードが自動解除。いずれも初期20体から戦闘で人数や位置が変動するため、画面のピクセル負荷まで固定した比較ではない。

**解釈**：同一フレームでSDK受信・適用seqが最新で、描画JSが4〜10msしかかからなくても188〜250msのrAF停止が観測されたため、**WebKitの描画/合成スケジューリングと画像キャッシュの初回生成・ウォームアップを優先的に調査する根拠が増えた**。キャッシュ利用後に同じシーンのp95が69→35ms、Canvasが7→2msになったのは有力な手掛かりだが、実行順、初期リソース、ブラウザのJIT/内部キャッシュ、実際の戦闘状態とユニット数も違う。キャッシュが「唯一の原因」「確実な改善策」とは断定できない。特にテスト環境はLinux headless WebKitで、学校Safariの実機FPSではない。

**判断**：本体の描画品質や通信間隔を推測で変更せず、この成果を診断基準にする。低FPSキャッシュには毎描画フレーム最大2タイル生成の既存対策があり、今回の188msフレームも2枚生成。iPad実機の同じ兵数・初回/連戦・ホスト/ゲスト入替・旧安定版との比較で、初回の負荷に偏るのか継続中にも不規則に起こるのかを最優先で確認。その条件が揃えば**新規タイル生成の一時負荷をさらに分散する最小修正のA/B**を検討する。学校のGoogle Sites、Drive、main/stable、Firebase Rules、ゲーム本体には一切変更なし。

## 2026-10-30｜Stage3キャラ画像キャッシュ「1枚/フレーム」と「2枚/フレーム」の採否

**結論：現行の2枚制限を維持。実ゲームの描画コード変更なし。**

- 本人の学校実機報告は「基本は問題ないがゲストが時々カクつく。快適だった旧学校版と差がある」。ゲームの描画崩れや継続的な通信停止ではない。
- `tests/online-stage3-firebase-hitch-trace.cjs` の**QA用HTMLだけ**`DENSE_TILE_BUILDS_PER_FRAME`を1/2に置き換え、GitHub Actions [#41041966054](https://github.com/8mahi8/shokoku-sensen/actions/runs/41041966054) **2ジョブsuccess**。実Firebase、WebKitゲスト、怪獣を含む20体混成で同じ3場面plain→gale→plainを各実行。ただし**各方式は別のGitHubランナー**で、2枚方式ホストの描画フレーム数が少ない区間があり、直列の厳密対照ではない。
  - 1枚方式: 初回plain guest rAF p95 **75ms**、最大202ms、Canvas p95 7ms。最後のplain p95 37ms、最大61ms。
  - 2枚方式: 初回plain guest rAF p95 **121ms**、最大347ms、Canvas p95 10ms。最後のplain p95 49ms、最大60ms。
  - 「1枚のほうが速い」可能性は出たが、**ランナー差を排除できないので本番変更の根拠にしない**。
- そこで**同一ブラウザ・同一Firebase一時ルーム・同一混成ユニット・生成済タイルを各試行前にクリア**する新QA `tests/online-stage3-cache-budget-abba.cjs` と専用Workflow `.github/workflows/online-stage3-cache-budget-abba.yml` を追加。[#41042433872](https://github.com/8mahi8/shokoku-sensen/actions/runs/41042433872) **completed/success**。2→1→1→2のABBA、各区間約9秒、各試行前に強制的に低FPSキャッシュモードへ入れる**テスト限定**変更、外部配信なし、正式コード/学校版変更なし。
  - 2枚・1回目: guest rAF p95 **82ms**、描画p95 6ms、最大214ms、生成キャッシュ70枚、ホスト540フレーム。
  - 1枚・1回目: p95 **91ms**、描画9ms、最大123ms、キャッシュ68枚、ホスト525フレーム。
  - 1枚・2回目: p95 **66ms**、描画5ms、最大96ms、キャッシュ70枚、ホスト540フレーム。
  - 2枚・2回目: p95 **48ms**、描画4ms、最大74ms、キャッシュ71枚、ホスト541フレーム。
  - **2枚p95単純平均65ms、1枚p95単純平均78.5ms**。試行順に伴うWebKitウォームアップ/戦況の変動が大きく、1枚変更で持続的にカクつきが改善する証拠はない。最悪フレーム間隔は1枚で低い試行もあるが、低頻度の瞬間値は小標本で安定しない。
  - 両テストともブラウザJSエラーなし。Firebase一時ルームはDELETE 200／GET 200 nullで清掃完了。
- **ユーザー影響のある変更は不採用**：少量ずつ生成すると瞬間負荷が下がる可能性と引き換えに、キャッシュが揃うまでフルアートの描画が続く。条件一致の実験で明確な改善効果がないため、デッキ・バランス・画像・Canvas品質・通信頻度・Firebase Rulesには触れない。
- **次工程**：学校Google SitesのSafari実機で旧安定版とStage3版を同じ部隊数/端末/役割入替・開戦直後と数分経過後で比較。既存のタイトル3タップ診断画面の「描画FPS、最大フレーム間隔、SDK受信seq、適用seq」をカクつき発生時に確認すれば描画/合成問題と通信をさらに分けられる。LinuxヘッドレスWebKitのスコアを学校iPadの実測FPSと呼ばない。キャッシュの仕組みを追加で複雑化しない。

## 2026-10-30｜学校で短い「カクッ」を識別する診断表示の改修

**背景と優先度**：実FirebaseのLinux headless WebKitにはSDK受信/状態反映が進んだまま長いrAFギャップが生じる証拠があるが、学校iPad Safariのカクつき原因は未確定。既存のタイトル3タップ診断は`>=180ms`しか残さず、本人が「時々カクッ」と感じる100〜179msの引っかかりを見落とす可能性があった。原因不明の画質低下・通信再設計より、次の実機比較で**一瞬の症状発生時の状態を記録する**方が合理的と判断。

**採用した実装（開発ブランチのみ）**：
- `online-game.js`と一致する単体HTML `online-ipad.html` / `online-embed.html` を同期。**タイトルを3回タップして診断を表示している間は、ゲストの100ms以上のrAF間隔を記録**。診断非表示時は従来通り180ms以上だけ取得し、毎フレームの新たなネットワーク診断を増やさない。
- ローカルメモリに**累計件数・最長ギャップ・直近ギャップ・戦闘経過時間・兵士数・SDK受信番号/経過ms・状態反映番号/経過ms・直前に描画したフレームのCanvas JS描画msと新規キャッシュタイル生成枚数・低FPS/キャッシュモード**を記録し、既存診断パネルへ表示する。直前フレームのJS描画時間は長いrAF停止時間の直接の原因を表すとは限らない点を区別。
- 新試合では記録をクリア。バックグラウンド中は取得しない。Firebaseや外部送信・永続保存・動画録画を一切増やさず、通常画面の新UI/操作、兵種・AI・攻撃判定・通信頻度・画質設定は変更しない。診断画面は任意表示。
- `tests/online-smoke.cjs` の抽出検証を更新：99ms無視、診断表示時130ms捕捉、非表示で179ms無視/180ms捕捉、送受信seqと直前の描画ms/タイル記録、ホスト/非表示/メニュー除外、次試合初期化。学校HTMLの自動生成同期も検証。

**検証結果**：
- JS構文: 4ソースから構成した本体・2単体HTMLの実コードが一致し、V8構文検査成功。
- [Online 1v1 smoke #41048570259](https://github.com/8mahi8/shokoku-sensen/actions/runs/41048570259) **completed/success**。新診断の抽出テストを含む。
- [School Stage3 release candidate #41048882646](https://github.com/8mahi8/shokoku-sensen/actions/runs/41048882646) **completed/success**。 `node tools/build-online-bundles.cjs --check` で二つとも一致、ゲーム/カード/AI/戦闘/通信スモーク、HTML直書きパラメータと100ms診断文字列を検証。
- 途中の旧コミットに対するworkflow failure（CI #41048487790など）は新関数に未対応の旧テストモックが理由。新テストの文字列改行エスケープも修正して最終上記CIは成功済み。**学校iPad Safariでの診断表示・カクつき解消は未検証**。

**次の実機比較での最短手順**：
1. 旧安定版と新開発版を同じiPad/Safari・近い部隊数でプレイし、可能ならゲスト/ホストを交換。新開発版の対戦開始前にタイトル3タップで診断を表示。
2. 「カクッ」と感じたら直近ギャップ、開戦後秒数、兵士数、SDK受信経過、反映経過、直前の描画ms、キャッシュ生成枚数をスクリーンショット等で残す。表示上の「前描画ms」は**1つ前の描画フレーム**のCPU計測であり、WebKitの全描画/合成時間ではない。
3. SDK/反映経過が短いまま大きなギャップがあるなら画面更新系を優先。SDKも長く止まったときだけ通信系と合わせて検討。旧/新の違いが実機で出なければ根拠なき追加変更はしない。

**学校版・配布権限**：学校Google Sitesは今回**未変更**。配布Google Driveは本人から依頼された場合のみ保存。10/30に保存された旧学校TXT/HTMLはユーザー最新の怪獣城1優先と今回の診断変更を含まない可能性があり、そのまま最新版扱いしない。main/stable・Firebase Security Rulesにも触れていない。
