# 検証の再現

さくらの AI Engine に対して行った検証と、その実測値。

> この文書は [README](../README.md) から切り出したものである。
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

## 実行方法

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
