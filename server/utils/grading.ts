/**
 * コードによる判定。**AI を使わない。**
 *
 * ## v1 と v2 の境界は「参照できるデータ」だけである
 *
 * v1 で算出できるもの（回答だけから決まる）
 * - 回答国の正誤（候補集合への包含と確信度）
 * - 併記された国の組（混同ペア）
 * - `confident_error` と `aware_of_gap`（確信度の分布から決まる）
 *
 * v2 で算出できるもの（正解タグまたは用語辞書が必要）
 * - 見落とし・別欄記入・視認不能・別ルート正解の切り分け（`slot-diff.ts`）
 * - 絞り込み力・積集合・次に見るべきスロット（`narrowing.ts`）
 * - `observation_miss`・`discrimination_fail`・`knowledge_gap`
 *
 * ## `null` は `[]` と別である
 *
 * `null` は「判定不能」、`[]` は「計算した結果、該当なし」である。
 * 混ぜると v1 の採点が「見落としゼロ」と読める出力になる。**満点に見える誤りが最も悪い。**
 *
 * `failureModes` は一部だけ判定できるが、**v1 では配列全体を `null` にする。**
 * 2 種類だけ入った配列は「診断が済んだ」ように見える。
 */
import type { SlotId } from '../../shared/slots'
import type {
    Answer,
    CodeJudgement,
    Confidence,
    FailureMode,
    SlotRecord,
    Term,
    Variant,
} from '../../shared/types'
import { diffSlots } from './slot-diff'
import type { SlotDiff } from './slot-diff'
import {
    buildIntersection,
    buildNarrowingPower,
    buildNextPriority,
    indexTerms,
} from './narrowing'

/** v2 の判定に必要なデータ。v1 では渡さない */
export interface GradingContext {
    /** 正解タグのスロット */
    tagSlots: SlotRecord
    /** 用語辞書。`data/glossary.json` */
    glossary: Term[]
}

/**
 * 正解が候補集合に含まれるかを判定する（要件 5-1）。
 *
 * 含まれる場合はその候補の確信度も返す。**AI を使わない。**
 */
export function judgeHit(
    candidates: Answer['candidates'],
    answerCountry: string,
): { hit: boolean, hitConfidence: Confidence | null } {
    const target = answerCountry.trim().toUpperCase()
    const found = candidates.find((c) => c.country.toUpperCase() === target)
    return {
        hit: found !== undefined,
        hitConfidence: found?.confidence ?? null,
    }
}

/** 確信度の強い順。比較のためだけに使う */
const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 }

/**
 * **本命として正解に到達したか。** `hit` とは別の判定である。
 *
 * ## なぜ分けたか（実測 `q-kz-01`、2026-08-17）
 *
 * ```
 * 正解     KZ（カザフスタン）
 * 回答     RU(medium)  KZ(low)  KG(low)
 * ```
 *
 * `hit` は `true` になる。正解は候補集合に含まれている。
 * **しかし本命はロシアであり、外している。**
 *
 * この状態を「別ルートで正解した」と扱うと、**ロシアとカザフスタンを
 * 弁別するために必要だった観察を「今回は不要だった」と表示する。**
 * 本人が一番必要としていた助言が消える。
 *
 * ## 判定
 *
 * **正解が、自分が付けた最高確信度の中にあるか。**
 *
 * 3 つ並べて 3 番目の `low` が当たっていたのは「到達」ではない。
 * 逆に `IS(medium) DK(medium)` で正解が `IS` なら、2 択まで詰めて本命に入れている。
 * 絞り切れていないことは `discrimination_fail` が別に報告する。
 */
export function judgeReachedAnswer(
    candidates: Answer['candidates'],
    answerCountry: string,
): boolean {
    if (candidates.length === 0) return false
    const target = answerCountry.trim().toUpperCase()
    const best = Math.min(...candidates.map((c) => CONFIDENCE_RANK[c.confidence]))
    return candidates.some(
        (c) => c.country.toUpperCase() === target && CONFIDENCE_RANK[c.confidence] === best,
    )
}

/**
 * 併記された国の組を列挙する（要件 6-5）。
 *
 * 同一回答内に並べた国は、学習者が区別できていない組である。
 * 順序を正規化して重複を除く。回答だけから算出でき、v1 でも出せる。
 */
export function buildConfusionPairs(
    candidates: Answer['candidates'],
): [string, string][] {
    const codes = [...new Set(candidates.map((c) => c.country.toUpperCase()))].sort()
    const pairs: [string, string][] = []
    for (let i = 0; i < codes.length; i += 1) {
        for (let j = i + 1; j < codes.length; j += 1) {
            pairs.push([codes[i]!, codes[j]!])
        }
    }
    return pairs
}

/**
 * 失敗モードを判定表に従って分類する（`design.md` の表）。**複数該当しうる。**
 *
 * | 条件 | 判定 |
 * |---|---|
 * | 正解タグにある手がかりを見落とした | `observation_miss` |
 * | 不正解かつ最高確信度が `high` | `confident_error` |
 * | 正解が含まれるが確信度が `medium` / `low` | `discrimination_fail` |
 * | 不正解かつ全候補が `low` | `aware_of_gap` |
 * | 観察は正確だが不正解 | `knowledge_gap` |
 *
 * ## `observation_miss` の判定に生の `unknown` を使わない
 *
 * **`diff.missedSlots` を使う。** 生の `unknown` を数えると、視認できないもの
 * （`blindSlots`）・隣接スロットに書いたもの（`filedElsewhere`）・
 * 別ルートで正解したもの（`alternativeRoute`）まで観察漏れになる。
 *
 * それは診断ではなく誤診である。**除外の順序は `slot-diff.ts` が決めている。**
 */
