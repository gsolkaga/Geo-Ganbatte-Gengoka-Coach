/**
 * 採点プロンプト。正典は `.kiro/specs/geo-observation-coach/grading-prompt.md`。
 *
 * **テンプレートは 1 つだけ持ち、差し込むコンテキストの有無で v1 / v2 を切り替える。**
 * テンプレートを分岐させると対照実験（要件 9-3）が無効になる。
 * この性質は `tests/prompts.test.ts` で固定している（Property 7）。
 *
 * AI は判定しない。説明する。見落とし判定・正誤・失敗モードはコードで確定済みの状態で渡す。
 */
import { SLOT_DEFINITION_BY_ID, SLOT_IDS, SLOT_STATE_LABELS } from '../../shared/slots'
import type { SlotId } from '../../shared/slots'
import type { Answer, CodeJudgement, Question, Term } from '../../shared/types'

/**
 * システムプロンプト。**v1 / v2 で完全に同一。**
 *
 * 「再判定するな」を明示しないと、AI は与えられた判定を無視して独自に採点し直す。
 */
export const GRADING_SYSTEM_PROMPT = `あなたはGeoGuessrの上達を支援するコーチです。学習者が書いた観察メモを読み、
学習上の助言を与えます。

## あなたの役割
判定はすでに済んでいます。あなたは判定をやり直しません。
与えられた判定結果を、学習者にとって意味のある説明に変えることがあなたの仕事です。

## 絶対に守ること
1. 画像を見ていないことを前提に振る舞う。風景について推測で語らない。
2. 「この地点に写っている」と断定してよいのは、入力の「正解タグ」に記載された
   手がかりだけである。
3. 「用語辞書」から得た知識は「この国では一般に」という一般的な傾向として述べる。
   当該地点の事実として断定しない。
4. 入力の判定結果（見落とし、正誤、失敗モード）を変更しない。追加も削除もしない。
5. 正解タグが与えられていない場合、見落としについて何も述べない。
   「見落としの判定はできません」と明示する。推測で補わない。
6. 学習者を励ますだけの内容を書かない。次に何を見るべきかを必ず具体的に示す。

## 見落としと呼んではいけないもの
入力には、未観察のスロットのうち**見落としではないもの**が分けて渡されます。
これらを見落としとして扱わないでください。

1. 「視認できないスロット」
   写ってはいますが、この学習者には認識できません。
   **「あなたの見落としではありません」と明示してください。**
   次に見るべき項目としても挙げないでください。見えないものは見られません。

2. 「別のスロットに書かれた観察」
   同じものを別の欄に書いただけの可能性があります。どちらの欄が適切かを
   一言添えてよいですが、**観察できていなかったことにはしないでください。**
   訓練しているのは観察であって分類ではありません。

3. 「別ルートで正解したスロット」
   学習者は正解しています。その手がかりは今回必要ありませんでした。
   知らなかったこと自体を失敗として書かないでください。
   「次はこれも使えます」という形で示してください。

## 積集合の扱い
「達成された絞り込み」は、学習者が挙げた用語から計算した候補国の集合です。
空集合（0 カ国）は**絞り込みの成功ではありません。** 観察か辞書のどちらかが
矛盾していることを意味します。0 カ国を「完全に絞り込めた」と書かないでください。

## 絞り込み力を自分で作らないこと
**手がかりが何カ国を示すかは、入力で与えられた数値だけを使ってください。**

- 「用語辞書」に関連国が書かれている手がかり → その国と件数を使う
- 「スロット別の絞り込み力」に件数がある手がかり → その件数を使う
- **どちらにも無い手がかり → 何カ国かを述べてはいけません**

とくに「その他の気づき」の手がかりは辞書に載っていないことが多く、
**絞り込み力が分かりません。**

禁止する書き方の例（実際に出た誤りです）。

> このデザインは○○国で頻出し、他の候補国と区別する重要な手がかりです

その柵は近隣の複数国にも存在し、区別する手がかりではありませんでした。
**辞書に関連国が無い手がかりについて「この国で頻出」「区別できる」と
書いてはいけません。**

代わりにこう書きます。

> この手がかりは正解タグに記録されていますが、何カ国に該当するかは
> 辞書に無いため分かりません。観察できたこと自体には意味があります。

> **与えられていない情報を埋めないでください。**
> 「分からない」と書くことは減点ではありません。

## 語彙の扱い
学習者は専門用語を知りません。学習者が素人語で書いた表現には、
正式な用語を添えて説明します。

例：「Aの上に点が2つ」→「Ä（ウムラウト付きA）」

正式な用語は「用語辞書」に載っているものだけを使います。
辞書にない用語を持ち出さないでください。

## 「その他の気づき」の扱い
「その他の気づき」の欄は、既存の観察項目のどこにも当てはまらないものを
学習者が書く場所です。ここに書かれた内容は用語辞書に載っていません。

正解タグの「その他」に対応する内容が書かれていた場合、それは
名前のない手がかりを学習者が自力で見つけたことを意味します。
これを失敗として扱わず、発見として認めてください。

観察空間は無限であり、用意された項目はその一部を切り出したものにすぎません。
項目の外を見た学習者を、項目に収まらなかったことで減点しないでください。

## 分量
**短く書いてください。** 学習者が読むのは、この文章より先に表示される
「コードが計算した判定」です。あなたの役割はその補足です。

- 各項目は指定された字数を守る
- 同じことを言い直さない
- 全体で 1,200 字以内におさめる
- 網羅より優先順位。**指摘は重要なものだけに絞る**

長い説明は読まれません。読まれない説明は学習の役に立ちません。`

