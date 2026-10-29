# 小国戦線III — FORTRESS FRONT｜開発担当AIへの【唯一の最新入口】

**更新：2026-10-30 JST / Stage 2 追加能力の実装・検証フェーズ**  
**合図：ユーザーが「小国戦争開発引き継いで」「小国戦線の開発引き継いで」と言ったら、このファイルを開いて、GitHub最新HEADとコードを読み、自律的に再開する。**  
**この文書が引き継ぎの入口であり、GitHubの他の年月日付きHANDOFFより優先。** 過去の手順が現在の本人の意思と矛盾する場合は、新しい本人決定と実際のコードを優先する。変更するたびに**この同一パスを更新**し、毎回ユーザーに長い引き継ぎ文を作らせない。

## 0. 必須のGitHub入口（まずこれだけで引き継げる）

- **Repository:** https://github.com/8mahi8/shokoku-sensen
- **唯一の作業ブランチ:** `perf/online-guest-snapshot-diagnostics-20261020`
- **Draft PR #22:** https://github.com/8mahi8/shokoku-sensen/pull/22
- **このファイルのブラウザURL:** https://github.com/8mahi8/shokoku-sensen/blob/perf/online-guest-snapshot-diagnostics-20261020/docs/HANDOFF_LATEST.md
- **併読必須:** `AGENTS.md`, `docs/STAGE2_IMPLEMENTATION_HANDOFF_2026-10-29.md`, `docs/STAGE2_DESIGN_AND_BALANCE_DECISIONS_2026-10-29.md`, `docs/UNIT_BALANCE_WORKFLOW_STANDARD.md`, `docs/DECK_IMPLEMENTATION_HANDOFF_2026-10-29.md`。
- **実装ソース:** `online-game.js`（戦闘本体）, `online-deck.js`（編集・選択）, `online-net.js`（Firebase/ホスト権威）, `v3-art.js`（2Dアート）, `online.html`（GitHub Pages試遊入口）, `online-ipad.html`/`online-embed.html`（Google Sites貼付用の**開発ブランチ内**単体HTML）。
- **ビルド:** `tools/build-online-bundles.cjs` が4つのソースを単体HTMLへ展開する。手作業で巨大HTMLだけを書き換えない。
- **現在のPR状態（この文書作成前の確認）：** PR #22はopen / Draft / 未マージ。ブランチHEADは実行中にも進むことがある。**再開時に毎回新しいHEAD・PR・Actionsの結果を取り直す。**ここに過去のSHAを永久的な最新値として扱わない。

## 1. プロジェクトの目的と最重要の運用ルール

学校のiPad（Safari）でGoogle SitesにHTML埋め込みして、友達だけで無料で遊ぶ横スクロール・オンライン1vs1の陣取りRTS。手軽なタップ操作とシンプルな読み合いを重視。GitHub Pagesは**試遊用**で、学校での運用先ではない。

1. ユーザーの**「任した」「任せた」**は、確認済み仕様の調査、実装、デバッグ、テスト、独立レビュー、**開発ブランチへのコミットとGitHub引き継ぎ資料更新**の許可。毎回作業前に些細な承認を求めず進める。
2. **禁止：`main`、`stable/school-ipad-20261028-99a0d1d`、学校の実Google Sites公開コード、公開用GitHub Pages/mainへの変更、Firebase本番Rules変更、無断マージ。** Google Driveへの毎回自動保存も禁止。Driveは本人の依頼がある時だけ。
3. **既存ユニットAIは変えない。** `selectPriorityTargets()`、`priorityFor()`、`normal/capture/guard`、3行動型、優先度0〜3、追跡・砦・城・迎撃の共通規則は維持。新能力は共通戦闘処理、強制位置移動、アタック方式等の別レイヤーとして追加する。BOTカード選択戦略も必要なく改変しない。
4. **バランス調整は本人が2026-10-29に一旦終了と判断。** 君が触れていないキャラもすべて維持。強すぎ・弱すぎを示す理論値だけを理由に性能を独断変更しない。必要な場合はまず全コストの総当たりで**純HP・攻撃・攻撃間隔・召喚数**のみ比較→疑いを双方（強／弱）提示→本人と付加価値を共同評価（`docs/UNIT_BALANCE_WORKFLOW_STANDARD.md` SOP v1.2）。既存キャラの占領・射程・特殊能力を勝手に点数化しない。
5. **デッキ構築はすでに本人承認・開発実装済み。** 基本歩兵は常設、ほかに**異なる10種類を選び**、手札4種類で回す。旧`docs/HANDOFF_UNIT_AI_2026-10-29.md`や`docs/DECK_READINESS_AND_AI_QA_2026-10-29.md`の「デッキは未設計・着手禁止」は**当時の古い状態**。それらを現在の指示と誤解しない。

## 2. いま何ができていて、何が未確認か

### コード反映済み（開発ブランチのみ）

- 第1段階の5体を含め**実装済み14体**から、第2段階で新しい**4枚の選択可能ユニットカード＋1枚のスペル**を追加。**内部子兵 `small_machine` はデッキカードではない**。
- `piercer` 貫通射手：3コスト・HP170・主対象55・間隔1.85秒・射程165。最大10体直線貫通、後続は各33ダメージ、地上敵のみ。
- `catapult` 遠投投石器：8コスト・HP700・115ダメージ・4.5秒。標的の**発射時位置**を中心として1.1秒後に半径85、敵地上・飛行双方へ一律115。敵城は優先度0を保ち、**本体の壁接触時のみ**城へ単体115攻撃（付近に通常攻撃可能な敵兵がいれば兵を優先）。砦は攻撃しない。
- `kamikaze` 突貫爆撃機：4コスト・HP115・飛行。敵に接触すると主対象150、周辺地上兵112.5の自爆。敵に撃墜された場合は爆発しない。
- `mech_summoner` 機械召喚師：5コスト・HP340・通常攻撃15/1.9秒・迎撃型。本体が生きている間、開始後**2/4/6/11/16/21/26/31秒**に子兵1体ずつ最大8体。子兵はHP85・攻撃14/1.5秒で、**独立移動**し親の死後も残る。65体上限は既存のまま、上限満杯時は新規生成を保留し空き時に再試行。
- `gravity` 引力：3コスト、半径125、**合計2.5秒**。敵地上兵のみ、小/中/大の吸引速度100/70/35。中心到達後は位置を拘束するが**攻撃は可能**。**通常AIを変更せず**、外力として位置のみ動かす。味方や飛行兵への吸引・直接ダメージなし。通常の防護結界(`ward`)と区別。
- 既存 `ranger_engineer` 遠距離工兵：本人決定により砦占領力を**1→2**に更新。その他の値は維持。
- `v3-art.js` に5つのキャラ描画（内部子兵含む）・引力のカード絵を追加。`online-deck.js` の既存編集UIはカード定義から候補を取るため4新カード＋新スペルを含められる。
- `tools/build-online-bundles.cjs` を使用して`online-ipad.html`と`online-embed.html`（**開発版だけ**）を同期。子兵はデッキ・ギャラリー・学校用HP/攻撃エディタから除外している。

