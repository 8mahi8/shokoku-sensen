# 役割交代後のゲストカメラ修正｜初期化は1回のまま（2026-10-28）

## 修正理由
- 実Firebase [run #40533243906](https://github.com/8mahi8/shokoku-sensen/actions/runs/40533243906) 録画あり条件では赤軍ゲストの初期カメラが青側に残り、合法な赤軍召喚地点が画面外になっていた。
- 最初の修正 [6991205](https://github.com/8mahi8/shokoku-sensen/commit/6991205480dd59f91b8cc8e89beb1f737f701269) は `setupRoom` が追加の `resetForLobby` を呼ぶため、[smoke #40535212106](https://github.com/8mahi8/shokoku-sensen/actions/runs/40535212106) のシミュレーションで、再戦につきreset1回という不変条件を壊した。**撤回**。
- 今回は `setupRoom` で新しいホスト/ゲストのteam確定直後に、`alignLobbyCameraForSeat()` だけを実行する。既存の`panCamera`がカメラを即座に新座席の左右へ合わせる。**世界/手札/デッキ/資源/再戦回数/通信データをリセットしない**。最初のremote world受信時のカメラ安全網も残す。
- Live QAはロビー内の赤青カメラ座標を検査した後、実際の合法な戦場タップとFirebase命令を確認する。基本smokeとsimulationと実Firebase3条件の完走が受入条件。
- 学校Google Sites / main / Firebase rules / Google Driveは変更しない。Drive保存は本人に頼まれた時だけ。
