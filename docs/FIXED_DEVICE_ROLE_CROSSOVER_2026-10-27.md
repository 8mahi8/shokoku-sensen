# 実Firebase固定端末ホスト／ゲスト交代検証（2026-10-27）

## なぜ新しいテストか
- 既存の[性能実験台帳](PERFORMANCE_EVIDENCE.md)にはChromium host/WebKit guestとWebKit host/WebKit guestの比較があるが、**同じ端末・タブを実対戦の途中で逆の役割にする**ケースは未確認だった。
- 学校で「ゲストだけ時々激しくカクつく」という本人報告を受け、ブラウザエンジン・端末・役割の相関を可能な限り分離する。
- [WebKit Timelines](https://webkit.org/web-inspector/timelines-tab/)のFrame viewと、[MDN rAF](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)の考え方に従い、フレーム間隔をJSの描画時間やネットワーク受信頻度と混同しない。CI環境はLinux/WebKit、学校iPad Safariと同一ではない。

## 新テスト
既存 `tests/online-browser-live.cjs` の7ラウンド／6再戦／ブラウザ切断復帰／別のBOTルーム／短いカクつき診断を削らず、最後に固定タブ2枚で次の手順を追加。
1. 旧ゲストのタブがルーム作成を行い新たな青ホストへ。旧ホストのタブは5桁ルームへ参加して赤ゲストへ。2つのロールと別々のclientIdを実Firebaseのpresence・画面APIで照合。
2. 双方ready→新ホストstart。旧ホスト・新ゲストの端末で赤軍カードを手動タップして召喚する。Firebaseに赤軍ユニットが作られ、赤ゲスト側で承認されたseqまで受信適用することを検証。
3. 入替後の新ホストで合法なカードから同じ14体のstandard戦場を構築。新ゲストはそのRTDB世界を反映し、双方フレームの例外なし・戦闘表示継続を確認。
4. 元のstandard戦場と同じ2つのタブでFPS/rAF p95を報告する。ただしブラウザの音声・映像・CPU条件差があるため、CI FPSの差を「ゲストの方が遅い」の証明としない。
5. 両端末が正常退出し、全**3つ**の一時Firebaseテストルームは`finally`で完全削除・`null`をGET検証する。実ユーザーのルームには一切触れない。

## 採否条件
- 録画ありChromium/WebKit・録画なしChromium/WebKit・同一WebKitの3条件で全て完走し、新たな`REAL FIREBASE FIXED-DEVICE ROLE CROSSOVER`行を確認。
- そのうえで学校iPad2台の端末交換を最終検証とする。ユーザーが求める操作の簡単さや描画品質は落とさない。
- GitHub開発ブランチ／Draft PRだけ変更。**学校Google Sites公開版・main・Firebase security rules・Google Driveは変更しない。**
