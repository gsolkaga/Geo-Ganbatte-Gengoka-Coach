# 資格情報と課金の境界

**動かす前に読むこと。** 鍵の要件、課金が発生する箇所、公開してはいけない理由。

> この文書は [README](../README.md) から切り出したものである。
## なぜローカル実行専用なのか

**このアプリを公開ホスティングしないこと。** 理由は 4 つある。

| 理由 | 内容 |
|---|---|
| **認証がない** | `POST /api/grade` `/api/normalize` `/api/draft` は誰でも呼べる |
| **他人が自分の枠を消費できる** | さくらの無償枠は月 3,000 リクエスト。1 回の採点で 1〜2 消費する |
| **Google のキーが消費される** | メタデータ照会は無料だが、キーへの制限が localhost 前提になっている |
| **教材データが編集されうる** | 編集モード（`/admin`）に認可がなく、**正解タグの書き換えと問題集の作り直しが誰でもできる** |

**個人が自分の学習のために自分のマシンで動かす、という前提の設計である。**
Nitro のサーバ API を通しているのは鍵をブラウザに出さないためであり、
マルチユーザを想定した設計ではない。

## それでも公開したい場合

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

## 必要な鍵は 3 本

| 鍵 | サービス | 露出 | 用途 |
|---|---|---|---|
| `SAKURA_AI_TOKEN` | さくらの AI Engine | **サーバのみ** | 正規化・採点・生成 |
| `GOOGLE_STREETVIEW_METADATA_KEY` | Google Maps Platform | **サーバのみ** | pano ID とメタデータの照会 |
| `NUXT_PUBLIC_GOOGLE_EMBED_KEY` | Google Maps Platform | **ブラウザに露出する** | Street View の表示 |

`.env.example` を `.env` にコピーして埋める。**`.env` はコミットされない**（`.gitignore` 済み）。

Google のキーを 1 本で兼用しないこと。3 本目は iframe の URL に載るため隠蔽できず、**制限を掛けることが唯一の防御**になる。

## 課金の境界

| 呼ぶもの | 課金 | 根拠 |
|---|---|---|
| Maps Embed API（`streetview` モード含む） | **無料・リクエスト無制限** | [Maps Embed API usage and billing](https://developers.google.com/maps/documentation/embed/usage-and-billing) |
| Street View Static API の**メタデータ照会** | **無料。クォータも消費しない** | [Street View Image Metadata](https://developers.google.com/maps/documentation/streetview/metadata) |
| Street View Static API の**画像取得** | **従量課金。パノラマ単位** | [Street View Static API usage and billing](https://developers.google.com/maps/documentation/streetview/usage-and-billing) |
| **Dynamic Street View**（NoMove 表示。**既定では無効**） | **Pro SKU。月 5,000 リクエストまで無料、超過は従量課金** | [料金カテゴリ](https://developers.google.com/maps/billing-and-pricing/pricing-categories) |
| さくらの AI Engine チャット補完 | 無償プランは月 3,000 リクエスト | 実測 |
| さくらの AI Engine の **RAG / embeddings** | **無償プランでも課金対象** | 公式マニュアル記載 |

**本アプリは画像取得エンドポイントを呼ばない。** 既定ではメタデータ照会と Embed の iframe だけで成立し、**課金経路が 1 つもない。**

## NoMove 表示だけが例外である（既定では無効）

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

## Google のキー制限は必ず設定する

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

## スクリプトのリクエスト消費量

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

## やってはいけないこと

- **`.env` をコミットしない。** 誤ってコミットした場合、履歴から消してもキーは漏れたものとして扱い、失効させる
- **鍵をコードやスクリーンショットに含めない。** さくらのコントロールパネルを撮る場合、トークンが写る範囲を避ける
- **このアプリをそのまま公開ホスティングしない。** `POST /api/grade` `POST /api/normalize` `POST /api/draft` に
  **認証がない。** ローカル実行を前提とした設計である。公開すると第三者が自分のさくらの枠と Google のキーを
  自由に消費できる。公開する場合は認証と流量制限を追加すること
- **Street View の画像を保存・キャッシュするコードを足さない**（規約違反になる）

漏洩したときは、さくらはコントロールパネルでトークンを再発行、Google は Cloud Console でキーを削除して作り直す。**制限の設定は新しいキーに引き継がれない**ため、再設定が必要である。

## 自分のプレイ記録について

`data/runs/` と `data/usage.jsonl` には自分の観察メモと API 呼び出しの記録が残る。
フォークして使う場合、**これらをコミットすると自分の記述が公開される。** 不要なら `.gitignore` に追加する。
