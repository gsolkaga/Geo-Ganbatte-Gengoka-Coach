/**
 * 要件 14：AI は設計時に規約上の制約を考慮するか
 *
 * 同一の要求文を複数モデルに複数回投げ、生成物を原文のまま保存する。
 * 評価は後日 evaluation.md で人手で行う。
 *
 * 使い方（PowerShell）:
 *   $env:SAKURA_AI_TOKEN = Read-Host "token"
 *   node scripts/run-spec-generation.mjs
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
const OUT_DIR = path.join(DOCS_DIR, 'generated')
const PROMPT_PATH = path.join(DOCS_DIR, 'requirement-prompt.txt')
const URI = 'https://api.ai.sakura.ad.jp/v1/chat/completions'

const TRIALS = 3
const DELAY_MS = 2000

/**
 * 系統とサイズの幅を確保するための 5 モデル。
 * maxTokens は 2026-08-07 の実測に基づいてモデルごとに設定する。
 *
 * - Kimi-K2.6 は推論が 9,600〜10,600 字に達し、8,000 では設計書が完結しなかった
 * - llm-jp はコンテキスト長が 4,096 トークンしかなく、8,000 指定で HTTP 400 になる
 */
const MODELS = [
  { id: 'gpt-oss-120b', maxTokens: 8000 }, // 標準、reasoning 系
  { id: 'preview/Kimi-K2.6', maxTokens: 24000 }, // 最上位。推論が非常に長い
  { id: 'preview/gemma-4-31B-it', maxTokens: 8000 }, // 中位、別系統。reasoning なし
  { id: 'llm-jp-3.1-8x13b-instruct4', maxTokens: 3500 }, // 国産。コンテキスト 4,096 の制約
  { id: 'preview/Qwen3-0.6B-cpu', maxTokens: 8000 }, // 比較の下限として意図的に含める
]

fs.mkdirSync(OUT_DIR, { recursive: true })
const prompt = fs.readFileSync(PROMPT_PATH, 'utf8')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const safeName = (s) => s.replace(/[^A-Za-z0-9._-]/g, '_')

const log = []

for (const { id: model, maxTokens } of MODELS) {
  for (let trial = 1; trial <= TRIALS; trial++) {
    const outFile = path.join(OUT_DIR, `spec-${safeName(model)}-${trial}.json`)

    if (fs.existsSync(outFile)) {
      console.log(`skip  ${model} trial ${trial} (既存)`)
      continue
    }

    const payload = {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      stream: false,
    }

    console.log(`call  ${model} trial ${trial} ...`)
    const started = Date.now()

    try {
      const res = await fetch(URI, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(payload),
      })

      const text = await res.text()
      const durationMs = Date.now() - started

      if (!res.ok) {
        console.warn(`  fail  HTTP ${res.status}  ${text.slice(0, 200)}`)
        log.push({
          ts: new Date().toISOString(),
          model,
          trial,
          ok: false,
          durationMs,
          promptTokens: '',
          completionTokens: '',
          finishReason: '',
          error: `HTTP ${res.status}: ${text.slice(0, 300).replace(/\s+/g, ' ')}`,
        })
        await sleep(DELAY_MS)
        continue
      }

      // 原文のまま保存する（要約・抜粋をしない）
      fs.writeFileSync(outFile, text, 'utf8')

      const parsed = JSON.parse(text)
      const usage = parsed.usage ?? {}
      const choice = parsed.choices?.[0] ?? {}

      log.push({
        ts: new Date().toISOString(),
        model,
        trial,
        ok: true,
        durationMs,
        promptTokens: usage.prompt_tokens ?? '',
        completionTokens: usage.completion_tokens ?? '',
        finishReason: choice.finish_reason ?? '',
        error: '',
      })

      console.log(
        `  ok    ${durationMs} ms  completion=${usage.completion_tokens ?? '?'}  finish=${choice.finish_reason ?? '?'}`,
      )
    } catch (e) {
      const durationMs = Date.now() - started
      console.warn(`  fail  ${e.message}`)
      log.push({
        ts: new Date().toISOString(),
        model,
        trial,
        ok: false,
        durationMs,
        promptTokens: '',
        completionTokens: '',
        finishReason: '',
        error: e.message,
      })
    }

    await sleep(DELAY_MS)
  }
}

// 実行ログを CSV で追記保存
const logPath = path.join(OUT_DIR, 'run-log.csv')
const header = 'ts,model,trial,ok,durationMs,promptTokens,completionTokens,finishReason,error'
const toCsvRow = (r) =>
  [r.ts, r.model, r.trial, r.ok, r.durationMs, r.promptTokens, r.completionTokens, r.finishReason, r.error]
    .map((v) => `"${String(v).replace(/"/g, '""')}"`)
    .join(',')

if (log.length > 0) {
  const exists = fs.existsSync(logPath)
  const body = log.map(toCsvRow).join('\n') + '\n'
  fs.writeFileSync(logPath, exists ? body : header + '\n' + body, { flag: exists ? 'a' : 'w' })
}

console.log('')
console.log('=== 結果 ===')
console.table(
  log.map((r) => ({
    model: r.model,
    trial: r.trial,
    ok: r.ok,
    ms: r.durationMs,
    completion: r.completionTokens,
    finish: r.finishReason,
  })),
)
console.log('')
console.log(`保存先: ${OUT_DIR}`)
console.log('finish が length の場合、出力が途中で切れている。MAX_TOKENS を上げて該当ファイルを削除し再実行する。')
