/**
 * どの地点でも観察できる軸を出典から埋める（AI 未使用、消費 0）。
 *
 * ## なぜこれを先にやるか
 *
 * `npm run coverage` の実測（2026-08-17）。**14 欄のうち 7 欄が被覆 0% だった。**
 *
 * ```
 *   0%  traffic_side    使える用語 0 / 5   ← 全部 AI 生成
 *   0%  script          使える用語 0 / 3   ← 全部 AI 生成
 *  98%  road_marking    使える用語 7 / 14  ← ここばかり足していた
 * ```
 *
 * `road_marking` を 98% にしたのは、**用意した 10 問がそこで詰まっていたから**である。
 * 一方 `traffic_side` と `script` は**地球上ほぼどこでも観察できて、しかも強い。**
 * それが 0% だった。
 *
 * > **サンプルに合わせて作ると、サンプルの外で使えない。**
 *
 * 走行帯は世界の 4 分の 3 が右側なので単独では弱いが、**左側なら一気に絞れる。**
 * そして「どの地点でも必ず入力される欄」なので、埋めると全出題に効く。
 *
 * ## 出典と突き合わせる
 *
 * `data/countries.json` は `traffic_side` を持っているが、
 * **検証済みは 9 / 102 で、`disputed` が 9 件ある。** そのまま使えない。
 *
 * 出典の一覧と突き合わせ、**食い違いを表示する。**
 * 食い違いは「AI が作った国定数テーブルのどこが違うか」の実測にもなる。
 *
 * 出典: Left- and right-hand traffic（Wikipedia）
 *       https://en.wikipedia.org/wiki/Left-_and_right-hand_traffic
 *
 * 使い方: node tools/add-universal-terms.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const HUMAN_PATH = path.join('data', 'glossary-human.json')
const REPORT_PATH = path.join('docs', 'countries-crosscheck.md')

const SRC_LHT = 'https://en.wikipedia.org/wiki/Left-_and_right-hand_traffic'

/**
 * 左側通行の国・地域（ISO 3166-1 alpha-2）。
 *
 * **主権国家と、Street View に出る主要な属領を含む。**
 * 世界で 70 前後しかなく、右側通行より圧倒的に少ない。
 * だから「左側だ」と分かった時点で強い絞り込みになる。
 */
const LEFT_HAND_TRAFFIC = [
    'AG', 'AI', 'AU', 'BB', 'BD', 'BM', 'BN', 'BS', 'BT', 'BW', 'CC', 'CK', 'CX', 'CY',
    'DM', 'FJ', 'FK', 'GB', 'GD', 'GG', 'GY', 'HK', 'ID', 'IE', 'IM', 'IN', 'JE', 'JM',
    'JP', 'KE', 'KI', 'KN', 'KY', 'LC', 'LK', 'LS', 'MO', 'MS', 'MT', 'MU', 'MV', 'MW',
    'MY', 'MZ', 'NA', 'NF', 'NP', 'NR', 'NU', 'NZ', 'PG', 'PK', 'PN', 'SB', 'SC', 'SG',
    'SH', 'SR', 'SZ', 'TC', 'TH', 'TK', 'TL', 'TO', 'TT', 'TV', 'TZ', 'UG', 'VC', 'VG',
    'WS', 'ZA', 'ZM', 'ZW',
]

const countries = JSON.parse(fs.readFileSync(path.join('data', 'countries.json'), 'utf8'))
const byCode = new Map(countries.map((c) => [c.code, c]))
const seed = new Set(byCode.keys())

const leftInSeed = LEFT_HAND_TRAFFIC.filter((c) => seed.has(c)).sort()
const rightInSeed = [...seed].filter((c) => !LEFT_HAND_TRAFFIC.includes(c)).sort()

console.log(`候補国 ${seed.size} / 出典の左側通行 ${LEFT_HAND_TRAFFIC.length} 件`)
console.log(`  seed に含まれる左側通行: ${leftInSeed.length} 件`)
console.log(`  右側通行: ${rightInSeed.length} 件`)
console.log('')

// ============================================================
// 国定数テーブルとの突き合わせ
// ============================================================

const missingLeft = []
const wrongLeft = []
for (const code of seed) {
    const row = byCode.get(code)
    const refLeft = LEFT_HAND_TRAFFIC.includes(code)
    const tableLeft = row.traffic_side === 'left'
    if (refLeft && !tableLeft) missingLeft.push(row)
    if (!refLeft && tableLeft) wrongLeft.push(row)
}

console.log('国定数テーブルとの食い違い')
console.log(`  **出典は左だが表は右: ${missingLeft.length} 件**`)
for (const r of missingLeft) {
    console.log(`    ${r.code} ${r.name}（verified=${r.verified?.traffic_side} disputed=${r.disputed?.traffic_side}）`)
}
console.log(`  出典は右だが表は左: ${wrongLeft.length} 件`)
for (const r of wrongLeft) console.log(`    ${r.code} ${r.name}`)
console.log('')

