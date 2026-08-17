/**
 * v1 / v2 比較の実行（タスク 26）
 *
 * ## v1 は再実行しない
 *
 * `data/runs/` に**実際にプレイした v1 の記録が既にある**（2026-08-07〜08-10、
 * 10 問・記録 11 件 × 4 モデル = 44 リクエスト）。同じ入力で v1 をもう一度投げても
 * 同じ条件の再現にしかならず、**枠を 44 消費して得るものがない。**
 *
 * したがってこのスクリプトが投げるのは **v2 だけ**である。
 * 記録 11 件 × 4 モデル = 44 リクエストを消費する。
 *
 * ## 転送方式を揃える
 *
 * **非ストリーミングで実行する**（`stream: false`）。
 * v1 の記録はストリーミングで取ったが、比較の対象は
 * 「同じ観察メモに対して何が返るか」であり、転送方式は揃える必要がある。
 * ストリーミングと非ストリーミングで打ち切りの起き方が変わる（実測 2026-08-07）。
 *
 * ## 前提
 *
 * 1. `npm run dev` で開発サーバが動いていること（既定 http://localhost:3000）
 * 2. `.env` に `SAKURA_AI_TOKEN` があること
 * 3. `data/questions.json` に正解タグが入っていること
 *    （全スロット `unknown` の出題は API が 409 で拒否する）
 *
 * 使い方:
 *   npx vite-node scripts/compare-grading.ts -- --dry-run   消費数だけ表示する
 *   npx vite-node scripts/compare-grading.ts                 実行する
 */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Question, RunRecord } from '../shared/types'

const BASE_URL = process.env.GGG_BASE_URL ?? 'http://localhost:3000'
const RUNS_DIR = join('data', 'runs')
const OUT_DIR = join('data', 'compare')
const REPORT_PATH = join('docs', 'v1-v2-comparison.md')

/** 比較対象のモデル。v1 の記録と同じ 4 モデルで揃える */
const MODELS = [
    'gpt-oss-120b',
    'gemma-4-31B-it',
    'Qwen3.6-35B-A3B',
    'Kimi-K2.6',
]

const dryRun = process.argv.includes('--dry-run')

// ============================================================
// v1 の記録を読む
// ============================================================

async function loadV1Runs(): Promise<RunRecord[]> {
    let names: string[]
    try {
        names = (await readdir(RUNS_DIR)).filter((n) => n.endsWith('.json')).sort()
    }
    catch {
        throw new Error(`${RUNS_DIR} が無い。v1 のプレイ記録が必要である`)
    }

    const runs: RunRecord[] = []
    for (const name of names) {
        const record = JSON.parse(await readFile(join(RUNS_DIR, name), 'utf8')) as RunRecord
        if (record.variant !== 'v1') continue
        runs.push(record)
    }
    return runs
}

async function loadQuestions(): Promise<Map<string, Question>> {
    const list = JSON.parse(await readFile(join('data', 'questions.json'), 'utf8')) as Question[]
    return new Map(list.map((q) => [q.id, q]))
}

/** 正解タグが 1 つでも入っているか。入っていなければ v2 を投げても意味がない */
function isTagged(question: Question | undefined): boolean {
    if (!question) return false
    return Object.values(question.slots).some((s) => s.state !== 'unknown')
}

// ============================================================
// v2 を投げる
// ============================================================

interface GradeResponse {
    requestsConsumed: number
    judgement: Record<string, unknown>
    question: { id: string, country: string, region: string | null }
    models: {
        model: string
        status: 'ok' | 'truncated' | 'error'
        feedback: Record<string, unknown> | null
        finishReason: string | null
        structuredMode: string | null
        totalMs: number
        error: string | null
    }[]
    runFile: string
}

/**
 * 学習者の観察メモを正規化する。**v2 の絞り込み計算はこれがないと動かない。**
 *
 * v1 は辞書を持たないため正規化していない（`terms` が空）。
 * その状態で v2 に渡すと絞り込み力・積集合・次に見るべきスロットが
 * **全部「算出不能」になる**（実測 2026-08-17）。
 *
 * **判定は AI を使わない。しかし判定の入力を作るのに AI が必要である。**
 * 1 レコードにつき 1 リクエスト消費する。
 *
 * 失敗しても採点は続ける。正規化なしの v2（正解タグはあるが用語 ID がない）になる。
 */
