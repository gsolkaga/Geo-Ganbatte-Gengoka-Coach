/**
 * `GET /api/answer-key` — 管理モード用の出題の読み出し（タスク 19）。
 *
 * **学習者向けの `GET /api/questions` とは別に置く。** あちらは
 * `QuestionForLearner` に絞って正解タグと撮影年月を落としている。
 * ここは**タグ付けのために全部返す。**
 *
 * > **同じデータでも、渡す相手が違えば経路を分ける。**
 *
 * 1 つの経路に `?full=1` のような切り替えを足すと、
 * 学習画面の実装を 1 行間違えたときに正解が漏れる。
 *
 * - 引数なし         … 一覧（埋まり具合つき）
 * - `?questionId=X`  … 1 件を丸ごと
 *
 * **認証がない。** ローカル実行前提のため許容する（README の「なぜローカル実行専用か」）。
 */
import { answerKeyProgress } from '../../shared/answer-key'
import { readGlossary, readQuestions } from '../utils/store'

export default defineEventHandler(async (event) => {
    const questionId = getQuery(event).questionId
    const questions = await readQuestions()

    if (typeof questionId === 'string' && questionId !== '') {
        const question = questions.find((q) => q.id === questionId)
        if (!question) {
            throw createError({ statusCode: 404, statusMessage: `出題が無い: ${questionId}` })
        }

        /**
         * そのスロットで選べる用語だけを返す。**辞書 262 語を丸ごと渡さない。**
         * 選ぶのに要らない情報を送ると、画面側で絞る処理が必要になる。
         */
        const glossary = await readGlossary()
        const termsBySlot: Record<string, { id: string, plain: string, countries: number, certainty: string }[]> = {}
        for (const term of glossary) {
            const list = termsBySlot[term.slot] ?? (termsBySlot[term.slot] = [])
            list.push({
                id: term.id,
                plain: term.plain,
                countries: term.countries.length,
                certainty: term.certainty,
            })
        }
        // 絞り込み力の強い順に出す。**該当国が少ない用語ほど選ぶ価値がある**
        for (const list of Object.values(termsBySlot)) {
            list.sort((a, b) => a.countries - b.countries || a.id.localeCompare(b.id))
        }

        return { question, termsBySlot }
    }

    return {
        total: questions.length,
        questions: questions.map((q) => ({
            id: q.id,
            country: q.country,
            region: q.region,
            difficulty: q.difficulty,
            // 撮影年月はタグ付けの補助に使う。**学習者には出さない**
            captureDate: q.captureDate,
            decisiveSlots: q.decisiveSlots,
            progress: answerKeyProgress(q.slots),
        })),
    }
})
