/**
 * 1 プレイの記録を読む（AI 未使用）。
 *
 * **`status` を鵜呑みにしない。** `finish_reason` と生テキストの長さを必ず並べる。
 * `truncated` を成功に数えた集計で誤った結論を出したことがある
 * （`docs/ai-vs-human-glossary.md` の訂正）。
 *
 * 使い方:
 *   node tools/inspect-run.mjs <ファイル名>
 */
import fs from 'node:fs'
import path from 'node:path'

const name = process.argv[2]
if (!name) {
    console.error('使い方: node tools/inspect-run.mjs <data/runs のファイル名>')
    process.exit(1)
}

const run = JSON.parse(fs.readFileSync(path.join('data', 'runs', name), 'utf8'))

console.log(`=== ${run.questionId} / ${run.variant} / ${run.ts}`)
const j = run.result
const fmt = (v) => (v === null ? '判定不能' : Array.isArray(v) ? (v.length ? v.join(' ') : '（なし）') : String(v))
console.log(`回答: ${run.answer.candidates.map((c) => `${c.country}(${c.confidence})`).join(' ')}`)
console.log(`決め手: ${run.answer.decisiveSlot} / hit=${j.hit}(${j.hitConfidence})`)
console.log(`見落とし: ${fmt(j.missedSlots)} / 失敗モード: ${fmt(j.failureModes)}`)
console.log(`視認できない: ${fmt(j.blindSlots)} / 別ルート: ${fmt(j.alternativeRoute)}`)
console.log('')

console.log('| モデル | status | finish | 生テキスト | 推論 | 秒 | 初byte |')
console.log('|---|---|---|---|---|---|---|')
for (const m of j.models) {
    console.log(
        `| ${m.model} | ${m.status} | ${m.finishReason ?? '—'} | ${m.rawContent.length} 字 `
        + `| ${m.reasoning.length} 字 | ${(m.totalMs / 1000).toFixed(1)} | ${m.firstByteMs ?? '—'} |`,
    )
}

console.log('')
for (const m of j.models) {
    console.log(`\n######## ${m.model}（${m.status} / finish=${m.finishReason}）`)
    if (m.error) console.log(`  error: ${m.error}`)
    const f = m.feedback
    if (!f) {
        console.log('  feedback なし。生テキストの先頭 600 字:')
        console.log(`  ${m.rawContent.slice(0, 600).replace(/\n/g, '\n  ')}`)
        continue
    }
    console.log(`  judgmentUnavailable: ${f.judgmentUnavailable}`)
    console.log(`  summary: ${f.summary}`)
    console.log(`  failureModeExplanation: ${f.failureModeExplanation}`)
    console.log(`  missedClues (${f.missedClues.length} 件):`)
    for (const c of f.missedClues) console.log(`    - [${c.slot}] ${c.whatWasThere} / ${c.whyItMatters}`)
    console.log(`  wrongReasoning (${f.wrongReasoning.length} 件):`)
    for (const c of f.wrongReasoning) console.log(`    - [${c.slot}] ${c.explanation}`)
    console.log(`  vocabulary (${f.vocabulary.length} 件):`)
    for (const c of f.vocabulary) console.log(`    - ${c.learnerWrote} → ${c.canonicalTerm}: ${c.note}`)
    console.log(`  discriminationHint: ${f.discriminationHint}`)
    console.log(`  nextPriority: ${f.nextPriority.join(', ')}`)
    console.log(`  discoveries: ${f.discoveries.join(' / ')}`)
}
