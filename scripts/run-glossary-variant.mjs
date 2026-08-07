/**
 * 用語辞書：プロンプト変更による対照実験
 *
 * 目的：0 件だったスロットについて、「知識がない」のか「指示に従って沈黙した」のかを判別する。
 *
 * 背景（run-glossary.mjs の実測、2026-08-07）:
 *   road_marking : gpt-oss 11 件 / 他 3 モデルすべて 0 件
 *   bollard      : gpt-oss 17 件 / 他 3 モデルすべて 0 件
 *
 *   一方 Qwen3-VL は pole 30 件、camera 46 件、terrain_vegetation 43 件を出している。
 *   インフラ全般が苦手なわけではなく、特定のスロットだけ沈黙している。
 *
 * 仮説：システムプロンプトの「確信のない項目は挙げない。数を埋めるために推測で作らない」
 *       に忠実に従い、0 件を返した。
 *
 * 変更点は 1 つだけ:
 *   - 上記の抑制指示を削除する
 *   - minItems が効かないため、ユーザーメッセージで最低件数を明示する
 *
 * **元の出力は上書きしない。** 0 件という結果自体が証拠であるため、別ディレクトリに保存する。
 *
 * 使い方:
 *   $env:SAKURA_AI_TOKEN = Read-Host "token"
 *   node scripts/run-glossary-variant.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const TOKEN = process.env.SAKURA_AI_TOKEN
if (!TOKEN) {
    console.error('SAKURA_AI_TOKEN が未設定です。')
    process.exit(1)
}

const DATA_DIR = 'data'
const DOCS_DIR = 'docs'
const OUT_DIR = path.join(DOCS_DIR, 'generated-glossary-variant')
const SEED_PATH = path.join(DATA_DIR, 'countries-seed.json')
const URI = 'https://api.ai.sakura.ad.jp/v1/chat/completions'

const DELAY_MS = 1500
const MIN_TERMS = 5

const MODELS = [
    { id: 'gpt-oss-120b', maxTokens: 12000 },
    { id: 'preview/gemma-4-31B-it', maxTokens: 12000 },
    { id: 'preview/Qwen3.6-35B-A3B', maxTokens: 12000 },
    { id: 'preview/Qwen3-VL-30B-A3B-Instruct', maxTokens: 12000 },
]

/**
 * 検証対象は最重要の 2 スロットに絞る。
 * GeoGuessr で最も重要なメタであり、かつ 3 モデルが揃って 0 件だった。
 */
const SLOTS = [
    { id: 'bollard', label: '車道脇の短い杭・ポール（ボラード）', hint: '断面の形、色の組み合わせ、反射板の色と数、高さ' },
    { id: 'road_marking', label: '道路の白線・黄線（路面標示）', hint: '中央線の色、実線か破線か、路肩線の有無と色' },
]

const SCRIPT_UNUSED = null // このスクリプトでは script スロットを扱わない

const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'))
const COUNTRY_CODES = seed.map((c) => c.code)
const countryList = seed.map((c) => `${c.code}=${c.name}`).join(' / ')

const schema = {
    type: 'object',
    properties: {
        terms: {
            type: 'array',
            minItems: MIN_TERMS,
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'ASCII の snake_case による識別子' },
                    canonical: { type: 'string', description: '正式な呼称。日本語可' },
                    plain: { type: 'string', description: '専門用語を知らない初心者が書きそうな平易な表現' },
                    aliases: { type: 'array', minItems: 1, items: { type: 'string' } },
                    countries: {
                        type: 'array',
                        minItems: 1,
                        items: { type: 'string', enum: COUNTRY_CODES },
                        description: 'この特徴が観察される国',
                    },
                    confusableWith: { type: 'array', items: { type: 'string' } },
                    note: { type: 'string', description: '補足。40 字以内' },
                },
                required: ['id', 'canonical', 'plain', 'aliases', 'countries', 'confusableWith', 'note'],
                additionalProperties: false,
            },
        },
    },
    required: ['terms'],
    additionalProperties: false,
}

/**
 * 元のシステムプロンプトから、以下の 2 文を削除したもの。
 *
 *   「確信のない項目は挙げない。数を埋めるために推測で作らない」
 *   「該当する国を漏らさず挙げる。少なく挙げると（略）」の後半の警告
 *
 * それ以外は元のプロンプトを維持する。変更を 1 点に絞るため。
 */
