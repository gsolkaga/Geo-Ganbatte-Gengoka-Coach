/**
 * 国定数テーブルの生成（複数モデルによる突き合わせ用）
 *
 * 102 カ国 × 4 項目を複数モデルに生成させ、原文のまま保存する。
 * 突き合わせと不一致検出は merge-country-table.mjs で行う。
 *
 * 重要：モデル間の一致は正しさを保証しない。同じ誤りを複数モデルがすることは普通にある。
 * 信頼できる信号は不一致だけである。一致した項目は「未検証」として扱う。
 *
 * 使い方:
 *   $env:SAKURA_AI_TOKEN = Read-Host "token"
 *   node scripts/run-country-table.mjs
 *
 * 中断しても再実行すれば既存ファイルはスキップされる。
 */

import fs from 'node:fs'
import path from 'node:path'

const TOKEN = process.env.SAKURA_AI_TOKEN
if (!TOKEN) {
    console.error('SAKURA_AI_TOKEN が未設定です。')
    console.error('PowerShell: $env:SAKURA_AI_TOKEN = Read-Host "token"')
    process.exit(1)
}

const DATA_DIR = 'data'
const DOCS_DIR = 'docs'
const OUT_DIR = path.join(DOCS_DIR, 'generated-countries')
const SEED_PATH = path.join(DATA_DIR, 'countries-seed.json')
const URI = 'https://api.ai.sakura.ad.jp/v1/chat/completions'

const BATCH_SIZE = 6
const DELAY_MS = 1500

const MODELS = [
    { id: 'gpt-oss-120b', maxTokens: 8000 },
    { id: 'preview/gemma-4-31B-it', maxTokens: 8000 },
    /** 8000 では finish_reason=length で打ち切られ JSON が壊れた（batch17、実測） */
    { id: 'preview/Qwen3.6-35B-A3B', maxTokens: 16000 },
    /** 54〜177 秒とばらつき、300 秒を超えると 504。タイムアウトは約 300 秒（実測） */
    { id: 'preview/Kimi-K2.6', maxTokens: 24000 },
]

/** 文字体系は enum で制約する。自由記述だと機械的な突き合わせができない */
const SCRIPT_ENUM = [
    'latin',
    'cyrillic',
    'greek',
    'arabic',
    'hebrew',
    'georgian',
    'armenian',
    'devanagari',
    'bengali',
    'sinhala',
    'tamil',
    'thai',
    'khmer',
    'lao',
    'tibetan',
    'chinese_traditional',
    'chinese_simplified',
    'japanese_kana_kanji',
    'korean_hangul',
    'other',
]

/**
 * 件数を minItems / maxItems で制約する。
 *
 * 実測（2026-08-07）で、strict: true かつ JSON パース成功でありながら
 * countries が 0 件や 1 件しか返らない事象が発生した（要求は 6 件、6 ファイルで欠損）。
 * strict が保証するのは構造のみであり、件数や網羅性は保証されない。
 *
 * minItems / maxItems を追加して同じ 6 バッチを再取得したところ、6 件すべてが
 * 正しい件数で返った。ただし制約デコーディングで強制されたのか、スキーマ記述が
 * プロンプトとして解釈されて効いただけなのかは区別できていない。
 * そのためコード側の件数検証も併用する。
 */
