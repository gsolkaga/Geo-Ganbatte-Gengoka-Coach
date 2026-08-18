/**
 * 配布形式の単体テスト。**AI を使わない。**
 *
 * 固定する性質
 * - **画像が入っていたら弾く**（欄が無いことは保証にならない）
 * - 用語 ID の参照が全部解ける
 * - `error` があれば 1 件も入れない（部分的に入れない）
 * - **取り込みは足すだけ。既存を上書きしない**
 */
import { describe, expect, it } from 'vitest'
import {
    DATASET_FORMAT_VERSION,
    DATASET_KIND,
    buildLogExport,
    collectSources,
    datasetId,
    findImageLike,
    findSecretLike,
    initProgress,
    mergeDataset,
    nextQuestion,
    recordAnswered,
    selectUsedTerms,
    summarizeProgress,
    validateDataset,
    validateLogExport,
} from '../shared/dataset'
import type { Dataset } from '../shared/dataset'
import { createEmptySlots } from '../shared/slots'
import type { Question, SlotEntry, Term } from '../shared/types'

const term = (id: string, countries: string[], over: Partial<Term> = {}): Term => ({
    id,
    slot: 'script',
    kind: 'atomic',
    certainty: 'verified',
    source: 'reference',
    canonical: id,
    plain: id,
    aliases: [],
    countries,
    confusableWith: [],
    requires: null,
    note: null,
    disputed: false,
    sources: ['https://example.com/ref'],
    ...over,
})

const seen = (terms: string[]): SlotEntry => ({ state: 'visible', plain: 'なにか', terms })

const question = (id: string, country: string, terms: string[] = []): Question => ({
    id,
    panoId: `pano-${id}`,
    fallback: { lat: 35, lng: 139, heading: 0 },
    country,
    region: null,
    difficulty: 2,
    copyright: '© Google',
    captureDate: '2024-07',
    slots: { ...createEmptySlots(), script: seen(terms) },
    decisiveSlots: ['script'],
    note: null,
    source: { draftBy: [] },
})

function dataset(over: Partial<Dataset> = {}): Dataset {
    return {
        kind: DATASET_KIND,
        formatVersion: DATASET_FORMAT_VERSION,
        meta: {
            name: 'テスト用',
            author: 'tester',
            license: 'CC BY 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
            attribution: 'テスト用 (tester), CC BY 4.0',
            sources: ['https://example.com/ref'],
            createdAt: '2026-08-18T00:00:00.000Z',
        },
        questions: [question('q-1', 'JP', ['t-1'])],
        glossary: { terms: [term('t-1', ['JP'])] },
        ...over,
    }
}

const errorsOf = (d: unknown, o = {}) =>
    validateDataset(d, o).filter((i) => i.level === 'error')

