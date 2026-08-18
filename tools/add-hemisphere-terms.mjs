/**
 * 太陽の位置から半球を出す用語を足す（AI 未使用、消費 0）。
 *
 * ## 出典が要らない軸がある
 *
 * ここまで辞書は GeoGuessr の攻略資料から埋めてきた。しかし
 * **正午の太陽がどちら側に見えるかは、緯度だけで決まる事実である。**
 * 攻略資料を参照する必要がない。
 *
 * 正解タグには既に記述があった（実測、`docs/combo-report.md`）。
 *
 *   q-za-01 [easy] 太陽が北から照っている
 *   q-au-01 [easy] 木の陰が北側に出ている
 *   q-br-01 [easy] 影が無いのでほぼ真上に太陽がある
 *
 * **用語が無いために 1 つも拾われていなかった。**
 *
 * ## 「影が北側」は日本語として二通りに読める
 *
 * 最初の版では用語 ID を影の向きで付けた（`ref_sun_shadow_to_north` など）。
 * そして「木の陰が北側に出ている」を「影が北へ伸びる」と読んで
 * **太陽が南＝北半球側の用語に別名として入れた。**
 *
 * 著者の意図は逆だった（2026-08-18 の指摘）。
 *
 * ```
 * 木の陰が北側から（太陽がさして）影が出ている
 *   → 日差しが北から来ている → 太陽が北 → 南半球側
 * ```
 *
 * オーストラリアの出題に**北半球側の用語が付いた。**
 * `excludes` の検出をすり抜けたのは、AU を熱帯側に分類していたためである。
 * つまり**保守的な分類が正解を守り、同時に誤りを隠していた。**
 *
 * > **曖昧な言葉に別名を付けるとき、どちらに付けたかは記録に残らない。**
 *
 * 直し方は 2 つある。
 *
 * 1. **用語 ID と素人語を「太陽の位置」だけで書く。** 影の向きを主語にしない
 * 2. 曖昧な言い回しは、著者の意図した側にだけ別名として置き、note に理由を書く
 *
 * ## 言及の有無は弱い推測にしかならない
 *
 * 同じ指摘で出た話（2026-08-18）。
 *
 * > わざわざ北半球であると言及する北半球住みの人間は少ないと思います。
 * > 太陽や影に言及していたら南半球であるくらいのゆるい判定でも良いかもしれません。
 * > あくまで弱い推測ですので、違っていても AU を削って良い理由にはなりにくいです。
 *
 * 非対称である。
 *
 * ```
 * 言及なし  「影が判別できない」か「北半球」のどちらか → **情報にならない**
 * 言及あり  南半球かもしれない                        → **弱い推測**
 * ```
 *
 * **無言は情報にならないが、言及は弱い情報になる。**
 * そして弱い情報で候補を消してはならない。
 *
 * したがってこれは用語にしない。そもそも用語にできない。
 * 用語は「見えたもの」を国に対応させる仕組みであり、
 * **「その人が言及したこと」は見えたものではない。**
 * `note` に書いて AI の説明材料にするだけにとどめる。
 *
 * 学習者の居住地にも依存する。南半球在住の学習者では逆になる。
 * `recognition`（視認可能性）を計算せず人手で記録すると決めたのと同じ線引きである。
 *
 * > **観察者の性質を、地点の性質として使ってはならない。**
 *
 * ## 方位そのものは強い。だから読み違えが高くつく
 *
 * 言及の有無は弱いが、**実際に方位を読めたなら結論は強い。**
 * `ref_sun_from_north` は温帯の北半球 56 カ国を一度に消す。
 *
 * 強いものは、外したときの損害も大きい。今回それが起きた。
 * `note` に「使う前に方位を確かめること」を書いた。
 */
import fs from 'node:fs'

const HUMAN_PATH = 'data/glossary-human.json'
const QUESTIONS_PATH = 'data/questions.json'

/** 全域が北緯 23.44 度より北。正午の太陽は必ず南側 */
const TEMPERATE_NORTH = [
    'NO', 'SE', 'FI', 'IS', 'DK', 'IE', 'GB', 'NL', 'FR', 'BE',
    'LU', 'DE', 'CH', 'AT', 'IT', 'ES', 'PT', 'AD', 'MT', 'PL',
    'CZ', 'SK', 'HU', 'SI', 'HR', 'BA', 'ME', 'XK', 'AL', 'RO',
    'RS', 'MK', 'BG', 'UA', 'EE', 'LV', 'LT', 'GR', 'CY', 'RU',
    'KZ', 'KG', 'MN', 'UZ', 'GE', 'TR', 'IL', 'LB', 'JO', 'QA',
    'TN', 'NP', 'BT', 'KR', 'JP', 'CA',
]

