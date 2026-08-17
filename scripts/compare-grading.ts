/**
 * v1 / v2 比較の実行（タスク 26）
 *
 * ## v1 は再実行しない
 *
 * `data/runs/` に**実際にプレイした v1 の記録が既にある**（2026-08-07〜08-10）。
 * 同じ入力で v1 をもう一度投げても同じ条件の再現にしかならず、**得るものがない。**
 *
 * したがってこのスクリプトが投げるのは **v2 だけ**である。
 *
 * ## 同じ入力の反復は無駄ではない（既定は全件）
 *
 * 同じ出題の記録が複数ある。当初これを「同じ入力に枠を二重に使う」と考えて
 * 出題ごとに 1 件へ絞った。**判断が逆だった。**
 *
 * この記事の実測は**すべて 1 問 1 モデル 1 回**である。
 * 「4 モデルが 7 種類の壊れ方をした」と書いたが、それが
 * **モデルの性質なのか、その 1 回の揺れなのか区別できていない。**
 *
 * 同じ入力を 2 回投げれば、そこだけは区別できる。
 * `q-jp-01` と `q-kz-01` は過去の回答を読み込む機能で再投入したため
 * **入力が完全に同一の記録が 2 件ずつある。** 反復として使える。
 *
 * > **枠を節約して n=1 のままにするより、使って n=2 にする方が価値がある。**
 *
 * 記録 13 件 × （正規化 1 + モデル 4）= **65 リクエスト**である。
 * `--unique` で出題ごとに 1 件（50）に絞れる。
 *
 * ## 転送方式を v1 に揃える（`stream: true`）
 *
 * 当初は `stream: false` にして「転送方式を揃える」と書いていた。**揃っていなかった。**
 * **v1 の記録は画面から取っており、画面はストリーミングである。**
 *
 * ストリーミングと非ストリーミングでは打ち切りの起き方が変わる（実測 2026-08-07）。
 * つまり `stream: false` は**v1 と v2 の差に転送方式の差を混ぜていた。**
 *
 * さらに非ストリーミングでは 2 つ失う。
 *
 * - **モデルが直列になる。** 1 記録 265 秒（4 + 117 + 25 + 119）
 * - **空白の早期打ち切りが効かない。** チャンクを見られないため
 *   `max_tokens` を使い切るまで止まらない（`gemma` が 117 秒。
 *   ストリーミングなら 8.6 秒で止まる）
 *
 * > **速くするために直列をやめたのではない。v1 と同じ条件にしたら速くなった。**
 *
 * ## 前提
 *
 * 1. `npm run dev` で開発サーバが動いていること（既定 http://localhost:3000）
 * 2. `.env` に `SAKURA_AI_TOKEN` があること
 * 3. `data/questions.json` に正解タグが入っていること
 *    （全スロット `unknown` の出題は API が 409 で拒否する）
 *
 * 使い方（`--dry-run` で消費数を先に見る）:
 *   npm run compare -- --dry-run                消費数だけ表示する
 *   npm run compare                             全件（記録 13 件 = 65）
 *   npm run compare -- --unique                 出題ごとに 1 件（10 問 = 50）
 *   npm run compare -- --skip-graded            v2 済みの出題を飛ばす
 *   npm run compare -- --jobs 2                 記録を 2 件同時に流す（**条件が変わる**）
 *
 * 読むのは `npm run read:v2`（消費 0）。`docs/v2-feedback-read.md` に書き出す。
 */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Question, RunRecord } from '../shared/types'
import { COMPARISON_MODELS, displayName } from '../shared/models'
// NDJSON の切り出しは画面と同じものを使う。**二重に書かない**
import { createNdjsonParser } from '../shared/grading-stream'
import { resolveBaseUrl } from './lib/base-url'

/**
 * 接続先。**実行前に 1 回だけ確認する。**
 *
 * 決め打ちにしていたため、開発サーバが 3001 に居たときに
 * `fetch failed` を 10 回並べて終わった（2026-08-17、`normalize-answer-keys.ts`）。
 * 同じ作りだったのでここも直した。
 */
let BASE_URL = 'http://localhost:3000'
const RUNS_DIR = join('data', 'runs')
const OUT_DIR = join('data', 'compare')
const REPORT_PATH = join('docs', 'v1-v2-comparison.md')

/**
 * 比較対象のモデル。**`shared/models.ts` が唯一の定義である。**
 *
 * ここに書き写していたため `preview/` の接頭辞が抜け、
 * **4 モデルのうち 3 つが全件 400 になった**（実測 2026-08-17）。
 */