const lines = [
    '# 国定数テーブルと出典の突き合わせ（AI 未使用、消費 0）',
    '',
    `生成: ${new Date().toISOString()}　\`node tools/add-universal-terms.mjs\``,
    '',
    '## 走行帯',
    '',
    `出典: [Left- and right-hand traffic（Wikipedia）](${SRC_LHT})`,
    '',
    '`data/countries.json` の `traffic_side` は**検証済みが 9 / 102 で、`disputed` が 9 件**である。',
    'そのまま絞り込みに使えないため、出典と突き合わせた。',
    '',
    `### 出典は左側通行だが表は右になっていた: ${missingLeft.length} 件`,
    '',
    missingLeft.length ? '| 国 | コード | verified | disputed |' : '（なし）',
    missingLeft.length ? '|---|---|---|---|' : '',
    ...missingLeft.map((r) =>
        `| ${r.name} | ${r.code} | ${r.verified?.traffic_side} | ${r.disputed?.traffic_side} |`),
    '',
    `### 出典は右側通行だが表は左になっていた: ${wrongLeft.length} 件`,
    '',
    wrongLeft.length ? wrongLeft.map((r) => `- ${r.name}（${r.code}）`).join('\n') : '（なし）',
    '',
    '## この食い違いの意味',
    '',
    '国定数テーブルは AI が生成し、人手で一部を訂正したものである（`docs/generated-countries/`）。',
    '**走行帯は「どちら側を走るか」の二択であり、世界で最も documented な事実の 1 つである。**',
    'それでも取りこぼしが出た。',
    '',
    '> **二択でも間違う。** 選択肢が少ないことは、正しさを保証しない。',
    '',
    '**用語辞書は出典の一覧から作った。** 国定数テーブルは訂正していない',
    '（`data/countries-overrides.json` に人手で入れる作業として残す）。',
    '絞り込み計算が使うのは用語辞書なので、**助言の正しさはこれで担保される。**',
    '',
]
fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8')
console.log(`突き合わせの記録: ${REPORT_PATH}`)

// ============================================================
// 用語の追加
// ============================================================

const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const terms = Array.isArray(human) ? human : human.terms

/**
 * 文字体系ごとの用語。**`script` も被覆 0% だった。**
 *
 * ## `disputed` を除外してはならなかった
 *
 * `data/countries.json` の `scripts` は `disputed` が 26 件ある。
 * しかし中身を見ると、
 *
 * ```
 * disputed: GR(greek) TH(thai) JP(japanese_kana_kanji) KR(korean_hangul) GE(georgian)
 *           KZ(cyrillic+latin) MN(cyrillic) RS(cyrillic+latin) ...
 * ```
 *
 * **ギリシャ＝ギリシャ文字、タイ＝タイ文字、日本＝かな漢字。事実は明白である。**
 *
 * `disputed` は「**生成時にモデルが食い違った**」という印であり、
 * 「事実が不確か」ではない。**意味が違う。**
 *
 * > **合意が取れなかったことと、答えが分からないことは別である。**
 *
 * 除外すると正しいデータを捨てる。実際にキリル文字から `KZ` が落ちていた。
 * **`q-kz-01` で学習者が見たのはそのキリル文字である。**
 *
 * したがってここでは `disputed` も含めて採る。そのうえで、
 * こちらの知識と食い違う国があれば表示する（**突き合わせを省かない**）。
 *
 * ## 何を用語にするか
 *
 * ラテン文字は 91 カ国で単独では絞れないが、**それ以外は強い。**
 * 特にキリル文字は 11 カ国まで一気に落ちる。
 * 「見ればほぼ確実に分かる」かつ「候補が激減する」ため、最優先の軸である。
 */
