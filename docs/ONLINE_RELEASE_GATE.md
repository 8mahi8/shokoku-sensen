# 小国戦線III — 公開前品質ゲート

目的: Google Sitesへ貼るHTMLやGitHub Pagesを、友達との実プレイで初めて壊れたと気づく事態を減らす。ゼロバグ保証ではなく、**よくある重大な故障を自動で公開前に止める**運用。

## 対象の実行環境
- ホスト: PC版HTML / Chromium。ゲーム計算とFirebaseへの戦況配信。
- ゲスト: 学校iPad Safari相当のWebKit、PC Chromium。
- Google Sites: `online-embed.html` の**全文をiframeのsrcdocに貼った状態**をChromium/WebKitで再現。実際のGoogle Sites本番の権限や学校ネットワークは再現できない。
- `online.html`, `online-ipad.html`, `online-embed.html` は共通の `online-game.js`/`online-net.js` と同じコードを持つこと。

## GitHub Actions

`Online release quality gate` には3つのジョブを用意する。

1. **Online gate / transport + bundle（通常の変更でも実行）**: JavaScript構文、貼り付け用HTMLのコード一致、独立カード抽選、送信失敗・受信停止・再戦の仮想通信テストを実行。
2. **Online gate / Sites iframe + combat（通常の変更でも実行）**: ChromiumとWebKitで実際のGoogle Sites貼り付け用HTMLをsandbox付きiframeで実行。BOT対戦開始、ゲーム時間の継続、ファイヤー、描画例外後の復旧に加え、高負荷・ゲストの空配列・古いスナップショットの回帰検証。
3. **Online gate / real Firebase 1v1（本番公開候補）**: `release/**` ブランチ、リポジトリ内からのmain宛PR、または手動実行。実Firebaseに一時的なテストルームを作成し、ChromiumホストとWebKitゲストで対戦、ファイヤー、意図的なゲスト受信停止・REST復帰をテストしてルームを削除。ルームの削除失敗も検証する。

同じブランチへの連続変更は古い実行をキャンセル。障害時のスクリーンショット・測定結果はActions Artifactsに保存（14日間）。

## 公開の受け入れ基準

- 同じ最終コミットで、上記3ジョブがすべて緑。失敗・未実行は未検証であり、`main` への統合を認めない。
- `online-embed.html` のゲーム/通信スクリプトが最新と一致。
- WebKit・Chromium上で `pageerror` がなく、ファイヤー直後と描画例外復帰後も試合時間が進む。
- ホストの戦況seq更新、ゲストの適用seq更新、実RTDBからの復帰、テスト用ルーム削除を確認。
- 必要ならiPad画面QA・BOT戦術・130体描画負荷などの既存テストも参照し、新しい機能に対応した追加回帰テストを作る。

## 推奨手順

1. 変更は `develop` または作業ブランチで実装。公開URLを変えない。
2. PR/CIで赤い項目を修正し、Google Sitesのiframeも含む品質ゲートを通す。
3. **公開候補 `release/vXX-...` を作る。** ブランチの最新コミットで3ジョブすべて成功させる。
4. ユーザーの承認を得てから `main` に統合。Google Pagesはmainのdeploy成功を確認。
5. Google Sitesは**コード直接貼付なら自動更新されない**。GitHub上の `online-embed.html` のコピーをGoogle Sitesへ貼り替え、サイトも再公開。
6. PC＋学校iPadで短い実機プレイ。通信条件と画質は端末・学校ネットワーク依存のため、これは残る最終確認。
7. 問題があれば直前の正常なGoogle Sitesコードへ戻す。原因と再発防止の検証を追加してから再公開。

## 制約・運用上の注意

- GitHub Actionsでテストを動かすだけでは、失敗時のマージを**技術的に禁止**できない。GitHubリポジトリのbranch ruleset / branch protectionで `Online gate / transport + bundle`、`Online gate / Sites iframe + combat`、`Online gate / real Firebase 1v1` をrequired status checksに設定できる場合は設定する。権限やプランの制約で設定できない場合、**担当者が緑を確認するまでmainへマージしない運用**とする。チェックの「skipped」を合格扱いしない。
- `pull_request` トリガーはベース側にワークフローが存在して初めて有効になる場合がある。初回は `release/**` へのpush結果を使って確認する。
- Firefoxや物理iPad、学校のWi-Fi、Google Sites本番のセキュリティ設定を完全再現できない。画面停止を常に検出できる保証はない。
- 実Firebase E2Eは一時テストルームの作成・削除を伴う。無料枠・処理時間を考え、開発中の毎コミットでは実行せず、リリース候補で実行する。
