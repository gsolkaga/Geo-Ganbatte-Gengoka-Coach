/**
 * 提供側が数えたリクエスト数と、こちらの記録を突き合わせる（AI 未使用、消費 0）。
 *
 * ## なぜ必要になったか（実測 2026-08-17）
 *
 * さくらのコントロールパネルの表示が **321 リクエスト**だった。
 * `npm run usage:report` は **57** と出していた。**5 倍以上違う。**
 *
 * 原因は `data/usage.jsonl` が**アプリ経由の呼び出しだけ**を記録していること。
 * 用語辞書の生成・ボラードの軸実験・国名表の生成などは
 * **単体の `.mjs` スクリプトが API を直接叩いており、あのログを通らない。**
 *
 * > **自分で作った計測は、自分が通した経路しか数えない。**
 *
 * 記事では「3,000 リクエストを何に使ったか」を書く。
 * **57 と書いたら 5 倍の過小申告になる。** 提供側の数字が正である。
 *
 * ## 何と何を比べるか
 *
 * こちらの記録は 2 種類ある。
 *
 * | 経路 | 記録 | 1 件の意味 |
 * |---|---|---|
 * | アプリ（`/api/grade` など） | `data/usage.jsonl` | 1 行 = 1 呼び出し |
 * | 単体スクリプト | `docs/generated-...` の JSON | **1 ファイル = 1 呼び出し（推定）** |
 *
 * **後者は推定である。** 失敗して出力が残らなかった呼び出しは数えられない。
 * 上書きされた再実行も数えられない。**だから差が出るのが当たり前で、
 * 差の向きと大きさを見るための道具である。**
 *
 * 使い方:
 *   node tools/usage-reconcile.mjs 321     提供側の数字を渡す
 *   node tools/usage-reconcile.mjs         こちらの合計だけ出す
 */
import fs from 'node:fs'
import path from 'node:path'

const reported = process.argv[2] ? Number(process.argv[2]) : null

// ============================================================
// 1. アプリ経由（data/usage.jsonl）
// ============================================================

/** `shared / billing.ts` と同じ規則。**写した箇所は必ずずれるので規則を変えたら両方直す** */
function httpStatusOf(text) {
    if (typeof text !== 'string') return null
    const marked = /(?:HTTP|status|code)[^\d]{0,8}([45]\d\d)/i.exec(text)
    if (marked) return Number(marked[1])
    const bare = /(?:^|\s)([45]\d\d)(?=$|[\s:,.](?:[\x20-\x7E]|$))/.exec(text)
    return bare ? Number(bare[1]) : null
}

function isRejected(r) {
    if (r.rejected === true) return true
    if (r.ok === true) return false
    const status = r.httpStatus ?? httpStatusOf(r.error)
    return status !== null && status >= 400 && status < 500
}

function wasSent(r) {
    if (isRejected(r)) return false
    if (typeof r.sent === 'boolean') return r.sent
    if (r.ok === true) return true
    if (typeof r.error === 'string' && r.error.includes('SAKURA_AI_TOKEN')) return false
    return (r.durationMs ?? 0) > 0
}

const LOG_PATH = path.join('data', 'usage.jsonl')
const appRows = fs.existsSync(LOG_PATH)
    ? fs.readFileSync(LOG_PATH, 'utf8').trim().split(/\r?\n/).filter(Boolean)
        .map((l) => { try { return JSON.parse(l) } catch { return null } })
        .filter(Boolean)
    : []
const appBilled = appRows.filter(wasSent).length
const appRejected = appRows.filter(isRejected).length

// ============================================================
// 2. 単体スクリプト（docs/generated-*/）
// ============================================================

/**
 * 単体スクリプトの出力先。
 *
 * **数え方が 2 つある。どちらも下限にしかならない。**
 *
 * | 数え方 | 取りこぼす理由 |
 * |---|---|
 * | 出力 JSON のファイル数 | **同じ名前に上書きした再実行を数えない** |
 * | 実行ログ CSV の行数 | **CSV を書く前の腕（arm）を数えない** |
 *
 * 実測でどちらも起きていた。
 *
 * ```
 * 仕様生成    ファイル 15 / CSV 21 行  → CSV が多い（上書きがあった）
 * ボラード    ファイル 68 / CSV 64 行  → ファイルが多い（CSV を書かない腕がある）
 * ```
 *
 * したがって**大きい方を採る。** 小さい方を採ると過小申告になる。
 * どちらを採ったかは表示する。**推定であることを隠さない。**
 */
