# ゲスト操作「送信中」表示の可読性調整・実戦検証（2026-10-27）

## 対象と厳守事項
- コードコミット: [f398a4a6](https://github.com/8mahi8/shokoku-sensen/commit/f398a4a6b1043528f32cc5d4480c89a4effaf8e6)
- 対象は開発ブランチとDraft PR #22のみ。学校Google Sites公開版、main、Firebaseルール、既存Driveファイルは未変更。
- 戦闘/召喚/通信頻度/資源/勝敗に手を加えない。演出はホストによる召喚確定を偽装しない。

## 実画像の指摘と最小修正
以前のChromiumゲストラボ [#40496558862](https://github.com/8mahi8/shokoku-sensen/actions/runs/40496558862) の実Canvas画像 `guest-command-queued-chromium.png` を目視すると、650msの後半で「送信中」の暗い台と文字が大きく薄まり、特に赤軍首都付近で読みにくかった。
旧式は全650msにわたり線形に薄くなる `0.75 * life` だったため、送信から500ms経過時の乗算透明度は約0.17。

- 通常の見やすさを最初の約470ms維持して、**最後の180msで消失**するように `0.9 * min(1, (650-age)/180)` に変更。
- 500ms時点では透明度乗算が約0.75。650msで完全に消える。リング/プレート/文字だけの描画調整で、テキストの領域・DOM・操作受付は変更しない。
- `online-game.js` と `online-ipad.html`、`online-embed.html`、`guest-lab-game.html` を同じ描画式に同期。
- `tests/online-smoke.cjs` に「500ms後にも一定以上の可読性が残る」実描画コード抽出による回帰ASSERTを追加。
- 技術的背景: [web.dev INP](https://web.dev/articles/optimize-inp)、[Firebase RTDB read and write](https://firebase.google.com/docs/database/web/read-and-write)。この修正は主観的な即応フィードバック改善であり、通信往復やフレーム生成を高速化する施策ではない。

## 確認できたQA（このコミット SHA）
- [smoke #40498674965](https://github.com/8mahi8/shokoku-sensen/actions/runs/40498674965): **SUCCESS**。コード構文、Google Sites HTMLへの本体同梱、500ms後の可読性回帰を含む。
- [キャラ画像QA #40498674986](https://github.com/8mahi8/shokoku-sensen/actions/runs/40498674986): **SUCCESS**。
- [実Firebaseゲストラボ #40498674984](https://github.com/8mahi8/shokoku-sensen/actions/runs/40498674984): Chromium / WebKit の両ジョブ **SUCCESS**。実Canvasの `guest-command-queued-webkit.png` を目視し、「送信中」ラベルが読めることを確認。実際のpointer操作・ゲストからの送信・正規ホスト召喚・ゲスト反映・自然消滅は当該テストが検査。
- [BOT実Firebaseフルマッチ #40498675049](https://github.com/8mahi8/shokoku-sensen/actions/runs/40498675049): **SUCCESS**。実ゲーム時間157秒で首都破壊決着、青BOT14手/赤ゲストBOT19手、同時最多9体、JSエラー0、guest最大rAF間隔268ms/500ms超0、キャッシュ新規生成最大2タイル/フレーム。途中までの一場面ではなく完走検証。
- [戦闘ビジュアルQA #40498674949](https://github.com/8mahi8/shokoku-sensen/actions/runs/40498674949): **SUCCESS**。
- BOT実戦のゲスト約168秒録画から10/30/50/75/100/125/150秒付近を静止画として直接確認。確認した範囲ではカード、キャラ、戦場、HP、画面更新が維持され、明白な全画面崩壊は見えない。全フレーム目視や実機試験の代替ではない。

## この記録時点で未確定の項目
- [iPad UI #40498675030](https://github.com/8mahi8/shokoku-sensen/actions/runs/40498675030): in_progress。
- [WebKit HUD #40498675038](https://github.com/8mahi8/shokoku-sensen/actions/runs/40498675038): in_progress。
- [相互2ブラウザ実Firebase #40498674989](https://github.com/8mahi8/shokoku-sensen/actions/runs/40498674989): queued。
- CIはLinux/headless WebKit上の検証。学校iPad Safari + Google Sites埋込の650ms表示の見やすさ・突発的な軽いカクつき解消は未検証。
- 現在のリング/文字改善は**入力確認UXの修正のみ**。本当のゲストフレームヒッチ/RTDB受信停滞が解消したとは主張しない。今後学校でホスト・ゲストを交代して比較する。

## 試遊候補の原本
- [smoke成果物](https://github.com/8mahi8/shokoku-sensen/actions/runs/40498674965) にGoogle Sites貼付用HTML全文をTXTとして保存。
- 開発 `online-ipad.html` のgit blob SHAは `d45a7b4550c5a2818582ebfce11e689b06e85b45`。artifactのTXTも `git hash-object` で同SHA、330,920 bytes、SHA-256 `e2fe59754f6fcd78d6aa897ca387d36922a52dd8bb14c586ffd4cf6ef3f85f74`。
- 以前のDrive保存ファイルとは別物。Google Sites公開版にはまだ反映していない。
