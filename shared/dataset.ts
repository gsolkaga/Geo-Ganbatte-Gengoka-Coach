/**
 * 学習用データセットの配布形式（書き出しと取り込み）。**AI を使わない。**
 *
 * ## 配るのは正解データではなく、直せる土台である
 *
 * 用語辞書は 262 語まで増えたが、**間違っている。** 完璧にはならない。
 * 出典から埋めた項目でも、撮影世代が変われば合わなくなる
 * （カーメタは新しい撮影への更新で使えなくなっていく）。
 *
 * したがって配るべきものは「正しいデータ」ではない。
 *
 * > **間違いを見つけて直せる土台を配る。**
 *
 * 誰かが作った問題セットを取り込んで、**自分のさくらの AI Engine に
 * コーチさせる。** 気に入らない用語は自分で直す。直せば応答が変わる
 * （実測: `docs/normalization-recurrence.md`）。
 *
 * ## 画像を入れないことを、規約ではなくコードで守る
 *
 * Street View の画像はキャッシュ・保存が禁止で、**保存してよいのは pano ID だけ**である。
 * この形式には画像を入れる欄が無い。**それだけでは足りない。**
 *
 * `data:` URL や base64 を紛れ込ませれば入ってしまう。
 * だから `validateDataset` が**中身を走査して弾く。**
 *
 * > **規約は読めば分かる。守られているかはコードで確かめる。**
 *
 * ## 用語 ID の参照整合性
 *
 * 問題セットの `terms` は用語 ID を指す。**辞書を同梱しなければ意味を失う。**
 * 別々に配ると、片方だけ更新された組み合わせが生まれる。
 *
 * 1 ファイルにまとめ、取り込み時に**参照が全部解けることを確かめる。**
 */
import type { SlotId } from './slots'
import { SLOT_IDS } from './slots'
import type { Question, Term } from './types'

/** 形式のバージョン。**上げたら取り込み側で分岐する。黙って読まない** */
export const DATASET_FORMAT_VERSION = 1

/** この形式であることの印。拡張子だけで判断しない */
export const DATASET_KIND = 'ggg-dataset'

/**
 * 配布物の由来とライセンス。**空にできない。**
 *
 * データを CC BY 4.0 で出しているので、**出典表示が要る。**
 * 書き出し側が埋めておかないと、受け取った人が誰の何なのか分からなくなる。
 */
export interface DatasetMeta {
    /** 人が読む名前 */
    name: string
    /** 作成者。CC BY の帰属表示に使う */
    author: string
    /** ライセンス識別子 */
    license: string
    licenseUrl: string
    /** そのまま貼れる帰属表示の文 */
    attribution: string
    /** 参照した資料。**用語側の `sources` を集約したもの** */
    sources: string[]
    createdAt: string
    /** 説明。任意 */
    description?: string
}

export interface Dataset {
    kind: typeof DATASET_KIND
    formatVersion: number
    meta: DatasetMeta
    questions: Question[]
    glossary: { terms: Term[] }
}

export interface ValidationIssue {
    /** `error` は取り込みを止める。`warning` は続ける */
    level: 'error' | 'warning'
    /** 何の検査か。集計に使う */
    check: string
    message: string
}

export interface ValidateOptions {
    /**
     * 使ってよい国コード。`data/countries.json` の一覧を渡す。
     * **渡さなければ国の検査をしない**（空配列と未指定を区別する）。
     */
    knownCountries?: readonly string[]
}

