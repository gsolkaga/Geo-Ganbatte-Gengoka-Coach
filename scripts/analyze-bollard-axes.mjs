/**
 * 実験 A の arm3：コードが積集合を計算する
 *
 * AI が埋めた属性行列から、コードが全組み合わせの積集合を計算し、
 * 人間が書いた 10 用語と突き合わせる。AI は使わない。
 *
 * 測る値は 3 つ。
 *   再現  人間の 10 用語のうち、AI の行列から導出できたのは何件か
 *   反証  人間の主張と AI の行列が矛盾したのはどこか（人手確認の候補）
 *   新規  人間が挙げていない弁別子が出たか（本命。出たら人間が実物で確かめられる）
 *
 * 重要な前提を 2 つ、出力に必ず併記する。
 *
 *   1. モデル間の一致は正しさを保証しない（ガーナで実測済み）。
 *      一致は「人手確認が不要」を意味せず「不一致という信号がない」だけである。
 *
 *   2. unknown は弁別力を過大に見せる。
 *      「本体全体が黄色は IS だけ」が成り立つのは、他国が unknown だからかもしれない。
 *      よって全ての弁別子に、その軸で unknown だった国数（未確定数）を併記する。
 *
 * 使い方:
 *   node scripts/analyze-bollard-axes.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = 'data'
const IN_DIR = path.join('docs', 'generated-bollard')
const OUT_PATH = path.join('docs', 'bollard-axes-result.md')

/** 弁別子として報告する上限。これを超える国数のものは載せない */
const MAX_SET_SIZE = 2
/** 組み合わせる軸の最大数。人間の用語が最大 3 軸だったため 3 に合わせる */
const MAX_COMBO_SIZE = 3

const axesDef = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'bollard-axes.json'), 'utf8'))
const humanAxes = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'glossary-human-axes.json'), 'utf8'))
const seed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'countries-seed.json'), 'utf8'))
const nameOf = new Map(seed.map((c) => [c.code, c.name]))

let regionOf = new Map()
try {
    const regions = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'regions.json'), 'utf8'))
    for (const [region, codes] of Object.entries(regions.regions ?? {})) {
        for (const code of codes) regionOf.set(code, region)
    }
} catch {
    console.warn('regions.json を読めなかった。地理的な散らばりの判定を省略する。')
}

if (!fs.existsSync(IN_DIR)) {
    console.error(`${IN_DIR} が存在しない。先に node scripts/run-bollard-axes.mjs matrix を実行する。`)
    process.exit(1)
}

const AXIS_IDS = axesDef.axes.filter((a) => a.id !== 'presence').map((a) => a.id)
const axisLabel = new Map(axesDef.axes.map((a) => [a.id, a.label]))

// ============================================================
// 1. 行列の読み込みとモデル間の突き合わせ
// ============================================================

/** code -> axisId -> [{ model, value }] */
const raw = new Map()
const modelsSeen = new Set()
const parseFailures = []

for (const file of fs.readdirSync(IN_DIR)) {
    if (!file.startsWith('matrix-') || !file.endsWith('.json')) continue
    const model = file.replace(/^matrix-/, '').replace(/-batch\d+\.json$/, '')
    modelsSeen.add(model)

    let rows
    try {
        const body = JSON.parse(fs.readFileSync(path.join(IN_DIR, file), 'utf8'))
        rows = JSON.parse(body.choices[0].message.content).countries ?? []
    } catch (e) {
        parseFailures.push(file)
        continue
    }

    for (const row of rows) {
        if (!row?.code) continue
        if (!raw.has(row.code)) raw.set(row.code, new Map())
        const byAxis = raw.get(row.code)
        for (const axisId of [...AXIS_IDS, 'presence']) {
            if (!byAxis.has(axisId)) byAxis.set(axisId, [])
            if (typeof row[axisId] === 'string') byAxis.get(axisId).push({ model, value: row[axisId] })
        }
    }
}

/**
 * 突き合わせ。unknown は票として数えない。
 * unknown を票に数えると「分からない」が多数派になって値が消える。
 */
function merge(votes) {
    const known = votes.filter((v) => v.value !== 'unknown')
    if (known.length === 0) return { value: 'unknown', disputed: false, allUnknown: true, votes }

    const tally = new Map()
    for (const v of known) tally.set(v.value, (tally.get(v.value) ?? 0) + 1)

    const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    return {
        value: sorted[0][0],
        disputed: sorted.length > 1,
        allUnknown: false,
        votes,
    }
}

