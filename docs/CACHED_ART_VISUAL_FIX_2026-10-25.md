# 小国戦線III｜キャッシュ描画の画質確認（2026-10-25）

## 実施
- 開発PR #22の中だけで、低FPS時のキャラクターキャッシュをレビュー。学校Google Sites版・以前渡したGoogle Driveテスト用HTML・main・Firebase設定は変更しない。
- 古い164×190タイルに対し、守護ゴーレムの原画は201×227。右端・上端などが切れる問題をコードと同一ポーズのWebKit画像で特定。
- 戦車と守護ゴーレムだけ大きい282×278タイルを使用。通常クラスは攻撃ポーズの端を考慮して192×214タイルを使用。キャッシュはキャラクターの描画画像のみ。戦闘計算は不変。
- 以前のキャッシュ描画でHPバーがクラスごとに異なる高さへずれていたため、通常描画の高さに合わせた（特にGald守護ゴーレム・戦車）。

## WebKit結果
- [本修正](https://github.com/8mahi8/shokoku-sensen/commit/3b0931917ff2952353f993394add112df05737dc)
- [全72パターンの画質QA](https://github.com/8mahi8/shokoku-sensen/actions/runs/40191849501): **success**。9種類×2陣営×4ポーズの通常描画を参照にし、キャッシュ枠外に可視ピクセルがないことを検証。**欠け0件**。
- 同CIのアーティファクトに、守護ゴーレム・戦車の待機/攻撃をFULL/CACHEDで並べたPNGと機械検査JSONを保存。
- [基本回帰](https://github.com/8mahi8/shokoku-sensen/actions/runs/40191849479)と[iPad画面QA](https://github.com/8mahi8/shokoku-sensen/actions/runs/40191849532)も成功。
- WebKitはLinux上の自動試験なので、学校実機でのFPSや知覚上の滑らかさを保証しない。

## 次
- キャッシュへ自動切り替わる瞬間の歩行/攻撃/被弾アニメーションと、低FPSでの手札応答は実iPadで後日確認。ゲーム内容・HP・ダメージ・エネルギーは変更しない。
- 未完了の実Firebase2ブラウザー、WebKit/Chromiumゲストラボ、HUD、戦闘動画CIについては個別の完了結果を見るまで成功扱いしない。
