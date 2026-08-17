/**
 * `GET /api/runs` — 保存済みのプレイ記録の一覧（回答部分のみ）。
 *
 * ## 何のためか
 *
 * **14 スロットを埋める労力に対し、採点 1 回で使い捨てるのは不経済である。**
 * 保存済みの観察メモをフォームに戻し、モデルや `variant` を変えて再採点できるようにする。
 * 打ち直しをさせない（タスク 26.1）。
 *
 * ## `result` を返さない
 *
 * `RunRecord.result` には `hit`（正解したか）と AI のフィードバック本文が入っている。
 * **フィードバック本文には正解国が書かれている。**
 *
 * `GET /api/questions` が正解タグを外しているのと同じ理由で、ここも外す。
 * フォームに戻すのに必要なのは `answer` だけである。
 *
 * > **必要な分だけ返す。** 「同じ人が使うから漏れても困らない」は理由にならない。
 *   配布したときに壊れる。
 *
 * ## `rawContent` を返さない副作用
 *
 * `result` を外すと応答が小さくなる。記録 1 件が最大 408KB あり、
 * その大半は打ち切られた生テキスト（空白 184,835 字）である。
 * 一覧で全件返すと数 MB になっていた。
 *
 * **認証がない。** ローカル実行前提のため許容する。
 */
import type { Answer, RunRecord, Variant } from '../../shared/types'
import { SLOT_IDS } from '../../shared/slots'
import { listRunFiles, readRun } from '../utils/store'

export interface RunSummary {
    /** 読み込みの識別子。ファイル名をそのまま使う */
    file: string
    id: string
    ts: string
    variant: Variant
    questionId: string
    /** 記述のあるスロット数。一覧で中身の濃さが分かるように */
    describedSlots: number
    /** 用語 ID が入っているか。正規化を通した記録かどうかの目印 */
    normalized: boolean
    /** 学習者が挙げた候補。**正解ではない**ので返してよい */
    candidates: Answer['candidates']
    /** フォームへ戻す本体 */
    answer: Answer
}

export default defineEventHandler(async (): Promise<{ runs: RunSummary[] }> => {
    const files = await listRunFiles()
    const runs: RunSummary[] = []

    for (const file of files) {
        let record: RunRecord
        try {
            record = await readRun(file)
        }
        catch {
            // 壊れた記録 1 件で一覧全体を落とさない
            continue
        }
        if (!record?.answer) continue

        const entries = SLOT_IDS.map((id) => record.answer.slots[id])
        runs.push({
            file,
            id: record.id,
            ts: record.ts,
            variant: record.variant,
            questionId: record.questionId,
            describedSlots: entries.filter(
                (e) => e?.state === 'visible' && Boolean(e.plain?.trim()),
            ).length,
            normalized: entries.some((e) => (e?.terms?.length ?? 0) > 0),
            candidates: record.answer.candidates,
            answer: record.answer,
        })
    }

    // 新しい順。直前のプレイを戻すのが一番多い操作である
    runs.sort((a, b) => b.ts.localeCompare(a.ts))
    return { runs }
})
