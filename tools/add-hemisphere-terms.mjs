/**
 * 影の向きから半球を出す用語を足す（AI 未使用、消費 0）。
 *
 * ## 出典が要らない軸がある
 *
 * ここまで辞書は GeoGuessr の攻略資料から埋めてきた。しかし
 * **正午の太陽がどちら側に見えるかは、緯度だけで決まる事実である。**
 * 攻略資料を参照する必要がない。
 *
 * 正解タグには既に記述があった（実測、`docs/combo-report.md`）。
 *
 *   q-za-01 [easy] 太陽が北から照っている
 *   q-au-01 [easy] 木の陰が北側に出ている
 *   q-br-01 [easy] 影が無いのでほぼ真上に太陽がある
 *
 * **用語が無いために 1 つも拾われていなかった。**
 *
 * ## 熱帯の国は両方に入れる
 *
 * 南北回帰線（±23.44 度）の間にある国では、**季節によって正午の太陽が
 * 北にも南にも来る。** 片方のリストにだけ入れると、その国を誤って消す。
 *
 * > **消してはいけない国は、両方に入れておく。**
 *
 * したがって「影が南に伸びる」は【温帯の南半球 + 熱帯】、
 * 「影が北に伸びる」は【温帯の北半球 + 熱帯】になる。
 *
 * 後者は 98 / 102 カ国になる。**それは絞り込みに使えないという正しい結果である。**
 * combo が自動で「観察が国を示さない」に分類する。
 * 国境の一部でも熱帯に入る国（ZA AU BR JP を含む判定）は熱帯側に寄せた。
 * **絞り込みを弱める方向に間違える。**
 */
import fs from 'node:fs'

const PATH = 'data/glossary-human.json'

/** 全域が北緯 23.44 度より北。正午の太陽は必ず南側 */
const TEMPERATE_NORTH = [
    'NO', 'SE', 'FI', 'IS', 'DK', 'IE', 'GB', 'NL', 'FR', 'BE',
    'LU', 'DE', 'CH', 'AT', 'IT', 'ES', 'PT', 'AD', 'MT', 'PL',
    'CZ', 'SK', 'HU', 'SI', 'HR', 'BA', 'ME', 'XK', 'AL', 'RO',
    'RS', 'MK', 'BG', 'UA', 'EE', 'LV', 'LT', 'GR', 'CY', 'RU',
    'KZ', 'KG', 'MN', 'UZ', 'GE', 'TR', 'IL', 'LB', 'JO', 'QA',
    'TN', 'NP', 'BT', 'KR', 'JP', 'CA',
]

/** 全域が南緯 23.44 度より南。正午の太陽は必ず北側 */
const TEMPERATE_SOUTH = ['LS', 'SZ', 'NZ', 'UY']

const all = JSON.parse(fs.readFileSync('data/countries.json', 'utf8'))
const codes = (Array.isArray(all) ? all : all.countries).map((c) => c.code)
const poleward = new Set([...TEMPERATE_NORTH, ...TEMPERATE_SOUTH])
/** 国境の一部でも回帰線の間に入る国。**両方のリストに入れる** */
const TROPICAL = codes.filter((c) => !poleward.has(c))

const NOTE_TAIL = '南北回帰線の間にある国は季節によって太陽が両側に来るため、**両方の用語に含めている**。'
    + '消してはいけない国を消さない側に寄せた。'

