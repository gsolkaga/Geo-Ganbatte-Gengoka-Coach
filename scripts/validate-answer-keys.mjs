/**
 * 正解タグと用語辞書の整合を調べる（AI 未使用、リクエスト消費 0）
 *
 * ## 何を見るか
 *
 * 正解タグに割り当てた用語の該当国リストに、**その出題の正解国が入っているか。**
 *
 * 入っていなければ「そのスロットを見れば N カ国に絞れる」という助言の先に
 * 正解が無いことになる。**助言が学習者を正解から遠ざける。**
 *
 * ## 誰の問題か
 *
 * **タグ付けの誤りではない。** タグは「この地点に何が写っているか」を書くもので、
 * 一般的な GeoGuessr プレイヤーの知識に基づいて作る。それは正しい。
 *
 * 問題は**用語が「見た目の名前」と「該当国の主張」を 1 つに束ねている**ことである。
 *
 * ```
 * 観察          「中央線は黄色の実線」          ← 正しい
 * 用語 ID        road_marking_center_yellow    ← 文字面としては正しい対応
 * 用語が持つ主張 「US CA MX BR ... TH KH の 13 カ国」  ← **KZ が無い**
 * ```
 *
 * > **用語は観察の名前ではなく、主張である。**
 * > 正規化すると、名前だけでなく主張まで輸入される。
 *
 * したがって直すのは**辞書の該当国リスト**である（`data/glossary-human.json`）。
 * 人間の作業であり、これが Plonk It が何年もかけていることである。
 *
 * 使い方:
 *   node scripts/validate-answer-keys.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const OUT_PATH = path.join('docs', 'glossary-gaps.md')

const questions = JSON.parse(fs.readFileSync(path.join('data', 'questions.json'), 'utf8'))
const glossary = JSON.parse(fs.readFileSync(path.join('data', 'glossary.json'), 'utf8')).terms
const byId = new Map(glossary.map((t) => [t.id, t]))

/** 絞り込みに使う用語だけを見る（`server/utils/narrowing.ts` と同じ条件） */
const usable = (t) => t !== undefined && t.certainty !== 'unverified'

const gaps = []
const missingIds = []

for (const question of questions) {
    for (const [slot, entry] of Object.entries(question.slots)) {
        if (entry.state !== 'visible' || entry.terms.length === 0) continue

        const terms = entry.terms.map((id) => {
            const t = byId.get(id)
            if (!t) missingIds.push({ question: question.id, slot, id })
            return t
        })
        const used = terms.filter(usable)
        if (used.length === 0) continue

        // 同一スロット内は積集合。`narrowing.ts` と揃える
        let acc = null
        for (const t of used) {
            const set = new Set(t.countries)
            acc = acc === null ? set : new Set([...acc].filter((c) => set.has(c)))
        }

        if (acc.size === 0) {
            gaps.push({
                question: question.id, country: question.country, slot,
                kind: '矛盾', size: 0,
                terms: used.map((t) => `${t.id}(${t.countries.length})`).join(' + '),
                detail: '同一スロット内の用語の積集合が空。用語のどれかの該当国が偏っている',
            })
            continue
        }
        if (!acc.has(question.country)) {
            /**
             * **2 種類を混ぜてはならない。**
             *
             * 当初は全部「辞書の穴」として報告した。**誤りだった。**
             * v2 の実測（2026-08-17）で 3 モデルが違いを説明した。
             *
             *   (a) **辞書が不完全**  該当国リストが埋まっていない
             *       例: road_marking_center_white は CL のみ。
             *           note に「欧州の国を埋めるまで保留」と書いてある
             *
             *   (b) **観察が誤誘導**  用語は正しく、その手がかりが国を示さない
             *       例: road_marking_center_yellow の 13 カ国は
             *           メタとして正しい。旧ソ連圏は「黄色い中央線の国」ではない。
             *           学習者が見た黄色い実線はその地点の事実だが、
             *           **国を示す手がかりではない**
             *
             * > **観察が事実として正しいことと、その観察が国を示すことは別である。**
             *
             * (b) なら積集合が正解を含まないのは**正しい診断**であり、直す必要はない。
             * 区別は人間が判断する。**判断の材料として `note` を出す。**
             */
            const notes = used
                .filter((t) => t.note)
                .map((t) => `${t.id}: ${String(t.note).replace(/\*\*/g, '').slice(0, 120)}`)
            const suspectIncomplete = used.some(
                (t) => t.disputed === true || /保留|機能しない|未記載|埋める/.test(String(t.note ?? '')),
            )
            gaps.push({
                question: question.id, country: question.country, slot,
                kind: '正解を含まない', size: acc.size,
                terms: used.map((t) => `${t.id}(${t.countries.length})`).join(' + '),
                // **どちらかを断定しない。** 材料を出して人間が決める
                classification: suspectIncomplete
                    ? '**(a) 辞書が不完全の疑い**（note に保留と書いてある）'
                    : '(b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない）',
                notes,
                detail: suspectIncomplete
                    ? `${question.country} を該当国に追加するか検討する`
                    : `用語が正しければ直す必要はない。**その手がかりが ${question.country} を示さないことが正しい診断である**`,
            })
        }
    }
}

