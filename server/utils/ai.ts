/**
 * さくらの AI Engine クライアントと計測ログ。
 *
 * 実測に基づく決定（design.md）。再検討しない。
 * - エンドポイントは OpenAI 互換の `https://api.ai.sakura.ad.jp/v1`
 * - アカウントトークンは `<UUID>:<シークレット>` 形式のまま `Bearer` に渡す。**分離しない**
 * - **リトライしない。** HTTP 504 はリクエスト枠を消費するため、成功の保証がないまま枠を減らす
 * - タイムアウトは約 300 秒（非公開・SLA 適用対象外・変更手段なし）
 * - 推論フィールドは `reasoning`（マニュアル記載の `reasoning_content` ではない）。**両方のキーを見る**
 * - `max_tokens` は推論の消費分を含む。既定値は 4,000 以上とする
 * - **画像を送信しない。** マルチモーダル対応モデルでも画像入力は使用しない（要件 11-2）
 * - **embeddings / RAG を使用しない**（無償プランでも課金対象）
 */
import OpenAI from 'openai'
import type { Variant } from '../../shared/types'
import type { StreamProgress } from '../../shared/grading-stream'
import { appendUsageLog } from './store'

export type UsageCategory =
    | 'app_runtime'
    | 'glossary_gen'
    | 'knowledge_verify'
    | 'draft_gen'
    | 'model_compare'

/** 実際に成功した構造化出力の経路 */
export type StructuredMode = 'json_schema' | 'json_object' | 'prompt' | 'none'

/**
 * `max_tokens` の下限。
 * 推論が JSON 本体の 5〜10 倍を消費する（実測）。無償枠はリクエスト数で数えられるため
 * トークンを節約する動機はない。
 *
 * 4,000 では足りなかった（実測 2026-08-07、v1 の初回プレイ）。
 * gpt-oss / gemma / Qwen の 3 モデルが `finish_reason=length` で打ち切られ、
 * チャンク数が 3962 / 4002 / 4001 とほぼ同一だった。**全部が枠で切れていた。**
 *
 * ただし枠を上げるだけでは直らない。Kimi は 24,000 でも本文 21,306 字を書いて
 * 300 秒のタイムアウトに達した。**出力量そのものを削る必要があった**
 * （`prompts.ts` の `GRADING_JSON_SCHEMA` で maxItems と字数を絞った）。
 *
 * 8,000 は、絞った後の出力に対する余裕であって、無制限の出力を通すための値ではない。
 */
export const MIN_MAX_TOKENS = 8000

/** モデルごとの `max_tokens`。一律の値では失敗するモデルがある（実測） */
export const MODEL_MAX_TOKENS: Readonly<Record<string, number>> = {
    'preview/Kimi-K2.6': 24000,
    'llm-jp-3.1-8x13b-instruct4': 3500,
}

/** タイムアウトは約 300 秒。少し余裕を持たせてサーバ側の 504 を観測できるようにする */
export const REQUEST_TIMEOUT_MS = 310_000

/**
 * 蓄積したテキストが完結した JSON オブジェクトになっているかを判定する。
 *
 * ストリーミング中に毎チャンク呼ぶため、まず安価な検査で弾いてから `JSON.parse` する。
 * 末尾が `}` でなければパースを試みない。
 *
 * 用途は 2 つある。
 *   1. JSON が閉じた時点でストリームの読み取りをやめる（gemma の空白埋めを止める）
 *   2. `finish_reason=length` でも中身が使えるかを判定する
 *
 * **`finish_reason` は信号であり、使えるかどうかの事実はパースで決まる。**
 */
export function looksLikeCompleteJson(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false
    try {
        const parsed: unknown = JSON.parse(trimmed)
        return typeof parsed === 'object' && parsed !== null
    }
    catch {
        return false
    }
}

