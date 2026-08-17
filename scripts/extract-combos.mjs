/**
 * 覚える価値のある組み合わせの抽出（タスク 25.1）
 *
 * **AI を使わない。用語辞書の全ペアの積集合を取るだけである。**
 * プレイデータも要らない。辞書だけで計算できる。
 *
 * ## 何のためか
 *
 * 習熟段階には**中級の壁**がある。
 *
 *   初級  個々のメタを覚える
 *   中級  組み合わせを覚える。**組み合わせ爆発するため最も負荷が高い**
 *   上級  組み合わせが自動化されている
 *
 * 上級者は積集合をリアルタイムで計算しているのではなく、
 * **「キリル文字 + EU 式ナンバー = ブルガリア」を 1 つの塊として記憶している。**
 * 計算されるのではなく想起される。
 *
 * **中級の壁は組み合わせの数である。** どれを覚えるべきか分からないまま
 * 総当たりで蓄積するしかない。ここを計算で導出する。
 *
 * ## 件数の閾値ではなく、メタの区分で判定する
 *
 * GeoGuessr の失点は距離で決まる。**同じ 3 カ国でも、隣接なら失点が小さく、
 * 大陸が違えば大きい。** だから件数だけでは価値が決まらない
 * （`design.md`「メタの強さは 2 軸で決まる」）。
 *
 * 使い方:
 *   node scripts/extract-combos.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const OUT_PATH = path.join('docs', 'learning-combos.md')

const glossary = JSON.parse(fs.readFileSync(path.join('data', 'glossary.json'), 'utf8'))
const regionsFile = JSON.parse(fs.readFileSync(path.join('data', 'regions.json'), 'utf8'))

const REGIONS = regionsFile.regions ?? {}
const CONTINENTS = regionsFile.continents ?? {}

/**
 * 組み合わせの材料にする用語。
 *
 * **`atomic` のみ。** `combination` は既に組み合わせであり、
 * それをさらに掛けると「何と何を覚えるのか」が言えなくなる。
 *
 * `countries` が空のものは掛けた瞬間に積集合を空にするため除く。
 */
const terms = glossary.terms.filter((t) => t.kind === 'atomic' && t.countries.length > 0)

// ============================================================
// メタの強さ（2 軸）
// ============================================================

/** 集合が同一グループに収まるか */
function withinOneGroup(codes, groups) {
    for (const members of Object.values(groups)) {
        const set = new Set(members)
        if (codes.every((c) => set.has(c))) return true
    }
    return false
}

/** 何グループにまたがるか。表示用 */
function groupSpread(codes, groups) {
    const hit = new Set()
    for (const [name, members] of Object.entries(groups)) {
        const set = new Set(members)
        if (codes.some((c) => set.has(c))) hit.add(name)
    }
    return hit.size
}

/** 確かさの弱い順。**組み合わせは弱い方に引かれる** */
const CERTAINTY_RANK = { verified: 0, heuristic: 1, unverified: 2 }
function worstCertainty(x, y) {
    return CERTAINTY_RANK[x] >= CERTAINTY_RANK[y] ? x : y
}

const STRENGTH = {
    strongest: { label: '最強メタ', rank: 0 },
    strong: { label: '強メタ', rank: 1 },
    good: { label: '良メタ', rank: 2 },
    support: { label: '補助メタ', rank: 3 },
}

/** `design.md` の判定アルゴリズムをそのまま実装する */
function classify(codes) {
    const size = codes.length
    if (size === 0) return 'support'
    if (size === 1) return 'strongest'
    const sameRegion = withinOneGroup(codes, REGIONS)
    const sameContinent = withinOneGroup(codes, CONTINENTS)
    if (size === 2 && sameRegion) return 'strong'
    if (size <= 4 && sameRegion) return 'good'
    if (size <= 4 && sameContinent) return 'good'
    return 'support'
}

// ============================================================
// 全ペアの積集合
// ============================================================

const intersect = (a, b) => {
    const set = new Set(b)
    return a.filter((c) => set.has(c))
}

const rows = []
const stats = {
    pairs: 0,
    dropped: {
        bothStrongest: 0,
        emptyIntersection: 0,
        notImproved: 0,
        weakResult: 0,
        sameSlotPair: 0,
    },
}

