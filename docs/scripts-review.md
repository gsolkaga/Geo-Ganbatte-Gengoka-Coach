# `scripts` の不一致 目視確認シート

`docs/countries-disagreement.md` の `scripts` 不一致 35 件を、判断の性質で分類したもの。
確認できたものを `data/countries-overrides.json` の `overrides` / `verified` に転記する。

## 判断の基準

**その国に存在するかではなく、Street View のカバレッジに写るかで決める。**

道路標識と看板に実際に現れる文字体系だけを採る。公用語の制度上の地位、
歴史的に使われていた文字、観光地の一部にしかない併記は含めない。

とくに `latin` の併記を採るかどうかが割れやすい。
**幹線道路の案内標識に定常的にラテン文字が出るなら採る。** 出ないなら採らない。

---

## A. 空配列起因（12 件・再取得待ち）

`preview/Kimi-K2.6` が `scripts: []` を返したために不一致になっていたもの。
batch01 と batch07 を再取得すれば解消する見込み。**再取得後に再判定する。**

```
NO SE FI IS DK IE   （batch01）
LT GR CY RU KZ KG   （batch07）
```

`KZ` は既に確認済み（`[cyrillic, latin]`）。
`GR` `CY` は下記 C にも該当するため、再取得後も残る可能性がある。

---

## B. 明白な誤答が混じるもの（6 件・即断できる）

多数決は正しい。**誤答したモデルを記録することが目的。**

| 国 | 採用値（案） | 誤答 | 内容 |
|---|---|---|---|
| `JP` 日本 | `[japanese_kana_kanji, latin]` | `Kimi-K2.6` | `[korean_hangul, latin]` |
| `KR` 韓国 | `[korean_hangul, latin]` | `gpt-oss-120b` | `[hebrew, latin]` |
| `RS` セルビア | `[cyrillic, latin]` | `gemma-4-31B-it` | `[cyrillic, sinhala]` |
| `MN` モンゴル | `[cyrillic]` | `gemma-4-31B-it` | `[cyrillic, sinhala]` |
| `JO` ヨルダン | `[arabic, latin]`? | `Kimi-K2.6` | `[hebrew, latin]` |
| `MY` マレーシア | `[latin]` | `Kimi-K2.6` | `[arabic, japanese_kana_kanji, latin, tamil]` |

**採点用に選定した `gpt-oss-120b` が韓国をヘブライ文字と答えている。**
`traffic_side` のオーストラリア誤答と同じ構図で、記事に使える。

`gemma-4-31B-it` はセルビアとモンゴルの両方に `sinhala` を混ぜている。
2 件とも同じ誤りであり、単発の事故ではない。

`JO` は `latin` の併記を採るかどうかで下記 C の判断も必要。

---

## C. `latin` 併記の有無で割れるもの（11 件）

**GeoGuessr の実務上ここが一番効く。** ラテン文字が併記されるかどうかで、
「読めない文字だけの国」と「英語も出る国」が分かれる。

| 国 | `latin` を採る | 採らない | 確認 | 採用値 |
|---|---|---|---|---|
| `QA` カタール | `Kimi` `gemma` | `gpt-oss` `Qwen` | | |
| `AE` UAE | `Kimi` `Qwen` `gemma` | `gpt-oss` | | |
| `OM` オマーン | `Kimi` `gemma` | `gpt-oss` `Qwen` | | |
| `LB` レバノン | `gpt-oss` `Kimi` `gemma` | `Qwen` | | |
| `TH` タイ | `Kimi` `Qwen` `gemma` | `gpt-oss` | | |
| `KH` カンボジア | `Kimi` `Qwen` `gemma` | `gpt-oss` | | |
| `GR` ギリシャ | `gemma` | `gpt-oss` `Qwen` | | |
| `CY` キプロス | 全モデル | — | | |
| `GE` ジョージア | `gemma` | `gpt-oss` `Kimi` `Qwen` | | |
| `TW` 台湾 | `gpt-oss` `Kimi` `Qwen` | `gemma` | | |
| `SG` シンガポール | 全モデル | — | | |

`CY` は `[greek, latin]` で全モデル一致しているが、Kimi の空配列で不一致判定になっている。
再取得で解消する。

`SG` は `latin` では一致し、**中国語の字体で対立**している。

```
gpt-oss  = chinese_traditional  ← 誤りの疑い
Kimi     = chinese_simplified
Qwen     = latin のみ
gemma    = latin のみ
```

`TW` は逆に `chinese_traditional` で全モデル一致しており、`latin` の有無だけが問題。

---

## D. キリル文字とラテン文字の併記（5 件）

旧ユーゴと中央アジア。**制度上は併記だが、標識に実際に出るかは国ごとに違う。**

| 国 | `[cyrillic, latin]` | `[latin]` のみ | `[cyrillic]` のみ | 採用値 |
|---|---|---|---|---|
| `BA` ボスニア | `gpt-oss` `Kimi` `gemma` | `Qwen` | | |
| `ME` モンテネグロ | `gpt-oss` | `Kimi` `Qwen` `gemma` | | |
| `XK` コソボ | `gpt-oss` `Kimi` `gemma` | `Qwen` | | |
| `MK` 北マケドニア | `Kimi` | | `gpt-oss` `Qwen` `gemma` | |
| `UZ` ウズベキスタン | `gpt-oss` `Kimi` `gemma` | `Qwen` | | |

`XK` コソボにキリル文字を入れると、`scripts` による絞り込みでセルビアと混同しやすくなる。
**「キリル文字が見えた」でコソボが候補に残るのが妥当かどうかを判断する。**

`ME` モンテネグロは `gpt-oss` だけが `[cyrillic, latin]` で、他 3 モデルが `[latin]`。
多数決とは逆の可能性があるため要確認。

---

## E. 多言語国の粒度（3 件）

| 国 | 内容 |
|---|---|
| `IN` インド | `Qwen` が `[arabic, bengali, devanagari, greek, latin, sinhala, tamil, tibetan]` の 8 種。`greek` は明白な誤り。他 3 モデルは `[devanagari, latin]`（+ `other`）|
| `LK` スリランカ | `Qwen` のみ `tamil` を落として `[latin, sinhala]`。他 3 モデルは `[latin, sinhala, tamil]` |
| `IL` イスラエル | `arabic` `hebrew` `latin` の 3 種の組み合わせで 3 通りに割れた |

`IN` は enum の副作用が見える例である。**選択肢を 20 個与えると、盛る方向に外れる。**
`traffic_side`（2 値）では起きなかった失敗の型。

---

## 記事に使える論点

- **enum にしたから比較できた。** 自由記述の `languages` は 102 件全部が不一致で採用値を作れなかった
- **enum にしたから盛れた。** `IN` の 8 種は選択肢を与えたことによる過剰生成である
- **採点用に選んだ `gpt-oss-120b` が韓国をヘブライ文字と答えた。** モデル選定は速度で決めていた
- **`gemma-4-31B-it` はセルビアとモンゴルの両方に `sinhala` を混ぜた。** 同一の誤りが 2 件
- **不一致 35 件のうち 12 件は空配列起因**で、モデルの知識の問題ではなくスキーマ設計の問題だった
