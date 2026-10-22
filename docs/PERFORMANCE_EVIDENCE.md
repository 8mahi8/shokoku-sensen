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
