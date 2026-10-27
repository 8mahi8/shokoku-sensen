# Phase 1｜背景キャッシュ可視範囲描画 A/B 結果（2026-10-28）

## 結論：不採用・実験コードを取り除いた
- [実行 #40531949523](https://github.com/8mahi8/shokoku-sensen/actions/runs/40531949523) は **SUCCESS**、8条件で従来描画と切り出し描画の `getImageData` 画素差は**全て0**。
- FPSに直結する差は見られなかった。過去のrAF/CSS合成負荷調査とも整合する。**新方式をデフォルトONにはしない**。
- 過去の不安定な初回run [#40531505978](https://github.com/8mahi8/shokoku-sensen/actions/runs/40531505978) は4条件の画素一致を確認した後、`page.screenshot()`が12秒タイムアウトした。画像撮影を除き、JSで各画素を直接照合する方式に変えて再計測した。
- 測定用のコミット： [20bcb60](https://github.com/8mahi8/shokoku-sensen/commit/20bcb602d086673a928d0bbd5d380834d744e1d6)、[f66715e](https://github.com/8mahi8/shokoku-sensen/commit/f66715ea156799cb695701ecec6c2ffc52eb189a)。実験スクリプトとCI workflowは履歴から再取得可能。通常の開発ブランチでは削除して余計な分岐・保守負担を残さない。

## 全8条件の計測（数値は Canvas JS描画部分のみ・単位ms）
各カメラとシーンにつき4測定ブロック×24描画。表示とシミュレーションが同じ1タスクで、新規Chrome/WebKitブラウザページから測定した。あくまでも headless CI であり、学校iPad SafariのFPSではない。

| エンジン | シーン | カメラ要求x | 従来方式・平均 | 切り出し・平均 | 画素差 |
| --- | --- | ---: | ---: | ---: | ---: |
| WebKit 1194x834 | 14体通常 | 300 | 5.075 | 4.948 | 0 |
| WebKit 1194x834 | 14体通常 | 980 | 3.990 | 4.043 | 0 |
| WebKit 1194x834 | 20体混戦 | 300 | 5.315 | 5.253 | 0 |
| WebKit 1194x834 | 20体混戦 | 980 | 5.200 | 5.170 | 0 |
| Chromium 900x520 | 14体通常 | 300 | 0.853 | 0.978 | 0 |
| Chromium 900x520 | 14体通常 | 980 | 0.673 | 0.670 | 0 |
| Chromium 900x520 | 20体混戦 | 300 | 0.850 | 0.835 | 0 |
| Chromium 900x520 | 20体混戦 | 980 | 0.788 | 0.788 | 0 |

- WebKit 4条件平均では従来4.895ms、切り出し4.854ms。全体差約0.04ms程度で、改善が明確とは言えない。
- Chromiumのほとんどは誤差範囲、14体通常のカメラx300ではむしろ遅い観測。
- **切り出しを有効化すれば滑らかになるという根拠はない。** Canvasに渡すソース矩形変更よりも、今後は実iPadでの瞬間rAF停止時に、Firebase受信・反映・HUD/描画・WebKit合成のどれが連動していたかを区別する。旧HUD無効化や単純CSS削除を再試験しない。
- [Canvas drawImage の9引数仕様](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage) を利用。ピクセル一致の試験は実験コードの見た目の安全性を確認したもので、性能効果の証明ではない。

## 保護・保存
- 通常コードの `online-game.js`、`online-ipad.html`、`online-embed.html`、`guest-lab-game.html` は実験直前のGit blobへ戻し、通常画面の描画分岐は増やさない。
- Google Sites学校公開版、GitHub `main`、Firebase Rules、本番データは変更なし。Google Driveにも保存なし（本人の明示指示時のみ）。
