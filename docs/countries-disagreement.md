# 国定数テーブルの不一致レポート

生成日時: 2026-08-07T05:17:59.089Z

対象: 102 カ国 / モデル 4 件

**モデル間の一致は正しさを保証しない。** 複数モデルが同じ誤りをすることは普通にある。
このレポートが示すのは「人手確認すべき箇所」であり、一致した項目が正しいという意味ではない。

## 集計

| 項目 | 不一致の件数 |
|---|---|
| `traffic_side` | 9 |
| `scripts` | 35 |
| `languages` | 102 |
| `all` | 0 |

## `traffic_side` の不一致（9 件）

### GH ガーナ

```
gpt-oss-120b=left / preview_Kimi-K2.6=right / preview_Qwen3.6-35B-A3B=left / preview_gemma-4-31B-it=left
```

### NG ナイジェリア

```
gpt-oss-120b=right / preview_Kimi-K2.6=right / preview_Qwen3.6-35B-A3B=left / preview_gemma-4-31B-it=right
```

### RW ルワンダ

```
gpt-oss-120b=right / preview_Kimi-K2.6=right / preview_Qwen3.6-35B-A3B=left / preview_gemma-4-31B-it=right
```

### BT ブータン

```
gpt-oss-120b=left / preview_Kimi-K2.6=left / preview_Qwen3.6-35B-A3B=left / preview_gemma-4-31B-it=right
```

### KH カンボジア

```
gpt-oss-120b=left / preview_Kimi-K2.6=right / preview_Qwen3.6-35B-A3B=right / preview_gemma-4-31B-it=right
```

### ID インドネシア

```
gpt-oss-120b=left / preview_Kimi-K2.6=left / preview_Qwen3.6-35B-A3B=right / preview_gemma-4-31B-it=left
```

### PH フィリピン

```
gpt-oss-120b=right / preview_Kimi-K2.6=right / preview_Qwen3.6-35B-A3B=right / preview_gemma-4-31B-it=left
```

### HK 香港

```
gpt-oss-120b=left / preview_Kimi-K2.6=left / preview_Qwen3.6-35B-A3B=left / preview_gemma-4-31B-it=right
```

### AU オーストラリア

```
gpt-oss-120b=right / preview_Kimi-K2.6=left / preview_Qwen3.6-35B-A3B=left / preview_gemma-4-31B-it=left
```

## `scripts` の不一致（35 件）

### NO ノルウェー

```
gpt-oss-120b=[latin] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[arabic] / preview_gemma-4-31B-it=[latin]
```

### SE スウェーデン

```
gpt-oss-120b=[latin] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[latin] / preview_gemma-4-31B-it=[latin]
```

### FI フィンランド

```
gpt-oss-120b=[latin] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[latin] / preview_gemma-4-31B-it=[latin]
```

### IS アイスランド

```
gpt-oss-120b=[latin] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[latin] / preview_gemma-4-31B-it=[latin]
```

### DK デンマーク

```
gpt-oss-120b=[latin] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[latin] / preview_gemma-4-31B-it=[latin]
```

### IE アイルランド

```
gpt-oss-120b=[latin] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[latin] / preview_gemma-4-31B-it=[latin]
```

### BA ボスニア・ヘルツェゴビナ

```
gpt-oss-120b=[cyrillic,latin] / preview_Kimi-K2.6=[cyrillic,latin] / preview_Qwen3.6-35B-A3B=[latin] / preview_gemma-4-31B-it=[cyrillic,latin]
```

### ME モンテネグロ

```
gpt-oss-120b=[cyrillic,latin] / preview_Kimi-K2.6=[latin] / preview_Qwen3.6-35B-A3B=[latin] / preview_gemma-4-31B-it=[latin]
```

### XK コソボ

```
gpt-oss-120b=[cyrillic,latin] / preview_Kimi-K2.6=[cyrillic,latin] / preview_Qwen3.6-35B-A3B=[latin] / preview_gemma-4-31B-it=[cyrillic,latin]
```

### RS セルビア

```
gpt-oss-120b=[cyrillic,latin] / preview_Kimi-K2.6=[cyrillic,latin] / preview_Qwen3.6-35B-A3B=[cyrillic,latin] / preview_gemma-4-31B-it=[cyrillic,sinhala]
```

### MK 北マケドニア

```
gpt-oss-120b=[cyrillic] / preview_Kimi-K2.6=[cyrillic,latin] / preview_Qwen3.6-35B-A3B=[cyrillic] / preview_gemma-4-31B-it=[cyrillic]
```

### LT リトアニア

```
gpt-oss-120b=[latin] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[latin] / preview_gemma-4-31B-it=[latin]
```

### GR ギリシャ

```
gpt-oss-120b=[greek] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[greek] / preview_gemma-4-31B-it=[greek,latin]
```

### CY キプロス

```
gpt-oss-120b=[greek,latin] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[greek,latin] / preview_gemma-4-31B-it=[greek,latin]
```

### RU ロシア

```
gpt-oss-120b=[cyrillic] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[cyrillic] / preview_gemma-4-31B-it=[cyrillic]
```

### KZ カザフスタン

```
gpt-oss-120b=[cyrillic,latin] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[cyrillic] / preview_gemma-4-31B-it=[cyrillic,latin]
```

### KG キルギス

```
gpt-oss-120b=[cyrillic] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[cyrillic] / preview_gemma-4-31B-it=[cyrillic]
```

### MN モンゴル

```
gpt-oss-120b=[cyrillic] / preview_Kimi-K2.6=[cyrillic] / preview_Qwen3.6-35B-A3B=[latin] / preview_gemma-4-31B-it=[cyrillic,sinhala]
```

### UZ ウズベキスタン

```
gpt-oss-120b=[cyrillic,latin] / preview_Kimi-K2.6=[cyrillic,latin] / preview_Qwen3.6-35B-A3B=[latin] / preview_gemma-4-31B-it=[cyrillic,latin]
```

### GE ジョージア

