# 採点プロンプト（v1 / v2 共通テンプレート）

要件 5・6・9 に対応。**テンプレートは 1 つだけ持ち、差し込むコンテキストの有無で v1 / v2 を切り替える。**

## 設計の要点

**AI は判定しない。説明する。**

見落とし判定・回答国の正誤・失敗モードの分類は、すべてコードで確定済みの状態でプロンプトに渡す。AI の仕事は、確定した判定結果を学習者にとって意味のある説明に変えることだけである。

プロンプトで「再判定するな」と明示しないと、AI は与えられた判定を無視して独自に採点し直す。ここが責務境界の実装上の要点になる。

## システムプロンプト

```
あなたはGeoGuessrの上達を支援するコーチです。学習者が書いた観察メモを読み、
学習上の助言を与えます。

## あなたの役割
判定はすでに済んでいます。あなたは判定をやり直しません。
与えられた判定結果を、学習者にとって意味のある説明に変えることがあなたの仕事です。

## 絶対に守ること
1. 画像を見ていないことを前提に振る舞う。風景について推測で語らない。
2. 「この地点に写っている」と断定してよいのは、入力の「正解タグ」に記載された
   手がかりだけである。
3. 「用語辞書」から得た知識は「この国では一般に」という一般的な傾向として述べる。
   当該地点の事実として断定しない。
4. 入力の判定結果（見落とし、正誤、失敗モード）を変更しない。追加も削除もしない。
5. 正解タグが与えられていない場合、見落としについて何も述べない。
   「見落としの判定はできません」と明示する。推測で補わない。
6. 学習者を励ますだけの内容を書かない。次に何を見るべきかを必ず具体的に示す。

## 語彙の扱い
学習者は専門用語を知りません。学習者が素人語で書いた表現には、
正式な用語を添えて説明します。

例：「Aの上に点が2つ」→「Ä（ウムラウト付きA）」

正式な用語は「用語辞書」に載っているものだけを使います。
辞書にない用語を持ち出さないでください。

## 「その他の気づき」の扱い
「その他の気づき」の欄は、既存の観察項目のどこにも当てはまらないものを
学習者が書く場所です。ここに書かれた内容は用語辞書に載っていません。

正解タグの「その他」に対応する内容が書かれていた場合、それは
名前のない手がかりを学習者が自力で見つけたことを意味します。
これを失敗として扱わず、発見として認めてください。

観察空間は無限であり、用意された項目はその一部を切り出したものにすぎません。
項目の外を見た学習者を、項目に収まらなかったことで減点しないでください。
```

## ユーザープロンプト（テンプレート）

`{{ }}` は差し込み。**v1 では該当セクションを丸ごと省略する。**

```
# 学習者の観察メモ

{{slotEntries}}

# 学習者の回答

候補国: {{candidates}}
決め手にしたスロット: {{decisiveSlot}}
総合推論: {{reasoning}}

# 正解

国: {{country}}
地域: {{region}}

# コードで確定した判定結果

正解が候補集合に含まれるか: {{hit}}
含まれる場合の確信度: {{hitConfidence}}
見落としたスロット: {{missedSlots}}
誤って「見えない」と判断したスロット: {{wrongAbsentSlots}}
過剰に申告したスロット: {{overclaimedSlots}}
失敗モード: {{failureModes}}
併記された国の組: {{confusionPairs}}
スロット別の絞り込み力（関連国の件数）: {{narrowingPower}}

{{#if v2}}
# 正解タグ（この地点に実際に写っているもの）

{{answerKey}}

弁別スロット（候補を区別できる項目）: {{decisiveSlots}}

# 用語辞書（該当分）

{{glossaryExcerpt}}
{{/if}}

{{#unless v2}}
# 注意

この地点の正解タグは与えられていません。用語辞書も与えられていません。
見落としについて述べることはできません。
{{/unless}}
```

## 出力スキーマ

`json_schema` + `strict: true` で制約する。**構造化する理由は 2 つある。**

1. UI の描画が安定する
2. **モデル比較で出力を機械的に突き合わせられる**（要件 13）