async function normalizeSlots(record: RunRecord): Promise<{
    slots: RunRecord['answer']['slots']
    consumed: number
    ok: boolean
}> {
    const response = await fetch(`${BASE_URL}/api/normalize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slots: record.answer.slots, questionId: record.questionId }),
    })
    if (!response.ok) return { slots: record.answer.slots, consumed: 1, ok: false }

    const body = (await response.json()) as {
        requestsConsumed: number
        ok: boolean
        slots: { slot: keyof RunRecord['answer']['slots'], terms: string[] }[]
    }
    if (!body.ok) return { slots: record.answer.slots, consumed: body.requestsConsumed, ok: false }

    const slots = structuredClone(record.answer.slots)
    for (const entry of body.slots) {
        if (entry.terms.length) slots[entry.slot].terms = entry.terms
    }
    return { slots, consumed: body.requestsConsumed, ok: true }
}

async function gradeV2(
    record: RunRecord,
    slots: RunRecord['answer']['slots'],
): Promise<GradeResponse> {
    const response = await fetch(`${BASE_URL}/api/grade`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            questionId: record.questionId,
            variant: 'v2',
            slots,
            candidates: record.answer.candidates,
            decisiveSlot: record.answer.decisiveSlot,
            reasoning: record.answer.reasoning,
            models: MODELS,
            stream: false,
        }),
    })
    if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`)
    }
    return (await response.json()) as GradeResponse
}

// ============================================================
// 集計
// ============================================================

interface Row {
    questionId: string
    runId: string
    model: string
    v1Status: string
    v1FinishReason: string | null
    v1JudgmentUnavailable: boolean | null
    v1MissedCluesCount: number | null
    v2Status: string
    v2FinishReason: string | null
    v2JudgmentUnavailable: boolean | null
    v2MissedCluesCount: number | null
}

function countArray(value: unknown): number | null {
    return Array.isArray(value) ? value.length : null
}

