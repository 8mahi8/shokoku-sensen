# 小国戦線III｜開発担当AIへの最新引き継ぎ（2026-10-27 夜）

## 2026-10-27 深夜追加：固定端末ロール交換・赤軍初期カメラ

**最新ゲーム修正 [113e726](https://github.com/8mahi8/shokoku-sensen/commit/113e72683e95fefccb6d068d925e33995f4c1271)。** 赤軍ゲストが新しい部屋/ラウンドの最初の状態を受信したとき、以前の青側メニューのカメラ座標からゆっくりパンさせず、赤軍側の初期画面へ即時に合わせる。試合中の自動移動とスワイプは変更していない。開始直後の合法位置タップが有効になるまでの遅延が疑われたための限定対策で、原因確定・学校実機改善の断言はしない。詳細：[初期カメラ検証](GUEST_FIRST_REMOTE_CAMERA_SNAP_2026-10-27.md)。

**新QA [固定端末役割交換](FIXED_DEVICE_ROLE_CROSSOVER_2026-10-27.md)：** 従来の2ブラウザ7ラウンド/6再戦/ゲスト切断復帰/BOTルームに加え、同じ2つのタブで旧赤ゲストが新青ホストとして部屋作成、旧青ホストが新赤ゲストとして入室。開始直後に固定合法世界座標(1130,405)を画面へ射影したタップで召喚し、実Firebaseで命令が通ってゲストへ反映するか確認。追加の一時Firebaseルームは必ず削除。録画ありChromium/WebKitの旧テストでは、ロール交代でChromium約60FPS・WebKit約10FPSの端末別傾向が変わらなかった（Linux CI、実iPadではない）。

**通信/CI補助：** [ホスト送信一時停止診断](WEBKIT_HOST_PUBLISH_GAP_DIAG_2026-10-27.md)ではゲスト回線切断中にWebKitホストの状態番号が1.5秒進まないケースを観測したため、同時刻のホストrAFギャップ・Firebase送信経過・JSエラーをログに出し、最大6秒まで再開を厳密に確認。恒久停止した場合は必ずFAILする。ゲームの送信周期/ルールを変更していない。

**最新コードの検証：** 113e726に対する基本smoke #40523519047、iPad UI #40523519050、Art #40523519105、Guest Lab #40523519136、HUD #40523519090、戦闘映像 #40523518933、実Firebase BOTフルマッチ #40523519064 はすべてSUCCESS。今回のBOT試合はゲーム時間113.7秒で首都破壊決着、青10手/赤13手、最大10体、WebKitゲスト最大rAF 380ms/500ms以上0、JSエラー0、テストルーム削除成功。300秒戦ったわけではない。

**残る必須ゲート：** [実Firebase2ブラウザ3条件 #40523519043](https://github.com/8mahi8/shokoku-sensen/actions/runs/40523519043) はこの記録時点で実行中。現在成功済みと呼ばない。録画あり/なしChromium/WebKit、同一WebKitをすべて確認し、失敗したらcommand/feedback、カメラ射影位置、座席ID、SDK状態を照合して最小修正する。

**保存ルールを厳守：** Google Driveにはユーザーが「保存して」と言った場合のみ保存。学校Google Sites版、GitHub main、Firebase rulesも明示指示なしで変更しない。開発PR #22はDraft。

## 最初に読むこと・ルール

あなたは学校iPad（Safari）で友達と無料で遊ぶ横スクロールRTS「小国戦線III — FORTRESS FRONT」の開発担当AI。
- Repository: https://github.com/8mahi8/shokoku-sensen
- Development branch: `perf/online-guest-snapshot-diagnostics-20261020`
- Draft PR #22: https://github.com/8mahi8/shokoku-sensen/pull/22
- **この資料の最終追記時ゲームコード: `c2ac17f63882d5a078d6781f3515cdcdc37a83e1`、QA修正: `e0883804c6502b802b466c28fab545731c5252d4`。次作業前にHEAD/CIを再読込すること。**
- 進行台帳: [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md)
- 重複実験防止: [PERFORMANCE_EVIDENCE.md](PERFORMANCE_EVIDENCE.md)
- 学校向け貼付手順: [ONLINE_1V1.md](ONLINE_1V1.md)
- 2026-10-27の受信/描画調整: [GUEST_VISUAL_SMOOTHING_2026-10-27.md](GUEST_VISUAL_SMOOTHING_2026-10-27.md)
- 低FPSキャッシュ生成: [GUEST_CACHE_WARMUP_2026-10-27.md](GUEST_CACHE_WARMUP_2026-10-27.md)
- 直近の召喚操作フィードバック: [GUEST_INPUT_FEEDBACK_2026-10-27.md](GUEST_INPUT_FEEDBACK_2026-10-27.md)
- 過去のゲスト停止原因切り分け: [GUEST_SDK_STALL_DIAGNOSIS_2026-10-26.md](GUEST_SDK_STALL_DIAGNOSIS_2026-10-26.md)

**最優先の開発ルール**：
1. Google SitesにHTML/CSS/JS全文を「埋め込みコード」へ直接貼る方式。学校ではGitHub Pagesを使用しない。古い学校公開版は**本人に断らず一切変更しない**。GitHub `main`・本番Firebaseルールも勝手に変更しない。開発ブランチ／Draft PR上で調査・変更・テスト・GitHub記録まで進める。
2. 無料厳守。ログ収集/研究用保存/スマホ回収の再導入は不要。友達との1vs1の快適さが最重要。操作は少ないタップが好み、音は不要。
3. ユーザーの「任した」「任せた」は研究・実装・検証・GitHub保存まで自主的に進めてよいという意味。実装後は自動QAと実際の録画を確認し、結果が未確定なら合格と書かない。
4. Google Sites用 `online-ipad.html` と `online-embed.html`、分割ソース `online-game.js` `online-net.js`、必要な場合は `guest-lab-game.html` の同期を維持する。smokeにはHTML同一性テストあり。
5. ゲストだけのラグを改善することが主眼。攻撃/資源/召喚のホスト権威、戦闘バランス、ホストのpublish間隔を根拠なく変えない。見た目だけの改善と本当の通信/処理速度改善を混同しない。
6. 重複するCanvas/CSS/HUDの負荷実験は既に多数実施済み。`PERFORMANCE_EVIDENCE.md`を読む前に繰り返さない。headless WebKitのrAF値を学校の実iPad性能と同一視しない。

## 2026-10-27 最終検証追記：今回の開発QA 7系統通過（以降は実機の体感判定）
- **ゲーム/診断最新コミット:** [c2ac17f](https://github.com/8mahi8/shokoku-sensen/commit/c2ac17f63882d5a078d6781f3515cdcdc37a83e1)。**WebKit戦闘QA隔離:** [e088380](https://github.com/8mahi8/shokoku-sensen/commit/e0883804c6502b802b466c28fab545731c5252d4)。以後はGitHub docs更新のみ。詳細：[最終検証記録](GUEST_VISUAL_AND_CI_ACCEPTANCE_2026-10-27.md)。
- **実Firebase2ブラウザ [#40516092601](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092601): 3/3 SUCCESS**。録画あり Chromium/WebKit、録画なし Chromium/WebKit、同一WebKit両端が完走。7ラウンド6再戦、切断・復帰、最新seq、テスト用Firebase2ルーム削除確認を維持。旧runの録画なし12分キャンセルを解消。
- **実Firebase BOT full match [#40516092866](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092866): SUCCESS**。実戦300秒、青34手赤34手、最大16体、ゲスト最大フレーム間隔325ms、500ms以上0、page error0、通信再送0、REST停滞補助0、テストルーム削除確認。代表10カ所の録画を目視し、進軍/戦闘/カード/HUDの更新を確認。
- **WebKit/Chromium戦闘ビジュアル [#40517254705](https://github.com/8mahi8/shokoku-sensen/actions/runs/40517254705): SUCCESS**。22場面全部、合法な8/10/14/18/20体、タンクとゴーレム、ファイヤー、Chromiumコンパクト、WebKit録画・無録画・Canvas非描画対照。6場面の画像を抽出目視し、主要な表示に明白な崩れは認めず。以前のWebKit WebProcessのクラッシュは場面ごとのbrowser/context隔離で今回のrunでは再現せず。
- **smoke [#40516092610](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092610)、iPad UI [#40516092678](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092678)、WebKit HUD [#40516092686](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092686)、キャッシュ画像 [#40516092677](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092677) もSUCCESS。**
- **受入評価はまだ保留:** Linux headless WebKitのFPSは学校iPad Safari実測ではない。CIのゲストだけが特殊に悪いとの確証はなく、時折の軽いカクつきの体感は次の学校iPad対戦でホスト/ゲスト交代して確認する。次の開発では、学校実機と再現証拠が対応する場合にだけ最小変更。
- **運用厳守:** Google Driveは君から「保存」と頼まれた場合のみ。今回の処理でGoogle Sites版、`main`、Firebase Rules、既存Driveファイルは変更していない。

## 2026-10-27 追加引継ぎ｜描画前反映・短いカクつき調査・CI安定化
- **直近ゲーム変更:** [b949e8b](https://github.com/8mahi8/shokoku-sensen/commit/b949e8b2e739d97007eed75d3840130b91e8b151) はSDKの受信済み最新stateをゲームの描画rAFより前に適用する`flushGuestBeforePaint`を導入。二重反映防止・旧ラウンドの遅延callback隔離を含む。ラウンド/資源/host tick/Firebaseプロトコルは不変。[詳細](GUEST_PREPAINT_APPLY_2026-10-27.md)。
- **短いカクつき診断:** [3cb80d3](https://github.com/8mahi8/shokoku-sensen/commit/3cb80d368fdbeff452049fed9b67ad6fefb9e8fc) で180ms以上のゲストrAF gapを検出し、local QAのみSDK・反映seq、REST・描画時間を同一フレームに記録。[c2ac17f](https://github.com/8mahi8/shokoku-sensen/commit/c2ac17f63882d5a078d6781f3515cdcdc37a83e1) で**描画前の最新状態反映が終わってから**停止時のseqを診断記録する順序へ修正。診断の誤読防止でありFPS改善の主張ではない。
- **実Firebase長時間BOT:** [#40509005551](https://github.com/8mahi8/shokoku-sensen/actions/runs/40509005551) SUCCESS。300秒完走、青34手・赤33手、最大15体、最大ゲストrAF gap473ms/500ms超0、JSエラー0。WebKitゲストFPSは学校iPadを代表しない。
- **CIのapt依存を解消:** [6d318d5](https://github.com/8mahi8/shokoku-sensen/commit/6d318d57e4c3e82931626b1c0b8aeea1e9e0cfa0) でPlaywright 1.56.1公式コンテナを採用、UbuntuパッケージDLによる12分超タイムアウトを回避。 [visual #40511464414](https://github.com/8mahi8/shokoku-sensen/actions/runs/40511464414) SUCCESS。
- **CI自身の長時間無応答を改善:** [c2ac17f](https://github.com/8mahi8/shokoku-sensen/commit/c2ac17f63882d5a078d6781f3515cdcdc37a83e1) でWebKit通信QAに短い操作timeoutと場面別ログ、no-video条件では代表のdense戦のみ画像撮影を導入。テストの7ラウンド/再戦/切断復帰は省略しない。[#40516092601](https://github.com/8mahi8/shokoku-sensen/actions/runs/40516092601) の録画なしChromium/WebKit条件が**SUCCESS**（過去の長時間キャンセルが解消）、録画ありChromium/WebKit条件もSUCCESS。テスト用Firebaseルーム2件は削除確認。同一WebKit条件は最後のCI結果確認を要する。
- **WebKit戦闘ビジュアルQA:** 最初の5つの合法な戦闘シーンの計測は成功したが、6つ目のスペル戦最初のスクリーンショットで`Target crashed`。ゲームJS例外ではないが原因は未確定。[e088380](https://github.com/8mahi8/shokoku-sensen/commit/e0883804c6502b802b466c28fab545731c5252d4) で**22場面をすべて保持したまま**1場面ごとにbrowser/contextを新規生成するQA改修を実装。次の[visual CI #40517254705](https://github.com/8mahi8/shokoku-sensen/actions/runs/40517254705)の完走を確認し、未完了なら成功としない。
- **最新の進捗記録:** [今回の診断](GUEST_QA_TIMEOUT_RECOVERY_2026-10-27.md)、[ビジュアルQAの隔離](WEBKIT_VISUAL_QA_CONTEXT_ISOLATION_2026-10-27.md)、[5分実戦](PREPAINT_FIVE_MIN_VALIDATION_2026-10-27.md)。
- **ユーザーからの最新の指示:** 「毎回最新版をGoogleドライブに保存しなくていい。俺が言った時に保存して」。今後は**明示された回だけ**Driveに保存し、それ以外の開発証拠はGitHubに記録する。Google Sites公開版も本人の貼付操作なしに変更しない。
- **次の作業:** #40516092601の同一WebKit条件、#40516092866のBOT完走、#40516092678のiPad UI、#40517254705の分離ビジュアルQAの完走・ログ・実画像確認。残る軽いカクつきは学校での同一iPad・役割交代が最終採否。headlessでの4〜7FPSは同条件ホストも遅く、ゲスト役だけが原因と断定しない。

## 直近の学校実機フィードバック（ユーザーの正確な意図）
- 2026-10-27、友達の「悪くもなく良くもなく」は**ゲームの面白さではなくゲスト側の通信・ラグについて**。
- 「ゲスト側の大きな画面フリーズはだいぶ改善した。たまに少しカクつく」。
- 過去にはゲスト側全画面がカクついて召喚操作も反応しにくい場面があった。
- **次の登校まで開発を続けてよい**。学校実機での結果待ちを理由に停止しない。旧安定版を温存しつつ新しい試遊候補を磨く。

## 完了した主な通信/描画改善と証拠
1. 実FirebaseのWebKitゲストとChromiumホストの両動画・状態seqから、ゲストSDK受信が2秒以上止まる一方、ホストとRESTは先行する事象を確認した。ゲストに**約1.1秒で早期REST回復（2.2秒間隔を上限）**を追加。SDKのキャッシュ読取をライブ受信と誤認しない修正。前回の大きなフリーズは学校実機でも体感改善。[原因台帳](GUEST_SDK_STALL_DIAGNOSIS_2026-10-26.md)。
2. 表示用の歩行補間は**最大240ms**まで、兵士が移動中だけ。戦闘を予測しない。さらにゲストの30FPS安全モードはrAFが8.5秒継続して55FPS以上なら解除できるよう変更（20秒の再制限クールダウン）。[詳細](GUEST_VISUAL_SMOOTHING_2026-10-27.md)。
3. 低FPSの混戦でキャラのオフスクリーン姿勢タイルを大量同期生成しないよう、**新規タイル最大2枚／描画フレーム**。未生成時はフルアートのまま描く。[実Firebase WebKit 5分フルマッチ #40489499643](https://github.com/8mahi8/shokoku-sensen/actions/runs/40489499643) SUCCESS：青45手・赤32手、最多17体、58タイル生成、1フレーム最大2枚、ゲスト最大rAF間隔270ms、500ms以上0、例外0、Firebaseテストルーム削除。これで学校実機のカクつきが完全に直ったとは未認定。[詳細](GUEST_CACHE_WARMUP_2026-10-27.md)。

## 今回の最新変更：ゲストの召喚タップ「送信中」表示
- ゲストが手動でカードを選び、戦場タップ後`NET.sendCommand({id,x,y})`が送信キューへ渡ったときだけ、タップ位置に**水色リング＋「送信中」**を650ms表示する（最多4個）。成功した召喚を偽装せず、ホストからの状態に基づく実際の召喚まではユニットを増やさない。
- 通信/資源/当たり判定/ホストの権威は変更なし。ロビー・再戦で消去。送信拒否時は表示しない。ゲストBOTの自動操作中も表示しない。
- Latest code: [a10bf4ca](https://github.com/8mahi8/shokoku-sensen/commit/a10bf4cad89b5a548e7dac1fc707066b4dc26168) → [23e011db](https://github.com/8mahi8/shokoku-sensen/commit/23e011db6b8eb5e78d256d739291617ab4ef415f) → **[115733c4](https://github.com/8mahi8/shokoku-sensen/commit/115733c4da)**（兵士の下で文字を読みやすくする薄い背景ラベル）→ **[cadad056](https://github.com/8mahi8/shokoku-sensen/commit/cadad05680b8f7bc2c0254ea79db41e3476e8151)**（ラベル背景描画のCanvasモック・コントラスト検証を追加）。
- 手動の実`PointerEvent`を使った1端末ゲストラボの [#40494607883](https://github.com/8mahi8/shokoku-sensen/actions/runs/40494607883) はWebKit/Chromium両方SUCCESS。歩兵カード選択→戦場(x1150,y330)タップ→キュー表示→ホストが正規の歩兵(uid2)を召喚→ゲストが新ユニット受信→ヒント650ms後消去を検証。
- 描画証拠を得るため、Playwright通常スクリーンショットは撮影時に650msが経過しがちだったので、**表示中のCanvasから`toDataURL`で直接画像を保存**するよう変更。[814b89ef](https://github.com/8mahi8/shokoku-sensen/commit/814b89ef56f377eee588016621a37c983652a1ca) 以降。
- 2026-10-27 20時JST頃の照会では、最新HEAD `cadad056` の [smoke #40496620588](https://github.com/8mahi8/shokoku-sensen/actions/runs/40496620588) **SUCCESS**。少し古いコード版`23e011db`のsmoke、iPad UI、WebKit HUD、キャラ描画、戦場視覚、実Firebase BOTフルマッチはSUCCESS。フルマッチでは兵士最大12体、ゲスト最大frame gap512msが1回（例外0、REST長期停止0、確定済）。**最新のラベル背景プレート変更を全ケース通過済みとみなさないこと**。
- [WebKit/Chromiumの新キャンバス画像保存QA #40496044137](https://github.com/8mahi8/shokoku-sensen/actions/runs/40496044137) は照会時点でChromium SUCCESS、**WebKitはまだin_progress**。さらに [実Firebase 2ブラウザQA #40494926741](https://github.com/8mahi8/shokoku-sensen/actions/runs/40494926741) は`cancelled`で、失敗と無条件に決めつけず原因/再実行を検討する。
- 追加したばかりのラベル背景についても、必要なら同条件の最終Canvas画像で可読性を再確認し、WebKit CIを完了まで確かめる。

## 次に行う作業（推奨順）
1. **最初に最新GitHub HEAD・PR #22・Actions状態を再確認**（同時作業でHEADが進む場合あり）。#40496044137 WebKit/Chromium、#40496620588 smoke、実Firebase2ブラウザの未完/キャンセルを整理。必要なら最終HEADでテストを回し直し、ユーザーに誤って合格を約束しない。
2. 新「送信中」ラベルを**同じCanvasフレームで保存したPNG**で目視し、背景ラベルが文字に被らないか、カード/UIに邪魔にならないか、兵士の操作を阻害しないか確認する。無駄な装飾の増加は避ける。
3. 改善が必要なら小さく修正し、`online-game.js`／`online-ipad.html`／`online-embed.html`／`guest-lab-game.html`を揃える。smoke+WebKitゲスト実操作+実Firebase長時間対戦・相互ブラウザテストで検証。**動画とrAF/SDK適用の両方**を見て、画面の静止と通信停止を区別する。
4. **Google Driveへの保存は本人から明示的に「保存して」と言われた場合のみ。** 日常の開発ではGitHub開発ブランチ・CI artifact・docsに保存する。学校Google Sites公開版と既存Driveファイルは勝手に差し替えない。
5. 引き継ぎの進捗を`docs/DEVELOPMENT_STATUS.md`等に追記。実機で確認が必要な点が明確になるまで自主開発を続けてよいが、誇大な改善主張を避ける。

## 長期目標・基準
- 最重要：友達との実iPad Safari/Google Sites直接埋込による**ゲストだけ固まる/召喚に反応しない**問題の抑制。すでに大きなフリーズは学校で「かなり改善」と評価されたので、この安定性を絶対に壊さない。
- ホストとゲストの滑らかさの差をなるべくなくす。映像の1秒以上の戦場時計停滞やrAF 500ms超などは、新旧の数値だけでなくネットワーク/描画を照合する。
- 学校版試遊以前の開発継続は本人承認済み。ただし試用時には**本人がGoogle Sitesで貼付操作**する。公開Google Sites版とmainに勝手な変更を加えない。
- 正確で短い報告：「今回行ったこと」「証拠」「残る問題」「次工程」。友達用で研究ログ不要。
