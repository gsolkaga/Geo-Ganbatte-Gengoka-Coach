/**
 * 失敗モード判定表の単体テスト（タスク 23.1）。**AI を使わない。**
 *
 * `design.md` の表の各行に対応するケースを固定する。
 *
 * ## 最も重要な性質
 *
 * **`observation_miss` は `diff.missedSlots` から決まる。生の `unknown` からではない。**
 *
 * 生の `unknown` を数えると、視認できないもの・隣接スロットに書いたもの・
 * 別ルートで正解したものまで「観察漏れ」と診断してしまう。
 * それは診断ではなく誤診である。
 */
import { describe, expect, it } from 'vitest'
import { buildFailureModes, buildV1Judgement, buildV2Judgement } from '../server/utils/grading'
import { diffSlots } from '../server/utils/slot-diff'
import { createEmptySlots } from '../shared/slots'
import type { SlotId } from '../shared/slots'
import type { Answer, Candidate, SlotEntry, SlotRecord, Term } from '../shared/types'

const visible = (plain: string, extra: Partial<SlotEntry> = {}): SlotEntry => ({
    state: 'visible',
    plain,
    terms: [],
    ...extra,
})

function slotsWith(overrides: Partial<Record<SlotId, SlotEntry>>): SlotRecord {
    return { ...createEmptySlots(), ...overrides } as SlotRecord
}

const cleanDiff = diffSlots(createEmptySlots(), createEmptySlots(), false)

function answerOf(candidates: Candidate[], slots: SlotRecord = createEmptySlots()): Answer {
    return { questionId: 'q-jp-01', slots, candidates, decisiveSlot: null, reasoning: null }
}

describe('buildFailureModes（判定表の各行）', () => {
    it('正解タグにある手がかりを見落としたら observation_miss', () => {
        const diff = diffSlots(createEmptySlots(), slotsWith({ pole: visible('電柱') }), false)
        expect(buildFailureModes([{ country: 'KR', confidence: 'medium' }], false, null, diff))
            .toContain('observation_miss')
    })

    it('不正解かつ最高確信度が high なら confident_error', () => {
        const modes = buildFailureModes([{ country: 'KR', confidence: 'high' }], false, null, cleanDiff)
        expect(modes).toContain('confident_error')
    })

    it('正解が含まれるが確信度が medium なら discrimination_fail', () => {
        const modes = buildFailureModes(
            [{ country: 'KR', confidence: 'high' }, { country: 'JP', confidence: 'medium' }],
            true,
            'medium',
            cleanDiff,
        )
        expect(modes).toContain('discrimination_fail')
    })

    it('正解が含まれて確信度が high なら失敗モードを付けない', () => {
        expect(buildFailureModes([{ country: 'JP', confidence: 'high' }], true, 'high', cleanDiff))
            .toEqual([])
    })

    it('不正解かつ全候補が low なら aware_of_gap', () => {
        const modes = buildFailureModes(
            [{ country: 'KR', confidence: 'low' }, { country: 'CN', confidence: 'low' }],
            false,
            null,
            cleanDiff,
        )
        expect(modes).toContain('aware_of_gap')
        expect(modes).not.toContain('confident_error')
    })

    it('観察は正確だが不正解なら knowledge_gap', () => {
        const modes = buildFailureModes([{ country: 'KR', confidence: 'medium' }], false, null, cleanDiff)
        expect(modes).toContain('knowledge_gap')
        expect(modes).not.toContain('observation_miss')
    })

    it('見落としがあれば knowledge_gap にしない（観察が正確でない）', () => {
        const diff = diffSlots(createEmptySlots(), slotsWith({ pole: visible('電柱') }), false)
        expect(buildFailureModes([{ country: 'KR', confidence: 'medium' }], false, null, diff))
            .not.toContain('knowledge_gap')
    })

    it('複数該当する場合は配列に並べる', () => {
        const diff = diffSlots(createEmptySlots(), slotsWith({ pole: visible('電柱') }), false)
        const modes = buildFailureModes([{ country: 'KR', confidence: 'high' }], false, null, diff)
        expect([...modes].sort()).toEqual(['confident_error', 'observation_miss'])
    })

    /**
     * ここが本アプリの中心である。**正当な観察を観察漏れと呼ばない。**
     */
    it('視認不能・別欄記入・別ルート正解は observation_miss にしない', () => {
        const tag = slotsWith({
            camera: visible('カーメタのアンテナ', { recognition: 'blind' }),
            bollard: visible('黄色いガードレール一体型'),
        })
        const answer = slotsWith({ road_marking: visible('ガードレールが黄色い') })
        const diff = diffSlots(answer, tag, false)

        expect(diff.blindSlots).toEqual(['camera'])
        expect(diff.filedElsewhere).toEqual([{ slot: 'bollard', foundIn: ['road_marking'] }])
        expect(diff.missedSlots).toEqual([])
        expect(buildFailureModes([{ country: 'KR', confidence: 'medium' }], false, null, diff))
            .not.toContain('observation_miss')
    })

    it('正解した場合の未観察は alternativeRoute になり observation_miss にしない', () => {
        const diff = diffSlots(createEmptySlots(), slotsWith({ pole: visible('電柱') }), true)
        expect(diff.alternativeRoute).toEqual(['pole'])
        expect(buildFailureModes([{ country: 'JP', confidence: 'high' }], true, 'high', diff))
            .toEqual([])
    })
})

