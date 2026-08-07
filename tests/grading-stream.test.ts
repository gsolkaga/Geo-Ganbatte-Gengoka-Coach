/**
 * NDJSON パーサのテスト。
 *
 * **部分 JSON をパースしないこと**が要点である。
 * 行が完成するまで待ち、壊れた行は捨てる。増分パーサを導入しない。
 */
import { describe, expect, it } from 'vitest'
import { createNdjsonParser } from '../shared/grading-stream'
import type { GradeStreamEvent } from '../shared/grading-stream'

function collect() {
    const events: GradeStreamEvent[] = []
    const parser = createNdjsonParser((event) => events.push(event))
    return { events, parser }
}

describe('createNdjsonParser', () => {
    it('1 行 1 イベントとして切り出す', () => {
        const { events, parser } = collect()
        parser.push('{"type":"progress","model":"m","index":0,"chunks":1,"contentChars":0,"reasoningChars":5,"firstByteMs":10,"elapsedMs":20}\n')
        expect(events).toHaveLength(1)
        expect(events[0]!.type).toBe('progress')
    })

    it('チャンクの途中で切れた行は次のチャンクを待つ', () => {
        const { events, parser } = collect()
        parser.push('{"type":"done","runFile":"data/ru')
        expect(events).toHaveLength(0)
        parser.push('ns/a.json"}\n')
        expect(events).toHaveLength(1)
        expect(events[0]).toEqual({ type: 'done', runFile: 'data/runs/a.json' })
    })

    it('1 チャンクに複数行が入っていてもすべて処理する', () => {
        const { events, parser } = collect()
        parser.push('{"type":"done","runFile":"a"}\n{"type":"done","runFile":"b"}\n')
        expect(events).toHaveLength(2)
    })

    it('改行で終わっていない最終行は flush で取り出す', () => {
        const { events, parser } = collect()
        parser.push('{"type":"done","runFile":"a"}')
        expect(events).toHaveLength(0)
        parser.flush()
        expect(events).toHaveLength(1)
    })

    it('壊れた行は捨てて後続を処理する（進捗行の欠落は致命的ではない）', () => {
        const { events, parser } = collect()
        parser.push('{壊れている}\n{"type":"done","runFile":"a"}\n')
        expect(events).toHaveLength(1)
        expect(events[0]).toEqual({ type: 'done', runFile: 'a' })
    })

    it('空行を無視する', () => {
        const { events, parser } = collect()
        parser.push('\n\n{"type":"done","runFile":"a"}\n\n')
        parser.flush()
        expect(events).toHaveLength(1)
    })
})
