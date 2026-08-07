/**
 * コードによる判定。**AI を使わない。**
 *
 * このファイルには **v1 でも算出できるもの**だけを置く。
 * - 回答国の正誤（候補集合への包含と確信度）
 * - 併記された国の組（混同ペア）
 *
 * 見落とし判定・失敗モードの分類・絞り込み力・積集合・次に見るべきスロットは
 * **正解タグまたは用語辞書を必要とするため、タスク 23（Phase 3）で実装する。**
 * v1 では算出できないため `null` を返す。
 *
 * `null` は「判定不能」であり `[]`（計算した結果、該当なし）とは別である。
 * 混ぜると v1 の採点が「見落としゼロ」と読める出力になる。
 */
import type {
    Answer,
    CodeJudgement,
    Confidence,
    Variant,
} from '../../shared/types'

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
        failureModes: null,
        narrowingPower: null,
        intersection: null,
        nextPriority: null,
    }
}

/**
 * variant に応じたコード判定を返す。
 *
 * v2 の差分計算（見落とし・失敗モード・積集合）はタスク 23 で実装する。
 * それまで v2 を指定しても v1 と同じ範囲しか算出できないため、
 * **判定不能を `null` として正直に返す。** 埋めた振りをしない。
 */
export function buildJudgement(
    variant: Variant,
    answer: Answer,
    answerCountry: string,
): CodeJudgement {
    const base = buildV1Judgement(answer, answerCountry)
    return { ...base, variant }
}