/** 画像が紛れ込む書き方。**欄が無いことだけでは防げない** */
const IMAGE_PATTERNS: { re: RegExp, what: string }[] = [
    { re: /^data:image\//i, what: 'data: URL の画像' },
    { re: /^data:application\/octet-stream/i, what: 'data: URL のバイナリ' },
    // **文末だけを見ないこと。** 「例: bollard.jpg を見よ」のように文中に埋められる
    { re: /\.(png|jpe?g|gif|webp|bmp|tiff?)\b/i, what: '画像ファイルへの参照' },
    { re: /maps\.googleapis\.com\/maps\/api\/streetview/i, what: 'Street View 画像 API の URL' },
]

/** base64 で埋め込まれた大きな塊。拡張子も data: も無い形で入れられる */
const SUSPICIOUS_BASE64 = /^[A-Za-z0-9+/]{512,}={0,2}$/

/**
 * 配布物を検証する。**取り込む前に必ず通す。**
 *
 * `error` が 1 件でもあれば取り込まない。**部分的に入れない。**
 * 半分入った状態は、どちらのデータなのか分からなくなる。
 */
export function validateDataset(input: unknown, options: ValidateOptions = {}): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const err = (check: string, message: string) => issues.push({ level: 'error', check, message })
    const warn = (check: string, message: string) => issues.push({ level: 'warning', check, message })

    if (typeof input !== 'object' || input === null) {
        err('shape', 'オブジェクトではない')
        return issues
    }
    const d = input as Partial<Dataset>

    // ---- 形式 ----
    if (d.kind !== DATASET_KIND) {
        err('kind', `kind が "${DATASET_KIND}" ではない（${String(d.kind)}）`)
    }
    if (d.formatVersion !== DATASET_FORMAT_VERSION) {
        // **黙って読まない。** 上位バージョンを読むと、知らない意味を無視することになる
        err('formatVersion', `形式のバージョンが ${DATASET_FORMAT_VERSION} ではない（${String(d.formatVersion)}）`)
    }

    // ---- 由来とライセンス ----
    const meta = d.meta
    if (!meta || typeof meta !== 'object') {
        err('meta', 'meta が無い。**誰の何なのか分からないデータは配れない**')
    }
    else {
        for (const key of ['name', 'author', 'license', 'attribution'] as const) {
            if (!meta[key] || typeof meta[key] !== 'string' || !meta[key]!.trim()) {
                err('meta', `meta.${key} が空である`)
            }
        }
        if (!Array.isArray(meta.sources) || meta.sources.length === 0) {
            warn('meta', 'meta.sources が空である。**出典を辿れないデータになる**')
        }
    }

    // ---- 問題セット ----
    if (!Array.isArray(d.questions) || d.questions.length === 0) {
        err('questions', 'questions が空である')
    }

    // ---- 辞書 ----
    const terms = d.glossary?.terms
    if (!Array.isArray(terms) || terms.length === 0) {
        err('glossary', 'glossary.terms が空である。**用語 ID を解けないデータは配れない**')
    }

    if (issues.some((i) => i.level === 'error')) return issues

    const questions = d.questions as Question[]
    const termList = terms as Term[]

    // ---- pano ID と座標 ----
    const seenIds = new Set<string>()
    const seenPano = new Set<string>()
    for (const q of questions) {
        if (!q.id || typeof q.id !== 'string') { err('questions', 'id の無い出題がある'); continue }
        if (seenIds.has(q.id)) err('questions', `出題 id が重複している: ${q.id}`)
        seenIds.add(q.id)

        if (!q.panoId || typeof q.panoId !== 'string') {
            err('panoId', `${q.id}: panoId が無い。**保存してよいのは pano ID だけである**`)
        }
        else if (seenPano.has(q.panoId)) {
            warn('panoId', `${q.id}: 同じ panoId の出題が既にある`)
        }
        else seenPano.add(q.panoId)

        const f = q.fallback
        if (!f || typeof f.lat !== 'number' || typeof f.lng !== 'number') {
            warn('fallback', `${q.id}: fallback の座標が無い。**pano ID が失効したら復旧できない**`)
        }
        else if (f.lat < -90 || f.lat > 90 || f.lng < -180 || f.lng > 180) {
            err('fallback', `${q.id}: 座標が範囲外（${f.lat}, ${f.lng}）`)
        }

        if (!q.country || typeof q.country !== 'string') {
            err('country', `${q.id}: country が無い`)
        }
        else if (options.knownCountries && !options.knownCountries.includes(q.country)) {
            err('country', `${q.id}: 知らない国コード ${q.country}。**候補として選べない国は出題にできない**`)
        }
    }

    // ---- 用語 ID の参照整合性 ----
    const byId = new Map(termList.map((t) => [t.id, t]))
    if (byId.size !== termList.length) {
        err('glossary', '用語 ID が重複している')
    }
    for (const q of questions) {
        for (const slot of SLOT_IDS) {
            const entry = q.slots?.[slot]
            if (!entry) continue
            for (const id of entry.terms ?? []) {
                if (byId.has(id)) continue
                err('reference', `${q.id} / ${slot}: 用語 ID ${id} が辞書に無い`)
            }
        }
        for (const slot of q.decisiveSlots ?? []) {
            if (!SLOT_IDS.includes(slot as SlotId)) {
                warn('reference', `${q.id}: 知らない欄が decisiveSlots にある（${slot}）`)
            }
        }
    }

    // ---- 用語そのものの検査 ----
    for (const t of termList) {
        if (!Array.isArray(t.countries)) {
            err('glossary', `${t.id}: countries が配列ではない`)
            continue
        }
        if (t.countries.length === 0 && t.certainty !== 'unverified') {
            warn('glossary', `${t.id}: 該当国が空である。**絞り込みに使えない**`)
        }
        if (options.knownCountries) {
            for (const c of t.countries) {
                if (!options.knownCountries.includes(c)) {
                    warn('glossary', `${t.id}: 知らない国コード ${c}`)
                }
            }
        }
        if (t.source === 'reference' && (!t.sources || t.sources.length === 0)) {
            warn('glossary', `${t.id}: 出典を参照した用語なのに sources が空である`)
        }
    }

    // ---- 画像が入っていないこと ----
    for (const found of findImageLike(input)) {
        err('no-image', `${found.path}: ${found.what} が含まれている。**Street View の画像は保存できない**`)
    }

    return issues
}

