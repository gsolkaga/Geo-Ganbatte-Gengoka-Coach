/**
 * 掛け合わせて正解に届くかを測る（AI 未使用、消費 0）。
 *
 * ## 測る対象を間違えていた
 *
 * ここまで `npm run coverage`（欄ごとの被覆）を指標にして辞書を足してきた。
 * **それは「入力しても反応が無い欄」を潰す指標であって、
 * 「国に届くか」の指標ではない。**
 *
 * キリル文字の言語固有字を足したとき、`script` 単独で 11 カ国が 1 カ国になった。
 * しかし**そんな字が読めるのは幸運である。** 実戦はそうならない。
 *
 * > **1 つの欄で決まることを期待する設計は、決まらなかったときに何も言えない。**
 *
 * GeoGuessr の実際は**弱い手がかりを掛けて絞る**ことである。
 * 人手ワークシート §15 の判断の流れも、路面 → 通行帯 → 中央線 → 外側線 →
 * 路肩 → 歩道 → 植生 → 標識 → 言語 → ボラード、と**積み上げる形**になっている。
 *
 * したがって測るべきはこれである。
 *
 * ```
 * 正解タグの観察を掛け合わせたとき、どこまで落ちるか
 * その経路のうち、学習者はどこまで取れていたか
 * ```
 *
 * ## 何を出すか
 *
 * 貪欲法で「いちばん強く縮む欄」から順に掛ける。**最短経路そのものではない**
 * （厳密な最小集合は組み合わせ爆発する）が、**学習の順序としては貪欲でよい。**
 * 強い手がかりから探すのが実戦の順序である（`design.md`）。
 *
 * 使い方: node tools/combo-report.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const OUT_PATH = path.join('docs', 'combo-report.md')

const questions = JSON.parse(fs.readFileSync(path.join('data', 'questions.json'), 'utf8'))
const glossary = JSON.parse(fs.readFileSync(path.join('data', 'glossary.json'), 'utf8')).terms
const byId = new Map(glossary.map((t) => [t.id, t]))

/** `server/utils/narrowing.ts` の `usableForNarrowing` と同じ条件 */
const usable = (t) => t !== undefined
    && t.certainty !== 'unverified'
    && t.disputed !== true
    && t.exhaustive !== false

/** 1 欄が示す国の集合。使える用語が無ければ null */
function slotCountries(slots, slot) {
    const entry = slots?.[slot]
    if (!entry || entry.state !== 'visible') return null
    const terms = (entry.terms ?? []).map((id) => byId.get(id)).filter(usable)
    if (terms.length === 0) return null
    let acc = null
    for (const t of terms) {
        const set = new Set(t.countries)
        acc = acc === null ? set : new Set([...acc].filter((c) => set.has(c)))
    }
    return acc
}

/**
 * 貪欲に掛け合わせる。**毎回いちばん強く縮む欄を選ぶ。**
 *
 * 正解を落とす欄は選ばない。**正解を含まない集合へ進むのは誤誘導である。**
 */
function greedyPath(slots, answer) {
    const available = new Map()
    for (const slot of Object.keys(slots ?? {})) {
        const set = slotCountries(slots, slot)
        if (set && set.size > 0 && set.has(answer)) available.set(slot, set)
    }
    const path = []
    let current = null
    for (; ;) {
        let best = null
        for (const [slot, set] of available) {
            const next = current === null ? set : new Set([...current].filter((c) => set.has(c)))
            if (!next.has(answer)) continue
            if (best === null || next.size < best.size) best = { slot, set: next, size: next.size }
        }
        // これ以上縮まないなら終わり。**同じ大きさの欄を並べても学習にならない**
        if (best === null || (current !== null && best.size >= current.size)) break
        path.push({ slot: best.slot, size: best.size, own: available.get(best.slot).size })
        current = best.set
        available.delete(best.slot)
        if (best.size === 1) break
    }
    return { path, final: current }
}

const rows = []
for (const q of questions) {
    const { path, final } = greedyPath(q.slots, q.country)
    // 学習者が取れていた欄（正解タグ側で使える用語がある欄のうち、記述がある欄）
    rows.push({
        id: q.id,
        country: q.country,
        path,
        finalSize: final?.size ?? null,
        finalCountries: final ? [...final].sort() : [],
        // 掛け合わせに使える欄の数。**多いほど絞れる余地がある**
        usableSlots: Object.keys(q.slots ?? {})
            .filter((s) => {
                const set = slotCountries(q.slots, s)
                return set && set.size > 0 && set.has(q.country)
            }).length,
    })
}

