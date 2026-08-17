/**
 * 比較に使うモデル ID。**ここが唯一の定義である。**
 *
 * ## なぜ切り出したか（実測 2026-08-17）
 *
 * モデル ID が**画面・スクリプト・ツールの 7 箇所に別々に書かれていた。**
 * `scripts/compare-grading.ts` だけ `preview/` の接頭辞が抜けていた。
 *
 * ```
 * 画面   'preview/gemma-4-31B-it'      ← 正しい
 * 比較   'gemma-4-31B-it'              ← 400 になる
 * ```
 *
 * 65 リクエストの実行で、**4 モデルのうち 3 つが全件 error になった。**
 * `gpt-oss-120b` だけが接頭辞を持たないため、1 モデルだけ通って
 * 「動いているように見えた」。
 *
 * > **一部が動くと、壊れていることが分かりにくい。**
 * > 全部壊れていれば最初の 1 件で止めた。
 *
 * ## 接頭辞は消さない
 *
 * `preview/` は提供側の名前空間であり、**こちらで正規化してはならない。**
 * 表示のときだけ落とす（`displayName`）。
 * ID を書き換えると、記録のモデル名と突き合わせられなくなる。
 */
export const COMPARISON_MODELS = [
    'gpt-oss-120b',
    'preview/gemma-4-31B-it',
    'preview/Qwen3.6-35B-A3B',
    'preview/Kimi-K2.6',
] as const

export type ComparisonModel = typeof COMPARISON_MODELS[number]

/** 表示用。`preview/` を落とすだけで、ID としては使わない */
export function displayName(model: string): string {
    return model.replace(/^preview\//, '')
}

/**
 * ## `.mjs` のスクリプトは別に持っている
 *
 * `tools/measure-concurrency.mjs` や `scripts/run-*.mjs` は素の JavaScript で
 * TypeScript を読み込めないため、**自分のリストを持っている。**
 *
 * それらは接頭辞を正しく持っている（確認済み 2026-08-17）。
 * `run-*.mjs` は既に実行し終えた一度きりの実験であり、
 * モデルごとの `maxTokens` も個別に調整してあるためここへは寄せない。
 *
 * **TypeScript から参照する場所は、必ずこのファイルを使う。**
 * 一致は `tests/models.test.ts` が `data/runs/` の記録と突き合わせて固定している。
 */
