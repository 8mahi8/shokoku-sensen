# 小国戦線 — キャラ制作パイプライン v1.0（次世代ChatGPT必読）

**目的**：チャット交代後のAIが、ガルドの制作手法を根拠付きで再現し、別キャラでも同じ品質基準に到達できるようにする。本文より現行GitHub実コードを優先すること。プロトタイプの一時ファイルは正本ではない。

## 正本と依存関係
- AGENTS.md → この文書 → characters/gald/character.json → gald-source.html → gald-render.js → v3-art.js → v3.js → index.html → README.md の順に読む。
- gald-source.html：B-04横向きSVGリグ。window.GOLEM_TEST.state / render / setMode / ankle / ik / keyframe が操作入口。
- gald-render.js：v4.2で66枚を**ブラウザ内で非同期生成**してキャッシュする実装。新素材完成まで旧guardianを表示するフォールバック。
- v3-art.js：guard­ianだけ window.GaldArt に委譲。カード・図鑑の肖像も委譲する。失敗時は既存Canvasを使う。
- v3.js：ゲームの移動・判定・攻撃の唯一の正本。絵の制作では勝手に変更しない。
- characters/gald/character.json：ガルドのクロップ範囲・アトラス・原点・状態枚数。characters/_template/character.json：次キャラの入力雛形。
- tools/characters/export_atlas.py / qa_rig.py：制作時の再現可能な書き出しとQA。静的WebPの本番配信は現行と異なるため自動切替しない。

## 過去の失敗と避けるべき判断
1. 画像生成で毎コマ別ポーズを作った：装甲と身体の形が変わり、動きが不自然。
2. 完成絵を後から腕脚へ切り出した：隠れている関節面が欠け、継ぎ目が崩れる。
3. 正面キャラに横向きの歩行・パンチを適用した：「滑らかだが気持ち悪い」。向きと動作の矛盾が原因。
4. 技術指標（関節が繋がる、足が固定、JSエラー0）だけで合格とした：人間／生き物／機械らしい自然さを見落とした。
5. 装飾の足し算で完成度を上げようとした：小画面で見づらくなる。**引き算の美学**を守る。

## 1体ごとの必須工程
A. **設計票**：template JSONをコピー。役割、体格、横向き（左右反転の基準）、移動様式、攻撃の機構、シルエットの主役3つ、削る装飾、ゲーム表示想定サイズ、QA条件を書く。ガルドの値を他キャラに丸ごとコピーしない。

B. **シルエット**：最低2～3案を小さなゲーム表示で比較。黒一色でも識別可能か。巨大拳・肩の塊・小さい横顔はガルドの固有デザインで、ほかのキャラには流用しない。

C. **立ち絵からリグを設計**：右向き基準のSVGで前後レイヤー、隠れた面、肩肘手首／股膝足の関節を設ける。正面で横に殴る設計は禁止。描き込みは三段階の陰影と限られた発光が基本。細部追加の前に削る候補を探す。

D. **キー姿勢（補間前）**：待機、歩行両脚の接地、攻撃の構え、溜め、着弾、反動、被弾、撃破を並べる。静止画でおかしければコードの補間に進まない。

E. **運動設計**：二足なら支持脚・遊脚の接地周期＋腰の体重移動＋IK。パンチは地面を踏ん張り、腰を引き、上半身をひねって拳を標的へ伸ばし、自然に戻る。遠距離は狙い・反動、車両はキャタピラ等、飛行はホバリングなど各自の運動にする。

F. **独立ブラウザ試作**：原画とリグを操作可能なHTMLにし、キー姿勢→連続再生→ループつなぎ→縮小ゲームサイズの順に確認。PC、スマホ、学校iPad想定のサイズで見る。美観がおかしい場合はQA合格でも不採用。

G. **スプライト化**：SVGで同じ身体を描画して透過コマへ。manifestの states の順で並べ、crop、frame_width/height、anchorを統一。最初に数コマだけ輸出して確認し、完成後に全コマ輸出。巨大なSVGの毎フレーム実行は避ける。キャッシュ／Atlasを使う。

H. **本編導入**：各キャラ専用描画アダプターで battle state を**読むだけ**。idle(clock)、移動(walking/walkPhase)、攻撃(attackAnim/Max)、hit(hitAt)、death(deathProgress)、spawn(spawnAt/Duration)をマッピング。攻撃ダメージの発生時刻は fire() を変更しない。描画成功ならtrue、失敗ならfalseでフォールバックする方式を参考にする。敵側は左右反転と陣営色を確認。カード／図鑑も確認。

I. **統合ゲート**：主要ポーズを静止画＋連続で再生し、視覚的に自然か人間目線で再判定。密集戦、複数同時、敵味方、初回ロード、キャッシュ失敗、低負荷端末、HPバー、カメラ端を検証。実機で未確認ならその旨を正直に書く。仕様変更なしなら固定シードの比較で両城HP・決着時間・勝敗が一致するか確認する。

J. **引き継ぎ**：採用後、source HTML・adapter・manifest・QAメモをGitHubにコミットし、README・本ファイル更新。新チャットは「前回やったはず」ではなく実ファイルから再現する。

## ガルドB-04の具体的基準
- ソース：gald-source.html、設計名 bastion、基準向き right。
- 66フレーム = idle8 / walk18 / punch22 / hit8 / death10、横8列。
- atlas: 330x372 pxのセル。920x620 viewから x240,y0,w550,h620 で切り出し。アンカー (105,292.8)。ゲーム表示約201x227 px（変更時は実装確認）。
- 攻撃中は両足の世界座標が動かない構造。3種類のズームで0.1px以内の接地ずれを確認した旧QAがある。動きの自然さは別途目視審査する。
- v4.2のランタイムはhidden iframeによる非同期の66フレーム生成。初回素材が未準備でも旧guardianが表示される。オフラインWebPの生成はQA用途で、本番への読み込み方法と混同しない。

## 実行コマンド
前提：Python3、pip install playwright pillow、python -m playwright install chromium。
- python tools/characters/export_atlas.py --spec characters/gald/character.json --output /tmp/gald-atlas --limit 2 （最初の2枚だけ。QA用不完全書き出し）
- python tools/characters/export_atlas.py --spec characters/gald/character.json --output /tmp/gald-atlas （全66枚）
- python tools/characters/qa_rig.py --spec characters/gald/character.json --output /tmp/gald-poses （静止画／支持脚／モバイル検証）
Chromiumの場所が必要なら --chromium /path/to/chromium、リポジトリ起点でない場合は --root /repo/root を付ける。PNG/WebPを見た目で検査した上で更新する。

## 「テンプレ化済み」の範囲と次の検証
これは**作り方、JSON契約、書き出し、QA、実装接続の標準化**である。未知の体格にも自動的にハイクオリティなキャラを量産できる魔法のツールではない。次はガルドと大きく異なる歩兵または射手を1体、同じ手順で制作・独立試遊し、失敗を通じてテンプレを磨く。全8兵種を一括生成・無検証で本番へ入れることは禁止。