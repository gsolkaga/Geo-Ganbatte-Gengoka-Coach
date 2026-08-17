/**
 * data/glossary.json を構築する（タスク 15.1 / 17）
 *
 * AI を使わない。既存ファイルの統合と選別だけである。
 *
 *   data/glossary-human.json   人手記述（実際に絞り込む用語）
 *   docs/generated-glossary/   AI 生成の原文（粗い用語の供給源）
 *
 * ## 由来を混ぜない
 *
 * `source` フィールドで人間と AI を区別する。記事で区別できるようにするためであり、
 * また **AI 由来の用語は断定に使えない**ため、UI での扱いが変わる。
 *
 * ## AI 生成側で見つかった 2 つの問題
 *
 * **1. `confusableWith` に用語 ID ではなく国コードが入っている。**
 * `countries` と同じ内容が入っており、スキーマの誤用である。**捨てる。**
 * `strict: true` は型（string の配列）を守らせたが、**意味は守らせなかった。**
 *
 * **2. `id` が全ファイルで `coarse-01` から始まる。**
 * 52 ファイル × 4 モデル × 13 スロットで衝突する。**振り直す。**
 * AI に一意な識別子を作らせるのは無理だった（グローバルな文脈を持たないため）。
 *
 * ## AI 由来をどう選ぶか
 *
 * 全 517 語は要らない。**正規化の enum に入れる都合上、規模を抑える必要がある。**
 *
 * 選ぶ基準は「粗いこと」である。粗い用語の役目は
 * **「それでは絞り込めていない」と学習者に教えること**であり、
 * 該当国数が多いほど役目を果たす。
 *
 * ## 重複時は和集合を採る
 *
 * モデル間で同じ用語の該当国が食い違う（実測：黄色いボラードが 8 カ国 対 2 カ国）。
 * **和集合を採る。** 粗い用語にとって和集合は安全な方向である。
 * 積集合を採ると、根拠より強い用語に見えてしまう。
 *
 * 使い方:
 *   node scripts/build-glossary.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = 'data'
const GEN_DIR = path.join('docs', 'generated-glossary')
const OUT_PATH = path.join(DATA_DIR, 'glossary.json')

/** 粗い用語と見なす下限。これ未満は AI 由来から採らない */
const COARSE_MIN_COUNTRIES = 20
/** スロットごとに採る AI 由来の上限。enum を膨らませない */
const MAX_AI_PER_SLOT = 5

const human = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'glossary-human.json'), 'utf8'))
const seed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'countries-seed.json'), 'utf8'))
const validCodes = new Set(seed.map((c) => c.code))

/** 表記揺れを吸収して名寄せする。完全一致では重複が残る */
const normaliseKey = (s) =>
    String(s ?? '')
        .toLowerCase()
        .replace(/[\s　]/g, '')
        .replace(/[（）()、。・,.]/g, '')

// ============================================================
// 人手記述をそのまま採る
// ============================================================

const terms = human.terms.map((t) => ({
    id: t.id,
    slot: t.slot,
    kind: t.kind,
    /** verified | heuristic | unverified */
    certainty: t.certainty,
    source: 'human',
    canonical: t.canonical,
    plain: t.plain,
    aliases: t.aliases ?? [],
    countries: t.countries,
    confusableWith: t.confusableWith ?? [],
    requires: t.requires ?? null,
    note: t.note ?? '',
    disputed: t.disputed ?? false,
}))

const humanKeys = new Set(terms.map((t) => normaliseKey(t.canonical)))

// ============================================================
// AI 生成から粗い用語だけを採る
// ============================================================

/** slot -> 名寄せキー -> { canonical, plain, aliases, countries(Set), models(Set) } */
const aiBySlot = new Map()
const stats = { files: 0, parsed: 0, rawTerms: 0, dropped: { badCountry: 0, tooNarrow: 0, dupOfHuman: 0 } }
/** パースできなかったファイル。**0 件と混同しないため理由ごと残す** */
const failures = []

for (const file of fs.existsSync(GEN_DIR) ? fs.readdirSync(GEN_DIR) : []) {
    if (!file.endsWith('.json')) continue
    stats.files++

    // ファイル名は {model}-{slot}.json
    const m = /^(.+)-([a-z_]+)\.json$/.exec(file)
    if (!m) continue
    const [, model, slot] = m

    /**
     * **パース失敗を 0 件として黙って飲み込まない。**
     *
     * 当初の集計コードがこれをやっており、「3 モデルが bollard で 0 件を返した」
     * という誤った結論を出した。実際は `finish_reason=length` で
     * 18,204 字書いて途中切れしていた（`docs/ai-vs-human-glossary.md` の訂正）。
     *
     * **失敗の表示は、失敗の理由を語らない。** `finish_reason` を必ず記録する。
     */
    let list
    try {
        const body = JSON.parse(fs.readFileSync(path.join(GEN_DIR, file), 'utf8'))
        const choice = body.choices?.[0]
        const content = choice?.message?.content ?? ''
        list = JSON.parse(content).terms ?? []
        stats.parsed++
        if (choice?.finish_reason && choice.finish_reason !== 'stop') {
            failures.push({ model, slot, reason: `パースできたが finish_reason=${choice.finish_reason}`, chars: content.length })
        }
    }
    catch {
        // どのファイルがなぜ落ちたかを残す。件数 0 と混同しないため
        let finish = '不明'
        let chars = 0
        try {
            const body = JSON.parse(fs.readFileSync(path.join(GEN_DIR, file), 'utf8'))
            finish = body.choices?.[0]?.finish_reason ?? '不明'
            chars = (body.choices?.[0]?.message?.content ?? '').length
        }
        catch { /* 外側も壊れている */ }
        failures.push({ model, slot, reason: `content がパース不能（finish_reason=${finish}）`, chars })
        continue
    }

    if (!aiBySlot.has(slot)) aiBySlot.set(slot, new Map())
    const bucket = aiBySlot.get(slot)

    for (const t of list) {
        stats.rawTerms++

        const countries = (t.countries ?? []).filter((c) => validCodes.has(c))
        if (countries.length === 0) {
            stats.dropped.badCountry++
            continue
        }

        const key = normaliseKey(t.canonical ?? t.plain)
        if (!key) continue

        // 人手記述と同じ概念なら人間側を優先する。AI 由来で上書きしない
        if (humanKeys.has(key)) {
            stats.dropped.dupOfHuman++
            continue
        }

        if (!bucket.has(key)) {
            bucket.set(key, {
                canonical: t.canonical ?? t.plain,
                plain: t.plain ?? t.canonical,
                aliases: new Set(t.aliases ?? []),
                countries: new Set(),
                models: new Set(),
                notes: new Set(),
            })
        }
        const entry = bucket.get(key)
        // 和集合を採る。粗い用語にとって広い方が安全である
        for (const c of countries) entry.countries.add(c)
        for (const a of t.aliases ?? []) entry.aliases.add(a)
        entry.models.add(model)
        if (t.note) entry.notes.add(String(t.note))
        // confusableWith は捨てる。国コードが入っておりスキーマの誤用である
    }
}