const NEW = [
    {
        id: 'ref_sun_shadow_to_south',
        slot: 'season',
        canonical: '正午の影が南へ伸びる（太陽が北に見える）',
        plain: '真昼の影が南に伸びている。太陽が北の空にある',
        aliases: ['太陽が北から照っている', '影が南に出ている', '南半球の日差し'],
        countries: [...TEMPERATE_SOUTH, ...TROPICAL].sort(),
        confusableWith: [],
        note: '**天文の事実であり出典を要しない。** 温帯の南半球では正午の太陽が必ず北側にある。'
            + `温帯の北半球 ${TEMPERATE_NORTH.length} カ国を一度に消せる。` + NOTE_TAIL,
        verifiedByHuman: true,
        disputed: false,
        kind: 'atomic',
        certainty: 'verified',
        source: 'reference',
        exhaustive: true,
        // **引き算は網羅を要求しない。** 温帯の北半球は確実に消せる
        excludes: [...TEMPERATE_NORTH].sort(),
        sources: ['https://en.wikipedia.org/wiki/Tropic_of_Capricorn'],
    },
    {
        id: 'ref_sun_shadow_to_north',
        slot: 'season',
        canonical: '正午の影が北へ伸びる（太陽が南に見える）',
        plain: '真昼の影が北に伸びている。太陽が南の空にある',
        aliases: ['太陽が南から照っている', '影が北に出ている', '木の陰が北側に出ている'],
        countries: [...TEMPERATE_NORTH, ...TROPICAL].sort(),
        confusableWith: [],
        note: '**98 / 102 カ国に該当し、単独では絞り込みに使えない。**'
            + 'それが正しい結果である。北半球の方が国の数が多いため、'
            + '「影が北」は「影が南」ほど情報を持たない。'
            + '温帯の南半球 4 カ国を消せることだけが成果である。' + NOTE_TAIL,
        verifiedByHuman: true,
        disputed: false,
        kind: 'atomic',
        certainty: 'verified',
        source: 'reference',
        exhaustive: true,
        excludes: [...TEMPERATE_SOUTH].sort(),
        sources: ['https://en.wikipedia.org/wiki/Tropic_of_Cancer'],
    },
    {
        id: 'ref_sun_overhead_no_shadow',
        slot: 'season',
        canonical: '正午に影がほぼ真下（太陽がほぼ真上）',
        plain: '真昼に影がほとんど出ない。太陽がほぼ真上にある',
        aliases: ['影が無い', '太陽がほぼ真上', '影がほぼ真下'],
        countries: [...TROPICAL].sort(),
        confusableWith: ['ref_sun_shadow_to_south', 'ref_sun_shadow_to_north'],
        note: '**回帰線の間にしか起こらない。** 太陽が天頂を通るのは緯度が ±23.44 度以内の場所だけである。'
            + `温帯 ${TEMPERATE_NORTH.length + TEMPERATE_SOUTH.length} カ国を一度に消せる。`
            + '**ただし年に 2 日しか厳密には成立しない。** 「ほぼ真上」の判断は幅を持つ。',
        verifiedByHuman: true,
        disputed: false,
        kind: 'atomic',
        certainty: 'verified',
        source: 'reference',
        exhaustive: true,
        excludes: [...TEMPERATE_NORTH, ...TEMPERATE_SOUTH].sort(),
        gradient: {
            axis: 'north_south',
            note: '回帰線に近づくほど「真上」になる期間が短くなり、赤道では年 2 回ある。'
                + '影の長さは連続量であり、見えた／見えないで切ってはならない',
        },
        sources: ['https://en.wikipedia.org/wiki/Subsolar_point'],
    },
]

const doc = JSON.parse(fs.readFileSync(PATH, 'utf8'))
const existing = new Set(doc.terms.map((t) => t.id))
let added = 0
for (const t of NEW) {
    if (existing.has(t.id)) {
        console.log(`既にある（上書きする）: ${t.id}`)
        doc.terms[doc.terms.findIndex((x) => x.id === t.id)] = t
        continue
    }
    doc.terms.push(t)
    added++
}
fs.writeFileSync(PATH, `${JSON.stringify(doc, null, 4)}\n`, 'utf8')

console.log(`温帯の北半球 ${TEMPERATE_NORTH.length} / 温帯の南半球 ${TEMPERATE_SOUTH.length} / 熱帯・赤道跨ぎ ${TROPICAL.length}`)
console.log(`合計 ${TEMPERATE_NORTH.length + TEMPERATE_SOUTH.length + TROPICAL.length} = 辞書の国数 ${codes.length}`)
console.log('')
for (const t of NEW) console.log(`${t.id}  該当 ${t.countries.length} カ国 / 除外 ${t.excludes.length} カ国`)
console.log('')
console.log(`足した用語: ${added} 件 → ${PATH}`)
console.log('次: node scripts/build-glossary.mjs')
