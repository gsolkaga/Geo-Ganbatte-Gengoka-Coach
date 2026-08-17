/**
 * 空白の暴走を打ち切る判定の単体テスト。**AI を使わない。**
 *
 * ## 何が起きたか（実測 2026-08-17）
 *
 * 「末尾の空白 512 字で打ち切る」を入れたら、v2 の実行で
 * **4 モデルのうち 3 つが `truncated` になり、2 つは中身を失った。**
 * v1 では同じ入力で 4 モデルすべて `ok` だった。
 *
 * 打ち切り機構を入れる前（8/10）の記録 52 件を調べたら、
 * **4 件が 512 字以上の空白の後に中身を続けていた。** 全部 `gpt-oss-120b`。
 *
 * ```
 * 回復する    :  7,892   18,039   19,401   26,590
 * 回復しない  : 11,343   19,576   19,702   19,736   32,734   36,531   40,952   184,835
 * ```
 *
 * **重なっている。7,892 は回復し、11,343 は回復しない。**
 *
 * > **長さは、続きがあるかを教えてくれない。**
 */
import { describe, expect, it } from 'vitest'
import {
    WHITESPACE_HARD_LIMIT,
    WHITESPACE_RUN_LIMIT,
    describeWhitespaceAbort,
    evaluateWhitespaceGuard,
    trailingWhitespaceLength,
} from '../shared/whitespace-guard'

const ws = (n: number) => ' '.repeat(n)
const body = '{"summary":"あ"'

describe('trailingWhitespaceLength', () => {
    it('末尾の空白だけを数える', () => {
        expect(trailingWhitespaceLength(`${body}${ws(600)}`)).toBe(600)
    })

    /** **途中の空白は数えない。** 判定は末尾の並びに対して行う */
    it('途中の空白は数えない', () => {
        expect(trailingWhitespaceLength(`{"a":1,${ws(600)}"b":2}`)).toBe(0)
    })

    it('空白が無ければ 0', () => {
        expect(trailingWhitespaceLength(body)).toBe(0)
    })

    it('改行とタブも空白として数える', () => {
        expect(trailingWhitespaceLength(`${body}\n\t \r\n`)).toBe(5)
    })
})

describe('evaluateWhitespaceGuard', () => {
    it('下限に届かなければ待つ（整形の範囲）', () => {
        expect(evaluateWhitespaceGuard({
            content: `${body}${ws(WHITESPACE_RUN_LIMIT - 1)}`,
            isSalvageable: () => true,
        })).toBe('continue')
    })

    /** **これが直したかった挙動である** */
    it('下限を超えても、中身が欠けていれば待つ', () => {
        expect(evaluateWhitespaceGuard({
            content: `${body}${ws(20_000)}`,
            isSalvageable: () => false,
        })).toBe('continue')
    })

    it('下限を超えて中身が揃っていれば打ち切る', () => {
        expect(evaluateWhitespaceGuard({
            content: `${body}${ws(600)}`,
            isSalvageable: () => true,
        })).toBe('abort')
    })

    /** **判定を渡さなければ「揃っていない」として扱う。** 既定で壊さない側に寄せる */
    it('判定関数を渡さなければ上限まで待つ', () => {
        expect(evaluateWhitespaceGuard({ content: `${body}${ws(20_000)}` })).toBe('continue')
        expect(evaluateWhitespaceGuard({ content: `${body}${ws(WHITESPACE_HARD_LIMIT)}` })).toBe('abort')
    })

    it('上限に達したら中身が欠けていても打ち切る', () => {
        expect(evaluateWhitespaceGuard({
            content: `${body}${ws(WHITESPACE_HARD_LIMIT)}`,
            isSalvageable: () => false,
        })).toBe('abort')
    })

    /**
     * 実測した 4 件（`gpt-oss-120b` が空白の後に中身を続けた）を壊さないこと。
     * **最長が 26,590 字だったので、上限はそれより上でなければならない。**
     */
    it('回復した実測値（7892 / 18039 / 19401 / 26590）で打ち切らない', () => {
        for (const length of [7_892, 18_039, 19_401, 26_590]) {
            expect(evaluateWhitespaceGuard({
                content: `${body}${ws(length)}`,
                isSalvageable: () => false,
            }), `${length} 字で打ち切ってはならない`).toBe('continue')
        }
    })

    /** 184,835 字まで空白を吐いた応答があった。**上限が無いと 280 秒待つ** */
    it('回復しなかった極端な実測値（32734 以上）は上限で打ち切る', () => {
        for (const length of [32_734, 36_531, 40_952, 184_835]) {
            expect(evaluateWhitespaceGuard({
                content: `${body}${ws(length)}`,
                isSalvageable: () => false,
            }), `${length} 字は打ち切る`).toBe('abort')
        }
    })

    /**
     * **11,343 と 19,576 は回復しなかったが、待つ。**
     *
     * 7,892 が回復し 11,343 が回復しないので、**長さでは分離できない。**
     * 分離できないものを分離したふりをしない。待って `max_tokens` に任せる。
     * 打ち切り機構が無かった頃と同じ挙動であり、**遅いが壊さない。**
     */
    it('分離できない範囲は待つ（遅いが壊さない）', () => {
        for (const length of [11_343, 19_576, 19_702, 19_736]) {
            expect(evaluateWhitespaceGuard({
                content: `${body}${ws(length)}`,
                isSalvageable: () => false,
            })).toBe('continue')
        }
    })

    it('上限を上書きできる（実験用）', () => {
        expect(evaluateWhitespaceGuard({
            content: `${body}${ws(1_000)}`,
            isSalvageable: () => false,
            hardLimit: 500,
        })).toBe('abort')
    })

    /** 観察モード。**打ち切ると、打ち切りが正しかった証拠まで消える** */
    it('上限を無限にすれば打ち切らない', () => {
        expect(evaluateWhitespaceGuard({
            content: `${body}${ws(1_000_000)}`,
            isSalvageable: () => false,
            hardLimit: Number.POSITIVE_INFINITY,
        })).toBe('continue')
    })
})

describe('describeWhitespaceAbort', () => {
    it('中身が揃っていた場合はそう書く', () => {
        const text = describeWhitespaceAbort(`${body}${ws(600)}`, 100, 8000)
        expect(text).toContain('必須項目は揃っていたため')
        expect(text).toContain('本文 14 字')
        expect(text).toContain('max_tokens=8000')
    })

    it('上限に達した場合はそう書く', () => {
        const text = describeWhitespaceAbort(`${body}${ws(WHITESPACE_HARD_LIMIT)}`, 100, 8000)
        expect(text).toContain('上限')
        expect(text).toContain('中身は揃っていない')
    })
})
