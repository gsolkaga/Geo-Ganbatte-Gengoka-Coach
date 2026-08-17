/**
 * スロット 1 件の検証（回帰テスト）。
 *
 * ## なぜこのテストがあるか
 *
 * `slotEntrySchema` に `recognition` を書き忘れていた（2026-08-17 に発覚）。
 * Zod の `z.object` は既定で**未知のキーを黙って落とす。**
 *
 * 結果として `data/questions.json` に書いた `recognition: 'blind'` が
 * `readQuestion()` の検証で消え、**`blind` の判定が一度も発火しない状態**だった。
 * 型検査も通り、テストも通り、実行時エラーも出ない。
 *
 * > **スキーマに無いフィールドは存在しないのと同じである。**
 *
 * 型（`shared/types.ts`）とスキーマ（`shared/schemas.ts`）は別に壊れる。
 * 型を足したときにスキーマを足し忘れても何も起きない。だから往復を固定する。
 */
import { describe, expect, it } from 'vitest'
import { slotEntrySchema, slotRecordSchema } from '../shared/schemas'
import { SLOT_IDS, createEmptySlots } from '../shared/slots'

describe('slotEntrySchema', () => {
    it('recognition を保持する（落とさない）', () => {
        const parsed = slotEntrySchema.parse({
            state: 'visible',
            plain: '太陽の照り返しで白飛びしている',
            terms: [],
            recognition: 'blind',
        })
        expect(parsed.recognition).toBe('blind')
    })

    it('confirmed を保持する', () => {
        const parsed = slotEntrySchema.parse({ state: 'visible', plain: '黄色いガードレール', confirmed: true })
        expect(parsed.confirmed).toBe(true)
    })

    it('recognition の未記録は undefined のまま（easy を既定にしない）', () => {
        const parsed = slotEntrySchema.parse({ state: 'visible', plain: '電柱' })
        expect(parsed.recognition).toBeUndefined()
    })

    it('recognition の値を 3 値に限る', () => {
        expect(() => slotEntrySchema.parse({ state: 'visible', plain: 'x', recognition: '見えない' }))
            .toThrow()
    })

    /** 写っていないものに視認可能性は無い */
    it('absent では recognition を落とす', () => {
        const parsed = slotEntrySchema.parse({ state: 'absent', plain: null, recognition: 'blind' })
        expect(parsed.recognition).toBeUndefined()
        expect(parsed.plain).toBeNull()
    })

    it('unknown では記述と用語 ID を落とす', () => {
        const parsed = slotEntrySchema.parse({ state: 'unknown', plain: '書いてしまった', terms: ['x'] })
        expect(parsed.plain).toBeNull()
        expect(parsed.terms).toEqual([])
    })

    it('visible の空文字は null に寄せる（「見えたが記述なし」を空文字で表さない）', () => {
        expect(slotEntrySchema.parse({ state: 'visible', plain: '   ' }).plain).toBeNull()
    })
})

describe('slotRecordSchema', () => {
    it('14 スロットすべてを要求する', () => {
        expect(SLOT_IDS.length).toBe(14)
        expect(() => slotRecordSchema.parse({ traffic_side: { state: 'unknown' } })).toThrow()
    })

    it('createEmptySlots がそのまま通る', () => {
        const parsed = slotRecordSchema.parse(createEmptySlots())
        expect(Object.keys(parsed).sort()).toEqual([...SLOT_IDS].sort())
    })

    it('スロットごとに recognition を保持する', () => {
        const input = {
            ...createEmptySlots(),
            camera: { state: 'visible', plain: 'Gen4', terms: [], recognition: 'blind' },
        }
        expect(slotRecordSchema.parse(input).camera.recognition).toBe('blind')
    })
})
