# 実験 A の結果：AI は軸を発見できるか、軸を与えれば埋められるか

生成日時: 2026-08-07T06:55:44.074Z

対象: 64 カ国 / 軸 11 本 / モデル 4 件

**仮説：AI は軸を与えられれば埋められる。軸を発見できない。**

## 読むときの前提

**モデル間の一致は正しさを保証しない。** ガーナの走行車線で 3 モデルが揃って誤った実測がある。
一致は「人手確認が不要」ではなく「不一致という信号がない」だけである。

**unknown は弁別力を過大に見せる。** ある軸値が 1 カ国しか該当しないのは、
他国が unknown だからかもしれない。以下すべての弁別子に未確定数を併記している。
**未確定数が大きい弁別子は信用してはならない。**

## 母集団

| 区分 | 件数 | 国 |
|---|---|---|
| 対象（presence ≠ absent） | 64 | |
| 除外（presence = absent） | 0 | — |
| presence が unknown | 1 | AD |

## arm1：AI が自力で挙げた軸

人間の軸 11 本と突き合わせる。**焦点は 2 つ。**

- `rear_marking`（裏面）に相当する軸を挙げたか — 前回の 17 用語には存在しなかった
- `guardrail_relation`（ガードレールとの関係）に相当する軸を挙げたか

| モデル | 提案軸数 | 提案された軸 |
|---|---|---|
| `gpt-oss-120b` | 10 | `A1` `A2` `A3` `A4` `A5` `A6` `A7` `A8` `A9` `A10` |
| `preview_gemma-4-31B-it` | 6 | `body_shape` `primary_color` `reflective_pattern` `reflective_color` `top_shape` `material_texture` |
| `preview_Kimi-K2.6` | 11 | `01` `02` `03` `04` `05` `06` `07` `08` `09` `10` `11` |
| `preview_Qwen3.6-35B-A3B` | 6 | `本体形状（断面・立体的輪郭）` `surface_finish` `mark_layout` `top_design` `base_structure` `color_composition` |

**突き合わせは人手で行う。** 軸 ID の表記が違っても同じ概念を指すことがあり、
機械的な一致判定では「発見できた」を取りこぼす。以下の観点で読む。

| 判定 | 意味 |
|---|---|
| 発見 | 人間の 12 軸に対応する軸を、別の名前でも挙げていた |
| 欠落 | 人間の軸に対応するものが無かった |
| **超過** | **人間の 12 軸にない軸を挙げた。これは AI 側の発見として記録する** |

とくに `glossary-human-axes.json` の `gaps` に挙げた 2 件（2 色の塗り分け、トルコ固有形状の分解）
を AI が軸として提案していた場合、**人間の軸設計の不足を AI が埋めたことになる。**

## 再現：人間の 10 用語を導出できたか

| 判定 | 件数 | 意味 |
|---|---|---|
| 再現 | 0 | AI の行列から人間と同じ国集合が出た |
| 弱い | 1 | 出たが該当国が増えた（弁別力が落ちた） |
| 部分 | 0 | 一部しか一致しない |
| **矛盾** | 8 | **AI が別の値を答えた。人手確認の対象** |
| 判定不能 | 0 | AI が `unknown` を答えた。**食い違いではなく信号なし** |
| 未対応 | 1 | 軸に分解できていない（人間側の宿題） |

**矛盾と判定不能を混ぜていない。** `unknown` を矛盾に数えると
「AI が人間を否定した」件数を過大に報告することになる。**判定不能と否定は別である。**

| 用語 | 人間 | AI から導出 | 矛盾 | 判定不能 | 判定 |
|---|---|---|---|---|---|
| `bollard_all_yellow` | IS | — (0) | 1 | 0 | **矛盾** |
| `bollard_white_yellow_reflector_banded` | DK | — (0) | 2 | 0 | **矛盾** |
| `bollard_white_yellow_reflector_plain` | BE | — (0) | 1 | 0 | **矛盾** |
| `bollard_yellow_with_black` | ES EE LV | — (0) | 4 | 2 | **矛盾** |
| `bollard_red_white_thick_round` | FR | MX AR (2) | 1 | 0 | **矛盾** |
| `bollard_red_white_square_concrete` | VN KH | MY (1) | 2 | 0 | **矛盾** |
| `bollard_red_white_stripe` | BD | CH AT IT ES BG TR GE KZ VN BD LK AR (12) | 0 | 0 | 弱い |
| `bollard_red_diagonal_reflector` | PL | — (0) | 1 | 0 | **矛盾** |
| `bollard_red_both_sides` | NZ | — (0) | 1 | 0 | **矛盾** |
| `bollard_turkey_shape` | TR | — (0) | 0 | 0 | 未対応 |

