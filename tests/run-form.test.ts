/**
 * 記録 → フォームの変換（回帰テスト）。
 *
 * ## なぜこのテストがあるか
 *
 * 最初は `app/pages/index.vue` の中に書き、`structuredClone` で複製していた。
 * **`structuredClone` は Vue のリアクティブプロキシを複製できない。**
 *
 * 例外がクリックハンドラの中で投げられ、**画面には何も起きなかった。**
 * 型検査も通り、ビルドも通り、API も正しく応答していた。
 * 症状は「ボタンを押しても入らない」だけだった。
 *
 * > **画面の中のロジックは検査されない。切り出せば検査できる。**
 *
 * したがってこのテストは **`ref` に入れた値を渡す**。
 * 生のオブジェクトで通しても、実際に壊れた条件を再現しない。
 */
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import {
    countNormalizedSlots,
    deepCopy,
    hasFormInput,
    mergeNormalizedTerms,
    runToFormState,
} from '../shared/run-form'
import { SLOT_IDS, createEmptySlots } from '../shared/slots'
import type { Answer, SlotRecord } from '../shared/types'

/** `/api/runs` の応答を `ref` に入れた状態を再現する */
function reactiveRuns(answer: Answer) {
    const runs = ref([{ file: 'x.json', questionId: answer.questionId, answer }])
    return runs.value[0]!.answer
}

function buildAnswer(): Answer {
    const slots = createEmptySlots() as SlotRecord
    slots.script = { state: 'visible', plain: 'キリル文字', terms: ['script_cyrillic'] }
    slots.bollard = { state: 'absent', plain: null, terms: [] }
    return {
        questionId: 'q-kz-01',
        slots,
        candidates: [
            { country: 'RU', confidence: 'medium' },
            { country: 'KZ', confidence: 'low' },
            { country: 'KG', confidence: 'low' },
        ],
        decisiveSlot: 'script',
        reasoning: 'キリル文字だがロシアだと思った',
    }
}

describe('structuredClone が使えない条件の記録', () => {
    /** **これが直した原因である。** 生のオブジェクトでは再現しない */
    it('structuredClone はリアクティブプロキシで例外になる', () => {
        const answer = reactiveRuns(buildAnswer())
        expect(() => structuredClone(answer.slots)).toThrow()
        expect(() => structuredClone(answer.candidates)).toThrow()
    })

    it('deepCopy は通る', () => {
        const answer = reactiveRuns(buildAnswer())
        expect(deepCopy(answer.slots).script.plain).toBe('キリル文字')
    })
})

describe('runToFormState', () => {
    it('リアクティブな記録から観察メモを復元する', () => {
        const { slots } = runToFormState(reactiveRuns(buildAnswer()))
        expect(slots.script.state).toBe('visible')
        expect(slots.script.plain).toBe('キリル文字')
        expect(slots.bollard.state).toBe('absent')
    })

    /** **回答側が入らないという報告の中身である** */
    it('候補国・確信度・決め手・推論を復元する', () => {
        const { answer } = runToFormState(reactiveRuns(buildAnswer()))
        expect(answer.candidates).toEqual([
            { country: 'RU', confidence: 'medium' },
            { country: 'KZ', confidence: 'low' },
            { country: 'KG', confidence: 'low' },
        ])
        expect(answer.decisiveSlot).toBe('script')
        expect(answer.reasoning).toBe('キリル文字だがロシアだと思った')
    })

    /** 再採点で絞り込みが算出不能にならないため */
    it('用語 ID を捨てない', () => {
        const { slots } = runToFormState(reactiveRuns(buildAnswer()))
        expect(slots.script.terms).toEqual(['script_cyrillic'])
    })

    it('14 スロットすべてを揃える', () => {
        const { slots } = runToFormState(reactiveRuns(buildAnswer()))
        expect(Object.keys(slots).sort()).toEqual([...SLOT_IDS].sort())
    })

    /** 古い形式の記録でスロットが欠けていても描画が壊れないこと */
    it('欠けたスロットを unknown で補う', () => {
        const partial = {
            slots: { script: { state: 'visible' as const, plain: 'x', terms: [] } } as unknown as SlotRecord,
            candidates: [{ country: 'JP' as string, confidence: 'high' as const }],
            decisiveSlot: null,
            reasoning: null,
        }
        const { slots } = runToFormState(partial)
        expect(Object.keys(slots).length).toBe(14)
        expect(slots.bollard.state).toBe('unknown')
    })

    /** 候補 0 件で入力欄が消えると書き始められない */
    it('候補が空なら空欄を 1 件置く', () => {
        const { answer } = runToFormState({
            slots: createEmptySlots() as SlotRecord,
            candidates: [],
            decisiveSlot: null,
            reasoning: null,
        })
        expect(answer.candidates).toEqual([{ country: '', confidence: 'medium' }])
    })

    /** **一覧側と構造を共有しない。** 共有するとフォームの編集が一覧に及ぶ */
    it('復元した値を編集しても記録側に影響しない', () => {
        const answer = reactiveRuns(buildAnswer())
        const state = runToFormState(answer)
        state.slots.script.plain = '書き換えた'
        state.answer.candidates[0]!.country = 'XX'
        expect(answer.slots.script.plain).toBe('キリル文字')
        expect(answer.candidates[0]!.country).toBe('RU')
    })
})

