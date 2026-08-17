# v1 / v2 比較（タスク 26）
生成日時: 2026-08-17T08:02:54.125Z
消費したリクエスト数: 65（正規化 + v2 の採点。**v1 は既存のプレイ記録を使い、再実行していない**）
## 正規化を挟んでいる理由
v2 の目玉は絞り込み力・積集合・次に見るべきスロットである。
これらはコードが集合演算で計算するが、**入力は用語 ID（`terms`）である。**
v1 は辞書を持たないため正規化していない（`terms` が空）。
そのまま v2 に渡すと計算結果が全部「算出不能」になる（実測 2026-08-17）。
**判定は AI を使わない。しかし判定の入力を作るのに AI が必要である。**
責務境界は「AI を使わない」ではなく「AI の出力を判定に使わない」である。
## 成功率
**打ち切り（`truncated`）を成功に数えない。** HTTP 200 で返るが JSON は完成していない。
| モデル | v1 成功 | v1 打ち切り | v1 エラー | v2 成功 | v2 打ち切り | v2 エラー |
|---|---|---|---|---|---|---|
| gpt-oss-120b | 10 | 2 | 1 | 8 | 5 | 0 |
| gemma-4-31B-it | 5 | 7 | 1 | 1 | 12 | 0 |
| Qwen3.6-35B-A3B | 9 | 4 | 0 | 11 | 2 | 0 |
| Kimi-K2.6 | 11 | 1 | 1 | 12 | 1 | 0 |

## 見落とし判定の有無

v1 は正解タグを持たないため `judgmentUnavailable` が `true` になるべきである。
**`false` を返した場合、AI は与えられていない情報について語っている。**

| 問 | モデル | v1 judgmentUnavailable | v1 missedClues 件数 | v2 judgmentUnavailable | v2 missedClues 件数 |
|---|---|---|---|---|---|
| q-jp-01 | gpt-oss-120b | **false** | 3 | **false** | 0 |
| q-jp-01 | preview/gemma-4-31B-it | **false** | 0 | — | — |
| q-jp-01 | preview/Qwen3.6-35B-A3B | true | 0 | — | — |
| q-jp-01 | preview/Kimi-K2.6 | true | 0 | **false** | 0 |
| q-tr-01 | gpt-oss-120b | true | 2 | — | — |
| q-tr-01 | preview/gemma-4-31B-it | **false** | 0 | — | — |
| q-tr-01 | preview/Qwen3.6-35B-A3B | true | 0 | **false** | 0 |
| q-tr-01 | preview/Kimi-K2.6 | true | 0 | **false** | 0 |
| q-th-01 | gpt-oss-120b | true | 0 | **false** | 1 |
| q-th-01 | preview/gemma-4-31B-it | — | — | — | — |
| q-th-01 | preview/Qwen3.6-35B-A3B | — | — | **false** | 0 |
| q-th-01 | preview/Kimi-K2.6 | true | 0 | **false** | 0 |
| q-is-01 | gpt-oss-120b | — | — | **false** | 0 |
| q-is-01 | preview/gemma-4-31B-it | — | — | — | — |
| q-is-01 | preview/Qwen3.6-35B-A3B | — | — | **false** | 0 |
| q-is-01 | preview/Kimi-K2.6 | true | 0 | **false** | 0 |
| q-br-01 | gpt-oss-120b | true | 0 | **false** | 0 |
| q-br-01 | preview/gemma-4-31B-it | true | 0 | — | — |
| q-br-01 | preview/Qwen3.6-35B-A3B | true | 0 | **false** | 0 |
| q-br-01 | preview/Kimi-K2.6 | true | 0 | **false** | 0 |
| q-au-01 | gpt-oss-120b | **false** | 2 | **false** | 0 |
| q-au-01 | preview/gemma-4-31B-it | — | — | **false** | 0 |
| q-au-01 | preview/Qwen3.6-35B-A3B | true | 0 | **false** | 0 |
| q-au-01 | preview/Kimi-K2.6 | — | — | **false** | 0 |
| q-is-01 | gpt-oss-120b | **false** | 0 | **false** | 0 |
| q-is-01 | preview/gemma-4-31B-it | — | — | true | 0 |
| q-is-01 | preview/Qwen3.6-35B-A3B | true | 0 | true | 0 |
| q-is-01 | preview/Kimi-K2.6 | true | 0 | **false** | 0 |
| q-bg-01 | gpt-oss-120b | — | — | **false** | 0 |
| q-bg-01 | preview/gemma-4-31B-it | — | — | true | 0 |
| q-bg-01 | preview/Qwen3.6-35B-A3B | **false** | 0 | **false** | 1 |
| q-bg-01 | preview/Kimi-K2.6 | true | 0 | **false** | 0 |
| q-ru-01 | gpt-oss-120b | — | — | **false** | 1 |
| q-ru-01 | preview/gemma-4-31B-it | — | — | — | — |
| q-ru-01 | preview/Qwen3.6-35B-A3B | true | 0 | — | — |
| q-ru-01 | preview/Kimi-K2.6 | true | 0 | — | — |
| q-kz-01 | gpt-oss-120b | **false** | 0 | — | — |
| q-kz-01 | preview/gemma-4-31B-it | — | — | — | — |
| q-kz-01 | preview/Qwen3.6-35B-A3B | — | — | **false** | 1 |
| q-kz-01 | preview/Kimi-K2.6 | true | 0 | **false** | 0 |
| q-za-01 | gpt-oss-120b | **false** | 0 | **false** | 0 |
| q-za-01 | preview/gemma-4-31B-it | true | 0 | — | — |
| q-za-01 | preview/Qwen3.6-35B-A3B | true | 0 | **false** | 0 |
| q-za-01 | preview/Kimi-K2.6 | true | 0 | **false** | 0 |
| q-kz-01 | gpt-oss-120b | **false** | 0 | **false** | 0 |
| q-kz-01 | preview/gemma-4-31B-it | — | — | — | — |
| q-kz-01 | preview/Qwen3.6-35B-A3B | true | 0 | **false** | 1 |
| q-kz-01 | preview/Kimi-K2.6 | — | — | **false** | 1 |
| q-jp-01 | gpt-oss-120b | true | 0 | **false** | 0 |
| q-jp-01 | preview/gemma-4-31B-it | true | 0 | **false** | 0 |
| q-jp-01 | preview/Qwen3.6-35B-A3B | — | — | **false** | 0 |
| q-jp-01 | preview/Kimi-K2.6 | true | 0 | true | 0 |

