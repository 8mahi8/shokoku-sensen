# 小国戦線III — 開発位置の正本

更新: 2026-10-21 JST / 作業担当: ChatGPT

このファイルは**次のAI担当・新しいチャットでも開発方向がぶれないための進行表**。
着手時に main / 作業PR / 本ファイルを確認し、毎回のユーザー報告末尾に同じ「開発位置」を表示する。
これは実際の達成を証明する進捗表で、根拠のない「完成度76%」等は書かない。

## 現在地

- **優先段階: 安定版1vs1の継続運用（実機最終確認待ち）＋ 新運用Phase 2／4 — 匿名対戦データの自動蓄積基盤（開発・未公開）**
- **対象ゲーム:** 小国戦線III — FORTRESS FRONT、学校iPad＋Google Sites埋め込み、身内1vs1
- **公開版:** 学校Google Sitesで現在遊べるHTML（直接貼り付けなのでGitHub側の変更では自動更新されない）
- **本番 main:** `7db1c98cb51d9841f5f43941767c9972cbef932d`（この文書作成時の確認値。更新時は再確認）
- **開発候補:** PR [#22](https://github.com/8mahi8/shokoku-sensen/pull/22) / `perf/online-guest-snapshot-diagnostics-20261020`、**Draft・未公開**
- **いまの最優先課題:** ユーザーと合意した運用ロードマップは「安定版の実機確認→友人戦ログの安全な自動蓄積→実戦ログでBOTを研究→バランスはユーザー判断」。1vs1描画・再戦・Firebase断線復帰は前段階のCIで合格したが学校実機FPSは未判定。**現在は研究データの収集側を開発PR #22で実装中、Firebase側の非公開ルールと書込濫用対策が未構成なのでクラウド送信の起動をハードOFFにした。**
- **次の公開版候補:** 快適性アップデート。新機能やバランスを増やさない。
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

## 2026-10-21 合意した新しい運用ロードマップ（優先）
1. **安定版1vs1の維持:** キャラHP/火力はユーザー判断。性能と学校iPad最終確認は必要なときだけ検証。
2. **対戦データの安全な自動収集（現在）:** 友達同士のオンライン対戦でも、両者が明確に同意すれば研究ログが残る基盤を構築。**開発版の送信コードは完成したが、Firebaseの非公開設定・サーバー側の送信濫用対策・権限確認が終わるまで全送信をハードOFF。** main/Google Sitesは未変更。
3. **記録でBOT研究:** 管理者だけが研究ログを取得し、匿名のカード・局面・勝敗データを統合。勝率・費用配分・防衛放棄/攻め続けの判断をオフライン反証テスト。勝手な自動学習はしない。
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
- 対戦ログの**端末内記録は初期ON・いつでも停止可**。クラウド収集は別の初期OFFで両者事前同意が必要。現段階は安全性ゲートによってクラウド送信自体を無効化しており、Firebase設定を検証するまでは公開しない。

## 毎回のユーザー向け開発位置表示（短い固定フォーマット）

**開発位置｜小国戦線III**
- **現在:** 新運用 Phase 2/4 — 匿名対戦ログ収集の安全な基盤構築（実装済み・Firebase側設定待ち）
- **今回:** ［実際に調査・実装・検証した結果。成功/未検証を区別］
- **次:** ［具体的な次のタスクを1つ］
- **公開:** Google Sitesは変更なし / 次版の貼替え待ち
- **参照:** PR #22 と本ファイル

段階・公開状態が変わったら**このファイル自体を更新**する。新チャットがこの正本を読み込んで開始できるように保つ。