for (let i = 0; i < terms.length; i += 1) {
    for (let j = i + 1; j < terms.length; j += 1) {
        const a = terms[i]
        const b = terms[j]
        stats.pairs += 1

        const aClass = classify(a.countries)
        const bClass = classify(b.countries)

        /**
         * **どちらかが単独で 1 カ国に確定するなら組み合わせる意味がない。**
         * 掛けても情報が増えず、覚える対象としては単独の方が軽い。
         */
        if (aClass === 'strongest' || bClass === 'strongest') {
            stats.dropped.bothStrongest += 1
            continue
        }

        const result = intersect(a.countries, b.countries)

        /**
         * **積集合が空 = 両立しない観察である。** 絞り込みの成功ではない。
         * 「黄色いボラード」と「南部アフリカの路面標示」は同時に成り立たない。
         */
        if (result.length === 0) {
            stats.dropped.emptyIntersection += 1
            continue
        }

        // **どちらかの単独と同じなら、組み合わせは何も足していない**
        if (result.length >= Math.min(a.countries.length, b.countries.length)) {
            stats.dropped.notImproved += 1
            continue
        }

        const resultClass = classify(result)
        // 掛けても補助メタのままなら覚える価値が薄い（3 カ国でも大陸をまたぐ場合を含む）
        if (STRENGTH[resultClass].rank > STRENGTH.good.rank) {
            stats.dropped.weakResult += 1
            continue
        }

        rows.push({
            a,
            b,
            aClass,
            bClass,
            result,
            resultClass,
            sameSlot: a.slot === b.slot,
            /** 確かさは弱い方に引かれる。**片方が経験則なら組み合わせも経験則である** */
            certainty: worstCertainty(a.certainty, b.certainty),
            source: a.source === 'human' && b.source === 'human' ? 'human' : 'ai を含む',
        })
    }
}

// 積集合の小さい順。同数なら確かさの高い順
rows.sort((x, y) =>
    x.result.length - y.result.length
    || CERTAINTY_RANK[x.certainty] - CERTAINTY_RANK[y.certainty],
)

// ============================================================
// 出力
// ============================================================

const strengthNote = (codes) => {
    const cls = classify(codes)
    const regionSpread = groupSpread(codes, REGIONS)
    const continentSpread = groupSpread(codes, CONTINENTS)
    const spread = continentSpread > 1
        ? `${continentSpread} 大陸にまたがる`
        : regionSpread > 1 ? `${regionSpread} 地域にまたがる` : '同一地域'
    return `${STRENGTH[cls].label}（${codes.length} カ国 / ${spread}）`
}

const lines = [
    '# 覚える価値のある組み合わせ',
    '',
    `生成: ${new Date().toISOString()}　`,
    '`scripts/extract-combos.mjs` が `data/glossary.json` から計算した。**AI を使っていない。**',
    '',
    '## なぜこれを出すのか',
    '',
    '習熟段階には**中級の壁**がある。',
    '',
    '| 段階 | やっていること |',
    '|---|---|',
    '| 初級 | 個々のメタを覚える |',
    '| **中級** | **組み合わせを覚える。組み合わせ爆発するため最も負荷が高い** |',
    '| 上級 | 組み合わせが自動化されている |',
    '',
    '上級者は積集合をリアルタイムで計算しているのではなく、',
    '**「キリル文字 + EU 式ナンバー = ブルガリア」を 1 つの塊として記憶している。**',
    '計算されるのではなく想起される。',
    '',
    '**中級の壁は組み合わせの数である。** どれを覚えるべきか分からないまま',
    '総当たりで蓄積するしかない。ここは計算で導出できる。',
    '',
    '## 抽出条件',
    '',
    '**件数の閾値ではなく、メタの区分で判定する。**',
    'GeoGuessr の失点は距離で決まるため、同じ 3 カ国でも隣接なら失点が小さく、',
    '大陸が違えば大きい。件数だけでは価値が決まらない。',
    '',
    '| 条件 | 理由 |',
    '|---|---|',
    '| どちらも単独で 1 カ国に確定しない | 確定するなら組み合わせる意味がない。単独の方が軽い |',
    '| 積集合が空でない | **空は両立しない観察である。** 絞り込みの成功ではない |',
    '| 積集合が両方の単独より真に小さい | 同じなら組み合わせは何も足していない |',
    '| 積集合が良メタ以上 | **3 カ国でも大陸をまたぐなら覚える価値が薄い** |',
    '',
    `全 ${stats.pairs.toLocaleString()} ペアから **${rows.length} 件**を抽出した。`,
    '',
    '| 落とした理由 | 件数 |',
    '|---|---|',
    `| 片方が単独で 1 カ国に確定する | ${stats.dropped.bothStrongest.toLocaleString()} |`,
    `| 積集合が空（両立しない） | ${stats.dropped.emptyIntersection.toLocaleString()} |`,
    `| 単独より縮まない | ${stats.dropped.notImproved.toLocaleString()} |`,
    `| 掛けても補助メタのまま | ${stats.dropped.weakResult.toLocaleString()} |`,
    '',
]

const humanRows = rows.filter((r) => r.source === 'human')
const aiRows = rows.filter((r) => r.source !== 'human')

const comboLabel = (r) => (r.sameSlot
    // 同一スロット内の組み合わせは「同じ欄を細かく見る」ことを意味する
    ? `\`${r.a.slot}\` **${r.a.canonical}** ＋ **${r.b.canonical}**（同じ欄）`
    : `\`${r.a.slot}\` **${r.a.canonical}** ＋ \`${r.b.slot}\` **${r.b.canonical}**`)

