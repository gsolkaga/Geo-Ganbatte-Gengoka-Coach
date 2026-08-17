/**
 * 無償枠を消費したかの判定。**純粋な関数だけを置く。**
 *
 * ## なぜ `shared/` に出したか
 *
 * この判定は `server/utils/ai.ts` の中にあった。
 * あのファイルは OpenAI クライアントを読み込むため、**テストから触りにくい。**
 * 触りにくいものは検査されない。検査されないものは間違っている
 * （「表示が実態を意味しない」8 回のうち 3 回がこれだった）。
 *
 * ## 4xx を消費として数えていた（実測 2026-08-17）
 *
 * `preview/` の接頭辞が抜けたモデル ID で **15 回 400 になり、消費 15 として
 * 記録・報告された。** 実際には 1 つも消費していない。
 * リクエストは届いたが、推論に入る前に弾かれている。
 *
 * > **届いたことと、使われたことは別である。**
 *
 * 逆に、打ち切り（`truncated`）は**消費している。** HTTP 200 で受け取ったうえで
 * 途中までしか来なかった状態である。`ok` でないから消費していない、ではない。
 */

/**
 * 例外やエラー文からステータスコードを取り出す。取れなければ `null`。
 *
 * OpenAI の SDK は `APIError` に `status` を持たせる。
 * 文字列しか無い場合は本文から拾う（`400 model not found` の形）。
 */
export function httpStatusOf(caught: unknown): number | null {
    if (caught && typeof caught === 'object' && 'status' in caught) {
        const value = (caught as { status: unknown }).status
        if (typeof value === 'number' && value >= 100 && value < 600) return value
    }
    const text = typeof caught === 'string'
        ? caught
        : caught instanceof Error
            ? caught.message
            : null
    if (!text) return null

    /**
     * `HTTP 400` `status: 503` のように**印がある**場合。最も確かである。
     */
    const marked = /(?:HTTP|status|code)[^\d]{0,8}([45]\d\d)/i.exec(text)
    if (marked) return Number(marked[1])

    /**
     * 印が無い場合（SDK の `400 The model ... does not exist` の形）。
     *
     * ここを緩くすると**自分のエラー文の数字を拾う。**
     * 単体テストが最初の実行で捕まえた。
     *
     * ```
     * 「空白が 512 字以上続いたため打ち切った」  → 512 を 5xx と読んだ
     * ```
     *
     * 512 は打ち切りの閾値であり、状態コードではない。
     * **これは打ち切り（`truncated`）のメッセージで、消費している側である。**
     * 4xx/5xx と読むと、消費した呼び出しを消費していないと数えることになった。
     *
     * > **数字の形が合うことは、意味が合うことではない。**
     *
     * 状態コードの直後には ASCII の理由句が来る（`Bad Request`、`model not found`）。
     * 日本語の助数詞（`字`、`件`、`秒`）が続くものは数量である。**そこで分ける。**
     */
    const bare = /(?:^|\s)([45]\d\d)(?=$|[\s:,.](?:[\x20-\x7E]|$))/.exec(text)
    return bare ? Number(bare[1]) : null
}

/**
 * クライアント側の誤り（4xx）。**枠を消費していない。**
 *
 * 429（レート制限）も含む。待たされただけで推論は動いていない。
 */
export function isClientError(status: number | null): boolean {
    return status !== null && status >= 400 && status < 500
}

/** 消費判定の入力。**必要な情報だけを受け取る**（`AiStreamResult` 全体に依存しない） */
export interface BillingInput {
    status: 'ok' | 'truncated' | 'error'
    error: string | null
    /** 例外から取れた場合のステータスコード */
    httpStatus?: number | null
    /** 所要時間。0 は送信前に落ちた印である */
    totalMs: number
}

/**
 * **無償枠を消費したか。`status` とは別である。**
 *
 * | 状態 | 消費 | 理由 |
 * |---|---|---|
 * | `ok` | する | 言うまでもない |
 * | `truncated` | **する** | HTTP 200 で受け取っている。途中までしか来ていないだけ |
 * | `error` / 4xx | **しない** | 届いたが推論に入る前に弾かれた |
 * | `error` / 5xx | する | 504 は 300 秒待たされた後に返る。**推論は動いていた** |
 * | `error` / トークン未設定 | しない | クライアントを作る前に落ちている |
 * | `error` / 0ms | しない | 送信していない。通信すれば必ず 1ms 以上かかる |
 */
export function wasBilled(input: BillingInput): boolean {
    if (input.status === 'ok' || input.status === 'truncated') return true
    // トークンが無い場合は OpenAI クライアントを作る前に throw している
    if (input.error?.includes('SAKURA_AI_TOKEN')) return false
    if (isClientError(input.httpStatus ?? null)) return false
    // ステータスが取れなかった場合はエラー文からも見る
    if (isClientError(httpStatusOf(input.error))) return false
    return input.totalMs > 0
}

/**
 * 試行の一覧から、**実際に枠を消費した回数**を数える。
 *
 * 構造化出力は 3 段階のフォールバックを持つ（`json_schema` → `json_object` → `prompt`）。
 * 試行回数をそのまま消費数として返していたため、
 * **4xx で弾かれた試行も消費として報告していた。**
 *
 * 逆に、フォールバックで 2 回投げたなら**消費は 2 である。**
 * 「1 呼び出し = 1 消費」ではない。
 */
export function countBilledAttempts(
    attempts: readonly { ok: boolean, error: string | null, durationMs: number }[],
): number {
    return attempts.filter((a) => wasBilled({
        status: a.ok ? 'ok' : 'error',
        error: a.error,
        totalMs: a.durationMs,
    })).length
}
