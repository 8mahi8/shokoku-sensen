# ゲストの短いカクつき・QA同フレーム通信診断（2026-10-27）

## 目的と根拠
- 学校実機では大きな全画面停止は改善したが、時折の軽いカクつきが残る。
- 2026-10-27 実Firebase BOT対戦では最大rAF間隔268ms、500ms超0。従来の「直近の停止」は**450ms以上**しか表示しないため、短い事象を拾えない。
- [MDN Long animation frame timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing) と [web.dev frame attribution](https://web.dev/articles/find-slow-interactions-in-the-field) に従い、rAF間隔とJS実行時間を混同せず比較する。特定ブラウザ専用の計測APIに依存しない。
- 既存[PERFORMANCE_EVIDENCE.md](PERFORMANCE_EVIDENCE.md)のCanvas/HUD非表示・同条件WebKitホスト/ゲスト試験を繰り返さない。

## 変更（通信・勝敗・描画ルールには変更なし）
1. ローカルの「通信・描画診断」パネルで**180ms以上**のゲストフレーム間隔を「直近のカクつき」として表示。これまでの450ms以上の停止診断を包含し、部隊数とSDK受信・反映seq/経過を併記。記録は端末メモリ内のみ、ロビー移行時に破棄。
2. localhost/127.0.0.1 `?qa=1` に限定したフレーム計測で、180ms以上のゲストrAF間隔について**同フレームの**`sdkSeq`、`appliedSeq`、受信・反映経過、REST状況、直近適用時間を付加。従来の描画/logic/HUD/network/prev-frame-gap 計測を保持。
3. 既存の実Firebase 2ブラウザーCIの短期計測に最大3件の`worstHitches`を出力する。パケットの時刻、seq、描画コストを同じ観測点で比較できるが、**原因が確定した証拠と混同しない**。
4. 直接貼り付けHTML 2種・ゲストラボ・分割ソースに同じ計測変更を適用し、しきい値とQA境界をsmokeに検査追加。ゲストラボには以前から診断パネルの短時間停止表示がないためQAフレーム計測だけ追加。

## 保護事項・次工程
- 生データのFirebase送信／永続保存／ゲーム内研究ログは追加しない。host tick / 召喚 / エネルギー / 受信・publish周期 / 描画画質は変更しない。
- GitHub開発ブランチ／Draft PRのみ。本番Google Sites版・main・Firebase rules・既存Driveファイルには未反映。
- CI完了後、最大ギャップ発生時にSDK受信だけが古いのか、フレーム計測の残余時間が大きいのか比較する。Linux headless WebKitと学校Safari実機の同一性は主張しない。
