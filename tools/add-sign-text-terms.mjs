/**
 * 看板の文字（通り名の語・停止標識の語）を出典から埋める（AI 未使用、消費 0）。
 *
 * ## `DUR` が正規化されなかったのは辞書の欠落だった
 *
 * トルコの出題で `sign` が働かず、`q-tr-01` は使える欄が 1 個で 78 カ国のまま
 * 止まっていた（`docs/combo-report.md`）。
 *
 * **トルコの停止標識は `DUR` である。1 カ国に落ちる。**
 * 辞書に停止標識の語が 1 つも入っていなかった。
 *
 * > **看板に書かれた語は、最も読みやすくて最も強い。**
 * > それが 1 つも入っていない辞書で「コーチします」とは言えない。
 *
 * ## 通り名の語はバルト三国を割る
 *
 * 人手ワークシート §13 の「バルト三国だと思ったらドイツだった」に対して、
 * **2 系統で割れるようになる。**
 *
 * ```
 * 文字の細部    ė(LT) / 母音の上の横棒(LV) / Õ(EE)
 * 通り名の語    g.(LT) / iela(LV) / tn・-tee(EE)
 * ```
 *
 * **片方が見えなくてももう片方で届く。** それが冗長性である。
 *
 * ## 出典
 *
 * Street Name — Geometas  https://geometas.com/metas/categories/street_name/
 * Stop sign — Wikipedia   https://en.wikipedia.org/wiki/Stop_sign
 * バルト三国の通り名の語:
 *   https://efisha.com/2022/08/15/how-to-tell-baltic-countries-apart-in-geoguessr/
 *   https://addressguard.io/address-format/lithuania/
 *
 * 使い方: node tools/add-sign-text-terms.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const HUMAN_PATH = path.join('data', 'glossary-human.json')
const SRC_NAME = 'https://geometas.com/metas/categories/street_name/'
const SRC_STOP = 'https://en.wikipedia.org/wiki/Stop_sign'
const SRC_BALTIC = 'https://efisha.com/2022/08/15/how-to-tell-baltic-countries-apart-in-geoguessr/'

const countries = new Set(
    JSON.parse(fs.readFileSync(path.join('data', 'countries.json'), 'utf8')).map((c) => c.code),
)

/**
 * 停止標識の語。**読めれば 1〜2 カ国に落ちる最強の軸である。**
 *
 * `STOP` は多くの国が使うため入れない（絞れない）。
 * **絞れないものを入れると、絞れたつもりにさせる。**
 */
const STOP_WORDS = [
    { id: 'ref_sign_stop_dur', canonical: '停止標識に DUR', plain: '八角形の赤い標識に「DUR」と書いてある', aliases: ['DUR', 'ドゥル'], codes: ['TR'], note: '**非常に強い。1 カ国。**トルコの停止標識は `DUR`。**`q-tr-01` はこれが辞書に無かったため 78 カ国のまま止まっていた。**トルコ語の `ş ç ı` と併せると確定に近い。' },
    { id: 'ref_sign_stop_berhenti', canonical: '停止標識に BERHENTI', plain: '赤い標識に「BERHENTI」と書いてある', aliases: ['BERHENTI'], codes: ['MY', 'BN'], note: '**非常に強い。**マレー語の「止まれ」。マレーシアとブルネイ。**インドネシアは `STOP` を使う**ので、マレーシアとインドネシアの見分けに効く（人手ワークシートの `AWAS` と同じ向きの手がかり）。' },
    { id: 'ref_sign_stop_tomare', canonical: '停止標識が逆三角形で「止まれ」', plain: '赤い逆三角形に「止まれ」と書いてある', aliases: ['止まれ', '逆三角形の停止標識'], codes: ['JP'], note: '**非常に強い。1 カ国。**日本の停止標識は**八角形ではなく逆三角形**で、世界的に珍しい。**形だけでも分かる。**' },
    { id: 'ref_sign_stop_ting', canonical: '停止標識に「停」', plain: '赤い標識に「停」と書いてある', aliases: ['停'], codes: ['TW'], note: '**非常に強い。1 カ国。**台湾。中国本土は Street View の被写域が無い。' },
    { id: 'ref_sign_stop_pare', canonical: '停止標識に PARE', plain: '赤い標識に「PARE」と書いてある', aliases: ['PARE'], codes: ['BR', 'AR'], note: '**強い。2 カ国。**ポルトガル語とスペイン語（南米）の一部。**メキシコと中米は `ALTO`** なので、南米か中米かが割れる。' },
    { id: 'ref_sign_stop_alto', canonical: '停止標識に ALTO', plain: '赤い標識に「ALTO」と書いてある', aliases: ['ALTO'], codes: ['MX', 'GT', 'CR', 'PA', 'DO'], note: '**強い。**メキシコと中米。**南米の `PARE` と対になる。**スペイン語圏でも語が違うことが手がかりになる。' },
    { id: 'ref_sign_stop_cyrillic', canonical: '停止標識に СТОП', plain: '赤い標識にキリル文字で「СТОП」と書いてある', aliases: ['СТОП'], codes: ['RU', 'BG', 'RS', 'MK', 'UA', 'KZ', 'KG', 'MN'], note: '**中程度。キリル圏に共通。**ラテン文字の `STOP` ではないことが分かるだけでキリル圏に寄る。**割るのは文字の細部（`і ї є` `ђ ћ` `ѓ ќ` `қ ғ ә`）である。**' },
]

