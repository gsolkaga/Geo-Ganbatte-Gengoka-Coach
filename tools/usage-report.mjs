/**
 * 無償枠の消費を集計する（AI 未使用）。
 *
 * ## 行数を数えてはならない
 *
 * `data/usage.jsonl` は **送信されなかった試行も記録している。**
 * 実測（2026-08-17）で、`SAKURA_AI_TOKEN` が無い環境の動作確認により
 * 6 行が追加された。**1 バイトも送信していない。**
 *
 * 行数を消費数として扱うと過大に出る。
 * `sent` フィールドで区別する（無い古い行は推定する）。
 *
 * ## 打ち切りは消費している
 *
 * `truncated` は HTTP 200 で受け取ったうえで途中までしか来なかった状態である。
 * **失敗として扱うが、枠は消費している。** ここを混ぜると数字が合わない。
 *
 * 使い方:
 *   node tools/usage-report.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const LOG_PATH = path.join('data', 'usage.jsonl')

if (!fs.existsSync(LOG_PATH)) {
    console.log(`${LOG_PATH} が無い`)
    process.exit(0)
}

const rows = fs.readFileSync(LOG_PATH, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
        try {
            return JSON.parse(line)
        }
        catch {
            console.log(`  ${index + 1} 行目がパースできない。飛ばす`)
            return null
        }
    })
    .filter(Boolean)

/**
 * 送信されたか。**古い行には `sent` が無いので推定する。**
 * 推定であることを隠さない（件数を別に出す）。
 */
function wasSent(r) {
    if (typeof r.sent === 'boolean') return r.sent
    if (r.ok === true) return true
    if (typeof r.error === 'string' && r.error.includes('SAKURA_AI_TOKEN')) return false
    const ms = r.durationMs ?? 0
    return ms > 0
}

const sent = rows.filter(wasSent)
const notSent = rows.filter((r) => !wasSent(r))
const estimated = rows.filter((r) => typeof r.sent !== 'boolean').length

console.log(`行数: ${rows.length}`)
console.log(`**消費したリクエスト数: ${sent.length}**`)
if (notSent.length) console.log(`送信されなかった試行: ${notSent.length}（消費していない）`)
if (estimated) console.log(`sent フィールドが無く推定した行: ${estimated}`)

const group = (list, key) => {
    const m = new Map()
    for (const r of list) {
        const k = String(r[key] ?? '—')
        m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m].sort((a, b) => b[1] - a[1])
}

for (const key of ['category', 'endpoint', 'variant', 'model']) {
    console.log('')
    console.log(`| ${key} | 消費 |`)
    console.log('|---|---|')
    for (const [k, n] of group(sent, key)) console.log(`| ${k} | ${n} |`)
}

// 打ち切りは失敗だが消費している。**混ぜない**
const truncated = sent.filter((r) => r.truncated === true || r.finishReason === 'length')
const failed = sent.filter((r) => r.ok !== true && !(r.truncated === true || r.finishReason === 'length'))
console.log('')
console.log('| 内訳（消費したもの） | 件数 |')
console.log('|---|---|')
console.log(`| 成功 | ${sent.filter((r) => r.ok === true).length} |`)
console.log(`| 打ち切り（枠は消費） | ${truncated.length} |`)
console.log(`| エラー（枠は消費） | ${failed.length} |`)

const tokens = sent.filter((r) => typeof r.completionTokens === 'number')
if (tokens.length) {
    const sum = (f) => tokens.reduce((a, r) => a + (r[f] ?? 0), 0)
    console.log('')
    console.log(`トークンを報告した応答: ${tokens.length}/${sent.length} 件`)
    console.log(`  入力 ${sum('promptTokens').toLocaleString()} / 出力 ${sum('completionTokens').toLocaleString()}`)
    console.log('  **報告しないモデルがあるため、トークンでの合計は出せない。**')
}
