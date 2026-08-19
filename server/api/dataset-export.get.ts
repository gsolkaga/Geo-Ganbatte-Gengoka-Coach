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
 * ## 名前と作成者は聞かない。**由来から取る**
 *
 * 最初は画面に名前と作成者の入力欄を置いていた。**二度書かせていた。**
 * 問題集を作る時点（`/admin` の `create`）で入れているし、
 * 受け取ったものを使う時点（`use`）でも由来を写している。
 * `data/library.json` に既にある。
 *
 * それ以上に、**入力欄は帰属を書き換えられる。** 他人のデータセットに
 * 自分の名前を入れて出せてしまう。CC BY で配っているものに対して、
 * 一番やってはいけないことを画面から 1 手でできる状態だった。
 *
 * > **持っていない権利を許諾できないのと同じで、書いていない名前を名乗らせない。**
 *
 * ## 由来が無ければ書き出さない
 *
 * 既定値で埋めるのもやめた。`data/library.json` は `.gitignore` に入っているので、
 * **clone した直後は由来が無い。** そこで既定を当てると
 * `author: "unknown"` の配布物が黙って出来る（実測 2026-08-19）。
 *
 * 由来が無ければ 409 で止めて、由来を作る操作へ案内する。
 * 切り替え（`use`）と作成（`create`）が由来を書く唯一の場所である。
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

    if (!active?.name?.trim() || !active?.author?.trim()) {
        /**
         * **名前を作らない。** ここで既定を当てると、
         * 作成者が `unknown` の配布物が出来て CC BY の帰属が成立しない。
         */
        throw createError({
            statusCode: 409,
            statusMessage: 'いま使っているデータの由来が記録されていない。'
                + '/datasets で問題集を切り替えるか、/admin で新しく作ると名前と作成者が記録される',
        })
    }

    const name = active.name
    const author = active.author

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
            description: '出題は pano ID のみを保持する（Street View の画像は含まない）。'
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