/** 通り名の語。**看板に必ず書いてあるので観察しやすい** */
const STREET_WORDS = [
    { id: 'ref_sign_street_g_lt', canonical: '通り名が「g.」で終わる', plain: '通りの名前のあとに「g.」と書いてある', aliases: ['g.', 'gatvė', 'gatve'], codes: ['LT'], note: '**非常に強い。1 カ国。**リトアニア語 `gatvė`（通り）の略。`pr.` は `prospektas`。**ラトビアは `iela`、エストニアは `tn`。** これで**バルト三国が通り名だけで割れる。**', sources: [SRC_BALTIC] },
    { id: 'ref_sign_street_iela_lv', canonical: '通り名に「iela」', plain: '通りの名前に「iela」と書いてある', aliases: ['iela'], codes: ['LV'], note: '**非常に強い。1 カ国。**ラトビア語の「通り」。**リトアニアは `g.`、エストニアは `tn`。**', sources: [SRC_BALTIC] },
    { id: 'ref_sign_street_tn_ee', canonical: '通り名に「tn」または道が「-tee」で終わる', plain: '通りの名前に「tn」、田舎の道が「-tee」で終わる', aliases: ['tn', 'tänav', '-tee'], codes: ['EE'], note: '**非常に強い。1 カ国。**エストニア語 `tänav`（通り）の略が `tn`。地方の道は `-tee`。**フィンランド語の `-tie` と紛れるので、`Õ` の有無で割る。**', sources: [SRC_BALTIC] },
    { id: 'ref_sign_street_utca_hu', canonical: '通り名に「utca」', plain: '「utca」と書いてある', aliases: ['utca'], codes: ['HU'], note: '**非常に強い。1 カ国。**ハンガリー語の「通り」。`ő ű` と併せると確定に近い。' },
    { id: 'ref_sign_street_ulica_hr', canonical: '通り名に「Ulica」（青地に白文字）', plain: '「Ulica」と書いてある青い標識', aliases: ['Ulica'], codes: ['HR', 'SI', 'RS', 'BA'], note: '**中程度。**クロアチアの標識は**青地に白文字。**`Ulica` はスラブ諸語で広く使われるため、**色と `ć` の有無で割る。**' },
    { id: 'ref_sign_street_ulitsa_bg', canonical: '通り名に「улица」', plain: 'キリル文字で「улица」と書いてある', aliases: ['улица'], codes: ['BG', 'RU', 'MK', 'RS'], note: '**中程度。キリル圏に共通。**ブルガリア語も同じ語。**ウクライナは `вулиця`（略 `вул.`）で違う。**そこが割れ目である。' },
    { id: 'ref_sign_street_vulytsya_ua', canonical: '通り名に「вулиця」または「вул.」', plain: 'キリル文字で「вулиця」か「вул.」と書いてある', aliases: ['вулиця', 'вул.'], codes: ['UA'], note: '**非常に強い。1 カ国。**ウクライナ語の「通り」。**ロシア語・ブルガリア語の `улица` とは語が違う。**人手ワークシート §13 の「ブルガリアとウクライナで迷う」がここで割れる。' },
    { id: 'ref_sign_street_triq_mt', canonical: '通り名に「Triq」', plain: '「Triq」と書いてある', aliases: ['Triq'], codes: ['MT'], note: '**非常に強い。1 カ国。**マルタ語の「通り」。マルタ全土の看板に出る。' },
    { id: 'ref_sign_street_rruga_al', canonical: '通り名に「rruga」', plain: '「rruga」と書いてある', aliases: ['rruga'], codes: ['AL'], note: '**非常に強い。1 カ国。**アルバニア語の「通り」。**ボラードではイタリアと割れないが、ここで割れる。**' },
    { id: 'ref_sign_street_via_it', canonical: '通り名に「VIA」', plain: '「VIA」と書いてある', aliases: ['VIA'], codes: ['IT'], note: '**強い。1 カ国。**イタリア語の「通り」。スイス南部でも見られる。語末が母音になる傾向と併せる。' },
    { id: 'ref_sign_street_rue_fr', canonical: '通り名に「rue」', plain: '「rue」と書いてある', aliases: ['rue'], codes: ['FR', 'BE', 'LU', 'CH'], note: '**中程度。フランス語圏に共通。**ベルギーは**市の名前が標識に入る**ことが多い。スイスはフランス語圏のみ。' },
    { id: 'ref_sign_street_calle_es', canonical: '通り名に「CALLE」', plain: '「CALLE」と書いてある', aliases: ['CALLE'], codes: ['ES', 'MX', 'AR', 'CO', 'PE', 'CL', 'UY', 'BO', 'EC', 'PY', 'CR', 'PA', 'GT', 'DO'], note: '**弱い。スペイン語圏に共通。**単独では絞れない。**停止標識が `PARE` か `ALTO` か**で南米と中米が割れる。' },
    { id: 'ref_sign_street_straat_nl', canonical: '通り名が「straat」「weg」で終わる', plain: '「straat」や「weg」で終わる通りの名前', aliases: ['straat', 'weg'], codes: ['NL', 'CW'], note: '**強い。**オランダ語。`straat` は「通り」、`weg` は「道」。`ij` の並びと併せると確定に近い。' },
    { id: 'ref_sign_street_gatan_se', canonical: '通り名が「...gatan」「...vägen」で終わる', plain: '「gatan」や「vägen」で終わる通りの名前', aliases: ['gatan', 'vägen'], codes: ['SE'], note: '**非常に強い。1 カ国。**スウェーデン語。**ノルウェーは `vei/veien` `gate/gata`、デンマークは `vej` `gade`。**北欧の割り方として文字（`ø æ`）と二重になる。' },
    { id: 'ref_sign_street_vej_dk', canonical: '通り名が「...vej」「...gade」で終わる', plain: '「vej」や「gade」で終わる通りの名前', aliases: ['vej', 'gade'], codes: ['DK'], note: '**非常に強い。1 カ国。**デンマーク語。**ノルウェーは `vei`（i が入る）**で 1 文字違う。' },
    { id: 'ref_sign_street_vei_no', canonical: '通り名が「...vei」「...gate」で終わる', plain: '「vei」「veien」「gate」「gata」で終わる通りの名前', aliases: ['vei', 'veien', 'gate', 'gata'], codes: ['NO'], note: '**非常に強い。1 カ国。**ノルウェー語。**デンマークは `vej`（j）、ノルウェーは `vei`（i）。**人手ワークシート §13 の「ノルウェーとスウェーデンで迷う」がここで割れる。' },
    { id: 'ref_sign_street_katu_fi', canonical: '通り名が「...katu」「...ntie」で終わる', plain: '「katu」や「ntie」で終わる通りの名前', aliases: ['katu', 'ntie', 'tie'], codes: ['FI'], note: '**非常に強い。1 カ国。**フィンランド語。**エストニアの `-tee` と紛れる**ので `Õ` の有無で割る。' },
]