export interface AiChatRequest {
    category: UsageCategory
    /** 呼び出し元の識別子。`normalize` `grade` `draft` など */
    endpoint: string
    /** 採点呼び出しのみ */
    variant?: Variant
    model?: string
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    maxTokens?: number
    temperature?: number
    responseFormat?: OpenAI.Chat.Completions.ChatCompletionCreateParams['response_format']
    /** 計測ログに記録する経路名 */
    structuredMode?: StructuredMode
    /** フォールバックの何回目の試行か。計測ログに残す */
    attempt?: number
}

export interface AiTokenUsage {
    promptTokens: number | null
    completionTokens: number | null
    totalTokens: number | null
}

export interface AiChatResult {
    ok: boolean
    content: string
    /** 推論フィールド。`reasoning` と `reasoning_content` の両方を見る */
    reasoning: string
    finishReason: string | null
    durationMs: number
    model: string
    structuredMode: StructuredMode
    usage: AiTokenUsage | null
    /** 失敗の理由。成功時は null */
    error: string | null
}

let client: OpenAI | null = null
let clientToken = ''

function getClient(): OpenAI {
    const config = useRuntimeConfig()
    // ビルド済みサーバを別環境で動かす場合に備え、実行時の環境変数も見る
    const token = String(config.sakuraAiToken || process.env.SAKURA_AI_TOKEN || '')
    if (!token) {
        throw new Error('SAKURA_AI_TOKEN が設定されていない')
    }
    if (!client || clientToken !== token) {
        client = new OpenAI({
            // `<UUID>:<シークレット>` をそのまま渡す。分離してはならない
            apiKey: token,
            baseURL: String(config.sakuraAiBaseUrl || 'https://api.ai.sakura.ad.jp/v1'),
            timeout: REQUEST_TIMEOUT_MS,
            // 失敗は事実として記録する。504 は枠を消費するためリトライしない
            maxRetries: 0,
        })
        clientToken = token
    }
    return client
}

export function resolveModel(kind: 'default' | 'normalize' | 'grade' = 'default'): string {
    const config = useRuntimeConfig()
    switch (kind) {
        case 'normalize':
            return String(config.sakuraAiModelNormalize || config.sakuraAiModelDefault)
        case 'grade':
            return String(config.sakuraAiModelGrade || config.sakuraAiModelDefault)
        default:
            return String(config.sakuraAiModelDefault)
    }
}

export function resolveMaxTokens(model: string, requested?: number): number {
    const perModel = MODEL_MAX_TOKENS[model]
    if (perModel !== undefined) {
        return requested ? Math.min(requested, perModel) : perModel
    }
    return Math.max(requested ?? MIN_MAX_TOKENS, MIN_MAX_TOKENS)
}

