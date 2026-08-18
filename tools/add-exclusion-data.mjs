/**
 * 否定要素（`excludes`）と勾配（`gradient`）を既存の用語に足す（AI 未使用、消費 0）。
 *
 * ## 引き算は網羅を要求しない
 *
 * 積集合は**網羅でなければ使えない。**「ユーカリがある国」の全部は書けない。
 * 引き算は逆で、**1 カ国について「そこには無い」と分かれば使える。**
 *
 * > **無いと分かっている 1 カ国は、あると分かっている 100 カ国より安い。**
 *
 * 設計書（`docs/offline-works/geo_guessr_reasoning_system.md` §4-6）の
 * 「否定要素を見る。その国にはほぼ存在しないものが出たら候補から外す」である。
 *
 * ## 出典の記述の多くは、実は否定形だった
 *
 * 集めた出典を読み直すと、**強い記述はほとんど否定形で書かれていた。**
 *
 * ```
 * スイスは ß を使わず ss と書く              → ß を見たらスイスは消える
 * 北マケドニアとセルビアはアンテナが無い      → アンテナを見たら両国は消える
 * スイス・アイスランド・アンドラは青い帯が無い → 青い帯を見たら 3 カ国は消える
 * ブルガリア語には固有のキリル字が無い        → 固有字を見たらブルガリアは消える
 * ポーランドの穴は地面まで届かない            → 地面まで届く穴を見たらポーランドは消える
 * アメリカの標識ポールは金属                  → 木製を見たらアメリカは消える
 * ```
 *
 * **同じ記述を、肯定でしか使っていなかった。** 半分捨てていた。
 *
 * 使い方: node tools/add-exclusion-data.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const HUMAN_PATH = path.join('data', 'glossary-human.json')

/** 用語 ID → 除外する国 */
const EXCLUDES = {
    // ß を使う → スイスではない（スイスは ss）
    ref_lang_lat_german: ['CH'],
    // 固有のキリル字が見えた → ロシアとブルガリアは消える（両者に固有字は無い）
    ref_lang_cyr_kazakh_letters: ['RU', 'BG'],
    ref_lang_cyr_ukrainian_letters: ['RU', 'BG'],
    ref_lang_cyr_serbian_letters: ['RU', 'BG'],
    ref_lang_cyr_macedonian_letters: ['RU', 'BG'],
    ref_lang_cyr_shared_lj_nj_dz: ['RU', 'BG'],
    ref_lang_cyr_kyrgyz_mongolian_letters: ['RU', 'BG'],
    // ø æ を使う → スウェーデンとフィンランドは消える
    ref_lang_lat_danish_norwegian: ['SE', 'FI'],
    // ä ö だけで ø æ が無い → デンマークとノルウェーは消える
    ref_lang_lat_swedish: ['DK', 'NO'],
    // ć がある → スロベニアは消える（スロベニア語は Č Š Ž のみ）
    ref_lang_lat_croatian: ['SI'],
    // Ř Ě Ů はチェコだけ → スロバキアは消える。逆も同じ
    ref_lang_lat_czech: ['SK'],
    ref_lang_lat_slovak: ['CZ'],
    // ő ű はハンガリーだけ → 穴あき電柱で並ぶルーマニアは消える
    ref_lang_lat_hungarian: ['RO'],
    ref_lang_lat_romanian: ['HU'],
    // ç ã がある → スペイン語圏ではない
    ref_lang_lat_portuguese_br: ['ES', 'AR', 'UY', 'CL', 'PE', 'CO', 'MX'],
    // EU 式の青い帯が見えた → 帯を持たない国は消える
    // **網羅でない一覧でも、この引き算は正しい**
    ref_plate_eu_blue_band: ['CH', 'IS', 'AD', 'RU', 'GB', 'UA'],
    // 穴が地面まで届く → ポーランドは消える（50cm 上で止まる）
    ref_pole_holey_to_ground: ['PL'],
    // 穴が途中で止まる → ハンガリーとルーマニアは消える
    ref_pole_holey_not_to_ground: ['HU', 'RO'],
    // 木製の標識ポール → アメリカは消える（アメリカは金属）
    ref_sign_post_wooden: ['US'],
    // 左側通行 → 右側通行の国は消える（走行帯は網羅なので積集合でも効くが、
    // **除外としても書いておく。** 学習者に「消せた」と言えるようにするため）
    ref_traffic_side_left: [],
    // Google 車のアンテナが見える → 北マケドニアとセルビアは消える
    ref_camera_stubby_antenna: ['MK', 'RS'],
    ref_camera_red_car_long_antenna: ['MK', 'RS'],
    ref_camera_unique_antenna_panama: ['MK', 'RS'],
    // 下が白いトラック → ヨルダンは消える（ヨルダンは黒）
    ref_camera_white_truck_below: ['JO'],
    // 下が黒い車体 → UAE は消える（UAE は白）
    ref_camera_black_car_below: ['AE'],
    // 前ナンバーが無い → 前後とも付ける国は消える（欧州の大半）
    ref_plate_no_front_plate: ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'PL', 'CZ', 'AT', 'SE'],
}

