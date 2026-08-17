/**
 * `disputed: true` の用語を一覧する（AI 未使用、消費 0）。
 *
 * `disputed` は「該当国リストの不一致が分かっている」印であり、
 * `server/utils/narrowing.ts` は絞り込み計算から外す。
 *
 * **外したまま忘れるのが一番危ない。** 一覧で見えるようにしておく。
 *
 * 使い方: node tools/list-disputed.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const glossary = JSON.parse(fs.readFileSync(path.join('data', 'glossary.json'), 'utf8')).terms
const questions = JSON.parse(fs.readFileSync(path.join('data', 'questions.json'), 'utf8'))

/** 正解タグで使われている用語 ID → 出題 ID */
const usedIn = new Map()
for (const q of questions) {
    for (const [slot, entry] of Object.entries(q.slots)) {
        for (const id of entry.terms ?? []) {
            if (!usedIn.has(id)) usedIn.set(id, [])
            usedIn.get(id).push(`${q.id}/${slot}`)
        }
    }
}

const disputed = glossary.filter((t) => t.disputed === true)
console.log(`用語 ${glossary.length} 件 / disputed ${disputed.length} 件`)
console.log('')

const inKeys = disputed.filter((t) => usedIn.has(t.id))
console.log(`正解タグで使われている disputed: ${inKeys.length} 件（絞り込みには使われない）`)
for (const t of inKeys) {
    console.log(`  ${t.id}`)
    console.log(`    certainty=${t.certainty} 該当国=${t.countries.length} source=${t.source}`)
    console.log(`    使用箇所: ${usedIn.get(t.id).join(', ')}`)
    if (t.note) console.log(`    note: ${String(t.note).replace(/\*/g, '').slice(0, 100)}`)
}
console.log('')
console.log(`正解タグで使われていない disputed: ${disputed.length - inKeys.length} 件`)
