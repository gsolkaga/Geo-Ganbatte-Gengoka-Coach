/**
 * 公開されている GeoGuessr の資料を参照して用語を追加する（AI 未使用、消費 0）。
 *
 * ## なぜ出典を当たるのか
 *
 * 該当国リストを**私が想像してはならない。** それをやったのが波形柵の誤断定である
 * （`docs/v2-kz.md` 章 8）。AI に生成させた 64 件も地域が偏って使えなかった。
 *
 * 残る道は 1 つで、**人間が資料を当たって編集する。** それが Plonk It の作業である。
 *
 * ## `human` と `reference` を混ぜない
 *
 * 人手ワークシート（`docs/offline-works/road_marking-human-worksheet.md` §2）に
 * 既に同じ軸がある。
 *
 * ```
 * 黄色い外側線＋白い中央線なら、アフリカを考える  ZA BW LS SZ  混同 IE
 * 中央線が白なら、まずヨーロッパを考える          （国の記載なし）
 * ```
 *
 * **軸と混同は持っている。網羅はできていない。** 出典側は同じ軸を 35 カ国持っている。
 *
 * ワークシート §17 に「本人が『なんとなく』と表現しているものを勝手に厳密な
 * ルールへ変換しない」と書いてある。**上書きしない。別の用語として持つ。**
 *
 * > **連想と網羅は別のものである。**
 *
 * ## 出典
 *
 * - Road Lines — geohints  https://geohints.com/meta/lines
 * - Chevrons — Geometas    https://geometas.com/metas/categories/chevrons/
 *
 * Geometas は Plonk It と The Digital Labyrinth を出典として明記している。
 *
 * **一覧を丸ごと取り込まない。** 出題で必要な軸の分だけを取り、
 * `sources` に参照先を記録する。データは CC BY 4.0 で公開しているため、
 * **どこから来た数字かが辿れない一覧を作らない。**
 *
 * 使い方: node tools/add-reference-terms.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const HUMAN_PATH = path.join('data', 'glossary-human.json')
const QUESTIONS_PATH = path.join('data', 'questions.json')

const SRC_LINES = 'https://geohints.com/meta/lines'
const SRC_CHEVRONS = 'https://geometas.com/metas/categories/chevrons/'

/**
 * 中央線に白が含まれる国。**「外側」と「内側」の組み合わせのうち内側に白を含む群の和。**
 *
 * 約 100 カ国になる。**弱いメタである。** それでも入れる理由は 2 つ。
 *
 * 1. いまは算出不能（項目が作られない）であり、**画面に何も出ない**
 * 2. 積集合には効く。単独で弱いことと、掛けて効かないことは別である
 *
 * 人手の note に「この用語は現状ほぼ機能しない」と書いてあったのは、
 * **量として正しかった。** 埋めても弱い。ただし**使える弱いメタになる。**
 */
const CENTER_WHITE = [
    // 外=黄 / 中=白
    'AU', 'BW', 'CL', 'SZ', 'FR', 'GI', 'HU', 'IN', 'IE', 'IM', 'IL', 'JE', 'JO', 'KZ',
    'LS', 'LT', 'MY', 'MX', 'ME', 'NA', 'NP', 'NZ', 'NG', 'OM', 'PS', 'PT', 'RU', 'SG',
    'ZA', 'ES', 'LK', 'CH', 'TR', 'AE', 'GB',
    // 外=白 / 中=白
    'AL', 'AD', 'AR', 'AT', 'BD', 'BE', 'BT', 'BO', 'BA', 'BR', 'BG', 'CX', 'HR', 'CW',
    'CY', 'CZ', 'DK', 'EG', 'EE', 'FO', 'FI', 'GE', 'DE', 'GH', 'GR', 'GL', 'IS', 'ID',
    'IT', 'JP', 'KE', 'XK', 'KG', 'LA', 'LV', 'LI', 'LU', 'MG', 'MT', 'MC', 'MN', 'NL',
    'MK', 'PE', 'PH', 'PL', 'QA', 'RO', 'RW', 'RE', 'SM', 'SN', 'RS', 'SK', 'SI', 'KR',
    'SE', 'ST', 'TN', 'UG', 'UA', 'UY', 'VN',
    // 外=白 / 中=白と黄
    'AR', 'FI', 'FR', 'JP', 'NZ', 'PH', 'TR', 'UY', 'VN',
    // その他の組み合わせで内側が白
    'NL', 'GB', 'ZA', 'NA', 'ES',
]

