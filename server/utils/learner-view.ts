/**
 * 学習者に見せてよい範囲への射影。
 *
 * **採点前に正解が漏れることを型と関数で防ぐ。**
 * `country`（正解国）・`slots`（正解タグ）・`decisiveSlots`（弁別スロット）・
 * `note`・`region` は答えを示すため除外する。
 *
 * `captureDate`（撮影年月）も除外する。**撮影年そのものがメタであり、答えを渡すことになる**
 * （要件 11-8、禁止事項 8）。
 *
 * 許可リスト方式で書く。`Question` にフィールドが増えても既定で漏れない。
 */
import type { Question } from '../../shared/types'

export interface LearnerQuestion {
    id: string
    panoId: string
    /** pano ID 失効時の再解決に使う（要件 1-6）。表示にも必要である */
    fallback: { lat: number, lng: number, heading: number }
    difficulty: 1 | 2 | 3
    /** 帰属表記は改変・隠蔽しない（要件 11-4） */
    copyright: string
}

/** 学習者向けレスポンスに含めてはならないフィールド */
export const LEAKING_QUESTION_FIELDS = [
    'country',
    'region',
    'slots',
    'decisiveSlots',
    'captureDate',
    'note',
    'source',
] as const

export function toLearnerQuestion(question: Question): LearnerQuestion {
    return {
        id: question.id,
        panoId: question.panoId,
        fallback: question.fallback,
        difficulty: question.difficulty,
        copyright: question.copyright,
    }
}
