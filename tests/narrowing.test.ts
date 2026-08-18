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
    buildNonExhaustiveHints,
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
        const rows = buildNextPriority({ answerSlots: answer, tagSlots: tag, byId, current, answerCountry: 'BG' })
        expect(rows).toEqual([
            { slot: 'bollard', resultingSize: 1 },
            { slot: 'season', resultingSize: 8 },
        ])
    })

    it('既に観察済みのスロットは提示しない', () => {
        const answer = slotsWith({ script: seen(['script_cyrillic']) })
        const tag = slotsWith({ script: seen(['script_cyrillic']) })
        const current = buildIntersection(answer, 'BG', byId)
        expect(buildNextPriority({ answerSlots: answer, tagSlots: tag, byId, current, answerCountry: 'BG' }))
            .toEqual([])
    })

    /** **視認できないスロットを「次に見ろ」と言ってはならない** */
    it('blind なスロットを除外する', () => {
        const answer = createEmptySlots()
        const tag = slotsWith({ bollard: seen(['bollard_bg']), season: seen(['season_snow']) })
        const current = buildIntersection(answer, 'BG', byId)
        const rows = buildNextPriority({
            answerSlots: answer, tagSlots: tag, byId, current, answerCountry: 'BG', exclude: ['bollard'],
        })
        expect(rows.map((r) => r.slot)).toEqual(['season'])
    })

    it('積集合が算出不能なら正解タグの用語の件数をそのまま返す', () => {
        const answer = createEmptySlots()
        const tag = slotsWith({ bollard: seen(['bollard_bg']), script: seen(['script_cyrillic']) })
        const rows = buildNextPriority({ answerSlots: answer, tagSlots: tag, byId, current: null, answerCountry: 'BG' })
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
        expect(buildNextPriority({ answerSlots: answer, tagSlots: tag, byId, current, answerCountry: 'BG' }))
            .toEqual([{ slot: 'bollard', resultingSize: 1 }])
    })

    /**
     * **辞書が正解を含まないなら提示しない。**
     *
     * 実測（2026-08-17）で `nextPriority` が出た 6 件のうち **4 件**が
     * 正解国を含まない集合だった。`q-kz-01` の `road_marking` は 13 カ国で
     * **`KZ` が入っていない**（人手辞書の出典がアメリカ大陸と東南アジアの話だったため）。
     *
     * そのまま出すと「そこを見ろ」と言われた先に正解が無い。
     * **助言が学習者を正解から遠ざける。**
     */
    it('辞書が正解国を含まないスロットは提示しない', () => {
        const answer = createEmptySlots()
        // bollard_bg は BG のみ。正解が KZ なら「見ても KZ に辿り着けない」
        const tag = slotsWith({ bollard: seen(['bollard_bg']), script: seen(['script_cyrillic']) })
        const rows = buildNextPriority({
            answerSlots: answer, tagSlots: tag, byId, current: null, answerCountry: 'KZ',
        })
        // script_cyrillic には KZ が含まれる。bollard_bg には含まれない
        expect(rows).toEqual([{ slot: 'script', resultingSize: 8 }])
    })

    it('大文字小文字と空白を無視して正解国を比較する', () => {
        const answer = createEmptySlots()
        const tag = slotsWith({ bollard: seen(['bollard_bg']) })
        const rows = buildNextPriority({
            answerSlots: answer, tagSlots: tag, byId, current: null, answerCountry: ' bg ',
        })
        expect(rows).toEqual([{ slot: 'bollard', resultingSize: 1 }])
    })
})

