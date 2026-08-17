/**
 * 添削の中身を機械的に監査する（AI 未使用、消費 0）。
 *
 * ## 何のためか
 *
 * **GeoGuessr の学習に使えるかを判定する。** 応答が返ってきたかではない。
 * `status=ok` は「JSON が揃っていた」だけであり、**中身が学習に効くかは別である。**
 *
 * 学習者にとって害になる出力を、正解タグと辞書を持っているこちら側で検出する。
 *
 * | 検査 | なぜ害か |
 * |---|---|
 * | 該当国リストが無い欄で国名を断定 | **その国の弁別子でないものを弁別子として覚える** |
 * | 辞書に無い用語を canonicalTerm に出す | 覚えても他の出題で通じない |
 * | 視認できない欄を「次に見ろ」と言う | 見られないものを探させる |
 * | コードの nextPriority と違う欄を優先 | 計算で出た最短経路から外れる |
 * | 正解タグに無い手がかりを missedClues に出す | **その地点に無かったものを「見落とし」と言う** |
 * | 同じ文言の繰り返し | 出題ごとの学びが無い |
 *
 * 使い方: node tools/audit-feedback.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const OUT_PATH = path.join('docs', 'feedback-audit.md')

const questions = new Map(
    JSON.parse(fs.readFileSync(path.join('data', 'questions.json'), 'utf8')).map((q) => [q.id, q]),
)
const glossary = JSON.parse(fs.readFileSync(path.join('data', 'glossary.json'), 'utf8')).terms
const termById = new Map(glossary.map((t) => [t.id, t]))
const termNames = new Set(glossary.flatMap((t) => [t.canonical, t.plain, ...(t.aliases ?? [])].filter(Boolean)))
const countries = JSON.parse(fs.readFileSync(path.join('data', 'countries.json'), 'utf8'))

/** 国名（日本語）とコードの索引。**本文から国の断定を拾うため** */
const countryByName = new Map(countries.map((c) => [c.name, c.code]))

/**
 * 本文から言及されている国を拾う。
 *
 * 国名（日本語）だけを見る。**2 文字のコードは拾わない**
 * （`RU` はドメイン名の話で正当に出るし、`US` は英単語と衝突する）。
 */
function mentionedCountries(text) {
    if (!text) return []
    const found = new Set()
    for (const [name, code] of countryByName) {
        if (name.length >= 3 && text.includes(name)) found.add(code)
    }
    return [...found]
}

/** その欄について、辞書が該当国を教えてくれているか */
function hasCountryEvidence(question, slot) {
    const entry = question.slots?.[slot]
    if (!entry || !entry.terms?.length) return false
    return entry.terms.some((id) => {
        const t = termById.get(id)
        return t && t.certainty !== 'unverified' && t.disputed !== true && t.countries.length > 0
    })
}

/** 正解タグにその欄の記述があるか。**無い欄の「見落とし」は作られたものである** */
function tagHasSlot(question, slot) {
    const entry = question.slots?.[slot]
    return Boolean(entry && entry.state === 'visible')
}

const COMPARE_DIR = path.join('data', 'compare')
const files = fs.existsSync(COMPARE_DIR)
    ? fs.readdirSync(COMPARE_DIR).filter((n) => n.endsWith('.json')).sort()
    : []

const findings = []
const perModel = new Map()
const summaryTexts = new Map()

const bump = (model, key) => {
    const row = perModel.get(model) ?? { responses: 0, ok: 0, truncated: 0, error: 0, invented: 0, badTerm: 0, blindHint: 0, offPriority: 0, notInTag: 0, tooLong: 0, clues: 0, vocab: 0 }
    row[key] += 1
    perModel.set(model, row)
}

for (const name of files) {
    const data = JSON.parse(fs.readFileSync(path.join(COMPARE_DIR, name), 'utf8'))
    const question = questions.get(data.questionId)
    if (!question) continue
    const judgement = data.v2?.judgement ?? {}
    const blind = new Set(judgement.blindSlots ?? [])
    const codePriority = (judgement.nextPriority ?? []).map((r) => r.slot)

    for (const m of data.v2?.models ?? []) {
        bump(m.model, 'responses')
        bump(m.model, m.status === 'ok' ? 'ok' : m.status === 'truncated' ? 'truncated' : 'error')
        const f = m.feedback
        if (!f) continue

        // 同じ文言の繰り返しを見るため summary を集める
        const list = summaryTexts.get(m.model) ?? []
        list.push({ question: data.questionId, text: f.summary ?? '' })
        summaryTexts.set(m.model, list)

        const total = [f.summary, f.failureModeExplanation, f.discriminationHint]
            .filter(Boolean).join('').length
        if (total > 1200) {
            bump(m.model, 'tooLong')
            findings.push({ q: data.questionId, model: m.model, kind: '長すぎる', detail: `${total} 字（上限 1200）` })
        }

        for (const c of f.missedClues ?? []) {
            bump(m.model, 'clues')
            // (1) 正解タグに無い欄を「見落とし」と言っていないか
            if (!tagHasSlot(question, c.slot)) {
                bump(m.model, 'notInTag')
                findings.push({
                    q: data.questionId, model: m.model, kind: '**タグに無い見落とし**',
                    detail: `\`${c.slot}\` は正解タグで visible ではない: ${String(c.whatWasThere).slice(0, 60)}`,
                })
            }
            // (2) 該当国リストが無い欄で国を断定していないか
            const mentioned = mentionedCountries(c.whyItMatters)
            if (mentioned.length && !hasCountryEvidence(question, c.slot)) {
                bump(m.model, 'invented')
                findings.push({
                    q: data.questionId, model: m.model, kind: '**根拠なく国を断定**',
                    detail: `\`${c.slot}\`（辞書に該当国なし）で ${mentioned.join(' ')} に言及: `
                        + String(c.whyItMatters).slice(0, 90),
                })
            }
        }

        // (3) 辞書に無い用語を canonicalTerm に出していないか
        for (const v of f.vocabulary ?? []) {
            bump(m.model, 'vocab')
            if (v.canonicalTerm && !termNames.has(v.canonicalTerm) && !termById.has(v.canonicalTerm)) {
                bump(m.model, 'badTerm')
                findings.push({
                    q: data.questionId, model: m.model, kind: '辞書に無い用語',
                    detail: `「${v.learnerWrote}」→ **${v.canonicalTerm}**（辞書に無い）`,
                })
            }
        }

        // (4) 視認できない欄を「次に見ろ」と言っていないか
        for (const slot of f.nextPriority ?? []) {
            if (blind.has(slot)) {
                bump(m.model, 'blindHint')
                findings.push({
                    q: data.questionId, model: m.model, kind: '**見えない欄を指示**',
                    detail: `\`${slot}\` は blindSlots に入っている`,
                })
            }
        }

        // (5) コードが出した優先順位と食い違っていないか
        if (codePriority.length) {
            const aiFirst = (f.nextPriority ?? [])[0]
            if (aiFirst && aiFirst !== codePriority[0]) {
                bump(m.model, 'offPriority')
                findings.push({
                    q: data.questionId, model: m.model, kind: '優先順位が計算と違う',
                    detail: `AI は \`${aiFirst}\`、計算は \`${codePriority[0]}\``,
                })
            }
        }
    }
}