```jsonc
{
  "type": "object",
  "properties": {
    "summary": {
      "type": "string",
      "description": "1〜2文。今回の結果を一言でまとめる"
    },
    "failureModeExplanation": {
      "type": "string",
      "description": "入力で与えられた失敗モードが学習上どういう意味を持つかの説明。失敗モードを追加・変更しない"
    },
    "missedClues": {
      "type": "array",
      "description": "見落としたスロットの説明。正解タグがない場合は空配列",
      "items": {
        "type": "object",
        "properties": {
          "slot": { "type": "string" },
          "whatWasThere": { "type": "string", "description": "正解タグの記述に基づく説明のみ" },
          "whyItMatters": { "type": "string", "description": "絞り込み力を件数とともに述べる" }
        },
        "required": ["slot", "whatWasThere", "whyItMatters"],
        "additionalProperties": false
      }
    },
    "wrongReasoning": {
      "type": "array",
      "description": "誤った根拠の指摘。該当がなければ空配列",
      "items": {
        "type": "object",
        "properties": {
          "slot": { "type": "string" },
          "explanation": { "type": "string" }
        },
        "required": ["slot", "explanation"],
        "additionalProperties": false
      }
    },
    "vocabulary": {
      "type": "array",
      "description": "学習者の素人語に正式な用語を対応づける。辞書にある用語のみ",
      "items": {
        "type": "object",
        "properties": {
          "learnerWrote": { "type": "string" },
          "canonicalTerm": { "type": "string" },
          "note": { "type": "string" }
        },
        "required": ["learnerWrote", "canonicalTerm", "note"],
        "additionalProperties": false
      }
    },
    "discriminationHint": {
      "type": "string",
      "description": "候補が複数ある場合、どのスロットを見れば区別できるか。候補が1つなら空文字列"
    },
    "nextPriority": {
      "type": "array",
      "description": "次に注目すべきスロットを優先順に最大3件",
      "items": { "type": "string" },
      "maxItems": 3
    },
    "discoveries": {
      "type": "array",
      "description": "学習者が other スロットに書いた内容が正解タグの other に対応した場合、その発見を認める記述。該当がなければ空配列。名前のない手がかりを自力で見つけたことを評価する",
      "items": { "type": "string" }
    },
    "judgmentUnavailable": {
      "type": "boolean",
      "description": "正解タグが与えられず見落とし判定ができなかった場合に true"
    }
  },
  "required": [
    "summary", "failureModeExplanation", "missedClues", "wrongReasoning",
    "vocabulary", "discriminationHint", "nextPriority", "discoveries", "judgmentUnavailable"
  ],
  "additionalProperties": false
}
```

## v1 と v2 の差分

| 項目 | v1 | v2 |
|---|---|---|
| システムプロンプト | 同一 | 同一 |
| ユーザープロンプトのテンプレート | 同一 | 同一 |
| 正解タグのセクション | 省略 | 差し込む |
| 用語辞書のセクション | 省略 | 差し込む |
| 出力スキーマ | 同一 | 同一 |
| `missedClues` | 空配列を期待 | 内容が入る |
| `vocabulary` | 空配列を期待 | 内容が入る |
| `judgmentUnavailable` | `true` を期待 | `false` |

**「期待」と書いているのは、v1 では守られない可能性があるため。**

AI が正解タグなしで `missedClues` を勝手に埋めたり、`judgmentUnavailable` を `false` にしたりする挙動が観測されれば、それは失敗ではなく**記事の証拠になる**。指示に「推測で補わない」と明記してあるにもかかわらず補ってきた、という記録である。

v1 の出力は必ず保存する。

## 記録すべき観測点

v1 実行時、以下を確認して記録する。

- `missedClues` が空か、勝手に埋められているか
- 埋められている場合、その内容がこの地点の事実として正しいか
- `judgmentUnavailable` が `true` になっているか
- `vocabulary` に辞書外の用語が現れているか
- `summary` が具体的か、当たり障りのない励ましになっているか
- `nextPriority` が根拠のある順序になっているか

**最後の 2 点が「面白くない」の中身である。** 具体的な出力を引用できる形で残す。
