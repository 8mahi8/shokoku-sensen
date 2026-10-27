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


## 続報｜実Firebaseの初回長時間成功とテスト条件修正

- [実Firebase試合 #40488358990](https://github.com/8mahi8/shokoku-sensen/actions/runs/40488358990) **SUCCESS**。壁時計201.4秒・試合内190.8秒で城破壊決着、青BOT20手・赤ゲストBOT18手、最多10体、JS例外なし・一時ルーム削除確認。ゲスト最大rAF間隔278ms、500ms以上0、ゲストスナップショット経過最大494ms、SDK受信経過最大514ms。この試合では低FPS用のタイル生成は**0枚**（通常のQAモードで低FPS自動切替を無効にしていたため）。新機能を実戦で使った証拠とはせず、変更が通常戦闘を壊していない確認とする。
- [ゲーム本体改修直後の実Firebase試合 #40488067422](https://github.com/8mahi8/shokoku-sensen/actions/runs/40488067422) もSUCCESS。壁時計266.9秒・試合内255.8秒、青24手・赤34手、最多15体、JS例外なし、試験ルーム削除確認。ゲスト最大フレーム間隔501msが1件、ホスト50ms。**両試合は部隊数・展開が異なるので比較だけで改修の性能効果を断定しない**。
- [BOT通しテスト条件の改善 `bed2b7d6`](https://github.com/8mahi8/shokoku-sensen/commit/bed2b7d6691239d7ecef2b4e89e301287f8d652e)：本番では有効な低FPS時のキャラキャッシュ自動切替を、localhostのBOT通しテストでも明示的に有効化。実Firebaseで自動切替を通った新タイル生成とキャッシュ総数、各フレームの上限を記録する。**テストコード限定の変更**であり学校版には影響しない。
- [新実戦 #40489289033](https://github.com/8mahi8/shokoku-sensen/actions/runs/40489289033) の最終結果で、自然な低FPSキャッシュ切替中も新規タイル数が1フレーム2枚を超えないこと、および試合継続・Firebaseルーム清掃を確認する。


## 完了｜本番同等の自動キャッシュ切替あり・実Firebase 5分戦

- [Actions #40489499643](https://github.com/8mahi8/shokoku-sensen/actions/runs/40489499643) **SUCCESS**。修正済みBOT通しQAでゲストの`__qaEnableCrowdedArtAdapt=true`を明示し、**本番同様に低FPS時のキャッシュ自動切替が機能**する状態で実Firebaseの連戦ではない1試合を最初から最後まで検証。
- **実ゲーム時間300秒、壁時計310.8秒、時間切れ判定で決着**。青BOT45回、ゲスト赤BOT32回、最大17ユニット、JS例外0、実Firebaseテストルーム削除後の`null`確認。
- **キャッシュが本当に作られた証拠**：`guestMaxCacheTilesSeen=58`。`guestMaxNewCachedTilesPerFrame=2`、設計通り1描画につき2タイルを超過していない。通信はSDK最新受信経過最大219ms、スナップショット適用から最大225ms、ホストpublish経過最大134ms、送信再試行0、SDK長期停滞プローブ0。
- **WebKitゲストのrAF最大間隔270ms、500ms以上0、1000ms以上0、JS描画最大34ms**。ホストrAF最大133ms。異なる旧試合より数値が良くても、試合展開・兵士数が異なるため最適化の改善率は導けない。今回の強い結論は**自動切替・分散・通信・勝敗・後片付けを同時に正常完走したこと**。
- 実Firebase試合のartifact `online-bot-vs-bot-real-match`（artifact ID `12728326226`）から、WebKitゲストの**約315秒・960×672フル動画**を回収。約20〜295秒の12カ所を抽出した接触シートと、112〜125秒の映像を目視確認。キャラ描画、カード、UI、時計、画面上の交戦進行を確認し、**確認した範囲では兵士が消える/絵が壊れる症状はなし**。録画全フレーム/学校の実機検証を代替するものではない。
- QA起動スクリプトにいったん入った`async()=>>`の構文誤りは [aee9710a](https://github.com/8mahi8/shokoku-sensen/commit/aee9710a2a3f474b847e30fb662d5fba5969a4cb) で解消され、**その後の正式QA #40489499643 はSUCCESS**。過去の起動前失敗をゲームエンジンの実動作エラーと混同しない。

**採用判断**：学校実機での滑らかさ改善は未証明。現時点でGoogle Sites既存公開版・main・Firebase設定・前回Googleドライブ保存版は変更しない。新修正はDraft PR #22上の学校試遊候補として保存。必要な手動操作が発生するのはGoogle Sitesの別ページへ貼り付けるときのみ。