let aiAdded = 0
for (const [slot, bucket] of [...aiBySlot].sort()) {
    const candidates = [...bucket.values()]
        .filter((e) => {
            if (e.countries.size < COARSE_MIN_COUNTRIES) {
                stats.dropped.tooNarrow++
                return false
            }
            return true
        })
        // 粗い順。役目は「絞り込めていない」と教えることなので広いものを優先する
        .sort((a, b) => b.countries.size - a.countries.size)
        .slice(0, MAX_AI_PER_SLOT)

    let n = 0
    for (const e of candidates) {
        n++
        aiAdded++
        terms.push({
            id: `ai_${slot}_${String(n).padStart(2, '0')}`,
            slot,
            kind: 'atomic',
            /** AI 生成であり人手検証を経ていない。**断定に使わない** */
            certainty: 'unverified',
            source: 'ai',
            canonical: e.canonical,
            plain: e.plain,
            aliases: [...e.aliases],
            countries: [...e.countries].sort(),
            confusableWith: [],
            requires: null,
            note: [...e.notes][0] ?? '',
            /** 複数モデルが同じ概念を挙げたか。1 なら単独発言であり根拠が弱い */
            modelCount: e.models.size,
            disputed: e.models.size <= 1,
        })
    }
}

const out = {
    _comment: [
        'v2 が使う用語辞書。scripts/build-glossary.mjs が生成する。**手で編集しない。**',
        '',
        '人手記述は data/glossary-human.json、AI 生成の原文は docs/generated-glossary/ が正典。',
        'どちらかを直してから再生成する。',
        '',
        'source: human | ai       由来。記事で区別するため、また UI での扱いを変えるため',
        'certainty:',
        '  verified    人間が一次情報で確認した。断定してよい',
        '  heuristic   実戦中の連想・経験則。**断定しない。「こう見えるはず」として出す**',
        '  unverified  AI 生成で人手検証を経ていない。**断定しない**',
        'kind: atomic | combination   **正規化の enum に使えるのは atomic のみ**',
        '',
        'AI 由来は「粗い用語」だけを採っている。役目は絞り込むことではなく、',
        `**「それでは絞り込めていない」と教えること**である（該当国 ${COARSE_MIN_COUNTRIES} 以上）。`,
        '',
        'AI 由来の confusableWith は捨てた。国コードが入っておりスキーマの誤用だった。',
        'AI 由来の id は振り直した。全ファイルが coarse-01 から始まり衝突するため。',
    ],
    generatedAt: new Date().toISOString(),
    terms,
}

fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 4) + '\n', 'utf8')

const count = (f, v) => terms.filter((t) => t[f] === v).length
console.log(`ファイル ${stats.files} 件（パース成功 ${stats.parsed}）/ 生の用語 ${stats.rawTerms} 件`)
console.log('')
console.log('| 由来 | 件数 |')
console.log(`| human | ${count('source', 'human')} |`)
console.log(`| ai    | ${count('source', 'ai')} |`)
console.log('')
console.log('| certainty | 件数 |')
for (const c of ['verified', 'heuristic', 'unverified']) console.log(`| ${c.padEnd(10)} | ${count('certainty', c)} |`)
console.log('')
console.log('| kind | 件数 |')
for (const k of ['atomic', 'combination']) console.log(`| ${k.padEnd(11)} | ${count('kind', k)} |`)
console.log('')
console.log('=== AI 由来から落としたもの')
console.log(`  国コードが不正または空: ${stats.dropped.badCountry}`)
console.log(`  粗くない（${COARSE_MIN_COUNTRIES} カ国未満）: ${stats.dropped.tooNarrow}`)
console.log(`  人手記述と同じ概念: ${stats.dropped.dupOfHuman}`)
console.log('')
console.log(`=== 使えなかったファイル ${failures.length} 件`)
console.log('**これは「0 件」ではない。** 混同すると「モデルが黙った」という誤った結論になる。')
for (const f of failures) {
    console.log(`  ${f.model} / ${f.slot}  ${f.reason}  content=${f.chars} 字`)
}
console.log('')
console.log(`**正規化の enum に入るのは atomic の ${terms.filter((t) => t.kind === 'atomic').length} 件。**`)
console.log(`保存先: ${OUT_PATH}`)