/**
 * 中身を走査して画像らしいものを探す。
 *
 * **欄を用意しないことは、入っていないことの保証にならない。**
 * `note` や `plain` に data: URL を書けば入る。
 */
export function findImageLike(
    value: unknown,
    path = '$',
    out: { path: string, what: string }[] = [],
): { path: string, what: string }[] {
    if (typeof value === 'string') {
        for (const p of IMAGE_PATTERNS) {
            if (p.re.test(value)) { out.push({ path, what: p.what }); return out }
        }
        if (SUSPICIOUS_BASE64.test(value)) {
            out.push({ path, what: 'base64 らしい長い文字列' })
        }
        return out
    }
    if (Array.isArray(value)) {
        value.forEach((v, i) => findImageLike(v, `${path}[${i}]`, out))
        return out
    }
    if (typeof value === 'object' && value !== null) {
        for (const [k, v] of Object.entries(value)) findImageLike(v, `${path}.${k}`, out)
    }
    return out
}

/**
 * 出題が使っている用語だけに絞る。**辞書を丸ごと配らない選択肢を持つ。**
 *
 * ただし既定にはしない。**絞ると「次に見るべき欄」の計算が痩せる。**
 * 学習者が書いた語を対応づける先も減る。
 */
export function selectUsedTerms(questions: Question[], terms: Term[]): Term[] {
    const used = new Set<string>()
    for (const q of questions) {
        for (const slot of SLOT_IDS) {
            for (const id of q.slots?.[slot]?.terms ?? []) used.add(id)
        }
    }
    return terms.filter((t) => used.has(t.id))
}

/** 用語の `sources` を集めて meta に載せる。**出典を辿れる形にする** */
export function collectSources(terms: Term[]): string[] {
    const all = new Set<string>()
    for (const t of terms) for (const s of t.sources ?? []) all.add(s)
    return [...all].sort()
}

export interface MergeResult {
    questions: Question[]
    terms: Term[]
    addedQuestions: string[]
    skippedQuestions: string[]
    addedTerms: string[]
    /** 同じ ID で中身が違った用語。**上書きしない。人間が決める** */
    conflictedTerms: string[]
}

