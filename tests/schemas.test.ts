/**
 * タスク 2.1：Zod スキーマの単体テスト。
 *
 * 検証する性質
 * - Property 4: 確信度「高」は最大 1 件（要件 2-9）
 * - Property 5: 候補は最大 3 件（要件 2-7）
 * - `absent` / `unknown` で記述が残らない（要件 2-5 と整合させる）
 */
import { describe, expect, it } from 'vitest'
import { answerSchema, slotEntrySchema, slotRecordSchema } from '../shared/schemas'
import { SLOT_IDS, createEmptySlots } from '../shared/slots'
import type { AnswerInput } from '../shared/schemas'

function buildAnswer(overrides: Partial<AnswerInput> = {}): AnswerInput {
    return {
        questionId: 'q-001',
        slots: createEmptySlots(),
        candidates: [{ country: 'JP', confidence: 'high' }],
        decisiveSlot: 'script',
        reasoning: null,
        ...overrides,
    }
}

describe('スロット定義', () => {
    it('スロットは 14 件である（slot-definitions.md が正典）', () => {
        expect(SLOT_IDS).toHaveLength(14)
    })

    it('14 スロットのいずれかが欠けた回答は拒否される', () => {
        const slots = createEmptySlots() as Record<string, unknown>
        delete slots.other
        expect(slotRecordSchema.safeParse(slots).success).toBe(false)
    })
})

describe('answerSchema', () => {
    it('候補 1 件・高 1 件の回答は受理される', () => {
        expect(answerSchema.safeParse(buildAnswer()).success).toBe(true)
    })

    it('候補 4 件の入力は拒否される（要件 2-7）', () => {
        const result = answerSchema.safeParse(
            buildAnswer({
                candidates: [
                    { country: 'JP', confidence: 'high' },
                    { country: 'KR', confidence: 'medium' },
                    { country: 'TW', confidence: 'low' },
                    { country: 'HK', confidence: 'low' },
                ],
            }),
        )
        expect(result.success).toBe(false)
    })

    it('確信度「高」2 件の入力は拒否される（要件 2-9）', () => {
        const result = answerSchema.safeParse(
            buildAnswer({
                candidates: [
                    { country: 'JP', confidence: 'high' },
                    { country: 'KR', confidence: 'high' },
                ],
            }),
        )
        expect(result.success).toBe(false)
    })

    it('候補 0 件の入力は拒否される（要件 2-6）', () => {
        expect(answerSchema.safeParse(buildAnswer({ candidates: [] })).success).toBe(false)
    })

    it('同一国の重複は拒否される', () => {
        const result = answerSchema.safeParse(
            buildAnswer({
                candidates: [
                    { country: 'JP', confidence: 'high' },
                    { country: 'jp', confidence: 'low' },
                ],
            }),
        )
        expect(result.success).toBe(false)
    })

    it('国コードは大文字 2 文字に正規化される', () => {
        const result = answerSchema.parse(
            buildAnswer({ candidates: [{ country: ' jp ', confidence: 'low' }] }),
        )
        expect(result.candidates[0]!.country).toBe('JP')
    })

    it('3 文字の国名は拒否される', () => {
        const result = answerSchema.safeParse(
            buildAnswer({ candidates: [{ country: 'JPN', confidence: 'low' }] }),
        )
        expect(result.success).toBe(false)
    })
})

describe('slotEntrySchema', () => {
    it('visible の記述は保持される', () => {
        const parsed = slotEntrySchema.parse({ state: 'visible', plain: '白い破線', terms: ['t1'] })
        expect(parsed.plain).toBe('白い破線')
        expect(parsed.terms).toEqual(['t1'])
    })

    it('absent では記述と用語 ID が落ちる', () => {
        const parsed = slotEntrySchema.parse({ state: 'absent', plain: '白い破線', terms: ['t1'] })
        expect(parsed.plain).toBeNull()
        expect(parsed.terms).toEqual([])
    })

    it('unknown では記述と用語 ID が落ちる', () => {
        const parsed = slotEntrySchema.parse({ state: 'unknown', plain: '白い破線', terms: ['t1'] })
        expect(parsed.plain).toBeNull()
        expect(parsed.terms).toEqual([])
    })

    it('absent と unknown は別の値として保持される', () => {
        expect(slotEntrySchema.parse({ state: 'absent' }).state).toBe('absent')
        expect(slotEntrySchema.parse({ state: 'unknown' }).state).toBe('unknown')
    })

    it('初期状態は全スロット unknown である', () => {
        const slots = slotRecordSchema.parse(createEmptySlots())
        expect(Object.values(slots).every((entry) => entry.state === 'unknown')).toBe(true)
    })
})