### 軸ごとに AI が答えたかどうか

**どの軸で AI が答えを持っていたかを見る。** 人間が最強メタに使う軸で答えているか、
それとも答えやすい軸だけ答えているかが分かる。

| 軸 | unknown 率 | モデル間不一致 |
|---|---|---|
| 素材 | 2% (1/64) | 42 |
| 断面・加工形状 | 2% (1/64) | 17 |
| 太さ・薄さ | 45% (29/64) | 1 |
| 本体の主色 | 3% (2/64) | 21 |
| 本体の塗り分け | 28% (18/64) | 13 |
| 反射板の色 | 3% (2/64) | 43 |
| 反射板の形状 | 3% (2/64) | 31 |
| 反射板の周囲の色 | 52% (33/64) | 0 |
| 裏面の塗装 | 69% (44/64) | 0 |
| ガードレールとの関係 | 42% (27/64) | 2 |
| 上端の形状 | 2% (1/64) | 19 |
| ボラードが Street View に写るか | 2% (1/64) | 4 |

## 反証：人間の主張と食い違った箇所

**これは「人間が間違っている」ことを示すものではない。** ルーマニアでは AI が正しく人間が誤り、
ガーナでは人間が正しく AI が誤った。**どちらに転ぶかは事前に決まらない。**

ここに出た項目は、Street View または Plonk It で人間が実物を確認する対象である。

**AI が別の値を答えた箇所: 13 件**

`答えた` は 4 モデルのうち `unknown` 以外を返した数。**票の分布を必ず見ること。**

| 用語 | 国 | 軸 | 人間の主張 | AI の採用値 | 答えた | 票の分布 |
|---|---|---|---|---|---|---|
| `bollard_all_yellow` | IS アイスランド | 本体の主色 | `yellow` | `white` | 3/4 | white×3 |
| `bollard_white_yellow_reflector_banded` | DK デンマーク | 反射板の色 | `yellow` | `orange` | 2/4 | orange×1 white×1 |
| `bollard_white_yellow_reflector_banded` | DK デンマーク | 本体の塗り分け | `single_band` | `solid` | 2/4 | solid×2 |
| `bollard_white_yellow_reflector_plain` | BE ベルギー | 反射板の色 | `yellow` | `red` | 3/4 | red×2 white×1 |
| `bollard_yellow_with_black` | ES スペイン | 反射板の色 | `yellow` | `orange` | 3/4 | orange×1 white×1 red×1 |
| `bollard_yellow_with_black` | ES スペイン | 反射板の周囲の色 | `black` | `none` | 1/4 | none×1 |
| `bollard_yellow_with_black` | EE エストニア | 反射板の色 | `yellow` | `white` | 1/4 | white×1 |
| `bollard_yellow_with_black` | LV ラトビア | 反射板の色 | `yellow` | `white` | 1/4 | white×1 |
| `bollard_red_white_thick_round` | FR フランス | 太さ・薄さ | `thick` | `thin` | 1/4 | thin×1 |
| `bollard_red_white_square_concrete` | VN ベトナム | 断面・加工形状 | `square` | `rectangular` | 2/4 | round×1 rectangular×1 |
| `bollard_red_white_square_concrete` | KH カンボジア | 断面・加工形状 | `square` | `round` | 1/4 | round×1 |
| `bollard_red_diagonal_reflector` | PL ポーランド | 反射板の形状 | `diagonal_stripe` | `rectangle` | 4/4 | rectangle×3 triangle×1 |
| `bollard_red_both_sides` | NZ ニュージーランド | 裏面の塗装 | `same_as_front` | `no_marking` | 1/4 | no_marking×1 |

### 票の分布で読み方が変わる

**「モデル間で不一致がない」は「4 モデルが同じ値を答えた」を意味しない。**
1 モデルだけが答えて 3 モデルが `unknown` でも不一致は 0 になる。

| 票の状態 | 人間の主張に対する意味 |
|---|---|
| 4 モデルが同じ値で人間と違う | **強い信号。** ルーマニア型（人間の誤り）の可能性がある。実物を確認する |
| モデル間で割れている | **信号なし。** AI 側に一貫した知識がない。人間の主張は揺らがない |
| 1〜2 モデルしか答えていない | **信号として弱い。** 多数が判定不能なら根拠にならない |

