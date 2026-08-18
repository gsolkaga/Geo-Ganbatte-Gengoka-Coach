/**
 * 正規化の誤りを検出して正解タグから外す（AI 未使用、消費 0）。
 *
 * ## 強い用語を誤って割り当てるのは、何も割り当てないより悪い
 *
 * 辞書を 195 語に増やして `npm run normalize:keys` を回した結果（実測 2026-08-18）。
 *
 * ```
 * q-tr-01（正解 TR）script = ref_lang_cyr_kazakh_letters   ← カザフ語のキリル字
 * q-br-01（正解 BR）sign   = ref_sign_post_wooden(CA TH UY)
 * ```
 *
 * **トルコはラテン文字である。** 原因はこちらの `plain` の書き方だった。
 *
 * ```
 * カザフ語 Қ      「K の右下にヒゲが出ている」
 * トルコ語 ş ç    日本語では「下にヒゲ」とも呼ばれる
 * ```
 *
 * **語が衝突した。** 素人語に寄せたことが、別の用語との衝突を生んだ。
 *
 * > **素人語で書くほど、用語同士がぶつかる。**
 *
 * ## 正解タグでは、誤りを機械的に検出できる
 *
 * 正解タグは**正解国を知っている。** したがって、
 *
 * - 該当国が少ない（強い）用語で
 * - その正解国を含まない
 *
 * ものが割り当てられていたら、**正規化の誤りである確率が高い。**
 *
 * ただし例外がある。**(b) 観察が誤誘導**の場合（黄色い中央線とカザフスタン）は、
 * 用語の割り当て自体は正しく、その手がかりが国を示さないだけである。
 * それは `road_marking_center_yellow`（13 カ国）のように**弱い用語**で起きる。
 *
 * したがって**強さで分ける。** 該当国が `STRONG_LIMIT` 以下の用語で
 * 正解国を含まないものだけを誤りとして扱う。
 *
 * > **弱い用語が正解を含まないのは診断である。強い用語が含まないのは誤りである。**
 *
 * 使い方:
 *   node tools/fix-normalization-errors.mjs           検出だけ
 *   node tools/fix-normalization-errors.mjs --apply   正解タグから外す
 */
import fs from 'node:fs'
import path from 'node:path'

const apply = process.argv.includes('--apply')
const HUMAN_PATH = path.join('data', 'glossary-human.json')
const QUESTIONS_PATH = path.join('data', 'questions.json')

/** これ以下の該当国数を「強い用語」とみなす */
const STRONG_LIMIT = 8

// ============================================================
// 1. 語の衝突を直す
// ============================================================

/**
 * `plain` と `aliases` の衝突を解く。
 *
 * **「ヒゲ」を素人語として複数の用語に書いたのが誤りだった。**
 * どこにヒゲが付くのかまで書けば衝突しない。
 */
const WORDING = {
    ref_lang_cyr_kazakh_letters: {
        plain: 'キリル文字で、K の右下に下向きのヒゲが付いた字がある',
        aliases: ['Қ', 'ヒゲつきのК', 'キリル文字のKにヒゲ', 'カザフ語の文字'],
    },
    ref_lang_lat_turkish: {
        plain: 'アルファベットで、s や c の下に小さなヒゲ（セディーユ）が付いている。点のない i もある',
        aliases: ['ş', 'ç', 'ı', 'セディーユ', 'sの下にヒゲ', 'cの下にヒゲ', 'トルコ語の文字'],
    },
}

const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const terms = Array.isArray(human) ? human : human.terms
const byId = new Map(terms.map((t) => [t.id, t]))

console.log('## 語の衝突を直す')
for (const [id, w] of Object.entries(WORDING)) {
    const term = byId.get(id)
    if (!term) {
        console.log(`  **見つからない: ${id}**`)
        continue
    }
    term.plain = w.plain
    term.aliases = w.aliases
    console.log(`  ${id}`)
    console.log(`      plain: ${w.plain}`)
}
if (apply) {
    fs.writeFileSync(HUMAN_PATH, `${JSON.stringify(Array.isArray(human) ? terms : human, null, 4)}\n`, 'utf8')
    console.log('  → 書き込んだ（build-glossary を回すこと）')
}
console.log('')

// ============================================================
// 2. 正解タグの誤りを検出する
// ============================================================

const glossary = JSON.parse(fs.readFileSync(path.join('data', 'glossary.json'), 'utf8')).terms
const gById = new Map(glossary.map((t) => [t.id, t]))
const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'))

const errors = []
const diagnoses = []

for (const q of questions) {
    for (const [slot, entry] of Object.entries(q.slots ?? {})) {
        for (const id of entry.terms ?? []) {
            const t = gById.get(id)
            if (!t) continue
            // AI 生成は絞り込みに使わないので判定しない
            if (t.certainty === 'unverified') continue
            if (t.countries.includes(q.country)) continue
            const row = { q: q.id, country: q.country, slot, id, size: t.countries.length, canonical: t.canonical }
            if (t.countries.length <= STRONG_LIMIT) errors.push(row)
            else diagnoses.push(row)
        }
    }
}

console.log(`## 正規化の誤り（強い用語が正解国を含まない）: ${errors.length} 件`)
for (const e of errors) {
    console.log(`  ${e.q}（正解 ${e.country}）/ ${e.slot.padEnd(19)} ${e.id}（${e.size} カ国）`)
    console.log(`      ${e.canonical}`)
}
console.log('')
console.log(`## 診断として正しいもの（弱い用語が正解国を含まない）: ${diagnoses.length} 件`)
for (const d of diagnoses) {
    console.log(`  ${d.q}（正解 ${d.country}）/ ${d.slot.padEnd(19)} ${d.id}（${d.size} カ国）`)
}
console.log('')
console.log('**弱い用語が正解を含まないのは診断である。強い用語が含まないのは誤りである。**')

if (!apply) {
    console.log('')
    console.log('--apply を付けると、誤りの方だけを正解タグから外す')
    process.exit(0)
}

let removed = 0
for (const q of questions) {
    for (const [slot, entry] of Object.entries(q.slots ?? {})) {
        const before = entry.terms?.length ?? 0
        entry.terms = (entry.terms ?? []).filter(
            (id) => !errors.some((e) => e.q === q.id && e.slot === slot && e.id === id),
        )
        removed += before - entry.terms.length
    }
}
fs.writeFileSync(QUESTIONS_PATH, `${JSON.stringify(questions, null, 4)}\n`, 'utf8')
console.log('')
console.log(`正解タグから外した用語 ID: ${removed} 件`)
console.log('**診断として正しいものは残した。** 削ると「観察が誤誘導だった」ことが言えなくなる。')
