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
 *
 * ## 許可リストは、許可した側を見ていない
 *
 * この方式で 7 フィールドを除外し、テストも通っていた。**それでも答えは漏れていた。**
 *
 * `fallback` に**正確な緯度経度が入っていた。** `-3.64, -45.18` を地図に置けば
 * ブラジルである。除外したどのフィールドより直接的に答えを渡していた。
 *
 * > **何を渡さないかを数えても、渡すものが何を含んでいるかは分からない。**
 *
 * 「pano ID 失効時の再解決に使う。表示にも必要である」と注記していたが、
 * **`app/` の中で一度も使われていなかった**（実測 2026-08-19）。
 * 再解決は `resolvePano` がサーバで行い、Street View の部品は `panoId` だけを受け取る。
 * **要らないものを渡していた。**
 *
 * `id` はまだ答えを含んでいる（`q-kr-01` の `kr` が国コードである）。
 * 採点に送り返す取っ手として要るので残しているが、**学習者の画面には出さない。**
 * 通信の中身には残るので、これは**画面から見えないだけ**である。
 */
import type { Question } from '../../shared/types'

export interface LearnerQuestion {
    /**
     * 採点に送り返す取っ手。
     *
     * **これは答えを含む。** `q-kr-01` の `kr` は国コードである。
     * 画面に出してはならない（要件 11-8 と同じ理由）。
     * 記事と文書がこの ID を引用しているため付け替えていない。
     * 不透明な別名に置き換えるなら、採点・正規化・記録の読み出しを同時に変える必要がある。
     */
    id: string
    panoId: string
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
    /**
     * **座標は答えそのものである。** 除外したどのフィールドより直接的だった。
     * クライアントは使っていない（再解決はサーバの `resolvePano` が行う）。
     */
    'fallback',
] as const

export function toLearnerQuestion(question: Question): LearnerQuestion {
    return {
        id: question.id,
        panoId: question.panoId,
        difficulty: question.difficulty,
        copyright: question.copyright,
    }
}
