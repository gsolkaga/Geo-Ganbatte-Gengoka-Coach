/**
 * 正規化の単体テスト（タスク 22.1）。
 *
 * ## 検証する性質
 *
 * **辞書外の用語 ID は出力に現れない。** AI の遵守に依存させない（要件 3-2, 3-5）。
 *
 * `strict: true` が保証するのは「enum のいずれかであること」だけである。
 * 実測で、AI は `confusableWith` に用語 ID ではなく国コードを入れた
 * （`docs/ai-vs-human-glossary.md`）。**型は守られたが意味は守られなかった。**
 * したがってコード側で必ず捨てる。
 */
import { describe, expect, it } from 'vitest'
import { NONE_TERM_ID, buildNormalizeSchema } from '../shared/schemas'
import {
    buildAllowedBySlot,
    buildAllowedTerms,
    buildNormalizeJsonSchema,
    buildNormalizeUserPrompt,
    resolveNormalized,
    selectTargetSlots,
} from '../server/utils/normalize'
import { createEmptySlots } from '../shared/slots'
import type { SlotId } from '../shared/slots'
import type { SlotEntry, SlotRecord, Term } from '../shared/types'

const term = (id: string, slot: SlotId, kind: Term['kind'] = 'atomic'): Term => ({
    id,
    slot,
    kind,
    certainty: 'verified',
    source: 'human',
    canonical: id,
    plain: `${id} の素人語`,
    aliases: [],
    countries: ['BG'],
    confusableWith: [],
    requires: null,
    note: null,
    disputed: false,
})

const glossary: Term[] = [
    term('bollard_black_top', 'bollard'),
    term('bollard_all_yellow', 'bollard'),
    // **combination は候補にしない。** 見ていない部分まで見たことになる
    term('bollard_white_black_red', 'bollard', 'combination'),
    term('pole_octagonal', 'pole'),
    // other は正規化しない。辞書に載っていないことが存在理由である
    term('other_something', 'other'),
]

const visible = (plain: string): SlotEntry => ({ state: 'visible', plain, terms: [] })

function slotsWith(overrides: Partial<Record<SlotId, SlotEntry>>): SlotRecord {
    return { ...createEmptySlots(), ...overrides } as SlotRecord
}

describe('buildAllowedTerms', () => {
    it('atomic だけを候補にする', () => {
        const allowed = buildAllowedTerms(glossary)
        expect(allowed.bollard?.map((t) => t.id)).toEqual(['bollard_black_top', 'bollard_all_yellow'])
    })

    it('other スロットは候補にしない', () => {
        expect(buildAllowedTerms(glossary).other).toBeUndefined()
    })
})

describe('selectTargetSlots', () => {
    it('記述があり候補もあるスロットだけを選ぶ', () => {
        const slots = slotsWith({ bollard: visible('上が黒い杭'), pole: visible('八角形の柱') })
        expect(selectTargetSlots(slots, buildAllowedTerms(glossary))).toEqual(['bollard', 'pole'])
    })

    it('記述が空のスロットは選ばない', () => {
        const slots = slotsWith({ bollard: { state: 'visible', plain: '   ', terms: [] } })
        expect(selectTargetSlots(slots, buildAllowedTerms(glossary))).toEqual([])
    })

    it('absent と unknown のスロットは選ばない', () => {
        const slots = slotsWith({ bollard: { state: 'absent', plain: null, terms: [] } })
        expect(selectTargetSlots(slots, buildAllowedTerms(glossary))).toEqual([])
    })

    /** 候補が無いスロットに「該当なし」を答えさせても意味がない */
    it('辞書に候補が無いスロットは選ばない', () => {
        const slots = slotsWith({ season: visible('葉が落ちている') })
        expect(selectTargetSlots(slots, buildAllowedTerms(glossary))).toEqual([])
    })

    it('other は記述があっても選ばない', () => {
        const slots = slotsWith({ other: visible('ゴミが落ちていない') })
        expect(selectTargetSlots(slots, buildAllowedTerms(glossary))).toEqual([])
    })
})