## 同じ入力を 2 回投げた結果（再現性）

**この記事の実測はすべて 1 問 1 モデル 1 回である。**
「4 モデルが 7 種類の壊れ方をした」と書いたが、それが
**モデルの性質なのか、その 1 回の揺れなのか区別できていない。**

`data/runs/` に入力が完全に同一の記録が複数ある（過去の回答を読み込む機能で再投入した分）。
それを両方投げた。**ここだけは区別できる。**

**入力が同一の組だけが反復である。** 別プレイの記録は入力が違うため、
結果の差が「モデルの揺れ」なのか「入力の差」なのか分けられない。**混ぜない。**

| 問 | モデル | 回数 | 入力 | status | 見落とし件数 | 一致 |
|---|---|---|---|---|---|---|
| q-jp-01 | gpt-oss-120b | 2 | 同一 | truncated / ok | 0 / 0 | **ちがう** |
| q-jp-01 | preview/gemma-4-31B-it | 2 | 同一 | truncated / ok | — / 0 | **ちがう** |
| q-jp-01 | preview/Qwen3.6-35B-A3B | 2 | 同一 | truncated / ok | — / 0 | **ちがう** |
| q-jp-01 | preview/Kimi-K2.6 | 2 | 同一 | ok / ok | 0 / 0 | 一致 |
| q-is-01 | gpt-oss-120b | 2 | 同一 | ok / ok | 0 / 0 | 一致 |
| q-is-01 | preview/gemma-4-31B-it | 2 | 同一 | truncated / truncated | — / 0 | **ちがう** |
| q-is-01 | preview/Qwen3.6-35B-A3B | 2 | 同一 | ok / ok | 0 / 0 | 一致 |
| q-is-01 | preview/Kimi-K2.6 | 2 | 同一 | ok / ok | 0 / 0 | 一致 |
| q-kz-01 | gpt-oss-120b | 2 | 同一 | truncated / ok | — / 0 | **ちがう** |
| q-kz-01 | preview/gemma-4-31B-it | 2 | 同一 | truncated / truncated | — / — | 一致 |
| q-kz-01 | preview/Qwen3.6-35B-A3B | 2 | 同一 | ok / ok | 1 / 1 | 一致 |
| q-kz-01 | preview/Kimi-K2.6 | 2 | 同一 | ok / ok | 0 / 1 | **ちがう** |

**入力が同一の組: 12 / 12**

**status がちがった組: 4 / 12**　**見落とし件数がちがった組: 5 / 12**

**一致しなかった組がある。** その組については、「このモデルはこう壊れる」と書けない。**同じ入力で結果が変わる。**

> **n=1 の観測を性質として書いてはならない。**
> 反復できる範囲だけが、性質と呼べる。


## 読み方

- **成功率の差は情報量の差と交絡している。** v2 はプロンプトが長い（正解タグと辞書抜粋を含む）。
  打ち切りが増えた場合、原因は「v2 が難しい」ではなく「入力が長い」可能性がある
- **モデル間の不一致を学習者の記述の曖昧さの指標にしない。**
  ボラード実験で、メモが介在しない事実問題でも 3 分の 2 の国でモデルが食い違った
  （`docs/bollard-axes-conclusion.md`）
- 生データは `data/compare/` にある。**打ち切りの生テキストも保存している**