**ルーマニアの件が意味を持ったのは 4 モデル全員が一致したからである。**
割れている項目を「AI が人間を否定した」と読んではならない。

なおこれらの軸で AI は `unknown` を選べた。選ばずに値を答えて人間と違う値になっている。
**判定不能という出口があるのに、埋める方を選んだ。**

### 判定不能だった箇所: 2 件

**これは食い違いではない。** AI が `unknown` を返しただけであり、人間の主張を否定していない。

| 用語 | 国 | 軸 | 人間の主張 |
|---|---|---|---|
| `bollard_yellow_with_black` | EE エストニア | 反射板の周囲の色 | `black` |
| `bollard_yellow_with_black` | LV ラトビア | 反射板の周囲の色 | `black` |

## 新規：人間が挙げていない弁別子

**実験の本命。** ここに出たものは、人間が Street View で検証できる形の予測になっている。

最小な弁別子（2 カ国以下、軸 3 本以下）: 167 件
うち人間の辞書にないもの: 153 件

未確定数の少ない順に上位 40 件。**未確定数が母集団に近いものは実質的に無意味である。**

| 該当国 | 軸の組み合わせ | 値 | 未確定 | 地域 | モデル間 |
|---|---|---|---|---|---|
| MY マレーシア | 断面・加工形状 | `square` | 1/64 | southeast_asia | 一致 |
| VN ベトナム | 断面・加工形状 | `rectangular` | 1/64 | southeast_asia | 不一致 |
| AR アルゼンチン | 素材 + 反射板の色 | `metal` + `none` | 2/64 | south_america | 不一致 |
| BG ブルガリア | 素材 + 本体の主色 | `plastic` + `red` | 2/64 | east_europe | 不一致 |
| BG ブルガリア | 断面・加工形状 + 本体の主色 | `round` + `red` | 2/64 | east_europe | 不一致 |
| BR ブラジル | 反射板の色 + 反射板の形状 | `orange` + `circle` | 2/64 | south_america | 不一致 |
| CL チリ | 反射板の色 + 反射板の形状 | `orange` + `none` | 2/64 | south_america | 不一致 |
| CZ チェコ | 素材 + 反射板の色 | `metal` + `orange` | 2/64 | east_europe | 不一致 |
| DE ドイツ | 素材 + 反射板の形状 | `concrete` + `full_width_strip` | 2/64 | west_europe | 不一致 |
| DE ドイツ | 反射板の色 + 反射板の形状 | `white` + `full_width_strip` | 2/64 | west_europe | 不一致 |
| KH カンボジア | 素材 + 反射板の色 | `concrete` + `none` | 2/64 | southeast_asia | 一致 |
| RU ロシア | 素材 + 反射板の色 | `metal` + `red` | 2/64 | former_soviet_asia | 不一致 |
| VN ベトナム | 素材 + 本体の主色 | `concrete` + `red` | 2/64 | southeast_asia | 不一致 |
| ZA 南アフリカ共和国 | 反射板の色 + 反射板の形状 | `white` + `none` | 2/64 | southern_africa | 不一致 |
| BR ブラジル | 素材 + 反射板の形状 + 上端の形状 | `plastic` + `circle` + `rounded` | 2/64 | south_america | 不一致 |
| PH フィリピン | 素材 + 反射板の色 + 反射板の形状 | `plastic` + `white` + `circle` | 2/64 | southeast_asia | 不一致 |
| PH フィリピン | 素材 + 反射板の形状 + 上端の形状 | `plastic` + `circle` + `flat` | 2/64 | southeast_asia | 不一致 |
| AR アルゼンチン | 本体の主色 + 反射板の色 | `white` + `none` | 3/64 | south_america | 不一致 |
| BG ブルガリア | 本体の主色 + 反射板の色 | `red` + `red` | 3/64 | east_europe | 不一致 |
| BG ブルガリア | 本体の主色 + 反射板の形状 | `red` + `rectangle` | 3/64 | east_europe | 不一致 |
| CL チリ | 素材 + 本体の主色 + 反射板の形状 | `concrete` + `white` + `none` | 3/64 | south_america | 不一致 |
| PH フィリピン | 本体の主色 + 反射板の形状 + 上端の形状 | `white` + `circle` + `flat` | 3/64 | southeast_asia | 不一致 |
| CZ チェコ | 素材 + 本体の塗り分け + 上端の形状 | `metal` + `solid` + `flat` | 18/64 | east_europe | 不一致 |
| VN ベトナム | 素材 + 本体の塗り分け + 上端の形状 | `concrete` + `horizontal_stripes` + `rounded` | 18/64 | southeast_asia | 不一致 |
| AR アルゼンチン | 本体の塗り分け + 反射板の色 | `horizontal_stripes` + `none` | 19/64 | south_america | 不一致 |
| AR アルゼンチン | 本体の塗り分け + 反射板の形状 | `horizontal_stripes` + `none` | 19/64 | south_america | 不一致 |
| BG ブルガリア | 本体の塗り分け + 反射板の色 | `horizontal_stripes` + `red` | 19/64 | east_europe | 不一致 |
| BR ブラジル | 本体の塗り分け + 反射板の形状 | `solid` + `circle` | 19/64 | south_america | 不一致 |
| PH フィリピン | 本体の塗り分け + 反射板の形状 | `diagonal` + `circle` | 19/64 | southeast_asia | 不一致 |
| CL チリ | 素材 + 本体の塗り分け + 反射板の形状 | `concrete` + `solid` + `none` | 19/64 | south_america | 不一致 |
| IN インド | 本体の塗り分け + 反射板の色 + 反射板の形状 | `diagonal` + `white` + `rectangle` | 19/64 | south_asia | 不一致 |
| KZ カザフスタン | 素材 + 本体の塗り分け + 反射板の形状 | `metal` + `horizontal_stripes` + `rectangle` | 19/64 | former_soviet_asia | 不一致 |
| ZA 南アフリカ共和国 | 素材 + 本体の塗り分け + 反射板の色 | `metal` + `solid` + `white` | 19/64 | southern_africa | 不一致 |
| ZA 南アフリカ共和国 | 素材 + 本体の塗り分け + 反射板の形状 | `metal` + `solid` + `none` | 19/64 | southern_africa | 不一致 |
| BR ブラジル | 素材 + ガードレールとの関係 | `plastic` + `mounted_on_guardrail` | 27/64 | south_america | 不一致 |
| CL チリ | 素材 + ガードレールとの関係 | `concrete` + `mounted_on_guardrail` | 27/64 | south_america | 不一致 |
| CZ チェコ | 素材 + ガードレールとの関係 + 上端の形状 | `metal` + `standalone` + `flat` | 27/64 | east_europe | 不一致 |
| RU ロシア | 素材 + ガードレールとの関係 + 上端の形状 | `metal` + `standalone` + `rounded` | 27/64 | former_soviet_asia | 不一致 |
| AR アルゼンチン | 反射板の色 + ガードレールとの関係 | `none` + `mounted_on_guardrail` | 28/64 | south_america | 不一致 |
| BR ブラジル | 反射板の形状 + ガードレールとの関係 | `circle` + `mounted_on_guardrail` | 28/64 | south_america | 不一致 |

