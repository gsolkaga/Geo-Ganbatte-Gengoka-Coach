/**
 * 標識のポールと建物の軸を出典から埋める（AI 未使用、消費 0）。
 *
 * ## 標識は「板」より「ポール」を採った
 *
 * 出典には標識の意匠（Street Sign）が 111 件あるが、**ほぼ国ごとの個別designである。**
 * 取り込むと 111 の 1 カ国用語になり、**辞書ではなく国別カタログになる。**
 *
 * 代わりに Sign Posts（18 件）を採った。こちらは
 * 「黒白の縞」「木製」「細い」といった**軸の形をしている。**
 * 素人が最初に気づくのもポールの色や太さである（板の書体ではない）。
 *
 * > **軸になっているものを取る。件数が多いものを取るのではない。**
 *
 * ## 建物でワークシートの判定フローが 1 つ完成した
 *
 * 人手ワークシート §11 にこの分岐がある。
 *
 * ```
 * 八角形電柱 → 家の電気メーターを見る → 丸形ならメキシコ
 * 八角形電柱 → 家の電気メーターを見る → 箱型＋横長の覗き窓1〜3個ならペルー
 * ```
 *
 * 前回 `ref_pole_octagonal`（MX CO GU EC、4 カ国）を入れた。
 * 今回**メキシコの丸い電気メーター**が入るので、**分岐の 2 段目が辞書に載る。**
 *
 * `nextPriority` は「次にどの欄を見れば縮むか」を計算する。
 * `pole` で 4 カ国に落ちた状態から `architecture` を見れば 1 カ国になる。
 * **本人が頭の中でやっている順序が、そのまま計算で出る。**
 *
 * ## 出典
 *
 * Sign Posts — Geometas  https://geometas.com/metas/categories/signposts/
 * Buildings  — Geometas  https://geometas.com/metas/categories/buildings/
 * （Geometas は Plonk It と The Digital Labyrinth を出典として明記している）
 *
 * 使い方: node tools/add-sign-architecture-terms.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const HUMAN_PATH = path.join('data', 'glossary-human.json')
const SRC_POSTS = 'https://geometas.com/metas/categories/signposts/'
const SRC_BUILDINGS = 'https://geometas.com/metas/categories/buildings/'

const countries = new Set(
    JSON.parse(fs.readFileSync(path.join('data', 'countries.json'), 'utf8')).map((c) => c.code),
)

const SIGN_AXES = [
    {
        id: 'ref_sign_post_black_white_stripes',
        canonical: '標識のポールが黒白の縞',
        plain: '標識を支える柱が黒と白の縞になっている',
        aliases: ['黒白の縞のポール', '縞模様の標識柱'],
        codes: ['MY', 'LK', 'PE', 'AE', 'JO', 'UY'],
        note: '**強い。世界的に珍しい配色である。**'
            + 'マレーシア・スリランカ・ペルーで多い。'
            + 'UAE も一部にあり、**ヨルダンはあるが稀。**'
            + 'ウルグアイは信号のポールが黒白か黒黄の縞。'
            + 'ペルーは**コンクリートの台座に立ち、地面より持ち上がっている**ことが多い。',
        confusableWith: ['ref_sign_post_black_yellow_stripes'],
    },
    {
        id: 'ref_sign_post_black_yellow_stripes',
        canonical: '標識のポールが黒黄の縞',
        plain: '標識の柱が黒と黄色の縞になっている',
        aliases: ['黒黄の縞のポール'],
        codes: ['BW', 'UY'],
        note: '**強い。2 カ国。**ボツワナの標識ポール。'
            + 'ウルグアイは信号のポールで黒白と黒黄の両方がある。'
            + '**黒白と見分けにくいので、黄色があるかを確かめる。**',
        confusableWith: ['ref_sign_post_black_white_stripes'],
    },
    {
        id: 'ref_sign_post_wooden',
        canonical: '標識のポールが木製',
        plain: '標識を支えているのが木の柱',
        aliases: ['木の標識柱', '木製のポール'],
        codes: ['CA', 'TH', 'UY'],
        note: '**強い。3 カ国。**カナダは木製で白く塗られることもあり、'
            + '**アメリカは金属**なので**この 1 点で北米が割れる。**'
            + 'タイは白く塗られ根元が黒い。ウルグアイは太くて白い木製。',
    },
    {
        id: 'ref_sign_post_white_black_base',
        canonical: '白いポールで根元が黒い',
        plain: '白い柱の根元だけ黒くなっている',
        aliases: ['根元が黒い白いポール'],
        codes: ['RU', 'TH'],
        note: '**強い。2 カ国。**ロシアで多く、他国ではあまり見ない。'
            + 'タイも白く塗られた木製で根元が黒い。**素材で割る（ロシアは金属）。**',
    },
    {
        id: 'ref_sign_post_yellow',
        canonical: '標識のポールが黄色',
        plain: '標識の柱が黄色い',
        aliases: ['黄色い標識柱'],
        codes: ['AU'],
        note: '**強いが地域限定。**オーストラリアの**西オーストラリア州**の目印。'
            + '同国の他の州は主に銀色。**見えなかったことをオーストラリアの否定に使わない。**',
    },
    {
        id: 'ref_sign_post_very_thin',
        canonical: '標識のポールが極端に細い',
        plain: '標識の柱がとても細い',
        aliases: ['細い標識柱', '針みたいな柱'],
        codes: ['CL', 'CO'],
        note: '**強い。2 カ国。**チリは細く、**柱の先に切り欠き（スリット）がある。**'
            + 'コロンビアは非常に細く白く塗られる。'
            + 'コロンビアは**標識の裏に十字の補強**が見えることも多い。',
    },
    {
        id: 'ref_sign_post_thick_unpainted',
        canonical: '太くて塗装されていないポール',
        plain: '太くて塗っていない柱に標識が付いている',
        aliases: ['無塗装の太い柱'],
        codes: ['BO'],
        note: '**強い。1 カ国。**ボリビアの多くの地域で見られる。'
            + '人手ワークシート §13 の「ペルーやボリビアだと思ったらメキシコだった」で、'
            + '**ペルーは黒白の縞なので、ポールの見た目で割れる。**',
        confusableWith: ['ref_sign_post_black_white_stripes'],
    },
    {
        id: 'ref_sign_post_blue_white_wrap',
        canonical: 'ポールの根元に青白の巻きもの',
        plain: '柱の根元に青と白の巻きが付いている',
        aliases: ['青白の巻きがあるポール'],
        codes: ['EE'],
        note: '**強い。1 カ国。**エストニアの標識ポールに時々見られる。'
            + '人手ワークシート §13 の「バルト三国だと思ったらドイツだった」で使える軸。',
    },
]

const ARCH_AXES = [
    {
        id: 'ref_arch_circular_electricity_meter',
        canonical: '外壁に丸い電気メーター',
        plain: '家の外の壁に丸い電気メーターが付いている',
        aliases: ['丸い電気メーター', '円形のメーター'],
        codes: ['MX'],
        note: '**非常に強い。1 カ国。**メキシコではほとんどの家の外壁に見られる。'
            + '**人手ワークシート §11 の判定フローの 2 段目である。**'
            + '「八角形電柱（`ref_pole_octagonal`、4 カ国）→ 家の電気メーターを見る '
            + '→ **丸形ならメキシコ**」。'
            + '> **本人が頭の中でやっている順序が、そのまま計算で出る。**',
        confusableWith: [],
    },
    {
        id: 'ref_arch_black_water_tank_on_roof',
        canonical: '屋上に大きな黒い貯水タンク',
        plain: '屋根の上に大きな黒いタンクが載っている',
        aliases: ['黒い貯水タンク', '屋上のタンク'],
        codes: ['MX'],
        note: '**非常に強い。1 カ国。**メキシコの家の屋上によく見られる。'
            + '丸い電気メーターと**同じ国を指すので、片方だけでも足りる。**',
    },
    {
        id: 'ref_arch_white_roof_bright_walls',
        canonical: '真っ白な屋根＋明るい色の外壁',
        plain: '屋根が真っ白で、壁が明るい色に塗られている',
        aliases: ['白い屋根の家'],
        codes: ['BM'],
        note: '**非常に強い。1 カ国。**バミューダ。屋根が空に溶けるほど白く、'
            + '窓枠も同じ白。壁は少し色あせた明るい色。',
    },
    {
        id: 'ref_arch_colourfully_painted_houses',
        canonical: '色鮮やかに塗られた家が並ぶ',
        plain: '家がカラフルに塗られている',
        aliases: ['カラフルな家', '極彩色の家'],
        codes: ['GL', 'CW'],
        note: '**強い。**グリーンランドとキュラソー。'
            + '**周囲の景観で割れる**（グリーンランドは寒冷で樹木がない）。',
    },
    {
        id: 'ref_arch_wooden_house_many_shutters',
        canonical: '木造で鎧戸が多い家',
        plain: '木の家で窓に木の雨戸がたくさん付いている',
        aliases: ['鎧戸の多い家', 'シャッターの多い木の家'],
        codes: ['CH'],
        note: '**強い。1 カ国。**スイスは鎧戸の数が多い。木造家屋も多い。',
    },
    {
        id: 'ref_arch_grey_stone_multistorey',
        canonical: '灰色の石を積んだ多層の建物',
        plain: '灰色の石を積んだ何階建てかの建物',
        aliases: ['石造りの多層住宅'],
        codes: ['AD'],
        note: '**非常に強い。1 カ国。**アンドラ。裕福そうな見た目になる。',
    },
    {
        id: 'ref_arch_stilt_wooden_house',
        canonical: '高床式の木造家屋',
        plain: '木の家が地面から持ち上がって建っている',
        aliases: ['高床の木の家', '高床式住居'],
        codes: ['KH'],
        note: '**強い。1 カ国。**カンボジア。屋根が何段かに分かれ、'
            + '壁は赤茶・水色・オレンジが多い。',
    },
    {
        id: 'ref_arch_vertical_columns_house',
        canonical: '垂直の柱が目立つ家',
        plain: '家の正面に縦の柱が並んでいる',
        aliases: ['縦の柱が並ぶ家'],
        codes: ['MY'],
        note: '**強い。1 カ国。**マレーシアの住宅に多く、他国では珍しい。'
            + '黒白の縞の標識ポールと**同じ国を指す。組み合わせで確度が上がる。**',
    },
    {
        id: 'ref_arch_high_walls_around_property',
        canonical: '敷地が高い塀で囲まれている',
        plain: '家のまわりが高い塀で囲まれている',
        aliases: ['高い塀', '塀で囲まれた家'],
        codes: ['RW'],
        note: '**中程度。1 カ国だが他国にもある景観である。**'
            + 'ルワンダで多い。**単独で断定しない。**',
    },
    {
        id: 'ref_arch_thatched_round_hut',
        canonical: '茅葺きの丸い小屋',
        plain: '丸い形で屋根が草で葺かれた小屋',
        aliases: ['茅葺きの小屋', '丸い小屋'],
        codes: ['LS'],
        note: '**強い。1 カ国。**レソトの伝統的な住居。'
            + '南部アフリカの他国（南アフリカ・ボツワナ・エスワティニ）との割り方になる。',
    },
    {
        id: 'ref_arch_flat_roof_arch_windows_wood',
        canonical: '張り出した平屋根＋白壁＋アーチ窓＋木の装飾',
        plain: '平らな屋根が壁より外に出ていて、白い壁とアーチ型の窓、木の飾りがある',
        aliases: ['アーチ窓と木の装飾の家'],
        codes: ['BT'],
        note: '**非常に強い。1 カ国。**ブータン。装飾が細かい。'
            + '石の標石（`ref_bollard_stone_marker`）と**同じ国を指す。**',
    },
    {
        id: 'ref_arch_skyscrapers_background',
        canonical: '背景に超高層ビル群',
        plain: 'すごく高いビルが遠くに見える',
        aliases: ['超高層ビル', '高層ビル群'],
        codes: ['AE'],
        note: '**強いが偏りに注意。**UAE の被写域はドバイ周辺に偏っており、'
            + '**そのため高層ビルが写りやすい。** 建物の性質ではなく被写域の性質である。'
            + '> **写りやすさは、その国らしさとは別である。**',
    },
    {
        id: 'ref_arch_religious_monument_coverage',
        canonical: '宗教建築の周辺ばかりが撮影されている',
        plain: '寺院やモスクの周りしか写っていない',
        aliases: ['宗教建築の周辺'],
        codes: ['PK'],
        note: '**強いが建物の軸ではない。**パキスタンの被写域は'
            + '宗教建築の周辺に集中している。**被写域の偏りが手がかりになっている。**'
            + '徒歩撮影（`ref_camera_trekker`）と同じ国を指す。',
    },
]

const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const terms = Array.isArray(human) ? human : human.terms

function apply(axes, slot, source, label) {
    console.log(`## ${label}`)
    let added = 0
    for (const axis of axes) {
        const unique = [...new Set(axis.codes)].sort()
        const kept = unique.filter((c) => countries.has(c))
        const dropped = unique.filter((c) => !countries.has(c))

        console.log(`  ${String(kept.length).padStart(2)} カ国  ${axis.canonical}`)
        if (dropped.length) console.log(`          seed に無いため除外: ${dropped.join(' ')}`)

        const existing = terms.find((t) => t.id === axis.id)
        if (existing) {
            existing.note = axis.note
            existing.confusableWith = axis.confusableWith ?? []
            console.log('          既にあるため note を更新した')
            continue
        }
        if (kept.length === 0) {
            console.log('          **seed に該当国が無いので入れない**')
            continue
        }
        terms.push({
            id: axis.id,
            slot,
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
            sources: [source],
        })
        added += 1
    }
    console.log(`  → 追加 ${added} 件`)
    console.log('')
    return added
}

console.log('標識のポールと建物の軸を出典から追加する（AI 未使用、消費 0）')
console.log('')
const a = apply(SIGN_AXES, 'sign', SRC_POSTS, '標識のポール（sign）')
const b = apply(ARCH_AXES, 'architecture', SRC_BUILDINGS, '建物（architecture）')

fs.writeFileSync(HUMAN_PATH, `${JSON.stringify(Array.isArray(human) ? terms : human, null, 4)}\n`, 'utf8')
console.log(`追加した用語: ${a + b} 件（人手記述は ${terms.length} 語になった）`)
console.log('')
console.log('**標識の板の意匠（111 件）は取り込んでいない。**')
console.log('軸になっているものを取る。件数が多いものを取るのではない。')
