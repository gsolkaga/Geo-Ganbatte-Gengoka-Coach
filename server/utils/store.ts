/**
 * JSON ファイル入出力。DB は導入しない（単一利用者、20 問規模）。
 *
 * 書き込み先は以下に限る。
 * - `data/questions.json`（管理モードの保存）
 * - `data/runs/`（プレイ記録）
 * - `data/usage.jsonl`（リクエスト計測ログ）
 * - `data/glossary-candidates.jsonl`（辞書追加候補）
 * - `data/pano-rejections.jsonl`（pano ID の失効・不採用の記録）
 *
 * `data/glossary-human*.json` `data/countries-*.json` `data/regions.json` `data/bollard-axes.json`
 * は検証・生成の一次データであり、**このモジュールからは書き込まない。**
 */
import { mkdir, readFile, writeFile, appendFile, readdir, rm, copyFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { glossarySchema, questionsSchema } from '../../shared/schemas'
import { LIBRARY_FORMAT_VERSION, PROGRESS_FORMAT_VERSION, isSafeDatasetId } from '../../shared/dataset'
import type { ActiveRecord, Dataset, ProgressFile } from '../../shared/dataset'
import type { Question, RunRecord, Term } from '../../shared/types'

/**
 * データディレクトリ。ローカル実行前提のため作業ディレクトリ基準で解決する。
 * `DATA_DIR` で上書きできる（テストと別配置のため）。
 */
export function dataDir(): string {
    return process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(process.cwd(), 'data')
}

export const dataPath = (...parts: string[]): string => join(dataDir(), ...parts)

// **ID の検証は `shared/dataset.ts` にある。** 生成側と同じ場所に置く
export { isSafeDatasetId }

async function ensureDir(filePath: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
}

/** ファイル未作成を判定する。初期状態でも動作させるため */
function isNotFound(error: unknown): boolean {
    return (
        typeof error === 'object'
        && error !== null
        && (error as { code?: string }).code === 'ENOENT'
    )
}

/** ファイルが無い場合は fallback を返す。初期状態でも動作させるため */
async function readJson<T>(filePath: string, fallback: T): Promise<T> {
    try {
        const raw = await readFile(filePath, 'utf8')
        return JSON.parse(raw) as T
    }
    catch (error) {
        if (isNotFound(error)) return fallback
        throw error
    }
}

/**
 * **字下げを生成物に揃える。**
 *
 * `scripts/build-glossary.mjs` と `scripts/dataset.mts` は 4 文字で書く。
 * ここが 2 文字だと、**サーバ側が 1 回書くだけで全行が差分になる。**
 *
 * データセットを切り替えるたびに 13,000 行の差分が出て、
 * **本当の変更が読めなくなる。**
 *
 * > **書き手が複数いるファイルは、書式を 1 つに決める。**
 */
const JSON_INDENT = 4

async function writeJson(filePath: string, value: unknown): Promise<void> {
    await ensureDir(filePath)
    await writeFile(filePath, `${JSON.stringify(value, null, JSON_INDENT)}\n`, 'utf8')
}

async function appendJsonl(filePath: string, record: unknown): Promise<void> {
    await ensureDir(filePath)
    await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8')
}

// --- questions.json ---------------------------------------------------------

export async function readQuestions(): Promise<Question[]> {
    const raw = await readJson<unknown>(dataPath('questions.json'), [])
    const parsed = questionsSchema.safeParse(raw)
    if (!parsed.success) {
        throw new Error(`questions.json の形式が不正である: ${parsed.error.message}`)
    }
    return parsed.data as Question[]
}

export async function readQuestion(id: string): Promise<Question | null> {
    const list = await readQuestions()
    return list.find((q) => q.id === id) ?? null
}

export async function writeQuestions(questions: Question[]): Promise<void> {
    await writeJson(dataPath('questions.json'), questions)
}

/** 同一 ID は置換、無ければ追加 */
export async function upsertQuestion(question: Question): Promise<void> {
    const list = await readQuestions()
    const index = list.findIndex((q) => q.id === question.id)
    if (index >= 0) list[index] = question
    else list.push(question)
    await writeQuestions(list)
}

// --- glossary.json ---------------------------------------------------------

export async function readGlossary(): Promise<Term[]> {
    const raw = await readJson<unknown>(dataPath('glossary.json'), [])
    const parsed = glossarySchema.safeParse(raw)
    if (!parsed.success) {
        throw new Error(`glossary.json の形式が不正である: ${parsed.error.message}`)
    }
    return parsed.data as Term[]
}

export async function writeGlossary(terms: Term[]): Promise<void> {
    await writeJson(dataPath('glossary.json'), terms)
}

/**
 * 用語だけを差し替える。**包みを壊さない。**
 *
 * `data/glossary.json` は `scripts/build-glossary.mjs` の生成物であり、
 * `{ _comment, _schema, generatedAt, terms }` という形をしている。
 *
 * `writeGlossary` は裸の配列を書く（読み取り側が両方を受けるため成立している）。
 * しかし**道具は `.terms` を読む。**
 *
 * ```
 * tools/combo-report.mjs      JSON.parse(...).terms
 * tools/coverage-report.mjs   同じ
 * ```
 *
 * 裸の配列にすると、これらが黙って 0 語として動く。
 * **落ちるのではなく、空として動くのが最悪である。**
 *
 * > **読み取り側が寛容でも、書き込み側は形を守る。**
 */
export async function replaceGlossaryTerms(terms: Term[]): Promise<void> {
    const existing = await readJson<Record<string, unknown>>(dataPath('glossary.json'), {})
    const wrapper = Array.isArray(existing) ? {} : existing
    await writeJson(dataPath('glossary.json'), { ...wrapper, terms })
}

// --- countries.json / regions.json（読み取り専用） -------------------------

export type CountryTable = Record<string, unknown>

export async function readCountries(): Promise<CountryTable> {
    return readJson<CountryTable>(dataPath('countries.json'), {})
}

/** メタの強さの判定に使う地域・大陸グループ。A 側が管理するため読み取りのみ */
export async function readRegions(): Promise<{
    regions: Record<string, string[]>
    continents?: Record<string, string[]>
}> {
    return readJson(dataPath('regions.json'), { regions: {} })
}

// --- runs/ ----------------------------------------------------------------

/** プレイ記録を保存する。v1 / v2 比較のため入力を再現可能な形で残す */
export async function saveRun(run: RunRecord): Promise<string> {
    const safeTs = run.ts.replace(/[:.]/g, '-')
    const filePath = dataPath('runs', `${safeTs}_${run.variant}_${run.id}.json`)
    await writeJson(filePath, run)
    return filePath
}

export async function listRunFiles(): Promise<string[]> {
    try {
        const entries = await readdir(dataPath('runs'))
        return entries.filter((name: string) => name.endsWith('.json')).sort()
    }
    catch (error) {
        if (isNotFound(error)) return []
        throw error
    }
}

export async function readRun(fileName: string): Promise<RunRecord> {
    return readJson<RunRecord>(dataPath('runs', fileName), null as unknown as RunRecord)
}

// --- 追記ログ -------------------------------------------------------------

/** リクエスト計測ログ。1 行 1 レコード */
export async function appendUsageLog(record: unknown): Promise<void> {
    await appendJsonl(dataPath('usage.jsonl'), record)
}

/** 「該当なし」となった記述を辞書追加候補として蓄積する（要件 3-4） */
export async function appendGlossaryCandidate(record: {
    ts: string
    slot: string
    plain: string
    questionId: string | null
}): Promise<void> {
    await appendJsonl(dataPath('glossary-candidates.jsonl'), record)
}

/** pano ID の失効・不採用を記録する（要件 1-7, 1-9） */
export async function appendPanoRejection(record: {
    ts: string
    panoId: string | null
    reason: string
    copyright?: string | null
    status?: string
}): Promise<void> {
    await appendJsonl(dataPath('pano-rejections.jsonl'), record)
}

// --- datasets/ · library.json · progress.json ------------------------------

/**
 * ## 索引を正典にしない
 *
 * 一覧は `data/datasets/` を走査して作る。`library.json` は
 * **「いま何が選ばれているか」だけ**を持つ。
 *
 * 索引を正典にすると、**配布物を置いただけでは使えない。**
 * リポジトリに追加のデータセットを同梱しても、取り込み操作を通すまで見えなくなる。
 *
 * > **置いてあるものが一覧である。**
 *
 * ## ID をパスに使う前に検証する
 *
 * データセット ID はディレクトリ名になる。**外から来た文字列である。**
 * `../` を含む ID を渡されると `data/` の外に出られる。
 *
 * > **パスを組み立てる前に、組み立ててよい文字列かを確かめる。**
 */
function datasetFile(id: string): string {
    if (!isSafeDatasetId(id)) throw new Error(`データセット ID が不正である: ${id}`)
    return dataPath('datasets', id, 'dataset.json')
}

export async function listDatasetIds(): Promise<string[]> {
    try {
        const entries = await readdir(dataPath('datasets'), { withFileTypes: true })
        return entries
            .filter((e) => e.isDirectory() && isSafeDatasetId(e.name))
            .map((e) => e.name)
            .sort()
    }
    catch (error) {
        if (isNotFound(error)) return []
        throw error
    }
}

export async function readDataset(id: string): Promise<Dataset | null> {
    return readJson<Dataset | null>(datasetFile(id), null)
}

export async function writeDataset(id: string, dataset: Dataset): Promise<void> {
    await writeJson(datasetFile(id), dataset)
}

/**
 * ライブラリから消す。**アクティブな `data/questions.json` は触らない。**
 *
 * 削除は「棚から取り出す」であって「捨てる」ではない。
 * 消しても学習は続けられ、出典表示は `library.json` の `active` に残る。
 *
 * **戻すには配布物を取り込み直す。** それが棚の意味である。
 */
export async function removeDataset(id: string): Promise<void> {
    if (!isSafeDatasetId(id)) throw new Error(`データセット ID が不正である: ${id}`)
    await rm(dataPath('datasets', id), { recursive: true, force: true })
}

export async function readActiveDatasetId(): Promise<string | null> {
    const lib = await readJson<{ activeId?: string | null }>(dataPath('library.json'), {})
    const id = lib.activeId ?? null
    // **索引が壊れていても落とさない。** 不正な ID は未選択として扱う
    return id && isSafeDatasetId(id) ? id : null
}

/**
 * 選ばれているものの由来。**棚を消しても残る。**
 *
 * これを持たないと、アクティブなデータセットを削除できない
 * （`attribution` を引く先が無くなり CC BY を守れない）。
 * 同梱の標準データセットはアクティブかつ棚に 1 つだけなので、
 * 切り替え先が無く**一生消せなかった。**
 */
export async function readActiveRecord(): Promise<ActiveRecord | null> {
    const lib = await readJson<{ active?: ActiveRecord | null }>(dataPath('library.json'), {})
    const rec = lib.active ?? null
    if (!rec?.id || !isSafeDatasetId(rec.id)) return null
    return rec
}

export async function writeActive(record: ActiveRecord | null): Promise<void> {
    if (record !== null && !isSafeDatasetId(record.id)) {
        throw new Error(`データセット ID が不正である: ${record.id}`)
    }
    await writeJson(dataPath('library.json'), {
        formatVersion: LIBRARY_FORMAT_VERSION,
        activeId: record?.id ?? null,
        active: record,
    })
}

/** データセットから由来を写す。**切り替えの時点で確定させる** */
export function toActiveRecord(id: string, dataset: Dataset): ActiveRecord {
    return {
        id,
        name: dataset.meta.name,
        author: dataset.meta.author,
        license: dataset.meta.license,
        attribution: dataset.meta.attribution,
        sources: dataset.meta.sources,
        questionIds: dataset.questions.map((q) => q.id),
    }
}

export async function readProgressFile(): Promise<ProgressFile> {
    return readJson<ProgressFile>(dataPath('progress.json'), {
        formatVersion: PROGRESS_FORMAT_VERSION,
        byDataset: {},
    })
}

export async function writeProgressFile(file: ProgressFile): Promise<void> {
    await writeJson(dataPath('progress.json'), file)
}

/**
 * 控えを取る。**取り消せない操作にしない。**
 *
 * アクティブなデータの差し替えは、人手で作った正解タグを上書きする。
 * CLI と同じ場所（`.backup/<日時>/`）へ退避する。
 */
export async function backupActive(): Promise<string> {
    const dir = resolve(process.cwd(), '.backup', new Date().toISOString().replace(/[:.]/g, '-'))
    await mkdir(dir, { recursive: true })
    for (const name of ['questions.json', 'glossary.json']) {
        try {
            await copyFile(dataPath(name), join(dir, name))
        }
        catch (error) {
            if (!isNotFound(error)) throw error
        }
    }
    return dir
}
