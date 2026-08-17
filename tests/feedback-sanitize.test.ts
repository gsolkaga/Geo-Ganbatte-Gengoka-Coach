/**
 * 添削の後処理の単体テスト。**AI を使わない。**
 *
 * ## 実測（2026-08-17、13 出題 × 4 モデル = 52 応答）
 *
 * `npm run audit:feedback`（消費 0）で検出した 2 件。
 *
 * | 検出 | 件数 | プロンプトに書いてあったか |
 * |---|---|---|
 * | 辞書に無い用語を教える | **22** | 「辞書にある用語のみ」と書いてある |
 * | 視認できない欄を「次に見ろ」と言う | **6** | `blindSlots` を渡している |
 *
 * > **渡したことと、守られることは別である。**
 */
import { describe, expect, it } from 'vitest'
import {
    describeSanitized,
    normalizeTermName,
    sanitizeFeedback,
} from '../shared/feedback-sanitize'

const v = (learnerWrote: string, canonicalTerm: string) => ({ learnerWrote, canonicalTerm, note: '' })

describe('normalizeTermName', () => {
    /** Qwen が 5 件このかたちだった。**中身は合っているので形式で落とさない** */
    it('括弧で添えられた用語 ID を落とす', () => {
        expect(normalizeTermName('EU帯プレート（ai_vehicle_05）')).toBe('EU帯プレート')
        expect(normalizeTermName('ラテン文字アクセント(ai_script_03)')).toBe('ラテン文字アクセント')
    })

    it('空白を落とす', () => {
        expect(normalizeTermName('  白い 中央線 ')).toBe('白い中央線')
    })

    it('括弧が無ければそのまま', () => {
        expect(normalizeTermName('波形模様の路肩柵')).toBe('波形模様の路肩柵')
    })
})

describe('sanitizeFeedback（用語）', () => {
    const allowedTerms = ['EU帯プレート', '茶色の土', '波形模様の路肩柵']

    it('辞書にある用語は残す', () => {
        const result = sanitizeFeedback({
            vocabulary: [v('左が青いプレート', 'EU帯プレート')],
            nextPriority: [],
            allowedTerms,
        })
        expect(result.vocabulary).toHaveLength(1)
        expect(result.droppedTerms).toEqual([])
    })

    /** **(a) 欄の名前は用語ではない。** gpt-oss が 11 件出した */
    it('欄の名前を落とす', () => {
        const result = sanitizeFeedback({
            vocabulary: [v('左側通行', 'traffic_side'), v('ユーカリの木だらけ', 'terrain_vegetation')],
            nextPriority: [],
            allowedTerms,
        })
        expect(result.vocabulary).toEqual([])
        expect(result.droppedTerms).toHaveLength(2)
    })

    /** **(b) 形式だけの違いは落とさず、辞書の表記に揃える** */
    it('用語 ID を添えた表記を辞書の表記に直す', () => {
        const result = sanitizeFeedback({
            vocabulary: [v('左が青いプレート', 'EU帯プレート（ai_vehicle_05）')],
            nextPriority: [],
            allowedTerms,
        })
        expect(result.vocabulary[0]?.canonicalTerm).toBe('EU帯プレート')
        expect(result.droppedTerms).toEqual([])
    })

    it('スラッシュ区切りでも辞書の表記に直す', () => {
        const result = sanitizeFeedback({
            vocabulary: [v('赤茶色の土', 'ai_ground_03／茶色の土')],
            nextPriority: [],
            allowedTerms,
        })
        expect(result.vocabulary[0]?.canonicalTerm).toBe('茶色の土')
    })

    /**
     * **辞書を渡していない条件（v1）では検査しない。**
     * 「検査しない」と「1 つも許さない」を混ぜると v1 の添削が空になる。
     */
    it('allowedTerms が空なら検査しない（v1 の条件）', () => {
        const result = sanitizeFeedback({
            vocabulary: [v('左側通行', 'traffic_side')],
            nextPriority: [],
        })
        expect(result.vocabulary).toHaveLength(1)
        expect(result.droppedTerms).toEqual([])
    })

    it('allowedTerms が空配列でも検査しない', () => {
        const result = sanitizeFeedback({
            vocabulary: [v('左側通行', 'traffic_side')],
            nextPriority: [],
            allowedTerms: [],
        })
        expect(result.vocabulary).toHaveLength(1)
    })
})

describe('sanitizeFeedback（視認できない欄）', () => {
    it('blindSlots を「次に見る」から落とす', () => {
        const result = sanitizeFeedback({
            vocabulary: [],
            nextPriority: ['traffic_side', 'road_marking', 'season'],
            blindSlots: ['traffic_side', 'season'],
        })
        expect(result.nextPriority).toEqual(['road_marking'])
        expect(result.droppedSlots).toEqual(['traffic_side', 'season'])
    })

    it('順序を保つ', () => {
        const result = sanitizeFeedback({
            vocabulary: [],
            nextPriority: ['pole', 'sign', 'bollard'],
            blindSlots: ['sign'],
        })
        expect(result.nextPriority).toEqual(['pole', 'bollard'])
    })

    it('blindSlots が無ければ何も落とさない', () => {
        const result = sanitizeFeedback({
            vocabulary: [],
            nextPriority: ['pole', 'sign'],
        })
        expect(result.nextPriority).toEqual(['pole', 'sign'])
        expect(result.droppedSlots).toEqual([])
    })

    /** **全部が blind なら空になる。** 空を「助言なし」として出すのが正しい */
    it('全部が視認できなければ空になる', () => {
        const result = sanitizeFeedback({
            vocabulary: [],
            nextPriority: ['sign'],
            blindSlots: ['sign'],
        })
        expect(result.nextPriority).toEqual([])
    })
})

describe('describeSanitized', () => {
    it('落としたものを説明する', () => {
        const result = sanitizeFeedback({
            vocabulary: [v('左側通行', 'traffic_side')],
            nextPriority: ['sign'],
            allowedTerms: ['EU帯プレート'],
            blindSlots: ['sign'],
        })
        const note = describeSanitized(result)
        expect(note).toContain('辞書に無い用語 1 件')
        expect(note).toContain('traffic_side')
        expect(note).toContain('視認できない欄 sign')
    })

    /** **何も落としていなければ何も書かない。** 記録を無駄に汚さない */
    it('落としていなければ null', () => {
        const result = sanitizeFeedback({ vocabulary: [], nextPriority: [] })
        expect(describeSanitized(result)).toBeNull()
    })
})