/** code -> axisId -> merged */
const merged = new Map()
for (const [code, byAxis] of raw) {
    const m = new Map()
    for (const [axisId, votes] of byAxis) m.set(axisId, merge(votes))
    merged.set(code, m)
}

const valueOf = (code, axisId) => merged.get(code)?.get(axisId)?.value ?? 'unknown'
const isDisputed = (code, axisId) => merged.get(code)?.get(axisId)?.disputed ?? false

/** presence が absent の国は母集団から外す。unknown は残すが件数を記録する */
const eligible = [...merged.keys()].filter((c) => valueOf(c, 'presence') !== 'absent')
const presenceUnknown = eligible.filter((c) => valueOf(c, 'presence') === 'unknown')
const excluded = [...merged.keys()].filter((c) => valueOf(c, 'presence') === 'absent')

// ============================================================
// 2. 組み合わせの積集合を計算する
// ============================================================

const combosOf = (arr, k) => {
    const out = []
    const walk = (start, acc) => {
        if (acc.length === k) return void out.push([...acc])
        for (let i = start; i < arr.length; i++) {
            acc.push(arr[i])
            walk(i + 1, acc)
            acc.pop()
        }
    }
    walk(0, [])
    return out
}

const keyOf = (code, axisIds) => axisIds.map((a) => valueOf(code, a)).join('|')

/**
 * 観測された値の組だけをグループ化する。
 * 抽象的に値の直積を回すと存在しない組み合わせを大量に作るため、実在するものだけ扱う。
 */
function groupBy(axisIds) {
    const groups = new Map()
    let unresolved = 0
    for (const code of eligible) {
        const values = axisIds.map((a) => valueOf(code, a))
        if (values.includes('unknown')) {
            unresolved++
            continue
        }
        const key = values.join('|')
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(code)
    }
    return { groups, unresolved }
}

/** 軸の部分集合すべてについてグループを事前計算する。最小性の判定に使う */
const groupCache = new Map()
for (let k = 1; k <= MAX_COMBO_SIZE; k++) {
    for (const axisIds of combosOf(AXIS_IDS, k)) {
        groupCache.set(axisIds.join(','), { axisIds, ...groupBy(axisIds) })
    }
}

const subsetsOf = (axisIds) => {
    const out = []
    for (let k = 1; k < axisIds.length; k++) out.push(...combosOf(axisIds, k))
    return out
}

/** 弁別子。最小なものだけを残す */
const discriminators = []
for (const { axisIds, groups, unresolved } of groupCache.values()) {
    for (const [key, codes] of groups) {
        if (codes.length > MAX_SET_SIZE) continue

        // 最小性：真部分集合が同じ国集合を出すなら、この組み合わせは冗長である
        let minimal = true
        for (const sub of subsetsOf(axisIds)) {
            const cache = groupCache.get(sub.join(','))
            const subKey = sub.map((a) => valueOf(codes[0], a)).join('|')
            const subCodes = cache.groups.get(subKey)
            if (subCodes && subCodes.length === codes.length) {
                minimal = false
                break
            }
        }
        if (!minimal) continue

        const regions = new Set(codes.map((c) => regionOf.get(c) ?? '?'))
        discriminators.push({
            axisIds,
            values: key.split('|'),
            codes,
            unresolved,
            regions: [...regions],
            anyDisputed: codes.some((c) => axisIds.some((a) => isDisputed(c, a))),
        })
    }
}

discriminators.sort(
    (a, b) =>
        a.codes.length - b.codes.length ||
        a.unresolved - b.unresolved ||
        a.axisIds.length - b.axisIds.length ||
        a.codes[0].localeCompare(b.codes[0]),
)

// ============================================================
// 3. 人間の用語との突き合わせ
// ============================================================

const setEq = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