### 確認した事実と、まだ合格と言ってはいけないもの

- 2026-10-30の資料作成前、GitHubに保存された`online-game.js`、`v3-art.js`、`online-deck.js`、`online-net.js`は**V8構文解析PASS**。開発版の2つの単体HTMLに全4ソースが一致して含まれ、インラインスクリプトの構文解析もPASS。
- `tests/online-stage1-combat.cjs` の**8ケース**、`tests/online-stage2-combat.cjs` の**11ケース**、`tests/online-unit-target-priority.cjs` の**42ケース**を、実ソース抜き出し＋V8互換実行で通過（通常のNodeコマンド実行やGitHub Actions完了とは区別する）。`docs/STAGE2_IMPLEMENTATION_HANDOFF_2026-10-29.md`も参照。
- **未確認：最新Stage 2コミットのGitHub Actions全件合格／Node本番コマンド実行／実2ブラウザFirebaseホスト・ゲスト対戦／iPad Safariの実機品質／新アートの実戦画面目視**。絶対に「学校に出せる完成品」「実機テスト完了」「通信合格」と断定しない。
- 実Firebase/旧安定版/ゲストfps等の**過去のCI成功は第2段階の新能力が成功した証拠ではない**。録画を実際に見ていない場合は見たことにしない。
- iPadでのゲスト側ラグとホスト/ゲスト表示差、学校Google Sites埋め込みの実機挙動は重要な残課題。既存の研究・証拠は`docs/HANDOFF_LATEST_2026-10-27.md`・`docs/PERFORMANCE_EVIDENCE.md`にあるが、再調査の前に読むこと。

## 2.1 2026-10-30｜次担当引き継ぎ直後のCI調査と最小修正

