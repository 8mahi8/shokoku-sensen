# 小国戦線III — FORTRESS FRONT｜開発引き継ぎ（2026-10-24）

## まず必ず守ること

- 目的：**学校のiPad（Safari）、Google SitesのHTML/CSS/JS直接埋め込み**で友達と1vs1対戦する際、**ホストとゲストの動作・表示・戦闘ルールを極力一致**させること。Firebase Realtime Databaseは現行のまま使う。無料運用を厳守。
- **Google Sites版＝ユーザーが実際に貼り付けている「再戦修正版」**。現在の開発版とは別。最新コードがGitHubに存在する、あるいはGoogle Driveに保存されたことを理由にGoogle Sites版が更新されたと思わないこと。**ユーザーが貼り替えたと報告したときのみ**Google Sites版を更新済みと扱う。GitHub上からサイトの実物HTMLが完全に同一かは検証していない。
- **開発版＝`perf/online-guest-snapshot-diagnostics-20261020`**。開発はこのブランチのみ。mainや学校で稼働中のGoogle Sites版は勝手に変更しない。PR #22、GitHub: https://github.com/8mahi8/shokoku-sensen
- ユーザーの「任した／任せた」は、調査・実装・テストまで自律的に進める許可であり、**学校への公開指示ではない**。
- ユーザーは**操作遅延にあまり困っておらず、主にゲスト側エネルギーの溜まり方・戦場同期と公平性**が気になっている。通信方式のP2P全面移行、フル二重戦闘計算、ログ収集・リプレイなどは不要。小さく正確な改善を優先。
- 学校iPadはApple製。古いことだけを理由に低性能と決めつけない。ヘッドレスWebKitのFPS数値は実iPadの計測値ではない。身内専用ゲームなので過剰な運用機能や安全作業を増やさない。

## 現状：実装済み（未公開）

1. **「次の＋1エネルギー」チャージUI**：以前の秒数表示から進捗ゲージへ変更。Google Sites版には未反映。
2. **ゲストのエネルギー表示補間**：最新のホスト確定値から回復を**最大350msだけ**先読みして、次の整数値が正式に確定するまでは未到達表示にする。**実際にカードを使えるかは確定済み `S.energy` のみ**。Firebase停止・復旧で同期し、ホスト側のゲーム計算は不変。
3. **ホスト／ゲスト間の公平性修正**：赤軍占領兵だけBOT難易度に左右されていた進軍先を共通化。赤軍カード使用後の選択状態残存を修正。ゲストの通信切断時入力／失敗通知を改善。基地・城壁・召喚ラインの自軍・敵軍ラベルを自分の陣営に相対化。
4. **ホスト試合時計の限定改善**：`requestAnimationFrame`で取り込む経過時間の上限を90→150msに。戦闘は**30Hz固定、最大5tick/フレーム**の安全弁維持。従来の10FPS時に理論上ゲーム時間が約10%遅れるケースを軽減するが、低FPS時に負荷が増え得るので実機判断が必要。
5. **QA**：ゲスト1台テスト用`guest-lab.html`、実Firebase2ブラウザー`tests/online-browser-live.cjs`、`tests/online-guest-lab.cjs`、基本／画面／HUD試験を維持。テストでは使い捨てFirebaseルームを消去。WebKitの受信凍結試験に`localhost?qa=1`専用`freezeGuestWorld`を設け、SDK・REST・描画待ちをすべて凍結可能とした（本番の通信回復は変更しない）。CIのブラウザーセットアップを最小化した。

## 最新結果：観測と注意