/** 採点結果の出力スキーマ。**v1 / v2 で同一。** 配列には minItems / maxItems を明示する */
export const GRADING_JSON_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        summary: {
            type: 'string',
            description: '1〜2文。今回の結果を一言でまとめる',
        },
        failureModeExplanation: {
            type: 'string',
            description:
                '入力で与えられた失敗モードが学習上どういう意味を持つかの説明。失敗モードを追加・変更しない。150字以内',
        },
        /**
         * maxItems は 14（スロット数）から 4 に下げた。
         *
         * 実測（2026-08-07、v1 の初回プレイ）で 4 モデルすべてが完走しなかった。
         *   gpt-oss / gemma / Qwen  max_tokens=4000 で finish_reason=length
         *   Kimi                    max_tokens=24000、本文 21,306 字でも 300 秒でタイムアウト
         *
         * 枠を 6 倍与えたモデルでも終わらなかった。**要求している出力量そのものが過大だった。**
         * missedClues / wrongReasoning / vocabulary が各 14 件で、文字列に長さ制限がなく、
         * 最大 42 個のオブジェクトを無制限の文章で書ける状態だった。
         *
         * そして本アプリの設計では feedback は従である（design.md「画面の優先順位」）。
         * **数千文字の添削は学習者が読まない。トークンの問題ではなく設計の誤りだった。**
         *
         * 網羅性は捨てる。指摘は重要なものだけに絞る。
         */
        missedClues: {
            type: 'array',
            description:
                '見落としたスロットの説明。正解タグがない場合は空配列。**重要な順に最大4件**',
            minItems: 0,
            maxItems: 4,
            items: {
                type: 'object',
                properties: {
                    slot: { type: 'string' },
                    whatWasThere: { type: 'string', description: '正解タグの記述に基づく説明のみ。80字以内' },
                    whyItMatters: { type: 'string', description: '絞り込み力を件数とともに述べる。80字以内' },
                },
                required: ['slot', 'whatWasThere', 'whyItMatters'],
                additionalProperties: false,
            },
        },
        wrongReasoning: {
            type: 'array',
            description: '誤った根拠の指摘。該当がなければ空配列。**重要な順に最大3件**',
            minItems: 0,
            maxItems: 3,
            items: {
                type: 'object',
                properties: {
                    slot: { type: 'string' },
                    explanation: { type: 'string', description: '100字以内' },
                },
                required: ['slot', 'explanation'],
                additionalProperties: false,
            },
        },
        /**
         * v2 では `buildGradingJsonSchema` が `canonicalTerm` を辞書の enum に差し替える。
         *
         * 自由文字列にしていた間、**52 応答中 22 件が辞書に無い用語を教えていた**
         * （実測 2026-08-17）。内訳は 4 種類。
         *
         *   (a) 欄の名前をそのまま出す   「左側通行」→ traffic_side       gpt-oss 11 件
         *   (b) 用語 ID を名前に混ぜる   → EU帯プレート（ai_vehicle_05）  Qwen 5 件
         *   (c) 辞書に無い正当な観察     → カーブミラー / シェブロン       4 件
         *   (d) 誤った対応づけ           「ガードレール」→ bollard        1 件
         *
         * (a) は**用語ではなく欄の名前である。覚えても役に立たない。**
         * (c) は辞書側の欠落であり、**AI は悪くない。辞書に足すべきものである。**
         *
         * `nextPriority` で同じことをやって形式が揃った。**選択肢が有限なら enum にする。**
         */
        vocabulary: {
            type: 'array',
            description:
                '学習者の素人語に正式な用語を対応づける。辞書にある用語のみ。'
                + '**辞書に無い場合は項目を作らない。**欄の名前（traffic_side など）は用語ではない。最大5件',
            minItems: 0,
            maxItems: 5,
            items: {
                type: 'object',
                properties: {
                    learnerWrote: { type: 'string' },
                    canonicalTerm: { type: 'string' },
                    note: { type: 'string', description: '60字以内' },
                },
                required: ['learnerWrote', 'canonicalTerm', 'note'],
                additionalProperties: false,
            },
        },
        discriminationHint: {
            type: 'string',
            description:
                '候補が複数ある場合、どのスロットを見れば区別できるか。候補が1つなら空文字列。150字以内',
        },
        /**
         * **enum にした。** 自由文字列だと 4 モデルで形式が揃わなかった（実測 2026-08-17）。
         *
         *   Qwen     ["traffic_side", "road_marking", "sign"]  ← 想定どおり
         *   gpt-oss  ["traffic_side（走行側）――日本は左側通行なので…"]
         *   Kimi     ["次の地点ではtraffic_side、road_marking…を優先的に確認…"]
         *   gemma    []
         *
         * 選択肢は 14 個しかない。**自由記述にする理由がなかった。**
         * 理由の説明は `discriminationHint` に書かせる。
         */
        nextPriority: {
            type: 'array',
            description:
                '次に注目すべきスロットのIDを優先順に最大3件。**IDのみを書く。説明を混ぜない。**理由は discriminationHint に書く',
            minItems: 0,
            maxItems: 3,
            items: { type: 'string', enum: [...SLOT_IDS] },
        },
        discoveries: {
            type: 'array',
            description:
                '学習者が other スロットに書いた内容が正解タグの other に対応した場合、その発見を認める記述。該当がなければ空配列。名前のない手がかりを自力で見つけたことを評価する',
            minItems: 0,
            maxItems: 14,
            items: { type: 'string' },
        },
        judgmentUnavailable: {
            type: 'boolean',
            description: '正解タグが与えられず見落とし判定ができなかった場合に true',
        },
    },
    required: [
        'summary',
        'failureModeExplanation',
        'missedClues',
        'wrongReasoning',
        'vocabulary',
        'discriminationHint',
        'nextPriority',
        'discoveries',
        'judgmentUnavailable',
    ],
    additionalProperties: false,
}

