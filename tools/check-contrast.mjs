/**
 * 白地に白字を作っていないかを機械的に見る。**消費 0。**
 *
 * ## なぜ要るか
 *
 * 編集モード（`/admin`）でページの根に `text-edit-text`（ほぼ白）を置いた。
 * Tailwind の文字色は**継承される**ので、その中の白い面で文字色を指定しなかった要素は
 * **白地に白字**になる。
 *
 * 実測（2026-08-19）で、記述欄に打った文字が見えなかった。
 * **全選択して反転させるまで気づけなかった。**
 *
 * > **色は継がれる。継いで困る場所で断ち切る。**
 *
 * ## 規則を絞った経緯
 *
 * 最初は「明るい背景か入力要素なら文字色を書け」を全ファイルに掛けた。
 * **44 件出て、ほとんどが誤検出だった。** 学習画面は白地とスレートが既定なので、
 * 文字色を省いても正しく出る。**省略が誤りなのは、継承元が明るい場所だけである。**
 *
 * > **どこでも成り立つ規則にしようとすると、成り立たない場所で嘘になる。**
 *
 * 次に「ファイルが `text-edit-*` を含むか」で絞ったが、これも誤りだった。
 * `datasets.vue` は白い画面だが、編集モードへのリンク 1 つだけが編集色を使う。
 * **ファイルに含まれることと、木の中にあることは違う。**
 * いまはルート要素の文字色を見ている。
 *
 * ## 見るもの
 *
 *   規則 1  同じクラス指定に明るい背景と明るい文字色が同居している（どこでも誤り）
 *   規則 2  ルートが明るい文字色のファイルで、明るい面と入力欄に文字色が無い
 *   規則 3  編集モードでも使う共有部品の入力欄に文字色が無い
 *
 * 三項演算子は**分岐ごとに**見る。`a ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'`
 * を 1 つの文字列として見ると、`bg-white` と `text-white` が同居していると誤判定する。
 *
 * `<script>` は見ない。**説明コメントに書いた `<input maxlength="2">` を拾った。**
 *
 * 使い方:
 *   node tools/check-contrast.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const LIGHT_BG = /\bbg-(white|slate-50|slate-100|amber-50|rose-50|emerald-50|edit-accent)\b/
const LIGHT_TEXT = /\btext-(white|edit-text|edit-muted|slate-[123]00)\b/

/**
 * 文字色の指定が何かあるか。**大きさや配置の `text-*` を色と数えない。**
 *
 * **修飾子が付いた色は基本の色ではない。** `disabled:text-slate-400` は
 * 無効なときだけ効く。これを「色がある」と数えたため、
 * わざと壊した記述欄を検出できなかった（自己検査で判明）。
 *
 * > **検査を書いたら、壊して確かめる。** 通ることは動くことではない。
 */
const TEXT_UTILITY_NOT_COLOR = /^(xs|sm|base|lg|xl|[2-9]xl|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|inherit|current|transparent)$/
function hasTextColor(s) {
    for (const token of s.split(/\s+/)) {
        // `hover:` `disabled:` `sm:` などが付いていたら基本の色ではない
        if (token.includes(':')) continue
        const m = /^text-([a-z0-9-]+)$/.exec(token)
        if (m && !TEXT_UTILITY_NOT_COLOR.test(m[1])) return true
    }
    return false
}

function isTextInput(tag) {
    if (/^<(textarea|select)\b/.test(tag)) return true
    if (!/^<input\b/.test(tag)) return false
    return !/type="(checkbox|radio|file)"/.test(tag)
}

/** 編集モードの中でも使う共有部品。置かれる場所を選べないので自分で色を持つ */
const SHARED_IN_EDIT = [
    'app/components/SlotField.vue',
    'app/components/SlotForm.vue',
    'app/components/CountryGrid.vue',
]

/** テンプレート部分だけを取り出す */
function templateOf(text) {
    const start = text.indexOf('<template>')
    if (start < 0) return ''
    const end = text.lastIndexOf('</template>')
    return text.slice(start, end < 0 ? undefined : end)
}

/**
 * そのタグのクラス指定を、**三項演算子の分岐ごとに**切り出す。
 * `class="..."` と `:class="..."` の中の文字列リテラルを別々に返す。
 */
function classLiterals(tag) {
    const out = []
    for (const m of tag.matchAll(/:?class="([^"]*)"/g)) {
        const body = m[1]
        const quoted = [...body.matchAll(/'([^']*)'/g)].map((x) => x[1])
        if (quoted.length) out.push(...quoted)
        else out.push(body)
    }
    return out
}

function walk(dir) {
    const out = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) out.push(...walk(p))
        else if (e.name.endsWith('.vue')) out.push(p)
    }
    return out
}

let problems = 0

function report(rule, file, template, index, tag) {
    // テンプレートの開始位置ぶんを足していないので行番号は目安である
    const line = template.slice(0, index).split('\n').length
    console.log(`★${rule}  ${file}（template ${line} 行目あたり）`)
    console.log(`   ${tag.replace(/\s+/g, ' ').slice(0, 100)}`)
    problems++
}

for (const file of walk('app')) {
    const text = fs.readFileSync(file, 'utf8')
    const key = file.replace(/\\/g, '/')
    const template = templateOf(text)
    if (!template) continue

    /**
     * ルート要素が明るい文字色なら、その木の中は色を継ぐと読めない。
     *
     * **`<template>` 自身をルートと数えてはいけない。** 最初はそう書いていて、
     * `admin.vue` の白い面をわざと壊しても検出できなかった（自己検査で判明）。
     */
    const inner = template.replace(/^<template[^>]*>/, '')
    const rootTag = inner.match(/<[a-zA-Z][^>]*?>/s)?.[0] ?? ''
    const rootIsLightText = LIGHT_TEXT.test(rootTag)
    const shared = SHARED_IN_EDIT.includes(key)

    for (const m of template.matchAll(/<[a-zA-Z][^>]*?\/?>/gs)) {
        const tag = m[0]
        const literals = classLiterals(tag)
        const allClasses = literals.join(' ')

        // 規則 1: 同じ分岐に明るい背景と明るい文字色
        const clash = literals.find((s) => LIGHT_BG.test(s) && LIGHT_TEXT.test(s))
        if (clash) {
            report('明るい背景に明るい文字色', file, template, m.index, tag)
            continue
        }

        const missing = !hasTextColor(allClasses)

        // 規則 2: 明るい文字色を継ぐ木の中
        if (rootIsLightText && (LIGHT_BG.test(allClasses) || isTextInput(tag)) && missing) {
            report('文字色を書いていない（明るい色を継いで読めない）', file, template, m.index, tag)
            continue
        }

        // 規則 3: 共有部品の入力欄
        if (shared && isTextInput(tag) && missing) {
            report('共有部品の入力欄に文字色が無い', file, template, m.index, tag)
        }
    }
}

console.log(problems === 0
    ? '\n色を継いで読めなくなる箇所は無い'
    : `\n${problems} 件。**読めない文字になりうる。**`)
process.exit(problems ? 1 : 0)
