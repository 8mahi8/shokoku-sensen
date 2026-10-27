# 小国戦線III｜ゲストの召喚タップに即時の「送信中」表示｜2026-10-27

## 背景
学校の実機ではゲストの大きな画面停止はかなり改善したが、まだ時々カクつく。以前は「兵士をうまく出せない」と感じる場面も報告されている。

既存コードの `playCard(team,id,x,y)` はゲストで `NET.sendCommand()` がローカル送信キューへ命令を積んだあと、手札選択表示だけは先に更新する一方、**戦場のタップ位置にはホスト応答まで何も描画しなかった**。ホストからのスナップショット到着には通信ラグがあり、画面が固まったと誤認しやすい。

外部資料:
- [web.dev: Interaction to Next Paint (INP)](https://web.dev/articles/inp/)（2025-09-02更新）：タップやクリックには次の描画で早いフィードバックが必要。実際の処理が完了するまで無反応に見せない。
- [web.dev: Understanding INP](https://web.dev/codelabs/understanding-inp)：イベント処理・メインスレッドブロック・描画までの遅れを区別する。余計なDOM再生成は避ける。

## 実装
- [a10bf4ca](https://github.com/8mahi8/shokoku-sensen/commit/a10bf4cad89b5a548e7dac1fc707066b4dc26168) で、**ゲスト側の手動操作が `NET.sendCommand()` に正常に渡った直後**にだけ、小さな水色のリングと「送信中」の文字をタップ地点へ表示。**召喚成功ではなくローカルで送信した意味**であり、ホストによる部隊配置・HP・コスト・判定を前借りしない。
- 表示は**650msで終了**、同時保持は最大4個。Canvasの既存戦闘描画と同じ座標系で行い、DOM要素・外部通信・Firebaseイベントを追加しない。毎試合 `resetWorld()` で初期化、メニュー・結果画面では表示しない。
- **送信できなかった場合（接続不良/不正範囲/資源不足）は描かない**。実際にホストが拒否した場合は既存のFirebase `feedback` と画面上のお知らせが対応。これらの権威システムには手を加えない。
- [23e011db](https://github.com/8mahi8/shokoku-sensen/commit/23e011db6b8eb5e78d256d739291617ab4ef415f) で `NET.guestBot` の自動操作中はヒントを出さず、**友達の手動タップ時だけ**出すよう限定。
- `online-game.js`／Google Sites埋込用 `online-ipad.html`／`online-embed.html`／開発ゲストラボ `guest-lab-game.html` のロジックは同期。公開Google Sites・main・Firebaseルールを変更せず、Draft PR #22のみ。

## 検証（実ブラウザ）
- [基本テスト #40494429266](https://github.com/8mahi8/shokoku-sensen/actions/runs/40494429266) **SUCCESS**。ゲストが正常送信した場合だけキュー表示、切断失敗時は表示しない。**最大4個・650ms経過で消滅・ホスト/ロビー/再戦で消去**、Canvas実描画呼び出し、HOST権威の位置への非介入をコード直接抽出テストで確認。
- [実Firebaseゲストラボ #40494607883](https://github.com/8mahi8/shokoku-sensen/actions/runs/40494607883) は **ChromiumとWebKitの2環境ともSUCCESS**。実際の`PointerEvent`でゲストの永久歩兵カードを選び、戦場の `x=1150,y=330` をタップ。送信ヒント出現と実際のCanvas描画を確認。その後、ホスト側に**正規の歩兵ユニット（uid 2）が生成**、ゲスト側にもそのユニットの反映を確認。タップ時のWebKitゲスト確認済エネルギー2.042、Chromium2.017で、資源の本体計算は完全にホスト側。
- 650ms後に手元のヒントが描画されなくなることも同実戦テスト内でASSERT。
- [開発版全描画/単体HTML整合性のCI](https://github.com/8mahi8/shokoku-sensen/actions)はコードHEAD別に自動起動。最終SHAの全CI合否を確認してから新学校版として採用する。

## 評価と制限
**入力への視覚応答を改善した**ことと、**通信往復遅延・ブラウザFPSを改善した**ことは別。今回の変更は後者を直接高速化するものではない。学校の実iPad Safari/Google Sites iframeでは未検証。次の実機比較で「送信中」リングが邪魔／分かりにくい場合は変更単位で取り消し可能。

本当の大きな画面停止対策は、前回のREST早期回復・描画キャッシュの負荷分散を保持しつつ、今後も通信/画面の映像で診断する。