async function main() {
    const runs = await loadV1Runs()
    const questions = await loadQuestions()

    const targets = runs.filter((r) => isTagged(questions.get(r.questionId)))
    const skipped = runs.filter((r) => !isTagged(questions.get(r.questionId)))

    console.log(`v1 の記録 ${runs.length} 件`)
    console.log(`  タグ済みで v2 を投げられる: ${targets.length} 件`)
    if (skipped.length) {
        console.log(`  **タグ未記入のため飛ばす: ${skipped.length} 件**`)
        for (const r of skipped) console.log(`    ${r.questionId}（${r.id}）`)
        console.log('  → docs/tag-drafts.md から data/questions.json に反映すること')
    }
    console.log('')
    console.log(`モデル ${MODELS.length} 件: ${MODELS.join(', ')}`)
    console.log('')
    console.log('| 用途 | 1 件あたり | 合計 |')
    console.log(`| 観察メモの正規化 | 1 | ${targets.length} |`)
    console.log(`| v2 の採点 | ${MODELS.length} | ${targets.length * MODELS.length} |`)
    console.log(`**消費するリクエスト数: ${targets.length * (MODELS.length + 1)}**`)
    console.log('')
    console.log('**正規化は省略できない。** v1 は辞書を持たないため terms が空であり、')
    console.log('そのまま v2 に渡すと絞り込み力・積集合・次に見るべきスロットが全部「算出不能」になる。')
    console.log('先に npx vite-node scripts/normalize-answer-keys.ts を実行して正解タグ側も埋めること。')

    if (dryRun) {
        console.log('')
        console.log('--dry-run のため実行しない')
        return
    }
    if (targets.length === 0) {
        console.log('')
        console.log('投げる対象が無い。終了する')
        return
    }

    await mkdir(OUT_DIR, { recursive: true })

    const rows: Row[] = []
    let consumed = 0
    let normalizeFailed = 0

    for (const [index, record] of targets.entries()) {
        console.log('')
        console.log(`[${index + 1}/${targets.length}] ${record.questionId}（${record.id}）`)

        // ---- 1. 観察メモの正規化。**絞り込み計算の入力を作る** ----
        let slots = record.answer.slots
        try {
            const normalized = await normalizeSlots(record)
            consumed += normalized.consumed
            slots = normalized.slots
            const filled = Object.entries(slots).filter(([, v]) => v.terms.length).length
            console.log(`  正規化 ${normalized.ok ? 'ok' : '失敗'} / 用語 ID が入ったスロット ${filled} 件`)
            if (!normalized.ok) normalizeFailed += 1
        }
        catch (error) {
            // **正規化の失敗で採点まで止めない。** 正解タグはあるので v2 の一部は動く
            normalizeFailed += 1
            console.log(`  正規化に失敗した: ${error instanceof Error ? error.message : String(error)}`)
        }

        // ---- 2. v2 の採点 ----
        let response: GradeResponse
        try {
            response = await gradeV2(record, slots)
        }
        catch (error) {
            // **1 件の失敗で全体を止めない。** 消費した枠は戻らない
            console.log(`  失敗: ${error instanceof Error ? error.message : String(error)}`)
            continue
        }
        consumed += response.requestsConsumed

        const v1ByModel = new Map(record.result.models.map((m) => [m.model, m]))
        for (const v2Model of response.models) {
            const v1Model = v1ByModel.get(v2Model.model)
            rows.push({
                questionId: record.questionId,
                runId: record.id,
                model: v2Model.model,
                v1Status: v1Model?.status ?? '記録なし',
                v1FinishReason: v1Model?.finishReason ?? null,
                v1JudgmentUnavailable: v1Model?.feedback?.judgmentUnavailable ?? null,
                v1MissedCluesCount: countArray(v1Model?.feedback?.missedClues),
                v2Status: v2Model.status,
                v2FinishReason: v2Model.finishReason,
                v2JudgmentUnavailable:
                    (v2Model.feedback?.judgmentUnavailable as boolean | undefined) ?? null,
                v2MissedCluesCount: countArray(v2Model.feedback?.missedClues),
            })
            console.log(
                `  ${v2Model.model.padEnd(18)} v1=${(v1Model?.status ?? '記録なし').padEnd(9)} → v2=${v2Model.status
                }（${Math.round(v2Model.totalMs / 1000)} 秒）`,
            )
        }

        // 対応づけた生データを残す。**打ち切りでも捨てない**
        await writeFile(
            join(OUT_DIR, `${record.questionId}_${record.id}.json`),
            `${JSON.stringify(
                {
                    questionId: record.questionId,
                    runId: record.id,
                    // **v1 の生の回答（terms が空）と正規化後を両方残す。**
                    // 「v2 が良かった」の原因が正解タグか正規化かを後から切り分けるため
                    answer: record.answer,
                    normalizedSlots: slots,
                    v1: { judgement: stripModels(record.result), models: record.result.models },
                    v2: { judgement: response.judgement, models: response.models },
                },
                null,
                2,
            )}\n`,
            'utf8',
        )
    }

    await writeReport(rows, consumed, skipped.length, normalizeFailed)
    console.log('')
    console.log(`消費したリクエスト数: ${consumed}`)
    if (normalizeFailed) console.log(`**正規化に失敗した記録: ${normalizeFailed} 件**（絞り込み計算が算出不能になる）`)
    console.log(`保存先: ${OUT_DIR}/`)
    console.log(`集計: ${REPORT_PATH}`)
}

/** 判定部だけを取り出す。`models` を二重に持たせない */
function stripModels(result: RunRecord['result']) {
    const { models: _models, ...judgement } = result
    return judgement
}

// ============================================================
// レポート
// ============================================================