/** 全域が南緯 23.44 度より南。正午の太陽は必ず北側 */
const TEMPERATE_SOUTH = ['LS', 'SZ', 'NZ', 'UY']

const all = JSON.parse(fs.readFileSync('data/countries.json', 'utf8'))
const codes = (Array.isArray(all) ? all : all.countries).map((c) => c.code)
const poleward = new Set([...TEMPERATE_NORTH, ...TEMPERATE_SOUTH])
/** 国境の一部でも回帰線の間に入る国。**両方のリストに入れる** */
const TROPICAL = codes.filter((c) => !poleward.has(c))

const NOTE_TROPICS = '南北回帰線の間にある国は季節によって太陽が両側に来るため、'
    + '**両方の用語に含めている**。消してはいけない国を消さない側に寄せた。'

const NOTE_OBSERVER = '**言及の有無は弱い推測にしかならない。** 北半球在住の学習者は'
    + '「太陽が南」を既定として持つため、わざわざ北半球だと書く人は少ない。'
    + 'したがって【言及なし】は「影が判別できない」か「北半球」のどちらかであり、'
    + '**情報にならない。** 【言及あり】は南半球かもしれないという程度である。'
    + '**これを理由に候補を消してはならない。** 学習者の居住地にも依存する。'
    + '観察者の性質を地点の性質として使ってはならない。'

const NOTE_DIRECTION_RISK = '**使う前に方位を確かめること。**'
    + '方位を読み違えると、この用語は候補を大きく誤って消す。'
    + '実際に「木の陰が北側に出ている」が逆に解釈され、'
    + 'オーストラリアの出題で南半球の国が落ちた（2026-08-18）。'

/** 影の向きで名付けた旧 ID。**太陽の位置で名付け直す** */
const RENAMES = {
    ref_sun_shadow_to_south: 'ref_sun_from_north',
    ref_sun_shadow_to_north: 'ref_sun_from_south',
}

const NEW = [
    {
        id: 'ref_sun_from_north',
        slot: 'season',
        canonical: '正午の太陽が北の空にある（影は南へ落ちる）',
        plain: '真昼の日差しが北から来ている。太陽が北の空に見える',
        aliases: [
            '太陽が北から照っている',
            '日差しが北から来る',
            '北から光が当たっている',
            // **著者の意図はこちらである**（2026-08-18 の指摘）。
            // 「北側から日が差して影ができている」の意味で書かれていた
            '木の陰が北側に出ている',
            '南半球の日差し',
        ],
        countries: [...TEMPERATE_SOUTH, ...TROPICAL].sort(),
        confusableWith: ['ref_sun_from_south'],
        note: '**天文の事実であり出典を要しない。** 温帯の南半球では正午の太陽が必ず北側にある。'
            + `温帯の北半球 ${TEMPERATE_NORTH.length} カ国を一度に消せる。`
            + '**「影が北側に出ている」という言い回しはここに入れる。**'
            + '「北側から日が差して影ができている」の意味で書かれるためである。'
            + NOTE_TROPICS + NOTE_DIRECTION_RISK + NOTE_OBSERVER,
        verifiedByHuman: true,
        disputed: false,
        kind: 'atomic',
        certainty: 'verified',
        source: 'reference',
        exhaustive: true,
        // **引き算は網羅を要求しない。** 温帯の北半球は確実に消せる
        excludes: [...TEMPERATE_NORTH].sort(),
        sources: ['https://en.wikipedia.org/wiki/Tropic_of_Capricorn'],
    },
    {
        id: 'ref_sun_from_south',
        slot: 'season',
        canonical: '正午の太陽が南の空にある（影は北へ落ちる）',
        plain: '真昼の日差しが南から来ている。太陽が南の空に見える',
        aliases: [
            '太陽が南から照っている',
            '日差しが南から来る',
            '南から光が当たっている',
            '北半球の日差し',
        ],
        countries: [...TEMPERATE_NORTH, ...TROPICAL].sort(),
        confusableWith: ['ref_sun_from_north'],
        note: '**98 / 102 カ国に該当し、単独では絞り込みに使えない。**'
            + 'それが正しい結果である。北半球の方が国の数が多いため、'
            + '「太陽が南」は「太陽が北」ほど情報を持たない。'
            + '温帯の南半球 4 カ国を消せることだけが成果である。'
            + '**「影が北側」という言い回しはここに入れない**（`ref_sun_from_north` を見よ）。'
            + NOTE_TROPICS + NOTE_DIRECTION_RISK + NOTE_OBSERVER,
        verifiedByHuman: true,
        disputed: false,
        kind: 'atomic',
        certainty: 'verified',
        source: 'reference',
        exhaustive: true,
        excludes: [...TEMPERATE_SOUTH].sort(),
        sources: ['https://en.wikipedia.org/wiki/Tropic_of_Cancer'],
    },
    {
        id: 'ref_sun_overhead_no_shadow',
        slot: 'season',
        canonical: '正午に影がほぼ真下（太陽がほぼ真上）',
        plain: '真昼に影がほとんど出ない。太陽がほぼ真上にある',
        aliases: ['影が無い', '太陽がほぼ真上', '影がほぼ真下'],
        countries: [...TROPICAL].sort(),
        confusableWith: ['ref_sun_from_north', 'ref_sun_from_south'],
        note: '**回帰線の間にしか起こらない。** 太陽が天頂を通るのは緯度が ±23.44 度以内の場所だけである。'
            + `温帯 ${TEMPERATE_NORTH.length + TEMPERATE_SOUTH.length} カ国を一度に消せる。`
            + '**ただし年に 2 日しか厳密には成立しない。** 「ほぼ真上」の判断は幅を持つ。',
        verifiedByHuman: true,
        disputed: false,
        kind: 'atomic',
        certainty: 'verified',
        source: 'reference',
        exhaustive: true,
        excludes: [...TEMPERATE_NORTH, ...TEMPERATE_SOUTH].sort(),
        gradient: {
            axis: 'north_south',
            note: '回帰線に近づくほど「真上」になる期間が短くなり、赤道では年 2 回ある。'
                + '影の長さは連続量であり、見えた／見えないで切ってはならない',
        },
        sources: ['https://en.wikipedia.org/wiki/Subsolar_point'],
    },
]

