/**
 * `GET /api/questions` — 出題の取得。
 *
 * **`country` と正解タグ（`slots`）を学習者向けレスポンスに含めない。**
 * 採点前に正解が漏れる。`decisiveSlots` と `note` も答えを示すため除外する。
 *
 * **撮影年月（`captureDate`）も返さない。** 撮影年そのものがメタであり、答えを渡すことになる
 * （要件 11-8、禁止事項 8）。管理モードは `?mode=admin` で取得する。
 *
 * 画像は扱わない。返すのは pano ID と座標だけである。
 */
import { readQuestions } from '../utils/store'
import { toLearnerQuestion } from '../utils/learner-view'

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const mode = query.mode === 'admin' ? 'admin' : 'learner'
    const id = typeof query.id === 'string' && query.id ? query.id : null

    const all = await readQuestions()
    const selected = id ? all.filter((q) => q.id === id) : all

    if (id && selected.length === 0) {
        throw createError({ statusCode: 404, statusMessage: `出題が見つからない: ${id}` })
    }

    if (mode === 'admin') {
        // 管理モードはタグ付けに正解タグと撮影年月を必要とする
        return { mode, count: selected.length, questions: selected }
    }

    return {
        mode,
        count: selected.length,
        questions: selected.map(toLearnerQuestion),
    }
})
