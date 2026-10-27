# 小国戦線III｜砦HUDの不要DOM更新を削減（2026-10-28）

## 対象
開発PR #22の `online-game.js` と、同一エンジンを内包する `online-ipad.html`・`online-embed.html`・`guest-lab-game.html`。学校の既存Google Sites版、GitHub main、Firebaseルールは対象外。

## 根拠
- DOM/CSSレイアウトがアニメーションに影響する可能性：[MDN Critical rendering path](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Critical_rendering_path)
- 画面直前でのDOM変更のバッチ化および不要なスタイル変更を抑える：[Mozilla Performance best practices](https://firefox-source-docs.mozilla.org/performance/bestpractices.html)
- 既存の `docs/PERFORMANCE_EVIDENCE.md` にあるHUD停止、Canvas非表示、肖像PNG、CSS filter検証は繰り返さない。

## 今回の最小修正
1. `updateFortNavigation` 内の `nav.hidden=` を実際の表示/非表示が変わる場合に限定。
2. 砦3箇所×4種類の `classList.toggle(force)` を、既存の差分更新用 `putHudFlag` に置き換え。砦占領/争奪/脅威の表示仕様は不変。
3. 期限切れの告知表示についても不要な `classList.remove("visible")` を繰り返さない。

## 回帰テスト
`tests/online-smoke.cjs` へDOMモデル実行テストを追加。表示安定中の20回更新でDOM変更0、争奪中の20回更新でDOM変更0、砦所有者変更と脅威更新、メニューで表示を隠す、再表示までを確認する。

## 評価の限界
これは意味のないDOM属性変更を減らす最適化であり、**ゲストの実機カクつきが解決した証明ではない**。Linux CI WebKitのFPSは学校iPadのFPSではない。次に同じHTML・2端末・役割交代で目視と入力応答を比較する。
