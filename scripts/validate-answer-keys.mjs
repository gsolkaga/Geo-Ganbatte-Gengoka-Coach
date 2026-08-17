/**
 * 正解タグと用語辞書の整合を調べる（AI 未使用、リクエスト消費 0）
 *
 * ## 何を見るか
 *
 * 正解タグに割り当てた用語の該当国リストに、**その出題の正解国が入っているか。**
 *
 * 入っていなければ「そのスロットを見れば N カ国に絞れる」という助言の先に
 * 正解が無いことになる。**助言が学習者を正解から遠ざける。**
 *
 * ## 誰の問題か
 *
 * **タグ付けの誤りではない。** タグは「この地点に何が写っているか」を書くもので、
 * 一般的な GeoGuessr プレイヤーの知識に基づいて作る。それは正しい。
 *
 * 問題は**用語が「見た目の名前」と「該当国の主張」を 1 つに束ねている**ことである。
 *
 * ```
 * 観察          「中央線は黄色の実線」          ← 正しい
 * 用語 ID        road_marking_center_yellow    ← 文字面としては正しい対応
 * 用語が持つ主張 「US CA MX BR ... TH KH の 13 カ国」  ← **KZ が無い**
 * ```
 *
 * > **用語は観察の名前ではなく、主張である。**
 * > 正規化すると、名前だけでなく主張まで輸入される。
 *
 * したがって直すのは**辞書の該当国リスト**である（`data/glossary-human.json`）。
 * 人間の作業であり、これが Plonk It が何年もかけていることである。
 *
 * 使い方:
 *   node scripts/validate-answer-keys.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const OUT_PATH = path.join('docs', 'glossary-gaps.md')

const questions = JSON.parse(fs.readFileSync(path.join('data', 'questions.json'), 'utf8'))
const glossary = JSON.parse(fs.readFileSync(path.join('data', 'glossary.json'), 'utf8')).terms
const byId = new Map(glossary.map((t) => [t.id, t]))

/** 絞り込みに使う用語だけを見る（`server/utils/narrowing.ts` と同じ条件） */
const usable = (t) => t !== undefined && t.certainty !== 'unverified'

const gaps = []
const missingIds = []

for (const question of questions) {
    for (const [slot, entry] of Object.entries(question.slots)) {
        if (entry.state !== 'visible' || entry.terms.length === 0) continue

        const terms = entry.terms.map((id) => {
            const t = byId.get(id)
            if (!t) missingIds.push({ question: question.id, slot, id })
            return t
        })
        const used = terms.filter(usable)
        if (used.length === 0) continue

        // 同一スロット内は積集合。`narrowing.ts` と揃える
        let acc = null
        for (const t of used) {
            const set = new Set(t.countries)
            acc = acc === null ? set : new Set([...acc].filter((c) => set.has(c)))
        }

        if (acc.size === 0) {
            gaps.push({
                question: question.id, country: question.country, slot,
                kind: '矛盾', size: 0,
                terms: used.map((t) => `${t.id}(${t.countries.length})`).join(' + '),
                detail: '同一スロット内の用語の積集合が空。用語のどれかの該当国が偏っている',
            })
            continue
        }
        if (!acc.has(question.country)) {
            gaps.push({
                question: question.id, country: question.country, slot,
                kind: '正解を含まない', size: acc.size,
                terms: used.map((t) => `${t.id}(${t.countries.length})`).join(' + '),
                detail: `${question.country} を該当国に追加するか、この用語の割り当てを見直す`,
            })
        }
    }
}

const lines = [
    '# 正解タグと用語辞書の不整合',
    '',
    `生成: ${new Date().toISOString()}　`,
    '`node scripts/validate-answer-keys.mjs` が算出した。**AI を使っていない。リクエスト消費 0。**',
    '',
    '## これはタグ付けの誤りではない',
    '',
    'タグは「この地点に何が写っているか」を書くものであり、',
    '一般的な GeoGuessr プレイヤーの知識に基づいて作る。**それは正しい。**',
    '',
    '問題は**用語が「見た目の名前」と「該当国の主張」を 1 つに束ねている**ことである。',
    '',
    '```',
    '観察           「中央線は黄色の実線」                ← 正しい',
    '用語 ID         road_marking_center_yellow          ← 文字面としては正しい対応',
    '用語が持つ主張  US CA MX BR AR UY PE BO PY CO EC TH KH  ← **KZ が無い**',
    '```',
    '',
    '> **用語は観察の名前ではなく、主張である。**',
    '> 正規化すると、名前だけでなく主張まで輸入される。',
    '',
    'したがって直すのは **`data/glossary-human.json` の該当国リスト**である。',
    '人間の作業であり、**これが Plonk It が何年もかけていることである。**',
    '',
    `## 検出: ${gaps.length} 件`,
    '',
    gaps.length ? '| 問 | 正解 | スロット | 種類 | 残り | 用語（該当国数） |' : '（なし）',
    gaps.length ? '|---|---|---|---|---|---|' : '',
    ...gaps.map((g) =>
        `| ${g.question} | ${g.country} | \`${g.slot}\` | **${g.kind}** | ${g.size} | ${g.terms} |`),
    '',
]

if (gaps.length) {
    lines.push('## 対応の候補', '')
    for (const g of gaps) {
        lines.push(`- **${g.question} / \`${g.slot}\`**（${g.kind}）: ${g.detail}`)
    }
    lines.push('')
}

if (missingIds.length) {
    lines.push(
        '## 辞書に存在しない用語 ID',
        '',
        '**辞書を再生成したときに ID が変わった可能性がある。**',
        '',
        ...missingIds.map((m) => `- ${m.question} / \`${m.slot}\`: \`${m.id}\``),
        '',
    )
}

lines.push(
    '## 影響',
    '',
    '`server/utils/narrowing.ts` は以下を守っているため、**誤った助言は表示されない。**',
    '',
    '- 積集合が空（矛盾）の行は `nextPriority` に出さない',
    '- **正解国を含まない行は `nextPriority` に出さない**',
    '- `unverified`（AI 生成）の用語は絞り込み計算に使わない',
    '',
    'その結果として「次に見るべきスロット」が空になる出題がある。',
    '**空であることが、辞書が足りていないという事実の表示である。**',
    '',
)

fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf8')

console.log(`出題 ${questions.length} 件 / 用語 ${glossary.length} 件を検査した（消費 0）`)
console.log('')
console.log(`**不整合: ${gaps.length} 件**`)
for (const g of gaps) {
    console.log(`  ${g.question}（正解 ${g.country}）/ ${g.slot.padEnd(20)} ${g.kind.padEnd(8)} 残り ${g.size} : ${g.terms}`)
}
if (missingIds.length) console.log(`辞書に無い用語 ID: ${missingIds.length} 件`)
console.log('')
console.log(`保存先: ${OUT_PATH}`)
