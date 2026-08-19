/**
 * 正解タグの保存前検証。
 *
 * ここで守りたいのは 3 つ。
 *
 * | 規則 | 理由 |
 * |---|---|
 * | 未確認を残して保存させない | どこまで人手で見たか分からなくなる |
 * | `visible` に視認可能性を必須にする | 未設定を通すと「見えるはず」に化ける |
 * | 用語 ID は**そのスロットのもの**だけ | 別の軸を掛けると絞り込みが壊れる |
 */
import { describe, expect, it } from 'vitest'
import { answerKeyProgress, validateAnswerKey } from '../shared/answer-key'
import { createEmptySlots } from '../shared/slots'
import type { SlotId } from '../shared/slots'
import type { SlotRecord } from '../shared/types'

/** 14 スロットすべてを確認済みにした土台。個別のテストで必要な分だけ崩す */
function confirmedSlots(): SlotRecord {
    const slots = createEmptySlots() as SlotRecord
    for (const key of Object.keys(slots) as SlotId[]) {
        slots[key] = { state: 'absent', plain: null, terms: [], confirmed: true }
    }
    return slots
}

const lookup = {
    slotOf: (id: string) =>
        (({
            ref_script_latin: 'script',
            ref_traffic_side_left: 'traffic_side',
        }) as Record<string, SlotId | undefined>)[id],
}

describe('validateAnswerKey', () => {
    it('全スロットが確認済みで矛盾が無ければ通る', () => {
        const { errors } = validateAnswerKey(confirmedSlots(), [], lookup)
        expect(errors).toEqual([])
    })

    it('未確認が残っていたら保存させない', () => {
        const slots = confirmedSlots()
        slots.bollard = { ...slots.bollard!, confirmed: false }
        const { errors } = validateAnswerKey(slots, [], lookup)
        expect(errors.join('\n')).toContain('未確認のスロットが 1 件ある')
    })

    it('「見えた」なのに記述が空なら保存させない', () => {
        const slots = confirmedSlots()
        slots.script = { state: 'visible', plain: '   ', terms: [], confirmed: true, recognition: 'easy' }
        const { errors } = validateAnswerKey(slots, [], lookup)
        expect(errors.join('\n')).toContain('記述が空である')
    })

    /** **既定を置かない**という設計判断を、検証側でも守っているか */
    it('「見えた」なのに視認可能性が未設定なら保存させない', () => {
        const slots = confirmedSlots()
        slots.script = { state: 'visible', plain: 'キリル文字', terms: [], confirmed: true }
        const { errors } = validateAnswerKey(slots, [], lookup)
        expect(errors.join('\n')).toContain('視認可能性')
    })

    it('用語 ID が辞書に無ければ保存させない', () => {
        const slots = confirmedSlots()
        slots.script = {
            state: 'visible', plain: 'ラテン文字', terms: ['ref_does_not_exist'],
            confirmed: true, recognition: 'easy',
        }
        const { errors } = validateAnswerKey(slots, [], lookup)
        expect(errors.join('\n')).toContain('辞書に無い')
    })

    /** 別スロットの用語を混ぜると、積集合が別の軸を掛けてしまう */
    it('別のスロットの用語が入っていたら保存させない', () => {
        const slots = confirmedSlots()
        slots.script = {
            state: 'visible', plain: 'ラテン文字', terms: ['ref_traffic_side_left'],
            confirmed: true, recognition: 'easy',
        }
        const { errors } = validateAnswerKey(slots, [], lookup)
        expect(errors.join('\n')).toContain('別のスロットの用語')
    })

    it('用語 ID が無いのは警告にとどめる（後から埋める運用がある）', () => {
        const slots = confirmedSlots()
        slots.script = {
            state: 'visible', plain: 'ラテン文字', terms: [],
            confirmed: true, recognition: 'easy',
        }
        const { errors, warnings } = validateAnswerKey(slots, ['script'], lookup)
        expect(errors).toEqual([])
        expect(warnings.join('\n')).toContain('用語 ID が無い')
    })

    it('決め手は「見えた」スロットから選ばせる', () => {
        const { errors } = validateAnswerKey(confirmedSlots(), ['bollard'], lookup)
        expect(errors.join('\n')).toContain('決め手は「見えた」スロットから選ぶ')
    })

    /** 認識できないものを決め手だと教えても、学習者は次に活かせない */
    it('決め手が blind なら警告する', () => {
        const slots = confirmedSlots()
        slots.camera = {
            state: 'visible', plain: 'アンテナが写っている', terms: [],
            confirmed: true, recognition: 'blind',
        }
        const { errors, warnings } = validateAnswerKey(slots, ['camera'], lookup)
        expect(errors).toEqual([])
        expect(warnings.join('\n')).toContain('認識できないスロット')
    })

    it('決め手の重複を弾く', () => {
        const slots = confirmedSlots()
        slots.script = {
            state: 'visible', plain: 'ラテン文字', terms: [],
            confirmed: true, recognition: 'easy',
        }
        const { errors } = validateAnswerKey(slots, ['script', 'script'], lookup)
        expect(errors.join('\n')).toContain('決め手が重複している')
    })

    it('「見えた」でないのに記述や用語 ID があれば弾く', () => {
        const slots = confirmedSlots()
        slots.pole = { state: 'absent', plain: '木製', terms: ['ref_script_latin'], confirmed: true }
        const { errors } = validateAnswerKey(slots, [], lookup)
        expect(errors.join('\n')).toContain('「見えた」でないのに記述がある')
        expect(errors.join('\n')).toContain('「見えた」でないのに用語 ID がある')
    })
})

describe('answerKeyProgress', () => {
    it('確認済み・見えた・用語入りを数える', () => {
        const slots = confirmedSlots()
        slots.script = {
            state: 'visible', plain: 'ラテン文字', terms: ['ref_script_latin'],
            confirmed: true, recognition: 'easy',
        }
        slots.pole = { state: 'visible', plain: '木製', terms: [], confirmed: true, recognition: 'hard' }
        expect(answerKeyProgress(slots)).toEqual({
            confirmed: 14, visible: 2, withTerms: 1, emptyPlain: 0, total: 14,
        })
    })

    /**
     * **用語だけ選んで記述が空**という状態を数える。
     * 実測（2026-08-19）でこの形のまま保存しようとして 7 件で弾かれた。
     */
    it('用語を選んでも記述が空なら emptyPlain に数える', () => {
        const slots = confirmedSlots()
        slots.script = {
            state: 'visible', plain: null, terms: ['ref_script_latin'],
            confirmed: true, recognition: 'easy',
        }
        slots.pole = { state: 'visible', plain: '   ', terms: [], confirmed: true, recognition: 'hard' }
        const progress = answerKeyProgress(slots)
        expect(progress.emptyPlain).toBe(2)
        expect(progress.withTerms).toBe(1)
    })
})