/**
 * AI 生成（`unverified`）の用語を絞り込みに使わない（回帰テスト）。
 *
 * ## 実測（2026-08-17）
 *
 * 正規化で 71 件の用語 ID が割り当てられ、**64 件が AI 生成だった。**
 * そして AI 由来の該当国リストは地域が偏っていた。
 *
 * ```
 * ai_road_marking_02「実線（solid line）」 43 カ国
 *   → すべて欧州＋旧ソ連圏。アメリカ大陸とアジアが 1 カ国も無い
 *   → modelCount: 1（単独発言）、disputed: true
 * ```
 *
 * タイの出題で実際にこうなった。
 *
 * ```
 * 中央線が黄色（13 カ国、heuristic）  ∩  白線（94、unverified）  → 13
 *                                    ∩  実線（43、unverified）  → **0**
 * ```
 *
 * さらに `nextPriority` は昇順に並べるため、
 * **矛盾した 0 カ国が「見れば確定する」として最上位に出た。**
 */
describe('unverified な用語を絞り込みに使わない', () => {
    const aiTerm = (id: string, slot: SlotId, countries: string[]): Term => ({
        ...term(id, slot, countries),
        source: 'ai',
        certainty: 'unverified',
        modelCount: 1,
        disputed: true,
    })

    /** 実測を再現した辞書。欧州のみの「実線」が黄色中央線と矛盾する */
    const mixed: Term[] = [
        { ...term('road_marking_center_yellow', 'road_marking', ['US', 'CA', 'TH', 'KH']), certainty: 'heuristic' },
        aiTerm('ai_road_marking_01', 'road_marking', ['US', 'CA', 'TH', 'KH', 'DE', 'FR']),
        aiTerm('ai_road_marking_02', 'road_marking', ['DE', 'FR', 'IT']),
        { ...term('pole_verified', 'pole', ['TH']), certainty: 'verified' },
    ]
    const mixedById = indexTerms(mixed)

    it('unverified を混ぜても矛盾しない（無視するため）', () => {
        const slots = slotsWith({
            road_marking: seen(['road_marking_center_yellow', 'ai_road_marking_01', 'ai_road_marking_02']),
        })
        // 3 つ全部の積集合は 0 カ国になる。**unverified を外せば 4 カ国**
        expect(buildNarrowingPower(slots, mixedById)).toEqual({ road_marking: 4 })
    })

    it('unverified しか無いスロットは算出不能（項目を作らない）', () => {
        const slots = slotsWith({ road_marking: seen(['ai_road_marking_02']) })
        expect(buildNarrowingPower(slots, mixedById)).toEqual({})
    })

    it('積集合も unverified を無視する', () => {
        const slots = slotsWith({
            road_marking: seen(['road_marking_center_yellow', 'ai_road_marking_02']),
            pole: seen(['pole_verified']),
        })
        const result = buildIntersection(slots, 'TH', mixedById)!
        expect(result.empty).toBe(false)
        expect(result.countries).toEqual(['TH'])
        expect(result.containsAnswer).toBe(true)
    })

    /** **これが一番危なかった。矛盾を「まずここを見ろ」と言っていた** */
    it('nextPriority に 0 カ国（矛盾）を出さない', () => {
        const answer = createEmptySlots()
        // 正解タグ側が矛盾している状態を作る（verified 同士でも起こりうる）
        const contradicting: Term[] = [
            { ...term('a1', 'road_marking', ['US']), certainty: 'verified' },
            { ...term('a2', 'road_marking', ['DE']), certainty: 'verified' },
            { ...term('b1', 'pole', ['TH', 'KH']), certainty: 'verified' },
        ]
        const byIdLocal = indexTerms(contradicting)
        const tag = slotsWith({ road_marking: seen(['a1', 'a2']), pole: seen(['b1']) })

        const rows = buildNextPriority({
            answerSlots: answer, tagSlots: tag, byId: byIdLocal, current: null, answerCountry: 'TH',
        })
        // road_marking は 0 カ国なので出さない。pole だけが残る
        expect(rows).toEqual([{ slot: 'pole', resultingSize: 2 }])
    })
})