const SYSTEM = `あなたは Street View の風景から国を推測する際に使われる視覚的な手がかりを整理する役です。

## 守ること
- **実際に写真から観察できる特徴だけを挙げる。** 歴史や制度の知識で、写真に写らないものは挙げない
- 国の指定は与えられたコードの中からのみ選ぶ。リストにない国は挙げない
- **粗い用語と細かい用語の両方を挙げる。** 詳細は後述
- plain と aliases は「専門用語を知らない人が書きそうな表現」にする。正式名称を言い換えただけの表現にしない

## 粗い用語を必ず含めること
絞り込み力の低い用語も辞書に必要である。学習者が「絞り込めていない」ことを
教えるために使うためである。

粗い用語を省略しないこと。「役に立たないから」という理由で省くと、
学習者に「その観察では絞り込めない」と伝える手段が失われる。

## 該当国の挙げ方
- 該当する国を挙げる。判断に迷う場合は含める方を選ぶ`

fs.mkdirSync(OUT_DIR, { recursive: true })

console.log('プロンプト変更による対照実験')
console.log(`対象: ${SLOTS.map((s) => s.id).join(', ')}`)
console.log(`モデル: ${MODELS.length} 件 / 最大 ${SLOTS.length * MODELS.length} リクエスト`)
console.log('')
console.log('変更点: 抑制指示（確信のない項目は挙げない）を削除、最低件数を明示')
console.log('')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const safeName = (s) => s.replace(/[^A-Za-z0-9._-]/g, '_')

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

/** 元の実行での用語数（run-glossary.mjs の結果） */
function originalCount(model, slot) {
    const f = path.join(DOCS_DIR, 'generated-glossary', `${safeName(model)}-${slot}.json`)
    if (!fs.existsSync(f)) return null
    try {
        const j = JSON.parse(fs.readFileSync(f, 'utf8'))
        return (JSON.parse(j.choices[0].message.content).terms ?? []).length
    } catch {
        return null
    }
}

const log = []

for (const { id: model, maxTokens } of MODELS) {
    for (const slot of SLOTS) {
        const outFile = path.join(OUT_DIR, `${safeName(model)}-${slot.id}.json`)

        if (fs.existsSync(outFile)) {
            console.log(`skip  ${model} ${slot.id}`)
            continue
        }

        const user = `観察項目「${slot.label}」について、国を推測する手がかりになる用語を列挙してください。

観察の着目点: ${slot.hint}

対象とする国・地域（この中からのみ選ぶこと）:
${countryList}

粗い用語（多くの国に該当するもの）から決定的な用語（1 カ国のみ）まで、
絞り込み力の階層を作るように列挙してください。

**最低 ${MIN_TERMS} 件を挙げてください。**`

        const payload = {
            model,
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: user },
            ],
            max_tokens: maxTokens,
            response_format: { type: 'json_schema', json_schema: { name: 'glossary', strict: true, schema } },
            stream: false,
        }

        const before = originalCount(model, slot.id)
        process.stdout.write(`call  ${model.replace('preview/', '').padEnd(26)} ${slot.id.padEnd(14)} (元: ${before ?? '-'} 件) ... `)
        const started = Date.now()

        const r = await callOnce(payload)
        const durationMs = Date.now() - started

        if (!r.ok) {
            console.log(`fail ${r.status ? 'HTTP ' + r.status : r.error}  ${durationMs} ms`)
            log.push({ model, slot: slot.id, before, after: null, ok: false, durationMs })
            await sleep(DELAY_MS)
            continue
        }

        fs.writeFileSync(outFile, r.text, 'utf8')

        const parsed = JSON.parse(r.text)
        const choice = parsed.choices?.[0] ?? {}
        let after = 0
        try {
            after = (JSON.parse(choice.message?.content ?? '{}').terms ?? []).length
        } catch {
            after = -1
        }

        const verdict = before === 0 && after > 0 ? '  ★沈黙が解けた' : before === 0 && after === 0 ? '  →変化なし' : ''
        console.log(`${after} 件  ${durationMs} ms${verdict}`)

        log.push({ model, slot: slot.id, before, after, ok: true, durationMs, finishReason: choice.finish_reason ?? '' })
        await sleep(DELAY_MS)
    }
}

const logPath = path.join(OUT_DIR, 'comparison.csv')
const header = 'model,slot,before,after,ok,durationMs,finishReason'
const row = (r) =>
    [r.model, r.slot, r.before ?? '', r.after ?? '', r.ok, r.durationMs, r.finishReason ?? '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')

if (log.length > 0) {
    const exists = fs.existsSync(logPath)
    fs.writeFileSync(logPath, (exists ? '' : header + '\n') + log.map(row).join('\n') + '\n', { flag: exists ? 'a' : 'w' })
}

console.log('')
console.log('=== 比較 ===')
console.table(log.map((r) => ({ model: r.model.replace('preview/', ''), slot: r.slot, 元: r.before, 変更後: r.after })))
console.log('')
console.log(`保存先: ${OUT_DIR}（元の出力は generated-glossary/ に保持されている）`)
console.log('')
console.log('解釈:')
console.log('  0 → 正の値  : 知識はあった。抑制指示により沈黙していた')
console.log('  0 → 0       : 聞き方を変えても出ない。知識の不在の裏付けになる')
