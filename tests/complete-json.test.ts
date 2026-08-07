import { describe, expect, it } from 'vitest'
import { looksLikeCompleteJson } from '../server/utils/ai'

/**
 * `finish_reason` だけで成功・失敗を決めていたのは粗かった。
 *
 * 実測（2026-08-07）で `preview/gemma-4-31B-it` が JSON を書き終えた後も
 * 空白を吐き続け、`max_tokens=8000` を使い切って `finish_reason=length` になった。
 * 8,002 チャンク、110.4 秒、生テキストの後半は全て空白。
 * **出力が長すぎたのではなく、止まらなかったのである。**
 *
 * よって判定はこうする。
 *   `finish_reason` は信号として記録する
 *   **使えるかどうかはパースの成否で決める**
 */
describe('looksLikeCompleteJson', () => {
    it('完結した JSON オブジェクトを受け付ける', () => {
        expect(looksLikeCompleteJson('{"summary":"ok"}')).toBe(true)
    })

    it('末尾に空白が詰まっていても受け付ける（gemma の実測ケース）', () => {
        const padded = `{"summary":"ok"}${' '.repeat(5000)}`
        expect(looksLikeCompleteJson(padded)).toBe(true)
    })

    it('改行とタブで埋められていても受け付ける', () => {
        expect(looksLikeCompleteJson('{"a":1}\n\n\t\t  \n')).toBe(true)
    })

    it('途中で切れた JSON は拒否する', () => {
        expect(looksLikeCompleteJson('{"missedClues":[{"slot":"bol')).toBe(false)
    })

    it('閉じ括弧があっても構文が壊れていれば拒否する', () => {
        expect(looksLikeCompleteJson('{"a":1,}')).toBe(false)
        expect(looksLikeCompleteJson('{"a":}')).toBe(false)
    })

    it('空文字と空白のみは拒否する', () => {
        expect(looksLikeCompleteJson('')).toBe(false)
        expect(looksLikeCompleteJson('   \n  ')).toBe(false)
    })

    it('オブジェクト以外は拒否する（採点結果は必ずオブジェクト）', () => {
        expect(looksLikeCompleteJson('[1,2,3]')).toBe(false)
        expect(looksLikeCompleteJson('"文字列"')).toBe(false)
        expect(looksLikeCompleteJson('null')).toBe(false)
    })

    it('前後に空白がある完結した JSON を受け付ける', () => {
        expect(looksLikeCompleteJson('  \n {"a":1} \n ')).toBe(true)
    })
})
