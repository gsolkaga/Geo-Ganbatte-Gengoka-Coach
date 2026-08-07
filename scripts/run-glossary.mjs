/**
 * 用語辞書の生成（複数モデルによる突き合わせ用）
 *
 * スロットごとに用語を生成させ、原文のまま保存する。
 * これは同時に「LLM が世界メタをどこまで知っているか」の検証にもなる。
 * 生成結果を人手で検証すれば、正答率が測れる。専用の検証スクリプトは不要。
 *
 * 重要：モデル間の一致は正しさを保証しない。信頼できる信号は不一致だけである。
 *
 * 使い方:
 *   $env:SAKURA_AI_TOKEN = Read-Host "token"
 *   node scripts/run-glossary.mjs
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
const OUT_DIR = path.join(DOCS_DIR, 'generated-glossary')
const SEED_PATH = path.join(DATA_DIR, 'countries-seed.json')
const URI = 'https://api.ai.sakura.ad.jp/v1/chat/completions'

const DELAY_MS = 1500

const MODELS = [
    { id: 'gpt-oss-120b', maxTokens: 12000 },
    { id: 'preview/gemma-4-31B-it', maxTokens: 12000 },
    { id: 'preview/Qwen3.6-35B-A3B', maxTokens: 12000 },
    /**
     * Kimi-K2.6 は意図的に含めない。
     *
     * 辞書生成のプロンプトは国定数テーブルより重い（102 カ国の enum、階層を考えさせる指示）。
     * Kimi は推論が長く応答が 90〜110 秒に達し、サーバ側のタイムアウト（504）に当たる。
     * 国定数テーブルの生成でも 504 が発生した。13 スロット分でリトライが走ると 1 時間近く溶ける。
     *
     * 代わりに Qwen3-VL-30B-A3B-Instruct を入れ、4 モデルでの突き合わせを維持する。
     */
    { id: 'preview/Qwen3-VL-30B-A3B-Instruct', maxTokens: 12000 },
]

/**
 * `other` は生成対象に含めない。他のどのスロットにも入らない観察の受け皿であり、
 * 辞書に用語を持たないことがこのスロットの定義そのものである。
 */
const SLOTS = [
    { id: 'traffic_side', label: '走行車線（右側通行か左側通行か）', hint: '二値だが、絞り込みの起点として重要' },
    { id: 'road_marking', label: '道路の白線・黄線（路面標示）', hint: '中央線の色、実線か破線か、路肩線の有無と色' },
    { id: 'bollard', label: '車道脇の短い杭・ポール（ボラード）', hint: '断面の形、色の組み合わせ、反射板の色と数、高さ' },
    { id: 'pole', label: '電柱・街灯の形', hint: '素材、腕木の形、碍子の数、街灯の傘の形' },
    { id: 'sign', label: '標識の形・色', hint: '警戒標識の形、縁の色、支柱の色と模様' },
    { id: 'script', label: '看板の文字（文字体系・言語）', hint: '文字体系と言語。粗い用語から細かい用語まで階層が必要' },
    { id: 'ground', label: '地面・土の色', hint: '赤土、黒土、白砂など' },
    { id: 'terrain_vegetation', label: '地形・植生', hint: '山か平地か、乾燥か湿潤か、木の種類' },
    { id: 'architecture', label: '建物・屋根の形', hint: '屋根の材質と色、壁の材質、窓の形、塀や柵' },
    { id: 'vehicle', label: '車・ナンバープレート', hint: 'ナンバーの色と縦横比、車種の傾向' },
    { id: 'pavement', label: '車道の舗装', hint: 'アスファルト、未舗装、ひび割れ、補修痕' },
    { id: 'camera', label: '撮影車・カメラの世代', hint: '車体の映り込み、機材の影、画質、色調、ぼかし' },
    { id: 'season', label: '季節・太陽', hint: '落葉、雪、影の長さと向き' },
]

const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'))
const COUNTRY_CODES = seed.map((c) => c.code)
const countryList = seed.map((c) => `${c.code}=${c.name}`).join(' / ')