describe('v1 / v2 の判定不能の扱い', () => {
    /** **`[]` を返すと「見落としゼロ」に読める。** v1 では判定していない */
    it('v1 は正解タグ由来の項目をすべて null にする', () => {
        const j = buildV1Judgement(answerOf([{ country: 'JP', confidence: 'high' }]), 'JP')
        expect(j.missedSlots).toBeNull()
        expect(j.wrongAbsentSlots).toBeNull()
        expect(j.overclaimedSlots).toBeNull()
        expect(j.filedElsewhere).toBeNull()
        expect(j.blindSlots).toBeNull()
        expect(j.alternativeRoute).toBeNull()
        expect(j.failureModes).toBeNull()
        expect(j.narrowingPower).toBeNull()
        expect(j.intersection).toBeNull()
        expect(j.nextPriority).toBeNull()
        expect(j.discoveries).toBeNull()
    })

    it('v1 でも算出できる項目は null にしない', () => {
        const j = buildV1Judgement(
            answerOf([{ country: 'KR', confidence: 'high' }, { country: 'JP', confidence: 'low' }]),
            'JP',
        )
        expect(j.hit).toBe(true)
        expect(j.hitConfidence).toBe('low')
        expect(j.confusionPairs).toEqual([['JP', 'KR']])
    })

    /** v2 は判定した結果として `[]` を返す。**`null` と混ぜない** */
    it('v2 は該当なしを空配列で返す', () => {
        const glossary: Term[] = []
        const j = buildV2Judgement(
            answerOf([{ country: 'JP', confidence: 'high' }]),
            'JP',
            { tagSlots: createEmptySlots(), glossary },
        )
        expect(j.missedSlots).toEqual([])
        expect(j.failureModes).toEqual([])
        expect(j.discoveries).toEqual([])
        expect(j.nextPriority).toEqual([])
        // 辞書に載る用語が 1 つもないため積集合は算出不能
        expect(j.intersection).toBeNull()
        expect(j.narrowingPower).toEqual({})
    })

    it('other スロットが両方 visible なら discoveries に記録する', () => {
        const j = buildV2Judgement(
            answerOf([{ country: 'JP', confidence: 'high' }], slotsWith({ other: visible('ゴミが落ちていない') })),
            'JP',
            { tagSlots: slotsWith({ other: visible('清掃が行き届いている') }), glossary: [] },
        )
        expect(j.discoveries).toEqual(['ゴミが落ちていない'])
    })

    it('正解タグの other が unknown なら discoveries は空', () => {
        const j = buildV2Judgement(
            answerOf([{ country: 'JP', confidence: 'high' }], slotsWith({ other: visible('ゴミが落ちていない') })),
            'JP',
            { tagSlots: createEmptySlots(), glossary: [] },
        )
        expect(j.discoveries).toEqual([])
    })
})
