/**
 * ナンバープレートの軸を出典から埋める（AI 未使用、消費 0）。
 *
 * ## なぜ `vehicle` か
 *
 * `npm run coverage` で被覆 0% のまま残っていた 5 欄のうち、
 * **`vehicle` が最も価値が高い。**
 *
 * - **どの地点でも車が写る。** 走行帯と文字に次いで観察機会が多い
 * - **プレートは国が制度で決めている。** 地域差が出にくく、軸として安定する
 * - 色と縞の位置は素人でも見える。「青い帯が左端」は測定を要しない
 *
 * `camera`（Google 車の世代）は後回しにした。人手ワークシート §12 に
 * **「カーメタはほぼ認知できない。脳内で勝手にブラーが掛かる感覚がある」**と
 * 書かれている。**認知できない軸を先に埋めても学習に効かない。**
 *
 * `ground` と `season` は本質的に弱い（土の色や葉の色は国境で切れない）。
 *
 * ## 出典
 *
 * License Plate — Geometas  https://geometas.com/metas/categories/license_plate/
 *
 * Geometas は Plonk It と The Digital Labyrinth を出典として明記している。
 *
 * **必要な軸の分だけを取る。** 一覧を丸ごと写していない。
 * 記述はこちらの語彙に言い換えている（`plain` は素人語である）。
 *
 * 使い方: node tools/add-plate-terms.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const HUMAN_PATH = path.join('data', 'glossary-human.json')
const SRC = 'https://geometas.com/metas/categories/license_plate/'

const countries = new Set(
    JSON.parse(fs.readFileSync(path.join('data', 'countries.json'), 'utf8')).map((c) => c.code),
)

/**
 * 追加する軸。**色と縞の位置で分ける。** 素人が見て言えるものに限る。
 *
 * 「商用車だけ黄色」のような条件つきの軸は入れない。
 * 学習者は写っている車が商用かどうかを判断できないことがある。
 * **判断できない前提を含む軸は、観察の軸にならない。**
 */
