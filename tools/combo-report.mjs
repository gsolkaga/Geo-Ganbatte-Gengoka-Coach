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

/** 辞書が扱う国の総数。**「広すぎる用語」の基準に使う** */
const countryCount = (() => {
    const all = new Set()
    for (const t of glossary) for (const c of t.countries ?? []) all.add(c)
    return all.size
})()

/** これを超える該当国しか無い欄は「観察が国を示さない」と分類する */
const HALF = Math.ceil(countryCount / 2)

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
        hints: hintsFor(q.slots),
        blocked: blockedFor(q.slots),
        unmatched: unmatchedFor(q.slots),
    })
}

/**
 * **記述があるのに用語が 1 つも付かなかった欄。** ここが本当の辞書の欠落である。
 *
 * `blocked` は用語が付いた欄しか見ていない。付かなかった欄は表に出てこないため、
 * 「辞書は足りている」という誤った読みになる。
 *
 * ただし**記述を読まずに埋めてはならない。** 記述が
 * 「Gen4」「木の陰が北側に出ている」なら、用語を作っても国は縮まない。
 */
function unmatchedFor(slots) {
    const out = []
    for (const [slot, entry] of Object.entries(slots ?? {})) {
        if (entry.state !== 'visible') continue
        if ((entry.terms ?? []).length > 0) continue
        out.push({ slot, plain: entry.plain ?? '', recognition: entry.recognition ?? null })
    }
    return out
}

/**
 * **絞り込みに使えないが説明はできる手がかり。**
 * `server/utils/narrowing.ts` の `buildNonExhaustiveHints` と同じ条件。
 */
function hintsFor(slots) {
    const out = []
    for (const [slot, entry] of Object.entries(slots ?? {})) {
        if (entry.state !== 'visible') continue
        for (const id of entry.terms ?? []) {
            const t = byId.get(id)
            if (!t || t.exhaustive !== false) continue
            if (t.certainty === 'unverified' || t.disputed === true) continue
            if (t.source !== 'reference') continue
            out.push({ slot, id, canonical: t.canonical, countries: [...t.countries].sort() })
        }
    }
    return out
}

/**
 * **辞書が足りないのか、観察が国を示さないのか。** これを混ぜてはならない。
 *
 * 最初にこの表を出したとき「pavement は 10 問すべてが AI生成。
 * 出典から埋める必要がある」と結論した。**それは誤りだった。**
 *
 * ```
 * ai_pavement_01「アスファルト舗装」   102 カ国
 * ai_vehicle_01「白い横長のプレート」  101 カ国
 * ```
 *
 * 出典から埋めても縮まない。**アスファルトはどこにでもある。**
 * 観察が事実であることと、その観察が国を示すことは別である。
 *
 * > **足しても縮まないものを、足りないと呼んではならない。**
 *
 * 該当国が全体の半分を超える用語は「国を示さない」と分類する。
 * `ground` と `season` を埋めないと決めたのと同じ理由である
 * （土や葉の色は国境で切れない）。
 */
