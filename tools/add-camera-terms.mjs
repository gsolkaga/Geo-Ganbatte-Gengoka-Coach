/**
 * カーメタ（撮影車の写り込み）を出典から埋める（AI 未使用、消費 0）。
 *
 * ## 自分が使わない軸でも用意する
 *
 * 人手ワークシート §12 に**「カーメタはほぼ認知できない」**と書いてある。
 * それを理由に後回しにしたが、**判断が狭かった。**
 *
 * このアプリは 1 人のためのものではない。**他のプレイヤーはカーメタを使い、
 * フォームに入力する。** 入力されたのに辞書が何も返せないなら、
 * その学習者にとってこのアプリは動いていない。
 *
 * > **作った人が使わない軸を、無いことにしてはならない。**
 *
 * ## この軸は減っていく
 *
 * 撮影が新しい画像へ更新されるほど、**カーメタは使えなくなる。**
 * 新しい世代（Gen 4）はどの国でも似た見え方になり、
 * 旧世代に固有だった写り込みが消える。
 *
 * 出典自身がそう書いている。
 *
 * ```
 * ナイジェリア  「Generation 3 の被写域では、ルーフラックが見えることがある」
 * スリランカ    「Generation 3 では青白赤の縞。Gen 4 では低い視点になる」
 * ケニア        「2022 年以降の新しい被写域では車両が変わった」
 * ドイツ        「2023 年に国土のほぼ全域が Gen 4 へ更新された」
 * ```
 *
 * したがって**すべて `note` に「撮影世代に依存する」と書く。**
 * 用語が「いま正しい」ことと「その画像で正しい」ことは別である。
 *
 * > **消えていく手がかりであることを、手がかりと一緒に記録する。**
 *
 * ## 出典
 *
 * Google Car — Geometas  https://geometas.com/metas/categories/google_car/
 *
 * Geometas は Plonk It と The Digital Labyrinth を出典として明記している。
 * **必要な軸の分だけを取り、記述はこちらの語彙に言い換えている。**
 *
 * 使い方: node tools/add-camera-terms.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const HUMAN_PATH = path.join('data', 'glossary-human.json')
const SRC = 'https://geometas.com/metas/categories/google_car/'

/** 撮影世代への依存を全項目に付ける共通の注意 */
const GEN_CAUTION = '**撮影世代に依存する。** 新しい被写域（Gen 4）へ更新されると消えることがある。'

const countries = new Set(
    JSON.parse(fs.readFileSync(path.join('data', 'countries.json'), 'utf8')).map((c) => c.code),
)