/**
 * 正解を含まない積集合を出発点にしない（回帰テスト）。
 *
 * ## 実測（2026-08-17、`q-kz-01` の v2 記録）
 *
 * 学習者の積集合は「中央線が黄色」から 13 カ国になったが **`KZ` を含まない。**
 * その 13 カ国を出発点にすると、波形柵（`KZ UZ KG UA`）を掛けて **0 カ国**になり、
 * 0 は矛盾として除外される。**「次に見るべき」が空になった。**
 *
 * > **誤誘導された観察が、正しい助言を消していた。**
 * > 一番助言が必要な状態で助言が出なくなる。最悪の向きの失敗である。
 */
describe('正解を含まない積集合を出発点にしない', () => {
    const kzTerms: Term[] = [
        // 中央線が黄色。事実として正しいが KZ を示さない
        { ...term('road_marking_center_yellow', 'road_marking', ['US', 'CA', 'TH', 'KH']), certainty: 'heuristic' },
        // 波形柵。旧ソ連圏で広く見られる（KZ の弁別子ではないが KZ を含む）
        { ...term('roadside_wavy_fence', 'other', ['KZ', 'UZ', 'KG', 'UA']), certainty: 'heuristic' },
    ]
    const kzById = indexTerms(kzTerms)

    it('積集合が正解を含まないなら正解タグ側の件数に戻して提示する', () => {
        const answer = slotsWith({ road_marking: seen(['road_marking_center_yellow']) })
        const tag = slotsWith({ other: seen(['roadside_wavy_fence']) })
        const current = buildIntersection(answer, 'KZ', kzById)!

        expect(current.countries).toEqual(['CA', 'KH', 'TH', 'US'])
        expect(current.containsAnswer).toBe(false)
        expect(current.empty).toBe(false)

        // 13 カ国を出発点にすると 0 になって消える。出発点を捨てれば other(4) が出る
        const rows = buildNextPriority({
            answerSlots: answer, tagSlots: tag, byId: kzById, current, answerCountry: 'KZ',
        })
        expect(rows).toEqual([{ slot: 'other', resultingSize: 4 }])
    })

    it('積集合が正解を含むなら出発点として使う（縮小が反映される）', () => {
        const answer = slotsWith({ other: seen(['roadside_wavy_fence']) })
        const tag = slotsWith({ script: seen(['script_ua_kz']) })
        const withScript = indexTerms([
            ...kzTerms,
            { ...term('script_ua_kz', 'script', ['UA', 'KZ', 'RU', 'BG']), certainty: 'heuristic' },
        ])
        const current = buildIntersection(answer, 'KZ', withScript)!
        expect(current.containsAnswer).toBe(true)

        // 4 カ国 ∩ 4 カ国 = UA, KZ の 2 カ国。出発点を使っているので 4 ではない
        const rows = buildNextPriority({
            answerSlots: answer, tagSlots: tag, byId: withScript, current, answerCountry: 'KZ',
        })
        expect(rows).toEqual([{ slot: 'script', resultingSize: 2 }])
    })
})

/**
 * 連想（`exhaustive: false`）を絞り込みに使わない（回帰テスト）。
 *
 * ## 実測（2026-08-17、オーストラリアの出題）
 *
 * 人手ワークシート §9 の「道路のすぐ横に木々があると、ブラジル・インドネシア・
 * フィリピンを連想する」を `countries: ['BR','ID','PH']` として持っていた。
 *
 * これは**「次にどこを考えるか」の記録であり、主張ではない。**
 * 積集合に入れたところ、**積集合が 1 カ国（インドネシア）になった。**
 * 正解はオーストラリアである。
 *
 * > **1 カ国に絞れたことは、正解が分かったことではない。**
 *
 * `source` で `human` と `reference` を分けても、
 * **使い方を分けなければ意味がなかった。**
 */
