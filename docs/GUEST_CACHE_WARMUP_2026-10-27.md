# 小国戦線III｜ゲスト側のキャラ画像キャッシュをフレーム分散｜2026-10-27

## 目的と学校実機の評価
2026-10-27の学校iPad試遊で、以前の「ゲスト画面が急に大きく固まる」問題はだいぶ改善。ただしゲスト側の表示が時々少しカクつく。本修正は従来の通信早期REST回復（1.1秒）、移動中の短い表示補間（最大240ms）、復帰可能な30FPS安全制限を**壊さず**、一時的なキャラクター描画負荷を削る試み。ゲームのルールを変更することが目的ではない。

## 根拠・資料
- [MDN: Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)：繰り返し描くプリミティブはオフスクリーンCanvasに事前レンダリングし、毎フレームの不要な描画作業を避ける。ただし一度に大量の画像を作れば**初回の同期処理が集中**する。初回生成のタイミングも予算化する。
- [MDN: JavaScript performance optimization](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/JavaScript)：`requestAnimationFrame` を使って描画タイミングをディスプレイと合わせる。ブラウザのスケジューリング問題とJS描画所要時間を別々に考える。
- [Gaffer on Games: Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/)：ネットワーク変動は表示の位置補間により目立たなくできるが、送信を無理に増やすこととは別の問題。
- 旧実Firebase全試合[#40452985770](https://github.com/8mahi8/shokoku-sensen/actions/runs/40452985770)：ゲストJS描画最長36msに対してrAFフレーム間隔最大686ms。大半のフレーム遅延はJS描画関数だけでは説明できず、**キャッシュ分散が全てのカクつきを直すという証拠はない**。

## コード上の見直し
既存`online-game.js`の`renderCrowdedUnit`は、混戦で実FPSが低下すると`lowFpsCrowdedSprites`を有効にして、`cachedSprite(u,pose)`からオフスクリーン画像へ切り替える。以前は必要な新ポーズの画像を**全て同じ描画フレーム内で同期生成**することがあり、切替直後の負荷が尖るリスクがあった。

- [ゲーム本体・学校用2種HTML・ゲストラボの同期修正 `b48081fb`](https://github.com/8mahi8/shokoku-sensen/commit/b48081fb80b731fb1b0ff9e084b377be0d19014f)：1描画フレームの**新しいポーズタイルの作成を最大2枚**に制限。既に生成済みのタイルには制限なし。必要なタイルがまだないキャラは**従来のフルアート描画を続ける**ので非表示にしない。
- `presentRemoteUnit`で位置・アニメーション補間済みのキャラをキャッシュ生成失敗/遅延時にフルアートへ渡す際、同じ描画フレームで補間関数を再実行しないよう`drawUnit(u,alreadyPresented)`を追加。通常フルアート描画・ホスト描画の引数省略時の挙動は変わらない。
- [回帰テスト `a2235a4d`](https://github.com/8mahi8/shokoku-sensen/commit/a2235a4daebea05cc47499ad6f3f684f4339b51d)：基本テスト、WebKitの**実際のキャラ画像生成**を呼ぶ負荷分散試験、実Firebase長時間対戦の1フレームあたり新タイル数のテレメトリー追加。
- [抽出テストの関数名追従 `67a7bcb1`](https://github.com/8mahi8/shokoku-sensen/commit/67a7bcb1ed140eaf3289f50dae879ad7ae45a3d9)：本体の`drawUnit`に引数を追加したため、smokeの関数抽出境界も更新（この修正はゲーム本体への変更なし）。

## 実施済みQA
- [smoke #40488504924](https://github.com/8mahi8/shokoku-sensen/actions/runs/40488504924) **SUCCESS**。
- [WebKitキャラアートQA #40488358769](https://github.com/8mahi8/shokoku-sensen/actions/runs/40488358769) **SUCCESS**。9クラス×2陣営×4ポーズ=**72通りのキャラ絵に欠け・切れなし**、最初のキャッシュ切替演出・ラウンドごとのリセットもPASS。
- WebKitの実10体戦闘を使って、同じページで新規キャッシュ生成枚数を確認。**第1フレーム2枚・第2フレーム2枚・第3フレーム2枚**。各描画フレームは2枚以下に収まり、その後は計6タイルを再利用して10体が描かれる。新規タイルが足りない最初の2フレームはフルアートを描く。どのフレームも画面から兵士は消えない。
- 実Firebase BOT対BOT全試合や対戦コマンドの回帰試験は別のGitHub Actionsで合否を確認し、PASSまで完了とは扱わない。
- 初回pushのsmoke失敗は`drawUnit`引数追加に対する**テストの文字列抽出境界未更新**、初回ビジュアルQA失敗はWebKitブラウザプロセスの途中終了。ゲーム本体の描画ロジックの障害とは未特定。最新smoke成功を確認済み。

## 制限と公開方針
これは初回オフスクリーン画像生成のスパイクを最大2枚分/フレームに抑えるための**限定最適化**であり、学校iPad Safariが絶対にカクつかない保証ではない。headless Linux WebKitのFPS数値を学校のFPSと同一視しない。低FPSになる原因がブラウザのコンポジタ・学校回線・ホストSDK受信である場合、この修正だけでは直らない。

main、学校のGoogle Sites既存コード、Firebaseルール、前回Driveに保存した安定版は変更しない。開発PR #22はDraft。次は実Firebase長時間対戦と目視録画の結果を回収し、次の学校で旧版と比較するか判断。
