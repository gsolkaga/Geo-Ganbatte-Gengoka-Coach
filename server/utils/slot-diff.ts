/**
 * 正解タグと学習者の回答の差分計算（タスク 23 の中核）
 *
 * **AI を使わない。集合演算だけである。**
 *
 * ## 判定の順序が結果を決める
 *
 * 未観察のスロットを「見落とし」と呼ぶ前に、除外すべきものが 3 つある。
 * **順序を変えると、正当な観察を減点することになる。**
 *
 *   1. `blind`          写っているが認識できない → 見落としではない
 *   2. `filedElsewhere` 隣接スロットに書いた     → 見落としではない
 *   3. `alternativeRoute` **本命として正解に到達** → 失敗ではない
 *   4. 残ったものが `missedSlots`
 *
 * 3 は `hit`（候補集合に含まれるか）ではない。**「本命として到達したか」である。**
 * 低い確信度で並べただけの候補を「到達」と数えると、
 * **弁別に必要だった観察を「不要だった」と表示してしまう**（実測 `q-kz-01`）。
 *
 * ## なぜこの順序なのか
 *
 * **見落としとは「見られたのに見なかった」ことである。**
 *
 * 認識できないものは見られない（1）。別の欄に書いたなら見ている（2）。
 * 別ルートで正解したなら、その手がかりは必要なかった（3）。
 *
 * どれも「見られたのに見なかった」に当てはまらない。
 * これを混ぜると**指標が目的と逆を向く**。経過時間の計測を却下したのと同じ型の誤りである。
 */
import { SLOT_IDS, SLOT_NEIGHBORS } from '../../shared/slots'
import type { SlotId } from '../../shared/slots'
import type { SlotRecord } from '../../shared/types'

export interface SlotDiff {
    /** 見られたのに見なかったもの。**ここだけが見落としである** */
    missedSlots: SlotId[]
    /** 写っていないのに「見えない」と正しく判断したのではなく、写っているのに見えないとしたもの */
    wrongAbsentSlots: SlotId[]
    /** 写っていないのに「見えた」としたもの */
    overclaimedSlots: SlotId[]
    /** 隣接スロットに記述があったもの。見落としに数えない */
    filedElsewhere: { slot: SlotId, foundIn: SlotId[] }[]
    /** 視認できないとタグに記録されたもの。見落としに数えない */
    blindSlots: SlotId[]
    /** 正解したときの未観察スロット。失敗ではない */
    alternativeRoute: SlotId[]
}

/** 学習者が何らかの記述を残しているか。`terms` だけでも記述とみなす */
function hasDescription(slots: SlotRecord, slot: SlotId): boolean {
    const e = slots[slot]
    if (!e) return false
    if (e.state !== 'visible') return false
    return Boolean(e.plain?.trim()) || (e.terms?.length ?? 0) > 0
}

/**
 * 差分を計算する。
 *
 * @param answerSlots   学習者の回答
 * @param tagSlots      正解タグ（`recognition` を含む）
 * @param reachedAnswer **本命として正解に到達したか。** `hit`（候補集合に含まれるか）ではない。
 *   実測（`q-kz-01`）で `RU(medium) KZ(low) KG(low)` と並べ、正解は `KZ` だった。
 *   候補には入っているが**本命は外している。** これを「別ルートで正解した」と扱うと、
 *   ロシアとカザフスタンを弁別するために必要だった観察を「不要だった」と表示する。
 *   算出は `server/utils/grading.ts` の `judgeReachedAnswer`。
 */
export function diffSlots(
    answerSlots: SlotRecord,
    tagSlots: SlotRecord,
    reachedAnswer: boolean,
): SlotDiff {
    const missedSlots: SlotId[] = []
    const wrongAbsentSlots: SlotId[] = []
    const overclaimedSlots: SlotId[] = []
    const filedElsewhere: { slot: SlotId, foundIn: SlotId[] }[] = []
    const blindSlots: SlotId[] = []
    const alternativeRoute: SlotId[] = []

    for (const slot of SLOT_IDS) {
        const tag = tagSlots[slot]
        const ans = answerSlots[slot]
        if (!tag || !ans) continue

        // 正解タグが `visible` = その地点に手がかりが写っている
        if (tag.state === 'visible') {
            if (ans.state === 'visible') continue // 見た。問題なし

            // 1. 認識できないものは見られない
            if (tag.recognition === 'blind') {
                blindSlots.push(slot)
                continue
            }

            // 2. 隣接スロットに書いていないか。書いていれば見ている
            const foundIn = (SLOT_NEIGHBORS[slot] ?? []).filter((n) => hasDescription(answerSlots, n))
            if (foundIn.length > 0) {
                filedElsewhere.push({ slot, foundIn: [...foundIn] })
                continue
            }

            // 3. 本命として正解に到達したなら、その手がかりは必要なかった
            if (reachedAnswer) {
                alternativeRoute.push(slot)
                continue
            }

            // 4. 残ったものが見落とし。`absent` と `unknown` を区別する
            if (ans.state === 'absent') wrongAbsentSlots.push(slot)
            else missedSlots.push(slot)
            continue
        }

        // 正解タグが `absent` = 写っていない。それを「見えた」としたら過剰申告
        if (tag.state === 'absent' && ans.state === 'visible') {
            overclaimedSlots.push(slot)
        }

        // 正解タグが `unknown` = **タグ付けが未完了である。** 何も判定しない
        // 判定できないものを判定したことにしない
    }

    return { missedSlots, wrongAbsentSlots, overclaimedSlots, filedElsewhere, blindSlots, alternativeRoute }
}
