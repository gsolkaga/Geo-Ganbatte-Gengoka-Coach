/**
 * モデル ID の一致を固定する（回帰テスト）。**AI を使わない。**
 *
 * ## 何が起きたか（実測 2026-08-17）
 *
 * モデル ID が**画面・比較スクリプト・計測ツールの 7 箇所に別々に書かれていた。**
 * `scripts/compare-grading.ts` だけ `preview/` の接頭辞が抜けていた。
 *
 * ```
 * 画面   'preview/gemma-4-31B-it'      ← 正しい
 * 比較   'gemma-4-31B-it'              ← 400 になる
 * ```
 *
 * 65 リクエストの実行を始めたところ、**4 モデルのうち 3 つが全件 error になった。**
 * `gpt-oss-120b` だけは接頭辞を持たないため通り、**1 モデルだけ動いて
 * 「動いているように見えた」。**
 *
 * > **一部が動くと、壊れていることが分かりにくい。**
 * > 全部壊れていれば 1 件目で止めた。
 *
 * そして画面には `v1=記録なし` と 1 件目から出ていた。
 * 突き合わせる相手が居ないのだから ID が違うと分かる情報だった。
 *
 * > **異常を表示することと、異常で止まることは別である。**
 *
 * ## このテストが守るもの
 *
 * `COMPARISON_MODELS` の各 ID が、**実際に応答を受け取った記録に存在すること。**
 * 記録は `data/runs/` にあり、そこに無い ID は API に無い ID である。
 *
 * 消費 0 で確認できる。**投げてから気づくものではなかった。**
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPARISON_MODELS, displayName } from '../shared/models'
import type { RunRecord } from '../shared/types'

function recordedModelIds(): Set<string> {
    const dir = join('data', 'runs')
    const ids = new Set<string>()
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
        const run = JSON.parse(readFileSync(join(dir, name), 'utf8')) as RunRecord
        for (const m of run.result.models) {
            // **error だった記録の ID は根拠にしない。** 存在しない ID でも記録には残る
            if (m.status === 'error') continue
            ids.add(m.model)
        }
    }
    return ids
}

describe('COMPARISON_MODELS', () => {
    it('すべての ID が実際に応答を受け取った記録に存在する', () => {
        const recorded = recordedModelIds()
        // 記録が無い環境ではこのテストは何も保証できない。**黙って通さない**
        expect(recorded.size).toBeGreaterThan(0)

        const missing = COMPARISON_MODELS.filter((m) => !recorded.has(m))
        expect(missing, `記録に無いモデル ID: ${missing.join(' ')}\n記録にある ID: ${[...recorded].sort().join(' ')}`)
            .toEqual([])
    })

    /** **接頭辞を落とすと 400 になる。** 表示のときだけ落とす */
    it('preview/ の接頭辞を持つ ID がある（正規化していない証拠）', () => {
        expect(COMPARISON_MODELS.some((m) => m.startsWith('preview/'))).toBe(true)
    })

    it('重複が無い', () => {
        expect(new Set(COMPARISON_MODELS).size).toBe(COMPARISON_MODELS.length)
    })
})

describe('displayName', () => {
    it('preview/ を落とす', () => {
        expect(displayName('preview/gemma-4-31B-it')).toBe('gemma-4-31B-it')
    })

    it('接頭辞が無ければそのまま', () => {
        expect(displayName('gpt-oss-120b')).toBe('gpt-oss-120b')
    })

    /** **先頭以外の preview/ は落とさない。** ID の一部である可能性がある */
    it('先頭以外は落とさない', () => {
        expect(displayName('vendor/preview/model')).toBe('vendor/preview/model')
    })
})