const schema = {
    type: 'object',
    properties: {
        /**
         * 入れ子の配列にもすべて minItems を付ける。
         *
         * 国定数テーブルの生成で、外側の配列にだけ minItems を付けた結果、
         * 内側の配列が空になる事象が発生した（実測）。**件数の制約は伝播しない。**
         *   Kimi-K2.6   : scripts が 12/102 で空（RU KZ KG を含む）
         *   Qwen3.6-35B : languages が 8/102 で空
         *
         * countries が空だと絞り込み力が計算できず、この辞書の目的が果たせない。
         * confusableWith は空が正当なため制約しない。
         */
        terms: {
            type: 'array',
            minItems: 3,
            items: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'ASCII の snake_case による識別子。例: white_black_cap_bollard',
                    },
                    canonical: { type: 'string', description: '正式な呼称。日本語可' },
                    plain: {
                        type: 'string',
                        description: '専門用語を知らない初心者が書きそうな平易な表現。例: 白い杭で上が黒い',
                    },
                    aliases: {
                        type: 'array',
                        minItems: 1,
                        items: { type: 'string' },
                        description: '同じものを指す別の言い回し。初心者が使いそうな表現を優先する。1 件以上必ず挙げる',
                    },
                    countries: {
                        type: 'array',
                        minItems: 1,
                        items: { type: 'string', enum: COUNTRY_CODES },
                        description: 'この特徴が観察される国。該当する国をすべて挙げる。1 件以上必ず挙げる',
                    },
                    confusableWith: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '混同しやすい他の用語の id。該当がなければ空でよい',
                    },
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

const SYSTEM = `あなたは Street View の風景から国を推測する際に使われる視覚的な手がかりを整理する役です。

## 守ること
- **実際に写真から観察できる特徴だけを挙げる。** 歴史や制度の知識で、写真に写らないものは挙げない
- 国の指定は与えられたコードの中からのみ選ぶ。リストにない国は挙げない
- **粗い用語と細かい用語の両方を挙げる。** 詳細は後述
- 確信のない項目は挙げない。数を埋めるために推測で作らない
- plain と aliases は「専門用語を知らない人が書きそうな表現」にする。正式名称を言い換えただけの表現にしない

## 粗い用語を必ず含めること
絞り込み力の低い用語も辞書に必要である。学習者が「絞り込めていない」ことを
教えるために使うためである。

例（文字の場合）:
- 粗い: ラテン文字（70 カ国以上に該当。ほぼ絞り込めない）
- 中間: スペイン語（15 カ国）、キリル文字（8 カ国）
- 細かい: ポルトガル語（3 カ国）、繁体字（2 カ国）
- 決定的: かな漢字（1 カ国）

粗い用語を省略しないこと。「役に立たないから」という理由で省くと、
学習者に「その観察では絞り込めない」と伝える手段が失われる。

## 該当国の挙げ方
- 該当する国を漏らさず挙げる。少なく挙げると、その手がかりが実際より
  強い絞り込み力を持つことになり、学習者に誤った確信を与える
- 迷った場合は含める方を選ぶ（過大な絞り込み力を示すより安全である）`

fs.mkdirSync(OUT_DIR, { recursive: true })

console.log(`${SLOTS.length} スロット / ${MODELS.length} モデル`)
console.log(`最大 ${SLOTS.length * MODELS.length} リクエスト`)
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
/** 用語が 0 件、または countries が空の用語を含むもの */
const incomplete = []

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
絞り込み力の階層を作るように列挙してください。`

        const payload = {
            model,
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: user },
            ],
            max_tokens: maxTokens,
            response_format: {
                type: 'json_schema',
                json_schema: { name: 'glossary', strict: true, schema },
            },
            stream: false,
        }

        process.stdout.write(`call  ${model} ${slot.id.padEnd(20)} ... `)
        const started = Date.now()

        const r = await callOnce(payload)
        const durationMs = Date.now() - started

        if (!r.ok) {
            const detail = r.status ? `HTTP ${r.status}` : r.error
            console.log(`fail ${detail}  ${durationMs} ms`)
            if (r.text) console.log(`      ${r.text.slice(0, 200)}`)
            log.push({ model, slot: slot.id, ok: false, durationMs, error: detail })
            await sleep(DELAY_MS)
            continue
        }

        fs.writeFileSync(outFile, r.text, 'utf8')

        const parsed = JSON.parse(r.text)
        const choice = parsed.choices?.[0] ?? {}
        const content = choice.message?.content ?? ''

        let termCount = 0
        let maxCountries = 0
        let emptyCountries = 0
        let parseOk = false
        try {
            const terms = JSON.parse(content).terms ?? []
            termCount = terms.length
            maxCountries = Math.max(0, ...terms.map((t) => (t.countries ?? []).length))
            // countries が空の用語は絞り込み力が計算できず使えない
            emptyCountries = terms.filter((t) => !(t.countries ?? []).length).length
            parseOk = true
        } catch {
            parseOk = false
        }

        const complete = parseOk && termCount > 0 && emptyCountries === 0
        const mark = complete ? 'ok  ' : '欠損'

        console.log(
            `${mark} ${String(durationMs).padStart(6)} ms  finish=${choice.finish_reason}  terms=${termCount}  最大該当国数=${maxCountries}${emptyCountries ? `  countries空=${emptyCountries}` : ''}`,
        )

        if (!complete) incomplete.push({ model, slot: slot.id, parseOk, termCount, emptyCountries, file: outFile })

        log.push({
            model,
            slot: slot.id,
            ok: true,
            complete,
            durationMs,
            finishReason: choice.finish_reason ?? '',
            parseOk,
            termCount,
            maxCountries,
            emptyCountries,
            error: '',
        })

        await sleep(DELAY_MS)
    }
}

const logPath = path.join(OUT_DIR, 'run-log.csv')
const header = 'model,slot,ok,complete,durationMs,finishReason,parseOk,termCount,maxCountries,emptyCountries,error'
const row = (r) =>
    [r.model, r.slot, r.ok, r.complete ?? '', r.durationMs, r.finishReason ?? '', r.parseOk ?? '', r.termCount ?? '', r.maxCountries ?? '', r.emptyCountries ?? '', r.error ?? '']
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
    console.log('=== 不完全な生成 ===')
    console.log('')
    for (const i of incomplete) {
        console.log(`  ${i.model} ${i.slot}  terms=${i.termCount}  countries空=${i.emptyCountries}`)
    }
    console.log('')
    console.log('削除コマンド:')
    console.log('  node -e "const fs=require(\'fs\');[' + incomplete.map((i) => `'${i.file.replace(/\\/g, '/')}'`).join(',') + '].forEach(f=>{fs.unlinkSync(f);console.log(\'deleted\',f)})"')
    console.log('')
}

console.log(`保存先: ${OUT_DIR}`)
console.log('')
console.log('確認すべき点:')
console.log('  - 最大該当国数が小さすぎるスロットは、粗い用語が省略されている疑いがある')
console.log('  - script スロットで「ラテン文字」相当の用語（70 カ国以上）が出ているか')
console.log('  - camera スロットにマダガスカルのトレッカー撮影が出ているか（おそらく出ない）')
