/**
 * 用語辞書の指紋を出す（AI 未使用、消費 0）。
 *
 * ## 「辞書を足していない」を、言葉ではなく数字で示す
 *
 * 到達 6 / 10 は、**辞書を作るときに使った 10 問**での数字である。
 * 読者から見れば「その 10 問に合わせて辞書を作ったのでは」と疑える。
 *
 * 別の 10 地点で測れば汎化を示せるが、そのとき
 * **「辞書は 1 語も足していない」が信じられなければ意味がない。**
 *
 * だから測る前に指紋を残す。後で同じ指紋が出れば、
 * **辞書が同一であることが確かめられる。**
 *
 * > **主張の前提は、主張と一緒に検証できる形で置く。**
 *
 * 指紋は「絞り込みに効く部分」だけから作る。
 * `note` や `plain` の文言を直しても指紋は変わらない。
 * **変わってはいけないのは、どの用語がどの国に対応するかである。**
 *
 * 使い方:
 *   node tools/glossary-fingerprint.mjs            指紋を出す
 *   node tools/glossary-fingerprint.mjs --write     docs/glossary-fingerprint.md に記録する
 *   node tools/glossary-fingerprint.mjs --verify    記録と一致するか確かめる
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.join('docs', 'glossary-fingerprint.md')
const write = process.argv.includes('--write')
const verify = process.argv.includes('--verify')

const terms = JSON.parse(fs.readFileSync(path.join('data', 'glossary.json'), 'utf8')).terms

/**
 * 指紋の材料。**絞り込みの結果を変える項目だけを入れる。**
 *
 * `exhaustive` と `disputed` と `certainty` を入れるのは、
 * これらが「積集合に入れるか」を決めるためである（`server/utils/narrowing.ts`）。
 * 入れ忘れると、使い方を変えただけで指紋が変わらなくなる。
 */
function material(t) {
    return [
        t.id,
        t.slot,
        t.certainty,
        t.source,
        t.disputed === true ? 'disputed' : '-',
        t.exhaustive === false ? 'assoc' : 'exhaustive',
        [...(t.countries ?? [])].sort().join(','),
        [...(t.excludes ?? [])].sort().join(','),
    ].join('|')
}

const lines = terms.map(material).sort()
const digest = crypto.createHash('sha256').update(lines.join('\n')).digest('hex')

/** 絞り込みに使える語だけを数える。**総数だけでは中身が変わっても気づけない** */
const usable = terms.filter(
    (t) => t.certainty !== 'unverified' && t.disputed !== true && t.exhaustive !== false,
).length

const bySource = {}
for (const t of terms) bySource[t.source] = (bySource[t.source] ?? 0) + 1

const summary = {
    terms: terms.length,
    usableForNarrowing: usable,
    bySource,
    sha256: digest,
}

console.log('# 用語辞書の指紋（AI 未使用、消費 0）')
console.log('')
console.log(`用語 ${summary.terms} 語（絞り込みに使える ${summary.usableForNarrowing} 語）`)
console.log(`由来: ${Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(' / ')}`)
console.log(`sha256: ${digest}`)
console.log('')

if (verify) {
    if (!fs.existsSync(OUT)) {
        console.error(`**記録が無い: ${OUT}**　先に --write で残す`)
        process.exit(1)
    }
    const recorded = fs.readFileSync(OUT, 'utf8').match(/sha256:\s*`([0-9a-f]{64})`/)?.[1]
    if (!recorded) {
        console.error(`**記録から sha256 を読めない: ${OUT}**`)
        process.exit(1)
    }
    if (recorded !== digest) {
        console.error('## **辞書が変わっている**')
        console.error(`  記録: ${recorded}`)
        console.error(`  現在: ${digest}`)
        console.error('')
        console.error('**汎化テストの前提が崩れている。** 辞書を足したまま別地点を測ると、')
        console.error('「辞書を足さずに測った」と言えなくなる。')
        process.exit(1)
    }
    console.log('**一致した。** 辞書は記録した時点と同一である')
    process.exit(0)
}

if (!write) {
    console.log('--write で docs に記録する / --verify で記録と突き合わせる')
    process.exit(0)
}

const body = `# 用語辞書の指紋

生成: ${new Date().toISOString()}　\`node tools/glossary-fingerprint.mjs --write\`

## なぜ残すのか

到達 6 / 10 は、**辞書を作るときに使った 10 問**での数字である。
読者から見れば「その 10 問に合わせて辞書を作ったのでは」と疑える。

別の 10 地点で測れば汎化を示せるが、そのとき
**「辞書は 1 語も足していない」が信じられなければ意味がない。**

> **主張の前提は、主張と一緒に検証できる形で置く。**

この記録より後に測った到達は、\`--verify\` が通る限り
**同じ辞書での結果である。**

## 記録

| 項目 | 値 |
|---|---|
| 用語数 | ${summary.terms} |
| 絞り込みに使える語 | ${summary.usableForNarrowing} |
${Object.entries(bySource).map(([k, v]) => `| 由来 \`${k}\` | ${v} |`).join('\n')}

sha256: \`${digest}\`

## 指紋に入れているもの

**絞り込みの結果を変える項目だけ**である。
\`note\` や \`plain\` の文言を直しても指紋は変わらない。
変わってはいけないのは、**どの用語がどの国に対応するか**である。

\`\`\`
id | slot | certainty | source | disputed | exhaustive | countries | excludes
\`\`\`

\`certainty\` と \`disputed\` と \`exhaustive\` を入れているのは、
これらが「積集合に入れるか」を決めるためである（\`server/utils/narrowing.ts\`）。

## 確かめ方

\`\`\`bash
node tools/glossary-fingerprint.mjs --verify
\`\`\`
`

fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync(OUT, body, 'utf8')
console.log(`記録した: ${OUT}`)
console.log('')
console.log('**この後に辞書を足すと --verify が落ちる。** それが目的である')