/**
 * 取り込む。**既存を上書きしない。**
 *
 * ID が衝突したときに新しい方で上書きすると、
 * **自分で直した用語が他人のデータで戻る。** 直せることが売りなのに、
 * 取り込みが直した内容を消すなら意味が無い。
 *
 * > **取り込みは足すだけにする。上書きは人間が決める。**
 *
 * 衝突は `conflictedTerms` で報告して、取り込み側が判断する。
 */
export function mergeDataset(
    existing: { questions: Question[], terms: Term[] },
    incoming: { questions: Question[], terms: Term[] },
): MergeResult {
    const qById = new Map(existing.questions.map((q) => [q.id, q]))
    const tById = new Map(existing.terms.map((t) => [t.id, t]))

    const addedQuestions: string[] = []
    const skippedQuestions: string[] = []
    const addedTerms: string[] = []
    const conflictedTerms: string[] = []

    for (const t of incoming.terms) {
        const old = tById.get(t.id)
        if (!old) { tById.set(t.id, t); addedTerms.push(t.id); continue }
        if (JSON.stringify(old) !== JSON.stringify(t)) conflictedTerms.push(t.id)
    }

    for (const q of incoming.questions) {
        if (qById.has(q.id)) { skippedQuestions.push(q.id); continue }
        qById.set(q.id, q)
        addedQuestions.push(q.id)
    }

    return {
        questions: [...qById.values()],
        terms: [...tById.values()],
        addedQuestions,
        skippedQuestions,
        addedTerms,
        conflictedTerms,
    }
}

// ============================================================
// ライブラリと進捗
// ============================================================

/**
 * ## アクティブなデータセットと、ライブラリを分ける
 *
 * 複数のデータセットを持てるようにするとき、
 * **全部を `data/questions.json` に混ぜる**のが最も安易な実装である。
 * それをやると 2 つ壊れる。
 *
 * ```
 * 1. どのデータセットの何問目なのかが言えなくなる
 * 2. 出典表示が混ざる。CC BY は作成者ごとに要る
 * ```
 *
 * だから分ける。
 *
 * ```
 * data/datasets/<id>/dataset.json   ライブラリ（取り込んだもの。読むだけ）
 * data/questions.json               アクティブ（道具が全部これを見る）
 * data/glossary.json                アクティブ
 * data/library.json                 一覧と、いま何が選ばれているか
 * ```
 *
 * **道具（`combo` / `coverage` / `normalize:keys` / `compare`）を書き換えないため**に
 * アクティブの置き場所を変えなかった。切り替えはライブラリからアクティブへの複製である。
 *
 * > **既にあるものを壊さずに層を足す。**
 */
export interface LibraryEntry {
    id: string
    name: string
    author: string
    license: string
    attribution: string
    questionCount: number
    termCount: number
    installedAt: string
    /** 配布物の作成時刻。同じ id で更新されたかを見る */
    createdAt: string
}

export interface Library {
    formatVersion: number
    /** いま `data/questions.json` に載っているデータセット。未選択は null */
    activeId: string | null
    entries: LibraryEntry[]
}

/**
 * 出題ごとの進捗。**データセットごとに持つ。**
 *
 * 混ぜると「何問目」が言えなくなる。
 */
export interface DatasetProgress {
    /** 出題の並び。**固定する。** 毎回並べ替えると「3 問目」が別の問題になる */
    order: string[]
    /** 回答済みの出題 ID。順序は回答順 */
    answered: string[]
}

export interface ProgressFile {
    formatVersion: number
    byDataset: Record<string, DatasetProgress>
}

export const LIBRARY_FORMAT_VERSION = 1
export const PROGRESS_FORMAT_VERSION = 1

/**
 * データセット ID を作る。**作成者と名前から決める。**
 *
 * 作成者を含めるのは、**同じ名前のデータセットが別人から来ることがある**ためである。
 * 「標準 10 問」は誰でも名付けられる。
 */