const MODELS: string[] = [...COMPARISON_MODELS]

const dryRun = process.argv.includes('--dry-run')
/**
 * **既定は全件である。同じ入力の反復を残す。**
 *
 * `--unique` を付けると出題ごとに最新の 1 件へ絞る（10 問 = 50 リクエスト）。
 * 枠が足りないときのための逃げ道であり、**既定にすべきではない。**
 * 反復が無いと「モデルの性質」と「その 1 回の揺れ」を区別できない。
 */
const useAll = !process.argv.includes('--unique')
/** 既に v2 で採点した出題を飛ばす。やり直しで枠を使わないため */
const skipGraded = process.argv.includes('--skip-graded')

/**
 * 同時に流す**記録**の数（既定 1）。モデル 4 件は常に並列である。
 *
 * ## なぜ既定を 1 にするか
 *
 * `--jobs 2` にすると同時に 8 本の呼び出しが飛ぶ。
 * **同時実行数の上限を測っていない**（タスク 26.2 が未実行）。
 * 超えると 429 が返る。429 は 4xx なので**枠は消費しない**が、
 * その記録は失敗して投げ直しになる。
 *
 * v1 の記録は画面から取っており、**画面は 1 記録ずつ・モデル 4 並列**である。
 * `--jobs 1` がその条件と一致する。**上げると条件がずれる。**
 *
 * 待ち時間を縮めたいときだけ上げる。**比較の条件を変えていることを自覚して使う。**
 */
const jobsArg = process.argv.indexOf('--jobs')
const JOBS = jobsArg >= 0 ? Math.max(1, Math.min(4, Number(process.argv[jobsArg + 1]) || 1)) : 1

// ============================================================
// v1 の記録を読む
// ============================================================

async function loadV1Runs(): Promise<RunRecord[]> {
    let names: string[]
    try {
        names = (await readdir(RUNS_DIR)).filter((n) => n.endsWith('.json')).sort()
    }
    catch {
        throw new Error(`${RUNS_DIR} が無い。v1 のプレイ記録が必要である`)
    }

    const runs: RunRecord[] = []
    for (const name of names) {
        const record = JSON.parse(await readFile(join(RUNS_DIR, name), 'utf8')) as RunRecord
        if (record.variant !== 'v1') continue
        runs.push(record)
    }
    return runs
}

/** 既に v2 で採点した出題 ID。**同じ入力に二度枠を使わない** */
async function loadV2Graded(): Promise<Set<string>> {
    const graded = new Set<string>()
    let names: string[]
    try {
        names = (await readdir(RUNS_DIR)).filter((n) => n.endsWith('.json'))
    }
    catch {
        return graded
    }
    for (const name of names) {
        const record = JSON.parse(await readFile(join(RUNS_DIR, name), 'utf8')) as RunRecord
        if (record.variant === 'v2') graded.add(record.questionId)
    }
    return graded
}

/**
 * 出題ごとに 1 件へ絞る。**同じ入力に枠を二重に使わない。**
 *
 * `sort()` した名前順（= 時刻順）に読んでいるので、後に来たものが新しい。
 * **新しい方を採る**（やり直した記録の方が入力が整っている）。
 */
function dedupeByQuestion(runs: RunRecord[]): RunRecord[] {
    const latest = new Map<string, RunRecord>()
    for (const run of runs) latest.set(run.questionId, run)
    return [...latest.values()]
}

async function loadQuestions(): Promise<Map<string, Question>> {
    const list = JSON.parse(await readFile(join('data', 'questions.json'), 'utf8')) as Question[]
    return new Map(list.map((q) => [q.id, q]))
}

/** 正解タグが 1 つでも入っているか。入っていなければ v2 を投げても意味がない */
function isTagged(question: Question | undefined): boolean {
    if (!question) return false
    return Object.values(question.slots).some((s) => s.state !== 'unknown')
}

// ============================================================
// v2 を投げる
// ============================================================

interface GradeResponse {
    requestsConsumed: number
    judgement: Record<string, unknown>
    question: { id: string, country: string, region: string | null }
    models: {
        model: string
        status: 'ok' | 'truncated' | 'error'
        feedback: Record<string, unknown> | null
        finishReason: string | null
        structuredMode: string | null
        totalMs: number
        error: string | null
        /** 無償枠を消費したか。**古い記録には無い**（`undefined` を `false` と読まない） */
        billed?: boolean
    }[]
    runFile: string
}

