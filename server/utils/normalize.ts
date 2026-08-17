/**
 * 素人語 → 用語 ID の正規化（タスク 22）。
 *
 * ## AI にやらせるのは「対応づけ」だけである
 *
 * 用語の一覧はコードが作る。AI は学習者の記述をその一覧の中から選ぶ。
 * **一覧の外を選べないようにするのはコードの仕事である。** AI の遵守に依存させない。
 *
 * ## 3 つの制約
 *
 * **1. `atomic` のみを候補にする。**
 * `combination`（「白い本体＋黒い帯＋赤い反射板」）を選択肢に出すと、
 * 学習者が「黒い帯」しか書いていないのに赤い反射板の観察が記録される。
 * **まだ見ていないものを見たことにしてしまう。**
 *
 * **2. enum をスロットごとに分ける。**
 * 全 78 語を 1 つの enum にすると、`bollard` の記述に `pole` の ID を選べる。
 * `strict: true` は「enum のいずれか」しか保証せず、**どのスロットかは保証しない。**
 *
 * **3. 「該当なし」（`none`）を必ず含める。**
 * 逃げ道がないと、該当する用語が無い入力に対して誤った ID を強制的に選ばせる。
 * **制約が逆にハルシネーションを生む。**
 *
 * ## 1 リクエストで全スロットを処理する
 *
 * スロットごとに呼ぶと 13 リクエストになる。無償枠はリクエスト数で数えられるため
 * **1 プレイで枠を使い切る。** まとめて 1 回にする。
 */
import { NONE_TERM_ID } from '../../shared/schemas'
import type { AllowedTermsBySlot } from '../../shared/schemas'
import { SLOT_DEFINITION_BY_ID, SLOT_IDS } from '../../shared/slots'
import type { SlotId } from '../../shared/slots'
import type { SlotRecord, Term } from '../../shared/types'

/**
 * 正規化の対象にしないスロット。
 *
 * `other` は「他のどのスロットにも入らない観察の受け皿」であり、
 * **辞書に載っていないことがその存在理由である。** 正規化しない。
 */
export const UNNORMALIZABLE_SLOTS: readonly SlotId[] = ['other']

export const NORMALIZE_SYSTEM_PROMPT = `あなたは観察メモの用語を整える作業者です。判断も採点もしません。

## あなたの仕事
学習者が素人の言葉で書いた観察を読み、渡された用語の一覧から
対応するものを選んで ID を返します。

## 絶対に守ること
1. 一覧にある ID だけを返す。一覧にない ID を作らない。
2. スロットごとに、そのスロットの一覧からだけ選ぶ。他のスロットの ID を混ぜない。
3. 対応する用語が一覧に無い場合は "${NONE_TERM_ID}" を返す。
   **無理に近いものを選ばない。** 該当なしは正しい答えである。
4. 学習者が書いていないことを補わない。推測で用語を足さない。
5. 1 つの記述に複数の用語が対応する場合は複数返す。

## 判断しないこと
- 学習者の観察が正しいかどうかは判断しない
- 国を推測しない
- 助言を書かない`

/** 正規化に使える用語（`atomic` のみ）をスロット別に集める */
export function buildAllowedTerms(glossary: Term[]): Record<string, Term[]> {
    const bySlot: Record<string, Term[]> = {}
    for (const term of glossary) {
        // **combination を候補にしない。** 見ていない部分まで見たことになる
        if (term.kind !== 'atomic') continue
        if (UNNORMALIZABLE_SLOTS.includes(term.slot)) continue
            ; (bySlot[term.slot] ??= []).push(term)
    }
    return bySlot
}

/** 正規化を依頼するスロット。**記述があり、かつ候補が存在するものだけ** */
export function selectTargetSlots(
    slots: SlotRecord,
    allowed: Record<string, Term[]>,
): SlotId[] {
    return SLOT_IDS.filter((id) => {
        if (UNNORMALIZABLE_SLOTS.includes(id)) return false
        const entry = slots[id]
        // 記述がなければ正規化するものがない
        if (!entry || entry.state !== 'visible' || !entry.plain?.trim()) return false
        // 候補が 1 つも無いスロットに「該当なし」を答えさせても意味がない
        return (allowed[id]?.length ?? 0) > 0
    })
}

