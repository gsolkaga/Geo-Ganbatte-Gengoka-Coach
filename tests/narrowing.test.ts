/**
 * 絞り込み計算の単体テスト（タスク 23.1）。**AI を使わない。**
 *
 * 固定する性質
 * - Property 8: `narrowingPower[slot]` は該当用語の `countries.length` と等しい
 * - 積集合が空（矛盾）と算出不能（`null`）を混ぜない
 * - `nextPriority` は縮小量の昇順であり、`blind` なスロットを提示しない
 */
import { describe, expect, it } from 'vitest'
import {
    buildIntersection,
    buildNarrowingPower,
    buildNextPriority,
    indexTerms,
} from '../server/utils/narrowing'
import { createEmptySlots } from '../shared/slots'
import type { SlotId } from '../shared/slots'
import type { SlotEntry, SlotRecord, Term } from '../shared/types'

const term = (id: string, slot: SlotId, countries: string[]): Term => ({
    id,
    slot,
    kind: 'atomic',
    certainty: 'verified',
    source: 'human',
    canonical: id,
    plain: id,
    aliases: [],
    countries,
    confusableWith: [],
    requires: null,
    note: null,
    disputed: false,
})

const glossary: Term[] = [
    // キリル文字。粗い（8 カ国）
    term('script_cyrillic', 'script', ['BG', 'BY', 'KG', 'KZ', 'MK', 'RS', 'RU', 'UA']),
    // EU 式ナンバー。単独では広いが、キリルと掛けると絞れる
    term('vehicle_eu_plate', 'vehicle', ['BG', 'DE', 'FR', 'IT', 'RS']),
    // ブルガリア固有のボラード
    term('bollard_bg', 'bollard', ['BG']),
    // 季節。掛けても縮まない（キリル圏を全部含む）
    term('season_snow', 'season', ['BG', 'BY', 'KG', 'KZ', 'MK', 'RS', 'RU', 'UA', 'FI']),
    // 矛盾を作るための用語
    term('pole_africa', 'pole', ['ZA', 'NA']),
]
const byId = indexTerms(glossary)

const seen = (terms: string[]): SlotEntry => ({ state: 'visible', plain: null, terms })

function slotsWith(overrides: Partial<Record<SlotId, SlotEntry>>): SlotRecord {
    return { ...createEmptySlots(), ...overrides } as SlotRecord
}

describe('buildNarrowingPower', () => {
    it('該当用語の countries の件数と一致する（Property 8）', () => {
        const slots = slotsWith({ script: seen(['script_cyrillic']), bollard: seen(['bollard_bg']) })
        expect(buildNarrowingPower(slots, byId)).toEqual({ script: 8, bollard: 1 })
    })

    it('同一スロットに複数の用語があれば積集合の件数になる', () => {
        // キリル文字と EU 式ナンバーを同じスロットに入れた場合の積は BG, RS
        const slots = slotsWith({ script: seen(['script_cyrillic', 'vehicle_eu_plate']) })
        expect(buildNarrowingPower(slots, byId).script).toBe(2)
    })

    /** **0 を入れると「決定的な手がかり」に見える。** 算出不能は項目を作らない */
    it('辞書に載る用語がなければ項目を作らない', () => {
        const slots = slotsWith({
            script: { state: 'visible', plain: '見たことのない文字', terms: [] },
            pole: seen(['辞書にない ID']),
        })
        expect(buildNarrowingPower(slots, byId)).toEqual({})
    })

    it('unknown と absent のスロットは項目を作らない', () => {
        const slots = slotsWith({ pole: { state: 'absent', plain: null, terms: [] } })
        expect(buildNarrowingPower(slots, byId)).toEqual({})
    })
})