/** 標識の色や形。**語が読めなくても使える** */
const SIGN_STYLE = [
    { id: 'ref_sign_green_white_yellow_numbers', canonical: '緑地・白文字・黄色の道路番号', plain: '緑の看板に白い文字、道路番号が黄色', aliases: ['緑地に黄色い番号'], codes: ['ZA', 'BW', 'LS', 'SZ', 'NA'], note: '**強い。南部アフィリカに共通。**南アフリカは番号が `R M N`、レソトは `A`、エスワティニは `MR` で始まる。**番号の頭文字で割れる。**' },
    { id: 'ref_sign_green_white_border_do', canonical: '緑地に白枠・白文字の通り名標識', plain: '緑の看板に白い枠と白い文字', aliases: ['緑地に白枠'], codes: ['DO'], note: '**強い。1 カ国。**ドミニカ共和国の通り名標識。' },
    { id: 'ref_sign_white_street_sign_au', canonical: '通り名標識が白い', plain: '通りの名前の看板が白い', aliases: ['白い通り名標識'], codes: ['AU'], note: '**中程度。**オーストラリアは白、**ニュージーランドは青か緑。**人手ワークシート §13 の「オーストラリアだと思ったら南アフリカだった」に対しては、南部アフリカが緑地なので割れる。' },
    { id: 'ref_sign_blue_or_green_street_sign_nz', canonical: '通り名標識が青か緑', plain: '通りの名前の看板が青か緑', aliases: ['青い通り名標識', '緑の通り名標識'], codes: ['NZ'], note: '**中程度。1 カ国。**オーストラリアは白。**左側通行で白でなければニュージーランドに寄る。**' },
]

