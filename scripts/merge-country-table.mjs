/**
 * 国定数テーブルの突き合わせと不一致検出
 *
 * run-country-table.mjs の出力を読み、モデル間の不一致を検出する。
 *
 * 重要：一致は正しさを保証しない。複数モデルが同じ誤りをすることは普通にある。
 * このスクリプトが出すのは「人手確認すべき箇所のリスト」であり、正解ではない。
 *
 * 使い方:
 *   node scripts/merge-country-table.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = 'data'
const DOCS_DIR = 'docs'
const IN_DIR = path.join(DOCS_DIR, 'generated-countries')
const SEED_PATH = path.join(DATA_DIR, 'countries-seed.json')
const OUT_TABLE = path.join(DATA_DIR, 'countries-merged.json')
const OUT_REPORT = path.join(DOCS_DIR, 'countries-disagreement.md')

const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'))
const nameOf = Object.fromEntries(seed.map((c) => [c.code, c.name]))

/** model -> code -> record */
const byModel = {}

for (const file of fs.readdirSync(IN_DIR)) {
    if (!file.endsWith('.json')) continue

    const m = file.match(/^(.+)-batch\d+\.json$/)
    if (!m) continue
    const model = m[1]

    const raw = JSON.parse(fs.readFileSync(path.join(IN_DIR, file), 'utf8'))
    const content = raw.choices?.[0]?.message?.content
    if (!content) continue

    let parsed
    try {
        parsed = JSON.parse(content)
    } catch {
        console.warn(`パース失敗: ${file}`)
        continue
    }

    byModel[model] ??= {}
    for (const rec of parsed.countries ?? []) {
        if (!rec?.code) continue
        byModel[model][rec.code] = rec
    }
}

const models = Object.keys(byModel).sort()
console.log(`モデル: ${models.length} 件`)
for (const m of models) console.log(`  ${m}: ${Object.keys(byModel[m]).length} カ国`)
console.log('')

const norm = (arr) => [...new Set((arr ?? []).map((s) => String(s).toLowerCase().trim()))].sort()
const setEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

const merged = []
const disagreements = []

for (const { code } of seed) {
    const recs = models.map((m) => ({ model: m, rec: byModel[m]?.[code] })).filter((x) => x.rec)

    if (recs.length === 0) {
        disagreements.push({ code, field: 'all', detail: '全モデルで欠落' })
        continue
    }

    // traffic_side（二値。完全一致で比較できる）
    const sides = [...new Set(recs.map((r) => r.rec.traffic_side))]
    const sideAgreed = sides.length === 1

    // scripts（enum。集合として比較できる）
    const scriptSets = recs.map((r) => norm(r.rec.scripts))
    const scriptAgreed = scriptSets.every((s) => setEq(s, scriptSets[0]))

    // languages（自由記述。表記揺れがあるため参考程度）
    const langSets = recs.map((r) => norm(r.rec.languages))
    const langAgreed = langSets.every((s) => setEq(s, langSets[0]))

    /**
     * languages は採用値を作らない。全モデルの生の出力を並べて保持するだけとする。
     *
     * 理由：自由記述にしたため表記揺れが激しく、機械的な突き合わせが成立しない。
     *
     * 実測（2026-08-07）の失敗例。
     *   同一言語の表記揺れ: chinese / 中国語(繁体字) / 繁体字中国語 / 中国語（広東語）
     *                       fr / フランス語 / フランス語 (french)
     *   フィールドの取り違え: MG に「右側通行」「白地に黒文字。上部に MADAGASCAR ...」
     *                         PR に「puerto rico」「走行側：右側通行」
     *
     * 単純な和集合ではフィールドの取り違えが混入する。
     * 2 モデル以上の一致を要求する閾値を設けると、表記揺れによって
     * 正しい言語まで落ちた（HK で中国語が消え、MG は全滅した）。
     *
     * 得られた教訓：**複数モデルで突き合わせるフィールドは enum にしておく必要がある。**
     * traffic_side（2 値）と scripts（20 値）は enum のため綺麗に比較できた。
     * languages を自由記述にしたのは設計上の誤りである。
     *
     * languages は script スロットの下書きにしか使わず、絞り込み力の計算には
     * 用語辞書の countries を使うため、採用値がなくても実害はない。
     * 人間がタグ付けする際の参考として、モデル別の生の出力を残す。
     */
    const langByModel = recs.map((r, i) => ({ model: r.model, values: langSets[i] }))

    if (!sideAgreed) {
        disagreements.push({
            code,
            field: 'traffic_side',
            detail: recs.map((r) => `${r.model}=${r.rec.traffic_side}`).join(' / '),
        })
    }
    if (!scriptAgreed) {
        disagreements.push({
            code,
            field: 'scripts',
            detail: recs.map((r, i) => `${r.model}=[${scriptSets[i].join(',')}]`).join(' / '),
        })
    }
    if (!langAgreed) {
        disagreements.push({
            code,
            field: 'languages',
            detail: recs.map((r, i) => `${r.model}=[${langSets[i].join(',')}]`).join(' / '),
        })
    }

    // 多数決で採用値を決める（正しさの保証ではない）
    const majority = (values) => {
        const count = {}
        for (const v of values) {
            const k = JSON.stringify(v)
            count[k] = (count[k] ?? 0) + 1
        }
        const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0]
        return JSON.parse(best[0])
    }

    merged.push({
        code,
        name: nameOf[code],
        traffic_side: majority(recs.map((r) => r.rec.traffic_side)),
        /** モデルごとの回答。多数決が誤る場合があるため人手確認用に残す */
        traffic_side_by_model: recs.map((r) => ({ model: r.model, value: r.rec.traffic_side })),
        scripts: majority(scriptSets),
        /** 採用値は作らない。表記揺れにより機械的な突き合わせが成立しないため */
        languages_by_model: langByModel,
        plate_notes: recs.map((r) => ({ model: r.model, note: r.rec.plate_note ?? '' })),
        modelCount: recs.length,
        disputed: !sideAgreed || !scriptAgreed,
        verifiedByHuman: false,
    })
}

