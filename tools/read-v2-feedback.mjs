/**
 * v2 の添削を**学習者として通しで読む**ための書き出し（AI 未使用、消費 0）。
 *
 * ## なぜ必要か
 *
 * `npm run compare` は `data/compare/` に生データを残すが、**読むためのものではない。**
 * `tools/inspect-run.mjs` は 1 ファイルずつで、10 問 × 4 モデルを通して読めない。
 *
 * v2 の価値は「見落としを具体的に言えること」であり、それは**読んで初めて分かる。**
 * 集計表では「missedClues 1 件」までしか分からない。
 *
 * ## 何を出すか
 *
 * コードが確定させた判定（`hit` / 見落とし / 積集合）を先に置き、
 * そのあとに各モデルの添削を並べる。**判定と説明を混ぜない。**
 *
 * 打ち切ったモデルは、打ち切ったことを明記して中身を出さない。
 * **通ったふりをさせない。**
 *
 * 使い方:
 *   node tools/read-v2-feedback.mjs            data/runs の v2 記録すべて
 *   node tools/read-v2-feedback.mjs q-kz-01    出題を絞る
 */
import fs from 'node:fs'
import path from 'node:path'

const filter = process.argv[2] ?? null
const RUNS_DIR = path.join('data', 'runs')
const OUT_PATH = path.join('docs', 'v2-feedback-read.md')

const questions = new Map(
    JSON.parse(fs.readFileSync(path.join('data', 'questions.json'), 'utf8'))
        .map((q) => [q.id, q]),
)

const names = fs.readdirSync(RUNS_DIR).filter((n) => n.endsWith('.json')).sort()
const runs = []
for (const name of names) {
    const run = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, name), 'utf8'))
    if (run.variant !== 'v2') continue
    if (filter && run.questionId !== filter) continue
    runs.push({ name, run })
}

const list = (v) => (Array.isArray(v) ? (v.length ? v.join(' ') : '（なし）') : v === null ? '判定不能' : String(v))

const lines = [
    '# v2 の添削を通しで読む',
    '',
    `生成: ${new Date().toISOString()}　\`node tools/read-v2-feedback.mjs\`（**AI 未使用、消費 0**）`,
    '',
    `対象: v2 の記録 ${runs.length} 件${filter ? `（${filter} に限定）` : ''}`,
    '',
    '**コードが確定させた判定を先に置く。** そのあとに各モデルの添削を並べる。',
    '判定は集合演算で一意に決まり、モデルによって変わらない。',
    '**変わるのは説明の側だけである。** それが責務境界の意味である。',
    '',
]

if (runs.length === 0) {
    lines.push('v2 の記録が無い。`npm run compare` か画面の v2 で採点すること。', '')
}