const humanResults = []
for (const m of humanAxes.mappings) {
    const entries = Object.entries(m.axes ?? {})
    if (entries.length === 0) {
        humanResults.push({ ...m, verdict: 'unmapped', computed: [], contradictions: [], noData: [] })
        continue
    }

    // AI の行列で、この軸値の組に一致する国を集める
    const computed = eligible.filter((c) => entries.every(([axisId, v]) => valueOf(c, axisId) === v))

    /**
     * 食い違いを 2 種類に分ける。混ぜてはならない。
     *
     *   contradictions  AI が別の値を答えた   → 本当の食い違い。人手確認の対象
     *   noData          AI が unknown を答えた → 信号なし。食い違いではない
     *
     * unknown を「矛盾」に数えると、「AI が人間を否定した」件数を過大に報告することになる。
     * 判定不能と否定は別である。
     */
    const contradictions = []
    const noData = []
    for (const code of m.countries) {
        for (const [axisId, v] of entries) {
            const got = valueOf(code, axisId)
            if (got === v) continue
            /**
             * 票の分布を持たせる。
             *
             * 「モデル間で不一致がない」は「4 モデルが同じ値を答えた」を意味しない。
             * 1 モデルだけが答えて 3 モデルが unknown でも不一致は 0 になる。
             * この 2 つを混ぜると、根拠の強さを誤って読むことになる。
             */
            const votes = merged.get(code)?.get(axisId)?.votes ?? []
            const known = votes.filter((x) => x.value !== 'unknown')
            const dist = [...known.reduce((mp, x) => mp.set(x.value, (mp.get(x.value) ?? 0) + 1), new Map())]
                .sort((a, b) => b[1] - a[1])
                .map(([val, n]) => `${val}×${n}`)
                .join(' ')
            const rec = {
                code,
                axisId,
                claimed: v,
                got,
                disputed: isDisputed(code, axisId),
                answered: known.length,
                total: votes.length,
                dist,
            }
            if (got === 'unknown') noData.push(rec)
            else contradictions.push(rec)
        }
    }

    let verdict
    if (setEq(computed, m.countries)) verdict = 'reproduced'
    else if (contradictions.length > 0) verdict = 'contradicted'
    else if (noData.length > 0) verdict = 'nodata'
    else if (computed.length > m.countries.length) verdict = 'weaker'
    else verdict = 'partial'

    humanResults.push({ ...m, verdict, computed, contradictions, noData })
}

/** 人間の用語に対応する軸値の組。新規判定に使う */
const humanKeys = new Set(
    humanAxes.mappings
        .filter((m) => Object.keys(m.axes ?? {}).length > 0)
        .map((m) => {
            const ids = Object.keys(m.axes).sort()
            return ids.join(',') + '#' + ids.map((i) => m.axes[i]).join('|')
        }),
)

const isHumanKnown = (d) => {
    const order = d.axisIds.map((a, i) => [a, d.values[i]]).sort((x, y) => x[0].localeCompare(y[0]))
    const key = order.map((x) => x[0]).join(',') + '#' + order.map((x) => x[1]).join('|')
    if (humanKeys.has(key)) return true
    // 人間の用語が挙げた国と完全に一致するなら、軸の表現が違っても既知として扱う
    return humanAxes.mappings.some((m) => m.countries.length > 0 && setEq(d.codes, m.countries))
}

const novel = discriminators.filter((d) => !isHumanKnown(d))

// ============================================================
// 4. arm1 の軸の突き合わせ
// ============================================================

const humanAxisIds = new Set(AXIS_IDS)
const arm1 = []
for (const file of fs.readdirSync(IN_DIR)) {
    if (!file.startsWith('axes-') || !file.endsWith('.json')) continue
    const model = file.replace(/^axes-/, '').replace(/\.json$/, '')
    try {
        const body = JSON.parse(fs.readFileSync(path.join(IN_DIR, file), 'utf8'))
        const proposed = JSON.parse(body.choices[0].message.content).axes ?? []
        arm1.push({ model, proposed })
    } catch {
        arm1.push({ model, proposed: null })
    }
}

// ============================================================
// 5. 出力
// ============================================================

const out = []
const w = (s = '') => out.push(s)

w('# 実験 A の結果：AI は軸を発見できるか、軸を与えれば埋められるか')
w()
w(`生成日時: ${new Date().toISOString()}`)
w()
w(`対象: ${axesDef.countries.length} カ国 / 軸 ${AXIS_IDS.length} 本 / モデル ${modelsSeen.size} 件`)
w()
w('**仮説：AI は軸を与えられれば埋められる。軸を発見できない。**')
w()
w('## 読むときの前提')
w()
w('**モデル間の一致は正しさを保証しない。** ガーナの走行車線で 3 モデルが揃って誤った実測がある。')
w('一致は「人手確認が不要」ではなく「不一致という信号がない」だけである。')
w()
w('**unknown は弁別力を過大に見せる。** ある軸値が 1 カ国しか該当しないのは、')
w('他国が unknown だからかもしれない。以下すべての弁別子に未確定数を併記している。')
w('**未確定数が大きい弁別子は信用してはならない。**')
w()