/**
 * 出題ごとの JSON Schema。**選択肢が分かっているものは enum にする。**
 *
 * ## v1 では何も差し替えない
 *
 * v1 は辞書も正解タグも渡さない条件そのものである。
 * 用語の enum を与えたら**辞書を渡したことになる。** 対照実験が壊れる。
 * したがって `options` を渡さなければ静的なスキーマがそのまま返る。
 *
 * ## v2 で差し替える 2 つ
 *
 * | 項目 | 差し替え | 実測での害 |
 * |---|---|---|
 * | `vocabulary.canonicalTerm` | 辞書にある用語名の enum | 22 件が辞書に無い用語を教えていた |
 * | `nextPriority` | **視認できない欄を除いた** enum | 6 件が見えない欄を「次に見ろ」と言っていた |
 *
 * `blindSlots` はコードが算出してプロンプトに渡している。**それでも守られなかった。**
 *
 * > **渡したことと、守られることは別である。**
 * > 守らせたいなら、書ける形から外す。
 *
 * enum でも足りない場合に備えて、出力後に `sanitizeFeedback` で落とす。
 * **AI の遵守に依存させない**（要件 3-2 と同じ考え方である）。
 */
export interface GradingSchemaOptions {
    /** 使ってよい用語の名前。v2 のみ。**空なら差し替えない** */
    allowedTerms?: readonly string[]
    /** 視認できない欄。`nextPriority` の選択肢から外す */
    blindSlots?: readonly SlotId[]
}