const lines = [
    '# 掛け合わせて正解に届くか（AI 未使用、消費 0）',
    '',
    `生成: ${new Date().toISOString()}　\`node tools/combo-report.mjs\``,
    '',
    '## 測る対象を間違えていた',
    '',
    '`npm run coverage`（欄ごとの被覆）は「入力しても反応が無い欄」を潰す指標であり、',
    '**「国に届くか」の指標ではない。**',
    '',
    'キリル文字の言語固有字を足したとき `script` 単独で 11 カ国が 1 カ国になった。',
    'しかし**そんな字が読めるのは幸運である。** 実戦は弱い手がかりを掛けて絞る。',
    '',
    '> **1 つの欄で決まることを期待する設計は、決まらなかったときに何も言えない。**',
    '',
    '## 出題ごとの到達点',
    '',
    '正解タグの観察を、**毎回いちばん強く縮む欄から**貪欲に掛けた結果である。',
    '正解を落とす欄は選んでいない。',
    '',
    '| 問 | 正解 | 掛け合わせに使える欄 | 到達 | 経路 |',
    '|---|---|---|---|---|',
    ...rows.map((r) =>
        `| ${r.id} | ${r.country} | ${r.usableSlots} | `
        + `**${r.finalSize === null ? '算出不能' : `${r.finalSize} カ国`}** | `
        + (r.path.length
            ? r.path.map((p) => `\`${p.slot}\`(${p.own})→${p.size}`).join(' ')
            : '（なし）')
        + ' |'),
    '',
    '`欄(単独の国数)→掛けた後の国数` の順に読む。',
    '',
]

const reached = rows.filter((r) => r.finalSize === 1).length
const stuck = rows.filter((r) => r.finalSize !== null && r.finalSize > 1)
const none = rows.filter((r) => r.finalSize === null)

lines.push(
    '## まとめ',
    '',
    `| 到達 | 件数 |`,
    '|---|---|',
    `| **1 カ国まで届いた** | ${reached} / ${rows.length} |`,
    `| 複数カ国で止まった | ${stuck.length} |`,
    `| 算出不能（使える用語が無い） | ${none.length} |`,
    '',
)

if (stuck.length) {
    lines.push('### 止まった出題と残った候補', '')
    for (const r of stuck) {
        lines.push(`- \`${r.id}\`（正解 ${r.country}）→ ${r.finalSize} カ国 `
            + `[${r.finalCountries.join(' ')}]`)
    }
    lines.push(
        '',
        '**残った候補を割る軸が辞書に無い、または正解タグに記録されていない。**',
        'どちらなのかは正解タグの記述を読めば分かる。',
        '- 記述があるのに用語が無い → **辞書に足す**',
        '- 記述が無い → **その地点でその特徴が見えていない。足しても意味がない**',
        '',
    )
}

lines.push(
    '## この指標の使い方',
    '',
    '**欄ごとの被覆ではなく、この到達点を見て辞書を足す。**',
    '被覆を上げても、掛け合わせて届かなければ学習者は国に辿り着けない。',
    '',
    '> **弱い手がかりを掛けて絞るのが実戦である。**',
    '> **1 つで決まる手がかりが見えるのは幸運であって、設計の前提にできない。**',
    '',
)

fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf8')

console.log('掛け合わせて正解に届くか（消費 0）')
console.log('')
for (const r of rows) {
    console.log(`${r.id}（${r.country}）使える欄 ${r.usableSlots} → `
        + `**${r.finalSize === null ? '算出不能' : `${r.finalSize} カ国`}**`)
    if (r.path.length) {
        console.log(`   経路: ${r.path.map((p) => `${p.slot}(${p.own})→${p.size}`).join(' ')}`)
    }
    if (r.finalSize !== null && r.finalSize > 1) {
        console.log(`   残り: ${r.finalCountries.join(' ')}`)
    }
}
console.log('')
console.log(`1 カ国まで届いた: ${reached} / ${rows.length}`)
console.log(`保存先: ${OUT_PATH}`)
