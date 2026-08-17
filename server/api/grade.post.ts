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
import { SLOT_IDS } from '../../shared/slots'
import type { SlotId } from '../../shared/slots'
import type { Answer, CodeJudgement, Feedback, ModelGrading, Question, RunRecord, Term } from '../../shared/types'
import { buildJudgement } from '../utils/grading'
// **同名を避ける。** Nuxt の自動 import は同名の型を片方だけ採用し、警告しか出さない
import type { JudgementContext } from '../utils/grading'
import {
    GRADING_JSON_SCHEMA,
    GRADING_SYSTEM_PROMPT,
    buildGradingJsonSchema,
    buildGradingUserPrompt,
} from '../utils/prompts'
// 出力後に落とす。**enum でも守られないことがある**（実測 2026-08-17）
import { describeSanitized, sanitizeFeedback } from '../../shared/feedback-sanitize'
import type { GradingContext as PromptContext } from '../utils/prompts'
import { callChatStream, httpStatusOf, localIsoString, resolveModel, wasBilled } from '../utils/ai'
import type { StreamProgress } from '../utils/ai'
import { buildJsonSchemaFormat, extractJson, requestStructured } from '../utils/structured'
import { repairTruncatedJson } from '../../shared/json-repair'
import { readGlossary, readQuestion, saveRun } from '../utils/store'

/**
 * AI に渡す辞書の抜粋。
 *
 * **辞書全体（90 語）を渡さない。** 枠を食うだけでなく、
 * 関係のない用語が並ぶと AI が「学習者が書いていない用語」を持ち出す。
 *
 * 渡すのは 3 種類。
 *   1. 学習者が挙げた用語（語彙の対応づけに必要）
 *   2. 正解タグに記録された用語（見落としの説明に必要）
 *   3. 弁別スロットの用語（候補の区別の説明に必要）
 */