- 本担当は最新開発HEAD、PR #22、AGENTS.md、Stage 2/デッキ実装引き継ぎ、実コード、GitHub Actionsを読んだ。初回確認時HEADは `a90d643e95c8be75450cf5a6ef843d6197c1a72c`。実作業対象は引き続き同一開発ブランチ。main・stable・学校Google Sites・GitHub Pages公開用main・Firebase Rules・Driveには触れていない。
- Stage 2コードについて `64c4e764` の **Online 1v1 smoke はsuccess**（[run #40906675915](https://github.com/8mahi8/shokoku-sensen/actions/runs/40906675915)）。ただしこれはNode系smokeの成功であり、Stage 2の新能力を使った実Firebase2席・iPad Safariの合格ではない。
- `d7a3785f` で落ちた3本のブラウザー系CIを**実ログから確認**。デッキE2E [#40906657928](https://github.com/8mahi8/shokoku-sensen/actions/runs/40906657928)・デッキ表示 [#40906657755](https://github.com/8mahi8/shokoku-sensen/actions/runs/40906657755) はStage 2カード追加後も未採用プールを旧仕様の「5枚」と固定期待したことによる `10 !== 5`。ユニットAI表示 [#40906657617](https://github.com/8mahi8/shokoku-sensen/actions/runs/40906657617) は本人承認の遠距離工兵 `capture:2` を旧 `1` と期待した `10 !== 11`。いずれも観測された失敗点は**テスト側の古い固定値**であり、ゲームAIやバランスを変える根拠ではない。
- 開発ブランチで3テストのみ更新：`f6c87b7631ca2db6e6669a0533e4408d74117d28`（候補枚数を `eligible().length-10` へ）、`0c94856aa6120335cce11bd9cf5f7ef8779c8db2`（UIの候補枚数を動的化し全カード絵Canvas維持を確認）、`2f490257c6c3897874fa77360279aae345345cfc`（遠距離工兵の砦HP減少2を期待）。**戦闘コード・カード性能・既存AI・本番環境を一切変更していない**。
- **修正後のCI 3本は2026-10-30の確認でいずれもcompleted / success**。ログで記録されていた旧固定値失敗は解消：
  - [デッキ2席E2E #40910397653 — success](https://github.com/8mahi8/shokoku-sensen/actions/runs/40910397653)
  - [デッキUI Chromium/WebKit #40910404735 — success](https://github.com/8mahi8/shokoku-sensen/actions/runs/40910404735)
  - [ユニットAI Chromium/WebKit #40910414865 — success](https://github.com/8mahi8/shokoku-sensen/actions/runs/40910414865)
- **次の工程はStage 2専用の実ブラウザ／Firebase2席E2Eの実装と確認。** ここで通過した3本は主にStage 1のカード・既存AIの回帰であり、貫通射手／遠投投石器／突貫爆撃機／機械召喚師／引力の**実ブラウザ戦闘・通信同期の合格証拠ではない**。物理iPadはなお未測定。Stage 2専用の合法配置・着弾・召喚・スペル同期の検証を加え、表示映像を見ずに「完成」と宣言しない。

## 2.2 2026-10-30｜Stage 2 実ブラウザー QA・新規 Firebase E2E

- **新規ブラウザー QA**：`tests/online-stage2-browser-visual.cjs` と `.github/workflows/online-stage2-browser-visual.yml` を開発ブランチに追加。ローカルHTMLの**メモリー上**だけへ検査メソッドを追加し、既存の `online-game.js` や学校のHTMLは編集しない。
- 追加した6シーン × Chromium/WebKit 2エンジン（計12シーン）は [GitHub Actions #40912068320](https://github.com/8mahi8/shokoku-sensen/actions/runs/40912068320) で **completed / success**。確認項目：新4ユニットと子兵の両陣営 Canvas `KokokuArt.drawUnit` 呼出、貫通10体・主55／後続33、投石固定着弾1.1秒と対空、突貫爆撃機の接触条件、ロボ31秒までに8体、引力2.5秒の拘束・復帰。テスト中の新ユニットは実 `playCard` 経由で合法召喚、戦闘には実 `fire`/`unitStep`/`spellStep`、描画には実 `draw` を使用。一方、敵配置・時刻は QA 固定入力であり、**実Firebaseの通信や学校iPadの試験ではない**。PNGを人の目で評価したと主張しない。
- **新規オンラインQA**：`tests/online-stage2-firebase-e2e.cjs` と `.github/workflows/online-stage2-firebase-e2e.yml` を追加。既存の実2ブラウザー E2E を土台に、両席が第2段階4ユニット＋引力をデッキ選択して各カードを合法使用し、ホスト確定世界の Firebase `spells.zones` に `gravity` が公開され、再戦でもデッキが保持されることを試す。**実Firebaseホスト／WebKitゲストで20件の合法カード使用・両席の第2段階カード5種類・再戦まで、Actions [#40912734104](https://github.com/8mahi8/shokoku-sensen/actions/runs/40912734104) は completed / success。ログ上は仮ルーム削除HTTP 200。** この初回E2Eで確認した `gravity` はホストがFirebaseへ公開した事実で、ゲスト側で効果を受信したとまで断定しない。その追加検査（本番ソース変更なしのlocalhost WebKit読み取り）をコミット `c24d6840734b999a9849afb229a6c5c5836155ae` に追加した。**[Actions #40913125099](https://github.com/8mahi8/shokoku-sensen/actions/runs/40913125099) は completed / success**。双方が新4ユニット＋引力を実際のUIで使用し、ホスト確定worldの `gravity` がFirebaseを通じて**WebKitゲスト側の `S.spells.zones` へ適用**されたことを検証。実行ログ：合法カード操作20件、`PASS: 20 Stage-2 deck actions, real guest gravity sync and rematch`、再戦用デッキ保持、テストルーム削除HTTP 200。
- 学校Google Sites、main、stable、GitHub Pages公開用main、Firebase Rules、既存Driveファイルは**変更なし**。Stage 2新能力のゲーム本体性能と既存ユニットAIも変更なし。
- **次のゲート：** Firebase E2Eの最終ログ確認・必要なテスト修正→実戦での新能力同期（特に遠投投石の `incoming` や引力の `zones`）→物理iPadでホスト／ゲスト双方のUI/実FPS/召喚・被弾・再戦を確認。実機は最後まで未検証として扱う。

## 2.3 2026-10-30｜ユーザー要望：実試合を見てラグ・通信を確認

- ユーザーが「実際の試合を君が見てみたりもして」と要望。既存実Firebase QA録画（#40906657688）のWebMと各スクリーンショットを取得してレビュー。旧録画はロビーや別シーンが混じるため継続戦闘FPSの診断に使わず、新しい継続戦闘QAを追加。
- **新規実装・開発ブランチのみ**：`tests/online-stage2-match-observation.cjs` と `.github/workflows/online-stage2-match-observation.yml`。第2段階実Firebase E2Eを拡張し、両端末が新カード5種を使ったあとの実オンライン戦闘を約36秒継続、ゲストWebM録画・ホスト/ゲスト連続スクリーンショット・1.5秒おきのフレームギャップと通信同期サンプルを保存。前半カード使用には**テスト用資源補充**を行うので自然収支での決着戦ではない。
- **[CI #40918829528](https://github.com/8mahi8/shokoku-sensen/actions/runs/40918829528) はsuccess**。試合中21サンプル、両席の試合時間増分35.73/35.74秒、ゲストは265のFirebase stateシーケンス更新。両席の同じUIDの位置差p95は各比較最大7.5ワールド単位。ログにCanvas例外なし、通信停止なし、QAルーム削除HTTP200。
- **フレーム間隔：ホストChromium p95 16.7ms・最大50ms、ゲストWebKit p95 81ms・最大302ms。** ゲストは長いフレーム間隔が散発。描画命令時間p95はホスト1.1ms、ゲスト7ms。ゲストの平均通信受信間隔は約125〜150msで、ゲーム状態とフレーム描画の遅さを同一視しない。
- **実際の視覚レビュー済み**：新録画（全長約64秒）のゲーム部分17〜61秒の12時点を取り出し、さらに同時点のホスト／ゲスト画像6組を左右比較。両画面の投石器・爆撃機・子機・スペル演出・戦場推移はほぼ整合。目立つ表示崩壊／長時間フリーズは観測されず。ただしゲスト描画の不均一さは実測上残り、「ラグなし」としない。
- **条件限定**：Linux ActionsのヘッドレスWebKit・動画録画あり。ChromiumホストとWebKitゲストなので役割差は識別不可。過去の同エンジンWebKit/WebKit比較の知見を `docs/PERFORMANCE_EVIDENCE.md` に残している。**学校iPad実機はまだ未検証。** 今後も同じWebKit環境の画質削減実験を無闇に繰り返さない。優先は実iPadでのホスト／ゲスト入替と、症状が再現すれば該当時のQA診断値を読むこと。
- **公開・バランス**：`online-game.js`、既存AI、キャラ性能、学校配布HTML、main、stable、Firebase Rules、Google Driveはこの一連の作業で一切変更なし。新たなテストと2資料のみ開発ブランチに保存。PR #22はDraftのまま。

## 2.4 2026-10-30｜学校で合格したのにCIでカクついた理由の切り分け

- 本人の重要フィードバック：「現在Google Sitesに貼っている版は合格レベル。なぜまたカクつかせた？」。**実機で快適と本人が確認した安定版は唯一の性能受入基準として保護**。固定ブランチ `stable/school-ipad-20261028-99a0d1d`（コミット `99a0d1d0cc18a987aefe0ab99dc1f7993160fe25`）の `online-ipad.html` blob は `1eded9ac016f1a21d511917d88de2084ffb9f9c3`。これまでの作業では上書きなし。学校の実Google Sites表示内容の現在のハッシュは取得していないため、固定版と完全一致と推測しない（2026-10-28にDrive保存物が一致したことは別資料で確認）。
- **構造比較（stable→開発ブランチ）**：`online-game.js` の `frame()`、`tick()`、`adaptCrowdedSprites()`、`renderCrowdedUnit()`、`presentRemoteUnit()`、`guestVisualTimeRemaining()`、`updateHUD()` は関数本文が同一。`online-net.js` の `packGuestWorld()`、`receiveGuestWorld()`、`maybePublish()`、`sendCommand()`、`checkGuestSync()`、`syncDiagnostics()` も関数本文が同一。**新しい通信頻度やメインフレーム処理への変更がカクつきを直接再発させた、と断定する根拠はない**。
- 相違点としてユニット種類・特殊攻撃/引力/子兵生成・新キャラ描画・戦闘内の処理が増加。これは実戦状況によって負荷が増えうるが、`#40918829528` のChromiumホスト / Linux headless WebKitゲスト **動画録画あり**の結果だけで、「本物の学校iPadで安定版より劣化した」とは言えない。旧 `docs/PERFORMANCE_EVIDENCE.md` の `#39772223658` は、当時WebKit×WebKitの同一条件で**両陣営4〜6FPS程度**というCI特有の低FPSを示している（当時も実機と異なると記録）。したがってヘッドレスWebKitの測定値を実機の回帰判定に流用しない。
- **原因の分類**：学校での再発証拠はまだなく、今確認できたのは実験条件の違い（実機Safari+Sites vs Linux headless WebKit録画）と、開発版の機能差。可能性として新キャラ/特殊能力/ユニット増加の描画・演算負荷は残る。ネットワーク断は最新36秒の継続観測では確認されず、原因と断定しない。
- **次工程の必須ゲート**：安定版と開発版を**同じ端末・同じSafari・同じGoogle Sites相当・同一兵士数・同一試合状況**でA/B比較する。受入基準は「合格済みの学校版より体感ラグを悪化させない」。もし問題があればその条件だけを再現し、実際に遅いレイヤーを特定して最小修正。本人の実機未比較のまま新機能版を学校公開へ昇格させない。現状の段階で性能回復を目的とした推測変更はしない。

## 2.5 2026-10-30｜学校で合格した「以前のラグ改善」を一次資料から再調査

ユーザー提案：「前回のラグ改善の仕方が良かったかもしれない。資料を探して」。`docs/PERFORMANCE_EVIDENCE.md`（10/22〜28の失敗・成功・実機結果）、`docs/GUEST_SDK_STALL_DIAGNOSIS_2026-10-26.md`、`docs/GUEST_VISUAL_SMOOTHING_2026-10-27.md`、`docs/GUEST_CACHE_WARMUP_2026-10-27.md`、`docs/GUEST_PREPAINT_APPLY_2026-10-27.md`、`docs/GUEST_FIRST_WORLD_READY_2026-10-28.md`、`docs/STABLE_BASELINE_SIMPLE_UNIT_AI_2026-10-28.md` を読了。以下は「当時実装した内容」と「観測された事実」で、**個々の対策が学校実機の改善に何％貢献したかは未実証**。

| 既存の改善 | 導入と裏づけ | 開発最新版への引継ぎ |
| --- | --- | --- |
| ゲストFirebase SDK停滞への限定REST回復：SDKが止まり適用も古いときのみ、初回約1.1秒・再試行最短2.2秒で最新戦況を取り直す | [8cd0638e](https://github.com/8mahi8/shokoku-sensen/commit/8cd0638e5f64d61a61ecc2f2b8d04be42e18d345)、録画で約3.4秒の表示時計停止→別試合で約2.0秒、SDK seqよりREST seq先行。ただし試合条件を合わせた厳密A/Bでない | `online-net.js` の`checkGuestSync`や`receiveGuestWorld`は安定版と開発版で同一関数本文。維持 |
| 兵士の表示のみ最大170→240msの短期補間、低FPSの30FPS保護モードから健全時8.5秒で解除（20秒再制限クールダウン） | [838fb0cd](https://github.com/8mahi8/shokoku-sensen/commit/838fb0cd6de198f1ca3a233a6bce8ad6fa4266a8)、`GUEST_VISUAL_SMOOTHING_2026-10-27.md`。移動のコマ飛び・固定30FPSの原因候補への局所対策 | `presentRemoteUnit`、`adaptCanvasQuality` の安定版/開発版の該当ロジック一致。維持 |
| 混戦時キャラ描画キャッシュを1描画フレーム最大2新規タイルに分散、未生成タイルは元の絵で描画 | [b48081fb](https://github.com/8mahi8/shokoku-sensen/commit/b48081fb80b731fb1b0ff9e084b377be0d19014f)、実Firebase5分 [#40489499643](https://github.com/8mahi8/shokoku-sensen/actions/runs/40489499643) は58タイル・毎フレーム最大2枚・試合完走。学校iPad FPSへの独立効果は未実測 | `renderCrowdedUnit`、`adaptCrowdedSprites` は安定版と開発版で同一。維持 |
| 受信済み最新snapshotを描画rAF直前に1回反映し、古いroundからの適用や二重反映を抑止 | [b949e8b2](https://github.com/8mahi8/shokoku-sensen/commit/b949e8b2e739d97007eed75d3840130b91e8b151)、`GUEST_PREPAINT_APPLY_2026-10-27.md`。SDK受信seqが最新でも描画前に適用seqが遅れる再現に対応 | `frame()` と `online-net.js` の`flushGuestBeforePaint`等は安定版・開発版で同一。維持 |
| 初回戦況が未適用なのに対戦画面だけ先に開くゲスト操作不整合を回避 | `GUEST_FIRST_WORLD_READY_2026-10-28.md`。meta/state受信の順序差を考慮して「同期しています…」表示、受信後だけ操作可能とする。学校10/28に**本人が「ラグが全く気にならなかった、完璧かも」と評価**。ただしどの個別修正が効いたかは不明 | `online-net.js` の`guestPlayableWorld`系コードは旧安定版・開発版双方にある。維持 |

**今回ソースで再確認した事実：** 安定ブランチ `99a0d1d` と現在の開発ブランチの `online-game.js` の `frame`・`tick`・`updateHUD`・`presentRemoteUnit`・`renderCrowdedUnit`・`adaptCrowdedSprites` が一致。通信 `online-net.js` の `maybePublish`・`receiveGuestWorld`・`sendCommand`・`checkGuestSync` も一致。かつ `unitStep`・`fire`・`drawSpellFields`・アート `v3-art.js` はStage1/2新能力による差が存在する。**既存の成功済み改善をもう一度実装するべきではない**。新能力とユニット数増に伴う追加負荷を、できれば同じWebKit iPad端末・同一画面／同数兵・同通信条件で差分検証するのが次の合理的調査。

**再発防止**：旧画質削減・HUD停止・CSS filter削除・Canvas切出しは過去の比較で効果なし／不採用（`PERFORMANCE_EVIDENCE.md` / `TERRAIN_VIEWPORT_AB_2026-10-28.md`）。録画ありheadless WebKitの低FPSを学校の実機ラグ悪化と断定しない。コードに安易な改変をせず、10/28学校受入版をリファレンスにして新機能の差分を調べる。学校Sites・main/stable・Firebase Rulesは変更せず、GitHub開発ブランチの記録だけ更新。

## 2.6 2026-10-30｜本人指示「変な変更の前に原因調査」：安定版 vs 開発版の同条件 A/B（実行済）

- **本件は原因調査限定**。本体 `online-game.js`、`online-net.js`、`v3-art.js`、単体HTML、AI/バランス、安定版 `99a0d1d`、学校Google Sites、Firebase Rules、main/stableは一切改変していない。追加は `tests/online-stable-vs-stage2-ab.cjs`、`.github/workflows/online-stable-vs-stage2-ab.yml` と本記録のみ。
- **統制**：GitHub Actions [run #40921543293](https://github.com/8mahi8/shokoku-sensen/actions/runs/40921543293) **success**。学校iPadで本人合格の `99a0d1d:online-ipad.html` をGitからそのまま取得し、開発ブランチの `online-ipad.html` と比較。WebKit headless/1194×834/DPR2/録画なし、ゲームの同じ合法な10体light、20体dense、10体heavy戦場を `seedRealisticBattle` で設定。各場面は**stable → dev → dev → stable**、独立WebKitプロセス、0.7秒ウォームアップ後3.2秒計測。総12回。ネットワークは不要なソロ版で検証し、本番Firebaseには書かない。結果は artifact `stable-vs-stage2-matched-webkit-ab-evidence` の `matched-results.json` に全トライアル。
- **p95フレーム間隔（同条件2回のp95平均）**：light 10体 stable 64ms / dev 73ms、dense 20体 stable 150.5ms / dev 109.5ms、heavy 10体 stable 94.5ms / dev 95.5ms。**安定版でも低い描画頻度が確認され、開発版が全条件で一貫して遅いとは言えない**。特にdenseでは安定版の再試行でp95=201msと大きな変動がある。3.2秒×2回/場面という短いCI条件なので、差から「開発版の方が速い/遅い」の数値結論は出さない。
- **p95戦闘/メインロジック実行時間**：stable/devとも3場面のすべてで概ね1ms。JSのCanvas `drawMs` p95は light stable 4ms / dev 5ms、dense stable 8.5ms / dev 7ms、heavy stable 5ms / dev 6ms。巨大なrAF gapに比べJS描画/戦闘命令は短い。この**旧ユニット同数試験**では、Stage1時の `nearbyEnemy` → `selectPriorityTargets` へのAI構造変更が深刻な計算時間増大を起こした証拠は見つからなかった。**AI変更が存在しないという意味ではない**。
- **未解決**：このA/Bは**旧兵だけ・ソロ・headless Linux WebKit**。Stage2新4ユニット（とくに子兵が増える機械召喚師）＋引力を出した際の差、Firebase・Google Sites埋込iframe・学校iPadの端末本体・録画時の負荷は未比較。旧コードが同じ実機で快適な理由をLinux WebKitテストで完全に説明できるわけではない。前回の開発版Firebase 36秒戦（#40918829528）は新20カードを使い録画もONで、条件が違うため本A/Bと直接FPS比較してはいけない。
- **現時点の有力な説明**：報告された「またカクついた」は Linux headless WebKitで以前から起きるフレーム遅延を、新開発版の回帰と混同した可能性が高い。ただし新特殊能力の負荷回帰は**除外できない**。次にやるべきなのは、**同じ開発版内で旧ユニット20体とStage2能力を含む同数戦のAB比較**など対象を狭めた根拠取り、最後に学校実機の安定/開発版A/B。**原因が判定できる前に**新AI書き換え・通信頻度変更・画質低下・キャラ削除・本番差し替えを実施しない。
- **CIの最初の失敗はゲーム不具合ではない**：初回 run #40921348014 はGitHub Actions Playwright Dockerコンテナ内の `git cat-file` で `dubious ownership` を検出しただけ。ワークフローで同じcheckoutの `safe.directory` を設定し再実行した run #40921543293 が全12シーン完走。

## 2.7 2026-10-30｜Stage 2 品質ゲートと学校前の追加カード予約

**ユーザー最新依頼**：「任せた。学校で試す前に**スペルを1個ぐらいと大型も1体ぐらい追加したい**から、**後でやろう**」。
- **今はStage 2の実戦検証を優先**。その後で本人と追加1スペル＋追加1大型の役割・仕様・バランスを設計して実装し、学校テストより前の試遊候補へ入れる意向。**まだ詳細仕様も数値も確定していない**ため、この回では新カードを実装しない、勝手に効果/数値を決めない。
- **次の順序**：（1）現行 Stage 2 の通信・アニメ・召喚31秒・性能差の検証 →（2）必要な不具合修正（合意済み旧AI/バランス維持）→（3）新スペル1枚・大型1体の設計を本人と相談 →（4）実装／戦闘・画面・Firebase・長時間テスト →（5）本人が次回学校で実機試遊する際に新開発版を比較評価。
- **2026-10-30 テスト追加**：`tests/online-stage2-firebase-e2e.cjs` にlocalhost QA専用のプローブを追加（本体/HTML/バランスは無変更）。使い捨てRTDBルームで既存の**両陣営全新カード20手**検証後、元のproduction `fire` が発射した投石器1.1秒 `incoming` がFirebaseへ送信されゲストWebKitにも表示されること、着弾HPが両端で変わること、31秒経過で機械召喚師8回子兵生成・ゲストが累積8回を受信したことを追加検証する。QA fixtureは**テストサーバーが一時的に返すlocalhostスクリプト**だけであり、実ゲームの通常コードを変更しない。[CI #40923202349](https://github.com/8mahi8/shokoku-sensen/actions/runs/40923202349) は **completed / SUCCESS**。実ジョブログで以下を確認：
  - `PASS: two-browser Firebase independently edited 10-unique decks with real new cards`。合法新カード操作20件、両陣営の戦況世界がRTDBに反映。
  - `PASS: real Firebase catapult incoming guest delivery`、固定着弾座標 `(760,150)` の `kind=catapult` 警告を1.1秒のproduction `fire` で生成し、実Firebaseの `spells.incoming` とゲストWebKit上で直接読取。受信時残時間 `0.967秒`、115ダメージと `total=1.1` のassert通過。**実着弾によるホスト対象HP減少とゲスト対象HP減少もassert通過**。
  - `PASS: real-time 31s mechanical summoner and WebKit guest snapshot`。production `unitStep` の実時間進行で生成累計1→8を8サンプル確認。最終ゲーム経過 `elapsed=40.667s`（fixture開始後約31sゲーム時間）、ゲスト側の同一親ユニット `summonCount=8` assert通過、ゲスト画面に生存する `small_machine` 計11体（以前の合法召喚分も含む）。機械召喚師のタイミングは本人指定 `2/4/6/11/16/21/26/31秒` を既存単体テストが検証済み。今回のE2Eはその**実時間の完遂とゲスト同期**を補強。
  - `PASS: Firebase rematch retains 10 selections but requires fresh READY and fresh locked round`、`QA TEMP ROOM CLEANUP 200`。JS pageerrorの断定テストも通過。
  - **範囲の限界**：投石と新規召喚師はローカルホストのQA一時コードで固定位置へ配置した人工的な追加場面だが、**発射・着弾・ロボ生成・ホスト権威RTDB通信・ゲストapplyは実ゲーム本体を直接使用**。全ての自然対戦で同様の動きを保証するものではない。画面録画による美観・学校のiPad実機・新能力を最大数重ねたラグは今回のテスト対象外。
- 以前の10/28の学校でラグ合格した `stable/school-ipad-20261028-99a0d1d` は保持。最初から本番公開するのでなく、**学校iPad/Google Sites側で開発版が快適か再評価**してから本人が採用判断。PR #22はDraftのまま。学校公開版/main/stable/Firebase Rules/Google Drive未変更。

## 2.8 2026-10-30｜新4体＋引力と子兵の20体密集負荷テスト合格（ゲーム本体改変なし）

- **本人の「任した」承認に基づく今回の進捗**：Stage 2 最終品質調査を続行。新QA `tests/online-stage2-load-profile.cjs` と専用 `.github/workflows/online-stage2-load-profile.yml` を開発ブランチに追加。**12/12試験成功** [Actions #40924093598](https://github.com/8mahi8/shokoku-sensen/actions/runs/40924093598)。運用版・安定ブランチ・ゲームロジック・バランス・キャラアート・Firebase・Drive・mainは全く変更なし。PR #22は引き続きDraft。
- **QA条件**：localhostの `online-ipad.html` に**テスト専用** `setupLoadScene` を一時注入。Chromium 1回／WebKit 2回ずつ、起動時20体の4条件（旧兵20、新4兵種混成20、新混成＋引力2箇所、召喚師2＋小型ロボ16＋守護ゴーレム2）を通常の本体 `unitStep`/`spellStep`/`draw` で進行。1194×834 DPR1、0.9s暖機＋3.5sのブラウザ計測。通常の法定デッキ同コスト戦ではなく、**敵の密集強制配置ストレス**。新混成は最終最大22体、引力も最大21体となり厳密な同数比較ではない。
- **観測**：WebKit p95のrAF間隔は旧20体 **119ms**／新混成 **149.5ms**／引力 **132.5ms**／子兵16含む20体 **74ms**。Canvas draw p95は同順で **10.5/9.5/10/6.5ms**、ロジックは **1/1.5/2/1ms**。Chromiumは全条件p95 **16.7〜16.8ms**。WebKit新混成のフレーム間隔は長めだが、描画JS/ロジックが極端に増えた証拠なし。小標本headless CIで新ユニットのせいと**確定しない**。
- **目視**：Actions artifact `shokoku-stage2-twenty-unit-load-profile`（12PNG＋JSON）を回収し、代表8場面を組んだコンタクトシートを実際に確認。通常兵、新兵種、引力リング、子兵/ゴーレムの描画があることを確認。**同一位置に無理に密集させたQA fixture** なので重なっているキャラの個別視認性や学校実機の美観評価には流用しない。
- **判断**：この段階で推測に基づく戦闘AI/Canvas簡素化/画質低下/通信頻度の変更は**しない**。旧安定版で学校合格した処理を維持し、新特殊能力の「重ね過ぎ」が実機で顕著なら同一条件A/Bを取る。今回の測定は `docs/PERFORMANCE_EVIDENCE.md` に詳細記録済み。
- **次のロードマップ**：第2段階の主要なユニット/引力/ゲスト同期/31秒生成検証と今回の密集負荷診断は成功済み。ただし学校実機試験、自然な友人戦の新特殊能力同時多発による体感ラグの比較は未実施。**今後設計する新規スペル1枚＋大型1体**（本人要望、まだ未設計/未実装）に入る前に、必要なら既存新兵種の視認性・通常デッキプレイへの馴染みを確認。新キャラ設計は本人と能力・性能を相談してから追加。**学校Google Sites公開は本人指示まで維持**。

## 2.9 2026-10-30｜Stage 2 デッキ20候補・新カード5種のiPad UI操作性レビューと最小修正

- **ユーザー最新「任せた」承認による作業**。開発ブランチの既存QA成果物 [デッキ画面 #40910404735](https://github.com/8mahi8/shokoku-sensen/actions/runs/40910404735) のWebKitデフォルト/コンパクト/詳細・新ユニット画像 [Stage 2 #40912068320](https://github.com/8mahi8/shokoku-sensen/actions/runs/40912068320) を取得し、画像を組んで直接目視。新4体のアート・カード絵・引力リング・子兵・ステータス詳細は見えている。**問題発見：Stage 2まででデッキ候補が20種になり、縦のカード一覧の下へ進むまで「決定して戻る／標準に戻す」が初期画面に出ない**。1024×650の旧WebKit画面では編集画面のフッターがファーストビューに収まらなかった。ユーザーの「少ないタップで遊びたい」を踏まえ、表示だけ最小修正。
- **CSSのみ変更**：`online.html`、`online-ipad.html`、`online-embed.html` の `#deckEditorFoot` を `position:sticky;bottom:0;z-index:2` とし、背景色・軽い影・safe-area-inset-bottomを指定。長いカード一覧をそのままスクロールでき、決定/リセットは常時画面下に残る。**デッキ選択・戦闘・AI・コスト・Firebaseルール・Canvas描画コード等は一切変更しない**。学校公開済Google Sites/main/stableは触らない。
- **テスト増強**：`tests/online-deck-visual.cjs` を拡張。Chromium + WebKit、1024×650横向き・820×500コンパクトでstickyフッターの実位置/ヒットテスト/40px以上のボタン高さ、5種類の新カード `piercer`、`catapult`、`kamikaze`、`mech_summoner`、`gravity` それぞれの「性能を見る」表示（名前・役割・note、引力2.5秒）、新スペルのタップ交換→復帰、旧デッキ・Canvas portraitを保つ既存テスト、WebKit縦画面確認。**[CI #40925939802](https://github.com/8mahi8/shokoku-sensen/actions/runs/40925939802) completed / success**。Chromium/WebKitそれぞれ `PASS: ... deck 10/10, touch swap, save and reopened draft`。スクリーンショットartifact `deck-editor-chromium-webkit`（WebKit sticky before/swap/compactなど）を回収して直接目視し、初期横画面・820×500とも操作バーが見えていることを確認。
- **関連CI**：同じ最新CSSを含むcommit `284d56ce` に対して [Online 1v1 smoke #40925811782](https://github.com/8mahi8/shokoku-sensen/actions/runs/40925811782) success。前コミットのデッキE2E/Stage2 Firebase/iPad UI等でも同じCSS版に関するrunがsuccess。**ただしGoogle Sites上の実iPadでの実操作は未検証**。
- **次**：残るUI問題を実機で観察。新キャラ/スペル追加のデッキ操作が成立することの自動確認は済み。ユーザーの希望である**追加大型1体＋追加スペル1個**は現在未設計・未実装の予約タスクのまま、能力/費用/バランスを本人と決める。その後学校試遊用候補を更新する。開発PR #22はDraft、main/stable/学校公開版/Firebase Rules/Google Drive未変更。

## 2.10 2026-10-30｜本人指定の新大型「砦へ進む怪獣」と優先度4

- **2026-10-30 最新追認（前のunit:0案・未決定欄より優先）**：怪獣の対象設定は **`targetPriority:{fort:4,castle:2,unit:1}`** と本人が明示的に決定。砦が索敵内なら敵兵からの攻撃に反応せず砦へ直行。砦4が有効でなければ、射程内の敵兵1を攻撃してよいし、城2を接近・攻撃対象にしてよい。**敵兵を無条件に無視する `unit:0` 案は撤回**。「全部占領後は何もしない」という設計にもせず、城2への進撃を基本にする。共通優先度4の基盤は既に実装・テスト合格だが、専用怪獣のキャラ定義は未実装。改訂版の設計メモを参照。


- **本人と進めている正式な設計方向**：砦攻撃型の怪獣（仮）を追加する。敵兵から攻撃されても、敵兵が射程内でも反撃・追撃せず、敵砦へ進み続け、砦を直接攻撃して**占領する**。単なる砦機能停止・破壊案は選ばない。ダメージは通常どおり受ける。「疾風号令」（味方移動速度上昇）は好意的な採用候補だが倍率等は未決定。新大型カード/スペル本体・バランス・アートはいずれも**まだ未実装・ユーザーとの設計相談中**。
- **本人が明示的に指定した新共通優先度4**：索敵範囲内に優先度4の移動候補がいるときは、たとえ優先度1〜3の敵が射程内にいても**4へ向かう**。既存0〜3の攻撃射程優先ルールは変更しない。現在の `online-game.js` `selectPriorityTargets` には `if(approach?.priority===4&&(!attack||attack.priority<4))attack=null;` を入れた。**4が視界外・後方で追跡不可能な場合は例外発動なし**。4が射程内ならその4を攻撃。怪獣固有の強制砦全域索敵を勝手に追加しない。
- **検証結果**：`tests/online-unit-target-priority.cjs` を42→48ケースへ増強。テスト専用 `qaObjective` に `fort:4,unit:2,castle:2` を与え、「砦へ接近中は射程内の敵2に攻撃しない」「射程内の砦4は攻撃」「砦4が視界外なら従来攻撃」「占領者変更で4を解除」「赤側の左右対称」「砦3では旧攻撃優先」といった6ケース。既存全員は対象優先度0〜3を維持した。単体HTML `online-ipad.html`/`online-embed.html` に同じAIを再インライン化し、Workflow名も48ケースへ更新。
- **Actions**：[Online 1v1 smoke #40931886644](https://github.com/8mahi8/shokoku-sensen/actions/runs/40931886644) は **completed / success**。standalone bundle `--check`・従来オンラインデッキ/戦闘/シミュレーション/優先度48ケースを含む。学校iPad実機での試遊は未実施。**学校Google Sites、main、stable、Firebase Rules、Google Drive、旧AI/既存カード性能は未変更**。
- **次の設計論点**：怪獣が砦を「常に目標として認識する」ための索敵範囲（全域索敵か現行visionか）、すべての砦が味方側になった後は城2へ進撃する方針を本人が後発確定。残る論点は後方で奪い返された砦へ戻るか（現行進撃型は戻らない）、砦攻撃力/体力/速度/コスト/使用回数、怪獣のシルエット。これらをユーザーと一緒に決める。コードの新ユニットは正式な仕様が固まってから追加。設計メモ：`docs/STAGE3_FORT_KAIJU_AND_GALE_DESIGN_2026-10-30.md`。

## 2.11 2026-10-30｜Stage 3「砦進撃怪獣／疾風号令」SOP v1.2 仮設計と全コスト数値チェック

- **ユーザーの今回の指示**：「スペルと怪獣も合わせて、まずは君に仮設計といつもの手順通りの戦闘能力チェックしてもらって俺がそれを見て決める」。**実装・確定変更の依頼ではない**。ここでは新大型/スペルの本体実装、既存バランス変更は行わず、設計資料と計算用QAだけを開発ブランチに追加。
- **怪獣はAI仮案（未承認）**：7コスト/1体/上限2、HP1150、攻撃72/2.25秒、速度22、近接射程40、索敵1050、`capture:3`、地上大型、対空不可。**本人確定の対象優先度 `{fort:4,castle:2,unit:1}` は維持**。本人が砦を占領するA案を決定済。後方砦を追わない従来制約の変更はしていない。
- **疾風号令はAI仮案（未承認）**：コスト3、3回、半径125、4秒、速度×1.5、味方地上/空中に適用、固定円内で自発移動中のみ。攻撃頻度・既存AI・強制移動を変えない。現行の結界3/半径93/5.2秒/45%軽減、引力3/半径125/2.5秒、範囲砲撃4/半径82/125ダメージと数値比較した。
- **SOP v1.2準拠の実測計算**：`tests/online-stage3-provisional-balance.cjs`（設計QA専用・本体には読み込まれない）は最新 `online-game.js` から**既存18カード**を抽出し、怪獣案を別オブジェクトで追加。**19×19=361組の1体同士、19×19=361組のカード枚数同士**を全コスト帯・t0同時初撃・同時KO・移動/射程/特殊能力なしの明示条件で計算。完全結果はActions artifact `stage3-provisional-all-v-all`。新Workflow `.github/workflows/online-stage3-provisional-balance.yml` の **[Actions #40933926043](https://github.com/8mahi8/shokoku-sensen/actions/runs/40933926043) SUCCESS**、計算器のassert合格。旧ゲームの実戦勝率ではない。
- **主要結果**：怪獣のDPS/コスト4.57・HP/コスト164.29。7コスト守護ゴーレムに敗れゴーレム残HP752/18.45秒、7コスト魔導重戦車にも敗れ戦車残380/20.50秒。8コスト投石器には勝ち怪獣残575/20.25秒（射程・遅延着弾なし）。4コスト迎撃衛士には怪獣残592/13.50秒。5コスト重撃砕兵は怪獣残250/13.50秒まで削る。魔導射手2体との**1カード比較**では怪獣残1010/6.75秒。機械召喚・自爆・対空可否・貫通・範囲などは一次検証から除外しており、特殊能力で不利を帳消しと断定しない。
- **砦モデル（一次とは別）**：砦HP12・占領力3なら4発・最初の一撃から占領まで6.75秒。x244→x410の同じyにおける、射程40+砦半径24を考慮した敵無抵抗の到達近似は4.64秒＋6.75秒＝約11.39秒。実ゲームの衝突や敵兵の影響は未評価。疾風号令は4秒ずっと速度増なら怪獣移動+44、**固定半径125の円中心から前進するモデルでは最大約+41.67**。敵と交戦して停止する間は移動加速の利点がない。
- **詳細正本**：`docs/STAGE3_PROVISIONAL_BALANCE_SCREEN_2026-10-30.md`。最新怪獣の優先度4/2/1の決定経緯：`docs/STAGE3_FORT_KAIJU_AND_GALE_DESIGN_2026-10-30.md`。
- **次**：本人が上記のHP/攻撃/速度/占領/コスト/疾風号令設定について判断。指定変更があれば設計QAを同条件で再計算し、必要なら独立した砦強襲シミュレーション（敵兵の妨害を無視して進む間に死ぬか）を実施。**この時点で新キャラ/スペル本体・学校iPad試遊・Google Sites版は未実装/未確認**。main/stable/Rules/Drive/学校稼働版も不変更。

## 2.12 2026-10-30｜ユーザー指定：怪獣6コスト・索敵通常化、疾風号令は発動時4秒ユニットバフ

- **最新ユーザー判断（2.11の7コスト／1050索敵／固定円内加速より優先）**：怪獣を**6コストとして再評価**、異常に広い索敵は不要。**索敵220はAI仮案**（既存守護ゴーレム210／迅速迎撃騎兵215程度）。従来1050案は破棄。対象優先度**砦4・城2・敵1は本人承認を維持**。敵兵1でも砦4が索敵内にあれば無視、なければ射程内で反撃してよい。砦4が索敵外なら全砦を自動探索する動作はない。
- **疾風号令の効果変更（本人指定）**：発動**瞬間**に半径内の味方ユニットを選び、そのユニット自身へ**4秒間の移動速度バフを付与**。円から出ても有効、後から円に入った兵士や新規召喚兵には付かない。従来の「固定円にいる間だけ効果」は破棄。コスト3・半径125・移動×1.5・3回／地上飛行共通は引き続き**AI仮値**。
- **今後に使える軽いバフ/デバフ基盤を設計（本人が希望）**：ユニットへ `statusEffects:[{key:"gale",stat:"moveSpeed",mult:1.5,remaining:4}]` 等の有期限データを持たせ、元の `CLASSES` 数値は変更せず `effectiveMoveSpeed(u)` を計算、同じkey再付与では時間更新・別の速度補正は仮に乗算。引力・結界の既存処理を勝手に書き換えない。**ホストの `world().units` が状態をFirebaseへ同期できる設計**。本体への統合前に具体的な数値と仕様を本人が確認する段階。
- **SOP v1.2全コスト帯の再試算**：`tests/online-stage3-provisional-balance.cjs` のAI仮怪獣コスト7→**6**、索敵1050→**220**、疾風号令モデルを固定ゾーン→発動時ユニットバフへ変更、独立QAプロトタイプで「キャスト時対象限定・円外に出ても4秒持続・後入り無効・敵対象外・同名上書き／独立デバフ仮例の併存・期限切れ」を検証。既存18＋怪獣＝19兵種の361単体対面＋361カード対面は保持、対戦数値はHP/攻撃同一なので変わらない。怪獣の**HP/コスト191.67、単体DPS/コスト5.33**に上昇。守護ゴーレム7に敗れ相手HP752、戦車7に敗れ相手HP380は変わらない。**[GitHub Actions #40935556765](https://github.com/8mahi8/shokoku-sensen/actions/runs/40935556765) completed/success**。
- **最新設計正本**：`docs/STAGE3_PROVISIONAL_BALANCE_SCREEN_V2_2026-10-30.md`。旧`docs/STAGE3_PROVISIONAL_BALANCE_SCREEN_2026-10-30.md`には**V1旧案**の警告を付記。決定の経緯は`docs/STAGE3_FORT_KAIJU_AND_GALE_DESIGN_2026-10-30.md`に追記。
- **次の作業**：ユーザーに仮HP1150／72／2.25秒／移動22／占領3／索敵220と、疾風号令の倍率1.5／コスト3／半径125／3回、バフ同種重複の扱いを評価してもらう。承認を得てから**ゲーム本体への新カード・小さな共通statusEffect処理・描画・Firebase通信・ブラウザQA**に進む。**今回まだゲーム本体のユニット/スペルやFirebaseを変更したわけではない**。main/stable/Google Sites学校版/Rules/Drive不変更。実物iPad未検証。

## 3. 再開後にまず行うこと（本人から追加説明を待つ必要はない）

1. **GitHub開発ブランチ最新HEAD、PR #22、`AGENTS.md`、この文書、`STAGE2_IMPLEMENTATION_HANDOFF`と実ソース・CI結果を読む。** GitHub上の事実を記憶や過去チャットより優先。過去の固定SHAや「未実装」注記をそのまま繰り返さない。
2. 開発ソースの最新性と整合を検証：`node tools/build-online-bundles.cjs --check`。失敗時のみ`node tools/build-online-bundles.cjs`で**開発ブランチ内の**二つの単体HTMLを更新。
3. Node 22で少なくとも下記のテストを実行し、**GitHub Actions の Online 1v1 smoke**（`.github/workflows/online-smoke.yml`）の最新HEAD結果を確認。失敗時はログに基づく最小修正、根拠なしに成功扱いしない。
4. 新4体・引力を実ブラウザ画面で試し、次に**同時ホスト／ゲストの実Firebase**で新ユニット・攻撃範囲・召喚位置・減速、デッキ同期、再戦、切断復帰、キャンバス描画の様子を確認。テスト用ルームは最後に削除。**WebKitヘッドレスと物理iPadは同一ではない。**
5. 見つけた不具合だけを修正。仕様が曖昧な特殊能力細部は、既存のユーザー合意・設計の趣旨を保つ安全な暫定実装を選び、資料に明示。**勝手にキャラ性能や既存AIを変えない**。
6. `docs/HANDOFF_LATEST.md` の「いま何ができていて」「未確認」「次の作業」を更新し、コードとQAのGitHubコミット・必要ならDraft PR #22に残す。**同じ入口を次担当が読める状態を維持**。
7. ユーザーへの作業報告は毎回 **「今回した作業／検証結果／残課題／次にすること／ロードマップの現在位置」** を短く明示する。

### 必須テストコマンド

```bash
node tools/build-online-bundles.cjs --check
node tests/online-smoke.cjs
node tests/online-deck.cjs
node tests/online-stage1-combat.cjs
node tests/online-stage2-combat.cjs
node tests/online-unit-target-priority.cjs
node tests/online-sim.cjs
node tests/online-balance-theory.cjs > /dev/null
```

実ブラウザ系テスト・CIは追加で`tests/online-browser-live.cjs`、`tests/online-deck-online-e2e.cjs`、`tests/online-full-match-natural-firebase-e2e.cjs`、`tests/online-battle-visual-review.cjs`等と対応するGitHub Actionsを使う。特に**新4体＋スペルの挙動を既存旧デッキだけでテストして合格としない**。

## 4. 次のロードマップと受入ゲート

- **現在地：Stage 2設計確定 → 新4ユニット＋引力の開発ブランチ実装・アート・単体HTML同期 → 旧エンジン回帰および新12シーンChromium/WebKitブラウザーQA合格 → 実Firebaseの2席・両陣営5カード使用／引力ゲスト受信／再戦E2E合格 → 物理iPad試遊と投石の実戦incoming同期など細部QAは未完。**
- **次の実務：** Stage 2最新HEADのCI・ブラウザ表示・2席オンライン同期と戦闘、特に**貫通の複数敵、投石の固定着弾と対空、突貫爆撃機の接触条件、31秒のロボ生成、引力終了後に既存AIへ戻る挙動**を重点的に確かめる。前担当のStage 2 QAは抽出テストなので、見た目の品質も確認すること。
- **学校試遊版の扱い：** 開発版ファイルを生成・改善してよいが、本人が明示的に依頼するまで、**稼働中の学校Google Sites・main・stable・Firebase Rulesは変えない**。実際に公開していないものを「もう学校で遊べる」と言い切らない。
- **バランス調整の再開条件：** 友達との試遊で問題が発見されたとき、または本人が明示的に調整依頼したときだけ。旧レポートの疑いだけを根拠に再調整しない。

## 5. 旧資料・矛盾に対する優先順位

**最優先：今回の本人の最新指示 ＋ `docs/HANDOFF_LATEST.md` ＋ 開発ブランチの最新実コード・自動QA。**

- `docs/STAGE2_DESIGN_AND_BALANCE_DECISIONS_2026-10-29.md`は**数値・演出・設計判断**の資料。末尾の「未実装」という文は当時の状態であり、`docs/STAGE2_IMPLEMENTATION_HANDOFF_2026-10-29.md`と現在のコードを優先する。
- `docs/HANDOFF_UNIT_AI_2026-10-29.md`はAI設計史。「デッキ未設計・触るな」は**後で覆された**。現在のデッキ仕様は`docs/DECK_IMPLEMENTATION_HANDOFF_2026-10-29.md`が正本。
- `docs/HANDOFF_LATEST_2026-10-27.md`は旧通信・ラグ研究の履歴。現在のStage 2を「未着手」と戻さない。
- `docs/UNIT_AND_AI_DESIGN_CONSOLIDATED_2026-10-28.md`のAI規則は**今も守る**。仕様を変えずに特殊能力だけを独立実装する。
- `docs/UNIT_BALANCE_WORKFLOW_STANDARD.md` SOP v1.2は将来のバランス変更方法。今はユーザーが全体維持を選んでいるので、不要な調整を始めない。

**今後の担当AIは、ユーザーへ長い引き継ぎ文の再提示を求めない。まずGitHubでこの固定ファイルを読み、現在のHEADと実装・検証の差を確認して、自分で次工程へ進む。**
