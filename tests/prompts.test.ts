/**
 * プロンプトテンプレートの単体テスト。
 *
 * 検証する性質
 * - **Property 6: v1 で AI へ渡すペイロードに正解タグが含まれない**（要件 9-4）
 * - **Property 7: v1 と v2 でテンプレートが同一である**（要件 9-3）
 *
 * この 2 つが崩れると対照実験が無効になる。**記事の中核が成立しなくなる。**
 */
import { describe, expect, it } from 'vitest'
import {
    GRADING_JSON_SCHEMA,
    GRADING_SYSTEM_PROMPT,
    buildGradingUserPrompt,
} from '../server/utils/prompts'
import { buildV1Judgement } from '../server/utils/grading'
import { createEmptySlots } from '../shared/slots'
import type { Answer, Question, Term } from '../shared/types'

const SECRET_TAG = 'ボラードの上部が黒く塗られた特徴的な意匠'

function buildAnswer(): Answer {
    const slots = createEmptySlots()
    slots.script = { state: 'visible', plain: 'A の上に点が 2 つある字', terms: [] }
    slots.bollard = { state: 'unknown', plain: null, terms: [] }
    return {
        questionId: 'q-bg-01',
        slots,
        candidates: [
            { country: 'BG', confidence: 'medium' },
            { country: 'RO', confidence: 'low' },
        ],
        decisiveSlot: 'script',
        reasoning: 'キリル文字に見えた',
    }
}

function buildAnswerKey(): Question['slots'] {
    const slots = createEmptySlots()
    slots.bollard = { state: 'visible', plain: SECRET_TAG, terms: ['bollard_black_top'] }
    return slots
}

const glossary: Term[] = [
    {
        id: 'bollard_black_top',
        slot: 'bollard',
        kind: 'atomic',
        certainty: 'verified',
        source: 'human',
        canonical: '黒帯ボラード',
        plain: '上が黒い杭',
        aliases: [],
        countries: ['BG', 'RS'],
        confusableWith: [],
        requires: null,
        note: null,
        disputed: false,
    },
]

const answer = buildAnswer()
const judgement = buildV1Judgement(answer, 'BG')

const v1Prompt = buildGradingUserPrompt({
    answer,
    country: 'BG',
    region: 'east_europe',
    judgement,
    context: null,
})

const v2Prompt = buildGradingUserPrompt({
    answer,
    country: 'BG',
    region: 'east_europe',
    judgement,
    context: {
        answerKey: buildAnswerKey(),
        decisiveSlots: ['bollard'],
        glossaryExcerpt: glossary,
    },
})

describe('Property 6: v1 は正解タグを渡さない', () => {
    it('v1 のプロンプトに正解タグの記述が現れない', () => {
        expect(v1Prompt).not.toContain(SECRET_TAG)
    })

    it('v1 のプロンプトに用語辞書の用語 ID が現れない', () => {
        expect(v1Prompt).not.toContain('bollard_black_top')
        expect(v1Prompt).not.toContain('黒帯ボラード')
    })

    it('v1 では正解タグと用語辞書のセクション自体が存在しない', () => {
        expect(v1Prompt).not.toContain('# 正解タグ')
        expect(v1Prompt).not.toContain('# 用語辞書')
    })

    it('v1 では見落としについて述べられないことを明示する', () => {
        expect(v1Prompt).toContain('# 注意')
        expect(v1Prompt).toContain('見落としについて述べることはできません')
    })

    it('v2 では正解タグと用語辞書が差し込まれる', () => {
        expect(v2Prompt).toContain(SECRET_TAG)
        expect(v2Prompt).toContain('bollard_black_top')
        expect(v2Prompt).toContain('# 正解タグ')
        expect(v2Prompt).toContain('# 用語辞書')
    })
})

describe('Property 7: v1 と v2 でテンプレートが同一', () => {
    it('システムプロンプトは variant によって変わらない', () => {
        // システムプロンプトは定数であり、差し込みを一切持たない
        expect(GRADING_SYSTEM_PROMPT).toContain('判定はすでに済んでいます')
        expect(GRADING_SYSTEM_PROMPT).not.toContain('v1')
        expect(GRADING_SYSTEM_PROMPT).not.toContain('v2')
    })

    it('出力スキーマは variant によって変わらない', () => {
        // スキーマは定数を 1 つだけ持つ。variant で分岐する余地がない
        expect(GRADING_JSON_SCHEMA).toBe(GRADING_JSON_SCHEMA)
        expect(Object.keys(GRADING_JSON_SCHEMA.properties as object)).toContain('judgmentUnavailable')
    })

    it('v2 は v1 のセクションをすべて含み、差分は差し込みだけである', () => {
        const v1Sections = v1Prompt.split('\n\n').filter((s) => s.startsWith('# '))
        const v2Sections = v2Prompt.split('\n\n').filter((s) => s.startsWith('# '))
        // v1 固有の「# 注意」以外は v2 にも存在する
        for (const section of v1Sections) {
            const heading = section.split('\n')[0]!
            if (heading === '# 注意') continue
            expect(v2Prompt).toContain(heading)
        }
        expect(v2Sections.length).toBeGreaterThan(v1Sections.length - 1)
    })

    it('共通セクションの見出しは両方に同じ順序で現れる', () => {
        const common = ['# 学習者の観察メモ', '# 学習者の回答', '# 正解', '# コードで確定した判定結果']
        const indexIn = (text: string) => common.map((heading) => text.indexOf(heading))
        for (const positions of [indexIn(v1Prompt), indexIn(v2Prompt)]) {
            expect(positions.every((position) => position >= 0)).toBe(true)
            expect([...positions].sort((a, b) => a - b)).toEqual(positions)
        }
    })
})

describe('判定不能の表現', () => {
    it('v1 では判定不能であることをプロンプトに明記する（空欄にしない）', () => {
        expect(v1Prompt).toContain('見落としたスロット: 判定していない')
        expect(v1Prompt).toContain('失敗モード: 判定していない')
    })

    it('v1 でも算出できる項目は値が入る', () => {
        expect(v1Prompt).toContain('正解が候補集合に含まれるか: はい')
        expect(v1Prompt).toContain('併記された国の組: BG-RO')
    })
})

describe('観察メモの差し込み', () => {
    it('素人語の原文がそのまま渡る（v1 では正規化していない）', () => {
        expect(v1Prompt).toContain('A の上に点が 2 つある字')
    })

    it('14 スロットすべてが列挙される', () => {
        const lines = v1Prompt.split('\n').filter((line) => line.startsWith('- '))
        expect(lines.length).toBeGreaterThanOrEqual(14)
    })
})
