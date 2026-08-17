/**
 * v2 のコード判定を実データで確認する。**AI を呼ばない。リクエストを消費しない。**
 *
 * タスク 26 は 44 リクエストを消費する。**投げる前に判定部分が意図どおりか見る。**
 * 判定はコードで確定しているので、AI を呼ばずに全部確認できる。それが責務境界の利点である。
 *
 * 使い方:
 *   npx vite-node tools/preview-v2-judgement.mts
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { glossarySchema, questionsSchema } from '../shared/schemas'
import { buildV2Judgement } from '../server/utils/grading'
import type { Question, RunRecord, Term } from '../shared/types'

const questions = questionsSchema.parse(
    JSON.parse(await readFile(join('data', 'questions.json'), 'utf8')),
) as Question[]
const glossary = glossarySchema.parse(
    JSON.parse(await readFile(join('data', 'glossary.json'), 'utf8')),
) as Term[]
const byId = new Map(questions.map((q) => [q.id, q]))

const names = (await readdir(join('data', 'runs'))).filter((n) => n.endsWith('.json')).sort()

const fmt = (v: string[] | null) => (v === null ? '判定不能' : v.length ? v.join(' ') : '（なし）')

for (const name of names) {
    const run = JSON.parse(await readFile(join('data', 'runs', name), 'utf8')) as RunRecord
    if (run.variant !== 'v1') continue
    const question = byId.get(run.questionId)
    if (!question) continue

    const j = buildV2Judgement(run.answer, question.country, {
        tagSlots: question.slots,
        glossary,
    })

    console.log('')
    console.log(`=== ${run.questionId}（${question.country}）hit=${j.hit} ${j.hitConfidence ?? '—'}`)
    console.log(`  見落とし            : ${fmt(j.missedSlots)}`)
    console.log(`  誤って「見えない」  : ${fmt(j.wrongAbsentSlots)}`)
    console.log(`  過剰申告            : ${fmt(j.overclaimedSlots)}`)
    console.log(`  視認できない        : ${fmt(j.blindSlots)}`)
    console.log(`  別欄に書いた        : ${(j.filedElsewhere ?? []).map((f) => `${f.slot}→${f.foundIn.join('/')}`).join(' ') || '（なし）'}`)
    console.log(`  別ルートで正解      : ${fmt(j.alternativeRoute)}`)
    console.log(`  失敗モード          : ${fmt(j.failureModes)}`)
    console.log(`  絞り込み力          : ${Object.entries(j.narrowingPower ?? {}).map(([s, n]) => `${s}=${n}`).join(' ') || '（なし）'}`)
    console.log(`  積集合              : ${j.intersection === null
        ? '算出不能（辞書に載る用語が 0）'
        : j.intersection.countries.length
            ? `${j.intersection.countries.length} カ国 [${j.intersection.countries.join(' ')}] 正解を含む=${j.intersection.containsAnswer}`
            : '0 カ国（矛盾）'}`)
    console.log(`  次に見るべき        : ${(j.nextPriority ?? []).slice(0, 4).map((n) => `${n.slot}(${n.resultingSize})`).join(' → ') || '（なし）'}`)
    console.log(`  発見                : ${fmt(j.discoveries)}`)
}
