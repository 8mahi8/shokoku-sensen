# 小国戦線III｜ゲストの対戦開始時アニメーション時計を再同期（2026-10-24）

## 公開状態
- 学校のGoogle Sites版はユーザーが貼り付けた **「再戦修正版」のまま**。GitHub内の開発版とは異なる。
- この修正は開発ブランチ`perf/online-guest-snapshot-diagnostics-20261020`のみ。PR #22はDraft。main、Google Sites、Firebase構成・ルームデータには変更を加えない。

## 原因（実ソース監査）
- `online-game.js` の通常フレームはロビーを含め`S.clock+=delta`し続ける。
- ホストは新しい対戦の`resetWorld()`で`S.clock=0`に戻す。先に接続してロビーで待っていたゲストのローカル時計は、開始時にこれより何十秒・何分も進んでいる可能性がある。
- 以前の`apply(data,seq)`は`S.clock=Math.max(localClock,S.clock)`で決して戻さないため、新しい対戦に入ってもゲストの時計がホストより先行したまま残る可能性があった。
- `gald-render.js`はホスト基準で送信された`spawnAt`/`hitAt`と画面の`S.clock`の差で登場・被弾アニメーションを決める。大きな時計差ではこれらの演出が飛ぶ可能性がある。**実機で発生頻度は未測定**。
- `performance.now()`はページ文脈の時間オリジンに対する時計で、端末間で共有する対戦時計ではない（[MDN Performance.now](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now)）。非表示ページの`requestAnimationFrame`は停止・抑制される場合がある（[MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)）。

## 最小修正
- **メニュー・結果・その他の非戦闘状態から、正式に受信した準備または戦闘フェーズへ初めて移行するとき**だけ、`data.clock`を起点にゲストの表示時計を再同期。
- 準備中／戦闘中に受信する古いスナップショットでは、これまでどおり`Math.max(localClock,receivedClock)`で演出時計を巻き戻さない。
- **戦闘の時間・攻撃・エネルギー・カード使用権限はホストの値のまま**。通信方式・スナップショット構造にも変更なし。
- `online-game.js`、Google Sites貼り付け用の`online-ipad.html`/`online-embed.html`、専用ゲストラボ`guest-lab-game.html`を同期。[修正コミット](https://github.com/8mahi8/shokoku-sensen/commit/d685b1e029325b4df0156a4ab01015e588a8d969)。
- `tests/online-smoke.cjs`に実コードの時計再同期ブロックを抽出・実行する回帰を追加。メニューから初戦・途中参加・同一ルーム再戦・受信間の巻き戻し防止・通常進行・エネルギー不変・同梱HTML一致を確認。テスト内でゲストラボ専用ページは特殊な追加ロジックを持つため、丸ごとの完全一致ではなく時計修正個所だけを確認する（[修正コミット](https://github.com/8mahi8/shokoku-sensen/commit/d942a3ea557cef851a7e761af855ccf2d6ca768d)）。

## 検証結果・限界
- [修正後smoke #40094854291](https://github.com/8mahi8/shokoku-sensen/actions/runs/40094854291)は **success**。`online-sim`を含む既存回帰も実行。先行したsmoke #40094818128はゲストラボ用HTMLのテスト誤認で失敗し、後続で修正済み。失敗を隠さず区別する。
- クロスブラウザー実Firebaseの試験、ゲストラボ、HUD WebKit QA、戦闘視覚テストはこの修正に対して別途実行。未完了分は合格扱いしない。
- 初期ロビーで長く待ったあとに実iPadのゲスト演出がどう見えるかは**未確認**。ゲーム時計の計算と描画性能そのものの最適化ではない。
- 次の学校実機試験では、ゲストを20〜30秒待機させてからホストが試合開始、双方の大型部隊登場と攻撃・被弾演出が揃っているか観察。操作・エネルギー使用タイミングも確認。