describe('連想を絞り込みに使わない', () => {
    const mixed: Term[] = [
        // 連想。網羅ではない
        {
            ...term('trees_close_to_road', 'terrain_vegetation', ['BR', 'ID', 'PH']),
            certainty: 'heuristic',
            exhaustive: false,
        },
        // 網羅。左側通行の国
        { ...term('ref_traffic_side_left', 'traffic_side', ['AU', 'ID', 'JP', 'GB']), certainty: 'heuristic' },
    ]
    const byIdLocal = indexTerms(mixed)

    it('連想だけのスロットは算出不能', () => {
        const slots = slotsWith({ terrain_vegetation: seen(['trees_close_to_road']) })
        expect(buildNarrowingPower(slots, byIdLocal)).toEqual({})
    })

    /** **これが直したかった挙動である。1 カ国に絞れて、しかも誤りだった** */
    it('連想を混ぜても積集合が誤って 1 カ国にならない', () => {
        const slots = slotsWith({
            terrain_vegetation: seen(['trees_close_to_road']),
            traffic_side: seen(['ref_traffic_side_left']),
        })
        const result = buildIntersection(slots, 'AU', byIdLocal)!
        // 連想を入れると ID の 1 カ国になっていた。外せば 4 カ国で正解を含む
        expect(result.countries).toEqual(['AU', 'GB', 'ID', 'JP'])
        expect(result.containsAnswer).toBe(true)
    })

    it('`exhaustive` が無い項目は網羅として扱う（古い記録を壊さない）', () => {
        const legacy = indexTerms([term('legacy', 'pole', ['AU', 'NZ'])])
        const slots = slotsWith({ pole: seen(['legacy']) })
        expect(buildNarrowingPower(slots, legacy)).toEqual({ pole: 2 })
    })
})

/**
 * `disputed` な用語を絞り込みに使わない（回帰テスト）。
 *
 * `road_marking_center_white` は該当国が `CL` の 1 件しかなく、
 * note に「**この用語は現状ほぼ機能しない。** 欧州の国を埋めるまで保留」と
 * 自分で書いてあった。
 *
 * それを絞り込みに使ったため、`q-ru-01` と `q-za-01` で
 * **「1 カ国（チリ）に絞れる」という誤った計算になった**（実測 2026-08-17）。
 *
 * > **note に書いた警告は守られない。型とコードで守る。**
 */
describe('disputed な用語を絞り込みに使わない', () => {
    const disputedTerms: Term[] = [
        // 保留中の用語。該当国が 1 件しかない
        { ...term('road_marking_center_white', 'road_marking', ['CL']), certainty: 'heuristic', disputed: true },
        { ...term('script_cyrillic_ok', 'script', ['RU', 'KZ', 'BG']), certainty: 'heuristic' },
    ]
    const byIdLocal = indexTerms(disputedTerms)

    it('disputed だけのスロットは算出不能', () => {
        const slots = slotsWith({ road_marking: seen(['road_marking_center_white']) })
        expect(buildNarrowingPower(slots, byIdLocal)).toEqual({})
    })

    /** **「1 カ国に絞れた」という誤った計算をしない** */
    it('積集合が誤って 1 カ国にならない', () => {
        const slots = slotsWith({
            road_marking: seen(['road_marking_center_white']),
            script: seen(['script_cyrillic_ok']),
        })
        const result = buildIntersection(slots, 'RU', byIdLocal)!
        expect(result.countries).toEqual(['BG', 'KZ', 'RU'])
        expect(result.containsAnswer).toBe(true)
    })

    it('disputed を false に戻せば使われる（再開の手続き）', () => {
        const revived = indexTerms([
            { ...term('road_marking_center_white', 'road_marking', ['CL', 'RU', 'DE']), certainty: 'heuristic' },
        ])
        const slots = slotsWith({ road_marking: seen(['road_marking_center_white']) })
        expect(buildNarrowingPower(slots, revived)).toEqual({ road_marking: 3 })
    })
})

/**
 * 網羅でない手がかりを、絞り込みに混ぜずに、しかし捨てずに渡す。
 *
 * 実測（2026-08-18）。オーストラリアの出題でユーカリ（該当国 AU の 1 カ国）が
 * 割り当てられているのに、`combo` は「使える欄 1 / 24 カ国」と出した。
 * **学習者の一番鋭い観察が、応答のどこにも現れていなかった。**
 */
