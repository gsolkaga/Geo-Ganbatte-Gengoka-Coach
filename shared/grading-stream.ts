/**
 * 採点ストリーム（NDJSON）のイベント定義。サーバとクライアントで共有する。
 *
 * **1 行 1 イベント。** 部分 JSON はパースしない。
 * `result` イベントで初めて完成した JSON が届く。
 *
 * `judgement` は**モデルに依存しないので 1 回だけ**流れる。
 * 確定している事実は 1 つ、解釈は複数、という責務境界をそのまま転送形式に反映している。
 */
import type { CodeJudgement, ModelGrading } from './types'

/** 進捗。**`content` と `reasoning` を別に数える** */
export interface StreamProgress {
    chunks: number
    contentChars: number
    reasoningChars: number
    firstByteMs: number | null
    elapsedMs: number
}

export interface JudgementEvent {
    type: 'judgement'
    judgement: CodeJudgement
    question: { id: string, country: string, region: string | null }
    models: string[]
    requestsConsumed: number
}

export interface ProgressEvent extends StreamProgress {
    type: 'progress'
    model: string
    index: number
}

export interface ResultEvent {
    type: 'result'
    model: string
    index: number
    result: ModelGrading
}

export interface DoneEvent {
    type: 'done'
    runFile: string
}

export type GradeStreamEvent = JudgementEvent | ProgressEvent | ResultEvent | DoneEvent

/**
 * NDJSON のバイト列をイベントに切り出す。
 *
 * 行単位でしかパースしない。**途中まで届いた行は次のチャンクを待つ。**
 */
export function createNdjsonParser(onEvent: (event: GradeStreamEvent) => void) {
    let buffer = ''
    return {
        push(text: string) {
            buffer += text
            let newline = buffer.indexOf('\n')
            while (newline >= 0) {
                const line = buffer.slice(0, newline).trim()
                buffer = buffer.slice(newline + 1)
                if (line) {
                    try {
                        onEvent(JSON.parse(line) as GradeStreamEvent)
                    }
                    catch {
                        // 壊れた行は捨てる。進捗行の欠落は致命的ではない
                    }
                }
                newline = buffer.indexOf('\n')
            }
        },
        /** ストリーム終了時に残りを流し込む */
        flush() {
            const line = buffer.trim()
            buffer = ''
            if (!line) return
            try {
                onEvent(JSON.parse(line) as GradeStreamEvent)
            }
            catch {
                // 同上
            }
        },
    }
}