```
gpt-oss-120b=[georgian] / preview_Kimi-K2.6=[georgian] / preview_Qwen3.6-35B-A3B=[georgian] / preview_gemma-4-31B-it=[georgian,latin]
```

### IL イスラエル

```
gpt-oss-120b=[arabic,hebrew,latin] / preview_Kimi-K2.6=[hebrew,latin] / preview_Qwen3.6-35B-A3B=[arabic,hebrew] / preview_gemma-4-31B-it=[arabic,hebrew,latin]
```

### LB レバノン

```
gpt-oss-120b=[arabic,latin] / preview_Kimi-K2.6=[arabic,latin] / preview_Qwen3.6-35B-A3B=[arabic] / preview_gemma-4-31B-it=[arabic,latin]
```

### JO ヨルダン

```
gpt-oss-120b=[arabic] / preview_Kimi-K2.6=[hebrew,latin] / preview_Qwen3.6-35B-A3B=[arabic] / preview_gemma-4-31B-it=[arabic,latin]
```

### QA カタール

```
gpt-oss-120b=[arabic] / preview_Kimi-K2.6=[arabic,latin] / preview_Qwen3.6-35B-A3B=[arabic] / preview_gemma-4-31B-it=[arabic,latin]
```

### AE アラブ首長国連邦

```
gpt-oss-120b=[arabic] / preview_Kimi-K2.6=[arabic,latin] / preview_Qwen3.6-35B-A3B=[arabic,latin] / preview_gemma-4-31B-it=[arabic,latin]
```

### OM オマーン

```
gpt-oss-120b=[arabic] / preview_Kimi-K2.6=[arabic,latin] / preview_Qwen3.6-35B-A3B=[arabic] / preview_gemma-4-31B-it=[arabic,latin]
```

### IN インド

```
gpt-oss-120b=[devanagari,latin] / preview_Kimi-K2.6=[devanagari,latin,other] / preview_Qwen3.6-35B-A3B=[arabic,bengali,devanagari,greek,latin,sinhala,tamil,tibetan] / preview_gemma-4-31B-it=[devanagari,latin]
```

### LK スリランカ

```
gpt-oss-120b=[latin,sinhala,tamil] / preview_Kimi-K2.6=[latin,sinhala,tamil] / preview_Qwen3.6-35B-A3B=[latin,sinhala] / preview_gemma-4-31B-it=[latin,sinhala,tamil]
```

### TH タイ

```
gpt-oss-120b=[thai] / preview_Kimi-K2.6=[latin,thai] / preview_Qwen3.6-35B-A3B=[latin,thai] / preview_gemma-4-31B-it=[latin,thai]
```

### KH カンボジア

```
gpt-oss-120b=[khmer] / preview_Kimi-K2.6=[khmer,latin] / preview_Qwen3.6-35B-A3B=[khmer,latin] / preview_gemma-4-31B-it=[khmer,latin]
```

### MY マレーシア

```
gpt-oss-120b=[latin] / preview_Kimi-K2.6=[arabic,japanese_kana_kanji,latin,tamil] / preview_Qwen3.6-35B-A3B=[latin] / preview_gemma-4-31B-it=[latin]
```

### SG シンガポール

```
gpt-oss-120b=[chinese_traditional,latin,tamil] / preview_Kimi-K2.6=[chinese_simplified,latin,tamil] / preview_Qwen3.6-35B-A3B=[latin] / preview_gemma-4-31B-it=[latin]
```

### TW 台湾

```
gpt-oss-120b=[chinese_traditional,latin] / preview_Kimi-K2.6=[chinese_traditional,latin] / preview_Qwen3.6-35B-A3B=[chinese_traditional,latin] / preview_gemma-4-31B-it=[chinese_traditional]
```

### KR 韓国

```
gpt-oss-120b=[hebrew,latin] / preview_Kimi-K2.6=[korean_hangul,latin] / preview_Qwen3.6-35B-A3B=[korean_hangul,latin] / preview_gemma-4-31B-it=[korean_hangul,latin]
```

### JP 日本

```
gpt-oss-120b=[japanese_kana_kanji,latin] / preview_Kimi-K2.6=[korean_hangul,latin] / preview_Qwen3.6-35B-A3B=[japanese_kana_kanji,latin] / preview_gemma-4-31B-it=[japanese_kana_kanji,latin]
```

## `languages` の不一致（102 件）

### NO ノルウェー

```
gpt-oss-120b=[ノルウェー語（ブークモール／ニーノシュク）,北部のサーミ語（標識に併記されることあり）] / preview_Kimi-K2.6=[japanese,korean] / preview_Qwen3.6-35B-A3B=[ノルウェー語] / preview_gemma-4-31B-it=[ノルウェー語]
```

### SE スウェーデン

```
gpt-oss-120b=[スウェーデン語（標識はスウェーデン語が基本）] / preview_Kimi-K2.6=[japanese,korean] / preview_Qwen3.6-35B-A3B=[スウェーデン語] / preview_gemma-4-31B-it=[スウェーデン語]
```

### FI フィンランド

```
gpt-oss-120b=[スウェーデン語（両言語が同等に表記）,フィンランド語] / preview_Kimi-K2.6=[japanese,korean] / preview_Qwen3.6-35B-A3B=[フィンランド語およびスウェーデン語] / preview_gemma-4-31B-it=[スウェーデン語,フィンランド語]
```

### IS アイスランド

```
gpt-oss-120b=[アイスランド語（観光地では英語が併記されることがある）] / preview_Kimi-K2.6=[japanese,korean] / preview_Qwen3.6-35B-A3B=[アイスランド語] / preview_gemma-4-31B-it=[アイスランド語]
```

### DK デンマーク

```
gpt-oss-120b=[デンマーク語] / preview_Kimi-K2.6=[japanese,korean] / preview_Qwen3.6-35B-A3B=[デンマーク語] / preview_gemma-4-31B-it=[デンマーク語]
```

### IE アイルランド

