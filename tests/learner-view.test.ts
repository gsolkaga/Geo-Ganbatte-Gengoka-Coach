/**
 * `GET /api/questions` の射影のテスト。
 *
 * **採点前に正解が漏れないことを検証する。**
 * `country`・正解タグ・弁別スロット・撮影年月のいずれも学習者に渡してはならない。
 */
import { describe, expect, it } from 'vitest'
import { LEAKING_QUESTION_FIELDS, toLearnerQuestion } from '../server/utils/learner-view'
import { createEmptySlots } from '../shared/slots'
import type { Question } from '../shared/types'

const SECRET_TAG = '上が黒いボラード'

function buildQuestion(): Question {
    const slots = createEmptySlots()
    slots.bollard = { state: 'visible', plain: SECRET_TAG, terms: ['bollard_black_top'] }
    return {
        id: 'q-bg-01',
        panoId: 'CAoSLEFGMVFpcE1vY2tQYW5v',
        fallback: { lat: 42.7, lng: 23.3, heading: 90 },
        country: 'BG',
        region: 'east_europe',
        difficulty: 2,
        copyright: '© Google',
        captureDate: '2023-06',
        slots,
        decisiveSlots: ['bollard'],
        note: 'ルーマニアとの対比に使う',
        source: { draftBy: ['ai'] },
    }
}

describe('toLearnerQuestion', () => {
    const learner = toLearnerQuestion(buildQuestion())

    it('返すのは許可した 5 フィールドだけである', () => {
        expect(Object.keys(learner).sort()).toEqual(
            ['copyright', 'difficulty', 'fallback', 'id', 'panoId'].sort(),
        )
    })

    it.each(LEAKING_QUESTION_FIELDS)('%s を含まない', (field) => {
        expect(field in learner).toBe(false)
    })

    it('正解国が値としても現れない', () => {
        expect(JSON.stringify(learner)).not.toContain('"BG"')
    })

    it('正解タグの記述が値としても現れない', () => {
        expect(JSON.stringify(learner)).not.toContain(SECRET_TAG)
        expect(JSON.stringify(learner)).not.toContain('bollard_black_top')
    })

    it('撮影年月が現れない（撮影年そのものがメタである）', () => {
        expect(JSON.stringify(learner)).not.toContain('2023-06')
    })

    it('表示に必要なものは残る', () => {
        expect(learner.panoId).toBe('CAoSLEFGMVFpcE1vY2tQYW5v')
        // 帰属表記は改変・隠蔽しない
        expect(learner.copyright).toBe('© Google')
        expect(learner.fallback).toEqual({ lat: 42.7, lng: 23.3, heading: 90 })
    })
})
