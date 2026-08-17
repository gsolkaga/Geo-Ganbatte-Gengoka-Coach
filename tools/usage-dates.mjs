/**
 * 記録されている呼び出しの日付分布（AI 未使用、消費 0）。
 *
 * 提供側の表示（321）とこちらの記録（283）に 38 の差がある。
 * **差が「記録の無い期間」に集まっているのか、全期間に散っているのかで意味が違う。**
 *
 * - 特定の日に集まっている → その日の作業がログを通らなかった
 * - 全期間に散っている     → 数え方そのものが漏れている（失敗・上書き・フォールバック）
 *
 * 使い方: node tools/usage-dates.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const byDate = new Map()
const add = (date, source) => {
    if (!date) return
    // CSV の値は引用符で囲まれていることがある。**囲みを外さないと日付が 1 文字ずれる**
    const key = String(date).replace(/^"|"$/g, '').slice(0, 10)
    const row = byDate.get(key) ?? {}
    row[source] = (row[source] ?? 0) + 1
    byDate.set(key, row)
}

// --- アプリ経由 ---
const logPath = path.join('data', 'usage.jsonl')
if (fs.existsSync(logPath)) {
    for (const line of fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).filter(Boolean)) {
        try {
            add(JSON.parse(line).ts, 'app')
        }
        catch { /* パースできない行は飛ばす */ }
    }
}

// --- 単体スクリプト。ts を持つのは仕様生成の CSV だけ ---
const specLog = path.join('docs', 'generated', 'run-log.csv')
if (fs.existsSync(specLog)) {
    const lines = fs.readFileSync(specLog, 'utf8').trim().split(/\r?\n/).filter(Boolean)
    for (const line of lines.slice(1)) add(line.split(',')[0], 'spec')
}

/**
 * ts を持たない出力は**ファイルの更新時刻**で代用する。
 * **書き換えたら変わる。** 正確な時刻ではなく、おおよその期間を見るためである。
 */
const MTIME_DIRS = [
    ['docs/generated-bollard', 'bollard'],
    ['docs/generated-countries', 'countries'],
    ['docs/generated-glossary', 'glossary'],
    ['docs/generated-glossary-variant', 'variant'],
    ['docs/generated-streaming', 'stream'],
]
for (const [dir, label] of MTIME_DIRS) {
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
        const stat = fs.statSync(path.join(dir, name))
        add(stat.mtime.toISOString(), label)
    }
}

const sources = ['app', 'spec', 'bollard', 'countries', 'glossary', 'variant', 'stream']
console.log('| 日付 | ' + sources.join(' | ') + ' | 計 |')
console.log('|---' + '|---'.repeat(sources.length + 1) + '|')
let total = 0
for (const [date, row] of [...byDate].sort()) {
    const sum = sources.reduce((a, s) => a + (row[s] ?? 0), 0)
    total += sum
    console.log(`| ${date} | ${sources.map((s) => row[s] ?? '').join(' | ')} | **${sum}** |`)
}
console.log('')
console.log(`記録の合計: ${total}`)
console.log('')
console.log('**`bollard` 以降はファイルの更新時刻である。** 呼び出した時刻ではない。')
console.log('git のチェックアウトや複製で変わるため、期間の目安としてのみ読む。')
