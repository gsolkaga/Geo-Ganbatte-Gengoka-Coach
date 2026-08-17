/**
 * `POST /api/normalize` — 素人語 → 用語 ID の正規化（タスク 22）。
 *
 * **13 スロットを 1 リクエストで処理する。** スロットごとに呼ぶと 13 リクエストになり、
 * 無償枠（リクエスト数で数える）を 1 プレイで使い切る。
 *
 * ## v1 では呼ばない
 *
 * v1 は「辞書を持たない条件」そのものである。v1 で正規化すると対照実験が崩れる
 * （`server/api/grade.post.ts` の冒頭を参照）。呼び出しは v2 の経路だけである。
 *
 * ## 失敗しても採点は続けられる
 *
 * 正規化は補助である。落ちた場合は `terms` が空のまま採点に進む。
 * **例外にして採点まで止めると、AI の不調で学習が止まる。**
 * ただし `ok: false` を隠さない。呼び出し側が「正規化なしの結果」と分かる形で返す。
 *
 * **認証がない。** ローカル実行前提のため許容する。
 */
import { z } from 'zod'
import { buildNormalizeSchema, slotRecordSchema } from '../../shared/schemas'
import { resolveModel, localIsoString } from '../utils/ai'
import {
    NORMALIZE_SYSTEM_PROMPT,
    buildAllowedBySlot,
    buildAllowedTerms,
    buildNormalizeJsonSchema,
    buildNormalizeUserPrompt,
    resolveNormalized,
    selectTargetSlots,
} from '../utils/normalize'
import { requestStructured } from '../utils/structured'
import { appendGlossaryCandidate, readGlossary } from '../utils/store'

const bodySchema = z.object({
    slots: slotRecordSchema,
    /** 辞書追加候補の記録に残す。学習者が「該当なし」を出した地点を追跡するため */
    questionId: z.string().min(1).nullable().default(null),
    model: z.string().min(1).optional(),
})

export default defineEventHandler(async (event) => {
    const parsed = bodySchema.safeParse(await readBody(event))
    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: `リクエストの形式が不正である: ${parsed.error.message}`,
        })
    }
    const { slots, questionId, model } = parsed.data

    const glossary = await readGlossary()
    const allowed = buildAllowedTerms(glossary)
    const targets = selectTargetSlots(slots, allowed)

    // 正規化するものが無い。**AI を呼ばない。** リクエストを 1 つ節約する
    if (targets.length === 0) {
        return {
            requestsConsumed: 0,
            ok: true,
            mode: null,
            slots: [],
            candidatesRecorded: 0,
            note: '記述のあるスロットが無いか、辞書に候補が無いため正規化を行わなかった',
        }
    }

    const result = await requestStructured({
        category: 'app_runtime',
        endpoint: 'normalize',
        variant: 'v2',
        model: model ?? resolveModel('normalize'),
        system: NORMALIZE_SYSTEM_PROMPT,
        user: buildNormalizeUserPrompt(slots, targets, allowed),
        schema: buildNormalizeSchema(buildAllowedBySlot(targets, allowed)),
        jsonSchema: buildNormalizeJsonSchema(targets, allowed),
        schemaName: 'slot_normalization',
    })

    if (!result.ok || result.data === null) {
        // **失敗を成功に見せない。** terms は空のまま採点に進める
        return {
            requestsConsumed: result.attempts.length,
            ok: false,
            mode: null,
            slots: [],
            candidatesRecorded: 0,
            error: result.error,
            attempts: result.attempts,
        }
    }

    const normalized = resolveNormalized(targets, result.data.slots)

    // 「該当なし」を辞書追加候補として蓄積する（要件 3-4）
    const ts = localIsoString()
    let candidatesRecorded = 0
    for (const entry of normalized) {
        if (!entry.none) continue
        await appendGlossaryCandidate({
            ts,
            slot: entry.slot,
            plain: slots[entry.slot]?.plain?.trim() ?? '',
            questionId,
        })
        candidatesRecorded += 1
    }

    return {
        requestsConsumed: result.attempts.length,
        ok: true,
        mode: result.mode,
        slots: normalized,
        candidatesRecorded,
        attempts: result.attempts,
    }
})