async function writeReport(
    rows: Row[],
    consumed: number,
    skipped: number,
    normalizeFailed: number,
) {
    const byModel = new Map<string, Row[]>()
    for (const row of rows) {
        const list = byModel.get(row.model) ?? []
        list.push(row)
        byModel.set(row.model, list)
    }

    const lines: string[] = [
        '# v1 / v2 比較（タスク 26）',
        '',
        `生成日時: ${new Date().toISOString()}`,
        `消費したリクエスト数: ${consumed}（正規化 + v2 の採点。`
        + '**v1 は既存のプレイ記録を使い、再実行していない**）',
        skipped ? `タグ未記入で飛ばした記録: ${skipped} 件` : '',
        normalizeFailed
            ? `**正規化に失敗した記録: ${normalizeFailed} 件。** 絞り込み計算が算出不能になっている`
            : '',
        '',
        '## 正規化を挟んでいる理由',
        '',
        'v2 の目玉は絞り込み力・積集合・次に見るべきスロットである。',
        'これらはコードが集合演算で計算するが、**入力は用語 ID（`terms`）である。**',
        '',
        'v1 は辞書を持たないため正規化していない（`terms` が空）。',
        'そのまま v2 に渡すと計算結果が全部「算出不能」になる（実測 2026-08-17）。',
        '',
        '**判定は AI を使わない。しかし判定の入力を作るのに AI が必要である。**',
        '責務境界は「AI を使わない」ではなく「AI の出力を判定に使わない」である。',
        '',
        '## 成功率',
        '',
        '**打ち切り（`truncated`）を成功に数えない。** HTTP 200 で返るが JSON は完成していない。',
        '',
        '| モデル | v1 成功 | v1 打ち切り | v1 エラー | v2 成功 | v2 打ち切り | v2 エラー |',
        '|---|---|---|---|---|---|---|',
    ].filter((l) => l !== '')

    const count = (list: Row[], key: 'v1Status' | 'v2Status', value: string) =>
        list.filter((r) => r[key] === value).length

    for (const [model, list] of byModel) {
        lines.push(
            `| ${model} | ${count(list, 'v1Status', 'ok')} | ${count(list, 'v1Status', 'truncated')} | ${count(list, 'v1Status', 'error')
            } | ${count(list, 'v2Status', 'ok')} | ${count(list, 'v2Status', 'truncated')} | ${count(list, 'v2Status', 'error')} |`,
        )
    }

    lines.push(
        '',
        '## 見落とし判定の有無',
        '',
        'v1 は正解タグを持たないため `judgmentUnavailable` が `true` になるべきである。',
        '**`false` を返した場合、AI は与えられていない情報について語っている。**',
        '',
        '| 問 | モデル | v1 judgmentUnavailable | v1 missedClues 件数 | v2 judgmentUnavailable | v2 missedClues 件数 |',
        '|---|---|---|---|---|---|',
    )

    const show = (v: boolean | null) => (v === null ? '—' : v ? 'true' : '**false**')
    const num = (v: number | null) => (v === null ? '—' : String(v))
    for (const row of rows) {
        lines.push(
            `| ${row.questionId} | ${row.model} | ${show(row.v1JudgmentUnavailable)} | ${num(row.v1MissedCluesCount)
            } | ${show(row.v2JudgmentUnavailable)} | ${num(row.v2MissedCluesCount)} |`,
        )
    }

    lines.push(
        '',
        '## 読み方',
        '',
        '- **成功率の差は情報量の差と交絡している。** v2 はプロンプトが長い（正解タグと辞書抜粋を含む）。',
        '  打ち切りが増えた場合、原因は「v2 が難しい」ではなく「入力が長い」可能性がある',
        '- **モデル間の不一致を学習者の記述の曖昧さの指標にしない。**',
        '  ボラード実験で、メモが介在しない事実問題でも 3 分の 2 の国でモデルが食い違った',
        '  （`docs/bollard-axes-conclusion.md`）',
        '- 生データは `data/compare/` にある。**打ち切りの生テキストも保存している**',
        '',
    )

    await mkdir('docs', { recursive: true })
    await writeFile(REPORT_PATH, lines.join('\n'), 'utf8')
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
})
