# 小国戦線III｜新AIの実ブラウザ画面・戦闘行動QA（2026-10-29）

開発ブランチ `perf/online-guest-snapshot-diagnostics-20261020`、Draft PR #22。**学校Google Sites版、stable、main、Firebase Rules、既存Driveファイルに変更なし。新キャラ追加・デッキ構築への着手もなし。**

## このターンで実施したこと

- 専用ブラウザQA `tests/online-unit-ai-browser-visual.cjs` を追加。対応ワークフロー `.github/workflows/online-unit-ai-browser-visual.yml`。
- `online-ipad.html` を**ローカルテスト用HTTPサーバーの応答メモリ内だけ**で拡張。検証器用 `unitAiSetup()/unitAiAdvance()` を挿入し、ゲーム本体 `selectPriorityTargets`／`unitStep`／`fire`／Canvas描画をそのまま使用。ファイル上の学校HTMLには書き込みなし。
- 両ブラウザで7種類の意図的に配置した固定局面を再現。各局面で攻撃先／追撃先、攻撃による敵HP、移動後X、例外の有無を判定し、**実際のCanvas画面**のPNGを生成。
- 同一構成のWebKit/Chromiumスクリーンショットを取得し、**WebKitの全7枚について実画像を目視**。大きなCanvas欠落・画面全体の描画停止・カード表示の全面欠落は確認されなかった。固定局面では大型や敵兵を近接配置したため、複数スプライトの重なりが見える。これは実際の試合での発生頻度や視認品質を証明・否定するものではない。
- `tests/online-smoke.cjs` に、`v3-art.js` 原本が `online-ipad.html` と `online-embed.html` に全文同期されていることをチェックする回帰テストを追加。従来からの戦闘本体・通信・性能値チェックと合わせて実行。

## 7シーンの検証（各ChromiumとWebKitの2通り）

| シーン | 期待される動き | 目視／状態確認 |
|---|---|---|
| scoutInterrupt | 偵察ライダーは砦へ向かいつつ射程内敵1に反撃 | x=300→320.5、敵HP105→77、砦HP12のまま |
| guardianLarge | 守護ゴーレムは近い歩兵2より大型敵3を主対象 | 戦車HP1100→985。歩兵は巻き込みで105→7.25（仕様どおり） |
| guardReturn | 固定索敵円外・射程外の敵を追わず帰還 | x=400→390、敵HP不変 |
| guardOutsideSelfDefense | 固定索敵円外でも自身の射程内なら反撃、追撃なし | x=480固定、敵HP105→43 |
| scoutFortChoice | 砦3と城3から近い方の砦へ接近 | x=1080→1084.02、砦HP12→11 |
| infantryFortIgnore | 歩兵は視界内の砦1を追いかけない | x=300→311.5、砦HP12のまま |
| redNoBacktrack | 赤軍進撃兵が前線を通過した後方敵を追わない | x=900→888.5、相手HP不変 |

- 初回成功CI: [Online unit AI browser visual QA #40786641176](https://github.com/8mahi8/shokoku-sensen/actions/runs/40786641176) **success**。PNG14枚／JSON結果をアーティファクトとして記録。画像はアーティファクト保存期限14日。
- 同CIの`results.json`を別途取り出して比較したところ、7シーンの `before` と `after` は**Chromium／WebKitで同一値**。これを人手確認だけにせず、双方の配列 `deepEqual` を使う自動判定をテストコードに追加した。
- 戦闘を固定検証するため `S.phase="inspect"` とし、通常の30Hz自動tickを止め、`unitStep(1/30)` を手動で15回実行。スクリーンショットの「試遊」「停止中」等の表示は**この検証設定の副作用**であり、本番対戦時のHUDを示すものではない。
- 物理iPad Safari、Google Sitesの実iframe、実Firebase接続のゲスト操作遅延をこの試験から推定しない。以前のオンライン実接続テストは別証拠。
- Playwrightの公式ドキュメントにも、OS・バージョン・GPUなどによって画面のピクセル比較は異なり得るとある。今回は**ピクセル同一性ではなく状態の等価性と画像の実見**で検証：https://playwright.dev/docs/test-snapshots

## キャラ追加のしやすさ

- 新しい行動AIの共通化と仮キャラを用いた3行動型の回帰試験は前ターンで成功（37シナリオ）。
- 追加実装で`v3-art.js`の学校用2ファイルへの組み込み忘れを早期検知可能にした。**アート制作自動化や新キャラ自体の実装ではない**。
- 演出コードの既存ID分岐、BOT召喚戦略、学校用HTML生成の自動化は依然として拡張性の課題。AI品質を壊さないよう、必要な箇所から独立して評価する。
- 新キャラのカードへの編入方法やデッキ変更の仕様は本人が依頼するまで検討しない。

## 現在地と次工程

新AIのデータ設計 → 実装 → 37件のNode回帰 → **7場面×2ブラウザの戦闘実描画QA（今回）** → 学校実機のホスト/ゲスト、砦移動、後出し切替、密集時WebKit描画のA/B体感検証。Google Sites公開反映は本人判断。

**実ブラウザ成功＝学校iPad最終完成ではない。** 残る表示遅延などが確認できた場合だけ、開発ブランチで最小修正を行う。
