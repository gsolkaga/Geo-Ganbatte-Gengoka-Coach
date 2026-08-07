# Geo-Ganbatte-Gengoka-Coach（GGG）

Street View 上の風景を見て、気づいた特徴を**言語化する**練習をし、その言語化の質を AI が採点・添削する学習アプリ。GeoGuessr の初級〜中級プレイヤーを対象とする。

**AI が画像を見て場所を当てるアプリではない。** 画像を見るのは人間であり、AI は人間が書いた観察メモを解釈・評価する役に限定している。

> **試す方へ。** 自分の API キーが必要で、誤った使い方をすると課金が発生する箇所がある。
> 動かす前に [試す人向け：資格情報と課金の境界](#試す人向け資格情報と課金の境界) を読むこと。
> **このアプリは認証を持たない。公開ホスティングしないこと。**

## 何を鍛えるのか

知識でも速度でもなく、**「何を見て、どう判断するか」の結合**を鍛える。

| | 鍛えるもの |
|---|---|
| このアプリ | 観察と判断の結合 |
| 実戦（NoMove 1 分など） | 速度 |

GeoGuessr のメタ知識は [Plonk It](https://www.plonkit.net/) に既に整理されている。足りないのは資料ではなく、**それを実戦で想起する訓練**である。

## 設計上の中心的な決定

**AI に何をさせないかを先に決めた。**

| 処理 | 担い手 |
|---|---|
| 素人語から正規用語への変換 | AI |
| スロット記述の正確性評価 | AI |
| 失敗モードの解説 | AI |
| 用語の解説 | AI |
| 見落としの検出 | コード（集合演算） |
| 回答国の正誤 | コード |
| メタの強さの算出 | コード |
| 組み合わせの絞り込み（積集合） | コード |
| 次に見るべき項目の算出 | コード |
| **画像認識** | **やらせない**（規約と学習効果の両方の理由） |
| **正解データの生成** | **やらせない**（下書きまで。確定は人間） |
| **embeddings / RAG** | **使わない**（無償プランでも課金対象） |

原則は 1 つ。**確実に判定できるものはコード、曖昧さの解釈が必要なものだけ AI。**

## Street View の扱い

- 画像データを保存・キャッシュしない（規約により禁止されている）
- 画像を AI へ送信しない
- **保存するのは pano ID と座標のみ**（pano ID は無期限の保存が許容されている）
- 表示は Maps Embed API の iframe（リクエスト無制限で無料）
- 著作権表記が Google 提供のパノラマのみを採用する（個人投稿のパノラマは権利者が投稿者）
- **このリポジトリに画像ファイルは 1 枚も含まれていない**

## 動作環境と起動

**このアプリはローカル実行専用として設計されている。**

| 項目 | 要件 |
|---|---|
| Node.js | 20 以上 |
| OS | Windows / macOS / Linux |
| ブラウザ | Chrome、Edge、Firefox、Safari の最新版 |
| ネットワーク | Google Maps Platform とさくらの AI Engine への到達性 |
| 待ち時間 | **採点 1 回に 20〜30 秒**（モデルによる。仕様である） |

```bash
npm install
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
# .env を編集して 3 本の鍵を設定する
npm run dev               # http://localhost:3000
```

```bash
npm test                  # 単体テスト（Vitest）
npm run typecheck         # 型検査（vue-tsc）
npm run build             # 本番ビルド
```

### 出題データを登録する

開発サーバを起動した状態で、座標と国コードを渡す。pano の解決と著作権表記の確認はサーバ側で行う。

```bash
node tools/add-question.mjs --country JP --lat 35.123 --lng 139.456 --difficulty 1
```

**座標は人間が選ぶ。** 有名観光地は個人投稿の全天球写真を拾いやすく、著作権表記が Google に
ならないため避ける。道路上の座標を選ぶ。**メタデータ照会は無料でクォータも消費しない**ので、
採用されるまで何度でも試してよい。

著作権表記が Google 以外だった場合は HTTP 422 で不採用となり、理由が
`data/pano-rejections.jsonl` に記録される。

### 同時実行数を測る

さくらの AI Engine の**同時実行数の上限は非公開である**（タイムアウトと同じ）。実測する。

```powershell
$env:SAKURA_AI_TOKEN = Read-Host "token"
node tools/measure-concurrency.mjs   # 4 リクエストを消費する
```

429 が返る、または並列で短縮されない場合、採点の複数モデル同時実行を直列に落とす必要がある。
判断材料は `docs/generated-concurrency/` に保存される。

初回の `npm install` で、Nuxt が匿名の利用統計への参加を尋ねる場合がある
（`Are you interested in participating?`）。

**これは Nuxt 自体の機能であり、本プロジェクトとは無関係である。どちらを選んでもよい。**
このリポジトリでは `nuxt.config.ts` に設定を書いておらず、**選択はあなたに委ねている。**

選択は `~/.nuxtrc` に記録され、次回以降は尋ねられない。後から変えられる。

```bash
npx nuxt telemetry enable     # 参加する
npx nuxt telemetry disable    # 参加しない
```

送信される内容は [Nuxt Telemetry](https://github.com/nuxt/telemetry) を参照。

検証スクリプトはアプリを起動せずに実行できる。

```powershell
$env:SAKURA_AI_TOKEN = Read-Host "token"
node scripts/run-country-table.mjs
```

**スクリプトは `.mjs` で書いている。** PowerShell の `.ps1` は日本語コメントで BOM の問題が出るため、
Node で統一した。`&&` は PowerShell で使えないので、コマンドを繋げる場合は `;` を使う。

### なぜローカル実行専用なのか

**このアプリを公開ホスティングしないこと。** 理由は 4 つある。

| 理由 | 内容 |
|---|---|
| **認証がない** | `POST /api/grade` `/api/normalize` `/api/draft` は誰でも呼べる |
| **他人が自分の枠を消費できる** | さくらの無償枠は月 3,000 リクエスト。1 回の採点で 1〜2 消費する |
| **Google のキーが消費される** | メタデータ照会は無料だが、キーへの制限が localhost 前提になっている |
| **教材データが編集されうる** | 管理モード（`/admin`）に認可がなく、正解タグを誰でも書き換えられる |

**個人が自分の学習のために自分のマシンで動かす、という前提の設計である。**
Nitro のサーバ API を通しているのは鍵をブラウザに出さないためであり、
マルチユーザを想定した設計ではない。

### それでも公開したい場合

最低限これだけは必要である。

1. **認証**を入れる（`/api/*` 全体と `/admin`）
2. **流量制限**を入れる。さくらの枠を守るため、利用者ごとの上限を設ける
3. **Google のキーの制限を張り替える。** リファラー制限を `localhost` から公開ドメインへ、
   サーバ用キーの IP 制限をホスト先の外向き IP へ
4. **`/admin` を無効化する**か、書き込み権限を分離する
5. さくらのトークンとキーを**本番用に作り直す。** ローカル用と共用しない
6. **画像を保存しない設計を崩していないことを再確認する**（`scripts` にも `server` にも
   画像取得エンドポイントを呼ぶコードがないこと）

さくらの枠を共有する形で公開すると、**枠が尽きた時点で全利用者に対して機能停止する。**
無償枠を前提にした公開サービスは成立しない。

## 試す人向け：資格情報と課金の境界

**このリポジトリを動かすには自分の資格情報が必要である。** 誤った使い方をすると課金が発生する箇所があるため、先に境界を示す。

### 必要な鍵は 3 本

| 鍵 | サービス | 露出 | 用途 |
|---|---|---|---|
| `SAKURA_AI_TOKEN` | さくらの AI Engine | **サーバのみ** | 正規化・採点・生成 |
| `GOOGLE_STREETVIEW_METADATA_KEY` | Google Maps Platform | **サーバのみ** | pano ID とメタデータの照会 |
| `NUXT_PUBLIC_GOOGLE_EMBED_KEY` | Google Maps Platform | **ブラウザに露出する** | Street View の表示 |

`.env.example` を `.env` にコピーして埋める。**`.env` はコミットされない**（`.gitignore` 済み）。

Google のキーを 1 本で兼用しないこと。3 本目は iframe の URL に載るため隠蔽できず、**制限を掛けることが唯一の防御**になる。

### 課金の境界

| 呼ぶもの | 課金 | 根拠 |
|---|---|---|
| Maps Embed API（`streetview` モード含む） | **無料・リクエスト無制限** | [Maps Embed API usage and billing](https://developers.google.com/maps/documentation/embed/usage-and-billing) |
| Street View Static API の**メタデータ照会** | **無料。クォータも消費しない** | [Street View Image Metadata](https://developers.google.com/maps/documentation/streetview/metadata) |
| Street View Static API の**画像取得** | **従量課金。パノラマ単位** | [Street View Static API usage and billing](https://developers.google.com/maps/documentation/streetview/usage-and-billing) |
| **Dynamic Street View**（NoMove 表示。**既定では無効**） | **Pro SKU。月 5,000 リクエストまで無料、超過は従量課金** | [料金カテゴリ](https://developers.google.com/maps/billing-and-pricing/pricing-categories) |
| さくらの AI Engine チャット補完 | 無償プランは月 3,000 リクエスト | 実測 |
| さくらの AI Engine の **RAG / embeddings** | **無償プランでも課金対象** | 公式マニュアル記載 |

**本アプリは画像取得エンドポイントを呼ばない。** 既定ではメタデータ照会と Embed の iframe だけで成立し、**課金経路が 1 つもない。**

### NoMove 表示だけが例外である（既定では無効）

Maps Embed API には**移動を止めるパラメータがない**（`pano` `location` `heading` `pitch` `fov` のみ）。
iframe の外側からクリックを止めることもできない。

これは利便性の問題ではない。**移動されると正解タグが無効になる。**
タグは pano ID に写っているものを記述しているため、学習者が別地点へ動くと
見落とし判定と過剰申告判定の両方が狂う。**採点の正しさに関わる。**

そこで Maps JavaScript API による NoMove 表示を用意したが、**既定では無効にしている。**

```
NUXT_PUBLIC_STREETVIEW_MODE=nomove
NUXT_PUBLIC_GOOGLE_MAPS_JS_KEY=...     # Embed 用のキーは流用できない
```

| | 移動 | 課金 |
|---|---|---|
| `embed`（**既定**） | できてしまう | **なし** |
| `nomove` | 止められる | **Pro SKU。月 5,000 リクエストまで無料** |

**既定にしないのは、課金経路を既定で作らないためである。** 有効化は利用者の判断に委ねる。

なお NoMove 表示では、`addressControl` と `showRoadLabels` を必ず `false` にしている。
**既定値のままだと住所と道路名が表示され、正解が漏れる。**

踏みやすい罠が 3 つある。

1. **Street View Static API は、メタデータしか使わなくても課金の有効化が必要である。**
   有効化された状態で画像取得エンドポイントを 1 行足すと、そこから課金が始まる。
   `server/` に画像取得のコードを書かないこと
2. **従来の月 200 ドルのクレジットは廃止され、SKU ごとの無料利用枠に置き換わっている**
   （[Google Maps Platform の料金変更](https://developers.google.com/maps/billing-and-pricing/faq)）。
   古い記事の「200 ドル分は無料」を前提にしないこと
3. **さくらは HTTP 504 でもリクエストを消費する**（実測）。リトライすると成功の保証なく枠が減る。
   本リポジトリのスクリプトは意図的にリトライしない

### Google のキー制限は必ず設定する

制限のないキーは、URL を見た third party が自由に使える。

**ブラウザ用キー（`NUXT_PUBLIC_GOOGLE_EMBED_KEY`）**

```
アプリケーションの制限 : ウェブサイト（HTTP リファラー）
                         http://localhost:3000/*
API の制限             : Maps Embed API のみ
```

**サーバ用キー（`GOOGLE_STREETVIEW_METADATA_KEY`）**

```
アプリケーションの制限 : IP アドレス（実行するマシンのグローバル IP）
API の制限             : Street View Static API のみ
```

トラブルシューティング。開発中に実際に踏んだもの。

| 症状 | 原因 |
|---|---|
| `This IP, site or mobile application is not authorized to use this API key`<br>`Request received from IP address ..., with empty referer` | ブラウザ用キーをサーバ側から呼んだ。リファラーが空になり、リファラー制限に弾かれる。**キーを取り違えている** |
| メタデータの `status` が `ZERO_RESULTS` | その座標に Google 撮影のパノラマがない。座標からの再解決を試みる |
| `copyright` が `© Henry Gonzalez` のように個人名 | **個人投稿の全天球写真である。** 権利者が投稿者なので教材に採用しない |

### スクリプトのリクエスト消費量

**枠を使い切らないよう、実行前に確認すること。** 無償プランは月 3,000 リクエストである。

| スクリプト | 概算 |
|---|---|
| `run-spec-generation.mjs` | 15（5 モデル × 3 回） |
| `run-country-table.mjs` | 最大 68（17 バッチ × 4 モデル） |
| `run-glossary.mjs` | 約 52（13 スロット × 4 モデル） |
| `run-glossary-variant.mjs` | 約 52 |
| `run-bollard-axes.mjs axes` | 4 |
| `run-bollard-axes.mjs matrix` | 最大 64（16 バッチ × 4 モデル） |
| `merge-country-table.mjs` / `analyze-bollard-axes.mjs` | **0**（AI を使わない） |

いずれも中断して再実行すれば未取得分のみが処理される。`MODELS` 配列を削ればモデル数を減らせる。

### やってはいけないこと

- **`.env` をコミットしない。** 誤ってコミットした場合、履歴から消してもキーは漏れたものとして扱い、失効させる
- **鍵をコードやスクリーンショットに含めない。** さくらのコントロールパネルを撮る場合、トークンが写る範囲を避ける
- **このアプリをそのまま公開ホスティングしない。** `POST /api/grade` `POST /api/normalize` `POST /api/draft` に
  **認証がない。** ローカル実行を前提とした設計である。公開すると第三者が自分のさくらの枠と Google のキーを
  自由に消費できる。公開する場合は認証と流量制限を追加すること
- **Street View の画像を保存・キャッシュするコードを足さない**（規約違反になる）

漏洩したときは、さくらはコントロールパネルでトークンを再発行、Google は Cloud Console でキーを削除して作り直す。**制限の設定は新しいキーに引き継がれない**ため、再設定が必要である。

### 自分のプレイ記録について

`data/runs/` と `data/usage.jsonl` には自分の観察メモと API 呼び出しの記録が残る。
フォークして使う場合、**これらをコミットすると自分の記述が公開される。** 不要なら `.gitignore` に追加する。

## ディレクトリ

```
.kiro/specs/geo-observation-coach/   要件・設計・タスク・補助文書
data/                                 教材データ、用語辞書、国定数テーブル、地域グループ
docs/                                 検証の要求文と生成結果（原文）
scripts/                              検証・生成スクリプト
app/                                  フロントエンド（Nuxt 4 / Vue 3）
server/                               API プロキシ（Nitro）
```

## 検証の再現

さくらの AI Engine に対して行った検証は、すべて再現可能な形で残している。

| スクリプト | 内容 |
|---|---|
| `scripts/run-spec-generation.mjs` | 同一の要求文を 5 モデル × 3 回に投げ、規約への言及を数える |
| `scripts/run-country-table.mjs` | 102 カ国 × 4 項目を 4 モデルに生成させる |
| `scripts/merge-country-table.mjs` | モデル間の不一致を検出し、人手訂正を適用する |
| `scripts/run-glossary.mjs` | 用語辞書を 13 スロット × 4 モデルで生成する |
| `scripts/run-glossary-variant.mjs` | プロンプト変更による対照実験 |
| `scripts/test-streaming.mjs` | ストリーミングでタイムアウトを回避できるかの検証 |
| `scripts/run-bollard-axes.mjs` | 属性軸を AI が発見できるか、与えれば埋められるかの検証 |
| `scripts/analyze-bollard-axes.mjs` | 属性行列から積集合を計算する（**AI を使わない**） |

要求文は `docs/requirement-prompt.txt` に**逐語で**置いている。生成結果は `docs/generated*/` に**要約せず原文のまま**保存している。

### 実行方法

```powershell
$env:SAKURA_AI_TOKEN = Read-Host "token"
node scripts/run-country-table.mjs
```

中断しても再実行すれば未取得分のみが処理される。

## さくらの AI Engine の実測（2026-08-07）

| 項目 | 実測 |
|---|---|
| エンドポイント | `https://api.ai.sakura.ad.jp/v1` |
| アカウントトークン | `<UUID>:<シークレット>` 形式のまま `Bearer` に渡す |
| 無償枠 | チャット補完 月 3,000 リクエスト |
| タイムアウト | **約 300 秒**（非公開。SLA 適用対象外） |
| ストリーミング | 初バイト 1.2 秒。**タイムアウトは回避できない** |
| HTTP 400 | **リクエスト数を消費しない** |
| HTTP 504 | リクエスト数を**消費する** |
| `response_format: json_schema` | `strict: true` が動作する |
| `minItems` | **配列ごとに指定が必要。入れ子に伝播しない** |

詳細は `.kiro/specs/geo-observation-coach/design.md` を参照。

## ライセンス

**コードとデータで異なる。**

| 対象 | ライセンス |
|---|---|
| コード（`scripts/` `app/` `server/` 設定ファイル） | [MIT](LICENSE) |
| データと文書のうち**人手記述**の部分 | [CC BY 4.0](LICENSE-DATA) |
| データと文書のうち**AI 生成**の部分（`docs/generated*/`） | **権利を主張しない**（CC0 相当） |

AI の出力は人間の創作的寄与を含まないため、著作権が発生しないものとして扱っている。
**自分が持っていない権利を許諾することはできない**ので、そこに CC BY を掛けていない。

由来はファイル単位で分離してある。`data/glossary-human.json` が人間、
`docs/generated-glossary/` が AI である。**混ぜていない。**

生成に使ったモデル（gemma-4 / gpt-oss-120b / Qwen3.6 / Kimi-K2.6）はいずれも
出力の再配布に条件の継承を課さない。根拠と各モデルの条件は [LICENSE-DATA](LICENSE-DATA) に記載した。

第三者の権利、商標、無保証の範囲は [NOTICE](NOTICE) を参照。

## 注意事項

- Plonk It の内容は**人手検証の一次情報源として参照するのみ**であり、このリポジトリのデータには取り込んでいない（© 2021-2026 Plonk It）
- `GeoGuessr` は GeoGuessr AB の商標である。本プロジェクトは非公式であり、関係はない
- 用語辞書と国定数テーブルは AI が生成したものを含む。`verifiedByHuman` が `false` の項目は**人手検証を経ていない**
- **モデル間の一致は正しさを保証しない。** 4 モデルのうち 3 モデルが同一の誤りをした実測がある（ガーナの走行車線）

## 名前の由来

**G**eo **G**anbatte **G**engoka Coach。`Gengoka`（言語化）が中核である。GeoGuessr の `GG`（Good Game / Good Guess）エモートと掛けている。