- **最終ゲームロジックに対応するCI**：[実Firebase2ブラウザー #39965647443](https://github.com/8mahi8/shokoku-sensen/actions/runs/39965647443)、[ゲストラボ #39965647419](https://github.com/8mahi8/shokoku-sensen/actions/runs/39965647419)、[基本 #39965647426](https://github.com/8mahi8/shokoku-sensen/actions/runs/39965647426)、[iPad画面 #39965647445](https://github.com/8mahi8/shokoku-sensen/actions/runs/39965647445)、[戦闘視覚 #39965647546](https://github.com/8mahi8/shokoku-sensen/actions/runs/39965647546) は成功。
- [同一WebKit HUD診断 #39965647433](https://github.com/8mahi8/shokoku-sensen/actions/runs/39965647433) はキャンセル（**成功扱いしない**）。その前のHUD診断 #39961366690 は成功。もし完全なCI合格を示すならキャンセル分を別途確認。
- **エネルギー使用可能タイミングの実Firebaseテスト**：Chromiumゲストでは約75ms、WebKitゲストでは約174msの遅れを1回ずつ観測。学校iPadの実測・保証値ではない。操作命令のエンドツーエンド遅延測定でもない。測定方法と結果は`docs/HOST_GUEST_TIMING_PROBE_2026-10-23.md`。
- 旧版のCIでキャンセルになったものや、テストスクリプトの誤りがあったものは、修正後の結果と区別。**実機Safariでの体感やホスト端末負荷の実測は未完**。

## 次チャットがやること

1. この文書に加えて、次の資料とブランチの最新コミットを読み、ユーザーに現在の**Google Sites版／開発版**を区別して報告する。
2. **テスト状態を正確に確認**。まずキャンセルされたHUD診断の扱いと、最新版とCI成功時SHAの差を確認。テストだけのために不要な連続実行をしない。
3. ホストの時計変更(90→150ms)により、低FPS実機・混戦での戦闘負荷やスキップが悪化しないか検証。現時点では設計上の改善であり、実機合格は未宣言。
4. ゲストのエネルギー使用判定は約75～174msという短時間観測の範囲では全面的な先読み権限が不要に見える。正式コストを勝手に先払い可能にしない。必要ならカード使用境界の分布を複数試験し、現行Firebaseのまま改善。
5. 問題がなければ**ユーザーの指示があった時**、最新版のGoogle Sitesに直接貼る単体HTMLを渡す（ZIPより**そのままコピーできる.txt / HTML**を優先）。ユーザーが実際に貼り替えた報告をした時点でGoogle Sites版名を更新。
6. 将来アイデア：**初期手札マリガン**（別々のシャッフルは維持、最大2枚・1回交換が候補）、ただし未実装・未確定。ユーザーは今は通信／公平性の方を優先。

## 根拠となる資料／コード

- ゲーム・通信本体：`online-game.js`, `online-net.js`。単体埋め込み：`online-ipad.html`, `online-embed.html`。ゲスト1台実験：`guest-lab.html`, `guest-lab-game.html`。実Firebaseテスト：`tests/online-guest-lab.cjs`, `tests/online-browser-live.cjs`。スモーク：`tests/online-smoke.cjs`。
- `docs/HOST_GUEST_RULE_PARITY_AUDIT_2026-10-23.md` — 不公平箇所の調査
- `docs/HOST_GUEST_PARITY_FIXES_2026-10-23.md` — AI／カード選択／通知／陣営ラベル修正
- `docs/GUEST_ENERGY_DISPLAY_2026-10-23.md` — チャージ表示先読み仕様
- `docs/HOST_GUEST_TIMING_PROBE_2026-10-23.md` — エネルギータイミング実測
- `docs/HOST_CLOCK_BOUNDED_RECOVERY_2026-10-23.md` — ゲーム時計改善
- `docs/GUEST_ENERGY_HUD_WEBKIT_QA_FREEZE_2026-10-23.md` — WebKitでのQA受信停止と本番復旧の分離

## 最重要の認識

**学校のGoogle Sitesで公開中のゲームは「再戦修正版」。開発ブランチの最新版はまだ学校に貼り替えていない。** ユーザーからの公開完了通知までは絶対に混同しない。

## 追補：2026-10-24 夜 — CI環境修復とホスト時計回帰

- 開発ブランチ最新のゲーム本体は、2026-10-23の実Firebase試験成功時SHA `834e9babb...` から**変更していない**。その後は資料、追加回帰テスト、CIワークフローのみ更新。Google Sites実公開版は引き続きユーザー申告の「再戦修正版」で、勝手に更新していない。
- `tests/online-smoke.cjs` に、**実`tick(dt)`、`rate()`、ホストフレームの固定ステップ部**を抽出した決定的QAを追加（[commit 9c1073a](https://github.com/8mahi8/shokoku-sensen/commit/9c1073af7bd93f8a5e0416de91360626d1e6bd59)、記述のエスケープ誤りは後続commitで修正）。60/30/15/10/8FPS相当で20秒分のゲーム時間・青赤エネルギーが一致し、5FPS相当では約15秒で頭打ちになることをチェック。移動はunitStepスタブなので**混戦実機性能を証明しない**。
- キャンセルされたHUD #39965647433の再実行はWebKitセットアップで失敗。原因はGitHub Actions `ubuntu-latest` がUbuntu 26.04になりPlaywright 1.56.1が対応していないこと。GitHubの[2026-09-17移行告知](https://github.blog/changelog/2026-09-17-ubuntu-26-generally-available-and-latest-migration/)に沿い、Playwright利用7ワークフローを`ubuntu-24.04`に固定し、回帰テスト誤記を修正した（[commit 9a192f6](https://github.com/8mahi8/shokoku-sensen/commit/9a192f650d1715313cc010b3cb98d5f33bd84c43)）。
- 新ゲストラボ #40090916913はChromium・WebKit双方合格。コスト2の確定エネルギー到達差は今回**Chromium約143ms / WebKit約146ms**（各1回、25ms間隔観測。入力命令遅延・実iPad測定ではない）。ゲージの350ms上限・受信再開も合格。
- 新HUD診断 #40090916893、スモーク #40090916965、iPad画面 #40090916883は合格。以下は追補作成時の全CI状態で、未完了分を成功扱いしない。

- One-shot online two-browser live QA: **queued** ([run #40090916863](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916863))
- Online battle visual review: **in_progress** ([run #40090916872](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916872))
- School guest history A/B: **in_progress** ([run #40090916870](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916870))
- Online same-page WebKit perf QA: **in_progress** ([run #40090916941](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916941))
- Online 1v1 smoke: **success** ([run #40090916965](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916965))
- Online iPad UI visual QA: **success** ([run #40090916883](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916883))
- One-device guest lab browser QA: **success** ([run #40090916913](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916913))
- Online matched HUD WebKit diagnostic: **success** ([run #40090916893](https://github.com/8mahi8/shokoku-sensen/actions/runs/40090916893))

- PR #22 はDraftのままで説明を更新済み。**学校iPad実機のホスト／ゲスト交代、混戦、エネルギー使用の体感試験がなお必要**。main、Google Sites、Firebase Rules／データに触れない。不要な再試験や大規模改修をせず、証拠があれば最小修正で対応。


## 追補：同日さらに実施したホスト時計WebKit A/B
- 以前「実行中」と書いた`9a192f65...`対応の8系統のGitHub Actionsは全件**success**となった。証跡: [HOST_CLOCK_WEBKIT_AB_2026-10-24.md](HOST_CLOCK_WEBKIT_AB_2026-10-24.md)。
- [90ms対150ms実ゲーム時計のABBA実験](../tests/online-host-clock-cap-ab.cjs)をQA専用に追加し、WebKit性能CI [#40091681407](https://github.com/8mahi8/shokoku-sensen/actions/runs/40091681407)で検証。学校用実HTML・戦闘本体・Firebase通信は未変更。
- 旧CIログではheadless WebKitの10部隊戦闘で通常約11fps、大型部隊入り約8〜9fps、ゲームロジックのJS処理平均はフレーム当たり0.5ms未満。rAFや描画側の制約が強いが、これを実iPad性能と同一視しない。
- **ABBA実験の具体的結果・合否はCIジョブログとアーティファクトで確認してから追記すること。** 実機の前に大規模改修や90msへの勝手な巻き戻しはしない。
- [90/150ms WebKit ABBA #40091681407](https://github.com/8mahi8/shokoku-sensen/actions/runs/40091681407) は3ステップすべて**成功**。大型部隊を含む10体戦闘のヘッドレスWebKitでは、90ms上限の時計進行率約0.83倍・平均9.55fpsに対し、150msでは約1.05倍・平均8.81fps（各2試行の平均、短時間で測定のゆらぎを含む）。通常部隊は両条件約1.02倍・約11.5fps。青赤エネルギー増分は全測定で一致。ゲーム本体未変更。150msを維持し学校実機で採否を判断。詳細: [比較報告](HOST_CLOCK_WEBKIT_AB_2026-10-24.md)。

## 追補：2026-10-24 — ゲスト演出時計の入室時再基準化
- `S.clock`はロビー中もフレームごとに進むが、ホストの新対戦開始では`resetWorld()`が時計を0へ戻す。以前のゲスト`apply()`は`Math.max(localClock,remoteClock)`で古いロビー時刻を保持するため、ホスト基準の`hitAt`/`spawnAt`を使うアニメーションが初期から終了扱いになるリスクをコード監査で特定。実機での発生頻度は未測定。
- `online-game.js`、`online-ipad.html`、`online-embed.html`、`guest-lab-game.html`で**新しい準備/戦闘への入室時のみホスト時計へ再同期**。対戦中は引き続き既存の巻き戻し防止。ホスト権威のゲーム時計、エネルギー、命令処理、Firebaseデータは不変。[commit d685b1e](https://github.com/8mahi8/shokoku-sensen/commit/d685b1e029325b4df0156a4ab01015e588a8d969)。
- テストは現行実行コードの時計分岐を抽出して初回入室・途中参加・再戦・準備/戦闘中の遅延・進行を検証。`guest-lab-game.html`は専用ロジックを含むため完全一致チェックから除外し、同修正個所の存在を検証する。[スモーク #40094854291 success](https://github.com/8mahi8/shokoku-sensen/actions/runs/40094854291)。初回スモーク失敗 #40094818128 はテストの専用HTML完全一致誤認で、後続コミット`d942a3e`で修正。
- [専用資料](GUEST_VISUAL_CLOCK_JOIN_2026-10-24.md)。実Firebaseブラウザー／ゲストラボ／HUD／画面／戦闘描画CIは別途確認し、未完了分をsuccess扱いしない。
- **学校Google Sites版はまだ「再戦修正版」。本更新を学校へ貼ったことにしない。** 実機ではゲストがロビー20〜30秒待ってから開始し、登場・被弾演出とエネルギーの体感差を確認してほしい。

## 追補：2026-10-24 — 学校実機試験の準備完了
- **Google Sites直接埋め込み用の最新版単体HTMLを、Google Driveの新しい生`.txt`ファイルとして保存済み**: [Shokoku_III_学校実機テスト用_GoogleSites貼付_20261024.txt](https://drive.google.com/file/d/12fab0-6CMdgyHkYXxln3mjCr4jZQAN5F/view)。
- この`.txt`は開発ブランチの`online-ipad.html`の内容そのもの。**Google Driveから実際に読み戻したUTF-8原文がGitHubと完全一致**。Git blob SHA `62ccf4687cda818a881d5695c71d4324c61bfc6f`、原文319353バイト、UTF-16コード単位311486。Google Docsを経由すると行間や一部空白が変換されるため、差分を補正して原本と完全一致を検証してから生テキストとして保存した。途中の変換用Google Docは削除。
- 新しい視覚時計修正に対応したCI: [smoke #40094854291](https://github.com/8mahi8/shokoku-sensen/actions/runs/40094854291)、[実Firebase2ブラウザ #40094817981](https://github.com/8mahi8/shokoku-sensen/actions/runs/40094817981)、[Chromium/WebKitゲストラボ #40094817963](https://github.com/8mahi8/shokoku-sensen/actions/runs/40094817963)、[iPad UI #40094818011](https://github.com/8mahi8/shokoku-sensen/actions/runs/40094818011)、[戦闘描画 #40094818023](https://github.com/8mahi8/shokoku-sensen/actions/runs/40094818023)、[WebKit HUD #40094818006](https://github.com/8mahi8/shokoku-sensen/actions/runs/40094818006) はすべてsuccess。旧smoke #40094818128は失敗したが、テストのゲストラボ用コードの完全一致誤認を修正し、後続smoke成功済み。
- 次は本人が学校でGoogle Sitesを編集して**既存の埋め込みコードを新テキストに置き換え、Google Sites上で公開操作をする必要がある**。こちらではGoogle Sites、main、PR Draft、Firebase設定・ユーザールームは未変更。**本人が貼り替え完了と伝えるまでは学校公開版は「再戦修正版」のまま**。
- 学校での試験順: (1) 1vs1がルーム番号で接続するか、(2) ゲストが20〜30秒ロビー待機した後にホストが開始し両陣営の登場/攻撃/被弾エフェクトを確認、(3) 重い兵士を含む混戦のホスト/ゲスト描画差、(4) エネルギーが使えるタイミング、(5) 同室再戦、(6) ホスト/ゲストを交代して同条件を観察。危険な研究ログ・リプレイ・常設テレメトリは不要。


## 追補：2026-10-25 — ゲスト演出時計の長時間先行を抑制
- ホストが5FPSを20秒間継続すると、150ms/フレーム上限によってホストの試合時計が約15秒しか進まず、60FPSゲストが20秒進む従来コードは**演出時刻の先行5秒**を作る。極端な4FPSなら先行約8秒。実iPadでこのFPSが発生したとの主張ではない。
- [修正commit 7586deb](https://github.com/8mahi8/shokoku-sensen/commit/7586debfbec822f2c0fc54846632f7dcc9e728be)。ゲスト内部に最後のホストclockとパケット受信時刻のアンカーを保存し、最大250msの短いネットワーク見かけ経過を許容しつつ、先行150msから時計の進行速度を穏やかに減らす。**巻き戻しなし**。ホスト・メニュー・新規入室前は従来どおり。Firebase/worldパケット・30Hzホスト進行・資源・攻撃判定・BOTシステムは変更しない。
- `tests/online-smoke.cjs`の実本番関数抽出・20秒間、ホスト30/10/8/5/4FPS×ゲスト60FPSを検証。[smoke #40195144802](https://github.com/8mahi8/shokoku-sensen/actions/runs/40195144802) success。通常30/10/8FPSはほぼ等時、5/4FPSの条件でもゲスト演出時計最大先行0.55秒未満・単調増加を検証。QA側`tests/online-hud-matched-control.cjs`の注入箇所も合わせて更新。
- [詳細・留保](GUEST_CLOCK_LONG_STALL_2026-10-25.md)。実Firebase、Chromium/WebKit、描画、HUD、iPad画面CIはそれぞれ結果確認前に合格扱いしない。学校Google Sites版、10/24にDriveへ渡した試験用単体ファイルは固定のまま。PR #22はDraft。


## 追補：2026-10-25 — 同室再戦で軽量化の状態を引きずらない
- 旧`lowFpsCrowdedSprites=true`は同じSafariタブの**次の試合へ持ち越される**ことを特定。ロビー・結果画面でも解除されず、一度10FPSで重くなると再戦が60FPSでも6体以上でキャッシュ画質になり得た。
- `resetWorld()`に`resetCrowdedArtForMatch()`を追加。毎試合フルアニメーションで開始、重ければ再判定。画像タイルのメモリキャッシュ自体は再利用し、描画・攻撃・計算/通信は無変更。[修正commit 0ad4fb6](https://github.com/8mahi8/shokoku-sensen/commit/0ad4fb61add5d64b777c0ea19b38eee74c59e2db)。
- [Smoke #40196135401](https://github.com/8mahi8/shokoku-sensen/actions/runs/40196135401) success。実コード20秒以上の2回目60FPSシミュレーションと、再度低FPSに移行した場合のON再発動を検証。
- [実ブラウザーの再戦QA #40196269980](https://github.com/8mahi8/shokoku-sensen/actions/runs/40196269980) success。WebKit 10体戦闘→10体再戦で最初キャッシュ1体、2試合目は通常絵（キャッシュ0体）。70余りの絵の品質試験も通過。[詳細](ADAPTIVE_ART_ROUND_RESET_2026-10-25.md)。
- Google Sites版・10/24配布の単体HTMLは今も変更なし。PR #22はDraftでmainは変更しない。実Firebase全構成の最新検証は完了を確認するまで未合格扱い。

## 追補：2026-10-25 — 再戦時Canvas解像度とゲスト描画制限も再測定
- [修正commit 9c816df](https://github.com/8mahi8/shokoku-sensen/commit/9c816df75a8efebd58316e0fef14e0706571777a)：先行実装で低FPSキャラキャッシュのみ再戦時に初期化したが、DPR上限`tabletDprCap`、ゲスト低FPS表示間引き`guestLowPower`、`qualityMeasured`とFPS計測窓は前試合から残っていた問題を修正。
- `resetWorld()`で`resetAdaptiveCanvasForMatch()`を呼び、新しい試合に対し解像度上限1.45と通常描画ペースへ戻して品質判定をやり直す。前試合で解像度を下げた場合だけ必要な`fit()`を実行。画質が変わらない試合や起動時1px画面の余計なリサイズなし。重ければ約3.4秒後の従来の自動判定で再び制限する。ゲーム/通信/Firebaseデータは無変更。
- [smoke #40196922945](https://github.com/8mahi8/shokoku-sensen/actions/runs/40196922945) success。[WebKit実ブラウザー #40197002201](https://github.com/8mahi8/shokoku-sensen/actions/runs/40197002201) success：10体→10体再戦でCanvasの実描画幅1194→1731（DPR 1.0→1.45）、ゲスト画面間引き true→false、FPSカウンタとタイムスタンプゼロへ戻る。72ポーズ輪郭欠けゼロ。
- [詳細](CANVAS_QUALITY_REMATCH_2026-10-25.md)。学校Google Sites版と10/24にDriveへ渡した試験用HTMLは依然として変更していない。PR #22 Draft、mainにはマージしていない。最新実Firebaseや戦闘映像CIは個別の完了結果で確認する。
