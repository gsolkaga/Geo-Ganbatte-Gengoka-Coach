/**
 * 連想を「連想」として印を付け、出典の誤りを直す（AI 未使用、消費 0）。
 *
 * ## 検査が自分のデータの誤りを 2 つ見つけた
 *
 * 辞書を 30 → 125 語に広げて `npm run validate:keys` を回したところ、
 * 不整合が 2 件から 6 件に**増えた。**
 *
 * **増えたのは悪いことではない。** 使える用語が増えたので、
 * 検査できる箇所も増えた。**見えていなかったものが見えた。**
 *
 * ### (1) 連想を主張として使っていた
 *
 * ```
 * q-au-01（正解 AU）/ terrain_vegetation  正解を含まない  残り 3 : trees_close_to_road(3)
 * ```
 *
 * `trees_close_to_road` は人手ワークシート §9 の
 * 「道路のすぐ横に木々があると、ブラジル・インドネシア・フィリピンを連想する」
 * である。**「次にどこを考えるか」の記録であり、主張ではない。**
 *
 * 積集合に入れたため、オーストラリアの出題で
 * **積集合が 1 カ国（インドネシア）になった。**
 *
 * > **1 カ国に絞れたことは、正解が分かったことではない。**
 *
 * `exhaustive: false` を付けて絞り込み計算から外す。
 * **語彙の対応づけには使い続ける**（言葉を教えるのは有効である）。
 *
 * ### (2) EU 式の青い帯にトルコが入っていなかった
 *
 * ```
 * q-tr-01（正解 TR）/ vehicle  正解を含まない  残り 27 : ref_plate_eu_blue_band(27)
 * ```
 *
 * **これは私の誤りである。** 「左端に青い縦帯があるか」という事実で作るべき
 * ところを、**EU 加盟国の一覧から作った。** トルコは EU 加盟国ではないが、
 * ナンバープレートの左端に青い帯（`TR` の表記）がある。
 *
 * > **定義を、定義に近い別のもので代用した。**
 *
 * トルコを加え、**「無いこと」で他国を消す用途に限る**ことを note に書く。
 * 非加盟でも独自の青い帯を持つ国があるため、**あることでは絞れない。**
 *
 * 使い方: node tools/mark-associative-terms.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const HUMAN_PATH = path.join('data', 'glossary-human.json')

/**
 * 連想として扱う用語。**人手ワークシートの「〜を連想する」表から来たもの。**
 *
 * ワークシート §17 にこう書いてある。
 *
 * > 本人が「なんとなく」「勘」「雰囲気」と表現しているものを、
 * > 勝手に厳密なルールへ変換しない。
 *
 * **変換していた。** `countries` に国コードが並んでいる形が同じだったため、
 * 主張と区別できなくなっていた。
 */
const ASSOCIATIVE = {
    trees_close_to_road:
        '**連想である。網羅ではない。**人手ワークシート §9 の'
        + '「道路のすぐ横に木々があると、ブラジル・インドネシア・フィリピンを連想する」。'
        + '**木が道路の近くにある国がこの 3 つだけということではない。**'
        + '積集合に入れたため、オーストラリアの出題で積集合が'
        + '**1 カ国（インドネシア）になった**（実測 2026-08-17）。'
        + '絞り込み計算からは外し、**語彙の対応づけと「次にどこを考えるか」には使う。**',
    road_marking_center_yellow:
        '**連想である。網羅ではない。**「中央線が黄色なら、まず北米・南米・アジアを連想する」。'
        + '出典による網羅は `ref_road_marking_center_yellow`（37 カ国）にある。'
        + '**本人の連想 13 カ国と出典の記載 37 カ国は別のものである。**'
        + 'どちらも残し、**絞り込みには網羅の方だけを使う。**',
    road_marking_center_white:
        '**連想である。網羅ではない。**「中央線が白なら、まずヨーロッパを考える」。'
        + '国を挙げられていない（チリだけが書けた）ことが、連想である証拠である。'
        + '出典による網羅は `ref_road_marking_center_white`（85 カ国）にある。',
    pavement_tile_like:
        '**連想である。網羅ではない。**「タイルっぽい路面ならウルグアイを連想する」。'
        + '**タイル状の路面がウルグアイだけということではない。**'
        + 'トルコの出題でこれが 1 カ国の絞り込みとして働いてしまっていた。',
}

const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const terms = Array.isArray(human) ? human : human.terms

console.log('連想に印を付ける（AI 未使用、消費 0）')
console.log('')
let marked = 0
for (const [id, note] of Object.entries(ASSOCIATIVE)) {
    const term = terms.find((t) => t.id === id)
    if (!term) {
        console.log(`  **見つからない: ${id}**`)
        continue
    }
    term.exhaustive = false
    term.note = note
    marked += 1
    console.log(`  ${id}（${term.countries.length} カ国）に exhaustive: false を付けた`)
}

// ============================================================
// EU 式の青い帯にトルコを加える
// ============================================================

const EU_BAND_ID = 'ref_plate_eu_blue_band'
const band = terms.find((t) => t.id === EU_BAND_ID)
console.log('')
if (!band) {
    console.log(`**${EU_BAND_ID} が見つからない**`)
}
else {
    const before = band.countries.length
    if (!band.countries.includes('TR')) band.countries.push('TR')
    band.countries = [...new Set(band.countries)].sort()
    band.note = '**「あること」では絞れない。「無いこと」で消すために使う。**'
        + 'EU 加盟国とトルコのプレートは左端に青い縦帯を持つ。'
        + '**当初 EU 加盟国の一覧だけで作り、トルコが漏れていた**（実測 2026-08-17）。'
        + '「左端に青い帯があるか」という事実で作るべきところを、'
        + '**EU 加盟国という近い別のもので代用していた。**'
        + '欧州の景観で青い帯が無ければ、スイス・アイスランド・アンドラ・'
        + 'ロシア・イギリスなどへ寄る。マルタは混在する。'
        + '**非加盟国が独自の青い帯を持つ場合があるため、この一覧は網羅を保証しない。**'
    // **網羅を保証できない一覧である。** 絞り込みに使わせない
    band.exhaustive = false
    console.log(`  ${EU_BAND_ID}: ${before} → ${band.countries.length} カ国（TR を追加）`)
    console.log('  **exhaustive: false を付けた。** 非加盟国の青い帯を数え切れていない')
}

fs.writeFileSync(HUMAN_PATH, `${JSON.stringify(Array.isArray(human) ? terms : human, null, 4)}\n`, 'utf8')
console.log('')
console.log(`印を付けた用語: ${marked + (band ? 1 : 0)} 件`)
console.log('')
console.log('**連想は消していない。** 絞り込みに使わないだけである。')
console.log('語彙の対応づけと「次にどこを考えるか」には、連想の方が役に立つ。')