const rowLine = (r, index) =>
    `| ${index + 1} | ${comboLabel(r)} | ${STRENGTH[r.aClass].label} ${r.a.countries.length} / ${STRENGTH[r.bClass].label
    } ${r.b.countries.length} | **${strengthNote(r.result)}** [${r.result.join(' ')}] | ${r.certainty} |`

/**
 * **由来で表を分ける。** 混ぜると「48 件の学習リスト」に見えるが、
 * AI 由来の粗い用語（20 カ国以上）を掛けた結果は
 * **見かけ上 1 カ国になるだけで根拠が弱い。**
 */
lines.push(
    `**計算で ${rows.length} 件出たが、うち人手記述だけで成り立つのは ${humanRows.length} 件である。**`,
    '',
    '| 由来 | 件数 | 使い方 |',
    '|---|---|---|',
    `| 人手記述のみ | **${humanRows.length}** | 覚える対象にできる |`,
    `| AI 由来を含む | ${aiRows.length} | **断定に使わない。** 粗い用語（20 カ国以上）を掛けた結果である |`,
    '',
    `**そして \`verified\`（一次情報で確認済み）だけで成り立つ組み合わせは ${rows.filter((r) => r.certainty === 'verified').length
    } 件である。**`,
    '',
    '仕組みは動いている。**データが足りていない。**',
    '',
    '理由は 2 つある。',
    '',
    '1. `verified` の用語（ボラードや標識）は**単独で 1 カ国に確定するものが多い**。',
    '   掛ける必要がないため抽出条件で落ちる',
    '2. 組み合わせが強くなるのは**単独では弱いメタ同士**である。',
    '   そして弱いメタは経験則（`heuristic`）として記録されているものが多い',
    '',
    '**「組み合わせを計算で導出できる」ことと「導出した組み合わせが正しい」ことは別である。**',
    '前者は集合演算で保証できるが、後者は辞書の質で決まる。',
    '',
    '## 学習リスト（人手記述のみ）',
    '',
    '**`確かさ` は弱い方に引かれる。** 片方が経験則なら組み合わせも経験則である。',
    '',
    '| # | 組み合わせ | 単独の強さ | 積集合 | 確かさ |',
    '|---|---|---|---|---|',
    ...(humanRows.length
        ? humanRows.map(rowLine)
        : ['| — | （なし） | — | — | — |']),
    '',
    '## 参考：AI 由来を含む組み合わせ',
    '',
    '**これは学習リストではない。**',
    '',
    'AI 由来の用語は「粗いこと」を条件に採っている（該当国 20 以上）。',
    '役目は絞り込むことではなく、**「それでは絞り込めていない」と教えること**である。',
    '',
    'それを人手記述と掛けると積集合は小さくなるが、',
    '**縮んだ理由は AI 側の該当国リストが正しいという前提に乗っている。**',
    '実測でモデル間の該当国は食い違う（黄色いボラードが 8 カ国 対 2 カ国）。',
    '',
    '| # | 組み合わせ | 単独の強さ | 積集合 | 確かさ |',
    '|---|---|---|---|---|',
    ...aiRows.map(rowLine),
    '',
    '## 読み方',
    '',
    '- **弱いメタ同士の組み合わせが強くなる例を探すための表である。**',
    '  単独では 3 カ国でも、掛けて 1 カ国になるならそれが覚える単位になる',
    '- **上から順に覚える必要はない。** 自分がプレイする地域に出るものから覚える',
    '- 積集合が空になったペアは表に出していない。**それは矛盾であり絞り込みではない**',
    `- **人手記述が ${terms.filter((t) => t.source === 'human').length} 語しかないため、`
    + '組み合わせの数もそこで決まる。** 辞書を増やすほど表は伸びる',
    '',
)

fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf8')

console.log(`材料の用語: ${terms.length} 件（atomic かつ countries が空でないもの）`)
console.log(`全ペア: ${stats.pairs.toLocaleString()}`)
console.log('')
console.log('| 落とした理由 | 件数 |')
console.log(`| 片方が単独で 1 カ国に確定 | ${stats.dropped.bothStrongest} |`)
console.log(`| 積集合が空（両立しない） | ${stats.dropped.emptyIntersection} |`)
console.log(`| 単独より縮まない | ${stats.dropped.notImproved} |`)
console.log(`| 掛けても補助メタのまま | ${stats.dropped.weakResult} |`)
console.log('')
console.log(`**抽出: ${rows.length} 件**`)
for (const r of rows.slice(0, 10)) {
    console.log(
        `  ${r.result.length} カ国 [${r.result.join(' ')}]  ${r.a.canonical} ＋ ${r.b.canonical}  (${r.certainty})`,
    )
}
console.log('')
console.log(`保存先: ${OUT_PATH}`)
