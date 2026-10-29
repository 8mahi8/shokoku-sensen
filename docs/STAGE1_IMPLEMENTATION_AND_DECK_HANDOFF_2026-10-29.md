# 小国戦線III｜第1段階5体実装＋デッキ構築の実用化 引き継ぎ（2026-10-29）

## 状態と公開境界
- **開発ブランチ実装済：** `perf/online-guest-snapshot-diagnostics-20261020`（Draft PR #22）。
- **学校公開中Google Sites、main、学校安定ブランチは変更禁止・未変更。** Google Sitesの貼付けテキストのユーザー保存も今回は行わない。
- **GitHub Pagesの現行main公開URLは今回の開発実装では更新されていない。** 友達との実機試遊による最終確認は未完了。ここでの「完成」は開発ブランチ上のコードと自動テストの範囲に限る。
- ユーザーの基本方針は「今後は新キャラを追加するだけで、デッキ構築自体の再設計を不要にしたい」。基本歩兵常設＋異なる10枚の採用＋4枚手札と使用後の循環を維持する。

## 第1段階5体（試遊用の本人希望値）

| ID | 名前 | cost | hp | damage | cool | size/behavior | 特徴 |
|---|---|---:|---:|---:|---:|---|---|
| `duelist` | 双剣兵04 | 3 | 145 | 22 | 0.55 | medium/normal | 速い単体近接・低耐久 |
| `crusher` | 重撃砕兵08 | 5 | **460** | **150** | 2.65 | medium/normal | 高単発・大型優先なし |
| `ranger_engineer` | 遠距離工兵13 | 4 | **300** | **30** | 1.40 | medium/capture | range95・capture1 |
| `interceptor` | 迅速迎撃騎兵24 | 3 | **195** | 38 | 1.15 | medium/guard | speed47、固定索敵円 |
| `ground_bomber` | 対地爆撃翼43 | 5 | 230 | 55 | 1.90 | medium/normal | 飛行、対空不可、地上範囲 splash67/.60 |

- **迎撃衛士（既存）**：HP540→**440**、攻撃間隔1.45→**1.60秒（AI提案の暫定値）**を開発コードへ適用。試遊で再評価。学校公開版には影響なし。
- 元データと構造：`docs/NEW_UNITS_STAGE1_FIVE_DESIGN_V1_2026-10-29.md`。
- 以後も数値調整は `docs/UNIT_BALANCE_WORKFLOW_STANDARD.md` に従い、1v1残HP・決着秒・コスト比較→本人が付加価値判断→必要箇所だけ実戦。

## 実装箇所

| ファイル | 今回の実装 |
|---|---|
| `online-game.js` | 5体の`CLASSES`定義・専用攻撃演出時間・既存の`selectPriorityTargets`共通AIを利用。射撃／斬撃の演出フラグはクラスデータから制御。迎撃衛士試験値。新キャラ向けBOT戦術フォールバック。オンラインホスト／ゲストで確定デッキを参照し、ゲストの新カード使用資格を正しく反映。ソロ時はローカルのデッキ編集内容を青軍へ反映 |
| `v3-art.js` | 5体の独立したCanvasキャラクター・攻撃/歩行演出、色・スケール・HPバー座標・カード/図鑑肖像。飛行爆撃翼にホバー演出 |
| `online-deck.js` | `Object.keys(CATALOG)`から15種類を自動列挙（歩兵除外）。未採用の5枚をタップ→採用中の1枚をタップで交換。HP/攻撃/間隔/射程/速度/占領/対空/範囲などを詳細表示。localStorage保存・破損修復・無効保存は継続 |
| `online-net.js` | ルーム未参加時にもデッキ編集可能にし、BOTソロ試遊にも編成を適用。2人READY後の各自デッキ10枚のRTDBロック・再戦解除は既存設計を利用 |
| `online.html` | 新しいJSキャッシュバスターを適用 |
| `online-ipad.html`,`online-embed.html` | 開発ブランチ内でゲーム・デッキ・通信・キャラアートを完全にインライン同期。学校貼付け用のHP/攻撃編集欄に14体全員を反映（迎撃衛士440） |
| `tools/build-online-bundles.cjs` | **今後の手作業コピーを削減する生成ツール**。上記4モジュールとキャラ初期値を両単体HTMLへ反映。通常実行で更新、`--check`で同期不備をCI検出 |
| `tests/online-unit-target-priority.cjs` | 5体の実戦AI構成・砦優先・アンカー迎撃・地上爆撃・08一般対象優先を追加 |
| `tests/online-deck-visual.cjs` | Chromium/WebKitで実際の15枚プール、10枚保持、タップ交換・取消・保存・横/縦画面幅を検査 |
| `tests/online-deck-online-e2e.cjs` | 実RTDB+Chromiumホスト+WebKitゲスト。**青軍に双剣兵、赤軍に対地爆撃翼を別々に選び**、READY→対戦開始→デッキ双方照合→終了→再戦→再ロックを実測 |