describe('validateDataset', () => {
    it('揃っていれば error は出ない', () => {
        expect(errorsOf(dataset(), { knownCountries: ['JP'] })).toEqual([])
    })

    it('形式のバージョンが違えば弾く。**黙って読まない**', () => {
        const e = errorsOf(dataset({ formatVersion: 99 }))
        expect(e.some((i) => i.check === 'formatVersion')).toBe(true)
    })

    it('kind が違えば弾く。拡張子だけで判断しない', () => {
        expect(errorsOf({ ...dataset(), kind: 'something-else' })
            .some((i) => i.check === 'kind')).toBe(true)
    })

    it('出典表示が空なら弾く。**誰の何なのか分からないデータは配れない**', () => {
        const d = dataset()
        d.meta.attribution = '  '
        expect(errorsOf(d).some((i) => i.check === 'meta')).toBe(true)
    })

    it('用語 ID が辞書に無ければ弾く。**辞書を同梱しなければ意味を失う**', () => {
        const d = dataset({ questions: [question('q-1', 'JP', ['t-missing'])] })
        const e = errorsOf(d)
        expect(e.some((i) => i.check === 'reference' && i.message.includes('t-missing'))).toBe(true)
    })

    it('知らない国コードは弾く。**候補として選べない国は出題にできない**', () => {
        const e = errorsOf(dataset({ questions: [question('q-1', 'ZZ', ['t-1'])] }), { knownCountries: ['JP'] })
        expect(e.some((i) => i.check === 'country')).toBe(true)
    })

    it('knownCountries を渡さなければ国の検査をしない', () => {
        expect(errorsOf(dataset({ questions: [question('q-1', 'ZZ', ['t-1'])] }))).toEqual([])
    })

    it('panoId が無ければ弾く。**保存してよいのは pano ID だけである**', () => {
        const q = question('q-1', 'JP', ['t-1'])
        // @ts-expect-error 欠損を作る
        q.panoId = undefined
        expect(errorsOf(dataset({ questions: [q] })).some((i) => i.check === 'panoId')).toBe(true)
    })

    it('座標が範囲外なら弾く', () => {
        const q = question('q-1', 'JP', ['t-1'])
        q.fallback = { lat: 200, lng: 0, heading: 0 }
        expect(errorsOf(dataset({ questions: [q] })).some((i) => i.check === 'fallback')).toBe(true)
    })

    it('出題 ID の重複を弾く', () => {
        const d = dataset({ questions: [question('q-1', 'JP', ['t-1']), question('q-1', 'JP', ['t-1'])] })
        expect(errorsOf(d).some((i) => i.message.includes('重複'))).toBe(true)
    })

    describe('画像が入っていたら弾く', () => {
        it('data: URL の画像', () => {
            const d = dataset()
            d.meta.description = 'data:image/png;base64,iVBORw0KGgo='
            expect(errorsOf(d).some((i) => i.check === 'no-image')).toBe(true)
        })

        it('用語の note に忍ばせた画像ファイルへの参照', () => {
            const d = dataset({ glossary: { terms: [term('t-1', ['JP'], { note: '例: bollard.jpg を見よ' })] } })
            expect(errorsOf(d).some((i) => i.check === 'no-image')).toBe(true)
        })

        it('Street View 画像 API の URL', () => {
            const d = dataset({
                glossary: {
                    terms: [term('t-1', ['JP'], {
                        sources: ['https://maps.googleapis.com/maps/api/streetview?location=0,0'],
                    })],
                },
            })
            expect(errorsOf(d).some((i) => i.check === 'no-image')).toBe(true)
        })

        it('base64 らしい長い文字列', () => {
            const d = dataset()
            d.meta.description = 'A'.repeat(600)
            expect(errorsOf(d).some((i) => i.check === 'no-image')).toBe(true)
        })

        it('pano ID は弾かない。**保存してよいものを誤検出しない**', () => {
            expect(errorsOf(dataset({ questions: [question('q-1', 'JP', ['t-1'])] }))).toEqual([])
        })
    })
})

describe('findImageLike', () => {
    it('入れ子の中まで探して場所を返す', () => {
        const found = findImageLike({ a: { b: ['ok', 'x.png'] } })
        expect(found).toHaveLength(1)
        expect(found[0]!.path).toBe('$.a.b[1]')
    })

    it('画像が無ければ空', () => {
        expect(findImageLike({ a: 'https://example.com/page', b: 42, c: null })).toEqual([])
    })
})