// ============================================================
// 出力
// ============================================================

const lines = [
    '# 添削の中身の監査（AI 未使用、消費 0）',
    '',
    `生成: ${new Date().toISOString()}　\`node tools/audit-feedback.mjs\``,
    '',
    `対象: \`data/compare/\` の ${files.length} 件`,
    '',
    '**`status=ok` は「JSON が揃っていた」だけである。** 中身が学習に効くかは別に見る。',
    '正解タグと辞書を持っているのはこちら側なので、**学習者に害になる出力はコードで検出できる。**',
    '',
    '## モデル別',
    '',
    '| モデル | 応答 | ok | 打ち切り | error | 見落とし件数 | 語彙件数 | **国の断定** | 辞書に無い用語 | 見えない欄 | 優先順位ずれ | タグに無い見落とし | 長すぎる |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
]
for (const [model, r] of [...perModel].sort()) {
    lines.push(
        `| ${model.replace(/^preview\//, '')} | ${r.responses} | ${r.ok} | ${r.truncated} | ${r.error} `
        + `| ${r.clues} | ${r.vocab} | **${r.invented}** | ${r.badTerm} | ${r.blindHint} | ${r.offPriority} `
        + `| ${r.notInTag} | ${r.tooLong} |`,
    )
}

// 同じ文言の繰り返し
lines.push('', '## 出題をまたいだ言い回しの重複', '',
    '**同じ文が別の出題で出るなら、その出題から学べていない。**', '',
    '| モデル | summary の件数 | 相異なる先頭 30 字 | 重複率 |', '|---|---|---|---|')
for (const [model, list] of [...summaryTexts].sort()) {
    const heads = new Set(list.map((s) => s.text.slice(0, 30)))
    const dup = list.length ? Math.round((1 - heads.size / list.length) * 100) : 0
    lines.push(`| ${model.replace(/^preview\//, '')} | ${list.length} | ${heads.size} | ${dup}% |`)
}

lines.push('', `## 検出した項目: ${findings.length} 件`, '')
if (findings.length === 0) {
    lines.push('（なし）', '')
}
else {
    const byKind = new Map()
    for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f])
    for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
        lines.push(`### ${kind}: ${list.length} 件`, '')
        for (const f of list) {
            lines.push(`- \`${f.q}\` / ${f.model.replace(/^preview\//, '')} — ${f.detail}`)
        }
        lines.push('')
    }
}

lines.push(
    '## 読み方',
    '',
    '- **「国の断定」が一番重い。** 該当国リストを渡していない欄について',
    '  「この国で頻出」と書かれると、学習者は誤った弁別子を覚える',
    '  （実測: 波形柵を「カザフスタンで頻出」と断定した。旧ソ連圏で広く見られる）',
    '- **「タグに無い見落とし」は作られた手がかりである。** その地点に無かったものを',
    '  「見落とした」と言っている',
    '- 「優先順位ずれ」は必ずしも誤りではない。**計算は辞書の範囲でしか答えられない**ので、',
    '  AI の方が妥当なこともある。ただし**ずれた理由が説明されているか**は見る',
    '- 打ち切りは preview 版モデルのその時点の挙動であり、**アプリの品質とは別の話である**',
    '',
)

fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf8')

console.log(`${files.length} 件を監査した（消費 0）`)
for (const [model, r] of [...perModel].sort()) {
    console.log(`  ${model.replace(/^preview\//, '').padEnd(20)} 応答 ${r.responses} / 国の断定 ${r.invented} / 辞書に無い用語 ${r.badTerm} / 見えない欄 ${r.blindHint} / タグに無い見落とし ${r.notInTag}`)
}
console.log('')
console.log(`検出した項目: ${findings.length} 件`)
console.log(`保存先: ${OUT_PATH}`)
