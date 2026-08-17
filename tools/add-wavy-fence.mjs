/**
 * 波々模様の柵を用語辞書に追加する（1 回だけ実行する。AI 未使用）。
 *
 * ## なぜ追加するか
 *
 * v2 の実測（2026-08-17、`docs/v2-kz.md`）で `gpt-oss` がこう助言した。
 *
 * > 路肩のガードレールが波模様の柵 /
 * > **このデザインは旧ソビエト圏のカザフスタンで頻出し、他の候補国と区別する
 * > 重要な手がかりです**
 *
 * **誤りである。** この柵は旧ソ連圏で広く見られ、
 * ウズベキスタン・キルギス・ウクライナ・ベラルーシにもある。
 * **カザフスタンを他と区別する手がかりにはならない。**
 *
 * ## なぜ AI が断定を作れたか
 *
 * この手がかりは正解タグの `other` に書かれていた。
 * **`other` には辞書の用語が無い**（それが `other` の存在理由である）。
 *
 * 結果として AI には「この地点に写っている」という事実だけが渡り、
 * **該当国の情報が渡らなかった。** そこを自分の知識で埋めた。
 *
 * > **絞り込み力を渡さない手がかりについて、AI は絞り込み力を作る。**
 *
 * ## ベラルーシを入れない理由
 *
 * `data/countries-seed.json`（102 カ国）に `BY` が無い。
 * Google Street View の公式カバレッジがほぼ無いためである。
 * 既存の用語と同じ扱いにする（`road_marking_center_yellow` が
 * 「出典では VE も挙がっているが対象国リストに無いため除いた」としているのと同じ）。
 *
 * 使い方:
 *   node tools/add-wavy-fence.mjs
 *   node scripts/validate-glossary.mjs
 *   node scripts/build-glossary.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const HUMAN_PATH = path.join('data', 'glossary-human.json')
const QUESTIONS_PATH = path.join('data', 'questions.json')

const TERM = {
    id: 'roadside_wavy_fence',
    slot: 'other',
    kind: 'atomic',
    /** プレイヤーの一般知識に基づく。一次情報で確認したわけではない */
    certainty: 'heuristic',
    canonical: '波形模様の路肩柵',
    plain: 'ガードレールが波々の模様になっている柵',
    aliases: ['波模様のフェンス', '波々の柵', 'うねうねしたガードレール'],
    /**
     * **旧ソ連圏で広く見られる。カザフスタン固有ではない。**
     * BY（ベラルーシ）も該当するが countries-seed.json に無いため除いた
     * （Street View の公式カバレッジがほぼ無い）。
     */
    countries: ['KZ', 'UZ', 'KG', 'UA'],
    confusableWith: [],
    note: '**補助メタ。カザフスタン固有ではない。** 旧ソ連圏で広く見られ、'
        + 'UZ・KG・UA にもある（BY も該当するが対象国リストに無いため除いた）。'
        + 'v2 の実測で AI が「KZ で頻出し他の候補国と区別する重要な手がかり」と'
        + '**誤って断定した**ため追加した。**該当国を渡さない手がかりについて、'
        + 'AI は該当国を作る。**',
    verifiedByHuman: true,
    disputed: false,
}

// ---- 用語辞書に追加 ----
const human = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf8'))
if (human.terms.some((t) => t.id === TERM.id)) {
    console.log(`${TERM.id} は既にある。何もしない`)
}
else {
    human.terms.push(TERM)
    fs.writeFileSync(HUMAN_PATH, `${JSON.stringify(human, null, 4)}\n`, 'utf8')
    console.log(`${HUMAN_PATH} に ${TERM.id} を追加した（${human.terms.length} 語）`)
}

// ---- 正解タグに割り当て ----
/**
 * **`other` は正規化の対象外である**（`UNNORMALIZABLE_SLOTS`）。
 * したがって手で割り当てる。
 *
 * これは `other` の設計どおりの流れである。
 * 名前の無い観察が `other` に入り、**名前が付いたら辞書に載る。**
 * ただし現状、学習者が `other` に書いた記述は正規化されないため、
 * **学習者側の `terms` には入らない。** 正解タグ側だけが用語 ID を持つ。
 */
const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'))
const target = questions.find((q) => q.id === 'q-kz-01')
if (!target) {
    console.error('q-kz-01 が無い')
    process.exit(1)
}
const entry = target.slots.other
if (entry.state !== 'visible') {
    console.error(`q-kz-01 の other が ${entry.state} である。visible でないと割り当てられない`)
    process.exit(1)
}
if (entry.terms.includes(TERM.id)) {
    console.log('q-kz-01 の other には既に割り当て済み')
}
else {
    entry.terms.push(TERM.id)
    fs.writeFileSync(QUESTIONS_PATH, `${JSON.stringify(questions, null, 2)}\n`, 'utf8')
    console.log(`q-kz-01 の other に ${TERM.id} を割り当てた（記述: ${entry.plain}）`)
}

console.log('')
console.log('次: node scripts/validate-glossary.mjs → node scripts/build-glossary.mjs')
