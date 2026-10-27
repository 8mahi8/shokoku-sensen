# 小国戦線III｜ゲスト初回戦況の適用完了まで入力UIを保護（2026-10-28）

## 根拠
Firebase meta.status=playingと独立したstate購読のgame.applyは同時とは限らない。metaが先行した直後は対戦画面が表示されながらS.phase=menuのままで、カードpointerdownが無視されることがある。以前の赤軍手動召喚失敗と整合する有力仮説だが当時のタップ直後の選択状態は記録されていないため、確定原因とはしない。

## 実装
`guestPlayableWorld()`はlastRemoteSeq>0かつgame.world().phaseがprep/battleと確認できた時にのみ真。ゲストでは初回有効戦況の反映までオンラインルームUIを維持し「戦況を同期しています…」を表示、反映後に隠す。meta先着・world先着と再戦・ルーム交代に対応。戦闘ルール、ホスト権威、Firebase送信周期/ルール・認証は一切変更しない。

`online-net.js`、Google Sites貼付用`online-ipad.html`/`online-embed.html`、開発用`guest-lab-game.html`のネットワークコードを同期。`tests/online-smoke.cjs`のVM packetテストハーネスを同期し、初回同期の状態遷移テストを追加。

## 外部資料
[Firebase Web Realtime Database listener](https://firebase.google.com/docs/database/web/read-and-write)・[Playwright auto-waiting](https://playwright.dev/docs/actionability)。要素がクリック可能であることと、ネットワークゲーム内部状態が操作可能になったことは異なる。

## 直前のQA
[CI run #40596696890](https://github.com/8mahi8/shokoku-sensen/actions/runs/40596696890)はChromium/WebKit録画あり・なし初回合格。WebKit同士は初回4ラウンド目heavyでLinux WebKitプロセスが終了したが、ジョブ再実行では7ラウンド・役割交代・赤軍の手動召喚2体・3部屋削除までSUCCESS。CI環境固有の断続的WebKitクラッシュは別課題で、学校iPadの不安定性を立証するものではない。

## 受入れ
本変更後のsmoke/iPad UI/実Firebase3構成を再確認する。実学校iPadのFPS/操作体感の改善は未測定。Google Sites公開版、GitHub main、Firebaseルール、Driveは変更しない。