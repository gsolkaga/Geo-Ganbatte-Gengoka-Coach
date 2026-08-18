/**
 * 言語固有の文字を出典から埋める（AI 未使用、消費 0）。
 *
 * ## 読んだ感想が原因を教えた
 *
 * 10 問を v2 で回して添削を読んだ結果は「**回答が薄っぺらい**」だった。
 * 用語が足りないのではなく、**その国を特定するに至る情報が無かった。**
 *
 * 数字がそれを裏づけている。
 *
 * ```
 * q-ru-01  積集合 11 カ国 [BA BG KG KZ MK MN RS RU UA UZ XK]
 * q-bg-01  積集合 11 カ国（同じ集合）
 * ```
 *
 * **キリル文字で 11 カ国に落ちて、そこから先が無い。**
 * `script` は「どの文字体系か」しか持っておらず、
 * **「その文字体系の中のどの言語か」を持っていなかった。**
 *
 * > **体系を当てても国は決まらない。国を決めるのは文字の細部である。**
 *
 * ## 見落としていた手がかりが記録に残っていた
 *
 * `q-kz-01` の学習者はこう書いていた。
 *
 * > キリル文字に見えるが、**K の右下にヒゲが出ている**
 *
 * これはカザフ語の **Қ** である。**カザフスタンをほぼ確定させる観察だった。**
 * 辞書に受け皿が無かったため、`script` は 11 カ国のままだった。
 *
 * > **最強の手がかりが、受け皿が無いために捨てられていた。**
 *
 * ## 出典
 *
 * Language — Geometas  https://geometas.com/metas/categories/language/
 *
 * カザフ語・キルギス語・モンゴル語・ベラルーシ語のキリル固有字は
 * Geometas に項目が無いため Wikipedia を出典にした。
 *
 *   Kazakh alphabets    https://en.wikipedia.org/wiki/Kazakh_alphabets
 *   Cyrillic script     https://en.wikipedia.org/wiki/Cyrillic_script
 *
 * 使い方: node tools/add-language-terms.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const HUMAN_PATH = path.join('data', 'glossary-human.json')
const SRC_LANG = 'https://geometas.com/metas/categories/language/'
const SRC_KZ = 'https://en.wikipedia.org/wiki/Kazakh_alphabets'
const SRC_CYR = 'https://en.wikipedia.org/wiki/Cyrillic_script'

const countries = new Set(
    JSON.parse(fs.readFileSync(path.join('data', 'countries.json'), 'utf8')).map((c) => c.code),
)

/**
 * キリル文字を割る軸。**ここが 11 カ国を 1〜2 カ国にする。**
 *
 * ブルガリア語とロシア語には固有字が無い。**「無いこと」で残す。**
 */
