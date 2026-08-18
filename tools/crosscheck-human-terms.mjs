/**
 * 人手記述を出典と突き合わせる（AI 未使用、消費 0）。
 *
 * ## なぜ必要か
 *
 * > 人間の記述が妥当性を持っているかどうかチェックすら出来ない今の状態で
 * > AI がコーチしますと言っても説得力が皆無です。
 *
 * これは正しい。人手記述 28 語は**誰も検証していない。**
 * `certainty: 'heuristic'` と書いてあるだけで、根拠が辿れない。
 *
 * いま `reference` が 141 語ある。**同じ国について何か言っている用語があれば、
 * 突き合わせられる。**
 *
 * ## 何を出すか
 *
 * 人手記述の各語について、**同じスロットで同じ国に言及している出典由来の用語**を並べる。
 *
 * | 状態 | 意味 |
 * |---|---|
 * | 裏づけあり | 同じスロット・同じ国を指す出典の用語がある |
 * | 出典に無い | その軸を出典が扱っていない。**誤りとは言えない** |
 * | 国が食い違う | 同じ見た目の記述で国が違う。**要確認** |
 *
 * **「出典に無い」を誤りにしない。** 本人が実戦で気づいたことが
 * 出典に載っていないのは普通である。それが人間の寄与である。
 *
 * > **裏づけが取れないことと、間違っていることは別である。**
 *
 * 使い方: node tools/crosscheck-human-terms.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const OUT_PATH = path.join('docs', 'human-terms-crosscheck.md')

const glossary = JSON.parse(fs.readFileSync(path.join('data', 'glossary.json'), 'utf8')).terms
const humanTerms = glossary.filter((t) => t.source === 'human')
const refTerms = glossary.filter((t) => t.source === 'reference')

const rows = []
for (const h of humanTerms) {
    const sameSlot = refTerms.filter((r) => r.slot === h.slot)
    // 同じスロットで、人手の該当国と 1 つ以上重なる出典用語
    const overlapping = sameSlot
        .map((r) => ({ r, shared: h.countries.filter((c) => r.countries.includes(c)) }))
        .filter((x) => x.shared.length > 0)
        .sort((a, b) => b.shared.length - a.shared.length)
    /**
     * **同じスロットに出典の用語があるだけでは食い違いではない。**
     *
     * 最初はそう判定して 9 件を「国が食い違う」と出した。**判定が粗かった。**
     * 中身を見ると、ほぼ全部が**こちらの取り込み漏れ**だった
     * （アイスランドの黄色いボラードは出典に載っているのに入れていなかった）。
     *
     * > **同じ欄を扱っていることと、同じものを指していることは別である。**
     *
     * 記述が似ているものだけを比較対象にする。似た記述が無ければ
     * 「その軸が未収録」であり、人手記述の誤りではない。
     */
    const words = (t) => new Set(
        [t.canonical, t.plain, ...(t.aliases ?? [])]
            .join(' ')
            .replace(/[（）()・、。]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length >= 2),
    )
    const hw = words(h)
    const similar = sameSlot.filter((r) => {
        const rw = words(r)
        let shared = 0
        for (const w of hw) if (rw.has(w)) shared += 1
        return shared >= 2
    })
    const disjoint = similar.filter((r) => !h.countries.some((c) => r.countries.includes(c)))

    rows.push({
        h,
        state: overlapping.length > 0
            ? '裏づけあり'
            : disjoint.length > 0
                ? '国が食い違う'
                : '出典に無い（軸が未収録）',
        similar: disjoint.slice(0, 3),
        overlapping: overlapping.slice(0, 3),
        sameSlotCount: sameSlot.length,
        disjointCount: disjoint.length,
    })
}

const backed = rows.filter((r) => r.state === '裏づけあり').length
const notCovered = rows.filter((r) => r.state.startsWith('出典に無い')).length
const conflict = rows.filter((r) => r.state === '国が食い違う').length

const lines = [
    '# 人手記述と出典の突き合わせ（AI 未使用、消費 0）',
    '',
    `生成: ${new Date().toISOString()}　\`node tools/crosscheck-human-terms.mjs\``,
    '',
    `人手記述 ${humanTerms.length} 語 / 出典由来 ${refTerms.length} 語`,
    '',
    '## なぜ必要か',
    '',
    '人手記述は誰も検証していなかった。`certainty: heuristic` と書いてあるだけで、',
    '**根拠が辿れなかった。** 出典由来の用語が増えたので、突き合わせられるようになった。',
    '',
    '> **裏づけが取れないことと、間違っていることは別である。**',
    '',
    '「出典に無い」を誤りとして扱わない。本人が実戦で気づいたことが出典に',
    '載っていないのは普通であり、**それが人間の寄与である。**',
    '',
    '## まとめ',
    '',
    '| 状態 | 件数 |',
    '|---|---|',
    `| 裏づけあり | ${backed} / ${humanTerms.length} |`,
    `| 出典に無い（軸ごと未収録） | ${notCovered} |`,
    `| 国が食い違う（要確認） | ${conflict} |`,
    '',
    '## 各語',
    '',
    '| 人手記述 | 欄 | 該当国 | 状態 | 重なる出典の用語 |',
    '|---|---|---|---|---|',
    ...rows.map((r) =>
        `| ${r.h.canonical} | \`${r.h.slot}\` | ${r.h.countries.join(' ') || '—'} | `
        + `${r.state === '裏づけあり' ? '裏づけあり' : `**${r.state}**`} | `
        + (r.overlapping.length
            ? r.overlapping.map((o) => `${o.r.canonical}（${o.shared.join(' ')}）`).join(' / ')
            : '—')
        + ' |'),
    '',
]

if (conflict > 0) {
    lines.push(
        '## 国が食い違うもの',
        '',
        '同じ欄に出典の用語があるのに、該当国が 1 つも重ならない。',
        '**どちらかが誤っているか、別の軸を見ている。**',
        '',
    )
    for (const r of rows.filter((x) => x.state === '国が食い違う')) {
        lines.push(`### ${r.h.canonical}（\`${r.h.slot}\`、${r.h.countries.join(' ')}）`, '')
        lines.push(`- 同じ欄の出典の用語: ${r.sameSlotCount} 件。**そのすべてと国が重ならない**`)
        if (r.h.note) lines.push(`- note: ${String(r.h.note).replace(/\*/g, '').slice(0, 160)}`)
        lines.push('')
    }
}

lines.push(
    '## 読み方',
    '',
    '- **裏づけありは「出典と同じ国を指している」だけである。** 見た目の記述が',
    '  同じとは限らない。厳密な一致は人間が読んで判断する',
    '- **出典に無い軸は、足すべき候補でもある。** 本人が見ている軸を',
    '  出典が扱っていないなら、それは辞書の空白である',
    '- **国が食い違うものは最優先で確認する。** 学習者に誤った弁別子を',
    '  教えることになる',
    '',
)

fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf8')

console.log(`人手記述 ${humanTerms.length} 語 / 出典由来 ${refTerms.length} 語`)
console.log('')
console.log(`裏づけあり            : ${backed}`)
console.log(`出典に無い（軸ごと）  : ${notCovered}`)
console.log(`**国が食い違う**      : ${conflict}`)
console.log('')
for (const r of rows) {
    const mark = r.state === '裏づけあり' ? ' ' : '!'
    console.log(`${mark} ${r.h.canonical.padEnd(30)} ${r.h.slot.padEnd(19)} ${r.state}`)
}
console.log('')
console.log(`保存先: ${OUT_PATH}`)