function blockedFor(slots) {
    const out = []
    for (const [slot, entry] of Object.entries(slots ?? {})) {
        if (entry.state !== 'visible') continue
        const terms = (entry.terms ?? []).map((id) => byId.get(id)).filter(Boolean)
        if (terms.length === 0) continue
        if (terms.some(usable)) continue
        // **該当国が広すぎる用語しか無いなら、辞書の問題ではない**
        const widest = Math.max(...terms.map((t) => t.countries?.length ?? 0))
        if (widest > HALF) {
            out.push({ slot, verdict: 'no_signal', widest })
            continue
        }
        const reasons = new Set()
        for (const t of terms) {
            if (t.certainty === 'unverified') reasons.add('AI生成')
            else if (t.disputed === true) reasons.add('不一致あり')
            else if (t.exhaustive === false) reasons.add('網羅でない')
        }
        out.push({ slot, verdict: 'fixable', reasons: [...reasons], widest })
    }
    return out
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

const withHints = rows.filter((r) => r.hints.length)
if (withHints.length) {
    lines.push(
        '## 絞り込みに使えないが、説明はできる手がかり',
        '',
        '`exhaustive: false` の用語は積集合に入れない。ユーカリを入れれば',
        'ポルトガル・スペイン・ブラジルを誤って消してしまう。',
        '',
        '**しかし完全に捨てるのも誤りだった。** オーストラリアの出題では',
        '学習者が「ユーカリの木だらけ」と書き、`ref_flora_eucalyptus`（該当国 AU）が',
        '割り当てられているのに、応答のどこにも現れていなかった。',
        '',
        '> **絞り込みに使えないことと、言うべきことが無いことは別である。**',
        '',
        '`buildNonExhaustiveHints` で別枠として渡す。件数は書かない。',
        '**件数を書くと絞り込み力に見える。**',
        '',
    )
    for (const r of withHints) {
        lines.push(`- \`${r.id}\`（正解 ${r.country}）`)
        for (const h of r.hints) {
            lines.push(`    - \`${h.slot}\` ${h.canonical} → よく見られる国 [${h.countries.join(' ')}]`)
        }
    }
    lines.push('')
}

const noSignal = rows.flatMap((r) => r.blocked.filter((b) => b.verdict === 'no_signal')
    .map((b) => ({ ...b, q: r.id })))
const fixable = rows.flatMap((r) => r.blocked.filter((b) => b.verdict === 'fixable')
    .map((b) => ({ ...b, q: r.id })))

lines.push(
    '## 足しても縮まないものを、足りないと呼んではならない',
    '',
    'この表を最初に出したとき「pavement は 10 問すべてが AI生成。',
    '出典から埋める必要がある」と結論した。**それは誤りだった。**',
    '',
    '```',
    'ai_pavement_01「アスファルト舗装」   102 カ国',
    'ai_vehicle_01「白い横長のプレート」  101 カ国',
    '```',
    '',
    '出典から埋めても縮まない。**アスファルトはどこにでもある。**',
    '観察が事実であることと、その観察が国を示すことは別である。',
    '',
    `辞書が扱う国は ${countryCount} 件。該当国が ${HALF} 件を超える用語しか無い欄は、`,
    '**辞書の欠落ではなく観察の性質**として分類する。',
    '`ground` と `season` を埋めないと決めたのと同じ理由である。',
    '',
)

if (noSignal.length) {
    const bySlot = new Map()
    for (const b of noSignal) bySlot.set(b.slot, (bySlot.get(b.slot) ?? 0) + 1)
    lines.push(
        '### 観察が国を示していない欄（辞書を足しても縮まない）',
        '',
        '| 欄 | 件数 |',
        '|---|---|',
        ...[...bySlot.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `| \`${s}\` | ${n} |`),
        '',
    )
}

if (fixable.length) {
    lines.push(
        '### 辞書で直せる欄（該当国が狭い用語しか無い）',
        '',
        '**ここだけが出典から埋める対象である。**',
        '',
        ...fixable.map((b) =>
            `- \`${b.q}\` \`${b.slot}\`（${b.reasons.join('・')} / 最も広い用語 ${b.widest} カ国）`),
        '',
    )
}

const unmatched = rows.flatMap((r) => r.unmatched.map((u) => ({ ...u, q: r.id })))
if (unmatched.length) {
    const bySlot = new Map()
    for (const u of unmatched) {
        if (!bySlot.has(u.slot)) bySlot.set(u.slot, [])
        bySlot.get(u.slot).push(u)
    }
    lines.push(
        '## 記述があるのに用語が 1 つも付かなかった欄',
        '',
        '**ここが本当の辞書の欠落である。** 上の表は用語が付いた欄しか見ていないため、',
        'これを出さないと「辞書は足りている」という誤った読みになる。',
        '',
        '**ただし記述を読まずに埋めてはならない。** 「Gen4」や',
        '「木の陰が北側に出ている」に用語を作っても国は縮まない。',
        '',
        `合計 ${unmatched.length} 件。`,
        '',
    )
    for (const [slot, items] of [...bySlot.entries()].sort((a, b) => b[1].length - a[1].length)) {
        lines.push(`### \`${slot}\`（${items.length} 件）`, '')
        for (const u of items) {
            const rec = u.recognition ? ` [${u.recognition}]` : ''
            lines.push(`- \`${u.q}\`${rec} ${u.plain || '（記述なし）'}`)
        }
        lines.push('')
    }
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
    for (const h of r.hints) {
        console.log(`   示唆（絞り込みに使わない）: ${h.slot} ${h.canonical} [${h.countries.join(' ')}]`)
    }
    const ns = r.blocked.filter((b) => b.verdict === 'no_signal')
    const fx = r.blocked.filter((b) => b.verdict === 'fixable')
    if (ns.length) {
        console.log(`   観察が国を示さない欄: ${ns.map((b) => `${b.slot}(${b.widest}カ国)`).join(' ')}`)
    }
    if (fx.length) {
        console.log(`   辞書で直せる欄: ${fx.map((b) => `${b.slot}(${b.reasons.join('・')})`).join(' ')}`)
    }
}
console.log('')
console.log(`1 カ国まで届いた: ${reached} / ${rows.length}`)
console.log(`示唆が出る出題: ${withHints.length} / ${rows.length}`)
console.log(`観察が国を示さない欄: ${noSignal.length} 件（辞書を足しても縮まない）`)
console.log(`辞書で直せる欄: ${fixable.length} 件`)
console.log(`用語が 1 つも付かなかった欄: ${unmatched.length} 件（記述を読んで判断する）`)
console.log(`保存先: ${OUT_PATH}`)