const AXES = [
    {
        id: 'ref_camera_snorkel',
        canonical: '前部にスノーケル（吸気管）',
        plain: '車の前に太いパイプが立っている',
        aliases: ['スノーケル', '吸気管', '前に筒が立っている'],
        codes: ['KE', 'MN'],
        note: `**非常に強い。2 カ国。** ${GEN_CAUTION}`
            + 'ケニアは 2022 年以降の被写域で車両が変わり、'
            + '**スノーケルあり・アンテナあり・両方・両方なし**の 4 通りがある。',
    },
    {
        id: 'ref_camera_no_antenna_eastern_europe',
        canonical: 'アンテナが無い（東欧で）',
        plain: '東欧っぽい景色なのに車にアンテナが見えない',
        aliases: ['アンテナなし', 'アンテナが見えない'],
        codes: ['MK', 'RS'],
        note: '**無いことが手がかりである。** 東欧の多くの国ではアンテナが見えるため、'
            + `見えないこと自体が北マケドニアとセルビアを示す。${GEN_CAUTION}`
            + '> **強いのは、あることではなく無いことである。**',
    },
    {
        id: 'ref_camera_red_car_long_antenna',
        canonical: '赤い車体＋長いアンテナ',
        plain: '下を向くと赤い車で、長いアンテナが立っている',
        aliases: ['赤い車', '長いアンテナ'],
        codes: ['UA'],
        note: `**非常に強い。1 カ国。**ウクライナの大部分。${GEN_CAUTION}`,
    },
    {
        id: 'ref_camera_stubby_antenna',
        canonical: '短くて太いアンテナ',
        plain: '短くて太いアンテナが見える',
        aliases: ['太いアンテナ', '短いアンテナ', 'スタビーアンテナ'],
        codes: ['EC', 'CO'],
        note: `**強い。** エクアドルは白い車＋短く太いアンテナ。${GEN_CAUTION}`
            + 'コロンビアは Gen 3 で黒・白・灰の車に短く太いアンテナ、'
            + 'Gen 4 では白か銀の車が多い。',
    },
    {
        id: 'ref_camera_unique_antenna_panama',
        canonical: '他に例のない形のアンテナ',
        plain: '見たことのない形のアンテナが付いている',
        aliases: ['変わった形のアンテナ'],
        codes: ['PA'],
        note: `**非常に強い。1 カ国。**世界の他のどこにも無い形とされる。${GEN_CAUTION}`
            + '下を向いても常にはっきり見えるわけではない。',
    },
    {
        id: 'ref_camera_white_truck_below',
        canonical: '下に白いトラックの車体',
        plain: '下を向くと白いトラックの荷台や運転席が見える',
        aliases: ['白いトラック', '白い車体'],
        codes: ['SN', 'AE', 'QA'],
        note: `**強い。** ${GEN_CAUTION}`
            + 'セネガルは Gen 4 で銀か白のトラック。'
            + 'UAE は白、**ヨルダンは黒**なので、色で分かれる。'
            + 'UAE の Gen 4 のトラックはドバイとシャルジャだけに出る。',
        confusableWith: ['ref_camera_black_car_below'],
    },
    {
        id: 'ref_camera_black_car_below',
        canonical: '下に黒い車体',
        plain: '下を向くと黒い車体がぼんやり見える',
        aliases: ['黒い車', '黒い車体'],
        codes: ['JO', 'AR', 'UY'],
        note: `**強い。** ${GEN_CAUTION}`
            + 'ヨルダンは黒（**UAE の白と対になる**）。'
            + 'アルゼンチンとウルグアイは車の前部が黒くぼんやり写る。',
        confusableWith: ['ref_camera_white_truck_below'],
    },
    {
        id: 'ref_camera_bars_visible',
        canonical: '車体下のバー（骨組み）が見える',
        plain: '下を向くと棒みたいな枠が見える',
        aliases: ['バーが見える', '骨組みが見える', '棒が見える'],
        codes: ['BD', 'KG', 'GT', 'LA', 'MN', 'CW', 'RE'],
        note: `**中程度。複数の国で出る。**単独では絞れないので**組み合わせで使う。**${GEN_CAUTION}`
            + 'モンゴルは赤いサイドミラーやキャンプ道具のような荷物が一緒に見える。'
            + 'キルギスは白黒のサイドミラー、グアテマラは黒いミラー。'
            + 'ラオスは首都では見えない。',
    },
    {
        id: 'ref_camera_motorbike',
        canonical: 'バイクで撮影されている',
        plain: '下を向くとバイクかヘルメットが見える',
        aliases: ['バイク', 'オートバイ', 'ヘルメットが見える'],
        codes: ['VN'],
        note: `**非常に強い。1 カ国。**ベトナムはバイクで撮影されている。${GEN_CAUTION}`
            + 'バイク本体、ぼかされた輪郭、ヘルメットのいずれかが見える。',
    },
    {
        id: 'ref_camera_trekker',
        canonical: '人が担いで撮影している',
        plain: '車ではなく人が持って歩いて撮っている',
        aliases: ['トレッカー', '徒歩撮影', '人が担いでいる'],
        codes: ['PK', 'AS', 'MG'],
        note: '**単独では絞れない。**徒歩撮影は世界の多くの国に部分的に存在する。'
            + `パキスタンは被写域の全体が徒歩撮影という点が特徴である。${GEN_CAUTION}`,
    },
    {
        id: 'ref_camera_gen2_halo',
        canonical: '空にハロー・下に円形のぼかし（Gen 2）',
        plain: '空に輪っかが見える、下に丸いぼかしがある',
        aliases: ['ハロー', '空に輪', '丸いぼかし', 'Gen2'],
        codes: ['ZA'],
        note: `**強い。**第 2 世代のカメラで撮影された被写域に出る。${GEN_CAUTION}`
            + '**古い被写域ほど残っている。** 更新されると消える軸の代表である。',
    },
    {
        id: 'ref_camera_lowcam',
        canonical: '視点が低い（ローカム）',
        plain: '目線が低くて道が広く見える',
        aliases: ['ローカム', '低い視点', '道が広く見える'],
        codes: ['LK'],
        note: `**強い。**スリランカの Gen 4。${GEN_CAUTION}`
            + '周囲が低い位置から見え、道が広く見え、車が大きく丸くぼかされる。'
            + '**Gen 3 では青・白・赤の縞（フランス国旗のよう）だった。**',
    },
    {
        id: 'ref_camera_roof_rack',
        canonical: 'ルーフラックが見える',
        plain: '屋根の荷台の枠が見える',
        aliases: ['ルーフラック', '屋根の枠'],
        codes: ['NG', 'SN', 'GH', 'FO'],
        note: `**組み合わせで使う。**${GEN_CAUTION}`
            + 'ナイジェリアは Gen 3 で**黄と黒**の縞模様のラックが出ることがあり、これは固有。'
            + 'ガーナは前のバーの右端に黒いテープ。フェロー諸島は無地の灰色。',
    },
    {
        id: 'ref_camera_following_car',
        canonical: '同じ車がずっと後ろを走っている',
        plain: '同じ車が何枚も後ろについてくる',
        aliases: ['後続車', 'ついてくる車'],
        codes: ['TN'],
        note: `**非常に強い。1 カ国。**チュニジアは伴走車が写り続ける。${GEN_CAUTION}`
            + '**北部（ハンマメット以北）は明るい緑、中南部は濃い緑**で車種も違う。'
            + '地域の切り分けにも使える。',
    },
]

const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const terms = Array.isArray(human) ? human : human.terms

console.log('カーメタの軸を出典から追加する（AI 未使用、消費 0）')
console.log('')

let added = 0
for (const axis of AXES) {
    const unique = [...new Set(axis.codes)].sort()
    const kept = unique.filter((c) => countries.has(c))
    const dropped = unique.filter((c) => !countries.has(c))

    console.log(`  ${axis.canonical}`)
    console.log(`      ${kept.length} カ国: ${kept.join(' ') || '（なし）'}`)
    if (dropped.length) console.log(`      seed に無いため除外: ${dropped.join(' ')}`)

    if (terms.some((t) => t.id === axis.id)) {
        console.log('      既にある')
        continue
    }
    if (kept.length === 0) {
        console.log('      **seed に該当国が無いので入れない**')
        continue
    }
    terms.push({
        id: axis.id,
        slot: 'camera',
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
console.log('**全項目の note に「撮影世代に依存する」と書いた。**')
console.log('消えていく手がかりであることを、手がかりと一緒に記録する。')
