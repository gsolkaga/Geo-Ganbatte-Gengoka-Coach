/**
 * 辞書がどこまで世界を覆えているかを測る（AI 未使用、消費 0）。
 *
 * ## なぜ 10 問と切り離すのか
 *
 * `npm run validate:keys` は**いま用意した 10 問**に対する検査である。
 * それだけを見て辞書を足すと、**10 問でだけ動くアプリになる。**
 *
 * このアプリの目的は「学習者が任意の地点を追加して使う」ことである。
 * したがって測るべきは**世界に対する被覆**であり、10 問の整合ではない。
 *
 * > **サンプルに合わせて作ると、サンプルの外で使えない。**
 *
 * ## 何を測るか
 *
 * スロットごとに、**絞り込みに使える用語**（`unverified` と `disputed` を除く）が
 * 候補国のどれだけを名前で言えるかを出す。
 *
 * ```
 * 被覆   その欄について、少なくとも 1 つの用語が言及している国の割合
 * 弁別力 その欄の用語の該当国数の中央値。小さいほど強い
 * ```
 *
 * **被覆が低い欄は、そこを観察しても辞書が何も返せない。**
 * 学習者から見ると「入力しても反応が無い欄」である。
 *
 * 使い方: node tools/coverage-report.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const OUT_PATH = path.join('docs', 'dataset-coverage.md')

const countries = JSON.parse(fs.readFileSync(path.join('data', 'countries.json'), 'utf8'))
const glossary = JSON.parse(fs.readFileSync(path.join('data', 'glossary.json'), 'utf8')).terms

/**
 * スロットの一覧。**`shared/slots.ts` の `SLOT_IDS` から読む。**
 *
 * 辞書に出てくるスロットだけを数えると、**用語が 1 つも無い欄が表から消える。**
 * 被覆 0% の欄を見えなくしては意味がない。
 */
const slotSource = fs.readFileSync(path.join('shared', 'slots.ts'), 'utf8')
const block = /SLOT_IDS[^[]*\[([^\]]*)\]/s.exec(slotSource)
const fromSource = block ? [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : []
const slotIds = fromSource.length ? fromSource : [...new Set(glossary.map((t) => t.slot))]

const allCodes = new Set(countries.map((c) => c.code))

/** `server/utils/narrowing.ts` の `usableForNarrowing` と同じ条件 */
const usable = (t) => t.certainty !== 'unverified' && t.disputed !== true

const median = (values) => {
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

const rows = []
for (const slot of slotIds) {
    const all = glossary.filter((t) => t.slot === slot)
    const use = all.filter(usable)
    const covered = new Set()
    for (const t of use) for (const c of t.countries) if (allCodes.has(c)) covered.add(c)
    rows.push({
        slot,
        terms: all.length,
        usable: use.length,
        human: all.filter((t) => t.source === 'human').length,
        reference: all.filter((t) => t.source === 'reference').length,
        ai: all.filter((t) => t.source === 'ai').length,
        covered: covered.size,
        ratio: allCodes.size ? Math.round((covered.size / allCodes.size) * 100) : 0,
        medianSize: median(use.map((t) => t.countries.length)),
    })
}

// 被覆が低い順。**足すべき場所を先に出す**
const sorted = [...rows].sort((a, b) => a.ratio - b.ratio)

/** どの国も 1 つの用語からも言及されていない = その国に来たら辞書が何も返せない */
const mentioned = new Set()
for (const t of glossary.filter(usable)) for (const c of t.countries) mentioned.add(c)
const unmentioned = countries.filter((c) => !mentioned.has(c.code))

const lines = [
    '# 辞書の被覆（AI 未使用、消費 0）',
    '',
    `生成: ${new Date().toISOString()}　\`node tools/coverage-report.mjs\``,
    '',
    `候補国 ${allCodes.size} / 用語 ${glossary.length}（絞り込みに使える ${glossary.filter(usable).length}）`,
    '',
    '## これは 10 問の検査ではない',
    '',
    '`npm run validate:keys` は**いま用意した出題**に対する検査である。',
    'それだけを見て辞書を足すと、**その出題でだけ動くアプリになる。**',
    '',
    'このアプリは学習者が任意の地点を追加して使うものなので、',
    '測るべきは**世界に対する被覆**である。',
    '',
    '> **サンプルに合わせて作ると、サンプルの外で使えない。**',
    '',
    '## スロット別（被覆が低い順）',
    '',
    '| 欄 | 被覆 | 言える国 | 使える用語 | human | reference | ai | 該当国数の中央値 |',
    '|---|---|---|---|---|---|---|---|',
    ...sorted.map((r) =>
        `| \`${r.slot}\` | ${r.ratio}% | ${r.covered} | ${r.usable} / ${r.terms} `
        + `| ${r.human} | ${r.reference} | ${r.ai} | ${r.medianSize ?? '—'} |`),
    '',
    '**被覆が低い欄は、そこを観察しても辞書が何も返せない。**',
    '学習者から見ると「入力しても反応が無い欄」である。',
    '',
    '`ai` は絞り込み計算に使わないため、**その列が大きくても被覆は上がらない。**',
    '',
    '## 1 つの用語からも言及されていない国',
    '',
    `**${unmentioned.length} / ${allCodes.size} カ国。**`,
    'この国に来た学習者は、どの欄を観察しても辞書が名前を返せない。',
    '',
]

if (unmentioned.length) {
    const byRegion = new Map()
    for (const c of unmentioned) {
        byRegion.set(c.region ?? '—', [...(byRegion.get(c.region ?? '—') ?? []), c])
    }
    lines.push('| 地域 | 国 |', '|---|---|')
    for (const [region, list] of [...byRegion].sort((a, b) => b[1].length - a[1].length)) {
        lines.push(`| ${region} | ${list.map((c) => `${c.name}(${c.code})`).join('、')} |`)
    }
    lines.push('')
}

lines.push(
    '## 足す順序',
    '',
    '**被覆の低い欄から足す。** ただし「弱いメタを大量に足す」ことが目的ではない。',
    '',
    '優先順位の考え方。',
    '',
    '1. **世界のどこでも観察できる欄**（走行帯・文字・路面標示）を先に埋める。',
    '   どの地点でも必ず入力されるため、被覆が上がると全出題に効く',
    '2. **強い弁別力を持つ欄**（ボラード・標識・車両）を次に埋める。',
    '   該当国数が少ない用語は 1 つで候補を大きく削る',
    '3. 地域固有の欄は、その地域の出題を追加するときに足す',
    '',
    '**出典を当たって足す。** 私が想像した該当国リストは使えない',
    '（`docs/v2-kz.md` 章 8 の波形柵の誤断定）。',
    'AI に生成させた分も地域が偏って使えなかった（`unverified` として除外している）。',
    '',
)

fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf8')

console.log(`候補国 ${allCodes.size} / 用語 ${glossary.length}（使える ${glossary.filter(usable).length}）`)
console.log('')
console.log('被覆が低い欄（先に足すべき順）')
for (const r of sorted) {
    console.log(`  ${String(r.ratio).padStart(3)}%  ${r.slot.padEnd(20)} 言える国 ${String(r.covered).padStart(3)} / 使える用語 ${r.usable}/${r.terms}`)
}
console.log('')
console.log(`**1 つの用語からも言及されていない国: ${unmentioned.length} / ${allCodes.size}**`)
console.log(`保存先: ${OUT_PATH}`)