/** ローカルタイムゾーンのオフセット付き ISO 文字列（例 2026-08-07T10:23:11+09:00） */
export function localIsoString(date: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    const offsetMinutes = -date.getTimezoneOffset()
    const sign = offsetMinutes >= 0 ? '+' : '-'
    const abs = Math.abs(offsetMinutes)
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
        + `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
    )
}

/** 推論フィールドを取り出す。`reasoning` が実測値、`reasoning_content` はマニュアル記載 */
export function extractReasoning(message: unknown): string {
    if (!message || typeof message !== 'object') return ''
    const record = message as Record<string, unknown>
    const value = record.reasoning ?? record.reasoning_content
    return typeof value === 'string' ? value : ''
}

/**
 * チャット補完を 1 回呼ぶ。**リトライしない。**
 *
 * 例外を投げず、失敗も結果として返す。呼び出し側が処理を継続できるようにする。
 * 成否の判定は以下で行う。**HTTP 200 は成功を意味しない。**
 * - `finish_reason` が返っていない → 打ち切られている
 * - `finish_reason` が `length` → 出力が途中で切れている
 * - `content` が空 → 推論が枠を使い切った可能性がある
 */
export async function callChat(request: AiChatRequest): Promise<AiChatResult> {
    const model = request.model ?? resolveModel('default')
    const maxTokens = resolveMaxTokens(model, request.maxTokens)
    const structuredMode = request.structuredMode ?? 'none'
    const startedAt = Date.now()

    let result: AiChatResult

    try {
        const completion = await getClient().chat.completions.create({
            model,
            messages: request.messages,
            max_tokens: maxTokens,
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
            ...(request.responseFormat ? { response_format: request.responseFormat } : {}),
        })

        const durationMs = Date.now() - startedAt
        const choice = completion.choices?.[0]
        const finishReason = choice?.finish_reason ?? null
        const content = choice?.message?.content?.trim() ?? ''
        const reasoning = extractReasoning(choice?.message)

        let error: string | null = null
        if (!finishReason) {
            error = 'finish_reason が返っていない。生成が打ち切られている'
        }
        else if (finishReason === 'length') {
            error = `finish_reason=length。max_tokens=${maxTokens} で打ち切られた`
        }
        else if (!content) {
            error = 'content が空である。推論が max_tokens を使い切った可能性がある'
        }

        result = {
            ok: error === null,
            content,
            reasoning,
            finishReason,
            durationMs,
            model,
            structuredMode,
            usage: completion.usage
                ? {
                    promptTokens: completion.usage.prompt_tokens ?? null,
                    completionTokens: completion.usage.completion_tokens ?? null,
                    totalTokens: completion.usage.total_tokens ?? null,
                }
                : null,
            error,
        }
    }
    catch (caught) {
        const durationMs = Date.now() - startedAt
        result = {
            ok: false,
            content: '',
            reasoning: '',
            finishReason: null,
            durationMs,
            model,
            structuredMode,
            usage: null,
            error: describeError(caught),
        }
    }

    await logUsage(request, result)
    return result
}

function describeError(caught: unknown): string {
    if (caught instanceof OpenAI.APIError) {
        // HTTP 400 は枠を消費しない。504 は消費する。どちらも記録する
        return `APIError ${caught.status ?? '?'}: ${caught.message}`
    }
    if (caught instanceof Error) return `${caught.name}: ${caught.message}`
    return String(caught)
}

async function logUsage(request: AiChatRequest, result: AiChatResult): Promise<void> {
    const record = {
        ts: localIsoString(),
        category: request.category,
        model: result.model,
        endpoint: request.endpoint,
        ...(request.variant ? { variant: request.variant } : {}),
        ok: result.ok,
        /** 常に 0。リトライは実装しない。フォールバックの試行は attempt で数える */
        retries: 0,
        attempt: request.attempt ?? 1,
        structuredMode: result.structuredMode,
        finishReason: result.finishReason,
        durationMs: result.durationMs,
        promptTokens: result.usage?.promptTokens ?? null,
        completionTokens: result.usage?.completionTokens ?? null,
        totalTokens: result.usage?.totalTokens ?? null,
        reasoningChars: result.reasoning.length,
        contentChars: result.content.length,
        error: result.error,
    }
    try {
        await appendUsageLog(record)
    }
    catch (error) {
        // 計測ログの失敗でアプリを止めない
        console.error('[ai] 計測ログの書き込みに失敗した', error)
    }
}

// --- ストリーミング ---------------------------------------------------------

/**
 * ストリーミングの進捗。**`content` と `reasoning` を別に数える。**
 *
 * 合計バイト数だけ出すと、何も生成していないのに健全に見える。
 * 実測では Kimi が `chunks=17,600` / `content=0 文字` / `reasoning=22,262 文字` で
 * 303 秒後に打ち切られた。**17,600 個のチャンクが届いて生成物は 0 文字だった。**
 *
 * 型はクライアントと共有する（`shared/grading-stream.ts`）。二重定義にしない。
 */
export type { StreamProgress } from '../../shared/grading-stream'

export interface AiStreamResult {
    /** `truncated` は HTTP 200 のまま打ち切られた場合。**成功として扱わない** */
    status: 'ok' | 'truncated' | 'error'
    /** 生の蓄積テキスト（パース前）。**打ち切りでも捨てない** */
    content: string
    reasoning: string
    finishReason: string | null
    chunks: number
    firstByteMs: number | null
    totalMs: number
    model: string
    structuredMode: StructuredMode
    usage: AiTokenUsage | null
    error: string | null
}

export interface AiStreamRequest extends AiChatRequest {
    /** 進捗の通知先。UI の可観測性のためにのみ使う */
    onProgress?: (progress: StreamProgress) => void
}

/**
 * ストリーミングでチャット補完を呼ぶ。**リトライしない。**
 *
 * ストリーミングを使う理由は**体感速度ではなく可観測性**である。
 * タイムアウト（約 300 秒）は回避できない（実測）。解いているのは別の問題である。
 *
 *   非ストリーミング : 94 秒間なにも起きない → 学習者はハングと区別できない
 *   ストリーミング   : 初バイト 1.2 秒       → 生きていることが分かる
 *
 * **部分 JSON はパースしない。** ストリームは進捗表示にのみ使い、
 * パースは完了後に 1 回だけ行う。増分パーサを導入しない。
 *
 * **`finish_reason` の有無を必ず検証する。HTTP 200 は成功を意味しない。**
 * 所要時間やチャンク数で成否を判断してはならない。
 */
export async function callChatStream(request: AiStreamRequest): Promise<AiStreamResult> {
    const model = request.model ?? resolveModel('default')
    const maxTokens = resolveMaxTokens(model, request.maxTokens)
    const structuredMode = request.structuredMode ?? 'none'
    const startedAt = Date.now()

    let content = ''
    let reasoning = ''
    let chunks = 0
    let firstByteMs: number | null = null
    let finishReason: string | null = null
    let usage: AiTokenUsage | null = null
    let result: AiStreamResult
    /** JSON が閉じたのでこちらから読むのをやめたか */
    let jsonClosedEarly = false

    try {
        const stream = await getClient().chat.completions.create({
            model,
            messages: request.messages,
            max_tokens: maxTokens,
            stream: true,
            // 対応していないモデルでも無視されるだけなので付けておく
            stream_options: { include_usage: true },
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
            ...(request.responseFormat ? { response_format: request.responseFormat } : {}),
        })

        for await (const chunk of stream) {
            chunks += 1
            if (firstByteMs === null) firstByteMs = Date.now() - startedAt

            const choice = chunk.choices?.[0]
            const delta = choice?.delta as
                | (Record<string, unknown> & { content?: string | null })
                | undefined

            if (typeof delta?.content === 'string') content += delta.content

            // 推論フィールドは `reasoning`（実測）。`reasoning_content` も見る
            const deltaReasoning = delta?.reasoning ?? delta?.reasoning_content
            if (typeof deltaReasoning === 'string') reasoning += deltaReasoning

            // finish_reason は最終チャンクにのみ入る。空文字を拾わないよう真偽で判定する
            if (choice?.finish_reason) finishReason = choice.finish_reason

            if (chunk.usage) {
                usage = {
                    promptTokens: chunk.usage.prompt_tokens ?? null,
                    completionTokens: chunk.usage.completion_tokens ?? null,
                    totalTokens: chunk.usage.total_tokens ?? null,
                }
            }

            request.onProgress?.({
                chunks,
                contentChars: content.length,
                reasoningChars: reasoning.length,
                firstByteMs,
                elapsedMs: Date.now() - startedAt,
            })

            /**
             * JSON が閉じた時点で読むのをやめる。
             *
             * 実測（2026-08-07）で `preview/gemma-4-31B-it` が、JSON を書き終えた後も
             * **空白を吐き続けて max_tokens を使い切った**（8,002 チャンク、110.4 秒、
             * 生テキストの後半が全て空白）。`finish_reason=length` になるが、
             * **出力が長すぎたのではなく止まらなかったのである。**
             *
             * max_tokens を上げても空白が増えて遅くなるだけなので、こちら側で打ち切る。
             * リクエストは既に消費されているため節約にはならないが、待ち時間が消える。
             */
            if (request.responseFormat && looksLikeCompleteJson(content)) {
                jsonClosedEarly = true
                break
            }
        }

        const totalMs = Date.now() - startedAt

        /**
         * 状態の判定。
         *
         * **`finish_reason` だけで決めていたのは粗かった。**
         * gemma のように JSON が完成した後に空白で枠を使い切る場合、
         * `finish_reason=length` でも中身は使える。
         *
         * したがって `finish_reason` は信号として記録し、**使えるかどうかはパースで決める。**
         * 逆に、途中で切れて JSON が壊れていればパースが失敗するので取りこぼさない。
         */
        let status: AiStreamResult['status'] = 'ok'
        let error: string | null = null
        const parsable = looksLikeCompleteJson(content)

        if (jsonClosedEarly) {
            // JSON が閉じたのでこちらから読むのをやめた。成功である
            status = 'ok'
        }
        else if (!content.trim()) {
            status = 'truncated'
            error = !finishReason
                ? `content が空のままストリームが終了した（${chunks} チャンク受信、reasoning ${reasoning.length} 文字）`
                : 'content が空である。推論が max_tokens を使い切った可能性がある'
        }
        else if (!finishReason && !parsable) {
            status = 'truncated'
            error = `finish_reason が返らずストリームが終了した（${chunks} チャンク受信、content ${content.length} 文字、reasoning ${reasoning.length} 文字）`
        }
        else if (finishReason === 'length' && !parsable) {
            status = 'truncated'
            error = `finish_reason=length。max_tokens=${maxTokens} で打ち切られた`
        }
        else if (finishReason === 'length' && parsable) {
            // 中身は完成している。事実として記録するが失敗にはしない
            status = 'ok'
            error = `finish_reason=length だが JSON は完成していた（末尾の空白で枠を使い切ったとみられる。max_tokens=${maxTokens}）`
        }

        result = {
            status,
            content,
            reasoning,
            finishReason,
            chunks,
            firstByteMs,
            totalMs,
            model,
            structuredMode,
            usage,
            error,
        }
    }
    catch (caught) {
        result = {
            status: 'error',
            // 途中まで届いた分は捨てない
            content,
            reasoning,
            finishReason,
            chunks,
            firstByteMs,
            totalMs: Date.now() - startedAt,
            model,
            structuredMode,
            usage,
            error: describeError(caught),
        }
    }

    // 打ち切りでも記録する。リクエストは消費されている
    await logStreamUsage(request, result)
    return result
}

async function logStreamUsage(
    request: AiStreamRequest,
    result: AiStreamResult,
): Promise<void> {
    const record = {
        ts: localIsoString(),
        category: request.category,
        model: result.model,
        endpoint: request.endpoint,
        ...(request.variant ? { variant: request.variant } : {}),
        ok: result.status === 'ok',
        streamed: true,
        truncated: result.status === 'truncated',
        /** 常に 0。リトライは実装しない */
        retries: 0,
        attempt: request.attempt ?? 1,
        structuredMode: result.structuredMode,
        finishReason: result.finishReason,
        durationMs: result.totalMs,
        firstByteMs: result.firstByteMs,
        chunks: result.chunks,
        promptTokens: result.usage?.promptTokens ?? null,
        completionTokens: result.usage?.completionTokens ?? null,
        totalTokens: result.usage?.totalTokens ?? null,
        reasoningChars: result.reasoning.length,
        contentChars: result.content.length,
        error: result.error,
    }
    try {
        await appendUsageLog(record)
    }
    catch (error) {
        console.error('[ai] 計測ログの書き込みに失敗した', error)
    }
}