```
gpt-oss-120b=[アイルランド語（ゲール語）,英語（両言語が表記される）] / preview_Kimi-K2.6=[japanese,korean] / preview_Qwen3.6-35B-A3B=[英語およびアイルランド語（ゲール語）] / preview_gemma-4-31B-it=[英語]
```

### GB イギリス

```
gpt-oss-120b=[english] / preview_Kimi-K2.6=[english] / preview_Qwen3.6-35B-A3B=[イギリス] / preview_gemma-4-31B-it=[英語]
```

### NL オランダ

```
gpt-oss-120b=[dutch] / preview_Kimi-K2.6=[dutch] / preview_Qwen3.6-35B-A3B=[オランダ語] / preview_gemma-4-31B-it=[オランダ語]
```

### FR フランス

```
gpt-oss-120b=[french] / preview_Kimi-K2.6=[french] / preview_Qwen3.6-35B-A3B=[フランス語] / preview_gemma-4-31B-it=[フランス語]
```

### BE ベルギー

```
gpt-oss-120b=[dutch,french,german] / preview_Kimi-K2.6=[dutch,french] / preview_Qwen3.6-35B-A3B=[オランダ語・フランス語・ドイツ語（地域により使い分け）] / preview_gemma-4-31B-it=[オランダ語,ドイツ語,フランス語]
```

### LU ルクセンブルク

```
gpt-oss-120b=[french,german,luxembourgish] / preview_Kimi-K2.6=[french,luxembourgish] / preview_Qwen3.6-35B-A3B=[フランス語・ドイツ語（標識表記の実態）] / preview_gemma-4-31B-it=[ドイツ語,フランス語,ルクセンブルク語]
```

### DE ドイツ

```
gpt-oss-120b=[german] / preview_Kimi-K2.6=[german] / preview_Qwen3.6-35B-A3B=[ドイツ語] / preview_gemma-4-31B-it=[ドイツ語]
```

### CH スイス

```
gpt-oss-120b=[deutsch (ドイツ語),français (フランス語),italiano (イタリア語),rumantsch (ロマンシュ語)] / preview_Kimi-K2.6=[de,fr,it,rm] / preview_Qwen3.6-35B-A3B=[スイス,ナンバープレートの特徴: 白地に黒文字。左端にスイス国旗（赤地に白十字）のエンブレムと「ch」の識別帯。州コード（2文字）と番号の組み合わせ（例: zh 123456）。,文字体系: ラテン文字,標識に現れる言語: ドイツ語、フランス語、イタリア語、ロマンシュ語（連邦標識では4言語併記、地域標識では該当言語のみ）,走行車線: 右側通行] / preview_gemma-4-31B-it=[イタリア語,ドイツ語,フランス語]
```

### AT オーストリア

```
gpt-oss-120b=[deutsch (ドイツ語)] / preview_Kimi-K2.6=[de] / preview_Qwen3.6-35B-A3B=[オーストリア,ナンバープレートの特徴: 白地に黒文字。左端にeu仕様青帯「a」。州略字（1文字）と空白、番号の順で配置（例: w 123456）。,文字体系: ラテン文字,標識に現れる言語: ドイツ語（一部地域でスロベニア語・クロアチア語との併記あり）,走行車線: 右側通行] / preview_gemma-4-31B-it=[ドイツ語]
```

### IT イタリア

```
gpt-oss-120b=[deutsch (ドイツ語) – südtirol（南チロル）で併記,français (フランス語) – valle d'aosta（アオスタ州）で併記,italiano (イタリア語)] / preview_Kimi-K2.6=[it] / preview_Qwen3.6-35B-A3B=[イタリア,ナンバープレートの特徴: 白地に黒文字。左右に青帯「i」付き（左のみの場合も）。2桁文字-2桁数字-2桁文字の横並び（例: ab 00 cd）。,文字体系: ラテン文字,標識に現れる言語: イタリア語（自治州によってはドイツ語・フランス語・スロベニア語との併記あり）,走行車線: 右側通行] / preview_gemma-4-31B-it=[イタリア語]
```

### ES スペイン

```
gpt-oss-120b=[català (カタルーニャ語),español (スペイン語),euskara (バスク語),galego (ガリシア語),valencià (バレンシア語) – 該当地域で併記] / preview_Kimi-K2.6=[es] / preview_Qwen3.6-35B-A3B=[スペイン,ナンバープレートの特徴: 白地に黒文字。左端にeu仕様青帯「e」。3桁数字と3桁文字を空白で区切って記載（例: 1234 bcd）。右側に青色帯が縦に付く場合もある。,文字体系: ラテン文字,標識に現れる言語: スペイン語（自治州によってはカタルーニャ語・バスク語・ガリシア語などの併記あり）,走行車線: 右側通行] / preview_gemma-4-31B-it=[スペイン語]
```

### PT ポルトガル

```
gpt-oss-120b=[português (ポルトガル語)] / preview_Kimi-K2.6=[pt] / preview_Qwen3.6-35B-A3B=[ナンバープレートの特徴: 白地に黒文字。左端にeu仕様青帯「p」。2桁文字・2桁数字・2桁文字を空白で区切って記載（例: ab 00 cd）。,ポルトガル,文字体系: ラテン文字,標識に現れる言語: ポルトガル語,走行車線: 右側通行] / preview_gemma-4-31B-it=[ポルトガル語]
```

### AD アンドラ

```
gpt-oss-120b=[català (カタルーニャ語)] / preview_Kimi-K2.6=[ca] / preview_Qwen3.6-35B-A3B=[アンドラ,ナンバープレートの特徴: 白地に黒文字。左端にeu様式の青帯に「and」。番号とアルファベットを組み合わせた記載（例: 1234 abc）。,文字体系: ラテン文字,標識に現れる言語: カタルーニャ語（スペイン語・フランス語表記の標識も存在）,走行車線: 右側通行] / preview_gemma-4-31B-it=[カタルーニャ語,スペイン語,フランス語]
```

### MT マルタ

```
gpt-oss-120b=[english,maltese] / preview_Kimi-K2.6=[en,ja] / preview_Qwen3.6-35B-A3B=[] / preview_gemma-4-31B-it=[マルタ語,英語]
```