const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const terms = Array.isArray(human) ? human : human.terms

function apply(axes, defaultSource, label) {
    console.log(`## ${label}`)
    let added = 0
    for (const axis of axes) {
        const kept = [...new Set(axis.codes)].sort().filter((c) => countries.has(c))
        const dropped = [...new Set(axis.codes)].sort().filter((c) => !countries.has(c))
        console.log(`  ${String(kept.length).padStart(2)} カ国  ${axis.canonical}`)
        if (dropped.length) console.log(`          seed に無いため除外: ${dropped.join(' ')}`)
        const existing = terms.find((t) => t.id === axis.id)
        if (existing) {
            existing.note = axis.note
            console.log('          既にあるため note を更新した')
            continue
        }
        if (kept.length === 0) {
            console.log('          **seed に該当国が無いので入れない**')
            continue
        }
        terms.push({
            id: axis.id,
            slot: 'sign',
            canonical: axis.canonical,
            plain: axis.plain,
            aliases: axis.aliases,
            countries: kept,
            confusableWith: [],
            note: axis.note,
            verifiedByHuman: false,
            disputed: false,
            kind: 'atomic',
            certainty: 'heuristic',
            source: 'reference',
            sources: axis.sources ?? [defaultSource],
        })
        added += 1
    }
    console.log(`  → 追加 ${added} 件`)
    console.log('')
    return added
}

console.log('看板の文字を出典から追加する（AI 未使用、消費 0）')
console.log('')
const a = apply(STOP_WORDS, SRC_STOP, '停止標識の語')
const b = apply(STREET_WORDS, SRC_NAME, '通り名の語')
const c = apply(SIGN_STYLE, SRC_NAME, '標識の色と形')

fs.writeFileSync(HUMAN_PATH, `${JSON.stringify(Array.isArray(human) ? terms : human, null, 4)}\n`, 'utf8')
console.log(`追加した用語: ${a + b + c} 件（人手記述は ${terms.length} 語になった）`)
console.log('')
console.log('**`STOP` は入れていない。** 多くの国が使うため絞れない。')
console.log('絞れないものを入れると、絞れたつもりにさせる。')
