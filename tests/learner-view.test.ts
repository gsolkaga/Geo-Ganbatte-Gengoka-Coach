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

    it('返すのは許可した 4 フィールドだけである', () => {
        expect(Object.keys(learner).sort()).toEqual(
            ['copyright', 'difficulty', 'id', 'panoId'].sort(),
        )
    })

    it.each(LEAKING_QUESTION_FIELDS)('%s を含まない', (field) => {
        expect(field in learner).toBe(false)
    })

    /**
     * **座標は答えそのものである。**
     *
     * `fallback` を渡していた。`42.7, 23.3` を地図に置けばブルガリアである。
     * 除外リストに 7 件並べてこのテストも通っていたのに、
     * **許可した側が答えを含んでいた**（実測 2026-08-19）。
     */
    it('緯度経度が値として現れない', () => {
        const json = JSON.stringify(learner)
        expect(json).not.toContain('42.7')
        expect(json).not.toContain('23.3')
    })

    it('正解国が値としても現れない', () => {
        expect(JSON.stringify(learner)).not.toContain('"BG"')
    })

    /**
     * **ID には国コードが残っている。**
     *
     * `q-bg-01` の `bg` がそれである。以前の検査は `'"BG"'` という
     * 引用符つき大文字だけを見ていたので、**小文字の `bg` を素通りさせていた。**
     *
     * 付け替えていないのは、記事と `docs/` がこの ID を引用しているためである。
     * 採点へ送り返す取っ手としても要る。
     * **だから画面に出さないことで守っている**（`app/pages/index.vue`）。
     * 不透明な別名にするなら、採点・正規化・記録の読み出しを同時に変える必要がある。
     *
     * > **隠したものの一覧を作っても、残したものの中身は見ていない。**
     */
    it('**ID は国コードを含む。** 画面に出さないことで守っている', () => {
        expect(learner.id.toLowerCase()).toContain('bg')
    })

    it('正解タグの記述が値としても現れない', () => {
        expect(JSON.stringify(learner)).not.toContain(SECRET_TAG)
        expect(JSON.stringify(learner)).not.toContain('bollard_black_top')
    })

    it('撮影年月が現れない（撮影年そのものがメタである）', () => {
        expect(JSON.stringify(learner)).not.toContain('2023-06')
    })

    /**
     * `fallback` を「表示に必要」だと書いていた行を消した。**必要ではなかった。**
     * `StreetViewFrame` と `StreetViewNoMove` は `panoId` だけを受け取り、
     * `heading` も渡していない（`app/pages/index.vue`）。
     *
     * > **テストに書いた前提も、確かめなければ思い込みである。**
     */
    it('表示に必要なものは残る', () => {
        expect(learner.panoId).toBe('CAoSLEFGMVFpcE1vY2tQYW5v')
        // 帰属表記は改変・隠蔽しない
        expect(learner.copyright).toBe('© Google')
        expect(learner.difficulty).toBe(2)
    })
})
