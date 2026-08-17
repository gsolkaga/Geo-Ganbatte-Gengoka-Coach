/**
 * 公開前の点検：資格情報・画像・巨大ファイルの混入を検出する
 *
 * このリポジトリは公開されており、以下の 2 つを機械的に担保する必要がある。
 *
 *   1. API キーとトークンを含めない
 *   2. Street View の画像を含めない（規約によりキャッシュ・再配布が禁止されている）
 *
 * .gitignore でも防いでいるが、二重にする。**履歴に入った資格情報は取り消せない。**
 *
 * 使い方（コミット前に実行する）:
 *   node scripts/check-secrets.mjs
 *
 * AI を使わない。
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const SKIP_DIR = new Set(['node_modules', '.git', '.nuxt', '.output', 'dist'])

const PATTERNS = [
    { name: 'Google API キー', re: /AIza[0-9A-Za-z\-_]{20,}/ },
    { name: 'UUID:シークレット形式', re: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:\S{8,}/ },
    { name: 'Bearer トークン', re: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/ },
    { name: 'GitHub トークン', re: /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/ },
    { name: '秘密鍵', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { name: 'AWS アクセスキー', re: /AKIA[0-9A-Z]{16}/ },
    { name: 'Slack トークン', re: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
]

const IMG = /\.(png|jpe?g|gif|webp|bmp|tiff|ico|svg)$/i
const BIN = /\.(zip|gz|7z|exe|dll|pdf|mp4|mov|woff2?|ttf)$/i

const hits = []
/** git が無視しているファイルでの検出。危険ではない */
const ignoredHits = []
const images = []
const large = []
let files = 0
let bytes = 0

/**
 * git が無視しているかを判定する。
 * `git check-ignore` は無視されていれば終了コード 0 を返す。
 */
function isGitIgnored(filePath) {
    const result = spawnSync('git', ['check-ignore', '-q', filePath], { stdio: 'ignore' })
    return result.status === 0
}

const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (SKIP_DIR.has(e.name)) continue
        const q = path.join(d, e.name)
        if (e.isDirectory()) {
            walk(q)
            continue
        }
        files++
        const size = fs.statSync(q).size
        bytes += size
        if (IMG.test(e.name)) images.push(q)
        if (size > 300_000) large.push(`${q}  ${Math.round(size / 1024)}KB`)
        if (BIN.test(e.name) || size > 3_000_000) continue

        let text
        try {
            text = fs.readFileSync(q, 'utf8')
        } catch {
            continue
        }
        for (const p of PATTERNS) {
            const m = text.match(p.re)
            if (!m) continue
            // .env.example のプレースホルダは除外
            if (/^0{8}-0{4}-0{4}-0{4}-0{12}:x+$/.test(m[0])) continue

            /**
             * git が無視しているファイルは分けて報告する。
             *
             * `.env` に本物のキーがあるのは**正常**である。危険なのは追跡されている場合だけ。
             * 一緒に並べると、毎回警告が出て**本物の混入を見逃すようになる。**
             * 「いつも赤い警告」は警告として機能しない。
             */
            const entry = `${p.name}  ${q}\n    ${m[0].slice(0, 8)}…（値は表示しない）`
            if (isGitIgnored(q)) ignoredHits.push(entry)
            else hits.push(entry)
        }
    }
}

walk('.')

console.log(`ファイル ${files} 件 / 合計 ${Math.round(bytes / 1024)}KB`)
console.log('')
console.log('=== 資格情報の疑い（★これが出たら公開前に必ず対処する） ===')
console.log(hits.length ? hits.join('\n') : '  なし')
console.log('')

if (ignoredHits.length) {
    console.log('--- git が無視しているファイルでの検出（危険ではない） ---')
    console.log(ignoredHits.join('\n'))
    console.log('  ↑ .env に本物のキーがあるのは正常。追跡されていないため公開されない。')
    console.log('')
}
console.log('=== 画像ファイル ===')
console.log(images.length ? images.join('\n') : '  なし')
console.log('')
console.log('=== 300KB 超 ===')
console.log(large.length ? large.join('\n') : '  なし')
console.log('')
console.log('=== .env の実体 ===')
console.log(fs.existsSync('.env') ? '  ★存在する。gitignore を確認せよ' : '  なし')
