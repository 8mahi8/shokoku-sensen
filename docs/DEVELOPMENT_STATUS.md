# 小国戦線III — 開発位置の正本

更新: 2026-10-21 JST / 作業担当: ChatGPT

このファイルは**次のAI担当・新しいチャットでも開発方向がぶれないための進行表**。
着手時に main / 作業PR / 本ファイルを確認し、毎回のユーザー報告末尾に同じ「開発位置」を表示する。
これは実際の達成を証明する進捗表で、根拠のない「完成度76%」等は書かない。

## 現在地

- **優先段階: Phase 1 / 5 — 描画・通信の最適化**
- **対象ゲーム:** 小国戦線III — FORTRESS FRONT、学校iPad＋Google Sites埋め込み、身内1vs1
- **公開版:** 学校Google Sitesで現在遊べるHTML（直接貼り付けなのでGitHub側の変更では自動更新されない）
- **本番 main:** `7db1c98cb51d9841f5f43941767c9972cbef932d`（この文書作成時の確認値。更新時は再確認）
- **開発候補:** PR [#22](https://github.com/8mahi8/shokoku-sensen/pull/22) / `perf/online-guest-snapshot-diagnostics-20261020`、**Draft・未公開**
- **いまの最優先課題:** **HUD更新の不要なDOM書き換えを開発版で削減し、固定10体・Canvas停止WebKitでは大型あり約51.9→61.3 FPSへ改善（2試行平均）**。HUDそのものを停止しなくても大型なし62.4 FPSに近づいた。オンライン3ファイルへ同期済み。次は実Firebaseオンライン・動く8～20体・録画目視・Google Sites相当サイズの結果を確認し、実iPadでの体感検証を残課題とする。ヘッドレスCI値を実機FPSと同一視しない。公開版は変えない。
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

- **2026-10-21 実戦負荷の18体／20体追加（CI確認中）:** QA限定の正規召喚 `crowded`（9体×2軍、各軍コスト11）、`dense`（10体×2軍、各軍コスト10）を `online-game.js` / `online-ipad.html` / `online-embed.html` に同期（最終修正commit [`2a5936e`](https://github.com/8mahi8/shokoku-sensen/commit/2a5936e3a86f81bde643b0f45974f260b576a4f1)）。両者は既存の部隊ステータス、召喚範囲、カードコスト、手札運用だけを使い、ゲームルールを変更しない。テストの赤軍座標が前哨基地から計算する合法召喚ライン（x≥819）より1〜4だけ敵側に寄りすぎて最初のCIが失敗したため、テスト座標だけ修正。召喚制約はゲーム本体側が正常に拒否した。修正後のHTML/JS [smoke #39493081154](https://github.com/8mahi8/shokoku-sensen/actions/runs/39493081154) 成功。実画面・録画は [WebKit/Chromium #39493068175](https://github.com/8mahi8/shokoku-sensen/actions/runs/39493068175)、実Firebase/同一ルーム7試合は [#39493068054](https://github.com/8mahi8/shokoku-sensen/actions/runs/39493068054) で確認し、完了までは成功と記載しない。

- **2026-10-21 最新の実Firebase 7試合連続テスト合格:** [Actions #39493068054](https://github.com/8mahi8/shokoku-sensen/actions/runs/39493068054)。同一の一時RTDBテストルームで初戦＋6再戦が成功。標準14体、通常10体、大型入り10体、砲撃8体、密集18体、密集20体のいずれもホスト正規カード召喚・Firebase state公開・WebKitゲスト反映・フレームエラーなし。ルーム移行で埋め込みiframeはリロードしない。テストルーム削除はログで要再確認（性能指標とは独立）。各場面1.5秒測定のWebKit guestフレームは6〜12サンプル、p95ギャップは432〜772msと**CI内の描画快適性は合格と判断できない**。並列CI負荷や録画ありの影響も候補であり、学校実iPadの実測FPSではない。**Phase 1はまだ完了と宣言しない**。

## ロードマップ（順序固定・途中で改善余地は再評価）

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
- 対戦ログは匿名/端末ローカルの初期ON＋いつでも停止可能。自動クラウド送信しない。

## 毎回のユーザー向け開発位置表示（短い固定フォーマット）

**開発位置｜小国戦線III**
- **現在:** Phase 1/5 — 描画・通信最適化（作業中）
- **今回:** ［実際に調査・実装・検証した結果。成功/未検証を区別］
- **次:** ［具体的な次のタスクを1つ］
- **公開:** Google Sitesは変更なし / 次版の貼替え待ち
- **参照:** PR #22 と本ファイル

段階・公開状態が変わったら**このファイル自体を更新**する。新チャットがこの正本を読み込んで開始できるように保つ。
