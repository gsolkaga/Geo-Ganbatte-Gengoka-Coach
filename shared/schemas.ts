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
        /**
         * 教材データのみ。**視認可能性。`easy` を既定にしない。**
         *
         * ここを省いていたため、`data/questions.json` に書いた `recognition` が
         * `readQuestion()` の検証で**黙って落ちていた**（2026-08-17 に発覚）。
         * `blind` が一度も発火せず、視認できないスロットが見落としとして
         * 提示される状態だった。**スキーマに無いフィールドは存在しないのと同じである。**
         */
        recognition: z.enum(['easy', 'hard', 'blind']).optional(),
    })
    .transform((entry) => {
        if (entry.state !== 'visible') {
            // 写っていないものに視認可能性は無い。記述と用語 ID も意味を持たない
            const { recognition: _recognition, ...rest } = entry
            return { ...rest, plain: null, terms: [] }
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
    /** **enum に入れられるのは atomic のみ**（`shared/types.ts` の TermKind 参照） */
    kind: z.enum(['atomic', 'combination']),
    /** **断定してよいのは verified のみ** */
    certainty: z.enum(['verified', 'heuristic', 'unverified']),
    /** `reference` は公開資料を参照して人手で編集したもの。**`human`（本人の連想）と混ぜない** */
    source: z.enum(['human', 'reference', 'ai']),
    /** 該当国リストの出典。**どこから来た数字かが辿れない一覧を作らない** */
    sources: z.array(z.string()).optional(),
    canonical: z.string().min(1),
    plain: z.string(),
    aliases: z.array(z.string()).default([]),
    countries: z.array(countryCodeSchema).default([]),
    /**
     * **これが見えたら候補から外れる国。** 網羅でなくても使える
     * （`shared/types.ts` に経緯がある）。`exhaustive: false` でも有効。
     */
    excludes: z.array(countryCodeSchema).optional(),
    /** 地域をまたいで連続的に変化する軸。**境界ではなく勾配である** */
    gradient: z.object({
        axis: z.enum(['north_south', 'west_east', 'urban_rural', 'highland_lowland', 'cold_warm']),
        note: z.string(),
    }).optional(),
    confusableWith: z.array(z.string()).default([]),
    requires: z
        .array(z.object({ slot: slotIdSchema, what: z.string() }))
        .nullable()
        .default(null),
    note: z.string().nullable().default(null),
    disputed: z.boolean().default(false),
    /**
     * `countries` が網羅か連想か。**既定は網羅。**
     * 連想（`false`）は絞り込み計算に使わない（`shared/types.ts` に経緯がある）。
     */
    exhaustive: z.boolean().optional(),
    modelCount: z.number().int().optional(),
})

/**
 * `data/glossary.json` は `{ _comment, generatedAt, terms }` の形で生成される
 * （`scripts/build-glossary.mjs`）。**生成物の形をスキーマに合わせる。**
 *
 * 裸の配列も受ける。テストのフィクスチャと、手で書いた抜粋を通すため。
 */
export const glossarySchema = z.union([
    z.object({ terms: z.array(termSchema) }).transform((v) => v.terms),
    z.array(termSchema),
])
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

/**
 * スロット別に許可する用語 ID の対応表。
 *
 * **enum をスロットごとに分ける。** 全 78 語を 1 つの enum にすると、
 * `bollard` の記述に `pole` の用語 ID を選ばせることができてしまう。
 * `strict: true` は「enum のいずれか」しか保証せず、**どのスロットかは保証しない。**
 */
export type AllowedTermsBySlot = Partial<Record<string, readonly string[]>>

export function buildNormalizeSchema(allowedBySlot: AllowedTermsBySlot) {
    const allowed = new Map<string, Set<string>>(
        Object.entries(allowedBySlot).map(([slot, ids]) => [
            slot,
            new Set<string>([...(ids ?? []), NONE_TERM_ID]),
        ]),
    )
    return z.object({
        slots: z.array(
            z
                .object({
                    slot: slotIdSchema,
                    terms: z.array(z.string()),
                })
                /**
                 * **辞書外の ID と、他スロットの ID はコード側でも破棄する。**
                 * AI の遵守に依存させない（要件 3-2）。
                 */
                .transform((entry) => ({
                    slot: entry.slot,
                    terms: entry.terms.filter((id) => allowed.get(entry.slot)?.has(id) ?? false),
                })),
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
    /**
     * **文字列 `"null"` を空として扱う。**
     *
     * 実測（2026-08-17、Kimi-K2.6）で `"discriminationHint": "null"` が返った。
     * JSON の `null` ではなく **4 文字の文字列**である。
     * スキーマは `string` を要求しているので通り、Zod も通り、画面に「null」と出た。
     *
     * `strict: true` は型を守らせたが意味は守らせなかった。3 回目である
     * （1 回目は件数、2 回目は `confusableWith` に国コード）。
     * **意味の検証はコードの仕事である。**
     */
    discriminationHint: z
        .string()
        .default('')
        .transform((v) => (isNullLike(v) ? '' : v)),
    /**
     * 次に見るべきスロット。**スロット ID に限る。**
     *
     * 実測で 4 モデルの形式が揃わなかった。
     *   Qwen     ["traffic_side", "road_marking", "sign"]   ← 想定どおり
     *   gpt-oss  ["traffic_side（走行側）――日本は左側通行なので…"]
     *   Kimi     ["次の地点ではtraffic_side、road_marking…を優先的に確認…"]
     *   gemma    []
     *
     * 自由文字列にしていたため全部通っていた。**選択肢は 14 個しかない。**
     * ID として解釈できないものは捨てる。文章は `discriminationHint` に書かせる。
     *
     * なお v2 では `nextPriority` を**コードが計算して渡している**
     * （`server/utils/narrowing.ts`）。AI の出力は表示に使わない。
     */
    nextPriority: z
        .array(z.string())
        .default([])
        // **判定と同じ形に正規化してから残す。** 判定だけ trim すると空白付きが素通りする
        .transform((list) => [...new Set(list.map((v) => v.trim()).filter(isSlotId))].slice(0, 3)),
    discoveries: z.array(z.string()).default([]),
    judgmentUnavailable: z.boolean(),
})

/** 「値が無い」を文字列で書いてきた場合。**空として扱い、画面に出さない** */
function isNullLike(value: string): boolean {
    const v = value.trim().toLowerCase()
    return v === '' || v === 'null' || v === 'undefined' || v === 'none' || v === 'n/a'
}

/**
 * 文章ではなくスロット ID かどうか。`"traffic_side（走行側）――…"` は ID ではない。
 * **呼び出し側で trim 済みの値を渡すこと。** ここでは正規化しない
 */
function isSlotId(value: string): value is SlotId {
    return (SLOT_IDS as readonly string[]).includes(value)
}

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
