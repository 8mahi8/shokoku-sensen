# 小国戦線III｜ホスト・ゲスト品質引き継ぎ監査（2026-10-25）

## 対象・結論
- 対象: `perf/online-guest-snapshot-diagnostics-20261020` / PR #22 (Draft)。
- 監査時HEAD: `e782a35f8b61b67f99b86bde11a3465e739b2d25`。このHEADは資料更新のみ。
- 直近のゲーム本体改善: `9c816df75a8efebd58316e0fef14e0706571777a`（再戦時Canvas DPR / ゲスト描画間引き再評価）。
- 後続の実Firebase QA拡張: `777123ecf0673a7b74581a646bc9eb7502facdad`。
- **今回、新たな再現済みゲーム不具合は確認できなかった。** 実機未確認であるため、安定稼働を断言せず、根拠のないゲーム挙動変更は行わない。

## 今回直接確認したコード
1. `online-net.js`：metaのラウンド増分やfinished→lobbyで通信の旧シーケンス・予約済みスナップショットをクリアし、`game.resetForLobby()`を呼ぶ。新ラウンド開始時はホストの`game.begin()`とゲストのスナップショット受信が分岐する。
2. `online-game.js`：`resetWorld()`で`resetCrowdedArtForMatch()`および`resetAdaptiveCanvasForMatch()`を呼ぶ。低FPSの画像キャッシュ、DPR上限、ゲスト描画間引き、FPS測定窓と演出時計アンカーを対戦ごとに初期化する。
3. 同ファイルの`apply(data,seq)`：ゲストが準備/戦闘に初めて入る時だけホスト時計へ再基準化。戦闘中の時計巻き戻しを避ける。カード使用可能量はホストの確定エネルギーを維持する。
4. 描画ループ：ホストの固定30Hz/最大5tick・150msの上限制御、ゲストの表示専用演出時計ペース、負荷時のみ画像/Canvas品質を適応させる条件を確認。
5. `online-ipad.html` / `online-embed.html`：現行`online-game.js`と`online-net.js`の全文が、どちらにも含まれることを照合。専用`guest-lab-game.html`はQA差分があり全文一致とは扱わず、関連するリセット・時計・通信関数の存在を確認した。
6. `tests/online-smoke.cjs` と `tests/online-browser-live.cjs`：実装関数を抽出した再戦リセット回帰と、実Firebaseでの各ラウンド画質状態アサーションを確認。

## CI照合（実際のActions run / job）
- [実Firebase2ブラウザー #40198227022](https://github.com/8mahi8/shokoku-sensen/actions/runs/40198227022)：3ジョブとも`completed/success`。各構成で初戦+6回の同室再戦、計18回の再戦。ホスト・ゲスト双方の再戦時`tabletDprCap=1.45`、`guestLowPower=false`、`qualityMeasured=false`、`qualityFrames=0`の自動検査が合格。
- [キャッシュ画質 / Canvas再戦 #40197002201](https://github.com/8mahi8/shokoku-sensen/actions/runs/40197002201)：success。
- [オンライン基本smoke #40196922945](https://github.com/8mahi8/shokoku-sensen/actions/runs/40196922945)：success。
- [iPad画面 #40196922769](https://github.com/8mahi8/shokoku-sensen/actions/runs/40196922769)：success。
- [WebKit HUD #40196922734](https://github.com/8mahi8/shokoku-sensen/actions/runs/40196922734)：success。
- [ゲストラボ #40196922802](https://github.com/8mahi8/shokoku-sensen/actions/runs/40196922802)：WebKit / Chromiumともsuccess。
- [戦闘描画 #40196922842](https://github.com/8mahi8/shokoku-sensen/actions/runs/40196922842)：success。
- **注意**：元の`9c816df`に付随する実Firebase run [#40196922757](https://github.com/8mahi8/shokoku-sensen/actions/runs/40196922757) はcancelledであり、成功とは扱わない。後続`777123e`の成功runを根拠にする。HEAD `e782a35f`自体はドキュメントコミットで、本番ゲームコードは上記成功試験以後変更されていない。

## 残る判断と次の作業
- LinuxヘッドレスWebKitは学校iPadの実測ではない。実機ではホスト/ゲストで表示・エネルギーの使える境界・混戦・同室再戦・ホスト交代を確認。
- 学校Google Sites版は最後のユーザー申告では「再戦修正版」のまま。10/24の[Drive固定テスト用HTML](https://drive.google.com/file/d/12fab0-6CMdgyHkYXxln3mjCr4jZQAN5F/view)には上記の新規軽量化・再戦画質初期化が含まれないため、これで最新機能の実機評価をしたことにしない。
- 最新開発版を実機確認する段階では、`online-ipad.html`全文をGoogle Sites埋込用の**別の新規ファイル**として渡し、ユーザーが貼り替え・公開する。固定10/24ファイルは上書きしない。
- この監査は静的なコード照合と既存CIの事後確認であり、**新しいCI runの起動や学校iPadの実測は行っていない**。新たなコード欠陥を作り出して大きく改修せず、実機所見が出た場所だけ最小限に修正する。

## 保護範囲
main・Google Sitesの公開コード・Firebaseルール/既存ルーム・10/24 Driveファイルは変更しない。PR #22はDraftを維持。ログ収集、リプレイ、課金、大規模なセキュリティ機能追加は不要。