if (parseFailures.length) {
    w(`パース失敗: ${parseFailures.length} ファイル`)
    w()
    w('```')
    for (const f of parseFailures) w(f)
    w('```')
    w()
}

w('## 母集団')
w()
w('| 区分 | 件数 | 国 |')
w('|---|---|---|')
w(`| 対象（presence ≠ absent） | ${eligible.length} | |`)
w(`| 除外（presence = absent） | ${excluded.length} | ${excluded.join(' ') || '—'} |`)
w(`| presence が unknown | ${presenceUnknown.length} | ${presenceUnknown.join(' ') || '—'} |`)
w()

// --- arm1 ---
w('## arm1：AI が自力で挙げた軸')
w()
if (arm1.length === 0) {
    w('未実行。`node scripts/run-bollard-axes.mjs axes` を先に実行する。')
} else {
    w(`人間の軸 ${AXIS_IDS.length} 本と突き合わせる。**焦点は 2 つ。**`)
    w()
    w('- `rear_marking`（裏面）に相当する軸を挙げたか — 前回の 17 用語には存在しなかった')
    w('- `guardrail_relation`（ガードレールとの関係）に相当する軸を挙げたか')
    w()
    w('| モデル | 提案軸数 | 提案された軸 |')
    w('|---|---|---|')
    for (const { model, proposed } of arm1) {
        if (!proposed) {
            w(`| \`${model}\` | パース失敗 | |`)
            continue
        }
        w(`| \`${model}\` | ${proposed.length} | ${proposed.map((p) => `\`${p.axis_id}\``).join(' ')} |`)
    }
    w()
    w('**突き合わせは人手で行う。** 軸 ID の表記が違っても同じ概念を指すことがあり、')
    w('機械的な一致判定では「発見できた」を取りこぼす。以下の観点で読む。')
    w()
    w('| 判定 | 意味 |')
    w('|---|---|')
    w('| 発見 | 人間の 12 軸に対応する軸を、別の名前でも挙げていた |')
    w('| 欠落 | 人間の軸に対応するものが無かった |')
    w('| **超過** | **人間の 12 軸にない軸を挙げた。これは AI 側の発見として記録する** |')
    w()
    w('とくに `glossary-human-axes.json` の `gaps` に挙げた 2 件（2 色の塗り分け、トルコ固有形状の分解）')
    w('を AI が軸として提案していた場合、**人間の軸設計の不足を AI が埋めたことになる。**')
    w()
}

// --- 再現 ---
w('## 再現：人間の 10 用語を導出できたか')
w()
const tally = { reproduced: 0, partial: 0, weaker: 0, contradicted: 0, nodata: 0, unmapped: 0 }
for (const r of humanResults) tally[r.verdict]++
w('| 判定 | 件数 | 意味 |')
w('|---|---|---|')
w(`| 再現 | ${tally.reproduced} | AI の行列から人間と同じ国集合が出た |`)
w(`| 弱い | ${tally.weaker} | 出たが該当国が増えた（弁別力が落ちた） |`)
w(`| 部分 | ${tally.partial} | 一部しか一致しない |`)
w(`| **矛盾** | ${tally.contradicted} | **AI が別の値を答えた。人手確認の対象** |`)
w(`| 判定不能 | ${tally.nodata} | AI が \`unknown\` を答えた。**食い違いではなく信号なし** |`)
w(`| 未対応 | ${tally.unmapped} | 軸に分解できていない（人間側の宿題） |`)
w()
w('**矛盾と判定不能を混ぜていない。** `unknown` を矛盾に数えると')
w('「AI が人間を否定した」件数を過大に報告することになる。**判定不能と否定は別である。**')
w()

const VERDICT_JA = {
    reproduced: '再現',
    partial: '部分',
    weaker: '弱い',
    contradicted: '**矛盾**',
    nodata: '判定不能',
    unmapped: '未対応',
}
w('| 用語 | 人間 | AI から導出 | 矛盾 | 判定不能 | 判定 |')
w('|---|---|---|---|---|---|')
for (const r of humanResults) {
    const comp = r.computed.length ? r.computed.join(' ') : '—'
    w(
        `| \`${r.id}\` | ${r.countries.join(' ') || '—'} | ${comp} (${r.computed.length}) | ${r.contradictions.length} | ${r.noData.length} | ${VERDICT_JA[r.verdict]} |`,
    )
}
w()

