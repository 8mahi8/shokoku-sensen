# ロール交代直後の赤軍カメラが青側に残る問題（2026-10-28）

## 実際に失敗した証拠
- [実Firebase #40533243906](https://github.com/8mahi8/shokoku-sensen/actions/runs/40533243906) 録画ありChromiumホスト/WebKitゲストの新ルームで役割交換後、旧青ホスト→新赤ゲストの`camera.x=457.142857...`（青端末初期側）となり、合法な赤軍召喚位置(1130,405)の表示X=1475.7pxがCanvas右端1194pxの外になった。テストは見逃さずFAIL。単なるPlaywright待機時間ではない。
- 録画なしChromium/WebKit・WebKit同士の条件では同じタップがPASSしていた。これはカメラ初期化のイベント順序依存と整合するが、最終的な根本原因はこれだけで完全証明されない。

## ソースから分かった構造
- `online-net.js resetLobby()`が`team=0`に戻してから`game.resetForLobby()`を呼ぶ。
- `online-game.js resetWorld()`は`ME()=>NET.team||1`を使うため、team 0時に一度**青軍の初期カメラ**に設定する。
- その後、新部屋へ`setupRoom(code,false)`でteam2へ変更するが、従来はゲームの初期カメラをここで再設定していなかった。最初の戦況適用時に`was==="menu"`なら赤側へ移動する救済があるものの、非同期Firebase room/meta/stateのイベント順序によって救済に頼る不確実性が残る。

## 今回の最小修正
- `setupRoom`で`room=db.ref(...)`を作り、新しい`team`/host情報が確定した**直後**、Firebaseの部屋イベント購読より前に`game.resetForLobby()`を実行。毎回**現在の座席に合わせて青/赤それぞれの初期カメラ・カードをリセット**する。
- この操作は新部屋のロビー1回だけ。対戦途中のカメラスワイプ、前線移動、戦闘計算、命令処理、送信周期、RTDBスキーマを変更しない。初回リモート受信時の既存赤側救済も安全網として残す。
- 実Firebase固定端末ロール交換QAは、戦闘開始前の**ロビー時点で**ホスト青カメラX<640、ゲスト赤カメラX>640を必須アサート。続けて赤軍の合法世界座標タップとRTDB召喚、14体戦場の両画面反映を検証する。
- `online-net.js` と2種のGoogle Sites貼付候補HTMLを同期、`online-smoke.cjs`で呼出し順の静的ガードを追加。
- **これを修正済みと呼ぶには、実Firebaseの録画あり・録画なし・WebKit/WebKit3条件が完走すること。** WebKitと学校実iPadは異なるため、学校での最終採否は別。

## 保護
- 新しい画質変更や機能追加を行わない。学校Google Sites版・main・Firebaseルールはそのまま。
- Google Driveは本人が「保存して」と言った場合のみ。