/**
 * 人手による訂正を適用する。
 *
 * 多数決は誤る。実測でガーナは 3 モデルが left と答えたが正解は right であり、
 * 唯一正解したモデルが少数派だった。訂正は明示的なファイルで管理し、
 * 根拠（reason）を必ず残す。
 *
 * status が 'confirmed' のものだけを適用する。'proposed' は未確認であり適用しない。
 */
const OVERRIDE_PATH = path.join(DATA_DIR, 'countries-overrides.json')
const applied = []
const pending = []
const verified = []

if (fs.existsSync(OVERRIDE_PATH)) {
    const { overrides = [], verified: verifiedList = [] } = JSON.parse(fs.readFileSync(OVERRIDE_PATH, 'utf8'))

    // 値を書き換える訂正
    for (const o of overrides) {
        const target = merged.find((c) => c.code === o.code)
        if (!target) continue

        if (o.status !== 'confirmed') {
            pending.push(o)
            continue
        }
        target[o.field] = o.to
        target.verifiedByHuman = true
        target.overrideReason = o.reason
        applied.push(o)
    }

    // 値は変えず、人間が確認したことだけを記録する
    const sameValue = (a, b) =>
        Array.isArray(a) && Array.isArray(b)
            ? a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])
            : a === b

    for (const v of verifiedList) {
        const target = merged.find((c) => c.code === v.code)
        if (!target) continue

        const current = target[v.field]
        if (!sameValue(current, v.value)) {
            // 記録と実データが食い違っている。確認記録が古い可能性がある
            verified.push({ ...v, mismatch: current })
            continue
        }
        target.verifiedByHuman = true
        target.verifiedNote = v.note
        verified.push(v)
    }
}

fs.writeFileSync(OUT_TABLE, JSON.stringify(merged, null, 2) + '\n', 'utf8')

// 不一致レポート
const byField = {}
for (const d of disagreements) {
    byField[d.field] ??= []
    byField[d.field].push(d)
}

const lines = []
lines.push('# 国定数テーブルの不一致レポート')
lines.push('')
lines.push(`生成日時: ${new Date().toISOString()}`)
lines.push('')
lines.push(`対象: ${seed.length} カ国 / モデル ${models.length} 件`)
lines.push('')
lines.push('**モデル間の一致は正しさを保証しない。** 複数モデルが同じ誤りをすることは普通にある。')
lines.push('このレポートが示すのは「人手確認すべき箇所」であり、一致した項目が正しいという意味ではない。')
lines.push('')
lines.push('## 集計')
lines.push('')
lines.push('| 項目 | 不一致の件数 |')
lines.push('|---|---|')
for (const field of ['traffic_side', 'scripts', 'languages', 'all']) {
    lines.push(`| \`${field}\` | ${byField[field]?.length ?? 0} |`)
}
lines.push('')

for (const field of ['traffic_side', 'scripts', 'languages', 'all']) {
    const items = byField[field]
    if (!items?.length) continue
    lines.push(`## \`${field}\` の不一致（${items.length} 件）`)
    lines.push('')
    for (const d of items) {
        lines.push(`### ${d.code} ${nameOf[d.code] ?? ''}`)
        lines.push('')
        lines.push('```')
        lines.push(d.detail)
        lines.push('```')
        lines.push('')
    }
}