### PL ポーランド

```
gpt-oss-120b=[polish] / preview_Kimi-K2.6=[pl] / preview_Qwen3.6-35B-A3B=[polish] / preview_gemma-4-31B-it=[ポーランド語]
```

### CZ チェコ

```
gpt-oss-120b=[czech] / preview_Kimi-K2.6=[cs] / preview_Qwen3.6-35B-A3B=[czech] / preview_gemma-4-31B-it=[チェコ語]
```

### SK スロバキア

```
gpt-oss-120b=[slovak] / preview_Kimi-K2.6=[sk] / preview_Qwen3.6-35B-A3B=[slovak] / preview_gemma-4-31B-it=[スロバキア語]
```

### HU ハンガリー

```
gpt-oss-120b=[hungarian] / preview_Kimi-K2.6=[hu] / preview_Qwen3.6-35B-A3B=[hungarian] / preview_gemma-4-31B-it=[ハンガリー語]
```

### SI スロベニア

```
gpt-oss-120b=[slovene] / preview_Kimi-K2.6=[sl] / preview_Qwen3.6-35B-A3B=[slovenian] / preview_gemma-4-31B-it=[スロベニア語]
```

### HR クロアチア

```
gpt-oss-120b=[クロアチア語 (ラテン文字)] / preview_Kimi-K2.6=[croatia,croatian] / preview_Qwen3.6-35B-A3B=[クロアチア語] / preview_gemma-4-31B-it=[クロアチア語]
```

### BA ボスニア・ヘルツェゴビナ

```
gpt-oss-120b=[ボスニア語／クロアチア語／セルビア語 (ラテン文字・キリル文字)] / preview_Kimi-K2.6=[bosnian,croatian,serbian] / preview_Qwen3.6-35B-A3B=[クロアチア語,セルビア語,ボスニア語] / preview_gemma-4-31B-it=[クロアチア語,セルビア語,ボスニア語]
```

### ME モンテネグロ

```
gpt-oss-120b=[モンテネグロ語 (ラテン文字・キリル文字)] / preview_Kimi-K2.6=[montenegrin] / preview_Qwen3.6-35B-A3B=[セルビア語,モンテネグロ語] / preview_gemma-4-31B-it=[モンテネグロ語]
```

### XK コソボ

```
gpt-oss-120b=[アルバニア語 (ラテン文字),セルビア語 (キリル文字)] / preview_Kimi-K2.6=[albanian,serbian] / preview_Qwen3.6-35B-A3B=[アルバニア語,セルビア語] / preview_gemma-4-31B-it=[アルバニア語,セルビア語]
```

### AL アルバニア

```
gpt-oss-120b=[アルバニア語 (ラテン文字)] / preview_Kimi-K2.6=[albanian] / preview_Qwen3.6-35B-A3B=[アルバニア語] / preview_gemma-4-31B-it=[アルバニア語]
```

### RO ルーマニア

```
gpt-oss-120b=[ハンガリー語 (ラテン文字)※ハンガリー人居住地域,ルーマニア語 (ラテン文字)] / preview_Kimi-K2.6=[romanian] / preview_Qwen3.6-35B-A3B=[ルーマニア語] / preview_gemma-4-31B-it=[ルーマニア語]
```

### RS セルビア

```
gpt-oss-120b=[セルビア語（キリル文字）,セルビア語（ラテン文字）] / preview_Kimi-K2.6=[serbian (cyrillic, latin are both present on signs)] / preview_Qwen3.6-35B-A3B=[セルビア語] / preview_gemma-4-31B-it=[セルビア語]
```

### MK 北マケドニア

```
gpt-oss-120b=[アルバニア語（ラテン文字・アルバニア人居住地区）,マケドニア語（キリル文字）] / preview_Kimi-K2.6=[albanian can appear in some areas,macedonian] / preview_Qwen3.6-35B-A3B=[マケドニア語] / preview_gemma-4-31B-it=[マケドニア語]
```

### BG ブルガリア

```
gpt-oss-120b=[ブルガリア語（キリル文字）,英語・ラテン文字（観光地・eu指示で補助的に併記）] / preview_Kimi-K2.6=[bulgarian] / preview_Qwen3.6-35B-A3B=[ブルガリア語] / preview_gemma-4-31B-it=[ブルガリア語]
```

### UA ウクライナ

```
gpt-oss-120b=[ウクライナ語（キリル文字）] / preview_Kimi-K2.6=[ukrainian] / preview_Qwen3.6-35B-A3B=[ウクライナ語] / preview_gemma-4-31B-it=[ウクライナ語]
```

### EE エストニア

```
gpt-oss-120b=[エストニア語（ラテン文字）,スウェーデン語（海岸部の少数言語として併記されることあり）] / preview_Kimi-K2.6=[estonian] / preview_Qwen3.6-35B-A3B=[エストニア語] / preview_gemma-4-31B-it=[エストニア語]
```

### LV ラトビア

```
gpt-oss-120b=[ラトビア語（ラテン文字）,ロシア語（一部地域で補助的に表示）] / preview_Kimi-K2.6=[latvian] / preview_Qwen3.6-35B-A3B=[ラトビア語] / preview_gemma-4-31B-it=[ラトビア語]
```

### LT リトアニア

```
gpt-oss-120b=[道路標識に現れる言語: リトアニア語（ラテン文字）] / preview_Kimi-K2.6=[。。。] / preview_Qwen3.6-35B-A3B=[リトアニア] / preview_gemma-4-31B-it=[リトアニア語]
```

### GR ギリシャ

```
gpt-oss-120b=[道路標識に現れる言語: ギリシャ語（ギリシャ文字）] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[greek] / preview_gemma-4-31B-it=[ギリシャ語,英語]
```

### CY キプロス

```
gpt-oss-120b=[道路標識に現れる言語: ギリシャ語（ギリシャ文字）・トルコ語（ラテン文字）] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[english,greek] / preview_gemma-4-31B-it=[ギリシャ語,英語]
```

