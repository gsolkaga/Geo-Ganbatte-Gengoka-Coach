# `scripts` の不一致 目視確認シート

`latin` / `cyrillic` は単純な Yes / No ではなく、GeoGuessr の道路上でどの程度・どの場面に出るかで扱う。

- `none`：基本的に見ない
- `rare`：たまに見える
- `occasional`：条件付きで見える
- `common`：比較的よく見える
- `dominant`：主要な文字体系
- `location_dependent`：場所によって変わる
- `unknown`：判断不能

## 人間による確認結果

| 国 | Latin | 備考 |
|---|---|---|
| QA カタール | `occasional` | 都市部で少し見る |
| AE UAE | `common` | アラビア語との併記が多い |
| OM オマーン | `occasional` | 併記はあるが少ない |
| LB レバノン | `unknown` | 判断不能 |
| TH タイ | `common` | 特に都市部で多い |
| KH カンボジア | `rare` | 少ない |
| GR ギリシャ | `rare` | 基本はギリシャ文字 |
| CY キプロス | `location_dependent` | 場所によって併記 |
| GE ジョージア | `rare` | 特殊文字が主体、英語は少ない |
| TW 台湾 | `rare` | ほぼ中国語 |
| SG シンガポール | `common` | 中国語＋英語の併記が多い |

## キリル文字

| 国 | Cyrillic | Latin | 人間判断 |
|---|---|---|---|
| BA ボスニア | `common` | `common` | 併記 |
| ME モンテネグロ | `common` | `common` | 併記 |
| XK コソボ | `none` | `common` | キリルは基本的に見ない |
| MK 北マケドニア | `dominant` | `occasional` | キリルがメイン |
| UZ ウズベキスタン | `rare` | `common` | 英語併記も見る。現在の実戦認識を記録 |

## 実装上の結論

文字体系を boolean の `latin: true/false` だけで表現すると、人間の実際の推論を潰してしまう。

```yaml
script_observation:
  latin:
    frequency: occasional
    context:
      - urban
```

のように、頻度・文脈を持たせることを推奨する。

「Latinが存在するからこの国」ではなく、「この国ならこの程度の頻度でLatinが見えるはず。今回の画像はその期待と一致するか」という推論に使う。

## 保留

- Lebanon の Latin 出現頻度
- Jordan の Latin 出現頻度
- 空配列起因の再取得
- インド等の多言語国の細粒度

根拠なしに埋めず、`unknown` / 保留でよい。
