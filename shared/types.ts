/**
 * 型定義。`design.md` の Data Models を正典とする。
 */
import type { Confidence, SlotId, SlotState } from './slots'

export type { Confidence, SlotId, SlotState } from './slots'

/** スロット 1 件。教材データと学習者回答で同一の形を使う */
export interface SlotEntry {
    state: SlotState
    /** 素人語の原文。state が visible のときのみ意味を持つ */
    plain: string | null
    /** 正規化された用語 ID。辞書内の ID のみを含む */
    terms: string[]
    /** 教材データでのみ使用。人手確認済みか */
    confirmed?: boolean
    /**
     * 教材データでのみ使用。**この学習者が視認できるか。**
     *
     *   easy   見ればすぐ分かる
     *   hard   意識して探せば見える
     *   blind  写っているが認識できない。**見落としに数えない**
     *
     * 絞り込み力（該当国数）とメタの強さ（件数と地理的散らばり）は計算できるが、
     * **視認可能性は計算できない。** 人手でタグに記録する。
     *
     * 未記録は `undefined`。**`easy` を既定にしない。**
     * 既定を置くと「確認していない」が「見えるはず」に変わってしまう。
     */
    recognition?: 'easy' | 'hard' | 'blind'
}

export type SlotRecord = Record<SlotId, SlotEntry>

/** 出題と正解タグ */
export interface Question {
    id: string
    panoId: string
    /** pano ID 失効時の再解決用 */
    fallback: { lat: number; lng: number; heading: number }
    /** ISO 3166-1 alpha-2 */
    country: string
    region: string | null
    difficulty: 1 | 2 | 3
    /** メタデータの著作権表記。Google 提供のもののみ採用する */
    copyright: string
    /** メタデータの撮影年月。管理モードのタグ付け補助にのみ使用し、学習者には表示しない */
    captureDate: string | null
    slots: SlotRecord
    /** 候補を弁別できるスロット。フィードバックで弁別の指示に使う */
    decisiveSlots: SlotId[]
    note: string | null
    source: { draftBy: ('country_table' | 'ai')[] }
}

/** 学習者に渡す出題。正解タグと撮影年月を含まない */
export type QuestionForLearner = Pick<Question, 'id' | 'panoId' | 'fallback' | 'difficulty' | 'copyright'>

export interface Candidate {
    country: string
    confidence: Confidence
}

/** 学習者の回答 */
export interface Answer {
    questionId: string
    slots: SlotRecord
    /** 最大 3 件。high は最大 1 件 */
    candidates: Candidate[]
    decisiveSlot: SlotId | null
    reasoning: string | null
}

/**
 * 回答パネルが編集する部分。`Answer` から questionId と slots を除いたもの。
 * 観察フェーズと回答フェーズで状態を分けて持つため、型も分ける。
 */
export interface AnswerDraft {
    candidates: Candidate[]
    decisiveSlot: SlotId | null
    reasoning: string | null
}

/**
 * 用語の粒度。**正規化の enum に使えるのは `atomic` のみ。**
 *
 * `combination` は複数の観察を束ねたもの（「白い本体＋黒い帯＋赤い反射板」）であり、
 * 1 スロットの記述に対する選択肢として提示すると、
 * **まだ見ていない部分まで見たことにしてしまう。**
 */
export type TermKind = 'atomic' | 'combination'

/**
 * 主張の確かさ。**断定してよいのは `verified` のみ。**
 *
 *   verified    人間が一次情報で確認した
 *   heuristic   実戦中の連想・経験則。出典自身が「連想する」と書いている
 *   unverified  AI 生成で人手検証を経ていない
 *
 * `heuristic` が 18 語ある（`data/glossary-human.json`）。
 * **人間が書いたことは、正しいことを意味しない。** 由来（`source`）と確かさを別に持つ。
 */
export type TermCertainty = 'verified' | 'heuristic' | 'unverified'

