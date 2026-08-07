/**
 * Zod スキーマ。型定義と実行時検証を共有する。
 *
 * AI 出力の検証にも使う。要件 3-2（辞書外の用語を生成しない）を
 * AI の遵守に依存させないため、コード側の検証を必ず通す。
 */
import { z } from 'zod'
import {
    CONFIDENCES,
    MAX_CANDIDATES,
    MAX_HIGH_CONFIDENCE,
    SLOT_IDS,
    SLOT_STATES,
} from './slots'
import type { SlotId } from './slots'

export const slotIdSchema = z.enum(SLOT_IDS)
export const slotStateSchema = z.enum(SLOT_STATES)
export const confidenceSchema = z.enum(CONFIDENCES)

/** ISO 3166-1 alpha-2。大文字 2 文字に正規化する */
export const countryCodeSchema = z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z]{2}$/.test(v), {
        message: '国コードは ISO 3166-1 alpha-2（英字 2 文字）で指定する',
    })

/**
 * スロット 1 件。
 *
 * `state` が `visible` 以外のとき、記述と用語 ID は意味を持たないため落とす。
 * 画面側でも記述欄を無効化するが、検証側でも同じ規則を適用して整合を取る。
 */
export const slotEntrySchema = z
    .object({
        state: slotStateSchema,
        plain: z.string().nullable().default(null),
        terms: z.array(z.string()).default([]),
        confirmed: z.boolean().optional(),
    })
    .transform((entry) => {
        if (entry.state !== 'visible') {
            return { ...entry, plain: null, terms: [] }
        }
        const plain = entry.plain?.trim() ?? null
        return { ...entry, plain: plain === '' ? null : plain }
    })

/** 14 スロットすべてを必須とする。スロットの欠落を検証で弾く */
export const slotRecordSchema = z.object(
    Object.fromEntries(SLOT_IDS.map((id) => [id, slotEntrySchema])) as Record<
        SlotId,
        typeof slotEntrySchema
    >,
)

export const candidateSchema = z.object({
    country: countryCodeSchema,
    confidence: confidenceSchema,
})

/**
 * 学習者の回答。
 *
 * - 候補は 1 件以上 3 件以下（要件 2-6, 2-7）
 * - 確信度「高」は 1 件まで（要件 2-9）
 * - 同一国の重複は認めない
 */
export const answerSchema = z.object({
    questionId: z.string().min(1),
    slots: slotRecordSchema,
    candidates: z
        .array(candidateSchema)
        .min(1, { message: '回答国を 1 件以上入力する' })
        .max(MAX_CANDIDATES, { message: `候補は最大 ${MAX_CANDIDATES} 件までである` })
        .refine(
            (list) => list.filter((c) => c.confidence === 'high').length <= MAX_HIGH_CONFIDENCE,
            { message: `確信度「高」は ${MAX_HIGH_CONFIDENCE} 件までである` },
        )
        .refine((list) => new Set(list.map((c) => c.country)).size === list.length, {
            message: '同じ国を重複して挙げることはできない',
        }),
    decisiveSlot: slotIdSchema.nullable().default(null),
    reasoning: z.string().nullable().default(null),
})

export const questionSchema = z.object({
    id: z.string().min(1),
    panoId: z.string().min(1),
    fallback: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        heading: z.number(),
    }),
    country: countryCodeSchema,
    region: z.string().nullable().default(null),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    copyright: z.string().min(1),
    captureDate: z.string().nullable().default(null),
    slots: slotRecordSchema,
    decisiveSlots: z.array(slotIdSchema).default([]),
    note: z.string().nullable().default(null),
    source: z.object({
        draftBy: z.array(z.enum(['country_table', 'ai'])).default([]),
    }),
})

export const termSchema = z.object({
    id: z.string().min(1),
    slot: slotIdSchema,
    canonical: z.string().min(1),
    plain: z.string(),
    aliases: z.array(z.string()).default([]),
    countries: z.array(countryCodeSchema).default([]),
    confusableWith: z.array(z.string()).default([]),
    note: z.string().nullable().default(null),
    verifiedByHuman: z.boolean().default(false),
    disputed: z.boolean().default(false),
})

export const glossarySchema = z.array(termSchema)
export const questionsSchema = z.array(questionSchema)

/**
 * 正規化の応答スキーマ生成。
 *
 * 用語 ID は辞書から生成した enum で制約する。
 * **enum には「該当なし」を表す `none` を必ず含める。**
 * エスケープハッチがないと、該当する用語が存在しない入力に対して
 * 誤った ID を強制的に選ばせることになる（制約が逆にハルシネーションを生む）。
 */
export const NONE_TERM_ID = 'none'

export function buildNormalizeSchema(termIds: readonly string[]) {
    const allowed = new Set<string>([...termIds, NONE_TERM_ID])
    return z.object({
        slots: z.array(
            z.object({
                slot: slotIdSchema,
                /** 辞書外の ID はコード側でも破棄する。AI の遵守に依存しない */
                terms: z.array(z.string()).transform((ids) => ids.filter((id) => allowed.has(id))),
            }),
        ),
    })
}

export type AnswerInput = z.input<typeof answerSchema>
export type AnswerParsed = z.output<typeof answerSchema>
export type QuestionParsed = z.output<typeof questionSchema>
export type TermParsed = z.output<typeof termSchema>

// --- 採点 -------------------------------------------------------------------

export const variantSchema = z.enum(['v1', 'v2'])

/**
 * 採点プロンプトの出力。**v1 / v2 で同一のスキーマ。**
 *
 * `strict: true` が保証するのは構造だけである。件数と意味の正しさは保証されない。
 * したがってコード側でも必ず検証する。
 */
export const feedbackSchema = z.object({
    summary: z.string(),
    failureModeExplanation: z.string(),
    missedClues: z
        .array(
            z.object({
                slot: z.string(),
                whatWasThere: z.string(),
                whyItMatters: z.string(),
            }),
        )
        .default([]),
    wrongReasoning: z
        .array(z.object({ slot: z.string(), explanation: z.string() }))
        .default([]),
    vocabulary: z
        .array(
            z.object({
                learnerWrote: z.string(),
                canonicalTerm: z.string(),
                note: z.string(),
            }),
        )
        .default([]),
    discriminationHint: z.string().default(''),
    nextPriority: z.array(z.string()).max(3).default([]),
    discoveries: z.array(z.string()).default([]),
    judgmentUnavailable: z.boolean(),
})

/** 同時採点で受け付けるモデル数の上限。比較対象は 4 モデルである */
export const MAX_GRADING_MODELS = 4

/**
 * `POST /api/grade` のリクエスト。
 *
 * `models` の既定は 1 件（サーバ側で解決する）。**同時採点は明示的に選んだときだけ動く。**
 * 学習者の注意が AI の比較に向くと目的から逸れるため、既定にしない。
 */
export const gradeRequestSchema = z.object({
    questionId: z.string().min(1),
    variant: variantSchema.default('v1'),
    slots: slotRecordSchema,
    candidates: answerSchema.shape.candidates,
    decisiveSlot: slotIdSchema.nullable().default(null),
    reasoning: z.string().nullable().default(null),
    /** 未指定なら既定モデル 1 件。1 モデル = 1 リクエスト消費 */
    models: z
        .array(z.string().min(1))
        .min(1)
        .max(MAX_GRADING_MODELS)
        .optional(),
    /** 既定はストリーミング。比較スクリプトは false にして非ストリーミングで揃える */
    stream: z.boolean().default(true),
})

export type FeedbackParsed = z.output<typeof feedbackSchema>
export type GradeRequestParsed = z.output<typeof gradeRequestSchema>
