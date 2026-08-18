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
    readActiveRecord,
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
    /**
     * **棚には無いが、いま使っている。** ライブラリから削除したアクティブなデータ。
     *
     * `data/questions.json` は残っているので学習は続けられる。
     * 出典表示は `library.json` の `active` から出す。
     * 棚に戻すには配布物を取り込み直す。
     */
    onShelf: boolean
}

export default defineEventHandler(async (): Promise<{
    datasets: DatasetListItem[]
    activeId: string | null
    /** ライブラリに載っていないアクティブなデータ。**同梱の初期状態がこれである** */
    activeQuestionCount: number
}> => {
    const [ids, activeId, activeRecord, progressFile, activeQuestions] = await Promise.all([
        listDatasetIds(),
        readActiveDatasetId(),
        readActiveRecord(),
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
            onShelf: true,
        })
    }

    /**
     * **棚から消えたアクティブなデータも一覧に出す。**
     *
     * 出さないと、いま何を使っているのか画面から分からなくなる。
     * CC BY の出典表示も出せない。件数は `data/questions.json` から数える。
     */
    if (activeId && activeRecord && !datasets.some((d) => d.id === activeId)) {
        const questionIds = activeRecord.questionIds.length
            ? activeRecord.questionIds
            : activeQuestions.map((q) => q.id)
        const progress = progressFile.byDataset[activeId] ?? { order: questionIds, answered: [] }
        datasets.unshift({
            id: activeId,
            name: activeRecord.name,
            author: activeRecord.author,
            license: activeRecord.license,
            attribution: activeRecord.attribution,
            description: null,
            sources: activeRecord.sources,
            createdAt: '',
            questionCount: activeQuestions.length,
            // **棚が無いので用語数は数えられない。** 0 と書かず -1 にはしない
            termCount: 0,
            active: true,
            progress: summarizeProgress(progress, questionIds),
            next: nextQuestion(progress, questionIds),
            onShelf: false,
        })
    }

    return { datasets, activeId, activeQuestionCount: activeQuestions.length }
})