describe('hasFormInput', () => {
    it('空のフォームでは false', () => {
        expect(hasFormInput(createEmptySlots() as SlotRecord, {
            candidates: [{ country: '', confidence: 'medium' }],
            decisiveSlot: null,
            reasoning: null,
        })).toBe(false)
    })

    it('スロットの状態を変えただけでも true', () => {
        const slots = createEmptySlots() as SlotRecord
        slots.bollard = { state: 'absent', plain: null, terms: [] }
        expect(hasFormInput(slots, {
            candidates: [{ country: '', confidence: 'medium' }],
            decisiveSlot: null,
            reasoning: null,
        })).toBe(true)
    })

    it('候補国を書いていれば true', () => {
        expect(hasFormInput(createEmptySlots() as SlotRecord, {
            candidates: [{ country: 'JP', confidence: 'high' }],
            decisiveSlot: null,
            reasoning: null,
        })).toBe(true)
    })

    it('決め手を選んでいれば true', () => {
        expect(hasFormInput(createEmptySlots() as SlotRecord, {
            candidates: [{ country: '', confidence: 'medium' }],
            decisiveSlot: 'script',
            reasoning: null,
        })).toBe(true)
    })
})

/**
 * 正規化結果の合成。
 *
 * **v2 の絞り込み計算はこれがないと全部「算出不能」になる**（実測 2026-08-17）。
 * 判定は AI を使わないが、判定の入力を作るのに AI が必要である。
 */
describe('mergeNormalizedTerms', () => {
    const withScript = (): SlotRecord => {
        const slots = createEmptySlots() as SlotRecord
        slots.script = { state: 'visible', plain: 'ハングルっぽい文字', terms: [] }
        slots.bollard = { state: 'absent', plain: null, terms: [] }
        return slots
    }

    it('用語 ID を入れる', () => {
        const merged = mergeNormalizedTerms(withScript(), [
            { slot: 'script', terms: ['script_hangul'], none: false },
        ])
        expect(merged.script.terms).toEqual(['script_hangul'])
    })

    /** **学習者が書いた言葉を書き換えない** */
    it('元の記述を変えない', () => {
        const merged = mergeNormalizedTerms(withScript(), [
            { slot: 'script', terms: ['script_hangul'], none: false },
        ])
        expect(merged.script.plain).toBe('ハングルっぽい文字')
    })

    /** **辞書に無いと分かっただけである。以前の ID を捨てる理由がない** */
    it('該当なしでは既存の terms を消さない', () => {
        const slots = withScript()
        slots.script.terms = ['script_hangul']
        const merged = mergeNormalizedTerms(slots, [{ slot: 'script', terms: [], none: true }])
        expect(merged.script.terms).toEqual(['script_hangul'])
    })

    it('visible 以外のスロットには入れない', () => {
        const merged = mergeNormalizedTerms(withScript(), [
            { slot: 'bollard', terms: ['bollard_all_yellow'], none: false },
        ])
        expect(merged.bollard.terms).toEqual([])
    })

    it('知らないスロット ID を無視する', () => {
        expect(() => mergeNormalizedTerms(withScript(), [
            { slot: 'street_light', terms: ['x'], none: false },
        ])).not.toThrow()
    })

    it('重複した ID を除く', () => {
        const merged = mergeNormalizedTerms(withScript(), [
            { slot: 'script', terms: ['a', 'a', 'b'], none: false },
        ])
        expect(merged.script.terms).toEqual(['a', 'b'])
    })

    /** **元を書き換えない。** 書き換えると再採点のたびに入力が変質する */
    it('引数を破壊しない', () => {
        const slots = withScript()
        mergeNormalizedTerms(slots, [{ slot: 'script', terms: ['script_hangul'], none: false }])
        expect(slots.script.terms).toEqual([])
    })

    it('リアクティブな値でも通る', () => {
        const holder = ref(withScript())
        const merged = mergeNormalizedTerms(holder.value, [
            { slot: 'script', terms: ['script_hangul'], none: false },
        ])
        expect(merged.script.terms).toEqual(['script_hangul'])
    })
})

describe('countNormalizedSlots', () => {
    it('用語 ID が入っているスロット数を数える', () => {
        const slots = createEmptySlots() as SlotRecord
        expect(countNormalizedSlots(slots)).toBe(0)
        slots.script = { state: 'visible', plain: 'x', terms: ['a'] }
        slots.pole = { state: 'visible', plain: 'y', terms: ['b', 'c'] }
        expect(countNormalizedSlots(slots)).toBe(2)
    })
})
