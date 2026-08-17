/**
 * 保存済みの記録をフォームの状態へ変換する。
 *
 * ## なぜ画面から切り出したか
 *
 * 最初は `app/pages/index.vue` の中に書き、`structuredClone` で複製した。
 * **`structuredClone` は Vue のリアクティブプロキシを複製できない。**
 *
 * ```
 * structuredClone(record.answer.slots)
 *   → DataCloneError: #<Object> could not be cloned.
 * ```
 *
 * `runs` は `ref` に入れているため、要素は Proxy で包まれる。
 * 例外はクリックハンドラの中で投げられるので、
 * **画面には何も起きず、コンソールにだけエラーが出た。**
 * 症状は「ボタンを押しても入らない」だった。
 *
 * 型検査は通る（`structuredClone<T>(value: T): T`）。
 * **画面の中に書いていたのでテストも書いていなかった。**
 *
 * > **画面の中のロジックは検査されない。切り出せば検査できる。**
 *
 * ## JSON で複製する
 *
 * 記録の中身は文字列・数値・真偽値・配列・`null` だけである（`data/runs/*.json` から来る）。
 * **`Date` や `undefined` を持つようになったらこの前提が崩れる。**
 * その条件は `tests/run-form.test.ts` で固定している。
 */
import { SLOT_IDS, createEmptySlots } from './slots'
import type { SlotId } from './slots'
import type { Answer, AnswerDraft, SlotRecord } from './types'

/**
 * リアクティブプロキシを通しても複製できる deep copy。
 *
 * **`structuredClone` を使わない。** Proxy で例外になる。
 * `toRaw` も使わない。入れ子のどこが raw かを呼び出し側が知っている必要が出る。
 */
export function deepCopy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

export interface FormState {
    slots: SlotRecord
    answer: AnswerDraft
}

/** 空の回答。候補 1 件だけ置く。**0 件にすると入力欄が消えて書き始められない** */
export function emptyAnswerDraft(): AnswerDraft {
    return { candidates: [{ country: '', confidence: 'medium' }], decisiveSlot: null, reasoning: null }
}

/**
 * 記録をフォームの状態へ変換する。
 *
 * **欠けたスロットを補う。** 記録が古い形式で 14 スロット揃っていない場合、
 * そのまま入れると `SlotField` が `undefined` を受け取って描画が壊れる。
 *
 * `terms`（正規化済みの用語 ID）は保持する。捨てると再採点で絞り込みが算出不能になる。
 */
export function runToFormState(answer: Pick<Answer, 'slots' | 'candidates' | 'decisiveSlot' | 'reasoning'>): FormState {
    const source = deepCopy(answer)

    const slots = createEmptySlots() as SlotRecord
    for (const id of SLOT_IDS) {
        const entry = source.slots?.[id]
        if (entry) slots[id] = entry
    }

    return {
        slots,
        answer: {
            // **候補が空なら空欄を 1 件置く。** 0 件だと入力欄が出ない
            candidates: source.candidates?.length
                ? source.candidates
                : emptyAnswerDraft().candidates,
            decisiveSlot: (source.decisiveSlot ?? null) as SlotId | null,
            reasoning: source.reasoning ?? null,
        },
    }
}

/** フォームに何か書かれているか。上書きの確認を出すかどうかの判断に使う */
export function hasFormInput(slots: SlotRecord, answer: AnswerDraft): boolean {
    const touched = SLOT_IDS.some((id) => {
        const entry = slots[id]
        return entry !== undefined && (entry.state !== 'unknown' || Boolean(entry.plain?.trim()))
    })
    return touched
        || answer.candidates.some((c) => c.country !== '')
        || Boolean(answer.reasoning?.trim())
        || answer.decisiveSlot !== null
}