const CYRILLIC = [
    {
        id: 'ref_lang_cyr_kazakh_letters',
        canonical: 'カザフ語固有のキリル字（Қ Ғ Ә Ң Ө Ұ Ү Һ І）',
        plain: 'Kの右下にヒゲが出ている、Гに横棒が付いている、Aが左右反転したような字',
        aliases: ['Кにヒゲ', 'Қ', 'カザフ語の文字', 'ヒゲつきのK'],
        codes: ['KZ'],
        note: '**非常に強い。1 カ国。**`Қ` は K の右下に下向きのヒゲが付く。'
            + '`Ғ` は Г に横棒。`Ә` は A を裏返したような形。'
            + '**`q-kz-01` の学習者は「K の右下にヒゲが出ている」と書いていた。**'
            + 'これを受け取れれば `script` はキリル圏 11 カ国ではなく 1 カ国になる。'
            + '> **最強の手がかりが、受け皿が無いために捨てられていた。**',
        sources: [SRC_KZ],
    },
    {
        id: 'ref_lang_cyr_ukrainian_letters',
        canonical: 'ウクライナ語固有のキリル字（ґ і ї є）',
        plain: '点が1つのi、点が2つのi、逆向きのeが見える',
        aliases: ['і', 'ї', 'є', 'ウクライナ語の文字'],
        codes: ['UA'],
        note: '**非常に強い。1 カ国。**ロシア語には無い。'
            + '`і`（ラテン文字の i と同形）、`ї`（点 2 つ）、`є`（逆向きの e）。'
            + '**ロシア語とベラルーシ語の `э` とは向きが逆である。**',
        sources: [SRC_LANG],
    },
    {
        id: 'ref_lang_cyr_serbian_letters',
        canonical: 'セルビア語固有のキリル字（Ђ ђ Ћ ћ）',
        plain: 'hに横棒が付いたような字、Tに横棒が付いたような字',
        aliases: ['ђ', 'ћ', 'セルビア語の文字'],
        codes: ['RS'],
        note: '**非常に強い。1 カ国。**セルビアはキリルとラテンを併用する。'
            + '`Љ Њ Џ` は**北マケドニアと共有**するので割れない。',
        sources: [SRC_LANG],
    },
    {
        id: 'ref_lang_cyr_macedonian_letters',
        canonical: '北マケドニア語固有のキリル字（Ѓ Ќ）',
        plain: 'Гの上に点、Кの上に点が付いている',
        aliases: ['ѓ', 'ќ', 'マケドニア語の文字'],
        codes: ['MK'],
        note: '**非常に強い。1 カ国。**`Ѓ` と `Ќ` は北マケドニア語に固有。'
            + '道路標識にはラテン文字が併記されるが、他の看板はキリルのみが多い。'
            + '`Љ Њ Џ` は**セルビアと共有**する。',
        sources: [SRC_LANG],
    },
    {
        id: 'ref_lang_cyr_shared_lj_nj_dz',
        canonical: 'セルビア・北マケドニアで共有するキリル字（Љ Њ Џ）',
        plain: 'Лと bがくっついたような字、Hと bがくっついたような字',
        aliases: ['љ', 'њ', 'џ'],
        codes: ['RS', 'MK'],
        note: '**強い。2 カ国。ここでは割れない。**'
            + '割るには `Ђ ћ`（セルビア）か `Ѓ Ќ`（北マケドニア）を探す。'
            + '> **共有する字は、共有していることを教える。**',
        sources: [SRC_LANG],
    },
    {
        id: 'ref_lang_cyr_kyrgyz_mongolian_letters',
        canonical: 'キルギス語・モンゴル語のキリル字（Ң Ө Ү）',
        plain: 'Hに尾が付いた字、Oに横棒、Yのような字',
        aliases: ['ң', 'ө', 'ү'],
        codes: ['KG', 'MN'],
        note: '**強い。2 カ国。**`Ң Ө Ү` はキルギス語とモンゴル語で共有する。'
            + '**カザフ語もこの 3 字を持つ**ので、`Қ Ғ Ә` の有無で割る。'
            + 'キルギスとモンゴルは景観（草原・山）とナンバープレートで割る。',
        sources: [SRC_CYR],
    },
    {
        id: 'ref_lang_cyr_no_unique_letters',
        canonical: '固有字のないキリル文字（ロシア語・ブルガリア語）',
        plain: 'キリル文字だが、変わった形の字が見つからない',
        aliases: ['普通のキリル文字', '固有字なし'],
        codes: ['RU', 'BG'],
        note: '**「無いこと」で 2 カ国まで落ちる。**'
            + 'ブルガリア語には固有のキリル字が無い。ロシア語も同様である。'
            + '**`і ї є ђ ћ ѓ ќ љ њ џ қ ғ ә ң ө ү` のどれも無いことを確認する。**'
            + 'ロシアとブルガリアは他の欄で割る'
            + '（ボラード・ナンバープレート・電柱・標識ポール）。'
            + '人手ワークシート §13 の「ブルガリアとウクライナで迷う」は'
            + '**`і ї є` の有無で割れる。**',
        sources: [SRC_LANG],
    },
]

