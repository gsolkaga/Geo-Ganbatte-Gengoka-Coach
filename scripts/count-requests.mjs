/**
 * これまでに消費したリクエスト数を、保存された生成結果から推計する
 *
 * AI を使わない。
 *
 * 注意：これは推計である。正確な数はさくらのコントロールパネルの値が正典。
 *
 *   成功したリクエスト = 保存されたファイル数
 *   HTTP 504           = 消費される（実測）。ファイルは残らないためログから拾う
 *   HTTP 400           = 消費されない（実測）
 *
 * したがってファイル数は下限であり、実際の消費はこれ以上になる。
 */

import fs from 'node:fs'
import path from 'node:path'

const DOCS = 'docs'

const GROUPS = [
    { label: '仕様書生成の検証', dir: 'generated', category: 'model_compare' },
    { label: '国定数テーブル', dir: 'generated-countries', category: 'knowledge_verify' },
    { label: '用語辞書', dir: 'generated-glossary', category: 'glossary_gen' },
    { label: '用語辞書（対照実験）', dir: 'generated-glossary-variant', category: 'glossary_gen' },
    { label: 'ストリーミング検証', dir: 'generated-streaming', category: 'model_compare' },
    { label: 'ボラード属性軸', dir: 'generated-bollard', category: 'knowledge_verify' },
]

let total = 0
const rows = []

for (const g of GROUPS) {
    const dir = path.join(DOCS, g.dir)
    if (!fs.existsSync(dir)) {
        rows.push({ ...g, files: 0, failed: 0, note: 'ディレクトリなし' })
        continue
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))

    // 同じディレクトリの CSV から失敗を拾う。504 は消費されるため加算する
    let failed = 0
    for (const csv of fs.readdirSync(dir).filter((f) => f.endsWith('.csv'))) {
        const lines = fs.readFileSync(path.join(dir, csv), 'utf8').trim().split(/\r?\n/).slice(1)
        for (const line of lines) {
            const cells = line.split(',').map((c) => c.replace(/^"|"$/g, ''))
            // ok 列が false かつ 504 を含むものを数える
            if (cells[2] === 'false' && /504/.test(line)) failed++
        }
    }

    total += files.length + failed
    rows.push({ ...g, files: files.length, failed, note: '' })
}

console.log('| 用途 | 分類 | 成功 | 504 | 小計 |')
console.log('|---|---|---|---|---|')
for (const r of rows) {
    console.log(`| ${r.label} | ${r.category} | ${r.files} | ${r.failed} | ${r.files + r.failed} |${r.note ? ' ' + r.note : ''}`)
}
console.log('')
console.log(`推計合計: ${total}`)
console.log('')
console.log('これは下限である。ログに残らない失敗、Playground での試行、')
console.log('スキーマ設計中の 400（消費されない）は含まれない。')
console.log('正確な数はさくらのコントロールパネルを正典とすること。')
