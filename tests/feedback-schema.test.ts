/**
 * 採点応答の意味の検証（回帰テスト）。
 *
 * ## なぜこのテストがあるか
 *
 * `json_schema` + `strict: true` は**型しか守らせない。**
 * 実測（2026-08-17、4 モデル同時採点）で 2 件の違反が出た。
 *
 *   1. `Kimi` が `discriminationHint` に **4 文字の文字列 `"null"`** を入れた
 *   2. `nextPriority` の形式が 4 モデルで揃わなかった（自由文字列にしていたため）
 *
 * どちらもスキーマは通り、Zod も通り、`status` は `ok` になり、画面に出た。
 *
 * > **意味の検証はコードの仕事である。**
 *
 * 同じ形の失敗が 3 回目である（1 回目は件数、2 回目は `confusableWith` に国コード）。
 */
import { describe, expect, it } from 'vitest'
import { feedbackSchema } from '../shared/schemas'

const base = {
    summary: 'まとめ',
    failureModeExplanation: '',
    missedClues: [],
    wrongReasoning: [],
    vocabulary: [],
    discoveries: [],
    judgmentUnavailable: true,
}

describe('discriminationHint の「値が無い」表現', () => {
    /** **これが実測で返ってきた値である** */
    it('文字列 "null" を空にする', () => {
        expect(feedbackSchema.parse({ ...base, discriminationHint: 'null' }).discriminationHint).toBe('')
    })

    it('undefined / none / N/A / 空白も空にする', () => {
        for (const value of ['undefined', 'none', 'N/A', '   ', 'NULL']) {
            expect(feedbackSchema.parse({ ...base, discriminationHint: value }).discriminationHint).toBe('')
        }
    })

    it('項目自体が無い場合も空にする', () => {
        expect(feedbackSchema.parse(base).discriminationHint).toBe('')
    })

    /** **本文を消してはならない。** 「null」を含む正当な文章もありうる */
    it('中身のある文章は残す', () => {
        const text = '候補が複数あるため bollard の断面を見て区別する'
        expect(feedbackSchema.parse({ ...base, discriminationHint: text }).discriminationHint).toBe(text)
    })
})

describe('nextPriority はスロット ID に限る', () => {
    it('スロット ID はそのまま通す', () => {
        const parsed = feedbackSchema.parse({
            ...base,
            nextPriority: ['traffic_side', 'road_marking', 'sign'],
        })
        expect(parsed.nextPriority).toEqual(['traffic_side', 'road_marking', 'sign'])
    })

    /** gpt-oss の実測。**ID に説明を混ぜてきた** */
    it('説明が混ざったものを捨てる', () => {
        const parsed = feedbackSchema.parse({
            ...base,
            nextPriority: [
                'traffic_side（走行側）――日本は左側通行なので、道路の左側に車が走っているかを確認。',
                'road_marking',
            ],
        })
        expect(parsed.nextPriority).toEqual(['road_marking'])
    })

    /** Kimi の実測。**1 要素に全部詰めてきた** */
    it('文章 1 件だけの場合は空になる', () => {
        const parsed = feedbackSchema.parse({
            ...base,
            nextPriority: ['次の地点ではtraffic_side、road_marking、pole、sign、vehicleを優先的に確認してください。'],
        })
        expect(parsed.nextPriority).toEqual([])
    })

    it('前後の空白を許す', () => {
        expect(feedbackSchema.parse({ ...base, nextPriority: [' pole '] }).nextPriority).toEqual(['pole'])
    })

    it('重複を除く', () => {
        expect(feedbackSchema.parse({ ...base, nextPriority: ['pole', 'pole', 'sign'] }).nextPriority)
            .toEqual(['pole', 'sign'])
    })

    /** 3 件までに絞る。**優先順位は絞らないと意味がない** */
    it('4 件以上は先頭 3 件にする', () => {
        const parsed = feedbackSchema.parse({
            ...base,
            nextPriority: ['pole', 'sign', 'script', 'vehicle', 'camera'],
        })
        expect(parsed.nextPriority).toEqual(['pole', 'sign', 'script'])
    })

    it('存在しないスロット ID を捨てる', () => {
        expect(feedbackSchema.parse({ ...base, nextPriority: ['bollards', 'street_light'] }).nextPriority)
            .toEqual([])
    })

    /** gemma の実測。**空配列は許す。** 弾くと採点全体が失敗になる */
    it('空配列は通す（採点を失敗にしない）', () => {
        expect(feedbackSchema.parse({ ...base, nextPriority: [] }).nextPriority).toEqual([])
    })
})
