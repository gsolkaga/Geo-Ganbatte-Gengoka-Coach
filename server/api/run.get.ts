/**
 * `GET /api/run?file=...` — 保存済みの採点結果を 1 件、そのまま読む。
 *
 * ## `/api/runs`（一覧）と分ける理由
 *
 * 一覧は `result` を返さない。**フィードバック本文には正解国が書かれている**ためである。
 * まだ答えていない問題の記録が一覧に混ざると、答えが見えてしまう。
 *
 * ここは 1 件を明示的に指定して読む。
 *
 * > **記録が存在するということは、その問題には既に答えたということである。**
 *
 * 記録は採点が終わったときにしか作られない（`persistRun`）。
 * したがって、この経路で正解が見えても**新しく漏れるものは無い。**
 *
 * ## 再採点しないために要る
 *
 * 過去の講評を読み返すのに 1 リクエスト消費するのは無駄である。
 * **消費 0 で読める経路を用意する。** 14 スロットを埋める労力に対し、
 * 採点 1 回で使い捨てるのは不経済である、というのと同じ理由。
 *
 * ## `rawContent` は落とす
 *
 * 打ち切られた生テキストは 1 件で最大 184,835 字ある。**画面には出さない。**
 * 中身を人間が読む必要があるときは `npm run inspect:run` を使う
 * （`rawContent` を捨てないのは記録側の設計であり、配信側の設計ではない）。
 *
 * **認証がない。** ローカル実行前提のため許容する。
 */
import type { GradingResult, RunRecord } from '../../shared/types'
import { listRunFiles, readQuestion, readRun } from '../utils/store'

/** 画面に出す 1 件。`rawContent` を除いた `GradingResult` */
export type RunDetailResult = Omit<GradingResult, 'models'> & {
    models: (Omit<GradingResult['models'][number], 'rawContent'> & { rawLength: number })[]
}

export default defineEventHandler(async (event): Promise<{
    file: string
    record: Omit<RunRecord, 'result'> & { result: RunDetailResult }
    /**
     * 正解国と地域。**コード算出分の表示に必要である。**
     *
     * `GET /api/questions` はこれを外している（まだ答えていないため）。
     * ここでは返す。**記録があるということは、既に答えたということである。**
     */
    question: { id: string, country: string, region: string | null } | null
}> => {
    const file = String(getQuery(event).file ?? '')
    if (!file) {
        throw createError({ statusCode: 400, statusMessage: 'file を指定する' })
    }
    /**
     * **ファイル名をパスに使う前に検証する。** 外から来た文字列である。
     * 一覧に無い名前は読まない（`../` を弾くだけでは、`data/` 内の別ファイルが読める）。
     */
    const files = await listRunFiles()
    if (!files.includes(file)) {
        throw createError({ statusCode: 404, statusMessage: `記録が無い: ${file}` })
    }

    const record = await readRun(file)
    if (!record?.result) {
        throw createError({ statusCode: 404, statusMessage: `記録に採点結果が無い: ${file}` })
    }

    const models = record.result.models.map((m) => {
        const { rawContent, ...rest } = m
        // **長さだけ返す。** 打ち切りの規模は見せるが、本文は送らない
        return { ...rest, rawLength: rawContent?.length ?? 0 }
    })

    // 出題が差し替わって消えていることがある。**その場合は null にする。推測しない**
    const q = await readQuestion(record.questionId)

    return {
        file,
        record: { ...record, result: { ...record.result, models } },
        question: q ? { id: q.id, country: q.country, region: q.region } : null,
    }
})