/**
 * 学習者の観察メモを正規化する。**v2 の絞り込み計算はこれがないと動かない。**
 *
 * v1 は辞書を持たないため正規化していない（`terms` が空）。
 * その状態で v2 に渡すと絞り込み力・積集合・次に見るべきスロットが
 * **全部「算出不能」になる**（実測 2026-08-17）。
 *
 * **判定は AI を使わない。しかし判定の入力を作るのに AI が必要である。**
 * 1 レコードにつき 1 リクエスト消費する。
 *
 * 失敗しても採点は続ける。正規化なしの v2（正解タグはあるが用語 ID がない）になる。
 */
async function normalizeSlots(record: RunRecord): Promise<{
    slots: RunRecord['answer']['slots']
    consumed: number
    ok: boolean
}> {
    const response = await fetch(`${BASE_URL}/api/normalize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slots: record.answer.slots, questionId: record.questionId }),
    })
    if (!response.ok) return { slots: record.answer.slots, consumed: 1, ok: false }

    const body = (await response.json()) as {
        requestsConsumed: number
        ok: boolean
        slots: { slot: keyof RunRecord['answer']['slots'], terms: string[] }[]
    }
    if (!body.ok) return { slots: record.answer.slots, consumed: body.requestsConsumed, ok: false }

    const slots = structuredClone(record.answer.slots)
    for (const entry of body.slots) {
        if (entry.terms.length) slots[entry.slot].terms = entry.terms
    }
    return { slots, consumed: body.requestsConsumed, ok: true }
}

/**
 * v2 を投げる。**ストリーミングを使う。**
 *
 * ## 当初は非ストリーミングにしていた。誤りだった
 *
 * 「転送方式を揃える」と書いて `stream: false` にしていたが、
 * **v1 の記録は画面から取っており、画面はストリーミングである。**
 * 揃えるつもりで揃っていなかった。
 *
 * 非ストリーミングにすると 3 つ壊れる。
 *
 * | | 非ストリーミング | ストリーミング（v1 と同じ） |
 * |---|---|---|
 * | モデルの実行 | **直列**（1 件 265 秒） | **並列**（1 件 = 最も遅いモデル） |
 * | 空白の早期打ち切り | **効かない**（チャンクを見られない） | 効く（512 字で止める） |
 * | v1 との比較 | **転送方式が違う** | 同じ |
 *
 * 早期打ち切りが効かないのが一番悪い。`gemma` が空白を吐き続けても
 * `max_tokens` を使い切るまで止まらない。**実測で 117 秒かかった**
 * （ストリーミングなら 8.6 秒で止まる）。
 *
 * > **速くするために直列をやめたのではない。v1 と同じ条件にしたら速くなった。**
 */
async function gradeV2(
    record: RunRecord,
    slots: RunRecord['answer']['slots'],
    onModelDone?: (result: GradeResponse['models'][number]) => void,
): Promise<GradeResponse> {
    const response = await fetch(`${BASE_URL}/api/grade`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            questionId: record.questionId,
            variant: 'v2',
            slots,
            candidates: record.answer.candidates,
            decisiveSlot: record.answer.decisiveSlot,
            reasoning: record.answer.reasoning,
            models: MODELS,
            // **v1 と同じ経路にする。** 画面もこれを使っている
            stream: true,
        }),
    })
    if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`)
    }
    if (!response.body) throw new Error('ストリームの本文が無い')

    const models: GradeResponse['models'] = []
    let judgement: Record<string, unknown> = {}
    let question: GradeResponse['question'] = { id: record.questionId, country: '', region: null }
    let runFile = ''

    const parser = createNdjsonParser((event) => {
        if (event.type === 'judgement') {
            judgement = event.judgement as unknown as Record<string, unknown>
            question = event.question
        }
        else if (event.type === 'result') {
            // **index で並べる。** 完了順に詰めるとモデルの順序が実行ごとに変わる
            const result = event.result as unknown as GradeResponse['models'][number]
            models[event.index] = result
            onModelDone?.(result)
        }
        else if (event.type === 'done') {
            runFile = event.runFile
        }
        // progress は捨てる。**進捗は画面のためのものであり、集計には使わない**
    })

    const decoder = new TextDecoder()
    const reader = response.body.getReader()
    for (; ;) {
        const { done, value } = await reader.read()
        if (done) break
        parser.push(decoder.decode(value, { stream: true }))
    }
    parser.flush()

    const received = models.filter(Boolean)
    if (received.length === 0) throw new Error('result イベントが 1 件も届かなかった')

    return {
        /**
         * **実際に消費した数を数える。** `judgement` イベントが先に流す
         * `requestsConsumed` はモデル数の見積りであり、4xx を含む。
         */
        requestsConsumed: received.filter((m) => m.billed !== false).length,
        judgement,
        question,
        models: received,
        runFile,
    }
}