// --- 軸ごとの unknown 率 ---
w('### 軸ごとに AI が答えたかどうか')
w()
w('**どの軸で AI が答えを持っていたかを見る。** 人間が最強メタに使う軸で答えているか、')
w('それとも答えやすい軸だけ答えているかが分かる。')
w()
w('| 軸 | unknown 率 | モデル間不一致 |')
w('|---|---|---|')
for (const axisId of [...AXIS_IDS, 'presence']) {
    let unknowns = 0
    let disputed = 0
    for (const code of merged.keys()) {
        if (valueOf(code, axisId) === 'unknown') unknowns++
        if (isDisputed(code, axisId)) disputed++
    }
    const rate = Math.round((unknowns / merged.size) * 100)
    w(`| ${axisLabel.get(axisId) ?? axisId} | ${rate}% (${unknowns}/${merged.size}) | ${disputed} |`)
}
w()

// --- 反証 ---
w('## 反証：人間の主張と食い違った箇所')
w()
w('**これは「人間が間違っている」ことを示すものではない。** ルーマニアでは AI が正しく人間が誤り、')
w('ガーナでは人間が正しく AI が誤った。**どちらに転ぶかは事前に決まらない。**')
w()
w('ここに出た項目は、Street View または Plonk It で人間が実物を確認する対象である。')
w()
const allContradictions = humanResults.flatMap((r) => r.contradictions.map((m) => ({ term: r.id, ...m })))
const allNoData = humanResults.flatMap((r) => r.noData.map((m) => ({ term: r.id, ...m })))

if (allContradictions.length === 0) {
    w('本当の食い違いはなかった。')
} else {
    w(`**AI が別の値を答えた箇所: ${allContradictions.length} 件**`)
    w()
    w('`答えた` は 4 モデルのうち `unknown` 以外を返した数。**票の分布を必ず見ること。**')
    w()
    w('| 用語 | 国 | 軸 | 人間の主張 | AI の採用値 | 答えた | 票の分布 |')
    w('|---|---|---|---|---|---|---|')
    for (const m of allContradictions) {
        w(
            `| \`${m.term}\` | ${m.code} ${nameOf.get(m.code) ?? ''} | ${axisLabel.get(m.axisId) ?? m.axisId} | \`${m.claimed}\` | \`${m.got}\` | ${m.answered}/${m.total} | ${m.dist} |`,
        )
    }
    w()
    w('### 票の分布で読み方が変わる')
    w()
    w('**「モデル間で不一致がない」は「4 モデルが同じ値を答えた」を意味しない。**')
    w('1 モデルだけが答えて 3 モデルが `unknown` でも不一致は 0 になる。')
    w()
    w('| 票の状態 | 人間の主張に対する意味 |')
    w('|---|---|')
    w('| 4 モデルが同じ値で人間と違う | **強い信号。** ルーマニア型（人間の誤り）の可能性がある。実物を確認する |')
    w('| モデル間で割れている | **信号なし。** AI 側に一貫した知識がない。人間の主張は揺らがない |')
    w('| 1〜2 モデルしか答えていない | **信号として弱い。** 多数が判定不能なら根拠にならない |')
    w()
    w('**ルーマニアの件が意味を持ったのは 4 モデル全員が一致したからである。**')
    w('割れている項目を「AI が人間を否定した」と読んではならない。')
    w()
    w('なおこれらの軸で AI は `unknown` を選べた。選ばずに値を答えて人間と違う値になっている。')
    w('**判定不能という出口があるのに、埋める方を選んだ。**')
}
w()

if (allNoData.length > 0) {
    w(`### 判定不能だった箇所: ${allNoData.length} 件`)
    w()
    w('**これは食い違いではない。** AI が `unknown` を返しただけであり、人間の主張を否定していない。')
    w()
    w('| 用語 | 国 | 軸 | 人間の主張 |')
    w('|---|---|---|---|')
    for (const m of allNoData) {
        w(`| \`${m.term}\` | ${m.code} ${nameOf.get(m.code) ?? ''} | ${axisLabel.get(m.axisId) ?? m.axisId} | \`${m.claimed}\` |`)
    }
    w()
}

