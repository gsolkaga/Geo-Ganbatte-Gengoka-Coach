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
import type { SlotRecord, Term } from '../../shared/types'

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
    return term.disputed !== true
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
    if (sets.length === 0) return null

    const result = intersectAll(sets)
    const target = answerCountry.trim().toUpperCase()
    return {
        countries: [...result].sort(),
        containsAnswer: result.has(target),
        empty: result.size === 0,
        contributingSlots,
    }
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