// traffic_side はモデルごとの回答を一覧で出す（多数決が誤る場合があるため）
lines.push('## `traffic_side` のモデル別回答一覧')
lines.push('')
lines.push('**多数決が誤る場合がある。** 実測でガーナは 3 モデルが `left` と答えたが、')
lines.push('正解は `right` であり、唯一正解したモデルが少数派だった。')
lines.push('')
lines.push('不一致のあった国は、必ず一次情報で確認すること。')
lines.push('')
lines.push('| 国 | 採用値 | ' + models.map((m) => m.replace('preview_', '')).join(' | ') + ' |')
lines.push('|---|---|' + models.map(() => '---').join('|') + '|')
for (const c of merged) {
    const byModel = Object.fromEntries((c.traffic_side_by_model ?? []).map((x) => [x.model, x.value]))
    const values = models.map((m) => byModel[m] ?? '-')
    if (new Set(values.filter((v) => v !== '-')).size <= 1) continue
    lines.push(`| ${c.code} ${c.name} | **${c.traffic_side}** | ${values.join(' | ')} |`)
}
lines.push('')

lines.push('## `languages` は採用値を作っていない')
lines.push('')
lines.push('自由記述にしたため表記揺れが激しく、機械的な突き合わせが成立しなかった。')
lines.push('')
lines.push('```')
lines.push('同一言語の表記揺れ  : chinese / 中国語(繁体字) / 繁体字中国語 / 中国語（広東語）')
lines.push('                      fr / フランス語 / フランス語 (french)')
lines.push('フィールドの取り違え: MG に「右側通行」「白地に黒文字。上部に MADAGASCAR ...」')
lines.push('                      PR に「puerto rico」「走行側：右側通行」')
lines.push('```')
lines.push('')
lines.push('**得られた教訓：複数モデルで突き合わせるフィールドは enum にしておく必要がある。**')
lines.push('')
lines.push('`traffic_side`（2 値）と `scripts`（20 値）は enum のため綺麗に比較できた。')
lines.push('`languages` を自由記述にしたのは設計上の誤りである。')
lines.push('')
lines.push('`languages` は `script` スロットの下書きにしか使わず、絞り込み力の計算には')
lines.push('用語辞書の `countries` を使うため、採用値がなくても実害はない。')
lines.push('モデル別の生の出力を `languages_by_model` に保持しており、タグ付け時の参考にできる。')
lines.push('')

// 人手訂正の状況
lines.push('## 人手による訂正')
lines.push('')
if (applied.length > 0) {
    lines.push('### 適用済み')
    lines.push('')
    for (const o of applied) {
        lines.push(`- **${o.code}** \`${o.field}\`: ${o.from} → ${o.to}`)
        lines.push(`  - 根拠: ${o.reason}`)
    }
    lines.push('')
}
if (pending.length > 0) {
    lines.push('### 未確認（適用していない）')
    lines.push('')
    lines.push('`countries-overrides.json` の `status` を `confirmed` に変更すると適用される。')
    lines.push('')
    for (const o of pending) {
        lines.push(`- **${o.code}** \`${o.field}\`: ${o.from} → ${o.to}`)
        lines.push(`  - 根拠: ${o.reason}`)
        if (o.needsConfirmation) lines.push(`  - ${o.needsConfirmation}`)
    }
    lines.push('')
}
if (verified.length > 0) {
    lines.push('### 確認済み（多数決が正しかったもの）')
    lines.push('')
    lines.push('値は変更していない。人間が確認したことを記録している。')
    lines.push('')
    for (const v of verified) {
        const fmt = (x) => (Array.isArray(x) ? `[${x.join(', ')}]` : String(x))
        if (v.mismatch !== undefined) {
            lines.push(`- **${v.code}** \`${v.field}\`: 記録は \`${fmt(v.value)}\` だが実データは \`${fmt(v.mismatch)}\`。**確認記録が古い可能性がある**`)
        } else {
            lines.push(`- **${v.code}** \`${v.field}\` = \`${fmt(v.value)}\``)
            if (v.note) lines.push(`  - ${v.note}`)
        }
    }
    lines.push('')
}
if (applied.length === 0 && pending.length === 0 && verified.length === 0) {
    lines.push('なし。')
    lines.push('')
}

lines.push('## 人手確認の優先順位')
lines.push('')
lines.push('1. `traffic_side` の不一致（二値の事実。誤りは致命的。**多数決を信用しない**）')
lines.push('2. `scripts` の不一致（絞り込み力の分母に直結する）')
lines.push('3. 出題する 10 カ国と難易度 3 のクラスタに属する国')
lines.push('4. `languages_by_model`（採用値なし。タグ付け時に目視で参照する）')

fs.writeFileSync(OUT_REPORT, lines.join('\n') + '\n', 'utf8')

console.log(`不一致: ${disagreements.length} 件`)
for (const field of ['traffic_side', 'scripts', 'languages', 'all']) {
    console.log(`  ${field}: ${byField[field]?.length ?? 0}`)
}
console.log('')
console.log(`テーブル: ${OUT_TABLE}`)
console.log(`レポート: ${OUT_REPORT}`)