export function datasetId(author: string, name: string): string {
    const a = asciiSlug(author) || shortHash(author) || 'unknown'
    const n = asciiSlug(name) || shortHash(name) || 'dataset'
    return `${a}__${n}`
}

/**
 * **ASCII に限る。** この文字列はディレクトリ名になり、URL の一部にもなりうる。
 *
 * 日本語を残すと読みやすいが、**環境によって扱いが変わる場所に置く名前**である。
 * 読みやすさより、どこでも同じに動くことを採る。
 */
function asciiSlug(s: string): string {
    return s.normalize('NFKC')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
}

/**
 * **ID をパスに使う前に検証する。**
 *
 * データセット ID はディレクトリ名になる。取り込み API は ID を外から受け取れるので、
 * `../` を含む ID を渡されると `data/` の外に出られる。
 *
 * > **パスを組み立てる前に、組み立ててよい文字列かを確かめる。**
 *
 * `datasetId` が作る形（ASCII 小文字・数字・`-`・`_`・区切りの `__`）だけを通す。
 * **生成側と検証側を同じ場所に置く。** 離すと片方だけ変わる。
 */
export function isSafeDatasetId(id: string): boolean {
    if (!id || id.length > 96) return false
    if (id.includes('..') || id.includes('/') || id.includes('\\')) return false
    return /^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:__[a-z0-9]+(?:[-_][a-z0-9]+)*)?$/.test(id)
}

/**
 * 日本語だけの名前でも **決定的な** id を作るための短い指紋。
 *
 * ランダムにしない。**同じ名前からは同じ id が出る**必要がある
 * （同じデータセットを取り込み直したときに別物にならないため）。
 */
function shortHash(s: string): string {
    // **空文字に指紋は無い。** 呼び出し側の既定名へ落とす
    if (!s.trim()) return ''
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(36).padStart(7, '0').slice(0, 7)
}

/**
 * 次に出す出題と、それが何問目かを返す。
 *
 * **全部終わっていれば `null` を返す。** 先頭に戻さない。
 * 黙って 1 問目に戻すと「1 周した」ことが分からなくなる。
 */
export function nextQuestion(
    progress: DatasetProgress,
    availableIds: readonly string[],
): { questionId: string, index: number, total: number } | null {
    const available = new Set(availableIds)
    const answered = new Set(progress.answered)
    // **order にあって出題が消えているものは飛ばす。** 辞書と違い出題は差し替わる
    const order = progress.order.filter((id) => available.has(id))
    const total = order.length
    for (let i = 0; i < order.length; i++) {
        if (!answered.has(order[i]!)) return { questionId: order[i]!, index: i + 1, total }
    }
    return null
}

/** 進捗を初期化する。並びは渡された順を保つ */
export function initProgress(questionIds: readonly string[]): DatasetProgress {
    return { order: [...questionIds], answered: [] }
}

/**
 * 回答済みを記録する。**同じ出題を二重に数えない。**
 *
 * 再挑戦しても「回答済み」は 1 件である。
 * 何回やったかは `data/runs/` の記録が持っている。
 */
export function recordAnswered(progress: DatasetProgress, questionId: string): DatasetProgress {
    if (progress.answered.includes(questionId)) return progress
    return { ...progress, answered: [...progress.answered, questionId] }
}

/** 進捗の要約。UI と CLI で同じ数字を出すため、ここで計算する */
export function summarizeProgress(
    progress: DatasetProgress,
    availableIds: readonly string[],
): { answered: number, total: number, remaining: number, done: boolean } {
    const available = new Set(availableIds)
    const total = progress.order.filter((id) => available.has(id)).length
    const answered = progress.answered.filter((id) => available.has(id)).length
    return { answered, total, remaining: total - answered, done: total > 0 && answered >= total }
}

// ============================================================
// 回答ログの書き出し
// ============================================================

export const LOG_KIND = 'ggg-log'
export const LOG_FORMAT_VERSION = 1

