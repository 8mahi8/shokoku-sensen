# 小国戦線 III — 130体大規模戦闘QA・描画軽量化

対象：開発版 `develop` のみ。公開版 `main` は編集しない。

## 変更内容

- `online-game.js` のCanvas描画段階で、視界外のユニット・死亡アニメーション・前哨基地・城壁・エフェクト・弾を描かない。
- キャラクター画像の大きさを見込んで、視界よりも横約155・縦上225・下85ワールド単位だけ余裕を持たせる。
- 対象オブジェクトは描画しないだけで、当たり判定・ターゲット選択・HP・召喚・時刻進行・Firebase同期に一切手を加えない。
- 処理が重くなるタイミングが試合途中でも追従できるよう、描画DPRの自動調整を一度だけの測定から継続する3.4秒ごとの測定に改善。遅い場合にDPR 1.0へ一方向の切替を行い、それ以上の画質変動を防ぐ。
- `tests/online-mass-battle.cjs` はローカル限定の `?qa=1` テスト窓口を使い、双方65体ずつ最大130体を生成して、実際の戦闘シミュレーションを動かす。
- Chromium/WebKitそれぞれiPad横1194×834、縦820×1100、Google Sites相当900×520の3種類を検証する。各実行で描画カリングOFF/ONの両方を測る。
- テストはカード・タップ・スワイプ・詳細パネルの既存テストに加えて実施。オフラインのFirebase SDK遮断試験と、別workflowのFirebase 2端末実通信も維持。

## テストの読み方

- 「drawCalls」は1.1秒間に`KokokuArt.drawUnit`が呼ばれた総回数。比較すべきは**描画回数 ÷ フレーム数**。FPSが改善すると1秒あたりの総描画回数が増えることがあるため。
- Google Sitesのコンパクト画面は小画面向けカメラプリセットで戦場ほぼ全域を表示する場合があり、視界外の兵が存在しないなら、カリング後も描画回数が減らないのは正しい。
- headless Chromium/WebKitの値はCPU/GPUやCI仮想環境の影響が大きい。**実iPad SafariのFPSの保証にはならない**。
- 静止画で崩れがなくても「触っていて気持ちがいい」ことを保証しない。学校のiPad実機での最終試遊が必要。

## 初期計測で見つかった点

開発版のChromium横向き・計130体の1.1秒サンプルでは、最適化OFF時は11フレーム・中央値100ms、ON時は14フレーム・中央値約83msだった（run 38755129557）。縦向きでも12→15フレームだったが、値は短時間のサンプルで、統計的に確定した高速化率ではない。

## 回帰検査・検証リンク

- <https://github.com/8mahi8/shokoku-sensen/actions/workflows/online-ipad-visual.yml>
- <https://github.com/8mahi8/shokoku-sensen/actions/workflows/online-browser-live.yml>
- <https://github.com/8mahi8/shokoku-sensen/blob/develop/tests/online-mass-battle.cjs>

公開版から更新する際は、上記テストに合格し、実機で問題がないことを確認してから移行を検討する。
