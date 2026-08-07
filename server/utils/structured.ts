/**
 * 構造化出力とフォールバック。
 *
 * 主経路は `json_schema` + `strict: true`（2026-08-07 に実測で動作確認）。
 * フォールバックは `json_object` → プロンプト指示のみ、の順で維持する。
 *
 * **どの経路でも Zod による検証をコード側で必ず実施する。**
 * 要件 3-2（辞書外の用語を生成しない）を AI の遵守に依存させない。
 *
 * `strict: true` が保証するのは**構造のみ**である。
 * - 保証される：出力が enum で指定した値のいずれかであること
 * - 保証されない：選ばれた値が意味的に正しいこと
 * - **保証されない：配列の件数や網羅性**
 *
 * したがって件数は呼び出し側の Zod スキーマで（`.length()` / `.min()`）検証する。
 * JSON Schema 側の `minItems` / `maxItems` は**配列ごとに指定が必要で、入れ子に伝播しない。**
 */
import type { ZodType } from 'zod'
import type { AiChatRequest, StructuredMode, UsageCategory } from './ai'
import { callChat } from './ai'
import type { Variant } from '../../shared/types'

/** 試行する順序。主経路が先頭 */
const MODE_ORDER: readonly Exclude<StructuredMode, 'none'>[] = [
    'json_schema',
    'json_object',
    'prompt',
]

export interface StructuredAttempt {
    mode: StructuredMode
    attempt: number
    ok: boolean
    error: string | null
    durationMs: number
}

export interface StructuredResult<T> {
    ok: boolean
    data: T | null
    /** 実際に成功した経路。失敗時は null */
    mode: StructuredMode | null
    attempts: StructuredAttempt[]
    /** 失敗の理由。呼び出し側が処理を継続できるよう例外は投げない */
    error: string | null
}

export interface StructuredRequest<T> {
    category: UsageCategory
    endpoint: string
    variant?: Variant
    model?: string
    maxTokens?: number
    temperature?: number
    /** system メッセージ。v1 / v2 で同一のテンプレートを使う */
    system: string
    /** user メッセージ */
    user: string
    /** 出力の検証。件数の検証もここに含める */
    schema: ZodType<T>
    /** `json_schema` 経路で渡す JSON Schema。配列には minItems / maxItems を必ず付ける */
    jsonSchema: Record<string, unknown>
    schemaName: string
}

/** `response_format` を組み立てる */
export function buildJsonSchemaFormat(name: string, schema: Record<string, unknown>) {
    return {
        type: 'json_schema' as const,
        json_schema: {
            name,
            strict: true,
            schema,
        },
    }
}

/**
 * 応答テキストから JSON を取り出す。
 * コードフェンスや前置きが混ざる経路（`json_object` / `prompt`）のために用意する。
 */
export function extractJson(text: string): unknown {
    const trimmed = text.trim()
    const candidates: string[] = [trimmed]

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) candidates.push(fenced[1].trim())

    const firstBrace = trimmed.search(/[[{]/)
    const lastBrace = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'))
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        candidates.push(trimmed.slice(firstBrace, lastBrace + 1))
    }

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate)
        }
        catch {
            // 次の候補を試す
        }
    }
    throw new Error('応答から JSON を取り出せなかった')
}

function schemaInstruction(schema: Record<string, unknown>): string {
    return [
        '出力は次の JSON Schema に適合する JSON のみとする。説明文やコードフェンスを含めない。',
        JSON.stringify(schema),
    ].join('\n')
}

/**
 * 構造化出力を要求する。
 *
 * - 3 経路を順に試す
 * - 各経路で Zod 検証に失敗した場合のみ **1 回だけ**再試行する
 *   （通信・タイムアウトの失敗ではリトライしない。504 は枠を消費するため）
 * - すべて失敗しても例外は投げず `ok: false` を返す
 */
export async function requestStructured<T>(
    request: StructuredRequest<T>,
): Promise<StructuredResult<T>> {
    const attempts: StructuredAttempt[] = []
    let lastError = '構造化出力を取得できなかった'
    let attemptCounter = 0

    for (const mode of MODE_ORDER) {
        // 検証失敗時のみ 1 回だけ再試行する
        for (let validationTry = 1; validationTry <= 2; validationTry += 1) {
            attemptCounter += 1

            const messages = buildMessages(request, mode, validationTry > 1)
            const chatRequest: AiChatRequest = {
                category: request.category,
                endpoint: request.endpoint,
                variant: request.variant,
                model: request.model,
                messages,
                maxTokens: request.maxTokens,
                temperature: request.temperature,
                structuredMode: mode,
                attempt: attemptCounter,
                responseFormat:
                    mode === 'json_schema'
                        ? buildJsonSchemaFormat(request.schemaName, request.jsonSchema)
                        : mode === 'json_object'
                            ? { type: 'json_object' }
                            : undefined,
            }

            const response = await callChat(chatRequest)

            if (!response.ok) {
                attempts.push({
                    mode,
                    attempt: validationTry,
                    ok: false,
                    error: response.error,
                    durationMs: response.durationMs,
                })
                lastError = response.error ?? lastError
                // 通信・打ち切りの失敗は同一経路で繰り返さず、次の経路へ移る
                break
            }

            let parsed: unknown
            try {
                parsed = extractJson(response.content)
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                attempts.push({
                    mode,
                    attempt: validationTry,
                    ok: false,
                    error: message,
                    durationMs: response.durationMs,
                })
                lastError = message
                continue
            }

            const validated = request.schema.safeParse(parsed)
            if (validated.success) {
                attempts.push({
                    mode,
                    attempt: validationTry,
                    ok: true,
                    error: null,
                    durationMs: response.durationMs,
                })
                return { ok: true, data: validated.data, mode, attempts, error: null }
            }

            const message = `Zod 検証に失敗した: ${validated.error.message}`
            attempts.push({
                mode,
                attempt: validationTry,
                ok: false,
                error: message,
                durationMs: response.durationMs,
            })
            lastError = message
        }
    }

    return { ok: false, data: null, mode: null, attempts, error: lastError }
}

function buildMessages(
    request: StructuredRequest<unknown>,
    mode: Exclude<StructuredMode, 'none'>,
    isRetry: boolean,
) {
    const systemParts = [request.system]

    // json_schema はデコード段階で強制されるため、スキーマをプロンプトに重ねない
    if (mode !== 'json_schema') {
        systemParts.push(schemaInstruction(request.jsonSchema))
    }
    if (isRetry) {
        systemParts.push(
            '直前の応答はスキーマに適合しなかった。スキーマに厳密に従った JSON のみを返すこと。',
        )
    }

    return [
        { role: 'system' as const, content: systemParts.join('\n\n') },
        { role: 'user' as const, content: request.user },
    ]
}
