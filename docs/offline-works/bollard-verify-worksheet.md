# ボラード矛盾の実物確認ワークシート

AIの回答と人間の記憶が食い違うボラードについて、人間側で確認した結果を記録する。

## 1. 🇮🇸 Iceland

- 本体は**黄色**。
- 上部に**白い斜めの部分**が付いている。

```yaml
country: IS
bollard:
  body_color: yellow
  upper_section:
    color: white
    shape: diagonal
```

「白いボラード」とだけ記述せず、**黄色い本体＋上部の白い斜め部分**として覚える。

## 2. 🇵🇱 Poland

- 本体は**白**。
- **赤い斜めの帯**がある。
- 反射板はその帯に沿って配置され、**平行四辺形**。
- 前面は**赤**、後面は**白**。
- 裏面にも赤い帯が続くため特徴的。

```yaml
country: PL
bollard:
  body_color: white
  diagonal_band:
    color: red
  reflector:
    shape: parallelogram
    aligned_with: diagonal_band
    front_color: red
    rear_color: white
  rear:
    red_band_continues: true
```

単に `red reflector` ではなく、**白本体＋斜め赤帯＋平行四辺形反射板**という構造をアンカーにする。

## 3. 🇻🇳 Vietnam

- 「マッチ棒」のような形。
- **角の取れた白い四角柱**。
- 天辺が**赤**。

```yaml
country: VN
bollard:
  overall_shape: matchstick_like
  body:
    color: white
    cross_section: rounded_square
  top:
    color: red
```

## 4. 🇰🇭 Cambodia

### Type A：ベトナム型に近いもの

- 白い角の取れた四角柱
- 天辺が赤い
- ベトナムのボラードと似た「マッチ棒」型

```yaml
country: KH
bollard:
  type: vietnam_like
  body:
    color: white
    cross_section: rounded_square
  top:
    color: red
```

### Type B：赤いストライプを持つ別タイプ

- 本体部分にも赤い塗装がある。
- 赤い部分が**ストライプ状**になっている。

```yaml
country: KH
bollard:
  type: red_striped_variant
  body:
    has_red_paint: true
    red_paint_pattern: stripes
```

## Vietnam ↔ Cambodia の lookalike

```text
白い角の取れた四角柱
        +
赤い天辺
        ↓
   Vietnam / Cambodia
        ↓
カンボジアには赤ストライプ型も存在
        ↓
本体の赤ストライプが見える
        → Cambodia を強く考える
```

したがって、**「白い四角柱＋赤い天辺＝ベトナム確定」ではない**。これは共有メタとして扱う。

## 今回確認した4件

| 国 | 強い視覚アンカー | 注意点 |
|---|---|---|
| IS | 黄色い本体＋白い斜め上部 | 白い部分だけを本体と誤認しない |
| PL | 白本体＋斜め赤帯＋平行四辺形反射板 | 裏面にも赤帯が続く |
| VN | 角の取れた白い四角柱＋赤い天辺 | Cambodiaにも類似型あり |
| KH | ベトナム型＋赤ストライプ型 | Vietnamとの共有メタに注意 |

## 残りの未確認項目

以下はAI側の回答が弱いため、現時点では無理に埋めない。

- Denmark：反射板の色、本体の塗り分け
- Belgium：反射板の色
- Spain：反射板の色、反射板周囲
- Estonia：反射板の色
- Latvia：反射板の色、反射板周囲
- France：太さ
- New Zealand：裏面

**空欄は未完成ではなく、未検証データとして扱う。**

## データ化の原則

ボラードは単独の国ラベルではなく、

```yaml
bollard:
  visual_anchor: []
  structure: {}
  shared_with: []
  lookalike: []
  tie_breaker: []
```

のように構造と混同先を持たせる。

特に、「この特徴は国Aだけにある」と「この特徴は国Aと国Bに共有されているが、別の特徴で分けられる」を明確に区別する。
