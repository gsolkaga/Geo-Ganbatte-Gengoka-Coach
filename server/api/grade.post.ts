/**
 * `POST /api/grade` — 採点（v1 経路）。
 *
 * 責務境界がこのファイルの中心である。
 * - **正誤判定・混同ペアはコードで算出する**（`server/utils/grading.ts`）
 * - **AI はフィードバック文の生成だけを行う。判定をやり直させない**
 * - **v1 ではコンテキスト（正解タグ・辞書）を渡さない。** 正規化も走らせない
 *   （辞書を持たない条件そのものであるため。v1 で正規化すると対照実験が崩れる）
 * - プロンプトテンプレートは 1 つだけ（`server/utils/prompts.ts`）
 *
 * `models` を複数受け取ると並列に投げ、**モデルごとに独立して結果を流す**。
 * 揃うまで待たない。最も遅いモデル（Kimi 89〜300 秒超）に引きずられないため。
 *
 * **認証がない。** ローカル実行前提のため許容する。公開ホスティングする場合は認証が必要。
 */
import { gradeRequestSchema, feedbackSchema, MAX_GRADING_MODELS } from '../../shared/schemas'
import type { Answer, CodeJudgement, Feedback, ModelGrading, RunRecord } from '../../shared/types'
import { buildJudgement } from '../utils/grading'
import {
    GRADING_JSON_SCHEMA,
    GRADING_SYSTEM_PROMPT,
    buildGradingUserPrompt,
} from '../utils/prompts'
import { callChatStream, localIsoString, resolveModel } from '../utils/ai'
import type { StreamProgress } from '../utils/ai'
import { buildJsonSchemaFormat, extractJson, requestStructured } from '../utils/structured'
import { readQuestion, saveRun } from '../utils/store'

/** 進捗行の間隔。17,000 チャンクをそのまま流すと出力が実質使えない */
const PROGRESS_INTERVAL_MS = 250

export default defineEventHandler(async (event) => {
    const parsed = gradeRequestSchema.safeParse(await readBody(event))
    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: `リクエストの形式が不正である: ${parsed.error.message}`,
        })
    }
    const body = parsed.data

    if (body.variant === 'v2') {
        // 正解タグと辞書を差し込む経路はタスク 24。コンテキストなしで v2 を名乗らせない
        throw createError({
            statusCode: 501,
            statusMessage:
                'v2 経路は未実装である（タスク 24）。コンテキストなしで v2 として記録すると対照実験が無効になる',
        })
    }

    const question = await readQuestion(body.questionId)
    if (!question) {
        throw createError({
            statusCode: 404,
            statusMessage: `出題が見つからない: ${body.questionId}。タスク 12 で data/questions.json に登録する`,
        })
    }

    const answer: Answer = {
        questionId: body.questionId,
        slots: body.slots,
        candidates: body.candidates,
        decisiveSlot: body.decisiveSlot,
        reasoning: body.reasoning,
    }

    // ---- コードによる判定。AI より先に確定させる ----
    const judgement = buildJudgement(body.variant, answer, question.country)

    const models = body.models ?? [resolveModel('grade')]
    if (models.length > MAX_GRADING_MODELS) {
        throw createError({ statusCode: 400, statusMessage: 'モデル数が上限を超えている' })
    }

    const userPrompt = buildGradingUserPrompt({
        answer,
        country: question.country,
        region: question.region,
        judgement,
        // v1 はコンテキストを渡さない。テンプレートは同一で差し込みの有無だけが違う
        context: null,
    })

    if (!body.stream) {
        // 非ストリーミング。比較スクリプト（タスク 26）はこちらを使い転送方式を揃える
        const results: ModelGrading[] = []
        for (const model of models) {
            results.push(await gradeWithModelBuffered(model, userPrompt, body.variant))
        }
        const record = await persistRun(body.variant, question.id, answer, judgement, results)
        return {
            requestsConsumed: models.length,
            judgement,
            question: publicQuestionInfo(question.id, question.country, question.region),
            models: results,
            runFile: record,
        }
    }

    // ---- ストリーミング（NDJSON）----
    setResponseHeaders(event, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
        // リバースプロキシのバッファリングを抑止する。可観測性のためにストリームしている
        'x-accel-buffering': 'no',
    })

    const res = event.node.res
    const write = (payload: unknown) => {
        res.write(`${JSON.stringify(payload)}\n`)
    }

    // コード算出分は**モデルに依存しないので 1 回だけ**流す
    write({
        type: 'judgement',
        judgement,
        question: publicQuestionInfo(question.id, question.country, question.region),
        models,
        requestsConsumed: models.length,
    })

    // 並列に投げ、パネルごとに独立して完了・失敗させる
    const settled = await Promise.all(
        models.map(async (model, index) => {
            const result = await gradeWithModelStreamed(
                model,
                userPrompt,
                body.variant,
                (progress) => write({ type: 'progress', model, index, ...progress }),
            )
            write({ type: 'result', model, index, result })
            return result
        }),
    )

    const runFile = await persistRun(body.variant, question.id, answer, judgement, settled)
    write({ type: 'done', runFile })
    res.end()
})

