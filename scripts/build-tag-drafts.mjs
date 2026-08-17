/**
 * 正解タグ（タスク 20）の下書きを生成する
 *
 * AI を使わない。`data/runs/` の観察メモを叩き台にするだけである。
 *
 * ## なぜ下書きを作るのか
 *
 * 14 スロット × 10 問をゼロから埋めるのは重い。しかし学習者は既に 13/14 を
 * 埋めており、**その大半は「実際に写っているもの」と一致するはずである。**
 * だから確認が必要なのは以下に絞れる。
 *
 *   `unknown`  まだ見ていない  → **見落としの候補。必ず pano を見て確認する**
 *   `absent`   写っていないと判断  → **誤って absent にした可能性がある**
 *   `visible`  写っていると判断  → 記述の精度を上げるだけでよい
 *
 * ## 正解タグと観察メモは別物である
 *
 * メモは「学習者が気づいたもの」、タグは「実際に写っているもの」。
 * **メモをそのままタグにしてはいけない。** それでは見落としが永久に検出できない。
 *
 * ## recognition（視認可能性）列を足している
 *
 * 実戦記録（docs/offline-works/）から分かったこと。
 * **国を特定できることと、学習者が視認できることは別である。**
 * カタールのカーメタのアンテナは完璧な弁別子だが、本人には認識できない。
 *
 * 視認できないものを「見落とし」として提示するのは、指標が目的と逆を向いている。
 * だからタグ付けと同じパスで視認可能性を記録する。
 *
 * 使い方:
 *   node scripts/build-tag-drafts.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { SLOT_DEFINITIONS, SLOT_STATE_LABELS } from '../shared/slots.ts'

const RUN_DIR = path.join('data', 'runs')
const OUT_PATH = path.join('docs', 'tag-drafts.md')

/** 優先順。ここから 3 問だけでも v1/v2 比較は成立する */
const PRIORITY = ['q-jp-01', 'q-tr-01', 'q-is-01']

const questions = JSON.parse(fs.readFileSync(path.join('data', 'questions.json'), 'utf8'))
const countries = JSON.parse(fs.readFileSync(path.join('data', 'countries.json'), 'utf8'))
const nameOf = new Map(countries.map((c) => [c.code, c.name]))

/**
 * 記録を問題ごとにまとめる。同じ問題に複数の記録がある場合は再採点である。
 * **10 問 11 記録。1 回リトライしている。** 問題数として数えるのは 10 である。
 */
const runsByQuestion = new Map()
for (const f of fs.readdirSync(RUN_DIR).filter((x) => x.endsWith('.json'))) {
    const r = JSON.parse(fs.readFileSync(path.join(RUN_DIR, f), 'utf8'))
    if (!runsByQuestion.has(r.questionId)) runsByQuestion.set(r.questionId, [])
    runsByQuestion.get(r.questionId).push({ file: f, ...r })
}
for (const list of runsByQuestion.values()) list.sort((a, b) => String(a.ts).localeCompare(String(b.ts)))

const ordered = [
    ...PRIORITY.filter((id) => runsByQuestion.has(id)),
    ...[...runsByQuestion.keys()].filter((id) => !PRIORITY.includes(id)).sort(),
]

const out = []
const w = (s = '') => out.push(s)

w('# 正解タグの下書き（タスク 20）')
w()
w('`data/runs/` の観察メモから機械的に生成した。**AI は使っていない。**')
w()
w(`問題 ${runsByQuestion.size} 件 / 記録 ${[...runsByQuestion.values()].reduce((n, l) => n + l.length, 0)} 件`)
w('（同じ問題に記録が 2 件あるのは再採点。**問題数として数えるのは 10 である**）')
w()

