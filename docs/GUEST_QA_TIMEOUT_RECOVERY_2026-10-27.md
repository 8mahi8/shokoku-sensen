# ゲスト短いカクつき調査：CI待機上限と表示診断の順序（2026-10-27 夜）

## 実測と原因の区別
- [実Firebase 3条件 #40511464388](https://github.com/8mahi8/shokoku-sensen/actions/runs/40511464388) は動画ありChromiumホスト/WebKitゲストと同一WebKitホスト/ゲストがSUCCESS。録画なしChromium/WebKit条件だけ、標準・軽量・大型場面を記録後、約11分ログ更新なしでワークフロー12分上限によるcancelled。**ゲーム不具合の証拠にはならないが、この条件は未合格。**
- 録画なし標準14体のWebKitゲストrAF gap最大349ms、`SDK seq11/適用seq11`、描画8ms。同一WebKit条件の通常戦ではホスト4.6FPS/ゲスト4.2FPS。Linux headless WebKitであり学校iPad Safari FPSではない。
- [Playwright API setDefaultTimeout](https://playwright.dev/docs/api/class-page#set-default-timeout) と [CI global timeout guidance](https://playwright.dev/docs/ci) を参照。従来の独自`deadline`は内側の`await f()`自体が無応答だと期限を守れず、画像撮影も明示タイムアウトなし。これを修正する。

## 実装内容
1. CI限定の`deadline`各ポーリング操作に最大8秒の独立上限。失敗を無条件にPASSにせずエラー詳細を残し、後処理とFirebase一時ルーム掃除へ移る。
2. Playwright page操作上限12秒、ナビゲーション20秒。主要戦場撮影も12秒API timeout＋外側14秒に制限。
3. no-video実ネットワーク検証は描画負担を抑え`dense`戦の代表画像だけを撮影。**録画あり条件は全場面撮影、独立の戦闘ビジュアルQAは従来の22シーンを保持**。実Firebase 7ラウンド/6再戦・切断復帰等の機能検査は一切間引かない。
4. 各場面開始と撮影開始のログを追加して無応答の場所を特定しやすくした。
5. ゲーム内の診断のみ`NET.flushGuestBeforePaint`後に`trackGuestFrameHitch`を実行。旧順序は直前に受信済みで今から適用するパケットを「反映されていない」と記録する可能性があった。描画/勝敗/資源/通信構造は不変。

## 次の検証と禁止事項
- この変更で`online-smoke`と実Firebase3条件の成否、WebKit録画、ゲストラボ、iPad UIを確認。タイムアウトが具体化した場合、根本原因の解決まで成功としない。
- 学校Google Sites版、GitHub `main`、Firebase本番ルールは未変更。**Google Driveに保存しない（本人が明示指示した場合のみ）。**
- ユーザーの学校実機でゲストの軽いカクつきが根治したとは未判定。CIの見た目と実iPadを混同しない。