/**
 * 配布できる回答ログ。**どのデータセットの何問目に何を書いたか。**
 *
 * ## 何を入れないか
 *
 * - **画像は入らない**（元々持っていない）
 * - **AI の生の応答（`rawContent`）は入れない。** 数十 KB あり、配って読むものではない
 * - **API キーは入らない**（記録に入れていない）
 *
 * ## 学習者の記述をどう扱うか
 *
 * `plain`（素人語の原文）は**本人が書いた文章**である。
 * これが入っていることに価値がある（他人の観察の言葉が読める）が、
 * **本人の意思で落とせるようにする。**
 *
 * `--anonymize` を付けると `plain` を落とし、用語 ID と判定だけを残す。
 *
 * > **公開の既定を「全部入り」にしない。**
 */
export interface LogEntry {
    questionId: string
    /** データセット内で何問目か */
    index: number | null
    ts: string
    variant: string
    /** 学習者の記述。`anonymize` で落ちる */
    slots: Record<string, { state: string, plain: string | null, terms: string[] }>
    candidates: { country: string, confidence: string }[]
    decisiveSlot: string | null
    /** 総合推論。`anonymize` で落ちる */
    reasoning: string | null
    /** コードが確定させた判定の要約。**AI の解釈は入れない** */
    judgement: {
        hit: boolean
        hitConfidence: string | null
        missedSlots: string[] | null
        blindSlots: string[] | null
        intersectionSize: number | null
        containsAnswer: boolean | null
    }
    /** 採点に使ったモデルと結果だけ。本文は入れない */
    models: { model: string, status: string }[]
}

export interface LogExport {
    kind: typeof LOG_KIND
    formatVersion: number
    meta: {
        datasetId: string
        datasetName: string
        datasetAttribution: string
        author: string
        exportedAt: string
        anonymized: boolean
        note: string
    }
    entries: LogEntry[]
}

export interface BuildLogOptions {
    datasetId: string
    datasetName: string
    datasetAttribution: string
    author: string
    /** 記述を落とすか */
    anonymize?: boolean
    /** 出題 ID → 何問目 */
    orderIndex?: Record<string, number>
}

/**
 * 記録から配布用のログを作る。**純粋な関数にしてテストを届かせる。**
 *
 * 入力は `data/runs/*.json` を読んだもの。形が緩いので `unknown` で受ける。
 */
export function buildLogExport(runs: unknown[], options: BuildLogOptions): LogExport {
    const anonymize = options.anonymize === true
    const entries: LogEntry[] = []

    for (const raw of runs) {
        if (typeof raw !== 'object' || raw === null) continue
        const r = raw as Record<string, any>
        const questionId = String(r.questionId ?? r.answer?.questionId ?? '')
        if (!questionId) continue

        const slots: LogEntry['slots'] = {}
        for (const [slot, e] of Object.entries(r.answer?.slots ?? {})) {
            const entry = e as Record<string, any>
            slots[slot] = {
                state: String(entry.state ?? 'unknown'),
                // **既定を「全部入り」にしない**の実装点
                plain: anonymize ? null : (entry.plain ?? null),
                terms: Array.isArray(entry.terms) ? entry.terms.map(String) : [],
            }
        }

        const j = r.result ?? {}
        entries.push({
            questionId,
            index: options.orderIndex?.[questionId] ?? null,
            ts: String(r.ts ?? ''),
            variant: String(r.variant ?? ''),
            slots,
            candidates: (r.answer?.candidates ?? []).map((c: Record<string, any>) => ({
                country: String(c.country),
                confidence: String(c.confidence),
            })),
            decisiveSlot: r.answer?.decisiveSlot ?? null,
            reasoning: anonymize ? null : (r.answer?.reasoning ?? null),
            judgement: {
                hit: j.hit === true,
                hitConfidence: j.hitConfidence ?? null,
                missedSlots: j.missedSlots ?? null,
                blindSlots: j.blindSlots ?? null,
                intersectionSize: j.intersection?.countries?.length ?? null,
                containsAnswer: j.intersection?.containsAnswer ?? null,
            },
            // **生の応答は入れない。** 数十 KB あり、配って読むものではない
            models: (j.models ?? []).map((m: Record<string, any>) => ({
                model: String(m.model),
                status: String(m.status),
            })),
        })
    }

    entries.sort((a, b) => (a.index ?? 1e9) - (b.index ?? 1e9) || a.ts.localeCompare(b.ts))

    return {
        kind: LOG_KIND,
        formatVersion: LOG_FORMAT_VERSION,
        meta: {
            datasetId: options.datasetId,
            datasetName: options.datasetName,
            datasetAttribution: options.datasetAttribution,
            author: options.author,
            exportedAt: new Date().toISOString(),
            anonymized: anonymize,
            note: anonymize
                ? '記述（plain / reasoning）を落としてある。用語 ID と判定だけが入っている。'
                : '**学習者本人が書いた文章が入っている。** 公開する前に中身を読むこと。',
        },
        entries,
    }
}