describe('buildIntersection', () => {
    it('スロットをまたいだ積集合を返す。弱いメタの組み合わせが強くなる', () => {
        const slots = slotsWith({
            script: seen(['script_cyrillic']),
            vehicle: seen(['vehicle_eu_plate']),
        })
        const result = buildIntersection(slots, 'BG', byId)
        expect(result).not.toBeNull()
        expect(result!.countries).toEqual(['BG', 'RS'])
        expect(result!.containsAnswer).toBe(true)
        expect(result!.empty).toBe(false)
        expect(result!.contributingSlots).toEqual(['script', 'vehicle'])
    })

    it('正解が積集合に含まれなければ containsAnswer が false', () => {
        const slots = slotsWith({ script: seen(['script_cyrillic']) })
        expect(buildIntersection(slots, 'JP', byId)!.containsAnswer).toBe(false)
    })

    /**
     * **空集合は「絞り込めた」ではない。** 辞書か観察のどちらかが誤っている。
     * 1 カ国の延長として扱うと、最も情報のない状態が最強の絞り込みに見える。
     */
    it('矛盾する観察は empty になり、絞り込み成功と区別できる', () => {
        const slots = slotsWith({
            script: seen(['script_cyrillic']),
            pole: seen(['pole_africa']),
        })
        const result = buildIntersection(slots, 'BG', byId)!
        expect(result.countries).toEqual([])
        expect(result.empty).toBe(true)
        expect(result.containsAnswer).toBe(false)
    })

    /** **全 195 カ国を返してはならない。** 絞り込めていないことを候補全部と表現しない */
    it('辞書に載る用語が 1 つもなければ null', () => {
        const slots = slotsWith({ script: { state: 'visible', plain: '謎の文字', terms: [] } })
        expect(buildIntersection(slots, 'BG', byId)).toBeNull()
    })
})

describe('buildNextPriority', () => {
    it('縮小量の昇順で返す。見れば確定するスロットが先に来る', () => {
        const answer = slotsWith({ script: seen(['script_cyrillic']) })
        const tag = slotsWith({
            script: seen(['script_cyrillic']),
            bollard: seen(['bollard_bg']),
            season: seen(['season_snow']),
        })
        const current = buildIntersection(answer, 'BG', byId)
        const rows = buildNextPriority(answer, tag, byId, current)
        expect(rows).toEqual([
            { slot: 'bollard', resultingSize: 1 },
            { slot: 'season', resultingSize: 8 },
        ])
    })

    it('既に観察済みのスロットは提示しない', () => {
        const answer = slotsWith({ script: seen(['script_cyrillic']) })
        const tag = slotsWith({ script: seen(['script_cyrillic']) })
        const current = buildIntersection(answer, 'BG', byId)
        expect(buildNextPriority(answer, tag, byId, current)).toEqual([])
    })

    /** **視認できないスロットを「次に見ろ」と言ってはならない** */
    it('blind なスロットを除外する', () => {
        const answer = createEmptySlots()
        const tag = slotsWith({ bollard: seen(['bollard_bg']), season: seen(['season_snow']) })
        const current = buildIntersection(answer, 'BG', byId)
        const rows = buildNextPriority(answer, tag, byId, current, ['bollard'])
        expect(rows.map((r) => r.slot)).toEqual(['season'])
    })

    it('積集合が算出不能なら正解タグの用語の件数をそのまま返す', () => {
        const answer = createEmptySlots()
        const tag = slotsWith({ bollard: seen(['bollard_bg']), script: seen(['script_cyrillic']) })
        const rows = buildNextPriority(answer, tag, byId, null)
        expect(rows).toEqual([
            { slot: 'bollard', resultingSize: 1 },
            { slot: 'script', resultingSize: 8 },
        ])
    })

    /** 矛盾している状態から「あと 1 つ見れば確定」とは言えない */
    it('積集合が空なら正解タグの件数に戻して提示する', () => {
        const answer = slotsWith({ script: seen(['script_cyrillic']), pole: seen(['pole_africa']) })
        const tag = slotsWith({ bollard: seen(['bollard_bg']) })
        const current = buildIntersection(answer, 'BG', byId)
        expect(current!.empty).toBe(true)
        expect(buildNextPriority(answer, tag, byId, current)).toEqual([
            { slot: 'bollard', resultingSize: 1 },
        ])
    })
})