describe('buildNormalizeSchema（Zod 側の破棄）', () => {
    const allowed = buildAllowedTerms(glossary)
    const targets: SlotId[] = ['bollard', 'pole']
    const schema = buildNormalizeSchema(buildAllowedBySlot(targets, allowed))

    it('辞書に無い ID を捨てる', () => {
        const parsed = schema.parse({
            slots: [{ slot: 'bollard', terms: ['bollard_black_top', 'bollard_totally_made_up'] }],
        })
        expect(parsed.slots[0]!.terms).toEqual(['bollard_black_top'])
    })

    /** enum をスロットごとに分けた理由。**strict はスロットの取り違えを防がない** */
    it('他スロットの ID を捨てる', () => {
        const parsed = schema.parse({
            slots: [{ slot: 'bollard', terms: ['pole_octagonal', 'bollard_all_yellow'] }],
        })
        expect(parsed.slots[0]!.terms).toEqual(['bollard_all_yellow'])
    })

    it('combination の ID を捨てる', () => {
        const parsed = schema.parse({
            slots: [{ slot: 'bollard', terms: ['bollard_white_black_red'] }],
        })
        expect(parsed.slots[0]!.terms).toEqual([])
    })

    it('none は通す（該当なしの表明であり誤りではない）', () => {
        const parsed = schema.parse({ slots: [{ slot: 'bollard', terms: [NONE_TERM_ID] }] })
        expect(parsed.slots[0]!.terms).toEqual([NONE_TERM_ID])
    })
})

describe('buildNormalizeJsonSchema', () => {
    const allowed = buildAllowedTerms(glossary)
    const targets: SlotId[] = ['bollard', 'pole']
    const schema = buildNormalizeJsonSchema(targets, allowed) as any

    /** `strict: true` は件数を保証しない。明示しないとスロットが欠ける */
    it('slots の件数を対象スロット数に固定する', () => {
        expect(schema.properties.slots.minItems).toBe(2)
        expect(schema.properties.slots.maxItems).toBe(2)
    })

    it('用語 ID の enum に none を含める', () => {
        expect(schema.properties.slots.items.properties.terms.items.enum).toContain(NONE_TERM_ID)
    })

    it('combination の ID を enum に入れない', () => {
        expect(schema.properties.slots.items.properties.terms.items.enum)
            .not.toContain('bollard_white_black_red')
    })

    it('対象外スロットの ID を enum に入れない', () => {
        expect(schema.properties.slots.items.properties.terms.items.enum)
            .not.toContain('other_something')
    })
})

describe('buildNormalizeUserPrompt', () => {
    const allowed = buildAllowedTerms(glossary)

    it('スロットごとに候補を区切って渡す', () => {
        const slots = slotsWith({ bollard: visible('上が黒い杭') })
        const prompt = buildNormalizeUserPrompt(slots, ['bollard'], allowed)
        expect(prompt).toContain('上が黒い杭')
        expect(prompt).toContain('bollard_black_top')
        expect(prompt).not.toContain('pole_octagonal')
    })

    /** 正規化は対応づけであり、正しさの判断ではない。certainty を渡すと選択を躊躇する */
    it('certainty を渡さない', () => {
        const slots = slotsWith({ bollard: visible('上が黒い杭') })
        const prompt = buildNormalizeUserPrompt(slots, ['bollard'], allowed)
        expect(prompt).not.toContain('verified')
        expect(prompt).not.toContain('heuristic')
    })
})

describe('resolveNormalized', () => {
    it('none を terms から外してフラグに移す', () => {
        const result = resolveNormalized(['bollard'], [{ slot: 'bollard', terms: [NONE_TERM_ID] }])
        expect(result).toEqual([{ slot: 'bollard', terms: [], none: true }])
    })

    it('重複した ID を除く', () => {
        const result = resolveNormalized(
            ['bollard'],
            [{ slot: 'bollard', terms: ['bollard_black_top', 'bollard_black_top'] }],
        )
        expect(result[0]!.terms).toEqual(['bollard_black_top'])
    })

    /** 欠けたスロットを黙って捨てると辞書追加候補の記録が漏れる */
    it('応答に無いスロットを該当なしとして扱う', () => {
        const result = resolveNormalized(['bollard', 'pole'], [{ slot: 'bollard', terms: ['bollard_black_top'] }])
        expect(result).toEqual([
            { slot: 'bollard', terms: ['bollard_black_top'], none: false },
            { slot: 'pole', terms: [], none: true },
        ])
    })

    it('none と実在 ID が混ざった場合は実在 ID を残す', () => {
        const result = resolveNormalized(
            ['bollard'],
            [{ slot: 'bollard', terms: [NONE_TERM_ID, 'bollard_all_yellow'] }],
        )
        expect(result).toEqual([{ slot: 'bollard', terms: ['bollard_all_yellow'], none: false }])
    })
})