w('## 埋め方')
w()
w('**観察メモをそのままタグにしてはいけない。** メモは「学習者が気づいたもの」、')
w('タグは「実際に写っているもの」である。同じにすると見落としが永久に検出できない。')
w()
w('| メモの状態 | タグ付けで何をするか |')
w('|---|---|')
w('| **`未確認`** | **必ず pano を見る。ここが見落としの候補である** |')
w('| **`見えない`** | **誤って「見えない」にした可能性がある。確認する** |')
w('| `見えた` | 記述の精度を上げるだけでよい。写っている事実は確定している |')
w()
w('`確定` 列には、実際に写っているかを `visible` / `absent` で書く。')
w('判断できなければ空欄でよい。**空欄は「未検証」であって「該当なし」ではない。**')
w()
w('### 枠に合わない観察を見つけたら印を付ける')
w()
w('**実際に 1 件見つかっている。** `q-jp-01` の `bollard` に「ガードレールが黄色い」と書かれている。')
w('**ガードレールはボラードではない。** 枠に合わない観察を、一番近い枠に入れた形である。')
w()
w('放置すると採点が**過剰申告**と判定する。実際には本物の観察をしているのに減点される。')
w()
w('ルワンダの「ゴミが落ちていない」が `other` スロットを生んだのと同じ構図である。')
w()
w('> **AI は与えられた枠の中で答えるが、枠が間違っていることは指摘しない。**')
w('> 今回は人間が、枠に合わない観察を近い枠に入れた。**枠の穴は使ってみるまで見えない。**')
w()
w('該当する行の「実際に写っているもの」に `★枠ちがい` と書いておけば、8/17 に扱いを決める。')
w('選択肢は 3 つある。')
w()
w('| 案 | 内容 |')
w('|---|---|')
w('| スロットを増やす | `guardrail` を足す。**15 スロットになる。影響が大きい** |')
w('| `bollard` の定義を広げる | ラベルを「車道脇の杭・ガードレール」にする |')
w('| `other` に寄せる | 受け皿として機能させる。**辞書を育てる入口という設計どおり** |')
w()

w('### `視認` 列について')
w()
w('**国を特定できることと、学習者が視認できることは別である。**')
w()
w('実戦記録（`docs/offline-works/geo_guessr_reasoning_system.md`）で分かったこと。')
w()
w('| 事例 | 起きたこと |')
w('|---|---|')
w('| カタール | カーメタのアンテナが決定打とされたが**視認不可能**。別ルートで正解した |')
w('| ペルー | ガードレールのメタを**知らなかった**。景観と建築で正解した |')
w('| マレーシア | 電柱メタを**知っていたのに**、未知の要素が混ざって認識できなかった |')
w()
w('視認できないものを「見落とし」として提示するのは、指標が目的と逆を向いている。')
w('だから 3 値で記録する。')
w()
w('| 値 | 意味 |')
w('|---|---|')
w('| `easy` | 見ればすぐ分かる |')
w('| `hard` | 意識して探せば見える |')
w('| **`blind`** | **写っているが、この学習者には認識できない。見落としに数えない** |')
w()

w('## 優先順')
w()
w('**上の 3 問だけでも v1/v2 比較は成立する。** 10 問すべてを埋める必要はない。')
w()
w(`1. \`q-jp-01\` 2. \`q-tr-01\` 3. \`q-is-01\`（ボラードの実物確認が効く）`)
w()
w('---')
w()

