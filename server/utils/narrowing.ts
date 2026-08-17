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
 * 1 スロットの記述が示す国の集合。辞書に載る用語がなければ `null`。
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

    const terms = entry.terms.map((id) => byId.get(id)).filter((t): t is Term => t !== undefined)
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
export function buildNextPriority(
    answerSlots: SlotRecord,
    tagSlots: SlotRecord,
    byId: Map<string, Term>,
    current: IntersectionResult | null,
    exclude: readonly SlotId[] = [],
): { slot: SlotId, resultingSize: number }[] {
    const excluded = new Set(exclude)
    const base = current && !current.empty ? new Set(current.countries) : null

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
        rows.push({ slot, resultingSize: resulting.size })
    }

    // 少ない順。同数はスロット定義の順序を保つ（安定ソート）
    return rows.sort((a, b) => a.resultingSize - b.resultingSize)
}
