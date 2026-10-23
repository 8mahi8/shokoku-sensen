# 小国戦線III｜ホスト時計の限定的な改善（2026-10-23）

## バージョン
Google Sites版＝**再戦修正版のまま**。本修正は開発ブランチ限定。ユーザーによるサイト貼り替えの通知がない限り、公開済みとして扱わない。

## 変更理由
`online-game.js` の固定30Hz戦闘計算は `requestAnimationFrame` の実経過時間を蓄積する。以前は1フレームで最大**90ms**しか積算せず、ホスト10fpsなど描画フレームの長期低下により試合時間、回復、移動、攻撃が実時間より遅れることがあった。

## 修正
1フレームの上限を**150ms**へ拡張。30Hz戦闘ステップは以前と同じ。1フレームの処理ステップは**最大5回**で厳しく維持し、上限を超える処理を無限に追いかけない。戦闘ルール・コスト・勝敗・Firebase通信構造は不変。描画・カメラ・HUDには同じdeltaを使用するため、低FPS時の演出時間も従来より進み得る。

## 実際の効果の目安（理論上の固定FPSで、60秒経過した場合）
| Host FPS | 90ms旧上限 | 150ms新上限 |
|---:|---:|---:|
| 60/30/15 | 60.0s | 60.0s |
| 10 | 54.0s | 60.0s |
| 8 | 43.2s | 60.0s |
| 7 | 37.8s | 59.5s |
| 5 | 27.0s | 45.0s |

**机上計算**であり、学校Safari実機での計測ではない。描画やJavaScript処理が真にCPU限界の場合、より多くのtickを要求することでFPSが悪化する可能性がある。そのため7fps未満は全面改善せず安全弁を残し、既存のWebKit同一ブラウザー・実Firebase 2端末CI、ゲストラボ試験と比較して採否を判断する。

参考：Gaffer On Games, [Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/) 。MDN, [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)。
