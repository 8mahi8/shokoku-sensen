# 小国戦線III｜デッキ構築・ロビー実装引継ぎ（2026-10-29）

## 状態

**開発ブランチで実装・自動テスト通過。学校Google Sites本番公開はしていない。**
本人の確定ルール：常設基本歩兵1種類＋選択した異なる10種類（重複不可）、対戦中は従来の手札4種類。新キャラ実装は後で行う。現在のカードプール10種類だけでは自由な入替はまだできず、11種類目以降の追加で実用的になる。

- Repository: https://github.com/8mahi8/shokoku-sensen
- Development branch: `perf/online-guest-snapshot-diagnostics-20261020` (Draft PR #22)
- 本文作成前のHEAD: `ddd9e4ee579ad08ec8ef2df16a6db206f645e3e1`
- **保護済み**：main `1972bbe974994b183e03c89d886af63bd3d94731`、学校安定版 `stable/school-ipad-20261028-99a0d1d` `99a0d1d0cc18a987aefe0ab99dc1f7993160fe25`。
- Google Sitesに貼ってある公開ゲーム・Google Driveの貼付けファイル・Firebase Rulesを変更していない。開発ブランチの`online-ipad.html`/`online-embed.html`は更新済みだが、**学校公開先には反映していない**。

## 1. 追加・更新したコード

| ファイル | 今回の役割 |
|---|---|
| `online-deck.js` | `ShokokuDeck` API。CATALOGから候補を生成、10種類一意・歩兵除外を検証、標準編成・破損保存の回復・Storage不可時フォールバック。独立デッキ編集UI、交換操作、詳細表示 |
| `online.html` | modular版に新モジュール読込＋ロビー編集入口＋デッキ専用オーバーレイ＋CSS |
| `online-ipad.html`・`online-embed.html` | 学校向け単体HTMLに最新`online-deck.js`・`online-net.js`・`online-game.js`をインライン同期。学校実際のGoogle Sitesは変更なし |
| `online-net.js` | RTDB `ROOM_VERSION=3`。各席のロビー提出デッキとREADYを`meta.deckLobby`に保持、開始時に10種類×2を検証して`meta.lockedDecks`に原子的確定。再戦時のラウンド更新・古いロック失効。BOT席の標準デッキ・ゲストBOT自動準備。RTDB初回トランザクションの空キャッシュと試合終了イベント遅延への対処 |
| `online-game.js` | 戦闘開始時だけホストの`NET.matchDecks`を使用。各軍の手札4＋待機6を独立シャッフルして設定。`S.activeDecks`で未採用IDを拒否。その他のユニットAI/HP/攻撃/通信描画は維持 |
| `tests/online-deck.cjs` | 無効なカード枚数・重複・歩兵・未知ID、新カード候補、保存破損、ストレージ遮断の試験 |
| `tests/online-deck-visual.cjs` | Chromium＋WebKit。編集画面の本物のCanvas画像、10/10表示、仮11枚目からの2タップ交換、保存復元、コンパクト横画面・縦画面 |
| `tests/online-deck-online-e2e.cjs` | disposable RTDB roomで実2ブラウザ接続→デッキ確定→対戦開始→終了→再戦→再準備→再開始。**終了後に試験ルームのみ削除** |
| `tests/online-smoke.cjs`・`tests/online-sim.cjs` | 新デッキ構造に対応する回帰試験の更新、単体HTMLとのコード完全一致確認 |

## 2. 実装詳細・重要な不変条件

- 選択可能なカードは`CATALOG`由来。除外は`infantry`または`deckEligible:false`。**新キャラ追加では戦闘AI/アート/学校HTMLの既存網羅試験が通ってから公開する**。デッキ編集UIに個別IDを追加する必要なし。
- `DeckValidator`に相当する`ShokokuDeck.validate`は、長さ10・一意・登録済み・歩兵なし。公式のカード定義とカード上限を改造しない。
- `ShokokuDeck.current()`はローカル下書き。READYを押すと`meta.deckLobby[seat]`に10 ID・seatId・round・revision・readyを提出。ロビーでREADY後は編集UIを閉じる。
- `meta`の一つのtransactionで両者の提出が有効なら`lockedDecks`を作成し、`status=playing`へ。ホストの`game.begin()`はロックデッキが有効でないと拒否。
- `S.activeDecks`は対戦用に一度確定して試合中維持。召喚可能カードの手札・待機列・残回数は従来どおり。基本歩兵は常設、既存の使用上限なども変更しない。
- ローカル保存は便利機能のみ。Google Sites iframe上のSafariで`localStorage`が使用不可でも10種類の標準編成を使う。ログインや保存権限付与は不要。
- 同じルームでの再戦は`round`を増やし、lockedDecksを失効させ、両者READYを解除（BOT席だけ自動READY）。直前デッキは下書きとして使える。
- **既存ROOM_VERSION=2のGoogle Sites公開ページとdev ROOM_VERSION=3は混在接続しない。** 旧版の本番を維持し、最新版の学校実機試験は公開切替前に両台を同版に揃える。
- 既存ネットワークの`players` presenceと`meta.deckLobby`は別ノードなので、座席取得自体は完全な単一transactionではない。開始時にseatId照合し、新旧端末差分と競合は個別検証。デッキのUI非公開をDB上の秘密保証とはみなさない。

## 3. 確認済みのテスト結果

1. **オンラインスモーク、ネット通信シミュレーション、37ケースの新AI、デッキルール**：全通過 https://github.com/8mahi8/shokoku-sensen/actions/runs/40838708597  （同期された両school HTMLを含む）。
2. **実Firebase・2ブラウザ10種類デッキ確定〜開始〜再戦〜再開始**：成功。RTDBの実ルームを作成し最後にDELETE成功（200）。https://github.com/8mahi8/shokoku-sensen/actions/runs/40838839786
3. **Chromium/WebKitデッキ編集画面**：10/10表示、未来の仮カード11種類目からの2タップ交換、保存復元、狭い横画面とスマホ縦画面の水平オーバーフローなしを両方で確認。https://github.com/8mahi8/shokoku-sensen/actions/runs/40838492527
4. **実FirebaseのChromiumホスト＋WebKitゲストBOT vs BOT試合完走**：成功。ゲスト操作、終了処理、途中の通信・Canvas診断を記録。https://github.com/8mahi8/shokoku-sensen/actions/runs/40837925064 （同コード系統の後続走行：40837936161も成功）。
5. **新AIブラウザ描画の退行検査**：成功 https://github.com/8mahi8/shokoku-sensen/actions/runs/40837925177
6. **旧One-shot 6ラウンド試験で一時的に再戦待機が残る症状があった**：https://github.com/8mahi8/shokoku-sensen/actions/runs/40837925058 で「round 2 lobby」待機エラー。終了イベントの到達前にrematchが押されることが疑われ、`online-net.js`のrematchで完了済みmetaを読み直す修正。**修正後の新しい専用RTDB再戦E2Eは成功**。6ラウンド長時間の全組合せ再実行は別ゲートで確認する（修正後の全6ラウンド成功は現時点では未主張）。

## 4. 次工程と残件

- 現在は候補10種類しかないので、デッキ変更が生きるのは11種類目以降。本人の「キャラ追加は後」を守り、新キャラ追加や能力調整には着手していない。
- 新キャラ追加時に**本当の11種類目**を使うQA：新カードの`deckEligible`／アート／攻撃演出／AI／学内単体HTML／BOTのID前提ロジック。BOTの全デッキ任意対応は未実装。
- 実機学校iPad Safari＋Google Sitesに貼った版で、編集UIのサイズ・タップと通信遅延を体感確認。現時点では**実機テスト未実施**。
- 既存の長時間6ラウンドの実FirebaseライブQAは後続走行を確認し、残りの競合があればdevのみで修正。main/stable/実Google Sitesには無断で反映しない。
- 全員が同じ新版を使う学校試遊のため、本人が貼付け版保存・公開を頼んだ時にのみ最新版ファイルをGoogle Driveへ保存する。

## 5. 外部資料

- Apple HIG Buttons（タップのヒット領域と押下状態）：https://developer.apple.com/jp/design/human-interface-guidelines/buttons
- Firebase RTDB transactional read/write（transactionの複数回呼出、null初期値、同位置set/updateとの競合）：https://firebase.google.com/docs/database/web/read-and-write
- MDN Storage Access（Safari/iframeのストレージ制約）：https://developer.mozilla.org/ja/docs/Web/API/Storage_Access_API

**現状：開発ブランチに機能実装済み、3系統の成功テストが揃ったが、学校公開・新キャラ追加は保留。**
