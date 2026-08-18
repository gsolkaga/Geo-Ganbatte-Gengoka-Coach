# 掛け合わせて正解に届くか（AI 未使用、消費 0）

生成: 2026-08-18T01:18:25.872Z　`node tools/combo-report.mjs`

## 測る対象を間違えていた

`npm run coverage`（欄ごとの被覆）は「入力しても反応が無い欄」を潰す指標であり、
**「国に届くか」の指標ではない。**

キリル文字の言語固有字を足したとき `script` 単独で 11 カ国が 1 カ国になった。
しかし**そんな字が読めるのは幸運である。** 実戦は弱い手がかりを掛けて絞る。

> **1 つの欄で決まることを期待する設計は、決まらなかったときに何も言えない。**

## 出題ごとの到達点

正解タグの観察を、**毎回いちばん強く縮む欄から**貪欲に掛けた結果である。
正解を落とす欄は選んでいない。

| 問 | 正解 | 掛け合わせに使える欄 | 到達 | 経路 |
|---|---|---|---|---|
| q-jp-01 | JP | 1 | **1 カ国** | `script`(1)→1 |
| q-th-01 | TH | 4 | **1 カ国** | `script`(1)→1 |
| q-tr-01 | TR | 2 | **1 カ国** | `sign`(1)→1 |
| q-br-01 | BR | 3 | **1 カ国** | `vehicle`(1)→1 |
| q-au-01 | AU | 1 | **24 カ国** | `traffic_side`(24)→24 |
| q-is-01 | IS | 0 | **算出不能** | （なし） |
| q-bg-01 | BG | 2 | **11 カ国** | `script`(11)→11 |
| q-ru-01 | RU | 3 | **10 カ国** | `script`(11)→11 `road_marking`(85)→10 |
| q-kz-01 | KZ | 3 | **1 カ国** | `script`(1)→1 |
| q-za-01 | ZA | 4 | **1 カ国** | `sign`(3)→3 `traffic_side`(24)→1 |

`欄(単独の国数)→掛けた後の国数` の順に読む。

## まとめ

| 到達 | 件数 |
|---|---|
| **1 カ国まで届いた** | 6 / 10 |
| 複数カ国で止まった | 3 |
| 算出不能（使える用語が無い） | 1 |

### 止まった出題と残った候補

- `q-au-01`（正解 AU）→ 24 カ国 [AU BD BT BW CY GB HK ID IE IN JP KE LK LS MT MY NA NP NZ SG SZ TH UG ZA]
- `q-bg-01`（正解 BG）→ 11 カ国 [BA BG KG KZ MK MN RS RU UA UZ XK]
- `q-ru-01`（正解 RU）→ 10 カ国 [BA BG KG KZ MK MN RS RU UA XK]

**残った候補を割る軸が辞書に無い、または正解タグに記録されていない。**
どちらなのかは正解タグの記述を読めば分かる。
- 記述があるのに用語が無い → **辞書に足す**
- 記述が無い → **その地点でその特徴が見えていない。足しても意味がない**

## 絞り込みに使えないが、説明はできる手がかり

`exhaustive: false` の用語は積集合に入れない。ユーカリを入れれば
ポルトガル・スペイン・ブラジルを誤って消してしまう。

**しかし完全に捨てるのも誤りだった。** オーストラリアの出題では
学習者が「ユーカリの木だらけ」と書き、`ref_flora_eucalyptus`（該当国 AU）が
割り当てられているのに、応答のどこにも現れていなかった。

> **絞り込みに使えないことと、言うべきことが無いことは別である。**

`buildNonExhaustiveHints` で別枠として渡す。件数は書かない。
**件数を書くと絞り込み力に見える。**

- `q-tr-01`（正解 TR）
    - `vehicle` EU 式の青い縦帯（左端） → よく見られる国 [AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK TR]
- `q-au-01`（正解 AU）
    - `terrain_vegetation` ユーカリ（背が高く樹皮が白い木） → よく見られる国 [AU]
- `q-is-01`（正解 IS）
    - `terrain_vegetation` 草しかなく樹木がない → よく見られる国 [IS]
- `q-bg-01`（正解 BG）
    - `vehicle` EU 式の青い縦帯（左端） → よく見られる国 [AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK TR]
- `q-za-01`（正解 ZA）
    - `ground` 赤い土 → よく見られる国 [BR LK UG ZA]

## 用語は入っているのに絞り込みに使えない欄

**被覆率を上げても到達が上がらない原因はここにある。**
画面上は欄が埋まっているが、中身が積集合に入らない。

- `q-jp-01` terrain_vegetation(AI生成) pavement(AI生成)
- `q-th-01` vehicle(AI生成)
- `q-tr-01` vehicle(AI生成・網羅でない)
- `q-br-01` script(AI生成) pavement(AI生成)
- `q-au-01` bollard(AI生成) ground(AI生成) terrain_vegetation(網羅でない) vehicle(AI生成) pavement(AI生成) season(AI生成)
- `q-is-01` ground(AI生成) terrain_vegetation(網羅でない) pavement(AI生成)
- `q-bg-01` sign(AI生成) vehicle(網羅でない・AI生成) pavement(AI生成)
- `q-ru-01` pole(AI生成) vehicle(AI生成) pavement(AI生成)
- `q-kz-01` pole(AI生成) vehicle(AI生成) pavement(AI生成) season(AI生成)
- `q-za-01` pole(AI生成) ground(網羅でない) vehicle(AI生成) pavement(AI生成)

`AI生成` は増やしても到達に効かない。**出典から埋める必要がある。**

## この指標の使い方

**欄ごとの被覆ではなく、この到達点を見て辞書を足す。**
被覆を上げても、掛け合わせて届かなければ学習者は国に辿り着けない。

> **弱い手がかりを掛けて絞るのが実戦である。**
> **1 つで決まる手がかりが見えるのは幸運であって、設計の前提にできない。**