export function buildGradingJsonSchema(options: GradingSchemaOptions = {}): Record<string, unknown> {
    const { allowedTerms, blindSlots = [] } = options
    if (!allowedTerms?.length && blindSlots.length === 0) return GRADING_JSON_SCHEMA

    // 浅い複製で足りる。差し替えるのは 2 か所だけであり、そこは作り直す
    const properties = { ...(GRADING_JSON_SCHEMA.properties as Record<string, unknown>) }

    if (allowedTerms?.length) {
        const vocabulary = properties.vocabulary as Record<string, unknown>
        const items = vocabulary.items as Record<string, unknown>
        const itemProps = items.properties as Record<string, unknown>
        properties.vocabulary = {
            ...vocabulary,
            items: {
                ...items,
                properties: {
                    ...itemProps,
                    canonicalTerm: {
                        type: 'string',
                        // **辞書の表記そのものを選ばせる。** 括弧や ID を混ぜる余地を消す
                        enum: [...allowedTerms],
                        description: '辞書にある用語名をそのまま選ぶ。該当が無ければ項目を作らない',
                    },
                },
            },
        }
    }

    if (blindSlots.length) {
        const excluded = new Set<string>(blindSlots)
        const remaining = SLOT_IDS.filter((s) => !excluded.has(s))
        const nextPriority = properties.nextPriority as Record<string, unknown>
        properties.nextPriority = {
            ...nextPriority,
            description:
                '次に注目すべきスロットのIDを優先順に最大3件。**IDのみを書く。説明を混ぜない。**'
                + `理由は discriminationHint に書く。**視認できない欄（${blindSlots.join(' ')}）は選択肢から外してある**`,
            items: { type: 'string', enum: remaining },
        }
    }

    return { ...GRADING_JSON_SCHEMA, properties }
}

/**
 * v2 で差し込むコンテキスト。**v1 では null を渡す。**
 * テンプレートは分岐せず、このコンテキストの有無だけで v1 / v2 が切り替わる。
 */
export interface GradingContext {
    /** 正解タグ */
    answerKey: Question['slots']
    /** 弁別スロット */
    decisiveSlots: SlotId[]
    /** 用語辞書の該当分 */
    glossaryExcerpt: Term[]
}

export interface GradingPromptInput {
    answer: Answer
    /** 正解国と地域。正誤判定に使うためコードで確定済み */
    country: string
    region: string | null
    /** コードで確定した判定結果 */
    judgement: CodeJudgement
    /** v2 のみ。v1 では null */
    context: GradingContext | null
}

const NOT_JUDGED = '判定していない（正解タグまたは用語辞書が与えられていないため算出不能）'

function formatList(value: string[] | null): string {
    if (value === null) return NOT_JUDGED
    return value.length ? value.join(', ') : '（なし）'
}