### RU ロシア

```
gpt-oss-120b=[道路標識に現れる言語: ロシア語（キリル文字）] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[russian] / preview_gemma-4-31B-it=[ロシア語]
```

### KZ カザフスタン

```
gpt-oss-120b=[道路標識に現れる言語: カザフ語（ラテン文字）・ロシア語（キリル文字）] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[kazakh,russian] / preview_gemma-4-31B-it=[カザフ語,ロシア語]
```

### KG キルギス

```
gpt-oss-120b=[道路標識に現れる言語: キルギス語（キリル文字）・ロシア語（キリル文字）] / preview_Kimi-K2.6=[] / preview_Qwen3.6-35B-A3B=[kyrgyz,russian] / preview_gemma-4-31B-it=[キルギス語,ロシア語]
```

### MN モンゴル

```
gpt-oss-120b=[モンゴル語（キリル文字）,英語（主要幹線・観光地で併記）] / preview_Kimi-K2.6=[モンゴル語] / preview_Qwen3.6-35B-A3B=[モンゴル語] / preview_gemma-4-31B-it=[キリル文字,モンゴル文字]
```

### UZ ウズベキスタン

```
gpt-oss-120b=[ウズベク語（ラテン文字）,ロシア語（キリル文字）,英語（観光地で併記）] / preview_Kimi-K2.6=[ウズベク語] / preview_Qwen3.6-35B-A3B=[ウズベク語] / preview_gemma-4-31B-it=[ウズベク語,ロシア語]
```

### GE ジョージア

```
gpt-oss-120b=[ジョージア語（ムヘドリ文字）,英語（観光ルートで併記）] / preview_Kimi-K2.6=[ジョージア語] / preview_Qwen3.6-35B-A3B=[グルジア語] / preview_gemma-4-31B-it=[ジョージア語,英語]
```

### TR トルコ

```
gpt-oss-120b=[トルコ語（ラテン文字）,英語（観光道路で併記）] / preview_Kimi-K2.6=[トルコ語] / preview_Qwen3.6-35B-A3B=[トルコ語] / preview_gemma-4-31B-it=[トルコ語]
```

### IL イスラエル

```
gpt-oss-120b=[アラビア語,ヘブライ語（右から左へ）,英語（外国人向けに併記）] / preview_Kimi-K2.6=[ヘブライ語,英語] / preview_Qwen3.6-35B-A3B=[アラビア語,ヘブライ語] / preview_gemma-4-31B-it=[アラビア語,ヘブライ語,英語]
```

### LB レバノン

```
gpt-oss-120b=[アラビア語（標準アラビア文字）,フランス語（ラテン文字）,英語（観光エリアで併記）] / preview_Kimi-K2.6=[アラビア語,フランス語] / preview_Qwen3.6-35B-A3B=[アラビア語] / preview_gemma-4-31B-it=[アラビア語,フランス語]
```

### JO ヨルダン

```
gpt-oss-120b=[アラビア語（現代標準アラビア語）] / preview_Kimi-K2.6=[ja] / preview_Qwen3.6-35B-A3B=[ヨルダン] / preview_gemma-4-31B-it=[アラビア語,英語]
```

### QA カタール

```
gpt-oss-120b=[アラビア語（標準アラビア語）] / preview_Kimi-K2.6=[aar] / preview_Qwen3.6-35B-A3B=[カタール] / preview_gemma-4-31B-it=[アラビア語,英語]
```

### AE アラブ首長国連邦

```
gpt-oss-120b=[アラビア語（標準アラビア語）] / preview_Kimi-K2.6=[arabic] / preview_Qwen3.6-35B-A3B=[アラブ首長国連邦] / preview_gemma-4-31B-it=[アラビア語,英語]
```

### OM オマーン

```
gpt-oss-120b=[アラビア語（標準アラビア語）] / preview_Kimi-K2.6=[urdu] / preview_Qwen3.6-35B-A3B=[オマーン] / preview_gemma-4-31B-it=[アラビア語,英語]
```

### TN チュニジア

```
gpt-oss-120b=[アラビア語（標準アラビア語）,フランス語（一部観光地・高速道路標識）] / preview_Kimi-K2.6=[french] / preview_Qwen3.6-35B-A3B=[チュニジア] / preview_gemma-4-31B-it=[アラビア語,フランス語]
```

### SN セネガル

```
gpt-oss-120b=[ウロフ語（道路標識の補助表示）,フランス語] / preview_Kimi-K2.6=[french] / preview_Qwen3.6-35B-A3B=[セネガル] / preview_gemma-4-31B-it=[フランス語]
```

### GH ガーナ

```
gpt-oss-120b=[英語] / preview_Kimi-K2.6=[english] / preview_Qwen3.6-35B-A3B=[english] / preview_gemma-4-31B-it=[英語]
```

### NG ナイジェリア

```
gpt-oss-120b=[英語] / preview_Kimi-K2.6=[english] / preview_Qwen3.6-35B-A3B=[english] / preview_gemma-4-31B-it=[英語]
```

### ST サントメ・プリンシペ

```
gpt-oss-120b=[ポルトガル語] / preview_Kimi-K2.6=[portuguese] / preview_Qwen3.6-35B-A3B=[portuguese] / preview_gemma-4-31B-it=[ポルトガル語]
```

### KE ケニア

```
gpt-oss-120b=[スワヒリ語,英語] / preview_Kimi-K2.6=[english,swahili] / preview_Qwen3.6-35B-A3B=[english,swahili] / preview_gemma-4-31B-it=[スワヒリ語,英語]
```

### UG ウガンダ

```
gpt-oss-120b=[英語] / preview_Kimi-K2.6=[english,swahili] / preview_Qwen3.6-35B-A3B=[english] / preview_gemma-4-31B-it=[英語]
```

### RW ルワンダ

```
gpt-oss-120b=[キニヤルワンダ語,フランス語,英語] / preview_Kimi-K2.6=[english,french] / preview_Qwen3.6-35B-A3B=[english,kinyarwanda] / preview_gemma-4-31B-it=[キニヤルワンダ語,フランス語,英語]
```

