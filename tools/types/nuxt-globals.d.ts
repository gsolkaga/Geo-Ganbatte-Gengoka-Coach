/**
 * `tsconfig.tooling.json` 専用の宣言。**ルート直下に置いてはならない。**
 *
 * tests / scripts / tools を型検査するとき `.nuxt/` の生成型は参照していないため、
 * Nuxt の自動 import が未定義になる。ここで最小限だけ宣言する。
 *
 * ## なぜ `tools/types/` に置くのか
 *
 * 最初はルート直下（`tsconfig.tooling.d.ts`）に置いた。**アプリの型検査が壊れた。**
 *
 * Nuxt が生成する `.nuxt/tsconfig.app.json` の `include` に `"../*.d.ts"` があり、
 * **ルート直下の宣言ファイルを勝手に取り込む。** そこで宣言した `useRuntimeConfig` が
 * Nuxt 本来の型を上書きし、`config.public` が `undefined` 可能になった。
 *
 * > **検査を足すために書いたものが、検査対象の型を壊した。**
 *
 * ルート直下は Nuxt の縄張りである。ツール専用の宣言は下の階層に置く。
 *
 * ## 増やさない
 *
 * **ここに書くのはテストが間接的に読み込むものだけに限る。**
 * 増やすほど「本番では別の型で動いている」箇所が増え、この設定の意味が薄れる。
 */

/** `server/utils/ai.ts` がモデル名とトークンの解決に使う */
declare function useRuntimeConfig(): {
    sakuraAiToken?: string
    public?: Record<string, unknown>
    [key: string]: unknown
}
