/**
 * 用語辞書の整合性を検証する
 *
 * AI を使わない。集合演算とキーの存在確認だけである。
 *
 * ## なぜ必要か
 *
 * 手書きの JSON は壊れる。そして**壊れ方が静かである。**
 * 存在しない国コード、片方向の confusableWith、空の countries は
 * パースを通り抜けて、絞り込み力の計算を狂わせる。
 *
 * とくに **countries が空の用語は積集合を空にして全候補を誤って除外する。**
 *
 * 使い方:
 *   node scripts/validate-glossary.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = 'data'
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'))

const human = read('glossary-human.json')
const seed = read('countries-seed.json')
const regions = read('regions.json')

const validCodes = new Set(seed.map((c) => c.code))
const regionOf = new Map()
for (const [region, codes] of Object.entries(regions.regions ?? {})) {
    for (const code of codes) regionOf.set(code, region)
}

const errors = []
const warnings = []
const terms = human.terms ?? []
const byId = new Map(terms.map((t) => [t.id, t]))

if (byId.size !== terms.length) errors.push(`用語 ID が重複している（${terms.length} 件中 ${byId.size} 件が一意）`)

for (const t of terms) {
    const at = `${t.id}`

    // countries が空だと積集合が空になる。最も危険な壊れ方
    if (!Array.isArray(t.countries) || t.countries.length === 0) {
        errors.push(`${at}: countries が空。**積集合を空にして全候補を誤って除外する**`)
    }
    else {
        for (const c of t.countries) {
            if (!validCodes.has(c)) errors.push(`${at}: 存在しない国コード ${c}`)
        }
        if (new Set(t.countries).size !== t.countries.length) errors.push(`${at}: countries が重複`)
    }

    if (!['atomic', 'combination'].includes(t.kind)) errors.push(`${at}: kind が不正（${t.kind}）`)
    if (!['verified', 'heuristic'].includes(t.certainty)) errors.push(`${at}: certainty が不正（${t.certainty}）`)

    // combination は正規化に使えない。requires が無いと組み合わせの意味が失われる
    if (t.kind === 'combination' && !Array.isArray(t.requires)) {
        warnings.push(`${at}: combination だが requires が無い（同一スロット内の組み合わせなら可）`)
    }
    if (t.kind === 'atomic' && Array.isArray(t.requires)) {
        errors.push(`${at}: atomic に requires がある。矛盾している`)
    }

    // confusableWith は対称であるべき。片方向だと混同の警告が片側しか出ない
    for (const other of t.confusableWith ?? []) {
        if (!byId.has(other)) {
            errors.push(`${at}: confusableWith の ${other} が存在しない`)
            continue
        }
        if (!(byId.get(other).confusableWith ?? []).includes(t.id)) {
            warnings.push(`${at} ↔ ${other}: confusableWith が片方向`)
        }
    }

    if (!t.plain) errors.push(`${at}: plain が無い。素人語の入口が失われる`)
}

// メタの強さ。件数と地理的散らばりの 2 軸で判定する
const strength = (t) => {
    const n = t.countries?.length ?? 0
    const spread = new Set((t.countries ?? []).map((c) => regionOf.get(c) ?? '?')).size
    if (n === 1) return '最強'
    if (n === 2 && spread === 1) return '強'
    if (n <= 4 && spread === 1) return '良'
    return '補助'
}

console.log(`用語 ${terms.length} 件`)
console.log('')
console.log('| 強さ | atomic | combination |')
for (const s of ['最強', '強', '良', '補助']) {
    const a = terms.filter((t) => strength(t) === s && t.kind === 'atomic').length
    const c = terms.filter((t) => strength(t) === s && t.kind === 'combination').length
    console.log(`| ${s.padEnd(4)} | ${String(a).padStart(6)} | ${String(c).padStart(11)} |`)
}
console.log('')
console.log('| certainty | 件数 |')
for (const c of ['verified', 'heuristic']) {
    console.log(`| ${c.padEnd(9)} | ${terms.filter((t) => t.certainty === c).length} |`)
}
console.log('')
console.log('| スロット | 件数 |')
const bySlot = new Map()
for (const t of terms) bySlot.set(t.slot, (bySlot.get(t.slot) ?? 0) + 1)
for (const [s, n] of [...bySlot].sort((a, b) => b[1] - a[1])) console.log(`| ${s.padEnd(20)} | ${n} |`)

console.log('')
console.log(`=== エラー ${errors.length} 件`)
for (const e of errors) console.log(`  ${e}`)
console.log(`=== 警告 ${warnings.length} 件`)
for (const w of warnings) console.log(`  ${w}`)

console.log('')
console.log('**正規化（enum）に使えるのは atomic のみ。**')
console.log(`  atomic      ${terms.filter((t) => t.kind === 'atomic').length} 件`)
console.log(`  combination ${terms.filter((t) => t.kind === 'combination').length} 件（学習リスト用）`)
console.log('')
console.log('**heuristic は UI で断定しない。**「この国ならこう見えるはず」という期待として出す。')

process.exitCode = errors.length > 0 ? 1 : 0
