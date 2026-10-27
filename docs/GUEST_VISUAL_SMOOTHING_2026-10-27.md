# 小国戦線III｜学校のゲスト視点カクつき改善・2026-10-27

## 学校iPadの実機フィードバック
本人の実機試遊結果（2026-10-27）：
- ゲスト側の「以前の突然大きく画面が固まる問題」は**だいぶ改善した**。
- ただし**時々少しカクつく**。通信品質への評価は「悪くもなく良くもなく」。
- これは**通信/描画の評価で、ゲームの面白さへの評価ではない**。
- 以前の大きな停止の回復策を壊さず、小さな表示のカクつきを改善する。

## 外部資料の確認（出典と採用理由）
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)：rAFは画面の更新に合わせて動き、非表示タブ・iframeでは一時停止する場合がある。JS関数の実行時間と**実際のフレーム間隔**を別々に計測する。
- [MDN: Animation performance and frame rate](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Animation_performance_and_frame_rate)：アニメーションのjankはJavaScript以外にも描画などの負荷で起きる。Canvas描画とフレーム間隔を別々に評価。
- [Firebase: Optimize Database Performance](https://firebase.google.com/docs/database/usage/optimize)：読取最適化は実態計測を先に行い、listen pathを絞る。現在正常に機能するSDK受信＋REST早期回復を**無根拠に全置換しない**。
- [Gaffer on Games: Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/)：短いネットワークjitterを補間で隠せるが、外挿のしすぎは誤差・位置飛びを生む。通信を増やしたり戦闘計算を予測せず、**歩行中だけ短時間**に限定。
- [Unity Multiplayer: Improving performance with client-side interpolation](https://docs-multiplayer.unity3d.com/netcode/current/learn/clientside_interpolation/index.html)：スナップショットを描画時に直接飛ばさない、受信時刻のばらつきを表示だけで吸収する。

## 現行コードで見つけた問題
1. `online-game.js` の `adaptCanvasQuality` は、試合開始後の最初の3.4秒サンプル等でWebKitゲストが42 FPS未満かつDPR≈1なら `guestLowPower=true` にし、Canvas描画を約30 FPSに抑える。旧実装では **qualityMeasured=trueのまま試合終了まで再評価せず**、重い場面が終わっても描画30 FPSから戻らなかった。これは学校での「悪くないが少しカクつく」に寄与する可能性がある（実機原因としては未断定）。
2. `presentRemoteUnit` の歩行兵士予測はスナップショット受信から**170msで停止**。125ms目安のRTDB更新が一瞬180–240msにずれると、動作を一時止めて次のパケットで再び動かす表示になり得る。
3. [前回の実Firebase長時間実戦 #40354890152](https://github.com/8mahi8/shokoku-sensen/actions/runs/40354890152) は、ゲストCanvas/JS描画時間最大31msに対し、rAF間隔最大517ms（500ms以上1回）。描画関数時間の短さだけでは見た目の滑らかさを保証しない。ただしLinux headless WebKitは実際の学校iPad Safariとは異なる。

## 実装内容（Google Sites版ではなく開発PR #22だけ）
**コミット**：
- [838fb0cd](https://github.com/8mahi8/shokoku-sensen/commit/838fb0cd6de198f1ca3a233a6bce8ad6fa4266a8)：ゲーム本体＋`online-ipad.html`＋`online-embed.html`を**同一コードへ同期**。
- [93558952](https://github.com/8mahi8/shokoku-sensen/commit/93558952d1cdb3fb5190a91a911707d7affe3bce)：回帰テスト追加。
- [5252e087](https://github.com/8mahi8/shokoku-sensen/commit/5252e08709e25cdd6afca3afb4b87acc119147d1)：開発用 `guest-lab-game.html` の描画試験コードにも同じ変更を同期。

**描画レートの回復**：
- ゲストが30 FPS安全モードに入った後でも、rAF更新が**8.5秒連続・平均55 FPS以上**に回復したら、30 FPS描画制限を解除する。
- 解除後は**20秒の再制限クールダウン**を設け、境界のFPSで頻繁に切り替わることを抑制。条件に達しない重い端末は従来の保護を維持する。
- 非表示ページでは回復計測を中断・リセット。ルーム再戦では初期品質計測をリセット。
- **FPSが改善する保証ではない**。端末・iframe・WebKitのrAF呼出しが元から低い場合は制限解除されない。通信・Canvas描画コストが増える可能性もあるので実機評価が必要。

**短い通信jitterの歩行補間**：
- 動いているユニットの**表示だけ**、最大**170ms→240ms**の移動速度外挿。最新スナップショットで停止中のユニットは予測しない。外挿の最大座標差は速度40なら9.6ワールド座標程度。
- 受信した位置へ毎フレーム収束。画面上の速度、脚の歩行演出を滑らかにするためであり、サーバー/ホスト権威のユニット位置、HP、攻撃、召喚範囲、リソース、勝敗には一切介入しない。

## 検証
- [オンラインsmoke #40453050856](https://github.com/8mahi8/shokoku-sensen/actions/runs/40453050856) **SUCCESS**。新規テストで「170msを越えた歩行は表示継続、240msを越えては外挿しない」「停止中の補間停止」「低FPSで安全モード、8.5秒の健全FPSで解除、20秒クールダウン」をコードから直接抽出して検証。貼り付け用2種HTMLとゲーム本体の全文一致も検証。
- [iPad UI #40452985793](https://github.com/8mahi8/shokoku-sensen/actions/runs/40452985793) **SUCCESS**。
- [キャラ描画 #40452985775](https://github.com/8mahi8/shokoku-sensen/actions/runs/40452985775) **SUCCESS**。
- [WebKit HUD #40452985719](https://github.com/8mahi8/shokoku-sensen/actions/runs/40452985719) **SUCCESS**。
- 実Firebase長時間・ブラウザ1vs1、視覚QAは実行開始。最終の結果は個別のActionsで確認する（結果未確認の試験を成功済みとは書かない）。

## ルールと今後
- 学校のGoogle Sites公開版、`main`、Firebase RTDBルール、配布済みDriveファイルを変更しない。PR #22はDraft。
- 次は実Firebase通し結果とゲスト録画でフレーム間隔・残り時間表示・兵士動作の変化を評価。最終的には本人が新コードをGoogle Sitesの**別テストページ**に貼り、学校iPad同士でホスト/ゲストを交代して評価。体感が悪化したら前版へ戻せるようにコミットを保持する。


## 完了した実Firebase通し試験・録画レビュー（2026-10-27）

- [実Firebase BOT vs BOT #40452985770](https://github.com/8mahi8/shokoku-sensen/actions/runs/40452985770) **SUCCESS**。Chromiumホスト、iPad相当のWebKitゲストが実際のBOTを動かして**試合時間300秒の時間切れ判定まで完走**、壁時計311.1秒。青BOT **51回**、赤ゲストBOT **32回**の有効な行動、同時最多22ユニット、JavaScript例外0件。実Firebase一時ルームの `CLEANUP confirmed` をジョブログで確認。
- **通信側は今回特に安定**：WebKitゲストの受信イベント無応答最大414ms、5秒サンプルの戦況反映からの経過最大374ms、状態シリアル2286まで進行。長い受信停止によるREST照合は**0件**（回復機能が不要だった試合）。ホスト最終送信の経過最大315ms、送信リトライ0回。
- **描画にはまだ残課題**：ゲスト最大フレーム間隔**686msが1回**（1000ms以上0）、ゲストJS描画処理最大36ms、ホスト最大フレーム間隔67ms。長い受信停止がない試合でも、ゲストWebKitの描画スケジューリングで単発のカクつきが起こりうる。
- **録画確認**：GitHub Actions artifact `online-bot-vs-bot-real-match` の両視点フル動画を取得。ゲスト動画を20秒刻みの接触シートと19〜26秒付近の4FPS抽出で直接目視した。試合が進行し、ユニット移動・交戦・カード・残り時間が変化している。ひとつの静止画や粗いサンプリングだけで全秒間の滑らかさを保証しない。
- [Online browser-live #40452985732](https://github.com/8mahi8/shokoku-sensen/actions/runs/40452985732) **SUCCESS**：実Firebaseの2ブラウザ対戦・回復/再戦経路。[Online battle visual #40452985821](https://github.com/8mahi8/shokoku-sensen/actions/runs/40452985821) **SUCCESS**：ビジュアル画面QA。
- **比較の留保**：旧run #40354890152 は最大517ms、今回最大686msだが、旧試合は最高11体・試合内251秒、今回は最高22体・300秒と環境が異なるため、この数値だけで今回の修正が速く/遅くしたと判定しない。実際の学校iPadで「大きな停止は改善・小さなカクつきあり」という評価に対する、次候補の**実機の滑らかさ改善効果はまだ未検証**。
- Google Sites用試遊候補HTMLのバイト列は [smoke #40453050856](https://github.com/8mahi8/shokoku-sensen/actions/runs/40453050856) の成果物から抽出して、Git blob SHA `0678eee311ff9f7260baec97e876b5669a21f40f` と一致を確認。旧安定版とは**別ファイル**として保管。Google Sites公開版・main・Firebase設定は変更なし。