/** 用語辞書の 1 項目。`data/glossary.json` は `scripts/build-glossary.mjs` が生成する */
export interface Term {
    id: string
    slot: SlotId
    kind: TermKind
    certainty: TermCertainty
    /** 由来。記事で区別するため、また AI 由来は断定に使えないため */
    source: 'human' | 'ai'
    canonical: string
    plain: string
    aliases: string[]
    /** 同一の手がかりを共有する国。件数が絞り込み力になる */
    countries: string[]
    confusableWith: string[]
    /** この用語が成り立つ前提となる別スロットの観察。`combination` で使う */
    requires: { slot: SlotId, what: string }[] | null
    note: string | null
    /** 生成時にモデル間で不一致があった項目 */
    disputed: boolean
    /** AI 由来のみ。同じ概念を挙げたモデル数。1 なら単独発言であり根拠が弱い */
    modelCount?: number
}

export type FailureMode =
    /** 観察漏れ */
    | 'observation_miss'
    /** 知識欠落 */
    | 'knowledge_gap'
    /** 弁別失敗 */
    | 'discrimination_fail'
    /** 自信のある誤り */
    | 'confident_error'
    /** 手がかり不足を自覚 */
    | 'aware_of_gap'

export type Variant = 'v1' | 'v2'

/**
 * コードが算出する判定結果。**AI に渡す前に確定している。**
 *
 * `null` は「判定不能」を表し、`[]`（計算した結果、該当なし）とは別である。
 * 混ぜると v1 の採点が「見落としゼロ」と読める出力になる。**満点に見える誤りが最も悪い。**
 * スロットの `absent`（写っていない）と `unknown`（見ていない）を区別する規約を、
 * 採点結果の型にも適用したものである。
 *
 * フラグ（`judgmentUnavailable: boolean`）を別に持たせる案は採らない。
 * フラグは無視できるが、`null` は TypeScript が分岐を強制する。
 * **型で防げるものを規律で防がない。**
 */
export interface CodeJudgement {
    variant: Variant
    /** 正解が候補集合に含まれるか。v1 でも算出できる */
    hit: boolean
    /** 含まれる場合、その候補の確信度。v1 でも算出できる */
    hitConfidence: Confidence | null
    /** 併記された国の組。回答だけから算出でき、v1 でも出せる */
    confusionPairs: [string, string][]
    /**
     * 名前のない手がかりを自力で見つけた記録。
     * `other` スロットの記述が正解タグの `other` と対応した場合に記録する。
     * 失敗の診断ではなく発見の記録であるため、failureModes とは別に持つ。
     *
     * v1 では正解タグがないため null。
     */
    discoveries: string[] | null
    /** 以下 3 つは正解タグとの差分計算。v1 では算出できないため null */
    missedSlots: SlotId[] | null
    wrongAbsentSlots: SlotId[] | null
    overclaimedSlots: SlotId[] | null
    /**
     * 隣接スロットに記述があったもの。**見落としに数えない。**
     *
     * スロットの境界は入力時に迷う（実測 2026-08-10）。`bollard` に
     * 「ガードレールが黄色い」と書かれた例がある。ガードレールとボラードは
     * 一体化することがあり、正当な観察である。
     *
     * **訓練しているのは観察であって分類ではない。**
     *
     * コードが出すのは「隣接スロットに記述がある」という事実だけである。
     * 同じものを指しているかの解釈は AI に渡す。
     */
    filedElsewhere: { slot: SlotId, foundIn: SlotId[] }[] | null
    /**
     * 写っているが学習者には認識できないとタグに記録されたもの。**見落としに数えない。**
     *
     * 実戦記録（`docs/offline-works/`）より。カタールのカーメタのアンテナは
     * 完璧な弁別子だが本人には認識できない。トルコの路面標示は
     * 太陽の照り返しで白飛びして読めない。
     *
     * **国を特定できることと、学習者が視認できることは別である。**
     * 視認できないものを見落としとして提示するのは、指標が目的と逆を向いている。
     */
    blindSlots: SlotId[] | null
    /**
     * 正解したときの未観察スロット。**失敗ではない。**
     *
     * 知らないメタがあっても別ルートで正解できた経験を、失敗として数えない。
     * `hit === true` のときだけ値が入る。
     */
    alternativeRoute: SlotId[] | null
    /**
     * 失敗モードの分類。v1 では算出できないため null。
     *
     * `confident_error` と `aware_of_gap` は正解タグなしでも判定できるが、
     * `observation_miss` と `discrimination_fail` は判定できない。
     * 一部だけ埋めた配列を返すと「診断が済んだ」ように見えるため、v1 では
     * 配列全体を null にする。
     */
    failureModes: FailureMode[] | null
    /** スロット別の絞り込み力（関連国の件数）。辞書が必要。v1 では null */
    narrowingPower: Partial<Record<SlotId, number>> | null
    /**
     * 学習者が挙げた用語の関連国の積集合。実際に達成された絞り込みを表す。
     * 個々には弱いメタでも、積集合は決定的になりうる。
     * 集合演算であり AI を使わずコードで計算する。
     *
     * 辞書が必要なため v1 では null。
     */
    intersection: {
        countries: string[]
        /** 正解国が積集合に含まれているか */
        containsAnswer: boolean
    } | null
    /**
     * 次に見るべきスロット。正解タグと用語辞書から積集合の縮小量を計算して決定する。
     * AI の推測ではなく計算結果である。v1 では正解タグがないため算出できない。
     */
    nextPriority: { slot: SlotId, resultingSize: number }[] | null
}

