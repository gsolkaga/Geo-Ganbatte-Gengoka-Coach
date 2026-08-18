/**
 * 絞り込みの計算（タスク 23 の後半）。**AI を使わない。集合演算だけである。**
 *
 * ## なぜコードでやるのか
 *
 * 正解タグと用語辞書があれば、「そこを見たら候補がどこまで縮むか」は
 * **一意に決まる。** AI に推測させる必要がなく、しかも AI より正確である。
 *
 * AI に残るのは、この計算結果を学習者にとって意味のある言葉に変える部分だけである。
 *
 * ## 空集合を「絞り込めた」と読ませない
 *
 * 積集合が空になるのは、**辞書か観察のどちらかが間違っている**ことを意味する。
 * 「1 カ国に絞れた」の延長として 0 カ国を扱うと、最も情報のない状態が
 * 最も強い絞り込みに見える。`empty` を別に持って区別する。
 */
import type { SlotId } from '../../shared/slots'
import { SLOT_IDS } from '../../shared/slots'
import type { NonExhaustiveHint, SlotRecord, Term } from '../../shared/types'

/** 用語 ID から辞書項目を引く索引 */
export function indexTerms(glossary: Term[]): Map<string, Term> {
    return new Map(glossary.map((t) => [t.id, t]))
}

/**
 * スロット別の絞り込み力（該当国の件数）。
 *
 * **件数が少ないほど強い。** UI 表示は GeoGuessr の語彙（強いメタ／弱いメタ）に
 * 合わせるが、内部では件数のまま持つ（`design.md`）。
 *
 * 1 スロットに複数の用語が挙がった場合は積集合を採る。
 * 同一スロット内の複数観察は互いに矛盾しない前提であり、and で効く。
 */
export function buildNarrowingPower(
    slots: SlotRecord,
    byId: Map<string, Term>,
): Partial<Record<SlotId, number>> {
    const result: Partial<Record<SlotId, number>> = {}
    for (const slot of SLOT_IDS) {
        const countries = countriesForSlot(slots, slot, byId)
        // 辞書に載る用語が 1 つもなければ算出しない。0 を入れると「決定的」に見える
        if (countries === null) continue
        result[slot] = countries.size
    }
    return result
}

/**
 * **絞り込みに使える用語か。`unverified`（AI 生成）は使わない。**
 *
 * ## なぜ外したか（実測 2026-08-17）
 *
 * 正規化で 71 件の用語 ID が割り当てられたが、**64 件が AI 生成（`unverified`）だった。**
 * 人手記述は 27 語しかなく、実際の観察を吸収しきれない。
 *
 * そして AI 由来の該当国リストは**地域が偏っている。**
 *
 * ```
 * ai_road_marking_02「実線（solid line）」  43 カ国
 *   → すべて欧州＋旧ソ連圏。アメリカ大陸とアジアが 1 カ国も無い
 *   → modelCount: 1（単独発言）、disputed: true
 * ```
 *
 * 実線は世界中にある。**1 モデルが言っただけの偏ったリストである。**
 *
 * これを積集合に入れると壊れる。タイの出題で実際に起きた。
 *
 * ```
 * 中央線が黄色（13 カ国、heuristic）   US CA MX BR ... TH KH
 * ∩ 白線（94 カ国、unverified）        → 13 カ国（まだ正しい）
 * ∩ 実線（43 カ国、unverified）        → **0 カ国**
 * ```
 *
 * さらに `nextPriority` は件数の昇順に並べるため、
 * **矛盾した 0 カ国が「見れば確定する」として最上位に出た。**
 *
 * ## 用語の同定と国の絞り込みは別の仕事である
 *
 * AI 由来の用語は**語彙の対応づけには使える**（「白い線」→「白線」）。
 * `narrowingPower` の表示や `vocabulary` の説明には価値がある。
 *
 * **国を絞る計算には使わない。** 材料の確かさが結果の確かさを決める。
 * 除外した結果として算出不能（`null`）になるなら、それが正直な結果である。
 */
