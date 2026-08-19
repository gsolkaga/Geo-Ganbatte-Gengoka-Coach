/**
 * 正解タグの保存前検証。**純関数にしてテストする。**
 *
 * 画面にもサーバにも同じ規則を使わせる。片方だけに書くと必ずずれる
 * （`slotEntrySchema` を画面と検証の両方に効かせているのと同じ考え）。
 *
 * ## 誤りと警告を分ける
 *
 * 保存を止めるべきものと、**人間に知らせるだけで良いもの**は違う。
 * 全部を誤りにすると、埋まっていない用語 ID のせいで
 * タグ付けが 1 件も保存できなくなる（用語は後から `normalize:keys` で埋める運用がある）。
 *
 * > **止めるべきものだけを止める。** 残りは見せて人間に決めさせる。
 */
import { SLOT_DEFINITIONS, SLOT_IDS } from './slots'
import type { SlotId } from './slots'
import type { SlotRecord } from './types'

export interface AnswerKeyIssues {
    /** これがあると保存しない */
    errors: string[]
    /** 保存はするが画面に出す */
    warnings: string[]
}

export interface TermLookup {
    /** 用語 ID → その用語が属するスロット。辞書に無い ID は `undefined` */
    slotOf: (termId: string) => SlotId | undefined
}

const labelOf = new Map(SLOT_DEFINITIONS.map((d) => [d.id, d.label]))

function name(slot: SlotId): string {
    return `${labelOf.get(slot) ?? slot}（\`${slot}\`）`
}

/**
 * 保存できるかを判定する。
 *
 * @param slots 14 スロット
 * @param decisiveSlots 候補を弁別できるスロット
 * @param lookup 用語 ID の所属スロットを引く
 */
export function validateAnswerKey(
    slots: SlotRecord,
    decisiveSlots: SlotId[],
    lookup: TermLookup,
): AnswerKeyIssues {
    const errors: string[] = []
    const warnings: string[] = []

    // --- 未確認を残して保存させない（要件 7-4, 7-5） ---
    const unconfirmed = SLOT_IDS.filter((id) => slots[id]?.confirmed !== true)
    if (unconfirmed.length) {
        errors.push(
            `未確認のスロットが ${unconfirmed.length} 件ある: ${unconfirmed.map(name).join('、')}`,
        )
    }

    for (const id of SLOT_IDS) {
        const entry = slots[id]
        if (!entry) {
            errors.push(`${name(id)} が欠けている`)
            continue
        }

        if (entry.state === 'visible') {
            // 写っていると判断したなら、何が見えたかを書く。空欄では突き合わせられない
            if (!entry.plain || entry.plain.trim() === '') {
                errors.push(`${name(id)} は「見えた」なのに記述が空である`)
            }

            /**
             * **視認可能性は既定を置かない**（`SlotEntry.recognition` の注記）。
             * 未設定のまま保存すると「確認していない」が「見えるはず」に化けて、
             * タグ付けの手抜きが学習者の失敗として表示される。
             */
            if (!entry.recognition) {
                errors.push(`${name(id)} の視認可能性（見やすさ）が未設定である`)
            }

            if (entry.terms.length === 0) {
                warnings.push(
                    `${name(id)} に用語 ID が無い（絞り込みに使えない。`
                    + `\`npm run normalize:keys\` で埋めるか、手で選ぶ）`,
                )
            }
        }
        else {
            // 写っていない・見ていないものに記述と用語 ID は付かない
            if (entry.plain) errors.push(`${name(id)} は「見えた」でないのに記述がある`)
            if (entry.terms.length) errors.push(`${name(id)} は「見えた」でないのに用語 ID がある`)
        }

        // --- 用語 ID は辞書にあり、かつそのスロットのものであること ---
        for (const termId of entry.terms) {
            const owner = lookup.slotOf(termId)
            if (!owner) {
                errors.push(`${name(id)} の用語 ID が辞書に無い: \`${termId}\``)
                continue
            }
            if (owner !== id) {
                // 別スロットの用語を入れると、絞り込みの集合演算が別の軸を掛けてしまう
                errors.push(
                    `${name(id)} に別のスロットの用語が入っている: \`${termId}\` は ${name(owner)} のもの`,
                )
            }
        }
    }

    // --- 決め手スロット ---
    const seen = new Set<string>()
    for (const slot of decisiveSlots) {
        if (!SLOT_IDS.includes(slot)) {
            errors.push(`決め手に不正なスロットが入っている: \`${slot}\``)
            continue
        }
        if (seen.has(slot)) errors.push(`決め手が重複している: ${name(slot)}`)
        seen.add(slot)

        const entry = slots[slot]
        if (entry && entry.state !== 'visible') {
            errors.push(`決め手は「見えた」スロットから選ぶ: ${name(slot)} は「見えた」でない`)
        }
        if (entry?.state === 'visible' && entry.recognition === 'blind') {
            // 認識できないものを「これが決め手だった」と教えても学習者は次に活かせない
            warnings.push(`決め手が認識できないスロットである: ${name(slot)} は \`blind\``)
        }
    }

    if (decisiveSlots.length === 0) {
        warnings.push('決め手のスロットが 1 件も無い（フィードバックで弁別の指示ができない）')
    }

    return { errors, warnings }
}

/** 埋まり具合。画面の一覧に出す */
export function answerKeyProgress(slots: SlotRecord): {
    confirmed: number
    visible: number
    withTerms: number
    total: number
} {
    let confirmed = 0
    let visible = 0
    let withTerms = 0
    for (const id of SLOT_IDS) {
        const entry = slots[id]
        if (!entry) continue
        if (entry.confirmed === true) confirmed += 1
        if (entry.state === 'visible') {
            visible += 1
            if (entry.terms.length > 0) withTerms += 1
        }
    }
    return { confirmed, visible, withTerms, total: SLOT_IDS.length }
}