const lines = [
    '# 正解タグと用語辞書の不整合',
    '',
    `生成: ${new Date().toISOString()}　`,
    '`node scripts/validate-answer-keys.mjs` が算出した。**AI を使っていない。リクエスト消費 0。**',
    '',
    '## これはタグ付けの誤りではない',
    '',
    'タグは「この地点に何が写っているか」を書くものであり、',
    '一般的な GeoGuessr プレイヤーの知識に基づいて作る。**それは正しい。**',
    '',
    '用語が「見た目の名前」と「該当国の主張」を 1 つに束ねているため、',
    '正規化すると名前だけでなく主張まで輸入される。',
    '',
    '```',
    '観察           「中央線は黄色の実線」                ← その地点の事実として正しい',
    '用語 ID         road_marking_center_yellow          ← 文字面としては正しい対応',
    '用語が持つ主張  US CA MX BR AR UY PE BO PY CO EC TH KH  ← KZ が無い',
    '```',
    '',
    '> **用語は観察の名前ではなく、主張である。**',
    '',
    '## 不整合には 2 種類ある。混ぜてはならない',
    '',
    '当初この一覧は全部を「辞書の穴」として報告した。**誤りだった。**',
    'v2 の実測（2026-08-17、`docs/v2-kz.md`）で 3 モデルが違いを説明した。',
    '',
    '| 種類 | 意味 | 直すか |',
    '|---|---|---|',
    '| **(a) 辞書が不完全** | 該当国リストが埋まっていない | **直す**（`data/glossary-human.json`） |',
    '| **(b) 観察が誤誘導** | 用語は正しく、その手がかりが国を示さない | **直さない。正しい診断である** |',
    '',
    '(a) の例。`road_marking_center_white` は該当国が `CL` の 1 件しかなく、',
    'note に「**この用語は現状ほぼ機能しない。** 欧州の国を埋めるまで保留」と書いてある。',
    '白い中央線は欧州の標準であり、ロシアも南アフリカも該当する。**埋めるべきである。**',
    '',
    '(b) の例。`road_marking_center_yellow` の 13 カ国は**メタとして正しい。**',
    '旧ソ連圏は「黄色い中央線の国」ではない。学習者が見た黄色い実線は',
    'その地点の事実だが、**国を示す手がかりではない。**',
    '',
    '> **観察が事実として正しいことと、その観察が国を示すことは別である。**',
    '',
    '(b) では積集合が正解を含まないことが**正しい診断**である。`.RU` ドメインと同じ誤誘導である。',
    '',
    `## 検出: ${gaps.length} 件`,
    '',
    gaps.length ? '| 問 | 正解 | スロット | 種類 | 残り | 用語（該当国数） | 見立て |' : '（なし）',
    gaps.length ? '|---|---|---|---|---|---|---|' : '',
    ...gaps.map((g) =>
        `| ${g.question} | ${g.country} | \`${g.slot}\` | ${g.kind} | ${g.size} | ${g.terms} | ${g.classification ?? '—'} |`),
    '',
]

if (gaps.length) {
    lines.push(
        '## 対応の候補',
        '',
        '**見立ては機械的な推定である。** `note` に「保留」「機能しない」と',
        '書いてあるかどうかで分けているだけなので、最終判断は人間が行う。',
        '',
    )
    for (const g of gaps) {
        lines.push(`### ${g.question} / \`${g.slot}\`（正解 ${g.country}、残り ${g.size} カ国）`, '')
        lines.push(`- 用語: ${g.terms}`)
        lines.push(`- 見立て: ${g.classification ?? '—'}`)
        lines.push(`- 対応: ${g.detail}`)
        for (const note of g.notes ?? []) lines.push(`- note — ${note}`)
        lines.push('')
    }
}

if (missingIds.length) {
    lines.push(
        '## 辞書に存在しない用語 ID',
        '',
        '**辞書を再生成したときに ID が変わった可能性がある。**',
        '',
        ...missingIds.map((m) => `- ${m.question} / \`${m.slot}\`: \`${m.id}\``),
        '',
    )
}

lines.push(
    '## 影響',
    '',
    '`server/utils/narrowing.ts` は以下を守っているため、**誤った助言は表示されない。**',
    '',
    '- 積集合が空（矛盾）の行は `nextPriority` に出さない',
    '- **正解国を含まない行は `nextPriority` に出さない**',
    '- `unverified`（AI 生成）の用語は絞り込み計算に使わない',
    '',
    'その結果として「次に見るべきスロット」が空になる出題がある。',
    '**空であることが、辞書が足りていないという事実の表示である。**',
    '',
)

fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf8')

console.log(`出題 ${questions.length} 件 / 用語 ${glossary.length} 件を検査した（消費 0）`)
console.log('')
console.log(`**不整合: ${gaps.length} 件**`)
for (const g of gaps) {
    console.log(`  ${g.question}（正解 ${g.country}）/ ${g.slot.padEnd(20)} ${g.kind.padEnd(8)} 残り ${g.size} : ${g.terms}`)
}
if (missingIds.length) console.log(`辞書に無い用語 ID: ${missingIds.length} 件`)
console.log('')
console.log(`保存先: ${OUT_PATH}`)
