/**
 * docs/tag-drafts.md → data/questions.json の正解タグ（タスク 20）
 *
 * **AI を使わない。表のパースと規則の適用だけである。**
 *
 * ## 何が難しいか
 *
 * 記入された「見えない」が **2 つの意味で使われている。**
 *
 *   1. そこに無い（「枯れ葉のみ線は無し」「消火栓は見えるがボラードでは無い」）
 *   2. 写っているが判別できない（「太陽の照り返しが強く白飛びしており視認不可」）
 *
 * これを取り違えると採点が逆を向く。
 * **1 を `visible` にすると過剰申告を検出できず、2 を `absent` にすると
 * 学習者の見落としでないものを見落としとして提示する。**
 *
 * ## だから推測した箇所を全部報告する
 *
 * `確定` 列が空の行は規則で振り分けるが、**振り分けた根拠を 1 行ずつ出す**
 * （`docs/tag-apply-review.md`）。人間が見て違えば `確定` 列を埋めて再実行する。
 *
 * **推測を黙って通さない。** それが本アプリで一番やってはいけないことである。
 *
 * 使い方:
 *   node scripts/apply-tag-drafts.mjs --dry-run   書き込まずに結果を見る
 *   node scripts/apply-tag-drafts.mjs             data/questions.json を更新する
 */

import fs from 'node:fs'
import path from 'node:path'

const DRAFT_PATH = path.join('docs', 'tag-drafts.md')
const QUESTIONS_PATH = path.join('data', 'questions.json')
const REVIEW_PATH = path.join('docs', 'tag-apply-review.md')

const dryRun = process.argv.includes('--dry-run')

const SLOT_IDS = [
    'traffic_side', 'road_marking', 'bollard', 'pole', 'sign', 'script', 'ground',
    'terrain_vegetation', 'architecture', 'vehicle', 'pavement', 'camera', 'season', 'other',
]

// ============================================================
// 表をパースする
// ============================================================

const draft = fs.readFileSync(DRAFT_PATH, 'utf8')