// ============================================================
// 辞書を書き換える
// ============================================================

const doc = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const newIds = new Set(NEW.map((t) => t.id))
const oldIds = new Set(Object.keys(RENAMES))
// 旧 ID と新 ID を両方落としてから入れ直す。**書き足しではなく置き換えである**
const before = doc.terms.length
doc.terms = doc.terms.filter((t) => !newIds.has(t.id) && !oldIds.has(t.id))
const dropped = before - doc.terms.length
doc.terms.push(...NEW)
fs.writeFileSync(HUMAN_PATH, `${JSON.stringify(doc, null, 4)}\n`, 'utf8')

console.log(`辞書: 落とした ${dropped} 件 / 入れた ${NEW.length} 件 → ${HUMAN_PATH}`)
console.log('')

// ============================================================
// 正解タグの旧 ID を貼り替える
// ============================================================

const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'))
let renamed = 0
for (const q of questions) {
    for (const entry of Object.values(q.slots ?? {})) {
        entry.terms = (entry.terms ?? []).map((id) => {
            if (!RENAMES[id]) return id
            console.log(`  ${q.id}: ${id} → ${RENAMES[id]}`)
            renamed++
            return RENAMES[id]
        })
    }
}

/**
 * **著者の意図に合わせて q-au-01 を直す。**
 *
 * 正規化は「木の陰が北側に出ている」を影の向きと読み、北半球側の用語を付けた。
 * 著者の意図は「北側から日が差している」= 南半球側である。
 *
 * 別名を移したので次回の正規化では正しく付く。
 * **ただし今の正解タグは直らない。** 用語の書き方を直したのだから、
 * 記録もその書き方の下での正解に合わせる。
 */
const FORCE = { 'q-au-01': { season: 'ref_sun_from_north', wrong: 'ref_sun_from_south' } }
let forced = 0
for (const q of questions) {
    const fix = FORCE[q.id]
    if (!fix) continue
    const entry = q.slots?.season
    if (!entry) continue
    const had = entry.terms.includes(fix.wrong)
    entry.terms = entry.terms.filter((id) => id !== fix.wrong)
    if (!entry.terms.includes(fix.season)) entry.terms.push(fix.season)
    if (had) {
        console.log(`  ${q.id}: ${fix.wrong} を外して ${fix.season} に差し替えた（著者の意図）`)
        forced++
    }
}

fs.writeFileSync(QUESTIONS_PATH, `${JSON.stringify(questions, null, 4)}\n`, 'utf8')

console.log('')
console.log(`温帯の北半球 ${TEMPERATE_NORTH.length} / 温帯の南半球 ${TEMPERATE_SOUTH.length} / 熱帯・赤道跨ぎ ${TROPICAL.length}`)
console.log(`合計 ${TEMPERATE_NORTH.length + TEMPERATE_SOUTH.length + TROPICAL.length} = 辞書の国数 ${codes.length}`)
console.log('')
for (const t of NEW) console.log(`${t.id.padEnd(28)} 該当 ${String(t.countries.length).padStart(3)} カ国 / 除外 ${t.excludes.length} カ国`)
console.log('')
console.log(`正解タグの ID 貼り替え: ${renamed} 件 / 意図に合わせた差し替え: ${forced} 件`)
console.log('次: node scripts/build-glossary.mjs ; node tools/combo-report.mjs')