/**
 * 配布用ログを検証する。**取り込む前ではなく、公開する前に通す。**
 *
 * 見るのは 2 点である。
 * - 画像が入っていないか（`data:` URL を貼られる余地がある）
 * - **API キーらしい文字列が入っていないか**
 */
export function validateLogExport(input: unknown): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    if (typeof input !== 'object' || input === null) {
        return [{ level: 'error', check: 'shape', message: 'オブジェクトではない' }]
    }
    const l = input as Partial<LogExport>
    if (l.kind !== LOG_KIND) {
        issues.push({ level: 'error', check: 'kind', message: `kind が "${LOG_KIND}" ではない` })
    }
    if (l.formatVersion !== LOG_FORMAT_VERSION) {
        issues.push({ level: 'error', check: 'formatVersion', message: '形式のバージョンが合わない' })
    }
    if (!Array.isArray(l.entries) || l.entries.length === 0) {
        issues.push({ level: 'error', check: 'entries', message: 'entries が空である' })
    }
    if (!l.meta?.datasetAttribution?.trim()) {
        issues.push({ level: 'error', check: 'meta', message: 'datasetAttribution が空である。**どのデータセットのログか分からない**' })
    }
    for (const found of findImageLike(input)) {
        issues.push({ level: 'error', check: 'no-image', message: `${found.path}: ${found.what}` })
    }
    for (const found of findSecretLike(input)) {
        issues.push({ level: 'error', check: 'no-secret', message: `${found.path}: ${found.what}` })
    }
    if (l.meta && l.meta.anonymized === false) {
        issues.push({
            level: 'warning',
            check: 'privacy',
            message: '**学習者本人が書いた文章が入っている。** 公開する前に中身を読むこと（--anonymize で落とせる）',
        })
    }
    return issues
}

/** 資格情報らしい文字列。**公開物に混ぜないためだけに使う** */
const SECRET_PATTERNS: { re: RegExp, what: string }[] = [
    // **区切りを跨げること。** `sk_live_...` や `Bearer ...` の形で書かれる
    { re: /\b(sk|api|key|token|secret|bearer)[-_\s:=]{0,3}[A-Za-z0-9_-]{16,}/i, what: 'API キーらしい文字列' },
    { re: /\bAIza[0-9A-Za-z_-]{30,}/, what: 'Google API キーらしい文字列' },
    { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, what: '秘密鍵' },
]

export function findSecretLike(
    value: unknown,
    path = '$',
    out: { path: string, what: string }[] = [],
): { path: string, what: string }[] {
    if (typeof value === 'string') {
        for (const p of SECRET_PATTERNS) {
            if (p.re.test(value)) { out.push({ path, what: p.what }); return out }
        }
        return out
    }
    if (Array.isArray(value)) {
        value.forEach((v, i) => findSecretLike(v, `${path}[${i}]`, out))
        return out
    }
    if (typeof value === 'object' && value !== null) {
        for (const [k, v] of Object.entries(value)) findSecretLike(v, `${path}.${k}`, out)
    }
    return out
}