describe('buildNonExhaustiveHints', () => {
    const hintGlossary: Term[] = [
        // 出典もの。ユーカリは AU に多いが PT ES BR にもある
        {
            ...term('ref_flora_eucalyptus', 'terrain_vegetation', ['AU']),
            source: 'reference',
            exhaustive: false,
            sources: ['https://geometas.com/metas/categories/flora/'],
        },
        // 人手の連想。**配らない**
        {
            ...term('trees_close_to_road', 'terrain_vegetation', ['BR', 'ID', 'PH']),
            source: 'human',
            certainty: 'heuristic',
            exhaustive: false,
        },
        // 網羅もの。積集合が扱うのでここには出さない
        { ...term('ref_traffic_side_left', 'traffic_side', ['AU', 'GB', 'JP']), source: 'reference' },
        // AI 生成。網羅でなくても配らない
        {
            ...term('ai_flora_01', 'terrain_vegetation', ['AU', 'NZ']),
            source: 'ai',
            certainty: 'unverified',
            exhaustive: false,
        },
        // 勾配のあるもの
        {
            ...term('ref_tuktuk_roof', 'other', ['PH']),
            source: 'reference',
            exhaustive: false,
            gradient: { axis: 'north_south', note: '北部ほど屋根が高い' },
        },
    ]
    const hintById = indexTerms(hintGlossary)

    it('網羅でない出典ものを示唆として返す。積集合は 24 カ国のままでも消さない', () => {
        const slots = slotsWith({
            terrain_vegetation: seen(['ref_flora_eucalyptus']),
            traffic_side: seen(['ref_traffic_side_left']),
        })
        // 積集合はユーカリを使わない（正しい。ポルトガルを誤って消さないため）
        expect(buildIntersection(slots, 'AU', hintById)!.countries).toEqual(['AU', 'GB', 'JP'])
        // それでも示唆としては残る
        expect(buildNonExhaustiveHints(slots, hintById)).toEqual([
            {
                slot: 'terrain_vegetation',
                termId: 'ref_flora_eucalyptus',
                canonical: 'ref_flora_eucalyptus',
                countries: ['AU'],
                gradient: undefined,
                sources: ['https://geometas.com/metas/categories/flora/'],
            },
        ])
    })

    it('人手の連想は配らない。示唆に出せば積集合から外した理由がそのまま戻ってくる', () => {
        const slots = slotsWith({ terrain_vegetation: seen(['trees_close_to_road']) })
        expect(buildNonExhaustiveHints(slots, hintById)).toEqual([])
    })

    it('AI 生成は網羅でなくても配らない', () => {
        const slots = slotsWith({ terrain_vegetation: seen(['ai_flora_01']) })
        expect(buildNonExhaustiveHints(slots, hintById)).toEqual([])
    })

    it('網羅の用語は示唆に出さない。積集合が扱うので二重に数えない', () => {
        const slots = slotsWith({ traffic_side: seen(['ref_traffic_side_left']) })
        expect(buildNonExhaustiveHints(slots, hintById)).toEqual([])
    })

    it('勾配を持つ用語は軸の説明を添えて返す。断定ではなく傾向として説明させる', () => {
        const slots = slotsWith({ other: seen(['ref_tuktuk_roof']) })
        const hints = buildNonExhaustiveHints(slots, hintById)
        expect(hints).toHaveLength(1)
        expect(hints[0]!.gradient).toEqual({ axis: 'north_south', note: '北部ほど屋根が高い' })
    })

    it('absent や unknown のスロットは見ない', () => {
        const slots = slotsWith({
            terrain_vegetation: { state: 'absent', plain: null, terms: ['ref_flora_eucalyptus'] },
        })
        expect(buildNonExhaustiveHints(slots, hintById)).toEqual([])
    })
})
