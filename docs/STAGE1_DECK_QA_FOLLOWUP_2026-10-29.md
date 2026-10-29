# 小国戦線III｜第1段階5体＋デッキ構築：追加QA結果（2026-10-29 JST）

## 確認対象と公開境界

- 開発ブランチ：`perf/online-guest-snapshot-diagnostics-20261020`。この追補までの前提コミット：`549d093c22aed9df9ac1c172489cbed09ca47536`。
- 先行正本：`STAGE1_IMPLEMENTATION_AND_DECK_HANDOFF_2026-10-29.md`、`DECK_IMPLEMENTATION_HANDOFF_2026-10-29.md`、`UNIT_BALANCE_WORKFLOW_STANDARD.md`。
- **ゲーム本体のHP/攻撃/AI/通信や学校公開を変更していない**。追加したのはQAスクリプト・CIゲート・本記録のみ。
- `main`／学校安定ブランチ`stable/school-ipad-20261028-99a0d1d`／稼働Google Sites／Google Drive／Firebase Rulesは変更しない。

## 新たに実施したこと

1. `tests/online-stage1-combat.cjs`を新設。現行`online-game.js`から実際の`deploy`・`advanceHand`・`fire`・`hitUnit`を切り出し、外部依存だけをモック化して次を確認。
   - 新5体すべてを青・赤それぞれで召喚し、ユニット・HP・コスト消費・残り使用回数・攻撃アニメ時間・手札循環を検証。
   - デッキに未採用のユニットは召喚拒否（本テストの簡易カード資格モック内）。
   - 双剣兵と迎撃騎兵が通常単体ダメージのみを与えること、重撃砕兵150ダメージに大型補正がないこと。
   - 遠距離工兵が敵砦に攻撃力30ではなく占領力1だけ削り、12回で所有者が変わること。
   - 対地爆撃翼が地上の直接対象へ55、別の地上対象へ33、飛行の巻き込みは0、味方には0。
   - 注：これは抽出した本番ロジックの決定的テストであり、2台の物理iPad操作・Firebase通信を再現したという意味ではない。
2. `.github/workflows/online-smoke.yml`へ上記テストを追加し、新キャラ追加で失敗を検出できる回帰ゲートにした。共通AIケースの表示を実数42へ訂正。
3. `tests/online-unit-ai-browser-visual.cjs`に5体の実戦場面を追加。学校用単体HTMLをlocalhostの一時メモリ内だけでQA拡張し、実際のCanvas描画と共通`unitStep`で攻撃・追跡・砦攻撃を行う。通常7場面＋追加5場面をChromium/WebKit各1回＝24画面の検証に拡張。10枚の新キャラアートスクリーンショットを保存。

## CI / 画面エビデンス

- **開発ソースの同期・従来スモーク・新戦闘テスト**： [Online 1v1 smoke #40865855406（成功）](https://github.com/8mahi8/shokoku-sensen/actions/runs/40865855406)、コミット `6a379d1130df529d618384b3f78112db19969f2d`。
- **新キャラ5体のChromium/WebKit表示＋戦闘挙動**： [Online unit AI browser visual QA #40866341230（成功）](https://github.com/8mahi8/shokoku-sensen/actions/runs/40866341230)、コミット `549d093c22aed9df9ac1c172489cbed09ca47536`。artifact `unit-ai-chromium-webkit-visual-evidence`。
- **実Firebaseの別デッキ確定・再戦**： [Online deck ready and rematch E2E #40864184426（成功）](https://github.com/8mahi8/shokoku-sensen/actions/runs/40864184426)。これは別編成（青：双剣兵／赤：爆撃翼）のロック・再戦を確認するもので、5体全員の実機対人召喚検証ではない。
- **Chromium/WebKitのデッキUI**： [Online deck editor visual QA #40864184567（成功）](https://github.com/8mahi8/shokoku-sensen/actions/runs/40864184567)。artifact `deck-editor-chromium-webkit`の実スクリーンショットを確認。15種類のプール、5体の固有肖像、横画面レイアウトを視認。狭い画面のカード名は小さめ、縦画面では名称が折り返される。
- **未解決**： [One-shot online two-browser live QA #40864184371（失敗）](https://github.com/8mahi8/shokoku-sensen/actions/runs/40864184371)。失敗2構成は`page.evaluate: Target crashed`／`Target page, context or browser has been closed`で、通信・ゲームロジックのアサーション失敗ではない。リソース要因かアプリ由来か未確定。実Firebase二端末試験の専用E2E成功と、この長時間QA失敗は別々に報告する。

## 残りの品質条件

- 実際の学校iPad Safari・Google Sites iframeで、両席違うデッキを選び、5体をタップ召喚し、対戦中の操作遅延・初撃・エフェクト・再戦・各自の手札更新を試す。**物理実機での合格はまだ主張しない**。
- BOTの汎用カードフォールバックは実装済みだが、旧固定ヒューリスティクスが先に動くため、5体をBOTが十分に選ぶかは実戦追加評価が必要。
- WebKit/Chromiumの実スクリーンショットでは、重装系大型キャラと重なると小型キャラの視認性が下がる場面がある。直ちにキャラ性能や戦闘AIを変更しない。
- 一部のブラウザ長時間ライブQAクラッシュは、軽量な再現条件・資源消費・ブラウザプロセスログで別途切り分ける。
- 最新開発版のGitHub Pages試遊公開と学校Google Sites公開は別。本資料作成ではいずれも変更していない。本人の確認後にのみ学校版を切替える。
