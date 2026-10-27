# 小国戦線III｜ゲスト初回戦況の適用完了まで入力UIを保護（2026-10-28）

## 根拠
Firebase meta.status=playingと独立したstate購読のgame.applyは同時とは限らない。metaが先行した直後は対戦画面が表示されながらS.phase=menuのままで、カードpointerdownが無視されることがある。以前の赤軍手動召喚失敗と整合する有力仮説だが当時のタップ直後の選択状態は記録されていないため、確定原因とはしない。

## 実装
`guestPlayableWorld()`はlastRemoteSeq>0かつgame.world().phaseがprep/battleと確認できた時にのみ真。ゲストでは初回有効戦況の反映までオンラインルームUIを維持し「戦況を同期しています…」を表示、反映後に隠す。meta先着・world先着と再戦・ルーム交代に対応。戦闘ルール、ホスト権威、Firebase送信周期/ルール・認証は一切変更しない。

`online-net.js`、Google Sites貼付用`online-ipad.html`/`online-embed.html`、開発用`guest-lab-game.html`のネットワークコードを同期。`tests/online-smoke.cjs`のVM packetテストハーネスを同期し、初回同期の状態遷移テストを追加。

## 外部資料
[Firebase Web Realtime Database listener](https://firebase.google.com/docs/database/web/read-and-write)・[Playwright auto-waiting](https://playwright.dev/docs/actionability)。要素がクリック可能であることと、ネットワークゲーム内部状態が操作可能になったことは異なる。

## 直前のQA
[CI run #40596696890](https://github.com/8mahi8/shokoku-sensen/actions/runs/40596696890)はChromium/WebKit録画あり・なし初回合格。WebKit同士は初回4ラウンド目heavyでLinux WebKitプロセスが終了したが、ジョブ再実行では7ラウンド・役割交代・赤軍の手動召喚2体・3部屋削除までSUCCESS。CI環境固有の断続的WebKitクラッシュは別課題で、学校iPadの不安定性を立証するものではない。

## 受入れ
本変更後のsmoke/iPad UI/実Firebase3構成を再確認する。実学校iPadのFPS/操作体感の改善は未測定。Google Sites公開版、GitHub main、Firebaseルール、Driveは変更しない。

## 完了した本体修正版の検証
- **最新版ゲーム/ネット変更** [3e29c41](https://github.com/8mahi8/shokoku-sensen/commit/3e29c41d7b785e75fb8b1b9169b8e5a639e5e655)。[smokeの検証範囲誤記のみ修正 9b3e33a](https://github.com/8mahi8/shokoku-sensen/commit/9b3e33a397c58dc67adcb61315c57c18f7cd1ecc) で **[smoke CI #40598804354](https://github.com/8mahi8/shokoku-sensen/actions/runs/40598804354) SUCCESS**。本体3e29の最初のsmoke失敗は、新規テストが`setupRoom`だけを切り出した後にその外の受信ハンドラーの行を探したアサーション範囲の誤り。製品JS例外ではない。
- **実Firebase2ブラウザ3/3条件SUCCESS** [run #40598712524](https://github.com/8mahi8/shokoku-sensen/actions/runs/40598712524)。録画あり Chromium/WebKit、録画なし Chromium/WebKit、録画なし同一WebKitがすべて完走。既存7ラウンド/6再戦・切断/復帰・BOTから手動・同一端末ロール交換・赤軍の実タップ召喚2体・新ホスト公開・ゲスト再反映・作成した一時部屋の清掃までPASS。
- **実Firebase BOTフル対戦SUCCESS** [run #40598712442](https://github.com/8mahi8/shokoku-sensen/actions/runs/40598712442)。ゲーム時間 **288.3秒で首都破壊決着**（時間切れ300秒ではない）、実時間298.9秒、青BOT31手・赤ゲストBOT44手、最大20兵士。ゲスト計測窓の最大rAF gap213ms、500ms以上0、JS pageerror0、ホスト再送0、テストルーム削除成功。実学校iPadのFPSとは一致しない。
- **他の成功したCI**：iPad UI [#40598712511](https://github.com/8mahi8/shokoku-sensen/actions/runs/40598712511)、WebKit/Chromiumゲストラボ [#40598712534](https://github.com/8mahi8/shokoku-sensen/actions/runs/40598712534)、戦闘ビジュアル [#40598712455](https://github.com/8mahi8/shokoku-sensen/actions/runs/40598712455)、WebKit HUD [#40598712484](https://github.com/8mahi8/shokoku-sensen/actions/runs/40598712484)、描画キャッシュ [#40598712440](https://github.com/8mahi8/shokoku-sensen/actions/runs/40598712440)。
- **実画像の確認**：本体版の上記iPad UI artifact と戦闘映像artifactから`online-ipad-ipad-landscape.png`、`online-ipad-sites-frame-compact.png`、`webkit-ipad-landscape-dense-t1-02-engaged.png`、`webkit-ipad-landscape-heavy-t1-02-engaged.png`、実Firebaseの`guest-battle-after-summons.png`を開いて目視。抜粋範囲でカード・HP・砦ナビ・大型キャラ・密集兵・ゲスト通信HUDの大きな表示崩れなし。全アニメフレームの正常性や学校端末での滑らかさは証明しない。
- **以前のWebKitプロセス異常**：新規修正前の [#40596696890](https://github.com/8mahi8/shokoku-sensen/actions/runs/40596696890) の同一WebKit初回ジョブは4ラウンド目にブラウザが閉じたが、ジョブ再試行は成功。本修正版では同一WebKitも一回で完走。Linux headless WebKitランナー固有の偶発要因の可能性が残り、実iPadへの一般化は禁止。

## 次の段階
これ以上、同じLinux headless WebKitのFPS測定や旧Canvas/HUD A/Bを繰り返さず、同じ新しいテスト用HTMLを学校iPad/Safari/Google Sitesテストページの2端末で動かす際に「初回の操作受付」「役割交代・再戦」「ゲストの単発カクつき」を観察する。体感の改善は実機で確認されるまで未確定。学校の既存公開版・main・Firebaseルール・Driveは一切更新していない。