### NA ナミビア

```
gpt-oss-120b=[英語 (english)] / preview_Kimi-K2.6=[en,ja] / preview_Qwen3.6-35B-A3B=[ラテン文字,左側通行,白地に黒文字。上部に「nam」の文字。フォーマットは「[アルファベット1〜2文字] [数字3〜4桁]」など（例: nam a 123 456）,英語（主要幹線道は英語のみ。地方部でアフリカーンス語やドイツ語の併記がある場合あり）] / preview_gemma-4-31B-it=[英語]
```

### BW ボツワナ

```
gpt-oss-120b=[ツワナ語 (setswana),英語 (english)] / preview_Kimi-K2.6=[en] / preview_Qwen3.6-35B-A3B=[ラテン文字,左側通行,白地に黒文字。左上または右上に「bw」のマーク。フォーマットは「[アルファベット] [数字]」タイプ,英語（主要道路は英語中心。一部自治体でセツワナ語の併記）] / preview_gemma-4-31B-it=[英語]
```

### ZA 南アフリカ共和国

```
gpt-oss-120b=[アフリカーンス語 (afrikaans),ズールー語、コサ語など（主要標識は英語・アフリカーンス語）,英語 (english)] / preview_Kimi-K2.6=[af,en] / preview_Qwen3.6-35B-A3B=[ラテン文字,左側通行,白地に黒文字。フォーマットは「[アルファベット1〜3文字] [数字1〜3桁] [数字1〜3桁]」（例: cpc 123 45）。端に「za」または国旗エンブレムが入る場合あり,英語（国道・高速は英語のみ。一部地方自治体で多言語併記あり）] / preview_gemma-4-31B-it=[英語]
```

### LS レソト

```
gpt-oss-120b=[ソト語 (sesotho),英語 (english)] / preview_Kimi-K2.6=[en,st] / preview_Qwen3.6-35B-A3B=[ラテン文字,左側通行,白地に黒文字。上部に「ls」の文字。フォーマットは「ls [アルファベット] [数字]」など,英語とセソト語（ソト語）の併記が標準] / preview_gemma-4-31B-it=[英語]
```

### SZ エスワティニ

```
gpt-oss-120b=[スワジ語 (siswati),英語 (english)] / preview_Kimi-K2.6=[en,ss] / preview_Qwen3.6-35B-A3B=[ラテン文字,左側通行,白地に黒文字。上部に「sz」の文字。フォーマットは「sz [アルファベット] [数字]」など,英語とシスワティ語（スワティ語）の併記] / preview_gemma-4-31B-it=[英語]
```

### MG マダガスカル

```
gpt-oss-120b=[フランス語 (french),マダガスカル語 (malagasy)] / preview_Kimi-K2.6=[fr] / preview_Qwen3.6-35B-A3B=[マダガスカル語とフランス語の併記（主要道路・都市部は両語併記が基本）,ラテン文字,右側通行,白地に黒文字。上部に「madagascar」または「mg」の文字。フォーマットは「[アルファベット] [数字] [アルファベット] [数字]」など（例: a 123 b 456）] / preview_gemma-4-31B-it=[フランス語]
```

### RE レユニオン

```
gpt-oss-120b=[フランス語 (ラテン文字)] / preview_Kimi-K2.6=[フランス語] / preview_Qwen3.6-35B-A3B=[réunion,レユニオン] / preview_gemma-4-31B-it=[フランス語]
```

### IN インド

```
gpt-oss-120b=[ヒンディー語 (デーヴァナーガリー),英語 (ラテン文字)] / preview_Kimi-K2.6=[english,hindi] / preview_Qwen3.6-35B-A3B=[india,インド] / preview_gemma-4-31B-it=[ヒンディー語,英語]
```

### LK スリランカ

```
gpt-oss-120b=[シンハラ語 (シンハラ文字),タミル語 (タミル文字),英語 (ラテン文字)] / preview_Kimi-K2.6=[english,sinhala,tamil] / preview_Qwen3.6-35B-A3B=[sri lanka,スリランカ] / preview_gemma-4-31B-it=[シンハラ語,タミル語,英語]
```

### BD バングラデシュ

```
gpt-oss-120b=[ベンガル語 (ベンガル文字),英語 (ラテン文字)] / preview_Kimi-K2.6=[bengali,english] / preview_Qwen3.6-35B-A3B=[bangladesh,バングラデシュ] / preview_gemma-4-31B-it=[ベンガル語,英語]
```

### NP ネパール

```
gpt-oss-120b=[ネパール語 (デーヴァナーガリー),英語 (ラテン文字)] / preview_Kimi-K2.6=[english,nepali] / preview_Qwen3.6-35B-A3B=[nepal,ネパール] / preview_gemma-4-31B-it=[ネパール語,英語]
```

### BT ブータン

```
gpt-oss-120b=[ゾンカ語 (チベット文字),英語 (ラテン文字)] / preview_Kimi-K2.6=[dzongkha,english] / preview_Qwen3.6-35B-A3B=[bhutan,ブータン] / preview_gemma-4-31B-it=[ゾンカ語,英語]
```

### TH タイ

```
gpt-oss-120b=[タイ語（タイ文字）,英語（ラテン文字）] / preview_Kimi-K2.6=[english,thai] / preview_Qwen3.6-35B-A3B=[タイ語,英語（併記）] / preview_gemma-4-31B-it=[タイ語,英語]
```

### KH カンボジア

```
gpt-oss-120b=[クメール語（クメール文字）,英語（ラテン文字）] / preview_Kimi-K2.6=[english,khmer] / preview_Qwen3.6-35B-A3B=[クメール語,英語（併記）] / preview_gemma-4-31B-it=[クメール語,英語]
```

### VN ベトナム

```
gpt-oss-120b=[ベトナム語（ラテン文字）] / preview_Kimi-K2.6=[vietnamese] / preview_Qwen3.6-35B-A3B=[ベトナム語,英語（併記）] / preview_gemma-4-31B-it=[ベトナム語]
```