/** ラテン文字を割る軸。**91 カ国を数カ国にする** */
const LATIN = [
    { id: 'ref_lang_lat_czech', canonical: 'チェコ語固有の字（Ř Ě Ů）', plain: 'rの上にvマーク、eの上にvマーク、uの上に丸', aliases: ['ř', 'ě', 'ů'], codes: ['CZ'], note: '**非常に強い。1 カ国。**`Ř Ě Ů` はチェコ語だけが使う。**スロバキア語は `Ľ Ô Ä Ŕ Ĺ`。**ボラードでは割れなかった 2 国が、ここで割れる。' },
    { id: 'ref_lang_lat_slovak', canonical: 'スロバキア語固有の字（Ľ Ô Ä Ŕ Ĺ）', plain: 'Lにアポストロフィ、oの上に^マーク', aliases: ['ľ', 'ô', 'ŕ'], codes: ['SK'], note: '**非常に強い。1 カ国。**チェコ語と見た目が近いが `Ř Ě Ů` は無い。**ボラード（蛍光オレンジの縞）では割れない 2 国が、ここで割れる。**' },
    { id: 'ref_lang_lat_polish', canonical: 'ポーランド語固有の字（ł ż ś ę ń ó）', plain: 'lに斜線、zの上に点、eの下にしっぽ', aliases: ['ł', 'ż', 'ę'], codes: ['PL'], note: '**非常に強い。1 カ国。**`ł`（斜線つき l）が最も目立つ。z の出現頻度も高い。' },
    { id: 'ref_lang_lat_romanian', canonical: 'ルーマニア語固有の字（ă ș ț）', plain: 'aの上に丸い弧、sとtの下にカンマ', aliases: ['ă', 'ș', 'ț'], codes: ['RO'], note: '**非常に強い。1 カ国。**イタリア語に似た響きだが `ă ș ț` は固有。穴あき電柱（ハンガリーと共有）を割る軸になる。' },
    { id: 'ref_lang_lat_hungarian', canonical: 'ハンガリー語固有の字（ő ű）', plain: 'oやuの上に斜めの二重線', aliases: ['ő', 'ű'], codes: ['HU'], note: '**非常に強い。1 カ国。**`ő ű` は斜めの二重線で、ドイツ語の `ö ü`（点 2 つ）とは違う。**穴あき電柱をルーマニアと割る軸になる。**' },
    { id: 'ref_lang_lat_croatian', canonical: 'クロアチア語固有の字（ć と ž š）', plain: 'cの上にアクセント、zやsの上にvマーク', aliases: ['ć', 'ž', 'š'], codes: ['HR'], note: '**強い。**`ć` があればクロアチア語（またはモンテネグロ語・セルビア語のラテン表記）。`Č Š Ž` だけならスロベニア語も候補。j と z が多い。' },
    { id: 'ref_lang_lat_slovene', canonical: 'スロベニア語の字（Č Š Ž のみ）', plain: 'cとsとzの上にvマークだけがある', aliases: ['č', 'š', 'ž'], codes: ['SI', 'HR', 'ME'], note: '**中程度。3 カ国。**`Č Š Ž` はスロベニア・クロアチア・モンテネグロで共通。**`ć` があればスロベニアではない。**' },
    { id: 'ref_lang_lat_lithuanian', canonical: 'リトアニア語固有の字（ė）', plain: 'eの上に点が1つ', aliases: ['ė'], codes: ['LT'], note: '**非常に強い。1 カ国。**`ė`（点つき e）はリトアニア語固有。`š ž č` はラトビア語と共有する。語尾が `...ai` `...as` になりやすい。' },
    { id: 'ref_lang_lat_latvian', canonical: 'ラトビア語固有の字（ā ē ī ū と ļ ķ ņ）', plain: '母音の上に横棒、文字の下にカンマ', aliases: ['ā', 'ū', 'ļ'], codes: ['LV'], note: '**非常に強い。1 カ国。**母音の上の**横棒**が目印。リトアニア語は点 1 つの `ė`。人手ワークシート §13 の「バルト三国だと思ったらドイツだった」に効く。' },
    { id: 'ref_lang_lat_estonian', canonical: 'エストニア語固有の字（Õ）', plain: 'oの上に波線', aliases: ['õ'], codes: ['EE'], note: '**非常に強い。1 カ国。**`Õ`（波線つき o）はバルト三国でもフィンランド語でも使わない。二重母音と長い語も特徴。' },
    { id: 'ref_lang_lat_icelandic', canonical: 'アイスランド語固有の字（Þ ð）', plain: 'pとbを合わせたような字、dに横棒', aliases: ['þ', 'ð'], codes: ['IS'], note: '**非常に強い。1 カ国。**`Þ`（ソーン）と `ð`（エズ）は他の欧州言語では使わない。' },
    { id: 'ref_lang_lat_danish_norwegian', canonical: 'デンマーク語・ノルウェー語の字（å æ ø）', plain: 'oに斜線、aとeがくっついた字', aliases: ['ø', 'æ', 'å'], codes: ['DK', 'NO'], note: '**強い。2 カ国。ここでは割れない。**スウェーデン語は `ä ö`（点 2 つ）で `æ ø` を使わない。**デンマークとノルウェーは景観（ノルウェーは山地）とボラードで割る。**' },
    { id: 'ref_lang_lat_swedish', canonical: 'スウェーデン語の字（å ä ö）', plain: 'aの上に丸、aとoの上に点2つ', aliases: ['å', 'ä', 'ö'], codes: ['SE', 'FI'], note: '**強い。2 カ国。**`æ ø` が無く `ä ö` があればスウェーデン語かフィンランド語。**フィンランド語は `å` をほとんど使わず、二重母音と非常に長い語が多い。**人手ワークシート §13 の「ノルウェーとスウェーデンで迷う」は `ø æ` の有無で割れる。' },
    { id: 'ref_lang_lat_german', canonical: 'ドイツ語の字（ä ü ö と ß）', plain: 'Bみたいな変な字（ß）、点2つの母音', aliases: ['ß', 'ä', 'ü'], codes: ['DE', 'AT'], note: '**強い。2 カ国。**`ß` があればドイツかオーストリア。**スイスは `ß` を使わず `ss` と書く。**オーストリアはボラード（黒い反射板＋黒い頭）で割れる。' },
    { id: 'ref_lang_lat_swiss_ss', canonical: 'ドイツ語だが ß を使わず ss と書く', plain: 'ドイツ語っぽいのに、あの変な字（ß）が出てこない', aliases: ['ssと書くドイツ語'], codes: ['CH'], note: '**強い。1 カ国。「無いこと」で割る。**スイスは `ß` を使わない。**あることではなく無いことで割る軸である。**ナンバープレートに EU の青い帯が無いことも同じ向きの手がかり。' },
    { id: 'ref_lang_lat_albanian', canonical: 'アルバニア語の字（ç ë と q j k の多さ）', plain: 'eの上に点2つ、qやjやkがたくさん出てくる', aliases: ['ë', 'ç'], codes: ['AL'], note: '**強い。1 カ国。**`ë` と `ç` があり、`q j k` の頻度が高い。**ボラードではイタリアと割れないが、ここで割れる。**' },
    { id: 'ref_lang_lat_turkish', canonical: 'トルコ語の字（ş ç ğ ı İ）', plain: 'sやcの下にしっぽ、点のないi', aliases: ['ş', 'ç', 'ı'], codes: ['TR'], note: '**非常に強い。1 カ国。**`ş` と下にフックの付いた `ç` はトルコをほぼ確定させる。**点のない `ı` も固有。**' },
    { id: 'ref_lang_lat_portuguese_br', canonical: 'ポルトガル語の字（Ç ã と ção）', plain: 'cの下にしっぽ、aの上に波線、「ção」で終わる語', aliases: ['ã', 'ção', 'ç'], codes: ['BR', 'PT'], note: '**強い。2 カ国。**スペイン語には `ç ã` が無い。**ブラジルとポルトガルは他の欄で割る**（ナンバープレートはブラジルが上端に青い帯、ポルトガルは右端が黄色）。' },
    { id: 'ref_lang_lat_dutch', canonical: 'オランダ語の綴り（ij・ee・z と w の多さ）', plain: 'ijが並ぶ、eeのような二重字が多い', aliases: ['ij', 'オランダ語'], codes: ['NL', 'CW'], note: '**強い。**`ij` の並びと二重字（`ee`）、`z` `w` の多さ。キュラソーもオランダ語。' },
    { id: 'ref_lang_lat_italian_vowel_endings', canonical: 'ほとんどの語が母音で終わる（イタリア語）', plain: '単語のおしまいが母音ばかり', aliases: ['イタリア語'], codes: ['IT'], note: '**中程度。**イタリア語は語末が母音になりやすい。スイス南部でも話される。**ボラードではアルバニアと割れないが、語末で割れる。**' },
    { id: 'ref_lang_lat_indonesian_jalan', canonical: '通り名の略記「Jl.」', plain: '看板に「Jl.」と書いてある', aliases: ['Jl.', 'Jalan'], codes: ['ID'], note: '**非常に強い。1 カ国。**`Jl.` は `Jalan`（通り）の略。**インドネシア語とマレー語は見分けにくいが、この略記はインドネシアで多い。**' },
]

const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
const terms = Array.isArray(human) ? human : human.terms

let added = 0
console.log('言語固有の文字を出典から追加する（AI 未使用、消費 0）')
console.log('')
for (const axis of [...CYRILLIC, ...LATIN]) {
    const unique = [...new Set(axis.codes)].sort()
    const kept = unique.filter((c) => countries.has(c))
    const dropped = unique.filter((c) => !countries.has(c))
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
        slot: 'script',
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
        sources: axis.sources ?? [SRC_LANG],
    })
    added += 1
}

fs.writeFileSync(HUMAN_PATH, `${JSON.stringify(Array.isArray(human) ? terms : human, null, 4)}\n`, 'utf8')
console.log('')
console.log(`追加した用語: ${added} 件（人手記述は ${terms.length} 語になった）`)
console.log('')
console.log('**体系を当てても国は決まらない。国を決めるのは文字の細部である。**')
