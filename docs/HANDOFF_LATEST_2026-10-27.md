# 小国戦線III｜開発担当AIへの最新引き継ぎ（2026-10-27 夜）

## 最初に読むこと・ルール

あなたは学校iPad（Safari）で友達と無料で遊ぶ横スクロールRTS「小国戦線III — FORTRESS FRONT」の開発担当AI。
- Repository: https://github.com/8mahi8/shokoku-sensen
- Development branch: `perf/online-guest-snapshot-diagnostics-20261020`
- Draft PR #22: https://github.com/8mahi8/shokoku-sensen/pull/22
- **この資料の執筆時HEAD: `cadad05680b8f7bc2c0254ea79db41e3476e8151`。次の作業前にHEAD/CIを再読込すること。**
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
4. 可能であれば新しいGoogle Sites用TXT+HTMLを**別名で**Google Driveの `学校ゲーム/小国戦線III` に保存し読み戻し確認。以前保存済みの [滑らかさ改善TXT](https://drive.google.com/file/d/18DJ4UQqZRF0SuTVKmHXcUhrQg0BzmtHT/view) と [HTML](https://drive.google.com/file/d/1diljznUmp5-hNv6H295QjajQGmIfOBB8/view) は**今回の新機能導入前の版**である。既存ファイルを上書きしない。Google Sitesの公開コードを勝手に更新しない。
5. 引き継ぎの進捗を`docs/DEVELOPMENT_STATUS.md`等に追記。実機で確認が必要な点が明確になるまで自主開発を続けてよいが、誇大な改善主張を避ける。

## 長期目標・基準
- 最重要：友達との実iPad Safari/Google Sites直接埋込による**ゲストだけ固まる/召喚に反応しない**問題の抑制。すでに大きなフリーズは学校で「かなり改善」と評価されたので、この安定性を絶対に壊さない。
- ホストとゲストの滑らかさの差をなるべくなくす。映像の1秒以上の戦場時計停滞やrAF 500ms超などは、新旧の数値だけでなくネットワーク/描画を照合する。
- 学校版試遊以前の開発継続は本人承認済み。ただし試用時には**本人がGoogle Sitesで貼付操作**する。公開Google Sites版とmainに勝手な変更を加えない。
- 正確で短い報告：「今回行ったこと」「証拠」「残る問題」「次工程」。友達用で研究ログ不要。
