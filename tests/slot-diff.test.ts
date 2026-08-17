import { describe, expect, it } from 'vitest'
import { diffSlots } from '../server/utils/slot-diff'
import { createEmptySlots } from '../shared/slots'
import type { SlotId } from '../shared/slots'
import type { SlotEntry, SlotRecord } from '../shared/types'

/**
 * 差分計算の判定順序を固定する。
 *
 * **順序を変えると、正当な観察を減点することになる。**
 *
 *   blind → filedElsewhere → alternativeRoute → missedSlots
 *
 * 見落としとは「見られたのに見なかった」ことである。
 * 認識できない・別欄に書いた・正解した、はどれも当てはまらない。
 */

const visible = (plain: string, extra: Partial<SlotEntry> = {}): SlotEntry => ({
    state: 'visible',
    plain,
    terms: [],
    ...extra,
})

function slotsWith(overrides: Partial<Record<SlotId, SlotEntry>>): SlotRecord {
    return { ...createEmptySlots(), ...overrides } as SlotRecord
}

describe('diffSlots', () => {
    it('見て書いていれば何も出ない', () => {
        const tag = slotsWith({ script: visible('ハングル') })
        const ans = slotsWith({ script: visible('ハングルっぽい文字') })
        const d = diffSlots(ans, tag, true)
        expect(d.missedSlots).toEqual([])
        expect(d.alternativeRoute).toEqual([])
    })

    it('未観察かつ不正解なら見落とし', () => {
        const tag = slotsWith({ pole: visible('コンクリート電柱') })
        const d = diffSlots(createEmptySlots(), tag, false)
        expect(d.missedSlots).toEqual(['pole'])
    })

    /** 1 番目の除外。認識できないものは見られない */
    it('recognition が blind なら見落としにしない', () => {
        const tag = slotsWith({ camera: visible('Gen4', { recognition: 'blind' }) })
        const d = diffSlots(createEmptySlots(), tag, false)
        expect(d.blindSlots).toEqual(['camera'])
        expect(d.missedSlots).toEqual([])
    })

    it('recognition が hard なら見落としにする（探せば見えるため）', () => {
        const tag = slotsWith({ camera: visible('Gen4', { recognition: 'hard' }) })
        const d = diffSlots(createEmptySlots(), tag, false)
        expect(d.missedSlots).toEqual(['camera'])
        expect(d.blindSlots).toEqual([])
    })

    it('recognition の未記録を easy として扱わない（見落としの判定は行う）', () => {
        const tag = slotsWith({ pole: visible('電柱') })
        const d = diffSlots(createEmptySlots(), tag, false)
        // 未記録では blind と判断できないため、見落としとして扱う
        expect(d.missedSlots).toEqual(['pole'])
    })

    /** 2 番目の除外。別の欄に書いたなら見ている */
    it('隣接スロットに記述があれば見落としにしない', () => {
        // bollard の情報を road_marking に書いた実測ケース
        const tag = slotsWith({ bollard: visible('黄色いガードレール一体型') })
        const ans = slotsWith({ road_marking: visible('ガードレールが黄色い') })
        const d = diffSlots(ans, tag, false)
        expect(d.filedElsewhere).toEqual([{ slot: 'bollard', foundIn: ['road_marking'] }])
        expect(d.missedSlots).toEqual([])
    })

    it('隣接でないスロットに記述があっても見落としのまま', () => {
        const tag = slotsWith({ bollard: visible('白い杭') })
        // architecture は bollard の隣接ではない
        const ans = slotsWith({ architecture: visible('レンガの家') })
        const d = diffSlots(ans, tag, false)
        expect(d.filedElsewhere).toEqual([])
        expect(d.missedSlots).toEqual(['bollard'])
    })

    it('blind は隣接判定より先に効く', () => {
        const tag = slotsWith({ bollard: visible('見えない杭', { recognition: 'blind' }) })
        const ans = slotsWith({ road_marking: visible('ガードレールが黄色い') })
        const d = diffSlots(ans, tag, false)
        expect(d.blindSlots).toEqual(['bollard'])
        expect(d.filedElsewhere).toEqual([])
    })

    /** 3 番目の除外。別ルートで正解したなら失敗ではない */
    it('正解していれば未観察は alternativeRoute になる', () => {
        const tag = slotsWith({ pole: visible('電柱'), bollard: visible('杭') })
        const d = diffSlots(createEmptySlots(), tag, true)
        expect(d.alternativeRoute.sort()).toEqual(['bollard', 'pole'])
        expect(d.missedSlots).toEqual([])
        expect(d.wrongAbsentSlots).toEqual([])
    })

    it('不正解なら alternativeRoute にしない', () => {
        const tag = slotsWith({ pole: visible('電柱') })
        const d = diffSlots(createEmptySlots(), tag, false)
        expect(d.alternativeRoute).toEqual([])
        expect(d.missedSlots).toEqual(['pole'])
    })

    /** absent と unknown を混ぜない。本アプリの中心的な規約 */
    it('写っているのに absent とした場合は wrongAbsent に入る', () => {
        const tag = slotsWith({ sign: visible('三角形の標識') })
        const ans = slotsWith({ sign: { state: 'absent', plain: null, terms: [] } })
        const d = diffSlots(ans, tag, false)
        expect(d.wrongAbsentSlots).toEqual(['sign'])
        expect(d.missedSlots).toEqual([])
    })

    it('unknown は missedSlots に入り wrongAbsent には入らない', () => {
        const tag = slotsWith({ sign: visible('三角形の標識') })
        const d = diffSlots(createEmptySlots(), tag, false)
        expect(d.missedSlots).toEqual(['sign'])
        expect(d.wrongAbsentSlots).toEqual([])
    })

    it('写っていないのに見えたとしたら過剰申告', () => {
        const tag = slotsWith({ bollard: { state: 'absent', plain: null, terms: [] } })
        const ans = slotsWith({ bollard: visible('白い杭があった') })
        const d = diffSlots(ans, tag, false)
        expect(d.overclaimedSlots).toEqual(['bollard'])
    })

    /**
     * タグが unknown = タグ付けが未完了。**判定できないものを判定しない。**
     * ここを見落としに数えると、タグ付けの手抜きが学習者の失敗に見える。
     */
    it('正解タグが unknown のスロットは何も判定しない', () => {
        const tag = createEmptySlots() // すべて unknown
        const ans = slotsWith({ script: visible('ハングル') })
        const d = diffSlots(ans, tag, false)
        expect(d.missedSlots).toEqual([])
        expect(d.overclaimedSlots).toEqual([])
        expect(d.wrongAbsentSlots).toEqual([])
    })

    it('terms だけでも記述とみなす（正規化済みで plain が空の場合）', () => {
        const tag = slotsWith({ bollard: visible('杭') })
        const ans = slotsWith({
            road_marking: { state: 'visible', plain: null, terms: ['road_marking_center_yellow'] },
        })
        const d = diffSlots(ans, tag, false)
        expect(d.filedElsewhere).toEqual([{ slot: 'bollard', foundIn: ['road_marking'] }])
    })

    it('隣接スロットが absent なら記述とみなさない', () => {
        const tag = slotsWith({ bollard: visible('杭') })
        const ans = slotsWith({ road_marking: { state: 'absent', plain: null, terms: [] } })
        const d = diffSlots(ans, tag, false)
        expect(d.filedElsewhere).toEqual([])
        expect(d.missedSlots).toEqual(['bollard'])
    })
})
