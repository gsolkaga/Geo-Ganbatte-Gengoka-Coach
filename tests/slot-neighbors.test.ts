import { describe, expect, it } from 'vitest'
import { SLOT_IDS, SLOT_NEIGHBORS } from '../shared/slots'

/**
 * 隣接スロットの定義を固定する。
 *
 * **訓練しているのは観察であって分類ではない。**
 * 同じ観察が 2 つのスロットに入りうるなら、「そのスロットを見落とした」という
 * 判定は誤りになる。実測（2026-08-10）で `bollard` に「ガードレールが黄色い」と
 * 記入された。ガードレールとボラードは一体化することがあり、正当な観察である。
 *
 * 手で書いた隣接表は非対称になりやすいので、対称性を機械的に守る。
 */
describe('SLOT_NEIGHBORS', () => {
    it('全スロットが登録されている', () => {
        expect(Object.keys(SLOT_NEIGHBORS).sort()).toEqual([...SLOT_IDS].sort())
    })

    it('対称である（A の隣に B なら B の隣に A）', () => {
        for (const id of SLOT_IDS) {
            for (const neighbor of SLOT_NEIGHBORS[id]) {
                expect(
                    SLOT_NEIGHBORS[neighbor],
                    `${neighbor} の隣接に ${id} がない（非対称）`,
                ).toContain(id)
            }
        }
    })

    it('自分自身を隣接に含まない', () => {
        for (const id of SLOT_IDS) {
            expect(SLOT_NEIGHBORS[id]).not.toContain(id)
        }
    })

    it('重複がない', () => {
        for (const id of SLOT_IDS) {
            const list = SLOT_NEIGHBORS[id]
            expect(new Set(list).size).toBe(list.length)
        }
    })

    it('存在しないスロット ID を含まない', () => {
        for (const id of SLOT_IDS) {
            for (const neighbor of SLOT_NEIGHBORS[id]) {
                expect(SLOT_IDS).toContain(neighbor)
            }
        }
    })

    /**
     * 隣接を増やすほど「見落とし」の検出力が落ちる。
     * 根拠のない隣接は害になるため、規模に上限を設けて歯止めにする。
     */
    it('隣接が過剰でない（1 スロットあたり 4 件以下）', () => {
        for (const id of SLOT_IDS) {
            expect(SLOT_NEIGHBORS[id].length, `${id} の隣接が多すぎる`).toBeLessThanOrEqual(4)
        }
    })

    it('実測で確認された組が入っている', () => {
        // ガードレール一体型のボラードが路面まわりに書かれた実測ケース
        expect(SLOT_NEIGHBORS.bollard).toContain('road_marking')
        // 入力時に迷うと明言された路面まわり
        expect(SLOT_NEIGHBORS.road_marking).toContain('pavement')
        expect(SLOT_NEIGHBORS.pavement).toContain('ground')
    })

    it('根拠のない遠い組は入っていない', () => {
        expect(SLOT_NEIGHBORS.traffic_side).not.toContain('script')
        expect(SLOT_NEIGHBORS.architecture).not.toContain('bollard')
        // other は「まだ言語化されていない観察の受け皿」であり、隣接を持たない
        expect(SLOT_NEIGHBORS.other).toEqual([])
    })
})