function usableForNarrowing(term: Term): boolean {
    if (term.certainty === 'unverified') return false
    /**
     * **`disputed` も使わない。** 不一致が分かっている用語である。
     *
     * `road_marking_center_white` は該当国が `CL` の 1 件しかなく、
     * note に「**この用語は現状ほぼ機能しない。** 欧州の国を埋めるまで保留」と
     * 自分で書いてある。白い中央線は欧州の標準であり、ロシアも南アフリカも該当する。
     *
     * それを絞り込みに使うと、`q-ru-01` と `q-za-01` で
     * **「1 カ国（チリ）に絞れる」という誤った計算になる。**
     *
     * > **note に書いた警告は守られない。型とコードで守る。**
     *
     * 埋めたら `disputed` を `false` に戻す。それが再開の手続きである。
     */
    if (term.disputed === true) return false
    /**
     * **連想は積集合に入れない。** 入れると連想が主張になる。
     *
     * 人手ワークシート §9 の「道路のすぐ横に木々があると、
     * ブラジル・インドネシア・フィリピンを連想する」を積集合に入れたところ、
     * **オーストラリアの出題で積集合が 1 カ国（インドネシア）になった**
     * （実測 2026-08-17）。数字の上では絞れているが、正解ではない。
     *
     * > **1 カ国に絞れたことは、正解が分かったことではない。**
     *
     * `source` で `human` と `reference` を分けても、
     * **使い方を分けなければ意味がなかった。**
     *
     * `exhaustive` が無い古い項目は網羅として扱う（`undefined` を `false` と読まない）。
     */
    return term.exhaustive !== false
}

/**
 * 1 スロットの記述が示す国の集合。絞り込みに使える用語がなければ `null`。
 *
 * `null`（算出不能）と空集合（矛盾）を区別する。`CodeJudgement` で
 * `null` と `[]` を区別しているのと同じ規約である。
 */
function countriesForSlot(
    slots: SlotRecord,
    slot: SlotId,
    byId: Map<string, Term>,
): Set<string> | null {
    const entry = slots[slot]
    if (!entry || entry.state !== 'visible') return null

    const terms = entry.terms
        .map((id) => byId.get(id))
        .filter((t): t is Term => t !== undefined)
        .filter(usableForNarrowing)
    if (terms.length === 0) return null

    return intersectAll(terms.map((t) => new Set(t.countries)))
}

/** 集合の積。空配列は呼ばない前提（呼び出し側で件数を確認する） */
function intersectAll(sets: Set<string>[]): Set<string> {
    let acc = new Set(sets[0] ?? [])
    for (const s of sets.slice(1)) acc = new Set([...acc].filter((c) => s.has(c)))
    return acc
}

export interface IntersectionResult {
    countries: string[]
    /** 正解国が積集合に含まれているか */
    containsAnswer: boolean
    /**
     * 積集合が空になったか。**「絞り込めた」ではない。**
     * 辞書か観察のどちらかが間違っている。
     */
    empty: boolean
    /** 積集合に寄与したスロット。何が効いたかを学習者に示すため */
    contributingSlots: SlotId[]
    /**
     * **否定要素で消した国。** 積集合とは別の成果である。
     *
     * 「絞れた」だけでなく「消せた」を見せる。
     * 設計書 §22 の「否定要素で候補を削除できるプレイヤーを育てる」がこれである。
     */
    excludedCountries?: string[]
    /** 積集合そのものが算出不能で、除外だけが効いている状態 */
    intersectionUnavailable?: boolean
}

/**
 * 学習者が挙げた用語の関連国の積集合。**実際に達成された絞り込みを表す。**
 *
 * 個々には弱いメタでも、積集合は決定的になりうる。
 * （実測：石垣 3 カ国 + 道路幅 → 1 カ国。`data/glossary-human.json`）
 *
 * 辞書に載る用語が 1 つもなければ `null` を返す。全 195 カ国を返してはならない。
 * 「絞り込めていない」を「全部が候補」と表現すると、達成度が水増しされる。
 */