const AXES = [
    {
        id: 'ref_plate_yellow_front_and_rear',
        canonical: '前も後ろも黄色いナンバープレート',
        plain: '車の前も後ろもナンバーが黄色い',
        aliases: ['黄色いナンバー（前後）', '前後とも黄色いプレート'],
        codes: ['NL', 'LU', 'IL', 'CX'],
        note: '**強い。** 前後とも黄色い国は少ない。'
            + '後ろだけ黄色い国（イギリス・香港・ケニアなど）と混同しないよう、'
            + '**前を見たかどうかを確認する。**',
        confusableWith: ['ref_plate_yellow_rear_only'],
    },
    {
        id: 'ref_plate_yellow_rear_only',
        canonical: '後ろだけ黄色いナンバープレート',
        plain: '後ろのナンバーが黄色く、前は白い',
        aliases: ['後ろだけ黄色いプレート', 'リアが黄色'],
        codes: ['GB', 'IM', 'HK', 'KE', 'LK', 'UG', 'RW'],
        note: '**強い。** 香港はほぼ正方形、ケニアは後ろが四角、'
            + 'スリランカとルワンダとウガンダは前が白で後ろが黄色。'
            + '**前後の色が違うこと自体が手がかりである。**',
        confusableWith: ['ref_plate_yellow_front_and_rear'],
    },
    {
        id: 'ref_plate_blue_stripes_both_sides',
        canonical: '左右両端に青い縦帯',
        plain: 'ナンバーの左と右の両方に青い縦線がある',
        aliases: ['両端が青いプレート', '青い縦帯が2本'],
        codes: ['IT', 'AL'],
        note: '**非常に強い。2 カ国しかない。**'
            + 'EU 標準は左端だけなので、**右端にもあるかを見る。**'
            + 'アルバニアには左端が赤い別の型もある。',
        confusableWith: ['ref_plate_eu_blue_band'],
    },
    {
        id: 'ref_plate_white_elongated_no_band',
        canonical: '青い帯のない細長い白プレート',
        plain: '横に長くて真っ白なナンバー（青い線がない）',
        aliases: ['真っ白な細長いプレート', '帯なしの白プレート'],
        codes: ['RU', 'IS', 'HR', 'PS'],
        note: '**欧州では珍しく、強い。**'
            + 'ロシアの識別法として最も確実なものの 1 つ。'
            + 'アイスランドも青い帯がない。'
            + 'クロアチアは 2016 年に EU 型へ変えたが、'
            + '**Street View の撮影年が古い区間では旧型の白い長いプレートが残る。**',
    },
    {
        id: 'ref_plate_eu_blue_band',
        canonical: 'EU 式の青い縦帯（左端）',
        plain: 'ナンバーの左端に青い縦の帯がある',
        aliases: ['EUプレート', '左が青いプレート', 'ユーロプレート'],
        codes: [
            'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
            'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
        ],
        note: '**単独では絞れない（EU 加盟国はこの型である）。**'
            + '価値は**無いことが分かったとき**にある。'
            + '欧州の景観で青い帯が無ければ、スイス・アイスランド・アンドラ・'
            + 'ロシア・ウクライナなどへ寄る。'
            + '> **強いのは、あることではなく無いことである。**',
    },
    {
        id: 'ref_plate_black_background',
        canonical: '黒地に白文字のナンバープレート',
        plain: 'ナンバーが黒くて文字が白い',
        aliases: ['黒いプレート', '黒地のナンバー'],
        codes: ['MY', 'TN', 'ID'],
        note: '**強い。** マレーシアは白い文字の塊が 2 つ、'
            + 'インドネシアは黒い区切りで**3 つ**に分かれる。**塊の数で分かれる。**'
            + 'チュニジアは細長い黒プレート。',
    },
    {
        id: 'ref_plate_blue_strip_top',
        canonical: '上端に青い帯（白プレート）',
        plain: '白いナンバーの上のほうに青い帯がある',
        aliases: ['上が青いプレート', 'メルコスール型'],
        codes: ['BR'],
        note: '**非常に強い。1 カ国。**'
            + '2018 年より前のブラジルは真っ白なので、**古い区間では出ない。**'
            + '商用車は赤いプレートで、これも同じ国を示す。',
    },
    {
        id: 'ref_plate_red_stripe_left',
        canonical: '左端に赤い縦帯',
        plain: 'ナンバーの左端に赤い縦線がある',
        aliases: ['左が赤いプレート'],
        codes: ['KG', 'AL', 'IM'],
        note: '**強い。** キルギスの標準型。'
            + 'アルバニアは 2 番目に多い型がこれで、最も多い型は左右が青い。'
            + 'マン島は後ろが黄色いうえに左端が赤い。',
    },
    {
        id: 'ref_plate_yellow_stripe_right',
        canonical: '右端に黄色い縦帯（左端は青）',
        plain: 'ナンバーの右端が黄色く、左端が青い',
        aliases: ['右が黄色いプレート'],
        codes: ['PT'],
        note: '**非常に強い。1 カ国。** EU 式の青い帯に加えて右端が黄色い。'
            + '**両端の色が違うことを見る。**',
    },
    {
        id: 'ref_plate_no_front_plate',
        canonical: '前ナンバーが無い',
        plain: '車の前にナンバープレートが付いていない',
        aliases: ['フロントプレートなし'],
        codes: ['US', 'PR'],
        note: '**アメリカでも地域による。** 南東部からミシガン、'
            + '南部を横切ってアリゾナまでの州で見られる。'
            + '**国全体の性質ではないので、これだけで州を決めない。**'
            + 'プエルトリコも前ナンバーが無い。',
    },
]

const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const terms = Array.isArray(human) ? human : human.terms

console.log('ナンバープレートの軸を出典から追加する（AI 未使用、消費 0）')
console.log('')

let added = 0
for (const axis of AXES) {
    const unique = [...new Set(axis.codes)].sort()
    const kept = unique.filter((c) => countries.has(c))
    const dropped = unique.filter((c) => !countries.has(c))

    console.log(`  ${axis.canonical}`)
    console.log(`      ${kept.length} カ国: ${kept.join(' ')}`)
    if (dropped.length) console.log(`      seed に無いため除外: ${dropped.join(' ')}`)

    if (terms.some((t) => t.id === axis.id)) {
        console.log('      既にある')
        continue
    }
    if (kept.length === 0) {
        console.log('      **seed に該当国が無いので入れない**')
        continue
    }
    terms.push({
        id: axis.id,
        slot: 'vehicle',
        canonical: axis.canonical,
        plain: axis.plain,
        aliases: axis.aliases,
        countries: kept,
        confusableWith: axis.confusableWith ?? [],
        note: axis.note,
        verifiedByHuman: false,
        disputed: false,
        kind: 'atomic',
        // 出典を当たっただけであり、こちらで現地確認していない
        certainty: 'heuristic',
        source: 'reference',
        sources: [SRC],
    })
    added += 1
}

fs.writeFileSync(HUMAN_PATH, `${JSON.stringify(Array.isArray(human) ? terms : human, null, 4)}\n`, 'utf8')
console.log('')
console.log(`追加した用語: ${added} 件（人手記述は ${terms.length} 語になった）`)
console.log('次: node scripts/validate-glossary.mjs && node scripts/build-glossary.mjs && npm run coverage')
