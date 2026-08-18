/**
 * 景観・植生・土の軸を出典から埋める（AI 未使用、消費 0）。
 *
 * ## 全部を連想として入れる
 *
 * 出典（Flora）の記述はほぼすべてこの形をしている。
 *
 * ```
 * In Australia, Eucalyptus trees are a prominent feature
 *   → オーストラリアではユーカリをよく見る
 *   ≠  ユーカリがあるのはオーストラリアだけ
 * ```
 *
 * ユーカリはポルトガル・スペイン・カリフォルニア・エチオピアにもある。
 * **網羅として入れると、`trees_close_to_road` と同じ誤りを繰り返す**
 * （オーストラリアの出題で積集合が 1 カ国（インドネシア）になった件）。
 *
 * > **自然の特徴は国境で切れない。制度で決まる人工物だけが網羅になる。**
 *
 * したがって `exhaustive: false` を付ける。**絞り込み計算には使わない。**
 *
 * ## それでも入れる理由
 *
 * 連想は 2 つの用途で効く。
 *
 * | 用途 | 効くか |
 * |---|---|
 * | 積集合・絞り込み力 | **使わない** |
 * | 素人語 → 用語の対応づけ | **効く。「ユーカリの木だらけ」に名前が付く** |
 * | 「次にどこを考えるか」 | **効く。それが元の目的である** |
 *
 * 監査（2026-08-17）で `gpt-oss` が「ユーカリの木だらけ」を
 * `terrain_vegetation`（欄の名前）に対応づけ、辞書に無い用語として落とされた。
 * **観察は正しく、辞書に受け皿が無かっただけである。**
 *
 * ## この追加は掛け合わせの問題を解かない
 *
 * `docs/combo-report.md` の実測で 10 問中 4 問しか正解に届いていない。
 * **その原因は景観の欄では埋まらない。** 埋まるのは制度で決まる欄である
 * （標識・ボラード・ナンバープレート・電柱・路面標示・走行帯・文字）。
 *
 * 出典の残りで人工物にあたるのは Street Sign（111）・Street Name（22）・
 * Guardrails（6）・Milestone Markers（17）である。**次はそこを取る。**
 *
 * 出典: Flora — Geometas  https://geometas.com/metas/categories/flora/
 *
 * 使い方: node tools/add-flora-terms.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const HUMAN_PATH = path.join('data', 'glossary-human.json')
const SRC = 'https://geometas.com/metas/categories/flora/'

const countries = new Set(
    JSON.parse(fs.readFileSync(path.join('data', 'countries.json'), 'utf8')).map((c) => c.code),
)

const ASSOC = '**連想である。網羅ではない。**絞り込み計算には使わない。'

const AXES = [
    { slot: 'terrain_vegetation', id: 'ref_flora_eucalyptus', canonical: 'ユーカリ（背が高く樹皮が白い木）', plain: 'ユーカリの木だらけ', aliases: ['ユーカリ', '白い幹の高い木'], codes: ['AU'], note: `${ASSOC}オーストラリアで目立つ。**ポルトガル・スペイン・カリフォルニア・エチオピアにもある。**監査で「ユーカリの木だらけ」が辞書に無い用語として落とされた。受け皿として置く。` },
    { slot: 'terrain_vegetation', id: 'ref_flora_fern_forest', canonical: '森にシダが生えている', plain: '森の中にシダが生えている', aliases: ['シダ', '羊歯'], codes: ['NZ'], note: `${ASSOC}ニュージーランドの森でよく見る。` },
    { slot: 'terrain_vegetation', id: 'ref_flora_white_painted_trunk', canonical: '木の幹の根元が白く塗られている', plain: '木の根元が白く塗られている', aliases: ['幹が白い', '根元が白い木'], codes: ['UA'], note: `${ASSOC}ウクライナでよく見る。**旧ソ連圏に広く見られる習慣**であり、ウクライナ限定ではない。電柱の根元が白いのとは別の軸。` },
    { slot: 'terrain_vegetation', id: 'ref_flora_grass_only_no_trees', canonical: '草しかなく樹木がない', plain: '草だけで木が生えていない', aliases: ['木がない', '草だけ'], codes: ['IS'], note: `${ASSOC}アイスランド。道は平坦で、遠くに丘や山が見える。**グリーンランド・フェロー諸島・北ノルウェーにも似た景観がある。**` },
    { slot: 'terrain_vegetation', id: 'ref_flora_bare_tabletop_mountains', canonical: '樹木のないテーブル状の山', plain: '木が生えていない、頭が平らな山', aliases: ['テーブルマウンテン', '禿げた山'], codes: ['LS'], note: `${ASSOC}レソト。水平の岩の稜線が特徴で、草が短い。` },
    { slot: 'terrain_vegetation', id: 'ref_flora_tall_forested_mountains', canonical: '高い山が木で覆われている', plain: '高い山が木でびっしり覆われている', aliases: ['森に覆われた高い山'], codes: ['BT'], note: `${ASSOC}ブータンは GeoGuessr で最も山がちな国とされる。**ネパール・スイス・コロンビアにも似た景観がある。**` },
    { slot: 'terrain_vegetation', id: 'ref_flora_hilly_in_nordics', canonical: '北欧で起伏や山が多い', plain: '北欧っぽいのに山や起伏が多い', aliases: ['北欧の山地'], codes: ['NO'], note: `${ASSOC}ノルウェーは他の北欧諸国が平坦なのに対して山がち。**人手ワークシート §13 の「ノルウェーとスウェーデンで迷う」に効く連想である。**` },
    { slot: 'terrain_vegetation', id: 'ref_flora_palm_tropical_dirt', canonical: 'ヤシの木＋濃い緑＋土が見える', plain: 'ヤシの木があって緑が濃く、土が見えている', aliases: ['熱帯の景観', 'ヤシと土'], codes: ['TH', 'LK'], note: `${ASSOC}タイとスリランカ。**スリランカは赤みの土**を伴うことが多い。東南アジア全域に似た景観がある。` },
    { slot: 'terrain_vegetation', id: 'ref_flora_palm_mediterranean', canonical: 'ヤシの木＋白い地中海風の建物', plain: 'ヤシの木と白い建物、空が青い', aliases: ['地中海の景観'], codes: ['TN'], note: `${ASSOC}チュニジア。中東風の要素が混ざる。**地中海沿岸全域に似た景観がある。**` },
    { slot: 'terrain_vegetation', id: 'ref_flora_open_grassland_gentle_hills', canonical: '開けた草地とゆるやかな丘', plain: '広い草地でゆるい丘が続く', aliases: ['草原とゆるい丘'], codes: ['UY', 'LU'], note: `${ASSOC}ウルグアイは曇りが多く道路の状態が周辺国より悪い。ルクセンブルクは平地が少なく緑の草地が多い。**大陸をまたぐので単独では使えない。**` },
    { slot: 'terrain_vegetation', id: 'ref_flora_rock_walls_low_vegetation', canonical: '岩の塀と低い植生', plain: '石を積んだ塀があって、背の低い草しかない', aliases: ['岩の塀'], codes: ['MT'], note: `${ASSOC}マルタ。景観の要素がすべて地面に近い。**人手ワークシート §5 のイギリスの石垣とは別の軸。**` },
    { slot: 'terrain_vegetation', id: 'ref_flora_cabbage_like_plants', canonical: 'キャベツのような植生', plain: 'キャベツみたいな植物が生えている', aliases: ['キャベツ状の植生'], codes: ['JP'], note: `${ASSOC}日本の北海道（と時に東北）で見られる。**国ではなく地域の手がかりであり、リージョンゲスは対象外である。**` },
    { slot: 'terrain_vegetation', id: 'ref_flora_green_hilly_with_trees', canonical: '緑が濃く丘が多く木が見える', plain: '緑が濃くて丘が多い', aliases: ['緑の丘'], codes: ['SZ'], note: `${ASSOC}エスワティニ。南部アフリカの他国と景観が似るため、**ボラードや電柱で割る。**` },
    { slot: 'ground', id: 'ref_ground_red_soil', canonical: '赤い土', plain: '土が赤い', aliases: ['赤土', '赤茶色の土'], codes: ['BR', 'UG', 'LK', 'ZA'], note: `${ASSOC}ブラジル（北部・ゴイアスなど）、ウガンダ、スリランカ、南アフリカ。**熱帯・亜熱帯に広く分布するため単独では絞れない。**通行帯や文字と掛けて使う。` },
]

const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const terms = Array.isArray(human) ? human : human.terms

console.log('景観・植生・土の軸を出典から追加する（AI 未使用、消費 0）')
console.log('**すべて連想として入れる。絞り込み計算には使わない。**')
console.log('')
let added = 0
for (const axis of AXES) {
    const kept = [...new Set(axis.codes)].sort().filter((c) => countries.has(c))
    console.log(`  ${axis.slot.padEnd(19)} ${String(kept.length).padStart(2)} カ国  ${axis.canonical}`)
    const existing = terms.find((t) => t.id === axis.id)
    if (existing) {
        existing.note = axis.note
        existing.exhaustive = false
        console.log('          既にあるため note を更新した')
        continue
    }
    if (kept.length === 0) {
        console.log('          **seed に該当国が無いので入れない**')
        continue
    }
    terms.push({
        id: axis.id,
        slot: axis.slot,
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
        // **自然の特徴は国境で切れない。** 網羅にしない
        exhaustive: false,
        sources: [SRC],
    })
    added += 1
}

fs.writeFileSync(HUMAN_PATH, `${JSON.stringify(Array.isArray(human) ? terms : human, null, 4)}\n`, 'utf8')
console.log('')
console.log(`追加した用語: ${added} 件（人手記述は ${terms.length} 語になった）`)
console.log('')
console.log('**この追加は掛け合わせの問題を解かない。**')
console.log('自然の特徴は国境で切れない。制度で決まる人工物だけが網羅になる。')
console.log('次に取るのは Street Sign / Street Name / Guardrails / Milestone Markers である。')