const schema = {
    type: 'object',
    properties: {
        countries: {
            type: 'array',
            minItems: BATCH_SIZE,
            maxItems: BATCH_SIZE,
            items: {
                type: 'object',
                properties: {
                    code: { type: 'string' },
                    traffic_side: { type: 'string', enum: ['right', 'left'] },
                    /**
                     * 入れ子の配列にも minItems が必要である。
                     *
                     * 外側の countries に minItems を付けただけでは内側は制約されず、
                     * scripts: [] や languages: [] が返る事象が発生した（実測）。
                     *   Kimi-K2.6   : scripts が 12/102 で空（RU KZ KG を含む）
                     *   Kimi-K2.6   : languages が 5/102 で空
                     *   Qwen3.6-35B : languages が 8/102 で空
                     *
                     * 件数の制約は配列ごとに指定する必要がある。伝播しない。
                     */
                    scripts: {
                        type: 'array',
                        minItems: 1,
                        items: { type: 'string', enum: SCRIPT_ENUM },
                        description: '道路標識や看板に実際に現れる文字体系。使用頻度の高い順。1 件以上必ず答える',
                    },
                    languages: {
                        type: 'array',
                        minItems: 1,
                        items: { type: 'string' },
                        description: '道路標識や看板に現れる言語。英語の小文字表記（例: spanish, french）。1 件以上必ず答える',
                    },
                    plate_note: {
                        type: 'string',
                        description: 'ナンバープレートの色と形状の特徴。40 字以内の日本語',
                    },
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
- 文字体系は「道路標識や看板に実際に現れるもの」を答える。歴史的に使われていたが現在は使われていない文字体系は含めない
- 公用語ではなく、標識に実際に表記される言語を答える
- 与えられた国コードの順序と件数を変えない`

fs.mkdirSync(OUT_DIR, { recursive: true })
const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'))

const batches = []
for (let i = 0; i < seed.length; i += BATCH_SIZE) {
    batches.push(seed.slice(i, i + BATCH_SIZE))
}

console.log(`${seed.length} カ国 / ${batches.length} バッチ / ${MODELS.length} モデル`)
console.log(`最大 ${batches.length * MODELS.length} リクエスト`)
console.log('')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const safeName = (s) => s.replace(/[^A-Za-z0-9._-]/g, '_')

/**
 * リトライは行わない。失敗は事実としてそのまま記録する。
 *
 * 504 Request timed out はモデルの推論時間がサーバ側のタイムアウトを超えたことを示す
 * 構造的な制約であり、リトライで通してしまうと「このモデルはこの用途では完走しない」
 * という事実が記録から消える。
 *
 * さくらの AI Engine は SLA の適用対象外であり、タイムアウト値は公開されていない。
 * 失敗した分は、スクリプトを再実行すれば未取得のものだけが再試行される。
 */
async function callOnce(payload) {
    try {
        const res = await fetch(URI, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
            body: JSON.stringify(payload),
        })
        const text = await res.text()
        if (res.ok) return { ok: true, text }
        return { ok: false, status: res.status, text }
    } catch (e) {
        return { ok: false, error: e.message }
    }
}

const log = []
/** 構造は正しいが件数が足りない、またはパースできなかったバッチ */
const incomplete = []

for (const { id: model, maxTokens } of MODELS) {
    for (let b = 0; b < batches.length; b++) {
        const batch = batches[b]
        const num = String(b + 1).padStart(2, '0')
        const outFile = path.join(OUT_DIR, `${safeName(model)}-batch${num}.json`)

        if (fs.existsSync(outFile)) {
            console.log(`skip  ${model} batch ${num}`)
            continue
        }

        const list = batch.map((c) => `${c.code} = ${c.name}`).join('\n')
        const user = `次の ${batch.length} の国・地域について、走行車線・文字体系・標識に現れる言語・ナンバープレートの特徴を答えてください。

${list}

code は与えられたものをそのまま使ってください。`

        const payload = {
            model,
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: user },
            ],
            max_tokens: maxTokens,
            response_format: {
                type: 'json_schema',
                json_schema: { name: 'country_table', strict: true, schema },
            },
            stream: false,
        }

        process.stdout.write(`call  ${model} batch ${num} ... `)
        const started = Date.now()

        const r = await callOnce(payload)
        const durationMs = Date.now() - started

        if (!r.ok) {
            const detail = r.status ? `HTTP ${r.status}` : r.error
            console.log(`fail ${detail}  ${durationMs} ms`)
            if (r.text) console.log(`      ${r.text.slice(0, 200)}`)
            log.push({ model, batch: num, ok: false, durationMs, error: detail })
            await sleep(DELAY_MS)
            continue
        }

        fs.writeFileSync(outFile, r.text, 'utf8')

        const parsed = JSON.parse(r.text)
        const choice = parsed.choices?.[0] ?? {}
        const content = choice.message?.content ?? ''

        let n = 0
        let parseOk = false
        let emptyNested = []
        let codeMismatch = []
        try {
            const list = JSON.parse(content).countries ?? []
            n = list.length
            parseOk = true

            // 入れ子の配列が空の記録を検出する。件数が揃っていても内側は空になりうる
            emptyNested = list
                .filter((r) => !(r.scripts ?? []).length || !(r.languages ?? []).length)
                .map((r) => r.code)

            // コードが要求と一致するかを検証する。件数が揃っていても中身が違いうる
            const want = batch.map((c) => c.code)
            const got = list.map((r) => r.code)
            codeMismatch = [...want.filter((x) => !got.includes(x)), ...got.filter((x) => !want.includes(x))]
        } catch {
            parseOk = false
        }

        const complete = parseOk && n === batch.length && emptyNested.length === 0 && codeMismatch.length === 0
        const mark = complete ? 'ok  ' : '欠損'

        let detail = ''
        if (emptyNested.length) detail += `  空配列=${emptyNested.join(',')}`
        if (codeMismatch.length) detail += `  コード不整合=${codeMismatch.join(',')}`

        console.log(
            `${mark} ${durationMs} ms  finish=${choice.finish_reason}  parsed=${parseOk}  countries=${n}/${batch.length}${detail}`,
        )

        if (!complete) {
            incomplete.push({ model, batch: num, parseOk, countries: n, expected: batch.length, emptyNested, codeMismatch, file: outFile })
        }

        log.push({
            model,
            batch: num,
            ok: true,
            complete,
            durationMs,
            finishReason: choice.finish_reason ?? '',
            parseOk,
            countries: n,
            expected: batch.length,
            error: '',
        })

        await sleep(DELAY_MS)
    }
}

const logPath = path.join(OUT_DIR, 'run-log.csv')
const header = 'model,batch,ok,complete,durationMs,finishReason,parseOk,countries,expected,error'
const row = (r) =>
    [r.model, r.batch, r.ok, r.complete ?? '', r.durationMs, r.finishReason ?? '', r.parseOk ?? '', r.countries ?? '', r.expected ?? '', r.error ?? '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')

if (log.length > 0) {
    const exists = fs.existsSync(logPath)
    fs.writeFileSync(logPath, (exists ? '' : header + '\n') + log.map(row).join('\n') + '\n', {
        flag: exists ? 'a' : 'w',
    })
}

console.log('')

if (incomplete.length > 0) {
    console.log('=== 不完全なバッチ ===')
    console.log('strict: true でも件数・入れ子の配列・コードの一致は保証されない。')
    console.log('')
    for (const i of incomplete) {
        let d = `  ${i.model} batch ${i.batch}  parsed=${i.parseOk}  countries=${i.countries}/${i.expected}`
        if (i.emptyNested?.length) d += `  空配列=${i.emptyNested.join(',')}`
        if (i.codeMismatch?.length) d += `  コード不整合=${i.codeMismatch.join(',')}`
        console.log(d)
    }
    console.log('')
    console.log('再取得する場合は該当ファイルを削除して再実行する。')
    console.log('削除コマンド:')
    console.log('  node -e "const fs=require(\'fs\');[' + incomplete.map((i) => `'${i.file.replace(/\\/g, '/')}'`).join(',') + '].forEach(f=>{fs.unlinkSync(f);console.log(\'deleted\',f)})"')
    console.log('')
}

console.log(`保存先: ${OUT_DIR}`)
console.log('次: node scripts/merge-country-table.mjs')
