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
    DATASET_KIND,
    LIBRARY_FORMAT_VERSION,
    collectSources,
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
    toActiveRecord,
    writeActive,
    writeDataset,
    writeProgressFile,
    writeQuestions,
} from '../utils/store'

type Action = 'install' | 'use' | 'remove' | 'create'

interface Body {
    action: Action
    /** `install` のとき配布物そのもの */
    dataset?: unknown
    /** `use` / `remove` のとき対象。`install` では ID の指定に使える */
    id?: string
    /** 既にある ID を上書きする */
    force?: boolean
    /** `create` のとき。人が読む名前と作成者 */
    name?: string
    author?: string
    description?: string
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
    if (body?.action === 'create') return create(body)

    throw createError({
        statusCode: 400,
        statusMessage: 'action は install / use / remove / create のいずれか',
    })
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
    /**
     * **由来を写す。** 参照で守っていたものを複製で守る。
     * これがあるので、後で棚から消しても出典表示が残る。
     */
    await writeActive(toActiveRecord(id, d))

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

/**
 * 出題が空の問題集を作り、それをアクティブにする。
 *
 * ## 辞書は引き継ぐ。**出題だけを空にする**
 *
 * 新しい問題集を「まったくの白紙」にすると、辞書も空になる。
 * それでは**用語を選べないのでタグ付けができない。**
 * それ以上に、辞書ごと作り直した問題集で測った結果は、
 * 前の結果と比べられない（辞書が変われば別の道具である）。
 *
 * > **測るものを変えるときは、測る道具を変えない。**
 *
 * `data/glossary.json` には**触らない。** 触らないことが指紋の一致を保証する
 * （`npm run fingerprint -- --verify`）。
 * 新しい棚のデータセットには、いまの辞書をそのまま写して入れる。
 *
 * ## 前の問題集は棚に残る
 *
 * `data/questions.json` を空にする前に控えを取る（`.backup/<日時>/`）。
 * 加えて、前の問題集がライブラリにあるなら**そのまま棚に残る**ので、
 * `use` で戻せる。**戻る道がある操作にする。**
 */
async function create(body: Body) {
    const name = body.name?.trim() ?? ''
    const author = body.author?.trim() ?? ''
    if (!name || !author) {
        // **既定値を作らない。** 「無題」で作ると、後から何の問題集か分からなくなる
        throw createError({
            statusCode: 400,
            statusMessage: '問題集の名前と作成者は必須である（出典表示に使う）',
        })
    }

    const id = body.id?.trim() || makeDatasetId(author, name)
    if (!isSafeDatasetId(id)) {
        throw createError({ statusCode: 400, statusMessage: `データセット ID が不正である: ${id}` })
    }

    const existing = await readDataset(id).catch(() => null)
    if (existing && !body.force) {
        // **黙って上書きしない。** 既にある問題集を名前の一致だけで消さない
        throw createError({
            statusCode: 409,
            statusMessage: '同じ ID の問題集が既にある',
            data: {
                id,
                mine: {
                    name: existing.meta.name,
                    questionCount: existing.questions.length,
                    createdAt: existing.meta.createdAt,
                },
            },
        })
    }

    const terms = await readGlossary()
    const dataset: Dataset = {
        kind: DATASET_KIND,
        formatVersion: LIBRARY_FORMAT_VERSION,
        meta: {
            name,
            author,
            license: 'CC BY 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
            attribution: `${name} by ${author}, CC BY 4.0`,
            sources: collectSources(terms),
            createdAt: new Date().toISOString(),
            ...(body.description?.trim() ? { description: body.description.trim() } : {}),
        },
        questions: [],
        glossary: { terms },
    }

    // **取り消せない操作にしない。** 人手で付けた正解タグを空にするため
    const backup = await backupActive()

    await writeDataset(id, dataset)
    await writeQuestions([])
    // **`replaceGlossaryTerms` を呼ばない。** 同じ内容でも書き込めば指紋の話が濁る
    await writeActive(toActiveRecord(id, dataset))

    const progressFile = await readProgressFile()
    progressFile.byDataset[id] = initProgress([])
    await writeProgressFile(progressFile)

    return {
        ok: true,
        id,
        backup,
        created: { name, author, questionCount: 0, termCount: terms.length },
        note: '出題が空の問題集を作ってアクティブにした。'
            + '辞書は引き継いでいる（glossary.json は変更していない）',
    }
}

async function remove(body: Body) {
    const id = body.id?.trim() ?? ''
    if (!isSafeDatasetId(id)) {
        throw createError({ statusCode: 400, statusMessage: `データセット ID が不正である: ${id}` })
    }
    /**
     * **アクティブなものも消せる。** 最初は拒否していたが誤りだった。
     *
     * 同梱の標準データセットはアクティブかつ棚に 1 つだけなので、
     * 切り替え先が無く**一生消せなかった。**
     *
     * 拒否した理由は「出典表示の根拠（`attribution`）を失うから」である。
     * 切り替えの時点で由来を `library.json` に写すようにしたので、
     * **棚を消しても出典表示は残る。**
     *
     * > **参照で守っていたものを、複製で守る。消せるようにするための代償である。**
     *
     * `data/questions.json` はアクティブなので学習も続けられる。
     */
    const activeId = await readActiveDatasetId()
    const removingActive = id === activeId
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
    return {
        ok: true,
        id,
        removedActive: removingActive,
        note: removingActive
            ? 'ライブラリから消した。**いま使っているデータなので学習は続けられる**'
            + '（出典表示は library.json に残している）。棚に戻すには取り込み直す'
            : 'ライブラリから消した。**進捗は残している**（入れ直せば戻る）',
    }
}
