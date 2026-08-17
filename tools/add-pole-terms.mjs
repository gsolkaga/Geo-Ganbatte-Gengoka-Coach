/**
 * 電柱の軸を出典から埋める（AI 未使用、消費 0）。
 *
 * ## ワークシート §11 と正面から対応する
 *
 * 人手ワークシートには電柱について長い記述がある。
 *
 * ```
 * 日本の電柱は電力会社を判別できる                          強い
 * ギリシャのハープ型電柱は覚えている                        強い
 * 八角形電柱と四角形電柱はパッと見では区別しにくい          弱い
 * 八角形電柱＋家の丸形電気メーター → メキシコ
 * 八角形電柱＋箱型で横長の覗き窓が1〜3個 → ペルー
 * 四角柱の電柱だけを見てもペルーと回答できない
 * ```
 *
 * そして §16 にこう書いてある。
 *
 * > 単独のラベルより、関係・順序・ロジックで覚える
 *
 * **出典の電柱データはその形になっている。** 穴の有無だけでは割れず、
 * 「穴が地面まで届くか」「金属かコンクリートか」で分かれる。
 * **族を作って細部で割る**という構造がそのまま入る。
 *
 * ## リージョンゲスは用語にしない
 *
 * 出典には「日本の電柱に付いた小さなプレートの意匠で地域が分かる」とある。
 * **これはリージョンゲスであり、このアプリの対象外である**（要件で外している）。
 * 国を絞る用語にはしない。**日本の縞模様の note に触れるだけにする。**
 *
 * > **持っている情報を全部入れるのではない。担当する範囲だけを入れる。**
 *
 * ## 出典
 *
 * Poles — Geometas  https://geometas.com/metas/categories/poles/
 * （Geometas は Plonk It と The Digital Labyrinth を出典として明記している）
 *
 * 使い方: node tools/add-pole-terms.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const HUMAN_PATH = path.join('data', 'glossary-human.json')
const SRC = 'https://geometas.com/metas/categories/poles/'

const countries = new Set(
    JSON.parse(fs.readFileSync(path.join('data', 'countries.json'), 'utf8')).map((c) => c.code),
)

const AXES = [
    {
        id: 'ref_pole_holey_to_ground',
        canonical: '大きな穴が地面まで開いた電柱',
        plain: 'コンクリートの柱に大きな穴が下まで開いている',
        aliases: ['穴あき電柱', 'ホーリーポール', '穴が下まで開いた電柱'],
        codes: ['HU', 'RO'],
        note: '**強い。2 カ国。**GeoGuessr で "holey pole" と呼ばれる。'
            + '**ポーランドは穴が地面の 50cm ほど上で止まる。**そこで割る。'
            + 'ルーマニアは根元が白く塗られていたり黄色い印が付いていることが多い。',
        confusableWith: ['ref_pole_holey_not_to_ground', 'ref_pole_metal_large_holes'],
    },
    {
        id: 'ref_pole_holey_not_to_ground',
        canonical: '穴が地面まで届かない穴あき電柱',
        plain: '穴が開いているが、下のほうは塞がっている',
        aliases: ['穴が途中で終わる電柱'],
        codes: ['PL'],
        note: '**非常に強い。1 カ国。**ハンガリーとルーマニアは穴が地面まで届く。'
            + '**どこまで開いているかを見る。**',
        confusableWith: ['ref_pole_holey_to_ground'],
    },
    {
        id: 'ref_pole_metal_large_holes',
        canonical: '金属製で大きな穴が開いた電柱',
        plain: '金属の柱に大きな穴が開いている',
        aliases: ['金属の穴あき電柱'],
        codes: ['TR'],
        note: '**強い。1 カ国。**ルーマニア・ハンガリー・ポーランドは**コンクリート**である。'
            + '**素材と穴の大きさで割る。**トルコは電柱の種類が多く、これはその 1 つ。',
        confusableWith: ['ref_pole_holey_to_ground'],
    },
    {
        id: 'ref_pole_small_holes_vertical',
        canonical: '小さな穴が縦に並んだ電柱',
        plain: '小さな穴がぽつぽつ縦に並んでいる',
        aliases: ['小さな穴が並ぶ電柱', 'ピンホールの電柱'],
        codes: ['TH', 'BE', 'LA', 'LK', 'KH', 'CL', 'BR'],
        note: '**族としては弱い（7 カ国）。他の欄と掛けて使う。**'
            + 'ベルギーは四角い断面。ラオスは非対称な形（片側に松かさ 2 つ、反対に 1 つ）。'
            + 'スリランカは上部に小さな穴の型と、下部が抜けている型の 2 種類。'
            + 'カンボジアも丸い柱に小さな穴の型と梯子型の 2 種類。'
            + 'チリとブラジルは上部に小さな穴があり、下部が梯子状。',
    },
    {
        id: 'ref_pole_octagonal',
        canonical: '八角形の電柱',
        plain: '柱の断面が八角形になっている',
        aliases: ['八角柱の電柱', '八角形電柱'],
        codes: ['MX', 'CO', 'GU', 'EC'],
        note: '**強い。4 カ国。**中南米では**メキシコとコロンビア**（まれにエクアドル）だけ。'
            + 'グアムは大型のコンクリート製八角柱で、'
            + '**北マリアナ諸島は木製**なので隣同士で割れる。'
            + '人手ワークシート §11 の「八角形電柱＋家の丸形電気メーター → メキシコ」'
            + 'の第 1 段がこれである。**この用語だけでは 4 カ国までしか落ちない。**',
    },
    {
        id: 'ref_pole_yellow_black_stripes',
        canonical: '黄色と黒の縞がある電柱',
        plain: '黄色と黒の縞模様が付いている',
        aliases: ['黄黒の縞の電柱', 'トラ縞の電柱'],
        codes: ['JP', 'KR', 'TW', 'CO'],
        note: '**族としては強い（4 カ国）。縞の向きと範囲で割る。**'
            + '日本は**縦**の縞。台湾は**斜め**で地面まで届く。'
            + '韓国は**斜め**だが地面まで届かない。コロンビアにも黄黒の縞がある。'
            + '（日本の電柱に付く小さなプレートの意匠で地域が分かるが、'
            + '**リージョンゲスはこのアプリの対象外である。**）',
    },
    {
        id: 'ref_pole_ladder_style',
        canonical: '下部が梯子のような形の電柱',
        plain: '下のほうが梯子みたいに段になっている',
        aliases: ['梯子型の電柱', '段になった電柱'],
        codes: ['BR', 'NG', 'SN', 'ES', 'EC', 'KH', 'CL', 'FR'],
        note: '**族としては弱い（8 カ国）。他の欄と掛けて使う。**'
            + 'フランスは穴ではなく**へこみ**。セネガルは**旧フランス領**として同型。'
            + 'ブラジルは長い段が下部に走り上部に小さな穴。'
            + 'チリはブラジルに似るがへこみの中の横桟が少ない。'
            + 'エクアドルの梯子型は**中南米ではほぼ固有**。',
    },
    {
        id: 'ref_pole_three_upward_bulbs',
        canonical: '上向きの碍子が3つ（三叉のよう）',
        plain: '上に3つの突起が並んでいて、三叉みたいに見える',
        aliases: ['三叉の電柱', '上向きの碍子3つ'],
        codes: ['UY', 'ID'],
        note: '**強い。2 カ国。**ウルグアイで最も多い型。'
            + 'インドネシアも同型が多く、**上端が揃っているか不揃いか**が地域で違う。'
            + 'インドネシアの鉄柱は黒く塗られ、**赤白の国旗色の縞**が入ることがある。',
    },
    {
        id: 'ref_pole_crucifix',
        canonical: '十字架のような形の電柱',
        plain: '十字架みたいな形をしている',
        aliases: ['十字の電柱', 'クルシフィックス型'],
        codes: ['MX', 'PH'],
        note: '**強い。2 カ国。**フィリピンは**木製**の十字型が最も多い。'
            + 'メキシコにも十字型がある。**素材で割る。**',
    },
    {
        id: 'ref_pole_three_arms',
        canonical: '腕が3本横に突き出た電柱',
        plain: '腕みたいなものが3本横に出ている',
        aliases: ['腕3本の電柱'],
        codes: ['PE'],
        note: '**非常に強い。1 カ国。**'
            + '人手ワークシート §13 の「四角柱の電柱だけではペルーに行けず、'
            + 'タイなど別候補へ飛ぶ」に効く。**腕の本数を数える。**',
    },
    {
        id: 'ref_pole_eiffel_like',
        canonical: 'エッフェル塔のような鉄塔型の電柱',
        plain: '鉄骨を組んだ塔みたいな形',
        aliases: ['鉄塔型の電柱', 'エッフェル塔型'],
        codes: ['BG'],
        note: '**非常に強い。1 カ国。**ブルガリア全域で見られる。'
            + '人手ワークシート §13 の「ブルガリアとウクライナで迷う」に効く。'
            + '**キリル文字の先で割れる軸である。**',
    },
    {
        id: 'ref_pole_wire_style',
        canonical: '針金を組んだような金属製の電柱',
        plain: '細い金属を組んだような柱',
        aliases: ['針金型の電柱'],
        codes: ['TN'],
        note: '**非常に強い。1 カ国。**チュニジアで最も多い型。',
    },
    {
        id: 'ref_pole_sharp_spike_top',
        canonical: '頂部から長く尖った突起が伸びている',
        plain: '柱の上から長くとがった棒が突き出ている',
        aliases: ['尖った突起の電柱', '上に槍がある電柱'],
        codes: ['KR'],
        note: '**非常に強い。1 カ国。**韓国の電柱の最大の特徴。'
            + '黄黒の斜め縞（地面まで届かない）と併せて見る。',
    },
    {
        id: 'ref_pole_white_painted_base',
        canonical: '根元が白く塗られた電柱',
        plain: '柱の根元だけ白く塗られている',
        aliases: ['根元が白い電柱'],
        codes: ['UA', 'RO', 'CW'],
        note: '**中程度。**ウクライナで多い。ルーマニアの穴あき電柱にも見られる。'
            + '**単独では割れないので穴の有無と併せる。**',
    },
    {
        id: 'ref_pole_wooden_simple',
        canonical: '木製で碍子が3つの簡素な電柱',
        plain: '木の柱に碍子が3つだけ付いた簡素なもの',
        aliases: ['木製の簡素な電柱'],
        codes: ['SZ'],
        note: '**強い。1 カ国。**エスワティニで最も多い型。'
            + '南部アフリカの他国（南アフリカ・ボツワナ・レソト）との'
            + '割り方の 1 つになる。',
    },
    {
        id: 'ref_pole_metal_wrap',
        canonical: '金属の帯が1本巻かれた電柱',
        plain: '柱に銀色や白の金属の帯が1本巻いてある',
        aliases: ['金属の帯が巻かれた電柱'],
        codes: ['NZ'],
        note: '**強い。1 カ国。**ニュージーランドの電柱の多くに見られる。'
            + '（オーストラリアのタスマニア州には地上 2m ほどに'
            + 'オリーブ色の金属を巻いた電柱があるが、**州単位の話であり国の軸にしない。**）',
    },
    {
        id: 'ref_pole_stobie',
        canonical: '鋼板2枚の間にコンクリートを挟んだ電柱',
        plain: '2枚の鉄板の間にコンクリートが挟まった柱',
        aliases: ['ストビーポール', '鉄板でコンクリートを挟んだ電柱'],
        codes: ['AU'],
        note: '**強いが地域限定。**オーストラリアの**南オーストラリア州に固有**。'
            + '国としてはオーストラリアを指すが、**見えなかったことをオーストラリアの否定に使わない。**'
            + '北部準州には金属製の穴あき電柱がある。',
    },
]

const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const terms = Array.isArray(human) ? human : human.terms

console.log('電柱の軸を出典から追加する（AI 未使用、消費 0）')
console.log('')

let added = 0
for (const axis of AXES) {
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
        slot: 'pole',
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
console.log('**日本の電柱プレートによる地域判定は入れていない。** リージョンゲスは対象外である。')
console.log('持っている情報を全部入れるのではなく、担当する範囲だけを入れる。')