const SCRIPT_LABELS = {
    latin: { canonical: 'ラテン文字', plain: 'アルファベット（英語と同じ字形）', aliases: ['英字', 'ローマ字', 'アルファベット'] },
    cyrillic: { canonical: 'キリル文字', plain: 'ロシア語みたいな文字', aliases: ['ロシア文字', 'キリル', 'Кみたいな文字'] },
    arabic: { canonical: 'アラビア文字', plain: '右から左に流れる曲線的な文字', aliases: ['アラビア語'] },
    greek: { canonical: 'ギリシャ文字', plain: 'ギリシャ語の文字', aliases: ['ギリシャ語'] },
    devanagari: { canonical: 'デーヴァナーガリー', plain: '上に横棒がつながる文字', aliases: ['ヒンディー語の文字', 'インドの文字'] },
    chinese_traditional: { canonical: '繁体字', plain: '画数の多い漢字', aliases: ['中国語の文字', '漢字（繁体）'] },
    georgian: { canonical: 'ジョージア文字', plain: '丸みのある独特な文字', aliases: ['グルジア文字'] },
    hebrew: { canonical: 'ヘブライ文字', plain: '四角っぽい独特な文字', aliases: ['ヘブライ語'] },
    sinhala: { canonical: 'シンハラ文字', plain: '丸が多い文字', aliases: ['スリランカの文字'] },
    tamil: { canonical: 'タミル文字', plain: '丸みのある南インドの文字', aliases: ['タミル語'] },
    bengali: { canonical: 'ベンガル文字', plain: '上に横棒がつながる文字（ベンガル）', aliases: ['ベンガル語'] },
    tibetan: { canonical: 'チベット文字', plain: 'チベット語の文字', aliases: ['ゾンカ語の文字'] },
    thai: { canonical: 'タイ文字', plain: '丸まった線が上下に伸びる文字', aliases: ['タイ語'] },
    khmer: { canonical: 'クメール文字', plain: 'カンボジアの文字', aliases: ['カンボジア語'] },
    korean_hangul: { canonical: 'ハングル', plain: '丸と四角を組み合わせた文字', aliases: ['韓国語の文字'] },
    japanese_kana_kanji: { canonical: 'かな・漢字', plain: 'ひらがなカタカナと漢字', aliases: ['日本語'] },
}

/** 文字体系 → 国。**`disputed` も含める**（合意が取れなかっただけである） */
const byScript = new Map()
for (const row of countries) {
    for (const s of row.scripts ?? []) {
        if (!byScript.has(s)) byScript.set(s, [])
        byScript.get(s).push(row.code)
    }
}

const SRC_SCRIPTS = 'https://en.wikipedia.org/wiki/List_of_writing_systems'

const scriptAdditions = [...byScript.entries()]
    .filter(([s]) => SCRIPT_LABELS[s])
    .map(([s, codes]) => {
        const label = SCRIPT_LABELS[s]
        const sorted = [...new Set(codes)].sort()
        const strength = sorted.length <= 3
            ? '**これが見えればほぼ確定に近い。**'
            : sorted.length <= 15
                ? '**見えれば候補が一気に減る。強い軸である。**'
                : '**単独では絞れない。** 他の欄との積集合で効く。'
        return {
            id: `ref_script_${s}`,
            slot: 'script',
            canonical: label.canonical,
            plain: label.plain,
            aliases: label.aliases,
            codes: sorted,
            note: `${strength}`
                + '国定数テーブルの `scripts` から作った。**`disputed` の国も含めている。**'
                + '`disputed` は「生成時にモデルが食い違った」印であり「事実が不確か」ではない'
                + '（除外するとキリル文字から KZ が落ちた）。'
                + '併記される言語がある国は複数の文字体系に登場する。',
            sources: [SRC_SCRIPTS],
        }
    })

console.log('文字体系の用語')
for (const a of scriptAdditions) {
    console.log(`  ${a.canonical.padEnd(20)} ${String(a.codes.length).padStart(3)} カ国  ${a.codes.length <= 15 ? a.codes.join(' ') : '（多数）'}`)
}
console.log('')

const additions = [
    ...scriptAdditions,
    {
        id: 'ref_traffic_side_left',
        slot: 'traffic_side',
        canonical: '左側通行',
        plain: '車が左側を走っている',
        aliases: ['左側走行', '左ハンドルではなく右ハンドル', '対向車が右から来る'],
        codes: leftInSeed,
        note: '**世界の約 4 分の 1 しかない。分かれば強い。**'
            + '車の向き、ハンドル位置、路上駐車の向き、標識の設置側から読む。'
            + '「右側通行ではない」と分かった時点で候補が大きく減る。',
        sources: [SRC_LHT],
    },
    {
        id: 'ref_traffic_side_right',
        slot: 'traffic_side',
        canonical: '右側通行',
        plain: '車が右側を走っている',
        aliases: ['右側走行', '対向車が左から来る'],
        codes: rightInSeed,
        note: '**世界の約 4 分の 3。単独では絞り込めない。**'
            + 'それでも記録する意味は 2 つある。'
            + '(1) 左側通行の可能性を消せる。(2) 他の欄との積集合には効く。'
            + '**弱いことと、掛けて効かないことは別である。**',
        sources: [SRC_LHT],
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
        certainty: 'heuristic',
        source: 'reference',
        sources: a.sources,
    })
    added += 1
    console.log(`  追加: ${a.id}（${a.codes.length} カ国）`)
}

fs.writeFileSync(HUMAN_PATH, `${JSON.stringify(Array.isArray(human) ? terms : human, null, 4)}\n`, 'utf8')
console.log('')
console.log(`追加した用語: ${added} 件（人手記述は ${terms.length} 語になった）`)
console.log('次: node scripts/validate-glossary.mjs && node scripts/build-glossary.mjs && npm run coverage')
