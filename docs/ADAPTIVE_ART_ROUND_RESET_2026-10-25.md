# 小国戦線III｜再戦時の自動軽量化を初期化（2026-10-25）

## 開発版の変更
- 「6体以上で深刻な低FPS」時に発動する`lowFpsCrowdedSprites`（キャラクター画像を低負荷キャッシュへ変える機能）は、もともと**ページを閉じるまで一度ONのまま**だった。
- そのため1試合目で一度だけ重い戦闘になると、次の試合ではたとえ60FPSに回復していても最初の6体以上から軽量キャッシュのポーズへ変わる。メニュー・ロビーに戻っても現在の`adaptCrowdedSprites()`は既にONの場合に即returnするため解除されなかった。
- `resetWorld()`（試合開始・同一ルーム再戦・ソロ再戦で通る）で、`resetCrowdedArtForMatch()`を呼ぶ変更。キャッシュ利用フラグ、初回切り替えのフェード時刻、FPS計測窓と連続低FPSカウントをリセット。
- 同じキャラの画像タイル実体は`denseSpriteCache`に残して再利用するので、新しい画像の描き直しを強制しない。**ただし「キャッシュを使うか」は毎試合独立で再判定**。
- 新しい試合では必ずフルアニメーションで開始。極端な低FPSが続けば約2秒後、軽度な低FPSなら2観測区間後に再びキャッシュを適用。戦闘計算・ホスト/ゲストの通信・エネルギー・HP・攻撃・カード・Firebaseルールは不変。

## 変更とテスト
- [修正commit `0ad4fb6`](https://github.com/8mahi8/shokoku-sensen/commit/0ad4fb61add5d64b777c0ea19b38eee74c59e2db)。`online-game.js`、`online-ipad.html`、`online-embed.html`、`guest-lab-game.html`に同じ修正を反映。
- `tests/online-smoke.cjs`は**実行中の本番`adaptCrowdedSprites`関数**を抽出した20秒超の再現で、(1) 低FPS初回ON → (2) 試合リセットでOFF → (3) 60FPSの2試合目ならOFF維持 → (4) 次の試合で再び低FPSになればON、と`lowFpsCrowdedSpritesAt`リセットを検証。
- [Smoke #40196135401](https://github.com/8mahi8/shokoku-sensen/actions/runs/40196135401) **success**。
- WebKitの実際の10体戦闘2回を同一ページで開始するUIテストを`tests/online-art-cache-visual.cjs`にも追加。[対象のGitHub Actions](https://github.com/8mahi8/shokoku-sensen/actions/workflows/online-art-cache-visual.yml)。
- Chromium/WebKitゲストラボ、HUD、iPad画面、戦闘描画、実Firebase2ブラウザーは**個々の完了CIログを確認するまで未合格扱い**。

## リリース範囲
- PR #22はDraft、`main`は未変更。
- 学校Google Sites版と、2026-10-24にユーザーへ渡したGoogle Drive貼り付け用HTMLの内容・リンクは変更しない。
- Linux headless WebKitでの回帰結果は学校iPad実機の画質やFPSを保証しない。
