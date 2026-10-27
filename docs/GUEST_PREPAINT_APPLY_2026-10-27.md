# ゲストの受信済み戦況を描画直前に反映（2026-10-27）

## 判明した事象
- [診断コミット 3cb80d3](https://github.com/8mahi8/shokoku-sensen/commit/3cb80d368fdbeff452049fed9b67ad6fefb9e8fc) の [実Firebase 2ブラウザー検証 #40507556033](https://github.com/8mahi8/shokoku-sensen/actions/runs/40507556033) は3条件success。
- 無録画 Chromiumホスト／WebKitゲストの通常14体戦で、ゲストrAF gap **565ms**、現フレーム描画 **8ms**、フレーム間隔から前回処理時間を引いた残り **565ms**。同じ観測時点でSDK受信 seq14 / 最終反映 seq7（SDK受信約70ms前、反映約567ms前）。
- 同一エンジンWebKit同士や録画ありでも、SDK受信seqが最新適用seqより先行する短いギャップを観測。**JS draw処理が565ms実行したわけでも、Firebaseへの接続が565ms停止したわけでもない**。
- 既存コードの `receiveGuestWorld` は最新パケットを次の `requestAnimationFrame(flush)` まで待つ。ゲーム描画rAFが先に登録されていると、古い状態を1回描いた後に受信データを適用する余地がある。

## 今回の最小修正
1. ネットワーク層の `flushGuestBeforePaint()` により、描画フレームが始まった時に受信待ちの**最新1パケットのみ**適用してから描画する。元のrAF/650msフォールバックを維持。
2. 同じ予約コールバックが後から呼ばれても再適用しない `finished` 防御を追加。
3. 古い部屋・再戦からのrAFコールバックが**新しい部屋の受信キュー／フォールバックを取り消さない**よう、epoch照合を状態リセットより先に実行。部屋・ラウンド・退出時に予約フラッシュ参照を破棄。
4. 既存の単体HTML 2種・分割JS・ゲストラボを同期し、最新優先／重複適用なし／旧epoch隔離をスモークで検査。

## 変更しないもの・注意
- ゲームルール／ホスト権威／30Hz tick／描画品質／publish頻度／カード・エネルギー／Firebaseセキュリティルールは変更しない。
- この対策は**表示するスナップショットの鮮度を改善するもの**で、ブラウザrAF自体のFPSを上げる技術ではない。CI headless WebKitを学校Safari実測と混同しない。
- [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) に示すとおりrAFコールバックは再描画前に実行され、描画側・同期側のコールバックは独立に登録される。
- Google Sites版、GitHub main、Firebase Rules、既存Driveファイルは変更しない。開発PRはDraftのまま。新しいCI結果と画面録画確認までは完成判定しない。
