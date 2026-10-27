# WebKitホスト送信間隔の突発停止検証｜2026-10-27

## 新規実測
- [fixed-device role swap CI #40520614077](https://github.com/8mahi8/shokoku-sensen/actions/runs/40520614077) で、Chromium host/WebKit guest の録画有り／無しは新しいロール入替までSUCCESS、1.5sの同じ端末ベンチは「Chromiumホスト59.9FPS→ゲスト59.9FPS、WebKitゲスト10.3FPS→ホスト10.4FPS」。**同じPCヘッドレス環境での役割差は小さい**。学校iPadとは異なる。
- 同一WebKit/WebKitの条件は**入替に到達する前の既存オフライン試験**で失敗。一時的なゲストネットワーク切断時、ホストRTDB seqは2.2秒間の前半で進んだが、次の1.5秒では進まなかった。テストは`AssertionError: host keeps advancing while guest connection stays cut`。実ゲームの300秒BOT試験が通ることと矛盾しない。headless WebKitで一時的なrAF停止/送信待ちがあった可能性がある。**ネットワーク断か表示処理か原因未確定**。
- リアルな障害を無かったことにしないため、次に同じ現象が出た場合、host SDK `syncDiagnostics`、直近32 rAFギャップ、描画エラー、RTDB seqを出す。その後**最大6秒まで再開を確認**し、復帰しなければFAIL。復帰した場合も「一時停止発生」として必ずログに残す。
- これはテスト自身のログと短い限界付き復旧監視だけ。ホストtick、Firebase送信間隔、Canvas品質、ゲームロジックには変更なし。
- Role crossoverの描画情報に`quality()`（低FPS描画間引き、DPR、計測済み）を付加し、単純なFPS数字で特定の原因を断定しない。
- **学校Google Sites・GitHub main・Firebase security rules・Google Drive保存版は不変。**