/**
 * 中央線が黄色の国（外=白 / 中=黄）。**40 カ国。**
 *
 * 人手の `road_marking_center_yellow` は 13 カ国である。**あちらは連想であり、
 * こちらは記載である。** 上書きせず別に持つ。
 *
 * **`KZ` はこの群に入っていない。** 出典が独立に、
 * 「黄色い中央線はカザフスタンを示さない」というこちらの診断と一致した
 * （`docs/v2-kz.md` 章 3）。
 */
const CENTER_YELLOW = [
    'AL', 'AS', 'AR', 'AT', 'BO', 'BR', 'KH', 'CA', 'CL', 'CO', 'CR', 'DO', 'EC', 'FI',
    'GR', 'GU', 'GT', 'ID', 'JP', 'KE', 'LB', 'MX', 'NZ', 'MP', 'NO', 'PA', 'PY', 'PE',
    'PH', 'PR', 'QA', 'RU', 'RW', 'KR', 'TW', 'TH', 'TR', 'UG', 'US', 'VN',
]

/**
 * 外側線（路肩線）が黄色の国。**41 カ国。中央線の色より強い。**
 *
 * 人手ワークシート §2 の「黄色い外側線＋白い中央線なら、アフリカを考える」と同じ軸。
 * **本人が挙げた `ZA BW LS SZ` と混同の `IE` を全部含んでいる。**
 *
 * 今の 10 問には当てはまらない（路肩の記述が「なし」か白）。
 * **当てはまらないものを当てはめない。** 将来の出題のために辞書に置く。
 */
const SIDE_YELLOW = [
    'AU', 'BW', 'CL', 'SZ', 'FR', 'GI', 'HU', 'IN', 'IE', 'IM', 'IL', 'JE', 'JO', 'KZ',
    'LS', 'LT', 'MY', 'MX', 'ME', 'NA', 'NP', 'NZ', 'NG', 'OM', 'PS', 'PT', 'RU', 'SG',
    'ZA', 'ES', 'LK', 'CH', 'TR', 'AE', 'GB', 'BR', 'ID', 'MK', 'RO', 'KR', 'TW',
]

/**
 * 白地に赤い矢印のシェブロン。**3 カ国。強いメタである。**
 *
 * `Kimi` が `q-za-01` の添削で「白地に赤い矢印のシェブロン」と言い、
 * 監査は「辞書に無い用語」として落とした。**指摘は正しく、辞書に無かっただけである。**
 *
 * エストニアは逆（赤地に白矢印）なので入れない。**逆のものを同じ群にしない。**
 */
const CHEVRON_RED_ON_WHITE = ['AR', 'ZA', 'TR']

const countries = new Set(
    JSON.parse(fs.readFileSync(path.join('data', 'countries.json'), 'utf8')).map((c) => c.code),
)

/** 候補国の seed に無いコードは入れられない。**入れられないことを表示する** */
function filterToSeed(codes, label) {
    const unique = [...new Set(codes)].sort()
    const kept = unique.filter((c) => countries.has(c))
    const dropped = unique.filter((c) => !countries.has(c))
    console.log(`  ${label}: ${unique.length} 件のうち ${kept.length} 件を採用`)
    if (dropped.length) console.log(`    seed に無いため除外: ${dropped.join(' ')}`)
    return kept
}

const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const terms = Array.isArray(human) ? human : human.terms

console.log('出典を参照して用語を追加する（AI 未使用、消費 0）')
console.log('')

const additions = [
    {
        id: 'ref_road_marking_center_white',
        slot: 'road_marking',
        canonical: '中央線が白（出典）',
        plain: '中央線が白い',
        aliases: ['白い中央線', '中央線は白い実線'],
        codes: filterToSeed(CENTER_WHITE, '中央線が白'),
        note: '**単独では非常に弱い。** 内側の線に白を含む国の和であり、'
            + '人手の note に「現状ほぼ機能しない」と書いてあったのは量として正しかった。'
            + '積集合の材料としては使える。軸は本人のワークシート（中央線が白ならまず欧州）に由来し、'
            + '網羅は出典に由来する。',
        sources: [SRC_LINES],
    },
    {
        id: 'ref_road_marking_center_yellow',
        slot: 'road_marking',
        canonical: '中央線が黄色（出典）',
        plain: '中央線が黄色い',
        aliases: ['黄色い中央線', '中央線は黄色の実線'],
        codes: filterToSeed(CENTER_YELLOW, '中央線が黄色'),
        note: '**`KZ` を含まない。** 人手の road_marking_center_yellow（13 カ国）は本人の連想であり、'
            + 'こちらは記載である。上書きせず別に持つ。'
            + '出典が独立に「黄色い中央線はカザフスタンを示さない」という診断と一致した。',
        sources: [SRC_LINES],
    },
    {
        id: 'ref_road_marking_side_yellow',
        slot: 'road_marking',
        canonical: '外側線が黄色（出典）',
        plain: '路肩の線が黄色い',
        aliases: ['黄色い外側線', '路肩線が黄色'],
        codes: filterToSeed(SIDE_YELLOW, '外側線が黄色'),
        note: '中央線の色より強い。人手ワークシート §2 の'
            + '「黄色い外側線＋白い中央線ならアフリカを考える（ZA BW LS SZ、混同 IE）」と同じ軸で、'
            + '**本人が挙げた 4 カ国と混同の IE を全部含む。** '
            + '現在の 10 問には当てはまらない（路肩の記述が「なし」か白）。',
        sources: [SRC_LINES],
    },
    {
        id: 'ref_chevron_red_on_white',
        slot: 'sign',
        canonical: '白地に赤い矢印のシェブロン（出典）',
        plain: '白い板に赤い矢印が並んだカーブの標識',
        aliases: ['白地に赤いシェブロン', '赤白のシェブロン'],
        codes: filterToSeed(CHEVRON_RED_ON_WHITE, '白地に赤いシェブロン'),
        note: '**エストニアは逆（赤地に白矢印）なので含めない。** '
            + 'ブラジルは黄地に黒、スウェーデンは黄と青、オーストラリアは黄地に黒（枠なし）。'
            + 'Kimi が q-za-01 の添削でこの用語を挙げ、監査が「辞書に無い」として落とした。'
            + '**指摘は正しく、辞書に無かっただけである。**',
        sources: [SRC_CHEVRONS],
    },
]

