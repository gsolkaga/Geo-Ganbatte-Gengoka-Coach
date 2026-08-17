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
import { deepCopy, hasFormInput, runToFormState } from '../shared/run-form'
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