/** `## q-xx-01　…` で区切る。見出しに国名や優先度が付くため先頭トークンだけ取る */
function parseSections(text) {
    const sections = []
    for (const chunk of text.split(/^## /m).slice(1)) {
        const id = chunk.split(/[\s　]/)[0]
        if (!/^q-/.test(id)) continue
        sections.push({ id, body: chunk })
    }
    return sections
}

/** `| \`slot\` | メモ | 学習者 | 確定 | 実際 | 視認 |` の行を読む */
function parseRows(body) {
    const rows = []
    for (const line of body.split(/\r?\n/)) {
        if (!/^\|\s*`/.test(line)) continue
        const cells = line.split('|').map((c) => c.trim())
        const slot = (cells[1] ?? '').replace(/`/g, '')
        if (!SLOT_IDS.includes(slot)) continue
        rows.push({
            slot,
            memoState: strip(cells[2]),
            learnerWrote: strip(cells[3]),
            confirmed: strip(cells[4]),
            actual: strip(cells[5]),
            recognition: strip(cells[6]),
        })
    }
    return rows
}

const strip = (s) => (s ?? '').replace(/\*\*/g, '').trim()

// ============================================================
// 状態の振り分け
// ============================================================

/**
 * 「そこに無い」と読める記述。**部分一致で `無い` を拾ってはならない。**
 *
 * 「雪は無いがトルコの街中に雪が降るかは不明」は季節が写っていないのではなく
 * **判別できない**という記述である。文中の否定を不在と読むと取り違える。
 */
const ABSENT_PATTERNS = [
    /^無[しい]$/,
    /^なし$/,
    /^(何も)?(見当たらない|存在しない|無い|ない)$/,
    /無[しい]$/,
    /で(は)?無い$/,
    /ではない$/,
    /人工物が何も存在しない/,
    /何も見るものが無い/,
    /何も無さそう/,
    /何も無い$/,
]

function looksAbsent(actual) {
    return ABSENT_PATTERNS.some((re) => re.test(actual))
}

/** `視認` 列の表記ゆれを 3 値に寄せる。寄せられないものは null を返して報告する */
function mapRecognition(raw) {
    const v = raw.trim()
    if (!v) return { value: null, reason: '空欄' }
    if (v === 'easy' || v === 'hard' || v === 'blind') return { value: v, reason: '直接指定' }
    if (v === '見えた') return { value: 'easy', reason: '「見えた」' }
    if (v === '見えない') return { value: 'blind', reason: '「見えない」' }
    if (v.includes('見えない扱い')) return { value: 'blind', reason: '「見えない扱い」' }
    if (v.includes('見えなくはない')) return { value: 'hard', reason: '「見えなくはない」= 探せば見える' }
    if (v.includes('不明')) return { value: 'hard', reason: '「不明」= 探しても決められない' }
    return { value: null, reason: `自由記述「${v}」を 3 値に寄せられない` }
}

/**
 * 1 行を `SlotEntry` に変換する。判断の根拠を必ず返す。
 *
 * 優先順位
 *   1. `確定` 列に明示があればそれに従う（人間の判断が最優先）
 *   2. `実際に写っているもの` が空 → **`unknown`（未検証）。`absent` にしない**
 *   3. 記述が不在を示す → `absent`
 *   4. それ以外 → `visible`
 */
function resolveEntry(row) {
    const learnerSaw = row.memoState === '見えた'
    const recog = mapRecognition(row.recognition)

    // 1. 人間の明示
    if (row.confirmed === 'visible' || row.confirmed === 'absent') {
        const state = row.confirmed
        return {
            entry: buildEntry(state, row, recog, learnerSaw),
            decidedBy: '確定列',
            note: null,
        }
    }
    if (row.confirmed) {
        return {
            entry: buildEntry('unknown', row, recog, learnerSaw),
            decidedBy: '不明な確定列',
            note: `確定列に「${row.confirmed}」と書かれている。visible / absent のいずれかにすること`,
        }
    }

    /**
     * 2. 記述が無い場合。**`視認` 列が埋まっているかで意味が変わる。**
     *
     * `視認` に「見えない」と書いてあれば、**書く対象が無かった**ということである
     * （山道の `pole` `sign` `architecture` `vehicle` など）。→ `absent`
     *
     * `視認` も空なら、**まだ pano を見ていない。** → `unknown`
     * ここを `absent` にすると、タグ付けの未着手が「写っていない」に化ける。
     */
    if (!row.actual) {
        if (recog.value === 'blind') {
            return {
                entry: { state: 'absent', plain: null, terms: [] },
                decidedBy: '推測（不在）',
                note: `記述が空で視認が「${row.recognition}」。書く対象が無かったと読んだ`,
            }
        }
        return {
            entry: { state: 'unknown', plain: null, terms: [] },
            decidedBy: '未検証',
            note: '確定列・記述・視認がすべて空。pano を見て埋めるまで判定しない',
        }
    }

    // 3. 不在
    if (looksAbsent(row.actual)) {
        return {
            entry: buildEntry('absent', row, recog, learnerSaw),
            decidedBy: '推測（不在）',
            note: `記述「${row.actual}」を「そこに無い」と読んだ`,
        }
    }

    // 4. 写っている
    return {
        entry: buildEntry('visible', row, recog, learnerSaw),
        decidedBy: '推測（写っている）',
        note: `記述「${row.actual}」を「写っているが学習者は書かなかった」と読んだ`,
    }
}

function buildEntry(state, row, recog, learnerSaw) {
    if (state !== 'visible') {
        // `absent` / `unknown` に記述は持たせない。写っていないものの説明は plain ではない
        return { state, plain: null, terms: [] }
    }
    const entry = {
        state: 'visible',
        // 正解タグの `plain` は**実際に写っているもの**。学習者が書いたことではない
        plain: row.actual || row.learnerWrote || null,
        terms: [],
        confirmed: true,
    }
    if (recog.value) entry.recognition = recog.value
    // **学習者が実際に見たなら、その人にとっては easy である。** 実績で決める
    else if (learnerSaw) entry.recognition = 'easy'
    return entry
}

// ============================================================
// decisiveSlots
// ============================================================

/** 語 → スロット。**上から順に最初に当たったものを採る** */
const DECISIVE_KEYWORDS = [
    [/左側通行|右側通行|走行車線/, 'traffic_side'],
    [/ナンバープレート|ナンバー|車両/, 'vehicle'],
    // 「ポルトガル語」「タイ語」なども拾う。**言語名を列挙しない**
    [/カーブミラー|キリル|ハングル|繁体字|簡体字|аб|文字|[ぁ-んァ-ヶ一-龥ー]+語/, 'script'],
    [/ガードレール|ボラード|杭/, 'bollard'],
    [/標識|DUR/, 'sign'],
    [/電柱|街灯|ポール/, 'pole'],
    [/ユーカリ|苔|植生|植物|木|草|山|海|景色|岩肌|地形/, 'terrain_vegetation'],
    [/南半球|影|太陽|季節|雪/, 'season'],
    [/舗装|タイル|砂利|アスファルト/, 'pavement'],
    [/屋根|建物|家|建築/, 'architecture'],
    [/土|地面/, 'ground'],
    [/路面標示|中央線|白線/, 'road_marking'],
    [/Gen\d|カメラ|撮影車/, 'camera'],
]

/** 自由記述の決め手をスロット ID に変換する。**変換できなかった断片は報告する** */
function resolveDecisiveSlots(body) {
    const match = body.match(/decisiveSlots:(.*)/)
    const raw = match ? match[1].trim() : ''
    if (!raw) return { slots: [], raw, unmatched: [], note: '未記入' }

    const fragments = raw.split(/[、,，]/).map((f) => f.trim()).filter(Boolean)
    const slots = []
    const unmatched = []
    for (const fragment of fragments) {
        const hit = DECISIVE_KEYWORDS.find(([re]) => re.test(fragment))
        if (!hit) {
            unmatched.push(fragment)
            continue
        }
        if (!slots.includes(hit[1])) slots.push(hit[1])
    }
    // 3 件までに絞る。**弁別の指示は絞らないと意味がない**
    return { slots: slots.slice(0, 3), raw, unmatched, note: null }
}

// ============================================================
// 適用
// ============================================================

const sections = parseSections(draft)
const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'))
const byId = new Map(questions.map((q) => [q.id, q]))

const review = []
const summary = []

for (const section of sections) {
    const question = byId.get(section.id)
    if (!question) {
        review.push({ questionId: section.id, slot: '—', decidedBy: 'エラー', note: 'data/questions.json に存在しない' })
        continue
    }

    const rows = parseRows(section.body)
    const counts = { visible: 0, absent: 0, unknown: 0, guessed: 0, blind: 0 }

    for (const slot of SLOT_IDS) {
        const row = rows.find((r) => r.slot === slot)
        if (!row) {
            question.slots[slot] = { state: 'unknown', plain: null, terms: [] }
            counts.unknown += 1
            continue
        }
        const resolved = resolveEntry(row)
        question.slots[slot] = resolved.entry
        counts[resolved.entry.state] += 1
        if (resolved.entry.recognition === 'blind') counts.blind += 1
        if (resolved.decidedBy.startsWith('推測') || resolved.note) {
            counts.guessed += resolved.decidedBy.startsWith('推測') ? 1 : 0
            review.push({
                questionId: section.id,
                slot,
                decidedBy: resolved.decidedBy,
                state: resolved.entry.state,
                recognition: resolved.entry.recognition ?? '（未記録）',
                note: resolved.note,
            })
        }
        // 視認の表記が寄せられなかった場合も報告する
        const recog = mapRecognition(row.recognition)
        if (row.recognition && !recog.value) {
            review.push({
                questionId: section.id,
                slot,
                decidedBy: '視認の表記',
                state: resolved.entry.state,
                recognition: resolved.entry.recognition ?? '（未記録）',
                note: recog.reason,
            })
        }
    }

    const decisive = resolveDecisiveSlots(section.body)
    question.decisiveSlots = decisive.slots
    if (decisive.unmatched.length || decisive.note) {
        review.push({
            questionId: section.id,
            slot: 'decisiveSlots',
            decidedBy: '自由記述の変換',
            state: '—',
            recognition: '—',
            note: decisive.note
                ? `決め手が未記入。**弁別の指示が出せない**`
                : `スロットに寄せられなかった断片: ${decisive.unmatched.join(' / ')}（原文: ${decisive.raw}）`,
        })
    }

    summary.push({ id: section.id, ...counts, decisive: decisive.slots.join(' ') || '（なし）' })
}

// ============================================================
// 出力
// ============================================================

console.log('| 問 | visible | absent | unknown | うち blind | 推測で決めた | decisiveSlots |')
console.log('|---|---|---|---|---|---|---|')
for (const s of summary) {
    console.log(`| ${s.id} | ${s.visible} | ${s.absent} | ${s.unknown} | ${s.blind} | ${s.guessed} | ${s.decisive} |`)
}
console.log('')
console.log(`要確認 ${review.length} 件 → ${REVIEW_PATH}`)

const lines = [
    '# 正解タグ適用の要確認事項',
    '',
    `生成: ${new Date().toISOString()}　元データ: \`docs/tag-drafts.md\``,
    '',
    '`scripts/apply-tag-drafts.mjs` が **`確定` 列が空の行を規則で振り分けた記録**である。',
    '',
    '## なぜ全部出すのか',
    '',
    '記入された「見えない」が 2 つの意味で使われている。',
    '',
    '1. **そこに無い**（「枯れ葉のみ線は無し」）→ `absent`',
    '2. **写っているが判別できない**（「白飛びしており視認不可」）→ `visible` + `recognition: blind`',
    '',
    '取り違えると採点が逆を向く。',
    '**1 を `visible` にすると過剰申告を検出できず、'
    + '2 を `absent` にすると学習者の見落としでないものを見落としとして提示する。**',
    '',
    '違っていれば `docs/tag-drafts.md` の `確定` 列に `visible` / `absent` を書いて再実行する。',
    '',
    '| 問 | スロット | 決め方 | 結果 | 視認 | 根拠 |',
    '|---|---|---|---|---|---|',
    ...review.map((r) =>
        `| ${r.questionId} | \`${r.slot}\` | ${r.decidedBy} | ${r.state ?? '—'} | ${r.recognition ?? '—'} | ${r.note ?? ''} |`,
    ),
    '',
]

if (dryRun) {
    console.log('')
    console.log('--dry-run のため data/questions.json を書き換えない')
}
else {
    fs.writeFileSync(QUESTIONS_PATH, `${JSON.stringify(questions, null, 2)}\n`, 'utf8')
    fs.writeFileSync(REVIEW_PATH, lines.join('\n'), 'utf8')
    console.log(`更新: ${QUESTIONS_PATH}`)
}