describe('mergeDataset', () => {
    const mine = {
        questions: [question('q-1', 'JP', ['t-1'])],
        // **自分で直した用語。** 取り込みで戻ってはならない
        terms: [term('t-1', ['JP'], { canonical: '自分で直した' })],
    }

    it('同じ ID の出題は飛ばす', () => {
        const r = mergeDataset(mine, { questions: [question('q-1', 'JP', ['t-1'])], terms: [] })
        expect(r.addedQuestions).toEqual([])
        expect(r.skippedQuestions).toEqual(['q-1'])
        expect(r.questions).toHaveLength(1)
    })

    it('新しい出題は足す', () => {
        const r = mergeDataset(mine, { questions: [question('q-2', 'TH', ['t-1'])], terms: [] })
        expect(r.addedQuestions).toEqual(['q-2'])
        expect(r.questions).toHaveLength(2)
    })

    it('**自分で直した用語を上書きしない。** 衝突として報告する', () => {
        const r = mergeDataset(mine, {
            questions: [],
            terms: [term('t-1', ['JP'], { canonical: '先方の書き方' })],
        })
        expect(r.conflictedTerms).toEqual(['t-1'])
        expect(r.addedTerms).toEqual([])
        expect(r.terms.find((t) => t.id === 't-1')!.canonical).toBe('自分で直した')
    })

    it('中身が同一なら衝突にしない', () => {
        const r = mergeDataset(mine, { questions: [], terms: [...mine.terms] })
        expect(r.conflictedTerms).toEqual([])
    })

    it('新しい用語は足す', () => {
        const r = mergeDataset(mine, { questions: [], terms: [term('t-2', ['TH'])] })
        expect(r.addedTerms).toEqual(['t-2'])
        expect(r.terms).toHaveLength(2)
    })
})

describe('selectUsedTerms', () => {
    it('出題が使っている用語だけを返す', () => {
        const terms = [term('t-1', ['JP']), term('t-2', ['TH'])]
        expect(selectUsedTerms([question('q-1', 'JP', ['t-1'])], terms).map((t) => t.id))
            .toEqual(['t-1'])
    })
})

describe('collectSources', () => {
    it('重複を除いて並べる。**出典を辿れる形にする**', () => {
        const terms = [
            term('t-1', ['JP'], { sources: ['https://b.example', 'https://a.example'] }),
            term('t-2', ['TH'], { sources: ['https://a.example'] }),
        ]
        expect(collectSources(terms)).toEqual(['https://a.example', 'https://b.example'])
    })
})

// ============================================================
// ライブラリと進捗
// ============================================================

describe('datasetId', () => {
    it('作成者と名前から決める。**同じ名前が別人から来ることがある**', () => {
        expect(datasetId('gsolkaga', '標準データセット'))
            .not.toBe(datasetId('someone', '標準データセット'))
    })

    it('**ASCII に限る。** ディレクトリ名と URL に使うため', () => {
        expect(datasetId('gsolkaga', 'Standard 10 Set!')).toBe('gsolkaga__standard-10-set')
    })

    it('日本語だけの名前でも id を作る', () => {
        const id = datasetId('gsolkaga', '標準10問')
        expect(id).toMatch(/^gsolkaga__[a-z0-9]+$/)
    })

    it('**同じ名前からは同じ id が出る。** 取り込み直しで別物にならない', () => {
        expect(datasetId('作者', '標準10問')).toBe(datasetId('作者', '標準10問'))
    })

    it('別の名前なら別の id', () => {
        expect(datasetId('gsolkaga', '標準10問')).not.toBe(datasetId('gsolkaga', '標準20問'))
    })

    it('空でも id を作る', () => {
        expect(datasetId('', '')).toBe('unknown__dataset')
    })
})

describe('nextQuestion', () => {
    const ids = ['q-1', 'q-2', 'q-3']

    it('未回答の先頭を、何問目かと一緒に返す', () => {
        const p = { order: ids, answered: ['q-1'] }
        expect(nextQuestion(p, ids)).toEqual({ questionId: 'q-2', index: 2, total: 3 })
    })

    it('**順番を飛ばして回答しても「何問目」は並び順で言う**', () => {
        const p = { order: ids, answered: ['q-2'] }
        expect(nextQuestion(p, ids)).toEqual({ questionId: 'q-1', index: 1, total: 3 })
    })

    it('全部終わったら null。**先頭に戻さない**（1周したことが分からなくなる）', () => {
        expect(nextQuestion({ order: ids, answered: ids }, ids)).toBeNull()
    })

    it('出題が消えていれば飛ばして数え直す。**辞書と違い出題は差し替わる**', () => {
        const p = { order: ids, answered: [] }
        // q-2 がデータセットから消えた
        expect(nextQuestion(p, ['q-1', 'q-3'])).toEqual({ questionId: 'q-1', index: 1, total: 2 })
    })

    it('order に無い出題は出さない。**並びを固定するのが目的である**', () => {
        const p = { order: ['q-1'], answered: ['q-1'] }
        expect(nextQuestion(p, ['q-1', 'q-99'])).toBeNull()
    })
})