export function buildFailureModes(
    candidates: Answer['candidates'],
    hit: boolean,
    hitConfidence: Confidence | null,
    diff: SlotDiff,
): FailureMode[] {
    const modes = new Set<FailureMode>()
    const confidences = candidates.map((c) => c.confidence)
    const hasHigh = confidences.includes('high')
    const allLow = confidences.length > 0 && confidences.every((c) => c === 'low')

    if (diff.missedSlots.length > 0) modes.add('observation_miss')

    if (!hit && hasHigh) modes.add('confident_error')
    if (!hit && allLow) modes.add('aware_of_gap')

    if (hit && (hitConfidence === 'medium' || hitConfidence === 'low')) {
        modes.add('discrimination_fail')
    }

    // 観察は正確だが国名に結びつかなかった。**見ているのに知らない状態である**
    const observationClean =
        diff.missedSlots.length === 0
        && diff.wrongAbsentSlots.length === 0
        && diff.overclaimedSlots.length === 0
    if (!hit && observationClean) modes.add('knowledge_gap')

    return [...modes]
}

/**
 * 名前のない手がかりを自力で見つけた記録。
 *
 * **コードが出せるのは「両方の `other` に記述がある」という事実だけである。**
 * 同じものを指しているかの解釈は AI に渡す。`filedElsewhere` と同じ設計である。
 *
 * 失敗の診断ではなく発見の記録であるため `failureModes` とは別に持つ。
 */
export function buildDiscoveries(answerSlots: SlotRecord, tagSlots: SlotRecord): string[] {
    const ans = answerSlots.other
    const tag = tagSlots.other
    if (!ans || !tag) return []
    if (ans.state !== 'visible' || tag.state !== 'visible') return []
    const plain = ans.plain?.trim()
    return plain ? [plain] : []
}

/**
 * v1 のコード判定。
 *
 * **正解タグと用語辞書を参照しないため、判定できない項目はすべて `null` にする。**
 * ここで `[]` を返してはならない。「見落としゼロ」に見える出力になる。
 */
export function buildV1Judgement(answer: Answer, answerCountry: string): CodeJudgement {
    const { hit, hitConfidence } = judgeHit(answer.candidates, answerCountry)
    return {
        variant: 'v1',
        hit,
        hitConfidence,
        confusionPairs: buildConfusionPairs(answer.candidates),
        // 以下は正解タグまたは辞書が必要。v1 では判定不能
        discoveries: null,
        missedSlots: null,
        wrongAbsentSlots: null,
        overclaimedSlots: null,
        filedElsewhere: null,
        blindSlots: null,
        alternativeRoute: null,
        failureModes: null,
        narrowingPower: null,
        intersection: null,
        nextPriority: null,
    }
}

/**
 * v2 のコード判定。正解タグと辞書を参照する。
 *
 * 判定の順序が結果を決める。
 *   1. 正誤を先に確定する。**`hit` と「本命として到達したか」を分けて出す**
 *   2. 差分（`slot-diff.ts`）。除外を 3 段で行う
 *   3. 絞り込み（`narrowing.ts`）。`nextPriority` から `blindSlots` を外す
 *   4. 失敗モード。**`diff.missedSlots` を使う。生の `unknown` は使わない**
 */
export function buildV2Judgement(
    answer: Answer,
    answerCountry: string,
    context: GradingContext,
): CodeJudgement {
    const { hit, hitConfidence } = judgeHit(answer.candidates, answerCountry)
    // **`hit` ではなく「本命として到達したか」を渡す。** 低確信度で並べただけの候補を
    // 「別ルートで正解」と数えると、弁別に必要だった観察が「不要」と表示される
    const reachedAnswer = judgeReachedAnswer(answer.candidates, answerCountry)
    const diff = diffSlots(answer.slots, context.tagSlots, reachedAnswer)
    const byId = indexTerms(context.glossary)
    const intersection = buildIntersection(answer.slots, answerCountry, byId)

    return {
        variant: 'v2',
        hit,
        hitConfidence,
        confusionPairs: buildConfusionPairs(answer.candidates),
        discoveries: buildDiscoveries(answer.slots, context.tagSlots),
        missedSlots: diff.missedSlots,
        wrongAbsentSlots: diff.wrongAbsentSlots,
        overclaimedSlots: diff.overclaimedSlots,
        filedElsewhere: diff.filedElsewhere,
        blindSlots: diff.blindSlots,
        alternativeRoute: diff.alternativeRoute,
        failureModes: buildFailureModes(answer.candidates, hit, hitConfidence, diff),
        narrowingPower: buildNarrowingPower(answer.slots, byId),
        intersection: intersection === null
            ? null
            : { countries: intersection.countries, containsAnswer: intersection.containsAnswer },
        // **視認できないスロットを「次に見ろ」と言ってはならない**
        nextPriority: buildNextPriority(
            answer.slots,
            context.tagSlots,
            byId,
            intersection,
            diff.blindSlots as readonly SlotId[],
        ),
    }
}

/**
 * variant に応じたコード判定を返す。
 *
 * **v2 を指定してコンテキストを渡さない呼び出しは失敗させる。**
 * 黙って v1 相当を返すと、コンテキストなしの結果が v2 として記録され、
 * 対照実験（タスク 26）が無効になる。埋めた振りをしない。
 */
export function buildJudgement(
    variant: Variant,
    answer: Answer,
    answerCountry: string,
    context: GradingContext | null = null,
): CodeJudgement {
    if (variant === 'v2') {
        if (context === null) {
            throw new Error(
                'v2 の判定には正解タグと用語辞書が必要である。'
                + 'コンテキストなしで v2 として記録すると v1/v2 比較が無効になる',
            )
        }
        return buildV2Judgement(answer, answerCountry, context)
    }
    return buildV1Judgement(answer, answerCountry)
}
