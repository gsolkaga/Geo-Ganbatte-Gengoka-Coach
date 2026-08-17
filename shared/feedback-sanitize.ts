/**
 * 添削の中身を学習者に見せる前に落とす。**AI の遵守に依存しない。**
 *
 * ## 監査で見つかった 2 件（実測 2026-08-17、13 出題 × 4 モデル = 52 応答）
 *
 * プロンプトに「辞書にある用語のみ」と書いてあるのに守られなかった。
 *
 * ### 1. 辞書に無い用語を教えていた（22 件）
 *
 * 中身は 4 種類に分かれた。
 *
 * ```
 * (a) 欄の名前をそのまま出す      「左側通行」→ traffic_side       gpt-oss 11 件
 * (b) 用語 ID を名前に混ぜる      → EU帯プレート（ai_vehicle_05）  Qwen 5 件
 * (c) 辞書に無い正当な観察        → カーブミラー / シェブロン       4 件
 * (d) 誤った対応づけ              「ガードレール」→ bollard        1 件
 * ```
 *
 * (a) は**用語ではなく欄の名前である。** 覚えても何の役にも立たない。
 * (c) は**辞書側の欠落**であり、AI は悪くない。**辞書に足すべきものである。**
 *
 * ### 2. 視認できない欄を「次に見ろ」と言っていた（6 件）
 *
 * `blindSlots` はコードが算出して**プロンプトに渡している。** それでも指示に出た。
 *
 * > **渡したことと、守られることは別である。**
 *
 * ## 落とす。書き換えない
 *
 * 推測で正しい用語に直したりしない。**落として、落としたことを記録する。**
 * 直すと、モデルが何を言ったのかが分からなくなる。
 */
import type { SlotId } from './slots'

export interface VocabularyEntry {
    learnerWrote: string
    canonicalTerm: string
    note: string
}

export interface SanitizeInput {
    vocabulary: VocabularyEntry[]
    nextPriority: string[]
    /**
     * 使ってよい用語の名前。**空なら検査しない**（v1 は辞書を渡していないため）。
     * 検査しない場合と「1 つも許さない」場合を混ぜない。
     */
    allowedTerms?: readonly string[]
    /** 視認できない欄。**「次に見ろ」と言ってはならない** */
    blindSlots?: readonly SlotId[]
}

export interface SanitizeResult {
    vocabulary: VocabularyEntry[]
    nextPriority: string[]
    /** 落とした用語（辞書に無かったもの）。**辞書追加の候補にもなる** */
    droppedTerms: VocabularyEntry[]
    /** 落とした欄（視認できないもの） */
    droppedSlots: string[]
}

/**
 * 名前を突き合わせるための正規化。
 *
 * `EU帯プレート（ai_vehicle_05）` のように**用語 ID を括弧で添えてくる**ため、
 * 括弧の中を落としてから比べる。実測で Qwen が 5 件このかたちだった。
 *
 * 全角・半角の括弧、スラッシュ区切り（`ai_ground_03／茶色の土`）も扱う。
 * **中身が合っているものを形式で落とさない。**
 */
export function normalizeTermName(name: string): string {
    return name
        // 括弧とその中身を落とす（全角・半角）
        .replace(/[（(][^）)]*[）)]/g, '')
        // スラッシュ区切りは前後どちらかが名前である。両方を候補にするため後段で分ける
        .replace(/\s+/g, '')
        .trim()
}

/** スラッシュ区切りを候補に分ける。`ai_ground_03／茶色の土` → 両方を試す */
function candidates(name: string): string[] {
    const base = normalizeTermName(name)
    const parts = base.split(/[／/]/).map((p) => p.trim()).filter(Boolean)
    return [base, ...parts]
}

export function sanitizeFeedback(input: SanitizeInput): SanitizeResult {
    const blind = new Set<string>(input.blindSlots ?? [])
    const droppedSlots: string[] = []
    const nextPriority = input.nextPriority.filter((slot) => {
        if (!blind.has(slot)) return true
        droppedSlots.push(slot)
        return false
    })

    // 辞書を渡していない場合（v1）は用語の検査をしない
    if (!input.allowedTerms || input.allowedTerms.length === 0) {
        return { vocabulary: input.vocabulary, nextPriority, droppedTerms: [], droppedSlots }
    }

    const allowed = new Map<string, string>()
    for (const name of input.allowedTerms) {
        allowed.set(normalizeTermName(name), name)
    }

    const vocabulary: VocabularyEntry[] = []
    const droppedTerms: VocabularyEntry[] = []
    for (const entry of input.vocabulary) {
        const matched = candidates(entry.canonicalTerm).map((c) => allowed.get(c)).find(Boolean)
        if (matched) {
            // **辞書の表記に揃える。** 括弧つきの表記を学習者に見せない
            vocabulary.push({ ...entry, canonicalTerm: matched })
        }
        else {
            droppedTerms.push(entry)
        }
    }
    return { vocabulary, nextPriority, droppedTerms, droppedSlots }
}

/** 落としたことの説明文。**記録から消さない** */
export function describeSanitized(result: SanitizeResult): string | null {
    const parts: string[] = []
    if (result.droppedTerms.length) {
        parts.push(
            `辞書に無い用語 ${result.droppedTerms.length} 件を落とした`
            + `（${result.droppedTerms.map((t) => t.canonicalTerm).join(' / ')}）`,
        )
    }
    if (result.droppedSlots.length) {
        parts.push(`視認できない欄 ${result.droppedSlots.join(' ')} を「次に見る」から落とした`)
    }
    return parts.length ? parts.join(' / ') : null
}
