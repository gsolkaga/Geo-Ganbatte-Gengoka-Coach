/**
 * タスク 10 のコード判定の単体テスト。**AI をモックする必要すらない（AI を使わない）。**
 *
 * 検証する性質
 * - Property 1: 判定は AI の出力に依存しない
 * - Property 3: `absent` と `unknown` を区別する（v1 では両方 null に落ちる）
 * - `null`（判定不能）と `[]`（該当なし）を混ぜない
 */
import { describe, expect, it } from 'vitest'
import { buildConfusionPairs, buildJudgement, buildV1Judgement, judgeHit } from '../server/utils/grading'
import { createEmptySlots } from '../shared/slots'
import type { Answer } from '../shared/types'

function buildAnswer(candidates: Answer['candidates']): Answer {
    return {
        questionId: 'q-jp-01',
        slots: createEmptySlots(),
        candidates,
        decisiveSlot: 'script',
        reasoning: null,
    }
}

describe('judgeHit', () => {
    it('正解が候補集合に含まれれば hit になり、その確信度を返す', () => {
        const result = judgeHit(
            [
                { country: 'KR', confidence: 'high' },
                { country: 'JP', confidence: 'low' },
            ],
            'JP',
        )
        expect(result).toEqual({ hit: true, hitConfidence: 'low' })
    })

    it('含まれなければ hit は false で確信度は null', () => {
        const result = judgeHit([{ country: 'KR', confidence: 'high' }], 'JP')
        expect(result).toEqual({ hit: false, hitConfidence: null })
    })

    it('大文字小文字と空白を無視して比較する', () => {
        expect(judgeHit([{ country: 'jp', confidence: 'medium' }], ' JP ').hit).toBe(true)
    })
})

describe('buildConfusionPairs', () => {
    it('併記された国の全組を重複なく返す', () => {
        const pairs = buildConfusionPairs([
            { country: 'RU', confidence: 'medium' },
            { country: 'KZ', confidence: 'low' },
            { country: 'KG', confidence: 'low' },
        ])
        expect(pairs).toEqual([
            ['KG', 'KZ'],
            ['KG', 'RU'],
            ['KZ', 'RU'],
        ])
    })

    it('候補 1 件では組が作れないので空配列', () => {
        expect(buildConfusionPairs([{ country: 'JP', confidence: 'high' }])).toEqual([])
    })
})

describe('buildV1Judgement', () => {
    const judgement = buildV1Judgement(
        buildAnswer([
            { country: 'RU', confidence: 'high' },
            { country: 'KZ', confidence: 'low' },
        ]),
        'KZ',
    )

    it('v1 でも算出できる項目は値を持つ', () => {
        expect(judgement.variant).toBe('v1')
        expect(judgement.hit).toBe(true)
        expect(judgement.hitConfidence).toBe('low')
        expect(judgement.confusionPairs).toEqual([['KZ', 'RU']])
    })

    it('正解タグが必要な項目は null であり、空配列にしない', () => {
        // [] は「計算した結果、該当なし」。null は「計算できなかった」
        expect(judgement.missedSlots).toBeNull()
        expect(judgement.wrongAbsentSlots).toBeNull()
        expect(judgement.overclaimedSlots).toBeNull()
        expect(judgement.failureModes).toBeNull()
        expect(judgement.discoveries).toBeNull()
    })

    it('辞書が必要な項目も null である', () => {
        expect(judgement.narrowingPower).toBeNull()
        expect(judgement.intersection).toBeNull()
        expect(judgement.nextPriority).toBeNull()
    })

    it('判定不能を空配列で表現していないこと（満点に見える誤りを防ぐ）', () => {
        const nullable = [
            judgement.missedSlots,
            judgement.wrongAbsentSlots,
            judgement.overclaimedSlots,
            judgement.failureModes,
            judgement.discoveries,
        ]
        expect(nullable.some((value) => Array.isArray(value))).toBe(false)
    })
})

describe('buildJudgement', () => {
    it('同一の入力に対して常に同一の結果を返す（AI に依存しない）', () => {
        const answer = buildAnswer([{ country: 'JP', confidence: 'high' }])
        const first = buildJudgement('v1', answer, 'JP')
        const second = buildJudgement('v1', answer, 'JP')
        expect(first).toEqual(second)
    })

    it('v1 を指定すれば v1 判定を返す', () => {
        expect(buildJudgement('v1', buildAnswer([{ country: 'JP', confidence: 'high' }]), 'JP').variant).toBe('v1')
    })

    /**
     * **黙って v1 相当を返してはならない。**
     * コンテキストなしの結果が v2 として記録されると、タスク 26 の対照実験が無効になる。
     */
    it('v2 でコンテキストを渡さなければ例外にする', () => {
        expect(() => buildJudgement('v2', buildAnswer([{ country: 'JP', confidence: 'high' }]), 'JP'))
            .toThrow(/正解タグと用語辞書が必要/)
    })
})
