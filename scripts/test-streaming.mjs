/**
 * ストリーミングで 504 Request timed out を回避できるかの検証
 *
 * 非ストリーミング（stream: false）では、推論に時間がかかるモデルで
 * 504 Request timed out が発生する。国定数テーブルの生成で Kimi-K2.6 が該当した。
 *
 * さくらの AI Engine は SLA 適用対象外であり、タイムアウト値は公開されていない。
 * 変更する手段も提供されていない。
 *
 * この種のタイムアウトは「レスポンスが始まらないこと」で発動するのが一般的であるため、
 * ストリーミングにすれば最初のトークンが早く流れて回避できる可能性がある。
 * それを 1 リクエストで検証する。
 *
 * 使い方:
 *   $env:SAKURA_AI_TOKEN = Read-Host "token"
 *   node scripts/test-streaming.mjs
 *   node scripts/test-streaming.mjs preview/Kimi-K2.6 14
 *
 * 引数: [モデル名] [バッチ番号]
 */

import fs from 'node:fs'
import path from 'node:path'

const TOKEN = process.env.SAKURA_AI_TOKEN
if (!TOKEN) {
    console.error('SAKURA_AI_TOKEN が未設定です。')
    process.exit(1)
}

const MODEL = process.argv[2] ?? 'preview/Kimi-K2.6'
const BATCH_NUM = Number(process.argv[3] ?? 14)

/**
 * 第 4 引数でバッチサイズを上書きできる。
 *
 * 既定の 6 カ国では所要時間が 94 秒程度にとどまり、504 が発生した 300 秒に届かない。
 * タイムアウトが「総所要時間」に対するものか「初バイトまでの時間」に対するものかを
 * 判定するには、300 秒を超える実行が必要である。
 *
 * 30 カ国程度を一度に投げれば Kimi なら確実に超える。
 *
 *   node test-streaming.mjs preview/Kimi-K2.6 1 30
 */
const BATCH_SIZE_OVERRIDE = process.argv[4] ? Number(process.argv[4]) : null

const DATA_DIR = 'data'
const DOCS_DIR = 'docs'
const OUT_DIR = path.join(DOCS_DIR, 'generated-streaming')
const SEED_PATH = path.join(DATA_DIR, 'countries-seed.json')
const URI = 'https://api.ai.sakura.ad.jp/v1/chat/completions'

const BATCH_SIZE = BATCH_SIZE_OVERRIDE ?? 6
const MAX_TOKENS = 32000

fs.mkdirSync(OUT_DIR, { recursive: true })

const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'))
const batch = seed.slice((BATCH_NUM - 1) * BATCH_SIZE, BATCH_NUM * BATCH_SIZE)

if (batch.length === 0) {
    console.error(`バッチ ${BATCH_NUM} は範囲外です。`)
    process.exit(1)
}

console.log(`モデル: ${MODEL}`)
console.log(`件数: ${batch.length}`)
console.log(`対象: ${batch.map((c) => c.code).join(' ')}`)
console.log('')

// run-country-table.mjs と同一のスキーマ・プロンプトを使う（比較のため）
const SCRIPT_ENUM = [
    'latin', 'cyrillic', 'greek', 'arabic', 'hebrew', 'georgian', 'armenian',
    'devanagari', 'bengali', 'sinhala', 'tamil', 'thai', 'khmer', 'lao', 'tibetan',
    'chinese_traditional', 'chinese_simplified', 'japanese_kana_kanji', 'korean_hangul', 'other',
]

const schema = {
    type: 'object',
    properties: {
        countries: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    code: { type: 'string' },
                    traffic_side: { type: 'string', enum: ['right', 'left'] },
                    scripts: { type: 'array', items: { type: 'string', enum: SCRIPT_ENUM } },
                    languages: { type: 'array', items: { type: 'string' } },
                    plate_note: { type: 'string' },
                },
                required: ['code', 'traffic_side', 'scripts', 'languages', 'plate_note'],
                additionalProperties: false,
            },
        },
    },
    required: ['countries'],
    additionalProperties: false,
}

const SYSTEM = `あなたは地理と交通制度に関する事実を正確に答える役です。

## 守ること
- 推測で埋めない。確信がない項目は最も一般的な事実を答える
- 文字体系は「道路標識や看板に実際に現れるもの」を答える
- 公用語ではなく、標識に実際に表記される言語を答える
- 与えられた国コードの順序と件数を変えない`

const list = batch.map((c) => `${c.code} = ${c.name}`).join('\n')
const user = `次の ${batch.length} の国・地域について、走行車線・文字体系・標識に現れる言語・ナンバープレートの特徴を答えてください。

${list}

code は与えられたものをそのまま使ってください。`

const payload = {
    model: MODEL,
    messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
    ],
    max_tokens: MAX_TOKENS,
    response_format: { type: 'json_schema', json_schema: { name: 'country_table', strict: true, schema } },
    stream: true,
}