for (const qid of ordered) {
    const runs = runsByQuestion.get(qid)
    const primary = runs.at(-1) // 再採点があれば新しい方を使う
    const q = questions.find((x) => x.id === qid)
    const priorityMark = PRIORITY.includes(qid) ? `**優先 ${PRIORITY.indexOf(qid) + 1}**` : '後回し可'

    w(`## ${qid}　${q?.country ?? '?'} ${nameOf.get(q?.country) ?? ''}　難易度 ${q?.difficulty ?? '?'}　${priorityMark}`)
    w()
    w(`- pano ID: \`${q?.panoId ?? '不明'}\``)
    w(`- 記録: ${runs.map((r) => `\`${r.file}\``).join(' , ')}${runs.length > 1 ? '（**再採点あり**）' : ''}`)

    const ans = primary.answer ?? {}
    const cands = (ans.candidates ?? []).map((c) => `${c.country}(${c.confidence})`).join(' ')
    w(`- 学習者の回答: ${cands || '—'}　決め手 = \`${ans.decisiveSlot ?? '—'}\`　正解 = ${primary.result?.hit ? '**当たり**' : 'はずれ'}`)
    if (ans.reasoning) w(`- 学習者の推論: ${ans.reasoning}`)
    w()

    w('| スロット | メモの状態 | 学習者が書いたこと | 確定（`visible`/`absent`） | 実際に写っているもの | 視認 |')
    w('|---|---|---|---|---|---|')

    for (const def of SLOT_DEFINITIONS) {
        const entry = ans.slots?.[def.id] ?? {}
        const state = entry.state ?? 'unknown'
        const stateLabel = SLOT_STATE_LABELS[state]?.label ?? state
        const plain = (entry.plain ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

        // 確認が必要な行を目立たせる。visible は事実が確定しているので薄くする
        const mark = state === 'visible' ? stateLabel : `**${stateLabel}**`
        const prefill = state === 'visible' ? 'visible' : ''
        const memo = state === 'visible' ? plain : plain ? `~~${plain}~~` : ''

        w(`| \`${def.id}\` | ${mark} | ${memo} | ${prefill} |  |  |`)
    }

    w()
    const stateOf = (d) => ans.slots?.[d.id]?.state ?? 'unknown'
    const unknowns = SLOT_DEFINITIONS.filter((d) => stateOf(d) === 'unknown')
    const absents = SLOT_DEFINITIONS.filter((d) => stateOf(d) === 'absent')
    const visibles = SLOT_DEFINITIONS.filter((d) => stateOf(d) === 'visible')

    // 優先度が違うので分けて出す。まとめると作業量が実際より重く見える
    w(`**優先 1（必ず見る）未確認 ${unknowns.length} 件** — ${unknowns.map((d) => `\`${d.id}\``).join(' ') || 'なし'}`)
    w()
    w(`**優先 2（誤判定の疑い）見えない ${absents.length} 件** — ${absents.map((d) => `\`${d.id}\``).join(' ') || 'なし'}`)
    w()
    w(`優先 3（記述の精度だけ）見えた ${visibles.length} 件`)
    w()
    w('決め手スロット（`decisiveSlots`）に入れるものを 1〜3 件選ぶ:')
    w()
    w('```')
    w('decisiveSlots: ')
    w('```')
    w()
    w('---')
    w()
}

w('## 8/17 に Kiro が行う変換')
w()
w('この表を埋めたら、以下へ機械的に反映する。**リクエストは消費しない。**')
w()
w('```')
w('確定 / 実際に写っているもの  →  data/questions.json の slots')
w('視認 = blind               →  見落としに数えない（別ルート正解の判定に使う）')
w('decisiveSlots              →  data/questions.json の decisiveSlots')
w('```')

fs.writeFileSync(OUT_PATH, out.join('\n') + '\n', 'utf8')

console.log(`問題 ${runsByQuestion.size} 件 / 記録 ${[...runsByQuestion.values()].reduce((n, l) => n + l.length, 0)} 件`)
console.log('')
console.log('| 問題 | 記録 | 未確認(必ず見る) | 見えない(疑い) | 見えた |')
for (const qid of ordered) {
    const runs = runsByQuestion.get(qid)
    const ans = runs.at(-1).answer ?? {}
    const count = (s) => SLOT_DEFINITIONS.filter((d) => (ans.slots?.[d.id]?.state ?? 'unknown') === s).length
    console.log(
        `| ${qid.padEnd(10)} | ${runs.length} | ${String(count('unknown')).padStart(2)} | ${String(count('absent')).padStart(2)} | ${String(count('visible')).padStart(2)} |`,
    )
}
console.log('')
console.log(`保存先: ${OUT_PATH}`)
