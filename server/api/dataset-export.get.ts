/**
 * `GET /api/dataset-export` — いまのアクティブを配布形式で書き出す。**消費 0。**
 *
 * ## CLI と同じ規律で出す
 *
 * `npm run dataset -- export` と**同じ関数**を使う（`shared/dataset.ts`）。
 * 画面用に別の組み立てを書くと、**配布物の形が 2 つになる。**
 *
 * とくに検証は外せない。
 *
 * > **欄を用意しないことは、入っていないことの保証にならない。**
 *
 * `validateDataset` が `data:` URL・画像への参照・Street View 画像 API の URL・
 * base64 らしい長い文字列を**中身を走査して**弾く。
 * `error` が 1 件でもあれば **422 を返して何も渡さない。**
 * CLI が `process.exit(1)` で書き出さないのと同じである。
 *
 * ## 既定値は「いま何を編集していたか」から取る
 *
 * CLI の既定は標準データセットの名前で固定だった。画面では
 * `data/library.json` の由来（`create` や `use` で書いた記録）を既定にする。
 * **いま作ったものに、いまの名前が付く。**
 *
 * ## ダウンロードとして返す
 *
 * `Content-Disposition: attachment` を付ける。
 * ブラウザで開いて眺めるものではなく、**人に渡すファイル**である。
 *
 * **認証がない。** ローカル実行前提のため許容する。
 */
import {
    DATASET_FORMAT_VERSION,
    DATASET_KIND,
    collectSources,
    datasetId as makeDatasetId,
    selectUsedTerms,
    validateDataset,
} from '../../shared/dataset'
import type { Dataset } from '../../shared/dataset'
import { readActiveRecord, readCountries, readGlossary, readQuestions } from '../utils/store'

const REPO = 'https://github.com/gsolkaga/Geo-Ganbatte-Gengoka-Coach'

async function knownCountries(): Promise<string[]> {
    const raw = await readCountries()
    const list = Array.isArray(raw)
        ? raw
        : (raw as { countries?: { code: string }[] }).countries ?? []
    return list.map((c: { code: string }) => c.code)
}

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const asFile = query.download !== '0'
    /** 使っている用語だけに絞る。**既定は丸ごと配る**（絞ると次に見るべき欄の計算が痩せる） */
    const usedTermsOnly = query.usedTermsOnly === '1'

    const [questions, terms, active] = await Promise.all([
        readQuestions(),
        readGlossary(),
        readActiveRecord(),
    ])

    if (questions.length === 0) {
        throw createError({
            statusCode: 409,
            statusMessage: '出題が 0 件である。配るものが無い',
        })
    }

    const name = String(query.name ?? '').trim() || active?.name || 'GGG データセット'
    const author = String(query.author ?? '').trim() || active?.author || 'unknown'
    const description = String(query.description ?? '').trim()

    const selected = usedTermsOnly ? selectUsedTerms(questions, terms) : terms

    const dataset: Dataset = {
        kind: DATASET_KIND,
        formatVersion: DATASET_FORMAT_VERSION,
        meta: {
            name,
            author,
            license: 'CC BY 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
            attribution: `${name} (${author}), CC BY 4.0 — ${REPO}`,
            sources: collectSources(selected),
            createdAt: new Date().toISOString(),
            description: description
                || '出題は pano ID のみを保持する（Street View の画像は含まない）。'
                + '**間違いは自分で直せる。** 検証ツールを同梱している。',
        },
        questions,
        glossary: { terms: selected },
    }

    const issues = validateDataset(dataset, { knownCountries: await knownCountries() })
    const errors = issues.filter((i) => i.level === 'error')
    if (errors.length) {
        /**
         * **通らないものを渡さない。** ここで渡すと、
         * 受け取った側の `install` が弾くまで誰も気づかない。
         * 配る前に止めるのが、配る人を守ることである。
         */
        throw createError({
            statusCode: 422,
            statusMessage: '検証に通らないので書き出さなかった',
            data: { issues },
        })
    }

    const id = makeDatasetId(author, name)
    const body = JSON.stringify(dataset, null, 2)

    if (asFile) {
        setHeader(event, 'content-type', 'application/json; charset=utf-8')
        // ファイル名に使えない文字を落とす。**ID は既に ASCII に正規化されている**
        setHeader(event, 'content-disposition', `attachment; filename="${id}.json"`)
        return body
    }

    // 画面で件数だけ見たいとき。**中身は返さない**（正解タグが入っている）
    return {
        ok: true,
        id,
        name,
        author,
        questionCount: questions.length,
        termCount: selected.length,
        sourceCount: dataset.meta.sources.length,
        bytes: Buffer.byteLength(body, 'utf8'),
        warnings: issues.filter((i) => i.level === 'warning').map((i) => i.message),
    }
})