const SCRIPT_DIRS = [
    { dir: path.join('docs', 'generated'), label: '仕様生成（run-spec-generation.mjs）' },
    { dir: path.join('docs', 'generated-bollard'), label: 'ボラードの軸実験（run-bollard-axes.mjs）' },
    { dir: path.join('docs', 'generated-countries'), label: '国名表の生成（run-country-table.mjs）' },
    { dir: path.join('docs', 'generated-glossary'), label: '用語辞書の生成（run-glossary.mjs）' },
    { dir: path.join('docs', 'generated-glossary-variant'), label: 'プロンプト差分（run-glossary-variant.mjs）' },
    { dir: path.join('docs', 'generated-streaming'), label: 'ストリーミングの実測（test-streaming.mjs）' },
]

/** 呼び出しの成果物とみなすか。**集計物を数えない** */
function looksLikeCall(name) {
    if (!name.endsWith('.json')) return false
    return !/^(summary|conclusion|comparison|index|merged|report)/i.test(name)
}

/** CSV のデータ行数（見出しを除く）。1 行 = 1 呼び出し */
function csvRowCount(dir) {
    const names = fs.readdirSync(dir).filter((n) => n.endsWith('.csv'))
    let best = null
    for (const name of names) {
        const lines = fs.readFileSync(path.join(dir, name), 'utf8')
            .trim().split(/\r?\n/).filter(Boolean)
        if (lines.length <= 1) continue
        const rows = lines.length - 1
        if (best === null || rows > best.rows) best = { name, rows }
    }
    return best
}

const scriptCounts = []
for (const { dir, label } of SCRIPT_DIRS) {
    if (!fs.existsSync(dir)) continue
    const all = fs.readdirSync(dir)
    const files = all.filter(looksLikeCall).length
    const csv = csvRowCount(dir)
    const csvRows = csv?.rows ?? 0
    scriptCounts.push({
        dir, label, files, csv, csvRows,
        calls: Math.max(files, csvRows),
        source: csvRows > files ? `CSV（${csv.name}）` : 'ファイル数',
    })
}
const scriptTotal = scriptCounts.reduce((a, r) => a + r.calls, 0)

// ============================================================
// 3. 出力
// ============================================================

const known = appBilled + scriptTotal

console.log('# 消費の突き合わせ（AI 未使用、消費 0）')
console.log('')
console.log('## アプリ経由（data/usage.jsonl）')
console.log(`  行数 ${appRows.length} / **消費 ${appBilled}**`)
if (appRejected) console.log(`  4xx で弾かれた（消費していない）: ${appRejected}`)
console.log('')
console.log('## 単体スクリプト（出力からの推定。**下限である**）')
console.log('')
console.log('| 呼び出し | 採用 | ファイル数 | CSV 行数 | 実験 |')
console.log('|---|---|---|---|---|')
for (const r of scriptCounts) {
    console.log(`| ${r.calls} | ${r.source} | ${r.files} | ${r.csvRows || '—'} | ${r.label} |`)
}
console.log(`  **合計 ${scriptTotal}**（大きい方を採った。どちらも取りこぼすため）`)
console.log('')
console.log(`## こちらの記録の合計: **${known}**`)

if (reported === null) {
    console.log('')
    console.log('提供側の数字を渡すと差を出す: node tools/usage-reconcile.mjs 321')
    process.exit(0)
}

const gap = reported - known
console.log(`## 提供側の表示: **${reported}**`)
console.log('')
console.log(`### 差: ${gap >= 0 ? '+' : ''}${gap}`)
console.log('')

if (gap > 0) {
    console.log('**提供側が多い。こちらの記録に残っていない呼び出しがある。** 心当たり:')
    console.log('')
    console.log('- 失敗して出力ファイルが残らなかった呼び出し')
    console.log('  （打ち切り・タイムアウト・パース失敗。**枠は消費している**）')
    console.log('- 同じ出力ファイルを上書きした再実行')
    console.log('- 構造化出力のフォールバック（1 回の呼び出しで最大 3 回投げる）')
    console.log('- コントロールパネルの Playground での試し打ち')
    console.log('- `.mjs` スクリプトの試運転（出力先を作る前に落ちた分）')
    console.log('')
    console.log('> **提供側の数字が正である。** こちらの推定は下限にしかならない。')
}
else if (gap < 0) {
    console.log('**こちらの記録が多い。数えすぎている。**')
    console.log('')
    console.log('- 1 ファイル = 1 呼び出しの仮定が崩れている（1 呼び出しで複数ファイル）')
    console.log('- 集計物を呼び出しとして数えている（`looksLikeCall` を見直す）')
    console.log('- 4xx を消費として数えている（`isRejected` を見直す）')
}
else {
    console.log('一致した。**偶然の可能性がある。** 内訳が合っているかは別に確かめること')
}

console.log('')
console.log('## 記事に書くときの注意')
console.log('')
console.log('**提供側の数字を使う。** こちらの計測はアプリ経由しか通っていない。')
console.log('> **自分で作った計測は、自分が通した経路しか数えない。**')
