/**
 * ボラードの軸を出典から埋める（AI 未使用、消費 0）。
 *
 * ## なぜボラードか
 *
 * 人手ワークシート §14 に**「ボラードを見つける | 強い」**と書いてある。
 * 覚えていれば候補を一気に絞れる、というのが本人の実感である。
 *
 * それでも被覆は 13%（102 カ国のうち 13）だった。人手記述の 12 語は
 * **見た目の属性で分けてあり**（全体が黄色 / 白本体＋黄色反射板＋帯あり）、
 * 精度は高いが数が足りない。
 *
 * ## 1 カ国の用語を避けない
 *
 * 他の欄では「1 カ国しかない用語」は作りすぎないようにした。
 * **ボラードは逆である。** 国が設計を標準化しているため、
 * **1 カ国に落ちる用語がいくつも成立し、それが最強の絞り込みになる。**
 *
 * > **弱い軸を並べても足し算にならないが、強い軸は 1 つで足りる。**
 *
 * 同時に、8 カ国が同じ設計を共有する族（赤い長方形＋裏が白）もある。
 * **族で候補を作り、細部で割る**という順序がそのまま `nextPriority` になる。
 *
 * ## 出典
 *
 * Bollards — Geometas  https://geometas.com/metas/categories/bollards/
 *
 * Geometas は Plonk It と The Digital Labyrinth を出典として明記している。
 * **記述はこちらの語彙に言い換えている**（`plain` は素人語である）。
 * 人手記述の 12 語は上書きしない。**別の用語として持つ。**
 *
 * 使い方: node tools/add-bollard-terms.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const HUMAN_PATH = path.join('data', 'glossary-human.json')
const SRC = 'https://geometas.com/metas/categories/bollards/'

const countries = new Set(
    JSON.parse(fs.readFileSync(path.join('data', 'countries.json'), 'utf8')).map((c) => c.code),
)

const AXES = [
    {
        id: 'ref_bollard_red_rectangle_front_white_back',
        canonical: '正面に赤い長方形・裏は白い長方形',
        plain: '前から見ると赤い四角、後ろから見ると白い四角',
        aliases: ['赤い長方形のボラード', '前が赤くて後ろが白い杭'],
        codes: ['HU', 'HR', 'MK', 'BG', 'UA', 'RS', 'SI', 'ME'],
        note: '**族としては中程度（8 カ国）。細部で割る。**'
            + 'セルビアは赤い長方形が**中心からずれている。**'
            + 'ウクライナは長方形が**他より横に広く、傷んでいることが多い。**'
            + '> **族で候補を作り、細部で割る。** それが観察の順序である。',
        confusableWith: ['ref_bollard_red_rectangle_offset'],
    },
    {
        id: 'ref_bollard_red_rectangle_offset',
        canonical: '赤い長方形が中心からずれている',
        plain: '赤い四角が真ん中じゃなくて片側に寄っている',
        aliases: ['赤い四角が片寄り', 'ずれた赤い長方形'],
        codes: ['RS'],
        note: '**非常に強い。1 カ国。**スロベニアやモンテネグロと同型に見えるが、'
            + '**赤い長方形の位置が中心でないのはセルビアである。**',
        confusableWith: ['ref_bollard_red_rectangle_front_white_back'],
    },
    {
        id: 'ref_bollard_fluoro_orange_stripes',
        canonical: '黒い部分に蛍光オレンジの縞',
        plain: '黒いところに光るオレンジの線が入っている',
        aliases: ['蛍光オレンジの縞', 'オレンジの線が入った杭'],
        codes: ['CZ', 'SK'],
        note: '**非常に強い。2 カ国。**この蛍光オレンジは他に無い。'
            + '**チェコとスロバキアはこの特徴では割れない。** '
            + '人手ワークシート §13 の「チェコとスロバキアで迷う」がここに対応する。'
            + '割るには別の欄（ナンバープレート・標識・言語）へ移る。',
    },
    {
        id: 'ref_bollard_vertical_red_in_black_diagonal',
        canonical: '黒い斜め帯の中に縦長の赤い長方形',
        plain: '黒い斜めの帯があって、その中に縦長の赤い四角がある',
        aliases: ['縦長の赤い長方形', '黒い斜め帯のボラード'],
        codes: ['IT', 'AL'],
        note: '**非常に強い。2 カ国。**縦長の赤い長方形はボラードでは珍しい。'
            + '黒い部分が**頂部まで伸びる**のも特徴。裏は白い長方形。'
            + '人手ワークシート §13 の「イタリアだと思ったらアルバニアだった」がここである。',
    },
    {
        id: 'ref_bollard_dark_reflector_black_top',
        canonical: '黒っぽい反射板＋黒い頭',
        plain: '反射板が黒っぽくて、頭のところも黒い',
        aliases: ['黒い反射板', '黒い帽子のボラード'],
        codes: ['AT'],
        note: '**非常に強い。1 カ国。**反射板が黒か暗い赤で、かつ頂部が黒い。'
            + '**この 2 つを併せ持つ国は他に無い。**',
    },
    {
        id: 'ref_bollard_cylindrical',
        canonical: '円柱形（正面から見て丸い）',
        plain: '正面から見ると丸い筒みたいな形',
        aliases: ['円柱のボラード', '丸い筒の杭'],
        codes: ['FI', 'EE', 'CH'],
        note: '**強い。3 カ国。**フィンランドは**北欧では唯一**この形である'
            + '（人手ワークシート §13 の「ノルウェーとスウェーデンで迷う」の外側にある）。'
            + 'スイスは湾曲した円柱形。エストニアは正面に長方形、裏に丸 2 つ。',
    },
    {
        id: 'ref_bollard_red_diagonal_wrap',
        canonical: '赤い斜めの帯が巻き付いている',
        plain: '赤い線が斜めにぐるっと巻いている',
        aliases: ['斜めに巻いた赤い帯'],
        codes: ['PL'],
        note: '**非常に強い。1 カ国。**帯が巻き付く形は他に無い。',
    },
    {
        id: 'ref_bollard_white_vertical_strip',
        canonical: '正面に白い縦帯・裏に白い丸2つ',
        plain: '前に白い縦線、後ろに白い丸が2つ',
        aliases: ['白い縦帯のボラード'],
        codes: ['DE'],
        note: '**非常に強い。1 カ国。**'
            + '人手ワークシート §13 の「バルト三国だと思ったらドイツだった」に効く。'
            + 'ラトビアは正面が**白い長方形**で縦帯ではない。',
        confusableWith: ['ref_bollard_thin_white_rectangle'],
    },
    {
        id: 'ref_bollard_thin_white_rectangle',
        canonical: '細身・正面に白い長方形・裏に白い丸2つ',
        plain: '細い杭で、前に白い四角、後ろに白い丸が2つ',
        aliases: ['細い白い長方形のボラード'],
        codes: ['LV'],
        note: '**非常に強い。1 カ国。**ドイツの縦帯と混同しやすい。'
            + '**縦帯か長方形かを見る。**',
        confusableWith: ['ref_bollard_white_vertical_strip'],
    },
    {
        id: 'ref_bollard_wedge_shape',
        canonical: 'くさび形（上が斜めに切られた形）',
        plain: '上が斜めに切られたような形',
        aliases: ['くさび形のボラード', '斜めに切られた杭'],
        codes: ['GR', 'ES', 'LT', 'LU', 'SE'],
        note: '**族としては中程度（5 カ国）。反射板の色で割る。**'
            + 'ギリシャは正面が赤・裏が白。スペインは正面がオレンジ・裏に白い丸 2 つ（中空）。'
            + 'リトアニアは正面がオレンジ・裏が白。ルクセンブルクは正面が灰色・裏に丸 2 つ。'
            + 'スウェーデンは黒白でくさび形以外の形もある。',
    },
    {
        id: 'ref_bollard_cigarette_shape',
        canonical: 'タバコのような白い細長い形',
        plain: '白くて細長い、タバコみたいな形',
        aliases: ['タバコ型のボラード', '細長い白い杭'],
        codes: ['MX', 'PE'],
        note: '**強い。2 カ国。**メキシコは根元近くが黒く、裏側が黄色。'
            + 'ペルーは黒い縞がある場合と無い場合がある。'
            + '人手ワークシート §13 の「ペルーやボリビアだと思ったらメキシコだった」に効く。'
            + '**根元の黒と裏の黄色があればメキシコである。**',
    },
    {
        id: 'ref_bollard_red_white_alternating',
        canonical: '赤と白が交互',
        plain: '赤と白が交互に塗られている',
        aliases: ['赤白の縞のボラード', '紅白の杭'],
        codes: ['BD', 'KH'],
        note: '**強い。2 カ国。**バングラデシュは**煙突のような形**で赤白の区画が交互。'
            + '短いものは区画が少ない。カンボジアは縞か、上下 2 区画に分かれる。',
    },
    {
        id: 'ref_bollard_black_white_square',
        canonical: '黒と白が交互・断面が四角',
        plain: '黒と白が交互で、四角い柱',
        aliases: ['黒白の四角い杭'],
        codes: ['TH'],
        note: '**非常に強い。1 カ国。**断面が四角いのが特徴。'
            + 'スウェーデンも黒白だが形が違う（くさび形・丸・細く湾曲）。',
        confusableWith: ['ref_bollard_wedge_shape'],
    },
    {
        id: 'ref_bollard_stone_marker',
        canonical: '石でできた小さな標石',
        plain: 'コンクリートや石の小さな標識みたいなもの',
        aliases: ['石の標石', '石の道路標識'],
        codes: ['LK', 'BT'],
        note: '**強い。2 カ国。**スリランカは白と黒の小さな石。'
            + 'ブータンは白と黄色で、**次の集落までの距離が書かれている**（裏は反対方向）。'
            + '石板が長く並ぶ光景もブータンで見られる。',
    },
    {
        id: 'ref_bollard_white_red_front_grey_back',
        canonical: '白い本体・正面に赤い反射板・裏は灰色',
        plain: '白い杭で、前が赤くて後ろが灰色',
        aliases: ['白い杭に赤い反射板'],
        codes: ['AU', 'NL', 'TR'],
        note: '**族としては強い（3 カ国）。**'
            + '**トルコは長方形がやや太い。** そこで割る。'
            + '人手ワークシート §13 の「オーストラリアだと思ったら南アフリカだった」は'
            + '別の軸（南アフリカは細い赤白のシェブロン）で割る。',
    },
    {
        id: 'ref_bollard_red_band_upper',
        canonical: '上のほうに赤い帯が巻いている',
        plain: '上のあたりに赤い帯が一周している',
        aliases: ['上が赤い帯のボラード'],
        codes: ['NZ'],
        note: '**非常に強い。1 カ国。**オーストラリアは正面の赤い反射板で、帯ではない。',
        confusableWith: ['ref_bollard_white_red_front_grey_back'],
    },
    {
        id: 'ref_bollard_black_white_red_top',
        canonical: '黒白の区画＋上部に大きな赤い長方形',
        plain: '黒と白に分かれていて、上に大きな赤い四角',
        aliases: ['上が赤い大きな四角のボラード'],
        codes: ['GB'],
        note: '**非常に強い。1 カ国。**'
            + '**イギリスではボラード自体が少ない**（欧州の他国に比べて）。'
            + 'あれば強いが、無いことを手がかりにしない。',
    },
    {
        id: 'ref_bollard_yellow_front_only',
        canonical: '正面だけ黄色い区画がある',
        plain: '前だけ黄色い部分があって、後ろには無い',
        aliases: ['前だけ黄色いボラード'],
        codes: ['DK'],
        note: '**非常に強い。1 カ国。**デンマークは国中にボラードが多い。'
            + '**アイスランドは全体が黄色**なので別である（人手記述 `bollard_all_yellow`）。',
    },
]

const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const terms = Array.isArray(human) ? human : human.terms

console.log('ボラードの軸を出典から追加する（AI 未使用、消費 0）')
console.log('')

let added = 0
for (const axis of AXES) {
    const unique = [...new Set(axis.codes)].sort()
    const kept = unique.filter((c) => countries.has(c))
    const dropped = unique.filter((c) => !countries.has(c))

    console.log(`  ${String(kept.length).padStart(2)} カ国  ${axis.canonical}`)
    if (dropped.length) console.log(`          seed に無いため除外: ${dropped.join(' ')}`)

    if (terms.some((t) => t.id === axis.id)) {
        console.log('          既にある')
        continue
    }
    if (kept.length === 0) {
        console.log('          **seed に該当国が無いので入れない**')
        continue
    }
    terms.push({
        id: axis.id,
        slot: 'bollard',
        canonical: axis.canonical,
        plain: axis.plain,
        aliases: axis.aliases,
        countries: kept,
        confusableWith: axis.confusableWith ?? [],
        note: axis.note,
        verifiedByHuman: false,
        disputed: false,
        kind: 'atomic',
        certainty: 'heuristic',
        source: 'reference',
        sources: [SRC],
    })
    added += 1
}

fs.writeFileSync(HUMAN_PATH, `${JSON.stringify(Array.isArray(human) ? terms : human, null, 4)}\n`, 'utf8')
console.log('')
console.log(`追加した用語: ${added} 件（人手記述は ${terms.length} 語になった）`)
console.log('')
console.log('**人手記述の 12 語は上書きしていない。** 見た目の属性で分けた本人の記述と、')
console.log('国ごとの設計を記した出典は別のものである。')