describe('recordAnswered', () => {
    it('回答順で足す', () => {
        let p = initProgress(['q-1', 'q-2'])
        p = recordAnswered(p, 'q-2')
        p = recordAnswered(p, 'q-1')
        expect(p.answered).toEqual(['q-2', 'q-1'])
    })

    it('**同じ出題を二重に数えない。** 再挑戦しても 1 件である', () => {
        let p = initProgress(['q-1'])
        p = recordAnswered(p, 'q-1')
        const same = recordAnswered(p, 'q-1')
        expect(same.answered).toEqual(['q-1'])
        expect(same).toBe(p)
    })

    it('order は変えない', () => {
        const p = recordAnswered(initProgress(['q-1', 'q-2']), 'q-1')
        expect(p.order).toEqual(['q-1', 'q-2'])
    })
})

describe('summarizeProgress', () => {
    it('件数と完了を返す', () => {
        const p = { order: ['q-1', 'q-2'], answered: ['q-1'] }
        expect(summarizeProgress(p, ['q-1', 'q-2']))
            .toEqual({ answered: 1, total: 2, remaining: 1, done: false })
    })

    it('全部終われば done', () => {
        const p = { order: ['q-1'], answered: ['q-1'] }
        expect(summarizeProgress(p, ['q-1']).done).toBe(true)
    })

    it('出題が 0 件なら done にしない。**空を完了と読ませない**', () => {
        expect(summarizeProgress({ order: [], answered: [] }, []).done).toBe(false)
    })

    it('消えた出題は数に入れない', () => {
        const p = { order: ['q-1', 'q-2'], answered: ['q-1', 'q-2'] }
        expect(summarizeProgress(p, ['q-1'])).toEqual({ answered: 1, total: 1, remaining: 0, done: true })
    })
})

// ============================================================
// 回答ログ
// ============================================================

const run = (over: Record<string, any> = {}) => ({
    id: 'r-1',
    ts: '2026-08-18T00:00:00.000Z',
    variant: 'v2',
    questionId: 'q-1',
    answer: {
        questionId: 'q-1',
        slots: { script: { state: 'visible', plain: 'キリル文字だ', terms: ['t-1'] } },
        candidates: [{ country: 'BG', confidence: 'high' }],
        decisiveSlot: 'script',
        reasoning: 'キリル文字だったので',
    },
    result: {
        hit: true,
        hitConfidence: 'high',
        missedSlots: ['pole'],
        blindSlots: [],
        intersection: { countries: ['BG', 'RS'], containsAnswer: true },
        models: [{ model: 'gpt-oss-120b', status: 'ok', rawContent: 'x'.repeat(40000) }],
    },
    ...over,
})

const logOptions = {
    datasetId: 'a__b',
    datasetName: 'テスト',
    datasetAttribution: 'テスト (tester), CC BY 4.0',
    author: 'tester',
    orderIndex: { 'q-1': 1, 'q-2': 2 },
}

