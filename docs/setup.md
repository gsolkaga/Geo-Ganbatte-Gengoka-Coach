# 動かし方

動作環境、起動、出題データの登録、同時実行数の測り方。

> この文書は [README](../README.md) から切り出したものである。
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

## 出題データを登録する

開発サーバを起動した状態で、座標と国コードを渡す。pano の解決と著作権表記の確認はサーバ側で行う。

```bash
node tools/add-question.mjs --country JP --lat 35.123 --lng 139.456 --difficulty 1
```

**座標は人間が選ぶ。** 有名観光地は個人投稿の全天球写真を拾いやすく、著作権表記が Google に
ならないため避ける。道路上の座標を選ぶ。**メタデータ照会は無料でクォータも消費しない**ので、
採用されるまで何度でも試してよい。

著作権表記が Google 以外だった場合は HTTP 422 で不採用となり、理由が
`data/pano-rejections.jsonl` に記録される。

## 同時実行数を測る

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
