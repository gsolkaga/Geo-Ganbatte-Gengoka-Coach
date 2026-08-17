/**
 * 打ち切られた JSON の修復。
 *
 * ## 実測に基づく（2026-08-17、カザフスタンの出題）
 *
 * 2 モデルが `finish_reason=length` で打ち切られたが、**中身の量は問題ではなかった。**
 *
 *   gemma  12,052 字中 11,790 字（98%）が末尾の空白。本文 262 字。欠けた項目 7/9
 *   Kimi   41,508 字中 40,952 字（99%）が末尾の空白。本文 556 字。欠けた項目 1/9
 *
 * **書くのをやめたあと、空白だけを max_tokens まで吐き続けている。**
 * `Kimi` は 556 字を書き終えて、40,952 字の空白のために 280 秒使った。
 *
 * `Kimi` は閉じ括弧を足すだけで検証を通る。**打ち切り 1 件が救える。**
 * `gemma` は必須項目が無いので救えない。**救えないことも確認する。**
 */
import { describe, expect, it } from 'vitest'
import { repairTruncatedJson, trailingWhitespaceLength } from '../shared/json-repair'
import { feedbackSchema } from '../shared/schemas'

describe('trailingWhitespaceLength', () => {
    it('末尾の連続空白を数える', () => {
        expect(trailingWhitespaceLength('{"a":1}' + ' '.repeat(500))).toBe(500)
    })

    it('空白が無ければ 0', () => {
        expect(trailingWhitespaceLength('{"a":1}')).toBe(0)
    })

    /** 改行も空白である。実測の暴走は空白と改行の混在だった */
    it('改行とタブも数える', () => {
        expect(trailingWhitespaceLength('{"a":1}\n\t \n')).toBe(4)
    })
})

describe('repairTruncatedJson', () => {
    it('既に閉じている JSON は何も足さない', () => {
        const result = repairTruncatedJson('{"a":1}')
        expect(result.ok).toBe(true)
        expect(result.appended).toBe('')
    })

    it('末尾の空白を落として閉じる', () => {
        const result = repairTruncatedJson(`{"a":1${' '.repeat(1000)}`)
        expect(result.ok).toBe(true)
        expect(result.trimmedWhitespace).toBe(1000)
        expect(JSON.parse(result.text!)).toEqual({ a: 1 })
    })

    it('入れ子の配列とオブジェクトを順に閉じる', () => {
        const result = repairTruncatedJson('{"a":[{"b":1}, {"c":2')
        expect(result.ok).toBe(true)
        expect(result.appended).toBe('}]}')
    })

    it('文字列の途中で切れたら引用符を閉じる', () => {
        const result = repairTruncatedJson('{"summary":"途中で切れた')
        expect(result.ok).toBe(true)
        expect(JSON.parse(result.text!)).toEqual({ summary: '途中で切れた' })
    })

    /** **本文に括弧が含まれるだけで壊れてはならない** */
    it('文字列の中の括弧を数えない', () => {
        const result = repairTruncatedJson('{"summary":"配列は [1, 2] と書く。オブジェクトは {a: 1}"')
        expect(result.ok).toBe(true)
        expect(JSON.parse(result.text!)).toEqual({ summary: '配列は [1, 2] と書く。オブジェクトは {a: 1}' })
    })

    it('エスケープされた引用符を文字列の終わりと見ない', () => {
        const result = repairTruncatedJson('{"summary":"彼は\\"はい\\"と言った')
        expect(result.ok).toBe(true)
        expect(JSON.parse(result.text!).summary).toBe('彼は"はい"と言った')
    })

    it('末尾のカンマを落とす', () => {
        const result = repairTruncatedJson('{"a":1,')
        expect(result.ok).toBe(true)
        expect(JSON.parse(result.text!)).toEqual({ a: 1 })
    })

    /** キーだけ書いて切れた場合。**値を作らない。断片を落とす** */
    it('キーだけの断片を落とす', () => {
        const result = repairTruncatedJson('{"a":1,"vocabul')
        expect(result.ok).toBe(true)
        expect(JSON.parse(result.text!)).toEqual({ a: 1 })
    })

    it('コロンまで書いて切れた場合も断片を落とす', () => {
        const result = repairTruncatedJson('{"a":1,"vocabulary":')
        expect(result.ok).toBe(true)
        expect(JSON.parse(result.text!)).toEqual({ a: 1 })
    })

    it('オブジェクトで始まらないものは修復しない', () => {
        expect(repairTruncatedJson('これは JSON ではない').ok).toBe(false)
    })
})

describe('実測の打ち切りを修復して検証まで通す', () => {
    /**
     * `Kimi-K2.6` の実測。**欠けているのは `wrongReasoning` だけである。**
     * `feedbackSchema` の `wrongReasoning` は `.default([])` を持つので通る。
     */
    it('Kimi の打ち切りは救える（欠落 1 項目、default で埋まる）', () => {
        const raw = `{
  "discoveries": ["正解のKZを候補に残せています。"],
  "discriminationHint": "違いにくい組み合わせ：KG-KZ, KG-RU, KZ-RU。",
  "failureModeExplanation": ".RUドメインを決め手にしてRUの確信度を上げすぎました。",
  "judgmentUnavailable": true,
  "missedClues": [],
  "nextPriority": ["bollard", "vehicle", "script"],
  "summary": "正解のKZは候補に含まれていましたが、順位が反転しました。",
  "vocabulary": []${' '.repeat(40952)}`

        const repaired = repairTruncatedJson(raw)
        expect(repaired.ok).toBe(true)
        expect(repaired.trimmedWhitespace).toBe(40952)
        expect(repaired.appended).toBe('}')

        const parsed = feedbackSchema.safeParse(JSON.parse(repaired.text!))
        expect(parsed.success).toBe(true)
        // 欠けた項目は既定値で埋まる。**推測で作っていない**
        expect(parsed.success && parsed.data.wrongReasoning).toEqual([])
        expect(parsed.success && parsed.data.judgmentUnavailable).toBe(true)
        expect(parsed.success && parsed.data.nextPriority).toEqual(['bollard', 'vehicle', 'script'])
    })

    /**
     * `gemma-4-31B-it` の実測。**必須項目が無いので救えない。**
     * 救えないことを確認しておく。**通ったふりをさせない。**
     */
    it('gemma の打ち切りは救えない（summary と judgmentUnavailable が無い）', () => {
        const raw = `{
  "discoveries": ["メールアドレスのドメイン（.RU）を自力で発見できています。"],
  "discriminationHint": "正解タグと用語辞書が与えられていないため、見落としの判定はできません。"${' '.repeat(11790)}`

        const repaired = repairTruncatedJson(raw)
        // JSON としては閉じられる
        expect(repaired.ok).toBe(true)
        // **しかし検証は通らない**
        const parsed = feedbackSchema.safeParse(JSON.parse(repaired.text!))
        expect(parsed.success).toBe(false)
    })
})