// --- 新規 ---
w('## 新規：人間が挙げていない弁別子')
w()
w('**実験の本命。** ここに出たものは、人間が Street View で検証できる形の予測になっている。')
w()
w(`最小な弁別子（${MAX_SET_SIZE} カ国以下、軸 ${MAX_COMBO_SIZE} 本以下）: ${discriminators.length} 件`)
w(`うち人間の辞書にないもの: ${novel.length} 件`)
w()
if (novel.length === 0) {
    w('新規の弁別子は出なかった。')
} else {
    w('未確定数の少ない順に上位 40 件。**未確定数が母集団に近いものは実質的に無意味である。**')
    w()
    w('| 該当国 | 軸の組み合わせ | 値 | 未確定 | 地域 | モデル間 |')
    w('|---|---|---|---|---|---|')
    for (const d of novel.slice(0, 40)) {
        const axes = d.axisIds.map((a) => axisLabel.get(a) ?? a).join(' + ')
        const vals = d.values.map((v) => `\`${v}\``).join(' + ')
        const codes = d.codes.map((c) => `${c} ${nameOf.get(c) ?? ''}`).join('、')
        const spread = d.regions.length > 1 ? `**${d.regions.length} 地域**` : d.regions[0]
        w(`| ${codes} | ${axes} | ${vals} | ${d.unresolved}/${eligible.length} | ${spread} | ${d.anyDisputed ? '不一致' : '一致'} |`)
    }
    w()
    w('**2 カ国で 2 地域にまたがるものは、良い弁別子ではない**（失点が距離で決まるため）。')
    w('他の要素と組み合わせる補助メタとして扱う。')
}
w()

// --- 増幅の罠 ---
w('## 増幅の罠')
w()
const disputedCells = []
for (const [code, byAxis] of merged) {
    for (const [axisId, m] of byAxis) {
        if (m.disputed) disputedCells.push({ code, axisId })
    }
}
const totalCells = merged.size * (AXIS_IDS.length + 1)
w(`モデル間で不一致だったセル: ${disputedCells.length} / ${totalCells}`)
w()
w('**属性値が 1 つ誤ると、その値が参加する組み合わせ全部が汚染される。**')
w('単一属性の用語なら誤り 1 件で用語 1 件が壊れるだけだが、組み合わせは掛け算で壊れる。')
w()
const affected = discriminators.filter((d) => d.anyDisputed).length
w(`不一致セルを含む弁別子: ${affected} / ${discriminators.length}`)
w()
w('人間の組み合わせ知識は観察と一緒に獲得されているため、この増幅を受けない。')
w('**導出された組み合わせは入力の誤りを継承し、見て覚えた組み合わせは継承しない。ここは対称ではない。**')
w()

// --- 限界 ---
w('## この計算で言えないこと')
w()
w('**弁別力は計算できるが、学習価値は計算できない。**')
w()
w('アイスランドのボラードは完璧な弁別子だが、アイスランドは出題頻度が低い。')
w('頻出国に対する少し弱い弁別子のほうが実戦価値は高い。')
w('カバレッジの出題頻度はこの辞書からは計算できず、プレイデータが必要である。')
w()
w('したがって出力は「覚えるべき順序」ではなく「弁別力の順序」である。混同しないこと。')
w()
w('また `presence` が unknown の国は、そもそもボラードが写るかどうかが分かっていない。')
w('その国を含む弁別子は、存在の確認から始める必要がある。')

fs.writeFileSync(OUT_PATH, out.join('\n') + '\n', 'utf8')

console.log(`モデル: ${[...modelsSeen].join(', ') || '(なし)'}`)
console.log(`国: ${merged.size} / 対象 ${eligible.length} / 除外 ${excluded.length}`)
console.log(`弁別子: ${discriminators.length}  うち新規 ${novel.length}`)
console.log(
    `再現 ${tally.reproduced} / 弱い ${tally.weaker} / 部分 ${tally.partial} / 矛盾 ${tally.contradicted} / 判定不能 ${tally.nodata} / 未対応 ${tally.unmapped}`,
)
console.log(`矛盾セル ${allContradictions.length} / 判定不能セル ${allNoData.length}`)
console.log(`モデル間不一致セル: ${disputedCells.length} / ${totalCells}`)
if (parseFailures.length) console.log(`パース失敗: ${parseFailures.length} ファイル`)
console.log('')
console.log(`保存先: ${OUT_PATH}`)
