/**
 * Markdown の相対リンクが実在するかを確かめる。
 *
 * **README を分割した直後に一番壊れるのがリンクである。**
 * 分割前は同じファイル内のアンカー（`#試す人向け…`）だったものが、
 * 別ファイルへの相対パスに変わる。**綴りを間違えても何のエラーも出ない。**
 */
import fs from 'node:fs'
import path from 'node:path'

const targets = ['README.md', ...fs.readdirSync('docs')
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join('docs', f))]

/** 今回の分割で作ったファイル。見出しの検査はここだけに掛ける */
const SPLIT = [
    'README.md',
    'docs/screens.md',
    'docs/design.md',
    'docs/setup.md',
    'docs/credentials-and-billing.md',
    'docs/datasets.md',
    'docs/verification.md',
]

let broken = 0
let checked = 0

/**
 * コードブロックを外す。**`bash` の `# コメント` を見出しと数えてしまう。**
 * 最初にこれを外さずに数えて「h1 が 5 個」と誤検出した。
 */
function stripFences(text) {
    let inFence = false
    return text.split('\n').map((line) => {
        if (/^\s*```/.test(line)) { inFence = !inFence; return '' }
        return inFence ? '' : line
    }).join('\n')
}

for (const file of targets) {
    const text = fs.readFileSync(file, 'utf8')
    const prose = stripFences(text)
    // ![...] の画像も拾う（画像を置かない約束の確認にもなる）
    for (const m of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
        const href = m[1].trim()
        if (/^(https?:|mailto:|#)/.test(href)) continue
        const [rel] = href.split('#')
        if (!rel) continue
        checked++
        const resolved = path.resolve(path.dirname(file), rel)
        if (!fs.existsSync(resolved)) {
            console.log(`★リンク切れ  ${file} → ${href}`)
            broken++
        }
    }
    // 分割で作ったファイルだけを見る。既存の調査ログは対象外
    if (!SPLIT.includes(file.replace(/\\/g, '/'))) continue

    // 同じ見出しが 2 回出ていないか（分割で二重になりやすい）
    const heads = [...prose.matchAll(/^#+ (.+)$/gm)].map((x) => x[1].trim())
    const dup = heads.filter((h, i) => heads.indexOf(h) !== i)
    if (dup.length) {
        console.log(`★見出しの重複  ${file}: ${[...new Set(dup)].join(' / ')}`)
        broken++
    }
    // 先頭が h1 で 1 つだけか
    const h1 = [...prose.matchAll(/^# (.+)$/gm)]
    if (h1.length !== 1) {
        console.log(`★h1 が ${h1.length} 個  ${file}`)
        broken++
    }
}

console.log(`\n相対リンク ${checked} 件を検査。リンク切れ ${broken} 件`)
process.exit(broken ? 1 : 0)
