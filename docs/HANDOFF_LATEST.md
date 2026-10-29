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
- 初回更新時点では修正後の Actions 3本が**実行中／合否未確定**：
  - [デッキ2席E2E #40910397653](https://github.com/8mahi8/shokoku-sensen/actions/runs/40910397653)
  - [デッキUI Chromium/WebKit #40910404735](https://github.com/8mahi8/shokoku-sensen/actions/runs/40910404735)
  - [ユニットAI Chromium/WebKit #40910414865](https://github.com/8mahi8/shokoku-sensen/actions/runs/40910414865)
- **次の担当はまず上記3 CIの最終結果・失敗ログを取り直す。** 成功するまで「通過」と書かない。これらは主にStage 1のカードとAIの回帰で、Stage 2全能力の実ブラウザー戦闘・Firebase2席同期・物理iPad試遊の代用ではない。Stage 2専用の試遊シーン/合法配置テストを次に追加して検証すること。

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

- **現在地：Stage 2の設計確定 → 開発ブランチへの機能実装・アート・単体HTML反映済み → 自動回帰一部確認済み → CI/実ブラウザ/実Firebase/学校iPad試遊は未完。**
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
