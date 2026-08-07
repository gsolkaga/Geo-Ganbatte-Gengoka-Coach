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
項目の外を見た学習者を、項目に収まらなかったことで減点しないでください。`

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
                '入力で与えられた失敗モードが学習上どういう意味を持つかの説明。失敗モードを追加・変更しない',
        },
        missedClues: {
            type: 'array',
            description: '見落としたスロットの説明。正解タグがない場合は空配列',
            minItems: 0,
            maxItems: 14,
            items: {
                type: 'object',
                properties: {
                    slot: { type: 'string' },
                    whatWasThere: { type: 'string', description: '正解タグの記述に基づく説明のみ' },
                    whyItMatters: { type: 'string', description: '絞り込み力を件数とともに述べる' },
                },
                required: ['slot', 'whatWasThere', 'whyItMatters'],
                additionalProperties: false,
            },
        },
        wrongReasoning: {
            type: 'array',
            description: '誤った根拠の指摘。該当がなければ空配列',
            minItems: 0,
            maxItems: 14,
            items: {
                type: 'object',
                properties: {
                    slot: { type: 'string' },
                    explanation: { type: 'string' },
                },
                required: ['slot', 'explanation'],
                additionalProperties: false,
            },
        },
        vocabulary: {
            type: 'array',
            description: '学習者の素人語に正式な用語を対応づける。辞書にある用語のみ',
            minItems: 0,
            maxItems: 14,
            items: {
                type: 'object',
                properties: {
                    learnerWrote: { type: 'string' },
                    canonicalTerm: { type: 'string' },
                    note: { type: 'string' },
                },
                required: ['learnerWrote', 'canonicalTerm', 'note'],
                additionalProperties: false,
            },
        },
        discriminationHint: {
            type: 'string',
            description:
                '候補が複数ある場合、どのスロットを見れば区別できるか。候補が1つなら空文字列',
        },
        nextPriority: {
            type: 'array',
            description: '次に注目すべきスロットを優先順に最大3件',
            minItems: 0,
            maxItems: 3,
            items: { type: 'string' },
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
            `失敗モード: ${formatList(judgement.failureModes)}`,
            `併記された国の組: ${judgement.confusionPairs.length
                ? judgement.confusionPairs.map(([a, b]) => `${a}-${b}`).join(', ')
                : '（なし）'
            }`,
            `スロット別の絞り込み力（関連国の件数）: ${formatNarrowingPower(judgement.narrowingPower)}`,
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