// ============================================================
// 集計
// ============================================================

/**
 * 入力の指紋。**「同じ入力を 2 回投げた」と言うには、同じであることを確かめる必要がある。**
 *
 * `q-is-01` の 2 件は 2 分差の別プレイであり、入力が同一とは限らない。
 * 一方 `q-jp-01` と `q-kz-01` は過去の回答を読み込んで再投入したので同一である。
 * **区別せずに並べると、揺れと入力差を混ぜてしまう。**
 */
function answerFingerprint(record: RunRecord): string {
    return JSON.stringify({
        slots: record.answer.slots,
        candidates: record.answer.candidates,
        decisiveSlot: record.answer.decisiveSlot,
        reasoning: record.answer.reasoning,
    })
}

interface Row {
    questionId: string
    runId: string
    /** 入力の指紋。同一なら反復として扱える */
    inputKey: string
    model: string
    v1Status: string
    v1FinishReason: string | null
    v1JudgmentUnavailable: boolean | null
    v1MissedCluesCount: number | null
    v2Status: string
    v2FinishReason: string | null
    v2JudgmentUnavailable: boolean | null
    v2MissedCluesCount: number | null
}

function countArray(value: unknown): number | null {
    return Array.isArray(value) ? value.length : null
}

async function main() {
    const allRuns = await loadV1Runs()
    const questions = await loadQuestions()
    const graded = await loadV2Graded()

    const runs = useAll ? allRuns : dedupeByQuestion(allRuns)
    const deduped = allRuns.length - runs.length

    const tagged = runs.filter((r) => isTagged(questions.get(r.questionId)))
    const skipped = runs.filter((r) => !isTagged(questions.get(r.questionId)))
    const alreadyGraded = skipGraded ? tagged.filter((r) => graded.has(r.questionId)) : []
    const targets = skipGraded ? tagged.filter((r) => !graded.has(r.questionId)) : tagged

    // **開発サーバの API を呼ぶ。** 止めた状態では動かない
    console.log('**`npm run dev` を起動したまま、別のターミナルで実行する。**')
    console.log('')
    console.log(`v1 の記録 ${allRuns.length} 件`)
    if (deduped > 0) {
        console.log(`  **--unique のため同じ出題の重複を外した: ${deduped} 件**（反復が無いと揺れを測れない）`)
    }
    if (useAll) {
        const repeats = new Map<string, RunRecord[]>()
        for (const r of allRuns) repeats.set(r.questionId, [...(repeats.get(r.questionId) ?? []), r])
        const repeated = [...repeats.entries()].filter(([, list]) => list.length > 1)
        if (repeated.length) {
            console.log('  同じ出題を複数回投げる（**入力が同一の組だけが反復として使える**）')
            for (const [id, list] of repeated) {
                const same = new Set(list.map(answerFingerprint)).size === 1
                console.log(`    ${id}×${list.length}  入力: ${same ? '同一 → 反復として使える' : '**ちがう** → 別プレイ。揺れの測定には使えない'}`)
            }
        }
    }
    if (alreadyGraded.length) {
        console.log(`  **既に v2 で採点済みのため飛ばす: ${alreadyGraded.length} 件**`)
        for (const r of alreadyGraded) console.log(`    ${r.questionId}`)
    }
    else if (!skipGraded && graded.size) {
        console.log(`  （v2 済みの出題が ${graded.size} 件ある。飛ばすなら --skip-graded）`)
    }
    console.log(`  タグ済みで v2 を投げられる: ${targets.length} 件`)
    if (skipped.length) {
        console.log(`  **タグ未記入のため飛ばす: ${skipped.length} 件**`)
        for (const r of skipped) console.log(`    ${r.questionId}（${r.id}）`)
        console.log('  → docs/tag-drafts.md から data/questions.json に反映すること')
    }
    console.log('')
    console.log(`モデル ${MODELS.length} 件: ${MODELS.join(', ')}`)
    console.log('')
    console.log('転送はストリーミング（**v1 の記録と同じ経路**）。モデル 4 件は並列に流れる。')
    console.log(`同時に流す記録: ${JOBS} 件`
        + (JOBS > 1
            ? `　→ **同時に ${JOBS * MODELS.length} 本の呼び出しが飛ぶ。v1 の条件（1 記録ずつ）とは違う**`
            : '（v1 の条件と同じ。--jobs で増やせるが条件が変わる）'))
    console.log(`所要時間の目安: 1 記録が最も遅いモデルの時間（実測 119 秒）なので、`
        + `**${Math.ceil(targets.length / JOBS * 130 / 60)} 分**前後`)
    console.log('')
    console.log('| 用途 | 1 件あたり | 合計 |')
    console.log(`| 観察メモの正規化 | 1 | ${targets.length} |`)
    console.log(`| v2 の採点 | ${MODELS.length} | ${targets.length * MODELS.length} |`)
    console.log(`**消費するリクエスト数: ${targets.length * (MODELS.length + 1)}**`)
    console.log('')
    console.log('**正規化は省略できない。** v1 は辞書を持たないため terms が空であり、')
    console.log('そのまま v2 に渡すと絞り込み力・積集合・次に見るべきスロットが全部「算出不能」になる。')
    console.log('先に npx vite-node scripts/normalize-answer-keys.ts を実行して正解タグ側も埋めること。')

    /**
     * **モデル ID が v1 の記録と一致するか。投げる前に確かめる。**
     *
     * 実測（2026-08-17）。`preview/` の接頭辞が抜けたリストで 65 リクエストを開始し、
     * **4 モデルのうち 3 つが全件 400 になった。**
     *
     * このとき画面には `v1=記録なし` と出ていた。**1 件目から出ていた。**
     * 突き合わせる相手が居ないのだから、ID が違うと分かる情報だった。
     * それを表示しながら 5 件分投げ続けた。
     *
     * > **異常を表示することと、異常で止まることは別である。**
     *
     * 記録に無いモデル ID があれば**1 件も投げずに終わる。** 確認は消費 0 でできる。
     */
    const recordedModels = new Set(allRuns.flatMap((r) => r.result.models.map((m) => m.model)))
    const unknownModels = MODELS.filter((m) => !recordedModels.has(m))
    console.log('')
    if (unknownModels.length) {
        console.log('**モデル ID が v1 の記録に無い。1 件も投げずに終わる。**')
        console.log('')
        for (const m of unknownModels) console.log(`  無い: ${m}`)
        console.log('')
        console.log('  記録にあるモデル ID:')
        for (const m of [...recordedModels].sort()) console.log(`    ${m}`)
        console.log('')
        console.log('`shared/models.ts` の COMPARISON_MODELS を直すこと。')
        console.log('**`preview/` の接頭辞は提供側の名前空間である。落としてはならない。**')
        process.exitCode = 1
        return
    }
    console.log(`モデル ID は v1 の記録と一致した（${MODELS.length} 件）。突き合わせできる`)

    if (dryRun) {
        console.log('')
        console.log('--dry-run のため実行しない')
        return
    }
    if (targets.length === 0) {
        console.log('')
        console.log('投げる対象が無い。終了する')
        return
    }

    // **55 リクエスト投げる前に接続を確認する。** 繋がらなければ 1 件も投げない
    const probed = await resolveBaseUrl()
    BASE_URL = probed.baseUrl
    console.log('')
    console.log(`接続先: ${BASE_URL}（出題 ${probed.questionCount} 件を確認）`)

    await mkdir(OUT_DIR, { recursive: true })

    const rows: Row[] = []
    let consumed = 0
    let normalizeFailed = 0
    /** 以降を投げないための旗。接続断と最初の全滅で立てる */
    let stop = false
    let completed = 0

    /**
     * 1 記録分の処理。**ログは溜めてから一度に出す。**
     *
     * `--jobs 2` 以上では複数の記録が同時に進む。行ごとに出すと
     * **どの記録の行なのか分からなくなる。** まとめて出せば読める。
     */
    async function processRecord(record: RunRecord, index: number): Promise<void> {
        const out: string[] = ['', `[${index + 1}/${targets.length}] ${record.questionId}（${record.id}）`]
        const flush = () => console.log(out.join('\n'))

        // ---- 1. 観察メモの正規化。**絞り込み計算の入力を作る** ----
        let slots = record.answer.slots
        try {
            const normalized = await normalizeSlots(record)
            consumed += normalized.consumed
            slots = normalized.slots
            const filled = Object.entries(slots).filter(([, v]) => v.terms.length).length
            out.push(`  正規化 ${normalized.ok ? 'ok' : '失敗'} / 用語 ID が入ったスロット ${filled} 件`)
            if (!normalized.ok) normalizeFailed += 1
        }
        catch (error) {
            // **正規化の失敗で採点まで止めない。** 正解タグはあるので v2 の一部は動く
            normalizeFailed += 1
            out.push(`  正規化に失敗した: ${error instanceof Error ? error.message : String(error)}`)
        }

        // ---- 2. v2 の採点。**モデル 4 件は並列に流れる（v1 と同じ）** ----
        let response: GradeResponse
        try {
            response = await gradeV2(record, slots)
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            out.push(`  失敗: ${message}`)
            // **接続が切れたなら残りも失敗する。同じ失敗を並べない**
            if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
                out.push(`${BASE_URL} への接続が切れた。開発サーバを確認すること`)
                stop = true
            }
            flush()
            return
        }
        consumed += response.requestsConsumed
        completed += 1

        const v1ByModel = new Map(record.result.models.map((m) => [m.model, m]))
        for (const v2Model of response.models) {
            const v1Model = v1ByModel.get(v2Model.model)
            rows.push({
                questionId: record.questionId,
                runId: record.id,
                inputKey: answerFingerprint(record),
                model: v2Model.model,
                v1Status: v1Model?.status ?? '記録なし',
                v1FinishReason: v1Model?.finishReason ?? null,
                v1JudgmentUnavailable: v1Model?.feedback?.judgmentUnavailable ?? null,
                v1MissedCluesCount: countArray(v1Model?.feedback?.missedClues),
                v2Status: v2Model.status,
                v2FinishReason: v2Model.finishReason,
                v2JudgmentUnavailable:
                    (v2Model.feedback?.judgmentUnavailable as boolean | undefined) ?? null,
                v2MissedCluesCount: countArray(v2Model.feedback?.missedClues),
            })
            out.push(
                `  ${displayName(v2Model.model).padEnd(18)} v1=${(v1Model?.status ?? '記録なし').padEnd(9)} → v2=${v2Model.status
                }（${Math.round(v2Model.totalMs / 1000)} 秒）`
                // **error の理由を出す。** 「error（0 秒）」だけでは何が起きたか分からない
                + (v2Model.error ? `\n      理由: ${v2Model.error.slice(0, 300)}` : ''),
            )
        }

        /**
         * **最初に完了した記録で失敗したモデルがあれば、そこで止める。**
         *
         * 実測（2026-08-17）。3 モデルが 1 件目から `error（0 秒）` を返していたのに
         * 6 件目まで進み、**同じ失敗を 15 回並べた。**
         *
         * 0 秒の error は入力側の誤りである（モデル ID、スキーマ、権限）。
         * **回数を増やしても直らない。** 止めて原因を直す方が速い。
         *
         * > **同じ失敗を並べない。** 接続断で止めるのと同じ判断である。
         */
        if (completed === 1) {
            const failed = response.models.filter((m) => m.status === 'error')
            if (failed.length) {
                out.push('')
                out.push(`**最初に完了した記録で ${failed.length} / ${response.models.length} モデルが error になった。ここで止める。**`)
                for (const m of failed) {
                    out.push(`  ${m.model}: ${m.error ?? '理由なし'}`)
                }
                out.push('')
                out.push('0 秒の error は入力側の誤りである（モデル ID、スキーマ、権限）。')
                out.push('**回数を増やしても直らない。** 原因を直してから再実行すること。')
                out.push(`ここまでの消費: ${consumed}　実際に送ったかは npm run usage:report で確認できる`)
                stop = true
                flush()
                return
            }
        }

        // 対応づけた生データを残す。**打ち切りでも捨てない**
        await writeFile(
            join(OUT_DIR, `${record.questionId}_${record.id}.json`),
            `${JSON.stringify(
                {
                    questionId: record.questionId,
                    runId: record.id,
                    // **v1 の生の回答（terms が空）と正規化後を両方残す。**
                    // 「v2 が良かった」の原因が正解タグか正規化かを後から切り分けるため
                    answer: record.answer,
                    normalizedSlots: slots,
                    v1: { judgement: stripModels(record.result), models: record.result.models },
                    v2: { judgement: response.judgement, models: response.models },
                },
                null,
                2,
            )}\n`,
            'utf8',
        )
        flush()
    }

    /**
     * ワーカープール。**取り出しは 1 か所で行う。**
     *
     * 記録を等分して割り当てると、遅い記録に当たった側だけが最後まで残る。
     * 空いた順に次を取る形にすれば待ちが偏らない。
     */
    let next = 0
    const worker = async () => {
        for (; ;) {
            if (stop) return
            const index = next++
            const record = targets[index]
            if (!record) return
            await processRecord(record, index)
        }
    }
    await Promise.all(Array.from({ length: Math.min(JOBS, targets.length) }, worker))

    await writeReport(rows, consumed, skipped.length, normalizeFailed)
    console.log('')
    console.log(`消費したリクエスト数: ${consumed}`)
    if (normalizeFailed) console.log(`**正規化に失敗した記録: ${normalizeFailed} 件**（絞り込み計算が算出不能になる）`)
    console.log(`保存先: ${OUT_DIR}/`)
    console.log(`集計: ${REPORT_PATH}`)
}

