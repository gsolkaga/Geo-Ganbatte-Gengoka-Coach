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
import { resolveBaseUrl } from './lib/base-url'

const QUESTIONS_PATH = join('data', 'questions.json')

const dryRun = process.argv.includes('--dry-run')

/**
 * 接続先。**実行前に 1 回だけ確認する。**
 *
 * 決め打ちにしていたため、開発サーバが 3001 に居たときに
 * `fetch failed` を 10 回並べて終わった（2026-08-17）。
 * どこへ繋ごうとしたのかも表示していなかった。
 */
let BASE_URL = 'http://localhost:3000'

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

/**
 * **このスクリプトは開発サーバの API を呼ぶ。**
 *
 * 実測（2026-08-17）で「更新系のスクリプトだ」と解釈され、
 * `npm run dev` を止めてから実行された。**書き込むのはファイルだが、
 * 正規化は AI を呼ぶため API 経由である。**
 *
 * 冒頭に書いていなかったので、最初に出す。
 */
console.log('**`npm run dev` を起動したまま、別のターミナルで実行する。**')
console.log('（ファイルを書き換えるが、正規化は AI を呼ぶため開発サーバの API を経由する）')
console.log('')
console.log(`問題 ${questions.length} 件 / 正規化が必要なもの ${targets.length} 件`)
console.log(`**消費するリクエスト数: ${targets.length}**（1 問 1 リクエスト）`)

if (dryRun) {
    console.log('')
    console.log('--dry-run のため実行しない')
    process.exit(0)
}

// **消費する処理の前に接続を確認する。** 繋がらなければ 1 件も投げずに終わる
try {
    const probed = await resolveBaseUrl()
    BASE_URL = probed.baseUrl
    console.log('')
    console.log(`接続先: ${BASE_URL}（出題 ${probed.questionCount} 件を確認）`)
}
catch (error) {
    console.error('')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
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
        const message = error instanceof Error ? error.message : String(error)
        console.log(`[${index + 1}/${targets.length}] ${question.id} 失敗: ${message}`)
        /**
         * **接続が切れたなら残りも失敗する。同じ失敗を並べない。**
         *
         * 決め打ちの接続先で `fetch failed` を 10 回出したことがある（2026-08-17）。
         * 1 件目で止めて、原因を 1 回だけ出す。
         */
        if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
            console.error('')
            console.error(`${BASE_URL} への接続が切れた。開発サーバが落ちていないか確認すること`)
            break
        }
        // 個別の失敗（400 など）は次へ進む。消費した枠は戻らない
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
