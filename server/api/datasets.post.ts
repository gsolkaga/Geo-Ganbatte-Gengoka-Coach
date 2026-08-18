/**
 * `POST /api/datasets` — データセットの取り込み・切り替え・削除。
 *
 * ## 書き込みと削除を持つ。**認証は無い**
 *
 * このアプリはローカル実行専用として設計されている（README に明記）。
 * それでも**破壊的な操作は形で縛る。**
 *
 * - ID をパスに使う前に検証する（`isSafeDatasetId`）。`../` を弾く
 * - 切り替えの前に控えを取る（`.backup/<日時>/`）
 * - **アクティブなデータセットは削除できない**（出題が 0 件になる）
 * - 取り込みは検証を通す。`error` が 1 件でもあれば 1 件も入れない
 *
 * > **公開ホスティングしないこと。** この API はファイルを消せる。
 *
 * ## 上書きしない
 *
 * 同じ ID が既にあれば `409` を返して止まる。`force` を明示させる。
 * 自分で直した辞書が他人のデータで戻ると、直せることが売りなのに意味が無い。
 */
import {
    LIBRARY_FORMAT_VERSION,
    datasetId as makeDatasetId,
    initProgress,
    validateDataset,
} from '../../shared/dataset'
import type { Dataset } from '../../shared/dataset'
import {
    backupActive,
    isSafeDatasetId,
    listDatasetIds,
    readActiveDatasetId,
    readCountries,
    readDataset,
    readGlossary,
    readProgressFile,
    removeDataset,
    replaceGlossaryTerms,
    writeActiveDatasetId,
    writeDataset,
    writeProgressFile,
    writeQuestions,
} from '../utils/store'

type Action = 'install' | 'use' | 'remove'

interface Body {
    action: Action
    /** `install` のとき配布物そのもの */
    dataset?: unknown
    /** `use` / `remove` のとき対象。`install` では ID の指定に使える */
    id?: string
    /** 既にある ID を上書きする */
    force?: boolean
}

async function knownCountries(): Promise<string[]> {
    const raw = await readCountries()
    const list = Array.isArray(raw) ? raw : (raw as { countries?: { code: string }[] }).countries ?? []
    return list.map((c: { code: string }) => c.code)
}

export default defineEventHandler(async (event) => {
    const body = await readBody<Body>(event)

    if (body?.action === 'install') return install(body)
    if (body?.action === 'use') return use(body)
    if (body?.action === 'remove') return remove(body)

    throw createError({ statusCode: 400, statusMessage: 'action は install / use / remove のいずれか' })
})

async function install(body: Body) {
    const issues = validateDataset(body.dataset, { knownCountries: await knownCountries() })
    const errors = issues.filter((i) => i.level === 'error')
    if (errors.length) {
        // **半分入った状態を作らない。** 1 件でも駄目なら 1 件も入れない
        throw createError({
            statusCode: 422,
            statusMessage: 'データセットの検証に失敗した',
            data: { issues },
        })
    }

    const d = body.dataset as Dataset
    const id = body.id?.trim() || makeDatasetId(d.meta.author, d.meta.name)
    if (!isSafeDatasetId(id)) {
        throw createError({ statusCode: 400, statusMessage: `データセット ID が不正である: ${id}` })
    }

    const existing = await readDataset(id)
    if (existing && !body.force) {
        // **黙って上書きしない。** 両方を見せて人間に決めさせる
        throw createError({
            statusCode: 409,
            statusMessage: '同じ ID のデータセットが既にある',
            data: {
                id,
                mine: { name: existing.meta.name, questionCount: existing.questions.length, createdAt: existing.meta.createdAt },
                theirs: { name: d.meta.name, questionCount: d.questions.length, createdAt: d.meta.createdAt },
            },
        })
    }

    await writeDataset(id, d)

    // 進捗を用意する。**並びを固定する**（毎回並べ替えると「3 問目」が別の問題になる）
    const progressFile = await readProgressFile()
    if (!progressFile.byDataset[id]) {
        progressFile.byDataset[id] = initProgress(d.questions.map((q) => q.id))
        await writeProgressFile(progressFile)
    }

    return {
        ok: true,
        id,
        installed: { name: d.meta.name, questionCount: d.questions.length, termCount: d.glossary.terms.length },
        warnings: issues.filter((i) => i.level === 'warning'),
        // **アクティブにはしない。** 取り込みと選択は別の操作である
        note: 'ライブラリに入れた。使うには切り替えが必要である',
    }
}

async function use(body: Body) {
    const id = body.id?.trim() ?? ''
    const d = await readDataset(id).catch(() => null)
    if (!d) throw createError({ statusCode: 404, statusMessage: `ライブラリに無い: ${id}` })

    // **取り消せない操作にしない。** 人手で作った正解タグを上書きするため
    const backup = await backupActive()

    await writeQuestions(d.questions)
    /**
     * 辞書は `terms` だけを差し替える。**包みを壊さない。**
     * 裸の配列にすると `combo` や `coverage` が黙って 0 語として動く。
     */
    await replaceGlossaryTerms(d.glossary.terms)
    await writeActiveDatasetId(id)

    const progressFile = await readProgressFile()
    if (!progressFile.byDataset[id]) {
        progressFile.byDataset[id] = initProgress(d.questions.map((q) => q.id))
        await writeProgressFile(progressFile)
    }

    return {
        ok: true,
        id,
        backup,
        formatVersion: LIBRARY_FORMAT_VERSION,
        questionCount: d.questions.length,
        termCount: d.glossary.terms.length,
        attribution: d.meta.attribution,
    }
}

async function remove(body: Body) {
    const id = body.id?.trim() ?? ''
    if (!isSafeDatasetId(id)) {
        throw createError({ statusCode: 400, statusMessage: `データセット ID が不正である: ${id}` })
    }
    const activeId = await readActiveDatasetId()
    if (id === activeId) {
        /**
         * **アクティブなものは消せない。**
         *
         * `data/questions.json` はアクティブなので、棚から消しても出題は残る。
         * しかし「いま使っているものを消した」状態は、
         * 出典表示の根拠（`attribution`）を失う。CC BY を守れなくなる。
         */
        throw createError({
            statusCode: 409,
            statusMessage: 'いま選ばれているデータセットは削除できない。先に別のものへ切り替える',
        })
    }
    const ids = await listDatasetIds()
    if (!ids.includes(id)) {
        throw createError({ statusCode: 404, statusMessage: `ライブラリに無い: ${id}` })
    }

    await removeDataset(id)

    /**
     * **進捗は消さない。**
     *
     * 同じデータセットを入れ直したときに、何問目まで進んだかが戻る。
     * 棚から取り出すことと、記録を捨てることは別である。
     */
    return { ok: true, id, note: 'ライブラリから消した。**進捗は残している**（入れ直せば戻る）' }
}