describe('buildLogExport', () => {
    it('何問目かを付ける', () => {
        const log = buildLogExport([run()], logOptions)
        expect(log.entries[0]!.index).toBe(1)
    })

    it('**生の応答は入れない。** モデル名と状態だけ', () => {
        const log = buildLogExport([run()], logOptions)
        expect(log.entries[0]!.models).toEqual([{ model: 'gpt-oss-120b', status: 'ok' }])
        expect(JSON.stringify(log)).not.toContain('x'.repeat(100))
    })

    it('既定では学習者の記述を入れる（それが読む価値である）', () => {
        const log = buildLogExport([run()], logOptions)
        expect(log.entries[0]!.slots.script!.plain).toBe('キリル文字だ')
        expect(log.entries[0]!.reasoning).toBe('キリル文字だったので')
        expect(log.meta.anonymized).toBe(false)
    })

    it('**--anonymize で記述を落とす。** 用語 ID と判定は残す', () => {
        const log = buildLogExport([run()], { ...logOptions, anonymize: true })
        expect(log.entries[0]!.slots.script!.plain).toBeNull()
        expect(log.entries[0]!.reasoning).toBeNull()
        expect(log.entries[0]!.slots.script!.terms).toEqual(['t-1'])
        expect(log.entries[0]!.judgement.hit).toBe(true)
        expect(log.meta.anonymized).toBe(true)
    })

    it('何問目かの順に並べる', () => {
        const log = buildLogExport([run({ questionId: 'q-2', answer: { ...run().answer, questionId: 'q-2' } }), run()], logOptions)
        expect(log.entries.map((e) => e.questionId)).toEqual(['q-1', 'q-2'])
    })

    it('questionId の無い記録は捨てる', () => {
        expect(buildLogExport([{ ts: 'x' }], logOptions).entries).toEqual([])
    })

    it('積集合の件数だけを持つ。国の一覧は持たない', () => {
        const log = buildLogExport([run()], logOptions)
        expect(log.entries[0]!.judgement.intersectionSize).toBe(2)
        expect(log.entries[0]!.judgement.containsAnswer).toBe(true)
    })
})

describe('validateLogExport', () => {
    it('揃っていれば error は出ない', () => {
        const log = buildLogExport([run()], { ...logOptions, anonymize: true })
        expect(validateLogExport(log).filter((i) => i.level === 'error')).toEqual([])
    })

    it('記述が入っていれば警告する。**公開の既定を全部入りにしない**', () => {
        const log = buildLogExport([run()], logOptions)
        expect(validateLogExport(log).some((i) => i.level === 'warning' && i.check === 'privacy')).toBe(true)
    })

    it('**API キーらしい文字列が入っていれば弾く**', () => {
        const log = buildLogExport([run({
            answer: { ...run().answer, reasoning: 'メモ: sk_live_ABCDEFGHIJKLMNOPQRSTU' },
        })], logOptions)
        expect(validateLogExport(log).some((i) => i.check === 'no-secret')).toBe(true)
    })

    it('画像が入っていれば弾く', () => {
        const log = buildLogExport([run({
            answer: { ...run().answer, reasoning: 'data:image/png;base64,iVBORw0KGgo=' },
        })], logOptions)
        expect(validateLogExport(log).some((i) => i.check === 'no-image')).toBe(true)
    })

    it('出典表示が空なら弾く。**どのデータセットのログか分からない**', () => {
        const log = buildLogExport([run()], { ...logOptions, datasetAttribution: '  ' })
        expect(validateLogExport(log).some((i) => i.check === 'meta')).toBe(true)
    })

    it('entries が空なら弾く', () => {
        const log = buildLogExport([], logOptions)
        expect(validateLogExport(log).some((i) => i.check === 'entries')).toBe(true)
    })
})

describe('findSecretLike', () => {
    it('入れ子の中まで探す', () => {
        // **検出器のテストには検体が必要である。** 本物ではない
        const found = findSecretLike({ a: { b: 'Bearer ABCDEFGHIJKLMNOPQRSTUVWX' } }) // check-secrets:allow
        expect(found).toHaveLength(1)
        expect(found[0]!.path).toBe('$.a.b')
    })

    it('普通の文章は拾わない', () => {
        expect(findSecretLike({ a: 'キリル文字が見えた', b: 'https://example.com/page' })).toEqual([])
    })
})
