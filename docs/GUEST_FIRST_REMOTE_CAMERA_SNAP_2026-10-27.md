# 新規ゲスト参加時の赤軍初期カメラ即時設定（2026-10-27）

## 問題発見
- [固定端末ロール入替テスト #40521831982](https://github.com/8mahi8/shokoku-sensen/actions/runs/40521831982) の録画ありChromium/WebKitはロール入替・赤軍召喚成功。録画なしChromium/WebKitはロール入替／両者の開戦完了／`canSendCommand=true`でも、開始直後の赤軍側召喚が23秒以上Firebaseの戦況に反映されずFAIL。
- 入退室の際に `resetLobby()` が `room=null;team=0` にしてからゲーム `resetForLobby()` を呼び出す。その`resetWorld()`は初期カメラを青軍側（team 0扱い）に配置する。
- その後、赤ゲストの**初めての受信状態** `apply()` では `if(was==="menu")cameraTo(980,330)` がスムーズな遷移を開始するだけ。受信直後にタップすると、まだ赤軍の召喚範囲が画面に移りきっていない可能性がある。失敗の原因はこのケースと整合するが、失敗時のカメラ数値未取得のため**直接原因は未確定**とする。

## 開発版限定の最小修正
- `online-game.js`で初回受信だけ `panCamera(980-S.cam.x,330-S.cam.y)` を使い、赤軍初期位置を即時表示する。既存`panCamera`はカメラ範囲クランプと移動終了を保証。**対戦中の自動カメラ移動・スワイプカメラ・赤青の色／当たり判定／対戦ルールは変更なし**。
- 2つのGoogle Sites埋込候補HTMLとゲストラボのゲームコードを同期。
- 実Firebase固定端末入替QAは、クリック位置を画面割合（赤軍右側フラクション）から**固定した合法な戦場座標x=1130,y=405の表示位置へ変換**。タップ位置がキャンバス内にあることをアサートした上で、ホストが新ゲストから命令を受信・召喚したことをRTDBで確認する。
- 異常時に旧ホスト/新ホスト双方の`syncDiagnostics`、手札・カメラ・通信の座席状態、commands/feedbackの臨時ルーム情報をCIの失敗ログに出す。**継続的なゲーム履歴や研究ログは保存しない**。使い捨てFirebaseルームは削除する。
- [MDN canvas transform](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setTransform) の通り、ビューポート座標と戦場座標の変換を同じ式で計算する。

## 検証・禁止事項
- smoke/埋込HTML一致・iPad UI・WebKitゲストラボ・実Firebase3条件を通過して初めて採用可と判断。
- 原因が仮説の段階で他のゲーム動作やFirebase通信方式を変更しない。
- Google Sites公開版・main・Firebase rules・Google Driveは**未変更**。Driveは本人が保存指示した場合のみ。