export function buildAllowedBySlot(
    targets: readonly SlotId[],
    allowed: Record<string, Term[]>,
): AllowedTermsBySlot {
    const result: Record<string, readonly string[]> = {}
    for (const slot of targets) result[slot] = (allowed[slot] ?? []).map((t) => t.id)
    return result
}

/**
 * 応答の JSON Schema。**スロットごとに enum を分ける。**
 *
 * `slots` の件数を `minItems` / `maxItems` で対象スロット数に固定する。
 * `strict: true` は件数を保証しないため、明示しないと一部のスロットが欠ける。
 */
export function buildNormalizeJsonSchema(
    targets: readonly SlotId[],
    allowed: Record<string, Term[]>,
): Record<string, unknown> {
    return {
        type: 'object',
        properties: {
            slots: {
                type: 'array',
                description: '渡されたスロットすべてについて 1 件ずつ返す',
                minItems: targets.length,
                maxItems: targets.length,
                items: {
                    type: 'object',
                    properties: {
                        slot: { type: 'string', enum: [...targets] },
                        terms: {
                            type: 'array',
                            description: `対応する用語 ID。該当なしは ["${NONE_TERM_ID}"]`,
                            minItems: 1,
                            maxItems: 4,
                            items: {
                                type: 'string',
                                enum: [
                                    ...new Set([
                                        ...targets.flatMap((s) => (allowed[s] ?? []).map((t) => t.id)),
                                        NONE_TERM_ID,
                                    ]),
                                ],
                            },
                        },
                    },
                    required: ['slot', 'terms'],
                    additionalProperties: false,
                },
            },
        },
        required: ['slots'],
        additionalProperties: false,
    }
}

/**
 * ユーザープロンプト。**用語の一覧をスロットごとに区切って渡す。**
 *
 * `certainty` は渡さない。正規化は「どの用語に当たるか」の対応づけであり、
 * **その用語が正しいかどうかの判断は含まない。** 混ぜると AI が選択を躊躇する。
 */
export function buildNormalizeUserPrompt(
    slots: SlotRecord,
    targets: readonly SlotId[],
    allowed: Record<string, Term[]>,
): string {
    const sections = targets.map((id) => {
        const definition = SLOT_DEFINITION_BY_ID[id]
        const plain = slots[id]?.plain?.trim() ?? ''
        const options = (allowed[id] ?? [])
            .map((t) => `  - ${t.id}: ${t.canonical}（素人語の言い方: ${t.plain}）`)
            .join('\n')
        return [
            `## ${id}（${definition.label}）`,
            '',
            `学習者の記述: ${plain}`,
            '',
            '選べる用語:',
            options,
        ].join('\n')
    })

    return [
        `以下の ${targets.length} 件のスロットについて、用語 ID を返してください。`,
        `該当する用語が無い場合は "${NONE_TERM_ID}" を返してください。`,
        '',
        ...sections,
    ].join('\n\n')
}

export interface NormalizedSlot {
    slot: SlotId
    /** 辞書内の用語 ID。`none` は含まない */
    terms: string[]
    /** 「該当なし」と判定されたか。辞書追加候補として記録する */
    none: boolean
}

/**
 * AI の応答を確定した形に落とす。
 *
 * `none` を `terms` から取り除き、フラグに移す。
 * **`terms: ['none']` をそのまま保存すると、辞書外の ID が辞書内の ID として流通する。**
 *
 * 応答に含まれなかった対象スロットは「該当なし」として扱う。
 * 欠けたスロットを黙って捨てると、辞書追加候補の記録が漏れる。
 */
export function resolveNormalized(
    targets: readonly SlotId[],
    responseSlots: { slot: SlotId, terms: string[] }[],
): NormalizedSlot[] {
    const bySlot = new Map(responseSlots.map((s) => [s.slot, s.terms]))
    return targets.map((slot) => {
        const raw = bySlot.get(slot) ?? []
        const terms = [...new Set(raw.filter((id) => id !== NONE_TERM_ID))]
        return { slot, terms, none: terms.length === 0 }
    })
}
