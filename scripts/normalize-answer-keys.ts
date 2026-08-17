/**
 * 正解タグを正規化して `terms` を埋める（タスク 26 の前提）
 *
 * ## なぜ必要か
 *
 * v2 の目玉は**絞り込み力・積集合・次に見るべきスロット**である。
 * これらはコードが集合演算で計算するが、**入力は用語 ID（`terms`）である。**
 *
 * 正解タグには人手で日本語の記述を書いた。`terms` は空である。
 * その状態で v2 を走らせると、実測でこうなった。
 *
 * ```
 * 絞り込み力 : （なし）
 * 積集合     : 算出不能（辞書に載る用語が 0）
 * 次に見るべき: （なし）
 * ```
 *
 * **判定は AI を使わない。しかし判定の入力を作るのに AI が必要だった。**
 * 責務境界は「AI を使わない」ではなく「AI の出力を判定に使わない」である。
 *
 * ## 消費するリクエスト数
 *
 * **問題 1 件につき 1 リクエスト。10 問で 10 リクエスト。**
 * 結果は `data/questions.json` に永続化するので、1 回で済む。
 *
 * ## 前提
 *
 * `npm run dev` が動いていること。`.env` に `SAKURA_AI_TOKEN` があること。
 *
 * 使い方:
 *   npx vite-node scripts/normalize-answer-keys.ts -- --dry-run
 *   npx vite-node scripts/normalize-answer-keys.ts
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SLOT_IDS } from '../shared/slots'
import type { Question, SlotId } from '../shared/types'

const BASE_URL = process.env.GGG_BASE_URL ?? 'http://localhost:3000'
const QUESTIONS_PATH = join('data', 'questions.json')

const dryRun = process.argv.includes('--dry-run')

interface NormalizeResponse {
    requestsConsumed: number
    ok: boolean
    mode: string | null
    slots: { slot: SlotId, terms: string[], none: boolean }[]
    candidatesRecorded: number
    error?: string
}

async function normalize(question: Question): Promise<NormalizeResponse> {
    const response = await fetch(`${BASE_URL}/api/normalize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slots: question.slots, questionId: question.id }),
    })
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
    }
    return (await response.json()) as NormalizeResponse
}

const questions = JSON.parse(await readFile(QUESTIONS_PATH, 'utf8')) as Question[]

/** 記述があり、まだ `terms` が空のスロットを持つ問題だけが対象である */
const targets = questions.filter((q) =>
    SLOT_IDS.some((id) => {
        const entry = q.slots[id]
        return entry?.state === 'visible' && Boolean(entry.plain?.trim()) && entry.terms.length === 0
    }),
)

console.log(`問題 ${questions.length} 件 / 正規化が必要なもの ${targets.length} 件`)
console.log(`**消費するリクエスト数: ${targets.length}**（1 問 1 リクエスト）`)

if (dryRun) {
    console.log('')
    console.log('--dry-run のため実行しない')
    process.exit(0)
}

let consumed = 0
let filled = 0
const noneSlots: string[] = []

for (const [index, question] of targets.entries()) {
    let result: NormalizeResponse
    try {
        result = await normalize(question)
    }
    catch (error) {
        // **1 件の失敗で全体を止めない。** 消費した枠は戻らない
        console.log(`[${index + 1}/${targets.length}] ${question.id} 失敗: ${error instanceof Error ? error.message : error}`)
        continue
    }
    consumed += result.requestsConsumed

    if (!result.ok) {
        console.log(`[${index + 1}/${targets.length}] ${question.id} 正規化できなかった: ${result.error ?? '理由なし'}`)
        continue
    }

    const assigned: string[] = []
    for (const entry of result.slots) {
        if (entry.terms.length === 0) {
            // **「該当なし」は失敗ではない。** 辞書に無い観察が記録されたことを意味する
            noneSlots.push(`${question.id}/${entry.slot}`)
            continue
        }
        question.slots[entry.slot].terms = entry.terms
        filled += entry.terms.length
        assigned.push(`${entry.slot}=${entry.terms.join('+')}`)
    }
    console.log(`[${index + 1}/${targets.length}] ${question.id} (${result.mode}) ${assigned.join(' ') || '（該当なしのみ）'}`)
}

await writeFile(QUESTIONS_PATH, `${JSON.stringify(questions, null, 2)}\n`, 'utf8')

console.log('')
console.log(`消費したリクエスト数: ${consumed}`)
console.log(`埋めた用語 ID: ${filled} 件`)
console.log(`**該当なし ${noneSlots.length} 件**（辞書追加候補として data/glossary-candidates.jsonl に記録済み）`)
for (const s of noneSlots) console.log(`  ${s}`)
console.log('')
console.log('次: npx vite-node tools/preview-v2-judgement.mts で絞り込み力が出るか確認する')
