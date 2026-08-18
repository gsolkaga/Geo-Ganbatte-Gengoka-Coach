/**
 * 採点の実行と NDJSON ストリームの受信。
 *
 * **パネルごとに独立して状態を持つ。** 全件揃うまで待たない。
 * 進捗は表示のためだけに使い、パースはサーバ側で完了後に 1 回だけ行われている。
 */
import { createNdjsonParser } from '#shared/grading-stream'
import type { GradeStreamEvent, StreamProgress } from '#shared/grading-stream'
import type { AnswerDraft, CodeJudgement, ModelGrading, SlotRecord, Variant } from '#shared/types'

export interface GradeInput {
    questionId: string
    variant: Variant
    slots: SlotRecord
    answer: AnswerDraft
    models: string[]
}

export function useGrading() {
    const running = ref(false)
    const judgement = ref<CodeJudgement | null>(null)
    const questionInfo = ref<{ id: string, country: string, region: string | null } | null>(null)
    const activeModels = ref<string[]>([])
    const progress = ref<Record<string, StreamProgress | null>>({})
    const results = ref<Record<string, ModelGrading | null>>({})
    const runFile = ref<string | null>(null)
    const error = ref<string | null>(null)
    /** このセッションで消費したリクエスト数。画面に出して枠を意識させる */
    const requestsConsumed = ref(0)

    function reset(models: string[]) {
        activeModels.value = [...models]
        progress.value = Object.fromEntries(models.map((m) => [m, null]))
        results.value = Object.fromEntries(models.map((m) => [m, null]))
        error.value = null
        runFile.value = null
    }

    async function grade(input: GradeInput) {
        if (running.value) return
        running.value = true
        reset(input.models)

        try {
            const response = await fetch('/api/grade', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    questionId: input.questionId,
                    variant: input.variant,
                    slots: input.slots,
                    candidates: input.answer.candidates,
                    decisiveSlot: input.answer.decisiveSlot,
                    reasoning: input.answer.reasoning,
                    models: input.models,
                    stream: true,
                }),
            })

            if (!response.ok || !response.body) {
                const detail = await response.text().catch(() => '')
                throw new Error(`採点リクエストが失敗した（HTTP ${response.status}）${detail}`)
            }

            const parser = createNdjsonParser(handleEvent)
            const reader = response.body.getReader()
            const decoder = new TextDecoder()

            for (; ;) {
                const { done, value } = await reader.read()
                if (done) break
                parser.push(decoder.decode(value, { stream: true }))
            }
            parser.flush()
        }
        catch (caught) {
            error.value = caught instanceof Error ? caught.message : String(caught)
        }
        finally {
            running.value = false
        }
    }

    function handleEvent(event: GradeStreamEvent) {
        switch (event.type) {
            case 'judgement':
                judgement.value = event.judgement
                questionInfo.value = event.question
                requestsConsumed.value += event.requestsConsumed
                break
            case 'progress':
                progress.value = {
                    ...progress.value,
                    [event.model]: {
                        chunks: event.chunks,
                        contentChars: event.contentChars,
                        reasoningChars: event.reasoningChars,
                        firstByteMs: event.firstByteMs,
                        elapsedMs: event.elapsedMs,
                    },
                }
                break
            case 'result':
                // パネル単位で確定させる。他のパネルの結果を消さない
                results.value = { ...results.value, [event.model]: event.result }
                progress.value = { ...progress.value, [event.model]: null }
                break
            case 'done':
                runFile.value = event.runFile
                break
        }
    }

    /**
     * 保存済みの採点結果を、採点し直さずに表示する。**消費 0。**
     *
     * 講評を読み返すために 1 リクエスト使うのは無駄である。
     * `data/runs/` に全部入っているので、読むだけで足りる。
     *
     * ## `requestsConsumed` を増やさない
     *
     * ここが要点である。表示のために数字を動かすと、
     * **「このセッションの消費」が実際の消費と合わなくなる。**
     * 4xx を消費として数えていた誤りと同じ形になる。
     *
     * > **届いたことと、使われたことは別である。読むことは使うことではない。**
     *
     * ## 進捗のストリームは空にする
     *
     * 過去の記録に「いま何文字受信した」は無い。
     * 残っていると、読み返しているのに受信中のように見える。
     */
    function showSaved(saved: {
        models: ModelGrading[]
        [key: string]: unknown
    } & CodeJudgement, question?: { id: string, country: string, region: string | null }) {
        const { models, ...code } = saved
        judgement.value = code as CodeJudgement
        if (question) questionInfo.value = question
        activeModels.value = models.map((m) => m.model)
        progress.value = Object.fromEntries(models.map((m) => [m.model, null]))
        results.value = Object.fromEntries(models.map((m) => [m.model, m]))
        runFile.value = null
        error.value = null
        // **消費は増やさない。** 読むことは使うことではない
    }

    return {
        running,
        judgement,
        questionInfo,
        activeModels,
        progress,
        results,
        runFile,
        error,
        requestsConsumed,
        grade,
        showSaved,
    }
}