/**
 * 勾配。**境界ではなく連続変化である。**
 *
 * 設計書 §7。連続変化するものを二値の弁別子として扱うと、
 * **中間の地点で必ず外す。**
 */
const GRADIENTS = {
    ref_camera_bars_visible: {
        axis: 'west_east',
        note: 'モンゴルではバーに黒いゴムが詰まっているかで東西が分かれる'
            + '（詰まっていれば西部かウランバートル）。**境界ではなく傾向である。**',
    },
    ref_flora_hilly_in_nordics: {
        axis: 'north_south',
        note: 'ノルウェーは南北に長く、起伏の強さが連続的に変わる。'
            + '**「起伏があるからノルウェー」ではなく「北欧で平坦でなければノルウェーに寄る」。**',
    },
    ref_pole_three_upward_bulbs: {
        axis: 'north_south',
        note: 'インドネシアでは上端が揃っているか不揃いかが地域で変わる。'
            + '**連続変化なので、揃っていないことを国の否定に使わない。**',
    },
    ref_camera_following_car: {
        axis: 'north_south',
        note: 'チュニジアの伴走車は北部（ハンマメット以北）が明るい緑、'
            + '中南部が濃い緑で車種も違う。**色は連続ではなく切り替わるが、'
            + '境界の近くでは判断できない。**',
    },
    ref_ground_red_soil: {
        axis: 'cold_warm',
        note: '赤い土は熱帯・亜熱帯に広く分布し、**気候帯に沿って濃さが変わる。**'
            + '国境では切れない。',
    },
}

const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const terms = Array.isArray(human) ? human : human.terms
const byId = new Map(terms.map((t) => [t.id, t]))

console.log('否定要素と勾配を足す（AI 未使用、消費 0）')
console.log('')
let ex = 0
let missing = 0
for (const [id, codes] of Object.entries(EXCLUDES)) {
    const term = byId.get(id)
    if (!term) {
        console.log(`  **見つからない: ${id}**`)
        missing += 1
        continue
    }
    if (codes.length === 0) continue
    term.excludes = [...new Set(codes)].sort()
    ex += 1
    console.log(`  ${id.padEnd(38)} → ${term.excludes.length} カ国を除外`)
}
console.log('')
let gr = 0
for (const [id, gradient] of Object.entries(GRADIENTS)) {
    const term = byId.get(id)
    if (!term) {
        console.log(`  **見つからない: ${id}**`)
        missing += 1
        continue
    }
    term.gradient = gradient
    gr += 1
    console.log(`  ${id.padEnd(38)} → 勾配 ${gradient.axis}`)
}

fs.writeFileSync(HUMAN_PATH, `${JSON.stringify(Array.isArray(human) ? terms : human, null, 4)}\n`, 'utf8')
console.log('')
console.log(`否定要素を付けた用語: ${ex} 件 / 勾配を付けた用語: ${gr} 件`)
if (missing) console.log(`**見つからなかった ID: ${missing} 件**`)
console.log('')
console.log('**同じ出典の記述を、肯定でしか使っていなかった。** 半分捨てていた。')
