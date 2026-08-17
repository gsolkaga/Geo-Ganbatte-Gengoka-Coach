/**
 * 空白の暴走を打ち切る判定。**純粋な関数だけを置く。**
 *
 * ## 閾値では分離できなかった（実測 2026-08-17）
 *
 * 「末尾の空白が 512 字を超えたら打ち切る」を入れた。
 * v2 の実行で**4 モデルのうち 3 つが `truncated` になり、2 つは中身を失った。**
 * v1 では同じ入力で 4 モデルすべて `ok` だった。
 *
 * 打ち切り機構を入れる前（2026-08-10）の記録 52 件を調べた。
 * **4 件が 512 字以上の空白の後に中身を続けていた。** 全部 `gpt-oss-120b` である。
 *
 * ```
 * q-th-01  位置 1085 に 26,590 字の空白 → その後 "missedClues": [] が続く → ok
 * q-kz-01  位置 1014 に  7,892 字の空白 → その後 "vocabulary": [...] が続く → ok
 * q-bg-01  位置 1216 に 19,401 字の空白 → その後も続く
 * q-ru-01  位置 1515 に 18,039 字の空白 → その後も続く
 * ```
 *
 * **`gpt-oss-120b` は JSON の途中で大量の空白を挟んでから中身を続ける。** それが芸風である。
 *
 * 一方、回復しなかった応答の空白は 11,343 〜 184,835 字だった。
 *
 * ```
 * 回復する    :  7,892   18,039   19,401   26,590
 * 回復しない  : 11,343   19,576   19,702   19,736   32,734   36,531   40,952   184,835
 * ```
 *
 * **重なっている。7,892 は回復し、11,343 は回復しない。**
 * どこに線を引いても、片方を壊す。
 *
 * > **長さは、続きがあるかを教えてくれない。**
 *
 * ## 中身が揃っているかで分ける
 *
 * 待つ理由は「まだ書くことがあるから」である。それは長さではなく**中身**で分かる。
 *
 * | 状態 | 判断 | 根拠 |
 * |---|---|---|
 * | 必須項目が揃っている（閉じ括弧を足せば使える） | **打ち切る** | もう待つ必要がない |
 * | 必須項目が欠けている | **待つ** | 続きが来るかもしれない |
 *
 * 実測に当てると全部説明がつく。
 *
 * ```
 * gpt-oss（v2、866 字）  閉じ括弧 "}" だけ足りない → 揃っている → 打ち切って救済 ✓
 * gemma （v2、217 字）   必須項目が欠けている       → 待つ（v1 と同じ挙動に戻る） ✓
 * gpt-oss（v1、位置 1085）必須項目が欠けている       → 待つ → 26,590 字後に続いた ✓
 * ```
 *
 * 揃わないまま終わった場合は `max_tokens` まで走る。**打ち切り機構が無かった頃と同じである。**
 * 遅くなるが、**壊さない。**
 */

/**
 * 判定を始める空白の長さ。これ未満では中身の検査もしない。
 *
 * 整形（インデント・改行）で正当に出る空白と区別するための下限である。
 * **ここを超えても、中身が揃っていなければ打ち切らない。**
 */
export const WHITESPACE_RUN_LIMIT = 512

/**
 * 中身の状態にかかわらず打ち切る長さ。
 *
 * 回復した最長が 26,590 字（`gpt-oss-120b`）だったので、それより上に置く。
 * 184,835 字まで空白を吐いた応答があり、**上限が無いと 280 秒待つことになる。**
 *
 * > **壊さない範囲でだけ、待つのをやめる。**
 */
export const WHITESPACE_HARD_LIMIT = 30_000

/** 末尾の空白の長さ */
export function trailingWhitespaceLength(text: string): number {
    return text.length - text.trimEnd().length
}

export type WhitespaceDecision = 'continue' | 'abort'

export interface WhitespaceGuardInput {
    /** ここまでに受け取った本文 */
    content: string
    /**
     * 中身が揃っているか（閉じ括弧を足せば使えるか）。
     * **判定は呼び出し側が持つ**（スキーマを知っているのはそちらである）。
     * 渡さなければ「揃っていない」として扱い、上限まで待つ。
     */
    isSalvageable?: (content: string) => boolean
    /** 判定を始める長さ。既定は `WHITESPACE_RUN_LIMIT` */
    limit?: number
    /** 中身にかかわらず打ち切る長さ。既定は `WHITESPACE_HARD_LIMIT` */
    hardLimit?: number
}

/**
 * 打ち切るか、待つか。
 *
 * **長さだけでは決めない。** 長さは検査を始める合図であり、決め手は中身である。
 */
export function evaluateWhitespaceGuard(input: WhitespaceGuardInput): WhitespaceDecision {
    const limit = input.limit ?? WHITESPACE_RUN_LIMIT
    const hardLimit = input.hardLimit ?? WHITESPACE_HARD_LIMIT
    const trailing = trailingWhitespaceLength(input.content)

    // 上限。中身が揃っていなくても打ち切る。**壊す危険より待ち続ける害が大きい長さ**
    if (trailing >= hardLimit) return 'abort'
    // 下限に届いていない。整形の範囲である
    if (trailing < limit) return 'continue'
    // ここからが本題。**中身が揃っていれば待たない。欠けていれば待つ**
    return input.isSalvageable?.(input.content) ? 'abort' : 'continue'
}

/**
 * 打ち切った理由の説明文。**どちらの条件で止めたかを残す。**
 *
 * 「空白が続いた」だけでは、中身が揃っていたのか上限に達したのか分からない。
 */
export function describeWhitespaceAbort(
    content: string,
    chunks: number,
    maxTokens: number,
    hardLimit = WHITESPACE_HARD_LIMIT,
): string {
    const trailing = trailingWhitespaceLength(content)
    const reason = trailing >= hardLimit
        ? `空白が上限の ${hardLimit} 字に達したため打ち切った。**中身は揃っていない**`
        : `空白が ${trailing} 字続き、**必須項目は揃っていたため**打ち切った`
    return `${reason}（本文 ${content.trimEnd().length} 字、${chunks} チャンク、max_tokens=${maxTokens}）。`
        + '**待っても中身は増えない**'
}
