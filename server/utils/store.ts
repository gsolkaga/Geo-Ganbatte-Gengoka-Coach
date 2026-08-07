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
import { mkdir, readFile, writeFile, appendFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { glossarySchema, questionsSchema } from '../../shared/schemas'
import type { Question, RunRecord, Term } from '../../shared/types'

/**
 * データディレクトリ。ローカル実行前提のため作業ディレクトリ基準で解決する。
 * `DATA_DIR` で上書きできる（テストと別配置のため）。
 */
export function dataDir(): string {
    return process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(process.cwd(), 'data')
}

export const dataPath = (...parts: string[]): string => join(dataDir(), ...parts)

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

async function writeJson(filePath: string, value: unknown): Promise<void> {
    await ensureDir(filePath)
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
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
