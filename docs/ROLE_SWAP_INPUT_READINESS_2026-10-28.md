# 小国戦線III｜役割交代直後の手動召喚QA（2026-10-28）

## 未合格の検証
[PR #22 head 367a1c7](https://github.com/8mahi8/shokoku-sensen/commit/367a1c704931149f8884732b2ed7ada7db3dae76) に対する [実Firebase2ブラウザ #40551740458](https://github.com/8mahi8/shokoku-sensen/actions/runs/40551740458) は3条件中2条件合格。Chromium/WebKit・録画なし条件だけ、端末の役割交代直後の赤軍手動召喚で23秒間、兵士出現を観測できずFAIL。失敗ログはFirebaseの状態番号が進行し、UIは後でbattleになり、ゲストのコマンド/フィードバックが空であることを示す。テストルーム3部屋の削除は確認された。

## 具体的な競合仮説
ゲーム `resetForLobby` は`S.phase="menu"`にした時点で`#overlay`を隠す。Firebaseの`meta.status="playing"`を処理した`canSendCommand=true`と、独立した`state`の初回`apply`で`S.phase="prep"`になる時点は異なる。旧ブラウザテストは`#overlay.hidden`と`canSendCommand`だけでカードをクリックしていた。その瞬間がmenuなら`cardDown`は意図的に入力を無視する。元の失敗時点でカード選択直後の`S.selected`を測定していないため、これは**有力な説明仮説、断定ではない**。

## 最小修正・合格条件
ゲーム本体・オンライン通信プロトコルは変更せず、テストだけ修正。
1. 赤軍ゲストについて **S.phaseがprep/battle・初回適用seqが正・canSendCommandが真** となるのを条件付きで待つ（単純なsleep延長・無条件リトライではない）。
2. 本物のPlaywrightクリックで歩兵を選び、`selected="infantry"` とカード選択CSSを直後に確認する。
3. 座標1130,405の実画面上のタップ先が`canvas#field`に到達することを`elementFromPoint`で確認する。
4. そのあと現行通りFirebaseへの正規コマンド送信→新ホストの公開→元ホストのゲストへの反映を必ず検査。失敗なら段階別でFAILと原因を記録する。

外部資料：[Playwright auto-waiting](https://playwright.dev/docs/actionability)・[Playwright best practices](https://playwright.dev/docs/best-practices)。要素がクリック可能かと、複数の非同期通信コールバックを経たゲーム内部の操作準備が完了したかは別条件。

## 限界と運用
これはQAの競合状態調査・修正。実機のカクつきや召喚不良が解消したとの証明ではない。次の3条件実Firebase CI結果を確認し、失敗が残れば本体とUIを追加調査。Google Sites公開版、main、Firebase rules、Driveは変更しない。
