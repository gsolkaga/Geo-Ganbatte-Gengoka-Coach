/**
 * タスク 26.2：さくらの AI Engine の同時実行数の上限を測る。
 *
 * **上限は非公開である**（タイムアウトと同じ）。実測でしか分からない。
 *
 * 測るもの。
 * - HTTP 429 が返るか
 * - キューされて直列と同じ総時間になるか
 * - 並列で本当に短縮されるか
 *
 * 結果によってタスク 26.1 の実装を変える。
 * - 429 が返る、または短縮されない → 直列＋進捗表示に落とす
 * - 短縮される → 並列のまま
 *
 * 消費: **4 リクエスト**（並列 4 本のみ。直列の基準値は過去の実測値と比較する）。
 * リトライしない。504 は枠を消費するため。
 *
 * 実行方法。
 *   $env:SAKURA_AI_TOKEN = Read-Host "token"
 *   node tools/measure-concurrency.mjs
 *
 * `scripts/` は A 側の担当領域なので `tools/` に置いている。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const TOKEN = process.env.SAKURA_AI_TOKEN
const BASE_URL = process.env.SAKURA_AI_BASE_URL ?? 'https://api.ai.sakura.ad.jp/v1'
const OUT = 'docs/generated-concurrency/concurrency-measurement.json'

/** 比較対象の 4 モデル。採点で実際に同時に投げる組み合わせに合わせる */
const MODELS = [
    { model: 'gpt-oss-120b', maxTokens: 4000 },
    { model: 'preview/gemma-4-31B-it', maxTokens: 4000 },
    { model: 'preview/Qwen3.6-35B-A3B', maxTokens: 8000 },
    { model: 'preview/Kimi-K2.6', maxTokens: 24000 },
]

/**
 * 同一の短いプロンプトを使う。**推論時間の差を測るのが目的ではない。**
 * 測るのは「同時に投げたときに待たされるか」である。
 */
const PROMPT = '「観察」という言葉を一文で説明してください。'

if (!TOKEN) {
    console.error('SAKURA_AI_TOKEN が設定されていない。実行を中止する。')
    process.exit(1)
}

/** 1 リクエスト。**リトライしない。** 失敗は事実として記録する */
async function callOnce({ model, maxTokens }) {
    const startedAt = Date.now()
    try {
        const response = await fetch(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                // <UUID>:<シークレット> をそのまま渡す。分離しない
                authorization: `Bearer ${TOKEN}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: PROMPT }],
                max_tokens: maxTokens,
            }),
        })

        const headerMs = Date.now() - startedAt
        const text = await response.text()
        const totalMs = Date.now() - startedAt

        let parsed = null
        try {
            parsed = JSON.parse(text)
        }
        catch {
            // 本文がそのまま必要なので握りつぶす
        }

        const choice = parsed?.choices?.[0]
        return {
            model,
            httpStatus: response.status,
            // 429 が返ったかどうかが最重要の観測点である
            rateLimited: response.status === 429,
            retryAfter: response.headers.get('retry-after'),
            headerMs,
            totalMs,
            finishReason: choice?.finish_reason ?? null,
            contentChars: (choice?.message?.content ?? '').length,
            reasoningChars: (choice?.message?.reasoning ?? choice?.message?.reasoning_content ?? '').length,
            usage: parsed?.usage ?? null,
            error: response.ok ? null : text.slice(0, 500),
        }
    }
    catch (caught) {
        return {
            model,
            httpStatus: null,
            rateLimited: false,
            retryAfter: null,
            headerMs: null,
            totalMs: Date.now() - startedAt,
            finishReason: null,
            contentChars: 0,
            reasoningChars: 0,
            usage: null,
            error: String(caught),
        }
    }
}

console.log('4 モデルを同時に投げる。消費 4 リクエスト。')
const parallelStartedAt = Date.now()
const results = await Promise.all(MODELS.map(callOnce))
const parallelTotalMs = Date.now() - parallelStartedAt

/**
 * 判定。
 *
 * 並列の総時間が「最も遅い 1 本」に近ければ並列が効いている。
 * 各本の合計に近ければキューされて直列と同じである。
 */
const slowestMs = Math.max(...results.map((r) => r.totalMs))
const sumMs = results.reduce((total, r) => total + r.totalMs, 0)
const anyRateLimited = results.some((r) => r.rateLimited)
/** 総時間が合計の 70% 未満なら並列が効いていると判断する */
const parallelEffective = !anyRateLimited && parallelTotalMs < sumMs * 0.7

const report = {
    ts: new Date().toISOString(),
    baseUrl: BASE_URL,
    prompt: PROMPT,
    requestsConsumed: MODELS.length,
    parallelTotalMs,
    slowestSingleMs: slowestMs,
    sumOfIndividualMs: sumMs,
    anyRateLimited,
    parallelEffective,
    conclusion: anyRateLimited
        ? '429 が返った。タスク 26.1 は直列＋進捗表示に落とす'
        : parallelEffective
            ? '並列で短縮された。タスク 26.1 は並列のままでよい'
            : 'キューされて直列と同じ総時間になった。タスク 26.1 は直列＋進捗表示に落とす',
    results,
}

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log('')
console.log(`並列の総時間      : ${parallelTotalMs} ms`)
console.log(`最も遅い 1 本      : ${slowestMs} ms`)
console.log(`各本の合計        : ${sumMs} ms`)
console.log(`429 の発生        : ${anyRateLimited ? 'あり' : 'なし'}`)
console.log(`並列は有効か      : ${parallelEffective ? 'はい' : 'いいえ'}`)
console.log('')
console.log(report.conclusion)
console.log(`結果を ${OUT} に保存した。`)
for (const r of results) {
    console.log(
        `  ${r.model}: HTTP ${r.httpStatus} / ${r.totalMs} ms / finish_reason=${r.finishReason} / content ${r.contentChars} 文字`,
    )
}