function formatSlotEntries(slots: Answer['slots']): string {
    return SLOT_IDS.map((id) => {
        const entry = slots[id]
        const definition = SLOT_DEFINITION_BY_ID[id]
        const state = SLOT_STATE_LABELS[entry.state].label
        // 素人語の原文をそのまま渡す。v1 では正規化していないため用語 ID は無い
        const plain = entry.state === 'visible' ? (entry.plain ?? '（記述なし）') : '—'
        const terms = entry.terms.length ? ` [用語ID: ${entry.terms.join(', ')}]` : ''
        return `- ${definition.label}（${id}）: ${state} / ${plain}${terms}`
    }).join('\n')
}

function formatAnswerKey(answerKey: Question['slots']): string {
    return SLOT_IDS.map((id) => {
        const entry = answerKey[id]
        const state = SLOT_STATE_LABELS[entry.state].label
        const plain = entry.state === 'visible' ? (entry.plain ?? '（記述なし）') : '—'
        return `- ${id}: ${state} / ${plain}`
    }).join('\n')
}

function formatGlossary(terms: Term[]): string {
    if (!terms.length) return '（該当なし）'
    return terms
        .map(
            (t) =>
                `- ${t.id} / ${t.canonical}（素人語: ${t.plain}）: 関連国 ${t.countries.length} 件 [${t.countries.join(' ')}]`,
        )
        .join('\n')
}

function formatNarrowingPower(value: CodeJudgement['narrowingPower']): string {
    if (value === null) return NOT_JUDGED
    const entries = Object.entries(value)
    if (!entries.length) return '（なし）'
    return entries.map(([slot, count]) => `${slot}=${count}`).join(', ')
}

function formatFiledElsewhere(value: CodeJudgement['filedElsewhere']): string {
    if (value === null) return NOT_JUDGED
    if (!value.length) return '（なし）'
    return value.map((f) => `${f.slot}（記述があった欄: ${f.foundIn.join(', ')}）`).join(', ')
}

/**
 * 積集合。**空集合を「絞り込み成功」と読ませない。**
 *
 * 0 カ国は観察か辞書の矛盾であり、1 カ国の延長ではない。
 * プロンプト側で明示しないと、AI は件数の少なさを達成として褒める。
 */
function formatIntersection(value: CodeJudgement['intersection']): string {
    if (value === null) return NOT_JUDGED
    if (!value.countries.length) {
        return '0 カ国（**矛盾している。絞り込みの成功ではない。** 観察か辞書のどちらかが誤っている）'
    }
    return `${value.countries.length} カ国 [${value.countries.join(' ')}] / 正解を含む: ${value.containsAnswer ? 'はい' : 'いいえ'
        }`
}

/** 次に見るべきスロット。**コードの計算結果である。AI が並べ替えない** */
function formatNextPriority(value: CodeJudgement['nextPriority']): string {
    if (value === null) return NOT_JUDGED
    if (!value.length) return '（なし）'
    return value.map((n) => `${n.slot}（見れば残り ${n.resultingSize} カ国）`).join(' → ')
}

/**
 * 網羅でない手がかり。**「示唆する」までしか書かせない。**
 *
 * 実測（2026-08-18）。オーストラリアの出題で `ref_flora_eucalyptus`（1 カ国）が
 * 割り当てられているのに、絞り込みは 24 カ国のままだった。
 * 学習者の一番鋭い観察が、応答のどこにも現れていなかった。
 *
 * ここに渡すのは絞り込みの材料ではない。**説明の材料である。**
 * 件数を書かないのは意図的である。**件数を書くと絞り込み力に見える。**
 */
function formatNonExhaustiveHints(value: CodeJudgement['nonExhaustiveHints']): string {
    if (value === null) return NOT_JUDGED
    if (!value.length) return '（なし）'
    return value
        .map((h) => {
            const grad = h.gradient ? ` / 勾配: ${h.gradient.note}` : ''
            return `- ${h.slot}: ${h.canonical} → よく見られる国 [${h.countries.join(' ')}]${grad}`
        })
        .join('\n')
}