### MY マレーシア

```
gpt-oss-120b=[マレー語（ラテン文字）,英語（ラテン文字）] / preview_Kimi-K2.6=[chinese,english,malay,tamil] / preview_Qwen3.6-35B-A3B=[マレー語,英語（併記）] / preview_gemma-4-31B-it=[マレー語,英語]
```

### SG シンガポール

```
gpt-oss-120b=[タミル語（タミル文字）,マレー語（ラテン文字）,中国語（繁体字）,英語（ラテン文字）] / preview_Kimi-K2.6=[chinese,english,malay,tamil] / preview_Qwen3.6-35B-A3B=[英語] / preview_gemma-4-31B-it=[英語]
```

### ID インドネシア

```
gpt-oss-120b=[インドネシア語（ラテン文字）] / preview_Kimi-K2.6=[indonesian] / preview_Qwen3.6-35B-A3B=[インドネシア語,英語（併記）] / preview_gemma-4-31B-it=[インドネシア語]
```

### PH フィリピン

```
gpt-oss-120b=[フィリピン語（タガログ語）,英語] / preview_Kimi-K2.6=[フィリピン語,英語] / preview_Qwen3.6-35B-A3B=[] / preview_gemma-4-31B-it=[英語]
```

### HK 香港

```
gpt-oss-120b=[繁体字中国語,英語] / preview_Kimi-K2.6=[中国語（広東語）,英語] / preview_Qwen3.6-35B-A3B=[chinese,english,french] / preview_gemma-4-31B-it=[中国語(繁体字),英語]
```

### TW 台湾

```
gpt-oss-120b=[繁体字中国語,英語] / preview_Kimi-K2.6=[中国語（北京語/台湾国語）,英語] / preview_Qwen3.6-35B-A3B=[chinese,traditional_chinese] / preview_gemma-4-31B-it=[中国語(繁体字)]
```

### KR 韓国

```
gpt-oss-120b=[ハングル,英語] / preview_Kimi-K2.6=[英語,韓国語] / preview_Qwen3.6-35B-A3B=[korean] / preview_gemma-4-31B-it=[英語,韓国語]
```

### JP 日本

```
gpt-oss-120b=[ひらがな,カタカナ,漢字,英語] / preview_Kimi-K2.6=[日本語,英語] / preview_Qwen3.6-35B-A3B=[japanese] / preview_gemma-4-31B-it=[日本語,英語]
```

### AU オーストラリア

```
gpt-oss-120b=[英語] / preview_Kimi-K2.6=[英語] / preview_Qwen3.6-35B-A3B=[english] / preview_gemma-4-31B-it=[英語]
```

### NZ ニュージーランド

```
gpt-oss-120b=[english (英語),māori (マオリ語)] / preview_Kimi-K2.6=[english,japanese] / preview_Qwen3.6-35B-A3B=[] / preview_gemma-4-31B-it=[英語]
```

### US アメリカ

```
gpt-oss-120b=[english (英語)] / preview_Kimi-K2.6=[english] / preview_Qwen3.6-35B-A3B=[] / preview_gemma-4-31B-it=[英語]
```

### CA カナダ

```
gpt-oss-120b=[english (英語),french (フランス語)] / preview_Kimi-K2.6=[english,french] / preview_Qwen3.6-35B-A3B=[] / preview_gemma-4-31B-it=[フランス語,英語]
```

### MX メキシコ

```
gpt-oss-120b=[spanish (スペイン語)] / preview_Kimi-K2.6=[spanish] / preview_Qwen3.6-35B-A3B=[] / preview_gemma-4-31B-it=[スペイン語]
```

### GT グアテマラ

```
gpt-oss-120b=[spanish (スペイン語)] / preview_Kimi-K2.6=[spanish] / preview_Qwen3.6-35B-A3B=[] / preview_gemma-4-31B-it=[スペイン語]
```

### CR コスタリカ

```
gpt-oss-120b=[spanish (スペイン語)] / preview_Kimi-K2.6=[spanish] / preview_Qwen3.6-35B-A3B=[] / preview_gemma-4-31B-it=[スペイン語]
```

### PA パナマ

```
gpt-oss-120b=[文字体系：ラテン文字（アルファベット）,標識に表記される言語：スペイン語,走行側：右側通行] / preview_Kimi-K2.6=[スペイン語] / preview_Qwen3.6-35B-A3B=[panama] / preview_gemma-4-31B-it=[スペイン語,英語]
```

### DO ドミニカ共和国

```
gpt-oss-120b=[文字体系：ラテン文字（アルファベット）,標識に表記される言語：スペイン語,走行側：右側通行] / preview_Kimi-K2.6=[スペイン語] / preview_Qwen3.6-35B-A3B=[dominican republic] / preview_gemma-4-31B-it=[スペイン語]
```

### PR プエルトリコ

```
gpt-oss-120b=[文字体系：ラテン文字（アルファベット）,標識に表記される言語：スペイン語、英語（バイリンガル表記）,走行側：右側通行] / preview_Kimi-K2.6=[スペイン語,英語] / preview_Qwen3.6-35B-A3B=[puerto rico] / preview_gemma-4-31B-it=[スペイン語,英語]
```

### CO コロンビア

```
gpt-oss-120b=[文字体系：ラテン文字（アルファベット）,標識に表記される言語：スペイン語,走行側：右側通行] / preview_Kimi-K2.6=[スペイン語] / preview_Qwen3.6-35B-A3B=[colombia] / preview_gemma-4-31B-it=[スペイン語]
```

### EC エクアドル

```
gpt-oss-120b=[文字体系：ラテン文字（アルファベット）,標識に表記される言語：スペイン語,走行側：右側通行] / preview_Kimi-K2.6=[スペイン語] / preview_Qwen3.6-35B-A3B=[ecuador] / preview_gemma-4-31B-it=[スペイン語]
```

### PE ペルー

