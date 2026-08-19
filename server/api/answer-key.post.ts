/**
 * `POST /api/answer-key` — 正解タグの保存（タスク 19）。
 *
 * ## 出題は作らない。タグだけを上書きする
 *
 * 地点の登録は `POST /api/questions` が持っている（pano の解決と著作権の確認がある）。
 * ここで両方を兼ねると、**タグを直すつもりで地点を作ってしまう**経路ができる。
 *
 * > **書き込む対象が違うものは、入口を分ける。**
 *
 * ## 検証は `shared/answer-key.ts` の純関数に置く
 *
 * 画面にも同じ規則を出したいので、サーバだけに書かない。
 * `slotEntrySchema` が形（`visible` 以外は記述と用語 ID を落とす）を守り、
 * `validateAnswerKey` が中身（未確認・視認可能性・用語の所属）を見る。
 *
 * **認証がない。** ローカル実行前提のため許容する。
 */
import { z } from 'zod'
import { validateAnswerKey } from '../../shared/answer-key'
import { slotIdSchema, slotRecordSchema } from '../../shared/schemas'
import type { SlotId } from '../../shared/slots'
import { readGlossary, readQuestion, upsertQuestion } from '../utils/store'

const bodySchema = z.object({
    questionId: z.string().min(1),
    slots: slotRecordSchema,
    decisiveSlots: z.array(slotIdSchema).default([]),
    note: z.string().nullable().default(null),
})

export default defineEventHandler(async (event) => {
    const parsed = bodySchema.safeParse(await readBody(event))
    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: `リクエストの形式が不正である: ${parsed.error.message}`,
        })
    }
    const body = parsed.data

    const question = await readQuestion(body.questionId)
    if (!question) {
        throw createError({ statusCode: 404, statusMessage: `出題が無い: ${body.questionId}` })
    }

    // 用語 ID の所属スロットを引けるようにする。辞書に無い ID はここで落ちる
    const glossary = await readGlossary()
    const slotOfTerm = new Map<string, SlotId>(
        glossary.map((t) => [t.id, t.slot as SlotId]),
    )

    const { errors, warnings } = validateAnswerKey(
        body.slots,
        body.decisiveSlots,
        { slotOf: (id) => slotOfTerm.get(id) },
    )

    if (errors.length) {
        /**
         * **1 件でも誤りがあれば 1 件も保存しない。**
         * 半分入った正解タグは、どこまで人手で確認したのか分からなくなる
         * （データセット取り込みで `error` が 1 件でも出たら入れないのと同じ規律）。
         */
        throw createError({
            statusCode: 422,
            statusMessage: '正解タグを保存しなかった',
            data: { errors, warnings },
        })
    }

    await upsertQuestion({
        ...question,
        slots: body.slots,
        decisiveSlots: body.decisiveSlots,
        note: body.note,
    })

    return { saved: true, questionId: question.id, warnings }
})
