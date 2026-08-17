/**
 * 打ち切られた JSON を閉じるだけの修復。
 *
 * ## なぜ必要か（実測 2026-08-17、カザフスタンの出題）
 *
 * 2 モデルが `finish_reason=length` で打ち切られた。**中身の量は問題ではなかった。**
 *
 * | モデル | 全体 | 末尾の連続空白 | 本文 | 欠けた項目 |
 * |---|---|---|---|---|
 * | `gemma-4-31B-it` | 12,052 字 | **11,790 字（98%）** | 262 字 | 7 / 9 |
 * | `Kimi-K2.6` | 41,508 字 | **40,952 字（99%）** | 556 字 | **1 / 9** |
 *
 * **書くのをやめたあと、空白だけを max_tokens まで吐き続けている。**
 * `Kimi` は 556 字の本文を書き終えて、40,952 字の空白のために 280 秒使った。
 *
 * `Kimi` は `wrongReasoning` だけが欠けている。
 * `feedbackSchema` の `wrongReasoning` は `.default([])` を持つ。
 * **閉じ括弧を足すだけで、検証を通る使える結果になる。**
 *
 * ## やらないこと
 *
 * **中身を作らない。** 閉じ括弧・閉じ角括弧・閉じ引用符しか足さない。
 * 欠けた項目を推測で埋めるのは、AI の失敗を隠して自分の推測を混ぜる行為である。
 *
 * 検証（Zod）は必ず呼び出し側で行う。ここは「JSON として閉じる」までしかしない。
 *
 * ## 成功に見せない
 *
 * 修復できても `status` は `truncated` のままにする。
 * **打ち切りは起きた事実である。** 記録から消してはならない。
 */

/** 末尾の連続空白の長さ。**打ち切りの原因を判別する指標である** */
export function trailingWhitespaceLength(text: string): number {
    return text.length - text.trimEnd().length
}

export interface RepairResult {
    /** 修復できたか */
    ok: boolean
    /** 修復後のテキスト。失敗時は null */
    text: string | null
    /** 足した文字。**中身は含まない** */
    appended: string
    /** 落とした末尾の空白の長さ */
    trimmedWhitespace: number
}

/**
 * 開いたままの括弧・引用符を閉じる。
 *
 * 文字列の中の括弧を数えないよう、**引用符の内外を状態として持つ。**
 * エスケープ（`\"`）も見る。ここを雑にすると、
 * 本文に `}` が含まれるだけで判定が壊れる。
 */
export function repairTruncatedJson(raw: string): RepairResult {
    const trimmedWhitespace = trailingWhitespaceLength(raw)
    let text = raw.trimEnd()

    if (!text.startsWith('{')) {
        return { ok: false, text: null, appended: '', trimmedWhitespace }
    }

    // 既に閉じているなら何もしない
    if (tryParse(text)) {
        return { ok: true, text, appended: '', trimmedWhitespace }
    }

    // 文字列の途中で切れたなら引用符を閉じる。**中身は足さない**
    let body = scan(text).inString ? `${text}"` : text

    // 値の無いキーや末尾のカンマを落とす。**値を作らない**
    body = dropDanglingTail(body)

    // 括弧は落としたあとの本文で数え直す
    const closers = [...scan(body).stack].reverse().join('')
    const candidate = body + closers

    if (!tryParse(candidate)) {
        return { ok: false, text: null, appended: '', trimmedWhitespace }
    }
    return {
        ok: true,
        text: candidate,
        // 何を足したかを返す。**落とした分は含まない**
        appended: candidate.length >= text.length ? candidate.slice(text.length) : closers,
        trimmedWhitespace,
    }
}

/**
 * 引用符の内外と、開いている括弧を求める。
 *
 * **文字列の中の括弧を数えてはならない。**
 * 本文に `}` や `[` が含まれるだけで判定が壊れる。エスケープ（`\"`）も見る。
 */
function scan(text: string): { inString: boolean, stack: ('}' | ']')[] } {
    const stack: ('}' | ']')[] = []
    let inString = false
    let escaped = false

    for (const char of text) {
        if (escaped) {
            escaped = false
            continue
        }
        if (char === '\\') {
            // 文字列の外の `\` は不正だが、ここでは判定しない
            escaped = inString
            continue
        }
        if (char === '"') {
            inString = !inString
            continue
        }
        if (inString) continue
        if (char === '{') stack.push('}')
        else if (char === '[') stack.push(']')
        else if (char === '}' || char === ']') stack.pop()
    }
    return { inString, stack }
}

/**
 * 末尾の未完成な断片を落とす。**値を作らない。**
 *
 * `{"a":1,"vocab` のようにキーだけ書いて切れた場合、
 * 引用符を閉じても値が無いため JSON にならない。区切りまで戻す。
 *
 * **完成した値と区別する。** `{"summary":"途中で切れた"` の末尾も
 * 引用符で囲まれた文字列だが、これは**値**であり落としてはならない。
 * 直前の文字が `,` か `{` かで判別する。
 */
function dropDanglingTail(text: string): string {
    let out = text
    for (; ;) {
        const before = out
        // 末尾のカンマ
        out = out.replace(/,\s*$/, '')
        // 区切りの直後にキーだけ（コロンの有無を問わない）
        out = out.replace(/,\s*"[^"\\]*"\s*:?\s*$/, '')
        out = out.replace(/(\{)\s*"[^"\\]*"\s*:\s*$/, '$1')
        if (out === before) return out
    }
}

function tryParse(text: string): boolean {
    try {
        const value: unknown = JSON.parse(text)
        return typeof value === 'object' && value !== null
    }
    catch {
        return false
    }
}
