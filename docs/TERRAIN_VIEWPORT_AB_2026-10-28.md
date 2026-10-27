# Phase 1｜背景キャッシュの可視範囲描画をA/Bで評価（2026-10-28）

## なぜこの実験が新しいか
- 既存の `docs/PERFORMANCE_EVIDENCE.md` を精査。Canvas全停止・HUD削除・カード肖像・CSS filter・固定画像cacheの一部は既に検証済み。本件は **キャッシュ済み1280×660pxの地面を、カメラの可視部分だけ9引数drawImageで描く**個別の候補。従来実験の繰り返しではない。
- 画面全体のrAF間隔がCanvas関数の実行時間だけで決まらないことは確認済み。描画コスト削減がFPS改善へ直結すると主張しない。
- [MDN drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage) の9引数指定を使用。カメラ端のサンプリングを壊さないよう、2 world pxの余白を取る。画面外ユニットのカリングや動的な砦／召喚線には触れない。

## 非公開A/B試験
- `terrainViewportCropEnabled=false` が**初期値**、よって今回のコード段階では学校／通常の開発版の描画内容も性能も変わらない。
- localhost `?qa=1` に限って切替API追加。WebKit iPadサイズ1194×834／Chromium Sites 900×520、14体通常戦・20体混戦、両陣営カメラx=300/980の計8条件を試す。
- 各シーンでJavaScript 1タスクの間に既存描画と裁断描画の全Canvas画素を比較（UI/シミュレーションを止めず、比較処理中にrAFが割り込まない）。**ピクセル差0**を必須とする。
- ABBA/BAABで計8ブロック×各24描画、性能測定は`performance.now()`のCanvas JS部分のみ。録画とrAFを含まないため、出た数値を実iPad FPSと呼ばない。
- GitHub Actions workflow `Online terrain viewport A/B experiment` の完了を待ち、計測結果とスクリーンショットを確認してから、**改善が複数場面で再現した場合のみ本番の既定を変更**。効果が無い／画素ズレは実験を不採用とする。

## 保護
- ゲームの当たり判定・キャラ絵・Firebase通信・AI・描画順序・HUDは一切変更なし。
- Google Sites貼付済み版／main／Firebase Rulesは未変更。本人が明示指示するまでGoogle Driveに保存しない。