for (const { name, run } of runs) {
    const question = questions.get(run.questionId)
    const j = run.result
    lines.push(
        '---',
        '',
        `## ${run.questionId}（正解 ${question?.country ?? '?'}）`,
        '',
        `記録: \`${name}\`　${run.ts}`,
        '',
        '### 自分の回答',
        '',
        `- 候補: ${run.answer.candidates.map((c) => `**${c.country}**(${c.confidence})`).join(' / ')}`,
        `- 決め手にした欄: \`${run.answer.decisiveSlot ?? '—'}\``,
        `- 理由: ${run.answer.reasoning || '（未記入）'}`,
        '',
        '観察メモ',
        '',
        '| 欄 | 状態 | 書いたこと | 用語 ID |',
        '|---|---|---|---|',
    )
    for (const [slot, entry] of Object.entries(run.answer.slots)) {
        if (entry.state === 'unknown' && !entry.plain && !entry.terms.length) continue
        lines.push(`| \`${slot}\` | ${entry.state} | ${entry.plain ?? '—'} | ${entry.terms.join(' ') || '—'} |`)
    }

    lines.push(
        '',
        '### コードが確定させた判定（AI を使っていない）',
        '',
        `- 正解が候補に入っていたか: **${j.hit}**（確信度 ${j.hitConfidence ?? '—'}）`,
        `- 見落とし: **${list(j.missedSlots)}**`,
        `- 失敗モード: ${list(j.failureModes)}`,
        `- 視認できない欄（見落としに数えない）: ${list(j.blindSlots)}`,
        `- 別の欄に書いていた（誤りに数えない）: ${(j.filedElsewhere ?? []).map((f) => `${f.slot}→${f.foundIn.join('/')}`).join(' ') || '（なし）'}`,
        `- 別ルートで正解に届いた: ${list(j.alternativeRoute)}`,
        '',
    )
    if (j.narrowingPower && Object.keys(j.narrowingPower).length) {
        lines.push('絞り込み力（該当国の件数。**少ないほど強い**）', '')
        for (const [slot, n] of Object.entries(j.narrowingPower).sort((a, b) => a[1] - b[1])) {
            lines.push(`- \`${slot}\` — ${n} カ国`)
        }
        lines.push('')
    }
    if (j.intersection === null) {
        lines.push('積集合: **算出不能**（辞書に載る用語が 0）。', '')
    }
    else if (j.intersection.countries.length === 0) {
        lines.push('積集合: **0 カ国（矛盾）。** 辞書か観察のどちらかが誤っている。**絞り込めたのではない。**', '')
    }
    else {
        lines.push(
            `積集合: **${j.intersection.countries.length} カ国** [${j.intersection.countries.join(' ')}]`,
            `　正解を含む: **${j.intersection.containsAnswer}**`
            + (j.intersection.containsAnswer
                ? ''
                : '　← **その観察は事実でも、この国を示していない**'),
            '',
        )
    }
    lines.push(
        `次に見るべき欄: ${(j.nextPriority ?? []).map((n) => `\`${n.slot}\`(${n.resultingSize} カ国)`).join(' → ') || '（なし）'}`,
        '',
    )
    if (!(j.nextPriority ?? []).length) {
        lines.push(
            '> **空であることが、辞書が足りていないという事実の表示である。**',
            '> 正解を含まない欄と矛盾する欄は提示しない。提示できるものが残らなかった。',
            '>',
            '> ただし**この欄は採点した時点の計算結果である。**',
            '> 2026-08-17 に「正解を含まない積集合を出発点にしない」を入れる前の記録では、',
            '> 誤誘導された観察のせいで空になっていることがある（`docs/v2-kz.md` 章 11）。',
            '> 現在のコードで再計算した結果は `npm run preview:v2`（消費 0）で見られる。',
            '',
        )
    }

    lines.push('### 各モデルの添削', '', '| モデル | status | finish | 生テキスト | 秒 |', '|---|---|---|---|---|')
    for (const m of j.models) {
        lines.push(
            `| ${m.model} | ${m.status === 'ok' ? 'ok' : `**${m.status}**`} | ${m.finishReason ?? '—'} `
            + `| ${m.rawContent.length} 字 | ${(m.totalMs / 1000).toFixed(1)} |`,
        )
    }
    lines.push('')

    for (const m of j.models) {
        lines.push(`#### ${m.model}`, '')
        if (!m.feedback) {
            lines.push(
                `**${m.status}。添削は読めない**（finish=${m.finishReason ?? '—'}、生テキスト ${m.rawContent.length} 字）。`,
                m.error ? `　理由: ${m.error}` : '',
                '',
                '**通ったふりをさせない。** ここに何も書かないのが正しい表示である。',
                '',
            )
            continue
        }
        const f = m.feedback
        if (f.judgmentUnavailable) {
            lines.push('> このモデルは「見落としは判定できない」と申告した（`judgmentUnavailable: true`）。', '')
        }
        lines.push(`**まとめ** ${f.summary}`, '')
        if (f.failureModeExplanation) lines.push(`**何がうまくいかなかったか** ${f.failureModeExplanation}`, '')
        if (f.missedClues.length) {
            lines.push(`**見落としていた手がかり（${f.missedClues.length} 件）**`, '')
            for (const c of f.missedClues) {
                lines.push(`- \`${c.slot}\` **${c.whatWasThere}**`, `  - なぜ効くか: ${c.whyItMatters}`)
            }
            lines.push('')
        }
        if (f.wrongReasoning.length) {
            lines.push(`**推論の誤り（${f.wrongReasoning.length} 件）**`, '')
            for (const c of f.wrongReasoning) lines.push(`- \`${c.slot}\` ${c.explanation}`)
            lines.push('')
        }
        if (f.vocabulary.length) {
            lines.push(`**言い換え（${f.vocabulary.length} 件）**`, '')
            for (const c of f.vocabulary) {
                lines.push(`- 「${c.learnerWrote}」 → **${c.canonicalTerm}**　${c.note}`)
            }
            lines.push('')
        }
        if (f.discriminationHint) lines.push(`**弁別のヒント** ${f.discriminationHint}`, '')
        if (f.nextPriority.length) lines.push(`**次に見るべき（AI の申告）** ${f.nextPriority.join(', ')}`, '')
        if (f.discoveries.length) lines.push(`**自力で見つけた手がかり** ${f.discoveries.join(' / ')}`, '')
    }
}

lines.push(
    '---',
    '',
    '## 読むときに注意すること',
    '',
    '- **該当国リストが渡っていない欄について「どの国で見られるか」を書いていたら、それは作られたものである。**',
    '  `other` 欄は正規化の対象外で用語 ID を持たない。実測で「旧ソビエト圏のカザフスタンで頻出し、',
    '  他の候補国と区別する重要な手がかり」と誤って断定された（`docs/v2-kz.md` 章 8）',
    '- **積集合が正解を含まないとき、辞書が悪いとは限らない。**',
    '  その観察が事実として正しくても、国を示さないことがある（`docs/v2-kz.md` 章 3）',
    '- **正規化は AI がやっている。** 用語の選択を学習者の判断として説明していたら、それは転嫁である',
    '- モデル間の不一致を、自分の記述が曖昧だった証拠として読まない',
    '  （メモが介在しない事実問題でもモデルは食い違う。`docs/bollard-axes-conclusion.md`）',
    '',
)

fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf8')

console.log(`v2 の記録 ${runs.length} 件を書き出した（消費 0）`)
console.log(`保存先: ${OUT_PATH}`)