export function buildIntersection(
    slots: SlotRecord,
    answerCountry: string,
    byId: Map<string, Term>,
): IntersectionResult | null {
    const sets: Set<string>[] = []
    const contributingSlots: SlotId[] = []

    for (const slot of SLOT_IDS) {
        const countries = countriesForSlot(slots, slot, byId)
        if (countries === null) continue
        sets.push(countries)
        contributingSlots.push(slot)
    }
    /**
     * **否定要素で引く。** 積集合とは別の仕組みである。
     *
     * `countries`（積集合）は網羅でなければ使えないが、**引き算は使える。**
     * 「スイスは `ß` を使わない」と 1 カ国について分かっていれば、
     * `ß` を使う国の全リストが無くてもスイスを消せる。
     *
     * 設計書（`docs/offline-works/geo_guessr_reasoning_system.md` §4-6）の
     * 「否定要素を見る」である。
     *
     * > **無いと分かっている 1 カ国は、あると分かっている 100 カ国より安い。**
     *
     * `exhaustive: false`（連想）の用語でも `excludes` は有効にする。
     * **「ユーカリがある国の全部」は書けないが「ここには無い」は書ける。**
     */
    const excluded = new Set<string>()
    for (const slot of SLOT_IDS) {
        const entry = slots[slot]
        if (!entry || entry.state !== 'visible') continue
        for (const id of entry.terms) {
            const term = byId.get(id)
            // **除外は網羅を要求しない。** exhaustive を見ない
            if (!term || term.certainty === 'unverified' || term.disputed === true) continue
            for (const code of term.excludes ?? []) excluded.add(code)
        }
    }

    if (sets.length === 0) {
        /**
         * 積集合は作れないが、**除外だけは効いていることがある。**
         * それを捨てると「否定要素で 3 カ国消した」という成果が消える。
         * ただし全 195 カ国から引いた集合は返さない（`design.md`）。
         * ここでは算出不能を返し、**除外の成果は `excludedCountries` で伝える。**
         */
        return excluded.size === 0
            ? null
            : {
                countries: [],
                containsAnswer: false,
                empty: false,
                contributingSlots: [],
                excludedCountries: [...excluded].sort(),
                intersectionUnavailable: true,
            }
    }

    const target = answerCountry.trim().toUpperCase()
    const result = new Set([...intersectAll(sets)].filter((c) => !excluded.has(c)))
    return {
        countries: [...result].sort(),
        containsAnswer: result.has(target),
        empty: result.size === 0,
        contributingSlots,
        excludedCountries: [...excluded].sort(),
        intersectionUnavailable: false,
    }
}

/**
 * **網羅でない用語の示唆。積集合には入れないが、捨てもしない。**
 *
 * ## 一番鋭い観察が、黙って消えていた
 *
 * 実測（2026-08-18、`npm run combo`）。オーストラリアの出題で
 * 学習者は「ユーカリの木だらけ」と書き、正規化は
 * `ref_flora_eucalyptus`（該当国 `AU` の 1 カ国）を割り当てた。
 *
 * それでも到達は **24 カ国**、`使える欄 1` と表示された。
 * ユーカリが `exhaustive: false` であるため `usableForNarrowing` が落としている。
 *
 * 落とすのは正しい。ユーカリはポルトガル・スペイン・ブラジル・南アフリカにもある。
 * 積集合に入れればポルトガルを誤って消す。
 *
 * **しかし完全に消すのも誤りである。** 学習者から見れば、
 * 自分が挙げた最も鋭い手がかりが何の反応も生まなかったことになる。
 *
 * > **絞り込みに使えないことと、言うべきことが無いことは別である。**
 *
 * 正しい応答は絞ることではなく、**言うこと**である。
 *
 * ```
 * ユーカリはオーストラリアで最も多く見られるが、
 * ポルトガル・スペイン・ブラジル・南アフリカにも植林されている。
 * 単独では決められない。他の欄と合わせる。
 * ```
 *
 * それが学習アプリの仕事である。だから絞り込みとは**別枠**で返す。
 * 型を分けておけば、積集合に混ぜる実装は書けない。
 *
 * ## 人手の連想は出さない
 *
 * `source: 'reference'` に限る。人手ワークシート §9 の
 * 「道路のすぐ横に木々があるとブラジル・インドネシア・フィリピンを連想する」は
 * **その人がその地点で何を考えたかの記録**であり、学習者に配る知識ではない。
 *
 * これを示唆として出せば、オーストラリアの出題で
 * 「インドネシアを示唆する」と表示される。積集合から外した理由がそのまま戻ってくる。
 */
export function buildNonExhaustiveHints(
    slots: SlotRecord,
    byId: Map<string, Term>,
): NonExhaustiveHint[] {
    const hints: NonExhaustiveHint[] = []
    for (const slot of SLOT_IDS) {
        const entry = slots[slot]
        if (!entry || entry.state !== 'visible') continue
        for (const id of entry.terms) {
            const term = byId.get(id)
            if (!term) continue
            // 網羅のものは積集合で扱う。ここは網羅でないものだけ
            if (term.exhaustive !== false) continue
            if (term.certainty === 'unverified') continue
            if (term.disputed === true) continue
            // **人手の連想は配らない。** 出典があるものだけ
            if (term.source !== 'reference') continue
            hints.push({
                slot,
                termId: term.id,
                canonical: term.canonical,
                countries: [...term.countries].sort(),
                gradient: term.gradient,
                sources: term.sources,
            })
        }
    }
    return hints
}