**2 カ国で 2 地域にまたがるものは、良い弁別子ではない**（失点が距離で決まるため）。
他の要素と組み合わせる補助メタとして扱う。

## 増幅の罠

モデル間で不一致だったセル: 193 / 768

**属性値が 1 つ誤ると、その値が参加する組み合わせ全部が汚染される。**
単一属性の用語なら誤り 1 件で用語 1 件が壊れるだけだが、組み合わせは掛け算で壊れる。

不一致セルを含む弁別子: 148 / 167

人間の組み合わせ知識は観察と一緒に獲得されているため、この増幅を受けない。
**導出された組み合わせは入力の誤りを継承し、見て覚えた組み合わせは継承しない。ここは対称ではない。**

## この計算で言えないこと

**弁別力は計算できるが、学習価値は計算できない。**

アイスランドのボラードは完璧な弁別子だが、アイスランドは出題頻度が低い。
頻出国に対する少し弱い弁別子のほうが実戦価値は高い。
カバレッジの出題頻度はこの辞書からは計算できず、プレイデータが必要である。

したがって出力は「覚えるべき順序」ではなく「弁別力の順序」である。混同しないこと。

また `presence` が unknown の国は、そもそもボラードが写るかどうかが分かっていない。
その国を含む弁別子は、存在の確認から始める必要がある。
