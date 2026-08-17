/**
 * 空白の暴走を v1 の記録で検証する（AI 未使用、消費 0）。
 *
 * ## 何を確かめたいか
 *
 * `WHITESPACE_RUN_LIMIT = 512` で早期打ち切りを入れた。
 * その結果、v2 の実行で**4 モデルのうち 3 つが `truncated` になった。**
 * v1 では同じ入力で 4 モデルすべて `ok` だった。
 *
 * ```
 * gpt-oss  本文 866 字 → truncated / 修復に足した文字は "}" だけ
 * gemma    本文 217 字 → truncated / 必須項目が欠けていた
 * Qwen     本文 589 字 → truncated / 必須項目が欠けていた
 * ```
 *
 * **gpt-oss は閉じ括弧 1 文字で完成していた。** 待てば `ok` だった可能性がある。
 *
 * つまり 2 つの筋書きがありうる。
 *
 * | 筋書き | 意味 | 確かめ方 |
 * |---|---|---|
 * | (a) モデルは本当に止まっていた | v1 の `ok` が嘘で、v2 が正直 | v1 の応答は末尾が空白で終わっている |
 * | (b) 512 が早すぎた | **v2 が良い応答を壊している** | **v1 の応答の途中に 512 字以上の空白があり、その後に中身が続く** |
 *
 * v1 の記録は**早期打ち切りを入れる前（2026-08-10）に取ったもの**であり、
 * 生テキストが途中で切られていない。**対照データとして使える。**
 *
 * 使い方: node tools/inspect-whitespace.mjs [出題 ID]
 */
import fs from 'node:fs'
import path from 'node:path'

const LIMIT = 512
const filter = process.argv[2] ?? null
const RUNS_DIR = path.join('data', 'runs')

/** 連続する空白の並びを全部拾う。**位置と、その後に中身が続くかを見る** */
function whitespaceRuns(text) {
    const runs = []
    for (const m of text.matchAll(/\s{16,}/g)) {
        const start = m.index
        const end = start + m[0].length
        runs.push({
            length: m[0].length,
            start,
            // **これが (b) の決め手である。** 空白の後に中身が続いていたか
            followedByContent: text.slice(end).trim().length > 0,
            following: text.slice(end).trim().slice(0, 60),
        })
    }
    return runs
}

const names = fs.readdirSync(RUNS_DIR).filter((n) => n.endsWith('.json')).sort()
let checked = 0
let wouldAbort = 0
let wouldAbortAndLose = 0

for (const name of names) {
    const run = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, name), 'utf8'))
    if (run.variant !== 'v1') continue
    if (filter && run.questionId !== filter) continue

    console.log('')
    console.log(`=== ${run.questionId} / ${run.variant} / ${run.ts}`)
    for (const m of run.result.models) {
        const raw = m.rawContent ?? ''
        if (!raw) {
            console.log(`  ${m.model.padEnd(26)} 生テキストなし（status=${m.status}）`)
            continue
        }
        checked += 1
        const trailing = raw.length - raw.trimEnd().length
        const runs = whitespaceRuns(raw)
        const longest = runs.reduce((a, r) => Math.max(a, r.length), 0)
        // 早期打ち切りは「末尾の空白」を見る。**途中の空白では発火しない**
        const firstBig = runs.find((r) => r.length >= LIMIT)

        console.log(`  ${m.model.padEnd(26)} status=${m.status} 生 ${raw.length} 字 / 本文 ${raw.trimEnd().length} 字`)
        console.log(`      末尾の空白 ${trailing} 字 / 空白の並びの最長 ${longest} 字`)

        if (trailing >= LIMIT) {
            wouldAbort += 1
            console.log(`      **現在のコードなら打ち切る**（末尾の空白が ${trailing} ≥ ${LIMIT}）`)
        }
        if (firstBig) {
            console.log(`      ${LIMIT} 字以上の空白が位置 ${firstBig.start} にある`)
            if (firstBig.followedByContent) {
                wouldAbortAndLose += 1
                console.log('      **その後に中身が続いている。待てば完成していた**')
                console.log(`      続き: ${JSON.stringify(firstBig.following)}`)
            }
            else {
                console.log('      その後は空白のみ。**待っても中身は増えない**')
            }
        }
    }
}

console.log('')
console.log('=== まとめ ===')
console.log(`生テキストを見た応答: ${checked} 件`)
console.log(`末尾の空白が ${LIMIT} 字以上（現在のコードなら打ち切る）: ${wouldAbort} 件`)
console.log(`**${LIMIT} 字以上の空白の後に中身が続いていた（待てば完成した）: ${wouldAbortAndLose} 件**`)
console.log('')
if (wouldAbortAndLose > 0) {
    console.log('**(b) が起きている。512 は早すぎる。**')
    console.log('空白の後に中身が続く応答を壊している。閾値を上げるか、')
    console.log('**残り 1 文字で閉じられる形なら待つ**などの条件を足す必要がある。')
}
else {
    console.log('**(a) である。** 空白の後に中身が続いた応答は無い。')
    console.log('打ち切りは正しく、v1 の `ok` が実態を表していなかったことになる。')
}
