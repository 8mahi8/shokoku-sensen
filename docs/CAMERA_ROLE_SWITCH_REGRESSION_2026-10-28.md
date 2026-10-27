# 小国戦線III｜座席カメラの回帰検証・動画再確認（2026-10-28）

## 対象と変更の境界
- 開発ブランチ `perf/online-guest-snapshot-diagnostics-20261020` のDraft PR #22限定。
- 学校Google Sites貼付版、GitHub `main`、Firebase本番ルール、Google Driveは変更していない。
- 本ゲームコードのカメラ修正は [0b1f33e](https://github.com/8mahi8/shokoku-sensen/commit/0b1f33e61525cdf57c95600d44115e911af48c56) で既に実装済みだったため二重実装しなかった。
- `setupRoom()` は `team` 決定後 `alignLobbyCameraForSeat()` だけ実行。再戦以外で `resetForLobby()` を余分に実行しない。元のロビーカメラを陣営に合わせて即時整列し、手札・デッキ・資源・戦況を作り直さない。
- 直接貼付用 `online-ipad.html` と `online-embed.html` にはこのソースが統合済み。

## 今回の実証
1. ローカルNode.jsの隔離VMで最新単体HTMLから `alignLobbyCameraForSeat` / `panCamera` / `clampCamera` を抽出し、青→赤→青→赤のカメラ移動と、ユニット・手札・資源・試合状態の非変更を確認（学校実機の代替ではない）。
2. [最新ゲームのsmoke #40547361002](https://github.com/8mahi8/shokoku-sensen/actions/runs/40547361002) SUCCESS。オンライン基本シミュレーション、再戦、Bundled HTML全文同期。iPad UI [#40547361008](https://github.com/8mahi8/shokoku-sensen/actions/runs/40547361008)、Guest Lab [#40547360959](https://github.com/8mahi8/shokoku-sensen/actions/runs/40547360959)、戦闘画面 [#40547360893](https://github.com/8mahi8/shokoku-sensen/actions/runs/40547360893)、HUD [#40547362311](https://github.com/8mahi8/shokoku-sensen/actions/runs/40547362311)もSUCCESS。
3. 同じゲームコードの実Firebase2ブラウザ [#40547360811](https://github.com/8mahi8/shokoku-sensen/actions/runs/40547360811) の **録画なし Chromium/WebKit と WebKit/WebKit は SUCCESS**。7ラウンド6再戦、SDK/REST復旧、オフライン復帰、役割交代後の赤軍合法位置(1130,405)へのタップ→Firebase命令→赤軍2体の召喚、3つの使い捨てルーム清掃まで通過。
4. 録画ありの旧runは heavy scene 画像取得直後に長時間無応答となり、12分でcancelled。ゲーム故障とは断定できない。このため [eeb4d7f](https://github.com/8mahi8/shokoku-sensen/commit/eeb4d7f880dc129061ed3ff79855cb95fa686f2d) でテスト終了処理のPlaywright browser/page/RTDB delete/readを時間制限つきにし、元のエラーをcleanupより先に出すよう改善した。
5. **録画あり再実行 [#40550411978](https://github.com/8mahi8/shokoku-sensen/actions/runs/40550411978) がSUCCESS**。7ラウンド6再戦、離脱復旧、ロール交代後、赤軍側カメラx=822.86、青軍側x=457.14、赤軍召喚がRTDBのseq 5に確定、受信同期、テスト用3ルーム削除が成功。約62秒の録画実ファイルと軽装・大型・スペル・混戦の実Firebase画面PNGをダウンロードして確認。兵士・カード・砲撃警告・両軍の戦場・役割交代後の青側カメラが表示され、明らかな輪郭欠損は見られなかった。ただし1回の録画から微細なカクつきが常にないとは言えない。
6. 実Firebase BOT対BOT [#40547361093](https://github.com/8mahi8/shokoku-sensen/actions/runs/40547361093) SUCCESS。ゲーム内114秒で首都破壊決着、最多13体、ゲスト最大rAF間隔266ms、500ms以上0。ゲスト/ホストのフル録画を収集し、進軍・交戦・時計・勝敗まで画面で確認した（Linux headless WebKit、学校iPadのfpsとは別）。

## テスト環境修正
- 前の画像キャッシュQA [#40547360985](https://github.com/8mahi8/shokoku-sensen/actions/runs/40547360985) はWebKit依存ライブラリのapt取得中キャンセル。ゲームを起動していなかった。
- [0461d19](https://github.com/8mahi8/shokoku-sensen/commit/0461d1960a7bdbeddc99bd5ab2ac43ddaf83305c) で、成功実績のある `mcr.microsoft.com/playwright:v1.56.1-noble` に画像QAを移行。[#40549648642](https://github.com/8mahi8/shokoku-sensen/actions/runs/40549648642) SUCCESS。72ポーズ輪郭欠け0、再戦時のフル画質復帰を確認。
- [eeb4d7f](https://github.com/8mahi8/shokoku-sensen/commit/eeb4d7f880dc129061ed3ff79855cb95fa686f2d) は実Firebase QAコード限定、ゲーム本体に変更なし。

## 未完了・次
- 同じ **最新QAテストコード eeb4d7f** に対する録画なしChromium/WebKit、録画なしWebKit/WebKitは再実行キューにあり、実行完了前は最新SHAの合格と呼ばない。前版0b1f33eの同条件は上記の通り成功済み。
- 学校iPad Safari / Google Sites埋込での、ゲスト側の突発的な全画面カクつきと召喚操作感は、CIでは合格保証できない。Google Sites版の安定性を保持したまま、学校の同じ2台で役割交代して最終判断。
- 性能検証は [PERFORMANCE_EVIDENCE.md](PERFORMANCE_EVIDENCE.md) と [FULL_MATCH_VIDEO_MOTION_REVIEW_2026-10-27.md](FULL_MATCH_VIDEO_MOTION_REVIEW_2026-10-27.md) を参照。Canvas停止 / HUD・背景非表示 / 背景キャッシュ部分描画の単純な再実験は避ける。未検証の原因だけを小さくA/Bする。