function selectGlossaryExcerpt(glossary: Term[], answer: Answer, question: Question): Term[] {
    const wanted = new Set<string>()
    for (const id of SLOT_IDS) {
        for (const term of answer.slots[id]?.terms ?? []) wanted.add(term)
        for (const term of question.slots[id]?.terms ?? []) wanted.add(term)
    }
    const decisive = new Set(question.decisiveSlots)
    return glossary.filter((t) => wanted.has(t.id) || decisive.has(t.slot))
}

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

    // ---- v2 のコンテキストを組み立てる。v1 では null のままにする ----
    let judgementContext: JudgementContext | null = null
    let promptContext: PromptContext | null = null

    if (body.variant === 'v2') {
        /**
         * **タグ付けが未完了の出題を v2 として採点しない。**
         *
         * 全スロットが `unknown` の正解タグを渡しても、差分計算は何も判定できない。
         * それを v2 として記録すると「v2 でも見落としが出なかった」という
         * 誤った結論になる。**判定不能を成果に見せない。**
         */
        const tagged = SLOT_IDS.filter((id) => question.slots[id]?.state !== 'unknown')
        if (tagged.length === 0) {
            throw createError({
                statusCode: 409,
                statusMessage:
                    `出題 ${question.id} は正解タグが未記入である（全スロット unknown）。`
                    + 'タグなしで v2 として記録すると v1/v2 比較が無効になる。docs/tag-drafts.md から反映すること',
            })
        }

        const glossary = await readGlossary()
        judgementContext = { tagSlots: question.slots, glossary }
        promptContext = {
            answerKey: question.slots,
            decisiveSlots: question.decisiveSlots,
            // **辞書全体を渡さない。** 90 語を毎回渡すと枠を食い、注意も散る
            glossaryExcerpt: selectGlossaryExcerpt(glossary, answer, question),
        }
    }

    // ---- コードによる判定。AI より先に確定させる ----
    const judgement = buildJudgement(body.variant, answer, question.country, judgementContext)

    const models = body.models ?? [resolveModel('grade')]
    if (models.length > MAX_GRADING_MODELS) {
        throw createError({ statusCode: 400, statusMessage: 'モデル数が上限を超えている' })
    }

    const userPrompt = buildGradingUserPrompt({
        answer,
        country: question.country,
        region: question.region,
        judgement,
        // **テンプレートは同一で差し込みの有無だけが違う。** これが対照実験の条件である
        context: promptContext,
    })

    /**
     * 使ってよい用語の名前。**渡した抜粋の範囲に限る。**
     *
     * 見せていない用語を選ばせるのは、渡していない情報を要求することである
     * （それをやったのが波形柵の断定だった）。
     */
    const allowedTerms = promptContext
        ? [...new Set(promptContext.glossaryExcerpt.map((t) => t.canonical).filter(Boolean))]
        : []
    /**
     * **`blindSlots` を選択肢から外す。**
     *
     * コードが算出してプロンプトにも渡しているが、**52 応答中 6 件が
     * 視認できない欄を「次に見ろ」と言った**（実測 2026-08-17）。
     *
     * > **渡したことと、守られることは別である。**
     */
    const blindSlots = judgement.blindSlots ?? []
    const jsonSchema = buildGradingJsonSchema({ allowedTerms, blindSlots })
    /** 出力後に落とす基準。**enum でも守られないことがある** */
    const sanitizeOptions = { allowedTerms, blindSlots }

    if (!body.stream) {
        // 非ストリーミング。**v1 の記録は画面（ストリーミング）で取っているので比較には使わない**
        const results: ModelGrading[] = []
        for (const model of models) {
            results.push(await gradeWithModelBuffered(model, userPrompt, body.variant, jsonSchema, sanitizeOptions))
        }
        const record = await persistRun(body.variant, question.id, answer, judgement, results)
        return {
            /**
             * **実際に枠を消費した数を返す。** モデル数ではない。
             *
             * 4xx で弾かれた呼び出しは推論に入っていないため消費していない
             * （実測 2026-08-17、モデル ID の誤りで 400 が 15 回）。
             * モデル数で返していたため、**消費していない 15 を消費として報告した。**
             */
            requestsConsumed: results.filter((r) => r.billed !== false).length,
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
                jsonSchema,
                sanitizeOptions,
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
    jsonSchema: Record<string, unknown> = GRADING_JSON_SCHEMA,
    sanitizeOptions: SanitizeOptions = {},
): Promise<ModelGrading> {
    let lastEmit = 0
    const stream = await callChatStream({
        category: 'app_runtime',
        endpoint: 'grade',
        variant,
        model,
        structuredMode: 'json_schema',
        responseFormat: buildJsonSchemaFormat('grading_feedback', jsonSchema),
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
        /**
         * **空白の暴走を打ち切るかの決め手。** 長さでは決められない。
         *
         * ここまでの本文に閉じ括弧を足して、必須項目が揃うなら待つ理由がない。
         * 揃わないなら**まだ書くことがある**ということで、待つ
         * （`shared/whitespace-guard.ts` に経緯がある）。
         */
        isSalvageable: hasCompleteFeedback,
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
        billed: wasBilled(stream),
    }

    // 打ち切り時は閉じ括弧を足して中身を救えることがある。**生テキストは捨てない**
    if (stream.status === 'truncated') return applySanitize(salvageTruncated(base), sanitizeOptions)
    // エラー時は生テキストを保持したまま返す
    if (stream.status !== 'ok') return base

    const parsedFeedback = parseFeedback(stream.content)
    if (!parsedFeedback.ok) {
        // **自動リトライしない。** 再採点は人間が押す
        return { ...base, status: 'error', error: parsedFeedback.error }
    }
    return applySanitize({ ...base, feedback: parsedFeedback.feedback }, sanitizeOptions)
}

interface SanitizeOptions {
    allowedTerms?: readonly string[]
    blindSlots?: readonly SlotId[]
}

/**
 * 学習者に見せる前に落とす。**enum で防いだうえで、もう一度落とす。**
 *
 * `nextPriority` は既に enum にしていたが、**52 応答中 6 件が
 * 視認できない欄を指示した**（実測 2026-08-17）。
 * 構造で縛っても抜けることがある。
 *
 * > **AI の遵守に依存させない**（要件 3-2 と同じ考え方である）。
 *
 * 落としたことは `error` に残す。**書き換えず、記録から消さない。**
 */
function applySanitize(grading: ModelGrading, options: SanitizeOptions): ModelGrading {
    if (!grading.feedback) return grading
    const result = sanitizeFeedback({
        vocabulary: grading.feedback.vocabulary,
        nextPriority: grading.feedback.nextPriority,
        allowedTerms: options.allowedTerms,
        blindSlots: options.blindSlots,
    })
    const note = describeSanitized(result)
    if (!note) return grading
    return {
        ...grading,
        feedback: {
            ...grading.feedback,
            vocabulary: result.vocabulary,
            nextPriority: result.nextPriority,
        },
        error: [grading.error, note].filter(Boolean).join(' / '),
    }
}

/** 非ストリーミング経路。3 段階のフォールバックと Zod 検証を通す */
async function gradeWithModelBuffered(
    model: string,
    userPrompt: string,
    variant: 'v1' | 'v2',
    jsonSchema: Record<string, unknown> = GRADING_JSON_SCHEMA,
    sanitizeOptions: SanitizeOptions = {},
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
        jsonSchema,
        schemaName: 'grading_feedback',
    })

    if (structured.ok && structured.data) {
        return applySanitize({
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
            billed: true,
        }, sanitizeOptions)
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
        /**
         * **4xx は消費していない。** モデル ID の誤りやスキーマの誤りで
         * 推論に入る前に弾かれた場合、枠は減らない（実測 2026-08-17、400 が 15 回）。
         */
        billed: !isClientErrorMessage(structured.error),
    }
}

