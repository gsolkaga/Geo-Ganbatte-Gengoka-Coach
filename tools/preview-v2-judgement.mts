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
import { buildV2Judgement, judgeReachedAnswer } from '../server/utils/grading'
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

/**
 * **v2 の記録も対象にする。** 当初は `run.variant !== 'v1'` で弾いていた。
 *
 * v1 の記録には正規化された用語 ID が入っていない（v1 は正規化しない）ので、
 * **`narrowingPower` と `intersection` は必ず「算出不能」になる。**
 * それを見て「絞り込み計算が動いていない」と読み違えた。
 *
 * > **入力に無いものが出ないのは、機能が壊れているのとは違う。**
 *
 * v2 の記録は正規化済みの用語 ID を持っているので、そちらで確認する。
 */
for (const name of names) {
    const run = JSON.parse(await readFile(join('data', 'runs', name), 'utf8')) as RunRecord
    const question = byId.get(run.questionId)
    if (!question) continue

    const j = buildV2Judgement(run.answer, question.country, {
        tagSlots: question.slots,
        glossary,
    })

    const candidates = run.answer.candidates.map((c) => `${c.country}(${c.confidence})`).join(' ')
    // **`hit` と「本命として到達したか」を並べて出す。** これを混ぜていたのがバグだった
    const reached = judgeReachedAnswer(run.answer.candidates, question.country)

    console.log('')
    const normalized = Object.values(run.answer.slots)
        .reduce((n, e) => n + (e?.terms?.length ?? 0), 0)
    console.log(`=== ${run.questionId}（正解 ${question.country}）[${run.variant}] 回答: ${candidates}`)
    console.log(`  記録された用語 ID   : ${normalized} 件${normalized === 0 ? '（正規化前。絞り込みは算出不能になる）' : ''}`)
    console.log(`  hit=${j.hit}(${j.hitConfidence ?? '—'}) / 本命として到達=${reached}`)
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

    /**
     * **辞書の該当国リストが正解タグと矛盾していないか。**
     *
     * 「そこを見れば N カ国に絞れる」と言うとき、**その N カ国に正解が入っていなければ
     * 助言が学習者を正解から遠ざける。**
     *
     * 実測（2026-08-17）で `q-kz-01` の `road_marking` にこれが起きた。
     * 正解タグは「中央線は黄色の実線」だが、人手辞書の
     * `road_marking_center_yellow` の 13 カ国に `KZ` が入っていない
     * （出典がアメリカ大陸と東南アジアの話だったため）。
     *
     * **辞書が不完全なのであり、学習者の誤りではない。**
     * 学習者に見せる情報ではないが、タグ付けする側は知る必要がある。
     */
    for (const row of j.nextPriority ?? []) {
        const tagEntry = question.slots[row.slot]
        const countries = new Set(
            (tagEntry?.terms ?? [])
                .map((id) => glossary.find((t) => t.id === id))
                // `server/utils/narrowing.ts` の `usableForNarrowing` と同じ条件にする。
                // ここを揃え忘れると、検査だけが古い実態を報告する
                .filter((t): t is Term => t !== undefined
                    && t.certainty !== 'unverified'
                    && t.disputed !== true
                    && t.exhaustive !== false)
                .flatMap((t) => t.countries),
        )
        if (countries.size > 0 && !countries.has(question.country)) {
            console.log(
                `  **辞書と正解タグの不整合**: ${row.slot} の用語に ${question.country} が含まれない`
                + `（用語 ${(tagEntry?.terms ?? []).join(' ')}）`,
            )
        }
    }
}