## 確認済み証拠と残作業

- [本物のFirebaseホスト/ゲストの別編成・再戦E2E 成功](https://github.com/8mahi8/shokoku-sensen/actions/runs/40864184426)。結果ログに「independently edited 10-unique decks with real new cards」「rematch retains 10 selections」、試験ルームDELETE 200の記録。
- [開発ブランチの通常スモーク 成功](https://github.com/8mahi8/shokoku-sensen/actions/runs/40863168748)（単体ファイル同期・デッキ・戦闘シミュレーション・AI）。
- [デッキUI Chromium/WebKitの実5体交換検証 成功](https://github.com/8mahi8/shokoku-sensen/actions/runs/40863344410)。
- [単体HTML同期確認をCIへ追加](https://github.com/8mahi8/shokoku-sensen/actions)（`node tools/build-online-bundles.cjs --check`、14体の学校向け編集欄と4モジュールを同期）。
- 現行のWebKit/Chromium画面検証・BOTフルマッチ・一部ネット対戦診断には、処理量の多い実行枠があり、**本書時点で最終的にすべての新組合せを実機で網羅したと断言しない**。
- **新5体を実際にそれぞれ戦場に召喚して長時間戦わせるiPad実機試験は未了**。Firebase2ブラウザのデッキ設定・ロックを確認したのと、本物のiPadで5体をプレイ確認することは別。
- **新キャラの見た目はまず簡潔な専用Canvas描画**。高品質のガルド画像に到達したとまでは主張しない。ゲームUI・戦闘演出の品質は実機試遊後に改善候補を扱う。

## キャラを今後追加する場合の最短手順

1. 既存の`docs/UNIT_AND_AI_DESIGN_CONSOLIDATED_2026-10-28.md`に従って8項目・対象優先度、HP/攻撃/間隔、コスト、召喚数・使用回数を設計。ユーザーとの理論バランス表を作る。
2. `online-game.js`の`CLASSES`へ1行のキャラデータ、`MOTION.attack`へ演出時間を追加。特殊能力が既存の共通モジュールで表現可能なら固有AIを追加しない。
3. `v3-art.js`へ固有のCanvas姿、`SPRITES`、カード色、サイズ・高さを追加。**現在は描画データ/コードが必要であり、『定義の1行だけで外観も自動生成』ではない**。
4. `node tools/build-online-bundles.cjs`で学校向け単体HTMLを同期し、`node tools/build-online-bundles.cjs --check`で一致を確認。
5. `node tests/online-smoke.cjs`、`node tests/online-deck.cjs`、`node tests/online-unit-target-priority.cjs`、ブラウザのデッキ10枚交換、実Firebase2人対戦、再戦テストを実行。
6. **デッキに追加するためのハードコード作業は不要**。`online-deck.js`はCATALOGから候補を自動的に読み取り、既存の10枚重複不可選択・両軍ロック・手札循環をそのまま適用。
7. GitHub Pages試遊 → 本人確認 → 学校Google Sites公開。公開まではmain/学校安定版を更新しない。

## 本人の選択済み第2・第3段階
- 33 貫通射手、37 遠投投石器、48 突貫爆撃機（ユニット）を次に設計。
- 54 機械召喚師はユニット、59 引力はスペル。
- これらはまだコードに入れていない。新たな共通能力設計と理論バランスは別工程。