function publicQuestionInfo(id: string, country: string, region: string | null) {
    // 採点後の応答なので正解を含めてよい。出題時（GET /api/questions）は含めない
    return { id, country, region }
}

/** ストリーミング経路。進捗は表示のためだけに使い、パースは完了後に 1 回だけ行う */
async function gradeWithModelStreamed(
    model: string,
    userPrompt: string,
    variant: 'v1' | 'v2',
    onProgress: (progress: StreamProgress) => void,
): Promise<ModelGrading> {
    let lastEmit = 0
    const stream = await callChatStream({
        category: 'app_runtime',
        endpoint: 'grade',
        variant,
        model,
        structuredMode: 'json_schema',
        responseFormat: buildJsonSchemaFormat('grading_feedback', GRADING_JSON_SCHEMA),
        messages: [
            { role: 'system', content: GRADING_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
        ],
        onProgress: (progress) => {
            const now = Date.now()
            if (now - lastEmit < PROGRESS_INTERVAL_MS) return
            lastEmit = now
            onProgress(progress)
        },
    })

    const base: ModelGrading = {
        model,
        status: stream.status,
        feedback: null,
        rawContent: stream.content,
        reasoning: stream.reasoning,
        finishReason: stream.finishReason,
        structuredMode: stream.structuredMode,
        chunks: stream.chunks,
        firstByteMs: stream.firstByteMs,
        totalMs: stream.totalMs,
        error: stream.error,
    }

    // 打ち切り・エラー時は生テキストを保持したまま返す。捨てない
    if (stream.status !== 'ok') return base

    const parsedFeedback = parseFeedback(stream.content)
    if (!parsedFeedback.ok) {
        // **自動リトライしない。** 再採点は人間が押す
        return { ...base, status: 'error', error: parsedFeedback.error }
    }
    return { ...base, feedback: parsedFeedback.feedback }
}

/** 非ストリーミング経路。3 段階のフォールバックと Zod 検証を通す */
async function gradeWithModelBuffered(
    model: string,
    userPrompt: string,
    variant: 'v1' | 'v2',
): Promise<ModelGrading> {
    const startedAt = Date.now()
    const structured = await requestStructured({
        category: 'app_runtime',
        endpoint: 'grade',
        variant,
        model,
        system: GRADING_SYSTEM_PROMPT,
        user: userPrompt,
        schema: feedbackSchema,
        jsonSchema: GRADING_JSON_SCHEMA,
        schemaName: 'grading_feedback',
    })

    if (structured.ok && structured.data) {
        return {
            model,
            status: 'ok',
            feedback: structured.data,
            rawContent: '',
            reasoning: '',
            finishReason: 'stop',
            structuredMode: structured.mode,
            chunks: 0,
            firstByteMs: null,
            totalMs: Date.now() - startedAt,
            error: null,
        }
    }

    return {
        model,
        status: 'error',
        feedback: null,
        rawContent: '',
        reasoning: '',
        finishReason: null,
        structuredMode: structured.mode,
        chunks: 0,
        firstByteMs: null,
        totalMs: Date.now() - startedAt,
        error: structured.error,
    }
}

function parseFeedback(
    content: string,
): { ok: true, feedback: Feedback } | { ok: false, error: string } {
    let raw: unknown
    try {
        raw = extractJson(content)
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    const validated = feedbackSchema.safeParse(raw)
    if (!validated.success) {
        return { ok: false, error: `Zod 検証に失敗した: ${validated.error.message}` }
    }
    return { ok: true, feedback: validated.data satisfies Feedback }
}

/**
 * プレイ記録を保存する（要件 9-7）。
 * Phase 3 で同じ観察メモを v2 に再投入するため、入力を再現可能な形で残す。
 */
async function persistRun(
    variant: 'v1' | 'v2',
    questionId: string,
    answer: Answer,
    judgement: CodeJudgement,
    models: ModelGrading[],
): Promise<string> {
    const record: RunRecord = {
        id: `${questionId}-${Date.now().toString(36)}`,
        ts: localIsoString(),
        variant,
        questionId,
        answer,
        result: { ...judgement, models },
    }
    return saveRun(record)
}