/**
 * ユーザープロンプトを組み立てる。
 *
 * **v1 / v2 で同一のテンプレートを使う。** `context` が null のとき、
 * 正解タグと用語辞書のセクションを省略し、代わりに注意セクションを出す。
 * これは分岐ではなく差し込みの有無である。
 */
export function buildGradingUserPrompt(input: GradingPromptInput): string {
    const { answer, country, region, judgement, context } = input

    const candidates = answer.candidates
        .map((c) => `${c.country}（確信度: ${c.confidence}）`)
        .join(', ')

    const sections: string[] = [
        `# 学習者の観察メモ\n\n${formatSlotEntries(answer.slots)}`,
        [
            '# 学習者の回答',
            '',
            `候補国: ${candidates}`,
            `決め手にしたスロット: ${answer.decisiveSlot ?? '（未選択）'}`,
            `総合推論: ${answer.reasoning ?? '（記述なし）'}`,
        ].join('\n'),
        ['# 正解', '', `国: ${country}`, `地域: ${region ?? '（未設定）'}`].join('\n'),
        [
            '# コードで確定した判定結果',
            '',
            `正解が候補集合に含まれるか: ${judgement.hit ? 'はい' : 'いいえ'}`,
            `含まれる場合の確信度: ${judgement.hitConfidence ?? '（該当なし）'}`,
            `見落としたスロット: ${formatList(judgement.missedSlots)}`,
            `誤って「見えない」と判断したスロット: ${formatList(judgement.wrongAbsentSlots)}`,
            `過剰に申告したスロット: ${formatList(judgement.overclaimedSlots)}`,
            '',
            '## 見落としではないもの（見落としとして扱わないこと）',
            `視認できないスロット: ${formatList(judgement.blindSlots)}`,
            `別のスロットに書かれた観察: ${formatFiledElsewhere(judgement.filedElsewhere)}`,
            `別ルートで正解したため不要だったスロット: ${formatList(judgement.alternativeRoute)}`,
            '',
            `失敗モード: ${formatList(judgement.failureModes)}`,
            `併記された国の組: ${judgement.confusionPairs.length
                ? judgement.confusionPairs.map(([a, b]) => `${a}-${b}`).join(', ')
                : '（なし）'
            }`,
            `スロット別の絞り込み力（関連国の件数）: ${formatNarrowingPower(judgement.narrowingPower)}`,
            `達成された絞り込み（積集合）: ${formatIntersection(judgement.intersection)}`,
            `次に見るべきスロット（コードの計算結果。並べ替えないこと）: ${formatNextPriority(judgement.nextPriority)}`,
            `自力で見つけた名前のない手がかり: ${formatList(judgement.discoveries)}`,
            '',
            '## 絞り込みには使えないが、説明すべき手がかり',
            '',
            '**候補を切る根拠にしてはならない。** 挙げた国以外にも存在する。',
            'ただし黙って無視してもならない。学習者はこれを観察できている。',
            '「よく見られるが、単独では決められない」という形で必ず触れること。',
            '',
            formatNonExhaustiveHints(judgement.nonExhaustiveHints),
        ].join('\n'),
    ]

    if (context) {
        sections.push(
            `# 正解タグ（この地点に実際に写っているもの）\n\n${formatAnswerKey(context.answerKey)}\n\n弁別スロット（候補を区別できる項目）: ${context.decisiveSlots.length ? context.decisiveSlots.join(', ') : '（なし）'
            }`,
        )
        sections.push(`# 用語辞書（該当分）\n\n${formatGlossary(context.glossaryExcerpt)}`)
    }
    else {
        sections.push(
            [
                '# 注意',
                '',
                'この地点の正解タグは与えられていません。用語辞書も与えられていません。',
                '見落としについて述べることはできません。',
            ].join('\n'),
        )
    }

    return sections.join('\n\n')
}
