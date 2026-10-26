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
