/**
 * `GET /api/datasets` — ライブラリの一覧と、データセットごとの進捗。
 *
 * ## 一覧はディレクトリから作る
 *
 * `library.json` に一覧を持たせると、**配布物を置いただけでは使えない。**
 * 索引は「いま何が選ばれているか」だけを持つ（`server/utils/store.ts`）。
 *
 * ## 正解タグは返さない
 *
 * データセットには正解タグが入っている。**件数と由来だけを返す。**
 * `GET /api/questions` が正解タグを外しているのと同じ理由である。
 *
 * > **必要な分だけ返す。**
 *
 * **認証がない。** ローカル実行前提のため許容する（README に明記）。
 */
import { nextQuestion, summarizeProgress } from '../../shared/dataset'
import {
    listDatasetIds,
    readActiveDatasetId,
    readDataset,
    readProgressFile,
    readQuestions,
} from '../utils/store'

export interface DatasetListItem {
    id: string
    name: string
    author: string
    license: string
    attribution: string
    description: string | null
    sources: string[]
    createdAt: string
    questionCount: number
    termCount: number
    active: boolean
    progress: { answered: number, total: number, remaining: number, done: boolean }
    /** 次に出る出題と何問目か。1 周していれば null */
    next: { questionId: string, index: number, total: number } | null
}

export default defineEventHandler(async (): Promise<{
    datasets: DatasetListItem[]
    activeId: string | null
    /** ライブラリに載っていないアクティブなデータ。**同梱の初期状態がこれである** */
    activeQuestionCount: number
}> => {
    const [ids, activeId, progressFile, activeQuestions] = await Promise.all([
        listDatasetIds(),
        readActiveDatasetId(),
        readProgressFile(),
        readQuestions().catch(() => []),
    ])

    const datasets: DatasetListItem[] = []
    for (const id of ids) {
        const d = await readDataset(id)
        if (!d) continue
        const questionIds = d.questions.map((q) => q.id)
        const progress = progressFile.byDataset[id] ?? { order: questionIds, answered: [] }
        datasets.push({
            id,
            name: d.meta.name,
            author: d.meta.author,
            license: d.meta.license,
            attribution: d.meta.attribution,
            description: d.meta.description ?? null,
            sources: d.meta.sources,
            createdAt: d.meta.createdAt,
            questionCount: d.questions.length,
            termCount: d.glossary.terms.length,
            active: id === activeId,
            progress: summarizeProgress(progress, questionIds),
            next: nextQuestion(progress, questionIds),
        })
    }

    return { datasets, activeId, activeQuestionCount: activeQuestions.length }
})