let added = 0
for (const a of additions) {
    if (terms.some((t) => t.id === a.id)) {
        console.log(`  既にある: ${a.id}`)
        continue
    }
    terms.push({
        id: a.id,
        slot: a.slot,
        canonical: a.canonical,
        plain: a.plain,
        aliases: a.aliases,
        countries: a.codes,
        confusableWith: [],
        note: a.note,
        verifiedByHuman: false,
        disputed: false,
        kind: 'atomic',
        /** **出典を当たっただけであり、こちらで現地確認していない。** `verified` にしない */
        certainty: 'heuristic',
        source: 'reference',
        sources: a.sources,
    })
    added += 1
}

fs.writeFileSync(HUMAN_PATH, `${JSON.stringify(Array.isArray(human) ? terms : human, null, 4)}\n`, 'utf8')
console.log('')
console.log(`追加した用語: ${added} 件（人手記述は ${terms.length} 語になった）`)

// ============================================================
// 正解タグへの割り当て。**記録されている記述に従う。私が決めない**
// ============================================================

/**
 * 記録されている `plain` に照らして明確なものだけ割り当てる。
 *
 * ```
 * q-ru-01  中央線は白い実線             → 中央線が白
 * q-za-01  中央線は白い実線、路肩はなし  → 中央線が白
 * q-kz-01  中央線は黄色の実線            → 中央線が黄色
 * q-th-01  中央線は黄色の実線            → 中央線が黄色
 * ```
 *
 * `q-br-01` は「隣の道路の中央線が黄色１本が見えなくはない」である。
 * **言い切っていない観察を言い切ったものとして扱わない。** 割り当てない。
 *
 * `q-au-01`（中央線 2 本の間に凸凹）と `q-tr-01`（白飛びで視認不可）も割り当てない。
 */
const ASSIGN = {
    'q-ru-01': { road_marking: ['ref_road_marking_center_white'] },
    'q-za-01': { road_marking: ['ref_road_marking_center_white'] },
    'q-kz-01': { road_marking: ['ref_road_marking_center_yellow'] },
    'q-th-01': { road_marking: ['ref_road_marking_center_yellow'] },
}

const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'))
let assigned = 0
console.log('')
console.log('正解タグへの割り当て（記録されている記述に従う）')
for (const question of questions) {
    const plan = ASSIGN[question.id]
    if (!plan) continue
    for (const [slot, ids] of Object.entries(plan)) {
        const entry = question.slots[slot]
        if (!entry || entry.state !== 'visible') {
            console.log(`  飛ばす: ${question.id} / ${slot} は visible ではない`)
            continue
        }
        for (const id of ids) {
            if (entry.terms.includes(id)) continue
            entry.terms.push(id)
            assigned += 1
            console.log(`  ${question.id} / ${slot} += ${id}`)
            console.log(`      記述: ${entry.plain}`)
        }
    }
}
fs.writeFileSync(QUESTIONS_PATH, `${JSON.stringify(questions, null, 4)}\n`, 'utf8')
console.log('')
console.log(`割り当てた: ${assigned} 件`)
console.log('')
console.log('次: node scripts/validate-glossary.mjs && node scripts/build-glossary.mjs')
console.log('    npm run validate:keys && npm run preview:v2（いずれも消費 0）')
