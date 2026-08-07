/**
 * 実験 A：AI は軸を発見できるか、軸を与えれば埋められるか
 *
 * 章 11.2 の主張「AI は単一属性で括る、人間は組み合わせで分ける」を、
 * より鋭い形に置き換えるための実験。
 *
 *   仮説：AI は軸を与えられれば埋められる。軸を発見できない。
 *
 * 3 つのアームで構成する。arm3（積集合の計算）は analyze-bollard-axes.mjs 側。
 *
 *   arm1  軸の発見  AI に軸を自由に列挙させ、人間の 12 軸と突き合わせる（4 リクエスト）
 *   arm2  軸の充填  人間が確定した 12 軸を渡し、64 カ国の値を埋めさせる（64 リクエスト）
 *   arm3  積集合    コードが全組み合わせの積集合を計算し、人間の辞書と比較（0 リクエスト）
 *
 * arm1 を arm2 より先に走らせること。順序を逆にすると、軸を見せた後で
 * 「軸を発見できるか」を測ることになり、実験が壊れる。
 *
 * 使い方:
 *   $env:SAKURA_AI_TOKEN = Read-Host "token"
 *   node scripts/run-bollard-axes.mjs axes      # arm1、4 リクエスト
 *   node scripts/run-bollard-axes.mjs matrix    # arm2、64 リクエスト
 *
 * 中断しても再実行すれば既存ファイルはスキップされる。
 * リトライはしない。504 は消費されるため、失敗は事実として記録する。
 */

import fs from 'node:fs'
import path from 'node:path'

const TOKEN = process.env.SAKURA_AI_TOKEN
if (!TOKEN) {
    console.error('SAKURA_AI_TOKEN が未設定です。')
    console.error('PowerShell: $env:SAKURA_AI_TOKEN = Read-Host "token"')
    process.exit(1)
}

const MODE = process.argv[2]
if (MODE !== 'axes' && MODE !== 'matrix') {
    console.error('使い方: node scripts/run-bollard-axes.mjs axes|matrix')
    console.error('  axes   : arm1 軸の発見（4 リクエスト）')
    console.error('  matrix : arm2 軸の充填（64 リクエスト）')
    process.exit(1)
}

const OUT_DIR = path.join('docs', 'generated-bollard')
const URI = 'https://api.ai.sakura.ad.jp/v1/chat/completions'

/**
 * 1 バッチ 4 カ国。国定数テーブルでは 6 カ国だったが、
 * 1 カ国あたりの項目が 4 から 12 に増えるため出力量が約 3 倍になる。
 * タイムアウトは約 300 秒で変更できないため、処理量を小さく保つ。
 */
const BATCH_SIZE = 4
const DELAY_MS = 1500

/** 速い順に並べる。Kimi が詰まっても先に使えるデータが揃うようにする */
const MODELS = [
    { id: 'gpt-oss-120b', maxTokens: 12000 },
    { id: 'preview/gemma-4-31B-it', maxTokens: 12000 },
    { id: 'preview/Qwen3.6-35B-A3B', maxTokens: 20000 },
    { id: 'preview/Kimi-K2.6', maxTokens: 28000 },
]

const axesDef = JSON.parse(fs.readFileSync(path.join('data', 'bollard-axes.json'), 'utf8'))
const seed = JSON.parse(fs.readFileSync(path.join('data', 'countries-seed.json'), 'utf8'))
const nameOf = new Map(seed.map((c) => [c.code, c.name]))