const started = Date.now()
let firstChunkMs = null
let chunkCount = 0
let content = ''
let reasoning = ''
let finishReason = ''
let usage = null

try {
    const res = await fetch(URI, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(payload),
    })

    console.log(`HTTP ${res.status}  ヘッダ受信まで ${Date.now() - started} ms`)

    if (!res.ok) {
        const text = await res.text()
        console.log('')
        console.log('=== 失敗 ===')
        console.log(text.slice(0, 500))
        console.log('')
        console.log(`所要 ${Date.now() - started} ms`)
        console.log('ストリーミングでも回避できなかった。')
        process.exit(1)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (firstChunkMs === null) {
            firstChunkMs = Date.now() - started
            console.log(`最初のチャンク: ${firstChunkMs} ms`)
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue

            const data = trimmed.slice(5).trim()
            if (data === '[DONE]') continue

            chunkCount++
            try {
                const j = JSON.parse(data)
                const delta = j.choices?.[0]?.delta ?? {}
                if (delta.content) content += delta.content
                if (delta.reasoning) reasoning += delta.reasoning
                if (delta.reasoning_content) reasoning += delta.reasoning_content
                if (j.choices?.[0]?.finish_reason) finishReason = j.choices[0].finish_reason
                if (j.usage) usage = j.usage
            } catch {
                // パースできないチャンクは無視する
            }

            if (chunkCount % 200 === 0) {
                const el = Date.now() - started
                const over = el > 300000 ? '  [300 秒を超過]' : ''
                process.stdout.write(`\r  chunks=${chunkCount}  content=${content.length}  reasoning=${reasoning.length}  ${el} ms${over}   `)
            }
        }
    }

    const totalMs = Date.now() - started
    console.log('')
    console.log('')
    console.log('=== 成功 ===')
    console.log(`ヘッダ受信      : ${firstChunkMs} ms`)
    console.log(`全体            : ${totalMs} ms`)
    console.log(`チャンク数      : ${chunkCount}`)
    console.log(`content 長      : ${content.length}`)
    console.log(`reasoning 長    : ${reasoning.length}`)
    console.log(`finish_reason   : ${finishReason || '(なし)'}`)
    if (usage) console.log(`usage           : prompt=${usage.prompt_tokens} completion=${usage.completion_tokens}`)

    let parsedOk = false
    let countryCount = 0
    try {
        countryCount = JSON.parse(content).countries?.length ?? 0
        parsedOk = true
    } catch {
        parsedOk = false
    }
    console.log(`JSON パース     : ${parsedOk}  countries=${countryCount}/${batch.length}`)

    const outFile = path.join(OUT_DIR, `stream-${MODEL.replace(/[^A-Za-z0-9._-]/g, '_')}-batch${String(BATCH_NUM).padStart(2, '0')}-n${batch.length}.json`)
    fs.writeFileSync(
        outFile,
        JSON.stringify({ model: MODEL, batch: BATCH_NUM, firstChunkMs, totalMs, chunkCount, finishReason, usage, content, reasoning }, null, 2),
        'utf8',
    )
    console.log('')
    console.log(`保存先: ${outFile}`)
    console.log('')
    /**
     * 所要時間だけで成否を判定してはならない。
     *
     * finish_reason が返らないままストリームが閉じられた場合、生成は完了していない。
     * HTTP は 200 で、チャンクも大量に届いているため、一見すると成功に見える。
     */
    const finished = finishReason !== ''

    if (!finished) {
        console.log('=== 打ち切られている ===')
        console.log('finish_reason が返っていない。生成は完了せずストリームが閉じられた。')
        console.log(`所要 ${totalMs} ms、本文 ${content.length} 字、推論 ${reasoning.length} 字。`)
        console.log('')
        if (totalMs > 290000) {
            console.log('約 300 秒で打ち切られている。タイムアウトは総所要時間に対する制限であり、')
            console.log('ストリーミングでは回避できない。')
            console.log('')
            console.log('さらに失敗の仕方が悪化する:')
            console.log('  非ストリーミング : HTTP 504 + エラー本文 → 明示的に失敗が分かる')
            console.log('  ストリーミング   : HTTP 200 + finish_reason なし → 成功に見える')
            console.log('')
            console.log('ストリーミングを使う場合、finish_reason の有無を必ず検証すること。')
        } else {
            console.log('300 秒未満で打ち切られている。別の原因を調べる必要がある。')
        }
    } else if (totalMs > 300000) {
        console.log('300 秒を超えて finish_reason 付きで完走した。')
        console.log('タイムアウトは総所要時間に対する制限ではない。')
    } else {
        console.log(`${totalMs} ms で完了した。504 が発生した 300 秒には達していない。`)
        console.log('タイムアウトに関する判定はできない。件数を増やして再検証する:')
        console.log(`  node scripts/test-streaming.mjs ${MODEL} 1 30`)
    }
} catch (e) {
    console.log('')
    console.log('=== 例外 ===')
    console.log(e.message)
    console.log(`所要 ${Date.now() - started} ms`)
}
