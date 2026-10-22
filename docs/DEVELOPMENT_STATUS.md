# 小国戦線III — 開発位置の正本

更新: 2026-10-21 JST / 作業担当: ChatGPT

このファイルは**次のAI担当・新しいチャットでも開発方向がぶれないための進行表**。
着手時に main / 作業PR / 本ファイルを確認し、毎回のユーザー報告末尾に同じ「開発位置」を表示する。
これは実際の達成を証明する進捗表で、根拠のない「完成度76%」等は書かない。

## 2026-10-22 学校実機報告｜「非常に重い」性能退行の切り分け【未解決】

- 本人から学校iPad実対戦の報告「多分この回収の影響でめっちゃ重かった」。これは**自動QA成功より優先する実体験上の不具合**。記録を原因と確定してはいけない。
- コード調査：`research-recover.html`（帰宅後の回収）はゲーム中では起動しない。試合中のローカル記録はホストのみ・約8秒間隔で最大180体のスナップショット（最大80サンプル）とカード操作（最大500）。Firebase `archiveRound` は**勝敗確定後**に最大1試合1件を保存。通常ゲストは研究サンプルを処理しない。
- 研究記録以外の負荷の根拠：**匿名ログを初期ONにする前**からヘッドレスWebKit対照で10体・大型なし約11FPS、大型あり約7FPS、後にHUD差分更新を改善済み。2026-10-22ログ初期ON版の[実Firebase QA #39658572443](https://github.com/8mahi8/shokoku-sensen/actions/runs/39658572443)は正常終了／回収成功だが、ゲスト側の検証用環境表示でも**準備中8体・16FPS**。これらのヘッドレス値は学校実iPadの実測ではなく、遅延の原因が新しい研究ログだと証明もしない。
- **次の切り分けは視覚品質を落とさず、同じ2台・同じ対戦条件で**①両端末の「匿名対戦記録」をOFF（ルーム保存もOFF）②ONで比較。試合開始からずっと遅いか、試合終了時のみ数秒固まるか、ホスト・ゲストどちらか／双方かも記録。必要なら既存QAフレーム計測を利用して固定戦場ABBAを組む。
- **まだゲーム負荷の原因を確定・修正したとは言わない**。本番mainと既存Google Sitesは変更せず、性能問題を優先して余計な新機能追加を止める。開発PR #22の自動検証が成功しても学校実機の体感を最重要の受入条件にする。

## 2026-10-22 学校実機追報｜ゲストのみ試合中ずっと重い／研究ログ運用を保留

- ユーザー実機フィードバック：**試合中ずっとゲスト側だけ重かった**。ホスト側では同じ重さを報告していない。回収による負荷だと推測していたが、記録・回収機能を今後やめてもよいとの方向転換あり。**本人は対戦ログに基づくBOT研究の優先度を下げたが、「1人で練習できる強いBOT」は欲しい**。
- 本体コードを確認：`online-research.js` の試合内ログ開始・約8秒ごとのサンプル・試合終了後の `archiveRound` は**ホスト端末のみ**。ゲストでの収集処理は通常走らない。よってゲスト常時低FPSの直接原因を研究ログと特定する根拠はない。
- ゲスト専用の差分は `online-net.js` のRTDBスナップショット受信・最新フレームだけを反映する処理、`online-game.js` の `apply(data,seq)`、リモートスプライト補間、カード/HUD更新など。**これらを先に検証**。ゲストだけ低FPSになる主因が通信待ち、JavaScript、Canvas/DOM合成か未解決。
- **方針を変更**：研究ログの一括回収やクラウド自動化の追加開発は一旦停止し、実iPadゲストの描画・操作の滑らかさを第一に。BOT強化は**対戦ログに依存しない**既存30HzシミュレーションのBOT同士の対照実験・定型戦術テストで進め、練習相手として強くする（過剰な研究機能は追加しない）。
- ユーザーはまだ「ログ機能をコードから完全削除」までは明言していないため、**この時点では既存の同意・記録仕様を開発版から一方的に削除しない**。未公開のGitHub開発ブランチで安全に比較し、採用判断を待つ。
- 現時点のGoogle Sitesとmain、Firebase Rules、保存済みGoogle Driveファイルは変更していない。既存Firebase保存分も削除していない。次の開発は実iPadゲスト重さを最重要の受入基準にする。

## 2026-10-22 前回の「ゲストラグ修正」との差分調査

- ユーザー実機観察：**以前はゲスト側のラグがあり、修正後に良くなっていたが、今回はゲスト側だけ試合中ずっと重かった**。前後比較を最重要仮説とする。
- 実際に [PR #21](https://github.com/8mahi8/shokoku-sensen/pull/21) と [PR #22](https://github.com/8mahi8/shokoku-sensen/pull/22) の該当ファイルのGitHub差分を取得して確認。[PR #21] で `ROOM_VERSION=2`、約125msのホスト配信、ゲストの25体以上の高密度描画時の省力化（閾値28体）やラウンド復帰の改善が入った。**現PRの`online-net.js`では当該スナップショット受信・REST復旧・rAF最新優先反映の主要処理はほぼ同一**で、通信改善が単純に削除されたわけではない。
- [PR #22] で追加された主要な通信コードはホスト側のスナップショット小数点量子化・時間/文字数診断、ゲストの反映時間とパケット集約数の診断。描画コードは学校用HP/damage表とHUD差分更新、QA条件付き計測が中心。**新PRの特定行がゲストラグを再発させた確証はない**。音やアセット/画面構成は変更していない。
- `adaptCanvasQuality()`は解像度低下時に`qualityMeasured=true`を立てるため、二段目の`guestLowPower`判定には進めないケースがある。ただし**学校iPadのタッチ端末は`fit()`で初期からゲストDPR=1.0**なので、この分岐だけで今回の学校ラグを説明できない。さらに少数（28体未満）の戦闘では、`guestLowPower`であっても部隊描画キャッシュへの簡略化は作動しない。
- **次の優先実験**：実iPadで同じGoogle Sites版・同じ2台を使用し、ホスト/ゲストの役割を入れ替えて体感とタイトル3回タップ診断（FPS、ゲスト受信Hz、反映ms、フレーム間隔）を取る。FPSだけ低いのか、通信が止まっているのかを区別。開発環境ではPR #21のマージ状態を比較基準にし、WebKitゲストの同一シナリオ・同一端末構成のA/Bを行う。ログ収集を実機の低FPSの直接原因とは決めつけない。
- この段階では戦闘バランス・画質・Firebaseルール・Google Sites公開版・mainには変更を加えない。原因未確定のまま通信頻度を落としたり、再度軽量化を「修正済み」と宣言しない。

## 現在地

- **優先段階: 友達1vs1の安定運用 ＋ Phase 2／4 — 既存Firebaseのルーム内へ匿名ログを一時保存しスマホで一括回収（開発PR・未公開）**
- **対象ゲーム:** 小国戦線III — FORTRESS FRONT、学校iPad＋Google Sites埋め込み、身内1vs1
- **公開版:** 学校Google Sitesで現在遊べるHTML（直接貼り付けなのでGitHub側の変更では自動更新されない）
- **本番 main:** `7db1c98cb51d9841f5f43941767c9972cbef932d`（この文書作成時の確認値。更新時は再確認）
- **開発候補:** PR [#22](https://github.com/8mahi8/shokoku-sensen/pull/22) / `perf/online-guest-snapshot-diagnostics-20261020`、**Draft・未公開**
- **いまの最優先課題:** 学校では友達と遊ぶだけ、帰宅後にスマホでルーム番号なしの研究ログ一括回収→BOT研究。**専用サーバー・課金・複雑な認証は作らない。**既存の対戦ルームに匿名ログを同意時だけ残す軽量方式を開発PR #22に実装、実Firebaseの一時ルーム保存は検証合格。ルーム一覧は未認証の公開読み取りが可能（HTTP 200）なので**所有者だけに秘密の記録にはできない**。その制約は回収ページに明記し、本番Google Sites/mainは変更しない。
- **次の公開版候補:** 本人が採用を判断した場合に限り、友達用1vs1の軽量ログ回収＋学校用HP/攻撃力調整。新モードや戦闘バランスは増やさない。
- **ユーザーの修正判断:** 戦車やゴーレムの背後に歩兵が隠れるのは戦術になり得るため**仕様として残す**。透明化や無理な前面表示を勝手に行わない。

## 完了していること（根拠付き）

- 学校の実機プレイで「ゲストが少しラグい」「新しいゲーム開始時に固まる」と報告あり。離脱時の無期限通信待ち、ラウンド更新、旧ルームの通知対策を main に統合済み（[PR #21](https://github.com/8mahi8/shokoku-sensen/pull/21)）。学校で修正版を貼り替えた際の再確認は別。
- 通信コピーの小数精度最適化と端末内診断を PR #22 に実装。**130体の高負荷計測は補助**、現実的な戦闘を主要判断に格上げ。
- 通常14体、大型なし10体、大型入り10体、砲撃8体の正規召喚・コスト付きテストを構築。実Firebaseを介したWebKitゲストの4場面と5試合連続開始は[自動テスト合格](https://github.com/8mahi8/shokoku-sensen/actions/runs/39381035466)。
- [同数比較](https://github.com/8mahi8/shokoku-sensen/actions/runs/39380577649) の単回WebKitヘッドレス測定で、大型なし10体 10.9FPS / 戦車・ゴーレム入り10体 6.8FPS。**CI値は学校実機のFPSではない。単回なので因果は未確定。**
- 実際の録画・連続画像を開いて目視レビュー済み。以後、数値成功と見た目の自然さを別々に判定する。
- **2026-10-21 Phase 1進展:** [反復した大型あり／なし比較とアート種別ごとの描画プロファイル](https://github.com/8mahi8/shokoku-sensen/actions/runs/39473479479) が成功。WebKit大型なし10体は 11.0 / 10.7 FPS、大型入り10体は 6.9 / 6.8 FPS。Chromium両者約60 FPS。
- WebKitのCanvas描画HUDは大型なし平均5.7〜6.2ms、大型入り平均5.4〜6.1ms。ユニット描画の累積CPU時間も大型入り側が増えた結果ではなく、**FPS差を大型アートのCPU描画負荷と断定できない**。
- **未検証事項:** 実際の学校iPad Safariは未再測定。表示FPSの低下がJSゲームループ、WebKitの画面合成、ヘッドレスCIのフレーム供給など何に由来するかは未特定。
- **2026-10-21 分解計測成功:** [WebKit/Chromium場面別フレーム計測](https://github.com/8mahi8/shokoku-sensen/actions/runs/39475276349) と[実Firebase対戦QA](https://github.com/8mahi8/shokoku-sensen/actions/runs/39475276452) が合格。WebKitの大型入り/なしの処理差は主にフレーム間隔の未説明部分に集中。これを直接GPU処理時間と断定しない。CI動画キャプチャと実機性能は区別。
- **2026-10-21 対照実験も完了:** [録画あり/なしとCanvas描画停止の16場面テスト](https://github.com/8mahi8/shokoku-sensen/actions/runs/39476259487) は成功。WebKit録画なしでは大型なし11.5FPS／大型あり8.5FPS、Canvas停止では大型なし21.7FPS／大型あり12.7FPS。**大型アートの同期JS処理が全ての原因とはいえない**。視覚品質や遮蔽の変更はしていない。
- **2026-10-21 WebKit合成の対照実験成功:** [16条件の同一ページ計測](https://github.com/8mahi8/shokoku-sensen/actions/runs/39483192427) はCI成功、ガルドのキャッシュ完成確認。各条件2試行平均で、大型なし／大型あり：通常描画 13.1／9.8 FPS、Canvas描画停止 24.0／14.3 FPS、描画停止＋Canvas非表示 29.6／16.5 FPS、通常描画＋Canvas非表示 15.1／10.5 FPS。**Canvas描画も表示も止めても場面差が残るため、Canvasの合成のみが唯一の原因という仮説は支持されない**。JS処理時間は各条件わずかで、差の大半はフレーム間隔の未説明部分。10体は初期召喚数で、測定時の生存体数は変化するため因果はまだ確定しない。頭なしLinux WebKitの結果であり実iPad FPSではない。実ゲームの視覚変更なし。
- **2026-10-21 大型アートのみの置換対照も成功:** [Actions #39483775642](https://github.com/8mahi8/shokoku-sensen/actions/runs/39483775642)、[commit 5a4c272](https://github.com/8mahi8/shokoku-sensen/commit/5a4c27270c399bc1b76cd78f1128a66b1119efca)。同じ大型ありの戦闘で、戦車＋ガルドの**描画だけ**簡単な矩形に差し替えたABBA 4試行。通常アート 9.70／9.67 FPS、簡易図形 10.09／10.07 FPS（ヘッドレスWebKit）。変化は約+0.4 FPSと小さく、ユニットの描画の複雑さ単独で大型場面のFPS低下を説明できない。ただし試行回数は少なく戦闘進行にばらつきがある。QAランタイム限定で、HP/コスト/移動/攻撃/公開アートは**一切変更していない**。
- **Phase 1 次の切り分け:** 大型あり/なしで戦闘結果や生存数が変わることが残る交絡。実ゲーム処理とrAFフレーム供給の外部要因を分けるため、固定されたユニットの場面（同じ表示状態/同じカメラ/同じDPR）と、実移動する戦闘を別々に比較し、可能なら有頭WebKit・学校実機の表示も確認する。**ヘッドレスCIだけで画面合成やSafari実機の原因と断定しない**。
- **2026-10-21 固定10体 vs 通常戦闘の対照実験成功:** [run 39484912255](https://github.com/8mahi8/shokoku-sensen/actions/runs/39484912255) 完全成功。ローカルQA配信HTMLだけの戦闘tick＋S.clock停止で、実際に合法召喚した10体を維持（固定中は経過0・ユニット位置不変・大型数不変、描画エラー0）。2試行平均：通常戦闘・描画あり 大型なし11.21／大型あり8.09 FPS、固定戦場・描画あり 13.05／10.97 FPS、通常戦闘・Canvas描画停止21.81／12.73 FPS、固定戦場・Canvas描画停止54.33／45.34 FPS。描画命令と戦闘tickを止めると大型ありでも45 FPSに回復したが、大型なしとの差は残る。計測画像 fixed-light / fixed-heavy をGitHub Actionsから実際に取得して目視確認済み：10体描画・戦車/ゴーレムの通常絵・重なり方を確認。**固定場面は実iPad挙動を証明せず、視覚品質・戦闘バランス・公開HTMLは変更していない**。
- **2026-10-21 Canvas＋カードHUD非表示の検証成功:** [run 39485586259](https://github.com/8mahi8/shokoku-sensen/actions/runs/39485586259) は全24試行成功。固定10体・Canvas描画停止＋Canvas非表示では、大型なし62.05 FPS・大型あり45.90 FPS。そこから**カードHUDも非表示**にすると大型なし62.07 FPS・大型あり62.24 FPSとなり差がほぼ消失。つまり**このヘッドレスWebKit環境ではカードHUDの視覚処理が大型あり/なしのrAF差と関係する可能性が高い**。ただし表示非表示は見た目の保持を満たさず、即時のゲーム変更には使わない。
- **2026-10-21 CSS filter 除去は逆効果（不採用）:** [run 39486294923](https://github.com/8mahi8/shokoku-sensen/actions/runs/39486294923) の32試行は成功。10体固定・Canvas描画停止＋非表示・カード表示ありの大型入りは CSS filter有りで46.03/45.99 FPS（5枚にフィルター適用）、filter:noneへ変更すると40.99/40.71 FPS（適用0）へ**悪化**。大型なしはどちらも約62 FPS。このLinux WebKitでフィルター単独が根本原因との仮説は支持されず、製品CSSを変えない。
- **2026-10-21 肖像画を隠す/PNGに変える方法も効果なし:** [run 39486965057](https://github.com/8mahi8/shokoku-sensen/actions/runs/39486965057) の40試行成功。固定10体・Canvas描画停止＋Canvas非表示＋カード表示で、肖像Canvasを隠した大型入りは45.58/45.30 FPS、5枚を同一ピクセルPNGへ置換した大型入りは45.90/46.85 FPS。どちらも標準45〜46 FPSと大差なし。PNGへの本体変更は不採用。**ただし大型あり試験では`#cards .card.unavailable`が5枚、大型なしは0枚**で、肖像Canvasそのものよりカード全体の透明度/合成負担が原因候補。
- **2026-10-21 使用不可カードのopacity解除も大幅改善なし:** [run 39487709725](https://github.com/8mahi8/shokoku-sensen/actions/runs/39487709725) の48試行は成功。固定10体、Canvas描画停止＋非表示、カード表示ありの大型入りはopacity .58で約46 FPS、1へ変更後47.06/46.12 FPS（平均46.59）、改善小。固定描画ありでは大型入りopacity 1が11.63/11.40 FPSで、従来の約11 FPSと小差。カード5枚が使用不可の条件・CSS filter保持で測定。opacityだけの改変はゲームへ反映しない。
- **Phase 1 現時点の根拠付き結論:** CIヘッドレスWebKit上、(a)大型10体の戦闘計算停止・描画停止で性能が回復、(b)固定してCanvasも隠してなおカードHUD表示による場面差あり、(c)カードHUD全体を隠すと大型あり/なしとも約62FPS、(d)肖像隠し/PNG化、CSS filter/opacity個別変更ではFPS差は十分解消しない。**個々の小さなCSS指定が原因だとは断定せず、カードUIの構造/状態、DOM・合成負荷などを次の対照対象とする**。現場実機のiPadで同等の再現がない以上、数値を製品の性能改善値として扱わない。バランス・公開版・本体レンダリング変更なし。

- **2026-10-21 固定カードHUD ABBA対照テスト追加（CI検証中）:** [新しい20条件テスト](../tests/online-hud-matched-control.cjs)を [commit f3c67f5](https://github.com/8mahi8/shokoku-sensen/commit/f3c67f59f0ca0fe79cb424b8d9fb881addc3220f) で追加。[Actions #39489286303](https://github.com/8mahi8/shokoku-sensen/actions/runs/39489286303)。同一WebKitタブで、正規召喚した10体を戦闘計算停止して比較。自然状態・大型なし時の手札/使用可否/エネルギー表示に**両場面を統一**・大型あり時に統一の3対照。各4試行、さらに統一HUDの描画あり8試行。カード5枚の画像（PNG固定）、カードclass/順序、下部資源・次カードを固定し、両場面でDOMが完全一致することをassert。**ゲーム本体のカード、性能値、Google Sites HTMLを変更しない**。通常時に見えないものをユーザー向け最適化へ適用しない。結果で原因候補を確定するまではPhase 1継続。

- **2026-10-21 HUD一致テストで原因候補を分離:** [初回20試行 Actions #39489286303](https://github.com/8mahi8/shokoku-sensen/actions/runs/39489286303) と [HUD定期更新のみ停止を追加した28試行 Actions #39489661965](https://github.com/8mahi8/shokoku-sensen/actions/runs/39489661965) が成功。通常カードHUDで大型なし62.1／大型あり51.9 FPS（固定10体・Canvas描画停止）、元のカード内容を保ち**定期updateHUDだけ停止**すると大型なし62.3／大型あり62.3 FPS。カード画像・半透明・使用可否を変えずに差が消えるので、HUDの周期的なDOM更新/それに伴うブラウザ作業が強い原因候補。さらに同一カード画像・種類・使用可否・資源表示の双方統一でも62.2〜62.5 FPSで一致し、HTMLと表示状態一致をassertし、実際のスクリーンショットのカード領域が完全一致することも画素比較で確認。**HUDの更新を恒久停止するのはNG。**
- **2026-10-21 開発版のHUD差分更新を実装:** [online-game.js commit 64e74c1](https://github.com/8mahi8/shokoku-sensen/commit/64e74c10ca5b340acb33d1ccc482657bab1f1729)、Google Sites用の [online-ipad.html commit 467ff40](https://github.com/8mahi8/shokoku-sensen/commit/467ff4015495533ec0e88abbb5da021058b5c65a) / [online-embed.html commit 2204135](https://github.com/8mahi8/shokoku-sensen/commit/22041351327dd74121f35e81ac79b861ef53c272) を同期。clock/phase/HP、資源額・ゲージ・ARIA、カード使用可否/選択/枯渇等を**実際に値や状態が変化したときだけ更新**し、HUD機能は全て維持。キャラ・ダメージ・AI・手札・コスト・通信方式には変更なし。開発PR限定でmain/Google Sites公開HTMLには未反映。
- **2026-10-21 修正後の固定戦場・回帰検証合格:** [WebKit 28試行 #39490281824](https://github.com/8mahi8/shokoku-sensen/actions/runs/39490281824) 成功。固定10体・Canvas描画停止の通常HUD更新は大型なし62.44/62.27 FPS、大型入り60.57/62.02 FPSで平均約61.3 FPS（直前同条件平均51.9 FPS）。HUDの更新停止なしでほぼ差が消えた。Linux CI/WebKitのばらつきは残り、実iPad FPSではない。[オンラインsmoke #39490242147](https://github.com/8mahi8/shokoku-sensen/actions/runs/39490242147)、[iPad UI #39490230206](https://github.com/8mahi8/shokoku-sensen/actions/runs/39490230206)、[実Firebase2ブラウザ #39490230228](https://github.com/8mahi8/shokoku-sensen/actions/runs/39490230228)、[動く戦闘・録画 #39490230237](https://github.com/8mahi8/shokoku-sensen/actions/runs/39490230237) 成功。途中の2つのsmoke失敗は3ファイル同期前の一時的コミットで、**全3ファイル同期完了後のsmokeは成功**。最新戦闘録画とスクリーンショットを実際に開き、戦車/ガルド重なり・弾/効果、HUDで資源変化を確認。学校の実iPad/Sites iframeの貼替え実測は未実施。

- **2026-10-21 HUD表示追従の追加回帰合格:** [commit e1a0307](https://github.com/8mahi8/shokoku-sensen/commit/e1a0307fb0e2b1df2c7dd036b7fe5b9283552541) で、Firebaseをブロックした実ブラウザBOT試合で、歩兵召喚後の表示資源整数とARIAプログレスバーが権威シミュレーションのエネルギーに同期していることを待機assert追加。[CI #39491115488](https://github.com/8mahi8/shokoku-sensen/actions/runs/39491115488) 成功。`online.html` と `online-ipad.html` のiPad横向き/縦向き/Sites小画面6配置、オフライン戦闘・両チーム描画・残り秒・再戦も合格。Hud差分更新で表示が止まる回帰なし。Google Sites本番は引き続き未変更、実学校iPadでの数値計測はまだ。

- **2026-10-21 実戦負荷の18体／20体追加（CI完了）:** QA限定の正規召喚 `crowded`（9体×2軍、各軍コスト11）、`dense`（10体×2軍、各軍コスト10）を `online-game.js` / `online-ipad.html` / `online-embed.html` に同期（最終修正commit [`2a5936e`](https://github.com/8mahi8/shokoku-sensen/commit/2a5936e3a86f81bde643b0f45974f260b576a4f1)）。両者は既存の部隊ステータス、召喚範囲、カードコスト、手札運用だけを使い、ゲームルールを変更しない。テストの赤軍座標が前哨基地から計算する合法召喚ライン（x≥819）より1〜4だけ敵側に寄りすぎて最初のCIが失敗したため、テスト座標だけ修正。召喚制約はゲーム本体側が正常に拒否した。修正後のHTML/JS [smoke #39493081154](https://github.com/8mahi8/shokoku-sensen/actions/runs/39493081154) 成功。実画面・録画は [WebKit/Chromium #39493068175](https://github.com/8mahi8/shokoku-sensen/actions/runs/39493068175)、実Firebase/同一ルーム7試合は [#39493068054](https://github.com/8mahi8/shokoku-sensen/actions/runs/39493068054) でいずれも成功（実機での快適性は未確認）。

- **2026-10-21 最新の実Firebase 7試合連続テスト合格:** [Actions #39493068054](https://github.com/8mahi8/shokoku-sensen/actions/runs/39493068054)。同一の一時RTDBテストルームで初戦＋6再戦が成功。標準14体、通常10体、大型入り10体、砲撃8体、密集18体、密集20体のいずれもホスト正規カード召喚・Firebase state公開・WebKitゲスト反映・フレームエラーなし。ルーム移行で埋め込みiframeはリロードしない。テストルーム削除はCIログの `CLEANUP: confirmed` で確認済み（性能指標とは独立）。各場面1.5秒測定のWebKit guestフレームは6〜12サンプル、p95ギャップは432〜772msと**CI内の描画快適性は合格と判断できない**。並列CI負荷や録画ありの影響も候補であり、学校実iPadの実測FPSではない。**Phase 1はまだ完了と宣言しない**。

- **2026-10-21 実戦8～20体 WebKit/Chromium映像計測完了:** [Actions #39493068175](https://github.com/8mahi8/shokoku-sensen/actions/runs/39493068175) 全試行成功。正規カード10操作で18体（各軍9体・消費11）、20体（各軍10体・消費10）を初期配置し、戦闘継続・移動・弾/エフェクトと描画フレームの回帰検証に合格。WebKit 1194×834録画あり：14体6.8 FPS、18体7.1、20体7.1。Chromium 900×520 Sites相当：14体60.2、18体60.1、20体60.1 FPS。これらは**別ブラウザ/別画面条件のLinux CI**であり学校の実機FPSではない。録画から約1秒・3秒・5秒の複数フレームと交戦前後スクリーンショットを人手で目視確認。密集時は部隊が重なるが、勝手に透明化や召喚/当たり判定変更はしていない。HUD配置・部隊の描画・動きの進行に明白な破綻なし。動画の全時間を連続再生して品質確認済みとは主張しない。
- **2026-10-21 7試合のFirebase連戦記録と掃除確認:** [Actions #39493068054](https://github.com/8mahi8/shokoku-sensen/actions/runs/39493068054) で青ホストChromium + 赤WebKitゲストによる単一テストルームの開始7回・再戦6回成功。14・10・大型10・砲撃8・18・20体のゲスト反映成功、REST復旧/ルーム変更/フレームエラー0を確認。**CLEANUP: confirmed** で対象一時ルームのRTDB削除も確認済み。ゲストWebKitの1.5秒ごとのフレームは6～12サンプル・p95 gap 432～772msで、実装の対戦進行は正しくてもCI性能の快適性は未合格。学校iPad/SitesのA/B実測まではPhase 1を未完とする。

- **2026-10-21 実Firebase WebKitゲストの通信断・復帰試験に成功:** [Actions #39495374387](https://github.com/8mahi8/shokoku-sensen/actions/runs/39495374387) 成功。[tests/online-browser-live.cjs](../tests/online-browser-live.cjs) を拡張し、進行中の同一ルームでゲストの Firebase SDK `goOffline()` と Playwright BrowserContext の `setOffline(true)` を併用して**実際のSDKソケットを閉じるQA専用切断**を実施。既存のWebKitヘッドレス環境では BrowserContext 単体のoffline指定だけで古いWebSocketが続き、初回 [CI #39495079935](https://github.com/8mahi8/shokoku-sensen/actions/runs/39495079935) はテスト条件不備として失敗した（ゲーム不具合と断定しない）。修正版ではゲストseq=94で固定、ホストはseq99→116へ進行。SDK `goOnline()` とブラウザonline復帰後、ゲストはseq119を受信、`connected:true`、試合継続。復旧後も同一ルームの7試合／6再戦（通常8〜20体、戦車・ゴーレム・砲撃）、旧スナップショットの除外・ルーム画面へ戻る動線が通過。`CLEANUP: confirmed` でこのテストだけのFirebase一時ルーム削除確認済み。**実iPadのWi-Fi切断・Google Sites iframe・端末スリープは未検証**。実Firebase復帰後のゲスト画像（ネットワーク再接続直後・大型10体・密集20体）も取り出して目視確認し、UI・キャラ描画の明白な破綻は確認されなかった。ただしWebKit CI表示は低FPSで快適性は判定不能。本体JS・main・Google Sites公開版は変更なし。
- **2026-10-21 学校iPadでの実測手順を作成:** [docs/IPAD_PHASE1_CHECKLIST.md](./IPAD_PHASE1_CHECKLIST.md)。本番公開後にタイトル3回タップで表示する端末内診断から、FPS/通信更新頻度と8～20体・大型・再戦の体感を簡潔に記録する方針。名前・ルーム番号の共有は不要、診断値は端末内表示でFirebaseへ自動送信されない。現時点では文書作成のみで、学校の実測を代行・完了したものではない。

- **2026-10-21 Phase 1学校iPadテスト用HTMLを準備:** 開発ブランチの `online-ipad.html`（Git blob SHA `f7e0fa7d23b6d4641d89687497add4dde014a272`）を、既存 [Online 1v1 smoke #39493081154](https://github.com/8mahi8/shokoku-sensen/actions/runs/39493081154) の成功アーティファクト `Shokoku_III_1v1_school_iPad.txt` から取得。UTF-8 **320,227 bytes**、Git blob SHA一致・インラインJS構文検証成功。チャットに「Shokoku_III_Phase1_Google_Sites_Copy.txt」「Shokoku_III_Phase1_Google_Sites_Test.html」を添付して実機QAを依頼。両ファイルは同一バイト列。**Google Sitesへの実貼り付け・本番反映・実iPad測定は未実施**。本体に検査用の特別コードは追加しない。診断はゲームタイトル3回タップ。できればGoogle Sites上の別テストページに貼って既存ページを保存。公開版の定義はユーザー自身がHTML全文を貼って友達とオンライン対戦できる状態であり、この段階はあくまで公開候補準備。

- **2026-10-21 学校からのHP/攻撃力簡易編集欄を実装・検証:** `online-ipad.html`/`online-embed.html` のHTML冒頭へ `window.SHOKOKU_UNIT_STATS` を追加。基本歩兵・偵察ライダー・重装工兵・魔導射手・迎撃衛士・制圧機兵・守護ゴーレム・ドローン・戦車の**全9キャラのHPと基本攻撃力**を1か所で編集可能。`online-game.js` の起動時に合法な整数だけ `CLASSES` へ適用し、攻撃・被弾の実パラメータに反映。通常 `online.html` の既定値、城/砦、スペル、コスト等は不変更。`tests/online-smoke.cjs` で9種類すべての既定値、一部書換え時のHP/攻撃力への反映、他パラメータ不変、異常値時の安全な既定値を検証し [smoke #39499222485](https://github.com/8mahi8/shokoku-sensen/actions/runs/39499222485) 成功。実Firebase連戦/ゲスト切断復帰 [Actions #39499112116](https://github.com/8mahi8/shokoku-sensen/actions/runs/39499112116) 成功、学校iPad相当UI [Actions #39499112246](https://github.com/8mahi8/shokoku-sensen/actions/runs/39499112246) 成功。Actionsが生成した `online-ipad.html` コピーファイルをChatGPT内でTXT/HTMLとして渡し、Git blob SHA `b7fbf1dc30909499484364d442bc72c3d6c3f252` 一致・インラインJS構文も確認。**main/既存Google Sitesへの反映はしていない。** 編集したHTML全文をGoogle Sitesに貼り直し再公開する必要がある。変更後の学校実機対戦はまだ。

- **2026-10-21 新運用Phase 2に着手（収集側の開発コード・テストまで）:** [クラウド収集の安全運用手順](./RESEARCH_CLOUD.md)。既存の `online-research.js` を使い、`online-net.js` に別パス `/shokokuResearchV1` への試合終了時送信APIを追加。クラウド同意はローカル記録と別の初期OFF、両参加者がロビーで事前に同意、途中撤回可能、ホストのみ最大1日12回・レコード65,000文字、匿名化して1試合1件、別ルームの情報は含めない。保存先の匿名公開読取が成功する場合は必ず送信拒否。**加えて `window.SHOKOKU_CLOUD_RESEARCH_READY=true` が管理者により明示設定されるまでは、チェック欄を無効・送信拒否**する実装で、現段階のGoogle Sites/mainにも開発版にも自動送信は実際に有効になっていない。実Firebase研究用書込と権限ルールは未実施。
- **2026-10-21 新運用Phase 2の自動テスト合格:** [Online 1v1 smoke #39501431890](https://github.com/8mahi8/shokoku-sensen/actions/runs/39501431890) で初期OFF・両者同意・同意撤回・匿名な分離パス・公開読取禁止・1日送信試行上限・ローカル保存継続を模擬確認。[研究用ブラウザQA #39502148149](https://github.com/8mahi8/shokoku-sensen/actions/runs/39502148149) は3画面（Chromium通常、WebKit学校iPad、Chromium埋込）で既存記録/共有/消去・簡易編集HTML・構文が合格。最新の明示的なbackend-readyゲート追加後のCIは別途実施・結果を確認する。
- **2026-10-21 研究データ管理器も試作:** [tools/research/import-firebase-export.cjs](../tools/research/import-firebase-export.cjs) は管理者が取り出したFirebase JSONから余計な識別子を排除して既存BOT研究用形式に変換。[テスト](../tests/online-research-cloud-export.cjs) 合格。期限14日で `expiresAt` を付与し、[管理者限定クリーンアップ](../tools/research/prune-expired.py) と[日次Actions案](../.github/workflows/online-research-retention.yml) を開発ブランチに配置したが、**main未統合・管理用Secret未設定につき現在は削除ジョブも稼働していない**。公開リポジトリへ生のログや認証情報を出さない。Firebaseの認証・読み取り保護と管理側への自動受け渡し経路は未完了。

## 2026-10-21 新運用Phase 2｜安全なサーバー受付を試作（未デプロイ）
- 当初の**ブラウザが研究ツリーへ直接 `.set()` する設計は安全性不足と判明し、完全撤去**。 `online-net.js` および貼付け用HTML `online-ipad.html` / `online-embed.html` に同期。今のゲームは通常のFirebase対戦通信のみ、研究ログのクラウド自動送信は依然**ハードOFF**で公開版/mainとも変更なし。
- 新規に[Firebase Callable受付](../functions/research/index.js)（Cloud Functions v2、App Check/匿名Firebase Auth必須）と[厳格検証](../functions/research/collector-core.cjs)を実装。サーバー側でホスト認証UID・ゲストUID相違・両者同意・試合終了・ラウンド・確定勝敗・送信データの許可フィールドをチェック。UID/ルーム番号は保存本体に含めない。同一ラウンドは決定的SHA-256キーで重複抑止し、1UID/UTC日12回・全体/UTC日150回をサーバー側で制限。これは**仮実装／模擬テスト済み**であり未デプロイ。
- [管理者削除処理](../tools/research/prune-expired.py)に14日期限の研究レコードと送信計数のUTC日バケット削除を追加。開発ブランチの[firebase.json](../firebase.json)は研究用Function codebaseのみを定義し、[研究ルール断片](./firebase-research.rules.fragment.json)は実プロジェクトを上書きしない**参考用**。
- [研究クラウドCI #39505314534](https://github.com/8mahi8/shokoku-sensen/actions/runs/39505314534) と [Online smoke #39505790098](https://github.com/8mahi8/shokoku-sensen/actions/runs/39505790098) は成功。Callable単体の模擬Firebase検証を追加して再実行中。WebKit/Chromiumの実対戦は[前回成功 #39504538575](https://github.com/8mahi8/shokoku-sensen/actions/runs/39504538575)。実Firebase研究領域への書込・管理側自動受渡しは未検証・未開始。
- **本番化の残課題:** 現在のRTDBルーム権限が匿名の座席同意書換えを許すなら、サーバーがUIDをチェックしても第三者による同意偽装を完全防止できない。既存ルールの管理者取得と精査、必要なら同意をサーバー管理へ移管、学校Google Sites iframeのAuth/App Check対応、Cloud Functionsの利用料金承認、研究ツリーが誰からも読めないことの検証、14日後の本番削除検証を終えるまで**READYフラグをONにしない**。本番Firebase権限/料金/main/Google Sitesは変更していない。[詳細](./RESEARCH_CLOUD.md)。

## 2026-10-21 軽量研究ログ｜ユーザーと合意した新方式（最新）

- **目的:** 君が学校iPadから直接ログを送れない問題の解決。ルーム番号を覚えなくても、帰宅後スマホの[一括回収ページ](../research-recover.html)から「ルーム内ログを検索して一括回収」を1回押し、BOT研究用JSONをダウンロードできる設計。Firebase管理者エクスポートからのオフライン変換も用意。
- **ゲーム側:** 元の `online-research.js` のローカル記録を保ち、両者が「研究用ログをルームに保存」へ**初期OFFから明示的に同意**した試合のみ、終了後ホストが既存 `/shokokuRooms1v1/<room>/researchRounds/<round>` へ匿名カード使用・戦況・勝敗を記録。部屋内の再戦でもラウンド別に保持。専用Cloud Functions・新Firebaseルート・追加課金契約・プレイヤー識別子は不要。
- **回収ページ:** `research-recover.html` はFirebase RESTのshallowルーム一覧を取得し、研究ログのみJSONに統合。2026-10-21の[smoke #39516508715](https://github.com/8mahi8/shokoku-sensen/actions/runs/39516508715)で**ルーム一覧の未認証GETがHTTP 200**。変換単体[研究QA #39516477222](https://github.com/8mahi8/shokoku-sensen/actions/runs/39516477222) 合格。実Firebase[仮ルームでの保存 #39516477041](https://github.com/8mahi8/shokoku-sensen/actions/runs/39516477041) 合格（カード行動7件・戦況サンプル2件）かつ終了後の仮ルーム削除を確認。[一括回収E2E #39516983565](https://github.com/8mahi8/shokoku-sensen/actions/runs/39516983565) は**成功**。テスト用ルームにカード行動8件・戦況サンプル2件を保存し、スマホ風ブラウザの「一括回収」1回で番号入力なしに計1試合取得。試合後のルーム削除も確認。
- **運用上の制約:** 誰でもルーム一覧を読める既存RTDB設定につき、ゲーム管理者以外から絶対に読めないという保証はない。名前・端末ID・チャットを含まず、ルーム保存は明示同意で初期OFF。プライベートなログ保管ではない。ルームが24時間後に再利用される場合、残した試合ログも消えるため**当日回収が目安**。本人と友達の実iPad＋スマホ運用は未検証。
- **開発の範囲:** main/Google Sitesは未変更、PR #22はDraft、開発版のテストを完成してから公開採用を本人が決める。軽量版運用の説明: [RESEARCH_LITE.md](./RESEARCH_LITE.md)。過去のCloud Functions実験は[凍結した参考資料](./RESEARCH_CLOUD.md)であり本番要件ではない。

## 2026-10-21 軽量化を実行｜開発版をローカル記録へ戻す

- ユーザーの「大がかりにしなくてよい。友達だけのゲーム」という指示に基づき、**開発PR #22の実行されるゲームコードをクラウド収集試作前の安定状態に戻した**。対象：`online-net.js`, `online-research.js`, `online-ipad.html`, `online-embed.html`, `online.html`、関連テスト・ワークフロー。HTML冒頭の全9キャラHP/攻撃力調整欄、描画・通信最適化とローカル匿名記録・JSON書き出しはそのまま保持。
- Cloud Functionsの試作ソースや資料は**将来必要になったときだけ再評価する参考コード**として未デプロイのまま保持し、現行ゲームに読み込ませない。Firebaseの管理者認証、課金、権限、Google Sites本番操作を行っていない。
- 調査の結論：Firebaseでは既にゲーム状態・勝敗を試合中に送っているため、有料サーバーを新設せず既存RTDBから軽い集計を残す可能性はある。ただし**既存RTDBルール全文を管理者として読めていない**ため、新しい公開書込パスは設定しない。無制限な匿名書込・親ルールによる公開閲覧リスクを知らずに有効化しない。<https://firebase.google.com/docs/database/security/core-syntax>
- 当面は遊び心地の維持を最優先。現段階で**友達同士の試合の自動回収は未実装**。既存ローカルJSONはホストが送れば分析できる。自動回収の「できる/できない」はFirebaseルール閲覧可否と最小構成の見通しが立ってから再判断。検証に先立つ新たなコードの追加・課金・外部送信はしない。
- **復元後の検証結果:** [Online smoke #39510705686](https://github.com/8mahi8/shokoku-sensen/actions/runs/39510705686) 合格（HTML/JS・HP火力調整・再戦）。[iPad UI #39510638750](https://github.com/8mahi8/shokoku-sensen/actions/runs/39510638750) 合格。[実Firebase 7連戦 #39510996494](https://github.com/8mahi8/shokoku-sensen/actions/runs/39510996494) 合格、テストルーム削除確認。ローカル記録のChromium/WebKit/Google Sites貼り付け用HTMLでのブラウザQAは[研究QA #39510985497](https://github.com/8mahi8/shokoku-sensen/actions/runs/39510985497) の全画面PASSログを確認（後続プッシュによるワークフローcancel）。次の[同内容の研究QA #39510996483](https://github.com/8mahi8/shokoku-sensen/actions/runs/39510996483) は最新結果の確認対象。main・学校Google Sitesは従来のまま。

## 2026-10-21 ユーザーによる方針修正｜友達と遊ぶだけの軽量運用を優先

- **重要：前回の研究クラウド基盤はユーザーの用途に対して過剰設計。** ユーザーは「そんなガッツリやらなくてもいい。友達とやるだけ」と明示。安全性を削って無理にクラウド収集するのではなく、**重い構成ごと一旦保留**。
- 目標は**友達と気軽に1vs1を楽しめること**。データ収集は面白さ・BOT改善に役立つなら補助的に実施。ユーザー不参加の友達同士の試合でもログ回収できると便利、という以前の希望は残すが、開発負担・運用費・新しい管理作業を増やしてまで実現を急がない。
- **当面の最小案**：すでにあるローカル匿名記録・試合後のJSON書き出しで十分。自動化を検討する場合も、まず現行Firebase設定・権限の安全性・利用料金を確認し、軽量で手間が増えず安全に実現できる方法だけ採用。危険な匿名書き込み解放はしない。
- Cloud Functions/課金プランの変更、管理用秘密鍵、管理者ジョブ、ログ自動取得の専用基盤の本番導入を**現時点の必須条件から外す**。既に作ったサーバー受付の試作コードは未公開のPR #22に残るが、今後もユーザーの依頼なしに複雑化・本番デプロイしない。
- **次の優先度**：現状の楽しい対戦を維持する → 遊んで出たバグ・ラグだけ直す → 必要なときBOT研究 → ログの回収方法は簡便さで判断。HP/攻撃力の最終バランス調整はユーザー担当。
- main・Google Sites公開版・Firebase本番設定は変更せず、クラウド自動送信はハードOFFを維持。

## 2026-10-21 合意した新しい運用ロードマップ（優先）
1. **安定版1vs1の維持:** キャラHP/火力はユーザー判断。性能と学校iPad最終確認は必要なときだけ検証。
2. **対戦データの軽量自動記録（現在）:** 開発版では双方が明示同意した試合のみ既存Firebaseのルーム内へ匿名ログを一時保存し、スマホで一括回収できる。実Firebase一時ルームで成功。ただし**完全な非公開領域ではなく第三者も読める可能性がある**ため、学校公開前に本人の採用判断と実機確認が必要。旧・専用クラウド受付は無効のまま、main/Google Sitesは未変更。
3. **記録でBOT研究:** スマホ一括回収から匿名のカード・局面・勝敗データを統合。現行RTDBの公開読取設定では「管理者だけが取得」とは言えない。勝率・費用配分・防衛放棄/攻め続けの判断をオフライン反証テスト。勝手な自動学習はしない。
4. **実戦フィードバックで微調整:** 君と友達が違和感を見つけた部分に絞る。新モード・ランキング・リプレイの拡張は不要。

## 旧・技術開発ロードマップ（過去の計画を残す）

1. **Phase 1 — 描画・通信最適化（作業中）:** 大型アート・通常兵と比較、同数・同解像度・反復測定、ゲストの表示FPS/反映間隔/処理時間を独立把握。大きな差の原因に絞って描画改修。
2. **Phase 2 — 連戦/オンライン安定性:** 退出、新ルーム、同ルーム再戦、接続断、遅延からの復帰をPC＋WebKit実Firebaseで継続検証。3〜5試合以上の連戦を合格条件にする。
3. **Phase 3 — 体感/目視QA:** 普通の8〜20体、戦車・守護ゴーレム、砲撃・効果音なし学校プレイに近い戦場を撮影。兵・弾・召喚/UI操作の自然さを録画で点検。遮蔽は戦術として残す。
4. **Phase 4 — 次のGoogle Sites公開:** テスト＋目視レビュー後に単体HTMLを出力し、**ユーザーがGoogleサイトへHTML全文を貼付け、学校iPadで友達と実対戦した状態**を正式公開とする。
5. **Phase 5 — BOT/戦術研究:** 人間の実戦から取得した匿名ログをユーザーが任意共有し、研究と独立テスト。バランス最終判断はユーザーに任せる。

## 常設ルール

- **1vs1と身内プレイを優先**。余計な対戦履歴・ランキング・リプレイ・2vs2大型化は足さない。
- **ゲームバランスはユーザーが判断**。技術側は測定、ボトルネック解消、回帰テストを担当。
- **公開済みGoogle SitesのHTMLや main は検証なしに変更しない**。開発PRを公開版と呼ばない。
- **Googleドライブの自動保存はしない**。学校iPadから貼り付けたい等の指定がある時だけ保存。
- **性能と体感は別**。GitHub ActionsのWebKitヘッドレスFPSを学校の実iPadと断定しない。
- 対戦ログの**端末内記録は初期ON・いつでも停止可**。現行の軽量ルーム保存は**初期OFFで両者が明示同意したときだけ**試合終了後に動作する開発版実装。旧・専用クラウド受付は未展開のまま。main・学校Google Sitesの実際の公開版に収集機能はまだない。公開読取され得るのでプライベートデータは保存しない。

## 2026-10-21 引き継ぎ後｜スマホ一括回収のデータ形式点検

- [commit 3c9066b](https://github.com/8mahi8/shokoku-sensen/commit/3c9066b85f4849b0b38bf3887faa6642f1485606) で `research-recover.html` のJSON変換を点検。既存の正常なカード使用・数値局面は保持しつつ、異常なカード文字列、想定外の制御状態、非数値の座標、任意のネストした文字列を研究バッチへ持ち越さない検査を追加。
- [commit df6933d](https://github.com/8mahi8/shokoku-sensen/commit/df6933d30396a86e39e2d9508bd58a1079bf2ee4) で同回収ページの回帰テストを追加。実装直後の単体JavaScript検証はPASS。GitHub Actionsのsmokeも [#39565086197](https://github.com/8mahi8/shokoku-sensen/actions/runs/39565086197) 成功。研究ブラウザQAと学校実機確認は別判定。
- **権限と公開範囲は未解決:** 管理者のFirebase RTDB Rules全文はこの接続から読めない。親ノードで読み取り許可されている場合、子ノードの拒否設定ではプライベート化できない。匿名公開読取の可能性を隠さず、今は開発PR限定。
- **この修正はデータ回収時の形式検査のみ。** 試合の描画・BOT・HP/攻撃力・通信・ルーム保存タイミングには変更なし。main/学校Google Sitesは未変更。

## 2026-10-21 続行｜スマホ用回収データの最小強化

- 前回修正の研究ログQA [#39565086181](https://github.com/8mahi8/shokoku-sensen/actions/runs/39565086181) は**成功**。
- [commit d898282](https://github.com/8mahi8/shokoku-sensen/commit/d898282b96ebca2e7ce8a461112ad7038212fe58) でスマホ回収の匿名化に実ゲームのカード11種・ユニット9種の許可一覧を追加。将来カードを追加する際は一括回収の許可一覧も更新する。
- [commit 27fa807](https://github.com/8mahi8/shokoku-sensen/commit/27fa807fb15d35dbad640435813f709078597087) で、スマホ上の回収済みJSONをOS共有シートへ渡すボタンを追加。対応しないブラウザでは従来のJSON保存を使う。
- [commit a06e865](https://github.com/8mahi8/shokoku-sensen/commit/a06e86520791d1840f57501546d055c79028242d) で共有用JSONの検証テスト追加。実iPhone Safari/Google Sitesへの公開反映はまだ。
- 本番Firebaseルールの管理者全文は未取得。公開ルーム閲覧のリスクは残るため、データは**匿名・明示同意・公開可能性あり**の運用のみに限定。本番設定は変えない。
- **完了確認:** 研究ブラウザQA [#39595136189](https://github.com/8mahi8/shokoku-sensen/actions/runs/39595136189) SUCCESS。実ログで Chromium / WebKit のスマホサイズでの回収・共有シート（ブラウザ側スタブ）・JSONダウンロードが全てPASS。オンラインゲームのローカル記録のChromium/WebKit/埋込もPASS。実Firebase一時ルームE2Eは先行[#39516983565](https://github.com/8mahi8/shokoku-sensen/actions/runs/39516983565)でPASS。
- **残る受入条件:** 実際の学校iPad＋Google Sitesと帰宅後スマホの実機手動確認、公開可能な匿名ログの運用同意。main/Google Sitesを勝手に更新しない。

## 2026-10-21 夜｜学校用候補の回収再試行バグ修正／成功確認

- **ユーザー操作を妨げる不整合を修正**: `research-recover.html` の再取得失敗後に以前の成功データが共有可能なまま残る状態を修正。Firebase一括回収・管理者JSON取込の開始時に保持バッチと保存/共有ボタンをクリアする。成功時だけ改めて有効化。
- **誤解を招く説明を修正**: 管理者JSON経由で回収してもFirebase上に保存済みの対戦ログの読み取り権限は変わらないと明記。
- **追加テスト**: [commit 9c8d114](https://github.com/8mahi8/shokoku-sensen/commit/9c8d11412dcb447ff7dfacc01d6286e6c2e00461) で失敗時に古いJSONが残らない回帰テストを追加。
- **合格したQA**: [Online smoke #39595856053](https://github.com/8mahi8/shokoku-sensen/actions/runs/39595856053) と[研究ログブラウザQA #39595856072](https://github.com/8mahi8/shokoku-sensen/actions/runs/39595856072)、共に SUCCESS。実iPadではない。前者の成果物 `Shokoku-III-1v1-iPad` に単体HTML（貼付け用TXT）とスマホ回収HTMLを同梱。
- **公開候補の位置**: 開発PR #22のみ。現在の main / Google Sites / Firebase管理者設定は未変更。実学校iPadの対戦と実スマホ回収、匿名ログの公開閲覧可能性の運用同意が未完了。本人の採用判断前に公開しない。
- [学校で使う前の最終チェック](./RESEARCH_LITE.md) を更新済み。新しい機能や管理基盤は追加しない。

## 2026-10-22 未公開仕上げ｜同意チェックの競合を修正

- 開発版UIに古い説明が残っていた: 「自動送信しません」「回収は管理者エクスポート」は、現在の両者明示同意によるFirebase保存・スマホ一括回収と矛盾。ユーザーが誤解しないように修正し、`online-research.js`、学校用`online-ipad.html`、埋込用`online-embed.html`を同期。テスト `tests/online-smoke.cjs` に表示文言の回帰確認を追加。
- **実Firebaseブラウザテストで発見した不具合**: [run #39648413120](https://github.com/8mahi8/shokoku-sensen/actions/runs/39648413120) はホストが「研究用ログをルームに保存」をチェックした際、`locator.check: Clicking the checkbox did not change its state` で失敗。UIがFirebaseの非同期更新の直後に古いキャッシュで`syncOnline()`を呼び、チェックが戻る可能性がある。テスト実行で作った一時ルームの削除は `CLEANUP: confirmed`。
- [修正コミット 4200af5](https://github.com/8mahi8/shokoku-sensen/commit/4200af5b8a593c209372e101a254a694bd5018d2): 同意更新のトランザクション成功時は古い値による即時UI再同期を避ける。拒否時やエラー時だけチェックを戻す。ゲーム通信・BOT・バランス変更なし。
- [Online smoke #39649018500](https://github.com/8mahi8/shokoku-sensen/actions/runs/39649018500) **SUCCESS**、このSHAの成果物 `Shokoku-III-1v1-iPad` 生成。開発版のChromium/WebKit研究QAも別ワークフローで確認中。実Firebase再テストは [#39648967558](https://github.com/8mahi8/shokoku-sensen/actions/runs/39648967558)（途中の結果を成功扱いしない）。
- **追加切り分け:** 同意チェック修正後の [実Firebase QA #39648967558](https://github.com/8mahi8/shokoku-sensen/actions/runs/39648967558) は、同意・実際の戦闘・ゲスト描画・通信診断を通過。その後、SDK受信を意図的にミュートした場面で `muted guest listener should keep a frozen visual world` に失敗。`online-net.js` にはSDKと独立した自動REST復旧があり、最新戦況へ進むのは望ましい動作。ログの `65 !== 51` は通信不具合の根拠ではない。
- [テスト修正 15f26a4](https://github.com/8mahi8/shokoku-sensen/commit/15f26a4b0bd14e7405b52691f5493e6026a490df): 進んだ場合は必ず `restSeq` が伴うことを証明し、SDKが止まってもRESTで進める場合は合格扱い。進まなかった場合は手動トリガーでREST復旧を引き続き検証。ゲームのREST実装は変更しない。最新の実Firebaseテスト [#39649403351](https://github.com/8mahi8/shokoku-sensen/actions/runs/39649403351) の結論を確認すること。
- **公開は未実施**。main・Google Sites・Firebase設定はそのまま。匿名ログの公開閲覧可能性と学校iPad＋実iPhone Safari実機確認は引き続き公開判断の条件。

## 2026-10-22 開発版の最終ブロッカー｜一括回収実Firebaseで未達

- 実Firebase試験 [#39649403351](https://github.com/8mahi8/shokoku-sensen/actions/runs/39649403351) では同意ON、2ブラウザ対戦、WebKit REST自動復旧、ブラウザ接続断復旧、**研究ログの実Firebaseルーム保存はPASS**（カード行動7件・戦況サンプル3件）。最後のスマホ「一括回収」が22秒でタイムアウト。以前の開発QA [#39516983565](https://github.com/8mahi8/shokoku-sensen/actions/runs/39516983565) の成功だけで最新の本番候補が完全合格したとしない。
- 回収の調査用[run #39650030475](https://github.com/8mahi8/shokoku-sensen/actions/runs/39650030475)でも対戦・自動REST復旧・ログ保存までPASS（8 actions, 3 samples）、スマホ一括回収で22秒タイムアウト。HTTP失敗や明示エラー表示はログに見えない。試験ルームの削除もこの回では`CLEANUP: not confirmed`で、削除確認済みと記載しない。
- [smoke #39650105253](https://github.com/8mahi8/shokoku-sensen/actions/runs/39650105253) はPASS。Firebaseルーム一覧の公開HTTP 200、**ルーム件数43**。件数150上限による拒否ではない。読み取り頻度・遅延、正常ログの変換／ルーム跨ぎ回収を再調査する。
- 暫定結論：**学校公開候補はまだ確定させない**。ユーザーには完成済みの単体HTML全文を提示しているが、スマホ回収は未合格。初期OFFの研究ルーム保存を本番でONにしない。main／Google Sites／Firebaseルール／HP・攻撃力・BOT／対戦通信は変更しない。
- 次の実装候補：回収ボタンの経過表示（読み取り対象件数と実行中段階）、タイムアウト時の詳細診断、ルーム内ログの取得時間短縮。新サービス・課金・認証基盤は不要。原因を特定してから最小変更で対応する。

## 2026-10-22 一括回収の並行処理改善（開発PRのみ）

- [回収診断 #39650678888](https://github.com/8mahi8/shokoku-sensen/actions/runs/39650678888) で、**研究ログ7件・戦況3サンプルの実Firebase保存PASS**、しかしスマホ回収は`研究ログを検索中: 24/45ルーム`で22秒を超過。ログの時点ではFirebaseルーム一覧は45件、150件の上限には達していない。
- 回収ページは旧方式の「4件ずつの逐次処理」により、空の既存ルームもすべて調べる必要があった。 [commit 3c013c3](https://github.com/8mahi8/shokoku-sensen/commit/3c013c3983e01257cde0b7a0b4132179c1c018da) で**最大12件の並行ワーカー**に変更。以前と同様、`researchRounds` のみを読み、相手情報やゲーム状況の取得・新規送信はしない。
- 一部の読み取りに失敗した場合、全ワーカー完了後にエラーを表示してダウンロード/共有ボタンを無効にする。誤って一部の対戦だけを「全件成功」として返さない。
- [commit c4f89c0](https://github.com/8mahi8/shokoku-sensen/commit/c4f89c0b03bb9614355448dede10204a098905a5) に48ルーム遅延・同時12件制限・1件の拒否で全件成功にしないテスト追加。[smoke #39651799618](https://github.com/8mahi8/shokoku-sensen/actions/runs/39651799618) は**SUCCESS**で`PASS: 48-room bounded parallel recovery and complete failure handling`を確認。[研究ブラウザQA #39651854912](https://github.com/8mahi8/shokoku-sensen/actions/runs/39651854912) もSUCCESS。
- **最終合格:** 実Firebase＋WebKitの一時ルーム通しテスト [#39651854783](https://github.com/8mahi8/shokoku-sensen/actions/runs/39651854783) が **SUCCESS**。実際のPCホスト＋WebKitゲストで、研究ログのFirebaseルーム保存（7 actions、3 samples）→スマホ風ブラウザから番号入力なしで**1試合を全件回収**→同ルーム7ラウンドの連戦・再戦確認→一時ルーム**CLEANUP: confirmed**。CIのWebKitは学校の実iPadではない。
- **現在の次段階:** 開発版の自動テスト受入れは合格。Google Sitesでの実機1vs1・帰宅後iPhone回収および公開読取の運用可否は未確認。**Google Sites/main/管理者Firebase設定は未変更**。
- 学校で遊ぶ身内1vs1を最優先にし、BOT/HP/攻撃力・リアルタイム通信方式に変更なし。研究ログは両者同意が必要な初期OFFのまま。

## 2026-10-22 学校試用直前｜スマホ用コピーの予備手段追加

- PR #22の研究ログ回収ページに `JSONをコピー・表示` ボタンを追加。Google Sites iframe上でOSのファイル保存や `navigator.share` が制限されても、匿名JSONテキストを表示・選択して手動コピーできる。コピーAPIが許可されていれば自動コピー。**端末外送信・ゲームの対戦通信・Firebaseルール変更はなし**。
- JSONの再読み込みが失敗した場合は、保存・共有・コピーの全ボタンを無効化し、以前表示されたコピー用テキストも消す。スマホの操作を想定した退避機能のみ。
- `tests/research-recover.cjs` にコピー用テキストの匿名化・選択可能性・失敗時の消去を追加。Chromium/WebKitの `tests/online-research-browser.cjs` でもコピー用JSONの表示を検証。
- [Online smoke #39652978840](https://github.com/8mahi8/shokoku-sensen/actions/runs/39652978840) **SUCCESS**。[研究ブラウザQA #39653007400](https://github.com/8mahi8/shokoku-sensen/actions/runs/39653007400) **SUCCESS**。実Firebase通し試験は直前のゲーム・保存・回収の同じ処理経路で[#39651854783](https://github.com/8mahi8/shokoku-sensen/actions/runs/39651854783) **SUCCESS**。
- `docs/ONLINE_1V1.md` を直し、**学校iPadはGitHub PagesのURLを埋めるのではなく、単体HTML全文をGoogle Sitesの「埋め込みコード」へ貼り付ける**手順に統一。最新ブランチの成果物を使い、mainのRaw旧版と混同しない。
- **進行位置 Phase 3/4。次は本人による実iPad/実iPhoneでの試用と採用判断だけ。** 本番の main / Google Sites / Firebase管理者設定は変更せず、PR #22 はDraftのまま。研究ログが他者に閲覧され得る制約も維持。新機能拡張はここで一区切り。

## 2026-10-22 本人の新方針｜匿名対戦ログは初期ON（最優先の現在仕様）

- ユーザー指示：「初期はオンでいい。友達とやるだけで、何を取るかは説明欄に記載済み」。以前の**初期OFF・双方の追加チェック必須**という記述は過去仕様。**新規ルーム作成・参加時は端末内の匿名記録とFirebaseルームへの匿名ログ保存が両者とも初期ON**に変更。
- **拒否機能は維持**：各人が「研究用ログをルームに保存」をOFFにすれば片方だけでもルーム保存されない。端末内の「記録停止」もその人のクラウド設定をOFFにする。停止後に端末内だけONへ戻してもクラウドは自動ONにならない。試合中も停止可能。既に送信済みのログはOFFでは削除されない。
- ゲーム内に保存内容（カード使用・戦況・勝敗）と公開読み取り可能性、OFF操作を表示。名前・端末ID・チャット等は研究ログペイロードに含めない。ただしルーム自体の情報や参加時刻との照合による間接的な推測は完全には防げず、現行Firebaseルール全文は未確認。改ざん、無関係の第三者閲覧、通信量増加は継続リスク。
- **変更範囲**：`online-net.js` の新規ホスト/ゲストの初期値、全体停止時のクラウド停止連動、`online-research.js` の表示文言。貼付け用 `online-ipad.html` / `online-embed.html` へ同期。`tests/online-sim.cjs` / `tests/online-smoke.cjs` / `tests/online-browser-live.cjs` で挙動を確認。本番`main`・Google Sites・Firebase Rulesは変更しない。
- コードの初期ON化はPR #22の**開発版に限定**。以前渡した試用ZIPは旧初期OFF版を含む可能性があるため、学校用に貼るなら最新ビルド成果物を使う。実iPad/Google Sitesの動作確認が済むまで本番版とは呼ばない。

## 毎回のユーザー向け開発位置表示（短い固定フォーマット）

**開発位置｜小国戦線III**
- **現在:** 新運用 Phase 3/4 — 匿名ログの実Firebase一括回収を含む自動QA合格。残りは学校実iPad/Google Sitesと実iPhoneの確認、公開可能性の採用判断。
- **今回:** ［実際に調査・実装・検証した結果。成功/未検証を区別］
- **次:** ［具体的な次のタスクを1つ］
- **公開:** Google Sitesは変更なし / 次版の貼替え待ち
- **参照:** PR #22 と本ファイル

段階・公開状態が変わったら**このファイル自体を更新**する。新チャットがこの正本を読み込んで開始できるように保つ。