fs.mkdirSync(OUT_DIR, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const safeName = (s) => s.replace(/[^A-Za-z0-9._-]/g, '_')

/** リトライしない。失敗はそのまま記録する */
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

// ============================================================
// arm1：軸の発見
// ============================================================

/**
 * 人間の 12 軸を一切見せない。
 * ボラードという対象と「国を弁別したい」という目的だけを与え、軸を列挙させる。
 *
 * 裏面（rear_marking）とガードレールとの関係（guardrail_relation）を挙げるかが焦点。
 * 前回生成した 17 用語には、この 2 軸に対応する記述が 1 つもなかった。
 */
const AXES_SYSTEM = `あなたは観察対象を弁別するための特徴量を設計する役です。

## 守ること
- 個々の国の答えを書かない。特徴の「軸」だけを設計する
- 軸は互いに独立であること。同じ情報を 2 つの軸で表さない
- 実際に写真を見て判定できる軸だけを挙げる。制度や規格の名称は挙げない
- 軸ごとに、取りうる値を列挙する`

const AXES_USER = `道路脇に立っている短い杭（ボラード、デリニエータポスト）の見た目から、
どの国で撮影された写真かを弁別したいと考えています。

そのために必要な観察の軸を設計してください。

軸の数は制限しません。弁別に本当に必要なものだけを挙げてください。`

const axesSchema = {
    type: 'object',
    properties: {
        axes: {
            type: 'array',
            minItems: 3,
            items: {
                type: 'object',
                properties: {
                    axis_id: { type: 'string', description: '英語の小文字とアンダースコアによる識別子' },
                    label_ja: { type: 'string', description: '軸の名前。20 字以内の日本語' },
                    values: {
                        type: 'array',
                        minItems: 2,
                        items: { type: 'string' },
                        description: 'この軸が取りうる値。英語の小文字とアンダースコア',
                    },
                    why_ja: { type: 'string', description: 'この軸が弁別に効く理由。60 字以内の日本語' },
                },
                required: ['axis_id', 'label_ja', 'values', 'why_ja'],
                additionalProperties: false,
            },
        },
    },
    required: ['axes'],
    additionalProperties: false,
}

async function runAxes() {
    console.log('=== arm1 軸の発見 ===')
    console.log(`${MODELS.length} リクエスト`)
    console.log('人間の 12 軸は見せない。突き合わせは analyze-bollard-axes.mjs で行う。')
    console.log('')

    for (const { id: model, maxTokens } of MODELS) {
        const outFile = path.join(OUT_DIR, `axes-${safeName(model)}.json`)
        if (fs.existsSync(outFile)) {
            console.log(`skip  ${model}`)
            continue
        }

        const payload = {
            model,
            messages: [
                { role: 'system', content: AXES_SYSTEM },
                { role: 'user', content: AXES_USER },
            ],
            max_tokens: maxTokens,
            response_format: { type: 'json_schema', json_schema: { name: 'bollard_axes', strict: true, schema: axesSchema } },
            stream: false,
        }

        process.stdout.write(`call  ${model} ... `)
        const started = Date.now()
        const r = await callOnce(payload)
        const ms = Date.now() - started

        if (!r.ok) {
            console.log(`fail ${r.status ? `HTTP ${r.status}` : r.error}  ${ms} ms`)
            if (r.text) console.log(`      ${r.text.slice(0, 200)}`)
            await sleep(DELAY_MS)
            continue
        }

        fs.writeFileSync(outFile, r.text, 'utf8')

        let n = 0
        let ids = []
        try {
            const parsed = JSON.parse(JSON.parse(r.text).choices[0].message.content)
            n = parsed.axes.length
            ids = parsed.axes.map((a) => a.axis_id)
        } catch {
            /* パース失敗もそのまま記録する */
        }
        console.log(`ok   ${ms} ms  軸=${n}`)
        if (ids.length) console.log(`      ${ids.join(' ')}`)

        await sleep(DELAY_MS)
    }

    console.log('')
    console.log(`保存先: ${OUT_DIR}`)
    console.log('次: node scripts/run-bollard-axes.mjs matrix')
}

// ============================================================
// arm2：軸の充填
// ============================================================

/**
 * 全軸を単一値の enum にする。配列にしない。
 *
 * 実測（countries-disagreement.md）では、配列の enum は盛られた。
 * インドの scripts に Qwen が greek を含む 8 種を挙げている。
 * 単一値の traffic_side では過剰生成が起きなかった。
 *
 * 全 enum に unknown を含める。含めないと、判断できない項目に対して
 * 誤った値を強制的に選ばせることになる（制約が逆にハルシネーションを生む）。
 */
function buildMatrixSchema() {
    const props = { code: { type: 'string' } }
    const required = ['code']

    for (const axis of axesDef.axes) {
        props[axis.id] = {
            type: 'string',
            enum: axis.values,
            description: `${axis.label}。判断できない場合は unknown を選ぶ`,
        }
        required.push(axis.id)
    }

    return {
        type: 'object',
        properties: {
            countries: {
                type: 'array',
                minItems: BATCH_SIZE,
                maxItems: BATCH_SIZE,
                items: { type: 'object', properties: props, required, additionalProperties: false },
            },
        },
        required: ['countries'],
        additionalProperties: false,
    }
}

const MATRIX_SYSTEM = `あなたは Street View の風景に写る道路設備の特徴を答える役です。

## 守ること
- 判断できない項目は必ず unknown を選ぶ。推測で埋めない
- **その国に存在するかではなく、Street View のカバレッジに写るかで答える**
- 国内に複数の種類がある場合は、幹線道路で最もよく見かけるものを答える。判断できなければ unknown
- 与えられた国コードの順序と件数を変えない

## unknown について
unknown は減点ではない。誤った値を埋められる方が困る。
確信を持って答えられる項目だけに値を入れること。`

async function runMatrix() {
    const schema = buildMatrixSchema()
    const codes = axesDef.countries
    const batches = []
    for (let i = 0; i < codes.length; i += BATCH_SIZE) {
        batches.push(codes.slice(i, i + BATCH_SIZE))
    }

    console.log('=== arm2 軸の充填 ===')
    console.log(`${codes.length} カ国 / ${batches.length} バッチ / ${MODELS.length} モデル / 軸 ${axesDef.axes.length}`)
    console.log(`最大 ${batches.length * MODELS.length} リクエスト`)
    console.log('')

    const log = []
    const incomplete = []

    for (const { id: model, maxTokens } of MODELS) {
        for (let b = 0; b < batches.length; b++) {
            const batch = batches[b]
            const num = String(b + 1).padStart(2, '0')
            const outFile = path.join(OUT_DIR, `matrix-${safeName(model)}-batch${num}.json`)

            if (fs.existsSync(outFile)) {
                console.log(`skip  ${model} batch ${num}`)
                continue
            }

            const list = batch.map((c) => `${c} = ${nameOf.get(c) ?? c}`).join('\n')
            const user = `次の ${batch.length} の国・地域について、道路脇の短い杭（ボラード、デリニエータポスト）の特徴を答えてください。

${list}

code は与えられたものをそのまま使ってください。
判断できない項目は unknown を選んでください。`

            const payload = {
                model,
                messages: [
                    { role: 'system', content: MATRIX_SYSTEM },
                    { role: 'user', content: user },
                ],
                max_tokens: maxTokens,
                response_format: { type: 'json_schema', json_schema: { name: 'bollard_matrix', strict: true, schema } },
                stream: false,
            }

            process.stdout.write(`call  ${model} batch ${num} ... `)
            const started = Date.now()
            const r = await callOnce(payload)
            const ms = Date.now() - started

            if (!r.ok) {
                const detail = r.status ? `HTTP ${r.status}` : r.error
                console.log(`fail ${detail}  ${ms} ms`)
                if (r.text) console.log(`      ${r.text.slice(0, 200)}`)
                log.push({ model, batch: num, ok: false, durationMs: ms, error: detail })
                await sleep(DELAY_MS)
                continue
            }

            fs.writeFileSync(outFile, r.text, 'utf8')

            const parsed = JSON.parse(r.text)
            const choice = parsed.choices?.[0] ?? {}
            const content = choice.message?.content ?? ''

            let n = 0
            let parseOk = false
            let codeMismatch = []
            let unknownRate = 0
            try {
                const rows = JSON.parse(content).countries ?? []
                n = rows.length
                parseOk = true

                const want = batch
                const got = rows.map((x) => x.code)
                codeMismatch = [...want.filter((x) => !got.includes(x)), ...got.filter((x) => !want.includes(x))]

                // unknown 率を記録する。高すぎる場合は充填できていないことを意味する
                let cells = 0
                let unknowns = 0
                for (const row of rows) {
                    for (const axis of axesDef.axes) {
                        cells++
                        if (row[axis.id] === 'unknown') unknowns++
                    }
                }
                unknownRate = cells ? Math.round((unknowns / cells) * 100) : 0
            } catch {
                parseOk = false
            }

            const complete = parseOk && n === batch.length && codeMismatch.length === 0
            const mark = complete ? 'ok  ' : '欠損'
            let detail = ''
            if (codeMismatch.length) detail += `  コード不整合=${codeMismatch.join(',')}`

            console.log(`${mark} ${ms} ms  finish=${choice.finish_reason}  ${n}/${batch.length}  unknown=${unknownRate}%${detail}`)

            if (!complete) incomplete.push({ model, batch: num, parseOk, n, expected: batch.length, codeMismatch, file: outFile })

            log.push({
                model,
                batch: num,
                ok: true,
                complete,
                durationMs: ms,
                finishReason: choice.finish_reason ?? '',
                parseOk,
                countries: n,
                expected: batch.length,
                unknownRate,
                error: '',
            })

            await sleep(DELAY_MS)
        }
    }

    const logPath = path.join(OUT_DIR, 'matrix-run-log.csv')
    const header = 'model,batch,ok,complete,durationMs,finishReason,parseOk,countries,expected,unknownRate,error'
    const row = (r) =>
        [r.model, r.batch, r.ok, r.complete ?? '', r.durationMs, r.finishReason ?? '', r.parseOk ?? '', r.countries ?? '', r.expected ?? '', r.unknownRate ?? '', r.error ?? '']
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(',')

    if (log.length > 0) {
        const exists = fs.existsSync(logPath)
        fs.writeFileSync(logPath, (exists ? '' : header + '\n') + log.map(row).join('\n') + '\n', { flag: exists ? 'a' : 'w' })
    }

    console.log('')
    if (incomplete.length > 0) {
        console.log('=== 不完全なバッチ ===')
        for (const i of incomplete) {
            let d = `  ${i.model} batch ${i.batch}  parsed=${i.parseOk}  ${i.n}/${i.expected}`
            if (i.codeMismatch?.length) d += `  コード不整合=${i.codeMismatch.join(',')}`
            console.log(d)
        }
        console.log('')
        console.log('再取得する場合は該当ファイルを削除して再実行する。')
        console.log('  node -e "const fs=require(\'fs\');[' + incomplete.map((i) => `'${i.file.replace(/\\/g, '/')}'`).join(',') + '].forEach(f=>{fs.unlinkSync(f);console.log(\'deleted\',f)})"')
        console.log('')
    }

    console.log(`保存先: ${OUT_DIR}`)
    console.log('次: node scripts/analyze-bollard-axes.mjs')
}

if (MODE === 'axes') await runAxes()
else await runMatrix()