/** 採点プロンプトの出力スキーマ（`grading-prompt.md` が正典） */
export interface Feedback {
    summary: string
    failureModeExplanation: string
    missedClues: { slot: string, whatWasThere: string, whyItMatters: string }[]
    wrongReasoning: { slot: string, explanation: string }[]
    vocabulary: { learnerWrote: string, canonicalTerm: string, note: string }[]
    discriminationHint: string
    nextPriority: string[]
    discoveries: string[]
    /** 正解タグが与えられず見落とし判定ができなかった場合に true */
    judgmentUnavailable: boolean
}

/** 1 モデル分の採点結果。モデルごとに独立して成功・失敗する */
export interface ModelGrading {
    model: string
    /** `truncated` は HTTP 200 のまま打ち切られた場合。**成功として扱わない** */
    status: 'ok' | 'truncated' | 'error'
    feedback: Feedback | null
    /**
     * 生の蓄積テキスト（パース前）。**打ち切りでも捨てない。**
     * パース不能でも人間は中身を読んで判断できる。それが「判定は人間」の実装である。
     */
    rawContent: string
    reasoning: string
    finishReason: string | null
    /** 実際に成功した構造化出力の経路 */
    structuredMode: string | null
    chunks: number
    firstByteMs: number | null
    totalMs: number
    error: string | null
    /**
     * **無償枠を消費したか。** `status` とは別である。
     *
     * 打ち切り（`truncated`）は消費している（HTTP 200 で受け取っている）。
     * **4xx は消費していない**（届いたが推論に入る前に弾かれた）。
     *
     * 実測（2026-08-17）。`preview/` の接頭辞が抜けたモデル ID で 15 回 400 になり、
     * **消費 15 として報告された。** 実際には 1 つも消費していない。
     *
     * > **届いたことと、使われたことは別である。**
     *
     * 古い記録にはこの項目が無い（`undefined`）。**無いことを `false` と読まない。**
     */
    billed?: boolean
}

export interface GradingResult extends CodeJudgement {
    /** モデルごとの解釈。**確定している事実は 1 つ、解釈は複数** */
    models: ModelGrading[]
}

/** 1 プレイの記録。`data/runs/` に保存する */
export interface RunRecord {
    id: string
    ts: string
    variant: Variant
    questionId: string
    answer: Answer
    result: GradingResult
}

/** メタの強さ。UI 表示は GeoGuessr コミュニティの語彙に合わせる */
export type MetaStrength = 'strongest' | 'strong' | 'good' | 'support'

/** Street View メタデータ照会の結果（画像は取得しない） */
export interface PanoMetadata {
    status: string
    panoId: string | null
    copyright: string | null
    /** 撮影年月。学習者向けの応答には含めない */
    captureDate: string | null
    location: { lat: number; lng: number } | null
}

export interface PanoJudgement {
    accepted: boolean
    /** 不採用の理由。採用時は null */
    reason: string | null
    /** 座標から再解決した結果か */
    reresolved: boolean
}