/** エラー文から 4xx を判定する。**枠を消費していない印である** */
function isClientErrorMessage(message: string | null): boolean {
    const status = httpStatusOf(message)
    return status !== null && status >= 400 && status < 500
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
 * ここまでの本文で**必須項目が揃っているか。**
 *
 * 空白の暴走を打ち切るかの決め手として、ストリーミング中に呼ばれる。
 * 判定は `salvageTruncated` と同じ規則である（閉じ括弧を足して Zod を通す）。
 *
 * ## なぜ長さで決めないのか
 *
 * 「末尾の空白 512 字」で無条件に打ち切っていたときは、**完成する応答を壊した。**
 * `gpt-oss-120b` は JSON の途中に 7,892〜26,590 字の空白を挟んでから
 * 中身を続けることがある（v1 の記録 52 件中 4 件）。
 *
 * > **長さは、続きがあるかを教えてくれない。**
 *
 * 揃っていれば待つ理由がない。欠けていれば**まだ書くことがある**ので待つ。
 *
 * **毎チャンク呼ばれるので安くなければならない。** `repairTruncatedJson` は
 * 閉じ括弧を足すだけであり、`JSON.parse` は末尾が整うまで失敗して即返る。
 */
function hasCompleteFeedback(content: string): boolean {
    const repaired = repairTruncatedJson(content)
    if (!repaired.ok || repaired.text === null) return false
    try {
        return feedbackSchema.safeParse(JSON.parse(repaired.text)).success
    }
    catch {
        return false
    }
}

/**
 * 打ち切られた応答から中身を救い出す。
 *
 * ## なぜやるか（実測 2026-08-17、カザフスタンの出題）
 *
 * 2 モデルが `finish_reason=length` で落ちたが、**中身の量は問題ではなかった。**
 *
 *   gemma  12,052 字中 11,790 字（98%）が末尾の空白。本文 262 字。欠落 7/9
 *   Kimi   41,508 字中 40,952 字（99%）が末尾の空白。本文 556 字。**欠落 1/9**
 *
 * `Kimi` は `wrongReasoning` だけが欠けており、`feedbackSchema` の既定値で埋まる。
 * **閉じ括弧を足すだけで使える結果になる。** リクエストを 1 つ救える。
 *
 * ## 成功に見せない
 *
 * 救えても `status` は `truncated` のままにする。**打ち切りは起きた事実である。**
 * `error` に修復した旨を残し、記録から消さない。
 */
function salvageTruncated(base: ModelGrading): ModelGrading {
    const repaired = repairTruncatedJson(base.rawContent)
    const wsNote = repaired.trimmedWhitespace > 0
        ? `末尾の空白 ${repaired.trimmedWhitespace} 字を落とした`
        : '末尾の空白はなかった'

    if (!repaired.ok || repaired.text === null) {
        return { ...base, error: `${base.error ?? ''} / 修復できなかった（${wsNote}）`.trim() }
    }
    const parsed = feedbackSchema.safeParse(JSON.parse(repaired.text))
    if (!parsed.success) {
        // **必須項目が欠けていれば救えない。** 推測で埋めない
        return {
            ...base,
            error: `${base.error ?? ''} / JSON は閉じられたが必須項目が欠けていた（${wsNote}）`.trim(),
        }
    }
    return {
        ...base,
        feedback: parsed.data,
        // **status は truncated のまま。** 打ち切りが起きた事実を消さない
        error: `${base.error ?? ''} / 修復して中身を取り出した（${wsNote}、足した文字 ${JSON.stringify(repaired.appended)}）`.trim(),
    }
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