/**
 * 次に見るべきスロット。**正解タグと辞書から縮小量を計算する。**
 *
 * 現在の積集合に、未観察スロットの正解タグの用語を掛けたときの残り件数を出す。
 * 件数が少ない順に並べる。少ないほど確定に近い。
 *
 * ```
 * 現在の積集合 = 8 カ国（キリル文字のみ）
 *   vehicle → 1 カ国   ← これを見れば確定する
 *   season  → 8 カ国   ← 見ても絞れない
 * ```
 *
 * **見落としを埋めるためではなく、強いメタから順に探すためである**（`design.md`）。
 *
 * @param exclude 提示から外すスロット。`blindSlots` を渡す。
 *   **視認できないスロットを「次に見ろ」と言ってはならない。**
 */
export interface NextPriorityInput {
    answerSlots: SlotRecord
    tagSlots: SlotRecord
    byId: Map<string, Term>
    current: IntersectionResult | null
    /** 正解国。**辞書が正解を含まないスロットを提示しないために必要である** */
    answerCountry: string
    /** 提示から外すスロット。`blindSlots` を渡す */
    exclude?: readonly SlotId[]
}

export function buildNextPriority(
    input: NextPriorityInput,
): { slot: SlotId, resultingSize: number }[] {
    const { answerSlots, tagSlots, byId, current, answerCountry, exclude = [] } = input
    const excluded = new Set(exclude)
    /**
     * **正解を含まない積集合を出発点にしてはならない。**
     *
     * 実測（2026-08-17、`q-kz-01` の v2 記録）。学習者の積集合は
     * 「中央線が黄色」から 13 カ国になったが、**`KZ` が入っていない**
     * （その観察は事実だが国を示さない。`docs/v2-kz.md` 章 3）。
     *
     * その 13 カ国を出発点にすると、波形柵（`KZ UZ KG UA`）を掛けても **0 カ国**になり、
     * 0 は矛盾として除外される。結果、**「次に見るべき」が空になった。**
     *
     * ```
     * 出発点 13 カ国（KZ なし） ∩ other 4 カ国（KZ あり） = 0 → 除外 → 助言が消える
     * ```
     *
     * つまり**誤誘導された観察が、正しい助言を消していた。**
     * 一番助言が必要な状態で助言が出なくなる。**最悪の向きの失敗である。**
     *
     * 正解を含まない積集合は、そこから足し算を続けても正解に届かない。
     * **出発点を捨てて、正解タグ側の件数に戻す**（矛盾（`empty`）と同じ扱い）。
     */
    const usableBase = current !== null && !current.empty && current.containsAnswer
    const base = usableBase ? new Set(current.countries) : null
    const target = answerCountry.trim().toUpperCase()

    const rows: { slot: SlotId, resultingSize: number }[] = []
    for (const slot of SLOT_IDS) {
        if (excluded.has(slot)) continue
        // 既に観察して辞書に載る用語を挙げているスロットは「次に見る」対象ではない
        if (countriesForSlot(answerSlots, slot, byId) !== null) continue

        const tagCountries = countriesForSlot(tagSlots, slot, byId)
        if (tagCountries === null) continue

        const resulting = base === null
            ? tagCountries
            : new Set([...base].filter((c) => tagCountries.has(c)))

        /**
         * **0 カ国は「見れば確定する」ではない。矛盾である。**
         *
         * 並べ替えは件数の昇順なので、**0 を残すと最上位に来る。**
         * 実測（2026-08-17、タイの出題）で `road_marking(0)` が
         * 最優先として提示された。矛盾しているスロットを
         * 「まずここを見ろ」と言うことになる。
         *
         * 矛盾は絞り込みの成果ではないので、優先順位から外す。
         * 原因は辞書側にあり、学習者に見せる情報ではない。
         */
        if (resulting.size === 0) continue

        /**
         * **正解を含まない集合を「そこを見れば絞れる」と言ってはならない。**
         *
         * 実測（2026-08-17）で、`nextPriority` が出た 6 件のうち **4 件**が
         * 正解国を含まない集合だった。
         *
         * ```
         * q-kz-01（正解 KZ）road_marking → 13 カ国。**KZ が入っていない**
         *   正解タグは「中央線は黄色の実線」だが、人手辞書の
         *   road_marking_center_yellow の 13 カ国はアメリカ大陸と東南アジアだけ
         *   （出典がその地域の話だったため）
         * ```
         *
         * **辞書が不完全なのであり、学習者の誤りではない。**
         * そのまま出すと「そこを見ろ」と言われた先に正解が無い。
         * **助言が学習者を正解から遠ざける。**
         *
         * 正解タグを持っているのだから、この矛盾はコードで検出できる。
         * 検出できるものを提示してはならない。
         */
        if (!resulting.has(target)) continue

        rows.push({ slot, resultingSize: resulting.size })
    }

    // 少ない順。同数はスロット定義の順序を保つ（安定ソート）
    return rows.sort((a, b) => a.resultingSize - b.resultingSize)
}