```
gpt-oss-120b=[文字体系：ラテン文字（アルファベット）,標識に表記される言語：スペイン語（ペルー国内の標識では、一部地域でケチュア語が併記されることもある）,走行側：右側通行] / preview_Kimi-K2.6=[スペイン語] / preview_Qwen3.6-35B-A3B=[peru] / preview_gemma-4-31B-it=[スペイン語]
```

### BO ボリビア

```
gpt-oss-120b=[アイマラ語・ケチュア語 (ラテン文字)（一部標識）,スペイン語 (ラテン文字)] / preview_Kimi-K2.6=[es] / preview_Qwen3.6-35B-A3B=[spainese] / preview_gemma-4-31B-it=[スペイン語]
```

### BR ブラジル

```
gpt-oss-120b=[ポルトガル語 (ラテン文字)] / preview_Kimi-K2.6=[pt] / preview_Qwen3.6-35B-A3B=[portuguese] / preview_gemma-4-31B-it=[ポルトガル語]
```

### PY パラグアイ

```
gpt-oss-120b=[スペイン語 (ラテン文字)] / preview_Kimi-K2.6=[es,gn] / preview_Qwen3.6-35B-A3B=[guarani,spanish] / preview_gemma-4-31B-it=[スペイン語]
```

### UY ウルグアイ

```
gpt-oss-120b=[スペイン語 (ラテン文字)] / preview_Kimi-K2.6=[es] / preview_Qwen3.6-35B-A3B=[spanish] / preview_gemma-4-31B-it=[スペイン語]
```

### CL チリ

```
gpt-oss-120b=[スペイン語 (ラテン文字)] / preview_Kimi-K2.6=[es] / preview_Qwen3.6-35B-A3B=[spanish] / preview_gemma-4-31B-it=[スペイン語]
```

### AR アルゼンチン

```
gpt-oss-120b=[スペイン語 (ラテン文字)] / preview_Kimi-K2.6=[es] / preview_Qwen3.6-35B-A3B=[spanish] / preview_gemma-4-31B-it=[スペイン語]
```

## `traffic_side` のモデル別回答一覧

**多数決が誤る場合がある。** 実測でガーナは 3 モデルが `left` と答えたが、
正解は `right` であり、唯一正解したモデルが少数派だった。

不一致のあった国は、必ず一次情報で確認すること。

| 国 | 採用値 | gpt-oss-120b | Kimi-K2.6 | Qwen3.6-35B-A3B | gemma-4-31B-it |
|---|---|---|---|---|---|
| GH ガーナ | **right** | left | right | left | left |
| NG ナイジェリア | **right** | right | right | left | right |
| RW ルワンダ | **right** | right | right | left | right |
| BT ブータン | **left** | left | left | left | right |
| KH カンボジア | **right** | left | right | right | right |
| ID インドネシア | **left** | left | left | right | left |
| PH フィリピン | **right** | right | right | right | left |
| HK 香港 | **left** | left | left | left | right |
| AU オーストラリア | **left** | right | left | left | left |

## `languages` は採用値を作っていない

自由記述にしたため表記揺れが激しく、機械的な突き合わせが成立しなかった。

```
同一言語の表記揺れ  : chinese / 中国語(繁体字) / 繁体字中国語 / 中国語（広東語）
                      fr / フランス語 / フランス語 (french)
フィールドの取り違え: MG に「右側通行」「白地に黒文字。上部に MADAGASCAR ...」
                      PR に「puerto rico」「走行側：右側通行」
```

**得られた教訓：複数モデルで突き合わせるフィールドは enum にしておく必要がある。**

`traffic_side`（2 値）と `scripts`（20 値）は enum のため綺麗に比較できた。
`languages` を自由記述にしたのは設計上の誤りである。

`languages` は `script` スロットの下書きにしか使わず、絞り込み力の計算には
用語辞書の `countries` を使うため、採用値がなくても実害はない。
モデル別の生の出力を `languages_by_model` に保持しており、タグ付け時の参考にできる。

## 人手による訂正

### 適用済み

- **GH** `traffic_side`: left → right
  - 根拠: ガーナは1974年に左側通行から右側通行へ変更している。4モデルのうち3モデルがleftと回答し多数決が誤った。正解したのはpreview/Kimi-K2.6のみ。GeoGuessrプレイヤーが確認済み。

### 確認済み（多数決が正しかったもの）

値は変更していない。人間が確認したことを記録している。

- **KZ** `scripts` = `[cyrillic, latin]`
  - キリル文字とラテン文字の併用。Kimi-K2.6 が scripts を空配列で返したため disputed になっていた。Plonk It のカザフスタンのページ（https://www.plonkit.net/kazakhstan）で確認。カザフ語固有の文字が判別の手がかりになる。
- **NG** `traffic_side` = `right`
  - Qwen3.6-35B-A3B のみ left と誤答。多数決は正しかった。
- **RW** `traffic_side` = `right`
  - Qwen3.6-35B-A3B のみ left と誤答。東アフリカで唯一の右側通行であり、ケニア・ウガンダとの弁別に使える。
- **BT** `traffic_side` = `left`
  - gemma-4-31B-it のみ right と誤答。
- **KH** `traffic_side` = `right`
  - gpt-oss-120b のみ left と誤答。
- **ID** `traffic_side` = `left`
  - Qwen3.6-35B-A3B のみ right と誤答。
- **PH** `traffic_side` = `right`
  - gemma-4-31B-it のみ left と誤答。
- **HK** `traffic_side` = `left`
  - gemma-4-31B-it のみ right と誤答。台湾は右側通行であり、繁体字を共有する2地域の弁別に使える。
- **AU** `traffic_side` = `left`
  - gpt-oss-120b のみ right と誤答。採点用に選定したモデルが基本的な事実を誤った例。

## 人手確認の優先順位

1. `traffic_side` の不一致（二値の事実。誤りは致命的。**多数決を信用しない**）
2. `scripts` の不一致（絞り込み力の分母に直結する）
3. 出題する 10 カ国と難易度 3 のクラスタに属する国
4. `languages_by_model`（採用値なし。タグ付け時に目視で参照する）