/** 判定部だけを取り出す。`models` を二重に持たせない */
function stripModels(result: RunRecord['result']) {
    const { models: _models, ...judgement } = result
    return judgement
}

// ============================================================
// レポート
// ============================================================

async function writeReport(
    rows: Row[],
    consumed: number,
    skipped: number,
    normalizeFailed: number,
) {
    const byModel = new Map<string, Row[]>()
    for (const row of rows) {
        const list = byModel.get(row.model) ?? []
        list.push(row)
        byModel.set(row.model, list)
    }

    const lines: string[] = [
        '# v1 / v2 比較（タスク 26）',
        '',
        `生成日時: ${new Date().toISOString()}`,
        `消費したリクエスト数: ${consumed}（正規化 + v2 の採点。`
        + '**v1 は既存のプレイ記録を使い、再実行していない**）',
        skipped ? `タグ未記入で飛ばした記録: ${skipped} 件` : '',
        normalizeFailed
            ? `**正規化に失敗した記録: ${normalizeFailed} 件。** 絞り込み計算が算出不能になっている`
            : '',
        '',
        '## 正規化を挟んでいる理由',
        '',
        'v2 の目玉は絞り込み力・積集合・次に見るべきスロットである。',
        'これらはコードが集合演算で計算するが、**入力は用語 ID（`terms`）である。**',
        '',
        'v1 は辞書を持たないため正規化していない（`terms` が空）。',
        'そのまま v2 に渡すと計算結果が全部「算出不能」になる（実測 2026-08-17）。',
        '',
        '**判定は AI を使わない。しかし判定の入力を作るのに AI が必要である。**',
        '責務境界は「AI を使わない」ではなく「AI の出力を判定に使わない」である。',
        '',
        '## 成功率',
        '',
        '**打ち切り（`truncated`）を成功に数えない。** HTTP 200 で返るが JSON は完成していない。',
        '',
        '| モデル | v1 成功 | v1 打ち切り | v1 エラー | v2 成功 | v2 打ち切り | v2 エラー |',
        '|---|---|---|---|---|---|---|',
    ].filter((l) => l !== '')

    const count = (list: Row[], key: 'v1Status' | 'v2Status', value: string) =>
        list.filter((r) => r[key] === value).length

    for (const [model, list] of byModel) {
        lines.push(
            `| ${displayName(model)} | ${count(list, 'v1Status', 'ok')} | ${count(list, 'v1Status', 'truncated')} | ${count(list, 'v1Status', 'error')
            } | ${count(list, 'v2Status', 'ok')} | ${count(list, 'v2Status', 'truncated')} | ${count(list, 'v2Status', 'error')} |`,
        )
    }

    lines.push(
        '',
        '## 見落とし判定の有無',
        '',
        'v1 は正解タグを持たないため `judgmentUnavailable` が `true` になるべきである。',
        '**`false` を返した場合、AI は与えられていない情報について語っている。**',
        '',
        '| 問 | モデル | v1 judgmentUnavailable | v1 missedClues 件数 | v2 judgmentUnavailable | v2 missedClues 件数 |',
        '|---|---|---|---|---|---|',
    )

    const show = (v: boolean | null) => (v === null ? '—' : v ? 'true' : '**false**')
    const num = (v: number | null) => (v === null ? '—' : String(v))
    for (const row of rows) {
        lines.push(
            `| ${row.questionId} | ${row.model} | ${show(row.v1JudgmentUnavailable)} | ${num(row.v1MissedCluesCount)
            } | ${show(row.v2JudgmentUnavailable)} | ${num(row.v2MissedCluesCount)} |`,
        )
    }

    /**
     * **同じ入力を 2 回投げたときに同じ結果になったか。**
     *
     * この記事の実測はすべて 1 問 1 モデル 1 回だった。
     * 「4 モデルが 7 種類の壊れ方をした」と書いたが、それが
     * **モデルの性質なのか、その 1 回の揺れなのか区別できていない。**
     *
     * `q-jp-01` と `q-kz-01` は過去の回答を読み込む機能で再投入したため
     * 入力が完全に同一の記録が 2 件ずつある。**そこだけは区別できる。**
     */
    const byPair = new Map<string, Row[]>()
    for (const row of rows) {
        const key = `${row.questionId}\u0000${row.model}`
        const list = byPair.get(key) ?? []
        list.push(row)
        byPair.set(key, list)
    }
    const repeated = [...byPair.entries()].filter(([, list]) => list.length > 1)

    if (repeated.length) {
        lines.push(
            '',
            '## 同じ入力を 2 回投げた結果（再現性）',
            '',
            '**この記事の実測はすべて 1 問 1 モデル 1 回である。**',
            '「4 モデルが 7 種類の壊れ方をした」と書いたが、それが',
            '**モデルの性質なのか、その 1 回の揺れなのか区別できていない。**',
            '',
            '`data/runs/` に入力が完全に同一の記録が複数ある（過去の回答を読み込む機能で再投入した分）。',
            'それを両方投げた。**ここだけは区別できる。**',
            '',
            '**入力が同一の組だけが反復である。** 別プレイの記録は入力が違うため、',
            '結果の差が「モデルの揺れ」なのか「入力の差」なのか分けられない。**混ぜない。**',
            '',
            '| 問 | モデル | 回数 | 入力 | status | 見落とし件数 | 一致 |',
            '|---|---|---|---|---|---|---|',
        )
        let statusDiffer = 0
        let countDiffer = 0
        let trueRepeats = 0
        for (const [key, list] of repeated) {
            const [questionId, model] = key.split('\u0000')
            const statuses = list.map((r) => r.v2Status)
            const counts = list.map((r) => r.v2MissedCluesCount)
            const sameInput = new Set(list.map((r) => r.inputKey)).size === 1
            const sameStatus = new Set(statuses).size === 1
            const sameCount = new Set(counts.map((c) => String(c))).size === 1
            if (sameInput) {
                trueRepeats += 1
                if (!sameStatus) statusDiffer += 1
                if (!sameCount) countDiffer += 1
            }
            lines.push(
                `| ${questionId} | ${model} | ${list.length} `
                + `| ${sameInput ? '同一' : '**ちがう**'} | ${statuses.join(' / ')} `
                + `| ${counts.map((c) => (c === null ? '—' : c)).join(' / ')} `
                + `| ${sameInput ? (sameStatus && sameCount ? '一致' : '**ちがう**') : '—（反復ではない）'} |`,
            )
        }
        lines.push(
            '',
            `**入力が同一の組: ${trueRepeats} / ${repeated.length}**`,
            '',
            trueRepeats === 0
                ? '**入力が同一の組が無い。再現性については何も言えない。**'
                : `**status がちがった組: ${statusDiffer} / ${trueRepeats}**　`
                + `**見落とし件数がちがった組: ${countDiffer} / ${trueRepeats}**`,
            '',
            trueRepeats === 0
                ? ''
                : statusDiffer + countDiffer === 0
                    ? 'すべて一致した。**この範囲では、壊れ方はモデルごとに再現する。**'
                    : '**一致しなかった組がある。** その組については、'
                    + '「このモデルはこう壊れる」と書けない。**同じ入力で結果が変わる。**',
            '',
            '> **n=1 の観測を性質として書いてはならない。**',
            '> 反復できる範囲だけが、性質と呼べる。',
            '',
        )
    }

    lines.push(
        '',
        '## 読み方',
        '',
        '- **成功率の差は情報量の差と交絡している。** v2 はプロンプトが長い（正解タグと辞書抜粋を含む）。',
        '  打ち切りが増えた場合、原因は「v2 が難しい」ではなく「入力が長い」可能性がある',
        '- **モデル間の不一致を学習者の記述の曖昧さの指標にしない。**',
        '  ボラード実験で、メモが介在しない事実問題でも 3 分の 2 の国でモデルが食い違った',
        '  （`docs/bollard-axes-conclusion.md`）',
        '- 生データは `data/compare/` にある。**打ち切りの生テキストも保存している**',
        '',
    )

    await mkdir('docs', { recursive: true })
    await writeFile(REPORT_PATH, lines.join('\n'), 'utf8')
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
})
